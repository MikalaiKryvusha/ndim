#!/usr/bin/env node
/**
 * week-number.mjs — ЧИСЛО НЕДЕЛИ: сколько людей, пришедших за неделю, дошли до ценности и вернулись.
 *
 * ЗАЧЕМ. Метаэпик `plans/104` (ставка 1 «человек из ролика поставил пять оценок, увидел Связи и вернулся»), фаза 1,
 * шаг Б1 `plans/105`. Слово владельца — интервью №096, В3 = А: «*Раз в неделю Вы получаете одно число*».
 *
 * ЧТО СЧИТАЕТ (люди = `person_id` PostHog, только бой `properties.env = 'prod'`; прогоны приборов под меткой
 * `ndim-probe` в аналитику не пишут вовсе — `src/lib/data/analytics.ts`, `probeMarked()`):
 *   пришли      — был вход в окне недели: `landing_view` · `door_click` · `guest_start`;
 *   гостем      — `guest_start` в окне;
 *   ≥ 5 оценок  — не меньше пяти `rating_saved` в окне;
 *   Связи       — `relations_view` в окне;
 *   вернулись   — любое событие в календарный день с 1-го по 7-й после ПЕРВОГО дня человека в окне.
 * Всё печатается ДРОБЬЮ от «пришли» (правило «уверенный ноль — зелёный», `TESTING_FRAMEWORK.md` п. 10).
 *
 * ПОЯС ОКНА — московское время, +03:00 (`bugs/NEW_week_number_window_labelled_utc_is_moscow.md`). Неделя идёт с
 * понедельника 00:00 +03:00 (= воскресенье 21:00 UTC), календарный день возврата — тоже по Москве. Пояс называется
 * ЯВНО в каждой границе и каждом дне запроса: HogQL читает строку без пояса в поясе ПРОЕКТА («*Date literals parse in
 * your project's timezone, not UTC*» — posthog.com/docs/sql/expressions), и прежняя редакция печатала «(UTC)» при
 * окне по Москве. Подпись окна проверяется САМИМ запросом: HogQL переводит начало окна в UTC, прибор сверяет ответ со
 * своим расчётом и краснеет на расхождении — окно не может снова оказаться названным не тем поясом молча.
 *
 * КОНТРОЛЬ ПРИБОРА — неделя ролика 002 (понедельник 2026-09-14): в ней заведомо были люди (ролик 19–20.09,
 * ≈140 приходов на главную за два дня), и прибор обязан дать не ноль. Ноль на ней — дефект прибора, а не мира.
 *
 * ГРАНИЦЫ, названные вслух: до выката новой V1 (`plans/106`) приход на главную `/` писала инлайн-строка без SDK со
 * СЛУЧАЙНЫМ `distinct_id` на визит — человек, бывший только на главной, в «пришли» считается каждым визитом, и
 * «вернулись» для него не измерим (с новой V1 главная шлёт `landing_view` через SDK, как `/ru`); признак контура `env` события несут с 2026-09-05 19:26 (+03:00) — снято HogQL
 * `min(timestamp) WHERE properties.env = 'prod'`; недели раньше прибор видит пустыми и печатает об этом; у `landing_view` корня не пишется браузер (146 из 152 людей в неделю ролика — шаг Б3
 * `plans/105`); `person_id` у одного человека на двух устройствах — два человека; окно возврата недели закрывается
 * через 14 дней от её начала — раньше «вернулись» печатается с пометкой «окно открыто».
 *
 * [NOT-TESTED: 2026-09-25 · правка пояса окна (dev-1): юнит tools/week-number.test.mjs зелёный — это гигиена; ручной
 *  прогон на бою ждёт ключа чтения PostHog, отчёт qa/reports/2026-09-25_week-number-tz.md]
 * Прежний прогон до правки пояса: ручной, на бою, набор qa/suites/week-number.md НВ-01…НВ-05 pass, НВ-06 ждёт первого
 *  возврата; отчёт qa/reports/2026-09-25_week-number.md.
 *
 * Запуск: node tools/week-number.mjs --week 2026-09-14   (понедельник недели; по умолчанию — прошлая неделя)
 */
import { pathToFileURL } from 'node:url';

import { hogql } from './lib/posthog.mjs';

/** С этого момента события несут `properties.env`; раньше фильтр боя слеп (замер 2026-09-25). */
export const ENV_SINCE = '2026-09-05T16:26:40Z';

const ARRIVE = ['landing_view', 'door_click', 'guest_start'];
const EVENTS = [...ARRIVE, 'rating_saved', 'relations_view', 'account_created', 'person_opened', 'profile_filled'];

/** Пояс недели владельца. Москва живёт на UTC+3 без перехода на летнее время с 2014-10-26 — смещение постоянное. */
export const TZ = 'Europe/Moscow';
export const TZ_LABEL = '+03:00';
const OFFSET_MS = 3 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/** `Date` → `YYYY-MM-DD HH:MM:SS` по его UTC-полям (форма, в которой HogQL печатает `toString(DateTime)`). */
const wall = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

/**
 * Понедельник недели (`YYYY-MM-DD`, календарная дата по Москве) → границы окна.
 * `from` / `to` / `back` — московское настенное время: так они уходят в запрос вместе с поясом `TZ`.
 * `fromUtc` — то же начало окна в UTC: его HogQL обязан вернуть на контроле (`readWeek`).
 * `start` / `backEnd` — настоящие моменты начала окна и закрытия окна возврата.
 */
export function weekBounds(monday) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(monday ?? '');
  if (!m) throw new Error(`неделя задаётся понедельником YYYY-MM-DD, получено: ${monday}`);
  // Календарь проверяется UTC-арифметикой — дата сама по себе от пояса не зависит; поле `from` ниже — полночь по Москве.
  const cal = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  // Date.UTC молча переносит 2026-13-01 в 2027-01-01 — неверная дата должна краснеть, а не превращаться в другую.
  if (cal.toISOString().slice(0, 10) !== monday) throw new Error(`такой даты нет: ${monday}`);
  if (cal.getUTCDay() !== 1) throw new Error(`${monday} — не понедельник; неделя задаётся понедельником`);
  const start = new Date(cal.getTime() - OFFSET_MS); // понедельник 00:00 +03:00 = воскресенье 21:00 UTC
  return {
    from: wall(cal),
    to: wall(new Date(cal.getTime() + 7 * DAY_MS)),
    back: wall(new Date(cal.getTime() + 14 * DAY_MS)),
    fromUtc: wall(start),
    start,
    backEnd: new Date(start.getTime() + 14 * DAY_MS),
  };
}

/**
 * HogQL: одна строка — начало окна в UTC (контроль пояса) и пять чисел людей. Границы идут параметрами, пояс — явно
 * в каждой границе (`toDateTime({x}, TZ)`) и в каждом календарном дне (`toDate(toTimeZone(…, TZ))`).
 */
export function weekQuery() {
  const list = (a) => a.map((e) => `'${e}'`).join(', ');
  const at = (p) => `toDateTime({${p}}, '${TZ}')`;
  const dayOf = (x) => `toDate(toTimeZone(${x}, '${TZ}'))`;
  return `SELECT
    toString(toTimeZone(${at('from')}, 'UTC')) AS from_utc,
    count() AS arrived,
    countIf(guest) AS guests,
    countIf(rated5) AS rated5,
    countIf(rel) AS relations,
    countIf(returned) AS returned
  FROM (
    SELECT person_id,
      minIf(timestamp, timestamp < ${at('to')}) AS first_seen,
      countIf(event = 'guest_start' AND timestamp < ${at('to')}) > 0 AS guest,
      countIf(event = 'rating_saved' AND timestamp < ${at('to')}) >= 5 AS rated5,
      countIf(event = 'relations_view' AND timestamp < ${at('to')}) > 0 AS rel,
      arrayExists(d -> d > ${dayOf('first_seen')} AND d <= ${dayOf('first_seen')} + 7, groupUniqArray(${dayOf('timestamp')})) AS returned
    FROM events
    WHERE properties.env = 'prod'
      AND timestamp >= ${at('from')} AND timestamp < ${at('back')}
      AND event IN (${list(EVENTS)})
    GROUP BY person_id
    HAVING countIf(event IN (${list(ARRIVE)}) AND timestamp < ${at('to')}) > 0
  )`;
}

/**
 * Читает неделю. КОНТРОЛЬ ПОЯСА: HogQL возвращает начало окна в UTC, и оно обязано совпасть с расчётом прибора —
 * иначе окно в запросе не то, что напечатано, и числа не читаются вовсе (ошибка, а не предупреждение).
 */
export async function readWeek(monday, fetchImpl = fetch) {
  const b = weekBounds(monday);
  const { results } = await hogql(weekQuery(), { from: b.from, to: b.to, back: b.back }, fetchImpl);
  const row = results[0];
  if (!row) throw new Error('HogQL не вернул строку — прибор не знает, что считал');
  const [fromUtcHogql, ...nums] = row;
  if (String(fromUtcHogql) !== b.fromUtc) {
    throw new Error(`окно названо неверно: HogQL читает начало недели ${b.from} ${TZ} как ${fromUtcHogql} UTC, прибор ждал ${b.fromUtc} UTC`);
  }
  const [arrived, guests, rated5, relations, returned] = nums.map(Number);
  return { ...b, fromUtcHogql: String(fromUtcHogql), arrived, guests, rated5, relations, returned, backOpen: Date.now() < b.backEnd.getTime() };
}

/** Прошлый понедельник по МОСКОВСКОМУ календарю — неделя по умолчанию (в понедельник 00:30 по Москве прошлая неделя уже закрыта). */
export function lastMonday(now = new Date()) {
  const msk = new Date(now.getTime() + OFFSET_MS); // UTC-поля этого момента = московские настенные часы
  const d = new Date(Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // понедельник = 0
  d.setUTCDate(d.getUTCDate() - dow - 7);
  return d.toISOString().slice(0, 10);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const rest = process.argv.slice(2);
  const i = rest.indexOf('--week');
  const monday = i >= 0 ? rest[i + 1] : lastMonday();
  try {
    const w = await readWeek(monday);
    const f = (n) => `${n} из ${w.arrived}`;
    console.log(`ЧИСЛО НЕДЕЛИ · окно ${w.from.slice(0, 10)} 00:00 … ${w.to.slice(0, 10)} 00:00 ${TZ_LABEL} (Москва) · бой · снято ${new Date().toISOString()}`);
    console.log(`  начало окна   ${w.from.slice(0, 16)} ${TZ_LABEL} = ${w.fromUtcHogql.slice(0, 16)} UTC — сверено HogQL`);
    console.log(`  пришли        ${w.arrived}`);
    console.log(`  гостем        ${f(w.guests)}`);
    console.log(`  ≥ 5 оценок    ${f(w.rated5)}`);
    console.log(`  Связи         ${f(w.relations)}`);
    console.log(`  вернулись     ${f(w.returned)} (день 1–7 после первого${w.backOpen ? '; ⚠️ окно возврата ещё открыто' : ''})`);
    // process.exitCode, а не process.exit(): на Windows выход при живом сетевом соединении fetch роняет Node кодом 127 (libuv).
    if (w.start < new Date(ENV_SINCE)) console.log('  ⚠️ неделя начинается раньше 2026-09-05: события без признака контура env этим прибором не видны');
    if (w.arrived === 0) { console.log('  ⚠️ пришли 0 — окно пусто или прибор слеп; контроль: --week 2026-09-14 обязан дать не ноль'); process.exitCode = 3; }
  } catch (e) {
    console.error(`🔴 ${e.message}`);
    process.exitCode = 1;
  }
}

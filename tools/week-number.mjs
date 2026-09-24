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
 * КОНТРОЛЬ ПРИБОРА — неделя ролика 002 (понедельник 2026-09-14): в ней заведомо были люди (ролик 19–20.09,
 * ≈150 приходов), и прибор обязан дать не ноль. Ноль на ней — дефект прибора, а не мира.
 *
 * ГРАНИЦЫ, названные вслух: приход на главную `/` пишет инлайн-строка без SDK со СЛУЧАЙНЫМ `distinct_id` на визит
 * (`src/lib/data/root-landing-view.ts`) — человек, бывший только на главной, в «пришли» считается каждым визитом, и
 * «вернулись» для него не измерим; признак контура `env` события несут с 2026-09-05 19:26 (+03:00) — снято HogQL
 * `min(timestamp) WHERE properties.env = 'prod'`; недели раньше прибор видит пустыми и печатает об этом; у `landing_view` корня не пишется браузер (138 из 147 в неделю ролика — шаг Б3
 * `plans/105`); `person_id` у одного человека на двух устройствах — два человека; окно возврата недели закрывается
 * через 14 дней от её начала — раньше «вернулись» печатается с пометкой «окно открыто».
 *
 * [TESTED: 2026-09-25 · ручной прогон на бою, набор qa/suites/week-number.md НВ-01…НВ-05 pass, НВ-06 ждёт первого
 *  возврата (возвратов в данных 0, сверено HogQL); отчёт qa/reports/2026-09-25_week-number.md]
 *  глазами; отчёт `qa/reports/2026-09-25_week-number.md`]
 *
 * Запуск: node tools/week-number.mjs --week 2026-09-14   (понедельник недели; по умолчанию — прошлая неделя)
 */
import { pathToFileURL } from 'node:url';

import { hogql } from './lib/posthog.mjs';

/** С этого момента события несут `properties.env`; раньше фильтр боя слеп (замер 2026-09-25). */
export const ENV_SINCE = '2026-09-05T16:26:40Z';

const ARRIVE = ['landing_view', 'door_click', 'guest_start'];
const EVENTS = [...ARRIVE, 'rating_saved', 'relations_view', 'account_created', 'person_opened', 'profile_filled'];

/** Понедельник недели (UTC-дата `YYYY-MM-DD`) → границы окна и окна возврата. */
export function weekBounds(monday) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(monday ?? '');
  if (!m) throw new Error(`неделя задаётся понедельником YYYY-MM-DD, получено: ${monday}`);
  const from = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  // Date.UTC молча переносит 2026-13-01 в 2027-01-01 — неверная дата должна краснеть, а не превращаться в другую.
  if (from.toISOString().slice(0, 10) !== monday) throw new Error(`такой даты нет: ${monday}`);
  if (from.getUTCDay() !== 1) throw new Error(`${monday} — не понедельник; неделя задаётся понедельником`);
  const day = 24 * 3600 * 1000;
  const iso = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
  return { from: iso(from), to: iso(new Date(from.getTime() + 7 * day)), back: iso(new Date(from.getTime() + 14 * day)), backEnd: new Date(from.getTime() + 14 * day) };
}

/** HogQL: одна строка — пять чисел людей. Окно и границы идут параметрами. */
export function weekQuery() {
  const list = (a) => a.map((e) => `'${e}'`).join(', ');
  return `SELECT
    count() AS arrived,
    countIf(guest) AS guests,
    countIf(rated5) AS rated5,
    countIf(rel) AS relations,
    countIf(returned) AS returned
  FROM (
    SELECT person_id,
      minIf(timestamp, timestamp < toDateTime({to})) AS first_seen,
      countIf(event = 'guest_start' AND timestamp < toDateTime({to})) > 0 AS guest,
      countIf(event = 'rating_saved' AND timestamp < toDateTime({to})) >= 5 AS rated5,
      countIf(event = 'relations_view' AND timestamp < toDateTime({to})) > 0 AS rel,
      arrayExists(d -> d > toDate(first_seen) AND d <= toDate(first_seen) + 7, groupUniqArray(toDate(timestamp))) AS returned
    FROM events
    WHERE properties.env = 'prod'
      AND timestamp >= toDateTime({from}) AND timestamp < toDateTime({back})
      AND event IN (${list(EVENTS)})
    GROUP BY person_id
    HAVING countIf(event IN (${list(ARRIVE)}) AND timestamp < toDateTime({to})) > 0
  )`;
}

export async function readWeek(monday, fetchImpl = fetch) {
  const b = weekBounds(monday);
  const { results } = await hogql(weekQuery(), { from: b.from, to: b.to, back: b.back }, fetchImpl);
  const [arrived, guests, rated5, relations, returned] = (results[0] ?? [0, 0, 0, 0, 0]).map(Number);
  return { ...b, arrived, guests, rated5, relations, returned, backOpen: Date.now() < b.backEnd.getTime() };
}

/** Прошлый понедельник (UTC) — неделя по умолчанию. */
function lastMonday(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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
    console.log(`ЧИСЛО НЕДЕЛИ · окно ${w.from.slice(0, 10)} … ${w.to.slice(0, 10)} (UTC) · бой · снято ${new Date().toISOString()}`);
    console.log(`  пришли        ${w.arrived}`);
    console.log(`  гостем        ${f(w.guests)}`);
    console.log(`  ≥ 5 оценок    ${f(w.rated5)}`);
    console.log(`  Связи         ${f(w.relations)}`);
    console.log(`  вернулись     ${f(w.returned)} (день 1–7 после первого${w.backOpen ? '; ⚠️ окно возврата ещё открыто' : ''})`);
    // process.exitCode, а не process.exit(): на Windows выход при живом сетевом соединении fetch роняет Node кодом 127 (libuv).
    if (new Date(w.from.replace(' ', 'T') + 'Z') < new Date(ENV_SINCE)) console.log('  ⚠️ неделя начинается раньше 2026-09-05: события без признака контура env этим прибором не видны');
    if (w.arrived === 0) { console.log('  ⚠️ пришли 0 — окно пусто или прибор слеп; контроль: --week 2026-09-14 обязан дать не ноль'); process.exitCode = 3; }
  } catch (e) {
    console.error(`🔴 ${e.message}`);
    process.exitCode = 1;
  }
}

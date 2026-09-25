/**
 * ЮНИТЫ ПОСТРОЕНИЯ ОКНА ПРИБОРА «ЧИСЛО НЕДЕЛИ» (`tools/week-number.mjs`).
 *
 * Сети не касаются: запрос в PostHog подменяется заглушкой `fetch`, ключи — фиктивные значения в `process.env`.
 * Прогон: `node --test tools/week-number.test.mjs` · `npm run test:tools`.
 *
 * ЗАЧЕМ. `bugs/NEW_week_number_window_labelled_utc_is_moscow.md`: прибор печатал «(UTC)», а HogQL читал границы без
 * пояса в поясе проекта (+03:00). Набор стережёт три вещи, каждая — своей проверкой:
 *   1) окно — неделя по Москве: понедельник 00:00 +03:00 = воскресенье 21:00 UTC;
 *   2) в запросе НИ ОДНОЙ границы и НИ ОДНОГО календарного дня без явного пояса;
 *   3) контроль пояса в `readWeek`: ответ HogQL о начале окна в UTC расходится с расчётом — чтение краснеет.
 * И четвёртую, найденную по ходу правки: неделя по умолчанию выбирается по московскому календарю.
 *
 * Это гигиена разработчика, а не тест прибора: маркер `[NOT-TESTED]` в шапке прибора переворачивает только ручной
 * прогон на бою (`TESTING_FRAMEWORK.md`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { weekBounds, weekQuery, readWeek, lastMonday, TZ } from './week-number.mjs';

test('окно недели 2026-09-21 — по Москве: начало 2026-09-20 21:00 UTC, возврат закрывается 2026-10-04 21:00 UTC', () => {
  const b = weekBounds('2026-09-21');
  assert.equal(b.from, '2026-09-21 00:00:00');
  assert.equal(b.to, '2026-09-28 00:00:00');
  assert.equal(b.back, '2026-10-05 00:00:00');
  assert.equal(b.fromUtc, '2026-09-20 21:00:00');
  assert.equal(b.start.toISOString(), '2026-09-20T21:00:00.000Z');
  assert.equal(b.backEnd.toISOString(), '2026-10-04T21:00:00.000Z');
});

test('неверная неделя краснеет, а не превращается в другую', () => {
  assert.throws(() => weekBounds('2026-13-01'), /такой даты нет/);
  assert.throws(() => weekBounds('2026-09-15'), /не понедельник/);
  assert.throws(() => weekBounds(undefined), /понедельником YYYY-MM-DD/);
});

test('каждая граница окна в запросе несёт пояс Europe/Moscow — голого toDateTime({…}) нет', () => {
  const q = weekQuery();
  assert.equal(TZ, 'Europe/Moscow');
  const bare = q.match(/toDateTime\(\{\w+\}\)/g) ?? [];
  assert.deepEqual(bare, [], `границы без пояса: ${bare.join(' · ')}`);
  // Знаменатель: границы в запросе ЕСТЬ, и все три параметра окна дошли до него с поясом.
  for (const p of ['from', 'to', 'back']) {
    assert.ok(q.includes(`toDateTime({${p}}, 'Europe/Moscow')`), `граница {${p}} без явного пояса`);
  }
});

test('календарный день возврата считается по Москве — голого toDate(timestamp|first_seen) нет', () => {
  const q = weekQuery();
  const bare = q.match(/toDate\((?!toTimeZone\()[^)]*\)/g) ?? [];
  assert.deepEqual(bare, [], `дни без пояса: ${bare.join(' · ')}`);
  assert.ok(q.includes(`toDate(toTimeZone(timestamp, 'Europe/Moscow'))`), 'день события без пояса');
  assert.ok(q.includes(`toDate(toTimeZone(first_seen, 'Europe/Moscow'))`), 'день первого прихода без пояса');
});

test('неделя по умолчанию — по московскому календарю: граница понедельника 00:00 +03:00', () => {
  // Воскресенье 23:59 по Москве: идёт неделя 21.09, прошлая — 14.09.
  assert.equal(lastMonday(new Date('2026-09-27T20:59:00Z')), '2026-09-14');
  // Понедельник 00:00 по Москве (ещё воскресенье по UTC): неделя 21.09 закрылась и стала прошлой.
  assert.equal(lastMonday(new Date('2026-09-27T21:00:00Z')), '2026-09-21');
  // Середина недели.
  assert.equal(lastMonday(new Date('2026-09-30T12:00:00Z')), '2026-09-21');
});

/** Заглушка PostHog: запоминает тело запроса и отвечает заданной строкой. */
function stubPosthog(row) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ columns: [], results: row ? [row] : [] }) };
  };
  return { calls, fetchImpl };
}

function fakeKeys() {
  process.env.POSTHOG_PROJECT_ID = '0';
  process.env.POSTHOG_NDIM_SPACE_PERSONAL_API_KEY = 'unit-test-not-a-key';
  process.env.POSTHOG_REGION = 'EU Cloud';
}

// 🔴 ФИКСТУРА — ДОСЛОВНЫЙ ЖИВОЙ ОТВЕТ БОЯ, а не ожидание кода. Первая редакция отвечала «2026-09-20 21:00:00» — строкой,
// которую прибор сам и ждал, и юнит был зелёным, пока живой прогон Менеджера (2026-09-25 16:50) не показал настоящий
// ответ HogQL: DateTime64 с дробью «.000000». Сверка строк дала ложный красный при верном окне.
const LIVE_FROM_UTC = '2026-09-20 21:00:00.000000';

test('readWeek: HogQL подтвердил начало окна (живой ответ с дробью) — числа прочитаны, границы ушли параметрами', async () => {
  fakeKeys();
  const { calls, fetchImpl } = stubPosthog([LIVE_FROM_UTC, 160, 9, 3, 6, 0]);
  const w = await readWeek('2026-09-21', fetchImpl);
  assert.deepEqual([w.arrived, w.guests, w.rated5, w.relations, w.returned], [160, 9, 3, 6, 0]);
  assert.equal(w.fromUtcHogql, LIVE_FROM_UTC);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.query.values, { from: '2026-09-21 00:00:00', to: '2026-09-28 00:00:00', back: '2026-10-05 00:00:00' });
  assert.ok(calls[0].body.query.query.includes(`toString(toTimeZone(toDateTime({from}, 'Europe/Moscow'), 'UTC')) AS from_utc`));
});

test('readWeek: HogQL прочитал начало окна не тем поясом — чтение краснеет, чисел нет (контроль пояса)', async () => {
  fakeKeys();
  // Так ответил бы HogQL, если бы строка ушла без пояса в проект с поясом UTC: полночь осталась полночью (та же форма
  // DateTime64, что у живого ответа, — расхождение во времени, а не в формате).
  const { fetchImpl } = stubPosthog(['2026-09-21 00:00:00.000000', 160, 9, 3, 6, 0]);
  await assert.rejects(readWeek('2026-09-21', fetchImpl), /окно названо неверно/);
});

test('readWeek: ответ HogQL не той формы — контроль краснеет, а не проходит молча', async () => {
  fakeKeys();
  const { fetchImpl } = stubPosthog(['не дата', 160, 9, 3, 6, 0]);
  await assert.rejects(readWeek('2026-09-21', fetchImpl), /окно названо неверно/);
});

test('readWeek: пустой ответ HogQL — ошибка, а не «пришли 0»', async () => {
  fakeKeys();
  const { fetchImpl } = stubPosthog(null);
  await assert.rejects(readWeek('2026-09-21', fetchImpl), /не вернул строку/);
});

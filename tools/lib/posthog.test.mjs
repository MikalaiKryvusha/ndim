/**
 * ЮНИТЫ ДОРОГИ ЗАПРОСА HogQL (`tools/lib/posthog.mjs`): граница времени без пояса отказывается ДО сети.
 *
 * Сети не касаются: `fetch` — заглушка, которая считает вызовы. Прогон: `node --test tools/lib/posthog.test.mjs` ·
 * `npm run test:tools`. Повод — `bugs/NEW_week_number_window_labelled_utc_is_moscow.md` и близнец в драйвере прогона
 * главной V1 (строка его запроса процитирована ниже дословно).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hogql, bareTimeBounds } from './posthog.mjs';

/** Заглушка PostHog: считает вызовы и отвечает пустым результатом. */
function stub() {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, json: async () => ({ columns: [], results: [] }) };
    },
  };
}

function fakeKeys() {
  process.env.POSTHOG_PROJECT_ID = '0';
  process.env.POSTHOG_NDIM_SPACE_PERSONAL_API_KEY = 'unit-test-not-a-key';
  process.env.POSTHOG_REGION = 'EU Cloud';
}

test('голый параметр toDateTime({since}) — отказ до сети', async () => {
  const { calls, fetchImpl } = stub();
  await assert.rejects(hogql('SELECT 1 FROM events WHERE timestamp >= toDateTime({since})', { since: '2026-09-25 13:00:00' }, fetchImpl), /граница времени без пояса: toDateTime\(\{since\}\)/);
  assert.equal(calls.length, 0);
});

test('голый литерал toDateTime(\'…\') — отказ до сети', async () => {
  const { calls, fetchImpl } = stub();
  await assert.rejects(hogql("SELECT toString(toTimeZone(toDateTime('2026-09-25 05:40:00'), 'UTC'))", {}, fetchImpl), /граница времени без пояса/);
  assert.equal(calls.length, 0);
});

test('запрос драйвера прогона главной V1 (близнец, найденный Менеджером) отказан', () => {
  const driverQuery = "SELECT event, properties.$pathname, properties.$browser, properties.entry, properties.env, timestamp FROM events WHERE timestamp >= toDateTime({since}) AND properties.env = 'stage' AND event IN ('landing_view', 'demo_touch', 'guest_start') ORDER BY timestamp";
  assert.deepEqual(bareTimeBounds(driverQuery), ['toDateTime({since})']);
});

test('граница с поясом проходит: запрос уходит в сеть ровно один раз', async () => {
  fakeKeys();
  const { calls, fetchImpl } = stub();
  const q = "SELECT toString(toTimeZone(toDateTime({from}, 'Europe/Moscow'), 'UTC')), count() FROM events WHERE timestamp >= toDateTime({since}, 'UTC') AND toDateTime(timestamp) > toDateTime('2026-09-01 00:00:00', 'UTC')";
  assert.deepEqual(bareTimeBounds(q), []);
  await hogql(q, { from: '2026-09-21 00:00:00', since: '2026-09-25 10:00:00' }, fetchImpl);
  assert.equal(calls.length, 1);
});

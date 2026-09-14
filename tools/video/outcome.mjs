#!/usr/bin/env node
/**
 * outcome.mjs — исход ролика на нашей стороне: воронка PostHog по метке `utm_campaign` ссылки ролика.
 *
 * ЗАЧЕМ. Навык `/video-studio`, режим «Исход» (эпик `plans/90`, критерий 4 «Путь зрителя виден»).
 * Переход на сайт Instagram API больше не отдаёт (`researches/70` §4.5) — поэтому переход, гость и первая
 * оценка по ролику видны ТОЛЬКО здесь. Число записывается в раздел «Исход» гипотезы; вывод — по серии
 * роликов, не по одному (горизонт органики ≥ 20 недель, `researches/70` §6.1).
 *
 * ЧТО СЧИТАЕТ. События воронки (`landing_view`, `guest_start`, `rating_saved`, `account_created`,
 * `relations_view`) с `properties.utm_campaign = <метка>` за окно дней, без прогонов приборов
 * (`properties.env = 'prod'`). ⚠️ `[NOT-TESTED]`: доезжают ли `utm_*` до событий ПОСЛЕ первого экрана
 * (`guest_start`, `rating_saved`) — SDK регистрирует метки на сессию вкладки (`researches/70`, bugs/NEW utm),
 * но живым прогоном проверен только `landing_view`. Ноль на поздних шагах при ненулевом входе — сначала
 * подозрение на прибор, потом на людей.
 *
 * КЛЮЧИ — только `.env` (правило владельца): `POSTHOG_PROJECT_ID`, `POSTHOG_REGION`,
 * `POSTHOG_NDIM_SPACE_PERSONAL_API_KEY` (личный ключ чтения).
 *
 * `[TESTED: 2026-09-14 — метка pilot-001 → нули по всем шагам (ожидаемо: отправки прибора обрывались); положительный
 *  контроль — ТОТ ЖЕ запрос с условием «метки нет» (21:24, со второй попытки: в 21:23 сеть рвала соединение) вернул
 *  landing_view 10 · guest_start 1 · rating_saved 1 · relations_view 3 за 30 дней боя — запрос, ключ, фильтр env и
 *  разбор ответа живые, ноль по метке — настоящий ноль]`
 *
 * Запуск: node tools/video/outcome.mjs --campaign pilot-001 [--days 30]
 */

import { pathToFileURL } from 'node:url';

import { loadEnv } from '../lib/env.mjs';

export const FUNNEL = ['landing_view', 'guest_start', 'rating_saved', 'account_created', 'relations_view'];

/** HogQL запроса; метка идёт параметром `{campaign}`, а не вклейкой строки. */
export function funnelQuery(days) {
  const d = Math.max(1, Math.min(365, Math.round(Number(days) || 30)));
  return `SELECT event, count() AS n, count(DISTINCT properties.$session_id) AS sessions FROM events WHERE event IN (${FUNNEL.map((e) => `'${e}'`).join(', ')}) AND properties.utm_campaign = {campaign} AND properties.env = 'prod' AND timestamp > now() - INTERVAL ${d} DAY GROUP BY event`;
}

export async function readOutcome({ campaign, days = 30, fetchImpl = fetch }) {
  loadEnv();
  const id = process.env.POSTHOG_PROJECT_ID;
  const key = process.env.POSTHOG_NDIM_SPACE_PERSONAL_API_KEY;
  // В `.env` регион записан словами («EU Cloud») — берётся код региона, а не строка целиком.
  const region = /us/i.test(process.env.POSTHOG_REGION ?? '') ? 'us' : 'eu';
  if (!id || !key) throw new Error('нет POSTHOG_PROJECT_ID или POSTHOG_NDIM_SPACE_PERSONAL_API_KEY в .env');
  const res = await fetchImpl(`https://${region}.posthog.com/api/projects/${id}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: funnelQuery(days), values: { campaign } } }),
  });
  if (!res.ok) throw new Error(`PostHog ответил ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const byEvent = Object.fromEntries((data.results ?? []).map(([event, n, sessions]) => [event, { n, sessions }]));
  return FUNNEL.map((event) => ({ event, n: byEvent[event]?.n ?? 0, sessions: byEvent[event]?.sessions ?? 0 }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const rest = process.argv.slice(2);
  const opt = (k) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : undefined; };
  const campaign = opt('campaign');
  if (!campaign) {
    console.error('usage: node tools/video/outcome.mjs --campaign <utm_campaign> [--days 30]');
    process.exit(2);
  }
  try {
    const rows = await readOutcome({ campaign, days: opt('days') ?? 30 });
    console.log(`utm_campaign=${campaign} · окно ${opt('days') ?? 30} дн. · снято ${new Date().toISOString()}`);
    for (const r of rows) console.log(`  ${r.event.padEnd(16)} событий ${String(r.n).padStart(5)} · сессий ${r.sessions}`);
  } catch (e) {
    console.error(`🔴 ${e.message}`);
    process.exit(1);
  }
}

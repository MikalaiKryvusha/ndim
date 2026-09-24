/**
 * posthog.mjs — один запрос HogQL к PostHog проекта NDim Space по читающему ключу из `.env`.
 *
 * ЗАЧЕМ ОТДЕЛЬНО. Читать аналитику нужно двум приборам — исходу ролика (`tools/video/outcome.mjs`) и числу недели
 * (`tools/week-number.mjs`, эпик `plans/104`). Дорога запроса одна: ключ, регион, адрес, разбор ответа — живут здесь.
 * (`outcome.mjs` пока держит свою копию дороги; перевод его сюда — отдельной правкой с его прогоном.)
 *
 * КЛЮЧИ — только `.env` (правило владельца 2026-08-15): `POSTHOG_PROJECT_ID`, `POSTHOG_REGION`,
 * `POSTHOG_NDIM_SPACE_PERSONAL_API_KEY` (личный ключ ЧТЕНИЯ).
 *
 * [TESTED: 2026-09-25 · ручной прогон `node tools/week-number.mjs` на бою, семь запусков, ответы разобраны; отчёт
 *  `qa/reports/2026-09-25_week-number.md`]
 */
import { loadEnv } from './env.mjs';

/** Выполняет HogQL и отдаёт `{ columns, results }`. Значения идут параметрами (`{name}` в тексте запроса). */
export async function hogql(query, values = {}, fetchImpl = fetch) {
  loadEnv();
  const id = process.env.POSTHOG_PROJECT_ID;
  const key = process.env.POSTHOG_NDIM_SPACE_PERSONAL_API_KEY;
  // В `.env` регион записан словами («EU Cloud») — берётся код региона, а не строка целиком.
  const region = /us/i.test(process.env.POSTHOG_REGION ?? '') ? 'us' : 'eu';
  if (!id || !key) throw new Error('нет POSTHOG_PROJECT_ID или POSTHOG_NDIM_SPACE_PERSONAL_API_KEY в .env');
  const res = await fetchImpl(`https://${region}.posthog.com/api/projects/${id}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query, values } }),
  });
  if (!res.ok) throw new Error(`PostHog ответил ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return { columns: data.columns ?? [], results: data.results ?? [] };
}

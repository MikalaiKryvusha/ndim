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

/**
 * ГРАНИЦА ВРЕМЕНИ БЕЗ ПОЯСА — ОТКАЗ ДО СЕТИ (`bugs/NEW_DONE_week_number_window_labelled_utc_is_moscow.md`).
 * HogQL читает строку без пояса в поясе ПРОЕКТА (+03:00), а не в UTC: «*Date literals parse in your project's timezone,
 * not UTC … For an absolute instant, pass the timezone explicitly*» (posthog.com/docs/sql/expressions). 2026-09-25 класс
 * встретился дважды за день: окно прибора числа недели, подписанное «(UTC)», и окно драйвера прогона главной V1
 * (`qa/reports/2026-09-25_new-landing-v1.stage-driver.mjs`, UTC-строка без пояса → окно на 3 ч шире). Поэтому дорога
 * запроса одна на все приборы и не пропускает `toDateTime({параметр})` и `toDateTime('литерал')` без второго аргумента:
 * пишите `toDateTime({since}, 'UTC')` или `toDateTime({from}, 'Europe/Moscow')`.
 * FORK: options <помощник как есть | Date → UTC-строка в значениях | отказ запросу с голой границей> · price of error
 *   <молча смещённое окно у следующего прибора | не лечит: пояс живёт в тексте запроса, не в значении | ложный отказ
 *   законному запросу в поясе проекта — лечится явным поясом проекта> · consulted <документация PostHog, выше>.
 * GAP: столбцы (`toDateTime(timestamp)`), `toDate('…')`, `toStartOfDay(…)` без пояса не судятся — только границы-значения.
 * [TESTED: 2026-09-25 · отказ — ручной прогон dev-1 16:48: дословный запрос драйвера через hogql() с fetch, считающим
 *  вызовы, → отказ «граница времени без пояса: toDateTime({since})», обращений в сеть 0; пропуск — запрос прибора числа
 *  недели с явным поясом прошёл дорогу и дошёл до PostHog в прогоне МЕНЕДЖЕРА на бою 16:52 (голова d6bdf3e); отчёт
 *  qa/reports/2026-09-25_week-number-tz.md]
 */
const BARE_TIME = /toDateTime\(\s*(\{\w+\}|'[^']*')\s*\)/g;

/** Границы времени без пояса в тексте запроса — пустой список значит «все границы названы с поясом». */
export function bareTimeBounds(query) {
  return query.match(BARE_TIME) ?? [];
}

/** Выполняет HogQL и отдаёт `{ columns, results }`. Значения идут параметрами (`{name}` в тексте запроса). */
export async function hogql(query, values = {}, fetchImpl = fetch) {
  const bare = bareTimeBounds(query);
  if (bare.length) {
    throw new Error(`граница времени без пояса: ${bare.join(' · ')} — HogQL прочтёт её в поясе проекта (+03:00), а не в UTC; назовите пояс вторым аргументом, например toDateTime({since}, 'UTC')`);
  }
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

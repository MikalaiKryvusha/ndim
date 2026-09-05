/**
 * ШУМ КОНСОЛИ, КОТОРЫЙ НЕ ИМЕЕТ ПРАВА ЗАКРЫТЬ ДВЕРЬ — одно именованное исключение (`bugs/179`).
 *
 * Невидимая рамка reCAPTCHA (App Check) на ПЕРВОМ контексте браузера пишет в консоль отчёт о
 * нарушении СВОЕЙ report-only политики: «Framing 'https://www.google.com/' violates the following
 * report-only Content Security Policy directive: "frame-ancestors 'self'". The violation has been
 * logged, but no further action has been taken.» Ничего не блокируется, политика чужая, рамка
 * чужая — а проверка «консоль чиста» роняла выкат через раз. 2026-09-05 это остановило дверь боя
 * ПОСЛЕ выпуска хостинга (шаг 9 из 9); повтор того же смоука дал 81/81.
 *
 * Три границы, без которых исключение съело бы правило (все — из `bugs/179`):
 *   1. признак, а не домен: «report-only» + ЧУЖОЙ origin в `Framing '…'`; список доменов Google
 *      устарел бы на следующем стороннем скрипте;
 *   2. только report-only: настоящее (блокирующее) нарушение CSP обязано ронять дверь;
 *   3. исключение ПЕЧАТАЕТ то, что проглотило, — молча съеденное сообщение есть тот же класс,
 *      что ложный зелёный.
 */

/** Наши origin — нарушение, объявленное о НАШЕЙ рамке, исключением не считается. */
export const OUR_ORIGINS = ['ndimspace.app', 'ndim-stage.web.app', 'ndim-space.web.app', 'localhost', '127.0.0.1'];

const REPORT_ONLY = /report-only\s+Content Security Policy/iu;
const FRAMING = /Framing\s+'([^']+)'/u;

/**
 * Чужой report-only отчёт CSP? — единственный класс консольного шума, который прощается.
 * @param {string} text текст консольного сообщения
 * @param {string[]} [ours] наши origin (для тестов)
 * @returns {boolean}
 */
export function isForeignReportOnlyCsp(text, ours = OUR_ORIGINS) {
  const s = String(text ?? '');
  if (!REPORT_ONLY.test(s)) return false;
  const m = FRAMING.exec(s);
  if (!m) return false;
  let host = '';
  try {
    host = new URL(m[1]).hostname;
  } catch {
    return false;
  }
  return !ours.some((o) => host === o || host.endsWith('.' + o));
}

/**
 * Разделить консольные ошибки на настоящие и прощённый шум. Прощённое возвращается ОТДЕЛЬНО —
 * прибор обязан его напечатать (граница 3), а не забыть.
 * @param {string[]} messages
 * @returns {{ real: string[], swallowed: string[] }}
 */
export function splitConsoleNoise(messages) {
  const real = [];
  const swallowed = [];
  for (const m of messages ?? []) (isForeignReportOnlyCsp(m) ? swallowed : real).push(m);
  return { real, swallowed };
}

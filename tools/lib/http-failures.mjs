/**
 * УШИ ПРИБОРА: каждый неудачный сетевой ответ называется АДРЕСОМ.
 *
 * ═══ ПОВОД ═══
 *
 * Ночью 2026-08-22 дверь выката остановила первый боевой выкат с врезкой App Check
 * (`bugs/169`). Смоук под сессией покраснел ровно на одной проверке, и вся его красная строка
 * выглядела так:
 *
 *     ❌ [390-light] консоль чиста — Failed to load resource: status 403 (×3)
 *
 * Это всё, что видел читающий вывод двери. Чинить по такому сообщению нечего: браузер не кладёт
 * адрес в текст консольной ошибки о загрузке ресурса. Виновника (`exchangeRecaptchaV3Token`)
 * пришлось искать ОТДЕЛЬНЫМ зондом, написанным на месте, — а зонд, написанный на месте, живёт
 * ровно до конца той ночи.
 *
 * Модуль делает то же самое штатно и навсегда: подписывается на ответы страницы и печатает
 * **адрес · код · тип ресурса · метод** для каждого ответа ≥ 400. Красная строка двери теперь
 * сама называет, что чинить.
 *
 * ═══ ГРАНИЦЫ, НАЗВАННЫЕ ЧЕСТНО ═══
 *
 * · 🔑 **Модуль НИКОГДА не судит.** Он только СЛУШАЕТ и ПЕЧАТАЕТ. Ни одна его строка не
 *   добавляет и не отнимает проверку у прибора-хозяина и не влияет на код выхода. Это
 *   сознательно: 4xx у стороннего домена (аналитика, шрифты, чужая reCAPTCHA) — обычное дело в
 *   бою, и превратить их в провал значило бы остановить выкат чужой инфраструктурой. Судят
 *   по-прежнему проверки прибора («консоль чиста», «экран отрисован»); модуль лишь даёт им
 *   адрес.
 * · **Запрос, не получивший ответа вовсе, тоже слышен** (`requestfailed`) — в ту же ночь рядом с
 *   403 стоял `FAILED fetch www.google.com/recaptcha/api2/clr`, и без него картина отказа была
 *   бы половинчатой. Отброшен ровно один класс — `ERR_ABORTED`: так браузер помечает запросы,
 *   отменённые уходом со страницы, и в SPA-навигации это норма, а не дефект.
 * · 🔒 **Строка запроса ОБРЕЗАЕТСЯ.** В query живут ключи API и токены обмена; вывод прибора
 *   уезжает в журналы двери и в чат. Для называния виновника достаточно `хост + путь` — именно
 *   путь `…:exchangeRecaptchaV3Token` и назвал причину той ночью. Обрезка не молчаливая:
 *   отброшенная строка помечается хвостом `?…`.
 * · **Одинаковые отказы схлопываются в одну строку со счётчиком** — приложение повторяет
 *   неудачный обмен, и три десятка одинаковых строк прячут остальные адреса.
 *
 * Использование:
 *
 *     import { watchHttpFailures } from './lib/http-failures.mjs';
 *     const net = watchHttpFailures(page, { label: `[${tag}] ` });
 *     …
 *     net.report();                       // блок в конце прохода
 *     check(errors.length === 0, 'консоль чиста', [detail, net.oneLine()].filter(Boolean).join(' · '));
 */

/** Запрос, отменённый уходом со страницы. В SPA-навигации — норма, а не дефект. */
const ABORTED = /ERR_ABORTED/i;

/**
 * Адрес для человека: хост и путь, без строки запроса.
 * Обрезка помечается хвостом `?…`, чтобы читающий видел, что она была.
 */
export function shortUrl(raw) {
  try {
    const u = new URL(raw);
    return `${u.host}${u.pathname}${u.search ? '?…' : ''}`;
  } catch {
    // Не URL (data:, blob:) — отдаём как есть, обрезав по длине.
    return raw.length > 120 ? raw.slice(0, 117) + '…' : raw;
  }
}

/**
 * Подписывает страницу на неудачные ответы.
 *
 * @param {import('playwright').Page} page страница прибора
 * @param {{label?: string, log?: (s: string) => void, live?: boolean}} opts
 *        label — префикс строки (обычно `[390-light] `);
 *        log   — куда печатать (по умолчанию console.log);
 *        live  — печатать ли каждый отказ в момент его появления (по умолчанию да).
 * @returns набор читателей: `entries()` · `count()` · `lines()` · `oneLine()` · `report()` · `reset()`
 */
export function watchHttpFailures(page, opts = {}) {
  const { label = '', log = console.log, live = true } = opts;
  /** Ключ «код + адрес» → запись. Одинаковые отказы схлопываются со счётчиком. */
  const seen = new Map();

  const record = (url, code, type, method) => {
    const address = shortUrl(url);
    const key = `${code} ${address}`;
    const known = seen.get(key);
    if (known) {
      known.count += 1;
      return; // повтор уже названного адреса не печатаем — он схлопнут в счётчик
    }
    const entry = { code: String(code), address, type: type || '—', method: method || '—', count: 1 };
    seen.set(key, entry);
    if (live) log(`  ⚠️ ${label}СЕТЬ ${entry.code} · ${entry.type} · ${entry.method} ${entry.address}`);
  };

  page.on('response', (r) => {
    if (r.status() < 400) return;
    const req = r.request();
    record(r.url(), r.status(), req.resourceType(), req.method());
  });

  page.on('requestfailed', (req) => {
    const err = req.failure()?.errorText ?? 'FAILED';
    if (ABORTED.test(err)) return;
    record(req.url(), err, req.resourceType(), req.method());
  });

  const entries = () => [...seen.values()];
  const lines = () =>
    entries().map((e) => `${e.code} · ${e.type} · ${e.method} ${e.address}${e.count > 1 ? ` ×${e.count}` : ''}`);

  return {
    entries,
    lines,
    /** Сколько РАЗНЫХ адресов отказало (не сколько отказов было). */
    count: () => seen.size,
    /** Строка для детали упавшей проверки — та самая, что печатает дверь. */
    oneLine: () => (seen.size === 0 ? '' : `адреса отказов: ${lines().join(' ; ')}`),
    /** Блок в конце прохода. Печатается ВСЕГДА — в том числе зелёное «ни одного отказа». */
    report: (title = 'ответы ≥ 400 за проход') => {
      if (seen.size === 0) {
        log(`  ⚪ ${label}${title}: ни одного`);
        return;
      }
      log(`  ⚠️ ${label}${title}: ${seen.size}`);
      for (const line of lines()) log(`     ${line}`);
    },
    reset: () => seen.clear(),
  };
}

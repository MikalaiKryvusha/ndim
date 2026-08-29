/**
 * ЯДРО РАЗВЕДКИ «ЧЕМ ТОПЫ МЕРЯЮТ СВОЮ ДВЕРЬ» — чистая часть `tools/probe-industry-analytics.mjs`.
 *
 * ЗАЧЕМ ОТДЕЛЕНО. Прибор поднимает настоящий браузер и ходит в чужие сети — его прогон
 * недетерминирован по построению (двери меняются, сети падают). Решение «это событие
 * счётчика, а это картинка» недетерминированным быть не имеет права: именно оно даёт числа
 * отчёта. Поэтому распознавание живёт здесь, без сети и без браузера, и стережётся юнитами
 * (`tools/industry-analytics.test.mjs`), в том числе мутациями.
 *
 * 🔴 ЦЕНА НЕВЕРНОГО ПРИЗНАКА УЖЕ ОПЛАЧЕНА ДВАЖДЫ В ОДНОЙ СЕССИИ (2026-08-29):
 *   1. Признак искал сегмент пути и только в домене двери — TikTok, YouTube, Instagram и
 *      Reddit показали НОЛЬ телеметрии. Нуля там быть не может.
 *   2. Затянутый признак `\/events?[/?]` перестал видеть адрес, кончающийся на `/events`
 *      (Spotify `gabo-receiver-service/v3/events`) — прибор «похудел» между двумя прогонами
 *      одного дня, и это заметил только глаз.
 * Оба — второй вопрос лестницы к зелёному (`AGENT_GUIDE.md`): проверка исполнилась, но
 * признак был неверен. Отсюда юниты ниже: они и есть то, чего не хватало.
 */

/**
 * Известные счётчики. `event` достаёт ИМЯ СОБЫТИЯ там, где протокол его не прячет —
 * это главная добыча замера: белый список топа, прочитанный с его же провода.
 */
export const VENDORS = [
  {
    key: 'ga4',
    name: 'Google Analytics 4',
    kind: 'продуктовая аналитика',
    match: /google-analytics\.com\/(g\/collect|collect|mp\/collect)|analytics\.google\.com\/g\/collect|\/g\/collect\?/,
    event: (url) => new URL(url).searchParams.get('en'),
  },
  {
    key: 'gtag-legacy',
    name: 'Google (gtag/GTM транспорт)',
    kind: 'сборщик тегов',
    match: /googletagmanager\.com\/(gtag\/js|gtm\.js|a\?)/,
    event: () => null,
  },
  {
    key: 'meta-pixel',
    name: 'Meta Pixel',
    kind: 'рекламный',
    match: /facebook\.com\/tr\b|connect\.facebook\.net\/.*\/fbevents\.js/,
    event: (url) => new URL(url).searchParams.get('ev'),
  },
  {
    key: 'tiktok-pixel',
    name: 'TikTok Pixel',
    kind: 'рекламный',
    match: /analytics\.tiktok\.com\/(api|i18n)\//,
    event: (url, body) => new URL(url).searchParams.get('event') ?? pickJson(body, ['event', 'event_name']),
  },
  {
    key: 'linkedin-ads',
    name: 'LinkedIn Insight',
    kind: 'рекламный',
    match: /px\.ads\.linkedin\.com|snap\.licdn\.com/,
    event: () => null,
  },
  {
    key: 'linkedin-track',
    name: 'LinkedIn первая сторона (/li/track)',
    kind: 'своя телеметрия',
    match: /linkedin\.com\/li\/track/,
    event: (_url, body) => pickJson(body, ['eventInfo.eventName', 'eventName', 'topicName']),
  },
  {
    key: 'pinterest',
    name: 'Pinterest Tag',
    kind: 'рекламный',
    match: /ct\.pinterest\.com\//,
    event: (url) => new URL(url).searchParams.get('event'),
  },
  {
    key: 'amplitude',
    name: 'Amplitude',
    kind: 'продуктовая аналитика',
    match: /amplitude\.com\/(2\/httpapi|batch|collect)/,
    event: (_url, body) => pickJson(body, ['events.0.event_type', 'event_type']),
  },
  {
    key: 'mixpanel',
    name: 'Mixpanel',
    kind: 'продуктовая аналитика',
    match: /mixpanel\.com\/(track|engage|decide)/,
    event: (_url, body) => pickJson(body, ['0.event', 'event']),
  },
  {
    key: 'posthog',
    name: 'PostHog',
    kind: 'продуктовая аналитика',
    match: /(i|e)\.posthog\.com|posthog\.com\/(e|i\/v0\/e|batch)\//,
    event: (_url, body) => pickJson(body, ['event', 'batch.0.event']),
  },
  {
    key: 'segment',
    name: 'Segment',
    kind: 'шина событий',
    match: /api\.segment\.io\/v1\/|cdn\.segment\.com\/analytics\.js/,
    event: (_url, body) => pickJson(body, ['event', 'name']),
  },
  {
    key: 'snowplow',
    name: 'Snowplow',
    kind: 'продуктовая аналитика',
    match: /com\.snowplowanalytics\.snowplow\/tp2|\/i\?e=(pv|se|ue)/,
    event: (_url, body) => pickJson(body, ['data.0.se_ac', 'data.0.e']),
  },
  {
    key: 'adobe',
    name: 'Adobe Analytics',
    kind: 'продуктовая аналитика',
    match: /\/b\/ss\/|omtrdc\.net|demdex\.net/,
    event: () => null,
  },
  {
    key: 'hotjar',
    name: 'Hotjar',
    kind: '🎥 запись сессии',
    match: /hotjar\.com|hotjar\.io/,
    event: () => null,
  },
  {
    key: 'clarity',
    name: 'Microsoft Clarity',
    kind: '🎥 запись сессии',
    match: /clarity\.ms/,
    event: () => null,
  },
  {
    key: 'fullstory',
    name: 'FullStory',
    kind: '🎥 запись сессии',
    match: /fullstory\.com|\/fs\.js/,
    event: () => null,
  },
  {
    key: 'quantum',
    name: 'Quantum Metric / Contentsquare / Glassbox',
    kind: '🎥 запись сессии',
    match: /quantummetric\.com|contentsquare\.net|glassboxdigital/,
    event: () => null,
  },
  {
    key: 'sentry',
    name: 'Sentry',
    kind: 'мониторинг ошибок',
    match: /sentry\.io\/api\/|browser\.sentry-cdn\.com|ingest\.sentry\.io/,
    event: () => null,
  },
  {
    key: 'datadog',
    name: 'Datadog RUM',
    kind: 'мониторинг ошибок',
    match: /browser-intake-datadoghq|datadoghq\.com\/api\/v2\/rum/,
    event: () => null,
  },
  {
    key: 'newrelic',
    name: 'New Relic Browser',
    kind: 'мониторинг ошибок',
    match: /nr-data\.net|newrelic\.com\/accounts/,
    event: () => null,
  },
];

/**
 * Словарь телеметрических адресов — по всему URL и с ЯВНОЙ границей конца строки.
 * Граница собирается кодом, а не набирается в каждой ветке руками: ровно на ней и
 * поскользнулась вторая версия признака (см. шапку).
 */
const END = '(?:[/?]|$)';
export const TELEMETRY_WORDS = new RegExp(
  [
    'log_event', `\\/log(s|ging|ger)?${END}`, `\\/bz${END}`, 'track', 'collect',
    `\\/events?${END}`, 'beacon', `\\/metrics?${END}`, 'telemetry', 'analytic', 'pixel',
    `\\/stats?${END}`, `\\/rum${END}`, 'ingest', 'reporting', `\\/ping${END}`, 'csp\\/', 'instrument',
  ].join('|'),
  'i',
);

/**
 * Типы ресурсов, которые телеметрией не бывают. Отсекаются ДО словаря: без этого признак
 * ловил `logo.svg`, `login-*.mjs` и `retargeting-pixels.js` — то есть КОД и КАРТИНКИ счётчика
 * вместо его ЗАПРОСОВ. Загруженный скрипт — не событие; событие — то, что уехало.
 * Картинки оставлены намеренно: пиксель-трекер (`pixel/tracking.png`) — настоящий запрос.
 */
export const NOT_TELEMETRY_TYPES = new Set(['script', 'stylesheet', 'font', 'media', 'document']);

/** Платформы согласия на куки — их присутствие объясняет молчание счётчиков до касания. */
export const CONSENT_VENDORS = /onetrust|cookielaw|quantcast|usercentrics|sourcepoint|didomi|cookiebot|trustarc|iubenda|osano|consensu\.org/i;

/** Известный счётчик по адресу, либо `null`. */
export function classify(url) {
  return VENDORS.find((vendor) => vendor.match.test(url)) ?? null;
}

/** Похож ли запрос на телеметрию: сначала тип ресурса, потом словарь адресов. */
export function isTelemetry(url, resourceType = 'xhr') {
  if (NOT_TELEMETRY_TYPES.has(resourceType)) return false;
  return TELEMETRY_WORDS.test(url);
}

/** Регистрируемый домен (две последние метки) — им телеметрия делится на свою и чужую. */
export function registrableDomain(hostname) {
  return hostname.replace(/^www\./, '').split('.').slice(-2).join('.');
}

/**
 * Достаёт значение по пути из тела запроса. Тело бывает JSON, бывает `form-urlencoded`,
 * бывает нечитаемым (сжатое или двоичное) — в последнем случае возвращается `null`, и это
 * попадает в отчёт как «имя не читается». Догадок ядро не делает: правило трёх дверей.
 */
export function pickJson(body, paths) {
  if (!body) return null;
  const parsed = parseBody(body);
  if (!parsed) return null;
  for (const path of paths) {
    let node = parsed;
    for (const step of path.split('.')) {
      if (node === null || typeof node !== 'object') { node = null; break; }
      node = node[step];
    }
    if (typeof node === 'string' && node.length > 0 && node.length < 120) return node;
  }
  return null;
}

export function parseBody(body) {
  try {
    return JSON.parse(body);
  } catch {
    /* не JSON — пробуем форму */
  }
  if (!body.includes('=')) return null;
  try {
    const form = new URLSearchParams(body);
    const flat = Object.fromEntries(form.entries());
    // Частый случай: форма несёт JSON внутри одного поля.
    for (const value of Object.values(flat)) {
      if (value.startsWith('{') || value.startsWith('[')) {
        try { return JSON.parse(value); } catch { /* оставляем плоскую форму */ }
      }
    }
    return flat;
  } catch {
    return null;
  }
}

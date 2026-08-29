/**
 * Сторонняя продуктовая аналитика — PostHog Cloud EU (`plans/78`, Ш1–Ш4).
 *
 * ЗАЧЕМ. Решение владельца: интервью **№049 В2 = В** — сторонний инструмент аналитики ВЕЗДЕ
 * (отмена прежнего №004 В4 записана в журнал `MASTER_PLAN.md`), интервью **№054 В1 = А** —
 * инструмент PostHog Cloud, регион ЕС. Критерий выбора — его слово: удобство ИИ-агенту,
 * потому что агент и есть главный потребитель этих чисел.
 *
 * ⛔⛔ ГЛАВНЫЙ ИНВАРИАНТ, КОТОРЫЙ ЭТОТ ФАЙЛ ОБЯЗАН ДЕРЖАТЬ (интервью №002 В4, подтверждён
 * при отмене №004 В4): **ПРЕДМЕТ ОЦЕНКИ ТРЕТЬЕЙ СТОРОНЕ НЕ УХОДИТ НИКОГДА.** Имя события
 * говорит о МЕСТЕ пути и никогда — о том, что человек оценил. Инвариант держится не памятью
 * и не настройкой в чужой панели, а **юнитами на конфиг и на список имён**
 * (`analytics.test.ts`) — это и есть Ш3 и Ш4 плана.
 *
 * ЧТО ЗДЕСЬ НЕ ПРОИСХОДИТ, и это решения, а не пробелы:
 *   · **Автозахват выключен.** Не по вкусу: он пишет тексты элементов, по которым кликнули, а
 *     на наших экранах эти тексты — НАЗВАНИЯ ИЗМЕРЕНИЙ (`/dims`, `/relations`). Включённый
 *     автозахват отправил бы предмет оценки третьей стороне первым же кликом.
 *   · **Запись сессии выключена.** Кадр нашего экрана — это предмет оценки целиком.
 *     🔴 На стороне проекта запись сессии ВКЛЮЧЕНА (`session_recording_opt_in: true`, снято
 *     2026-08-29 через MCP). Наш конфиг её глушит на клиенте, но настройка проекта — не наша
 *     зона; строка эскалирована Менеджеру. Пока она такая, инвариант стоит на ОДНОЙ ноге —
 *     нашей.
 *   · **Тепловые карты и «мёртвые клики» выключены** — тот же довод, что у автозахвата:
 *     координаты касания на нашей ленте суть указание на карточку измерения.
 *   · **Личных профилей не заводим** (`person_profiles: 'never'`). Цена названа: анонимного
 *     посетителя нельзя будет склеить с ним же после входа. Она нулевая, потому что
 *     `identify` мы не зовём нигде и звать не собираемся.
 *   · **Каталог трекера НЕ получает** (10 222 страницы, `csr = false`, клиентского JS не
 *     несут вовсе). Сколько людей открыло карточку — отвечает Search Console.
 *
 * ПОЧЕМУ ДИНАМИЧЕСКИЙ ИМПОРТ. `EXP-0028`: аналитика не имеет права ломать или тормозить
 * продукт — ни падением, ни весом. SDK уезжает отдельным чанком и в главный бандл не попадает.
 * Приём подтверждён замером индустрии (`researches/NEW_analytics_event_models_of_tops`):
 * единственная дверь набора с нулём чужих доменов — Tinder — грузит свою аналитику ровно так,
 * отдельным чанком `async-analytics-sdk`.
 */

import { type FunnelStep, FUNNEL_STEPS, probeMarked } from './funnel.ts';

/**
 * Публичный ключ проекта — **не секрет по устройству**, ровно как веб-конфиг Firebase
 * (`firebase.ts` → `PROD_CONFIG`): он обязан лежать в бандле у каждого посетителя, иначе
 * событию некуда ехать. Прецедент и решение — Менеджер, смена 9.
 *
 * ⛔ ЧИТАЮЩИЙ ключ (`phx_…`, в `.env` — `POSTHOG_NDIM_SPACE_PERSONAL_API_KEY`, имя дано
 * владельцем) в код не попадает НИКОГДА: он открывает доступ к аккаунту на чтение, живёт
 * только в `.env` и нужен приборам, а не браузеру.
 */
export const POSTHOG_TOKEN = 'phc_nbcz8eMDphM8xptBxoke2PV2FsBrMJ3EL2uHbTGEjSbR';

/** Регион ЕС — данные во Франкфурте (решение №054 В1 = А, довод — `researches/55`). */
export const POSTHOG_HOST = 'https://eu.i.posthog.com';

/**
 * Хосты стейдж-контура — ЗЕРКАЛО `firebase.ts` → `STAGE_HOSTS`.
 *
 * Список продублирован, а не импортирован, СОЗНАТЕЛЬНО: импорт из `firebase.ts` затащил бы
 * SDK Firebase в чанк аналитики и убил бы весь смысл динамической загрузки. Пара держится
 * не дисциплиной — юнит в `analytics.test.ts` читает `firebase.ts` и падает при расхождении
 * (тот же приём, что у пары `PROD_DATABASE` ↔ `tools/lib/contours.mjs`).
 */
const STAGE_HOSTS = ['ndim-stage.web.app', 'ndim-stage.firebaseapp.com'] as const;

/** Хосты стенда — сюда трекер не поедет никогда. */
const STAND_HOSTS = ['localhost', '127.0.0.1'] as const;

/**
 * Считаем ли мы вообще на этом хосте.
 *
 * 🔴 ТОЛЬКО БОЙ. Проект PostHog у нас ОДИН (id 260193), и события стенда и стейджа легли бы в
 * тот же ряд, что боевые. Это ровно болезнь `bugs/202`, которую Ф1 только что вылечила своей
 * воронке: наши собственные прогоны считались людьми, и четыре всплеска `guest_start` из
 * семидесяти семи пришлись на дни выкатов. Повторять её во втором приборе, зная о ней, было бы
 * не ошибкой, а выбором.
 */
export function analyticsHostAllowed(hostname: string): boolean {
  if ((STAND_HOSTS as readonly string[]).includes(hostname)) return false;
  if ((STAGE_HOSTS as readonly string[]).includes(hostname)) return false;
  return hostname.length > 0;
}

/**
 * БЕЛЫЙ СПИСОК СОБЫТИЙ (Ш4) — десять имён, и ни одного больше «что придёт само».
 *
 * Первые шесть — паритет со своей воронкой (`funnel.ts`). Он обязателен: своя воронка
 * остаётся ЭТАЛОНОМ сверки (её не режут блокировщики), а сверить два ряда можно только если
 * имена в них совпадают. Четыре последних — путь ВНУТРИ продукта, которого своя воронка не
 * знает по построению: она считает вход, а не дело.
 *
 * 🔑 `relations_view` — ЧИСЛО ЦЕННОСТИ, а не просто ещё один шаг. Наша сегодняшняя воронка
 * кончается на `account_created`, то есть на НАШЕЙ выгоде; человек, создавший аккаунт и не
 * увидевший ни одной связи, считался успехом. Ценность NDim человеку — увидеть похожих на
 * себя, и меряем мы теперь именно это (`GOAL.md`; разбор — в разведке событийных моделей).
 *
 * ⛔ Имя события говорит о МЕСТЕ пути. «Оценил» — можно; «оценил измерение X» — запрет.
 * Стережёт `eventNameIsSafe()` и юнит на этот список.
 */
export const ANALYTICS_EVENTS = [
  ...FUNNEL_STEPS,
  'rating_saved',
  'relations_view',
  'person_opened',
  'profile_filled',
] as const;

export type AnalyticsEvent = FunnelStep | 'rating_saved' | 'relations_view' | 'person_opened' | 'profile_filled';

/**
 * Разрезы кладутся в СВОЙСТВА, а не плодят имена событий (правило Mixpanel: «events should
 * neither be too broad nor too specific… use event properties to provide context»).
 *
 * ⛔ Свойства с идентификатором или названием измерения запрещены — это тот же предмет
 * оценки, просто сбоку. Список закрытый, и он тоже под юнитом.
 */
export const ANALYTICS_PROPERTIES = ['lang', 'is_guest', 'entry', 'has_matches'] as const;

export type AnalyticsProperty = (typeof ANALYTICS_PROPERTIES)[number];

/**
 * Слова, выдающие предмет оценки.
 *
 * ⚠️ Сверка идёт ПО СЛОВАМ имени (`имя.split('_')`), а не по подстроке, и это не
 * придирчивость: подстрочная версия отбила `guest_start`, потому что внутри слова `start`
 * лежит `star`. Страж, краснеющий на честном имени, живёт ровно до первого раза, когда его
 * покраснение объяснят «ну это же ложное» — и тогда он не сработает и на настоящем.
 */
const FORBIDDEN_WORDS = ['dim', 'dims', 'dimension', 'rating', 'score', 'star', 'stars', 'title', 'slug', 'item', 'movie', 'book', 'game', 'similar'];

/**
 * Имя события безопасно? Отбивает всё, что не в белом списке, И всё, что похоже на предмет
 * оценки. Двойная проверка не избыточна: белый список стережёт СЕГОДНЯ, а слова — того, кто
 * завтра добавит имя в список, не подумав.
 *
 * ⚠️ `rating_saved` из белого списка содержит запрещённое слово `rating` и проходит именно
 * потому, что он в списке: он говорит «оценка сохранена», не называя, ЧТО оценено. Порядок
 * проверок здесь и есть всё правило.
 */
export function eventNameIsSafe(name: string): boolean {
  return (ANALYTICS_EVENTS as readonly string[]).includes(name);
}

/**
 * Пахнет ли имя предметом оценки. Вынесено отдельно ради того, чтобы САМ страж можно было
 * проверить на выдуманных именах: страж, которого гоняют только по своему же белому списку,
 * не доказывает ничего — он зелен потому, что список сегодня чист.
 */
export function nameSmellsOfSubject(name: string): boolean {
  return name.split('_').some((word) => FORBIDDEN_WORDS.includes(word));
}

/** Имя, добавленное в белый список по невнимательности, — ловится этим. Зовётся юнитом. */
export function whitelistLooksSafe(): { ok: boolean; offenders: string[] } {
  const allowed = new Set<string>(['rating_saved']); // единственное исключение, разобрано выше
  const offenders = (ANALYTICS_EVENTS as readonly string[]).filter(
    (name) => !allowed.has(name) && nameSmellsOfSubject(name),
  );
  return { ok: offenders.length === 0, offenders };
}

/**
 * КОНФИГ SDK — вынесен отдельной чистой функцией СПЕЦИАЛЬНО ради Ш3: юнит читает объект и
 * падает, если автозахват включён или запись сессии не выключена. Инвариант держится машиной,
 * а не памятью того, кто в следующий раз тронет этот файл.
 *
 * 🔴 ЧЕГО ЗДЕСЬ НЕТ И БЫТЬ НЕ МОЖЕТ — `disable_ip_capture`. План `plans/78` называл эту
 * опцию, но **в `posthog-js` её не существует** (проверено по исходнику пакета,
 * `@posthog/types` → `PostHogConfig`, версия 1.422.5). Ближайшая по имени `ip` помечена в
 * типах дословно: «*@deprecated - THIS OPTION HAS NO EFFECT*». Опция, которой нет, молча не
 * делает ничего — это ровно «зелёное на непроверенном». IP отбрасывается НАСТРОЙКОЙ ПРОЕКТА,
 * и она уже включена: `anonymize_ips: true` (снято 2026-08-29 через MCP, проект 260193).
 *
 * 🔴 ПОЧЕМУ НЕ `cookieless_mode: 'always'`, хотя он выглядит лучше всего. В типах пакета
 * сказано прямо: «*you MUST enable cookieless mode in your PostHog project's settings,
 * otherwise all your cookieless events will be ignored*». На проекте он ВЫКЛЮЧЕН
 * (`cookieless_server_hash_mode: 0`). Включить его только на клиенте значит выбросить все
 * события молча. Это кандидат в улучшение — но парой «настройка проекта + код», и не моим
 * решением.
 */
export function posthogConfig(): Record<string, unknown> {
  return {
    api_host: POSTHOG_HOST,
    // ⛔ Инвариант №002 В4 — четыре выключателя ниже держат его в коде.
    autocapture: false,
    disable_session_recording: true,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    // Личных профилей не заводим вовсе; `identify` не зовётся нигде.
    person_profiles: 'never',
    // Опросов на лице продукта не будет — решать такое вправе только владелец.
    disable_surveys: true,
    // Свои имена, а не «что придёт»: страницы считаем сами, шагом `landing_view`.
    capture_pageview: false,
    capture_pageleave: false,
    // Хранилище без cookies: метка визита живёт во вкладке и никуда не переживает её.
    persistence: 'sessionStorage',
  };
}

/** Загруженный SDK. Держится, чтобы не грузить чанк на каждое событие. */
let client: { capture: (event: string, props?: Record<string, unknown>) => void } | null = null;
let loading: Promise<void> | null = null;

/**
 * Отмечает событие в PostHog. **Никогда не бросает и никогда не заставляет ждать** — тот же
 * контракт, что у `track()` своей воронки: счётчик не продукт.
 *
 * Молчит: на стенде и стейдже · под меткой прибора (`ndim-probe` — иначе наши смоуки снова
 * считались бы людьми, `bugs/202`) · на имени вне белого списка · на свойстве вне списка.
 */
export async function capture(event: AnalyticsEvent, props: Partial<Record<AnalyticsProperty, string | boolean>> = {}): Promise<void> {
  if (typeof location === 'undefined' || !analyticsHostAllowed(location.hostname)) return;
  if (probeMarked()) return;
  if (!eventNameIsSafe(event)) return;

  const safeProps: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!(ANALYTICS_PROPERTIES as readonly string[]).includes(key)) continue;
    if (value !== undefined) safeProps[key] = value;
  }

  try {
    if (client === null) {
      loading ??= import('posthog-js').then(({ default: posthog }) => {
        posthog.init(POSTHOG_TOKEN, posthogConfig());
        client = posthog as unknown as typeof client;
      });
      await loading;
    }
    client?.capture(event, safeProps);
  } catch (error) {
    // Чужой сервис недоступен, заблокирован расширением или упал — это НЕ наша поломка.
    console.debug('Аналитика: событие не отправлено', event, error);
  }
}

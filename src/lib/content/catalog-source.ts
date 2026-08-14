/**
 * КАТАЛОГ, РАЗЛОЖЕННЫЙ ПО ХАБАМ — данные для страниц `/{lang}/catalog/…` (`plans/48` шаг 3).
 *
 * 🔴 **МОДУЛЬ ТОЛЬКО ДЛЯ СБОРКИ. Зовётся ИСКЛЮЧИТЕЛЬНО из `+page.server.ts`.**
 * Он импортирует `dims-source`, то есть весь каталог на 17 МБ. Универсальный загрузчик, который
 * его позовёт, утащит каталог в клиентский бандл целиком — это уже случалось и стоило замера:
 * чанк узла вырос до 16,86 МБ при всём `_app` в 18,1 МБ (`EXP-0136`). Правило простое: данные,
 * нужные только на сборке, грузит СЕРВЕРНЫЙ загрузчик.
 *
 * Чистая логика (порядок, разбивка, адреса) живёт отдельно — `catalog-hub.ts`: там её достаёт
 * `node --test`, а сюда он не дотянется, потому что `import.meta.glob` существует только в Vite.
 *
 * Раскладка считается ОДИН РАЗ на сборку: пререндер зовёт загрузчики 180 раз (89 страниц × 2
 * языка + 2 индекса), и пересортировывать 5111 объектов на каждом заходе было бы чистой тратой
 * времени сборки.
 */

import { DIMS, DIMS_SOURCE, type DimPage } from './dims-source';
import { KIND_KEYS, kindTitle, type KindKey } from './dim-kind';
import {
  catalogPath,
  dimensionPath,
  groupByKind,
  hubPath,
  pageCount,
  PER_PAGE,
  slicePage,
  summarize,
  toCard,
  type HubSummary,
} from './catalog-hub';
import { CATALOG_COPY, hubMetaDesc, hubMetaTitle } from './catalog-copy';
import { LANGS, X_DEFAULT, pick, type Lang } from './langs';
import { SITE_ORIGIN } from '$lib/site';
import type { Alternate, CatalogIndexView, HubPageView, SiblingLink } from './catalog-view';

const { hubs, tail } = groupByKind(DIMS as readonly DimPage[]);

/** Сводки семи хабов — для индексной страницы каталога и для полосы соседей. */
export const HUB_SUMMARIES: readonly HubSummary[] = summarize(hubs);

/** Объекты, которым хаб не полагается (порог ≥20). Их 25; список — на индексной странице. */
export const TAIL_ITEMS: readonly DimPage[] = tail;

/** Сколько объектов в каталоге всего — число для строки смысла индексной страницы. */
export const CATALOG_TOTAL = DIMS.length;

/** Сколько объектов каталога получили хотя бы один голос — из тех же сводок, а не вторым счётом. */
export const CATALOG_RATED =
  HUB_SUMMARIES.reduce((s, h) => s + h.rated, 0) +
  TAIL_ITEMS.filter((d) => (Number.isFinite(d.rates) ? Math.floor(d.rates) : 0) >= 1).length;

/** Один хаб целиком, в утверждённом порядке. */
export const hubItems = (kind: KindKey): readonly DimPage[] => hubs.get(kind) ?? [];

/** Страница хаба, номер от 1. */
export const hubItemsPage = (kind: KindKey, page: number): DimPage[] => slicePage(hubItems(kind), page);

/** Сводка одного хаба. */
export const hubSummary = (kind: KindKey): HubSummary =>
  HUB_SUMMARIES.find((h) => h.key === kind) ?? { key: kind, count: 0, rated: 0, pages: 1 };

/**
 * Адреса ВТОРЫХ И ДАЛЬНЕЙШИХ страниц каждого хаба — для `entries()` маршрута `[page]`.
 * Первая страница живёт на отдельном маршруте `/{lang}/catalog/{kind}`, поэтому её здесь нет.
 */
export const hubPageEntries = (): { kind: KindKey; page: string }[] => {
  const out: { kind: KindKey; page: string }[] = [];
  for (const key of KIND_KEYS) {
    const pages = pageCount(hubItems(key).length);
    for (let p = 2; p <= pages; p += 1) out.push({ kind: key, page: String(p) });
  }
  return out;
};

/**
 * Источник каталога называется ВСЛУХ в логе сборки — по тому же правилу, что и на страницах
 * объектов: выкат, случайно собранный на запасном срезе из 50 записей, дал бы 7 хабов по одной
 * странице и выглядел бы совершенно исправным.
 */
export const CATALOG_SOURCE = DIMS_SOURCE;

/** Второй язык — тот, который не текущий. Языков два (`langs.ts`), третий встанет сюда же. */
const otherOf = (lang: Lang): Lang => (LANGS.find((l) => l !== lang) ?? lang) as Lang;

/**
 * Двусторонний `hreflang` с САМОССЫЛКОЙ для любого пути-функции.
 * Без самоссылки Google игнорирует разметку ЦЕЛИКОМ («If two pages don't both point to each
 * other, the tags will be ignored») — то есть работа выглядит сделанной и не даёт ничего
 * (`researches/26` §4.1).
 */
const alternatesFor = (path: (l: Lang) => string): Alternate[] => [
  ...LANGS.map((l) => ({ hreflang: l, href: `${SITE_ORIGIN}${path(l)}` })),
  { hreflang: 'x-default', href: `${SITE_ORIGIN}${path(X_DEFAULT)}` },
];

/** Полоса хабов: семь ссылок со счётчиками. `current` подсвечивается и ссылкой не является. */
const siblingsFor = (lang: Lang, current: KindKey | null): SiblingLink[] =>
  HUB_SUMMARIES.map((h) => ({
    key: h.key,
    title: kindTitle(h.key, lang),
    href: hubPath(lang, h.key),
    count: h.count,
    on: h.key === current,
  }));

/**
 * Готовая страница хаба либо `null`, если такой страницы нет.
 *
 * Решение «нет страницы → 404» принимает загрузчик, а не этот модуль: адреса всё равно
 * перечисляет `entries()`, и попасть сюда с чужим номером можно только через ошибку в самом
 * перечислении — тогда пусть она падает громко, а не отдаёт пустой хаб.
 */
export function hubView(kind: KindKey, page: number, lang: Lang): HubPageView | null {
  const items = hubItems(kind);
  const pages = pageCount(items.length);
  if (!Number.isInteger(page) || page < 1 || page > pages) return null;

  const summary = hubSummary(kind);
  const path = (l: Lang) => hubPath(l, kind, page);
  const other = otherOf(lang);

  return {
    lang,
    otherLang: other,
    otherHref: path(other),
    canonical: `${SITE_ORIGIN}${path(lang)}`,
    alternates: alternatesFor(path),
    metaTitle: hubMetaTitle(kindTitle(kind, lang), lang, page, pages),
    metaDesc: hubMetaDesc(kindTitle(kind, lang), lang),
    kind,
    title: kindTitle(kind, lang),
    page,
    pages,
    total: summary.count,
    rated: summary.rated,
    firstRank: (page - 1) * PER_PAGE + 1,
    cards: hubItemsPage(kind, page).map((d) => toCard(d, lang)),
    siblings: siblingsFor(lang, kind),
    pageLinks: Array.from({ length: pages }, (_, i) => ({
      page: i + 1,
      href: hubPath(lang, kind, i + 1),
      on: i + 1 === page,
    })),
    prevHref: page > 1 ? hubPath(lang, kind, page - 1) : null,
    nextHref: page < pages ? hubPath(lang, kind, page + 1) : null,
    upHref: catalogPath(lang),
  };
}

/** Индексная страница каталога: семь хабов, числа и хвост из 25 объектов ссылками. */
export function catalogIndexView(lang: Lang): CatalogIndexView {
  const path = (l: Lang) => catalogPath(l);
  const other = otherOf(lang);
  const copy = CATALOG_COPY[lang];

  return {
    lang,
    otherLang: other,
    otherHref: path(other),
    canonical: `${SITE_ORIGIN}${path(lang)}`,
    alternates: alternatesFor(path),
    metaTitle: copy.indexMetaTitle,
    metaDesc: copy.indexMetaDesc,
    hubs: siblingsFor(lang, null),
    total: CATALOG_TOTAL,
    rated: CATALOG_RATED,
    tail: TAIL_ITEMS.map((d) => ({
      slug: d.slug,
      title: pick(d.title, lang),
      href: dimensionPath(lang, d.slug),
    })),
  };
}

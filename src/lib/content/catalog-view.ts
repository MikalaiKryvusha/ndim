/**
 * ЧТО ПОКАЗЫВАЮТ СТРАНИЦЫ КАТАЛОГА — контракт между серверным загрузчиком и разметкой
 * (`plans/48` шаг 3). Тот же приём, что у страницы объекта (`dim-view.ts`), и по той же причине.
 *
 * 🔴 ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ. Загрузчик хаба обязан быть СЕРВЕРНЫМ: он читает каталог на 17 МБ, а
 * универсальный `load` уносит всё, что импортирует, в клиентский бандл (`EXP-0136`). Разметке при
 * этом нужен ТИП, и брать его из серверного модуля она не может — иначе утащит его за собой.
 *
 * 🔴 ЗДЕСЬ ТОЛЬКО ТО, ЧТО СТРАНИЦА РИСУЕТ. Объекты каталога целиком сюда не едут: страница хаба
 * показывает 60 карточек, а в записи каталога кроме названия лежат оба описания (5,24 млн знаков
 * на весь каталог), теги и идентификатор. Ответ загрузчика пишется в `__data.json` на КАЖДУЮ из
 * 178 страниц — на странице объекта эта же беспечность стоила 41 МБ мёртвого веса в релизе.
 */

import type { CatalogCard } from './catalog-hub';
import type { KindKey } from './dim-kind';
import type { Lang } from './langs';

/** Двусторонний `hreflang`: у Google односторонняя разметка игнорируется ЦЕЛИКОМ. */
export interface Alternate {
  readonly hreflang: string;
  readonly href: string;
}

/** Ссылка на соседний хаб — полоса, которой каждый хаб зовёт остальные шесть. */
export interface SiblingLink {
  readonly key: KindKey;
  readonly title: string;
  readonly href: string;
  readonly count: number;
  /** Это текущий хаб — он в полосе есть, но ссылкой не является. */
  readonly on: boolean;
}

/** Одна ссылка пагинации. */
export interface PageLink {
  readonly page: number;
  readonly href: string;
  readonly on: boolean;
}

/** Общая часть публичных страниц каталога: оболочка, язык, разметка головы. */
export interface PublicPage {
  readonly lang: Lang;
  readonly otherLang: Lang;
  /** Тот же материал на другом языке — для шапки и для `hreflang`. */
  readonly otherHref: string;
  readonly canonical: string;
  readonly alternates: readonly Alternate[];
  readonly metaTitle: string;
  readonly metaDesc: string;
}

/** Страница хаба одного вида: `/{lang}/catalog/{kind}` и `…/{page}`. */
export interface HubPageView extends PublicPage {
  readonly kind: KindKey;
  /** Заголовок вида во множественном числе — из словаря продукта, а не из данных. */
  readonly title: string;
  readonly page: number;
  readonly pages: number;
  /** Сколько объектов этого вида в каталоге и сколько из них с оценками. */
  readonly total: number;
  readonly rated: number;
  /**
   * Строка смысла страницы — своя у страницы с оценёнными и у страницы без них.
   *
   * Раньше она бралась из словаря одной константой на все 89 страниц хабов; теперь её собирает
   * `hubLede`, потому что правда у страниц разная.
   */
  readonly lede: string;
  /**
   * Номер места ПЕРВОЙ карточки страницы. Нумерация сквозная по хабу, а не по странице: V3 —
   * это «топ по версии NDim Space», и на второй странице место 61 обязано быть 61-м.
   */
  readonly firstRank: number;
  readonly cards: readonly CatalogCard[];
  readonly siblings: readonly SiblingLink[];
  /**
   * ВСЕ номера страниц хаба, а не только «дальше».
   *
   * 🔴 Это не украшение и не вкус. Цепочка «дальше → дальше → дальше» уводит карточку последней
   * страницы «Фильмов» на 47 кликов от хаба; перечисленные номера держат ЛЮБУЮ карточку в трёх
   * кликах от лендинга — ровно то, что фаза обещала критерием приёмки 3.
   */
  readonly pageLinks: readonly PageLink[];
  readonly prevHref: string | null;
  readonly nextHref: string | null;
  /** Ссылка «вверх» — в индекс каталога. Она же обратный краулируемый путь. */
  readonly upHref: string;
}

/** Индексная страница каталога: `/{lang}/catalog`. */
export interface CatalogIndexView extends PublicPage {
  /** Семь хабов со счётчиками. */
  readonly hubs: readonly SiblingLink[];
  readonly total: number;
  readonly rated: number;
  /**
   * Объекты, которым хаб не полагается (не хватило до порога ≥20) — ссылками прямо здесь.
   *
   * 🔴 Без этого списка 25 объектов × 2 языка остались бы недостижимыми от корня, а вся фаза
   * существует ради того, чтобы недостижимых не было ни одной.
   */
  readonly tail: readonly { readonly slug: string; readonly title: string; readonly href: string }[];
}

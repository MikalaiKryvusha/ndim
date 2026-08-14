/**
 * СТРУКТУРИРОВАННАЯ РАЗМЕТКА СТРАНИЦЫ КАТАЛОГА — `plans/48` (фаза 2 эпика 40), шаг 5.
 *
 * ── ПОЧЕМУ ЭТО НЕ ПРОТИВОРЕЧИТ ПРЕЖНЕМУ РЕШЕНИЮ «JSON-LD СЮДА НЕ СТАВИТСЯ» ──────────────────
 * В шапке `+page.svelte` страницы объекта стояло: «JSON-LD сюда не ставится (`researches/26` §7:
 * три из четырёх типов Google официально похоронил)». Это было верно ровно для тех типов,
 * которые §7 РАССМАТРИВАЛ, — `Organization`, `WebSite`, `BreadcrumbList`, `SearchAction`,
 * `FAQPage`, `HowTo`. Типы объектов культуры там не оценивались вовсе, и дыру закрыл
 * `researches/34` §5.6, прочитав первоисточник заново:
 *
 *   · [Review snippet](https://developers.google.com/search/docs/appearance/structured-data/review-snippet),
 *     ред. 2026-07-24 **[A]**: валидные типы включают `Book`, `Movie`, `Game` (`VideoGame`
 *     наследует) — **наш каталог покрыт**;
 *   · правило self-serving ограничивает только `LocalBusiness`/`Organization`, то есть
 *     **рейтинги сообщества об объектах культуры легальны** (модель IMDb);
 *   · «Ratings must be sourced directly from users» — наши подходят: их ставят люди;
 *   · 🔴 «Don't aggregate reviews or ratings from other websites» — чужих рейтингов мы не тянем
 *     НИКОГДА, и это не только правило Google: каталог обязан говорить своим числом.
 *
 * ── ЛОВУШКА, В КОТОРУЮ ЛЕГКО ПОПАСТЬ ЗДЕСЬ ──────────────────────────────────────────────────
 * ⛔ `inLanguage` НЕ ставится. У `CreativeWork` это язык САМОГО ПРОИЗВЕДЕНИЯ, а не язык страницы,
 * — и мы его не знаем: «какой язык оригинала у каждого из 5111 объектов, мы не знаем и следить за
 * этим не будем» (слово владельца, `bugs/116`; на том же незнании сгорела подпись «В оригинале»).
 * Поставить сюда язык страницы значило бы соврать роботу структурированно.
 *
 * ⛔ `SoftwareApplication` не ставится нигде: без `offers.price` и `aggregateRating` rich result
 * невозможен в принципе (`researches/26` §7.3), а публичных оценок продукта у нас нет.
 */

import type { KindKey } from './dim-kind';

/** Тип schema.org по каноническому виду каталога. Неизвестный вид — общий `CreativeWork`. */
const SCHEMA_TYPE: Record<KindKey, string> = {
  movie: 'Movie',
  'video-game': 'VideoGame',
  'tv-series': 'TVSeries',
  novel: 'Book',
  book: 'Book',
  'music-artist': 'MusicGroup',
  // «Практика» — это не произведение с автором, а занятие (йога, бег). Общий тип честнее любого
  // конкретного: выдумывать `HowTo` здесь было бы ровно тем карго-культом, который §7 похоронил.
  practice: 'CreativeWork',
};

export interface DimJsonLdInput {
  readonly kindKey: KindKey | null;
  readonly title: string;
  readonly description: string;
  readonly author: string;
  readonly year: string;
  readonly canonical: string;
  readonly rating: number;
  readonly rates: number;
  /** Правило показа оценок (`dims-rating.ts`) — ОДНО на весь проект, сюда приезжает готовым. */
  readonly showStars: boolean;
}

/**
 * Разметка одной страницы каталога. Возвращает объект — сериализует его страница.
 *
 * 🔑 `aggregateRating` появляется РОВНО ТОГДА, когда на странице видны звёзды. Иначе разметка
 * утверждала бы роботу то, чего человек на странице не находит, — а «0 из 10» в поле `rating`
 * означает «не оценивали», а не «оценили на ноль».
 */
export function dimJsonLd(d: DimJsonLdInput): Record<string, unknown> {
  const type = d.kindKey ? SCHEMA_TYPE[d.kindKey] : 'CreativeWork';

  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': type,
    name: d.title,
    url: d.canonical,
  };

  if (d.description) node.description = d.description;

  /*
   * Поле каталога называется «Автор», но для фильма и сериала оно содержит РЕЖИССЁРА (в боевых
   * данных у «Матрицы» там Вачовски, у «Леона» — Люк Бессон). `director` — это то же самое
   * знание, названное точным словом; `author` у фильма означало бы сценариста.
   */
  if (d.author) {
    const person = { '@type': 'Person', name: d.author };
    if (type === 'Movie' || type === 'TVSeries') node.director = person;
    else if (type !== 'MusicGroup') node.author = person;
    // У `MusicGroup` автор — сам объект: «автором» исполнителя является он сам, и поле пустует.
  }

  // Год издания. `datePublished` принимает ISO 8601, и голый год — валидная его форма.
  // Прочерк в каталоге означает «неизвестен» и сюда не приезжает (отсекается на входе).
  if (d.year) node.datePublished = d.year;

  if (d.showStars && d.rates > 0) {
    node.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: d.rating,
      ratingCount: d.rates,
      // Шкала продукта — целое 0…10 (`schema.ts`: «Оценка по оси — целое 0…10»). Значения по
      // умолчанию у schema.org — 1…5, поэтому границы называются явно: без них робот прочитал
      // бы наши 9,4 как «9,4 из 5».
      bestRating: 10,
      worstRating: 0,
    };
  }

  return node;
}

/**
 * Разметка лендинга: `Organization` + `WebSite` одним блоком — давний долг `researches/26` §7.6.
 * Rich result они не дают и не должны: их работа — имя сайта и логотип в выдаче.
 *
 * 🔴 «Only one name per site… does not support site names at the subdirectory level» — поэтому
 * ОДНО И ТО ЖЕ имя ставится на обеих языковых главных. Разбор §7.3 писался, когда русская главная
 * жила на голом корне; сегодня корень — распознаватель языка под `noindex` (`plans/39`), и
 * «главной» у сайта две штуки. Дублирование здесь безопасно именно потому, что имя буквально
 * одно: «NDim Space» не переводится ни на один язык. Разные имена были бы нарушением, одинаковое
 * — избыточностью.
 *
 * ⛔ `SearchAction` внутри `WebSite` НЕ ставится: sitelinks search box удалён Google в ноябре
 * 2024, и с тех пор это мёртвый код, который ставят по привычке (`researches/26` §7.2).
 */
export function siteJsonLd(origin: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: 'NDim Space',
        url: origin,
        logo: `${origin}/favicon.svg`,
        // Единственная внешняя опора, которая у проекта настоящая, — открытый исходный код.
        sameAs: ['https://github.com/MikalaiKryvusha/ndim'],
      },
      {
        '@type': 'WebSite',
        name: 'NDim Space',
        url: origin,
      },
    ],
  };
}

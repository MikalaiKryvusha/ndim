/**
 * СТРАНИЦЫ-ОБЁРТКИ ТЕСТА — фаза 5 эпика 40 (`plans/42`, шаг 3, такты А–Б).
 *
 * ОДИН маршрут на все три обёртки («совместимость», «личность», «калькулятор любви») — это
 * прямое следствие решения владельца: жанры — обёртки поверх ОДНОГО движка (интервью №026,
 * В2 = Г), значит и каркас страницы один (V5 — интервью №029, В2 = А), различаются только
 * тексты и форма результата. Слаги и тексты — `$lib/content/test-copy.ts`.
 *
 * Страницы ОТКРЫТЫ ПОИСКУ: без noindex, в sitemap (в отличие от личных экранов приложения) —
 * это и есть смысл поверхности ТЕСТ (`plans/40` фаза 5, спрос — `researches/35` §1).
 *
 * 🔴 `+page.server.ts`, а не `+page.ts`: универсальный загрузчик уехал бы в клиентский бандл
 * вместе со всем, что импортирует (`EXP-0136`, оплачено замером 16,86 МБ).
 */

import { error } from '@sveltejs/kit';
import { TESTS, TEST_SLUGS, CARD_CHROME, TEST_FOOT, type TestSlug, type TestCopy } from '$lib/content/test-copy';
import { buildTestQueue, kindLabelFor, queueLengthFor, rowLabel, TEST_TARGET } from '$lib/content/test-set';
import { DIMS } from '$lib/content/dims-source';
import { LANGS, X_DEFAULT, type Lang } from '$lib/content/langs';
import { SITE_ORIGIN } from '$lib/site';

export const prerender = true;

/**
 * ТАКТ Б — ГИДРАТАЦИЯ ВКЛЮЧЕНА (`csr` по умолчанию): на странице живой движок оценки.
 * Содержание по-прежнему отдаётся сырым HTML пререндера (первая карточка очереди
 * детерминирована — `test-set.ts`), а Firebase в бандл страницы НЕ попадает: слой данных
 * подгружает `$lib/data/test-engine.ts` динамически, в момент жеста (канон `funnel.ts`).
 * Хаб `/tests` остаётся без клиентского JS — движка там нет.
 */

/** Адреса всех обёрток на каждом языке: 3 × 2 = 6 страниц. */
export const entries = () => LANGS.flatMap((lang) => TEST_SLUGS.map((slug) => ({ lang, slug })));

/** Одна карточка очереди движка — уже на языке страницы. */
export interface TestCard {
  id: string;
  kind: string;
  name: string;
  year: string;
  rates: number;
  /**
   * Подпись объекта В СТРОКЕ: «имя · Вид, год» (`bugs/126`, №032 В1 = В). Карточка вопроса
   * показывает те же три части по отдельности и этим полем не пользуется — оно для панели и
   * для строк результата, где иначе два разных произведения выглядят одной строкой.
   */
  label: string;
}

export interface TestPageData {
  lang: Lang;
  slug: TestSlug;
  copy: TestCopy;
  chrome: (typeof CARD_CHROME)['ru'];
  /** Очередь движка: набор + запас под «не знаю». Детерминирована (`test-set.ts`). */
  queue: TestCard[];
  /** Длина набора обёртки — обещана текстами страницы («12 вещей»). */
  target: number;
  foot: string;
  canonical: string;
  alternates: { hreflang: string; href: string }[];
}

export function load({ params }: { params: { lang: string; slug: string } }): TestPageData {
  const slug = params.slug as TestSlug;
  if (!TEST_SLUGS.includes(slug)) error(404, 'Такого теста нет');
  const lang = params.lang as Lang;

  const href = (l: Lang) => `${SITE_ORIGIN}/${l}/test/${slug}`;

  return {
    lang,
    slug,
    copy: TESTS[slug][lang],
    chrome: CARD_CHROME[lang],
    queue: buildTestQueue(DIMS, queueLengthFor(slug)).map((e) => {
      // Вид берём КАНОНИЧЕСКИЙ, а не сырое поле каталога: там регистр вразнобой и невидимые
      // знаки (`plans/48` шаг 0). На карточке это прячет капитель, в строке — нет.
      const kind = kindLabelFor(e.kind, lang);
      const name = e.name[lang];
      return {
        id: e.id,
        kind,
        name,
        year: e.year,
        rates: e.rates,
        label: rowLabel({ name, kind, year: e.year }),
      };
    }),
    target: TEST_TARGET[slug],
    foot: TEST_FOOT[lang],
    canonical: href(lang),
    // Двусторонний hreflang с самоссылкой — без неё разметка игнорируется целиком
    // (`researches/26` §4.1, тот же блок, что у страниц каталога).
    alternates: [
      ...LANGS.map((l) => ({ hreflang: l, href: href(l) })),
      { hreflang: 'x-default', href: href(X_DEFAULT) },
    ],
  };
}

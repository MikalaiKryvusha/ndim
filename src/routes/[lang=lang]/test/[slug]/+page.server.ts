/**
 * СТРАНИЦЫ-ОБЁРТКИ ТЕСТА — фаза 5 эпика 40 (`plans/42`, шаг 3, такт А).
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
import { TESTS, TEST_SLUGS, FIRST_CARD, TEST_FOOT, type TestSlug, type TestCopy } from '$lib/content/test-copy';
import { LANGS, X_DEFAULT, type Lang } from '$lib/content/langs';
import { SITE_ORIGIN } from '$lib/site';

export const prerender = true;

/**
 * ТАКТ А — СТРАНИЦА БЕЗ КЛИЕНТСКОГО JS (`csr = false`), как страницы каталога: содержание
 * отдано сырым HTML, тему переключает инлайн-скрипт `app.html`, FAQ работает на нативных
 * `<details>`. ⚠️ Такт Б (живой движок оценки) ВКЛЮЧИТ гидратацию — это осознанная будущая
 * правка, а не забытая строка: снимать её без движка нельзя (мёртвые звёзды выглядели бы
 * рабочими), включать без движка не за чем.
 */
export const csr = false;

/** Адреса всех обёрток на каждом языке: 3 × 2 = 6 страниц. */
export const entries = () => LANGS.flatMap((lang) => TEST_SLUGS.map((slug) => ({ lang, slug })));

export interface TestPageData {
  lang: Lang;
  slug: TestSlug;
  copy: TestCopy;
  first: (typeof FIRST_CARD)['ru'];
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
    first: FIRST_CARD[lang],
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

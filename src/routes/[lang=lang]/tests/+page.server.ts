/**
 * ХАБ «ТЕСТЫ» — дом семейства обёрток (`plans/42`, шаг 3, такт А).
 *
 * Делается СРАЗУ по слову владельца (интервью №028, В4 = Б — против рекомендации «не сейчас»):
 * дом для ссылок с лендинга и из приложения, задел под вторую волну обёрток. Карточки берутся
 * из тех же текстов, что и сами страницы (`test-copy.ts`), — второго списка тестов нет.
 *
 * Открыт поиску: без noindex, в sitemap. `+page.server.ts` — по правилу `EXP-0136`.
 */

import { TESTS, TEST_SLUGS, HUB, TEST_FOOT, type TestSlug } from '$lib/content/test-copy';
import { LANGS, X_DEFAULT, langEntries, type Lang } from '$lib/content/langs';
import { SITE_ORIGIN } from '$lib/site';

export const prerender = true;

/** Хабу JS не нужен вовсе: три ссылки-карточки и тексты. Тема — инлайн-скрипт `app.html`. */
export const csr = false;

export const entries = langEntries;

export interface HubCard {
  slug: TestSlug;
  badge: string;
  name: string;
  line: string;
  cta: string;
}

export function load({ params }: { params: { lang: string } }) {
  const lang = params.lang as Lang;
  const href = (l: Lang) => `${SITE_ORIGIN}/${l}/tests`;

  const cards: HubCard[] = TEST_SLUGS.map((slug) => ({
    slug,
    badge: TESTS[slug][lang].badge,
    name: TESTS[slug][lang].h1,
    line: TESTS[slug][lang].hubLine,
    cta: TESTS[slug][lang].hubCta,
  }));

  return {
    lang,
    hub: HUB[lang],
    cards,
    foot: TEST_FOOT[lang],
    canonical: href(lang),
    alternates: [
      ...LANGS.map((l) => ({ hreflang: l, href: href(l) })),
      { hreflang: 'x-default', href: href(X_DEFAULT) },
    ],
  };
}

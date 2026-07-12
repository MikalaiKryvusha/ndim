/**
 * Документы раздела «Меню»: руководство, условия, политика, отказ от ответственности.
 *
 * Все они — один и тот же экран с разным содержимым, поэтому маршрут динамический.
 * `entries()` перечисляет адреса для пререндера: сайт статический, и каждая страница
 * обязана существовать в `build/` заранее (иначе документа просто не будет).
 */

import { error } from '@sveltejs/kit';
import { DOCS, type Doc } from '$lib/content/docs';

/** История версий — не отдельная страница: она живёт внутри «О системе». */
const PAGES = Object.keys(DOCS).filter((slug) => slug !== 'history');

export const prerender = true;

export const entries = () => PAGES.map((slug) => ({ slug }));

export function load({ params }: { params: { slug: string } }): { doc: Doc } {
  const doc = DOCS[params.slug];
  if (!doc || !PAGES.includes(params.slug)) error(404, 'Документ не найден');
  return { doc };
}

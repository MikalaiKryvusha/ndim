/**
 * ИНДЕКС КАТАЛОГА — `/{lang}/catalog` (`plans/48` шаг 3, фаза 2 эпика 40).
 *
 * Дверь ко всем 5111 объектам: семь хабов со счётчиками плюс список из 25 объектов, которым
 * хаба не полагается. Хвост стоит здесь не для красоты — без него эти 25 × 2 языка остались бы
 * недостижимыми от корня, а фаза существует ровно ради того, чтобы недостижимых не было ни одной.
 *
 * 🔴 `+page.server.ts` по правилу `EXP-0136`: универсальный `load` утащил бы каталог в бандл.
 */

import { catalogIndexView, CATALOG_SOURCE, CATALOG_TOTAL } from '$lib/content/catalog-source';
import { langEntries, type Lang } from '$lib/content/langs';

export const prerender = true;

/** Страница — ссылки и числа; клиентского состояния нет ни одного. */
export const csr = false;

export const entries = () => {
  console.log(`[catalog] индекс каталога: ${CATALOG_TOTAL} объектов · источник: ${CATALOG_SOURCE}`);
  return langEntries();
};

export function load({ params }: { params: { lang: string } }) {
  return catalogIndexView(params.lang as Lang);
}

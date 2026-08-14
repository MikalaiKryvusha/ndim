/**
 * ВТОРАЯ И ДАЛЬНЕЙШИЕ СТРАНИЦЫ ХАБА — `/{lang}/catalog/{kind}/{page}` (`plans/48` шаг 3).
 *
 * Единицы среди адресов нет: первая страница живёт без номера (`…/catalog/movie`), и это
 * стережёт ограничитель `src/params/page.ts`. Два адреса с одним содержанием — дубль, который
 * поисковик обязан склеивать сам; дешевле его не создавать.
 *
 * Всего на язык: Movie 46 · Video game 20 · TV Series 6 · Novel 3 · Practice 3 ·
 * Music Artist 3 · Book 1 = **82 адреса** (89 страниц минус 7 первых). Числа считает
 * `catalog-source`, а не этот комментарий, — здесь они для ориентира.
 *
 * 🔴 `+page.server.ts` по правилу `EXP-0136`: универсальный `load` утащил бы каталог в бандл.
 */

import { error } from '@sveltejs/kit';
import { hubPageEntries, hubView } from '$lib/content/catalog-source';
import type { KindKey } from '$lib/content/dim-kind';
import { LANGS, type Lang } from '$lib/content/langs';

export const prerender = true;

/** JS этой странице не нужен ровно так же, как первой (см. соседний маршрут). */
export const csr = false;

export const entries = () => {
  const pages = hubPageEntries();
  const all = LANGS.flatMap((lang) => pages.map((p) => ({ lang, ...p })));
  console.log(`[catalog] ${all.length} страниц хабов со второй и дальше`);
  return all;
};

export function load({ params }: { params: { lang: string; kind: string; page: string } }) {
  const view = hubView(params.kind as KindKey, Number(params.page), params.lang as Lang);
  if (!view) error(404, 'Страница раздела каталога не найдена');
  return view;
}

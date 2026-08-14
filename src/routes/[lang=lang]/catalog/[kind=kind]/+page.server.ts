/**
 * ПЕРВАЯ СТРАНИЦА ХАБА — `/{lang}/catalog/{kind}` (`plans/48` шаг 3, фаза 2 эпика 40).
 *
 * Семь адресов на язык: `movie` · `video-game` · `tv-series` · `novel` · `practice` ·
 * `music-artist` · `book`. Вторая и дальнейшие страницы живут соседним маршрутом `[page]`;
 * разметка у обоих одна (`$lib/ui/CatalogHub.svelte`), потому что страница одна и та же.
 *
 * 🔴 `+page.server.ts`, а не `+page.ts`, и это не стиль. Загрузчик читает каталог на 17 МБ;
 * универсальный `load` исполняется И В БРАУЗЕРЕ, поэтому Vite вшил бы весь каталог в клиентский
 * бандл — замерено на странице объекта: чанк узла 16,86 МБ при всём `_app` в 18,1 МБ
 * (`EXP-0136`). Серверный загрузчик решает это по построению.
 */

import { error } from '@sveltejs/kit';
import { hubView, CATALOG_SOURCE } from '$lib/content/catalog-source';
import { KIND_KEYS, type KindKey } from '$lib/content/dim-kind';
import type { Lang } from '$lib/content/langs';
import { LANGS } from '$lib/content/langs';

export const prerender = true;

/**
 * Хабу JS не нужен вовсе: ссылки, числа и звёзды. Гидратация выключена по тому же расчёту, что
 * на страницах объектов, — исчезают лишние `__data.json` и бандл фреймворка, страница появляется
 * быстрее на телефоне и слабой связи. Тема при этом жива: её ставит инлайн-скрипт `app.html`.
 */
export const csr = false;

export const entries = () => {
  const all = LANGS.flatMap((lang) => KIND_KEYS.map((kind) => ({ lang, kind })));
  console.log(`[catalog] ${all.length} первых страниц хабов · источник: ${CATALOG_SOURCE}`);
  return all;
};

export function load({ params }: { params: { lang: string; kind: string } }) {
  const view = hubView(params.kind as KindKey, 1, params.lang as Lang);
  if (!view) error(404, 'Раздел каталога не найден');
  return view;
}

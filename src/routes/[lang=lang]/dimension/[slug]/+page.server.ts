/**
 * ПУБЛИЧНАЯ СТРАНИЦА ИЗМЕРЕНИЯ — фаза 5 эпика `ideas/30` (`plans/36`, шаги 1–4).
 *
 * Каждому объекту каталога — собственный адрес и HTML, который видит поисковик и человек без
 * аккаунта. Сегодня измерения видны только вошедшим, а экран `/dims` закрыт `noindex`.
 *
 * ── ДВА ЯЗЫКА СРАЗУ (интервью №023, В2 = А) ────────────────────────────────────────────────
 * Владелец: выпускаем оба языка одновременно. Английские описания (~5,24 млн знаков) уходят в
 * мир немедленно; обвязка страницы переведена агентом и ждёт его вычитки уже В БОЮ.
 * Страниц становится 5111 × 2 = **10 222**.
 *
 * 🔑 Почему это можно делать ЗДЕСЬ, не дожидаясь `plans/24` фазы 7: адреса страниц каталога —
 * НОВЫЕ, ни один из них не проиндексирован. Флипа языка под уже заработанным адресом не
 * происходит, ломать нечего. Остальной сайт переезжает на префиксы позже и отдельно.
 *
 * ── ЧТО ЭТА ФАЗА НЕ ДЕЛАЕТ ─────────────────────────────────────────────────────────────────
 * ⛔ Не трогает общий модуль языка (12 мест, читающих память браузера) — это `plans/24` фаза 6.
 * ⛔ Не показывает блок соседства измерений: отклонено владельцем 2026-08-03 и по людям, и по
 *    тегам (`plans/37`, `researches/32`).
 *
 * Почему `entries()` перечисляет адреса руками: сайт статический (`+layout.ts: prerender = true`),
 * и каждая страница обязана существовать в `build/` заранее — ровно как документы «Меню».
 *
 * ── 🔴 ПОЧЕМУ `+page.server.ts`, А НЕ `+page.ts` — ОШИБКА, ОПЛАЧЕННАЯ ЗАМЕРОМ ────────────────
 * Первая редакция была УНИВЕРСАЛЬНЫМ загрузчиком. Универсальный `load` исполняется и в браузере,
 * поэтому Vite вшивает всё, что он импортирует, в клиентский бандл — и каталог уехал бы к
 * каждому посетителю: чанк узла вырос до **16,86 МБ** при всём `_app` в 18,1 МБ. Поймал это
 * не глаз, а страж жаргона: он нашёл слово «вычислитель» в клиентском чанке, куда оно попало
 * вместе с описанием фильма «Скрытые фигуры» (`EXP-0136`).
 * Серверный загрузчик решает это по построению: на пререндере он читает каталог, а браузеру
 * достаётся только результат ОДНОЙ страницы.
 */

import { error } from '@sveltejs/kit';
import { DIMS, DIMS_SOURCE } from '$lib/content/dims-source.ts';
import { ratingView } from '$lib/content/dims-rating.ts';
import { LANGS, X_DEFAULT, pick, type Lang } from '$lib/content/langs.ts';
import { SITE_ORIGIN } from '$lib/site';
import type { DimView } from '$lib/content/dim-view.ts';

const BY_SLUG = new Map(DIMS.map((d) => [d.slug, d]));

export const prerender = true;

/**
 * Адреса всех страниц каталога — на каждом языке.
 *
 * 🔴 Источник называется ВСЛУХ: выкат, случайно собранный на запасном срезе, дал бы 100 страниц
 * вместо 10 222 и выглядел бы совершенно исправным (`dims-source.ts`).
 */
export const entries = () => {
  const all = LANGS.flatMap((lang) => DIMS.map((d) => ({ lang, slug: d.slug })));
  console.log(`[dimension] ${all.length} страниц (${DIMS.length} × ${LANGS.length} яз.) · источник: ${DIMS_SOURCE}`);
  return all;
};

/** Поле каталога, заполненное прочерком, означает «неизвестно», а не «так и называется». */
const known = (v: string) => (v && v !== '-' ? v : '');

export function load({ params }: { params: { lang: string; slug: string } }): DimView {
  const dim = BY_SLUG.get(params.slug);
  if (!dim) error(404, 'Измерение не найдено');
  const lang = params.lang as Lang;

  const title = pick(dim.title, lang);
  const description = pick(dim.description, lang);
  const other = lang === 'en' ? dim.title.ru : dim.title.en;

  // Описание для выдачи: режем по границе слова, а не по счётчику знаков — обрубок посреди
  // слова видит человек в результатах поиска, а не только робот.
  const meta = description.length > 155
    ? description.slice(0, 155).replace(/\s+\S*$/, '') + '…'
    : description;

  const href = (l: Lang) => `${SITE_ORIGIN}/${l}/dimension/${dim.slug}`;

  return {
    dim,
    lang,
    title,
    description,
    kind: known(pick(dim.type, lang)),
    author: known(pick(dim.author, lang)),
    original: other && other !== title ? other : '',
    year: known(dim.year),
    tags: dim.tags,
    meta,
    canonical: href(lang),
    // Самоссылка ОБЯЗАТЕЛЬНА («Each language version must list itself as well as all other
    // language versions» — Google), иначе разметка игнорируется целиком (`researches/26` §4.1).
    alternates: [
      ...LANGS.map((l) => ({ hreflang: l, href: href(l) })),
      { hreflang: 'x-default', href: href(X_DEFAULT) },
    ],
    // Правило показа оценок решается в ОДНОМ месте на весь проект — одно внутри приложения и
    // снаружи (интервью №022). Шаблон получает его готовым.
    ...ratingView(dim.rates),
  };
}

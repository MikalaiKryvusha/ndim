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
 * не глаз, а страж жаргона: он нашёл слово «сервер синхронизации» в клиентском чанке, куда оно попало
 * вместе с описанием фильма «Скрытые фигуры» (`EXP-0136`).
 * Серверный загрузчик решает это по построению: на пререндере он читает каталог, а браузеру
 * достаётся только результат ОДНОЙ страницы.
 */

import { error } from '@sveltejs/kit';
import { DIMS, DIMS_SOURCE } from '$lib/content/dims-source';
import { ratingView } from '$lib/content/dims-rating';
import { kindKeyOf, kindTitle } from '$lib/content/dim-kind';
import { catalogPath, hubPath } from '$lib/content/catalog-hub';
import { neighboursFor } from '$lib/content/catalog-source';
import { CATALOG_COPY } from '$lib/content/catalog-copy';
import { dimJsonLd } from '$lib/content/dim-jsonld';
import { LANGS, X_DEFAULT, pick, type Lang } from '$lib/content/langs';
import { SITE_ORIGIN } from '$lib/site';
import type { DimView } from '$lib/content/dim-view';

const BY_SLUG = new Map(DIMS.map((d) => [d.slug, d]));

export const prerender = true;

/**
 * СТРАНИЦЕ НЕ НУЖЕН JAVASCRIPT ВООБЩЕ — гидратация выключена.
 *
 * Оживлять здесь нечего: заголовок, карточка данных, текст описания и две обычные ссылки
 * (переключатель языка и дверь в продукт). Ни одного состояния, ни одного обработчика.
 *
 * Что это даёт, замерено до и после:
 *   · исчезают **10 222 файла `__data.json`** — полезная нагрузка клиентских переходов,
 *     которая для страницы без интерактива является чистым мёртвым весом;
 *   · браузер не качает, не разбирает и не исполняет бандл фреймворка — страница появляется
 *     быстрее, и сильнее всего это заметно на телефоне и слабой связи;
 *   · из самого HTML уходит сериализованная нагрузка гидратации.
 *
 * Чем платим: переход по внутренней ссылке — обычная перезагрузка вместо мгновенного
 * клиентского перехода. Ссылок ровно две, и обе ведут туда, где перезагрузка неизбежна:
 * на другой языковой адрес и на `/`, где приложение грузится с нуля в любом случае.
 *
 * ⚠️ Тема НЕ страдает: `data-theme` ставит инлайн-скрипт `app.html` до первой отрисовки, а
 * корневой макет инертен (только токены и `{@render children()}`). Проверено прибором, а не
 * рассуждением — `tools/shoot-dimension-pages.mjs`, обе темы.
 */
export const csr = false;

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

  /*
   * ВВЕРХ И ВБОК (`plans/48` шаг 4). До этого шага у карточки была РОВНО ОДНА входящая ссылка —
   * языковой двойник, — и ни одной исходящей внутрь каталога. Хаб даёт ей вход и обратный путь,
   * соседи — ещё восемь связей по классификации.
   */
  const kindKey = kindKeyOf(dim.type);
  const up = kindKey
    ? { title: kindTitle(kindKey, lang), href: hubPath(lang, kindKey) }
    : { title: CATALOG_COPY[lang].up, href: catalogPath(lang) };

  // Разметка считается ЗДЕСЬ, на пререндере: правило показа оценок одно на проект, и разметка
  // обязана следовать ему, а не собственной копии условия (`plans/48` шаг 5).
  const rating = ratingView(dim.rates);
  /*
   * 🔴 `<` ЭКРАНИРУЕТСЯ, И ЭТО НЕ ПЕДАНТИЗМ. Строка едет внутрь `<script type="application/ld+json">`
   * через `{@html}`; описания каталога — 5,24 млн знаков чужого текста, и одна
   * последовательность `</script>` в любом из них закрыла бы тег раньше времени и вывалила
   * остаток JSON в разметку страницы. `<` — валидный JSON и невидим для разбора.
   */
  const jsonLd = JSON.stringify(
    dimJsonLd({
      kindKey: kindKeyOf(dim.type),
      title,
      description,
      author: known(pick(dim.author, lang)),
      year: known(dim.year),
      canonical: href(lang),
      rating: dim.rating,
      rates: dim.rates,
      showStars: rating.showStars,
    }),
  ).replace(/</g, '\\u003c');

  // 🔴 ОТДАЁМ РОВНО ТО, ЧТО СТРАНИЦА РИСУЕТ, и ни полем больше. Объект каталога `dim` целиком
  // сюда НЕ возвращается: в нём оба языка разом, и описание уезжало бы в ответ ТРИЖДЫ (русское,
  // английское и выбранное). Замер до правки: `__data.json` весил 4 871 байт × 10 222 страницы =
  // 41 МБ в каждом релизе — при том что страница объявлена `csr = false` и эти файлы никто не
  // запрашивает. Подробности и почему их нельзя просто удалить — в `dim-view.ts`.
  return {
    lang,
    slug: dim.slug,
    title,
    description,
    kind: known(pick(dim.type, lang)),
    author: known(pick(dim.author, lang)),
    otherTitle: other && other !== title ? other : '',
    year: known(dim.year),
    tags: dim.tags,
    rating: dim.rating,
    rates: dim.rates,
    meta,
    canonical: href(lang),
    // Самоссылка ОБЯЗАТЕЛЬНА («Each language version must list itself as well as all other
    // language versions» — Google), иначе разметка игнорируется целиком (`researches/26` §4.1).
    alternates: [
      ...LANGS.map((l) => ({ hreflang: l, href: href(l) })),
      { hreflang: 'x-default', href: href(X_DEFAULT) },
    ],
    jsonLd,
    up,
    neighbours: neighboursFor(dim.slug, lang),
    // Правило показа оценок решается в ОДНОМ месте на весь проект — одно внутри приложения и
    // снаружи (интервью №022). Шаблон получает его готовым.
    ...rating,
  };
}

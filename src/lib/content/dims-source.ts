/**
 * ИСТОЧНИК КАТАЛОГА ДЛЯ СБОРКИ — шаг 2 фазы 5 (`plans/36`).
 *
 * Публичные страницы измерений пререндерятся, значит каталог обязан лежать файлом в дереве. Но
 * полный каталог — **16,7 МБ**, и в git ему не место. Отсюда два файла и одно правило выбора:
 *
 *   · `dims-build.json` — весь каталог (5111). Пишется `node tools/fetch-dims-slice.mjs --all`
 *     ШАГОМ ВЫКАТА, в git не попадает (`.gitignore`).
 *   · `dims-slice.json` — 50 записей, ЛЕЖИТ в git. Запасной каталог: без него `npm run build` из
 *     чистого клона падал бы, а собирать сайт должно быть можно без сети и без боевого доступа.
 *
 * Полный есть — берём его; нет — работаем на срезе и говорим об этом вслух в консоль сборки.
 *
 * 🔴 ПОЧЕМУ `import.meta.glob`, А НЕ `try { import }`. Статический импорт несуществующего файла
 * роняет сборку на этапе разрешения модулей, а динамический в пререндере даёт промис, которого
 * `entries()` ждать не умеет. `import.meta.glob` с `eager` разрешается Vite ДО сборки: файла нет —
 * набор пуст, и никакой ошибки. Это штатный приём Vite для необязательных файлов, а не хитрость.
 *
 * ⚠️ Молчаливая подмена здесь была бы дорогой: выкат, случайно собранный на срезе, дал бы 50
 * страниц вместо 5111 и выглядел бы совершенно исправным. Поэтому источник НАЗЫВАЕТСЯ вслух, а
 * `tools/verify-dimension-pages.mjs` отдельно проверяет, что в бою собран не срез.
 */

import slice from './dims-slice.json' with { type: 'json' };

/** Одно измерение в том виде, в каком его отдаёт `tools/fetch-dims-slice.mjs`. */
export interface DimPage {
  readonly id: string;
  readonly slug: string;
  readonly title: { ru: string; en: string };
  readonly description: { ru: string; en: string };
  readonly type: { ru: string; en: string };
  readonly author: { ru: string; en: string };
  /** Год издания; `-` в каталоге означает «неизвестен» — тогда элемент не показывается. */
  readonly year: string;
  readonly tags: readonly string[];
  /** Сколько людей оценили. Правило показа — в `dims-rating.ts`, одно на весь проект. */
  readonly rates: number;
  /** Средняя оценка, 0…10. Ноль означает «не оценивали», а НЕ «оценили на ноль». */
  readonly rating: number;
}

const full = import.meta.glob<{ default: DimPage[] }>('./dims-build.json', { eager: true });
const loaded = Object.values(full)[0]?.default;

/** Весь каталог, если он выгружен, иначе запасной срез. */
export const DIMS: readonly DimPage[] = (loaded ?? (slice as DimPage[])) as readonly DimPage[];

/** Откуда взялись эти записи — печатается в сборке и проверяется стражем. */
export const DIMS_SOURCE: 'полный каталог' | 'запасной срез' = loaded ? 'полный каталог' : 'запасной срез';

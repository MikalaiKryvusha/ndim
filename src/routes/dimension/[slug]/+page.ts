/**
 * ПУБЛИЧНАЯ СТРАНИЦА ИЗМЕРЕНИЯ — фаза 5 эпика `ideas/30` (`plans/36`).
 *
 * ⚠️ СЕЙЧАС ЭТО ПРОТОТИП ШАГА 0: маршрут поднят на СРЕЗЕ из 50 измерений ради трёх чисел
 * (вес страницы, вес всех 5111, время сборки). План прямо запрещает собирать все 5111 до
 * этого замера. Срез выгружается `node tools/fetch-dims-slice.mjs`.
 *
 * Почему `entries()` перечисляет адреса руками: сайт статический (`+layout.ts: prerender = true`),
 * и каждая страница обязана существовать в `build/` заранее — ровно как документы «Меню»
 * (`src/routes/menu/[slug]/+page.ts`). Тот же приём, другой источник.
 *
 * 🔴 Адрес = читаемые слова + хвост идентификатора (`battlefield-3-ucvge98o`) — схема утверждена
 * владельцем 2026-08-02. Google просит «readable words rather than long ID numbers», а хвост
 * даёт вечность адреса при правке названия и снимает коллизии одноимённых произведений.
 */

import { error } from '@sveltejs/kit';
import slice from '$lib/content/dims-slice.json';

/** Одно измерение в том виде, в каком его отдаёт `tools/fetch-dims-slice.mjs`. */
export interface DimPage {
  readonly id: string;
  readonly slug: string;
  readonly title: { ru: string; en: string };
  readonly description: { ru: string; en: string };
  readonly type: { ru: string; en: string };
  readonly author: { ru: string; en: string };
  readonly year: string;
  readonly tags: readonly string[];
  /** Сколько людей заполнили эту ось. Правило показа — ниже, в комментарии `load`. */
  readonly rates: number;
  /** Средняя оценка, 0…10. */
  readonly rating: number;
}

const PAGES = slice as readonly DimPage[];
const BY_SLUG = new Map(PAGES.map((d) => [d.slug, d]));

export const prerender = true;

export const entries = () => PAGES.map((d) => ({ slug: d.slug }));

/**
 * ПРАВИЛО ПОКАЗА ОЦЕНОК — решение владельца, интервью №021 В1 и №022 В1 = А.
 * Здесь оно вычисляется ОДИН раз и отдаётся разметке готовым, чтобы шаблон не решал сам:
 *
 *   · звёзды  — при `rates` ≥ 1 (1873 измерения из 5111);
 *   · серый текст «ещё без голосов» — при `rates` = 0 (3238) — то же правило, что на экране
 *     внутри приложения (`ideas/26`): одно правило внутри и снаружи;
 *   · число проголосовавших — при `rates` ≥ 3 (892).
 *
 * 🔴 Ноль в поле `rating` означает «не оценивали», а НЕ «оценили на ноль». Показать его звёздами
 * было бы неправдой на двух третях страниц каталога — ради этого правило и существует.
 */
export function load({ params }: { params: { slug: string } }): {
  dim: DimPage;
  showStars: boolean;
  showRaterCount: boolean;
} {
  const dim = BY_SLUG.get(params.slug);
  if (!dim) error(404, 'Измерение не найдено');
  return { dim, showStars: dim.rates >= 1, showRaterCount: dim.rates >= 3 };
}

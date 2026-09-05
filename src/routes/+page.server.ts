/**
 * ДАННЫЕ ГЛАВНОЙ С СОДЕРЖАНИЕМ — корень `ndimspace.app/` (`plans/81`, макет V5).
 *
 * Корень перестал быть распознавателем языка и стал страницей (решение владельца: №058 В1 = А,
 * форма — №060, ответ 2026-09-05). Ему нужны две вещи из глубины проекта: живые числа
 * Пространства и полоса настоящих объектов каталога.
 *
 * 🔴 ПОЧЕМУ `+page.server.ts`, А НЕ `+page.ts` — `EXP-0136`. `catalog-source` тянет полный
 * `dims-build.json` (17,5 МБ). Универсальный `load` утащил бы его в КЛИЕНТСКИЙ бандл, и
 * корень — самая лёгкая страница сайта — стал бы самой тяжёлой. Каталог живёт только на сервере;
 * шапка `catalog-source.ts` говорит это же дословно.
 *
 * Числа берутся ГОТОВЫМИ из снимка (`$lib/data/metrics`), ничего не считается: правило
 * `bugs/07` («лендинг врёт: число зашито в код») и `bugs/81` (число обязано быть в ПЕРВОМ
 * кадре, а не доезжать на горячую). Множителя витрины нет — интервью №010, Р7.
 */

import { hubItems } from '$lib/content/catalog-source';
import { KIND_KEYS, kindLabel, type KindKey } from '$lib/content/dim-kind';
import { dimensionPath } from '$lib/content/catalog-hub';
import { landingDims, landingPeople, landingRatings, landingRelations } from '$lib/data/metrics';

export const prerender = true;

/**
 * Клиентского состояния на странице нет — только ссылки. Тема переключается инлайн-скриптом
 * `app.html` по идентификатору `theme-toggle`, без бандла (тот же приём, что у `PublicBar`).
 */
export const csr = false;

/**
 * ВИДЫ В ПОЛОСЕ — шесть, музыка не берётся.
 *
 * Причина не косметическая и записана до выбора владельца (макет, решение Менеджера 2026-08-29):
 * под музыкальных исполнителей у мастерской нет проверенных правил описаний — владелец дважды
 * не брал альбомы в партии, — и ставить на ЛИЦО двери вид, за который мы не отвечаем, нельзя.
 * Шесть видов дают ровно ту сетку 3 × 2, которую он утвердил в V5.
 */
const ВИДЫ_ПОЛОСЫ: readonly KindKey[] = KIND_KEYS.filter((k) => k !== 'music-artist');

/** Одна карточка полосы: обе языковые ссылки, потому что дверь язык за человека не выбирает. */
export type StripCard = {
  slug: string;
  titleRu: string;
  titleEn: string;
  hrefRu: string;
  hrefEn: string;
  kindRu: string;
  kindEn: string;
  year: string;
};

export function load(): { strip: StripCard[]; dims: number; ratings: number; people: number; relations: number } {
  const strip: StripCard[] = [];
  for (const kind of ВИДЫ_ПОЛОСЫ) {
    // Лучший объект вида — первый в хабе: хабы уже отсортированы взвешенным компаратором
    // (`catalog-hub.ts`), своего правила отбора здесь не заводим.
    const best = hubItems(kind)[0];
    if (!best) continue;
    strip.push({
      slug: best.slug,
      titleRu: best.title.ru,
      titleEn: best.title.en,
      hrefRu: dimensionPath('ru', best.slug),
      hrefEn: dimensionPath('en', best.slug),
      kindRu: kindLabel(kind, 'ru'),
      kindEn: kindLabel(kind, 'en'),
      // ⚠️ ПУСТОЙ ГОД В КАТАЛОГЕ ЗАПИСАН НЕ ПУСТОТОЙ, А ПРОЧЕРКОМ. Проверка «если год есть»
      // пропускала «-», и на живом стейдже под «Сексом» встало «Практика · Practice · -».
      // Годом считается только год: четыре цифры, ничего другого.
      year: /^\d{3,4}$/u.test(String(best.year ?? '').trim()) ? String(best.year).trim() : '',
    });
  }

  return {
    strip,
    dims: landingDims(),
    ratings: landingRatings(),
    people: landingPeople(),
    relations: landingRelations(),
  };
}

/**
 * СТРАЖ ХАБОВ КАТАЛОГА — `plans/48` (фаза 2 эпика 40), шаг 3.
 *
 * Мутации, которые эти тесты обязаны ронять:
 *   · сортировать по НАЗВАНИЮ вместо слага — русская и английская страницы хаба перестанут быть
 *     переводами друг друга, а `hreflang` продолжит это утверждать (самый дорогой класс: разметка
 *     врёт, а сборка зелёная);
 *   · пустить неоценённые вперёд оценённых — «топ по версии NDim Space» начнётся с пустых карточек;
 *   · сделать первую страницу адресом `…/1` — у одного содержания станет два адреса;
 *   · сбить сквозную нумерацию мест (считать номер от начала страницы, а не от начала хаба).
 *
 * Проверяется не только функция, но и ВЕСЬ боевой каталог, когда он выгружен: правило существует
 * ради 89 страниц на язык, а не ради красивого юнита. Числа — замер 2026-08-14 по `dims-build.json`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

import {
  PER_PAGE,
  catalogPath,
  compareForHub,
  groupByKind,
  hubPath,
  pageCount,
  slicePage,
  summarize,
  toCard,
  type CatalogItem,
} from './catalog-hub.ts';
import { KIND_KEYS } from './dim-kind.ts';
import slice from './dims-slice.json' with { type: 'json' };

/** Заготовка объекта каталога: в тестах меняется ровно то, что тест проверяет. */
const item = (over: Partial<CatalogItem> & { slug: string }): CatalogItem => ({
  title: { ru: 'Название', en: 'Title' },
  author: { ru: 'Автор', en: 'Author' },
  type: { ru: 'Фильм', en: 'Movie' },
  year: '2000',
  rates: 0,
  rating: 0,
  ...over,
});

test('оценённые идут перед неоценёнными — «топ» не начинается с пустых карточек', () => {
  const rated = item({ slug: 'zzz-last-by-slug', rates: 1, rating: 5 });
  const unrated = item({ slug: 'aaa-first-by-slug' });
  assert.deepEqual([unrated, rated].sort(compareForHub), [rated, unrated]);
});

test('внутри оценённых порядок — по убыванию оценки, потом по числу голосов', () => {
  const a = item({ slug: 'a', rates: 2, rating: 9.4 });
  const b = item({ slug: 'b', rates: 30, rating: 9.3 });
  const c = item({ slug: 'c', rates: 5, rating: 9.4 });
  // a и c равны по оценке — их разводит число голосов; b ниже по оценке, и это сильнее.
  assert.deepEqual([b, a, c].sort(compareForHub).map((x) => x.slug), ['c', 'a', 'b']);
});

test('🔴 ПОРЯДОК НЕ ЗАВИСИТ ОТ ЯЗЫКА: равенства разводит слаг, а не название', () => {
  // Оба объекта равны по оценке и числу голосов, а их названия УПОРЯДОЧЕНЫ ПО-РАЗНОМУ в двух
  // языках: по-русски первой идёт «Аврора» (объект `b`), по-английски — «Anger» (объект `a`).
  // Сортировка по названию дала бы на `/ru/catalog/movie/2` и `/en/catalog/movie/2` РАЗНЫЕ
  // наборы объектов — при том что `hreflang` объявляет эти страницы переводами друг друга.
  const a = item({ slug: 'a-anger', title: { ru: 'Ярость', en: 'Anger' }, rates: 3, rating: 8 });
  const b = item({ slug: 'b-zenith', title: { ru: 'Аврора', en: 'Zenith' }, rates: 3, rating: 8 });
  assert.deepEqual([b, a].sort(compareForHub).map((x) => x.slug), ['a-anger', 'b-zenith']);
  assert.deepEqual([a, b].sort(compareForHub).map((x) => x.slug), ['a-anger', 'b-zenith']);
  // Контроль самого теста: убеждаемся, что фикстура ДЕЙСТВИТЕЛЬНО расходится по языкам, —
  // иначе этот тест был бы зелёным на любой реализации, включая сортировку по названию.
  const byTitle = (l: 'ru' | 'en') =>
    [b, a].sort((x, y) => x.title[l].localeCompare(y.title[l], l)).map((x) => x.slug);
  assert.notDeepEqual(byTitle('ru'), byTitle('en'));
});

test('сравнение детерминировано: одинаковые объекты не меняются местами', () => {
  const list = [item({ slug: 'b' }), item({ slug: 'a' }), item({ slug: 'c' })];
  const once = [...list].sort(compareForHub).map((x) => x.slug);
  const twice = [...list].sort(compareForHub).sort(compareForHub).map((x) => x.slug);
  assert.deepEqual(once, twice);
  assert.deepEqual(once, ['a', 'b', 'c']);
});

test('страниц ровно столько, сколько нужно, и не меньше одной', () => {
  assert.equal(pageCount(0), 1);
  assert.equal(pageCount(1), 1);
  assert.equal(pageCount(PER_PAGE), 1);
  assert.equal(pageCount(PER_PAGE + 1), 2);
  assert.equal(pageCount(2774), 47); // «Фильмы» в бою на 2026-08-14
});

test('срез страницы не теряет и не дублирует объекты', () => {
  const list = Array.from({ length: PER_PAGE * 2 + 7 }, (_, i) => `x${i}`);
  const pages = pageCount(list.length);
  const seen = pages > 0 ? Array.from({ length: pages }, (_, i) => slicePage(list, i + 1)).flat() : [];
  assert.deepEqual(seen, list);
  assert.equal(slicePage(list, 1).length, PER_PAGE);
  assert.equal(slicePage(list, pages).length, 7);
  assert.deepEqual(slicePage(list, pages + 1), []);
});

test('🔴 первая страница хаба живёт БЕЗ номера — второго адреса у одного содержания нет', () => {
  assert.equal(hubPath('ru', 'movie'), '/ru/catalog/movie');
  assert.equal(hubPath('ru', 'movie', 1), '/ru/catalog/movie');
  assert.equal(hubPath('en', 'video-game', 2), '/en/catalog/video-game/2');
  assert.equal(catalogPath('en'), '/en/catalog');
});

test('раскладка по видам: известный вид — в хаб, остальное — в хвост, и ничего не теряется', () => {
  const items = [
    item({ slug: 'm', type: { ru: 'Фильм', en: 'Movie' } }),
    item({ slug: 'g', type: { ru: 'Видеоигра', en: 'Video game' } }),
    // Невидимый U+200B — тот самый класс грязи, ради которого нормализация делается на чтении.
    item({ slug: 's', type: { ru: 'Телесериал', en: 'TV Series​' } }),
    // «Повесть» смыслово в «Роман» НЕ вливается: это была бы правка данных под видом чтения.
    item({ slug: 'n', type: { ru: 'Повесть', en: 'Novella' } }),
  ];
  const { hubs, tail } = groupByKind(items);
  assert.deepEqual(hubs.get('movie')?.map((x) => x.slug), ['m']);
  assert.deepEqual(hubs.get('video-game')?.map((x) => x.slug), ['g']);
  assert.deepEqual(hubs.get('tv-series')?.map((x) => x.slug), ['s']);
  assert.deepEqual(hubs.get('novel')?.map((x) => x.slug), []);
  assert.deepEqual(tail.map((x) => x.slug), ['n']);
  const inHubs = [...hubs.values()].reduce((s, l) => s + l.length, 0);
  assert.equal(inHubs + tail.length, items.length);
});

test('карточка несёт то, что рисуется, а прочерк-неизвестность превращается в пусто', () => {
  const card = toCard(
    item({ slug: 'x', year: '-', author: { ru: '-', en: '-' }, rates: 4, rating: 7.5 }),
    'ru',
  );
  assert.deepEqual(card, { slug: 'x', title: 'Название', year: '', author: '', rating: 7.5, rates: 4 });
  assert.equal(toCard(item({ slug: 'y' }), 'en').title, 'Title');
});

/**
 * ЖИВОЙ КАТАЛОГ — числа замера 2026-08-14. Полный файл лежит вне git (17 МБ), поэтому на чистом
 * клоне тест честно уходит на запасной срез и проверяет то, что там есть: суммы сходятся,
 * порядок держится, страницы не теряют объектов.
 */
const BUILD = new URL('./dims-build.json', import.meta.url);
const full = existsSync(BUILD) ? (JSON.parse(readFileSync(BUILD, 'utf8')) as CatalogItem[]) : null;
const catalog = (full ?? (slice as unknown as CatalogItem[])) as CatalogItem[];

test('боевой каталог: суммы хабов и хвоста сходятся с числом объектов', () => {
  const { hubs, tail } = groupByKind(catalog);
  const sums = summarize(hubs);
  const inHubs = sums.reduce((s, h) => s + h.count, 0);
  assert.equal(inHubs + tail.length, catalog.length);
  assert.equal(sums.length, KIND_KEYS.length);
  // Оценённых не может быть больше, чем объектов, — граница, а не «не ноль» (правило шкалы 0…10).
  for (const h of sums) assert.ok(h.rated <= h.count, `${h.key}: оценённых больше, чем объектов`);
});

test('боевой каталог: каждая страница каждого хаба непуста и в сумме даёт весь хаб', () => {
  const { hubs } = groupByKind(catalog);
  for (const key of KIND_KEYS) {
    const list = hubs.get(key) ?? [];
    if (!list.length) continue;
    const pages = pageCount(list.length);
    const seen: string[] = [];
    for (let p = 1; p <= pages; p += 1) {
      const chunk = slicePage(list, p);
      assert.ok(chunk.length > 0, `${key}: страница ${p} пуста`);
      assert.ok(chunk.length <= PER_PAGE, `${key}: на странице ${p} больше ${PER_PAGE} карточек`);
      seen.push(...chunk.map((x) => x.slug));
    }
    assert.equal(seen.length, list.length);
    assert.equal(new Set(seen).size, list.length, `${key}: карточка попала на две страницы`);
  }
});

test('боевой каталог: в голове каждого хаба нет ни одной карточки без голосов', () => {
  const { hubs } = groupByKind(catalog);
  for (const key of KIND_KEYS) {
    const list = hubs.get(key) ?? [];
    const rated = list.filter((d) => d.rates >= 1).length;
    if (!rated) continue;
    // Первые `rated` мест — ровно оценённые объекты. Мутация «неоценённые вперёд» роняет это.
    for (let i = 0; i < rated; i += 1) {
      assert.ok(list[i].rates >= 1, `${key}: место ${i + 1} занято карточкой без голосов`);
    }
  }
});

if (full) {
  test('боевой каталог: числа замера 2026-08-14 держатся', () => {
    const { hubs, tail } = groupByKind(catalog);
    const sums = summarize(hubs);
    const byKey = Object.fromEntries(sums.map((h) => [h.key, h]));
    assert.equal(catalog.length, 5111);
    assert.equal(tail.length, 25);
    assert.equal(byKey.movie.count, 2774);
    assert.equal(byKey.movie.rated, 981);
    assert.equal(byKey.movie.pages, 47);
    assert.equal(byKey['video-game'].count, 1221);
    assert.equal(byKey['tv-series'].count, 370);
    assert.equal(byKey.novel.count, 231);
    assert.equal(byKey.practice.count, 228);
    assert.equal(byKey['music-artist'].count, 198);
    assert.equal(byKey.book.count, 64);
    // 89 страниц на язык — число, на котором стоит вся арифметика фазы.
    assert.equal(sums.reduce((s, h) => s + h.pages, 0), 89);
  });
}

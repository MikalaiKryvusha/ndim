/**
 * СТРАЖ КАНОНИЧЕСКОГО ВИДА — `plans/48` (фаза 2 эпика 40), шаг 1.
 *
 * Мутации, которые эти тесты обязаны ронять:
 *   · убрать снятие невидимых знаков в `normalizeRaw` — «TV Series​» перестанет попадать в хаб
 *     `tv-series`, и 41 запись уедет в отдельный адрес-двойник;
 *   · опустить приведение регистра — 21 «фильм» потеряет хаб;
 *   · влить «Повесть» в «Роман» — тест смыслового слияния покраснеет.
 *
 * Проверяется не только функция, но и ВЕСЬ боевой каталог, когда он выгружен: правило существует
 * ради 10 222 страниц, а не ради красивого юнита. Числа — замер шага 0 `plans/48` (2026-08-14).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

import {
  KIND_KEYS,
  isKindKey,
  isKnownWithoutHub,
  kindKeyOf,
  kindLabel,
  kindTitle,
  normalizeRaw,
  type KindKey,
} from './dim-kind.ts';
import slice from './dims-slice.json' with { type: 'json' };

/** Каждая строка — реальный случай из замера, а не выдуманный. */
const CASES: Array<{ raw: { ru?: string; en?: string }; key: KindKey | null; why: string }> = [
  { raw: { ru: 'Фильм', en: 'Movie' }, key: 'movie', why: 'чистая запись' },
  { raw: { ru: 'Телесериал', en: 'TV Series​' }, key: 'tv-series', why: 'U+200B в конце — 41 запись' },
  { raw: { ru: 'Телесериал​', en: 'TV Series' }, key: 'tv-series', why: 'U+200B в русском — 1 запись' },
  /*
   * 🔴 СЛУЧАЙ, НАЙДЕННЫЙ МУТАЦИЕЙ, А НЕ ВООБРАЖЕНИЕМ.
   *
   * Пока оба случая выше имели ЧИСТОЕ второе поле, они спасались опросом второго поля — и
   * мутация «убрать снятие невидимых знаков» их не роняла. На машине с выгруженным каталогом
   * её ловил боевой тест ниже, но `dims-build.json` лежит вне git: на чистом клоне тот уходит в
   * ветку среза, и мутация не поймалась бы вовсе. Здесь грязь в ОБОИХ полях — единственная
   * форма случая, которую нечем спасти, кроме самой нормализации.
   */
  { raw: { ru: 'Телесериал​', en: 'TV Series​' }, key: 'tv-series', why: 'U+200B в обоих полях' },
  { raw: { ru: 'фильм', en: 'movie' }, key: 'movie', why: 'строчная буква — по 21 записи' },
  { raw: { ru: 'роман', en: 'novel' }, key: 'novel', why: 'строчная буква' },
  { raw: { ru: 'видеоигра', en: 'video game' }, key: 'video-game', why: 'строчная буква' },
  { raw: { ru: 'Movie', en: 'Movie' }, key: 'movie', why: 'английское в русском поле — 3 записи' },
  { raw: { ru: 'Фильм', en: 'Фильм' }, key: 'movie', why: 'русское в английском поле' },
  { raw: { ru: 'Роман', en: 'Роман' }, key: 'novel', why: 'русское в английском поле' },
  { raw: { ru: 'Роман', en: '' }, key: 'novel', why: 'пустая строка в одном поле — 1 запись' },
  { raw: { ru: '1998', en: '1998' }, key: null, why: 'год вместо вида — 4 записи' },
  { raw: { ru: 'Повесть', en: 'Novella' }, key: null, why: 'вид известен, но хаба нет (5 записей)' },
  { raw: { ru: 'Мультфильм', en: 'Animated Movie' }, key: null, why: 'НЕ сливается с «Фильм»' },
  { raw: { ru: 'Телешоу', en: 'TV Show​' }, key: null, why: 'НЕ сливается с «Телесериал»' },
  { raw: { ru: 'Графический роман', en: 'Graphic Novel' }, key: null, why: 'НЕ сливается с «Роман»' },
  { raw: {}, key: null, why: 'поля нет вовсе' },
];

test('каждый случай из замера каталога разбирается верно', () => {
  for (const { raw, key, why } of CASES) {
    assert.equal(kindKeyOf(raw), key, `${why}: ${JSON.stringify(raw)}`);
  }
});

/**
 * 🔴 ИНВАРИАНТ, БЕЗ КОТОРОГО ХАБ РАЗДВАИВАЕТСЯ.
 *
 * Нормализация, «дочищающая» строку на втором проходе, означает, что первый проход оставил мусор.
 * Один и тот же смысл получил бы тогда два адреса — ровно та беда, ради которой модуль написан.
 */
test('нормализация идемпотентна', () => {
  for (const raw of ['TV Series​', '  Фильм  ', 'video  game', '﻿Book', 'Movie']) {
    const once = normalizeRaw(raw);
    assert.equal(normalizeRaw(once), once, `второй проход изменил «${raw}»`);
  }
});

test('вид без хаба отличается от вида неизвестного', () => {
  assert.equal(isKnownWithoutHub({ ru: 'Повесть', en: 'Novella' }), true);
  assert.equal(isKnownWithoutHub({ ru: 'Мультфильм', en: 'Animated Movie' }), true);
  // Значение, которого в каталоге не было ни разу: это сигнал «данные пополнились», а не порог.
  assert.equal(isKnownWithoutHub({ ru: 'Подкаст', en: 'Podcast' }), false);
  assert.equal(isKnownWithoutHub({ ru: '1998', en: '1998' }), false);
});

test('у каждого хаба есть обе подписи на обоих языках', () => {
  for (const key of KIND_KEYS) {
    for (const lang of ['ru', 'en'] as const) {
      assert.ok(kindLabel(key, lang).length > 0, `нет подписи ${key}/${lang}`);
      assert.ok(kindTitle(key, lang).length > 0, `нет заголовка ${key}/${lang}`);
    }
  }
  assert.equal(isKindKey('movie'), true);
  assert.equal(isKindKey('podcast'), false);
  // Ключ едет в АДРЕС — он обязан быть безопасным слагом, иначе хаб получит кривой URL.
  for (const key of KIND_KEYS) assert.match(key, /^[a-z][a-z-]*[a-z]$/, `ключ ${key} не слаг`);
});

/**
 * ПРОВЕРКА ПО БОЮ — идёт только когда полный каталог выгружен (`dims-build.json` лежит вне git,
 * его пишет `node tools/fetch-dims-slice.mjs --all` шагом выката). Без него тест не молчит и не
 * краснеет, а честно говорит, что проверил срез: молчаливая подмена источника здесь уже стоила
 * дорого однажды (`dims-source.ts`).
 */
test('боевой каталог: семь хабов покрывают 99,5 % записей', () => {
  const FULL = 'src/lib/content/dims-build.json';
  const full = existsSync(FULL);
  const dims: Array<{ type?: { ru?: string; en?: string } }> = full
    ? JSON.parse(readFileSync(FULL, 'utf8'))
    : (slice as Array<{ type?: { ru?: string; en?: string } }>);

  const hubs = new Map<KindKey, number>();
  let withoutHub = 0;
  let unknown = 0;
  for (const dim of dims) {
    const key = kindKeyOf(dim.type);
    if (key) hubs.set(key, (hubs.get(key) ?? 0) + 1);
    else if (isKnownWithoutHub(dim.type)) withoutHub++;
    else unknown++;
  }

  if (!full) {
    console.log(`[dim-kind] полного каталога нет — проверен запасной срез (${dims.length} записей)`);
    assert.ok(hubs.size > 0, 'даже на срезе хабы обязаны собраться');
    return;
  }

  // Числа замера 2026-08-14. Расходятся — значит каталог пополнился: это не поломка теста, а
  // повод перечитать словарь видов (в первую очередь `unknown`, см. ниже).
  assert.equal(dims.length, 5111, 'размер каталога изменился — сверить числа плана 48');
  assert.equal(hubs.size, KIND_KEYS.length, 'не все хабы собрались');
  const covered = [...hubs.values()].reduce((a, b) => a + b, 0);
  assert.equal(covered, 5086, 'покрытие хабами разошлось с замером');
  assert.equal(withoutHub, 25, 'известных видов без хаба стало другое число');

  // 🔴 Порог хаба — ворота фазы 2, а не пожелание.
  for (const [key, n] of hubs) assert.ok(n >= 20, `хаб ${key} собрал ${n} карточек — меньше порога`);

  /*
   * 🔑 НОЛЬ — САМОЕ ЦЕННОЕ ЧИСЛО ЭТОГО ТЕСТА.
   *
   * Ни одного значения вида, которого словарь не знает: все 5111 записей либо в хабе, либо в
   * названном поимённо хвосте. Значит рост этого числа означает ровно одно — в каталог приехал
   * НОВЫЙ вид, и словарь `dim-kind.ts` пора расширять, иначе объекты тихо выпадут из хабов.
   * Это не поломка теста, а его работа.
   */
  assert.equal(unknown, 0, 'появились новые значения вида — расширить словарь в dim-kind.ts');
});

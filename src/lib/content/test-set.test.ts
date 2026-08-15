/**
 * ТЕСТЫ НАБОРА ДВИЖКА ТЕСТ (`plans/42`, шаг 3, такт Б).
 *
 * Главное, что стерегут: ДЕТЕРМИНИЗМ (пререндер и гидратация, оба человека пары — одна
 * очередь) и согласие длин набора с числами, обещанными текстами страниц.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildTestQueue,
  kindLabelFor,
  queueLengthFor,
  rowLabel,
  TEST_TARGET,
  QUEUE_RESERVE,
  RATED_FACT_FROM,
} from './test-set.ts';
import { TESTS, TEST_SLUGS } from './test-copy.ts';
import type { DimPage } from './dims-source.ts';
// Запасной срез каталога (лежит в git) — тот же файл, на котором собирается сайт без боевой
// выгрузки; `dims-source.ts` сюда не импортируется (import.meta.glob не живёт под node --test).
import slice from './dims-slice.json' with { type: 'json' };

const dim = (id: string, rates: number, over: Partial<DimPage> = {}): DimPage => ({
  id,
  slug: id,
  title: { ru: `«${id}»`, en: id },
  description: { ru: '', en: '' },
  type: { ru: 'Фильм', en: 'Movie' },
  author: { ru: '', en: '' },
  year: '2000',
  tags: [],
  rates,
  rating: 5,
  ...over,
});

test('очередь детерминирована: rates ↓, при равенстве id ↑', () => {
  const pool = [dim('b', 5), dim('a', 5), dim('c', 9), dim('d', 1)];
  const twice = [buildTestQueue(pool, 4), buildTestQueue([...pool].reverse(), 4)];
  for (const queue of twice) {
    assert.deepEqual(queue.map((e) => e.id), ['c', 'a', 'b', 'd']);
  }
});

test('карточка без имени на одном из языков или без вида в очередь не попадает', () => {
  const pool = [
    dim('named', 9),
    dim('no-en', 9, { title: { ru: '«Есть»', en: '  ' } }),
    dim('no-kind', 9, { type: { ru: '', en: '' } }),
  ];
  assert.deepEqual(buildTestQueue(pool, 3).map((e) => e.id), ['named']);
});

test('год «-» каталога означает «неизвестен» и в карточку не течёт', () => {
  const [entry] = buildTestQueue([dim('x', 1, { year: '-' })], 1);
  assert.equal(entry.year, '');
});

test('длины набора совпадают с числами, обещанными текстами страниц', () => {
  // Числа «12 вещей» / «7 вещей» стоят в строках фактов и шагов обеих локалей —
  // разъехавшаяся константа сделала бы обещание страницы неправдой.
  for (const slug of TEST_SLUGS) {
    const target = String(TEST_TARGET[slug]);
    for (const lang of ['ru', 'en'] as const) {
      const copy = TESTS[slug][lang];
      const promised = [copy.facts.join(' '), ...copy.steps.map((s) => `${s.lead} ${s.rest}`)].join(' ');
      assert.ok(
        promised.includes(target),
        `${slug}/${lang}: тексты не называют длину набора ${target}`,
      );
    }
  }
});

test('очередь обёртки несёт запас под пропуски поверх длины набора', () => {
  for (const slug of TEST_SLUGS) {
    const queue = buildTestQueue(slice as DimPage[], queueLengthFor(slug));
    // На запасном срезе (50 записей в git) часть может отсеяться фильтром — но очередь
    // обязана быть строго длиннее набора, иначе первый же пропуск оборвал бы тест.
    assert.ok(queue.length > TEST_TARGET[slug], `${slug}: очередь ${queue.length} не длиннее набора`);
    assert.ok(queue.length <= TEST_TARGET[slug] + QUEUE_RESERVE);
  }
});

test('порог факта «оценили ещё N» — три (№021 В1), и он строже правила каталога', () => {
  assert.equal(RATED_FACT_FROM, 3);
});

// ── Подпись строки: различитель одноимённых вещей (bugs/126, интервью №032 В1 = В) ─────────

test('🔑 одноимённые вещи в строке РАЗЛИЧИМЫ: имя · вид, год', () => {
  const film = rowLabel({ name: 'Гарри Поттер и философский камень', kind: 'Фильм', year: '2001' });
  const novel = rowLabel({ name: 'Гарри Поттер и философский камень', kind: 'Роман', year: '1997' });
  assert.notEqual(film, novel, 'две разные вещи обязаны читаться по-разному');
  assert.equal(film, 'Гарри Поттер и философский камень · Фильм, 2001');
  assert.equal(novel, 'Гарри Поттер и философский камень · Роман, 1997');
});

test('имя НЕ обрезается и не сокращается — закон владельца от 2026-08-14', () => {
  const long = 'Пираты Карибского моря: На краю света';
  const label = rowLabel({ name: long, kind: 'Фильм', year: '2007' });
  assert.ok(label.startsWith(long), 'имя обязано стоять целиком и первым');
  assert.ok(!label.includes('…'), 'многоточия в имени быть не может');
});

test('без года — только вид, без висящей запятой; без обоих — голое имя', () => {
  assert.equal(rowLabel({ name: 'Секс', kind: 'Практика', year: '' }), 'Секс · Практика');
  assert.equal(rowLabel({ name: 'Секс', kind: '', year: '' }), 'Секс');
  assert.equal(rowLabel({ name: 'Нечто', kind: '', year: '1999' }), 'Нечто · 1999');
});

test('🔑 вид приводится к канону: грязь каталога на лицо не выходит', () => {
  // Замер `plans/48` шаг 0: регистр вразнобой и невидимый U+200B в 44 записях.
  assert.equal(kindLabelFor({ ru: 'фильм', en: 'movie' }, 'ru'), 'Фильм');
  assert.equal(kindLabelFor({ ru: 'Телесериал​', en: 'TV Series​' }, 'en'), 'TV series');
  // Язык не в своём поле (5 записей) — вид всё равно известен точно.
  assert.equal(kindLabelFor({ ru: 'Movie', en: 'Movie' }, 'ru'), 'Фильм');
});

test('вид, которого нет в словаре, получает подпись, но НЕ выдуманный вид', () => {
  // «Повесть» романом не становится (граница `dim-kind.ts`) — но и без подписи не остаётся.
  assert.equal(kindLabelFor({ ru: 'повесть', en: 'novella' }, 'ru'), 'Повесть');
  // Год, попавший в поле вида (4 записи), — это не вид: подписи нет вовсе.
  assert.equal(kindLabelFor({ ru: '1998', en: '1998' }, 'ru'), '');
});

test('подпись строится на ОБОИХ языках из одного каталога', () => {
  const [entry] = buildTestQueue(slice as DimPage[], 1);
  for (const lang of ['ru', 'en'] as const) {
    const label = rowLabel({ name: entry.name[lang], kind: kindLabelFor(entry.kind, lang), year: entry.year });
    assert.ok(label.includes(entry.name[lang]), `${lang}: имя обязано остаться в подписи целиком`);
  }
});

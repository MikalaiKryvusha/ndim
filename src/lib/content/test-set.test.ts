/**
 * ТЕСТЫ НАБОРА ДВИЖКА ТЕСТ (`plans/42`, шаг 3, такт Б).
 *
 * Главное, что стерегут: ДЕТЕРМИНИЗМ (пререндер и гидратация, оба человека пары — одна
 * очередь) и согласие длин набора с числами, обещанными текстами страниц.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildTestQueue, queueLengthFor, TEST_TARGET, QUEUE_RESERVE, RATED_FACT_FROM } from './test-set.ts';
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

/**
 * Тест на совместимость новой V1 — проверка вычисляемой части (`plans/106` Д3, Д5, Д6).
 *
 * Стережём ровно то, что уезжает к человеку и в его NDim ID: жест звезды, отсутствие нулей в записи,
 * порядок переноса, потолок ожидания записи и проигрывание касаний, сделанных до гидратации.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyStar, carryRatings, rankedRelations, ratingsToCarry, replayQueue } from './compat-demo.ts';
import { DEMO_ITEMS, DEMO_PERSONAS } from '../content/landing-demo.ts';

const [HP, , MATRIX, , TITANIC, GOT] = DEMO_ITEMS.map((d) => d.id);

test('звезда ставит оценку, повторное касание той же звезды СНИМАЕТ её — нуля в записи нет', () => {
  const one = applyStar({}, MATRIX, 8);
  assert.deepEqual(one, { [MATRIX]: 8 });
  const changed = applyStar(one, MATRIX, 3);
  assert.deepEqual(changed, { [MATRIX]: 3 });
  const cleared = applyStar(changed, MATRIX, 3);
  assert.deepEqual(cleared, {});
  assert.equal(MATRIX in cleared, false, 'снятая оценка не должна жить нулём: ядро посчитало бы её измерением');
});

test('без единой оценки связи нет ни с кем — поп-апу нечего назвать', () => {
  const ranked = rankedRelations({});
  assert.equal(ranked.length, DEMO_PERSONAS.length);
  assert.ok(ranked.every((x) => x.r === null));
});

test('Общность работает: одна оценка «Матрице» ставит первым Макса, который оценил меньше всех', () => {
  // Макс оценил 5 объектов из 10, Алиса и Настя — все 10: при одном общем объекте Общность Макса выше.
  const ranked = rankedRelations({ [MATRIX]: 9 });
  assert.equal(ranked[0].persona.id, 'max');
});

test('картина ЕДЕТ ЗА ОЦЕНКАМИ: любовь к «Титанику» и «Игре Престолов» выводит вперёд Настю', () => {
  const ranked = rankedRelations({ [TITANIC]: 10, [GOT]: 10, [HP]: 5, [MATRIX]: 3 });
  assert.equal(ranked[0].persona.id, 'nastya');
  assert.ok((ranked[0].r?.similarity ?? 0) > (ranked[2].r?.similarity ?? 0));
});

test('в NDim ID уезжают ровно поставленные оценки, в порядке списка демо', () => {
  const mine = applyStar(applyStar({}, TITANIC, 7), HP, 10);
  assert.deepEqual(ratingsToCarry(mine), [
    [HP, 10],
    [TITANIC, 7],
  ]);
  assert.deepEqual(ratingsToCarry({}), []);
});

test('перенос: первая оценка пишется ОДНА (она рождает гостя), остальные — после неё', async () => {
  const log: string[] = [];
  let firstDone = false;
  const save = async (id: string) => {
    if (log.length > 0) assert.ok(firstDone, 'вторая запись стартовала раньше, чем первая завершилась');
    log.push(id);
    await new Promise((r) => setTimeout(r, 5));
    if (log.length === 1) firstDone = true;
  };
  const saved = await carryRatings([[HP, 10], [MATRIX, 8], [GOT, 6]], save, 1000);
  assert.equal(saved, 3);
  assert.equal(log[0], HP);
});

test('перенос не запирает человека: зависшая сеть отпускает мост по потолку', async () => {
  const hang = () => new Promise(() => {});
  const started = Date.now();
  const saved = await carryRatings([[HP, 10]], hang, 50);
  assert.equal(saved, 0);
  assert.ok(Date.now() - started < 1000);
});

test('перенос не роняет мост на ошибке сети — возвращает, сколько записано', async () => {
  const save = async (id: string) => {
    if (id === MATRIX) throw new Error('сеть');
  };
  assert.equal(await carryRatings([[HP, 10], [MATRIX, 8], [GOT, 6]], save, 1000), 2);
  assert.equal(await carryRatings([], save, 1000), 0);
});

test('касания до гидратации проигрываются теми же жестами; чужие id и мусор отбрасываются', () => {
  const mine = replayQueue({}, [
    [MATRIX, 8],
    [HP, 10],
    [HP, 10], // повторное касание той же звезды — оценка снята
    ['чужой-id', 5],
    [GOT, 11],
    [TITANIC, 0],
  ]);
  assert.deepEqual(mine, { [MATRIX]: 8 });
});

/**
 * Статистика собственного NDim ID (bugs/43).
 *
 * Проверяются ровно те места, где легко соврать и где враньё заметит человек: ГРАНИЦЫ шкалы
 * («ровно 10 измерений» — это ещё «очень мало» или уже «мало»?) и ГРАНИЦЫ полос похожести
 * (89 против 90). Пороги 1.x прибиты литералами: тест, читающий ту же константу, что и код,
 * слеп к её изменению (EXP-0013).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dimsScaleStep, needsDimsInstruction, relationBands } from './ndimid.ts';

test('шкала измерений: каждая ступень 1.x на своём месте', () => {
  assert.equal(dimsScaleStep(0), 'veryLittle');
  assert.equal(dimsScaleStep(9), 'veryLittle');
  assert.equal(dimsScaleStep(10), 'little', '10 — это уже «мало», а не «очень мало»');
  assert.equal(dimsScaleStep(24), 'little');
  assert.equal(dimsScaleStep(25), 'medium');
  assert.equal(dimsScaleStep(49), 'medium');
  assert.equal(dimsScaleStep(50), 'aLot');
  assert.equal(dimsScaleStep(99), 'aLot');
  assert.equal(dimsScaleStep(100), 'veryMuch');
  assert.equal(dimsScaleStep(199), 'veryMuch');
  assert.equal(dimsScaleStep(200), 'great');
  assert.equal(dimsScaleStep(399), 'great');
  assert.equal(dimsScaleStep(400), 'wow', '≥400 — «Ого!»');
  assert.equal(dimsScaleStep(5112), 'wow');
});

test('инструкция о добавлении измерений — только на нижней ступени (как в 1.x)', () => {
  assert.equal(needsDimsInstruction(0), true);
  assert.equal(needsDimsInstruction(9), true);
  assert.equal(needsDimsInstruction(10), false, 'на «мало» инструкция уже не всплывала');
  assert.equal(needsDimsInstruction(485), false);
});

test('полосы связей: границы 90 / 75 / 50 не съезжают', () => {
  const bands = relationBands([100, 90, 89, 75, 74, 50, 49, 0]);

  assert.equal(bands.total, 8);
  assert.equal(bands.top90, 2, '100 и 90');
  assert.equal(bands.band75, 2, '89 и 75');
  assert.equal(bands.band50, 2, '74 и 50');
});

test('полосы не перекрываются: одна связь считается ровно один раз', () => {
  const bands = relationBands([95, 80, 60]);

  assert.equal(bands.top90 + bands.band75 + bands.band50, 3);
  assert.equal(bands.top90, 1);
  assert.equal(bands.band75, 1);
  assert.equal(bands.band50, 1);
});

test('слабые связи существуют, но в полосы не попадают — сумма меньше общего числа', () => {
  const bands = relationBands([95, 12, 3]);

  assert.equal(bands.total, 3);
  assert.equal(bands.top90 + bands.band75 + bands.band50, 1);
});

test('связей нет — все полосы нули, а не пустота', () => {
  assert.deepEqual(relationBands([]), { total: 0, top90: 0, band75: 0, band50: 0 });
});

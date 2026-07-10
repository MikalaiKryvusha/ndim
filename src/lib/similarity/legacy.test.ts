/**
 * Тесты расшифровки связей версии 1.x.
 *
 * Цена ошибки здесь — испорченная миграция боевых данных. Проверяем, что матрица
 * соответствия `a…t` применяется правильно и что декодирование обратимо.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { computeRelation, type UserDims } from './similarity.ts';
import {
  decodeLegacyRelation,
  encodeLegacyRelation,
  LEGACY_FIELD_MAP,
  type LegacyRelation,
} from './legacy.ts';

/** Реалистичный документ 1.x: владелец с 3 осями, гость с 2, одна общая. */
const legacySample: LegacyRelation = {
  a: 4, // combinedSpaceSize
  b: 1, // commonSpaceSize
  c: 2, // guestSpaceSize
  d: 2, // distance
  e: 'guest-uid-123',
  f: 'guest@example.com',
  g: 85, // proximity
  h: 40, // commonality
  i: 34, // similarity
  k: 0.67, // guestSpaceSizeRateOfOwner
  l: 14.1, // guestSpaceDiameter
  m: 17.3, // ownerSpaceDiameter
  n: 0.82, // guestSpaceDiameterRateOfOwner
  o: 0.33, // commonSpaceSizeRateOfOwner
  p: 0.5, // commonSpaceSizeRateOfGuest
  q: 10, // commonSpaceDiameter
  r: 0.58, // commonSpaceDiameterRateOfOwner
  s: 0.71, // commonSpaceDiameterRateOfGuest
  t: 20, // distanceRateOfCommonSpaceDiameter
};

describe('decodeLegacyRelation — матрица соответствия a…t', () => {
  test('главные величины читаются из правильных букв', () => {
    const { relation } = decodeLegacyRelation(legacySample);

    assert.equal(relation.similarity, legacySample.i, 'similarity лежит в i, не в s');
    assert.equal(relation.proximity, legacySample.g);
    assert.equal(relation.commonality, legacySample.h);
    assert.equal(relation.distance, legacySample.d);
  });

  test('персональные данные гостя отделены от метрик', () => {
    const decoded = decodeLegacyRelation(legacySample);

    assert.equal(decoded.guestUid, 'guest-uid-123');
    assert.equal(decoded.guestEmail, 'guest@example.com');
    // В самих метриках ПДн быть не должно — это дефект модели 1.x, который мы не тащим дальше.
    assert.equal('guestEmail' in decoded.relation, false);
    assert.equal('guestUid' in decoded.relation, false);
  });

  test('ownerSpaceSize восстанавливается: combined = owner + guest − common', () => {
    const { relation } = decodeLegacyRelation(legacySample);
    // a = 4, c = 2, b = 1 → owner = 4 − 2 + 1 = 3
    assert.equal(relation.ownerSpaceSize, 3);
    assert.equal(
      relation.combinedSpaceSize,
      relation.ownerSpaceSize + relation.guestSpaceSize - relation.commonSpaceSize,
    );
  });

  test('буквы j в матрице нет — она пропущена в оригинале', () => {
    assert.equal('j' in LEGACY_FIELD_MAP, false);
  });

  test('матрица покрывает 17 метрик (без e и f — это ПДн)', () => {
    assert.equal(Object.keys(LEGACY_FIELD_MAP).length, 17);
  });
});

describe('Обратимость: encode(decode(x)) === x', () => {
  test('на реалистичном документе', () => {
    const { relation, guestUid, guestEmail } = decodeLegacyRelation(legacySample);
    const reencoded = encodeLegacyRelation(relation, guestUid, guestEmail);

    assert.deepEqual(reencoded, legacySample);
  });

  test('на связи, посчитанной новым ядром', () => {
    const owner: UserDims = { calm: 7, early: 3, books: 10 };
    const guest: UserDims = { calm: 5, books: 9, coffee: 2 };

    const relation = computeRelation(owner, guest);
    assert.notEqual(relation, null);

    const encoded = encodeLegacyRelation(relation!, 'uid', 'mail@example.com');
    const { relation: roundTripped } = decodeLegacyRelation(encoded);

    assert.deepEqual(roundTripped, relation);
  });
});

describe('Числовой паритет с версией 1.x', () => {
  test('связь считается по тем же формулам и округлениям', () => {
    // Владелец: 3 оси. Гость: 3 оси. Общих: 2 (calm, books).
    const owner: UserDims = { calm: 7, early: 3, books: 10 };
    const guest: UserDims = { calm: 5, books: 9, coffee: 2 };

    const r = computeRelation(owner, guest)!;

    // d = √((7−5)² + (10−9)²) = √5 = 2.236068
    assert.equal(r.distance, 2.24);

    // D_common = √2 · 10 = 14.142136 (НЕокруглённый — так в 1.x)
    // proximity = 1 − (2.236068 / 14.142136)^0.7 = 1 − 0.158114^0.7 = 0.725034 → 73
    assert.equal(r.proximity, 73);

    // commonality = 2·2 / (3 + 3) = 0.666667 → 67
    assert.equal(r.commonality, 67);

    // similarity = 0.725034 × 0.666667 = 0.483356 → 48
    assert.equal(r.similarity, 48);

    // Диаметры округляются до одного знака.
    assert.equal(r.ownerSpaceDiameter, 17.3); // √3 · 10 = 17.320508…
    assert.equal(r.guestSpaceDiameter, 17.3);
    assert.equal(r.commonSpaceDiameter, 14.1); // √2 · 10 = 14.142136…

    // distanceRateOf… считается от ОКРУГЛЁННОГО диаметра и НЕокруглённого расстояния — паритет 1.x.
    // 2.236068 / 14.1 · 100 = 15.858… → 16
    assert.equal(r.distanceRateOfCommonSpaceDiameter, 16);
  });

  test('similarity считается на долях до округления, а не как произведение процентов', () => {
    const r = computeRelation({ calm: 7, early: 3, books: 10 }, { calm: 5, books: 9, coffee: 2 })!;

    // Правильно: округляется произведение долей.  0.725034 × 0.666667 = 0.483356 → 48
    assert.equal(r.similarity, 48);

    // Наивно: перемножить уже округлённые проценты.  73 × 67 / 100 = 48.91 → 49
    const naiveFromPercents = Math.round((r.proximity * r.commonality) / 100);
    assert.equal(naiveFromPercents, 49);

    // Разница в 1 процентный пункт — на ней ломается паритет с боевыми данными 1.x.
    // Этот тест существует, чтобы такой рефакторинг не прошёл молча.
    assert.notEqual(
      r.similarity,
      naiveFromPercents,
      'нельзя считать похожесть из округлённых процентов',
    );
  });
});

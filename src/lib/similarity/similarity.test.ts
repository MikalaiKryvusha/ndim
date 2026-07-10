/**
 * Тесты математического ядра.
 *
 * Это первый испытательный стенд проекта. Версия 1.x была хрупкой именно потому, что
 * проверялась глазами в браузере. Здесь корректность проверяется числами.
 *
 * Инварианты взяты из PROJECT_ARCHITECTURE_INTERNAL_MAP.md → «Инварианты и законы модели».
 * Запуск: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeRelation,
  spaceDiameter,
  MAX_RATING,
  PROXIMITY_EXPONENT,
  type UserDims,
} from './similarity.ts';

/** Удобный помощник: посчитать связь и упасть, если её нет. */
const relate = (owner: UserDims, guest: UserDims) => {
  const relation = computeRelation(owner, guest);
  assert.notEqual(relation, null, 'ожидалась связь, а её нет');
  return relation!;
};

describe('spaceDiameter — диагональ N-мерного куба со стороной 10', () => {
  test('одна ось: диаметр равен стороне', () => {
    assert.equal(spaceDiameter(1), MAX_RATING);
  });

  test('четыре оси: √4 · 10 = 20', () => {
    assert.equal(spaceDiameter(4), 20);
  });

  test('растёт как корень из числа осей, а не линейно', () => {
    // Иначе люди с большим числом общих осей автоматически считались бы «дальше».
    assert.ok(spaceDiameter(100) < spaceDiameter(1) * 100);
    assert.equal(spaceDiameter(100), 100);
  });
});

describe('Инвариант: нет общих осей — нет связи', () => {
  test('непересекающиеся пространства дают null', () => {
    assert.equal(computeRelation({ a: 5, b: 5 }, { c: 5, d: 5 }), null);
  });

  test('пустое пространство владельца даёт null', () => {
    assert.equal(computeRelation({}, { a: 5 }), null);
  });

  test('пустое пространство гостя даёт null', () => {
    assert.equal(computeRelation({ a: 5 }, {}), null);
  });

  test('отсутствующая координата НЕ додумывается нулём', () => {
    // Если бы недостающая ось подставлялась нулём, связь бы посчиталась. Она не должна.
    assert.equal(computeRelation({ a: 0 }, { b: 0 }), null);
  });
});

describe('Инвариант: человек сам с собой — похожесть 100', () => {
  test('тождество даёт similarity = proximity = commonality = 100, distance = 0', () => {
    const me: UserDims = { calm: 7, early: 3, books: 10 };
    const r = relate(me, me);

    assert.equal(r.distance, 0);
    assert.equal(r.proximity, 100);
    assert.equal(r.commonality, 100);
    assert.equal(r.similarity, 100);
  });

  test('используется для расчёта метрик собственного пространства', () => {
    const me: UserDims = { a: 1, b: 2, c: 3, d: 4 };
    const r = relate(me, me);

    assert.equal(r.commonSpaceSize, 4);
    assert.equal(r.ownerSpaceSize, 4);
    assert.equal(r.guestSpaceSize, 4);
    assert.equal(r.combinedSpaceSize, 4);
    assert.equal(r.commonSpaceDiameter, 20); // √4 · 10
  });
});

describe('Инвариант: максимальное расстояние даёт похожесть 0', () => {
  test('противоположные точки по всем общим осям: distance = диаметр → proximity = 0', () => {
    const owner: UserDims = { a: 0, b: 0 };
    const guest: UserDims = { a: 10, b: 10 };
    const r = relate(owner, guest);

    // d = √(100 + 100) = √200 ≈ 14.14 ; D = √2 · 10 ≈ 14.14 → d/D = 1 → 1 − 1^0.7 = 0
    assert.equal(r.proximity, 0);
    assert.equal(r.similarity, 0);
    assert.equal(r.distanceRateOfCommonSpaceDiameter, 100);
  });

  test('общность при этом остаётся полной — обнуляет именно близость', () => {
    const r = relate({ a: 0, b: 0 }, { a: 10, b: 10 });
    assert.equal(r.commonality, 100);
    assert.equal(r.similarity, 0); // 100% общности × 0% близости = 0
  });
});

describe('Инвариант: similarity = proximity × commonality', () => {
  test('ни один множитель не компенсирует другой', () => {
    // Полное совпадение по 2 общим осям, но у гостя есть третья своя ось.
    // proximity = 1 ; commonality = 2·2/(2+3) = 0.8 → similarity = 80
    const r = relate({ a: 5, b: 5 }, { a: 5, b: 5, c: 1 });

    assert.equal(r.proximity, 100);
    assert.equal(r.commonality, 80);
    assert.equal(r.similarity, 80);
  });

  test('нулевая общность недостижима при наличии общей оси, но близость её не спасает', () => {
    // Идеальное совпадение по единственной общей оси из 100 — случайность, а не похожесть.
    const owner: UserDims = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`owner_${i}`, 5]),
    );
    const guest: UserDims = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`guest_${i}`, 5]),
    );
    const shared = { shared: 5 };

    const r = relate({ ...owner, ...shared }, { ...guest, ...shared });

    assert.equal(r.proximity, 100, 'по общей оси совпадение идеальное');
    // commonality = 2·1/(51+51) = 0.0196… → 2%
    assert.equal(r.commonality, 2);
    assert.equal(r.similarity, 2, 'Дайс наказывает за узкое пересечение');
  });
});

describe('Инвариант: симметрия', () => {
  const owner: UserDims = { a: 2, b: 9, c: 4 };
  const guest: UserDims = { a: 7, b: 1, d: 6 };

  test('главные величины не зависят от того, кто владелец', () => {
    const forward = relate(owner, guest);
    const backward = relate(guest, owner);

    assert.equal(forward.similarity, backward.similarity);
    assert.equal(forward.proximity, backward.proximity);
    assert.equal(forward.commonality, backward.commonality);
    assert.equal(forward.distance, backward.distance);
    assert.equal(forward.commonSpaceSize, backward.commonSpaceSize);
    assert.equal(forward.combinedSpaceSize, backward.combinedSpaceSize);
  });

  test('величины, нормированные «по владельцу», симметричными быть не обязаны', () => {
    const forward = relate(owner, guest);
    const backward = relate(guest, owner);

    // owner: 3 оси, guest: 3 оси — здесь совпадут; берём асимметричный случай:
    const wide = relate({ a: 5 }, { a: 5, b: 5, c: 5 });
    assert.equal(wide.guestSpaceSizeRateOfOwner, 3); // 3 / 1

    const narrow = relate({ a: 5, b: 5, c: 5 }, { a: 5 });
    assert.equal(narrow.guestSpaceSizeRateOfOwner, 0.33); // 1 / 3, округлено до 2 знаков

    assert.equal(forward.ownerSpaceSize, backward.guestSpaceSize);
  });
});

describe('Порядок осей и их количество', () => {
  test('порядок ключей не влияет на результат', () => {
    const a = relate({ x: 1, y: 2, z: 3 }, { z: 3, y: 2, x: 1 });
    const b = relate({ z: 3, x: 1, y: 2 }, { y: 2, x: 1, z: 3 });
    assert.deepEqual(a, b);
  });

  test('combinedSpaceSize = |владелец| + |гость| − |общие|', () => {
    const r = relate({ a: 1, b: 1, c: 1 }, { c: 1, d: 1 });
    assert.equal(r.ownerSpaceSize, 3);
    assert.equal(r.guestSpaceSize, 2);
    assert.equal(r.commonSpaceSize, 1);
    assert.equal(r.combinedSpaceSize, 4);
  });
});

describe('Чувствительность близости (показатель 0.7)', () => {
  test('показатель < 1 поднимает близость выше линейной на малых расстояниях', () => {
    // Одна общая ось, разница 1 балл. D = 10, d = 1.
    const r = relate({ a: 5 }, { a: 6 });

    const linear = 1 - 1 / 10; // 0.90 → 90%
    const actual = 1 - Math.pow(1 / 10, PROXIMITY_EXPONENT); // ≈ 0.8005 → 80%

    assert.ok(actual < linear, 'на малом расстоянии формула строже линейной');
    assert.equal(r.proximity, Math.round(actual * 100));
    assert.equal(r.proximity, 80);
  });

  test('близость монотонно убывает с ростом расстояния', () => {
    const proximities = [0, 2, 4, 6, 8, 10].map((v) => relate({ a: 0 }, { a: v }).proximity);
    for (let i = 1; i < proximities.length; i++) {
      assert.ok(
        proximities[i] < proximities[i - 1],
        `близость должна убывать: ${proximities.join(' → ')}`,
      );
    }
    assert.equal(proximities[0], 100); // совпадение
    assert.equal(proximities.at(-1), 0); // максимальное расхождение
  });
});

describe('Границы величин', () => {
  test('все проценты лежат в 0…100 на случайных входах', () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let iteration = 0; iteration < 500; iteration++) {
      const axesCount = 1 + Math.floor(random() * 8);
      const owner: Record<string, number> = {};
      const guest: Record<string, number> = {};
      for (let i = 0; i < axesCount; i++) {
        owner[`axis_${i}`] = Math.floor(random() * (MAX_RATING + 1));
        guest[`axis_${i}`] = Math.floor(random() * (MAX_RATING + 1));
      }
      if (random() > 0.5) guest[`guest_only`] = 3;

      const r = relate(owner, guest);
      for (const key of ['similarity', 'proximity', 'commonality'] as const) {
        assert.ok(
          r[key] >= 0 && r[key] <= 100,
          `${key} = ${r[key]} вышло за границы 0…100`,
        );
      }
      assert.ok(r.distance >= 0);
    }
  });
});

/**
 * Тесты механизма видимости профиля.
 *
 * Здесь проверяется не удобство, а **приватность людей**. Firestore правилами стережёт документы,
 * но правильность раскладки свойств по документам не проверяет никто, кроме этого модуля.
 * Ошибка тут = чужой человек видит твою дату рождения.
 *
 * Запуск: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  EVERYONE,
  PRIVATE,
  FRIENDS,
  MAX_CUSTOM_CIRCLES,
  BucketConflictError,
  InvalidAudienceError,
  assertValidAudience,
  bucketsForAudience,
  distribute,
  mergeBuckets,
  extraBucketsFor,
  readableBuckets,
  visibleTo,
  type ProfileValues,
  type VisibilityMap,
  type Viewer,
} from './visibility.ts';

/** Полный профиль для примеров. */
const profile: ProfileValues = {
  name: { first: { ru: 'Николай', en: 'Mikalai' } },
  born: { year: 1985, month: 4, day: 12 },
  about: { ru: 'Люблю тишину', en: 'I love silence' },
  avatar: true,
  gender: 'm',
};

const stranger: Viewer = { isFriend: false, circles: [] };
const friend: Viewer = { isFriend: true, circles: [] };
const colleague: Viewer = { isFriend: false, circles: ['c_work'] };

describe('bucketsForAudience — куда физически кладётся свойство', () => {
  test('«всем» → единственный публичный бакет', () => {
    assert.deepEqual(bucketsForAudience(EVERYONE), [EVERYONE]);
  });

  test('пустой набор кругов означает «никому» → приватный бакет', () => {
    assert.deepEqual(bucketsForAudience([]), [PRIVATE]);
  });

  test('один круг → один бакет', () => {
    assert.deepEqual(bucketsForAudience([FRIENDS]), [FRIENDS]);
  });

  test('несколько кругов → свойство ДУБЛИРУЕТСЯ в каждый', () => {
    // Зритель может состоять только в одном из кругов и обязан увидеть свойство.
    assert.deepEqual(bucketsForAudience([FRIENDS, 'c_work']), [FRIENDS, 'c_work']);
  });
});

describe('Валидация аудитории', () => {
  test('кругом нельзя назваться служебным именем бакета', () => {
    assert.throws(() => assertValidAudience([EVERYONE]), InvalidAudienceError);
    assert.throws(() => assertValidAudience([PRIVATE]), InvalidAudienceError);
  });

  test('пустой идентификатор круга отвергается', () => {
    assert.throws(() => assertValidAudience(['']), InvalidAudienceError);
  });

  test('дубликат круга в аудитории отвергается', () => {
    assert.throws(() => assertValidAudience(['c_work', 'c_work']), InvalidAudienceError);
  });

  test(`своих кругов не больше ${MAX_CUSTOM_CIRCLES}; «Друзья» сверх лимита`, () => {
    const atLimit = Array.from({ length: MAX_CUSTOM_CIRCLES }, (_, i) => `c_${i}`);
    assert.doesNotThrow(() => assertValidAudience(atLimit));
    assert.doesNotThrow(() => assertValidAudience([FRIENDS, ...atLimit]));

    assert.throws(() => assertValidAudience([...atLimit, 'c_extra']), InvalidAudienceError);
  });
});

describe('Умолчание — скрыть', () => {
  test('свойство без записи в карте видимости попадает в приватный бакет', () => {
    const buckets = distribute({ about: 'секрет' }, {});

    assert.deepEqual(buckets.get(PRIVATE), { about: 'секрет' });
    assert.equal(buckets.has(EVERYONE), false);
  });

  test('забытая настройка не превращается в утечку', () => {
    // Самая опасная ошибка: добавили свойство, забыли настройку — и оно уехало всем.
    assert.deepEqual(visibleTo({ about: 'секрет' }, {}, stranger), {});
    assert.deepEqual(visibleTo({ about: 'секрет' }, {}, friend), {});
    assert.deepEqual(visibleTo({ about: 'секрет' }, {}, colleague), {});
  });

  test('undefined-значения не попадают ни в один бакет', () => {
    const buckets = distribute({ about: undefined }, { about: EVERYONE });
    assert.equal(buckets.size, 0);
  });
});

describe('Инвариант приватности: скрытое не видно никому, кроме владельца', () => {
  const visibility: VisibilityMap = {
    name: EVERYONE,
    avatar: EVERYONE,
    born: [FRIENDS],
    about: ['c_work'],
    gender: [], // никому
  };

  test('незнакомец видит только публичное', () => {
    assert.deepEqual(visibleTo(profile, visibility, stranger), {
      name: profile.name,
      avatar: profile.avatar,
    });
  });

  test('друг видит публичное + открытое друзьям, но не круг «работа»', () => {
    const seen = visibleTo(profile, visibility, friend);

    assert.deepEqual(seen, { name: profile.name, avatar: profile.avatar, born: profile.born });
    assert.equal('about' in seen, false, 'друг не в круге «работа» — не должен видеть about');
    assert.equal('gender' in seen, false);
  });

  test('коллега видит публичное + свой круг, но не то, что открыто друзьям', () => {
    const seen = visibleTo(profile, visibility, colleague);

    assert.deepEqual(seen, { name: profile.name, avatar: profile.avatar, about: profile.about });
    assert.equal('born' in seen, false, 'коллега не друг — не должен видеть дату рождения');
  });

  test('свойство «никому» не видит ни один зритель', () => {
    for (const viewer of [stranger, friend, colleague, { isFriend: true, circles: ['c_work'] }]) {
      const seen = visibleTo(profile, visibility, viewer);
      assert.equal('gender' in seen, false, `gender утёк зрителю ${JSON.stringify(viewer)}`);
    }
  });

  test('свойство «никому» физически лежит только в приватном бакете', () => {
    const buckets = distribute(profile, visibility);

    for (const [bucketId, contents] of buckets) {
      if (bucketId === PRIVATE) continue;
      assert.equal('gender' in contents, false, `gender оказался в бакете ${bucketId}`);
    }
    assert.deepEqual(buckets.get(PRIVATE), { gender: 'm' });
  });
});

describe('Дублирование по кругам — свойство видно из любого отмеченного круга', () => {
  const visibility: VisibilityMap = { born: [FRIENDS, 'c_work', 'c_gym'] };

  test('лежит в каждом отмеченном бакете', () => {
    const buckets = distribute(profile, visibility);

    assert.deepEqual(buckets.get(FRIENDS), { born: profile.born });
    assert.deepEqual(buckets.get('c_work'), { born: profile.born });
    assert.deepEqual(buckets.get('c_gym'), { born: profile.born });
  });

  test('виден зрителю из любого одного круга', () => {
    for (const viewer of [
      { isFriend: true, circles: [] },
      { isFriend: false, circles: ['c_work'] },
      { isFriend: false, circles: ['c_gym'] },
    ] satisfies Viewer[]) {
      assert.deepEqual(visibleTo(profile, visibility, viewer), { born: profile.born });
    }
  });

  test('виден ровно один раз тому, кто состоит сразу в нескольких кругах', () => {
    const insider: Viewer = { isFriend: true, circles: ['c_work', 'c_gym'] };
    assert.deepEqual(visibleTo(profile, visibility, insider), { born: profile.born });
  });

  test('не виден тому, кто не состоит ни в одном', () => {
    const outsider: Viewer = { isFriend: false, circles: ['c_other'] };
    assert.deepEqual(visibleTo(profile, visibility, outsider), {});
  });
});

describe('mergeBuckets — склейка и защита от рассогласования', () => {
  test('склеивает непересекающиеся бакеты', () => {
    assert.deepEqual(mergeBuckets([{ a: 1 }, { b: 2 }]), { a: 1, b: 2 });
  });

  test('одинаковые значения из разных бакетов — не конфликт', () => {
    assert.deepEqual(mergeBuckets([{ born: { year: 1985 } }, { born: { year: 1985 } }]), {
      born: { year: 1985 },
    });
  });

  test('разные значения одного свойства → падаем, а не выбираем молча', () => {
    assert.throws(
      () => mergeBuckets([{ born: { year: 1985 } }, { born: { year: 1990 } }]),
      BucketConflictError,
    );
  });

  test('пустой список даёт пустой профиль', () => {
    assert.deepEqual(mergeBuckets([]), {});
  });
});

describe('Документ-подсказка audience/{viewerUid}', () => {
  test('содержит только непрозрачные id бакетов, без публичного', () => {
    assert.deepEqual(extraBucketsFor({ isFriend: true, circles: ['c_work'] }), [FRIENDS, 'c_work']);
  });

  test('у незнакомца подсказки нет — читать нечего, кроме публичного', () => {
    assert.deepEqual(extraBucketsFor(stranger), []);
    assert.deepEqual(readableBuckets(stranger), [EVERYONE]);
  });

  test('дефолтный круг не дублируется, если попал и в circles', () => {
    assert.deepEqual(extraBucketsFor({ isFriend: true, circles: [FRIENDS] }), [FRIENDS]);
  });

  test('приватный бакет не попадает в читаемые никогда', () => {
    const viewer: Viewer = { isFriend: true, circles: ['c_work'] };
    assert.equal(readableBuckets(viewer).includes(PRIVATE), false);
  });
});

describe('Владелец видит свой профиль целиком', () => {
  test('склейка всех бакетов возвращает исходные значения без потерь', () => {
    const visibility: VisibilityMap = {
      name: EVERYONE,
      born: [FRIENDS],
      about: ['c_work'],
      avatar: [FRIENDS, 'c_work'],
      gender: [],
    };

    const buckets = distribute(profile, visibility);
    const restored = mergeBuckets([...buckets.values()]);

    assert.deepEqual(restored, profile);
  });
});

describe('Смена видимости не оставляет следов в старом бакете', () => {
  test('после сужения аудитории свойство исчезает из прежних бакетов', () => {
    const before = distribute(profile, { born: [FRIENDS, 'c_work'] });
    assert.equal('born' in (before.get('c_work') ?? {}), true);

    const after = distribute(profile, { born: [FRIENDS] });
    assert.equal(after.has('c_work'), false, 'бакет прежнего круга обязан опустеть');

    // Отсюда требование: смена видимости — это WriteBatch, где старые бакеты чистятся,
    // а не просто дописываются новые. См. researches/04 §3.5.
    const colleagueAfter = visibleTo(profile, { born: [FRIENDS] }, colleague);
    assert.equal('born' in colleagueAfter, false);
  });
});

/**
 * Тесты миграции 1.x → 2.0.
 *
 * ЗДЕСЬ ПРОВЕРЯЕТСЯ ЧУЖОЙ ТРУД. За каждым документом стоит живой человек, который потратил
 * время и заполнил свои измерения. Потерять хотя бы одну оценку — значит обесценить это.
 * Поэтому тесты стерегут три вещи:
 *   · НИ ОДНА оценка не теряется — включая оценки по измерениям, удалённым из каталога;
 *   · видимость остаётся ТОЙ ЖЕ, что была (всё видно всем — статус-кво 1.x, интервью №002 В5):
 *     ничего не раскрывается сверх прежнего и ничего не прячется молча;
 *   · ПДн, попавшие в 1.x по ошибке (email гостя в чужом документе связей), в 2.0 не переезжают.
 *
 * Данные — синтетические. Настоящих людей в тестах нет и быть не может.
 *
 * Запуск: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { encodeLegacyRelation } from '../similarity/legacy.ts';
import { computeRelation } from '../similarity/similarity.ts';
import { EVERYONE } from '../model/visibility.ts';
import {
  migratePoint,
  migrateProfile,
  migrateRelations,
  migrateSuggestion,
  migratedUserVisibility,
  parseLegacyTop,
  toMillis,
  type LegacyPoint,
  type LegacyUser,
} from './transform.ts';

const NOW = Date.parse('2026-07-12T12:00:00Z');
const CREATED = Date.parse('2025-05-05T10:00:00Z');

/** Timestamp Firestore, как его отдаёт Admin SDK. */
const timestamp = (millis: number) => ({ toMillis: () => millis, _seconds: millis / 1000 });

describe('Время: Timestamp 1.x → миллисекунды 2.0', () => {
  test('Timestamp, число и «секунды» читаются одинаково', () => {
    assert.equal(toMillis(timestamp(CREATED), NOW), CREATED);
    assert.equal(toMillis(CREATED, NOW), CREATED);
    assert.equal(toMillis({ _seconds: CREATED / 1000 }, NOW), CREATED);
  });

  test('времени нет — берём запасное, а не выдумываем дату', () => {
    assert.equal(toMillis(undefined, NOW), NOW);
    assert.equal(toMillis(null, NOW), NOW);
  });
});

describe('Профиль: статус-кво видимости', () => {
  const user: LegacyUser = {
    uid: 'u1',
    email: 'человек@example.com',
    gender: 'm',
    avatar: true,
    born: { year: 1986, month: 3, day: 14 },
    name: {
      first: { ru: 'Николай', en: 'Mikalai' },
      middle: { ru: null, en: null },
      last: { ru: 'Кривуша', en: 'Kryvusha' },
      nick: { ru: 'KOT KRINIK', en: 'KOT KRINIK' },
    },
    about: { ru: 'Ищу похожих людей.', en: 'Looking for similar people.' },
    settings: { language: 'ru' },
    time: { created: timestamp(CREATED), last_sign_in: timestamp(NOW - 1000) },
  };

  test('всё, что было видно всем в 1.x, остаётся видимым всем', () => {
    const { root } = migrateProfile(user, NOW);
    assert.deepEqual(root.visibility, migratedUserVisibility());
    for (const property of ['name', 'gender', 'born', 'about', 'avatar'] as const) {
      assert.equal(root.visibility[property], EVERYONE, `${property} обязано остаться видимым всем`);
    }
  });

  test('🔒 почта человека НЕ переезжает в Firestore: она живёт в Auth', () => {
    const { root, everyone } = migrateProfile(user, NOW);
    const dump = JSON.stringify({ root, everyone });
    assert.ok(!dump.includes('example.com'), 'email не должен попасть ни в один документ 2.0');
  });

  test('свойства профиля переносятся все до одного', () => {
    const { everyone } = migrateProfile(user, NOW);
    assert.equal(everyone.name?.first.ru, 'Николай');
    assert.equal(everyone.name?.last?.en, 'Kryvusha');
    assert.deepEqual(everyone.born, { year: 1986, month: 3, day: 14 });
    assert.equal(everyone.about?.ru, 'Ищу похожих людей.');
    assert.equal(everyone.avatar, true);
    assert.equal(everyone.gender, 'm');
  });

  test('дата регистрации сохраняется — человек в Пространстве с того же дня', () => {
    const { root } = migrateProfile(user, NOW);
    assert.equal(root.time.created, CREATED);
  });

  test('строка «null» в поле пола (дефект 1.x) читается как «не указан»', () => {
    const { everyone } = migrateProfile({ ...user, gender: 'null' }, NOW);
    assert.equal(everyone.gender, null);
  });

  test('пустой профиль 1.x не роняет миграцию и не выдумывает данные', () => {
    const { root, everyone } = migrateProfile({}, NOW);
    assert.equal(root.time.created, NOW);
    assert.equal(everyone.name?.first.ru, null);
    assert.equal(everyone.avatar, false);
    assert.equal(everyone.gender, null);
  });
});

describe('Оценки: труд человека не теряется', () => {
  const point: LegacyPoint = {
    owner_uid: 'u1',
    user_dims: { cats: 10, travel: 7, silence: 0, 'удалённое-измерение': 9 },
    sync_status: 'synchronized',
    time: { updated: timestamp(NOW - 5000), last_sync: timestamp(NOW - 4000) },
  };

  test('переносятся ВСЕ оценки — по документу на измерение', () => {
    const { dims } = migratePoint(point, NOW);
    assert.equal(dims.size, 4);
    assert.equal(dims.get('cats')?.value, 10);
    assert.equal(dims.get('silence')?.value, 0, 'ноль — это оценка, а не отсутствие оценки');
  });

  test('🔴 оценка по измерению, удалённому из каталога, ВСЁ РАВНО переносится', () => {
    // В боевой базе таких 15. Это труд человека и часть его точки: без них расчёт похожести
    // разойдётся с 1.x. Каталог — дело админа, а оценка — дело человека.
    const { dims } = migratePoint(point, NOW);
    assert.ok(dims.has('удалённое-измерение'));
  });

  test('точка с оценками помечается грязной — сервер синхронизации пересчитает её', () => {
    assert.equal(migratePoint(point, NOW).point.dirty, true);
  });

  test('пустая точка не помечается грязной: считать по ней нечего', () => {
    const empty = migratePoint({ owner_uid: 'u2', user_dims: {} }, NOW);
    assert.equal(empty.point.dirty, false);
    assert.equal(empty.dims.size, 0);
  });

  test('битые значения отбрасываются, здоровые остаются', () => {
    const { dims } = migratePoint(
      { owner_uid: 'u3', user_dims: { ok: 5, tooBig: 11, negative: -1, nan: Number.NaN } },
      NOW,
    );
    assert.deepEqual([...dims.keys()], ['ok']);
  });

  test('нецелая оценка округляется до целого (схема 2.0 требует int 0…10)', () => {
    const { dims } = migratePoint({ owner_uid: 'u4', user_dims: { x: 7.4 } }, NOW);
    assert.equal(dims.get('x')?.value, 7);
  });
});

describe('Связи: метрики переезжают, чужие ПДн — нет', () => {
  const relation = computeRelation({ cats: 10, travel: 8 }, { cats: 9, travel: 6 })!;
  const legacy = {
    owner_uid: 'u1',
    v: 1,
    last_sync: timestamp(NOW - 10_000),
    relations: [encodeLegacyRelation(relation, 'guest-uid', 'гость@example.com')],
  };

  test('обфусцированные поля a…t превращаются в настоящие имена без потери чисел', () => {
    const migrated = migrateRelations(legacy, NOW);
    assert.equal(migrated.top.length, 1);
    const entry = migrated.top[0]!;
    assert.equal(entry.guestUid, 'guest-uid');
    assert.equal(entry.similarity, relation.similarity);
    assert.equal(entry.proximity, relation.proximity);
    assert.equal(entry.commonality, relation.commonality);
    assert.equal(entry.distance, relation.distance);
    assert.equal(entry.commonSpaceDiameter, relation.commonSpaceDiameter);
  });

  test('🔒 email гостя из документа 1.x в 2.0 НЕ переносится', () => {
    const migrated = migrateRelations(legacy, NOW);
    assert.ok(!JSON.stringify(migrated).includes('example.com'), 'ПДн гостя не должны переехать');
  });

  test('пустой документ связей (человек ни разу не синхронизировался) не роняет миграцию', () => {
    const migrated = migrateRelations({ owner_uid: 'u9', relations: null }, NOW);
    assert.deepEqual(migrated.top, []);
    assert.equal(migrated.computedAt, NOW);
  });

  test('🔴 боевой формат: топ лежит JSON-СТРОКОЙ, а не массивом', () => {
    // Так это и оказалось в живой базе (100 документов со строкой). Модель в researches/02
    // описывала поле как «результат» — и это стоило бы нам пустых связей у всех людей,
    // если бы прогон шёл сразу по бою, а не по копии.
    const asString = { ...legacy, relations: JSON.stringify(legacy.relations) };
    const migrated = migrateRelations(asString, NOW);
    assert.equal(migrated.top.length, 1);
    assert.equal(migrated.top[0]!.similarity, relation.similarity);
  });

  test('битая строка не роняет миграцию и не выдумывает связей', () => {
    assert.deepEqual(parseLegacyTop('{это не json'), []);
    assert.deepEqual(parseLegacyTop(''), []);
    assert.deepEqual(parseLegacyTop(null), []);
  });
});

describe('Заявки на измерения: автор по email → uid', () => {
  const emailToUid = new Map([['автор@example.com', 'u1']]);

  test('известный автор опознаётся', () => {
    const result = migrateSuggestion(
      { author: 'Автор@Example.com', description: 'Добавьте измерение «Тишина»', created: timestamp(NOW) },
      emailToUid,
      NOW,
    );
    assert.ok(result.ok);
    assert.equal(result.doc.authorUid, 'u1');
    assert.equal(result.doc.created, NOW);
  });

  test('неизвестного автора не выдумываем — заявку разбирает человек', () => {
    const result = migrateSuggestion(
      { author: 'кто-то@другой.ru', description: 'Что-то' },
      emailToUid,
      NOW,
    );
    assert.equal(result.ok, false);
  });
});

describe('Идемпотентность: повторный прогон даёт то же самое', () => {
  test('одни и те же входные данные → один и тот же результат', () => {
    const user: LegacyUser = { name: { first: { ru: 'Анна', en: 'Anna' } }, time: { created: timestamp(CREATED) } };
    const point: LegacyPoint = { owner_uid: 'u1', user_dims: { cats: 8 } };

    assert.deepEqual(migrateProfile(user, NOW), migrateProfile(user, NOW));
    assert.deepEqual(
      [...migratePoint(point, NOW).dims],
      [...migratePoint(point, NOW).dims],
    );
  });
});

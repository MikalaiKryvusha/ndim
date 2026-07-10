/**
 * Тесты схемы документов.
 *
 * Два места, где ошибка стоит дорого:
 *  1. Границы значений — если ужесточить, миграция отвергнет данные, которые люди уже заполнили.
 *  2. Логика дружбы — если ослабить, кто угодно «подружится» с кем угодно без согласия.
 *
 * Запуск: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ABOUT_MAX,
  BIRTH_YEAR_MAX,
  BIRTH_YEAR_MIN,
  EVERYONE,
  GROUP_NAME_MAX,
  MAX_CUSTOM_GROUPS,
  NAME_PART_MAX,
  NICK_MAX,
  RATING_MAX,
  SUGGESTION_MAX,
  SUGGESTION_MIN,
  SchemaValidationError,
  areFriends,
  assertGroupLimit,
  assertValidBirthDate,
  assertValidGroupName,
  assertValidProfile,
  assertValidRating,
  assertValidSuggestion,
  assertValidVisibilityMap,
  canAcceptFriendship,
  friendshipId,
  isFriendshipParticipant,
  isRealDate,
  migratedUserVisibility,
  newFriendshipRequest,
  newUserVisibility,
  type BirthDate,
  type FriendshipDoc,
  type Localized,
} from './schema.ts';

const text = (n: number) => 'x'.repeat(n);
const loc = (ru: string | null, en: string | null = null): Localized => ({ ru, en });
const NOW = 1_752_000_000_000;

describe('Границы значений — паритет с 1.x (иначе миграция отвергнет живые данные)', () => {
  test('🔒 сами константы совпадают с правилами 1.x — не параметризованно, а гвоздями', () => {
    // Остальные тесты этого блока используют константы как переменные и потому НЕ заметят,
    // если кто-то тихо ужесточит границу. Эти числа взяты из firestore.rules версии 1.x;
    // менять их можно только вместе с планом, что делать с не проходящими записями.
    assert.equal(NAME_PART_MAX, 50);
    assert.equal(NICK_MAX, 100);
    assert.equal(ABOUT_MAX, 5000);
    assert.equal(RATING_MAX, 10);
    assert.equal(SUGGESTION_MIN, 5);
    assert.equal(SUGGESTION_MAX, 300);
    assert.equal(BIRTH_YEAR_MIN, 1525);
    assert.equal(BIRTH_YEAR_MAX, 10000);
    assert.equal(MAX_CUSTOM_GROUPS, 10, 'решение владельца: до 10 своих групп');
  });

  test(`часть имени: ${NAME_PART_MAX} символов проходит, ${NAME_PART_MAX + 1} — нет`, () => {
    const name = (value: string) => ({
      first: loc(value),
      middle: loc(null),
      last: loc(null),
      nick: loc(null),
    });

    assert.doesNotThrow(() => assertValidProfile({ name: name(text(NAME_PART_MAX)) }));
    assert.throws(() => assertValidProfile({ name: name(text(NAME_PART_MAX + 1)) }), SchemaValidationError);
  });

  test(`ник длиннее части имени: ${NICK_MAX} символов`, () => {
    const name = (nick: string) => ({
      first: loc(null),
      middle: loc(null),
      last: loc(null),
      nick: loc(nick),
    });

    assert.doesNotThrow(() => assertValidProfile({ name: name(text(NICK_MAX)) }));
    assert.throws(() => assertValidProfile({ name: name(text(NICK_MAX + 1)) }), SchemaValidationError);
  });

  test(`«о себе»: ${ABOUT_MAX} символов`, () => {
    assert.doesNotThrow(() => assertValidProfile({ about: loc(text(ABOUT_MAX)) }));
    assert.throws(() => assertValidProfile({ about: loc(text(ABOUT_MAX + 1)) }), SchemaValidationError);
  });

  test('оба языка проверяются независимо', () => {
    assert.throws(() => assertValidProfile({ about: loc('ок', text(ABOUT_MAX + 1)) }), SchemaValidationError);
  });

  test('null означает «не заполнено» и всегда допустим', () => {
    assert.doesNotThrow(() => assertValidProfile({ about: loc(null, null) }));
  });

  test('оценка по оси — целое 0…10', () => {
    for (const value of [0, 5, RATING_MAX]) assert.doesNotThrow(() => assertValidRating(value));
    for (const bad of [-1, RATING_MAX + 1, 5.5, NaN, '5', null]) {
      assert.throws(() => assertValidRating(bad), SchemaValidationError, `${String(bad)} должно быть отвергнуто`);
    }
  });

  test(`заявка на ось: ${SUGGESTION_MIN}…${SUGGESTION_MAX} символов`, () => {
    assert.doesNotThrow(() => assertValidSuggestion(text(SUGGESTION_MIN)));
    assert.doesNotThrow(() => assertValidSuggestion(text(SUGGESTION_MAX)));
    assert.throws(() => assertValidSuggestion(text(SUGGESTION_MIN - 1)), SchemaValidationError);
    assert.throws(() => assertValidSuggestion(text(SUGGESTION_MAX + 1)), SchemaValidationError);
  });

  test('название группы: непустое, не длиннее лимита', () => {
    assert.doesNotThrow(() => assertValidGroupName('Однокурсники'));
    assert.throws(() => assertValidGroupName('   '), SchemaValidationError);
    assert.throws(() => assertValidGroupName(text(GROUP_NAME_MAX + 1)), SchemaValidationError);
  });

  test(`своих групп не больше ${MAX_CUSTOM_GROUPS}`, () => {
    assert.doesNotThrow(() => assertGroupLimit(MAX_CUSTOM_GROUPS - 1));
    assert.throws(() => assertGroupLimit(MAX_CUSTOM_GROUPS), SchemaValidationError);
  });
});

describe('Дата рождения', () => {
  const date = (year: number | null, month: number | null, day: number | null): BirthDate => ({
    year,
    month,
    day,
  });

  test('диапазоны унаследованы от 1.x', () => {
    assert.doesNotThrow(() => assertValidBirthDate(date(BIRTH_YEAR_MIN, 1, 1)));
    assert.doesNotThrow(() => assertValidBirthDate(date(BIRTH_YEAR_MAX, 12, 31)));
    assert.throws(() => assertValidBirthDate(date(BIRTH_YEAR_MIN - 1, 1, 1)), SchemaValidationError);
    assert.throws(() => assertValidBirthDate(date(2000, 13, 1)), SchemaValidationError);
    assert.throws(() => assertValidBirthDate(date(2000, 1, 32)), SchemaValidationError);
  });

  test('неполная дата допустима: человек вправе указать только год', () => {
    assert.doesNotThrow(() => assertValidBirthDate(date(1985, null, null)));
    assert.doesNotThrow(() => assertValidBirthDate(date(null, null, null)));
  });

  test('хранение НЕ отвергает 31 февраля — так было в 1.x, и миграция это переживёт', () => {
    assert.doesNotThrow(() => assertValidBirthDate(date(2000, 2, 31)));
  });

  test('но isRealDate отличает настоящую дату от выдуманной — для интерфейса', () => {
    assert.equal(isRealDate(date(2000, 2, 31)), false);
    assert.equal(isRealDate(date(2001, 2, 29)), false, '2001 не високосный');
    assert.equal(isRealDate(date(2000, 2, 29)), true, '2000 високосный');
    assert.equal(isRealDate(date(1985, 4, 12)), true);
  });

  test('неполную дату isRealDate не отвергает', () => {
    assert.equal(isRealDate(date(1985, null, null)), true);
  });
});

describe('Дружба: принять запрос может только адресат', () => {
  const ALICE = 'alice';
  const BOB = 'bob';
  const EVE = 'eve';

  const request = (from: string, to: string): FriendshipDoc => newFriendshipRequest(from, to, NOW);

  test('идентификатор пары детерминирован и симметричен', () => {
    assert.equal(friendshipId(ALICE, BOB), friendshipId(BOB, ALICE));
    assert.equal(friendshipId(ALICE, BOB), 'alice_bob', 'лексикографический порядок');
  });

  test('дружить с самим собой нельзя', () => {
    assert.throws(() => friendshipId(ALICE, ALICE), SchemaValidationError);
    assert.throws(() => newFriendshipRequest(ALICE, ALICE, NOW), SchemaValidationError);
  });

  test('запрос создаётся в статусе pending и помнит отправителя', () => {
    const friendship = request(BOB, ALICE);

    assert.equal(friendship.status, 'pending');
    assert.equal(friendship.requestedBy, BOB);
    assert.equal(friendship.acceptedAt, null);
    assert.deepEqual([friendship.a, friendship.b], [ALICE, BOB], 'a < b независимо от отправителя');
  });

  test('🔒 отправитель НЕ может принять собственный запрос', () => {
    const friendship = request(BOB, ALICE);
    assert.equal(canAcceptFriendship(friendship, BOB), false);
  });

  test('адресат может принять', () => {
    const friendship = request(BOB, ALICE);
    assert.equal(canAcceptFriendship(friendship, ALICE), true);
  });

  test('🔒 посторонний не может принять чужой запрос', () => {
    const friendship = request(BOB, ALICE);
    assert.equal(canAcceptFriendship(friendship, EVE), false);
  });

  test('🔒 уже принятую дружбу принять повторно нельзя', () => {
    const accepted: FriendshipDoc = { ...request(BOB, ALICE), status: 'accepted', acceptedAt: NOW };
    assert.equal(canAcceptFriendship(accepted, ALICE), false);
    assert.equal(canAcceptFriendship(accepted, BOB), false);
  });

  test('areFriends истинно только при accepted', () => {
    assert.equal(areFriends(request(BOB, ALICE)), false, 'pending — ещё не друзья');
    assert.equal(areFriends({ ...request(BOB, ALICE), status: 'accepted' }), true);
    assert.equal(areFriends(null), false, 'нет документа — нет дружбы');
  });

  test('участник определяется по обеим сторонам', () => {
    const friendship = request(BOB, ALICE);
    assert.equal(isFriendshipParticipant(friendship, ALICE), true);
    assert.equal(isFriendshipParticipant(friendship, BOB), true);
    assert.equal(isFriendshipParticipant(friendship, EVE), false);
  });
});

describe('Умолчания видимости', () => {
  test('новый пользователь: всё скрыто', () => {
    const visibility = newUserVisibility();

    for (const [property, audience] of Object.entries(visibility)) {
      assert.deepEqual(audience, [], `свойство «${property}» у нового пользователя должно быть скрыто`);
    }
    assert.doesNotThrow(() => assertValidVisibilityMap(visibility));
  });

  test('мигрируемый пользователь: всё видно всем — так у него и было', () => {
    const visibility = migratedUserVisibility();

    for (const [property, audience] of Object.entries(visibility)) {
      assert.equal(audience, EVERYONE, `свойство «${property}» должно сохранить прежнюю видимость`);
    }
    assert.doesNotThrow(() => assertValidVisibilityMap(visibility));
  });

  test('умолчания различаются — это не одна и та же карта', () => {
    // Легко перепутать и «мигрировать» новых пользователей в публичность.
    assert.notDeepEqual(newUserVisibility(), migratedUserVisibility());
  });

  test('карта видимости с недопустимой аудиторией отвергается', () => {
    assert.throws(
      () => assertValidVisibilityMap({ about: ['private'] }),
      SchemaValidationError,
      'служебный бакет не может быть группой',
    );
  });

  test('обе карты покрывают все свойства профиля', () => {
    const properties = ['name', 'born', 'about', 'avatar', 'gender'];
    assert.deepEqual(Object.keys(newUserVisibility()).sort(), [...properties].sort());
    assert.deepEqual(Object.keys(migratedUserVisibility()).sort(), [...properties].sort());
  });
});

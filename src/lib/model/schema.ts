/**
 * Схема документов Firestore для NDim Space 2.0.
 *
 * Схема живёт **здесь**, а не в правилах безопасности. В версии 1.x правила были одновременно
 * схемой, валидацией и авторизацией: выражение `allow update` для профиля состояло из сорока с
 * лишним условий и не поддавалось сопровождению (`researches/02`, проблема №3).
 * Теперь правила проверяют только **права доступа и границы**, а форму данных знает TypeScript.
 *
 * Модуль чистый: ни Firestore, ни Node. Исполняется и в браузере, и в вычислителе.
 * Отметки времени — целые миллисекунды epoch; преобразование в `Timestamp` делает адаптер Firestore.
 *
 * Устройство коллекций: researches/04_data_model_2x_proposal.md
 */

import type { Relation } from '../similarity/similarity.ts';
import {
  EVERYONE,
  FRIENDS,
  MAX_CUSTOM_GROUPS,
  assertValidAudience,
  type Audience,
  type BucketId,
  type GroupId,
  type ProfileProperty,
  type VisibilityMap,
} from './visibility.ts';

// ── Границы значений ────────────────────────────────────────────────────────
//
// Взяты из правил версии 1.x без изменений. Это не лень, а условие уважительной миграции:
// более строгие границы отвергли бы данные, которые люди уже заполнили и считают своими.
// Ужесточать их можно только вместе с планом, что делать с не проходящими записями.

/** Части имени (`first`, `middle`, `last`) — до 50 символов на язык. */
export const NAME_PART_MAX = 50;
/** Ник — до 100 символов на язык. */
export const NICK_MAX = 100;
/** Текст «о себе» — до 5000 символов на язык. */
export const ABOUT_MAX = 5000;
/** Название группы (видит только владелец). */
export const GROUP_NAME_MAX = 50;
/** Заявка на новую ось: 5…300 символов. */
export const SUGGESTION_MIN = 5;
export const SUGGESTION_MAX = 300;
/** Оценка по оси — целое 0…10. */
export const RATING_MIN = 0;
export const RATING_MAX = 10;
/** Диапазон года рождения, унаследованный от 1.x. Календарную корректность даты см. {@link isRealDate}. */
export const BIRTH_YEAR_MIN = 1525;
export const BIRTH_YEAR_MAX = 10000;

// ── Базовые типы ────────────────────────────────────────────────────────────

export type Uid = string;
export type DimId = string;
/** Миллисекунды epoch. Firestore-адаптер превращает их в `Timestamp`. */
export type Millis = number;
export type Lang = 'ru' | 'en';

/** Двуязычное значение. `null` означает «не заполнено». Двуязычность — требование продукта из 1.x. */
export interface Localized {
  readonly ru: string | null;
  readonly en: string | null;
}

export interface PersonName {
  readonly first: Localized;
  readonly middle: Localized;
  readonly last: Localized;
  readonly nick: Localized;
}

/** Дата рождения. Любая часть может отсутствовать: человек вправе указать только год. */
export interface BirthDate {
  readonly year: number | null;
  readonly month: number | null;
  readonly day: number | null;
}

export type Gender = 'm' | 'w' | 'nb' | null;

/** Свойства профиля. Ключи совпадают с {@link ProfileProperty} — за этим следит `satisfies` ниже. */
export interface ProfileData {
  readonly name: PersonName;
  readonly born: BirthDate;
  readonly about: Localized;
  /** Есть ли у человека аватар в Storage. Сам файл лежит вне Firestore. */
  readonly avatar: boolean;
  readonly gender: Gender;
}

/** Проверка на этапе компиляции: набор свойств профиля совпадает с тем, чем управляет видимость. */
type _ProfileKeysMatchVisibility = ProfileData extends Record<ProfileProperty, unknown>
  ? Record<ProfileProperty, unknown> extends Record<keyof ProfileData, unknown>
    ? true
    : never
  : never;
const _profileKeysChecked: _ProfileKeysMatchVisibility = true;
void _profileKeysChecked;

// ── Документы ───────────────────────────────────────────────────────────────

/**
 * `users/{uid}` — корень пользователя. Читает и пишет **только владелец**.
 * Здесь нет ни одного свойства профиля: они разложены по бакетам.
 * Здесь нет `email`: это идентификатор из Firebase Auth, а не данные (`researches/02`, проблема №5).
 */
export interface UserRootDoc {
  readonly visibility: VisibilityMap;
  readonly settings: {
    readonly language: Lang;
  };
  readonly time: {
    readonly created: Millis;
    readonly updated: Millis;
    readonly lastSignIn: Millis;
  };
  /** Сколько своих групп завёл пользователь. Не больше {@link MAX_CUSTOM_GROUPS}. */
  readonly groupCount: number;
}

/**
 * `users/{uid}/profile/{bucketId}` — свойства, открытые одной аудитории.
 * Раскладку делает `visibility.ts`; здесь только форма документа.
 */
export type ProfileBucketDoc = Readonly<Partial<ProfileData>>;

/** `users/{uid}/groups/{groupId}` — приватная группа владельца. Никто другой её не видит. */
export interface GroupDoc {
  readonly name: string;
  readonly memberCount: number;
  readonly created: Millis;
}

/** `users/{uid}/groups/{groupId}/members/{memberUid}` — членство. Только владелец. */
export interface GroupMemberDoc {
  readonly added: Millis;
}

/**
 * `users/{uid}/audience/{viewerUid}` — подсказка зрителю: какие бакеты ему запрашивать.
 *
 * **Не источник прав.** Права проверяют правила безопасности независимо. Подсказка нужна лишь
 * потому, что идентификаторы групп принадлежат владельцу и зритель их не знает. Названий групп и
 * состава участников здесь нет.
 */
export interface AudienceHintDoc {
  /** Непубличные бакеты, доступные этому зрителю: `['friends', 'g3']`. Без `everyone`. */
  readonly buckets: readonly BucketId[];
}

export type FriendshipStatus = 'pending' | 'accepted';

/**
 * `friendships/{pairId}` — дружба. Симметрична, поэтому живёт **вне** односторонних групп владельца.
 *
 * `a < b` лексикографически; `pairId` строится {@link friendshipId}. Так документ у пары ровно один,
 * и правила безопасности могут вычислить его путь без обращения к базе.
 */
export interface FriendshipDoc {
  readonly a: Uid;
  readonly b: Uid;
  /** Кто отправил запрос. Принять может **только другая сторона**. */
  readonly requestedBy: Uid;
  readonly status: FriendshipStatus;
  readonly created: Millis;
  readonly acceptedAt: Millis | null;
}

/** `points/{uid}` — служебное о точке человека. Читает владелец и вычислитель. */
export interface PointDoc {
  /** Оси изменились — связи надо пересчитать. Вычислитель выбирает по индексу `where('dirty','==',true)`. */
  readonly dirty: boolean;
  readonly updated: Millis;
  readonly lastSync: Millis | null;
}

/**
 * `points/{uid}/dims/{dimId}` — одна оценка по одной оси.
 *
 * Ось — отдельный документ, потому что правила Firestore не умеют перебирать значения map.
 * Из-за этого в 1.x приходилось разрешать менять ровно одну ось за обновление. Теперь правило
 * валидирует каждый документ по отдельности.
 */
export interface DimRatingDoc {
  readonly value: number;
}

/** Одна строка топа похожих: метрики связи плюс `uid` гостя. Email гостя сюда не попадает. */
export type RelationEntry = Relation & { readonly guestUid: Uid };

/** `relations/{uid}` — топ похожих. Читает **только владелец**, пишет **только вычислитель**. */
export interface RelationsDoc {
  readonly computedAt: Millis;
  readonly version: number;
  readonly top: readonly RelationEntry[];
}

/** `dims/{dimId}` — ось измерения. Пишет админ, читают подтверждённые пользователи. */
export interface DimDoc {
  readonly title: Localized;
  readonly description: Localized;
  /** Сумма всех оценок, поставленных себе людьми по этой оси. */
  readonly stars: number;
  /** Сколько людей заполнили эту ось. */
  readonly rates: number;
  /** `stars / rates`, округлённое до 0.1. */
  readonly rating: number;
}

/** `suggestions/{id}` — заявка на новую ось. Так пространство измерений растёт снизу. */
export interface SuggestionDoc {
  readonly authorUid: Uid;
  readonly description: string;
  readonly created: Millis;
}

// ── Ошибки и валидаторы ─────────────────────────────────────────────────────

/** Данные не соответствуют схеме. Поле объявлено явно: параметр-свойства не стираются (см. EXP-0011). */
export class SchemaValidationError extends Error {
  readonly field: string;

  constructor(field: string, reason: string) {
    super(`Поле «${field}»: ${reason}`);
    this.name = 'SchemaValidationError';
    this.field = field;
  }
}

const isInteger = (value: unknown): value is number => Number.isInteger(value);

function assertLocalized(value: Localized, field: string, maxLength: number): void {
  for (const lang of ['ru', 'en'] as const) {
    const text = value[lang];
    if (text === null) continue;
    if (typeof text !== 'string') throw new SchemaValidationError(`${field}.${lang}`, 'ожидалась строка или null');
    if (text.length > maxLength) {
      throw new SchemaValidationError(`${field}.${lang}`, `длиннее ${maxLength} символов (${text.length})`);
    }
  }
}

/**
 * Настоящая ли это календарная дата.
 *
 * Правила 1.x проверяли только диапазоны (`month` 1…12, `day` 1…31), поэтому 31 февраля проходило.
 * Мы **не** ужесточаем хранение — иначе миграция отвергла бы существующие записи. Эта функция для
 * интерфейса: показать человеку ошибку до сохранения.
 */
export function isRealDate(born: BirthDate): boolean {
  const { year, month, day } = born;
  if (year === null || month === null || day === null) return true; // неполная дата — не проверяем

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** Проверяет дату рождения по границам 1.x. Бросает {@link SchemaValidationError}. */
export function assertValidBirthDate(born: BirthDate): void {
  const bounds = [
    ['year', born.year, BIRTH_YEAR_MIN, BIRTH_YEAR_MAX],
    ['month', born.month, 1, 12],
    ['day', born.day, 1, 31],
  ] as const;

  for (const [field, value, min, max] of bounds) {
    if (value === null) continue;
    if (!isInteger(value)) throw new SchemaValidationError(`born.${field}`, 'ожидалось целое число или null');
    if (value < min || value > max) {
      throw new SchemaValidationError(`born.${field}`, `вне диапазона ${min}…${max} (${value})`);
    }
  }
}

/** Проверяет любой набор свойств профиля: те, что есть, обязаны быть корректны. */
export function assertValidProfile(profile: Readonly<Partial<ProfileData>>): void {
  if (profile.name !== undefined) {
    assertLocalized(profile.name.first, 'name.first', NAME_PART_MAX);
    assertLocalized(profile.name.middle, 'name.middle', NAME_PART_MAX);
    assertLocalized(profile.name.last, 'name.last', NAME_PART_MAX);
    assertLocalized(profile.name.nick, 'name.nick', NICK_MAX);
  }
  if (profile.about !== undefined) assertLocalized(profile.about, 'about', ABOUT_MAX);
  if (profile.born !== undefined) assertValidBirthDate(profile.born);

  if (profile.avatar !== undefined && typeof profile.avatar !== 'boolean') {
    throw new SchemaValidationError('avatar', 'ожидалось булево значение');
  }
  if (profile.gender !== undefined && !['m', 'w', 'nb', null].includes(profile.gender)) {
    throw new SchemaValidationError('gender', `недопустимое значение «${String(profile.gender)}»`);
  }
}

/** Проверяет оценку по оси: целое 0…10. Дробные и выходящие за диапазон отвергаются. */
export function assertValidRating(value: unknown): asserts value is number {
  if (!isInteger(value)) throw new SchemaValidationError('value', 'оценка должна быть целым числом');
  if (value < RATING_MIN || value > RATING_MAX) {
    throw new SchemaValidationError('value', `оценка вне диапазона ${RATING_MIN}…${RATING_MAX} (${value})`);
  }
}

/** Проверяет название группы: непустое, не длиннее {@link GROUP_NAME_MAX}. */
export function assertValidGroupName(name: string): void {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new SchemaValidationError('name', 'название группы не может быть пустым');
  if (trimmed.length > GROUP_NAME_MAX) {
    throw new SchemaValidationError('name', `длиннее ${GROUP_NAME_MAX} символов (${trimmed.length})`);
  }
}

/** Проверяет, что пользователь не превысил лимит своих групп («Друзья» не считаются). */
export function assertGroupLimit(currentGroupCount: number): void {
  if (currentGroupCount >= MAX_CUSTOM_GROUPS) {
    throw new SchemaValidationError('groupCount', `групп уже ${MAX_CUSTOM_GROUPS}, больше завести нельзя`);
  }
}

/** Проверяет заявку на новую ось. */
export function assertValidSuggestion(description: string): void {
  const length = description.trim().length;
  if (length < SUGGESTION_MIN || length > SUGGESTION_MAX) {
    throw new SchemaValidationError(
      'description',
      `длина вне диапазона ${SUGGESTION_MIN}…${SUGGESTION_MAX} (${length})`,
    );
  }
}

/** Проверяет карту видимости: каждая аудитория корректна. */
export function assertValidVisibilityMap(visibility: VisibilityMap): void {
  for (const [property, audience] of Object.entries(visibility) as [ProfileProperty, Audience][]) {
    try {
      assertValidAudience(audience);
    } catch (cause) {
      throw new SchemaValidationError(`visibility.${property}`, (cause as Error).message);
    }
  }
}

// ── Дружба ──────────────────────────────────────────────────────────────────

/**
 * Идентификатор документа дружбы: `min(a,b)_max(a,b)`.
 *
 * Детерминирован и симметричен, поэтому у пары ровно один документ, а правила безопасности могут
 * вычислить путь к нему прямо в выражении, без обращения к базе.
 */
export function friendshipId(x: Uid, y: Uid): string {
  if (x === y) throw new SchemaValidationError('friendship', 'нельзя подружиться с самим собой');
  return x < y ? `${x}_${y}` : `${y}_${x}`;
}

/** Создаёт документ запроса дружбы со стороны `requestedBy`. */
export function newFriendshipRequest(requestedBy: Uid, target: Uid, now: Millis): FriendshipDoc {
  friendshipId(requestedBy, target); // отсеивает дружбу с собой
  const [a, b] = requestedBy < target ? [requestedBy, target] : [target, requestedBy];

  return { a, b, requestedBy, status: 'pending', created: now, acceptedAt: null };
}

/**
 * Может ли `actorUid` принять этот запрос дружбы.
 *
 * Взаимное согласие (интервью №002, В1) означает: принимает **только адресат**, и только запрос со
 * статусом `pending`. Эта функция — источник истины; правило безопасности повторяет её условие.
 */
export function canAcceptFriendship(friendship: FriendshipDoc, actorUid: Uid): boolean {
  if (friendship.status !== 'pending') return false;
  if (actorUid === friendship.requestedBy) return false;
  return actorUid === friendship.a || actorUid === friendship.b;
}

/** Участвует ли пользователь в этой дружбе. */
export function isFriendshipParticipant(friendship: FriendshipDoc, uid: Uid): boolean {
  return uid === friendship.a || uid === friendship.b;
}

/** Подтверждена ли дружба обеими сторонами. */
export function areFriends(friendship: FriendshipDoc | null): boolean {
  return friendship?.status === 'accepted';
}

// ── Умолчания ───────────────────────────────────────────────────────────────

/**
 * Карта видимости для нового пользователя.
 *
 * Всё скрыто. Умолчание в пользу приватности: человек сам решит, что открыть.
 * Не путать с миграцией существующих 299 пользователей — там всё остаётся `everyone`,
 * потому что таким оно у них и было (интервью №002, В5).
 */
export function newUserVisibility(): VisibilityMap {
  return { name: [], born: [], about: [], avatar: [], gender: [] };
}

/** Карта видимости для мигрируемого пользователя 1.x: всё видно всем, как было. */
export function migratedUserVisibility(): VisibilityMap {
  return { name: EVERYONE, born: EVERYONE, about: EVERYONE, avatar: EVERYONE, gender: EVERYONE };
}

/** Идентификатор дефолтной группы «Друзья». Реэкспорт, чтобы схема была самодостаточна. */
export { FRIENDS, EVERYONE, MAX_CUSTOM_GROUPS };
export type { GroupId, BucketId, Audience, VisibilityMap, ProfileProperty };

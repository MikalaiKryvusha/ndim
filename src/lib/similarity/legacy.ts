/**
 * Совместимость с версией 1.x: расшифровка обфусцированных полей связи.
 *
 * В боевом Firestore документы `relations` хранят метрики под однобуквенными именами `a…t`
 * («матрица соответствия» из версии 1.x). Без этой таблицы существующие данные прочитать
 * невозможно — а прочитать их нужно, чтобы провести уважительную миграцию, ничего не потеряв.
 *
 * Полное описание — researches/03_similarity_core_1x_source.md.
 *
 * Этот модуль нужен ТОЛЬКО для миграции и чтения исторических данных.
 * Новый код пишет и читает {@link Relation} с настоящими именами.
 */

import type { Relation } from './similarity.ts';

/**
 * Сырой документ связи версии 1.x. Буквы `j` в оригинале нет — она пропущена автором.
 *
 * ⚠️ `e` и `f` — персональные данные гостя (uid и email), лежавшие в документе владельца.
 * Это дефект модели 1.x: для показа карточки достаточно uid. В 2.0 email гостя туда не попадает.
 */
export interface LegacyRelation {
  readonly a: number; // combined_space_size
  readonly b: number; // common_space_size
  readonly c: number; // guest_space_size
  readonly d: number; // distance_stars
  readonly e: string; // guest owner_uid   ← ПДн
  readonly f: string; // guest owner_email ← ПДн
  readonly g: number; // proximity
  readonly h: number; // commonality
  readonly i: number; // similarity
  readonly k: number; // guest_space_size_rate_of_owner
  readonly l: number; // guest_space_diametr
  readonly m: number; // owner_space_diametr
  readonly n: number; // guest_space_diametr_rate_of_owner
  readonly o: number; // common_space_size_rate_of_owner
  readonly p: number; // common_space_size_rate_of_guest
  readonly q: number; // common_space_diametr
  readonly r: number; // common_space_diametr_rate_of_owner
  readonly s: number; // common_space_diametr_rate_of_guest
  readonly t: number; // distance_rate_of_common_space_diametr
}

/**
 * Матрица соответствия: старая буква → настоящее имя метрики.
 * Задокументирована здесь, чтобы её нельзя было потерять вместе с кодом.
 */
export const LEGACY_FIELD_MAP = {
  a: 'combinedSpaceSize',
  b: 'commonSpaceSize',
  c: 'guestSpaceSize',
  d: 'distance',
  g: 'proximity',
  h: 'commonality',
  i: 'similarity',
  k: 'guestSpaceSizeRateOfOwner',
  l: 'guestSpaceDiameter',
  m: 'ownerSpaceDiameter',
  n: 'guestSpaceDiameterRateOfOwner',
  o: 'commonSpaceSizeRateOfOwner',
  p: 'commonSpaceSizeRateOfGuest',
  q: 'commonSpaceDiameter',
  r: 'commonSpaceDiameterRateOfOwner',
  s: 'commonSpaceDiameterRateOfGuest',
  t: 'distanceRateOfCommonSpaceDiameter',
} as const satisfies Record<string, keyof Relation>;

/** Расшифрованная связь 1.x: метрики отдельно, персональные данные гостя отдельно. */
export interface DecodedLegacyRelation {
  readonly relation: Relation;
  readonly guestUid: string;
  /** ПДн, попавшие в документ по ошибке модели 1.x. При миграции не переносить. */
  readonly guestEmail: string;
}

/** Читает документ `relations` версии 1.x и возвращает метрики с настоящими именами. */
export function decodeLegacyRelation(legacy: LegacyRelation): DecodedLegacyRelation {
  return {
    guestUid: legacy.e,
    guestEmail: legacy.f,
    relation: {
      similarity: legacy.i,
      proximity: legacy.g,
      commonality: legacy.h,
      distance: legacy.d,

      commonSpaceSize: legacy.b,
      ownerSpaceSize: legacy.a - legacy.c + legacy.b, // combined = owner + guest − common
      guestSpaceSize: legacy.c,
      combinedSpaceSize: legacy.a,

      ownerSpaceDiameter: legacy.m,
      guestSpaceDiameter: legacy.l,
      commonSpaceDiameter: legacy.q,

      guestSpaceSizeRateOfOwner: legacy.k,
      guestSpaceDiameterRateOfOwner: legacy.n,
      commonSpaceSizeRateOfOwner: legacy.o,
      commonSpaceSizeRateOfGuest: legacy.p,
      commonSpaceDiameterRateOfOwner: legacy.r,
      commonSpaceDiameterRateOfGuest: legacy.s,
      distanceRateOfCommonSpaceDiameter: legacy.t,
    },
  };
}

/**
 * Обратное преобразование — только для тестов и сверки миграции.
 * Продуктовый код версии 2.0 обфусцированные поля НЕ пишет.
 */
export function encodeLegacyRelation(
  relation: Relation,
  guestUid: string,
  guestEmail: string,
): LegacyRelation {
  return {
    a: relation.combinedSpaceSize,
    b: relation.commonSpaceSize,
    c: relation.guestSpaceSize,
    d: relation.distance,
    e: guestUid,
    f: guestEmail,
    g: relation.proximity,
    h: relation.commonality,
    i: relation.similarity,
    k: relation.guestSpaceSizeRateOfOwner,
    l: relation.guestSpaceDiameter,
    m: relation.ownerSpaceDiameter,
    n: relation.guestSpaceDiameterRateOfOwner,
    o: relation.commonSpaceSizeRateOfOwner,
    p: relation.commonSpaceSizeRateOfGuest,
    q: relation.commonSpaceDiameter,
    r: relation.commonSpaceDiameterRateOfOwner,
    s: relation.commonSpaceDiameterRateOfGuest,
    t: relation.distanceRateOfCommonSpaceDiameter,
  };
}

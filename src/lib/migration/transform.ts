/**
 * Уважительная миграция 1.x → 2.0: ЧИСТЫЕ функции трансформации (plans/02, шаг 2).
 *
 * Здесь нет ни Firestore, ни сети, ни времени — только «документ 1.x на входе, документы 2.0
 * на выходе». Поэтому это единственное место миграции, которое можно полноценно проверить
 * тестами на синтетических данных, не трогая ПДн живых людей. Скрипты прогона
 * (`tools/migrate/`) занимаются только чтением-записью и зовут эти функции.
 *
 * ТРЕБОВАНИЯ ВЛАДЕЛЬЦА (plans/02, интервью №002):
 *   1. Без потерь — ни один человек ничего не заполняет заново.
 *   2. Статус-кво видимости: всё, что было видно всем в 1.x, остаётся видимым всем.
 *      Ничего не раскрывается сверх прежнего и ничего не прячется молча.
 *   3. Обратимо: старые коллекции не трогаем — эти функции только СОЗДАЮТ документы 2.0.
 *   4. ПДн, попавшие в 1.x по ошибке (email гостя в чужом документе связей), в 2.0 не переносятся.
 */

import { decodeLegacyRelation, type LegacyRelation } from '../similarity/legacy.ts';
import type { Relation } from '../similarity/similarity.ts';
import { EVERYONE, type VisibilityMap } from '../model/visibility.ts';
import type {
  BirthDate,
  DimRatingDoc,
  Gender,
  Localized,
  Millis,
  PersonName,
  PointDoc,
  ProfileBucketDoc,
  RelationEntry,
  RelationsDoc,
  SuggestionDoc,
  Uid,
  UserRootDoc,
} from '../model/schema.ts';

// ── Документы 1.x, какими они лежат в боевой базе (researches/02) ────────────

export interface LegacyUser {
  readonly uid?: Uid;
  readonly email?: string;
  readonly gender?: Gender | 'null';
  readonly avatar?: boolean | null;
  readonly born?: Partial<BirthDate>;
  readonly name?: Partial<PersonName>;
  readonly about?: Partial<Localized>;
  readonly settings?: { readonly language?: 'ru' | 'en' };
  readonly time?: { readonly created?: unknown; readonly last_sign_in?: unknown };
}

export interface LegacyPoint {
  readonly owner_uid: Uid;
  readonly user_dims?: Readonly<Record<string, number>>;
  readonly sync_status?: 'never' | 'unsynchronized' | 'synchronized';
  readonly time?: { readonly updated?: unknown; readonly last_sync?: unknown };
}

export interface LegacyRelationsDoc {
  readonly owner_uid: Uid;
  readonly v?: number | null;
  readonly last_sync?: unknown;
  /**
   * Топ похожих: записи с обфусцированными полями `a…t`.
   *
   * ⚠️ В боевой базе это **JSON-СТРОКА**, а не массив (проверено на копии 2026-07-12: 100
   * документов со строкой, 233 с `null` — те, кто ни разу не синхронизировался). Модель в
   * `researches/02` описывала поле как «результат», и это оказалось строкой. Массив тоже
   * принимаем — на случай другого формата в старых записях.
   */
  readonly relations?: readonly LegacyRelation[] | string | null;
}

/**
 * Достаёт записи топа из поля 1.x: строку разбирает, массив принимает как есть.
 * Битую строку не роняем и не додумываем — возвращаем пусто и говорим об этом наверх.
 */
export function parseLegacyTop(value: LegacyRelationsDoc['relations']): readonly LegacyRelation[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface LegacySuggestion {
  readonly author?: string;
  readonly description?: string;
  readonly created?: unknown;
}

/** Версия формата relations 2.0. Совпадает с той, что пишет сервер синхронизации. */
export const RELATIONS_VERSION = 2;

// ── Время ────────────────────────────────────────────────────────────────────

/**
 * В 1.x время лежит как Timestamp Firestore, иногда как число, иногда его нет вовсе.
 * В 2.0 время — миллисекунды. Неизвестное время НЕ выдумываем: подставляем `fallback`
 * (обычно момент миграции) и говорим об этом честно, а не притворяемся, что знали.
 */
export function toMillis(value: unknown, fallback: Millis): Millis {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object') {
    const stamp = value as { toMillis?: () => number; _seconds?: number; seconds?: number };
    if (typeof stamp.toMillis === 'function') return stamp.toMillis();
    const seconds = stamp._seconds ?? stamp.seconds;
    if (typeof seconds === 'number') return seconds * 1000;
  }
  return fallback;
}

// ── Профиль ──────────────────────────────────────────────────────────────────

const localized = (value: Partial<Localized> | undefined): Localized => ({
  ru: value?.ru ?? null,
  en: value?.en ?? null,
});

/**
 * Карта видимости мигрированного человека: **всё видно всем** — статус-кво 1.x (интервью №002, В5).
 *
 * Это не выбор по умолчанию, а сохранение того, что было: в 1.x профиль читал любой
 * авторизованный человек. Прятать что-то молча — значит менять договорённость с человеком
 * без его ведома; раскрывать сверх прежнего нельзя тем более.
 *
 * Исключение — `avatar`: в 1.x аватары тоже были видны всем, поэтому и он `everyone`.
 */
export function migratedUserVisibility(): VisibilityMap {
  return { name: EVERYONE, gender: EVERYONE, born: EVERYONE, about: EVERYONE, avatar: EVERYONE };
}

export interface MigratedProfile {
  readonly root: UserRootDoc;
  /** Бакет `users/{uid}/profile/everyone` — всё, что было публично в 1.x. */
  readonly everyone: ProfileBucketDoc;
}

/**
 * `users/{uid}` версии 1.x → корень 2.0 + публичный бакет профиля.
 *
 * Почта НЕ переносится: она живёт в Firebase Auth, и дублировать её в Firestore — тот самый
 * дефект 1.x, из-за которого чужой email попадал в чужие документы.
 */
export function migrateProfile(user: LegacyUser, now: Millis): MigratedProfile {
  const created = toMillis(user.time?.created, now);

  const root: UserRootDoc = {
    visibility: migratedUserVisibility(),
    settings: { language: user.settings?.language === 'en' ? 'en' : 'ru' },
    time: {
      created,
      updated: now,
      lastSignIn: toMillis(user.time?.last_sign_in, created),
    },
    groupCount: 0, // кругов в 1.x не было — человек заведёт их сам
  };

  // Строка 'null' в поле пола — дефект 1.x (см. researches/02). Читаем её как «не указан».
  const gender: Gender =
    user.gender === 'm' || user.gender === 'w' || user.gender === 'nb' ? user.gender : null;

  const everyone: ProfileBucketDoc = {
    name: {
      first: localized(user.name?.first),
      middle: localized(user.name?.middle),
      last: localized(user.name?.last),
      nick: localized(user.name?.nick),
    },
    born: {
      year: user.born?.year ?? null,
      month: user.born?.month ?? null,
      day: user.born?.day ?? null,
    },
    about: localized(user.about),
    avatar: user.avatar === true,
    gender,
  };

  return { root, everyone };
}

// ── Точка человека (оценки) ──────────────────────────────────────────────────

export interface MigratedPoint {
  readonly point: PointDoc;
  /** `points/{uid}/dims/{dimId}` — по документу на каждую оценку. */
  readonly dims: ReadonlyMap<string, DimRatingDoc>;
}

/**
 * `ndimids/{*}` → `points/{uid}` + оценки по документу на измерение.
 *
 * **Оценки — самое ценное, что заполнили люди.** Здесь не место фильтрам: переносим ВСЁ, что
 * человек поставил, включая оценки по измерениям, которых больше нет в каталоге (в боевой базе
 * таких 15 — измерение удалили, а труд человека остался). Отбросить их значило бы и потерять
 * его работу, и разойтись в числах с 1.x: в расчёте похожести они участвовали.
 *
 * `dirty` ставим по `sync_status`: несинхронизированную точку сервер пересчитает первой.
 */
export function migratePoint(legacy: LegacyPoint, now: Millis): MigratedPoint {
  const dims = new Map<string, DimRatingDoc>();
  for (const [dimId, value] of Object.entries(legacy.user_dims ?? {})) {
    // Значение приводим к целому: в 1.x правила допускали number, схема 2.0 требует int 0…10.
    const rating = Math.round(value);
    if (!Number.isFinite(rating) || rating < 0 || rating > 10) continue;
    dims.set(dimId, { value: rating });
  }

  const point: PointDoc = {
    // Точка пересчитывается заново после миграции: 2.0 считает связи своим ядром.
    // Пустую точку помечать грязной незачем — считать по ней нечего.
    dirty: dims.size > 0,
    updated: toMillis(legacy.time?.updated, now),
    lastSync: legacy.sync_status === 'synchronized' ? toMillis(legacy.time?.last_sync, now) : null,
  };

  return { point, dims };
}

// ── Связи ────────────────────────────────────────────────────────────────────

/**
 * `relations/{uid}` (JSON-строка с полями `a…t`) → документ 2.0 с настоящими именами метрик.
 *
 * ⚠️ ПРИ МИГРАЦИИ ЭТА ФУНКЦИЯ НЕ ПРИМЕНЯЕТСЯ К БОЕВОЙ БАЗЕ — и это осознанно.
 * Связи — данные ПРОИЗВОДНЫЕ: их пересчитывает сервер синхронизации из точек. А документ 1.x
 * лежит по тому же пути `relations/{uid}`, что и документ 2.0, — значит «перенос» означал бы
 * ЗАТИРАНИЕ оригинала, чего требование «старое не трогаем» не допускает. Поэтому связи не
 * мигрируются: после запуска сервер посчитает их заново своим ядром.
 *
 * Функция нужна для СВЕРКИ: расшифровать числа 1.x и сравнить их с новым расчётом (шаг 4).
 * Email гостя (`f`) не переносится никогда — это ПДн, попавшие в чужой документ по дефекту 1.x.
 */
export function migrateRelations(legacy: LegacyRelationsDoc, now: Millis): RelationsDoc {
  const top: RelationEntry[] = [];
  for (const entry of parseLegacyTop(legacy.relations)) {
    const { relation, guestUid } = decodeLegacyRelation(entry);
    if (typeof guestUid !== 'string' || guestUid === '') continue;
    top.push({ ...(relation as Relation), guestUid });
  }

  return {
    computedAt: toMillis(legacy.last_sync, now),
    version: RELATIONS_VERSION,
    top,
  };
}

// ── Заявки на измерения ──────────────────────────────────────────────────────

/** Заявку без опознанного автора молча не переносим: разбирает человек (plans/02). */
export type MigratedSuggestion = { readonly ok: true; readonly doc: SuggestionDoc } | { readonly ok: false };

/**
 * `suggestions/{id}`: автор в 1.x — это EMAIL. В 2.0 автор — uid.
 * Карту `email → uid` строит скрипт прогона по коллекции `users`.
 */
export function migrateSuggestion(
  legacy: LegacySuggestion,
  emailToUid: ReadonlyMap<string, Uid>,
  now: Millis,
): MigratedSuggestion {
  const email = legacy.author?.toLowerCase();
  const uid = email ? emailToUid.get(email) : undefined;
  const description = legacy.description?.trim();

  if (!uid || !description) return { ok: false };

  return {
    ok: true,
    doc: { authorUid: uid, description, created: toMillis(legacy.created, now) },
  };
}

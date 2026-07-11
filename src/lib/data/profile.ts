/**
 * Слой данных экрана «Профиль» (NDim ID) — модель 2.0 поверх Firestore.
 *
 * Экран говорит только с этим модулем; Firestore и Auth спрятаны здесь.
 * Раскладку и склейку бакетов делает чистый `model/visibility.ts` — этот файл лишь
 * читает документы и передаёт их туда. Ошибка склейки (`BucketConflictError`) не
 * глотается: рассогласованные данные — повод упасть, а не показать «что-нибудь».
 *
 * Схема коллекций: researches/04 · src/lib/model/schema.ts.
 */

import { signInWithEmailAndPassword } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { DEV_USER, db, devAuth } from '../firebase.ts';
import {
  bucketsForAudience,
  distribute,
  mergeBuckets,
  visibleTo,
  type BucketId,
  type Viewer,
  type VisibilityMap,
} from '../model/visibility.ts';
import {
  assertValidProfile,
  assertValidRating,
  assertValidSuggestion,
  assertValidVisibilityMap,
  type DimDoc,
  type GroupDoc,
  type ProfileData,
  type Uid,
  type UserRootDoc,
} from '../model/schema.ts';

/** Ось каталога вместе с её идентификатором документа. */
export interface DimEntry extends DimDoc {
  readonly id: string;
}

/** Всё, что нужно экрану профиля. Загружается одним вызовом {@link loadProfileScreen}. */
export interface ProfileScreenData {
  readonly uid: Uid;
  readonly root: UserRootDoc;
  /** Свойства профиля, склеенные из всех бакетов владельца. */
  readonly values: Partial<ProfileData>;
  /** Круги владельца: id → название (видит только он сам). */
  readonly groups: ReadonlyMap<string, GroupDoc>;
  /** Каталог осей. */
  readonly dims: readonly DimEntry[];
  /** Мои оценки: dimId → 0…10. */
  readonly ratings: ReadonlyMap<string, number>;
}

/** Входит на стенд пользователем `dev@ndim.space` и возвращает его uid. */
export async function signInDev(): Promise<Uid> {
  const credentials = await signInWithEmailAndPassword(devAuth(), DEV_USER.email, DEV_USER.password);
  return credentials.user.uid;
}

/** Загружает всё содержимое экрана профиля за четыре чтения-коллекции. */
export async function loadProfileScreen(uid: Uid): Promise<ProfileScreenData> {
  const store = db();

  const [rootSnap, bucketsSnap, groupsSnap, dimsSnap, ratingsSnap] = await Promise.all([
    getDoc(doc(store, 'users', uid)),
    getDocs(collection(store, 'users', uid, 'profile')),
    getDocs(collection(store, 'users', uid, 'groups')),
    getDocs(collection(store, 'dims')),
    getDocs(collection(store, 'points', uid, 'dims')),
  ]);

  if (!rootSnap.exists()) {
    throw new Error(`users/${uid} не существует — стенд не засеян (npm run stand)`);
  }

  const values = mergeBuckets(bucketsSnap.docs.map((bucket) => bucket.data())) as Partial<ProfileData>;

  const groups = new Map<string, GroupDoc>();
  for (const group of groupsSnap.docs) groups.set(group.id, group.data() as GroupDoc);

  const dims: DimEntry[] = dimsSnap.docs
    .map((dim) => ({ id: dim.id, ...(dim.data() as DimDoc) }))
    .sort((a, b) => (a.title.ru ?? a.id).localeCompare(b.title.ru ?? b.id, 'ru'));

  const ratings = new Map<string, number>();
  for (const rating of ratingsSnap.docs) ratings.set(rating.id, (rating.data() as { value: number }).value);

  return { uid, root: rootSnap.data() as UserRootDoc, values, groups, dims, ratings };
}

/**
 * Сохраняет оценку по оси и помечает точку «грязной» — вычислитель пересчитает связи.
 * Оба документа — одним атомарным батчем: оценка без флага потерялась бы для пересчёта.
 */
export async function saveRating(uid: Uid, dimId: string, value: number): Promise<void> {
  assertValidRating(value);
  const store = db();

  const batch = writeBatch(store);
  batch.set(doc(store, 'points', uid, 'dims', dimId), { value });
  batch.set(doc(store, 'points', uid), { dirty: true, updated: Date.now(), lastSync: null }, { merge: true });
  await batch.commit();
}

/** Удаляет оценку (крестик на карточке) и тоже помечает точку «грязной». */
export async function removeRating(uid: Uid, dimId: string): Promise<void> {
  const store = db();
  const batch = writeBatch(store);
  batch.delete(doc(store, 'points', uid, 'dims', dimId));
  batch.set(doc(store, 'points', uid), { dirty: true, updated: Date.now(), lastSync: null }, { merge: true });
  await batch.commit();
}

/**
 * Предпросмотр «глазами гостя»: что увидит зритель с такими правами.
 * Чистая функция поверх уже загруженных данных — ни одного обращения к базе.
 */
export function previewAs(data: ProfileScreenData, viewer: Viewer): Record<string, unknown> {
  return visibleTo(data.values, data.root.visibility, viewer);
}

/** Все бакеты, в которых карта видимости размещает хоть одно свойство. */
function bucketsOf(visibility: VisibilityMap, properties: readonly string[]): Set<BucketId> {
  const buckets = new Set<BucketId>();
  for (const property of properties) {
    const audience = visibility[property as keyof VisibilityMap] ?? [];
    for (const bucketId of bucketsForAudience(audience)) buckets.add(bucketId);
  }
  return buckets;
}

/**
 * Сохраняет значения профиля и карту видимости: атомарная перераскладка по бакетам.
 *
 * Смена аудитории свойства обязана быть атомарной (researches/04, §3.5): иначе свойство
 * останется видимым тем, у кого доступ отобрали. Поэтому всё одним `WriteBatch`:
 *   корень (карта видимости) + полная перезапись каждого нужного бакета +
 *   удаление бакетов, опустевших после перераскладки.
 */
export async function saveProfile(
  uid: Uid,
  values: Partial<ProfileData>,
  visibility: VisibilityMap,
  previousVisibility: VisibilityMap,
): Promise<void> {
  assertValidProfile(values);
  assertValidVisibilityMap(visibility);

  const store = db();
  const batch = writeBatch(store);

  // merge углубляется в map: created/lastSignIn внутри time переживают обновление.
  batch.set(
    doc(store, 'users', uid),
    { visibility, time: { updated: Date.now() } },
    { merge: true },
  );

  const nextBuckets = distribute(values, visibility);
  for (const [bucketId, bucketValues] of nextBuckets) {
    // Полная перезапись (без merge): в бакете не должно остаться свойств, ушедших из него.
    batch.set(doc(store, 'users', uid, 'profile', bucketId), bucketValues);
  }

  // Бакеты, где свойства были по старой карте, но не остались по новой, — удаляем.
  const properties = Object.keys(values);
  for (const staleId of bucketsOf(previousVisibility, properties)) {
    if (!nextBuckets.has(staleId)) batch.delete(doc(store, 'users', uid, 'profile', staleId));
  }

  await batch.commit();
}

/** Отправляет заявку на новую ось. Правила требуют authorUid == auth.uid и длину 5…300. */
export async function submitSuggestion(uid: Uid, description: string): Promise<void> {
  const trimmed = description.trim();
  assertValidSuggestion(trimmed);
  await addDoc(collection(db(), 'suggestions'), {
    authorUid: uid,
    description: trimmed,
    created: Date.now(),
  });
}

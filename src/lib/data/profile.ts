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
import { collection, doc, getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { DEV_USER, db, devAuth } from '../firebase.ts';
import { mergeBuckets, visibleTo, type Viewer } from '../model/visibility.ts';
import {
  assertValidRating,
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

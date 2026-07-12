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

import { signInAnonymously, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { DEV_USER, db, devAuth, isStand } from '../firebase.ts';
import { waitForSession } from './account.ts';
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
  /**
   * Мои оценки: dimId → 0…10. Нужны профилю только ради ОДНОЙ цифры — «оценено измерений».
   *
   * Каталога здесь больше НЕТ. Раньше `loadProfileScreen` вычитывал все 5111 документов
   * коллекции `dims` при каждом открытии профиля — и это позор: Firestore берёт деньги за
   * каждое чтение. Слово владельца (2026-07-12): «Я весь первый NDim писал так, чтобы
   * ЭКОНОМИТЬ ЗАПРОСЫ К БАЗЕ!!! Везде, где могу». Каталог живёт на своём экране (`data/dims.ts`),
   * и там он читается ОДНИМ документом-индексом.
   */
  readonly ratings: ReadonlyMap<string, number>;
}

/** Входит на стенд пользователем `dev@ndim.space` и возвращает его uid. */
export async function signInDev(): Promise<Uid> {
  const credentials = await signInWithEmailAndPassword(devAuth(), DEV_USER.email, DEV_USER.password);
  return credentials.user.uid;
}

/**
 * Кто сейчас за экраном.
 *
 *   · **стенд** (localhost) — автоматически входим пользователем стенда: там нет живых людей,
 *     и требовать вход у самого себя незачем (на этом держатся `npm run stand` и e2e);
 *   · **бой** — восстанавливаем СУЩЕСТВУЮЩУЮ сессию из браузера. Если её нет — возвращаем
 *     `null`, и экран честно предлагает войти. Молча заводить человеку анонимную сессию
 *     нельзя: он мог просто открыть страницу.
 *
 * `null` — это не ошибка, а состояние «человек не вошёл».
 */
export async function currentSession(): Promise<Uid | null> {
  if (isStand()) return signInDev();

  const user = await waitForSession();
  return user?.uid ?? null;
}

/**
 * Входит гостем — анонимный вход Firebase (plans/03, этап 2; интервью №004).
 * Мгновенно и без единой формы; при создании аккаунта UID сохранится (linkWith*).
 */
export async function signInGuest(): Promise<Uid> {
  const credentials = await signInAnonymously(devAuth());
  return credentials.user.uid;
}

/** Гость ли текущая сессия (анонимный вход). */
export function isGuestSession(): boolean {
  return devAuth().currentUser?.isAnonymous === true;
}

/** Почта текущего человека. У гостя её нет — и это не ошибка, а его состояние. */
export function currentEmail(): string | null {
  return devAuth().currentUser?.email ?? null;
}

/** Выход из аккаунта («Меню» → «Выйти»). Данные остаются в Пространстве, уходит только сессия. */
export async function signOutUser(): Promise<void> {
  await signOut(devAuth());
}

/**
 * Первый вход гостя: создаёт `users/{uid}`, если его ещё нет, — гостю никто не сеет
 * данные, его пространство рождается пустым. Повторный вызов ничего не трогает.
 */
export async function ensureSpaceExists(uid: Uid, language: 'ru' | 'en' = 'ru'): Promise<void> {
  const store = db();
  const root = await getDoc(doc(store, 'users', uid));
  if (root.exists()) return;

  const now = Date.now();
  const emptyRoot: UserRootDoc = {
    visibility: {},
    settings: { language },
    time: { created: now, updated: now, lastSignIn: now },
    groupCount: 0,
  };
  await setDoc(doc(store, 'users', uid), emptyRoot);
}

/**
 * Штамп «грязной» точки. Гость обязан честно называть свою точку гостевой —
 * правила (`honestGuestFlag` в firestore.rules) отвергнут запись без `guest: true`,
 * а вычислитель по этому флагу не пускает гостя в чужие relations.
 */
function dirtyStamp(): Record<string, unknown> {
  const stamp = { dirty: true, updated: Date.now(), lastSync: null };
  return isGuestSession() ? { ...stamp, guest: true } : stamp;
}

/** Загружает всё содержимое экрана профиля за четыре чтения-коллекции. */
export async function loadProfileScreen(uid: Uid): Promise<ProfileScreenData> {
  const store = db();

  // ⚠️ Каталога `dims` здесь НЕТ и быть не должно: это 5111 документов на каждое открытие
  // профиля. Экономия запросов — принцип автора, унаследованный от 1.x (см. ProfileScreenData).
  const [rootSnap, bucketsSnap, groupsSnap, ratingsSnap] = await Promise.all([
    getDoc(doc(store, 'users', uid)),
    getDocs(collection(store, 'users', uid, 'profile')),
    getDocs(collection(store, 'users', uid, 'groups')),
    getDocs(collection(store, 'points', uid, 'dims')),
  ]);

  if (!rootSnap.exists()) {
    throw new Error(`Профиль не найден: документа users/${uid} нет в базе.`);
  }

  const values = mergeBuckets(bucketsSnap.docs.map((bucket) => bucket.data())) as Partial<ProfileData>;

  const groups = new Map<string, GroupDoc>();
  for (const group of groupsSnap.docs) groups.set(group.id, group.data() as GroupDoc);

  const ratings = new Map<string, number>();
  for (const rating of ratingsSnap.docs) ratings.set(rating.id, (rating.data() as { value: number }).value);

  return { uid, root: rootSnap.data() as UserRootDoc, values, groups, ratings };
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
  batch.set(doc(store, 'points', uid), dirtyStamp(), { merge: true });
  await batch.commit();
}

/** Удаляет оценку (крестик на карточке) и тоже помечает точку «грязной». */
export async function removeRating(uid: Uid, dimId: string): Promise<void> {
  const store = db();
  const batch = writeBatch(store);
  batch.delete(doc(store, 'points', uid, 'dims', dimId));
  batch.set(doc(store, 'points', uid), dirtyStamp(), { merge: true });
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

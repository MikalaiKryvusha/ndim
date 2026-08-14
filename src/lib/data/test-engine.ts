/**
 * ДВИЖОК СТРАНИЦ ТЕСТА — клиентская склейка такта Б (`plans/42`, шаг 3).
 *
 * Модуль ЛЁГКИЙ по канону `funnel.ts`/`session.ts` (EXP-0028): страницы теста приходят из
 * поиска, и Firebase не имеет права попадать в их бандл — слой данных подгружается
 * ДИНАМИЧЕСКИ, только когда человек реально трогает движок или возвращается с маркером сессии.
 *
 * Первая оценка = вход (интервью №009, В3: «вход анонимом замаскирован в интерактив»):
 * нет сессии — молча рождается гость (`signInGuest` → `ensureSpaceExists`), и его оценка
 * уже пишется в настоящий NDim ID. Никаких своих записей в Firestore у теста нет — тот же
 * `saveRating`, что на экране «Измерения» (батч с «грязной» точкой, гость несёт `guest: true`
 * по правилу `honestGuestFlag`).
 */

import type { Lang } from '$lib/content/langs';

/** `ensureSpaceExists` идемпотентен, но стоит чтение — платим им один раз на страницу. */
let ensured = false;

/**
 * Оценки текущей сессии — для вернувшегося человека (гостя или вошедшего).
 *
 * Без маркера сессии в localStorage НЕ ходит в сеть вовсе: маркер — синхронная эвристика
 * «в прошлый раз здесь был вошедший» (`session.ts`, bugs/40), и у пришедшего из поиска
 * незнакомца его нет. Никогда не бросает: не смогли — значит, анкеты в памяти нет.
 */
export async function restoreMyRatings(): Promise<ReadonlyMap<string, number> | null> {
  try {
    const { SESSION_MARK } = await import('./session.ts');
    if (localStorage.getItem(SESSION_MARK) === null) return null;
    const { currentSession } = await import('./profile.ts');
    const uid = await currentSession();
    if (uid === null) return null;
    const { loadMyRatings } = await import('./dims.ts');
    return await loadMyRatings(uid);
  } catch {
    return null;
  }
}

/**
 * Сохраняет оценку; при отсутствии сессии сначала рождает гостя.
 * Возвращает uid — компоненту он нужен только как признак «сессия есть».
 */
export async function saveTestRating(lang: Lang, dimId: string, value: number): Promise<string> {
  const { currentSession, signInGuest, ensureSpaceExists, saveRating } = await import('./profile.ts');

  let uid = await currentSession();
  let created = false;
  if (uid === null) {
    uid = await signInGuest();
    created = true;
  }
  if (!ensured) {
    await ensureSpaceExists(uid, lang);
    ensured = true;
  }
  await saveRating(uid, dimId, value);

  if (created) {
    // Третий шаг воронки — как на экране «Профиль» (plans/03 этап 4). Не ждём и не роняем.
    const { track } = await import('./funnel.ts');
    void track('guest_start');
  }
  return uid;
}

/** Убирает оценку (строка панели-зеркала). Без сессии убирать нечего. */
export async function removeTestRating(dimId: string): Promise<void> {
  const { currentSession, removeRating } = await import('./profile.ts');
  const uid = await currentSession();
  if (uid === null) return;
  await removeRating(uid, dimId);
}

// ── Пара (такт В): один документ testPairs/{id}, решения — plans/42 ──────────────────────

import type { PairAnswers, PairDoc } from '../model/test-pair.ts';
import type { TestSlug } from '../content/test-copy.ts';

/** Кто я в этой вкладке — для ролей пары. null = сессии нет. */
export async function currentUid(): Promise<string | null> {
  const { currentSession } = await import('./profile.ts');
  return currentSession();
}

/**
 * Создаёт пару со СВОЕЙ половиной ответов и возвращает id — он и есть личная ссылка.
 * id длинный и случайный: непубличность держится на неугадываемости (№028), правило
 * отвергает короткие. Сессия к этому моменту есть всегда (ответы уже писались).
 */
export async function createPair(slug: TestSlug, answers: PairAnswers): Promise<string | null> {
  const uid = await currentUid();
  if (uid === null) return null;
  const [{ db }, { doc, setDoc }] = await Promise.all([
    import('../firebase.ts'),
    import('firebase/firestore'),
  ]);
  const id = crypto.randomUUID().replaceAll('-', '');
  const pair: PairDoc = { slug, created: Date.now(), aUid: uid, aAnswers: answers, bUid: null, bAnswers: null };
  await setDoc(doc(db(), 'testPairs', id), pair);
  return id;
}

/** Читает пару по прямой ссылке. null = пары нет (или ссылка не действует). */
export async function loadPair(id: string): Promise<PairDoc | null> {
  const [{ db }, { doc, getDoc }] = await Promise.all([
    import('../firebase.ts'),
    import('firebase/firestore'),
  ]);
  const snapshot = await getDoc(doc(db(), 'testPairs', id));
  return snapshot.exists() ? (snapshot.data() as PairDoc) : null;
}

/**
 * Присоединяет второго: заполняет половину b одним махом. Правила пустят ровно одно такое
 * изменение (bUid был null, a-половина не тронута) — гонка двух «вторых» решится правилами,
 * а не нами: проигравший получит отказ и честную плашку.
 */
export async function joinPair(id: string, base: PairDoc, answers: PairAnswers): Promise<void> {
  const uid = await currentUid();
  if (uid === null) throw new Error('нет сессии');
  const [{ db }, { doc, setDoc }] = await Promise.all([
    import('../firebase.ts'),
    import('firebase/firestore'),
  ]);
  await setDoc(doc(db(), 'testPairs', id), { ...base, bUid: uid, bAnswers: answers });
}

/** Удаляет пару — право любого участника забрать свои ответы (№002 В4). */
export async function deletePair(id: string): Promise<void> {
  const [{ db }, { doc, deleteDoc }] = await Promise.all([
    import('../firebase.ts'),
    import('firebase/firestore'),
  ]);
  await deleteDoc(doc(db(), 'testPairs', id));
}

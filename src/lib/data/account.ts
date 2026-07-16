/**
 * Аккаунт без пароля — апгрейд гостя (plans/03, этап 3; интервью №004, В2 = A+).
 *
 * Способы входа: Google (одно нажатие) и ссылка на почту (passwordless).
 * Паролей в продукте нет.
 *
 * ГЛАВНОЕ ПРАВИЛО: строго `link*`, а не `signIn*`. linkWithCredential/linkWithPopup
 * привязывают новый способ входа к УЖЕ СУЩЕСТВУЮЩЕМУ анонимному пользователю — UID
 * не меняется, поэтому весь труд гостя (оценки, точка, найденные связи) остаётся на
 * месте. Любой `signIn*` создал бы нового пользователя и осиротил бы данные гостя.
 *
 * ⚠️ ТОЧКУ НАДО РАСКЛЕИТЬ. Пока человек был гостем, его точка `points/{uid}` помечена
 * `guest: true` — по этому флагу вычислитель прячет её от всех (В3), а автоочистка
 * удаляет заброшенные гостевые точки через 30 дней. Если после апгрейда флаг не снять,
 * человек с настоящим аккаунтом останется невидимым, а через месяц лишится данных.
 * Поэтому {@link promoteGuestPoint} — обязательная часть апгрейда, а не украшение.
 * Правила это и требуют: `honestGuestFlag` не даст не-анониму писать `guest: true`.
 */

import {
  EmailAuthProvider,
  GoogleAuthProvider,
  getAdditionalUserInfo,
  isSignInWithEmailLink,
  linkWithCredential,
  linkWithPopup,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  type User,
  type UserCredential,
} from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, devAuth, isStand } from '../firebase.ts';
import { SITE_ORIGIN } from '../site.ts';
import type { Uid } from '../model/schema.ts';

/** Куда почтовая ссылка возвращает человека. */
const LINK_RETURN_PATH = '/profile';

/**
 * Origin, на который письмо вернёт человека.
 *
 * В БОЮ — всегда КАНОНИЧЕСКИЙ домен, а не `location.origin`. Поймано на боевом выкате
 * 2026-07-12: владелец запросил ссылку со СТАРОГО адреса `ndim-space.web.app` (его знают
 * 331 человек из 1.x, туда же мы выкатили 2.0), перешёл по ней — и попал на лендинг вместо
 * профиля. Домена нет в authorized domains проекта, и Firebase молча отбрасывает такой
 * `continueUrl`, роняя человека на корень.
 *
 * У продукта один дом — `ndimspace.app` (`site.ts`). Пусть письмо всегда ведёт домой, откуда
 * бы человек ни начал. На стенде — origin как есть, иначе письмо уводило бы разработчика в бой.
 */
function loginLinkOrigin(): string {
  return isStand() ? location.origin : SITE_ORIGIN;
}

/** Ключ, под которым помним почту между отправкой письма и переходом по ссылке. */
const PENDING_EMAIL_KEY = 'ndim-pending-email';

/**
 * Чем закончился апгрейд. Ошибки — не исключения: экран обязан показать их человеку.
 *
 * `created` — аккаунт создан ИМЕННО СЕЙЧАС (апгрейд гостя или первый вход новичка).
 * Обычный вход существующего человека — `created: false`: поздравлять его с «регистрацией»
 * не с чем, он просто вернулся домой (bugs/08.2 — виджет-поздравление показывался
 * всем 331 человеку из 1.x при каждом входе по ссылке).
 */
export type UpgradeResult =
  | { readonly ok: true; readonly uid: Uid; readonly created: boolean }
  | { readonly ok: false; readonly reason: UpgradeFailure };

/** Первый ли это вход человека — Firebase знает это точно, нам выдумывать не надо. */
function isNewUser(credentials: UserCredential): boolean {
  return getAdditionalUserInfo(credentials)?.isNewUser === true;
}

/**
 * Причины отказа, которые экран показывает человеку своими словами.
 * · `already-in-use` — этот Google-аккаунт или почта уже принадлежат другому профилю
 *   NDim. Молча слить два профиля нельзя: чьи-то оценки пришлось бы выбросить.
 * · `cancelled` — человек закрыл окно Google.
 * · `expired-link` — почтовая ссылка протухла (час) или уже использована.
 * · `unknown` — всё остальное; текст ошибки уходит в консоль, человеку — общая фраза.
 */
export type UpgradeFailure = 'already-in-use' | 'cancelled' | 'expired-link' | 'unknown';

function classify(error: unknown): UpgradeFailure {
  const code = (error as { code?: string })?.code ?? '';
  if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
    return 'already-in-use';
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'cancelled';
  }
  if (code === 'auth/invalid-action-code' || code === 'auth/expired-action-code') {
    return 'expired-link';
  }
  console.error('Апгрейд гостя не удался:', error);
  return 'unknown';
}

/**
 * Снимает с точки гостевой флаг и помечает её грязной, чтобы вычислитель немедленно
 * пересчитал связи уже как для полноценного человека. Без этого шага апгрейд —
 * косметика: в Firestore человек остаётся гостем со всеми последствиями.
 *
 * Точки может не быть вовсе (гость не поставил ни одной оценки) — это не ошибка.
 */
async function promoteGuestPoint(uid: Uid): Promise<void> {
  const point = doc(db(), 'points', uid);
  const snapshot = await getDoc(point);
  if (!snapshot.exists()) return;

  await updateDoc(point, { guest: false, dirty: true, updated: Date.now() });
}

/**
 * Токен обязан «забыть», что вход был анонимным: правила смотрят на клейм
 * `firebase.sign_in_provider`, а не на клиентский флаг isAnonymous. Пока токен старый,
 * Firestore продолжает считать человека гостем и отвергнет запись `guest: false`.
 */
async function refreshToken(): Promise<Uid> {
  const user = devAuth().currentUser;
  if (!user) throw new Error('Апгрейд без активной сессии — этого не должно случаться');
  await user.getIdToken(true);
  return user.uid;
}

/** Общий хвост обоих способов: обновить токен, расклеить точку, вернуть тот же UID.
 *  Апгрейд гостя — это всегда рождение аккаунта: `created: true`. */
async function finishUpgrade(): Promise<UpgradeResult> {
  const uid = await refreshToken();
  await promoteGuestPoint(uid);
  return { ok: true, uid, created: true };
}

/**
 * Google в одно нажатие. Ветка выбирается по тому, КТО сейчас в сессии, — и это не деталь:
 *
 *   · сессия ГОСТЯ → `linkWithPopup`: Google привязывается к существующему анонимному
 *     пользователю, UID не меняется, весь труд гостя остаётся при нём;
 *   · сессии НЕТ (человек 1.x вернулся, или новый человек) → `signInWithPopup`: обычный вход
 *     в свой аккаунт. Здесь `link*` был бы бессмыслен: привязывать не к кому.
 *
 * Перепутать эти два случая — значит либо осиротить труд гостя, либо не пустить человека
 * в его собственный профиль.
 */
export async function continueWithGoogle(): Promise<UpgradeResult> {
  const user = devAuth().currentUser;

  try {
    if (user && user.isAnonymous) {
      await linkWithPopup(user, new GoogleAuthProvider());
      return await finishUpgrade();
    }

    const credentials = await signInWithPopup(devAuth(), new GoogleAuthProvider());
    return { ok: true, uid: credentials.user.uid, created: isNewUser(credentials) };
  } catch (error) {
    return { ok: false, reason: classify(error) };
  }
}

/** Старое имя — оставлено для экрана профиля: там это всегда апгрейд гостя. */
export const linkGoogle = continueWithGoogle;

/**
 * Шаг 1 почтового входа: отправляет письмо со ссылкой. Почту запоминаем локально —
 * при переходе по ссылке Firebase обязан сверить её, иначе ссылку можно было бы
 * перехватить и войти в чужой профиль.
 */
export async function sendLoginLink(email: string): Promise<UpgradeResult> {
  try {
    await sendSignInLinkToEmail(devAuth(), email, {
      url: `${loginLinkOrigin()}${LINK_RETURN_PATH}`,
      handleCodeInApp: true,
    });
    localStorage.setItem(PENDING_EMAIL_KEY, email);
    // Письмо отправлено — аккаунта это ещё не создало.
    return { ok: true, uid: devAuth().currentUser?.uid ?? '', created: false };
  } catch (error) {
    return { ok: false, reason: classify(error) };
  }
}

/** Открыт ли сейчас адрес, по которому человек пришёл из письма. */
export function isLoginLink(href: string = location.href): boolean {
  return isSignInWithEmailLink(devAuth(), href);
}

/**
 * Ждёт, пока Firebase восстановит сессию из хранилища браузера.
 *
 * Сразу после загрузки страницы `currentUser` ещё null — восстановление асинхронное.
 * Человек, вернувшийся по ссылке из письма, ДОЛЖЕН попасть в свою же гостевую сессию,
 * иначе привязывать будет некого и труд гостя осиротеет. Поэтому перед апгрейдом
 * дожидаемся первого события состояния, а не читаем `currentUser` наугад.
 */
export function waitForSession(): Promise<User | null> {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(devAuth(), (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

/**
 * Шаг 2 почтового входа: человек вернулся по ссылке из письма.
 *
 * Та же развилка, что и в Google:
 *   · сессия ГОСТЯ → `linkWithCredential`: почта привязывается к анонимному пользователю,
 *     UID и весь его труд остаются прежними;
 *   · сессии НЕТ → `signInWithEmailLink`: обычный вход. Для 331 человека из 1.x это и есть
 *     их дверь: у них аккаунты с паролем, а паролей в 2.0 нет. Вход по ссылке ЗАОДНО
 *     подтверждает почту — а без подтверждённой почты правила 2.0 не показали бы им ничего
 *     (в боевой базе 109 неподтверждённых). То есть этот шаг чинит их сам, без нашего вмешательства.
 */
export async function completeLoginLink(href: string = location.href): Promise<UpgradeResult> {
  const email = localStorage.getItem(PENDING_EMAIL_KEY);
  if (!email) return { ok: false, reason: 'expired-link' };

  const user = devAuth().currentUser;

  try {
    if (user && user.isAnonymous) {
      await linkWithCredential(user, EmailAuthProvider.credentialWithLink(email, href));
      localStorage.removeItem(PENDING_EMAIL_KEY);
      return await finishUpgrade();
    }

    const credentials = await signInWithEmailLink(devAuth(), email, href);
    localStorage.removeItem(PENDING_EMAIL_KEY);
    // Для 331 человека из 1.x это обычный вход (created: false); для новичка, начавшего
    // с почты на экране входа, — рождение аккаунта. Firebase различает это за нас.
    return { ok: true, uid: credentials.user.uid, created: isNewUser(credentials) };
  } catch (error) {
    return { ok: false, reason: classify(error) };
  }
}

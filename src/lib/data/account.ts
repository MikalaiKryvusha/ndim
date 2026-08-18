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
 * `guest: true` — по этому флагу сервер синхронизации прячет её от всех (В3), а автоочистка
 * удаляет заброшенные гостевые точки через 30 дней. Если после апгрейда флаг не снять,
 * человек с настоящим аккаунтом останется невидимым, а через месяц лишится данных.
 * Поэтому {@link promoteGuestPoint} — обязательная часть апгрейда, а не украшение.
 * Правила это и требуют: `honestGuestFlag` не даст не-анониму писать `guest: true`.
 */

import {
  EmailAuthProvider,
  GoogleAuthProvider,
  applyActionCode,
  checkActionCode,
  getAdditionalUserInfo,
  isSignInWithEmailLink,
  linkWithCredential,
  linkWithPopup,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  verifyBeforeUpdateEmail,
  type User,
  type UserCredential,
} from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, devAuth, isStage, isStand } from '../firebase.ts';
import { SITE_ORIGIN } from '../site.ts';
import type { Uid } from '../model/schema.ts';

/** Куда почтовая ссылка возвращает человека. */
const LINK_RETURN_PATH = '/profile';

/**
 * Способ входа, ПОКАЗЫВАЕМЫЙ человеку на экране «Управлять аккаунтом».
 *
 * 🔴 ЗДЕСЬ ЛЕЖИТ КАПКАН, СТОИВШИЙ ОТДЕЛЬНОГО ЗАМЕРА (`EXP-0109`, `researches/24` §7.2).
 *
 * `providerData` НЕ отличает «у человека есть пароль» от «человек входит по ссылке на почту».
 * У обоих `providerId === 'password'`. Это не причуда эмулятора — так написано в самих типах SDK:
 *
 *     static readonly PROVIDER_ID: 'password';
 *     /** Always set to {@link ProviderId}.PASSWORD, **even for email link**. *\/
 *
 * Различие живёт в `signInMethod` (`password` против `emailLink`), а единственный клиентский API,
 * который его отдавал — `fetchSignInMethodsForEmail`, — устарел и при включённой в БОЮ защите от
 * перечисления почт (проверено 2026-08-01: `enableImprovedEmailPrivacy: true`) всегда возвращает
 * пустой список.
 *
 * Поэтому здесь ровно два значения, и оба — правда:
 *   · `google` — вход через Google;
 *   · `email`  — вход почтой. КАКОЙ ИМЕННО (ссылка или пароль) — мы не знаем и не пишем.
 *
 * ⚠️ Не поддавайся соблазну дописать сюда `password` и вывести «Пароль не задан»: это выдумка,
 * а не факт. Как отличать — вопрос владельцу В10 (`interviews/interview_008`), и ответ приедет
 * вместе с фазой 7 эпика (`plans/15`).
 */
export type SignInMethod = 'google' | 'email';

/** Что экран «Управлять аккаунтом» знает о человеке. Всё — из Auth: в Firestore этого нет. */
export interface AccountFacts {
  /** Почта из Auth. У гостя её нет — и это его состояние, а не ошибка. */
  readonly email: string | null;
  /** Подтверждена ли почта. Без подтверждения правила 2.0 не показывают человеку ничего. */
  readonly emailVerified: boolean;
  /** Когда заведена учётная запись. Истина живёт в Auth, а не в `users/{uid}.time.created`
   *  (`EXP-0039`: идентичность разрешай через Auth). */
  readonly createdAt: number | null;
  /** Чем человек входит. См. {@link SignInMethod} — про пароль здесь СОЗНАТЕЛЬНО ничего нет. */
  readonly methods: readonly SignInMethod[];
  /** Гость (анонимный вход): почты нет, управлять нечем. */
  readonly guest: boolean;
}

function methodsOf(user: User): readonly SignInMethod[] {
  const seen = new Set<SignInMethod>();
  for (const provider of user.providerData) {
    if (provider.providerId === GoogleAuthProvider.PROVIDER_ID) seen.add('google');
    // 'password' у Firebase означает «вход почтой» — и ссылкой, и паролем (см. SignInMethod).
    else if (provider.providerId === EmailAuthProvider.PROVIDER_ID) seen.add('email');
  }
  return [...seen];
}

/**
 * Снимок аккаунта для экрана. `null` — сессии нет вовсе (человек не вошёл).
 *
 * Читается из живого объекта `User`, БЕЗ единого запроса к базе: всё нужное Firebase уже держит
 * в сессии. Это прямое следствие канона проекта «экономить запросы к базе».
 */
export function currentAccount(): AccountFacts | null {
  const user = devAuth().currentUser;
  if (user === null) return null;

  const created = user.metadata.creationTime;
  return {
    email: user.email,
    emailVerified: user.emailVerified,
    // `creationTime` — строка RFC 1123 либо `undefined`; выдумывать «сейчас» вместо
    // отсутствующей даты нельзя (PHILOSOPHY: отсутствующее честнее выдуманного).
    createdAt: created === undefined ? null : Date.parse(created),
    methods: methodsOf(user),
    guest: user.isAnonymous,
  };
}

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
 *
 * 🔴 И ТО ЖЕ САМОЕ ДЛЯ СТЕЙДЖА (`bugs/129`, 2026-08-15). Правило «всё, что не стенд, — бой»
 * пережило появление третьего контура и сломало на нём вход: приложение стейджа просило Firebase
 * отправить ссылку на `ndimspace.app`, которого нет в authorized domains проекта `ndim-stage`, —
 * тот отказывал, и человек видел «Не удалось создать аккаунт». Поймал владелец, живой попыткой
 * войти. Условие теперь называет ДОМ, а не отсутствие стенда: канонический домен принадлежит
 * бою, у остальных контуров дом — их собственный origin.
 */
function loginLinkOrigin(): string {
  return isStand() || isStage() ? location.origin : SITE_ORIGIN;
}

/** Ключ, под которым помним почту между отправкой письма и переходом по ссылке. */
const PENDING_EMAIL_KEY = 'ndim-pending-email';

/**
 * Ключ, под которым помним НАМЕРЕНИЕ — зачем человек ввёл почту (bugs/84, интервью №007 В4).
 *
 * Слово владельца: «не понимает разницы между гостем и попыткой использовать чужой email —
 * это разные состояния, и должны быть разные поведения приложения, а не всё смешивать в кучу».
 *
 * Корень был именно здесь: продукт хранил почту и ВЫБРАСЫВАЛ намерение, а путь входа выбирал
 * по сессии (`if (user.isAnonymous)`). Один раз нажав «Осмотреться гостем» в этом браузере,
 * человек навсегда получал чтение «привяжи почту к гостю» — и своя же почта возвращалась
 * ошибкой «уже связан с другим профилем». Теперь намерение живёт рядом с почтой и переживает
 * тот же путь: отправку письма, закрытие вкладки, возврат по ссылке.
 *
 * `upgrade` — «сохранить мои результаты» (гость становится аккаунтом, UID и труд сохраняются);
 * `signin` — «у меня уже есть аккаунт» (человек идёт домой, труд гостя с ним не переезжает).
 */
const PENDING_INTENT_KEY = 'ndim-pending-intent';

/** Зачем человек ввёл почту. По умолчанию — апгрейд: так вёл себя продукт до bugs/84. */
export type LoginIntent = 'upgrade' | 'signin';

/**
 * Намерение, с которым запрашивали письмо. Читается ДО {@link completeLoginLink}: от него
 * зависит, надо ли сперва отпустить гостевую сессию (это делает экран — см. `finishEmailLink`).
 */
export function pendingIntent(): LoginIntent {
  return localStorage.getItem(PENDING_INTENT_KEY) === 'signin' ? 'signin' : 'upgrade';
}

/** Забыть почту и намерение — обе половины одной записи, снимаются вместе. */
function forgetPending(): void {
  localStorage.removeItem(PENDING_EMAIL_KEY);
  localStorage.removeItem(PENDING_INTENT_KEY);
}

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
 * Снимает с точки гостевой флаг и помечает NDim ID обновлённым, чтобы сервер синхронизации немедленно
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
export async function sendLoginLink(
  email: string,
  intent: LoginIntent = 'upgrade',
  /**
   * Куда вернуть человека. По умолчанию — «Профиль», но публичная страница удаления
   * (`/delete-account`) обязана вернуть его К СЕБЕ: он пришёл туда снаружи, потому что
   * приложения у него может уже не быть, и высадить его в «Профиле» значило бы отправить
   * искать кнопку заново — ровно то, что запрещает требование Google Play к веб-ссылке.
   */
  returnPath: string = LINK_RETURN_PATH,
): Promise<UpgradeResult> {
  try {
    await sendSignInLinkToEmail(devAuth(), email, {
      url: `${loginLinkOrigin()}${returnPath}`,
      handleCodeInApp: true,
    });
    localStorage.setItem(PENDING_EMAIL_KEY, email);
    // Намерение кладём РЯДОМ с почтой и в тот же момент: они бессмысленны по отдельности.
    localStorage.setItem(PENDING_INTENT_KEY, intent);
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
 *
 * ⚠️ РАЗВИЛКУ РЕШАЕТ НАМЕРЕНИЕ, А НЕ ТОЛЬКО СЕССИЯ (bugs/84). Сессия отвечает на вопрос «кто
 * сейчас в браузере», а нужен ответ на «чего человек хотел». Гостевая сессия при намерении
 * `signin` обязана быть отпущена ДО этого вызова — это делает экран (`finishEmailLink` в
 * `profile/+page.svelte`), потому что выход тянет за собой очистку кэшей и лиц (`signOutUser`),
 * а тащить их сюда значило бы замкнуть импорты `account` ↔ `profile`.
 */
export async function completeLoginLink(href: string = location.href): Promise<UpgradeResult> {
  const email = localStorage.getItem(PENDING_EMAIL_KEY);
  if (!email) return { ok: false, reason: 'expired-link' };

  const user = devAuth().currentUser;

  try {
    if (user && user.isAnonymous) {
      await linkWithCredential(user, EmailAuthProvider.credentialWithLink(email, href));
      forgetPending();
      return await finishUpgrade();
    }

    const credentials = await signInWithEmailLink(devAuth(), email, href);
    forgetPending();
    // Для 331 человека из 1.x это обычный вход (created: false); для новичка, начавшего
    // с почты на экране входа, — рождение аккаунта. Firebase различает это за нас.
    return { ok: true, uid: credentials.user.uid, created: isNewUser(credentials) };
  } catch (error) {
    return { ok: false, reason: classify(error) };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   УПРАВЛЕНИЕ СВОИМ АККАУНТОМ — фаза 5 эпика `plans/15` (операционный план `plans/19`).

   Всё, что ниже, делает НЕОБРАТИМОЕ: меняет почту, которой человек входит. Поэтому здесь
   больше комментариев, чем кода — каждая развилка стоила отдельного замера.
   ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Куда возвращает ссылка ПОДТВЕРЖДЕНИЯ ЛИЧНОСТИ — на тот же экран, откуда человек ушёл.
 *
 * 🔴 Комментарий говорил это и раньше, а код — нет: путь был зашит константой `/account`, и
 * человек, начавший удаление на ПУБЛИЧНОЙ странице `/delete-account`, возвращался письмом в
 * приватный экран «Управлять аккаунтом». Удаление там доводилось до конца, поэтому дефект был
 * невидим, — но: (а) обещание «вернётесь СЮДА» не исполнялось; (б) ветка `isReauthLink()` на
 * самой публичной странице оказывалась мёртвым кодом, который никто никогда не исполнял;
 * (в) требование Google Play звучит как «не отсылая человека обратно в приложение», а мы делали
 * ровно это. Найдено живым прогоном 2026-08-01 (`tools/verify-delete-door.mjs`).
 *
 * Теперь путь передаётся вызывающим экраном, а константа осталась умолчанием для «Управлять
 * аккаунтом» — того единственного места, где она и была верна.
 */
const REAUTH_RETURN_PATH = '/account';

/** Ключ: на какую почту ушла ссылка подтверждения. Живёт отдельно от ключей ВХОДА
 *  (`ndim-pending-email`) намеренно: это разные истории, и смешивать их — реплей `bugs/84`. */
const REAUTH_EMAIL_KEY = 'ndim-reauth-email';

/** Ключ: что человек просил сделать ДО того, как мы отправили его подтверждать личность.
 *  Без него возврат по ссылке — возврат в никуда: намерение потеряно вместе с вкладкой. */
const PENDING_OP_KEY = 'ndim-account-op';

/**
 * Отложенная операция, ждущая подтверждения личности.
 *
 * Их две, и обе НЕОБРАТИМЫ, поэтому подтверждение обязано состояться ДО действия, а не после:
 * у удаления «после» не существует — данных уже нет.
 */
export type PendingOp =
  /** Смена почты: новый адрес человек ввёл ДО подтверждения. */
  | { readonly op: 'change-email'; readonly newEmail: string }
  /** Удаление аккаунта: подтверждать нечего, кроме личности. */
  | { readonly op: 'delete-account' };

/**
 * Чем подтверждать личность. Почему подтверждение здесь вообще есть:
 *
 * По документации Firebase `verifyBeforeUpdateEmail` — единственный из чувствительных методов,
 * у которого в reference НЕТ пометки «требует недавнего входа» (`researches/24` §1.2). То есть
 * платформа, возможно, пустила бы и без него. Мы всё равно требуем:
 *
 *   · OWASP ASVS 5.0, 7.5.1 (L2): перед изменением атрибутов, влияющих на аутентификацию —
 *     а почта именно такой, — нужна ПОЛНАЯ повторная аутентификация;
 *   · OWASP Authentication Cheat Sheet: без второго фактора планка ВЫШЕ — смену адреса
 *     положено подтверждать и со СТАРОГО адреса тоже.
 *
 * И тут наш путь оказывается изящнее, чем кажется. Ссылка подтверждения уходит на ТЕКУЩИЙ
 * адрес — значит она И ЕСТЬ то подтверждение со старого адреса, которого требует OWASP. Заодно
 * это снимает зависимость от письма-отката Firebase, которое в замере фазы 2 не пришло ни разу
 * (`researches/24` §7.3): защита от угона держится не на чужом письме, а на том, что старый
 * адрес обязан был активно согласиться.
 */
export type ReauthWay = 'google' | 'email-link';

/**
 * Каким способом подтверждать личность ЭТОМУ человеку.
 *
 * ⚠️ Здесь снова капкан `EXP-0109`: провайдер `password` означает «вход почтой» и НЕ говорит,
 * пароль это или ссылка. Поэтому для всех почтовых аккаунтов путь ОДИН — ссылка. Это не
 * упрощение от лени: вход по ссылке работает и у тех 331, у кого пароль есть, а спросить
 * «пароль или ссылка?» мы не можем, потому что не знаем ответа сами.
 *
 * Google — отдельный путь: popup, без круга через почту.
 * `null` — подтверждать нечем (гость); операции над аккаунтом ему недоступны.
 */
export function reauthWay(): ReauthWay | null {
  const user = devAuth().currentUser;
  if (user === null || user.isAnonymous) return null;
  const ways = methodsOf(user);
  if (ways.includes('google')) return 'google';
  return ways.includes('email') ? 'email-link' : null;
}

/** Отказы операций над аккаунтом. Каждый показывается человеку своими словами (см. ниже). */
export type AccountFailure =
  | 'requires-recent-login'
  | 'invalid-credential'
  | 'email-in-use'
  | 'invalid-email'
  | 'too-many-requests'
  | 'network'
  | 'cancelled'
  | 'other-device'
  | 'expired-code'
  | 'no-session'
  | 'unknown';

function classifyAccount(error: unknown): AccountFailure {
  const code = (error as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/requires-recent-login':
    case 'auth/user-token-expired':
      return 'requires-recent-login';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-mismatch':
      return 'invalid-credential';
    case 'auth/email-already-in-use':
      return 'email-in-use';
    case 'auth/invalid-email':
      return 'invalid-email';
    case 'auth/too-many-requests':
      return 'too-many-requests';
    case 'auth/network-request-failed':
      return 'network';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'cancelled';
    case 'auth/expired-action-code':
    case 'auth/invalid-action-code':
      return 'expired-code';
    default:
      console.error('Операция над аккаунтом не удалась:', error);
      return 'unknown';
  }
}

/**
 * Тексты отказов — ЯЗЫК ВЛАДЕЛЬЦА, снятый из 1.x дословно (`researches/24` §2.6).
 *
 * Переписывать их нельзя: это его формулировки, прожившие в бою два года. Новые строки (те,
 * которых в 1.x не было, — отмена popup, чужое устройство) написаны по правилам текста продукта:
 * обращение на «Вы», ноль жаргона, никакого «навсегда».
 */
export function accountErrorText(reason: AccountFailure, lang: 'ru' | 'en'): string {
  const texts: Record<AccountFailure, { ru: string; en: string }> = {
    // Дословно 1.x.
    'requires-recent-login': {
      ru: 'Эта операция конфиденциальна и требует недавней аутентификации. Авторизуйтесь еще раз, прежде чем повторить эту операцию.',
      en: 'This operation is sensitive and requires recent authentication. Please sign in again before retrying.',
    },
    'invalid-credential': {
      ru: 'Предоставленные учетные данные неверны.',
      en: 'The provided credentials are incorrect.',
    },
    'email-in-use': {
      ru: 'Этот адрес электронной почты уже используется другой учетной записью.',
      en: 'This email address is already in use by another account.',
    },
    'invalid-email': {
      ru: 'Неверный формат адреса электронной почты.',
      en: 'The email address is badly formatted.',
    },
    'too-many-requests': {
      ru: 'Слишком много запросов. Пожалуйста, повторите попытку позже.',
      en: 'Too many requests. Please try again later.',
    },
    // Новые — в 1.x их не было.
    network: {
      ru: 'Нет связи с сервером. Проверьте подключение и попробуйте ещё раз.',
      en: 'No connection to the server. Check your network and try again.',
    },
    cancelled: {
      ru: 'Подтверждение отменено.',
      en: 'Confirmation cancelled.',
    },
    // Официальная оговорка Firebase: поток может завершиться на ДРУГОМ устройстве, где человек
    // не вошёл, — и тогда не завершится вовсе. Молчать об этом нельзя (`researches/24` §1.5).
    'other-device': {
      ru: 'Похоже, ссылку открыли на другом устройстве. Откройте её там же, где начинали, — иначе мы не сможем убедиться, что это Вы.',
      en: 'It looks like the link was opened on another device. Open it where you started — otherwise we cannot confirm it is you.',
    },
    'expired-code': {
      ru: 'Срок действия ссылки истёк или она уже использована. Запросите новую.',
      en: 'The link has expired or has already been used. Please request a new one.',
    },
    'no-session': {
      ru: 'Сессия закончилась. Войдите заново.',
      en: 'Your session has ended. Please sign in again.',
    },
    unknown: { ru: 'Что-то пошло не так.', en: 'Something went wrong.' },
  };
  return texts[reason][lang];
}

/** Итог операции над аккаунтом. Отказ — не исключение: экран обязан показать его человеку. */
export type AccountResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: AccountFailure };

/** Запомнить, что человек просил сделать, — на время круга через почту. */
export function rememberPendingOp(op: PendingOp): void {
  localStorage.setItem(PENDING_OP_KEY, JSON.stringify(op));
}

/** Что человек просил сделать до подтверждения личности. `null` — ничего не ждёт. */
export function pendingOp(): PendingOp | null {
  const raw = localStorage.getItem(PENDING_OP_KEY);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as { op?: unknown; newEmail?: unknown };
    if (value.op === 'delete-account') return { op: 'delete-account' };
    if (value.op === 'change-email' && typeof value.newEmail === 'string') {
      return { op: 'change-email', newEmail: value.newEmail };
    }
    return null;
  } catch {
    // Испорченная запись — не повод падать: считаем, что ничего не ждёт.
    return null;
  }
}

/** Забыть отложенную операцию и адрес подтверждения — половинки одной записи, снимаются вместе. */
export function forgetPendingOp(): void {
  localStorage.removeItem(PENDING_OP_KEY);
  localStorage.removeItem(REAUTH_EMAIL_KEY);
}

/** Подтверждение личности через Google — popup, без круга через почту. */
export async function reauthWithGoogle(): Promise<AccountResult> {
  const user = devAuth().currentUser;
  if (user === null) return { ok: false, reason: 'no-session' };
  try {
    await reauthenticateWithPopup(user, new GoogleAuthProvider());
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: classifyAccount(error) };
  }
}

/**
 * Шаг 1 подтверждения по почте: письмо со ссылкой на ТЕКУЩИЙ адрес человека.
 *
 * ⚠️ `handleCodeInApp: true` здесь ОБЯЗАТЕЛЕН, и это не копипаста: он нужен именно ссылкам
 * ВХОДА (`sendSignInLinkToEmail`), а сбросу пароля и `verifyBeforeUpdateEmail` — не нужен
 * (уточнено состязательной проверкой, `researches/24` §1.2). Здесь мы шлём ссылку входа.
 *
 * ⚠️ `auth.languageCode` — без него письмо приходит по-английски. Деталь из 1.x, которую легко
 * потерять (`researches/24` §2.5).
 */
export async function sendReauthLink(
  lang: 'ru' | 'en' = 'ru',
  returnPath: string = REAUTH_RETURN_PATH,
): Promise<AccountResult> {
  const user = devAuth().currentUser;
  const email = user?.email ?? null;
  if (user === null || email === null) return { ok: false, reason: 'no-session' };

  try {
    const auth = devAuth();
    auth.languageCode = lang;
    await sendSignInLinkToEmail(auth, email, {
      url: `${loginLinkOrigin()}${returnPath}`,
      handleCodeInApp: true,
    });
    localStorage.setItem(REAUTH_EMAIL_KEY, email);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: classifyAccount(error) };
  }
}

/** Открыт ли сейчас адрес, по которому человек вернулся из письма ПОДТВЕРЖДЕНИЯ. */
export function isReauthLink(href: string = location.href): boolean {
  return localStorage.getItem(REAUTH_EMAIL_KEY) !== null && isSignInWithEmailLink(devAuth(), href);
}

/**
 * Шаг 2: человек вернулся по ссылке подтверждения.
 *
 * 🔴 Сессия обязана быть ЖИВОЙ: мы подтверждаем личность уже вошедшего, а не входим заново.
 * Если человек открыл письмо на другом устройстве, `currentUser` там пуст — и честный ответ
 * «откройте там же, где начинали» лучше молчаливого зависания.
 */
export async function completeReauthLink(href: string = location.href): Promise<AccountResult> {
  const email = localStorage.getItem(REAUTH_EMAIL_KEY);
  const user = devAuth().currentUser;
  if (email === null) return { ok: false, reason: 'expired-code' };
  if (user === null) return { ok: false, reason: 'other-device' };

  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credentialWithLink(email, href));
    localStorage.removeItem(REAUTH_EMAIL_KEY);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: classifyAccount(error) };
  }
}

/**
 * Смена почты — единственным путём, который оставляет платформа.
 *
 * 🔴 `updateEmail` НЕ ИСПОЛЬЗУЕТСЯ и использован быть не может: при включённой защите от
 * перечисления почт (в боевом проекте она ВКЛЮЧЕНА — замерено 2026-08-01) он падает с
 * `auth/operation-not-allowed` на всех платформах. Живёт только `verifyBeforeUpdateEmail`:
 * письмо уходит на НОВЫЙ адрес, и почта меняется, лишь когда человек перейдёт по ссылке.
 *
 * 🔴 И главное для текстов экрана: письмо отправляется, ТОЛЬКО если новый адрес ещё не занят, —
 * а ошибки при этом нет, promise просто резолвится. Значит `ok: true` здесь НЕ означает «письмо
 * ушло». Экран обязан говорить нейтрально: «если адрес свободен, письмо уже в пути». Сказать
 * «письмо отправлено» — соврать половине людей, а сказать «адрес занят» — вернуть ту самую
 * утечку, которую платформа только что закрыла (ASVS 6.3.8).
 */
export async function requestEmailChange(
  newEmail: string,
  lang: 'ru' | 'en' = 'ru',
): Promise<AccountResult> {
  const user = devAuth().currentUser;
  if (user === null) return { ok: false, reason: 'no-session' };

  try {
    const auth = devAuth();
    auth.languageCode = lang;
    // `handleCodeInApp` здесь НЕ нужен — это не ссылка входа (см. `sendReauthLink`).
    await verifyBeforeUpdateEmail(user, newEmail, {
      url: `${loginLinkOrigin()}${REAUTH_RETURN_PATH}`,
    });
    forgetPendingOp();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: classifyAccount(error) };
  }
}

/* ── СТРАНИЦА-ОБРАБОТЧИК ПОЧТОВЫХ ДЕЙСТВИЙ (`/auth/action`) ──────────────────────────────────
   Firebase шлёт человеку письма со ссылками, и каждая ведёт на «страницу действий». По
   умолчанию это страница Firebase — английская, чужая. Своя даёт русский текст и наш вид;
   доки требуют от неё лишь «веб-страницу, использующую Firebase JS SDK», так что `adapter-static`
   не мешает: маршрут пререндерится, всю работу делает клиентский JS (`researches/24` §5, п. 2).

   🔴 РЕЖИМ `recoverEmail` ОБЯЗАТЕЛЕН. Если своя страница появится, но этот режим не умеет —
   ссылка «это была не я, верните адрес» приведёт человека в никуда. Именно поэтому переключать
   Action URL в консоли можно только тогда, когда страница знает ВСЕ режимы (`plans/19`, капкан 4).
   ─────────────────────────────────────────────────────────────────────────────────────────── */

/** Что именно просит сделать ссылка из письма. */
export type ActionKind =
  /** Подтвердить новый адрес и применить смену почты. */
  | 'verify-and-change-email'
  /** Откатить смену почты — письмо приходит на СТАРЫЙ адрес. */
  | 'recover-email'
  /** Подтвердить адрес. */
  | 'verify-email'
  /** Сброс пароля. Приёмник появится вместе с самим паролем — фаза 7. */
  | 'reset-password'
  | 'unknown';

/** Что известно о ссылке ДО того, как мы её применим. Читается без побочных действий. */
export interface ActionInfo {
  readonly kind: ActionKind;
  /**
   * Адрес, К КОТОРОМУ ведёт действие:
   *   · `verify-and-change-email` — новый адрес;
   *   · `recover-email` — адрес, на который вернёмся;
   *   · `verify-email` — подтверждаемый адрес.
   */
  readonly email: string | null;
  /** Адрес ДО действия. Firebase отдаёт его только для смены и отката. */
  readonly previousEmail: string | null;
}

function actionKind(operation: string): ActionKind {
  switch (operation) {
    case 'VERIFY_AND_CHANGE_EMAIL':
      return 'verify-and-change-email';
    case 'RECOVER_EMAIL':
      return 'recover-email';
    case 'VERIFY_EMAIL':
      return 'verify-email';
    case 'PASSWORD_RESET':
      return 'reset-password';
    default:
      return 'unknown';
  }
}

/**
 * Прочитать ссылку, НЕ применяя её.
 *
 * Порядок «сначала показать, потом применить» — из официального образца обработчика: человек
 * должен увидеть, ЧТО с ним сейчас произойдёт, до того как это произойдёт. Особенно на откате:
 * там важно назвать оба адреса.
 */
export async function inspectActionCode(
  code: string,
): Promise<{ readonly ok: true; readonly info: ActionInfo } | { readonly ok: false; readonly reason: AccountFailure }> {
  try {
    const info = await checkActionCode(devAuth(), code);
    return {
      ok: true,
      info: {
        kind: actionKind(info.operation),
        email: info.data.email ?? null,
        previousEmail: info.data.previousEmail ?? null,
      },
    };
  } catch (error) {
    return { ok: false, reason: classifyAccount(error) };
  }
}

/**
 * Применить ссылку.
 *
 * ⚠️ `applyActionCode` принимает `auth` и КОД ИЗ ССЫЛКИ, а не объект пользователя — частая
 * ошибка по памяти (уточнено состязательной проверкой, `researches/24` §1.2).
 *
 * ⚠️ Сессия здесь НЕ обязательна: письмо могло прийти человеку, который давно вышел, и это
 * нормальный случай — код самодостаточен.
 */
export async function applyAction(code: string): Promise<AccountResult> {
  try {
    await applyActionCode(devAuth(), code);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: classifyAccount(error) };
  }
}

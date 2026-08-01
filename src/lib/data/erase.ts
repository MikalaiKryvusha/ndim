/**
 * УДАЛЕНИЕ АККАУНТА — фаза 8 эпика `plans/15` (операционный план `plans/20`).
 *
 * Отдельный модуль, а не строки в `account.ts`, потому что это самая опасная операция продукта:
 * она уничтожает труд многих месяцев, и вернуть его нечем. Такой код заслуживает собственного
 * дома, где видно всё сразу.
 *
 * ═══ ПОРЯДОК — ГЛАВНОЕ ЗДЕСЬ, И ОН ОБРАТЕН 1.x ═══
 *
 * Сначала ДАННЫЕ, потом учётная запись. `deleteUser` описан как «Deletes and signs out the user»:
 * после него человек уже не аутентифицирован, правила его не пустят, и всё, что осталось,
 * станет неудаляемым навсегда.
 *
 * В 1.x было наоборот и хуже: `deleteDocumentById` глушил ошибки внутри себя, поэтому
 * `deleteUser` выполнялся ДАЖЕ ЕСЛИ данные не удалились (`app.js:9697-9711`). Человек терял
 * вход, а данные оставались в базе. Здесь гарантия обратная: **не удалилось — учётную запись
 * не трогаем и честно говорим, что осталось.**
 *
 * ═══ ЧТО УДАЛЯЕТСЯ (перечень снят с firestore.rules построчно, `plans/20` шаг 0) ═══
 *
 * Firestore не удаляет подколлекции вместе с документом — четыре из них вычищаются поштучно.
 *
 * ⚠️ ЧЕГО ЗДЕСЬ НЕТ И БЫТЬ НЕ МОЖЕТ: свой `relations/{uid}` (клиенту запись запрещена
 * полностью), членство в ЧУЖИХ группах, подсказка аудитории у другого, свои предложения
 * измерений (`allow update, delete: if isAdmin()`). Их вычищает суточный проход сервера
 * синхронизации — решение владельца В11 = А, 2026-08-01. Человеку об этом говорится честно:
 * «из чужих списков связей Вы исчезнете в течение суток».
 */
import { deleteUser } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  type CollectionReference,
  type Query,
} from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';

import { db, devAuth, storage } from '../firebase.ts';
import type { Uid } from '../model/schema.ts';

/** Тот же путь, по которому фотография читается (`avatar.ts`). Наследие 1.x, менять нельзя. */
const avatarPath = (uid: Uid) => `users/${uid}/avatar/avatar.webp`;

/**
 * Итог удаления.
 *
 * `ok: false` означает ровно одно: **учётная запись цела**, человек по-прежнему может войти.
 * Это не утешительный приз, а суть гарантии — потерять вход, не потеряв данные, худшее из
 * возможных состояний.
 */
export type EraseResult =
  | { readonly ok: true; readonly removed: number }
  | { readonly ok: false; readonly stoppedAt: string; readonly detail: string };

/** Сколько документов удаляем за один заход. Больше — дольше держим человека в неопределённости. */
const PAGE = 200;

/**
 * Вычищает коллекцию (или результат запроса) поштучно и возвращает число удалённого.
 *
 * Батч Firestore здесь сознательно НЕ используется: он атомарен, а нам нужна обратная
 * гарантия — «удалили сколько смогли, и честно знаем, где остановились». Атомарный батч на
 * обрыве откатил бы уже удалённое и заставил бы начинать сначала.
 */
async function eraseAll(source: CollectionReference | Query): Promise<number> {
  let removed = 0;
  for (;;) {
    const page = await getDocs(source);
    if (page.empty) return removed;
    for (const found of page.docs) {
      await deleteDoc(found.ref);
      removed += 1;
    }
    // Коллекция могла быть длиннее страницы: повторяем, пока не опустеет.
    if (page.size < PAGE) return removed;
  }
}

/**
 * Удаляет всё, что человек вправе удалить, и только потом — учётную запись.
 *
 * Останавливается на ПЕРВОЙ неудаче: дальше идти нельзя, потому что каждый следующий шаг
 * приближает `deleteUser`, после которого остатки станут вечными.
 */
export async function eraseAccount(uid: Uid): Promise<EraseResult> {
  const store = db();
  let removed = 0;

  // Шаг 1 — фотография. Первой, потому что она единственная живёт вне Firestore, и забыть
  // её проще всего: ровно это и случилось в 1.x, где аватар переживал удаление аккаунта.
  try {
    await deleteObject(ref(storage(), avatarPath(uid)));
    removed += 1;
  } catch (error) {
    const code = (error as { code?: string })?.code ?? '';
    // Фотографии просто нет — это норма, а не сбой (поведение 1.x, `researches/24` §2).
    if (code !== 'storage/object-not-found') {
      return { ok: false, stoppedAt: 'фотография', detail: code || String(error) };
    }
  }

  // Шаг 2 — подколлекции. Firestore не удаляет их вместе с документом.
  const groupsRef = collection(store, 'users', uid, 'groups');
  try {
    // Состав групп лежит НА УРОВЕНЬ ГЛУБЖЕ самих групп: сначала участники, потом группы,
    // иначе участники осиротеют под удалённым документом и станут недостижимы.
    const groups = await getDocs(groupsRef);
    for (const group of groups.docs) {
      removed += await eraseAll(collection(store, 'users', uid, 'groups', group.id, 'members'));
    }
    removed += await eraseAll(groupsRef);
    removed += await eraseAll(collection(store, 'users', uid, 'profile'));
    removed += await eraseAll(collection(store, 'users', uid, 'audience'));
    removed += await eraseAll(collection(store, 'points', uid, 'dims'));
  } catch (error) {
    return { ok: false, stoppedAt: 'данные профиля', detail: String(error) };
  }

  // Шаг 3 — дружбы. Симметричны, поэтому человек может стоять в любой из двух ролей.
  try {
    const friendships = collection(store, 'friendships');
    removed += await eraseAll(query(friendships, where('a', '==', uid)));
    removed += await eraseAll(query(friendships, where('b', '==', uid)));
  } catch (error) {
    return { ok: false, stoppedAt: 'дружбы', detail: String(error) };
  }

  // Шаг 4 — корневые документы человека.
  try {
    await deleteDoc(doc(store, 'points', uid));
    await deleteDoc(doc(store, 'users', uid));
    removed += 2;
  } catch (error) {
    return { ok: false, stoppedAt: 'профиль', detail: String(error) };
  }

  /*
   * Шаг 5 — учётная запись. ТОЛЬКО ЗДЕСЬ И НИ СТРОКОЙ ВЫШЕ.
   *
   * ⚠️ Отсутствие точки `points/{uid}` при живом `relations/{uid}` — это и есть сигнал серверу
   * синхронизации, что человека больше нет: отдельного «надгробия» заводить не нужно, его
   * пришлось бы хранить вечно и оно само стало бы следом человека.
   */
  const user = devAuth().currentUser;
  if (user === null || user.uid !== uid) {
    return { ok: false, stoppedAt: 'учётная запись', detail: 'сессия не совпадает с удаляемым' };
  }
  try {
    await deleteUser(user);
  } catch (error) {
    // Данных уже нет, а учётная запись осталась. Честно называем это: человек должен войти
    // заново и повторить, а не гадать, удалилось ли что-нибудь.
    return { ok: false, stoppedAt: 'учётная запись', detail: (error as { code?: string })?.code ?? String(error) };
  }

  return { ok: true, removed };
}

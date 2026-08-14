/**
 * ЕДИНСТВЕННАЯ точка чтения прав администратора (`plans/33`, шаг 2).
 *
 * Право = custom claim `admin` в ID-токене (боевой клейм выдан при cutover 2026-07-12;
 * правила Firestore читают его же — `firestore.rules` → `isAdmin()`). Никаких
 * `getIdTokenResult()` вразнобой по экранам: у прав ТРИ состояния, и различает их этот модуль.
 *
 * 🔴 ТРИ СОСТОЯНИЯ, А НЕ ДВА. Ответ о правах приходит асинхронно, и «ещё не знаю» — это НЕ
 * «не админ»: наивный редирект по отсутствию ответа выбросил бы из панели самого владельца,
 * пока восстанавливается сессия. Пока вердикта нет — экран ЖДЁТ (состояние `unknown` держит
 * сам экран; этот модуль отвечает только на вопрос «admin | not-admin», когда ответ ЕСТЬ).
 *
 * 🔑 Никакой эвристики, ДАЮЩЕЙ доступ. Маркер `ndim-session` (`bugs/40`) законен, потому что
 * решает косметику («щит или лендинг»); здесь вопрос ПРАВ — угадывать нельзя ни в какую
 * сторону: не знаем → ждём, не смогли спросить → отказ.
 */
import { getIdTokenResult, onAuthStateChanged, type User } from 'firebase/auth';
import { devAuth } from '../firebase.ts';

export type AdminState = 'unknown' | 'admin' | 'not-admin';

/**
 * Первый ответ Auth о человеке — та же дисциплина, что `data/session.ts`: ждём событие
 * `onAuthStateChanged`, а не читаем `currentUser` наугад (сразу после загрузки он ещё null,
 * восстановление сессии асинхронное).
 */
function firstUser(): Promise<User | null> {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(devAuth(), (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

/**
 * Вердикт о правах. Возвращается, только когда ответ ПОЛУЧЕН, — состояние `unknown` живёт
 * у вызывающего, пока промис не разрешился.
 *
 * `insist` — для самого раздела: клейм мог быть выдан ПОСЛЕ выпуска кэшированного токена
 * (владелец получил право, токен ещё старый), и тогда один принудительный обмен токена и
 * повтор — а не молчаливый выход (`plans/33`, шаг 2). Дверь в «Меню» зовёт БЕЗ `insist`:
 * заставлять каждого посетителя меню обменивать токен ради двери, которой у него нет, —
 * расход не по чину; цена — владелец со старым токеном увидит дверь только из самого
 * раздела, и это честная цена косметики.
 */
export async function adminVerdict(opts: { insist?: boolean } = {}): Promise<'admin' | 'not-admin'> {
  try {
    const user = await firstUser();
    if (user === null) return 'not-admin';
    const token = await getIdTokenResult(user);
    if (token.claims.admin === true) return 'admin';
    if (opts.insist) {
      const fresh = await getIdTokenResult(user, true);
      if (fresh.claims.admin === true) return 'admin';
    }
    return 'not-admin';
  } catch {
    // Не смогли спросить (сеть, хранилище) — доступа НЕТ. Права по памяти не выдаются.
    return 'not-admin';
  }
}

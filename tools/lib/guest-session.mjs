/**
 * ГОСТЕВАЯ СЕССИЯ СТЕНДА — чтение uid и БЕЗОПАСНАЯ уборка за собой.
 *
 * ── ПОЧЕМУ МОДУЛЬ ПОЯВИЛСЯ: ПРИБОР УДАЛИЛ dev-ПОЛЬЗОВАТЕЛЯ СТЕНДА ──────────────────────────
 * 2026-08-30, прогон стража `bugs/226`: прибор напечатал «гость рождён дверью продукта:
 * ZQrYSLpCeXSvzysTJluEw1TUeOab» — и это uid НЕ гостя, а `dev@ndim.space` из сида стенда.
 * Уборка честно исполнила своё обещание и снесла его целиком: учётку, точку, `users`-дерево.
 * Симптом заметен только глазом, по совпадению строки с логом сида; ни одна проверка прибора
 * не покраснела, потому что все они судили ГЕОМЕТРИЮ, а не то, кого убирают.
 *
 * 🔑 ДВЕ ПРИЧИНЫ, И ЛЕЧИТЬ НАДО ОБЕ — ОНИ НЕЗАВИСИМЫ.
 *
 * **(1) Чтение.** Приём, живший в приборах копиями, брал ПЕРВУЮ попавшуюся запись:
 * `all.result.find((r) => r.fbase_key.startsWith('firebase:authUser:'))`. Ключ этой записи
 * устроен как `firebase:authUser:<apiKey>:<имя приложения>`, и записей в базе браузера бывает
 * НЕСКОЛЬКО — у продукта живёт не одно приложение Firebase. `find` возвращает произвольную из
 * них, и «произвольная» большую часть прогонов совпадает с нужной. Признак, работающий в
 * девяти прогонах из десяти, — худший род признака: он выглядит проверенным.
 * **Лечение:** выбираем запись ПО СВОЙСТВУ (`isAnonymous === true`), а не по порядку, и число
 * найденных записей возвращаем наружу — неоднозначность обязана быть видимой, а не молчаливой.
 *
 * **(2) Уборка.** Опасное действие стояло на ПРЕДПОЛОЖЕНИИ «этот uid — гость, ведь мы только
 * что открыли гостевую дверь». Предположение о том, кто позовёт, — не свойство прибора
 * (`TESTING_FRAMEWORK.md`, правило 9: обезвреживай в исходнике, а не подбором безопасных входов).
 * **Лечение:** удаление СПРАШИВАЕТ у самой учётки, гостевая ли она, и на полноценной ОТКАЗЫВАЕТ
 * с именем. Даже если чтение однажды снова ошибётся, дальше уборки ошибка не пройдёт.
 *
 * ⚖️ Граница честная: заслон (2) не чинит (1) — он делает промах (1) громким вместо
 * разрушительного. Оба нужны, и ни один не заменяет второго.
 *
 * 📌 Приём был скопирован из `tools/probe-guest-card.mjs`; там и в `probe-guest-death-live.mjs`
 * он живёт до сих пор. Их правка — не в этой порции (чужой инструмент, своя приёмка), близнецы
 * названы в `bugs/NEW_probe_ubiraet_ne_gostya.md`.
 */

/**
 * Выбрать гостевую запись среди записей аутентификации браузера — ЧИСТАЯ функция,
 * чтобы решение проверялось юнитом, а не только живым прогоном.
 *
 * @param {Array<{fbase_key?: string, value?: {uid?: string, isAnonymous?: boolean}}>} records
 * @returns {{uid: string|null, authRecords: number, anonymous: number, reason: string|null}}
 */
export function chooseGuestRecord(records) {
  const auth = (records ?? []).filter((r) => String(r?.fbase_key ?? '').startsWith('firebase:authUser:'));
  const anon = auth.filter((r) => r?.value?.isAnonymous === true && typeof r.value.uid === 'string');
  if (anon.length === 1) {
    return { uid: anon[0].value.uid, authRecords: auth.length, anonymous: 1, reason: null };
  }
  if (anon.length === 0) {
    return {
      uid: null,
      authRecords: auth.length,
      anonymous: 0,
      reason:
        auth.length === 0
          ? 'записей аутентификации нет вовсе — гостевая дверь не сработала'
          : `гостевой записи нет: все ${auth.length} записи принадлежат полноценным учёткам`,
    };
  }
  /*
   * Несколько гостей разом — это НЕ «возьмём первого». Прибор, убирающий за собой, обязан
   * знать, за кем именно; выбор наугад здесь и был бы тем самым дефектом, только тише.
   */
  return {
    uid: null,
    authRecords: auth.length,
    anonymous: anon.length,
    reason: `гостевых записей ${anon.length} — какая из них наша, прибор не знает и выбирать наугад не станет`,
  };
}

/**
 * Приговор об удалении учётки — ЧИСТАЯ функция над тем, что вернул Admin SDK.
 *
 * Гостевая учётка Firebase не имеет ни одного провайдера входа: `providerData` пуст. Это
 * СВОЙСТВО самой учётки, а не наше предположение о ней, — потому приговор и снимается здесь.
 *
 * @param {{uid?: string, email?: string|null, providerData?: Array<unknown>}|null} user
 * @returns {{ok: boolean, why: string}}
 */
export function mayDeleteAsGuest(user) {
  if (!user) return { ok: false, why: 'учётки с таким uid в Auth нет — удалять нечего' };
  const providers = (user.providerData ?? []).length;
  if (providers > 0 || user.email) {
    return {
      ok: false,
      why:
        `учётка ${user.uid} НЕ гостевая (провайдеров ${providers}` +
        `${user.email ? `, почта ${user.email}` : ''}) — уборка отказано, это чужие данные`,
    };
  }
  return { ok: true, why: 'учётка анонимная: провайдеров нет, почты нет' };
}

/**
 * Прочитать гостевую сессию со СТРАНИЦЫ Playwright.
 *
 * ⚠️ Сессия Firebase живёт в **IndexedDB**, а не в `localStorage` — приём снят приборами
 * `probe-guest-screen.mjs` и `smoke.mjs`, здесь он не переоткрывается.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<{uid: string|null, authRecords: number, anonymous: number, reason: string|null}>}
 */
export async function readGuestSession(page) {
  const records = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('firebaseLocalStorageDb');
        req.onerror = () => resolve([]);
        req.onsuccess = () => {
          try {
            const all = req.result
              .transaction('firebaseLocalStorage', 'readonly')
              .objectStore('firebaseLocalStorage')
              .getAll();
            all.onerror = () => resolve([]);
            all.onsuccess = () =>
              resolve(
                (all.result ?? []).map((r) => ({
                  fbase_key: String(r?.fbase_key ?? ''),
                  value: { uid: r?.value?.uid, isAnonymous: r?.value?.isAnonymous === true },
                })),
              );
          } catch {
            resolve([]);
          }
        };
      }),
  );
  return chooseGuestRecord(records);
}

/**
 * Убрать за собой гостя — с отказом на всём, что гостем не является.
 *
 * @param {{db: import('firebase-admin/firestore').Firestore, auth: import('firebase-admin/auth').Auth}} sdk
 * @param {string} uid
 * @returns {Promise<{removed: boolean, why: string, traces: string[]}>}
 */
export async function removeGuest({ db, auth }, uid) {
  const user = await auth.getUser(uid).catch(() => null);
  const verdict = mayDeleteAsGuest(user);
  if (!verdict.ok) return { removed: false, why: verdict.why, traces: [] };

  await db.recursiveDelete(db.doc(`points/${uid}`));
  await db.doc(`relations/${uid}`).delete();
  await db.recursiveDelete(db.doc(`users/${uid}`));
  await auth.deleteUser(uid).catch(() => {});

  const traces = [];
  if ((await db.doc(`points/${uid}`).get()).exists) traces.push('points');
  if ((await db.doc(`users/${uid}`).get()).exists) traces.push('users');
  const gone = await auth.getUser(uid).then(
    () => false,
    (e) => e.code === 'auth/user-not-found',
  );
  if (!gone) traces.push('auth');
  return { removed: true, why: verdict.why, traces };
}

/**
 * РУЧНОЙ ФУНКЦИОНАЛЬНЫЙ ПРОГОН — ВХОД И СОЗДАНИЕ АККАУНТА ЧЕРЕЗ GOOGLE С КАЖДОЙ ДВЕРИ ПРОДУКТА.
 * Набор: `qa/suites/google-signin.md` (кейсы ГВ-01…ГВ-11). Родители — три бага 2026-09-19:
 * `bugs/NEW_google_signin_newcomer_lands_on_load_error.md` · `bugs/NEW_guest_signin_door_has_no_google.md` ·
 * `bugs/NEW_guest_google_taken_says_use_other_email.md`.
 *
 * ПОВОД. До этого прибора окно Google не проходил НИ ОДИН прибор проекта: на стенде путь был неисполним
 * (в конфиге эмулятора не было `authDomain`), и новичок, создавший аккаунт через Google, попадал на
 * «Не удалось загрузить данные» — в бою, пока все приборы были зелёными.
 *
 * ТОЛЬКО СТЕНД: окно Google здесь — окно эмулятора Auth («Add new account» / выбор существующего).
 * Настоящий Google в бою агенту не пройти (нет тестового аккаунта) — это граница набора, а не упущение.
 * Дверь стенда `?as=none` переживает `location.reload()` продукта, поэтому после окна прибор открывает
 * чистый `/profile` — тот адрес, который перезагружается в бою.
 *
 * Запуск:  node tools/verify-google-signin.mjs            (стенд поднят `npm run stand`)
 * Кадры:   test-results/google-signin/
 *
 * [TESTED: 2026-09-19 · стенд: ГВ-01…ГВ-11 0 провалов; мутанты М1→ГВ-02, М2→ГВ-01б, М3→ГВ-05/06, М4→ГВ-06/07/08/10, М5→ГВ-11 — ровно адресаты;
 *  отчёт `qa/reports/2026-09-19_google-signin.md`]
 */
import { mkdir } from 'node:fs/promises';
import { basename } from 'node:path';
import { chromium } from '@playwright/test';
import { portsFor, slotOf } from './lib/stand-slot.mjs';

const PORTS = portsFor(slotOf(basename(process.cwd())).slot);
const BASE = process.env.PROBE_BASE ?? `http://localhost:${PORTS.dev}`;
const DOCS = `http://127.0.0.1:${PORTS.firestore}/v1/projects/demo-ndim-dev/databases/(default)/documents`;
const OWNER = { Authorization: 'Bearer owner' }; // эмулятор: чтение и удаление в обход правил
const SHOTS = 'test-results/google-signin';
const DOWN = 'Не удалось загрузить данные';
const WELCOME = 'Профиль сохранён';
const MINE = 'Эта почта уже Ваша';
const OTHER_EMAIL = 'создайте аккаунт на другую почту';
const NOT_DONE = 'Вход через Google не завершён';
const stamp = Date.now();

let failures = 0;
function check(id, name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${id} · ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Кто вошёл по мнению самого Firebase — IndexedDB `firebaseLocalStorageDb` (урок `verify-bug233`). */
const whoAmI = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('firebaseLocalStorageDb');
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('firebaseLocalStorage')) return resolve(null);
          const req = db.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
          req.onsuccess = () => {
            const u = (req.result ?? []).find((r) => String(r.fbase_key).startsWith('firebase:authUser:'));
            resolve(u ? { uid: u.value.uid, email: u.value.email ?? null, anonymous: u.value.isAnonymous === true } : null);
          };
          req.onerror = () => resolve(null);
        };
      }),
  );
const describe = (me) => (me ? (me.anonymous ? `гость ${me.uid.slice(0, 6)}` : me.email) : 'нет сессии');
const hasText = (page, needle) => page.evaluate((t) => document.body.innerText.includes(t), needle);

/** Документ профиля в базе стенда: есть ли, и удалить (кейс «пострадавший»). */
const profileDocExists = async (uid) => (await fetch(`${DOCS}/users/${uid}`, { headers: OWNER })).status === 200;
const dropProfileDoc = (uid) => fetch(`${DOCS}/users/${uid}`, { method: 'DELETE', headers: OWNER });
/** Сумма `account_created` по всем дням воронки стенда. */
async function accountsCreated() {
  const body = await (await fetch(`${DOCS}/space/funnel/days?pageSize=500`, { headers: OWNER })).json();
  return (body.documents ?? []).reduce((sum, d) => sum + Number(d.fields?.account_created?.integerValue ?? 0), 0);
}

async function browserOf(browser, { w = 390, h = 844, theme = 'light' } = {}) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, locale: 'ru-RU' });
  await context.addInitScript((t) => localStorage.setItem('ndim-theme', t), theme);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().split('\n')[0].slice(0, 160));
  });
  return { context, page, errors };
}

/**
 * Нажать кнопку Google и пройти окно эмулятора: новый аккаунт с этой почтой или выбор существующего.
 * `close` — закрыть окно, ничего не выбрав (кейс ГВ-09).
 */
async function throughGoogle(page, button, email, { existing = false, close = false } = {}) {
  const [popup] = await Promise.all([page.waitForEvent('popup'), button.click()]);
  await popup.waitForLoadState();
  if (close) return popup.close();
  if (existing) {
    await popup.getByText(email).click();
  } else {
    await popup.locator('button', { hasText: 'Add new account' }).click();
    await popup.locator('#email-input').fill(email);
    await popup.locator('#display-name-input').fill('Проба Google');
    await popup.locator('#sign-in').click();
  }
  await popup.waitForEvent('close', { timeout: 15000 }).catch(() => {});
}

/** Дождаться исхода экрана профиля: карточка-шапка своего профиля или экран отказа. */
async function settledProfile(page) {
  await page
    .waitForFunction((down) => document.querySelector('.head-card') || document.body.innerText.includes(down), DOWN, {
      timeout: 25000,
    })
    .catch(() => {});
  return {
    own: await page.locator('.head-card').isVisible().catch(() => false),
    down: await hasText(page, DOWN),
  };
}

/** После окна Google на двери входа продукт перезагружается; на стенде открываем чистый `/profile`. */
async function afterDoorSignin(page) {
  await page.waitForEvent('load', { timeout: 15000 }).catch(() => {});
  await page.goto(`${BASE}/profile`);
  return settledProfile(page);
}

/** Гость, заведённый дверью продукта (параметр `?guest=1` продукт стирает сам). */
async function asGuest(page) {
  await page.goto(`${BASE}/profile?guest=1`);
  await page.getByRole('button', { name: 'Сохранить мои результаты' }).waitFor({ timeout: 25000 });
  return whoAmI(page);
}

await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch();
const A = `gv01-${stamp}@gmail.test`; // новичок двери входа
const B = `gv04-${stamp}@gmail.test`; // гость, сохранивший результаты через Google
const C = `gv08-${stamp}@gmail.test`; // гость, выбравший НОВЫЙ Google в двери «У меня уже есть аккаунт»
const D = `gv02-${stamp}@gmail.test`; // аккаунт, у которого прибор удаляет документ профиля

try {
  // ═══ ГВ-01 · ГВ-01б — новичок, дверь входа ═══════════════════════════════════════════════════════
  console.log(`ГВ-01 · новичок через Google на двери входа (${A}):`);
  let uidA;
  {
    const before = await accountsCreated();
    const { context, page, errors } = await browserOf(browser);
    await page.goto(`${BASE}/profile?as=none`);
    const door = page.getByRole('button', { name: 'Войти через Google' });
    await door.waitFor({ timeout: 25000 });
    await throughGoogle(page, door, A);
    const seen = await afterDoorSignin(page);
    const me = await whoAmI(page);
    uidA = me?.uid;
    await page.screenshot({ path: `${SHOTS}/gv01-newcomer-profile.png`, fullPage: true });
    check('ГВ-01', 'вошёл своим Google, не гость', me?.email === A && !me.anonymous, describe(me));
    check('ГВ-01', 'свой профиль, без «Не удалось загрузить»', seen.own && !seen.down, `шапка ${seen.own} · отказ ${seen.down}`);
    check('ГВ-01', 'документ профиля заведён', Boolean(uidA) && (await profileDocExists(uidA)));
    check('ГВ-01', 'консоль чиста', errors.length === 0, errors.slice(0, 2).join(' | '));
    const after = await accountsCreated();
    check('ГВ-01б', 'счётчик воронки account_created +1', after === before + 1, `${before} → ${after}`);
    await context.close();
  }

  // ═══ ГВ-02 — пострадавший: аккаунт есть, документа нет ══════════════════════════════════════════
  // СВОЙ аккаунт D, а не A: удалённый документ A каскадом ронял бы ГВ-03 и ГВ-07 при мутанте М1
  // (замер 2026-09-19 21:2x — мутант должен краснеть только адресно).
  console.log(`\nГВ-02 · аккаунт Google без документа профиля (как у споткнувшихся до починки) (${D}):`);
  {
    const prep = await browserOf(browser);
    await prep.page.goto(`${BASE}/profile?as=none`);
    const prepDoor = prep.page.getByRole('button', { name: 'Войти через Google' });
    await prepDoor.waitFor({ timeout: 25000 });
    await throughGoogle(prep.page, prepDoor, D);
    await prep.page.waitForEvent('load', { timeout: 15000 }).catch(() => {});
    const uidD = (await whoAmI(prep.page))?.uid;
    await prep.context.close();
    if (uidD) await dropProfileDoc(uidD);
    const gone = Boolean(uidD) && !(await profileDocExists(uidD));

    const { context, page } = await browserOf(browser);
    await page.goto(`${BASE}/profile?as=none`);
    const door = page.getByRole('button', { name: 'Войти через Google' });
    await door.waitFor({ timeout: 25000 });
    await throughGoogle(page, door, D, { existing: true });
    const seen = await afterDoorSignin(page);
    await page.screenshot({ path: `${SHOTS}/gv02-healed.png`, fullPage: true });
    check('ГВ-02', 'подготовка: аккаунт есть, документа нет', gone);
    check('ГВ-02', 'свой профиль, без «Не удалось загрузить»', seen.own && !seen.down, `шапка ${seen.own} · отказ ${seen.down}`);
    check('ГВ-02', 'документ профиля заведён заново', Boolean(uidD) && (await profileDocExists(uidD)));
    await context.close();
  }

  // ═══ ГВ-03 — вернувшийся с документом ═══════════════════════════════════════════════════════════
  console.log('\nГВ-03 · вернувшийся человек через Google на двери входа:');
  {
    const { context, page } = await browserOf(browser);
    await page.goto(`${BASE}/profile?as=none`);
    const door = page.getByRole('button', { name: 'Войти через Google' });
    await door.waitFor({ timeout: 25000 });
    await throughGoogle(page, door, A, { existing: true });
    const seen = await afterDoorSignin(page);
    const me = await whoAmI(page);
    check('ГВ-03', 'свой профиль своим Google', seen.own && !seen.down && me?.email === A, describe(me));
    check('ГВ-03', 'без поздравления «Профиль сохранён»', !(await hasText(page, WELCOME)));
    await context.close();
  }

  // ═══ ГВ-04 — гость сохраняет результаты через новый Google ═══════════════════════════════════════
  console.log(`\nГВ-04 · гость → «Сохранить мои результаты» → новый Google (${B}):`);
  {
    const { context, page } = await browserOf(browser);
    const guest = await asGuest(page);
    await page.getByRole('button', { name: 'Сохранить мои результаты' }).click();
    await throughGoogle(page, page.getByRole('button', { name: 'Продолжить с Google' }), B);
    await page.getByText(WELCOME).waitFor({ timeout: 15000 }).catch(() => {});
    const me = await whoAmI(page);
    await page.screenshot({ path: `${SHOTS}/gv04-guest-upgrade.png`, fullPage: true });
    check('ГВ-04', '«Профиль сохранён»', await hasText(page, WELCOME));
    check('ГВ-04', 'тот же UID, что у гостя (труд на месте), почта Google', me?.uid === guest?.uid && me?.email === B, describe(me));
    await context.close();
  }

  // ═══ ГВ-05 · ГВ-06 — гость, Google уже чей-то профиль ═══════════════════════════════════════════
  console.log('\nГВ-05 · гость → «Сохранить мои результаты» → Google, у которого уже есть профиль:');
  {
    const { context, page } = await browserOf(browser);
    await asGuest(page);
    await page.getByRole('button', { name: 'Сохранить мои результаты' }).click();
    await throughGoogle(page, page.getByRole('button', { name: 'Продолжить с Google' }), B, { existing: true });
    await page.getByText(MINE).waitFor({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800); // врезка выезжает (`transition:slide`) — кадр после выезда
    const me = await whoAmI(page);
    await page.screenshot({ path: `${SHOTS}/gv05-google-taken.png`, fullPage: true });
    check('ГВ-05', 'развилка «Эта почта уже Ваша»', await hasText(page, MINE));
    const exits = await Promise.all(
      ['Это мой аккаунт — войти в него', 'Указать другую почту'].map((name) =>
        page.getByRole('button', { name }).isVisible().catch(() => false),
      ),
    );
    check('ГВ-05', 'обе двери развилки видны', exits.every(Boolean), `войти ${exits[0]} · другая почта ${exits[1]}`);
    check('ГВ-05', 'нет совета «создайте аккаунт на другую почту»', !(await hasText(page, OTHER_EMAIL)));
    check('ГВ-05', 'всё ещё гость', me?.anonymous === true, describe(me));

    console.log('ГВ-06 · «Это мой аккаунт — войти в него» → «Войти через Google»:');
    const mine = page.getByRole('button', { name: 'Это мой аккаунт — войти в него' });
    const hasMine = await mine.isVisible().catch(() => false);
    let seen = { own: false, down: false };
    let me6 = null;
    if (hasMine) {
      await mine.click();
      const inside = page.getByRole('button', { name: 'Войти через Google' });
      if (await inside.isVisible().catch(() => false)) {
        await throughGoogle(page, inside, B, { existing: true });
        await page.waitForEvent('load', { timeout: 15000 }).catch(() => {});
        seen = await settledProfile(page);
        me6 = await whoAmI(page);
      }
    }
    check('ГВ-06', 'вошёл в свой аккаунт B, не гость', me6?.email === B && !me6.anonymous, describe(me6));
    check('ГВ-06', 'свой профиль', seen.own && !seen.down, `шапка ${seen.own} · отказ ${seen.down}`);
    await context.close();
  }

  // ═══ ГВ-07 — гость, «У меня уже есть аккаунт» → Google ══════════════════════════════════════════
  console.log('\nГВ-07 · гость → «У меня уже есть аккаунт» → «Войти через Google» (аккаунт A):');
  {
    const { context, page } = await browserOf(browser);
    await asGuest(page);
    await page.getByRole('button', { name: 'У меня уже есть аккаунт' }).click();
    await page.getByRole('button', { name: 'Войти в свой аккаунт' }).click();
    const inside = page.getByRole('button', { name: 'Войти через Google' });
    const present = await inside.isVisible().catch(() => false);
    check('ГВ-07', 'кнопка «Войти через Google» в двери есть', present);
    let seen = { own: false, down: false };
    let me = null;
    if (present) {
      await throughGoogle(page, inside, A, { existing: true });
      await page.waitForEvent('load', { timeout: 15000 }).catch(() => {});
      seen = await settledProfile(page);
      me = await whoAmI(page);
    }
    await page.screenshot({ path: `${SHOTS}/gv07-signin-door-google.png`, fullPage: true });
    check('ГВ-07', 'вошёл в свой аккаунт A, не гость', me?.email === A && !me.anonymous, describe(me));
    check('ГВ-07', 'свой профиль', seen.own && !seen.down, `шапка ${seen.own} · отказ ${seen.down}`);
    await context.close();
  }

  // ═══ ГВ-08 — гость, «У меня уже есть аккаунт», а аккаунта нет ═══════════════════════════════════
  console.log(`\nГВ-08 · гость → «У меня уже есть аккаунт» → НОВЫЙ Google (${C}):`);
  {
    const before = await accountsCreated();
    const { context, page } = await browserOf(browser);
    await asGuest(page);
    await page.getByRole('button', { name: 'У меня уже есть аккаунт' }).click();
    await page.getByRole('button', { name: 'Войти в свой аккаунт' }).click();
    const inside = page.getByRole('button', { name: 'Войти через Google' });
    let seen = { own: false, down: false };
    let me = null;
    if (await inside.isVisible().catch(() => false)) {
      await throughGoogle(page, inside, C);
      await page.waitForEvent('load', { timeout: 15000 }).catch(() => {});
      seen = await settledProfile(page);
      me = await whoAmI(page);
    }
    check('ГВ-08', 'вошёл новым Google, не гость', me?.email === C && !me.anonymous, describe(me));
    check('ГВ-08', 'профиль открылся, без «Не удалось загрузить»', seen.own && !seen.down, `шапка ${seen.own} · отказ ${seen.down}`);
    const after = await accountsCreated();
    check('ГВ-08', 'счётчик воронки account_created +1', after === before + 1, `${before} → ${after}`);
    await context.close();
  }

  // ═══ ГВ-11 — окно заблокировано (как во встроенных браузерах приложений) ═════════════════════════
  // `window.open` → null: Firebase отвечает `auth/popup-blocked`. Текст обязан быть правдой о входе,
  // а не «Не удалось создать аккаунт. Пожалуйста, попробуйте ещё раз» (замер суда 2026-09-19).
  console.log('\nГВ-11 · окно Google заблокировано:');
  {
    const { context, page } = await browserOf(browser);
    await context.addInitScript(() => {
      window.open = () => null;
    });
    await page.goto(`${BASE}/profile?as=none`);
    const door = page.getByRole('button', { name: 'Войти через Google' });
    await door.waitFor({ timeout: 25000 });
    await door.click();
    const onDoor = await page.getByText(NOT_DONE).waitFor({ timeout: 15000 }).then(() => true, () => false);
    check('ГВ-11', 'дверь входа: «Вход через Google не завершён…»', onDoor);
    await context.close();
  }
  {
    const { context, page } = await browserOf(browser);
    await context.addInitScript(() => {
      window.open = () => null;
    });
    await asGuest(page);
    await page.getByRole('button', { name: 'У меня уже есть аккаунт' }).click();
    await page.getByRole('button', { name: 'Войти в свой аккаунт' }).click();
    await page.getByRole('button', { name: 'Войти через Google' }).click();
    const inGuestDoor = await page.getByText(NOT_DONE).waitFor({ timeout: 15000 }).then(() => true, () => false);
    const me = await whoAmI(page);
    check('ГВ-11', 'дверь гостя: «Вход через Google не завершён…», гость на месте', inGuestDoor && me?.anonymous === true, describe(me));
    await context.close();
  }

  // ═══ ГВ-09 — окно закрыто без выбора ════════════════════════════════════════════════════════════
  console.log('\nГВ-09 · дверь входа, окно Google закрыто без выбора:');
  {
    const { context, page } = await browserOf(browser);
    await page.goto(`${BASE}/profile?as=none`);
    const door = page.getByRole('button', { name: 'Войти через Google' });
    await door.waitFor({ timeout: 25000 });
    await throughGoogle(page, door, '', { close: true });
    const said = await page.getByText(NOT_DONE).waitFor({ timeout: 20000 }).then(() => true, () => false);
    const doors = await page.getByRole('button', { name: 'Войти через Google' }).isVisible().catch(() => false);
    await page.screenshot({ path: `${SHOTS}/gv09-popup-closed.png` });
    check('ГВ-09', '«Вход через Google не завершён…» и двери видны', said && doors, `текст ${said} · кнопки ${doors}`);
    await context.close();
  }

  // ═══ ГВ-10 — вид двери «Вход в Ваш аккаунт», четыре клетки ═════════════════════════════════════
  console.log('\nГВ-10 · кадры двери «Вход в Ваш аккаунт»:');
  for (const [w, h, theme] of [[390, 844, 'light'], [390, 844, 'dark'], [1440, 900, 'light'], [1440, 900, 'dark']]) {
    const { context, page } = await browserOf(browser, { w, h, theme });
    await asGuest(page);
    await page.getByRole('button', { name: 'У меня уже есть аккаунт' }).click();
    await page.getByRole('button', { name: 'Войти в свой аккаунт' }).click();
    const card = page.locator('.door-title').locator('xpath=..');
    await card.screenshot({ path: `${SHOTS}/gv10-signin-door-${w}-${theme}.png` });
    const ok = await page.getByRole('button', { name: 'Войти через Google' }).isVisible().catch(() => false);
    check('ГВ-10', `кадр ${w} ${theme} снят, кнопка Google видна`, ok);
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`\nИТОГ: провалов ${failures}. Кадры: ${SHOTS}/`);
process.exit(failures === 0 ? 0 : 1);

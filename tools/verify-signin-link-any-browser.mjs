/**
 * РУЧНОЙ ФУНКЦИОНАЛЬНЫЙ ПРОГОН — ВХОД ПО ССЫЛКЕ ИЗ ПИСЬМА В ЛЮБОМ БРАУЗЕРЕ.
 * Набор: `qa/suites/signin-link-any-browser.md` (кейсы СЛ-01…СЛ-13). Родители: `bugs/233`, `bugs/235`,
 * решение владельца — интервью №084 (В1 = А адрес в ссылке + строка аккаунта, В2 = А экран V1).
 *
 * СТЕНД (по умолчанию): путь идёт ДВЕРЬЮ ПРОДУКТА — браузер А просит письмо, эмулятор Auth отдаёт
 * выпущенную ссылку (`EXP-0045`), браузер Б — отдельный контекст Playwright с пустым хранилищем.
 * СТЕЙДЖ (`--contour stage`): ссылку выпускает сервисный ключ стейджа (`generateSignInWithEmailLink`),
 * и она идёт через НАСТОЯЩИЙ обработчик Firebase `…firebaseapp.com/__/auth/action`. Учётки,
 * заведённые прогоном, прибор удаляет в конце (Auth + `users/`).
 *
 * Запуск:
 *   node tools/verify-signin-link-any-browser.mjs                    # СЛ-01…08, СЛ-11
 *   node tools/verify-signin-link-any-browser.mjs --contour stage    # СЛ-12, СЛ-13
 *   node tools/verify-signin-link-any-browser.mjs --contour prod     # СЛ-12, СЛ-13 в бою: метка прогона, учётки удаляются
 *
 * Граница: два разных движка браузера не доказаны — доказано ровно то, чем дефект вызван, у Б нет
 * памяти А. Кадры: test-results/signin-link-any-browser/<контур>/.
 *
 * [TESTED: 2026-09-13 · стенд: первая редакция 12/0, мутант «без ensureSpaceExists» дал 2 провала адресно]
 */
import { mkdir } from 'node:fs/promises';
import { basename } from 'node:path';
import { chromium } from '@playwright/test';
import { portsFor, slotOf } from './lib/stand-slot.mjs';
// Метка своего прогона — статическим импортом и на КАЖДУЮ сессию, без условия контура: страж воронки судит текст,
// а не контур, и прав (`bugs/NEW_signin_link_probe_sessions_unmarked_gate_red.md`). На стенде метка ничего не меняет.
import { markProbeContext } from './lib/probe-mark.mjs';

const CONTOUR = process.argv.includes('--contour') ? process.argv[process.argv.indexOf('--contour') + 1] : 'stand';
// Живой контур (стейдж или бой): ссылку выпускает сервисный ключ, она идёт через настоящий обработчик.
const STAGE = CONTOUR === 'stage' || CONTOUR === 'prod';
const PROD = CONTOUR === 'prod';
if (!['stand', 'stage', 'prod'].includes(CONTOUR)) {
  console.error(`Контур «${CONTOUR}» не поддержан: stand | stage | prod.`);
  process.exit(2);
}
const BASE = PROD
  ? 'https://ndimspace.app'
  : STAGE
  ? 'https://ndim-stage.web.app'
  : (process.env.PROBE_BASE ?? `http://localhost:${portsFor(slotOf(basename(process.cwd())).slot).dev}`);
const AUTH = 'http://127.0.0.1:9099';
const PROJECT = 'demo-ndim-dev';
const SHOTS = `test-results/signin-link-any-browser/${CONTOUR}`;
const DOWN = 'Не удалось загрузить данные';
const SPINNER = { ru: 'Выполняем вход в Пространство NDim Space', en: 'Signing you in to NDim Space' };
const WHO = { ru: 'Вы входите в аккаунт с адресом электронной почты', en: 'You are signing in to the account with the email address' };
const LEDE = 'Оцените фильмы, книги, музыку';
const WELCOME = 'Профиль сохранён';
const DEAD = 'Ссылка больше не действует';
const stamp = Date.now();

/** Вердикты кейсов: у каждого кейса статус и названное наблюдение (`TESTING_FRAMEWORK.md`, шаг 4). */
const verdicts = [];
let failures = 0;
function check(id, name, ok, detail = '') {
  if (!ok) failures += 1;
  verdicts.push({ id, ok });
  console.log(`${ok ? '  ✅' : '  ❌'} ${id} · ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Кто вошёл по мнению самого Firebase: IndexedDB `firebaseLocalStorageDb` (урок `verify-bug233`, К0). */
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
const text = (page, needle) => page.evaluate((t) => document.body.innerText.includes(t), needle);
const describe = (me) => (me ? (me.anonymous ? 'гость' : me.email) : 'нет сессии');

/** Отдельный браузер: своё хранилище, своя сессия. `theme`/`lang` кладутся ДО загрузки. */
async function browserOf(browser, { w = 390, h = 844, theme, lang } = {}) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, locale: 'ru-RU' });
  // Тот же пропуск App Check, что у смоука двери выката (`tools/lib/app-check-debug.mjs`).
  if (STAGE) await (await import('./lib/app-check-debug.mjs')).grantAppCheckDebug(context, { required: PROD });
  // Прогон метится как свой на любом контуре: воронка при метке молчит (`tools/lib/probe-mark.mjs`).
  await markProbeContext(context);
  await context.addInitScript(([t, l]) => {
    if (t) localStorage.setItem('ndim-theme', t);
    if (l) localStorage.setItem('ndim-lang', l);
  }, [theme, lang]);
  const page = await context.newPage();
  const errors = [];
  // Ошибка консоли называется АДРЕСОМ источника (урок `bugs/169`): переход по ссылке идёт через
  // чужую страницу-обработчик, и «чья это строка» — первое, что надо знать.
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const where = m.location()?.url || page.url();
    errors.push(`${m.text()} @ ${where.split('?')[0]}`);
  });
  return { context, page, errors };
}

/** Придержать ответы Auth, чтобы шаг «идёт вход» был виден глазу и кадру (на стенде вход длится миг). */
async function holdAuth(page, ms) {
  await page.route(/identitytoolkit\.googleapis\.com/, async (r) => {
    await new Promise((ok) => setTimeout(ok, ms));
    await r.continue().catch(() => {});
  });
}

// ─── СТЕНД: письмо ДВЕРЬЮ ПРОДУКТА ────────────────────────────────────────────────────────────
/** Браузер А (или переданная страница) просит письмо на двери входа; возвращает ссылку, как её отдаёт Firebase. */
async function letterFromDoor(browser, email, page = null) {
  let own = null;
  if (!page) {
    own = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
    await markProbeContext(own);
    page = await own.newPage();
  }
  await page.goto(`${BASE}/profile?as=none`);
  await page.getByRole('button', { name: 'Войти по ссылке на почту' }).click();
  await page.locator('input[type="email"]').fill(email);
  await page.getByRole('button', { name: 'Получить ссылку для входа' }).click();
  await page.getByText('Письмо отправлено').waitFor({ timeout: 15000 });
  if (own) await own.close();

  const codes = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`).then((r) => r.json());
  const mine = (codes.oobCodes ?? []).filter((c) => c.email === email && c.requestType === 'EMAIL_SIGNIN').at(-1);
  if (!mine) throw new Error(`эмулятор не выпустил письмо для ${email}`);
  // Боевой обработчик переводит человека на continueUrl, дописав код, — собираем так же.
  const link = new URL(new URL(mine.oobLink).searchParams.get('continueUrl'));
  link.searchParams.set('mode', 'signIn');
  link.searchParams.set('oobCode', mine.oobCode);
  link.searchParams.set('apiKey', 'demo-api-key');
  return link;
}

/** Открыть ссылку и дождаться исхода входа. */
async function openLink(page, href, wait = 7000) {
  await page.goto(href);
  await page.waitForTimeout(wait);
}

await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch();

try {
  if (!STAGE) {
    // ═══ СЛ-01 · СЛ-02 (светлая 390) · новый человек, чистый браузер ═══════════════════════════
    const A = `sl01-${stamp}@ndim.space`;
    console.log(`СЛ-01 · новый человек открывает письмо в чистом браузере (${A}):`);
    const link01 = await letterFromDoor(browser, A);
    check('СЛ-01', 'письмо несёт адрес в ссылке', link01.searchParams.get('email') === A);
    let uidA;
    {
      const { context, page, errors } = await browserOf(browser);
      await holdAuth(page, 1500);
      await page.goto(link01.href);
      const spinner = await page.getByText(SPINNER.ru).waitFor({ timeout: 8000 }).then(() => true, () => false);
      const who = spinner && (await text(page, WHO.ru)) && (await text(page, A));
      const lede = await text(page, LEDE);
      const doors = await page.getByRole('button', { name: 'Войти через Google' }).isVisible().catch(() => false);
      await page.screenshot({ path: `${SHOTS}/sl02-390-light.png` });
      check('СЛ-02', 'шаг «идёт вход»: спиннер · строка аккаунта · без подзаголовка · без кнопок · 390 светлая',
        spinner && who && !lede && !doors, `спиннер ${spinner} · адрес ${Boolean(who)} · подзаголовок ${lede} · кнопки ${doors}`);
      await page.waitForTimeout(12000);
      const me = await whoAmI(page);
      uidA = me?.uid;
      await page.screenshot({ path: `${SHOTS}/sl01-after.png`, fullPage: true });
      check('СЛ-01', 'вошёл своей почтой, не гость', me?.email === A && !me.anonymous, describe(me));
      check('СЛ-01', 'профиль без «Не удалось загрузить» (bugs/235)', !(await text(page, DOWN)));
      check('СЛ-01', 'адрес стёрт из строки браузера', !page.url().includes('email='), new URL(page.url()).search || 'пусто');
      check('СЛ-01', 'консоль чиста', errors.length === 0, errors.slice(0, 2).join(' | '));

      // ═══ СЛ-06 · та же ссылка во втором чистом браузере — код одноразовый ═══════════════════
      console.log('\nСЛ-06 · использованная ссылка в третьем чистом браузере:');
      const third = await browserOf(browser);
      await openLink(third.page, link01.href);
      const me3 = await whoAmI(third.page);
      const dead = await text(third.page, DEAD);
      await third.page.screenshot({ path: `${SHOTS}/sl06-used-link.png`, fullPage: true });
      check('СЛ-06', 'использованная ссылка не впустила, гость не заведён', me3 === null, describe(me3));
      check('СЛ-06', 'на двери входа видна строка ошибки о ссылке', dead, dead ? `«${DEAD}»` : 'строки нет');
      await third.context.close();
      await context.close();
    }

    // ═══ СЛ-02 · остальные клетки тема × ширина ═══════════════════════════════════════════════
    console.log('\nСЛ-02 · шаг «идёт вход», остальные клетки:');
    for (const [w, h, theme] of [[390, 844, 'dark'], [1440, 900, 'light'], [1440, 900, 'dark']]) {
      const email = `sl02-${w}${theme}-${stamp}@ndim.space`;
      const link = await letterFromDoor(browser, email);
      const { context, page } = await browserOf(browser, { w, h, theme });
      await holdAuth(page, 2500);
      await page.goto(link.href);
      const seen = await page.getByText(SPINNER.ru).waitFor({ timeout: 8000 }).then(() => true, () => false);
      const applied = await page.evaluate(() => document.documentElement.dataset.theme);
      const who = seen && (await text(page, email));
      await page.screenshot({ path: `${SHOTS}/sl02-${w}-${theme}.png` });
      check('СЛ-02', `спиннер и адрес · ${w} · ${theme}`, seen && who && applied === theme, `тема на странице: ${applied}`);
      await context.close();
    }

    // ═══ СЛ-03 · аккаунт уже есть, новый чистый браузер ════════════════════════════════════════
    console.log('\nСЛ-03 · аккаунт уже есть, письмо открыто в новом чистом браузере:');
    {
      const link = await letterFromDoor(browser, A);
      const { context, page, errors } = await browserOf(browser);
      await openLink(page, link.href, 9000);
      const me = await whoAmI(page);
      const welcome = await text(page, WELCOME);
      check('СЛ-03', 'вошёл тем же аккаунтом (тот же UID)', me?.email === A && me?.uid === uidA, `${describe(me)} · uid совпал: ${me?.uid === uidA}`);
      check('СЛ-03', 'карточки «Профиль сохранён» нет — это вход, а не рождение', !welcome);
      check('СЛ-03', 'консоль чиста', errors.length === 0, errors.slice(0, 2).join(' | '));
      await context.close();
    }

    // ═══ СЛ-04 · тот же браузер: адрес в памяти ════════════════════════════════════════════════
    console.log('\nСЛ-04 · письмо открыто в том же браузере, где просили:');
    {
      const B = `sl04-${stamp}@ndim.space`;
      const { context, page, errors } = await browserOf(browser);
      const link = await letterFromDoor(browser, B, page);
      await holdAuth(page, 1500);
      await page.goto(link.href);
      const seen = await page.getByText(SPINNER.ru).waitFor({ timeout: 8000 }).then(() => true, () => false);
      await page.waitForTimeout(12000);
      const me = await whoAmI(page);
      check('СЛ-04', 'шаг «идёт вход» показан так же, как в новом браузере', seen);
      check('СЛ-04', 'вошёл своей почтой', me?.email === B && !me.anonymous, describe(me));
      check('СЛ-04', 'консоль чиста', errors.length === 0, errors.slice(0, 2).join(' | '));
      await context.close();
    }

    // ═══ СЛ-05 · КОНТРОЛЬ: адрес подменён ══════════════════════════════════════════════════════
    console.log('\nСЛ-05 · в ссылке подменён адрес:');
    {
      const X = `sl05-owner-${stamp}@ndim.space`;
      const Y = `sl05-stranger-${stamp}@ndim.space`;
      const link = await letterFromDoor(browser, X);
      link.searchParams.set('email', Y);
      const { context, page } = await browserOf(browser);
      await openLink(page, link.href);
      const me = await whoAmI(page);
      await page.screenshot({ path: `${SHOTS}/sl05-forged.png`, fullPage: true });
      check('СЛ-05', 'не вошёл никто — ни хозяин ссылки, ни названный адрес', me === null, describe(me));
      await context.close();
    }

    // ═══ СЛ-07 · вошёл ДРУГОЙ аккаунт ══════════════════════════════════════════════════════════
    console.log('\nСЛ-07 · письмо для A открыто там, где вошёл B:');
    {
      const B = `sl07-b-${stamp}@ndim.space`;
      const Aother = `sl07-a-${stamp}@ndim.space`;
      const { context, page, errors } = await browserOf(browser);
      await openLink(page, (await letterFromDoor(browser, B, page)).href, 9000); // B вошёл в этом браузере
      const before = await whoAmI(page);
      const link = await letterFromDoor(browser, Aother);
      await openLink(page, link.href, 9000);
      const me = await whoAmI(page);
      const guestCard = await text(page, 'Сейчас Вы гость');
      await page.screenshot({ path: `${SHOTS}/sl07-other-account.png`, fullPage: true });
      check('СЛ-07', 'подготовка: B вошёл', before?.email === B, describe(before));
      check('СЛ-07', 'B остался в своём аккаунте, A не вошёл', me?.email === B, describe(me));
      check('СЛ-07', 'гостевой карточки нет', !guestCard);
      await context.close();
    }

    // ═══ СЛ-08 · гость в новом браузере ════════════════════════════════════════════════════════
    console.log('\nСЛ-08 · письмо открыто в браузере, где сидит гость:');
    {
      const Aguest = `sl08-a-${stamp}@ndim.space`;
      const link = await letterFromDoor(browser, Aguest);
      const { context, page } = await browserOf(browser);
      await openLink(page, `${BASE}/profile?guest=1`, 4000);
      const before = await whoAmI(page);
      await openLink(page, link.href, 9000);
      const me = await whoAmI(page);
      check('СЛ-08', 'подготовка: гость', before?.anonymous === true, describe(before));
      check('СЛ-08', 'сессия осталась гостевой, адрес к гостю не привязан', me?.anonymous === true && me?.uid === before?.uid, describe(me));
      await context.close();
    }

    // ═══ СЛ-11 · английская половина ═══════════════════════════════════════════════════════════
    console.log('\nСЛ-11 · шаг «идёт вход» по-английски:');
    {
      const E = `sl11-${stamp}@ndim.space`;
      const link = await letterFromDoor(browser, E);
      const { context, page } = await browserOf(browser, { lang: 'en' });
      await holdAuth(page, 2500);
      await page.goto(link.href);
      const seen = await page.getByText(SPINNER.en).waitFor({ timeout: 8000 }).then(() => true, () => false);
      const who = seen && (await text(page, WHO.en));
      const ru = await text(page, SPINNER.ru);
      await page.screenshot({ path: `${SHOTS}/sl11-en.png` });
      check('СЛ-11', 'английские строки шага на месте, русских нет', seen && who && !ru, `спиннер ${seen} · адрес ${Boolean(who)} · русская строка ${ru}`);
      await context.close();
    }
  } else {
    // ═══ СТЕЙДЖ: ссылка через настоящий обработчик Firebase ═══════════════════════════════════════
    const { cert, initializeApp } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');
    const { getFirestore } = await import('firebase-admin/firestore');
    const { serviceAccount } = await import('./lib/credentials.mjs');
    const { STAGE_PROJECT, STAGE_DATABASE, PROD_PROJECT, PROD_DATABASE } = await import('./lib/contours.mjs');
    initializeApp({ credential: cert(serviceAccount(CONTOUR)), projectId: PROD ? PROD_PROJECT : STAGE_PROJECT });
    const auth = getAuth();
    const store = getFirestore(PROD ? PROD_DATABASE : STAGE_DATABASE);
    const made = [];

    const realLink = async (email, path) => {
      const back = new URL(`${BASE}${path}`);
      back.searchParams.set('email', email);
      return auth.generateSignInWithEmailLink(email, { url: back.href, handleCodeInApp: true });
    };

    try {
      // ═══ СЛ-13 · новый человек через настоящий обработчик ═════════════════════════════════════
      const S = `sl13-${stamp}@ndim.space`;
      console.log(`СЛ-13 · настоящий обработчик ссылок, чистый браузер (${S}):`);
      {
        const link = await realLink(S, '/profile');
        check('СЛ-13', 'ссылка ведёт через обработчик Firebase', /\/__\/auth\/action/.test(link), new URL(link).host);
        const { context, page, errors } = await browserOf(browser);
        let landed = null;
        page.on('framenavigated', (f) => {
          if (f === page.mainFrame() && f.url().startsWith(`${BASE}/profile`) && !landed) landed = f.url();
        });
        await holdAuth(page, 1500);
        await page.goto(link);
        const seen = await page.getByText(SPINNER.ru).waitFor({ timeout: 20000 }).then(() => true, () => false);
        const who = seen && (await text(page, S));
        await page.screenshot({ path: `${SHOTS}/sl13-spinner.png` });
        await page.waitForTimeout(15000);
        const me = await whoAmI(page);
        if (me?.uid) made.push(me.uid);
        await page.screenshot({ path: `${SHOTS}/sl13-after.png`, fullPage: true });
        const url = landed ? new URL(landed) : null;
        check('СЛ-13', 'обработчик довёл до /profile с адресом и кодом', Boolean(url?.searchParams.get('email') === S && url?.searchParams.get('oobCode')),
          url ? `${url.pathname}?email=…&oobCode=${url.searchParams.get('oobCode') ? 'есть' : 'нет'}` : 'не долетел');
        check('СЛ-13', 'шаг «идёт вход» со строкой аккаунта', Boolean(who));
        check('СЛ-13', 'вошёл своей почтой, профиль без «Не удалось загрузить»', me?.email === S && !(await text(page, DOWN)), describe(me));
        check('СЛ-13', 'консоль чиста', errors.length === 0, errors.slice(0, 3).join(' | '));
        await context.close();

        // ═══ СЛ-06 на живом контуре · та же ссылка во втором чистом браузере ═════════════════════
        console.log('\nСЛ-06 · использованная ссылка в чистом браузере (живой контур):');
        const second = await browserOf(browser);
        await second.page.goto(link);
        await second.page.waitForTimeout(15000);
        const me2 = await whoAmI(second.page);
        if (me2?.uid) made.push(me2.uid); // заведённого по ошибке гостя тоже убираем
        await second.page.screenshot({ path: `${SHOTS}/sl06-used-link.png`, fullPage: true });
        check('СЛ-06', 'использованная ссылка не впустила, гость не заведён', me2 === null, describe(me2));
        check('СЛ-06', 'на двери входа видна строка ошибки о ссылке', await text(second.page, DEAD));
        await second.context.close();
      }

      // ═══ СЛ-05 на живом контуре · адрес в ссылке подменён ═══════════════════════════════════════
      {
        const X = `sl05-owner-${stamp}@ndim.space`;
        const Y = `sl05-stranger-${stamp}@ndim.space`;
        console.log(`\nСЛ-05 · письмо для ${X}, в ссылке подменён адрес на ${Y}:`);
        const real = new URL(await realLink(X, '/profile'));
        const cont = new URL(real.searchParams.get('continueUrl'));
        cont.searchParams.set('email', Y);
        real.searchParams.set('continueUrl', cont.href);
        const forged = await browserOf(browser);
        await forged.page.goto(real.href);
        await forged.page.waitForTimeout(15000);
        const me5 = await whoAmI(forged.page);
        if (me5?.uid) made.push(me5.uid);
        await forged.page.screenshot({ path: `${SHOTS}/sl05-forged.png`, fullPage: true });
        check('СЛ-05', 'не вошёл никто — ни хозяин ссылки, ни названный адрес', me5 === null, describe(me5));
        await forged.context.close();
      }

      // ═══ СЛ-12 · публичная дверь удаления ═════════════════════════════════════════════════════
      const D = `sl12-${stamp}@ndim.space`;
      console.log(`\nСЛ-12 · публичная дверь удаления, чистый браузер (${D}) — удаление НЕ нажимается:`);
      {
        const user = await auth.createUser({ email: D, emailVerified: false });
        made.push(user.uid);
        const link = await realLink(D, '/ru/delete-account');
        const { context, page, errors } = await browserOf(browser);
        await page.goto(link);
        await page.waitForTimeout(15000);
        const me = await whoAmI(page);
        // Поле почты на шаге удаления — ПОДТВЕРЖДЕНИЕ удаления, а не форма входа (первая редакция
        // кейса путала их и красила продукт ложно, кадр 2026-09-13). Признак шага — его вопрос.
        const step = await text(page, 'будут безвозвратно удалены');
        const signinForm = await page.getByRole('button', { name: /Получить ссылку/ }).isVisible().catch(() => false);
        await page.screenshot({ path: `${SHOTS}/sl12-delete-door.png`, fullPage: true });
        check('СЛ-12', 'вошёл этой почтой', me?.email === D, describe(me));
        check('СЛ-12', 'страница показывает шаг удаления, а не форму входа', step && !signinForm, `шаг ${step} · форма входа ${signinForm}`);
        check('СЛ-12', 'консоль чиста', errors.length === 0, errors.slice(0, 3).join(' | '));
        await context.close();
      }
    } finally {
      // Следы прогона: учётки Auth и документы `users/`, заведённые этим прогоном.
      for (const uid of made) {
        await store.doc(`users/${uid}`).delete().catch(() => {});
        await auth.deleteUser(uid).catch(() => {});
      }
      console.log(`\nСледы убраны: учёток Auth ${made.length} и их документы users/.`);
    }
  }
} finally {
  await browser.close();
}

const cases = [...new Set(verdicts.map((v) => v.id))];
const failed = cases.filter((id) => verdicts.some((v) => v.id === id && !v.ok));
console.log(`\nКЕЙСОВ: ${cases.length} · pass ${cases.length - failed.length} · fail ${failed.length}${failed.length ? ` (${failed.join(', ')})` : ''}`);
console.log(`ПРОВЕРОК: ${verdicts.length} · ПРОВАЛОВ: ${failures} · кадры: ${SHOTS}/`);
process.exit(failures === 0 ? 0 : 1);

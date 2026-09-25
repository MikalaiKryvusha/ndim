// ДРАЙВЕР РУЧНОГО ПРОГОНА — набор `qa/suites/signin-link-forks.md`, порция 1 (экран Б3 + вкладка «письмо отправлено»).
// Стенд (`npm run stand` в этом рабочем месте). Письмо просится ДВЕРЬЮ ПРОДУКТА, ссылку отдаёт эмулятор Auth (`EXP-0045`),
// «другой браузер» — отдельный контекст Playwright со своим хранилищем. Приёмы сняты с `tools/verify-signin-link-any-browser.mjs`.
// Запуск из корня рабочего места: node qa/reports/2026-09-25_signin-link-forks.driver.mjs
// Кадры: test-results/signin-link-forks/ — смотрятся глазами после прогона.
import { mkdir } from 'node:fs/promises';
import { basename } from 'node:path';
import { chromium } from '@playwright/test';
import { portsFor, slotOf } from '../../tools/lib/stand-slot.mjs';
import { markProbeContext } from '../../tools/lib/probe-mark.mjs';

// Порты — СЛОТА рабочего места (у dev-1 слот 3: dev 5203, auth 9129), а не литералы главной копии 5173/9099.
const PORTS = portsFor(slotOf(basename(process.cwd())).slot);
const BASE = process.env.PROBE_BASE ?? `http://localhost:${PORTS.dev}`;
const AUTH = `http://127.0.0.1:${PORTS.auth}`;
const PROJECT = 'demo-ndim-dev';
const SHOTS = 'test-results/signin-link-forks';
const stamp = Date.now();
// Строки экрана Б3 — те, что человек ОБЯЗАН увидеть (RU — кадр Vb3.png дословно; EN — черновик после §7Б).
const B3 = {
  ru: {
    title: 'Ссылка из письма для другого адреса',
    lede: (c, l) => `Сейчас Вы в аккаунте ${c}. Ссылка из письма открывает аккаунт ${l}.`,
    stay: (c) => `Остаться в аккаунте ${c}`,
    go: (l) => `Войти в аккаунт ${l}`,
  },
  en: {
    title: 'The link in the email is for a different address',
    lede: (c, l) => `You are currently signed in to the ${c} account. The link in the email signs you in to the ${l} account.`,
    stay: (c) => `Stay signed in to the ${c} account`,
    go: (l) => `Sign in to the ${l} account`,
  },
};
const SPINNER = 'Выполняем вход в Пространство NDim Space';
const SENT_GUEST = 'Мы отправили Вам письмо';
const SENT_DOOR = 'Письмо отправлено';

let failures = 0;
function check(id, name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${id} · ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Кто вошёл по мнению Firebase: IndexedDB `firebaseLocalStorageDb` (урок `verify-bug233`, К0). */
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
const describe = (me) => (me ? (me.anonymous ? `гость ${me.uid.slice(0, 6)}` : me.email) : 'нет сессии');

/** Отдельный браузер: своё хранилище и сессия; тема и язык кладутся ДО загрузки. */
async function browserOf(browser, { w = 390, h = 844, theme, lang } = {}) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, locale: 'ru-RU' });
  await markProbeContext(context);
  await context.addInitScript(([t, l]) => {
    if (t) localStorage.setItem('ndim-theme', t);
    if (l) localStorage.setItem('ndim-lang', l);
  }, [theme, lang]);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${m.text()} @ ${(m.location()?.url || page.url()).split('?')[0]}`);
  });
  return { context, page, errors };
}

/** Ссылка, выпущенная эмулятором для адреса, — так же, как её собирает боевой обработчик (continueUrl + код). */
async function linkFor(email) {
  const codes = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`).then((r) => r.json());
  const mine = (codes.oobCodes ?? []).filter((c) => c.email === email && c.requestType === 'EMAIL_SIGNIN').at(-1);
  if (!mine) throw new Error(`эмулятор не выпустил письмо для ${email}`);
  const link = new URL(new URL(mine.oobLink).searchParams.get('continueUrl'));
  link.searchParams.set('mode', 'signIn');
  link.searchParams.set('oobCode', mine.oobCode);
  link.searchParams.set('apiKey', 'demo-api-key');
  return link.href;
}

/** Письмо дверью входа продукта (без сессии) в переданной странице или в отдельном контексте. */
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
  await page.getByText(SENT_DOOR).waitFor({ timeout: 15000 });
  if (own) await own.close();
  return linkFor(email);
}

/** Войти адресом в этом контексте его же письмом (подготовка «в браузере уже вошёл …»). */
async function signInHere(browser, page, email) {
  const link = await letterFromDoor(browser, email, page);
  await page.goto(link);
  await page.waitForTimeout(9000);
}

/** Придержать ответы Auth, чтобы шаг «идёт вход» был виден глазу и кадру. */
async function holdAuth(page, ms) {
  await page.route(/identitytoolkit\.googleapis\.com/, async (r) => {
    await new Promise((ok) => setTimeout(ok, ms));
    await r.continue().catch(() => {});
  });
}

/** Экран Б3 на странице: заголовок, строка с обоими адресами, обе кнопки (по крючкам `data-fork`). */
async function b3Seen(page, current, link, lang = 'ru') {
  const s = B3[lang];
  const title = await page.getByText(s.title).waitFor({ timeout: 12000 }).then(() => true, () => false);
  const lede = await text(page, s.lede(current, link));
  const stay = (await page.locator('[data-fork="stay"]').innerText({ timeout: 3000 }).catch(() => '')).trim();
  const go = (await page.locator('[data-fork="switch"]').innerText({ timeout: 3000 }).catch(() => '')).trim();
  return { title, lede, stay: stay === s.stay(current), go: go === s.go(link), stayText: stay, goText: go };
}

/** Ничего не вылезает за правый край окна (адрес без пробелов на 390). */
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch();
try {
  console.log(`Стенд: ${BASE}`);

  // ═══ ВС-01 · ВС-02 · Б3 показан, дорога «Остаться» (390, светлая) ════════════════════════════
  console.log('\nВС-01 · ВС-02 · вошёл Б, ссылка для А → экран Б3 → «Остаться»:');
  {
    const B = `vs01-b-${stamp}@ndim.space`;
    const A = `vs01-a-${stamp}@ndim.space`;
    const { context, page, errors } = await browserOf(browser);
    await signInHere(browser, page, B);
    const before = await whoAmI(page);
    check('ВС-01', 'подготовка: в контексте вошёл Б', before?.email === B, describe(before));
    const link = await letterFromDoor(browser, A);
    await page.goto(link);
    const seen = await b3Seen(page, B, A);
    const me = await whoAmI(page);
    await page.screenshot({ path: `${SHOTS}/vs01-b3-390-light.png` });
    check('ВС-01', 'заголовок Б3', seen.title);
    check('ВС-01', 'строка называет оба адреса дословно по кадру', seen.lede);
    check('ВС-01', 'кнопки «Остаться в аккаунте Б» и «Войти в аккаунт А»', seen.stay && seen.go, `«${seen.stayText}» · «${seen.goText}»`);
    check('ВС-01', 'пока вопрос открыт, в сессии Б (вход не начат)', me?.email === B, describe(me));
    check('ВС-01', 'ничего не вылезает за край на 390', await noOverflow(page));
    // Нет кнопки — кейс краснеет своими проверками, а прогон не падает (мутант «Б3 снят» обязан дойти до кейсов вкладки).
    await page.locator('[data-fork="stay"]').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(5000);
    const after = await whoAmI(page);
    const guestCard = await text(page, 'Сейчас Вы гость');
    const stillB3 = await text(page, B3.ru.title);
    await page.screenshot({ path: `${SHOTS}/vs02-stay.png`, fullPage: true });
    check('ВС-02', 'остался Б, экрана Б3 больше нет', after?.email === B && !stillB3, describe(after));
    check('ВС-02', 'гостевой карточки нет', !guestCard);
    check('ВС-02', 'адрес email= стёрт из строки браузера', !page.url().includes('email='), new URL(page.url()).search || 'пусто');
    check('ВС-02', 'консоль чиста', errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }

  // ═══ ВС-01 · остальные клетки тема × ширина ═══════════════════════════════════════════════════
  console.log('\nВС-01 · экран Б3, остальные клетки:');
  for (const [w, h, theme] of [[390, 844, 'dark'], [1440, 900, 'light'], [1440, 900, 'dark']]) {
    const B = `vs01c-b-${w}${theme}-${stamp}@ndim.space`;
    const A = `vs01c-a-${w}${theme}-long-address-for-wrap-${stamp}@ndim.space`;
    const { context, page } = await browserOf(browser, { w, h, theme });
    await signInHere(browser, page, B);
    await page.goto(await letterFromDoor(browser, A));
    const seen = await b3Seen(page, B, A);
    const applied = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.screenshot({ path: `${SHOTS}/vs01-b3-${w}-${theme}.png` });
    check('ВС-01', `Б3 · ${w} · ${theme} (длинный адрес А)`, seen.title && seen.lede && seen.stay && seen.go && applied === theme && (await noOverflow(page)), `тема ${applied}`);
    await context.close();
  }

  // ═══ ВС-03 · Б3 → «Войти в аккаунт А» ══════════════════════════════════════════════════════════
  console.log('\nВС-03 · экран Б3 → «Войти в аккаунт А»:');
  {
    const B = `vs03-b-${stamp}@ndim.space`;
    const A = `vs03-a-${stamp}@ndim.space`;
    const { context, page, errors } = await browserOf(browser);
    await signInHere(browser, page, B);
    await page.goto(await letterFromDoor(browser, A));
    await b3Seen(page, B, A);
    await holdAuth(page, 2000);
    await page.locator('[data-fork="switch"]').click({ timeout: 5000 }).catch(() => {});
    const spinner = await page.getByText(SPINNER).waitFor({ timeout: 8000 }).then(() => true, () => false);
    const who = spinner && (await text(page, A));
    await page.screenshot({ path: `${SHOTS}/vs03-switch-spinner.png` });
    await page.waitForTimeout(12000);
    const me = await whoAmI(page);
    const down = await text(page, 'Не удалось загрузить данные');
    await page.screenshot({ path: `${SHOTS}/vs03-switch-after.png`, fullPage: true });
    check('ВС-03', 'шаг «идёт вход» называет адрес А', spinner && who, `спиннер ${spinner} · адрес ${Boolean(who)}`);
    check('ВС-03', 'в сессии А, не гость', me?.email === A && !me.anonymous, describe(me));
    check('ВС-03', 'профиль без «Не удалось загрузить»', !down);
    check('ВС-03', 'консоль чиста', errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }

  // ═══ ВС-04 · КОНТРОЛЬ: вошёл тот же аккаунт ═════════════════════════════════════════════════════
  console.log('\nВС-04 · контроль: ссылка для Б там, где вошёл Б:');
  {
    const B = `vs04-${stamp}@ndim.space`;
    const { context, page } = await browserOf(browser);
    await signInHere(browser, page, B);
    await page.goto(await letterFromDoor(browser, B));
    await page.waitForTimeout(8000);
    const me = await whoAmI(page);
    check('ВС-04', 'экрана Б3 нет', !(await text(page, B3.ru.title)));
    check('ВС-04', 'в сессии Б, гостевой карточки нет', me?.email === B && !(await text(page, 'Сейчас Вы гость')), describe(me));
    await context.close();
  }

  // ═══ ВС-05 · КОНТРОЛЬ: сессии нет ══════════════════════════════════════════════════════════════
  console.log('\nВС-05 · контроль: чистый браузер:');
  {
    const A = `vs05-${stamp}@ndim.space`;
    const link = await letterFromDoor(browser, A);
    const { context, page } = await browserOf(browser);
    await holdAuth(page, 1500);
    await page.goto(link);
    const spinner = await page.getByText(SPINNER).waitFor({ timeout: 8000 }).then(() => true, () => false);
    const b3 = await text(page, B3.ru.title);
    await page.waitForTimeout(12000);
    const me = await whoAmI(page);
    check('ВС-05', 'экрана Б3 нет, шаг «идёт вход» есть', spinner && !b3);
    check('ВС-05', 'в сессии А', me?.email === A, describe(me));
    await context.close();
  }

  // ═══ ВС-06 · Б3 по-английски ════════════════════════════════════════════════════════════════════
  console.log('\nВС-06 · экран Б3 по-английски:');
  {
    const B = `vs06-b-${stamp}@ndim.space`;
    const A = `vs06-a-${stamp}@ndim.space`;
    // Подготовка идёт русской дверью (драйвер ищет её кнопки по русским подписям), язык — английский ПЕРЕД ссылкой А.
    const { context, page } = await browserOf(browser);
    await signInHere(browser, page, B);
    await page.evaluate(() => localStorage.setItem('ndim-lang', 'en'));
    await page.goto(await letterFromDoor(browser, A));
    const seen = await b3Seen(page, B, A, 'en');
    const ru = await text(page, B3.ru.title);
    await page.screenshot({ path: `${SHOTS}/vs06-b3-en.png` });
    check('ВС-06', 'английские строки Б3 на месте, русских нет', seen.title && seen.lede && seen.stay && seen.go && !ru, `«${seen.stayText}» · «${seen.goText}»`);
    await context.close();
  }

  // ═══ ВС-07 · вкладка гостя «отправлено» уходит в профиль ═════════════════════════════════════════
  console.log('\nВС-07 · гость: «Сохранить мои результаты» → письмо; ссылка во второй вкладке того же браузера:');
  {
    const A = `vs07-${stamp}@ndim.space`;
    const { context, page: tab1, errors } = await browserOf(browser);
    await tab1.goto(`${BASE}/profile?guest=1`);
    await tab1.getByRole('button', { name: 'Сохранить мои результаты' }).click({ timeout: 30000 });
    await tab1.waitForTimeout(800);
    const mail = tab1.getByRole('button', { name: /почт/i }).first();
    if (await mail.count()) await mail.click();
    await tab1.locator('input[type="email"]').fill(A);
    await tab1.getByRole('button', { name: /ссылк|Получить|Отправить/i }).first().click();
    await tab1.getByText(SENT_GUEST).waitFor({ timeout: 30000 });
    const guestBefore = await whoAmI(tab1);
    const tab2 = await context.newPage();
    await tab2.goto(await linkFor(A));
    await tab2.getByText('Профиль сохранён').waitFor({ timeout: 20000 }).catch(() => {});
    await tab1.waitForTimeout(8000);
    const sentStill = await text(tab1, SENT_GUEST);
    const pill = await tab1.locator('text=гость').count();
    const me1 = await whoAmI(tab1);
    await tab1.screenshot({ path: `${SHOTS}/vs07-tab1-after.png`, fullPage: true });
    await tab2.screenshot({ path: `${SHOTS}/vs07-tab2.png`, fullPage: true });
    check('ВС-07', 'подготовка: вкладка 1 — гость на шаге «Мы отправили Вам письмо»', guestBefore?.anonymous === true, describe(guestBefore));
    check('ВС-07', 'вкладка 2 — «Профиль сохранён»', await text(tab2, 'Профиль сохранён'));
    check('ВС-07', 'вкладка 1 сама ушла: шага «отправлено» нет, адрес /profile', !sentStill && new URL(tab1.url()).pathname === '/profile', tab1.url());
    check('ВС-07', 'вкладка 1 — А, не гость, тот же uid', me1?.email === A && !me1.anonymous && me1.uid === guestBefore?.uid, `${describe(me1)} · пилюль «гость»: ${pill}`);
    check('ВС-07', 'консоль вкладки 1 чиста', errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }

  // ═══ ВС-08 · дверь без сессии «отправлено» уходит в профиль ══════════════════════════════════════
  console.log('\nВС-08 · без сессии: дверь → письмо; ссылка во второй вкладке того же браузера:');
  {
    const A = `vs08-${stamp}@ndim.space`;
    const { context, page: tab1 } = await browserOf(browser);
    const link = await letterFromDoor(browser, A, tab1);
    const tab2 = await context.newPage();
    await tab2.goto(link);
    await tab1.waitForTimeout(14000);
    const me1 = await whoAmI(tab1);
    const sentStill = await text(tab1, SENT_DOOR);
    await tab1.screenshot({ path: `${SHOTS}/vs08-tab1-after.png`, fullPage: true });
    check('ВС-08', 'вкладка 1 сама ушла с шага «Письмо отправлено» в профиль А', !sentStill && me1?.email === A, `${describe(me1)} · ${tab1.url()}`);
    await context.close();
  }

  // ═══ ВС-09 · КОНТРОЛЬ: никто не вошёл — вкладка стоит ═════════════════════════════════════════════
  console.log('\nВС-09 · контроль: письмо отправлено, ссылку не открывают:');
  {
    const A = `vs09-${stamp}@ndim.space`;
    const { context, page } = await browserOf(browser);
    await page.goto(`${BASE}/profile?guest=1`);
    await page.getByRole('button', { name: 'Сохранить мои результаты' }).click({ timeout: 30000 });
    await page.waitForTimeout(800);
    const mail = page.getByRole('button', { name: /почт/i }).first();
    if (await mail.count()) await mail.click();
    await page.locator('input[type="email"]').fill(A);
    await page.getByRole('button', { name: /ссылк|Получить|Отправить/i }).first().click();
    await page.getByText(SENT_GUEST).waitFor({ timeout: 30000 });
    const url = page.url();
    await page.waitForTimeout(8000);
    check('ВС-09', 'вкладка стоит на шаге «Мы отправили Вам письмо», адрес тот же', (await text(page, SENT_GUEST)) && page.url() === url, page.url());
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(`\nИтог: провалов ${failures}`);
process.exitCode = failures ? 1 : 0;

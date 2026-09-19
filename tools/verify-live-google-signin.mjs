/**
 * СМОУК ДВЕРЕЙ GOOGLE НА ЖИВОМ КОНТУРЕ (стейдж или бой) — без входа в Google.
 * Набор: `qa/suites/google-signin.md` (кейсы ГЖ-01…ГЖ-03). Стендовая половина — `tools/verify-google-signin.mjs`.
 *
 * Что доступно агенту на живом контуре и что нет — граница названа: тестового аккаунта Google у агента нет,
 * поэтому вход не ЗАВЕРШАЕТСЯ. Проверяется всё до окна и после его закрытия: каждая дверь Google есть,
 * открывает НАСТОЯЩЕЕ окно Google (страница входа, не страница ошибки Google), а закрытое окно продукт
 * замечает и говорит «Вход через Google не завершён…», оставляя двери.
 *
 *   ГЖ-01 · дверь входа без сессии → «Войти через Google» → окно → закрыть
 *   ГЖ-02 · гость → «Сохранить мои результаты» → «Продолжить с Google» → окно → закрыть
 *   ГЖ-03 · гость → «У меня уже есть аккаунт» → «Войти в свой аккаунт» → «Войти через Google» → окно → закрыть
 *   УБОРКА · анонимные учётки прогона удаляются своим `idToken`; уборка проверяется
 *
 * Запуск:  node tools/verify-live-google-signin.mjs --stage
 *          node tools/verify-live-google-signin.mjs --contour prod   [--width 1440] [--theme dark]
 * Кадры:   test-results/live-google-signin/<контур>-<ширина>-<тема>/
 *
 * [TESTED: 2026-09-19 · контроль на старой сборке стейджа — ГЖ-03 красный, остальное зелёное; новая сборка: стейдж 0
 *  провалов, бой 0 провалов на 390 светлой и 1440 тёмной, кадры глазами; отчёт `qa/reports/2026-09-19_google-signin.md`]
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { contourFromArgv } from './lib/contours.mjs';
import { grantAppCheckDebug } from './lib/app-check-debug.mjs';
import { markProbeContext } from './lib/probe-mark.mjs';

const CONTOUR = contourFromArgv();
const BASE = CONTOUR.site;
const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const WIDTH = Number(arg('--width', '390'));
const THEME = arg('--theme', 'light');
const OUT = `test-results/live-google-signin/${CONTOUR.name}-${WIDTH}-${THEME}`;
const NOT_DONE = 'Вход через Google не завершён';

let failures = 0;
function check(id, name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${id} · ${name}${detail ? ` — ${detail}` : ''}`);
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const tokens = new Set();

async function contextOf() {
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 860 }, locale: 'ru-RU', hasTouch: WIDTH < 1024, isMobile: WIDTH < 1024 });
  await markProbeContext(ctx);
  await ctx.addInitScript((theme) => {
    try { localStorage.setItem('ndim-theme', theme); } catch { /* приватный режим */ }
  }, THEME);
  await grantAppCheckDebug(ctx, { required: CONTOUR.name === 'prod' });
  // Токен гостя — из ответа самого Firebase: им и убираем учётку в конце.
  ctx.on('response', async (r) => {
    if (!/identitytoolkit.*accounts:signUp/.test(r.url())) return;
    try {
      const body = await r.json();
      if (typeof body.idToken === 'string') tokens.add(body.idToken);
    } catch { /* не JSON */ }
  });
  return ctx;
}

/**
 * Нажать кнопку Google: окно обязано открыться на странице ВХОДА Google (а не на странице ошибки);
 * затем окно закрывается без ввода, и продукт обязан это заметить.
 */
async function openAndClose(id, page, button, shot) {
  const popupP = page.waitForEvent('popup', { timeout: 15000 }).catch(() => null);
  await button.click();
  const popup = await popupP;
  let where = 'окно не открылось';
  let signinPage = false;
  if (popup) {
    await popup.waitForLoadState('domcontentloaded').catch(() => {});
    await popup.waitForURL(/accounts\.google\.com/, { timeout: 20000 }).catch(() => {});
    await popup.waitForTimeout(2500);
    const u = new URL(popup.url());
    where = `${u.host}${u.pathname}`;
    const text = await popup.evaluate(() => document.body.innerText).catch(() => '');
    // Страница входа Google: поле «Телефон или адрес эл. почты» / «Email or phone», без слов ошибки.
    signinPage = u.host === 'accounts.google.com' && /signin|oauthchooseaccount/i.test(u.pathname) && !/403|disallowed_useragent|Error 400|redirect_uri_mismatch|invalid_client/i.test(text);
    await popup.screenshot({ path: `${OUT}/${shot}-google.png` }).catch(() => {});
    await popup.close().catch(() => {});
  }
  check(id, 'окно Google открылось на странице входа', signinPage, where);
  const said = await page.getByText(NOT_DONE).waitFor({ timeout: 25000 }).then(() => true, () => false);
  await page.screenshot({ path: `${OUT}/${shot}-closed.png` });
  check(id, 'закрытое окно: «Вход через Google не завершён…»', said);
}

try {
  console.log(`контур ${CONTOUR.title} ${BASE} · ширина ${WIDTH} · тема ${THEME}\n`);

  console.log('ГЖ-01 · дверь входа без сессии:');
  {
    const ctx = await contextOf();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
    const door = page.getByRole('button', { name: 'Войти через Google' });
    await door.waitFor({ timeout: 30000 });
    await openAndClose('ГЖ-01', page, door, 'gzh01-door');
    const doors = await page.getByRole('button', { name: 'Войти через Google' }).isVisible().catch(() => false);
    check('ГЖ-01', 'двери входа снова видны', doors);
    await ctx.close();
  }

  // Гость — настоящей кнопкой двери, как у человека.
  async function guestPage() {
    const ctx = await contextOf();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
    const guestDoor = page.locator('[data-door="guest"]').first();
    await guestDoor.waitFor({ state: 'visible', timeout: 30000 });
    await guestDoor.click();
    await page.getByRole('button', { name: 'Сохранить мои результаты' }).waitFor({ timeout: 30000 });
    return { ctx, page };
  }

  console.log('\nГЖ-02 · гость → «Сохранить мои результаты» → «Продолжить с Google»:');
  {
    const { ctx, page } = await guestPage();
    await page.getByRole('button', { name: 'Сохранить мои результаты' }).click();
    await openAndClose('ГЖ-02', page, page.getByRole('button', { name: 'Продолжить с Google' }), 'gzh02-upgrade');
    await ctx.close();
  }

  console.log('\nГЖ-03 · гость → «У меня уже есть аккаунт» → «Войти через Google»:');
  {
    const { ctx, page } = await guestPage();
    await page.getByRole('button', { name: 'У меня уже есть аккаунт' }).click();
    await page.getByRole('button', { name: 'Войти в свой аккаунт' }).click();
    const inside = page.getByRole('button', { name: 'Войти через Google' });
    const present = await inside.waitFor({ timeout: 10000 }).then(() => true, () => false);
    await page.locator('.door-title').locator('xpath=..').screenshot({ path: `${OUT}/gzh03-signin-door.png` }).catch(() => {});
    check('ГЖ-03', 'в двери «Вход в Ваш аккаунт» есть «Войти через Google»', present);
    if (present) await openAndClose('ГЖ-03', page, inside, 'gzh03-signin');
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log('\nУБОРКА:');
let removed = 0;
for (const idToken of tokens) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${CONTOUR.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (r.ok) removed += 1;
}
check('УБОРКА', `анонимных учёток заведено ${tokens.size}, удалено ${removed}`, tokens.size === 2 && removed === tokens.size);

console.log(`\nИТОГ: провалов ${failures}. Кадры: ${OUT}/`);
process.exitCode = failures === 0 ? 0 : 1;

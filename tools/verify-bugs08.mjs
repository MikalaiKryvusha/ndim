/**
 * Живая проверка пачки 1 бага 08 (bugs/08_krinik_tests.md) на стенде.
 *
 * Мандат владельца: «тестируем агентом: ходит, снимает скриншоты, тыкает, смотрит».
 * Скрипт ходит по стенду настоящим браузером и проверяет объективно (rect'ы, URL,
 * наличие/отсутствие текста), а скриншоты складывает в test-results/bugs08/ (вне git).
 *
 *   08.1 — вошедшего (и гостя) лендинг уводит в /profile; без сессии лендинг остаётся.
 *   08.2 — вход существующего человека по почтовой ссылке БЕЗ поздравления;
 *          апгрейд гостя — С поздравлением (виджет «Профиль сохранён»).
 *   08.3 — шапка и нижняя панель во всю ширину; панель прибита к низу вьюпорта
 *          и не выталкивается длинным контентом; контент — колонной по центру.
 *
 * Почтовая ссылка добывается у эмулятора Auth по REST (`/emulator/v1/.../oobCodes`) —
 * письмо не нужно. Требует работающего стенда: `npm run stand`.
 *
 * Запуск: node tools/verify-bugs08.mjs
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const AUTH = 'http://127.0.0.1:9099';
const PROJECT = 'demo-ndim-dev';
const SHOTS = 'test-results/bugs08';

/** Заголовок поздравления — он же критерий 08.2 (текст из profile/+page.svelte). */
const CONGRATS = 'Добро пожаловать в Пространство NDim';

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Свежая почтовая ссылка эмулятора для адреса: как из письма, только без письма. */
async function latestSignInLink(email) {
  const res = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes = [] } = await res.json();
  const mine = oobCodes.filter((c) => c.email === email && c.requestType === 'EMAIL_SIGNIN');
  const last = mine.at(-1);
  if (!last) throw new Error(`нет oobCode для ${email}`);
  return `${BASE}/profile?mode=signIn&oobCode=${last.oobCode}&apiKey=demo-api-key`;
}

/** Просит эмулятор выпустить почтовую ссылку (аналог sendSignInLinkToEmail). */
async function requestSignInLink(email) {
  const res = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=demo-api-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestType: 'EMAIL_SIGNIN', email, continueUrl: `${BASE}/profile` }),
    },
  );
  if (!res.ok) throw new Error(`sendOobCode: ${res.status} ${await res.text()}`);
  return latestSignInLink(email);
}

/** Прямоугольник элемента в координатах вьюпорта (объективнее разглядывания). */
const rect = (page, selector) =>
  page.$eval(selector, (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom };
  });

/** Новый чистый контекст: отдельный человек с пустым браузером. */
async function person(browser, viewport) {
  const context = await browser.newContext({ viewport, locale: 'ru-RU' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return { context, page, errors };
}

await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch();

try {
  // ── 08.3 — мобильная оболочка: ширина и прибитая панель ──
  console.log('08.3 · мобильная оболочка (390×740):');
  {
    const { context, page, errors } = await person(browser, { width: 390, height: 740 });
    await page.goto(`${BASE}/dims`);
    await page.waitForSelector('nav.bnav');
    // дождаться ленты, чтобы экран стал длинным
    await page.waitForSelector('main', { timeout: 15000 });
    await page.waitForTimeout(2500);

    const bar = await rect(page, 'header.bar');
    check('шапка во всю ширину', Math.round(bar.w) === 390, `ширина ${bar.w}`);

    const nav0 = await rect(page, 'nav.bnav');
    check('панель во всю ширину', Math.round(nav0.w) === 390, `ширина ${nav0.w}`);
    check('панель видна без скролла', nav0.bottom <= 740 + 1 && nav0.y > 740 - 90, `y ${nav0.y}, низ ${nav0.bottom}`);

    const scrollable = await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 50);
    check('контент длиннее экрана (сценарий выталкивания реален)', scrollable);
    await page.evaluate(() => window.scrollTo(0, Math.floor(document.documentElement.scrollHeight / 2)));
    await page.waitForTimeout(300);
    const nav1 = await rect(page, 'nav.bnav');
    check('панель прибита при скролле', nav1.bottom <= 740 + 1 && nav1.y > 740 - 90, `y ${nav1.y}, низ ${nav1.bottom}`);
    await page.screenshot({ path: `${SHOTS}/dims-mobile-scrolled.png` });

    check('консоль чиста (dims)', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }

  console.log('08.3 · планшетная ширина (800×900) — шапка тянется, контент колонной:');
  {
    const { context, page, errors } = await person(browser, { width: 800, height: 900 });
    await page.goto(`${BASE}/profile`);
    await page.waitForSelector('.head-card', { timeout: 20000 });
    const bar = await rect(page, 'header.bar');
    check('шапка во всю ширину', Math.round(bar.w) === 800, `ширина ${bar.w}`);
    const nav = await rect(page, 'nav.bnav');
    check('панель во всю ширину', Math.round(nav.w) === 800, `ширина ${nav.w}`);
    const body = await rect(page, 'main.body');
    check('контент — колонной по центру', body.w <= 458 && body.x > 100, `ширина ${body.w}, x ${body.x}`);
    await page.screenshot({ path: `${SHOTS}/profile-tablet.png` });
    check('консоль чиста (profile)', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }

  // ── 08.1 — лендинг и сессия ──
  console.log('08.1 · лендинг: без сессии остаёмся, с сессией уводит внутрь:');
  {
    const { context, page } = await person(browser, { width: 390, height: 740 });
    await page.goto(`${BASE}/`);
    await page.waitForTimeout(2000); // окно, в котором редирект успел бы случиться
    check('без сессии лендинг остаётся', new URL(page.url()).pathname === '/', page.url());

    await page.goto(`${BASE}/profile`); // стенд входит сам (dev@ndim.space)
    await page.waitForSelector('.head-card', { timeout: 20000 });
    await page.goto(`${BASE}/`);
    await page.waitForURL('**/profile', { timeout: 10000 });
    check('с сессией / уводит в /profile', true);
    await page.screenshot({ path: `${SHOTS}/landing-redirect.png` });
    await context.close();
  }

  // ── 08.2 — вход существующего: БЕЗ поздравления ──
  console.log('08.2 · существующий человек по почтовой ссылке — без поздравления:');
  {
    const { context, page, errors } = await person(browser, { width: 390, height: 740 });
    // почту «запоминаем» так же, как это делает sendLoginLink
    await page.goto(`${BASE}/`);
    await page.evaluate(() => localStorage.setItem('ndim-pending-email', 'dev@ndim.space'));
    const link = await requestSignInLink('dev@ndim.space');
    await page.goto(link);
    await page.waitForSelector('.head-card', { timeout: 20000 });
    const congrats = await page.getByText(CONGRATS).count();
    check('поздравления НЕТ', congrats === 0, `вхождений: ${congrats}`);
    check('человек в своём профиле', new URL(page.url()).pathname === '/profile', page.url());
    await page.screenshot({ path: `${SHOTS}/email-signin-existing.png` });
    check('консоль чиста (вход)', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }

  // ── 08.2 — апгрейд гостя: поздравление ОСТАЁТСЯ ──
  console.log('08.2 · гость создаёт аккаунт — поздравление на месте:');
  {
    const { context, page, errors } = await person(browser, { width: 390, height: 740 });
    const email = `newbie-${Date.now()}@test.dev`;
    await page.goto(`${BASE}/profile?guest=1`);
    await page.getByRole('button', { name: 'Сохранить результаты' }).click();
    await page.getByPlaceholder('Ваш адрес электронной почты').fill(email);
    await page.getByRole('button', { name: 'Получить ссылку для входа' }).click();
    await page.getByText('Мы отправили Вам письмо').waitFor({ timeout: 15000 });
    const link = await latestSignInLink(email); // ссылку отправило само приложение
    await page.goto(link);
    await page.getByText(CONGRATS).waitFor({ timeout: 20000 });
    check('поздравление показано новичку', true);
    await page.screenshot({ path: `${SHOTS}/email-link-new-account.png` });

    // и гость-теперь-человек с лендинга тоже уводится внутрь (08.1)
    await page.goto(`${BASE}/`);
    await page.waitForURL('**/profile', { timeout: 10000 });
    check('свежий аккаунт: / уводит в /profile', true);
    check('консоль чиста (апгрейд)', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\nПРОВАЛОВ: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

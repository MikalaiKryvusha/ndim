/**
 * QA-прогон пачки 4 фиксов третьей волны (bugs/34, 35, 36, 37) на стенде живым браузером.
 * Канон процесса — plans/06. Требует `npm run stand`. Скриншоты — test-results/batch4/.
 *
 * Запуск: node tools/verify-batch4.mjs
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const SHOTS = 'test-results/batch4';

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function person(browser, { theme, width = 390 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 740 }, locale: 'ru-RU' });
  if (theme) await context.addInitScript((value) => localStorage.setItem('ndim-theme', value), theme);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return { context, page, errors };
}

const browser = await chromium.launch();
await mkdir(SHOTS, { recursive: true });

try {
  // ── bugs/34: шапка приклеена к верху вьюпорта (канон 1.x) ──
  for (const width of [390, 1440]) {
    console.log(`bugs/34 · шапка приклеена (ширина ${width}, тёмная тема):`);
    const { context, page, errors } = await person(browser, { theme: 'dark', width });
    await page.goto(`${BASE}/dims`);
    await page.waitForSelector('article.dim', { timeout: 20000 });

    const bar = page.locator('header.bar');
    const before = await bar.boundingBox();
    check('до прокрутки шапка у верха', before !== null && Math.abs(before.y) < 1, `y=${before?.y}`);

    // Докручиваем до конца несколько раз: прогрессивная догрузка (bugs/13) удлиняет ленту,
    // иначе на широком экране первая порция помещается целиком и прокручивать нечего.
    for (let i = 0; i < 5; i += 1) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(350);
    }
    const after = await bar.boundingBox();
    check('после прокрутки шапка НЕ уехала', after !== null && Math.abs(after.y) < 1, `y=${after?.y}`);
    check('прокрутка действительно была', await page.evaluate(() => window.scrollY > 300));

    // Под шапкой едет контент — фон обязан быть непрозрачным (bugs/22): --panel-solid тёмной темы.
    const bg = await bar.evaluate((el) => getComputedStyle(el).backgroundColor);
    check('фон шапки непрозрачный', bg === 'rgb(9, 19, 34)', bg);
    if (width === 390) await page.screenshot({ path: `${SHOTS}/appbar-sticky-dark.png` });
    check('консоль чиста (шапка)', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }

  // ── bugs/36: лайтбокс фото — по центру вьюпорта, поверх всего, из любого скролла ──
  console.log('bugs/36 · лайтбокс фото на «Связях» из середины прокрутки:');
  {
    const { context, page, errors } = await person(browser);
    await page.goto(`${BASE}/relations`);
    await page.waitForSelector('.card .head', { timeout: 20000 });

    const peek = page.locator('.peek').first();
    await peek.waitFor({ timeout: 10000 });
    // Ховер по карточке включает transform — ровно сценарий, ломавший fixed (bugs/36).
    await peek.hover();
    await page.evaluate(() => window.scrollTo(0, 250));
    await page.waitForTimeout(150);
    await peek.click();

    const box = page.locator('button.lightbox');
    await box.waitFor({ timeout: 5000 });
    await page.waitForTimeout(500); // дождаться конца fade-in, иначе скриншот полупрозрачный
    const boxBg = await box.evaluate((el) => getComputedStyle(el).backgroundColor);
    check('подложка тёмная и непрозрачная глазу', boxBg === 'rgba(3, 8, 16, 0.88)', boxBg);
    check('лайтбокс живёт в document.body (портал)', await box.evaluate((el) => el.parentElement === document.body));

    const overlay = await box.boundingBox();
    const vp = page.viewportSize();
    check(
      'оверлей накрывает ВЕСЬ вьюпорт',
      overlay !== null && overlay.x <= 0 && overlay.y <= 0 && overlay.width >= vp.width && overlay.height >= vp.height,
      JSON.stringify(overlay),
    );

    const img = box.locator('img');
    const shot = await img.boundingBox();
    const centered =
      shot !== null &&
      Math.abs(shot.y + shot.height / 2 - vp.height / 2) < 40 &&
      Math.abs(shot.x + shot.width / 2 - vp.width / 2) < 40;
    check('фото по центру вьюпорта, не обрезано', centered, JSON.stringify(shot));
    check('пиксели фото настоящие', await img.evaluate((el) => el.naturalWidth > 0), 'naturalWidth');
    // Поверх фото ничего не рисуется: в центре вьюпорта — само фото или оверлей.
    const onTop = await page.evaluate(() => {
      const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return el?.closest('button.lightbox') !== null;
    });
    check('поверх фото ничего не рисуется', onTop);
    check('страница под фото не крутится', await page.evaluate(() => getComputedStyle(document.body).overflow === 'hidden'));
    await page.screenshot({ path: `${SHOTS}/lightbox-centered.png` });

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    check('Esc закрывает', (await box.count()) === 0);
    check('прокрутка страницы вернулась', await page.evaluate(() => getComputedStyle(document.body).overflow !== 'hidden'));
    check('консоль чиста (лайтбокс)', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }

  // ── bugs/35: история версий — карточка, версии — плашки (канон app-17) ──
  for (const theme of ['light', 'dark']) {
    console.log(`bugs/35 · история версий карточкой (тема ${theme}):`);
    const { context, page, errors } = await person(browser, { theme });
    await page.goto(`${BASE}/menu/about`);
    const history = page.locator('details.history');
    await history.waitFor({ timeout: 10000 });

    const style = await history.evaluate((el) => {
      const s = getComputedStyle(el);
      const body = getComputedStyle(document.body);
      return { radius: s.borderRadius, shadow: s.boxShadow, bg: s.backgroundColor, pageBg: body.backgroundColor };
    });
    check('контейнер-карточка: скругление', style.radius === '14px', style.radius);
    check('контейнер-карточка: тень', style.shadow !== 'none');
    check('контейнер-карточка: фон отличим от страницы', style.bg !== style.pageBg, `${style.bg} vs ${style.pageBg}`);

    await history.locator('> summary').click();
    const ver = page.locator('details.ver').first();
    const verBg = await ver.evaluate((el) => getComputedStyle(el).backgroundColor);
    check('версия — своя плашка (фон отличен от карточки)', verBg !== style.bg, verBg);
    await page.screenshot({ path: `${SHOTS}/version-history-${theme}.png`, fullPage: false });
    check(`консоль чиста (история, ${theme})`, errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }

  // ── bugs/37: смена языка не переставляет карточки «Мой NDim ID» ──
  console.log('bugs/37 · RU↔EN не трогает порядок «Мой NDim ID»:');
  {
    const { context, page, errors } = await person(browser);
    await page.goto(`${BASE}/dims`);
    await page.waitForSelector('article.dim', { timeout: 20000 });

    await page.locator('.segs button').nth(1).click();
    await page.waitForTimeout(600);
    const order = await page.$$eval('article.dim', (els) => els.map((el) => el.dataset.dim));
    check('вкладка «Мой NDim ID» показывает карточки', order.length > 0, `карточек: ${order.length}`);

    await page.locator('header.bar .lang').click(); // RU → EN
    await page.waitForTimeout(600);
    const orderEn = await page.$$eval('article.dim', (els) => els.map((el) => el.dataset.dim));
    check('порядок в EN тот же, что в RU', JSON.stringify(orderEn) === JSON.stringify(order));

    await page.locator('header.bar .lang').click(); // EN → RU
    await page.waitForTimeout(600);
    const orderBack = await page.$$eval('article.dim', (els) => els.map((el) => el.dataset.dim));
    check('возврат на RU не переставил карточки', JSON.stringify(orderBack) === JSON.stringify(order));
    check('консоль чиста (сортировка)', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\nПРОВАЛОВ: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

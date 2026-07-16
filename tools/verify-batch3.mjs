/**
 * QA-прогон пачки 3 (bugs/20-зачистка, 21, 24, 26, 30) на стенде живым браузером.
 * Канон процесса — plans/06. Требует `npm run stand`. Скриншоты — test-results/batch3/.
 *
 * Запуск: node tools/verify-batch3.mjs
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const SHOTS = 'test-results/batch3';

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function person(browser, { theme } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 740 }, locale: 'ru-RU' });
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
  // ── bugs/21: каноничная карточка загрузки вместо «Подключаюсь…» ──
  console.log('bugs/21 · карточка загрузки с кольцом 1.x:');
  {
    const { context, page, errors } = await person(browser);
    // Придерживаем вход на секунду — иначе стенд подключается быстрее, чем видно лоадер.
    await context.route('**/identitytoolkit.googleapis.com/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });
    await page.goto(`${BASE}/relations`);
    const card = page.locator('.load-card');
    await card.waitFor({ timeout: 5000 });
    const anim = await card.locator('.ring').evaluate((el) => getComputedStyle(el).animationName);
    check('карточка «Загрузка» с кольцом видна', true);
    check('кольцо анимировано (канон 1.x)', anim.includes('half-turn'), anim);
    await page.screenshot({ path: `${SHOTS}/loading-card.png` });
    await page.waitForSelector('.card .head', { timeout: 20000 });
    check('после загрузки карточка ушла', (await card.count()) === 0);
    // Задержка сети — дело рук самого теста: жалобу Auth на неё продукту не вменяем.
    const real = errors.filter((e) => !e.includes('auth/network-request-failed'));
    check('консоль чиста (лоадер)', real.length === 0, real.join(' | ').slice(0, 200));
    await context.close();
  }

  // ── bugs/24: подсказки метрик ⓘ ──
  console.log('bugs/24 · подсказки метрик — тап, текст 1.x, закрытие:');
  {
    const { context, page, errors } = await person(browser);
    await page.goto(`${BASE}/relations`);
    await page.waitForSelector('.card .head', { timeout: 20000 });

    const iconCount = await page.locator('.ihint').count();
    check('ⓘ стоит у каждой метрики каждой карточки', iconCount >= 9, `иконок: ${iconCount}`);

    const firstCard = page.locator('main .card').first();
    await firstCard.locator('.cell', { hasText: 'Похожесть' }).click();
    const hint = firstCard.locator('.hintbox');
    await hint.waitFor({ timeout: 5000 });
    const text = (await hint.textContent()) ?? '';
    check('текст подсказки — 1.x дословно', text.includes('Произведение Общность * Близость'), text.slice(0, 60));
    await page.screenshot({ path: `${SHOTS}/metric-hint.png` });

    await firstCard.locator('.cell', { hasText: 'Общность' }).click();
    const switched = (await firstCard.locator('.hintbox').textContent()) ?? '';
    check('тап по другой метрике переключает подсказку', switched.includes('одни и те же интересы'), switched.slice(0, 60));

    await firstCard.locator('.cell', { hasText: 'Общность' }).click();
    await page.waitForTimeout(400);
    check('повторный тап закрывает', (await firstCard.locator('.hintbox').count()) === 0);
    check('консоль чиста (подсказки)', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }

  // ── bugs/26: тап не рисует обводку, клавиатурный фокус видим ──
  console.log('bugs/26 · обводка: после клика нет, с клавиатуры есть:');
  {
    const { context, page, errors } = await person(browser);
    await page.goto(`${BASE}/dims`);
    await page.waitForSelector('.segs button', { timeout: 20000 });

    await page.locator('.segs button').first().click();
    const afterClick = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    check('после клика обводки нет', afterClick === 'none', afterClick);

    await page.keyboard.press('Tab');
    const afterTab = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    check('клавиатурный фокус ВИДИМ (:focus-visible)', afterTab !== 'none', afterTab);
    check('консоль чиста (фокус)', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }

  // ── bugs/30: история версий вложенными раскрывашками ──
  console.log('bugs/30 · история версий: вложенные раскрывашки, как в 1.x:');
  {
    const { context, page, errors } = await person(browser);
    await page.goto(`${BASE}/menu/about`);
    await page.locator('details.history > summary').click();
    const vers = page.locator('details.ver');
    const count = await vers.count();
    check('версии — отдельными раскрывашками', count >= 10, `версий: ${count}`);
    check('свежая версия открыта', await vers.first().evaluate((el) => el.open));
    check('старые свёрнуты', !(await vers.nth(1).evaluate((el) => el.open)));
    await vers.nth(1).locator('summary').click();
    check('старая раскрывается тапом', await vers.nth(1).evaluate((el) => el.open));
    await page.screenshot({ path: `${SHOTS}/version-history.png` });
    check('консоль чиста (история)', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }

  // ── bugs/20 (зачистка): в конце ленты /dims нет мёртвой зоны ──
  console.log('bugs/20 · зачистка: конец ленты /dims без мёртвой пустоты:');
  {
    const { context, page, errors } = await person(browser);
    await page.goto(`${BASE}/dims`);
    await page.waitForSelector('.feed article.dim', { timeout: 20000 });
    const padding = await page.$eval('main.body', (el) => getComputedStyle(el).paddingBottom);
    check('нижний отступ ленты разумный (24px, не 96px)', padding === '24px', padding);
    check('консоль чиста (dims)', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\nПРОВАЛОВ: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

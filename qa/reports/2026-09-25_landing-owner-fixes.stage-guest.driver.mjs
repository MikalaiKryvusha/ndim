/**
 * ДРАЙВЕР СТЕЙДЖА — гость с главной без звёзд: строка моста в «Связях» и общая пара «тема + язык» в шапке приложения.
 * Прибор прогона, не страж: печатает, что увидел; судит человек по выводу и кадрам `test-results/stage-guest/`.
 *
 * Запуск: `node qa/reports/2026-09-25_landing-owner-fixes.stage-guest.driver.mjs [--path /ru] [--theme light|dark]`
 *
 * Путь человека: `/ru` → сразу «Смотреть больше» (НЛ-13) → профиль гостя → в шапке приложения тема одним касанием и
 * язык через выпадашку → «Связи»: строка моста без переноса оценок («Оцените фильмы, сериалы, книги и игры…», не
 * «Это была демонстрация — … настоящие связи»). Приходит человеком (как драйвер моста); уборка — токеном гостя:
 * точка и учётка, коды ответов печатаются.
 * [NOT-TESTED]
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { CONTOURS, docsUrl } from '../../tools/lib/contours.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const STAGE = CONTOURS.stage;
const PATH = arg('--path', '/ru');
const THEME = arg('--theme', 'light');
const OUT = 'test-results/stage-guest';
const DOCS = docsUrl('stage');
const HUMAN_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: HUMAN_UA, isMobile: true, hasTouch: true });
await ctx.addInitScript((t) => {
  try {
    Object.defineProperty(navigator, 'userAgentData', { get: () => undefined });
  } catch {
    /* пусть будет как есть */
  }
  if (!sessionStorage.getItem('seeded')) {
    localStorage.setItem('ndim-theme', t);
    sessionStorage.setItem('seeded', '1');
  }
}, THEME);
const page = await ctx.newPage();
const seen = { path: PATH, theme: THEME, errors: [] };
let uid = null;
let idToken = null;
page.on('pageerror', (e) => seen.errors.push(String(e).slice(0, 160)));
page.on('response', async (r) => {
  if (!/accounts:signUp/.test(r.url())) return;
  try {
    const body = await r.json();
    idToken = body.idToken ?? null;
    uid = body.localId ?? null;
  } catch {
    /* тело недоступно */
  }
});
try {
  await page.goto(STAGE.site + PATH, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ndimDemoLive === true, null, { timeout: 30000 });
  await page.getByRole('link', { name: /Смотреть больше|See more/ }).click();
  await page.waitForURL('**/profile*', { timeout: 30000 });
  await page.waitForSelector('header.bar .hc', { timeout: 30000 });
  await page.waitForTimeout(2000);
  // Тема: одно касание — ровно одна смена `data-theme`.
  await page.evaluate(() => {
    window.__flips = 0;
    new MutationObserver((m) => {
      for (const r of m) if (r.attributeName === 'data-theme') window.__flips += 1;
    }).observe(document.documentElement, { attributes: true });
  });
  const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await page.locator('header.bar .hc button.theme').click();
  await page.waitForTimeout(400);
  seen.theme = { before, ...(await page.evaluate(() => ({ after: document.documentElement.getAttribute('data-theme'), flips: window.__flips }))) };
  // Язык: выпадашка → English → экран по-английски.
  await page.locator('header.bar .hc summary.lang').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/profile-dd-${THEME}.png`, clip: { x: 0, y: 0, width: 390, height: 260 } });
  seen.langItems = await page.locator('header.bar .hc .dd .it').allInnerTexts();
  await page.locator('header.bar .hc .dd button.it', { hasText: 'English' }).click();
  await page.waitForTimeout(800);
  seen.afterEnglish = await page.evaluate(() => ({ lang: document.documentElement.lang, short: document.querySelector('header.bar summary.lang')?.textContent?.trim() }));
  // «Связи»: строка моста без переноса.
  await page.locator('a[href="/relations"]:visible').first().click();
  await page.waitForURL('**/relations*', { timeout: 20000 });
  await page.waitForTimeout(2500);
  seen.bridgeEn = await page.evaluate(() => document.querySelector('.bridge p')?.textContent?.trim() ?? null);
  await page.screenshot({ path: `${OUT}/relations-en-${THEME}.png` });
  await page.locator('header.bar .hc summary.lang').click();
  await page.locator('header.bar .hc .dd button.it', { hasText: 'Русский' }).click();
  await page.waitForTimeout(1200);
  seen.bridgeRu = await page.evaluate(() => document.querySelector('.bridge p')?.textContent?.trim() ?? null);
  await page.screenshot({ path: `${OUT}/relations-ru-${THEME}.png` });
} finally {
  seen.uid = uid ? `${uid.slice(0, 6)}…` : null;
  seen.cleanup = [];
  if (uid && idToken) {
    const rest = (p, init = {}) => fetch(`${DOCS}/${p}`, { ...init, headers: { Authorization: `Bearer ${idToken}` } });
    seen.cleanup.push(`points ${(await rest(`points/${uid}`, { method: 'DELETE' })).status}`);
    const del = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${STAGE.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    seen.cleanup.push(`account ${del.status}`);
  }
  await browser.close();
  console.log(JSON.stringify(seen, null, 2));
}

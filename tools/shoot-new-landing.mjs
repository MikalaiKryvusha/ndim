/**
 * КАДРЫ НОВОЙ V1 ГЛАВНОЙ — прибор съёмки (`plans/106` шаги Д10, Д11). Не страж: ничего не судит, кладёт
 * кадры для глаз и печатает, что увидел на странице, чтобы отчёт прогона называл прочитанное.
 *
 * Снимает: `/`, `/ru`, `/en` × 390/1440 × светлая/тёмная — первый экран и страницу целиком; и сценарий
 * теста: три звезды → кадр карты с поп-апом, карточками и карточкой для сторис.
 *
 * Запуск: `node tools/shoot-new-landing.mjs [--base http://localhost:4173] [--out dir]` — сборка уже поднята.
 * Кадры — `test-results/new-landing-v1/` (вне git).
 * [NOT-TESTED]
 */
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};

export async function shoot(base, out) {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const report = [];
  try {
    for (const path of ['/', '/ru', '/en']) {
      for (const width of [390, 1440]) {
        for (const theme of ['light', 'dark']) {
          const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: 1 });
          await ctx.addInitScript((t) => localStorage.setItem('ndim-theme', t), theme);
          const page = await ctx.newPage();
          const errors = [];
          page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
          page.on('pageerror', (e) => errors.push(String(e)));
          // Не `networkidle`: на живом контуре счётчик воронки держит канал Firestore открытым, тишина не наступает.
          await page.goto(base + path, { waitUntil: 'load' });
          await page.waitForFunction(() => window.__ndimDemoLive === true, null, { timeout: 30000 });
          await page.waitForTimeout(400);
          const name = `${path === '/' ? 'root' : path.slice(1)}-${width}-${theme}`;
          await page.screenshot({ path: `${out}/${name}-first.png` });
          await page.screenshot({ path: `${out}/${name}-full.png`, fullPage: true });
          const seen = await page.evaluate(() => ({
            lang: document.documentElement.lang,
            h1: document.querySelector('h1')?.textContent?.trim(),
            rows: document.querySelectorAll('#compat-rows [data-dim]').length,
            faq: document.querySelectorAll('.faq details').length,
            overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          }));
          report.push({ name, ...seen, errors: errors.length });
          await ctx.close();
        }
      }
    }
    // Сценарий теста: три звезды на телефоне, светлая тема.
    for (const width of [390, 1440]) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const page = await ctx.newPage();
      await page.goto(base + '/ru', { waitUntil: 'load' });
      await page.waitForFunction(() => window.__ndimDemoLive === true, null, { timeout: 30000 });
      const rows = page.locator('#compat-rows [data-dim]');
      await rows.nth(2).locator('[data-star="9"]').click();
      await rows.nth(4).locator('[data-star="7"]').click();
      await rows.nth(5).locator('[data-star="10"]').click();
      await page.waitForTimeout(700);
      await page.locator('#demo').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${out}/ru-${width}-rated-demo.png`, fullPage: false });
      await page.locator('.nres').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${out}/ru-${width}-rated-results.png` });
      const popup = await page.locator('.popup').textContent().catch(() => null);
      const sims = await page.locator('.who3 .sim').allTextContents();
      report.push({ name: `ru-${width}-rated`, popup: popup?.trim(), sims });
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await shoot(arg('--base', 'http://localhost:4173'), arg('--out', 'test-results/new-landing-v1'));
  for (const r of report) console.log(JSON.stringify(r));
}

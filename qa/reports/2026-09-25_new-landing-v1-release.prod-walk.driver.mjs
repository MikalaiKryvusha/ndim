// Разовый сценарий прогона 2026-09-25 18:30:05 +03:00 (проход боевой главной меткой прибора), приложен без изменений. Запуск: node <этот файл>
// Разовый проход боевой главной меткой прибора: ничего не пишет, в метрику людей не попадает.
import { chromium } from 'file:///D:/work/ai_sandbox/ndim/node_modules/@playwright/test/index.mjs';
import { markProbeContext } from 'file:///D:/work/ai_sandbox/ndim/tools/lib/probe-mark.mjs';
const B = 'https://ndimspace.app';
const OUT = 'D:/work/ai_sandbox/ndim/test-results/prod-0925-walk';
const b = await chromium.launch();
const out = {};
for (const [path, w, theme] of [['/', 390, 'light'], ['/', 1440, 'dark'], ['/en', 390, 'dark'], ['/ru', 1440, 'light']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  await markProbeContext(ctx);
  await ctx.addInitScript((t) => localStorage.setItem('ndim-theme', t), theme);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(B + path, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__ndimDemoLive === true, null, { timeout: 30000 });
  const h1 = (await p.locator('h1').textContent())?.trim();
  const names = (await p.locator('#compat-rows [data-dim]').allInnerTexts()).map((t) => t.split('\n')[0]);
  const lang = await p.evaluate(() => document.documentElement.lang);
  const key = `${path}-${w}-${theme}`;
  await p.screenshot({ path: `${OUT}-${key.replace(/\//g, 'root')}.png` });
  out[key] = { lang, h1, practices: names.slice(6), errors };
  await ctx.close();
}
// Вернувшийся человек: маркер сессии → корень уводит в профиль под щитом.
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await markProbeContext(ctx);
await ctx.addInitScript(() => { try { localStorage.setItem('ndim-session', '1'); } catch {} });
const p = await ctx.newPage();
await p.goto(B + '/', { waitUntil: 'domcontentloaded' });
await p.waitForURL(/\/profile/, { timeout: 20000 }).catch(() => {});
out.returning = new URL(p.url()).pathname;
await b.close();
console.log(JSON.stringify(out, null, 1));

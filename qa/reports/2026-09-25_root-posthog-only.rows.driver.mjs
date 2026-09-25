// Разовый сценарий прогона 2026-09-25 16:57:20 +03:00 (кадры списка теста), приложен без изменений. Стенд поднят. Запуск: node <этот файл>
import { chromium } from 'file:///D:/work/ai_sandbox/ndim/node_modules/@playwright/test/index.mjs';
const b = await chromium.launch();
for (const [path, w, theme] of [['/ru?as=none', 390, 'light'], ['/en?as=none', 1440, 'dark']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addInitScript((t) => localStorage.setItem('ndim-theme', t), theme);
  const p = await ctx.newPage();
  await p.goto('http://localhost:5173' + path, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__ndimDemoLive === true);
  const rows = p.locator('#compat-rows [data-dim]');
  await rows.nth(6).locator('[data-star="9"]').click();
  const names = await rows.allInnerTexts();
  console.log(path, w, theme, JSON.stringify(names.map((n) => n.split('\n')[0])));
  await p.locator('#compat-rows').screenshot({ path: `D:/work/ai_sandbox/ndim/test-results/root-posthog-only/rows-${w}-${theme}.png` });
  await ctx.close();
}
await b.close();

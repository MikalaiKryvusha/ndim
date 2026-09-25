// Разовый сценарий прогона 2026-09-25 ≈18:32 +03:00 (кадр с паузой 2,5 с, прозрачность портретов), приложен без изменений. Запуск: node <этот файл>
import { chromium } from 'file:///D:/work/ai_sandbox/ndim/node_modules/@playwright/test/index.mjs';
import { markProbeContext } from 'file:///D:/work/ai_sandbox/ndim/tools/lib/probe-mark.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await markProbeContext(ctx);
await ctx.addInitScript(() => localStorage.setItem('ndim-theme', 'dark'));
const p = await ctx.newPage();
await p.goto('https://ndimspace.app/', { waitUntil: 'load' });
await p.waitForFunction(() => window.__ndimDemoLive === true);
const op0 = await p.evaluate(() => [...document.querySelectorAll('img')].slice(0, 3).map((i) => getComputedStyle(i).opacity + '/' + i.complete + '/' + i.naturalWidth));
await p.waitForTimeout(2500);
const op1 = await p.evaluate(() => [...document.querySelectorAll('img')].slice(0, 3).map((i) => getComputedStyle(i).opacity + '/' + i.complete + '/' + i.naturalWidth));
await p.screenshot({ path: 'D:/work/ai_sandbox/ndim/test-results/prod-0925-walk-root-1440-dark-settled.png' });
console.log('сразу', JSON.stringify(op0), 'через 2,5 с', JSON.stringify(op1));
await b.close();

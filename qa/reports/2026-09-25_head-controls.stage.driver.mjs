/**
 * ДРАЙВЕР СТЕЙДЖА — общая пара «тема + язык»: три находки 2026-09-25 на живом контуре.
 * Прибор прогона, не страж: печатает увиденное; кадры — `test-results/head-controls-stage/`.
 *
 * Запуск: `node qa/reports/2026-09-25_head-controls.stage.driver.mjs [--base https://ndim-stage.web.app]`
 *
 * Н1 — касание темы ДО оживления главной: эмуляция телефона (сеть 1,6 Мбит/с, задержка 150 мс, процессор ×4),
 *      касание сразу после `domcontentloaded`, пока `__ndimDemoLive` не выставлен; ждём смены темы и считаем записи.
 * Н2 — страница каталога без JS: выпадашка языка закрывается касанием мимо и Esc.
 * Н3 — клиентский переход главная → «Калькулятор любви»: кнопка темы переключает ровно один раз.
 * Метка прибора — в метрику людей проходы не попадают.
 * [NOT-TESTED]
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { markProbeContext } from '../../tools/lib/probe-mark.mjs';

const i = process.argv.indexOf('--base');
const BASE = i > 0 ? process.argv[i + 1] : 'https://ndim-stage.web.app';
const OUT = 'test-results/head-controls-stage';
mkdirSync(OUT, { recursive: true });
const out = {};
const flipsWatch = () => {
  const w = window;
  w.__flips = 0;
  new MutationObserver(() => (w.__flips += 1)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
};

const b = await chromium.launch();
try {
  // Н1
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await markProbeContext(ctx);
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 90000 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const t0 = Date.now();
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(flipsWatch);
    const liveAtTap = await p.evaluate(() => ({ demo: window.__ndimDemoLive === true, liveBtn: !!document.querySelector('.hc button.theme[data-live]') }));
    await p.locator('.hc button.theme').tap();
    const tapMs = Date.now() - t0;
    await p.waitForTimeout(300);
    const afterTap = await p.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), flips: window.__flips }));
    await p.waitForFunction(() => window.__ndimDemoLive === true, null, { timeout: 60000 });
    const liveMs = Date.now() - t0;
    await p.evaluate(() => (window.__flips = 0));
    await p.locator('.hc button.theme').tap();
    await p.waitForTimeout(300);
    const afterLive = await p.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), flips: window.__flips, liveBtn: !!document.querySelector('.hc button.theme[data-live]') }));
    out.n1 = { liveAtTap, tapMs, afterTap, liveMs, afterLive };
    await ctx.close();
  }
  // Н2
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await markProbeContext(ctx);
    const p = await ctx.newPage();
    await p.goto(BASE + '/ru/catalog', { waitUntil: 'load' });
    const wrap = p.locator('details.lang-wrap');
    await p.locator('summary.lang').tap();
    await p.waitForTimeout(250);
    const opened = await wrap.evaluate((d) => d.open);
    await p.screenshot({ path: `${OUT}/catalog-dd.png`, clip: { x: 0, y: 0, width: 390, height: 240 } });
    await p.touchscreen.tap(12, 420);
    await p.waitForTimeout(250);
    const afterOutside = await wrap.evaluate((d) => d.open);
    await p.locator('summary.lang').tap();
    await p.keyboard.press('Escape');
    await p.waitForTimeout(250);
    const afterEsc = await wrap.evaluate((d) => d.open);
    await p.evaluate(flipsWatch);
    await p.locator('.hc button.theme').tap();
    await p.waitForTimeout(300);
    const theme = await p.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), flips: window.__flips }));
    out.n2 = { opened, afterOutside, afterEsc, theme };
    await ctx.close();
  }
  // Н3
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await markProbeContext(ctx);
    const p = await ctx.newPage();
    await p.goto(BASE + '/ru', { waitUntil: 'load' });
    await p.waitForFunction(() => window.__ndimDemoLive === true, null, { timeout: 30000 });
    await p.locator('footer a[href="/ru/test/love"]').first().click();
    await p.waitForURL('**/ru/test/love', { timeout: 20000 });
    await p.waitForTimeout(1500);
    const navType = await p.evaluate(() => performance.getEntriesByType('navigation')[0]?.name ?? '');
    await p.evaluate(flipsWatch);
    await p.locator('.hc button.theme').tap();
    await p.waitForTimeout(300);
    const r = await p.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), flips: window.__flips, liveBtn: !!document.querySelector('.hc button.theme[data-live]') }));
    await p.screenshot({ path: `${OUT}/love-after-toggle.png`, clip: { x: 0, y: 0, width: 390, height: 240 } });
    out.n3 = { clientNavFrom: navType, ...r };
    await ctx.close();
  }
} finally {
  await b.close();
  console.log(JSON.stringify(out, null, 2));
}

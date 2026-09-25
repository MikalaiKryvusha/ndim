/**
 * ДРАЙВЕР ПОВТОРА НА СТЕНДЕ — практики по голосам («Секс», «Настольные игры», «Употребление алкогольных напитков», «Чтение»)
 * и строки над тестом и у Макса после второго суда 2026-09-25. Прибор прогона, не страж: печатает увиденное.
 *
 * Запуск (стенд поднят, `npm run stand`): `node qa/reports/2026-09-25_root-posthog-only.repeat.driver.mjs`
 *
 * 1. `/ru?as=none` 390 светлая и `/en?as=none` 1440 тёмная: имена десяти строк, абзац над тестом, строка и «Любит:» Макса;
 *    кадры списка и карточки Макса.
 * 2. Мост с `/?as=guest`: «Секс» 9, «Употребление алкогольных напитков» 7, «Матрица» 10 → в NDim ID гостя ровно эти три.
 * [NOT-TESTED]
 */
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const FIRESTORE = 'http://127.0.0.1:8181/v1/projects/demo-ndim-dev/databases/(default)/documents';
const OUT = 'test-results/root-posthog-only-repeat';

export async function run() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const seen = {};
  try {
    for (const [path, width, theme] of [['/ru?as=none', 390, 'light'], ['/en?as=none', 1440, 'dark']]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      await ctx.addInitScript((t) => localStorage.setItem('ndim-theme', t), theme);
      const page = await ctx.newPage();
      await page.goto(BASE + path, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__ndimDemoLive === true);
      const rows = page.locator('#compat-rows [data-dim]');
      const names = (await rows.allInnerTexts()).map((t) => t.split('\n')[0]);
      const how = (await page.locator('.ndemo p').first().textContent().catch(() => null))?.trim() ?? null;
      const main = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
      const maxLine = main.match(/(Макс оценил[^.]*\.|Liam rated[^.]*\.)/)?.[1] ?? null;
      const loves = [...main.matchAll(/(Любит|Loves):[^А-ЯA-Z]*[^.·]{0,80}/g)].map((m) => m[0].trim()).slice(0, 3);
      await page.locator('#compat-rows').screenshot({ path: `${OUT}/rows-${width}-${theme}.png` });
      seen[path] = { names, how, maxLine, loves };
      await ctx.close();
    }
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    let uid = null;
    page.on('response', async (r) => {
      if (/accounts:signUp/.test(r.url())) {
        try {
          uid = (await r.json()).localId;
        } catch {
          /* тело недоступно */
        }
      }
    });
    await page.goto(BASE + '/?as=guest', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ndimDemoLive === true);
    const rows = page.locator('#compat-rows [data-dim]');
    await rows.nth(6).locator('[data-star="9"]').click();
    await rows.nth(8).locator('[data-star="7"]').click();
    await rows.nth(2).locator('[data-star="10"]').click();
    await page.getByRole('link', { name: /Смотреть больше/ }).click();
    await page.waitForURL('**/profile*', { waitUntil: 'commit', timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/profile-after-bridge.png` });
    const res = await fetch(`${FIRESTORE}/points/${uid}/dims`, { headers: { Authorization: 'Bearer owner' } });
    seen.bridge = { url: new URL(page.url()).pathname + new URL(page.url()).search, uid, dims: ((await res.json()).documents ?? []).map((d) => [d.name.split('/').pop(), Number(d.fields?.value?.integerValue)]) };
    await ctx.close();
  } finally {
    await browser.close();
  }
  return seen;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await run(), null, 2));
}

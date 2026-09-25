/**
 * ДРАЙВЕР РУЧНОГО ПРОГОНА — новая V1 главной, мост «Смотреть больше» (набор `qa/suites/new-landing-v1.md`,
 * кейсы НЛ-12…НЛ-15). Прибор прогона, не страж: печатает, что увидел, и кладёт кадры; судит человек по выводу.
 *
 * Запуск: `node qa/reports/2026-09-25_new-landing-v1.driver.mjs [--base http://localhost:5173] [--path /ru] [--stars 3|0]`
 * — стенд поднят (`npm run stand`): база читается REST эмулятора с `Bearer owner`. На стейдже база читается
 * отдельно (ключ стейджа), здесь флаг `--no-db`.
 * [NOT-TESTED]
 */
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg('--base', 'http://localhost:5173');
const PATH = arg('--path', '/ru');
const STARS = Number(arg('--stars', '3'));
const NO_DB = process.argv.includes('--no-db');
const OUT = 'test-results/new-landing-v1-run';
const EMU = 'http://127.0.0.1:8181/v1/projects/demo-ndim-dev/databases/(default)/documents';

/** uid текущей сессии Firebase — из IndexedDB (в localStorage его нет; приём `tools/smoke.mjs`). */
const readUid = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('firebaseLocalStorageDb');
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          try {
            const tx = open.result.transaction('firebaseLocalStorage', 'readonly');
            const all = tx.objectStore('firebaseLocalStorage').getAll();
            all.onsuccess = () => resolve(all.result.map((r) => r?.value?.uid).find(Boolean) ?? null);
            all.onerror = () => resolve(null);
          } catch {
            resolve(null);
          }
        };
      }),
  );

export async function run() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const seen = {};
  try {
    await page.goto(BASE + PATH, { waitUntil: 'domcontentloaded' }); // не networkidle: канал Firestore держится открытым
    await page.waitForFunction(() => window.__ndimDemoLive === true, null, { timeout: 20000 });
    const rows = page.locator('#compat-rows [data-dim]');
    const picks = [
      [2, 9],
      [4, 7],
      [5, 10],
    ].slice(0, STARS);
    const expected = {};
    for (const [i, v] of picks) {
      const row = rows.nth(i);
      await row.locator(`[data-star="${v}"]`).click();
      expected[await row.getAttribute('data-dim')] = v;
    }
    seen.popup = (await page.locator('.popup').textContent().catch(() => null))?.trim() ?? null;
    await page.screenshot({ path: `${OUT}/${PATH.replace(/\W/g, '') || 'root'}-before-bridge.png` });
    const started = Date.now();
    await page.getByRole('link', { name: /Смотреть больше|See more/ }).click();
    await page.waitForURL('**/profile*', { timeout: 20000 });
    seen.bridgeMs = Date.now() - started;
    seen.url = page.url();
    await page.waitForTimeout(2500);
    const uid = await readUid(page);
    seen.uid = uid;
    if (!NO_DB && uid) {
      const res = await fetch(`${EMU}/points/${uid}/dims`, { headers: { Authorization: 'Bearer owner' } });
      const body = await res.json();
      seen.dbDims = Object.fromEntries(
        (body.documents ?? []).map((d) => [d.name.split('/').pop(), Number(d.fields?.value?.integerValue)]),
      );
      seen.expected = expected;
      seen.dbMatches =
        Object.keys(expected).length === Object.keys(seen.dbDims).length &&
        Object.entries(expected).every(([id, v]) => seen.dbDims[id] === v);
    }
    await page.screenshot({ path: `${OUT}/${PATH.replace(/\W/g, '') || 'root'}-profile.png` });
    await page.goto(BASE + '/relations', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    seen.bridgeNote = (await page.locator('.bridge').first().textContent().catch(() => null))?.trim() ?? null;
    await page.screenshot({ path: `${OUT}/${PATH.replace(/\W/g, '') || 'root'}-relations.png` });
    // «Назад» с экрана продукта не возвращает на лендинг (мост уходит без записи в истории).
    await page.goBack().catch(() => null);
    await page.goBack().catch(() => null);
    seen.afterBack = new URL(page.url()).pathname;
    seen.errors = errors.filter((e) => !e.includes('ERR_CONNECTION_REFUSED'));
  } finally {
    await browser.close();
  }
  return seen;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await run(), null, 2));
}

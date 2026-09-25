/**
 * ДРАЙВЕР РУЧНОГО ПРОГОНА НА СТЕЙДЖЕ — корень `/` не пишет счётчик воронки в базу (№078 В1 = Г), `/ru` пишет.
 * Прибор прогона, не страж. Запуск: `node qa/reports/2026-09-25_root-posthog-only.stage.driver.mjs`
 * Счётчик дня `space/funnel/days/<сутки>` стейджа читается ключом контура (Admin SDK, только чтение). Каждый заход —
 * свежий контекст человеком (обычный user agent), звезда первой строке, 8 с тишины; гость не заводится.
 * [NOT-TESTED]
 */
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { serviceAccount } from '../../tools/lib/credentials.mjs';
import { CONTOURS } from '../../tools/lib/contours.mjs';
import { dayKey } from '../../src/lib/data/funnel.ts';

const STAGE = CONTOURS.stage;
const HUMAN_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

export async function run() {
  const app = initializeApp({ credential: cert(serviceAccount('stage')), projectId: STAGE.project }, 'stage-read');
  const db = getFirestore(app, STAGE.database);
  const day = dayKey();
  const read = async () => {
    const snap = await db.doc(`space/funnel/days/${day}`).get();
    const d = snap.exists ? snap.data() : {};
    return { landing_view: d.landing_view ?? 0, demo_touch: d.demo_touch ?? 0 };
  };
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const visit = async (path) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: HUMAN_UA, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { try { Object.defineProperty(navigator, 'userAgentData', { get: () => undefined }); } catch { /* как есть */ } });
    const page = await ctx.newPage();
    await page.goto(STAGE.site + path, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ndimDemoLive === true, null, { timeout: 30000 });
    await page.locator('#compat-rows [data-dim]').first().locator('[data-star="8"]').click();
    await page.waitForTimeout(8000);
    const claimed = await page.evaluate(() => Object.keys(sessionStorage).filter((k) => /landing_view|demo_touch/.test(k)));
    await ctx.close();
    return claimed;
  };
  const seen = { day };
  try {
    seen.before = await read();
    seen.rootClaimed = await visit('/');
    seen.afterRoot = await read();
    seen.ruClaimed = await visit('/ru');
    seen.afterRu = await read();
  } finally {
    await browser.close();
  }
  seen.verdict = {
    rootCounterUnchanged: seen.afterRoot.landing_view === seen.before.landing_view && seen.afterRoot.demo_touch === seen.before.demo_touch,
    ruCounterPlusOne: seen.afterRu.landing_view === seen.afterRoot.landing_view + 1 && seen.afterRu.demo_touch === seen.afterRoot.demo_touch + 1,
  };
  return seen;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await run(), null, 2));
  process.exitCode = 0;
}

/**
 * ДРАЙВЕР РУЧНОГО ПРОГОНА НА СТЕНДЕ — главная `/` считает только в PostHog (слово владельца, интервью №078 В1 = Г:
 * «*только аналитикой постхог, мы свою БД фаерстор не грузим запросами*»), а `/ru` пишет и свой счётчик, как прежде.
 * Прибор прогона, не страж: печатает увиденное, судит человек по выводу.
 *
 * Запуск (стенд поднят, `npm run stand`): `node qa/reports/2026-09-25_root-posthog-only.driver.mjs`
 *
 * Для каждого адреса — свежий контекст без метки прибора → страница ожила → звезда первой строке → 6 с тишины:
 *   · ШАГ ЗАСЧИТАН — отметка визита в `sessionStorage` (её ставит `claimStep`, то есть `track()` вызван);
 *   · СЧЁТЧИК ДНЯ — `space/funnel/days/<сутки>` в эмуляторе Firestore стенда (база `(default)`, проект `demo-ndim-dev`).
 * Корень: шаги засчитаны, счётчик не вырос. `/ru` — положительный контроль: шаги засчитаны, счётчик +1 и +1.
 * PostHog на стенде молчит по построению (ворота хоста) — отправку туда этот прогон не судит.
 * [NOT-TESTED]
 */
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { dayKey } from '../../src/lib/data/funnel.ts';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const FIRESTORE = `http://127.0.0.1:${process.env.FIRESTORE_PORT ?? '8181'}`;
const DAY_DOC = (day) => `${FIRESTORE}/v1/projects/demo-ndim-dev/databases/(default)/documents/space/funnel/days/${day}`;
const OUT = 'test-results/root-posthog-only';
const STEPS = ['landing_view', 'demo_touch'];

async function readDay(day) {
  const res = await fetch(DAY_DOC(day), { headers: { Authorization: 'Bearer owner' } });
  if (!res.ok) return { landing_view: 0, demo_touch: 0, status: res.status };
  const fields = (await res.json()).fields ?? {};
  return { landing_view: Number(fields.landing_view?.integerValue ?? 0), demo_touch: Number(fields.demo_touch?.integerValue ?? 0), status: res.status };
}

async function visit(browser, path, label) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + path, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ndimDemoLive === true, null, { timeout: 30000 });
  await page.locator('#compat-rows [data-dim]').first().locator('[data-star="8"]').click();
  await page.waitForTimeout(6000);
  const claimed = await page.evaluate(() => Object.keys(sessionStorage).filter((k) => /landing_view|demo_touch/.test(k)));
  const h1 = (await page.locator('h1').textContent())?.trim();
  await page.screenshot({ path: `${OUT}/${label}.png` });
  await ctx.close();
  return { path, h1, claimed, errors };
}

export async function run() {
  mkdirSync(OUT, { recursive: true });
  const day = dayKey();
  const browser = await chromium.launch();
  const seen = { day, base: BASE };
  try {
    seen.before = await readDay(day);
    seen.root = await visit(browser, '/?as=none', 'root');
    seen.afterRoot = await readDay(day);
    seen.ru = await visit(browser, '/ru?as=none', 'ru');
    seen.afterRu = await readDay(day);
  } finally {
    await browser.close();
  }
  seen.verdict = {
    rootClaimedBothSteps: STEPS.every((s) => seen.root.claimed.some((k) => k.includes(s))),
    rootCounterUnchanged: STEPS.every((s) => seen.afterRoot[s] === seen.before[s]),
    ruClaimedBothSteps: STEPS.every((s) => seen.ru.claimed.some((k) => k.includes(s))),
    ruCounterPlusOne: STEPS.every((s) => seen.afterRu[s] === seen.afterRoot[s] + 1),
  };
  return seen;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await run(), null, 2));
}

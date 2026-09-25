/**
 * ДРАЙВЕР ЗАМЕРА МОСТА НА СТЕЙДЖЕ — на что уходят секунды между «Смотреть больше» и профилем гостя.
 * Прибор прогона, не страж: печатает шкалу времени сетевых шагов от касания кнопки, судит человек по выводу.
 *
 * Запуск: `node qa/reports/2026-09-25_bridge-timing.stage-driver.mjs [--path /ru] [--stars 3]`
 *
 * Повод — наблюдение отчёта `qa/reports/2026-09-25_new-landing-v1.md` («мост 3,1 с»): то число мерило касание →
 * событие `load` страницы профиля, то есть вместе с загрузкой следующей страницы. Здесь шкала делится на отрезки:
 * подгрузка модулей Firebase · рождение гостя (`accounts:signUp`) · записи Firestore · уход документа `/profile`.
 * Приходит человеком (как драйвер главной); уборка — токеном гостя: оценки, точка, учётка, коды ответов печатаются.
 * [NOT-TESTED]
 */
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { CONTOURS, docsUrl } from '../../tools/lib/contours.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const STAGE = CONTOURS.stage;
const PATH = arg('--path', '/ru');
const STARS = Number(arg('--stars', '3'));
const OUT = 'test-results/bridge-timing';
const DOCS = docsUrl('stage');
const HUMAN_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

/** Короткое имя запроса для шкалы: что это за шаг моста. */
function label(url) {
  if (/accounts:signUp/.test(url)) return 'Auth: рождение гостя (signUp)';
  if (/accounts:lookup/.test(url)) return 'Auth: lookup';
  if (/securetoken/.test(url)) return 'Auth: токен';
  if (/firestore\.googleapis\.com.*\/Write\//.test(url)) return 'Firestore: канал записи';
  if (/firestore\.googleapis\.com.*\/Listen\//.test(url)) return 'Firestore: канал чтения';
  if (/firestore\.googleapis\.com/.test(url)) return 'Firestore: прочее';
  if (/\/_app\/immutable\//.test(url)) return `модуль ${url.split('/').pop()}`;
  if (/posthog|i\.posthog|eu\.i\./.test(url)) return 'PostHog';
  if (/\/profile(\?|$)/.test(url)) return 'ДОКУМЕНТ /profile';
  return url.slice(0, 90);
}

export async function run() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: HUMAN_UA, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'userAgentData', { get: () => undefined });
    } catch {
      /* пусть будет как есть */
    }
  });
  const page = await ctx.newPage();
  const seen = { path: PATH, stars: STARS, timeline: [] };
  let t0 = null;
  let uid = null;
  let idToken = null;
  const ms = () => (t0 === null ? null : Date.now() - t0);
  page.on('request', (r) => {
    if (t0 !== null) seen.timeline.push(`+${ms()} мс → ${label(r.url())}`);
  });
  page.on('requestfinished', (r) => {
    if (t0 !== null) seen.timeline.push(`+${ms()} мс ✓ ${label(r.url())}`);
  });
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
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame() && t0 !== null) seen.timeline.push(`+${ms()} мс ⇒ навигация ${new URL(f.url()).pathname}`);
  });
  try {
    await page.goto(STAGE.site + PATH, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ndimDemoLive === true, null, { timeout: 30000 });
    const rows = page.locator('#compat-rows [data-dim]');
    for (let i = 0; i < STARS; i += 1) await rows.nth(i).locator('[data-star="8"]').click();
    // Сеть успокоилась после касаний — шкала начинается с чистого листа.
    await page.waitForTimeout(1500);
    t0 = Date.now();
    await page.getByRole('link', { name: /Смотреть больше|See more/ }).click();
    await page.waitForURL('**/profile*', { waitUntil: 'commit', timeout: 30000 });
    seen.commitMs = ms();
    await page.waitForLoadState('load');
    seen.loadMs = ms();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/profile.png` });
  } finally {
    seen.cleanup = [];
    if (uid && idToken) {
      const rest = (p, init = {}) => fetch(`${DOCS}/${p}`, { ...init, headers: { Authorization: `Bearer ${idToken}` } });
      const dims = await (await rest(`points/${uid}/dims`)).json();
      seen.dbDims = (dims.documents ?? []).length;
      for (const d of dims.documents ?? []) {
        const id = d.name.split('/').pop();
        seen.cleanup.push(`dims/${id} ${(await rest(`points/${uid}/dims/${id}`, { method: 'DELETE' })).status}`);
      }
      seen.cleanup.push(`points ${(await rest(`points/${uid}`, { method: 'DELETE' })).status}`);
      const del = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${STAGE.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      seen.cleanup.push(`account ${del.status}`);
    }
    await browser.close();
  }
  return seen;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await run(), null, 2));
}

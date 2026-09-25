/**
 * ДРАЙВЕР РУЧНОГО ПРОГОНА НА СТЕЙДЖЕ — новая V1 главной (набор `qa/suites/new-landing-v1.md`, кейсы НЛ-12, НЛ-14,
 * НЛ-15, НЛ-16, НЛ-19). Прибор прогона, не страж: печатает увиденное и кладёт кадры; судит человек по выводу.
 *
 * Запуск: `node qa/reports/2026-09-25_new-landing-v1.stage-driver.mjs [--path /] [--wait 150]`
 *
 * Свежий браузер БЕЗ метки прибора: смысл прогона — пройти путь человеком, и событие прихода обязано доехать до
 * PostHog (`env = stage`, в ряд боя не попадает). База стейджа читается ПРАВАМИ САМОГО ГОСТЯ — его `idToken` из
 * ответа `accounts:signUp` (приём `tools/verify-live-dims-rating.mjs`); правила пускают человека к своим оценкам и
 * Связям. След прогона убирается тем же токеном: оценки, точка, учётка. Документ Связей пишет только сервер
 * синхронизации — его подчищает суточный проход, и это называется в отчёте.
 * [NOT-TESTED]
 */
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { CONTOURS, docsUrl } from '../../tools/lib/contours.mjs';
import { hogql } from '../../tools/lib/posthog.mjs';
import { loadEnv } from '../../tools/lib/env.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const STAGE = CONTOURS.stage;
const PATH = arg('--path', '/');
const WAIT_S = Number(arg('--wait', '150'));
const OUT = 'test-results/new-landing-v1-stage';
const DOCS = docsUrl('stage');

const rest = (token, path, init = {}) =>
  fetch(`${DOCS}/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });

export async function run() {
  loadEnv();
  mkdirSync(OUT, { recursive: true });
  const startedIso = new Date(Date.now() - 60_000).toISOString();
  /*
   * Приходит ЧЕЛОВЕКОМ: SDK PostHog отсеивает роботов, а голый headless — робот по трём признакам
   * (`navigator.webdriver` · user agent · `userAgentData`). Первый прогон 2026-09-25 без маскировки дал «событий 0» —
   * прибор, а не продукт (тот же урок у удалённой пробы главной, `probe-root-landing-view-live.mjs`).
   */
  const HUMAN_UA =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
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
  const errors = [];
  let uid = null;
  let idToken = null;
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('response', async (r) => {
    if (!/identitytoolkit\.googleapis\.com\/v1\/accounts:signUp/.test(r.url())) return;
    try {
      const body = await r.json();
      if (body.idToken) {
        idToken = body.idToken;
        uid = body.localId;
      }
    } catch {
      /* тело недоступно — uid возьмём не отсюда */
    }
  });
  const seen = { path: PATH };
  try {
    await page.goto(STAGE.site + PATH, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__ndimDemoLive === true, null, { timeout: 30000 });
    seen.h1 = (await page.locator('h1').textContent())?.trim();
    const rows = page.locator('#compat-rows [data-dim]');
    const expected = {};
    for (const [i, v] of [
      [0, 10],
      [2, 9],
      [5, 8],
    ]) {
      const row = rows.nth(i);
      await row.locator(`[data-star="${v}"]`).click();
      expected[await row.getAttribute('data-dim')] = v;
    }
    seen.popup = (await page.locator('.popup').textContent().catch(() => null))?.trim() ?? null;
    await page.screenshot({ path: `${OUT}/01-rated.png` });
    const t0 = Date.now();
    await page.getByRole('link', { name: /Смотреть больше|See more/ }).click();
    await page.waitForURL('**/profile*', { timeout: 30000 });
    seen.bridgeMs = Date.now() - t0;
    seen.url = page.url();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT}/02-profile.png` });
    seen.uid = uid;
    if (!uid || !idToken) throw new Error('гость не заведён: ответа accounts:signUp не было');

    const dims = await (await rest(idToken, `points/${uid}/dims`)).json();
    seen.dbDims = Object.fromEntries((dims.documents ?? []).map((d) => [d.name.split('/').pop(), Number(d.fields?.value?.integerValue)]));
    seen.expected = expected;
    seen.dbMatches =
      Object.keys(seen.dbDims).length === Object.keys(expected).length &&
      Object.entries(expected).every(([id, v]) => seen.dbDims[id] === v);

    // НЛ-16: Связи гостя появляются после цикла сервера синхронизации (окно новичка ≤ минуты).
    let relations = null;
    const deadline = Date.now() + WAIT_S * 1000;
    while (Date.now() < deadline) {
      const r = await rest(idToken, `relations/${uid}`);
      if (r.ok) {
        relations = await r.json();
        break;
      }
      await new Promise((res) => setTimeout(res, 10_000));
    }
    seen.relationsAfterS = relations ? Math.round((Date.now() - t0) / 1000) : null;
    seen.relationsDocFields = relations ? Object.keys(relations.fields ?? {}) : null;
    await page.goto(STAGE.site + '/relations', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    seen.bridgeNote = (await page.locator('.bridge').first().textContent().catch(() => null))?.trim() ?? null;
    seen.relationCards = await page.locator('main .card, main article').count();
    seen.relationsText = (await page.locator('main').innerText().catch(() => '')).slice(0, 400);
    await page.screenshot({ path: `${OUT}/03-relations.png`, fullPage: true });
    await page.goBack().catch(() => null);
    await page.goBack().catch(() => null);
    seen.afterBack = new URL(page.url()).pathname;
  } finally {
    // Уборка — своим токеном: оценки, точка, профиль, учётка. Каждый шаг ПРОВЕРЯЕТСЯ кодом ответа.
    seen.cleanup = [];
    if (uid && idToken) {
      for (const id of Object.keys(seen.dbDims ?? {})) seen.cleanup.push(`dims/${id} ${(await rest(idToken, `points/${uid}/dims/${id}`, { method: 'DELETE' })).status}`);
      seen.cleanup.push(`points ${(await rest(idToken, `points/${uid}`, { method: 'DELETE' })).status}`);
      const del = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${STAGE.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      seen.cleanup.push(`account ${del.status}`);
    }
    seen.errors = errors;
    await browser.close();
  }

  // НЛ-19: событие прихода и место входа гостя в PostHog (env = stage), окно — с начала прогона.
  await new Promise((r) => setTimeout(r, 20_000));
  try {
    const q = await hogql(
      `SELECT event, properties.$pathname, properties.$browser, properties.entry, properties.env, timestamp FROM events WHERE timestamp >= toDateTime({since}) AND properties.env = 'stage' AND event IN ('landing_view', 'demo_touch', 'guest_start') ORDER BY timestamp`,
      { since: startedIso.replace('T', ' ').slice(0, 19) },
    );
    seen.posthog = q.results ?? q;
  } catch (e) {
    seen.posthog = `не прочитано: ${String(e).slice(0, 160)}`;
  }
  return seen;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await run(), null, 2));
}

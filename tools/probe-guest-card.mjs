#!/usr/bin/env node
/**
 * ЗОНД ПОСТОЯННОЙ КАРТОЧКИ ГОСТЯ (`plans/22` фаза 5, выбор A) — ПРИБОР, не страж.
 *
 * Проверяет живым браузером на стенде три утверждения выбора владельца:
 *   1. ГОСТЬ видит карточку (`.gnote`) на всех пяти экранах приложения:
 *      Связи · Пространство · Измерения · Меню · Аккаунт.
 *   2. На ПРОФИЛЕ карточки нет — там стоит его расширенная гостевая карточка с полями
 *      сохранения (двойник был бы шумом; допущение названо в plans/22 фаза 5).
 *   3. ПОЛНОЦЕННЫЙ человек (dev-пользователь стенда) карточку не видит нигде.
 * Кадры: «Связи» гостем — 2 темы × 2 ширины (test-results/probe-guest-card/).
 *
 * ⚠️ EXP-0174: на стенде гостевая сессия живёт только за дверью `?as=guest` — здесь каждый
 * переход прямой (goto с параметром), SPA-тапов нет. ⚠️ EXP-0087: голый адрес автовходит
 * dev-пользователем — этим зонд и пользуется в проверке 3.
 *
 * Уборка: гость рождается дверью продукта (ensureSpaceExists создаёт документы) — зонд
 * убирает и документы, и учётку, и ПРОВЕРЯЕТ, что следов не осталось.
 *
 * Запуск: стенд поднят (`npm run stand`) → node tools/probe-guest-card.mjs
 */

import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const OUT = 'test-results/probe-guest-card';
mkdirSync(OUT, { recursive: true });

// Admin SDK — из экземпляра sync-server (капкан plans/63: у него СВОЙ node_modules).
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_PROJECT_ID = 'demo-ndim-dev';
const requireSync = createRequire(new URL('../sync-server/', import.meta.url));
const { initializeApp, getApps } = requireSync('firebase-admin/app');
if (getApps().length === 0) initializeApp({ projectId: 'demo-ndim-dev' });
const { getFirestore } = requireSync('firebase-admin/firestore');
const { getAuth } = requireSync('firebase-admin/auth');
const db = getFirestore();

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}`);
  if (!ok) failures += 1;
};

/** uid гостевой сессии — из IndexedDB (приём tools/probe-guest-screen.mjs). */
function sessionOf(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('firebaseLocalStorageDb');
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          try {
            const store = req.result
              .transaction('firebaseLocalStorage', 'readonly')
              .objectStore('firebaseLocalStorage');
            const all = store.getAll();
            all.onerror = () => resolve(null);
            all.onsuccess = () => {
              const rec = all.result.find((r) => String(r.fbase_key).startsWith('firebase:authUser:'));
              resolve(rec?.value?.uid ?? null);
            };
          } catch {
            resolve(null);
          }
        };
      }),
  );
}

const SCREENS = ['/relations', '/space', '/dims', '/menu', '/account'];
console.log('═══ ЗОНД КАРТОЧКИ ГОСТЯ (plans/22 фаза 5, выбор A) ═══\n');
const browser = await chromium.launch();
let guestUid = null;

try {
  /* ── Гость: карточка на пяти экранах, профиль — исключение ── */
  const g = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const page = await g.newPage();
  await page.goto(`${BASE}/profile?guest=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  guestUid = await sessionOf(page);
  if (!guestUid) throw new Error('гостевая сессия не завелась');
  console.log(`  гость рождён дверью продукта: ${guestUid}`);

  for (const path of SCREENS) {
    await page.goto(`${BASE}${path}?as=guest`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const cards = await page.locator('.gnote').count();
    check(cards === 1, `гость видит карточку на ${path} (найдено ${cards})`);
  }

  await page.goto(`${BASE}/profile?as=guest`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  check((await page.locator('.gnote').count()) === 0, 'на профиле двойника НЕТ (там своя гостевая карточка)');
  const richCard = await page.locator('.guest-card').count();
  check(richCard >= 1, '🔒 расширенная карточка профиля на месте');

  // Кадры: «Связи» гостем — обе темы × обе ширины.
  await page.goto(`${BASE}/relations?as=guest`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const setTheme = (theme) =>
    page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.screenshot({ path: `${OUT}/relations-light-390.png` });
  await setTheme('dark');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/relations-dark-390.png` });
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/relations-dark-1024.png` });
  await setTheme('light');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/relations-light-1024.png` });
  console.log(`  кадры сняты → ${OUT}/`);
  await g.close();

  /* ── Полноценный человек: карточки нет нигде ── */
  const d = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const devPage = await d.newPage();
  for (const path of ['/relations', '/menu']) {
    await devPage.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await devPage.waitForTimeout(2200);
    check((await devPage.locator('.gnote').count()) === 0, `🔒 dev-пользователь БЕЗ карточки на ${path}`);
  }
  await d.close();
} finally {
  await browser.close();
}

/* ── Уборка следов зонда с проверкой ── */
console.log('\n── Уборка следов зонда ──');
if (guestUid) {
  await db.recursiveDelete(db.doc(`points/${guestUid}`));
  await db.doc(`relations/${guestUid}`).delete();
  await db.recursiveDelete(db.doc(`users/${guestUid}`));
  await getAuth().deleteUser(guestUid).catch(() => {});
  const traces = [];
  if ((await db.doc(`points/${guestUid}`).get()).exists) traces.push('points');
  if ((await db.doc(`users/${guestUid}`).get()).exists) traces.push('users');
  const authGone = await getAuth().getUser(guestUid).then(() => false, (e) => e.code === 'auth/user-not-found');
  if (!authGone) traces.push('auth');
  check(traces.length === 0, `следов зонда не осталось${traces.length ? ` (остались: ${traces.join(', ')})` : ''}`);
}

console.log(`\nИтог: ${failures === 0 ? '✅ зонд пройден целиком' : `❌ провалов: ${failures}`}`);
process.exit(failures === 0 ? 0 : 1);

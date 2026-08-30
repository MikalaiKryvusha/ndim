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
 * Запуск: стенд поднят (`npm run stand`) → node tools/probe-guest-card.mjs [--slot N]
 * ⚠️ `--slot` (или переменная `STAND_SLOT`) — для прогона из ЧУЖОГО дерева: судья работает
 * временным деревом, а его имя даёт слот 0, то есть слот главной копии.
 */

import { mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

import { readGuestSession, removeGuest } from './lib/guest-session.mjs';
import { portsFor, slotFromRequest } from './lib/stand-slot.mjs';

/*
 * 🔴 АДРЕС СТЕНДА — ИЗ СЛОТА РАБОЧЕГО МЕСТА, А НЕ ЛИТЕРАЛОМ (2026-08-30).
 *
 * Здесь стояли `localhost:5173` и порты `8181/9099` — адрес СЛОТА 0, то есть главной копии.
 * Прибор, запущенный ролью из её worktree, заводил и УДАЛЯЛ гостей в чужом стенде — классу
 * это родня «прибор молча мерит ЧУЖОЕ дерево» (`bugs/187`), но с записью, а не чтением.
 * Правка сделана потому, что без неё доказательства прибора нельзя перепрогнать из рабочего
 * места роли вовсе — а перепрогон был условием постановки.
 *
 * ⚠️ ПОВЕДЕНИЕ СЛОТА 0 ОСТАЁТСЯ БАЙТ-В-БАЙТ ПРЕЖНИМ: `portsFor(0)` возвращает ровно
 * `5173/8181/9099/9199` (тот же довод, на котором стоит `tools/stand-launch.mjs`).
 */
const { slot, источник } = slotFromRequest({
  argv: process.argv.slice(2),
  env: process.env,
  dirName: basename(execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim()),
});
const ports = portsFor(slot);

const BASE = `http://localhost:${ports.dev}`;
const OUT = 'test-results/probe-guest-card';
mkdirSync(OUT, { recursive: true });

// Admin SDK — из экземпляра sync-server (капкан plans/63: у него СВОЙ node_modules).
process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${ports.firestore}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${ports.auth}`;
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

/*
 * 🔴 ЧТЕНИЕ ГОСТЕВОЙ СЕССИИ И УБОРКА ЗА СОБОЙ ПЕРЕЕХАЛИ В `lib/guest-session.mjs` (2026-08-30).
 *
 * Здесь стоял локальный `sessionOf()`, бравший ПЕРВУЮ попавшуюся запись
 * `firebase:authUser:*`. Приём из этого файла скопировали в другие приборы, и в одном из них
 * он снёс dev-пользователя стенда целиком: uid прочитался чужой, а уборка исполнила своё
 * обещание. Разбор класса и обе половины лечения — `bugs/NEW_probe_ubiraet_ne_gostya.md` и
 * шапка модуля. Здесь оригинал приёма, поэтому лечится он первым: копия чинится, а оригинал
 * иначе продолжал бы сеять.
 */

const SCREENS = ['/relations', '/space', '/dims', '/menu', '/account'];
console.log('═══ ЗОНД КАРТОЧКИ ГОСТЯ (plans/22 фаза 5, выбор A) ═══');
// Источник слота печатается намеренно: молчаливый выбор адреса — тот самый класс, из-за
// которого прибор однажды снёс dev-пользователя чужого стенда.
console.log(`  стенд: слот ${slot} · источник слота: ${источник} · ${BASE}\n`);
const browser = await chromium.launch();
let guestUid = null;

try {
  /* ── Гость: карточка на пяти экранах, профиль — исключение ── */
  const g = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const page = await g.newPage();
  /*
   * 🔴 ГОСТЬ ЗАВОДИТСЯ В ДВА ШАГА, И ОБА НУЖНЫ — ЭТО НЕ ЦЕРЕМОНИЯ.
   *
   * Здесь стоял ОДИН заход на `/profile?guest=1`, и он недетерминирован ГОНКОЙ. Ветка
   * `?guest` на профиле (`+page.svelte:363`) честно заводит гостя, но соседние компоненты
   * той же страницы в тот же миг зовут `currentSession()`, а она без параметра `?as`
   * автовходит dev-пользователем (`data/profile.ts:127`). Кто успел, тот и в сессии.
   * Прогон читал то гостя, то `dev@ndim.space` — и уборка сносила прочитанное.
   *
   * Шаг 1 — `?as=guest` на любом экране: `currentSession()` уходит в ветку гостя и зовёт
   * настоящий `signInAnonymously` (`profile.ts:103`). Сессия анонимная, гонки нет.
   * Шаг 2 — `/profile?as=guest&guest=1`: ветка `?guest` видит ЖИВУЮ анонимную сессию,
   * переиспользует её (нового гостя не заводит) и делает `ensureSpaceExists` — документы
   * появляются. Параметр `?as` при этом держит соседние компоненты в гостевой ветке.
   * ⚠️ Документ гостю НУЖЕН: без него профиль рисует ветку «гость без документа», где
   * расширенной карточки нет вовсе, и проверка ниже честно краснеет.
   */
  await page.goto(`${BASE}${SCREENS[0]}?as=guest`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const session = await readGuestSession(page);
  if (!session.uid) throw new Error(`гостевая сессия не опознана: ${session.reason}`);
  guestUid = session.uid;
  await page.goto(`${BASE}/profile?as=guest&guest=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  console.log(
    `  гость рождён дверью продукта: ${guestUid} · записей аутентификации ${session.authRecords}, гостевых ${session.anonymous}`,
  );

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
  // Разрешение на удаление спрашивается у САМОЙ учётки, а не предполагается по намерению.
  const done = await removeGuest({ db, auth: getAuth() }, guestUid);
  check(done.removed, `уборка разрешена свойством учётки: ${done.why}`);
  check(
    done.traces.length === 0,
    `следов зонда не осталось${done.traces.length ? ` (остались: ${done.traces.join(', ')})` : ''}`,
  );
}

console.log(`\nИтог: ${failures === 0 ? '✅ зонд пройден целиком' : `❌ провалов: ${failures}`}`);
process.exit(failures === 0 ? 0 : 1);

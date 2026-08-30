#!/usr/bin/env node
/**
 * ПРИБОР ЖИВОЙ ПРОБЫ (не страж) — «честная смерть гостя» на стенде (`plans/63` шаг 7).
 *
 * ДВЕ ПОЛОВИНЫ ПРОБЫ:
 *   А. УБОРКА: настоящий гость рождается дверью продукта (`/profile?guest=1`), ставит одну
 *      оценку через ленту «Измерений», прибор досеивает следы в чужих деревьях (дружба,
 *      членство, подсказка, заявка, фото в Storage — досев назван честно: эти пути гостю
 *      в UI ещё не построены, а уборка обязана снести след ЛЮБОГО происхождения). Затем
 *      уборка зовётся С ПОДСТАВНЫМ «сейчас» (2026-10-02: предохранитель открыт, гость
 *      истёк) — и прибор сверяет КАЖДЫЙ след таблицы §4: его нет, учётки в Auth нет,
 *      заявка обезличена, а контрольный ЖИТЕЛЬ стенда невредим.
 *   Б. ЭКРАН: второй гость рождается той же дверью, его документы прибор уносит (это
 *      состояние «между удалением данных и удалением учётки» — ровно то, что распознаёт
 *      клиент), затем страница перезагружается с ПОДМЕНОЙ ЧАСОВ (+8 дней, только Date.now
 *      внутри страницы — приём подставного «сейчас» юнитов, EXP-0159: ломаем код, не
 *      окружение) — и экран обязан показать «Гостевая сессия истекла». Кадры: 2 темы ×
 *      2 ширины (390/1024).
 *
 * ⚠️ Подставной «сейчас» половины А убирает ВСЕХ истёкших к этой дате анонимов стенда —
 * на стенде это гигиена, а не потеря; прибор печатает счёт.
 *
 * Запуск: стенд обязан быть поднят (`npm run stand`).
 *   node tools/probe-guest-death-live.mjs [--base http://localhost:5173] [--slot N]
 * ⚠️ `--slot` (или переменная `STAND_SLOT`) — для прогона из ЧУЖОГО дерева: судья работает
 * временным деревом, а его имя даёт слот 0, то есть слот главной копии.
 */

import { mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

import { readGuestSession, removeGuest } from './lib/guest-session.mjs';
import { portsFor, slotFromRequest } from './lib/stand-slot.mjs';

/*
 * 🔴 АДРЕС СТЕНДА — ИЗ СЛОТА РАБОЧЕГО МЕСТА (2026-08-30). Здесь стояли `localhost:5173` и
 * порты `8181/9099/9199` — адрес СЛОТА 0, главной копии. Прибор, запущенный ролью из её
 * worktree, заводил и УБИВАЛ гостей в ЧУЖОМ стенде. Правка сделана потому, что без неё
 * доказательства прибора нельзя перепрогнать из рабочего места роли вовсе.
 * ⚠️ Поведение слота 0 остаётся байт-в-байт прежним: `portsFor(0)` возвращает ровно
 * `5173/8181/9099/9199` (тот же довод, на котором стоит `tools/stand-launch.mjs`).
 */
const { slot, источник } = slotFromRequest({
  argv: process.argv.slice(2),
  env: process.env,
  dirName: basename(execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim()),
});
const ports = portsFor(slot);

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const BASE = opt('--base', `http://localhost:${ports.dev}`).replace(/\/$/, '');
const OUT = 'test-results/probe-guest-death';
mkdirSync(OUT, { recursive: true });

if (!/localhost|127\.0\.0\.1/.test(BASE)) {
  console.error('Только стенд: прибор заводит и УБИВАЕТ гостей — в бою это трогало бы живых людей.');
  process.exit(1);
}

// Админский вход в эмуляторы — ДО импорта сервера синхронизации (он читает env при импорте).
process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${ports.firestore}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${ports.auth}`;
process.env.FIREBASE_STORAGE_EMULATOR_HOST = `127.0.0.1:${ports.storage}`;
process.env.FIREBASE_PROJECT_ID = 'demo-ndim-dev';

const { cleanupStaleGuests } = await import('../sync-server/index.mjs');
// ⚠️ У sync-server СВОЙ node_modules (зависимости Docker-образа): приложение Admin SDK живёт
// в ТОМ экземпляре firebase-admin. Корневой экземпляр — другой мир с пустым списком app
// (поймано первым прогоном: «The default Firebase app does not exist»).
import { createRequire } from 'node:module';
const requireSync = createRequire(new URL('../sync-server/', import.meta.url));
const { getFirestore } = requireSync('firebase-admin/firestore');
const { getAuth } = requireSync('firebase-admin/auth');
const { getStorage } = requireSync('firebase-admin/storage');

const db = getFirestore();
const bucket = getStorage().bucket();
const DAY = 24 * 60 * 60 * 1000;
// Подставной «сейчас» половины А: предохранитель (2026-10-01) открыт, сегодняшний гость истёк.
const FAKE_NOW = Date.parse('2026-10-02T12:00:00+03:00');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}`);
  if (!ok) failures += 1;
};

/*
 * 🔴 ЧТЕНИЕ СЕССИИ ПЕРЕЕХАЛО В `lib/guest-session.mjs` (2026-08-30). Здесь стоял локальный
 * `sessionOf()`, бравший ПЕРВУЮ попавшуюся запись `firebase:authUser:*`. Записей в базе
 * браузера бывает несколько, и выбор по порядку однажды отдал uid dev-пользователя стенда —
 * уборка снесла его целиком (`bugs/NEW_probe_ubiraet_ne_gostya.md`). Теперь запись выбирается
 * по СВОЙСТВУ `isAnonymous`, а удаление спрашивает разрешения у самой учётки.
 */

/**
 * Рождение гостя настоящей дверью продукта; возвращает { context, page, uid }.
 *
 * 🔴 ДВА ШАГА, И ОБА НУЖНЫ. Один заход на `/profile?guest=1` недетерминирован ГОНКОЙ: ветка
 * `?guest` на профиле (`+page.svelte:363`) заводит гостя, а соседние компоненты той же
 * страницы в тот же миг зовут `currentSession()`, которая без параметра `?as` автовходит
 * dev-пользователем (`data/profile.ts:127`). Кто успел, тот и в сессии.
 *   шаг 1 `?as=guest` — сессия становится анонимной настоящим `signInAnonymously`;
 *   шаг 2 `/profile?as=guest&guest=1` — ветка `?guest` видит живую анонимную сессию,
 *          переиспользует её и делает `ensureSpaceExists`, то есть заводит документы.
 */
async function bornGuest(browser, name) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const page = await context.newPage();
  await page.goto(`${BASE}/dims?as=guest`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const session = await readGuestSession(page);
  if (!session.uid) throw new Error(`${name}: гостевая сессия не опознана — ${session.reason}`);
  await page.goto(`${BASE}/profile?as=guest&guest=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500); // ensureSpaceExists асинхронен
  console.log(
    `  ${name} рождён дверью продукта: ${session.uid} · записей аутентификации ${session.authRecords}, гостевых ${session.anonymous}`,
  );
  return { context, page, uid: session.uid };
}

const exists = async (path) => (await db.doc(path).get()).exists;

console.log('═══ ЖИВАЯ ПРОБА «ЧЕСТНАЯ СМЕРТЬ ГОСТЯ» (plans/63 шаг 7) ═══');
// Источник слота печатается намеренно: прибор УБИВАЕТ гостей, и «в каком стенде» обязано
// стоять в выводе, а не выводиться читателем из имени каталога.
console.log(`  стенд: слот ${slot} · источник слота: ${источник} · ${BASE}\n`);
const browser = await chromium.launch();

try {
  /* ── Половина А: уборка полного перечня следов ─────────────────────────── */
  console.log('── А. Уборка: гость со всеми следами таблицы §4 ──');
  const a = await bornGuest(browser, 'гость А');

  // Одна оценка через ленту «Измерений» — точка рождается органами продукта.
  await a.page.goto(`${BASE}/dims?as=guest`, { waitUntil: 'domcontentloaded' });
  await a.page.locator('article.dim').first().waitFor({ timeout: 20000 });
  const card = a.page.locator('article.dim').first();
  const dimId = await card.getAttribute('data-dim');
  await card.locator('.stars button[aria-label="7"]').click();
  await card.locator('.countdown .now').click({ timeout: 5000 });
  let confirmed = false;
  for (let k = 0; k < 27 && !confirmed; k += 1) {
    confirmed = await exists(`points/${a.uid}/dims/${dimId}`);
    if (!confirmed) await sleep(300);
  }
  if (!confirmed) throw new Error('оценка гостя А не долетела до базы за 8 с');
  console.log(`  оценка «${dimId}» записана продуктом, точка есть`);

  // Контрольный житель — полноценный человек стенда (точка без флага guest).
  const points = await db.collection('points').get();
  const resident = points.docs.find((p) => p.data().guest !== true && p.id !== a.uid)?.id;
  if (!resident) throw new Error('на стенде нет ни одного жителя — сид изменился?');
  console.log(`  контрольный житель: ${resident}`);

  // Досев следов в чужих деревьях (пути гостю в UI ещё не построены — фазы 6–7 эпика;
  // уборка обязана снести след любого происхождения, и это сказано в шапке).
  await db.doc(`users/${resident}/groups/probe-circle/members/${a.uid}`).set({ added: Date.now() });
  await db.doc(`users/${resident}/audience/${a.uid}`).set({ buckets: ['friends'] });
  const pairId = a.uid < resident ? `${a.uid}_${resident}` : `${resident}_${a.uid}`;
  await db.doc(`friendships/${pairId}`).set({
    a: a.uid < resident ? a.uid : resident,
    b: a.uid < resident ? resident : a.uid,
    requestedBy: a.uid, status: 'accepted', created: Date.now(), acceptedAt: Date.now(),
  });
  await db.doc('suggestions/probe-guest-death').set({ authorUid: a.uid, description: 'Проба смерти гостя', created: Date.now() });
  await bucket.file(`users/${a.uid}/avatar/avatar.webp`).save(Buffer.from('probe-avatar'));
  console.log('  следы досеяны: членство · подсказка · дружба · заявка · фото Storage');

  // Гость А выходит из браузера НЕ нужен — уборка серверная; закрываем контекст до прогона.
  await a.context.close();

  // Прогон уборки с подставным «сейчас» — тем же кодом, что гоняет полный проход.
  const removed = await cleanupStaleGuests(FAKE_NOW);
  console.log(`  уборка прогнана (подставной «сейчас» = 2026-10-02), вычищено: ${removed}`);

  check(!(await exists(`points/${a.uid}`)), 'точка гостя удалена');
  check(!(await exists(`points/${a.uid}/dims/${dimId}`)), 'оценка удалена');
  check(!(await exists(`relations/${a.uid}`)), 'топ удалён');
  check(!(await exists(`users/${a.uid}`)), 'users-дерево удалено');
  check(!(await exists(`users/${resident}/groups/probe-circle/members/${a.uid}`)), 'членство в чужой группе удалено');
  check(!(await exists(`users/${resident}/audience/${a.uid}`)), 'подсказка аудитории удалена');
  check(!(await exists(`friendships/${pairId}`)), 'дружба удалена');
  const suggestion = await db.doc('suggestions/probe-guest-death').get();
  check(suggestion.exists && suggestion.data().authorUid === null, 'заявка обезличена, а не удалена');
  const [avatarExists] = await bucket.file(`users/${a.uid}/avatar/avatar.webp`).exists();
  check(!avatarExists, 'фото в Storage удалено');
  const authGone = await getAuth().getUser(a.uid).then(() => false, (e) => e.code === 'auth/user-not-found');
  check(authGone, 'учётной записи Auth нет (последний след)');
  check(await exists(`points/${resident}`), '🔒 контрольный житель невредим');

  /* ── Половина Б: экран «гостевая сессия истекла» ───────────────────────── */
  console.log('\n── Б. Экран: вернувшийся в пустоту гость видит объяснение ──');
  const b = await bornGuest(browser, 'гость Б');

  // Состояние «данные унесла уборка, учётка ещё жива» — документы уносит прибор.
  await db.recursiveDelete(db.doc(`points/${b.uid}`));
  await db.doc(`relations/${b.uid}`).delete();
  await db.recursiveDelete(db.doc(`users/${b.uid}`));
  // Часы страницы — вперёд на 8 дней (только Date.now: его читает isExpiredGuestSession).
  await b.context.addInitScript(`{
    const offset = ${8 * DAY};
    const realNow = Date.now.bind(Date);
    Date.now = () => realNow() + offset;
  }`);

  const shot = async (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  const expiredVisible = async (page) => {
    const text = await page.innerText('body');
    return /Гостевая сессия истекла|guest session has expired/i.test(text);
  };

  // Тема продукта — атрибут data-theme на <html> (app.html, до отрисовки), а не media query;
  // переключаем тем же атрибутом, которым работает кнопка темы.
  const setTheme = (page, theme) =>
    page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);

  await b.page.goto(`${BASE}/profile?as=guest`, { waitUntil: 'domcontentloaded' });
  await b.page.waitForTimeout(2500);
  check(await expiredVisible(b.page), 'экран говорит «Гостевая сессия истекла» (светлая, 390)');
  await shot(b.page, '1-expired-light-390');
  await setTheme(b.page, 'dark');
  await b.page.waitForTimeout(400);
  check(await expiredVisible(b.page), 'то же в тёмной теме');
  await shot(b.page, '2-expired-dark-390');
  await b.page.setViewportSize({ width: 1024, height: 800 });
  await b.page.waitForTimeout(400);
  await shot(b.page, '3-expired-dark-1024');
  await setTheme(b.page, 'light');
  await b.page.waitForTimeout(400);
  await shot(b.page, '4-expired-light-1024');
  const restartVisible = await b.page.locator('button', { hasText: /Начать заново|Start over/ }).count();
  check(restartVisible > 0, 'кнопка «Начать заново» на месте');

  // Контроль прибора: БЕЗ подмены часов тот же гость без документов — СВЕЖИЙ, не истёкший.
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const freshPage = await fresh.newPage();
  // Тот же двухшаговый порядок, что в `bornGuest`: сначала гостевая сессия, потом документы.
  await freshPage.goto(`${BASE}/dims?as=guest`, { waitUntil: 'domcontentloaded' });
  await freshPage.waitForTimeout(2500);
  const freshSession = await readGuestSession(freshPage);
  if (!freshSession.uid) throw new Error(`контроль: гостевая сессия не опознана — ${freshSession.reason}`);
  const freshUid = freshSession.uid;
  await freshPage.goto(`${BASE}/profile?as=guest&guest=1`, { waitUntil: 'domcontentloaded' });
  await freshPage.waitForTimeout(2500);
  await db.recursiveDelete(db.doc(`points/${freshUid}`)).catch(() => {});
  await db.doc(`relations/${freshUid}`).delete().catch(() => {});
  await db.recursiveDelete(db.doc(`users/${freshUid}`)).catch(() => {});
  await freshPage.goto(`${BASE}/profile?as=guest`, { waitUntil: 'domcontentloaded' });
  await freshPage.waitForTimeout(2500);
  check(!(await expiredVisible(freshPage)), '🔒 контроль: свежий гость без документов НЕ объявлен истёкшим');
  await shot(freshPage, '5-control-fresh-guest');

  /* ── Уборка следов пробы (канон: «убрал» без проверки не считается) ─────── */
  console.log('\n── Уборка следов пробы ──');
  await db.doc('suggestions/probe-guest-death').delete();
  // Разрешение на удаление спрашивается у САМОЙ учётки, а не предполагается по намерению:
  // прибор заводил этих гостей сам, но «завёл» и «этот uid — гость» разделяет вычисление.
  for (const uid of [b.uid, freshUid]) {
    if (!uid) continue;
    const done = await removeGuest({ db, auth: getAuth() }, uid);
    check(done.removed, `${uid}: уборка разрешена свойством учётки — ${done.why}`);
  }
  const traces = [];
  if ((await db.doc('suggestions/probe-guest-death').get()).exists) traces.push('suggestions/probe-guest-death');
  for (const uid of [a.uid, b.uid, freshUid]) {
    if (await exists(`points/${uid}`)) traces.push(`points/${uid}`);
    if (await exists(`users/${uid}`)) traces.push(`users/${uid}`);
  }
  check(traces.length === 0, `следов пробы не осталось${traces.length ? ` (остались: ${traces.join(', ')})` : ''}`);

  await b.context.close();
  await fresh.close();
} finally {
  await browser.close();
}

console.log(`\nИтог: ${failures === 0 ? '✅ проба пройдена целиком' : `❌ провалов: ${failures}`}. Кадры: ${OUT}/`);
process.exit(failures === 0 ? 0 : 1);

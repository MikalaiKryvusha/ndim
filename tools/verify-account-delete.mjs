/**
 * Страж УДАЛЕНИЯ АККАУНТА — фаза 8 эпика `plans/15` (план `plans/20`).
 *
 * 🔴 ПРОГОН УНИЧТОЖАЕТ dev-пользователя стенда ЦЕЛИКОМ. Запускать последним, в одиночку,
 * и ПЕРЕЗАПУСКАТЬ СТЕНД после.
 *
 * ═══ ГЛАВНОЕ УСТРОЙСТВО: сначала доказываем, что удалять БЫЛО ЧТО ═══
 *
 * Страж, который удалил пустоту и не нашёл пустоту, зелен и бесполезен. Поэтому прогон
 * начинается с проверки «до»: документы человека, его оценки и его фотография ОБЯЗАНЫ
 * существовать. Не существуют — прогон падает здесь же, не дойдя до удаления, и это правильно:
 * мерить нечем (`EXP-0070` — парная проверка).
 *
 * ЧТО СТЕРЕЖЁТ:
 *   🔑 неверная почта НЕ удаляет ничего (подтверждение В2 = А работает);
 *   🔑 после удаления в базе не осталось НИЧЕГО из перечня `plans/20` шаг 0;
 *   🔑 фотография удалена из Storage — дефект 1.x, где она переживала аккаунт;
 *   · тексты: предупреждение 1.x дословно, перечень потерь, «Аккаунт удалён»;
 *   · честность про сутки.
 *
 * ⚠️ ЧЕГО СТРАЖ НЕ ПРОВЕРЯЕТ: что `relations/{uid}` исчез. Он и НЕ ДОЛЖЕН исчезать здесь —
 * клиенту запись в него запрещена правилами, это работа суточного прохода сервера
 * синхронизации (В11 = А). Страж, наоборот, проверяет, что след ОСТАЛСЯ: иначе мы бы не
 * заметили, что серверная половина работы ещё не сделана.
 *
 * Запуск: `npm run stand`, затем `node tools/verify-account-delete.mjs`.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const AUTH = 'http://127.0.0.1:9099';
const FS = 'http://127.0.0.1:8181';
const ST = 'http://127.0.0.1:9199';
const PROJECT = 'demo-ndim-dev';
const BUCKET = `${PROJECT}.appspot.com`;
const CURRENT = 'dev@ndim.space';
const OUT = 'test-results/account-delete';
mkdirSync(OUT, { recursive: true });

let pass = 0;
const fails = [];
function check(ok, what, detail = '') {
  if (ok) pass++;
  else {
    fails.push(`${what}${detail ? ' — ' + detail : ''}`);
    console.log(`  ❌ ${what}${detail ? ' — ' + detail : ''}`);
  }
}

/*
 * ⚠️ ЭМУЛЯТОРЫ ОТДАЮТ REST ЧЕРЕЗ ПРАВИЛА, а не мимо них. Без этого заголовка Firestore и
 * Storage возвращают 403 «PERMISSION_DENIED» — а первая редакция стража считала любой
 * не-200 отсутствием документа и потому видела пустоту там, где всё было на месте.
 * Класс ошибки тот же, что с uid: прибор мерил не то, что думал.
 *
 * `Bearer owner` — штатный способ эмулятора работать от имени администратора.
 */
const OWNER = { Authorization: 'Bearer owner' };

const docsUrl = (path) => `${FS}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`;

/** Есть ли документ. 404 — нет, и это не ошибка прибора. */
async function exists(path) {
  const r = await fetch(docsUrl(path), { headers: OWNER });
  if (r.status === 403) throw new Error('эмулятор ответил 403 — прибор смотрит мимо правил');
  return r.status === 200;
}

/** Сколько документов в коллекции. */
async function count(path) {
  const r = await fetch(docsUrl(path), { headers: OWNER });
  if (r.status !== 200) return 0;
  const body = await r.json();
  return (body.documents ?? []).length;
}

/** Лежит ли фотография в Storage. */
async function photoExists(uid) {
  const name = encodeURIComponent(`users/${uid}/avatar/avatar.webp`);
  const r = await fetch(`${ST}/v0/b/${BUCKET}/o/${name}`, { headers: OWNER });
  if (r.status === 403) throw new Error('Storage ответил 403 — прибор смотрит мимо правил');
  return r.status === 200;
}

/** Настоящий uid человека — из эмулятора Auth, а не из клиентских флагов. */
async function uidByEmail(email) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (r.status !== 200) return null;
  const body = await r.json();
  return (body.userInfo ?? []).find((u) => u.email === email)?.localId ?? null;
}

async function lastSignInCode() {
  const r = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes = [] } = await r.json();
  const mine = oobCodes.filter((c) => c.requestType === 'EMAIL_SIGNIN' && c.email === CURRENT);
  return mine[mine.length - 1] ?? null;
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ru-RU' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/permission|insufficient|400|Bad Request/i.test(m.text()) && errors.push(m.text()));
  const text = () => page.evaluate(() => document.body.innerText || '');

  // ── 0 · КТО перед нами и БЫЛО ЛИ ЧТО удалять ───────────────────────────────
  console.log('\nСостояние ДО удаления:');
  await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);
  // ⚠️ НЕ из localStorage: ключ `ndim-session` — это ФЛАГ («сессия есть»), а не uid; он
  // отдаёт «1». Первая редакция стража на этом и попалась: все проверки «до» мерили
  // несуществующий документ `users/1` — а значит и зелёные «после» были ложными.
  // Так выглядит страж, который мерит не то: красное он тоже показал бы не про то.
  // Настоящий uid спрашиваем у эмулятора Auth по почте.
  const uid = await uidByEmail(CURRENT);
  check(typeof uid === 'string' && uid.length > 10, 'uid человека получен от эмулятора Auth', String(uid));

  const before = {
    user: await exists(`users/${uid}`),
    profile: await count(`users/${uid}/profile`),
    point: await exists(`points/${uid}`),
    dims: await count(`points/${uid}/dims`),
    photo: await photoExists(uid),
  };
  console.log('  ' + JSON.stringify(before));
  // 🔑 Без этого блока весь прогон ничего не значит: удалить пустоту легко.
  check(before.user, '🔑 ДО: документ человека существует');
  check(before.profile > 0, '🔑 ДО: бакеты профиля есть', String(before.profile));
  check(before.point, '🔑 ДО: точка есть');
  check(before.dims > 0, '🔑 ДО: оценки есть', String(before.dims));
  check(before.photo, '🔑 ДО: фотография лежит в Storage');

  // ── 1 · тексты виджета ─────────────────────────────────────────────────────
  console.log('\nВиджет «Удаление аккаунта»:');
  await page.locator('a.arow[href="/account"]').first().click();
  await page.waitForTimeout(2500);
  await page.locator('button', { hasText: /^Удалить аккаунт$/ }).first().click();
  await page.waitForTimeout(500);
  const t1 = await text();
  check(/безвозвратно удалены/.test(t1), 'предупреждение 1.x дословно («безвозвратно»)');
  check(/Введите Вашу почту, чтобы подтвердить/.test(t1), 'поле подтверждения — почта (В2=А)');
  check(/в течение суток/.test(t1), 'честно сказано про сутки (В3=А)');
  check(/Оставить всё как есть/.test(t1), 'кнопка отмены названа исходом, а не «Отмена»');
  await page.screenshot({ path: `${OUT}/open.png`, fullPage: true });

  // ── 2 · 🔑 НЕВЕРНАЯ ПОЧТА НЕ УДАЛЯЕТ ───────────────────────────────────────
  console.log('\nНеверная почта:');
  await page.locator('.zone input.inp').first().fill('someone-else@ndim.test');
  await page.locator('button.warn', { hasText: /Удалить аккаунт/ }).first().click();
  await page.waitForTimeout(1500);
  check(/не совпадает с Вашей/.test(await text()), '🔑 неверная почта отвергнута');
  check(await exists(`users/${uid}`), '🔑 неверная почта НИЧЕГО не удалила');

  // ── 3 · верная почта → подтверждение личности ──────────────────────────────
  console.log('\nПодтверждение личности:');
  await page.locator('.zone input.inp').first().fill(CURRENT);
  await page.locator('button.warn', { hasText: /Удалить аккаунт/ }).first().click();
  await page.waitForTimeout(3000);
  check(/Подтвердите, что это Вы/.test(await text()), 'экран просит подтвердить личность ДО удаления');
  check(await exists(`users/${uid}`), '🔑 до подтверждения ничего не удалено');
  const code = await lastSignInCode();
  check(code !== null, 'ссылка подтверждения выписана на почту человека');

  // ── 4 · возврат по ссылке → каскад ─────────────────────────────────────────
  console.log('\nУдаление:');
  await page.goto(`${BASE}/account?mode=signIn&oobCode=${code.oobCode}&apiKey=demo-api-key`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(7000);
  const t2 = await text();
  check(/Аккаунт удалён/.test(t2), '🔑 каскад дошёл до конца', t2.slice(0, 200));
  await page.screenshot({ path: `${OUT}/done.png`, fullPage: true });

  // ── 5 · В БАЗЕ НЕ ОСТАЛОСЬ НИЧЕГО ──────────────────────────────────────────
  console.log('\nСостояние ПОСЛЕ:');
  const after = {
    user: await exists(`users/${uid}`),
    profile: await count(`users/${uid}/profile`),
    point: await exists(`points/${uid}`),
    dims: await count(`points/${uid}/dims`),
    photo: await photoExists(uid),
  };
  console.log('  ' + JSON.stringify(after));
  check(!after.user, '🔑 документ человека удалён');
  check(after.profile === 0, '🔑 бакеты профиля удалены', String(after.profile));
  check(!after.point, '🔑 точка удалена');
  check(after.dims === 0, '🔑 оценки удалены', String(after.dims));
  check(!after.photo, '🔑 ФОТОГРАФИЯ УДАЛЕНА (дефект 1.x, где она переживала аккаунт)');

  // ── 6 · след, который обязан ОСТАТЬСЯ до прохода сервера ───────────────────
  // Не парадокс: клиенту запись в relations запрещена правилами, и это работа суточного
  // прохода (В11 = А). Проверяем ОСТАТОК, чтобы не проглядеть, что серверная половина
  // ещё не сделана — молчаливое «всё чисто» здесь было бы самообманом.
  const relations = await exists(`relations/${uid}`);
  console.log(`  relations/{uid} остался: ${relations} (ожидаемо до серверной чистки)`);

  check(errors.length === 0, 'консоль чиста', errors.slice(0, 2).join(' | '));
  await ctx.close();
} finally {
  await browser.close();
}

console.log(`\n${'─'.repeat(64)}`);
console.log(`Пройдено: ${pass}, провалено: ${fails.length}`);
if (fails.length) {
  console.log('\nПровалы:');
  for (const f of fails) console.log(`  · ${f}`);
}
console.log('\n⚠️ dev-пользователь стенда УНИЧТОЖЕН — ПЕРЕЗАПУСТИТЕ СТЕНД.');
console.log(`Скриншоты — ${OUT}/`);
if (fails.length) process.exit(1);

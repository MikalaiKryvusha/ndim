/**
 * QA-прогон bugs/54 живым браузером на стенде: ПОВТОРНЫЙ ТАП ПО ЗВЕЗДЕ ОТМЕНЯЕТ ОТСЧЁТ.
 *
 * Слово владельца (волна 11): «когда установил звезду, не могу её снять и отменить счётчик
 * автосохранения оценки. В старом NDim повторный тап по выбранной звезде отменял выделение».
 *
 * Канон снят с живого 1.x ДО кода (`researches/12` → «Жест звезды: повторный тап»):
 * повторный тап отменял только НЕсохранённое, а сохранённых данных не трогал никогда
 * (`app.js:3759` — снять выделение + `hideSaveButton`; `app.js:3856/3870/3884` — по уже
 * выделенной звезде не делал ничего; удаление жило отдельной операцией `deleteField`).
 *
 * ГЛАВНОЕ, ЧЕГО НЕ ВИДНО НА ЭКРАНЕ: отсчёт отменён — значит записи в базе НЕ ПОЯВИЛОСЬ.
 * Поэтому страж смотрит в Firestore эмулятора напрямую (bugs/54 → «План проверки»:
 * «проверять по базе эмулятора, а не по экрану»), причём ПОСЛЕ того, как отсчёт заведомо
 * истёк бы: проверка сразу после тапа была бы зелёной и на сломанном коде.
 *
 * Требует поднятый `npm run stand`. Скриншоты — test-results/bug54/.
 * Запуск: node tools/verify-bug54.mjs [--quick]
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const STAND = 'http://localhost:5173';
const AUTH = 'http://127.0.0.1:9099';
const FS = 'http://127.0.0.1:8181';
const PROJECT = 'demo-ndim-dev';
const SHOTS = 'test-results/bug54';
const QUICK = process.argv.includes('--quick');

/** Отсчёт продукта — 5 секунд. Ждём заведомо дольше, чтобы поймать несостоявшуюся запись. */
const COUNTDOWN_MS = 5000;
const AFTER_COUNTDOWN_MS = COUNTDOWN_MS + 2500;

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Вход почтовой ссылкой через oob-код эмулятора Auth (приём EXP-0045). */
async function signIn(page) {
  const email = 'dev@ndim.space';
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=demo-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestType: 'EMAIL_SIGNIN', email, continueUrl: `${STAND}/profile` }),
  });
  const res = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes = [] } = await res.json();
  const last = oobCodes.filter((c) => c.email === email && c.requestType === 'EMAIL_SIGNIN').at(-1);
  if (!last) return false;
  await page.goto(`${STAND}/profile?mode=signIn&oobCode=${last.oobCode}&apiKey=demo-api-key`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(2200);
  return true;
}

/**
 * uid пользователя стенда — чтобы читать ЕГО оценки, а не угадывать путь.
 *
 * Берём входом по паролю стенда (он задан сидом, `tools/seed-dev.mjs`): у эмулятора Auth
 * список аккаунтов по GET не читается («Method GET not allowed»), а вход возвращает
 * `localId` штатно и не зависит от того, как именно человек вошёл в браузере.
 */
async function standUid() {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'dev@ndim.space', password: 'ndim-dev-stand', returnSecureToken: true }),
  });
  if (!res.ok) return null;
  const { localId } = await res.json();
  return localId ?? null;
}

/**
 * Оценка измерения ПРЯМО ИЗ БАЗЫ: `points/{uid}/dims/{dimId}`.
 * `null` — документа нет вовсе (человек это измерение не оценивал).
 */
async function ratingInDb(uid, dimId) {
  const res = await fetch(`${FS}/v1/projects/${PROJECT}/databases/(default)/documents/points/${uid}/dims/${dimId}`, {
    headers: { Authorization: 'Bearer owner' },
  });
  if (res.status === 404) return null;
  const json = await res.json();
  const raw = json?.fields?.value;
  if (raw === undefined) return null;
  return Number(raw.integerValue ?? raw.doubleValue);
}

/** Тап по звезде `value` на карточке `dimId`. */
async function tapStar(page, dimId, value) {
  await page.locator(`article.dim[data-dim="${dimId}"] .stars .st[aria-label="${value}"]`).click();
}

/**
 * Идёт ли отсчёт на карточке (плашка «сохраняю через N секунд»).
 *
 * ⚠️ Плашка приезжает и уезжает переходом `slide`: мгновенный `isVisible()` ловит её в
 * кадре с НУЛЕВОЙ высотой и врёт в обе стороны (первый прогон дал 3 ложных провала на
 * заведомо верном коде). Поэтому ждём УСТОЙЧИВОГО состояния, а не снимаем мгновение.
 */
async function counting(page, dimId, expected) {
  const plate = page.locator(`article.dim[data-dim="${dimId}"] .countdown`);
  try {
    await plate.waitFor({ state: expected ? 'visible' : 'hidden', timeout: 3000 });
  } catch {
    return !expected; // не дождались ожидаемого состояния — значит оно противоположное
  }
  return expected;
}

/** Какая звезда сейчас «горит» (класс peak ставится ровно выбранной). */
async function litStar(page, dimId) {
  const peak = page.locator(`article.dim[data-dim="${dimId}"] .stars .st.peak`);
  return (await peak.count()) === 0 ? null : Number(await peak.first().getAttribute('aria-label'));
}

const browser = await chromium.launch();
await mkdir(SHOTS, { recursive: true });

const COMBOS = QUICK ? [['light', 1440]] : [['light', 390], ['light', 1440], ['dark', 390], ['dark', 1440]];

try {
  const uid = await standUid();
  if (uid === null) {
    console.log('❌ не найден пользователь стенда — поднят ли `npm run stand`?');
    process.exit(1);
  }

  for (const [theme, width] of COMBOS) {
    console.log(`\nbugs/54 · повторный тап отменяет отсчёт (${theme}, ${width}):`);
    const context = await browser.newContext({ viewport: { width, height: 820 }, locale: 'ru-RU' });
    await context.addInitScript((value) => localStorage.setItem('ndim-theme', value), theme);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (event) => errors.push(String(event)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    if (!(await signIn(page))) {
      check('вход на стенд', false, 'не удалось войти почтовой ссылкой');
      await context.close();
      continue;
    }

    await page.goto(`${STAND}/dims`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('article.dim[data-dim]', { timeout: 30000 });

    // Берём НЕОЦЕНЁННОЕ измерение: вкладка «Все» — это очередь ещё не оценённого.
    const dimId = await page.locator('article.dim[data-dim]').first().getAttribute('data-dim');
    check('на стенде есть неоценённое измерение', dimId !== null && (await ratingInDb(uid, dimId)) === null,
      `${dimId}`);

    // ── 1. Тап по звезде запускает отсчёт ──
    await tapStar(page, dimId, 7);
    check('тап по звезде 7 → пошёл отсчёт', await counting(page, dimId, true));
    check('горит именно звезда 7', (await litStar(page, dimId)) === 7);
    await page.screenshot({ path: `${SHOTS}/countdown-${theme}-${width}.png` });

    // ── 2. ГЛАВНОЕ: повторный тап по ТОЙ ЖЕ звезде отменяет отсчёт ──
    await tapStar(page, dimId, 7);
    check('повторный тап по звезде 7 → отсчёт ОТМЕНЁН', !(await counting(page, dimId, false)));
    check('выделение снято — не горит ни одна звезда', (await litStar(page, dimId)) === null);
    await page.screenshot({ path: `${SHOTS}/cancelled-${theme}-${width}.png` });

    // ── 3. И записи в базе не появилось — ждём ДОЛЬШЕ, чем длился бы отсчёт ──
    await page.waitForTimeout(AFTER_COUNTDOWN_MS);
    check('в базе оценки НЕТ (отсчёт действительно отменён)', (await ratingInDb(uid, dimId)) === null,
      `в базе: ${await ratingInDb(uid, dimId)}`);
    check('отсчёт не воскрес', !(await counting(page, dimId, false)));

    // ── 4. Тап по ДРУГОЙ звезде — обычная смена значения, отсчёт перезапускается ──
    await tapStar(page, dimId, 7);
    await tapStar(page, dimId, 3);
    check('тап по другой звезде → отсчёт идёт', await counting(page, dimId, true));
    check('горит новая звезда 3', (await litStar(page, dimId)) === 3);

    // Убираем за собой: отменяем, чтобы измерение осталось неоценённым для следующего прогона.
    await tapStar(page, dimId, 3);
    check('отмена работает и после смены значения', !(await counting(page, dimId, false)));
    await page.waitForTimeout(AFTER_COUNTDOWN_MS);
    check('после смены значения и отмены в базе по-прежнему пусто', (await ratingInDb(uid, dimId)) === null);

    // ── 5. СОХРАНЁННУЮ оценку жест звезды НЕ удаляет (канон 1.x) ──
    await tapStar(page, dimId, 5);
    await page.waitForTimeout(AFTER_COUNTDOWN_MS);
    check('оценка 5 сохранилась', (await ratingInDb(uid, dimId)) === 5, `в базе: ${await ratingInDb(uid, dimId)}`);

    // Карточка уехала из ленты «Все» — ищем её во вкладке «Мой NDim ID», как живой человек.
    await page.locator('.segs button', { hasText: 'Мой NDim ID' }).click();
    await page.waitForSelector(`article.dim[data-dim="${dimId}"]`, { timeout: 20000 });
    await tapStar(page, dimId, 5);
    check('тап по СОХРАНЁННОЙ звезде не запускает отсчёт', !(await counting(page, dimId, false)));
    await page.waitForTimeout(1500);
    check('сохранённая оценка НЕ удалена жестом звезды', (await ratingInDb(uid, dimId)) === 5,
      `в базе: ${await ratingInDb(uid, dimId)}`);
    await page.screenshot({ path: `${SHOTS}/saved-${theme}-${width}.png` });

    // Возвращаем стенд в исходное: чистим документ оценки напрямую в эмуляторе.
    await fetch(`${FS}/v1/projects/${PROJECT}/databases/(default)/documents/points/${uid}/dims/${dimId}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer owner' },
    });

    check('консоль чиста', errors.length === 0, errors.slice(0, 3).join(' · '));
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`\n${failures === 0 ? '✅ ВСЁ ЗЕЛЁНОЕ' : `❌ ПРОВАЛОВ: ${failures}`}`);
process.exit(failures === 0 ? 0 : 1);

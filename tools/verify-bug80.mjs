/**
 * QA-прогон bugs/80 (п. «б» + анимация) живым браузером на стенде:
 * РЯД СМАЙЛИКОВ В КАРТОЧКЕ ИЗМЕРЕНИЯ и ЗАМЕДЛЕННЫЙ УЛЁТ СОХРАНЯЕМОЙ КАРТОЧКИ.
 *
 * Слово владельца (интервью №007, В9, дословно):
 *   «А — не один смайлик, а появляется весь ряд смайликов, если звезда выбрана и ждёт
 *    сохранения. Снимаешь выбор — исчезает ряд смайликов. И нужно замедлить анимацию
 *    улетания с экрана сохраняемого измерения, сейчас слишком быстро, не понятно, что
 *    происходит.»
 *
 * Что здесь сторожится и ПОЧЕМУ именно так:
 *
 * 1. Ряда НЕТ, пока звезда не выбрана, и он ИСЧЕЗАЕТ по снятию выбора. Это половина слова
 *    владельца, и без неё «ряд есть» доказывало бы только то, что смайлики нарисованы.
 * 2. Цвета — не глазами: с каждого лица снимается ВЫЧИСЛЕННЫЙ браузером `fill`
 *    (`getComputedStyle`, то есть то, чем реально красится пиксель) и сверяется с
 *    `emojiscale.ts`, где цвета ЗАМЕРЕНЫ с живого 1.x (EXP-0057). Модуль импортируется
 *    прямо здесь — Node 24 исполняет TypeScript сам, поэтому копии палитры в приборе нет.
 * 3. Смайлик стоит ПОД СВОЕЙ звездой: сверяются центры по X (≤1px), а не «примерно рядом».
 *    Приём тот же, что у чипов в `verify-wave11.mjs`.
 * 4. Длительность улёта — ПОКАДРОВОЙ трассой (метод EXP-0060), а не чтением константы из
 *    кода: чтение доказывало бы, что я поправил файл, а не что человек видит медленное
 *    движение. Порог 450 мс выбран так, чтобы страж КРАСНЕЛ на прежнем значении
 *    (MOTION.slow = 320 мс) — иначе он не сторожил бы ничего.
 *
 * Требует поднятый `npm run stand`. Скриншоты — test-results/bug80/.
 * Запуск: node tools/verify-bug80.mjs [--quick]
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

import { GRADE_FACES } from '../src/lib/ui/emojiscale.ts';

const STAND = 'http://localhost:5173';
const AUTH = 'http://127.0.0.1:9099';
const FS = 'http://127.0.0.1:8181';
const PROJECT = 'demo-ndim-dev';
const SHOTS = 'test-results/bug80';
const QUICK = process.argv.includes('--quick');

/** Ниже этой длительности улёт снова «слишком быстрый» (прежнее значение — 320 мс). */
const MIN_FLY_MS = 450;

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** `#d50000` → `rgb(213, 0, 0)`: с этим форматом отдаёт цвет `getComputedStyle`. */
function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
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

/** uid пользователя стенда — вход по паролю сида (см. пояснение в verify-bug54.mjs). */
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

async function dropRating(uid, dimId) {
  await fetch(`${FS}/v1/projects/${PROJECT}/databases/(default)/documents/points/${uid}/dims/${dimId}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer owner' },
  });
}

async function tapStar(page, dimId, value) {
  await page.locator(`article.dim[data-dim="${dimId}"] .stars .st[aria-label="${value}"]`).click();
}

/**
 * Виден ли ряд смайликов. Ждём УСТОЙЧИВОГО состояния: ряд приезжает переходом `slide`, и
 * мгновенный `isVisible()` ловит его в кадре с нулевой высотой (ожог из verify-bug54.mjs).
 */
async function facesVisible(page, dimId, expected) {
  const row = page.locator(`article.dim[data-dim="${dimId}"] .faces`);
  try {
    await row.waitFor({ state: expected ? 'visible' : 'hidden', timeout: 3000 });
  } catch {
    return !expected;
  }
  return expected;
}

/**
 * Дождаться КОНЦА перехода `slide` — высота ряда перестала меняться.
 *
 * ⚠️ Зачем это нужно, стоило одного ложного диагноза: первый кадр тёмной темы застал ряд
 * ПОСРЕДИ перехода — лица были обрезаны сверху (`slide` едет высотой под `overflow: hidden`),
 * и на скриншоте это выглядело в точности как дефект вёрстки. `waitFor({state:'visible'})`
 * возвращается, как только высота стала больше нуля, а не когда движение кончилось.
 */
async function settled(page, selector) {
  let last = -1;
  for (let i = 0; i < 40; i += 1) {
    const height = await page.locator(selector).evaluate((el) => el.getBoundingClientRect().height);
    if (height === last && height > 0) return height;
    last = height;
    await page.waitForTimeout(50);
  }
  return last;
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
    console.log(`\nbugs/80 · ряд смайликов и улёт карточки (${theme}, ${width}):`);
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

    const dimId = await page.locator('article.dim[data-dim]').first().getAttribute('data-dim');
    const card = `article.dim[data-dim="${dimId}"]`;

    // ── 1. Пока звезда не выбрана — ряда НЕТ ──
    check('без выбранной звезды ряда смайликов нет',
      (await page.locator(`${card} .faces`).count()) === 0);

    // ── 2. Звезда выбрана и ждёт сохранения → появился ВЕСЬ ряд ──
    await tapStar(page, dimId, 7);
    check('после выбора звезды ряд смайликов появился', await facesVisible(page, dimId, true));
    check('в ряду ровно 11 лиц', (await page.locator(`${card} .faces .fc`).count()) === 11,
      `${await page.locator(`${card} .faces .fc`).count()}`);
    check('выделено ровно одно лицо, и это выбранная оценка',
      (await page.locator(`${card} .faces .fc.picked`).count()) === 1 &&
        (await page.locator(`${card} .faces .fc`).nth(7).evaluate((el) => el.classList.contains('picked'))),
    );
    const rowHeight = await settled(page, `${card} .faces`);
    check('ряд доехал целиком — лица не срезаны переходом', rowHeight >= 22,
      `высота ряда ${Math.round(rowHeight)}px`);
    await page.screenshot({ path: `${SHOTS}/faces-${theme}-${width}.png` });

    // ── 3. Цвета — вычисленные браузером, против замеренной палитры 1.x ──
    const painted = await page.locator(`${card} .faces .fc`).evaluateAll((cells) =>
      cells.map((cell) => {
        const paths = [...cell.querySelectorAll('path')];
        const rect = cell.querySelector('rect');
        return {
          fills: paths.map((p) => getComputedStyle(p).fill),
          rect: rect ? getComputedStyle(rect).fill : null,
          box: cell.getBoundingClientRect().width,
        };
      }),
    );
    let colorMismatch = '';
    GRADE_FACES.forEach((entry, grade) => {
      const seen = painted[grade];
      if (!seen) { colorMismatch ||= `нет лица ${grade}`; return; }
      if (entry.color === null) {
        // «Десятка» — авторский многоцветный файл: зелёное лицо на красной полосе.
        if (seen.rect !== 'rgb(212, 83, 81)' || seen.fills[0] !== 'rgb(0, 220, 0)') {
          colorMismatch ||= `10: ${seen.rect} / ${seen.fills[0]}`;
        }
      } else if (seen.fills[0] !== hexToRgb(entry.color)) {
        colorMismatch ||= `${grade}: ${seen.fills[0]} вместо ${hexToRgb(entry.color)}`;
      }
      if (seen.box <= 0) colorMismatch ||= `${grade}: нулевая ширина`;
    });
    check('все 11 цветов совпадают с замеренной палитрой 1.x', colorMismatch === '', colorMismatch);

    // ── 4. Смайлик стоит ПОД СВОЕЙ звездой ──
    const offsets = await page.evaluate((selector) => {
      const root = document.querySelector(selector);
      const centre = (el) => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; };
      const stars = [...root.querySelectorAll('.stars .st')].map(centre);
      const faces = [...root.querySelectorAll('.faces .fc')].map(centre);
      return stars.map((x, i) => Math.abs(x - faces[i]));
    }, card);
    const worst = Math.max(...offsets);
    check('каждое лицо под своей звездой (≤1px)', worst <= 1, `худшее расхождение ${worst.toFixed(2)}px`);

    // ── 5. Снял выбор — ряд ИСЧЕЗ (слово владельца буквально) ──
    await tapStar(page, dimId, 7);
    check('повторный тап по звезде → ряд смайликов исчез', !(await facesVisible(page, dimId, false)));
    await page.screenshot({ path: `${SHOTS}/faces-gone-${theme}-${width}.png` });

    // ── 6. Улёт карточки — покадровая трасса, а не константа из кода ──
    await tapStar(page, dimId, 8);
    await facesVisible(page, dimId, true);
    /*
     * Мерим СМЕЩЕНИЕ ВПРАВО по кадрам, а не «есть ли вообще transform».
     *
     * ⚠️ Первая редакция прибора спрашивала `transform !== 'none'` и намерила 1666 мс при
     * заведомых 640 — то есть была зелёной по неверной причине. Причины две: карточка
     * несёт `transform` и в покое (её ставит `animate:flip` при перестроении ленты), а
     * отсчёт трассы начинается ДО клика, и в замер попадали клик и запись в Firestore.
     * Классический ожог EXP-0082: «зелено» от неисправного прибора. Теперь трасса
     * привязана к САМОМУ ЖЕСТУ — первый кадр, где карточка сдвинулась вправо больше чем
     * на 4px, и последний перед её исчезновением.
     */
    await page.evaluate((selector) => {
      window.__fly = { first: null, last: null, gone: null, frames: 0, peak: 0, trace: [] };
      const t0 = performance.now();
      const shiftX = (el) => {
        const tr = getComputedStyle(el).transform;
        if (!tr || tr === 'none') return 0;
        const nums = tr.slice(tr.indexOf('(') + 1, -1).split(',').map(Number);
        return nums.length === 6 ? nums[4] : (nums[12] ?? 0);
      };
      const step = () => {
        const el = document.querySelector(selector);
        const now = performance.now() - t0;
        if (!el) { window.__fly.gone = now; return; }
        const x = shiftX(el);
        const o = Number(getComputedStyle(el).opacity);
        window.__fly.trace.push([Math.round(now), Math.round(x), +o.toFixed(2)]);
        if (x > 4) {
          window.__fly.first ??= now;
          window.__fly.last = now;
          window.__fly.frames += 1;
          if (x > window.__fly.peak) window.__fly.peak = x;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, card);
    await page.locator(`${card} .countdown .now`).click();
    await page.waitForTimeout(2500);
    const fly = await page.evaluate(() => window.__fly);
    const flyMs = fly.gone !== null && fly.first !== null ? fly.gone - fly.first : 0;
    if (process.argv.includes('--trace')) {
      console.log(`     трасса [мс, сдвиг X]: ${fly.trace.filter(([, x]) => x !== 0).map((f) => f.join(':')).join(' ')}`);
    }
    check('карточка уехала ВПРАВО за край (жест, а не мигание)', fly.peak >= 300,
      `дальше всего уехала на ${Math.round(fly.peak)}px`);
    check('движение снято кадрами, а не одним измерением', fly.frames >= 8,
      `кадров со сдвигом: ${fly.frames}`);
    check(`улёт длится дольше ${MIN_FLY_MS} мс (было 320 мс — «слишком быстро»)`, flyMs >= MIN_FLY_MS,
      `замер ${Math.round(flyMs)} мс`);

    // Убираем за собой: оценка ушла в базу, возвращаем стенд в исходное состояние.
    await dropRating(uid, dimId);

    /*
     * КАРТОЧКА УЕЗЖАЕТ, А НЕ РАСТВОРЯЕТСЯ НА МЕСТЕ (правка владельца 2026-07-30: «плохо
     * уезжает, быстро и быстро растворяется»).
     *
     * Одной длительности мало: прежний `fly` гасил непрозрачность ТЕМ ЖЕ прогрессом, что и
     * сдвиг, и по `cubicOut` она падала 1 → 0.2 за ~230 мс, пока карточка прошла едва половину
     * пути. Формально «улёт длился 640 мс», а человек видел растворение. Поэтому судим по
     * СВЯЗИ пути и непрозрачности: на середине пути карточка обязана быть ещё видимой.
     */
    // Берём ПЕРВЫЙ кадр, где карточка прошла половину пути, и смотрим её непрозрачность там.
    // (Не минимум по всей второй половине: у края карточка обязана гаснуть — это и есть уход.)
    const half = fly.peak / 2;
    const midFrame = fly.trace.find(([, x]) => x >= half);
    const midOpacity = midFrame ? midFrame[2] : null;
    check(
      'на середине пути карточка ещё ВИДНА (уезжает, а не растворяется)',
      midOpacity !== null && midOpacity >= 0.7,
      midOpacity === null
        ? 'кадра на середине пути не поймано — мерить нечем'
        : `непрозрачность на ${Math.round(half)}px: ${midOpacity}`,
    );

    check('консоль чиста', errors.length === 0, errors.slice(0, 3).join(' · '));
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`\n${failures === 0 ? '✅ ВСЁ ЗЕЛЁНОЕ' : `❌ ПРОВАЛОВ: ${failures}`}`);
process.exit(failures === 0 ? 0 : 1);

/**
 * QA-прогон bugs/57 (+ хвост bugs/56) живым браузером на стенде: КАРТОЧКА ЖДЁТ ФОТО.
 *
 * Канон 1.x (researches/12 → «Фотографии в карточках»): человек с фото появляется на экране
 * СРАЗУ с лицом — состояний «буква → пустой круг → лицо» не существует. Канон процесса —
 * plans/06: обе темы, две ширины, чтение консоли, скриншоты глазами.
 *
 * Метод: rAF-семплер в странице пишет состояние каждого лица НА КАЖДОМ КАДРЕ; Storage
 * замедлен роутом до продовой латентности — на голом localhost мерцание невидимо, и
 * проверка была бы зелёной от скорости стенда, а не от правильности кода.
 *
 * Проверяем:
 *   1) первый кадр карточки человека С фото — уже с байтами (обе темы × 390/1440);
 *   2) ни одного кадра «img без байтов» за весь таймлайн (пустой круг запрещён);
 *   3) люди БЕЗ фото буквой с первого кадра — они не ждут ничего;
 *   4) экономия: ровно 1 пара запросов Storage на лицо за сессию; повторный заход — 0;
 *   5) потолок ожидания: Storage медленнее потолка → экран ВСЁ РАВНО появляется,
 *      лицо доезжает фоном атомарной заменой буквы (letter → bytes, без EMPTY);
 *   6) консоль чиста.
 *
 * Требует поднятый `npm run stand`. Скриншоты — test-results/bug57/.
 * Запуск: node tools/verify-bug57.mjs
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const SHOTS = 'test-results/bug57';

/** Продовая латентность Storage: столько добавляем КАЖДОМУ запросу к эмулятору (9199). */
const STORAGE_DELAY_MS = 300;
/** «Storage медленнее потолка»: потолок предзагрузки 1500 мс, задержка одного раунда больше. */
const STALL_DELAY_MS = 2000;

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/**
 * rAF-семплер состояний лиц + сетевой лог Storage одними часами (performance.now страницы).
 * Storage SDK ходит и fetch-ем (байты), и XHR (метаданные) — патчим оба.
 */
const SAMPLER = `
  window.__trace = [];
  window.__net = [];
  const logNet = (url) => {
    if (String(url).includes('9199')) window.__net.push({ t: Math.round(performance.now()), url: String(url) });
  };
  const realFetch = window.fetch.bind(window);
  window.fetch = (...args) => { logNet(args[0]?.url ?? args[0]); return realFetch(...args); };
  const realOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) { logNet(url); return realOpen.call(this, method, url, ...rest); };

  const sample = () => {
    const rows = [...document.querySelectorAll('main .card')].map((c) => {
      const img = c.querySelector('.peek img');
      const letter = c.querySelector('span.ava');
      return {
        name: (c.querySelector('b')?.textContent ?? '').slice(0, 20).trim(),
        face: img ? (img.naturalWidth > 0 ? 'bytes' : 'EMPTY') : (letter ? 'letter' : null),
      };
    }).filter((row) => row.face !== null);
    window.__trace.push({ t: Math.round(performance.now()), rows });
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
`;

/** Первое зафиксированное состояние лица каждого человека и был ли у него кадр EMPTY. */
function digest(trace) {
  const first = new Map();
  const empties = new Map();
  const swaps = new Map(); // последовательность СМЕН состояний (для фоновой замены буквы)
  for (const frame of trace) {
    for (const row of frame.rows) {
      if (!row.name) continue;
      if (!first.has(row.name)) first.set(row.name, row.face);
      if (row.face === 'EMPTY') empties.set(row.name, (empties.get(row.name) ?? 0) + 1);
      const seq = swaps.get(row.name) ?? [];
      if (seq[seq.length - 1] !== row.face) {
        seq.push(row.face);
        swaps.set(row.name, seq);
      }
    }
  }
  return { first, empties, swaps };
}

async function person(browser, { theme, width, storageDelay }) {
  const context = await browser.newContext({ viewport: { width, height: 820 }, locale: 'ru-RU' });
  await context.addInitScript((value) => localStorage.setItem('ndim-theme', value), theme);
  await context.addInitScript((code) => eval(code), SAMPLER);
  const page = await context.newPage();
  if (storageDelay > 0) {
    await page.route(/:9199\//, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, storageDelay));
      await route.continue();
    });
  }
  const errors = [];
  page.on('pageerror', (event) => errors.push(String(event)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return { context, page, errors };
}

const waitFaces = (page) =>
  page.waitForFunction(
    () => [...document.querySelectorAll('main .card .peek img')].some((img) => img.naturalWidth > 0),
    { timeout: 20000 },
  );

const browser = await chromium.launch();
await mkdir(SHOTS, { recursive: true });

try {
  // ── 1–4: карточка ждёт фото · пустых кадров нет · буквы не ждут · экономия ──
  for (const [theme, width] of [['light', 390], ['light', 1440], ['dark', 390], ['dark', 1440]]) {
    console.log(`/relations · карточка ждёт фото (${theme}, ${width}, Storage +${STORAGE_DELAY_MS}мс):`);
    const { context, page, errors } = await person(browser, { theme, width, storageDelay: STORAGE_DELAY_MS });
    await page.goto(`${BASE}/relations`);
    await waitFaces(page);
    await page.waitForTimeout(500); // дать таймлайну утихнуть

    const { first, empties } = digest(await page.evaluate(() => window.__trace));
    // На стенде фото есть у Анны (сид bugs/14); Мария и Виктор — без фото.
    check('Анна появилась СРАЗУ с лицом', first.get('Анна') === 'bytes', `первый кадр: ${first.get('Анна')}`);
    check('ни одного кадра «пустой круг»', [...empties.values()].every((count) => count === 0), JSON.stringify([...empties]));
    check('Мария без фото — буквой с первого кадра', first.get('Мария') === 'letter', `первый кадр: ${first.get('Мария')}`);
    check('Виктор без фото — буквой с первого кадра', first.get('Виктор') === 'letter', `первый кадр: ${first.get('Виктор')}`);

    const net = await page.evaluate(() => window.__net);
    const meta = net.filter((event) => !event.url.includes('alt=media')).length;
    const bytes = net.filter((event) => event.url.includes('alt=media')).length;
    check('экономия: 1 запрос метаданных + 1 запрос байтов', meta === 1 && bytes === 1, `метаданных ${meta}, байтов ${bytes}`);
    check('лица людей без фото не запрашивались', net.every((event) => event.url.includes('stand-guest-anna')));

    // Повторный заход тем же человеком — лицо из кэша сессии, Storage не трогаем.
    await page.goto(`${BASE}/profile`);
    await page.waitForSelector('main .card', { timeout: 20000 });
    await page.goto(`${BASE}/relations`);
    await waitFaces(page);
    const netAfter = (await page.evaluate(() => window.__net)).length;
    check('повторный заход — 0 новых запросов Storage', netAfter === net.length, `было ${net.length}, стало ${netAfter}`);

    await page.screenshot({ path: `${SHOTS}/relations-${theme}-${width}.png`, fullPage: true });
    check('консоль чиста', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }

  // ── «Дом»: своё лицо в первом кадре (обе темы, одна ширина — механизм тот же) ──
  for (const theme of ['light', 'dark']) {
    console.log(`/profile · «Дом» появляется с лицом (${theme}, 390):`);
    const { context, page, errors } = await person(browser, { theme, width: 390, storageDelay: STORAGE_DELAY_MS });
    await page.goto(`${BASE}/profile`);
    await waitFaces(page);
    await page.waitForTimeout(500);

    const { first, empties } = digest(await page.evaluate(() => window.__trace));
    check('глава «Дома» появилась СРАЗУ с лицом', first.get('Николай') === 'bytes', `первый кадр: ${first.get('Николай')}`);
    check('ни одного кадра «пустой круг»', [...empties.values()].every((count) => count === 0));
    await page.screenshot({ path: `${SHOTS}/profile-${theme}-390.png`, fullPage: true });
    check('консоль чиста', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }

  // ── 5: потолок ожидания — медленный Storage НЕ превращает экран в вечный лоадер ──
  console.log(`/relations · Storage медленнее потолка (+${STALL_DELAY_MS}мс на раунд):`);
  {
    const { context, page, errors } = await person(browser, { theme: 'light', width: 390, storageDelay: STALL_DELAY_MS });
    const t0 = Date.now();
    await page.goto(`${BASE}/relations`);
    // Карточки обязаны появиться ДО того, как лицо успело бы скачаться (2 раунда по 2000мс):
    await page.waitForFunction(
      () => [...document.querySelectorAll('main .card b')].length >= 3,
      { timeout: 20000 },
    );
    const shownAfter = Date.now() - t0;
    check('экран появился, не дождавшись медленного фото', shownAfter < STALL_DELAY_MS * 2, `${shownAfter}мс`);

    // Лицо доезжает фоном и встаёт АТОМАРНО: буква → байты, без «пустого круга» между.
    await waitFaces(page);
    await page.waitForTimeout(300);
    const { empties, swaps } = digest(await page.evaluate(() => window.__trace));
    check('фоновая замена без «пустого круга»', [...empties.values()].every((count) => count === 0), JSON.stringify([...empties]));
    check(
      'смена состояний Анны: буква → байты',
      JSON.stringify(swaps.get('Анна')) === JSON.stringify(['letter', 'bytes']),
      JSON.stringify(swaps.get('Анна')),
    );
    check('консоль чиста', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nИтог: все проверки зелёные.' : `\nИтог: ❌ провалов — ${failures}`);
process.exit(failures === 0 ? 0 : 1);

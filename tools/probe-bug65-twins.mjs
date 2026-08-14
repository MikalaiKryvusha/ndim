/**
 * Разовый ПРИБОР ЗАМЕРА (не страж) для близнецов bugs/65: полноэкранные слои
 * `position: fixed; inset: 0` при живом `scrollbar-gutter: stable` (bugs/59).
 *
 * Печатает ширину каждого слоя против ширины ОКНА. Расхождение = непокрытая полоса.
 * Ничего не проверяет и не чинит — им снимаются числа «до» и «после».
 *
 * Запуск: npm run stand → node <этот файл>
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const WIDTH = 1440;
// Метка кадров: `node tools/probe-bug65-twins.mjs до` снимет `*-до.png`. Так «до» и «после»
// лежат рядом и сравниваются глазами — правый край и есть предмет спора.
const TAG = process.argv[2] ?? 'now';
const SHOTS = 'test-results/bug65-twins';

const browser = await chromium.launch();
await mkdir(SHOTS, { recursive: true });

/** Полоса шириной 120px у ПРАВОГО края — то место, где жила светлая щель. */
async function edge(page, name) {
  await page.screenshot({
    path: `${SHOTS}/${name}-${TAG}.png`,
    clip: { x: WIDTH - 120, y: 0, width: 120, height: 400 },
  });
}

async function open(theme) {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: 860 },
    locale: 'ru-RU',
  });
  await context.addInitScript((v) => localStorage.setItem('ndim-theme', v), theme);
  const page = await context.newPage();
  return { context, page };
}

function row(name, box, vp) {
  const w = box ? Math.round(box.width) : null;
  const gap = w === null ? null : vp - w;
  console.log(
    `  ${gap === 0 ? 'OK  ' : 'GAP '} ${name.padEnd(34)} ширина ${String(w).padStart(5)} · окно ${vp} · щель ${gap}`,
  );
  return gap;
}

let gaps = 0;
for (const theme of ['light', 'dark']) {
  console.log(`\n=== ${theme} · ${WIDTH} ===`);
  const { context, page } = await open(theme);

  await page.goto(`${BASE}/ru`);
  await page.waitForSelector('.field', { timeout: 20000 });
  const vp = page.viewportSize().width;

  gaps += row('.field (сеть-фон лендинга)', await page.locator('.field').boundingBox(), vp) ? 1 : 0;
  gaps += row('.vig (виньетка лендинга)', await page.locator('.vig').boundingBox(), vp) ? 1 : 0;

  // Оверлей полного портрета демо-блока: открывается кликом по лицу персонажа.
  // Лендинг анимирован непрерывно, и `scrollIntoViewIfNeeded` не дожидается «стабильности»
  // никогда — прокручиваем страницу сами и кликаем принудительно.
  const face = page.locator('.personas button.ava').first();
  await face.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForTimeout(400);
  await face.click({ force: true });
  await page.waitForSelector('.overlay', { timeout: 5000 });
  await page.waitForTimeout(300);
  gaps += row('.overlay (портрет демо)', await page.locator('.overlay').boundingBox(), vp) ? 1 : 0;
  await edge(page, `overlay-${theme}`);

  const spill = await page.evaluate(() => ({
    s: document.documentElement.scrollWidth,
    c: document.documentElement.clientWidth,
    inner: window.innerWidth,
  }));
  console.log(
    `       перелив: scrollWidth ${spill.s} · clientWidth ${spill.c} · innerWidth ${spill.inner}`,
  );

  // 🔑 РЕШАЮЩИЙ ЗАМЕР, а не разглядывание кадра: кто РЕАЛЬНО занимает крайний правый столбец.
  // Ширина слоя в числах могла бы совпасть, а точка всё равно принадлежать странице —
  // `elementFromPoint` отвечает на вопрос прямо (тот же приём, что в verify-bug40/bug105).
  const who = await page.evaluate(() => {
    const probe = (x) => {
      const el = document.elementFromPoint(x, 200);
      if (!el) return 'null';
      return el.closest('.overlay') ? '.overlay' : `${el.tagName.toLowerCase()}.${el.className}`;
    };
    return {
      edge: probe(window.innerWidth - 3),
      inner: probe(window.innerWidth - 40),
    };
  });
  console.log(`       крайний правый столбец: ${who.edge} · в 40px от края: ${who.inner}`);

  await context.close();
}

console.log(`\nСЛОЁВ СО ЩЕЛЬЮ: ${gaps}`);
await browser.close();

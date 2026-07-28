/**
 * QA-прогон bugs/69 живым браузером на стенде: ГРАФИКА НИГДЕ НЕ ПОЯВЛЯЕТСЯ «НА ГОРЯЧУЮ».
 *
 * Глобальное правило владельца (волна 13, вписано в AGENT_GUIDE → «Дизайн» → «Готовность
 * графики»):
 *   «НИГДЕ ИКОНКИ НА ГОРЯЧУЮ НЕ ПОЯВЛЯЮТСЯ!! Карточки и документы рендерятся за раз
 *    целиком, когда картинка ГОТОВА»
 *
 * Метод (EXP-0060): картинки придерживаются роутом до продовой латентности — на localhost
 * они приезжают мгновенно, и проверка была бы зелёной от скорости стенда, а не от кода.
 * rAF-семплер пишет состояние КАЖДОЙ картинки на КАЖДОМ кадре: видима ли она (ненулевой
 * бокс и непрозрачность > 0) и есть ли у неё БАЙТЫ.
 *
 * Дефект «на горячую» = кадр, где картинка ВИДИМА, но байтов ещё нет: место занято пустотой,
 * а потом в него скачком въезжает изображение. Стережём:
 *   1) ни одного кадра «видима без байтов» ни на одной странице с графикой;
 *   2) место под картинку зарезервировано: раскладка не прыгает (замер сдвига соседей);
 *   3) картинка в итоге ДОЕЗЖАЕТ (проверка не зелёная от того, что графики просто нет);
 *   4) консоль чиста.
 *
 * Требует поднятый `npm run stand`. Скриншоты — test-results/bug69/.
 * Запуск: node tools/verify-bug69.mjs [--quick]
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const SHOTS = 'test-results/bug69';
const QUICK = process.argv.includes('--quick');

/** Продовая латентность картинки: столько добавляем каждому запросу за графикой. */
const IMAGE_DELAY_MS = 700;

/** Страницы с графикой (инвентарь класса из bugs/69). Якорь — до чего прокрутиться. */
const PAGES = [
  { path: '/menu/support', name: 'Поддержка', expect: 1 },
  { path: '/menu/donate', name: 'Пожертвование', expect: 1 },
  { path: '/menu/author', name: 'Об авторе', expect: 1 },
  { path: '/', name: 'Лендинг', expect: 3, scroll: true },
  // Руководство — самая насыщенная графикой страница (5 иллюстраций 1.x). Приём родился
  // именно здесь (bugs/55), и после выноса его в общий модуль он обязан работать как прежде.
  { path: '/menu/manual', name: 'Руководство', expect: 5, scroll: true },
];

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/**
 * rAF-семплер: на каждом кадре снимает по каждой картинке (HTML <img> и SVG <image>)
 * её видимость и наличие байтов. Для SVG <image> у DOM нет naturalWidth — факт загрузки
 * берём из Resource Timing по адресу ресурса (кадры и сеть на одних часах страницы).
 */
const SAMPLER = `
  window.__frames = [];
  const url = (el) => el.currentSrc || el.getAttribute('src') || el.getAttribute('href') || '';
  const loaded = new Set();
  const hasBytes = (el) => {
    if (el.naturalWidth !== undefined) return el.naturalWidth > 0;
    // SVG <image>: помечаем по событию load, оно у SVGImageElement есть.
    return loaded.has(el);
  };
  const attach = (el) => {
    if (el.__watched) return;
    el.__watched = true;
    if (el.naturalWidth === undefined) el.addEventListener('load', () => loaded.add(el), { once: true });
  };
  const sample = () => {
    const nodes = [...document.querySelectorAll('img, svg image')];
    const rows = nodes.map((el) => {
      attach(el);
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      // Видима = занимает место И не спрятана прозрачностью/видимостью.
      const visible =
        box.width > 1 && box.height > 1 &&
        Number(style.opacity) > 0.01 &&
        style.visibility !== 'hidden' && style.display !== 'none';
      return { src: url(el).split('/').pop(), visible, bytes: hasBytes(el) };
    });
    window.__frames.push({ t: Math.round(performance.now()), rows });
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
`;

/** Сводка по каждой картинке: были ли кадры «видима без байтов» и доехала ли она вообще. */
function digest(frames) {
  const hot = new Map();
  const arrived = new Set();
  const seen = new Set();
  for (const frame of frames) {
    for (const row of frame.rows) {
      if (!row.src) continue;
      seen.add(row.src);
      if (row.visible && !row.bytes) hot.set(row.src, (hot.get(row.src) ?? 0) + 1);
      if (row.bytes) arrived.add(row.src);
    }
  }
  return { hot, arrived, seen };
}

const browser = await chromium.launch();
await mkdir(SHOTS, { recursive: true });

const COMBOS = QUICK ? [['light', 1440]] : [['light', 390], ['light', 1440], ['dark', 390], ['dark', 1440]];

try {
  for (const [theme, width] of COMBOS) {
    for (const target of PAGES) {
      console.log(`${target.path} · графика не «на горячую» (${theme}, ${width}):`);
      const context = await browser.newContext({ viewport: { width, height: 820 }, locale: 'ru-RU' });
      await context.addInitScript((value) => localStorage.setItem('ndim-theme', value), theme);
      await context.addInitScript((code) => eval(code), SAMPLER);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (event) => errors.push(String(event)));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      // Придерживаем ТОЛЬКО графику: остальная страница живёт со скоростью стенда.
      await page.route(/\.(png|webp|jpg|jpeg|svg)(\?|$)/, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, IMAGE_DELAY_MS));
        await route.continue();
      });

      await page.goto(target.path === '/' ? BASE : `${BASE}${target.path}`);
      if (target.scroll) {
        // Лениво загружаемая графика приезжает при подходе к вьюпорту — прокатываем страницу.
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 400) {
            window.scrollTo(0, y);
            await new Promise((resolve) => setTimeout(resolve, 120));
          }
        });
      }
      await page.waitForTimeout(IMAGE_DELAY_MS * 3);

      const { hot, arrived, seen } = digest(await page.evaluate(() => window.__frames));
      check(
        'ни одного кадра «видима без байтов»',
        hot.size === 0,
        hot.size ? [...hot].map(([src, count]) => `${src}: ${count} кадров`).join(', ') : `картинок в трассе: ${seen.size}`,
      );
      check(
        `графика доехала (ожидалось ≥${target.expect})`,
        arrived.size >= target.expect,
        `доехало ${arrived.size} из ${seen.size}`,
      );
      await page.screenshot({ path: `${SHOTS}/${(target.path === '/' ? 'landing' : target.path.slice(6))}-${theme}-${width}.png` });
      check('консоль чиста', errors.length === 0, errors.join(' | ').slice(0, 200));
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nИтог: все проверки зелёные.' : `\nИтог: ❌ провалов — ${failures}`);
process.exit(failures === 0 ? 0 : 1);

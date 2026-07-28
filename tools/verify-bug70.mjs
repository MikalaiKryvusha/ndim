/**
 * QA-прогон bugs/70 живым браузером на стенде: КАРТОЧКА «ЗАГРУЗКА» ВСЕГДА КОМПАКТНАЯ.
 *
 * Слово владельца (волна 13): «Виджет "Загрузка" иногда растягивает на всю ширину рабочей
 * области, например, при первичной загрузке на ПРОСТРАНСТВО — так быть не должно. Он всегда
 * лаконичный компактный».
 *
 * Метод: Firestore (эмулятор :8181) придерживается роутом — без этого состояние загрузки на
 * localhost живёт единицы миллисекунд, и замерять было бы нечего (тот же приём, что в
 * verify-bug57 со Storage). Меряем ГЕОМЕТРИЮ карточки против её контейнера на всех четырёх
 * экранах, где живёт лоадер: «Пространство», «Профиль», «Связи», «Измерения».
 *
 * Стережём (инвентарь класса — сдача ПО СТРОКАМ):
 *   1) ширина карточки ≤ потолка компактности (не «во всю рабочую область»);
 *   2) карточка заметно уже своего контейнера, когда тому есть куда растянуться;
 *   3) карточка отцентрована в контейнере (а не прижата к краю);
 *   4) консоль чиста.
 *
 * Требует поднятый `npm run stand`. Скриншоты — test-results/bug70/.
 * Запуск: node tools/verify-bug70.mjs
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const SHOTS = 'test-results/bug70';

/** Задержка каждому запросу к Firestore — чтобы состояние загрузки успеть застать и снять. */
const FIRESTORE_DELAY_MS = 1500;

/**
 * Потолок компактности. Содержимое карточки — слово «Загрузка» + кольцо 18px + отступы 16px:
 * это ~150px. Потолок 280px даёт запас на английский «Loading», иной шрифт и погрешность,
 * но втрое меньше рабочей области десктопа (1280px) — растянутую карточку он ловит.
 */
const COMPACT_MAX_PX = 280;

/** Экраны, где живёт карточка загрузки (инвентарь класса из плана бага). */
const SCREENS = [
  { path: '/space', name: 'Пространство' },
  { path: '/profile', name: 'Профиль' },
  { path: '/relations', name: 'Связи' },
  { path: '/dims', name: 'Измерения' },
];

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/**
 * Геометрия карточки загрузки и её контейнера. Контейнер — родитель карточки (обёртка экрана:
 * `.state`, `.loader` и т. п.), потому что растягивала карточку именно она.
 */
const MEASURE = () => {
  const card = document.querySelector('.load-card');
  if (!card) return null;
  const host = card.closest('main') ?? document.body;
  const box = card.getBoundingClientRect();
  // Ближайший блочный предок карточки — та самая ячейка раскладки, в которой она стоит.
  const cell = card.parentElement?.getBoundingClientRect() ?? host.getBoundingClientRect();
  const main = host.getBoundingClientRect();
  return {
    card: { x: Math.round(box.x), w: Math.round(box.width) },
    cell: { x: Math.round(cell.x), w: Math.round(cell.width) },
    main: { x: Math.round(main.x), w: Math.round(main.width) },
  };
};

const browser = await chromium.launch();
await mkdir(SHOTS, { recursive: true });

try {
  for (const [theme, width] of [['light', 390], ['light', 1440], ['dark', 390], ['dark', 1440]]) {
    for (const screen of SCREENS) {
      console.log(`${screen.path} · карточка «Загрузка» (${theme}, ${width}):`);
      const context = await browser.newContext({ viewport: { width, height: 820 }, locale: 'ru-RU' });
      await context.addInitScript((value) => localStorage.setItem('ndim-theme', value), theme);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (event) => errors.push(String(event)));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      // Firestore придерживаем: без этого лоадер мелькает и замер невозможен.
      await page.route(/:8181\//, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, FIRESTORE_DELAY_MS));
        await route.continue();
      });

      await page.goto(screen.path === '/' ? BASE : `${BASE}${screen.path}`);
      await page.waitForSelector('.load-card', { timeout: 20000 });
      const geometry = await page.evaluate(MEASURE);

      if (geometry === null) {
        check('карточка «Загрузка» найдена', false, 'селектор .load-card не нашёлся');
      } else {
        const { card, cell, main } = geometry;
        check(
          `ширина карточки ≤ ${COMPACT_MAX_PX}px`,
          card.w <= COMPACT_MAX_PX,
          `карточка ${card.w}px, ячейка ${cell.w}px, рабочая область ${main.w}px`,
        );
        // Там, где ячейке есть куда растянуться, карточка обязана быть заметно уже неё.
        if (cell.w > COMPACT_MAX_PX + 40) {
          check('карточка уже своей ячейки', card.w < cell.w - 20, `${card.w}px против ${cell.w}px`);
          const cardCenter = card.x + card.w / 2;
          const cellCenter = cell.x + cell.w / 2;
          check(
            'карточка отцентрована в ячейке',
            Math.abs(cardCenter - cellCenter) <= 2,
            `центр карточки ${Math.round(cardCenter)}, центр ячейки ${Math.round(cellCenter)}`,
          );
        }
      }

      await page.screenshot({ path: `${SHOTS}/${screen.path.slice(1)}-${theme}-${width}.png` });
      check('консоль чиста', errors.length === 0, errors.join(' | ').slice(0, 200));
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nИтог: все проверки зелёные.' : `\nИтог: ❌ провалов — ${failures}`);
process.exit(failures === 0 ? 0 : 1);

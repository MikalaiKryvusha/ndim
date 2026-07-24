/**
 * QA-прогон bugs/49 на стенде живым браузером: рельс навигации на десктопе ПРИБИТ —
 * скролл длинной страницы в самый низ не увозит лого и кнопки с экрана.
 * Канон процесса — plans/06. Требует `npm run stand`. Скриншоты — test-results/bug49/.
 *
 * Запуск: node tools/verify-bug49.mjs
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const SHOTS = 'test-results/bug49';

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch();
await mkdir(SHOTS, { recursive: true });

try {
  for (const theme of ['light', 'dark']) {
    for (const width of [1024, 1440]) {
      console.log(`bugs/49 · прибитый рельс (${theme}, ширина ${width}):`);
      const context = await browser.newContext({
        viewport: { width, height: 800 },
        locale: 'ru-RU',
      });
      await context.addInitScript((value) => localStorage.setItem('ndim-theme', value), theme);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });

      // «Измерения» — самая длинная лента; каталог стенда даёт скролл с запасом.
      await page.goto(`${BASE}/dims`);
      const rail = page.locator('nav.rail');
      await rail.waitFor({ timeout: 20000 });
      await page.locator('.dim-card, .card').first().waitFor({ timeout: 20000 });

      const before = await rail.boundingBox();
      check('до скролла: рельс у верха', before !== null && before.y === 0, `y=${before?.y}`);

      // В самый низ — и дать ленте догрузиться (прогрессивная подгрузка bugs/13).
      for (let i = 0; i < 4; i += 1) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(400);
      }
      const scrollY = await page.evaluate(() => window.scrollY);
      check('страница реально длинная (скролл случился)', scrollY > 600, `scrollY=${scrollY}`);

      const after = await rail.boundingBox();
      check('после скролла: рельс остался у верха (y=0)', after !== null && after.y === 0, `y=${after?.y}`);

      const menuItem = rail.locator('a', { hasText: /Меню|Menu/ });
      check('кнопка «Меню» во вьюпорте', await menuItem.isVisible());
      const menuBox = await menuItem.boundingBox();
      check(
        'кнопка «Меню» в пределах экрана',
        menuBox !== null && menuBox.y >= 0 && menuBox.y + menuBox.height <= 800,
        `y=${menuBox?.y}`,
      );

      await page.screenshot({ path: `${SHOTS}/dims-bottom-${theme}-${width}.png` });
      check('ошибок консоли нет', errors.length === 0, errors.slice(0, 2).join(' | '));
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nВсе проверки bugs/49 зелёные.' : `\n❌ Провалов: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

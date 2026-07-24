/**
 * QA-прогон bugs/42 на стенде живым браузером: виджет «Сервер синхронизации» экрана
 * «Пространство» показывает три честных блока (Статус · Полная · Частичная), как в 1.x.
 * Канон процесса — plans/06. Требует `npm run stand`. Скриншоты — test-results/bug42/.
 *
 * Запуск: node tools/verify-bug42.mjs
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const SHOTS = 'test-results/bug42';

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function person(browser, { theme, width = 390 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU' });
  if (theme) await context.addInitScript((value) => localStorage.setItem('ndim-theme', value), theme);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return { context, page, errors };
}

const browser = await chromium.launch();
await mkdir(SHOTS, { recursive: true });

try {
  for (const theme of ['light', 'dark']) {
    for (const width of [390, 1440]) {
      console.log(`bugs/42 · виджет сервера (${theme}, ширина ${width}):`);
      const { context, page, errors } = await person(browser, { theme, width });
      await page.goto(`${BASE}/space`);
      const widget = page.locator('.card.w-server');
      await widget.waitFor({ timeout: 20000 });

      // Вычислитель стенда (цикл 15 с) мог ещё не отчитаться блоками — дождаться полной.
      await page
        .locator('.card.w-server .sub-h', { hasText: 'Полная синхронизация' })
        .waitFor({ timeout: 30000 });

      const subHeads = await widget.locator('.sub-h').allInnerTexts();
      check(
        'три блока в порядке 1.x',
        JSON.stringify(subHeads) ===
          JSON.stringify(['Статус', 'Полная синхронизация', 'Частичная синхронизация']),
        subHeads.join(' · '),
      );

      const labels = await widget.locator('.kv .k').allInnerTexts();
      for (const expected of [
        'Текущее состояние',
        'Последний запуск',
        'Следующий цикл',
        'Последняя успешная',
        'Пользователей проверено',
        'Из них обновлено',
        'Связей рассчитано',
        'Запланированная',
      ]) {
        check(`строка «${expected}» на месте`, labels.includes(expected));
      }
      check(
        'легаси-строки «Пользователей синхронизировано» больше нет',
        !labels.includes('Пользователей синхронизировано'),
      );

      // «Запланированная» полная — не раньше чем через 12 часов от «сейчас» стенда:
      // раньше тут стоял следующий МИНУТНЫЙ цикл, и это была главная ложь виджета.
      const scheduled = await widget
        .locator('.kv', { has: page.locator('.k', { hasText: 'Запланированная' }) })
        .locator('.v')
        .innerText();
      const nextCycle = await widget
        .locator('.kv', { has: page.locator('.k', { hasText: 'Следующий цикл' }) })
        .locator('.v')
        .innerText();
      check('«Запланированная» ≠ «Следующий цикл»', scheduled !== nextCycle, `${scheduled} vs ${nextCycle}`);

      await page.screenshot({ path: `${SHOTS}/space-server-${theme}-${width}.png`, fullPage: false });
      check('консоль чиста', errors.length === 0, errors.join(' | ').slice(0, 200));
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nИтог: все проверки зелёные.' : `\nИтог: ПРОВАЛОВ — ${failures}.`);
process.exit(failures === 0 ? 0 : 1);

/**
 * QA-прогон bugs/96 на стенде: ОТМЕНА ОЦЕНКИ ВО ВРЕМЯ УЛЁТА НЕ ОСТАВЛЯЕТ КАРТОЧКУ ОБРЕЗАННОЙ.
 *
 * Дефект (аудит 2026-07-31): commit() прибивает высоту улетающей карточки inline-стилями
 * (пин из bugs/80), снимая их только на пути ошибки. Отмена в первые ~0.7 с ВОСКРЕШАЕТ тот
 * же DOM-узел (Svelte держит outro-элементы each-блока по ключу) — и карточка навсегда
 * стояла с height:246px + overflow:hidden: раскрытие описания обрезалось.
 *
 * Что сторожится и почему именно так:
 *  1. КОНТРОЛЬ ПРИБОРА (EXP-0065): сразу после «Сохранить сейчас» пин ОБЯЗАН СТОЯТЬ
 *     (style.height непуст). Перестань commit() пинить — «пин снят» ниже было бы вакуумом.
 *  2. Тап «Отменить оценку» уходит В ОКНО УЛЁТА (тост появляется в тот же тик, улёт 700 мс).
 *  3. После возврата у карточки НЕТ inline height и overflow — прямой признак дефекта,
 *     а не производный (высоту карточки решает контент, сравнивать её с соседями нельзя).
 *  4. Консоль чиста (узкий фильтр отказов правил, канон verify-bug84/87).
 *
 * Требует поднятый `npm run stand`. Запуск: node tools/verify-bug96.mjs
 *
 * Запуск: node tools/verify-bug96.mjs
 */

import { chromium } from '@playwright/test';

const STAND = 'http://localhost:5173';
const EXPECTED = /permission|insufficient|Missing or insufficient/i;
const CONFIGS = [
  { theme: 'light', w: 390, h: 844 },
  { theme: 'dark', w: 1440, h: 900 },
];

let failures = 0;
let passed = 0;
function check(name, ok, detail = '') {
  ok ? passed++ : failures++;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch();

for (const cfg of CONFIGS) {
  const tag = `${cfg.theme}/${cfg.w}`;
  console.log(`\n— конфигурация ${tag} —`);

  const ctx = await browser.newContext({ viewport: { width: cfg.w, height: cfg.h } });
  await ctx.addInitScript((t) => localStorage.setItem('ndim-theme', t), cfg.theme);
  const page = await ctx.newPage();
  const noise = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !EXPECTED.test(m.text())) noise.push(m.text());
  });

  await page.goto(`${STAND}/dims`, { waitUntil: 'domcontentloaded' });
  await page.locator('article.dim').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1200);

  const dimId = await page.locator('article.dim').first().getAttribute('data-dim');
  const card = page.locator(`article.dim[data-dim="${dimId}"]`);

  // Оценка → «Сохранить сейчас» → в ту же секунду «Отменить оценку» (окно улёта 700 мс).
  await card.locator('.stars .st[aria-label="7"]').click();
  await card.locator('.countdown .now').click();

  // Контроль прибора: пин стоит (commit() ставит его синхронно, ДО всех await).
  const pinnedHeight = await card.evaluate((el) => el.style.height);
  check(`${tag}: контроль — пин ПОСТАВЛЕН на улетающей карточке`, pinnedHeight !== '', pinnedHeight);

  await page.getByRole('button', { name: 'Отменить оценку' }).click();
  await page.waitForTimeout(1600); // улёт (700) + возврат + перерисовка

  await card.waitFor({ state: 'visible', timeout: 5000 });
  const style = await card.evaluate((el) => ({ height: el.style.height, overflow: el.style.overflow }));
  check(`${tag}: карточка вернулась в ленту`, await card.isVisible());
  check(`${tag}: inline-высота снята`, style.height === '', style.height || 'пусто');
  check(`${tag}: inline-overflow снят`, style.overflow === '', style.overflow || 'пусто');
  check(`${tag}: консоль чиста`, noise.length === 0, noise.join(' | '));

  await ctx.close();
}

await browser.close();

console.log(`\nИтог: ${passed} зелёных, ${failures} провалов`);
process.exit(failures === 0 ? 0 : 1);

/**
 * СТРАЖ ЦЕЛИ РАСКРЫТИЯ КАРТОЧКИ СВЯЗИ — `bugs/104` (паритет с 1.x: в 1.x аватар жил
 * в `<summary>`, целью была ВСЯ строка).
 *
 * Стережёт финальное поведение (путь «б-гибрид», решение владельца 2026-07-31):
 *   1. свёрнутая карточка: цель раскрытия — ≥99 % строки `.head` (замер, а не впечатление);
 *   2. 🔑 НАСТОЯЩИЙ ТАП по площади ФОТО в свёрнутой карточке РАСКРЫВАЕТ её, а лайтбокс
 *      НЕ открывается (`bugs/79`: тап и клик на этом проекте ведут себя по-разному);
 *   3. в РАСКРЫТОЙ карточке фото — снова кнопка: клик открывает портрет во весь экран,
 *      карточка при этом НЕ сворачивается (stopPropagation), Esc закрывает портрет;
 *   4. клик по имени в раскрытой карточке сворачивает её;
 *   5. клавиатура: Enter на сфокусированной кнопке раскрывает (нативная кнопка, не div);
 *   6. обе темы × 390/1440; консоль без ошибок.
 *
 * Запуск: `npm run stand` → `node tools/verify-bug104.mjs`
 * Карточка для проверки — гость С ФОТО (Анна из сида, `bugs/14`).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const OUT = 'test-results/bug104';
mkdirSync(OUT, { recursive: true });

let pass = 0;
const fails = [];
function check(ok, what, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ✅ ${what}`);
  } else {
    fails.push(`${what}${detail ? ' — ' + detail : ''}`);
    console.log(`  ❌ ${what}${detail ? ' — ' + detail : ''}`);
  }
}

/** Карточка Анны (гость с фото) — по имени в строке заголовка. */
async function annaCard(page) {
  const card = page.locator('.card', { has: page.locator('.who b', { hasText: 'Анна' }) }).first();
  await card.waitFor({ timeout: 20000 });
  return card;
}

const browser = await chromium.launch();
try {
  for (const [theme, width] of [['light', 390], ['dark', 1440]]) {
    const tag = `${theme}-${width}`;
    console.log(`\nЦель раскрытия (${theme}, ${width}):`);
    const ctx = await browser.newContext({
      viewport: { width, height: 860 },
      locale: 'ru-RU',
      hasTouch: true, // настоящий тап, не click() — bugs/79
    });
    await ctx.addInitScript((v) => localStorage.setItem('ndim-theme', v), theme);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    await page.goto(`${BASE}/relations`, { waitUntil: 'domcontentloaded' });
    const card = await annaCard(page);
    await page.waitForTimeout(1200); // лица предзагружаются — ждём фото в кнопке

    // ── 1 · замер: цель — вся строка ────────────────────────────────────────────────────
    const m = await card.evaluate((node) => {
      const head = node.querySelector('.head');
      const target = node.querySelector('.head .who');
      if (!head || !target) return null;
      const h = head.getBoundingClientRect();
      const t = target.getBoundingClientRect();
      return { share: (t.width * t.height) / (h.width * h.height), headH: h.height };
    });
    check(m !== null && m.share >= 0.99, 'цель раскрытия ≥99 % строки',
      m ? `${(m.share * 100).toFixed(1)} %` : 'строка не найдена');

    // ── 2 · настоящий ТАП по площади фото в свёрнутой → раскрытие, БЕЗ лайтбокса ────────
    const photo = card.locator('.head img.ava').first();
    check(await photo.count() === 1, 'в свёрнутой карточке лицо — картинка внутри кнопки');
    await photo.tap();
    await page.waitForTimeout(600);
    check(await card.locator('.deep').count() === 1, '🔑 тап по ФОТО раскрыл карточку (bugs/104)');
    check(await page.locator('.lightbox').count() === 0, 'лайтбокс при этом НЕ открылся');
    await page.screenshot({ path: `${OUT}/expanded-${tag}.png`, fullPage: false });

    // ── 3 · в раскрытой: фото — кнопка портрета; карточка не сворачивается ──────────────
    const peek = card.locator('.head button.peek');
    check(await peek.count() === 1, 'в раскрытой карточке фото — снова кнопка портрета');
    await peek.tap();
    await page.waitForTimeout(600);
    check(await page.locator('.lightbox').count() === 1, 'портрет открылся во весь экран (из раскрытой — PENDING bugs/104)');
    check(await card.locator('.deep').count() === 1, 'карточка при этом НЕ свернулась (stopPropagation)');
    await page.screenshot({ path: `${OUT}/lightbox-${tag}.png`, fullPage: false });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    check(await page.locator('.lightbox').count() === 0, 'Esc закрыл портрет');

    // ── 4 · имя в раскрытой сворачивает ─────────────────────────────────────────────────
    await card.locator('.who').tap();
    await page.waitForTimeout(600);
    check(await card.locator('.deep').count() === 0, 'тап по имени свернул карточку');

    // ── 5 · клавиатура: Enter на кнопке раскрывает (нативная кнопка) ────────────────────
    await card.locator('.who').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    check(await card.locator('.deep').count() === 1, 'Enter на сфокусированной кнопке раскрыл');
    await card.locator('.who').press('Enter');
    await page.waitForTimeout(400);

    check(errors.length === 0, 'консоль чиста', errors.slice(0, 2).join(' · '));
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(`\n${fails.length === 0 ? '✅' : '❌'} verify-bug104: пройдено ${pass}, провалов ${fails.length}`);
if (fails.length) {
  for (const f of fails) console.log('  · ' + f);
  process.exit(1);
}

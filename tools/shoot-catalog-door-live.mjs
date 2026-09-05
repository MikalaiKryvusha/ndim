/**
 * КАДРЫ ДВЕРИ КАРТОЧКИ НА ЖИВОМ КОНТУРЕ — обе темы × две ширины (`plans/75` Ш4, приёмка).
 *
 * ЗАЧЕМ. Приёмка двери названа планом кадрами: «стейдж → кадры обеих тем × 390/1440 → бой». Дверь
 * уехала в бой 2026-09-05 вместе со стволом, кадров на бою никто не снимал. Этот прибор снимает
 * карточку и крупный план двери в четырёх сочетаниях, НИЧЕГО НЕ НАЖИМАЯ: ни гостя, ни оценки,
 * ни шага воронки (метка `ndim-probe` ставится до первой навигации). Живой проход дверью — у
 * `probe-live-door-object.mjs`, там цена названа.
 *
 * Запуск:  node tools/shoot-catalog-door-live.mjs [--base https://ndim-stage.web.app] [--slug <путь карточки>]
 *          бой — только с явным --prod.
 * ВЫХОД:   test-results/catalog-door-live/<тема>-<ширина>-{card,door}.png
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { markProbeContext } from './lib/probe-mark.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i === -1 ? d : argv[i + 1]; };
const BASE = opt('--base', 'https://ndim-stage.web.app').replace(/\/$/, '');
const SLUG = opt('--slug', '/ru/dimension/stanford-s-sapolsky-on-depression-in-u-s-ccwi7h6b');
if (BASE.includes('ndimspace.app') && !argv.includes('--prod')) { console.error('⛔ бой — только с явным --prod'); process.exit(2); }
const OUT = resolve('test-results/catalog-door-live'); mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
let failures = 0;
for (const theme of ['light', 'dark']) for (const width of [390, 1440]) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, locale: 'ru-RU', colorScheme: theme });
  await markProbeContext(context);
  await context.addInitScript((t) => { try { localStorage.setItem('ndim-theme', t); } catch {} }, theme);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + SLUG, { waitUntil: 'networkidle' });
  const door = page.locator('.door').first();
  const ok = await door.count();
  await page.screenshot({ path: resolve(OUT, `${theme}-${width}-card.png`), fullPage: true });
  if (ok) { await door.scrollIntoViewIfNeeded(); await door.screenshot({ path: resolve(OUT, `${theme}-${width}-door.png`) }); }
  else failures++;
  const box = ok ? await door.boundingBox() : null;
  console.log(`${ok ? '✅' : '❌'} ${theme} ${width}: дверь ${ok ? 'есть' : 'НЕ НАЙДЕНА'}${box ? ` · ${Math.round(box.width)}×${Math.round(box.height)}` : ''} · ошибок страницы ${errors.length}`);
  if (errors.length) { failures++; console.log('   ' + errors.join('\n   ')); }
  await context.close();
}
await browser.close();
console.log(`кадры: ${OUT}`);
process.exit(failures ? 1 : 0);

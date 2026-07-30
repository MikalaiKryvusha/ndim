/**
 * Иконки приложения из УТВЕРЖДЁННОГО знака — генератор (`plans/07` B2, `bugs/58`).
 *
 * ── ПОЧЕМУ ГЕНЕРАТОР, А НЕ НАРИСОВАННЫЕ ФАЙЛЫ ─────────────────────────────────────────────
 * Знак бренда — N-сеть, форма канонична (лого 1.x, вариант V3 «Диагональ», утверждён владельцем
 * 2026-07-11) и живёт ОДНИМ исходником `static/favicon.svg`. Нарисованные руками PNG разошлись бы
 * с ним при первой же правке цвета — и разошлись бы молча. Здесь растр получается из того же
 * файла, что и фавикон: правится знак — перегенерируются иконки.
 *
 * ⚠️ Форму знака агент не меняет (память проекта: «форма канонична, освежать только цветом»).
 * Этот инструмент только растеризует и добавляет ПОЛЯ для maskable-варианта.
 *
 * ── ЧТО ДЕЛАЕТ ────────────────────────────────────────────────────────────────────────────
 *   icon-192.png, icon-512.png       — обычные иконки (`purpose: any`), знак во всю площадь;
 *   icon-maskable-512.png            — с безопасной зоной: Android обрезает иконку под круг,
 *                                      каплю или квадрат, и знак не должен обрезаться. Канон
 *                                      индустрии — держать смысл в центральных ~80%
 *                                      (`researches/19`, web.dev → Web app manifest);
 *   apple-touch-icon.png (180×180)   — iOS манифест не читает, иконку берёт из `<link>`.
 *
 * Растеризуем Chromium'ом (Playwright уже в проекте) — отдельной библиотеки ради четырёх
 * картинок не заводим (Оккам).
 *
 * Запуск: node tools/make-pwa-icons.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const SVG = readFileSync('static/favicon.svg', 'utf8');
const OUT = 'static/img/app';
mkdirSync(OUT, { recursive: true });

/** Фон карточки знака — тот же, что в самом SVG (тёмный киберпанк `--bg`). */
const BRAND_BG = '#060b14';

/**
 * Страница-подложка: знак масштабируется под нужный размер, `padding` даёт безопасную зону.
 * Скругление у обычных иконок берётся из самого SVG (`rx=22`), у maskable — НЕ нужно: маску
 * рисует система, а наш скруглённый угол под её маской дал бы двойное скругление.
 */
function page(size, { safeZone = 0, square = false } = {}) {
  const inner = Math.round(size * (1 - safeZone * 2));
  const svg = square ? SVG.replace('rx="22"', 'rx="0"') : SVG;
  return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:${square ? BRAND_BG : 'transparent'};}
    .wrap{width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;}
    svg{width:${inner}px;height:${inner}px;display:block;}
  </style><div class="wrap">${svg}</div>`;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
const tab = await ctx.newPage();

/** Один файл: открыть подложку нужного размера и снять её без прозрачного фона вокруг. */
async function shoot(name, size, options) {
  await tab.setViewportSize({ width: size, height: size });
  await tab.setContent(page(size, options));
  await tab.waitForTimeout(120); // градиенту дать примениться
  await tab.locator('.wrap').screenshot({ path: `${OUT}/${name}`, omitBackground: !options?.square });
  console.log(`  ✅ ${OUT}/${name} — ${size}×${size}`);
}

console.log('Иконки приложения из static/favicon.svg:');
await shoot('icon-192.png', 192);
await shoot('icon-512.png', 512);
// Безопасная зона 10% с каждой стороны: знак занимает центральные 80% — канон maskable.
await shoot('icon-maskable-512.png', 512, { safeZone: 0.1, square: true });
await shoot('apple-touch-icon.png', 180);

await browser.close();
console.log('\nГотово. Манифест ссылается на эти файлы — руками их не правят.');

#!/usr/bin/env node
/**
 * lockup.mjs — плашка-логотип NDim для роликов: знак и название на плашке, PNG с прозрачным фоном.
 *
 * ЗАЧЕМ. Интервью №088 В1, слово владельца 2026-09-14: «*как-то одиноко иконка приложения вверху справа, без подписи
 * названия.... Нужно бы плашку-логотип показывать, с лого и названием. И где-то может по центру, но чтобы лицо не
 * перекрыло*». Вид плашки — брендовое решение: здесь рисуются варианты, выбирает владелец (канон «Дизайн»).
 *
 * ИЗ ЧЕГО. Знак — `static/favicon.svg` (утверждённая «Диагональ», форму не трогаем); цвета и шрифт — продукта
 * (`src/routes/+layout.svelte`: тёмный фон #060b14, светлая «Бумага» #f6f8fb, шрифт system-ui / Segoe UI). Рисует
 * Chromium, чтобы SVG и кириллица легли так же, как в продукте; ffmpeg SVG не читает.
 *
 * Запуск: node tools/video/lockup.mjs [--out <папка>]   → row-dark.png · row-light.png · stack-dark.png · corner-dark.png
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const BRAND_NAME = 'Пространство NDim';

/** Варианты плашки: размеры в пикселях кадра 1080×1920. */
export const LOCKUPS = {
  'row-dark': { layout: 'row', icon: 76, font: 46, bg: 'rgba(6,11,20,0.86)', color: '#ffffff', pad: '16px 34px 16px 18px', radius: 30 },
  'row-light': { layout: 'row', icon: 76, font: 46, bg: 'rgba(246,248,251,0.94)', color: '#10233a', pad: '16px 34px 16px 18px', radius: 30 },
  'stack-dark': { layout: 'stack', icon: 116, font: 44, bg: 'rgba(6,11,20,0.86)', color: '#ffffff', pad: '26px 40px 22px', radius: 34 },
  'corner-dark': { layout: 'row', icon: 58, font: 34, bg: 'rgba(6,11,20,0.86)', color: '#ffffff', pad: '12px 26px 12px 12px', radius: 24 },
};

/** HTML одной страницы со всеми вариантами; каждый — элемент со своим id. */
export function lockupHtml(svg, variants = LOCKUPS, name = BRAND_NAME) {
  const icon = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const blocks = Object.entries(variants).map(([id, v]) => `
    <div id="${id}" class="plate ${v.layout}" style="background:${v.bg};color:${v.color};padding:${v.pad};border-radius:${v.radius}px">
      <img src="${icon}" width="${v.icon}" height="${v.icon}" alt="">
      <span style="font-size:${v.font}px">${name}</span>
    </div>`).join('');
  return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;background:transparent}
    body{display:flex;flex-direction:column;align-items:flex-start;gap:40px;padding:40px}
    .plate{display:inline-flex;align-items:center;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-weight:600;letter-spacing:.2px;white-space:nowrap}
    .plate.row{flex-direction:row;gap:18px}
    .plate.stack{flex-direction:column;gap:14px}
    .plate img{display:block}
  </style>${blocks}`;
}

export async function renderLockups(outDir, { root = new URL('../../', import.meta.url) } = {}) {
  const { chromium } = await import('@playwright/test');
  mkdirSync(outDir, { recursive: true });
  const svg = readFileSync(new URL('static/favicon.svg', root), 'utf8');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1400 }, deviceScaleFactor: 1 });
    await page.setContent(lockupHtml(svg));
    await page.evaluate(() => document.fonts.ready);
    const files = [];
    for (const id of Object.keys(LOCKUPS)) {
      const file = join(outDir, `${id}.png`);
      await page.locator(`#${id}`).screenshot({ path: file, omitBackground: true });
      files.push(file);
    }
    return files;
  } finally {
    await browser.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const i = process.argv.indexOf('--out');
  const out = i >= 0 ? process.argv[i + 1] : join(process.env.NDIM_STUDIO_DIR || 'D:\\work\\ai_sandbox\\ndim-studio', 'brand');
  renderLockups(out)
    .then((files) => files.forEach((f) => console.log(`✅ ${f}`)))
    .catch((e) => {
      console.error(`🔴 ${e.message}`);
      process.exitCode = 1;
    });
}

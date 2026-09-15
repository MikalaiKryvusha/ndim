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
 * Запуск: node tools/video/lockup.mjs [--out <папка>]   → row-dark.png · row-light.png · stack-dark.png · corner-dark.png · outro-card.png
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

/**
 * Концовка ролика: знак КРУПНО с ореолом на тёмном фоне и название под ним — кадр 1080×1920.
 *
 * ЗАЧЕМ. Слово владельца 2026-09-15: «*В конце ролика на 1...2 секунды на черном фоне нужно показать крупно
 * квадратный логотип черный с синим ареолом (где-то такой рисовали, поищи) и под ним подпись Пространство NDim*».
 * «Рисовали» — это вариант **В4 «Ореол»** из `design/sign-dark-mockups.html`: заливка плитки не трогается,
 * силуэт рисует СВЕТ — мягкое свечение бирюзой из-под краёв.
 *
 * 🔴 ГЕОМЕТРИЯ ЗНАКА НЕ ПЕРЕРИСОВЫВАЕТСЯ. Она канонична (лого V3 «Диагональ», утверждено 2026-07-11,
 * «освежать можно только цветом») и живёт в `static/favicon.svg`. Ореол ДОБАВЛЯЕТСЯ к нему числами макета
 * В4 — размытие `stdDeviation 5`, цвет `rgba(63,217,255,0.30)`, поле viewBox расширено на 10 единиц, —
 * а не рисуется заново. Если разметка favicon.svg изменится, `haloSvg` упадёт с именем пропавшего куска,
 * а не молча отдаст другой знак.
 */
export const OUTRO = { width: 1080, height: 1920, sign: 640, font: 62, gap: 56, bg: '#060b14', color: '#eef6ff' };

/** favicon.svg → тот же знак с ореолом В4. Каждая замена обязана сработать: иначе знак вышел бы другим. */
export function haloSvg(svg) {
  const steps = [
    ['viewBox="0 0 96 96"', 'viewBox="-10 -10 116 116"'],
    ['</defs>', '<filter id="halo" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter></defs>'],
    ['<rect width="96" height="96" rx="22" fill="#060b14"/>',
      '<rect width="96" height="96" rx="22" fill="rgba(63,217,255,0.30)" filter="url(#halo)"/><rect width="96" height="96" rx="22" fill="#060b14"/>'],
  ];
  return steps.reduce((s, [from, to]) => {
    if (!s.includes(from)) throw new Error(`в знаке нет куска «${from}» — favicon.svg изменился, ореол В4 собрать нельзя`);
    return s.replace(from, to);
  }, svg);
}

/** Страница кадра концовки: знак с ореолом по центру, название под ним. */
export function outroHtml(svg, o = OUTRO, name = BRAND_NAME) {
  return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;background:${o.bg}}
    body{width:${o.width}px;height:${o.height}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${o.gap}px}
    svg{width:${o.sign}px;height:${o.sign}px;display:block}
    p{margin:0;color:${o.color};font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:${o.font}px;font-weight:600;letter-spacing:.4px}
  </style>${haloSvg(svg)}<p>${name}</p>`;
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
    // Кадр концовки — своя страница размером с кадр ролика, без прозрачности: он и есть фон.
    const outro = join(outDir, 'outro-card.png');
    const cardPage = await browser.newPage({ viewport: { width: OUTRO.width, height: OUTRO.height }, deviceScaleFactor: 1 });
    await cardPage.setContent(outroHtml(svg));
    await cardPage.evaluate(() => document.fonts.ready);
    await cardPage.screenshot({ path: outro });
    files.push(outro);
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

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
 * Запуск: node tools/video/lockup.mjs [--out <папка>] [--frame 1440x2560] [--links] [--suffix -1440]
 *   → плашки (с `--links` — плашки СО ССЫЛКОЙ, четыре варианта) и outro-card.png под размер кадра
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

export const SITE_LINK = 'ndimspace.app';

/**
 * Плашка СО ССЫЛКОЙ — заказ владельца 2026-09-19: «*лого плашку со ссылкой*».
 *
 * Утверждённая форма плашки (тёмная, в строку, интервью №089) остаётся основой; вопрос только в том, ГДЕ
 * на ней стоит адрес. Это видимое брендовое решение, поэтому вариантов четыре и выбирает владелец
 * (`AGENT_GUIDE.md` → «Дизайн — правило четырёх макетов»), а не агент.
 *
 * Общее у всех четырёх: знак и цвета продукта не трогаются, адрес пишется без `https://` и без `www`
 * (так он и живёт в подписях роликов), плашка остаётся ОДНОЙ строкой по высоте настолько, насколько
 * позволяет вариант, — полоса между подбородком и субтитрами узкая.
 */
export const LINK_LOCKUPS = {
  // 🔴 ДЕЙСТВУЮЩАЯ ФОРМА — слово владельца 2026-09-19, посмотрев первую сборку: «*в плашке ссылку не справа
  // нужно показывать, а ниже с центрированием*». Верхняя строка — знак и название (утверждённая форма №089),
  // под ней ссылка, отцентрованная по ВСЕЙ ширине плашки, а не по колонке текста.
  'link-below': { layout: 'below', icon: 76, font: 46, linkFont: 44, linkColor: '#3fd9ff',
    bg: 'rgba(6,11,20,0.86)', color: '#ffffff', pad: '16px 34px 18px 18px', radius: 30, rowGap: 6 },
  'link-v1-row': { layout: 'row', icon: 76, font: 46, linkFont: 46, linkColor: '#3fd9ff', sep: ' · ',
    bg: 'rgba(6,11,20,0.86)', color: '#ffffff', pad: '16px 34px 16px 18px', radius: 30 },
  'link-v2-two-lines': { layout: 'row', icon: 84, font: 42, linkFont: 38, linkColor: '#3fd9ff', stackText: true,
    bg: 'rgba(6,11,20,0.86)', color: '#ffffff', pad: '14px 34px 14px 16px', radius: 30 },
  'link-v3-link-only': { layout: 'row', icon: 76, font: 0, linkFont: 52, linkColor: '#ffffff',
    bg: 'rgba(6,11,20,0.86)', color: '#ffffff', pad: '16px 36px 16px 18px', radius: 30 },
  'link-v4-pill': { layout: 'row', icon: 76, font: 46, linkFont: 40, linkColor: '#060b14', linkPill: '#3fd9ff',
    bg: 'rgba(6,11,20,0.86)', color: '#ffffff', pad: '14px 16px 14px 18px', radius: 30 },
};

/** HTML одной страницы со всеми вариантами; каждый — элемент со своим id. */
export function lockupHtml(svg, variants = LOCKUPS, name = BRAND_NAME, { scale = 1, link = SITE_LINK } = {}) {
  const icon = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  // Кадр ролика бывает не 1080 в ширину (`--keep-source`): все размеры плашки множатся на ОДНО число,
  // чтобы пропорции утверждённой формы не поехали. Отступы — строка `16px 34px …`, поэтому масштабируется
  // каждое число внутри неё, а не только кегль.
  const px = (n) => Math.round(Number(n) * scale);
  const pad = (v) => String(v).replace(/(\d+(?:\.\d+)?)px/g, (_, n) => `${px(n)}px`);
  const linkSpan = (v) => (v.linkFont
    ? `<span class="link" style="font-size:${px(v.linkFont)}px;color:${v.linkColor}${v.linkPill ? `;background:${v.linkPill};padding:${px(6)}px ${px(16)}px;border-radius:${px(999)}px` : ''}">${link}</span>`
    : '');
  const nameSpan = (v) => (v.font ? `<span style="font-size:${px(v.font)}px">${name}</span>` : '');
  const text = (v) => (v.stackText
    ? `<span class="col" style="gap:${px(4)}px">${nameSpan(v)}${linkSpan(v)}</span>`
    : `${nameSpan(v)}${v.font && v.linkFont && v.sep ? `<span style="font-size:${px(v.font)}px;opacity:.55">${v.sep}</span>` : ''}${linkSpan(v)}`);
  // Форма «ссылка ниже, по центру»: верхняя строка «знак + название», под ней ссылка, центрованная по
  // ширине ВСЕЙ плашки (`align-items:center` на колонке), а не по колонке текста.
  const below = (id, v) => `
    <div id="${id}" class="plate col" style="background:${v.bg};color:${v.color};padding:${pad(v.pad)};border-radius:${px(v.radius)}px;gap:${px(v.rowGap ?? 6)}px">
      <span class="row" style="gap:${px(18)}px"><img src="${icon}" width="${px(v.icon)}" height="${px(v.icon)}" alt=""><span style="font-size:${px(v.font)}px">${name}</span></span>
      ${linkSpan(v)}
    </div>`;
  const blocks = Object.entries(variants).map(([id, v]) => (v.layout === 'below' ? below(id, v) : `
    <div id="${id}" class="plate ${v.layout}" style="background:${v.bg};color:${v.color};padding:${pad(v.pad)};border-radius:${px(v.radius)}px;gap:${px(18)}px">
      <img src="${icon}" width="${px(v.icon)}" height="${px(v.icon)}" alt="">
      ${v.linkFont ? text(v) : `<span style="font-size:${px(v.font)}px">${name}</span>`}
    </div>`)).join('');
  return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;background:transparent}
    body{display:flex;flex-direction:column;align-items:flex-start;gap:40px;padding:40px}
    .plate{display:inline-flex;align-items:center;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-weight:600;letter-spacing:.2px;white-space:nowrap}
    .plate.row{flex-direction:row}
    .plate.stack{flex-direction:column}
    .plate img{display:block}
    .plate .col{display:inline-flex;flex-direction:column;align-items:flex-start;line-height:1.05}
    .plate.col{flex-direction:column;align-items:center}
    .plate .row{display:inline-flex;flex-direction:row;align-items:center}
    .plate .link{display:inline-flex;align-items:center;letter-spacing:.4px}
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

export async function renderLockups(outDir, { root = new URL('../../', import.meta.url), frame = { width: OUTRO.width, height: OUTRO.height }, variants = LOCKUPS, suffix = '' } = {}) {
  const { chromium } = await import('@playwright/test');
  mkdirSync(outDir, { recursive: true });
  const svg = readFileSync(new URL('static/favicon.svg', root), 'utf8');
  // Числа плашек и кадра концовки сняты для кадра 1080×1920. На кадре другой ширины они МНОЖАТСЯ на одно
  // число (заказ «разрешение как в исходнике», 2026-09-19): иначе плашка на 1440-м кадре выйдет мелкой,
  // а кадр концовки ffmpeg растянет — знак размоется.
  const scale = frame.width / OUTRO.width;
  const px = (n) => Math.round(n * scale);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: px(1200), height: px(1400) }, deviceScaleFactor: 1 });
    await page.setContent(lockupHtml(svg, variants, BRAND_NAME, { scale }));
    await page.evaluate(() => document.fonts.ready);
    const files = [];
    for (const id of Object.keys(variants)) {
      const file = join(outDir, `${id}${suffix}.png`);
      await page.locator(`#${id}`).screenshot({ path: file, omitBackground: true });
      files.push(file);
    }
    // Кадр концовки — своя страница размером с кадр ролика, без прозрачности: он и есть фон.
    const outro = join(outDir, `outro-card${suffix}.png`);
    const o = { ...OUTRO, width: frame.width, height: frame.height, sign: px(OUTRO.sign), font: px(OUTRO.font), gap: px(OUTRO.gap) };
    const cardPage = await browser.newPage({ viewport: { width: o.width, height: o.height }, deviceScaleFactor: 1 });
    await cardPage.setContent(outroHtml(svg, o));
    await cardPage.evaluate(() => document.fonts.ready);
    await cardPage.screenshot({ path: outro });
    files.push(outro);
    return files;
  } finally {
    await browser.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = (k) => { const j = process.argv.indexOf(`--${k}`); return j >= 0 ? process.argv[j + 1] : undefined; };
  const out = arg('out') ?? join(process.env.NDIM_STUDIO_DIR || 'D:\\work\\ai_sandbox\\ndim-studio', 'brand');
  const f = arg('frame');
  const frame = f ? { width: Number(f.split('x')[0]), height: Number(f.split('x')[1]) } : { width: OUTRO.width, height: OUTRO.height };
  renderLockups(out, { frame, variants: process.argv.includes('--links') ? LINK_LOCKUPS : LOCKUPS, suffix: arg('suffix') ?? '' })
    .then((files) => files.forEach((f) => console.log(`✅ ${f}`)))
    .catch((e) => {
      console.error(`🔴 ${e.message}`);
      process.exitCode = 1;
    });
}

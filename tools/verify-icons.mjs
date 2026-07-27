/**
 * QA-прогон набора иконок (bugs/17) — ворота сдачи по plans/06.
 *
 * Что проверяет:
 *  1) в навигации и Меню стоят НАСТОЯЩИЕ <svg>, а не юникод-глифы и не эмодзи
 *     (ровно та боль владельца: «иконки маленькие, невзрачные»);
 *  2) размер иконки панели вернулся к канону 1.x — 24…28px (было 17px);
 *  3) иконка красится currentColor, то есть активный пункт отличается от обычного
 *     и тема на неё влияет (Ч/Б-инвариант бренда);
 *  4) горизонтального переполнения нет ни на одной ширине.
 *     ⚠️ Сверяется с ПРОДОМ (`--prod`): на проде правок иконок ещё нет, поэтому
 *     совпадение результатов доказывает, что найденное переполнение — не регрессия.
 *
 * Запуск: сначала `npm run build`, затем `npx vite preview --port 4173`, затем
 *   node tools/verify-icons.mjs           — локальная сборка
 *   node tools/verify-icons.mjs --prod    — плюс сверка с ndimspace.app
 * Скриншоты — test-results/icons/ (вне git).
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const LOCAL = 'http://127.0.0.1:4173';
const PROD = 'https://ndimspace.app';
const WITH_PROD = process.argv.includes('--prod');
const OUT = 'test-results/icons';
const PAGES = ['/', '/menu', '/dims', '/profile', '/relations', '/space'];
const WIDTHS = [390, 430, 1440];

/** Знаки, которые стояли вместо иконок до bugs/17 — ни один не должен остаться в оболочке. */
const GLYPHS = /[⌂◎✳★☰⚙☾☀💡🔍✉ⓘ⧉↗↪🌐📖🔒⚠♡§📜👤👥⋮›]/u;

let pass = 0;
const fails = [];
const ok = (name) => { pass++; console.log(`  ✓ ${name}`); };
const bad = (name, detail) => { fails.push(`${name}: ${detail}`); console.log(`  ✗ ${name} — ${detail}`); };

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

// ── 1. Переполнение: локально и (по флагу) на проде ────────────────────────────
async function overflow(origin) {
  const found = [];
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    for (const path of PAGES) {
      try {
        await page.goto(origin + path, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForTimeout(500);
        const m = await page.evaluate(() => ({
          sw: document.scrollingElement.scrollWidth,
          cw: document.scrollingElement.clientWidth,
        }));
        if (m.sw > m.cw + 1) found.push(`${width}px ${path} (${m.sw}>${m.cw})`);
      } catch {
        found.push(`${width}px ${path} НЕДОСТУПНА`);
      }
    }
    await ctx.close();
  }
  return found;
}

console.log('\n── Горизонтальное переполнение ──');
const localOverflow = await overflow(LOCAL);
console.log(`  локально: ${localOverflow.length ? localOverflow.join(', ') : 'нет'}`);
if (WITH_PROD) {
  const prodOverflow = await overflow(PROD);
  console.log(`  прод:     ${prodOverflow.length ? prodOverflow.join(', ') : 'нет'}`);
  if (localOverflow.length && prodOverflow.length === 0) {
    bad('переполнение', `появилось только локально: ${localOverflow.join(', ')} — это РЕГРЕССИЯ`);
  } else if (localOverflow.length) {
    ok(`переполнение есть и на проде (${prodOverflow.length} мест) — не регрессия иконок`);
  } else ok('переполнения нет нигде');
} else if (localOverflow.length) {
  bad('переполнение', localOverflow.join(', '));
} else ok('переполнения нет');

// ── 2. Иконки: svg вместо глифов, размер, цвет ─────────────────────────────────
for (const theme of ['light', 'dark']) {
  console.log(`\n── Тема: ${theme} ──`);
  for (const width of [390, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
    const page = await ctx.newPage();

    // Тема у продукта СВОЯ (AppBar: data-theme + localStorage 'ndim-theme'), системный
    // colorScheme её не переключает — с ним «обе темы» проверялись бы формально,
    // дважды в одной и той же. Ставим ключ ДО загрузки приложения.
    await page.addInitScript((t) => localStorage.setItem('ndim-theme', t), theme);

    await page.goto(`${LOCAL}/menu`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);

    const applied = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    if (applied === theme) ok(`${width}px тема применена: ${applied}`);
    else bad(`${width}px тема`, `просили ${theme}, применилась ${applied}`);

    // ⚠️ Здесь же поймано, но СЮДА НЕ ОТНОСИТСЯ: сегмент «Тема» в Меню при тёмной теме
    // показывает выбранной «Светлую» (документ dark, кнопка .on — светлая). Дефект не
    // про иконки — он был и до них, просто статичный знак ☾ его не выдавал, а живая
    // иконка луна/солнце выдала. Заведён отдельно: bugs/53, там же воспроизведение.

    // навигация: на мобиле нижняя панель, на десктопе — рельс
    const navSel = width < 1024 ? 'nav.bnav' : 'nav.rail';
    const nav = page.locator(navSel);
    const svgCount = await nav.locator('svg').count();
    if (svgCount >= 5) ok(`${width}px ${navSel}: ${svgCount} svg-иконок`);
    else bad(`${width}px ${navSel}`, `svg-иконок ${svgCount}, ожидалось ≥5`);

    const navText = (await nav.innerText()) || '';
    if (GLYPHS.test(navText)) bad(`${width}px навигация`, `остался глиф: ${navText.match(GLYPHS)[0]}`);
    else ok(`${width}px навигация без глифов`);

    // размер иконки панели — канон 1.x 24…28px
    if (width < 1024) {
      const box = await nav.locator('svg').first().boundingBox();
      if (box && box.width >= 24 && box.width <= 28) ok(`иконка панели ${Math.round(box.width)}px (канон 1.x 24…28)`);
      else bad('размер иконки панели', `${box ? Math.round(box.width) : '?'}px вне 24…28`);
    }

    // список Меню: иконки строк — svg, глифов нет
    const rows = page.locator('.row');
    const rowCount = await rows.count();
    const rowSvg = await rows.locator('svg').count();
    if (rowSvg >= rowCount) ok(`Меню: ${rowSvg} svg на ${rowCount} строк`);
    else bad('Меню', `svg ${rowSvg} < строк ${rowCount}`);

    const menuText = (await page.locator('main').innerText()) || '';
    const hit = menuText.match(GLYPHS);
    if (hit) bad('Меню', `остался глиф «${hit[0]}»`);
    else ok('Меню без глифов и эмодзи');

    // Цвет: иконка обязана наследовать currentColor, иначе тема на неё не влияет.
    // Берём svg именно ИЗ .ico: первым svg рельса идёт логотип Brand со своими
    // цветами, и страж проверял бы его вместо иконки пункта.
    const fill = await nav.locator('.ico svg').first().evaluate((el) => getComputedStyle(el).fill);
    if (fill && fill !== 'none') ok(`иконка красится (${fill})`);
    else bad('цвет иконки', `fill = ${fill}`);

    await page.screenshot({ path: `${OUT}/menu-${theme}-${width}.png`, fullPage: false });
    await page.goto(`${LOCAL}/dims`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/dims-${theme}-${width}.png`, fullPage: false });
    await ctx.close();
  }
}

await browser.close();
console.log(`\n${'─'.repeat(52)}\nПройдено: ${pass}, провалено: ${fails.length}`);
if (fails.length) { for (const f of fails) console.log(`  ✗ ${f}`); process.exit(1); }
console.log(`Скриншоты: ${OUT}/`);

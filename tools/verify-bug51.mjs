/**
 * QA-прогон bugs/51 живым браузером на стенде: «Предложить измерение» больше не закопано
 * под лентой — вход живёт в прибитой строке поиска (макет V3, утверждён владельцем).
 *
 * Канон процесса — plans/06: обе темы, две ширины, чтение консоли, скриншоты глазами.
 * Требует поднятый `npm run stand`. Скриншоты — test-results/bug51/.
 * Запуск: node tools/verify-bug51.mjs
 *
 * ГЛАВНЫЙ СТРАЖ: кнопка обязана быть во вьюпорте и ПОСЛЕ прокрутки ленты на 3000px.
 * Именно этого не выдержала прежняя кнопка под лентой: лента бесконечна, низа у неё нет.
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const SHOTS = 'test-results/bug51';

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function person(browser, { theme = 'light', width = 390, lang } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 820 }, locale: 'ru-RU' });
  await context.addInitScript((value) => localStorage.setItem('ndim-theme', value), theme);
  if (lang) await context.addInitScript((value) => localStorage.setItem('ndim-lang', value), lang);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (event) => errors.push(String(event)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return { context, page, errors };
}

const browser = await chromium.launch();
await mkdir(SHOTS, { recursive: true });

try {
  for (const [theme, width] of [['light', 390], ['dark', 1440], ['dark', 390], ['light', 1440]]) {
    console.log(`\nbugs/51 · вход в «Предложить измерение» (${theme}, ${width}):`);
    const { context, page, errors } = await person(browser, { theme, width });
    const height = 820;

    await page.goto(`${BASE}/dims`);
    await page.waitForSelector('article.dim[data-dim]', { timeout: 30000 });

    // ── 1. Кнопка видна БЕЗ прокрутки ──
    const button = page.locator('button.suggest-btn');
    check('кнопка 💡 есть на экране', (await button.count()) === 1);
    const first = await button.boundingBox();
    check('видна без прокрутки', first !== null && first.y >= 0 && first.y + first.height <= height,
      first ? `y=${Math.round(first.y)}…${Math.round(first.y + first.height)}` : 'нет');

    // ── 2. ГЛАВНЫЙ СТРАЖ: видна и ПОСЛЕ длинной прокрутки ──
    // Меряем «дошли до низа», а не «проехали N пикселей»: на 1440 лента идёт в две колонки
    // и вдвое короче — фиксированные 3000px там просто упираются в конец, и проверка
    // ловила бы разницу раскладок вместо дефекта.
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(700); // догрузка порции + сглаживание прокрутки
    const scrolled = await page.evaluate(() => window.scrollY);
    const atBottom = await page.evaluate(
      () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4,
    );
    const after = await button.boundingBox();
    check('лента действительно прокручена', scrolled > 400 || atBottom,
      `scrollY=${Math.round(scrolled)}${atBottom ? ' (низ ленты)' : ''}`);
    check('после прокрутки кнопка ВО ВЬЮПОРТЕ',
      after !== null && after.y >= 0 && after.y + after.height <= height,
      after ? `y=${Math.round(after.y)}` : 'кнопка уехала с экрана');

    // Снимок делаем ИМЕННО ЗДЕСЬ, пока лента прокручена: файл с именем «scrolled»,
    // снятый после возврата наверх, врал бы о том, что доказывает.
    await page.screenshot({ path: `${SHOTS}/scrolled-${theme}-${width}.png`, fullPage: false });

    // ── 3. Прибитая строка не прячется ЗА шапку и не наезжает на неё ──
    const bar = await page.locator('.bar').boundingBox();
    const row = await page.locator('.searchbar').boundingBox();
    const gap = row.y - (bar.y + bar.height);
    check('строка поиска стоит ВПЛОТНУЮ под шапкой', Math.abs(gap) <= 2,
      `зазор ${Math.round(gap)}px (шапка ${Math.round(bar.height)}px)`);

    // ── 4. Кнопка открывает форму, и форма видна сразу ──
    // Нажимаем ПОСЛЕ прокрутки — так и делает человек, долиставший ленту.
    await button.click();
    await page.waitForSelector('.card.sug', { timeout: 10000 });
    await page.waitForTimeout(900); // конец slide-перехода + плавная прокрутка к форме
    const form = await page.locator('.card.sug').boundingBox();
    check('форма открылась', form !== null);
    // ⚠️ Проверяем ОБЕ границы. Условие «y < высоты экрана» проходило и при y = −752, то есть
    // когда форма раскрывалась ВЫШЕ экрана и человек её не видел вовсе (поймано на стенде).
    check('форма ВИДНА на экране, а не над ним',
      form !== null && form.y >= 0 && form.y < height,
      form ? `y=${Math.round(form.y)}` : '—');

    const formText = await page.locator('.card.sug').innerText();
    check('«Правила оформления» на месте (bugs/48)', formText.includes('Правила оформления'));
    check('пример правил дословный', formText.includes('Пятый элемент'));
    check('лимит 300 символов виден', formText.includes('/ 300'));

    await page.screenshot({ path: `${SHOTS}/form-${theme}-${width}.png`, fullPage: false });

    // ── 5. Второй клик закрывает форму ──
    await button.click();
    await page.waitForTimeout(500);
    check('повторный клик закрывает форму', (await page.locator('.card.sug').count()) === 0);

    // ── 6. Старой кнопки ПОД лентой больше нет ──
    const bodyText = await page.locator('main.body').innerText();
    check('кнопки «Предложить новое измерение» под лентой нет',
      !bodyText.includes('Предложить новое измерение'));
    check('подсказка экрана указывает на кнопку рядом с поиском',
      bodyText.includes('кнопкой 💡 рядом с ней'));

    // ── 7. В покое кнопка не наезжает на звёзды карточек ──
    // Именно В ПОКОЕ: прибитая строка ПО ПРИРОДЕ накрывает то, что проезжает под ней при
    // прокрутке (так же ведёт себя шапка, bugs/34). Дефектом было бы, если бы она крала
    // нажатия у карточек на неподвижном экране.
    // ⚠️ У страницы глобальный `scroll-behavior: smooth` (+layout.svelte): scrollTo уезжает
    // ПЛАВНО, и замер сразу после него читает середину анимации. Ждём фактического нуля,
    // а не «прошло 300 мс» — иначе страж краснел бы от собственной торопливости.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(() => window.scrollY === 0, { timeout: 10000 });
    await page.waitForTimeout(150);
    const overlaps = await page.evaluate(() => {
      const btn = document.querySelector('button.suggest-btn')?.getBoundingClientRect();
      if (!btn) return -1;
      return [...document.querySelectorAll('article.dim .st')].filter((star) => {
        const r = star.getBoundingClientRect();
        return !(r.right < btn.left || r.left > btn.right || r.bottom < btn.top || r.top > btn.bottom);
      }).length;
    });
    check('кнопка не перекрывает ни одной звезды', overlaps === 0, `перекрыто: ${overlaps}`);

    check('консоль чиста', errors.length === 0, errors.slice(0, 3).join(' · '));
    await context.close();
  }

  // ── 8. Английский экран: подпись кнопки и форма ──
  console.log('\nbugs/51 · английская раскладка:');
  const { context, page, errors } = await person(browser, { theme: 'light', width: 390, lang: 'en' });
  await page.goto(`${BASE}/dims`);
  await page.waitForSelector('article.dim[data-dim]', { timeout: 30000 });
  const label = await page.locator('button.suggest-btn').getAttribute('aria-label');
  check('у кнопки есть человеческая подпись для скринридера', label === 'Suggest a new dimension', String(label));
  await page.locator('button.suggest-btn').click();
  await page.waitForSelector('.card.sug', { timeout: 10000 });
  check('EN: правила оформления на английском',
    (await page.locator('.card.sug').innerText()).includes('Description rules'));
  await page.screenshot({ path: `${SHOTS}/form-en-390.png`, fullPage: false });
  check('консоль чиста (EN)', errors.length === 0, errors.slice(0, 3).join(' · '));
  await context.close();
} finally {
  await browser.close();
}

console.log(`\n${failures === 0 ? '✅ ВСЁ ЗЕЛЁНОЕ' : `❌ ПРОВАЛОВ: ${failures}`}`);
process.exit(failures === 0 ? 0 : 1);

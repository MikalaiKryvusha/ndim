/**
 * QA-прогон bugs/50 живым браузером на стенде: «поиск измерений ищет только то,
 * что уже подгружено в браузер».
 *
 * Канон процесса — plans/06: обе темы, две ширины, чтение консоли, скриншоты глазами.
 * Требует поднятый `npm run stand`. Скриншоты — test-results/bug50/.
 * Запуск: node tools/verify-bug50.mjs
 *
 * ГЛАВНАЯ ПРОВЕРКА, которую не может сделать юнит-тест: измерение выбирается ИЗ ТЕХ,
 * КОТОРЫХ СЕЙЧАС НЕТ В DOM. Мы читаем `data-dim` всех отрисованных карточек, берём из
 * каталога то, чего среди них нет, и ищем его по имени. Именно так владелец и наткнулся
 * на дефект: он искал то, до чего не долистал.
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const SHOTS = 'test-results/bug50';

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

/** Идентификаторы карточек, ОТРИСОВАННЫХ прямо сейчас (лента показывает порцию из 12). */
const shownIds = (page) => page.$$eval('article.dim[data-dim]', (nodes) => nodes.map((n) => n.dataset.dim));

/** Ввод в строку поиска + ожидание, пока экран перестанет быть «в поиске». */
async function search(page, query) {
  const input = page.locator('input.search');
  await input.fill('');
  await input.fill(query);
  // Пауза дребезга (250 мс) + догрузка карточек из базы. Ждём НАБЛЮДАЕМОГО исхода:
  // либо появились карточки, либо экран сказал «ничего не найдено» / показал ошибку.
  await page.waitForFunction(
    () => {
      const body = document.querySelector('main.body');
      if (!body) return false;
      const busy = body.querySelector('.state svg, .state .ring, .state [class*="load"]') !== null;
      const text = body.innerText;
      // Барьер обязан знать ОБА языка интерфейса: русский текст «ничего не найдено» на
      // английском экране никогда не появится, и оснастка ждала бы его до таймаута.
      const settled =
        body.querySelector('article.dim[data-dim]') !== null ||
        text.includes('Ничего не нашлось') ||
        text.includes('Nothing found') ||
        text.includes('Не удалось выполнить поиск') ||
        text.includes('search could not be completed');
      return settled && !busy;
    },
    { timeout: 20000 },
  );
}

const browser = await chromium.launch();
await mkdir(SHOTS, { recursive: true });

try {
  for (const [theme, width] of [['light', 390], ['dark', 1440]]) {
    console.log(`\nbugs/50 · поиск по всему Пространству (${theme}, ${width}):`);
    const { context, page, errors } = await person(browser, { theme, width });

    await page.goto(`${BASE}/dims`);
    await page.waitForSelector('article.dim[data-dim]', { timeout: 30000 });

    // ── 1. Главная проверка: ищем то, чего на экране заведомо НЕТ ──
    const loaded = await shownIds(page);
    const catalog = await page.evaluate(async () => {
      // Индекс каталога уже прочитан приложением; берём его тем же путём, что и экран.
      const response = await fetch(
        'http://127.0.0.1:8181/v1/projects/demo-ndim-dev/databases/(default)/documents/dims/dims_list',
        { headers: { Authorization: 'Bearer owner' } },
      );
      const json = await response.json();
      return JSON.parse(json.fields.dims_list.stringValue);
    });

    const notLoaded = Object.entries(catalog).filter(([id]) => !loaded.includes(id));
    check('на экране показана лишь ПОРЦИЯ каталога', loaded.length < Object.keys(catalog).length,
      `в DOM ${loaded.length} из ${Object.keys(catalog).length}`);
    check('есть измерения, до которых человек не долистал', notLoaded.length > 0, `${notLoaded.length} шт.`);

    const [targetId, targetEntry] = notLoaded[0];
    // Ищем по «сырому» имени из индекса, как это делает живой человек, — без кавычек и года.
    const targetQuery = targetEntry.ru.replace(/[«»"]/g, '').replace(/\s*\(\d{4}\)\s*$/, '').trim();
    await search(page, targetQuery);
    const found = await shownIds(page);
    check(`НАЙДЕНО измерение, которого не было в DOM: «${targetQuery}»`, found.includes(targetId),
      `искали ${targetId}, выдача: ${found.join(', ') || 'пусто'}`);

    // ── 2. Нормализация 1.x: грязь настоящих названий не мешает найти ──
    // Каждый запрос написан НЕ так, как лежит в каталоге, — в этом весь смысл.
    for (const [query, expected, why] of [
      ['звездные войны', 'star-wars-1977', 'ё → е'],
      ['человек паук', 'spider-man-2002', 'дефис → пробел'],
      ['алхимик', 'alchemist-1988', 'кавычки в имени'],
      ['рокки 4', 'rocky-4-1985', 'римская цифра'],
      ['ТАКСИСТ', 'taxi-driver-1976', 'верхний регистр'],
    ]) {
      await search(page, query);
      const ids = await shownIds(page);
      check(`«${query}» находит ${expected} (${why})`, ids.includes(expected), `выдача: ${ids.join(', ') || 'пусто'}`);
    }

    // ── 3. Ничего не найдено — честно, и ТОЛЬКО по завершении поиска ──
    await search(page, 'щщщыыытакогонет');
    const emptyText = await page.locator('main.body').innerText();
    check('несуществующее → честное «Ничего не нашлось»', emptyText.includes('Ничего не нашлось'));
    check('пустая выдача не показывает карточек', (await shownIds(page)).length === 0);

    // ── 4. Лимит выдачи: «Проба N» совпадает с 36 измерениями стенда ──
    await search(page, 'проба');
    const manyIds = await shownIds(page);
    const manyText = await page.locator('main.body').innerText();
    check('показано не больше 20 карточек', manyIds.length <= 20, `${manyIds.length}`);
    check('сказано, что показаны первые 20', manyText.includes('первые 20'),
      manyText.split('\n').find((line) => line.includes('первые')) ?? '—');

    // ── 5. Возврат к ленте: поиск очищен — вкладка «Все» на месте ──
    await page.locator('input.search').fill('');
    await page.waitForFunction(() => document.querySelectorAll('article.dim[data-dim]').length > 1, { timeout: 20000 });
    check('очистка поиска возвращает ленту', (await shownIds(page)).length > 1);

    // ── 6. Скриншоты — смотреть глазами ──
    // Ждём КОНЦА появления карточек: снимок во время fade-in полупрозрачен и врёт о
    // продукте (EXP-0048). Пауза заведомо больше самого длинного перехода MOTION.
    const settleShot = async (query, name) => {
      await search(page, query);
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${SHOTS}/${name}-${theme}-${width}.png`, fullPage: true });
    };
    await settleShot('звездные войны', 'search');
    await settleShot('проба', 'search-limit');
    await settleShot('щщщыыытакогонет', 'search-empty');


    check('консоль чиста', errors.length === 0, errors.slice(0, 3).join(' · '));
    await context.close();
  }

  // ── 7. Английская раскладка: поиск на EN обязан работать так же ──
  console.log('\nbugs/50 · поиск на английском:');
  const { context, page, errors } = await person(browser, { theme: 'light', width: 390, lang: 'en' });
  await page.goto(`${BASE}/dims`);
  await page.waitForSelector('article.dim[data-dim]', { timeout: 30000 });
  await search(page, 'spider man');
  check('«spider man» находит Spider-Man', (await shownIds(page)).includes('spider-man-2002'));
  await search(page, 'zzzznothing');
  check('EN: честное «Nothing found»', (await page.locator('main.body').innerText()).includes('Nothing found'));
  await page.screenshot({ path: `${SHOTS}/search-en-390.png`, fullPage: true });
  check('консоль чиста (EN)', errors.length === 0, errors.slice(0, 3).join(' · '));
  await context.close();
} finally {
  await browser.close();
}

console.log(`\n${failures === 0 ? '✅ ВСЁ ЗЕЛЁНОЕ' : `❌ ПРОВАЛОВ: ${failures}`}`);
process.exit(failures === 0 ? 0 : 1);

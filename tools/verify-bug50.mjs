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

/**
 * Панель «Измерений» на экране (а не уехала прокруткой).
 *
 * ⚠️ Панель прячется ПО НАПРАВЛЕНИЮ прокрутки (канон 1.x, bugs/52), и возвращает её
 * обработчик события `scroll`. Если страница уже наверху, событие не придёт вовсе — и
 * панель останется уехавшей: её кнопки формально «видимы», но клик по ним перехватывает
 * лента, и страж падает таймаутом вместо проверки. Поэтому прокрутку именно ШЕВЕЛИМ.
 */
async function showToolbar(page) {
  const hidden = () => page.evaluate(() => document.querySelector('.toolbar')?.classList.contains('hidden') ?? false);
  if (!(await hidden())) return;
  await page.evaluate(() => window.scrollTo({ top: 200, behavior: 'instant' }));
  await page.waitForTimeout(150);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(450); // возвращается переходом 300 мс
}

/**
 * Ящик поиска выдвинут? Поле живёт в нём с макета V3 (bugs/51) и до нажатия 🔍 скрыто.
 *
 * ⚠️ Открытость определяем ПО РАЗМЕТКЕ (`.toolbar.open`), а не по видимости поля.
 * Закрытый ящик — это `max-height: 0; overflow: hidden` у родителя, а Playwright считает
 * обрезанный родителем элемент ВИДИМЫМ (у него свой ненулевой бокс). Проверка через
 * `isVisible()` поэтому врала: страж решал, что ящик открыт, печатал в схлопнутое поле
 * (это проходило) и падал только на клике по кнопке «Искать» — обрезанной и недоступной.
 */
async function openSearch(page) {
  const isOpen = () => page.evaluate(() => document.querySelector('.toolbar')?.classList.contains('open') ?? false);
  if (await isOpen()) return;
  await showToolbar(page);
  await page.locator('.tools .ibtn').first().click();
  await page.waitForFunction(() => document.querySelector('.toolbar')?.classList.contains('open'), { timeout: 10000 });
  await page.waitForTimeout(350); // ящик едет 280 мс — жать по нему раньше нельзя
}

/**
 * Ввод в строку поиска + ЯВНАЯ ОТПРАВКА + ожидание, пока экран перестанет быть «в поиске».
 *
 * ⚠️ Отправка обязательна с ideas/20: поиск больше не стартует по набору букв. Раньше эта
 * функция только заполняла поле — после смены канона она молча ждала бы выдачи, которой
 * никогда не будет (класс EXP-0056: страж гниёт не от регрессии, а от смены канона).
 */
async function search(page, query, { via = 'enter' } = {}) {
  await openSearch(page);
  const input = page.locator('input.search');
  await input.fill('');
  await input.fill(query);
  if (via === 'button') {
    // Кнопка живёт в той же панели — её тоже нельзя жать «вслепую», если панель уехала.
    await showToolbar(page);
    await page.locator('.sform .go').click();
  } else {
    await input.press('Enter');
  }
  await settled(page);
}

/**
 * Барьер «экран больше не в поиске»: догрузка карточек из базы закончилась.
 * Ждём НАБЛЮДАЕМОГО исхода — либо появились карточки, либо экран честно сказал
 * «ничего не найдено» / показал ошибку.
 */
async function settled(page) {
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

    /*
     * ЭКОНОМИЯ (ideas/20): набор букв НЕ порождает запросов к Firestore.
     *
     * Слово владельца: «поиск делать только по явному вводу… Сейчас ищет по каждой букве —
     * это неуважение к ограниченному ресурсу Firestore». Стережём ПОВЕДЕНИЕ, а не литерал
     * (класс EXP-0061): считаем реальные обращения к эмулятору базы, пока человек печатает.
     *
     * Замер живёт ИМЕННО ЗДЕСЬ, на измерении, которого нет в DOM: его карточка заведомо не
     * в кеше `data/dims.ts`, поэтому отправка обязана сходить в базу. Если поставить замер
     * после других поисков, «0 запросов» было бы зелёным от прогретого кеша, а не от фикса
     * (поймано наблюдением: на разогретом кеше и Enter давал 0 запросов — и это правильно).
     */
    await openSearch(page);
    let dbCalls = 0;
    const countCall = (request) => {
      if (request.url().includes('127.0.0.1:8181')) dbCalls += 1;
    };
    page.on('request', countCall);

    /*
     * Печатаем ПОСИМВОЛЬНО — именно так, как человек, иначе проверять было бы нечего:
     * `fill()` ставит строку разом и не порождает того потока событий, на который раньше
     * реагировал поиск.
     *
     * ⚠️ Само содержимое поля после такого ввода на стенде оказывается перевёрнутым
     * (`bugs/72`: каретка возвращается в начало — дефект СТАРШЕ этой работы, доказано
     * прогоном на HEAD). Замеру это не мешает: мы считаем ЗАПРОСЫ, а их нет при любом
     * порядке букв. Отправку ниже делаем через `fill()`, чтобы страж не зависел от
     * чужого дефекта и не покраснел вместо него.
     */
    await page.locator('input.search').fill('');
    await page.locator('input.search').pressSequentially(targetQuery, { delay: 60 });
    await page.waitForTimeout(1500);
    check('набор букв БЕЗ отправки не стоит ни одного запроса к базе', dbCalls === 0, `запросов: ${dbCalls}`);
    check('и выдачи на экране ещё нет — лента на месте', !(await shownIds(page)).includes(targetId));

    // Отправка — и вот теперь запросы обязаны пойти, иначе «0 при наборе» ничего не значит.
    await page.locator('input.search').fill(targetQuery);
    await page.locator('input.search').press('Enter');
    await page.waitForSelector(`article.dim[data-dim="${targetId}"]`, { timeout: 20000 });
    check('отправка запускает поиск: запросы к базе пошли', dbCalls > 0, `запросов после Enter: ${dbCalls}`);
    page.off('request', countCall);

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

    // ── 4б. Кнопка «Искать» — вторая дверь из слова владельца, и она обязана работать так же ──
    await search(page, 'таксист', { via: 'button' });
    check('кнопка «Искать» запускает поиск', (await shownIds(page)).includes('taxi-driver-1976'));

    // Пустой ввод не ищет (канон 1.x): кнопка погашена, нажимать нечего.
    await page.locator('input.search').fill('');
    check('пустой ввод: кнопка «Искать» погашена', await page.locator('.sform .go').isDisabled());

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

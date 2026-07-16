/**
 * QA-прогон пачки 2 волн 08–09 (bugs/13, 14, 15, 18, 22, 23) на стенде живым браузером.
 *
 * Канон процесса — plans/06: ходим как человек, тыкаем, меряем rect'ы и цвета, читаем
 * консоль, складываем скриншоты в test-results/batch2/ (вне git). Требует `npm run stand`.
 *
 * Запуск: node tools/verify-batch2.mjs
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const SHOTS = 'test-results/batch2';

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Чистый контекст. theme: 'dark' кладёт выбор в localStorage до загрузки приложения. */
async function person(browser, { theme } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 740 }, locale: 'ru-RU' });
  if (theme) await context.addInitScript((value) => localStorage.setItem('ndim-theme', value), theme);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return { context, page, errors };
}

/** Фон элемента непрозрачен? (bugs/22, 23) */
const isOpaque = (bg) => !/rgba\(/.test(bg) || /rgba\(\d+, \d+, \d+, 1\)/.test(bg);

const browser = await chromium.launch();
await mkdir(SHOTS, { recursive: true });

try {
  // ── bugs/13 + 15: лента «Все» — прогрессивная догрузка и ровные карточки ──
  console.log('bugs/13, 15 · «Все»: незаметная догрузка, ровные карточки:');
  {
    const { context, page, errors } = await person(browser);
    await page.goto(`${BASE}/dims`);
    await page.waitForSelector('.feed article.dim', { timeout: 20000 });
    await page.waitForTimeout(600);

    const first = await page.locator('.feed article.dim').count();
    check('первая порция — ровно PAGE_SIZE', first === 12, `карточек: ${first}`);

    // Скроллим до дна несколько раз — догрузка должна идти сама, без кликов.
    for (let round = 0; round < 8; round += 1) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(450);
    }
    const total = await page.locator('.feed article.dim').count();
    check('доскроллили — раскрылась ВСЯ очередь (41 неоценённое)', total === 41, `карточек: ${total}`);

    // Высоты: карточка с голосами и карточка «ещё без голосов» равны (bugs/15).
    const rated = page.locator('.feed article.dim', { hasText: /\(\d+ голос/ }).first();
    const bare = page.locator('.feed article.dim', { hasText: 'ещё без голосов' }).first();
    const ratedH = (await rated.boundingBox())?.height ?? -1;
    const bareH = (await bare.boundingBox())?.height ?? -2;
    check('высоты карточек равны', Math.abs(ratedH - bareH) < 1.5, `${ratedH} vs ${bareH}`);
    await page.screenshot({ path: `${SHOTS}/dims-all-light.png` });

    check('консоль чиста («Все»)', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }

  // ── bugs/18: «Мой NDim ID» — стабильный порядок, без пляски, оценка переставляет ──
  console.log('bugs/18 · «Мой NDim ID»: порядок, стабильность, смена оценки:');
  {
    const { context, page, errors } = await person(browser);
    await page.goto(`${BASE}/dims`);
    await page.waitForSelector('.feed article.dim', { timeout: 20000 });

    await page.getByRole('button', { name: /Мой NDim ID/ }).click();
    await page.waitForTimeout(700);

    const titles = await page.locator('.feed article.dim .name').allTextContents();
    const names = titles.map((s) => s.replace(/«|»/g, '').trim());
    check(
      'порядок — по убыванию своей оценки',
      names[0]?.startsWith('Кошки') && names[1]?.startsWith('Путешествия') &&
        names[2]?.startsWith('Математика') && names[3]?.startsWith('Тишина'),
      names.join(' · '),
    );

    // Стабильность: позиции карточек не меняются со временем (пляска = провал).
    const at = () => page.locator('.feed article.dim').first().boundingBox().then((b) => b?.y ?? -1);
    const y1 = await at();
    await page.waitForTimeout(500);
    const y2 = await at();
    const count1 = await page.locator('.feed article.dim').count();
    await page.waitForTimeout(500);
    const count2 = await page.locator('.feed article.dim').count();
    check('лента не пляшет (позиция и состав неподвижны)', y1 === y2 && count1 === count2, `y ${y1}→${y2}, n ${count1}→${count2}`);
    await page.screenshot({ path: `${SHOTS}/dims-mine.png` });

    // Смена оценки: «Кошки» 10 → 0 — карточка ПЕРЕЕЗЖАЕТ в конец, но остаётся во вкладке.
    const cats = page.locator('.feed article.dim', { hasText: 'Кошки' });
    await cats.locator('.st', { hasText: '0' }).first().click();
    await page.getByRole('button', { name: 'Сохранить сейчас' }).click();
    await page.waitForTimeout(900);
    const after = (await page.locator('.feed article.dim .name').allTextContents()).map((s) => s.replace(/«|»/g, '').trim());
    check('карточка осталась во вкладке и переехала в конец', after.length === 4 && after[3]?.startsWith('Кошки'), after.join(' · '));

    // Возвращаем стенд как был: «Кошки» снова 10.
    await cats.locator('.st', { hasText: '10' }).first().click();
    await page.getByRole('button', { name: 'Сохранить сейчас' }).click();
    await page.waitForTimeout(700);

    check('консоль чиста («Мой NDim ID»)', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }

  // ── канон 1.x: оценил в «Все» → уехала; «Отменить оценку» → вернулась ──
  console.log('канон ленты · оценка уезжает, отмена возвращает:');
  {
    const { context, page, errors } = await person(browser);
    await page.goto(`${BASE}/dims`);
    await page.waitForSelector('.feed article.dim', { timeout: 20000 });
    const firstCard = page.locator('.feed article.dim').first();
    const title = (await firstCard.locator('.name').textContent())?.trim() ?? '';

    await firstCard.locator('.st', { hasText: '7' }).first().click();
    await page.getByRole('button', { name: 'Сохранить сейчас' }).click();
    await page.waitForTimeout(900);
    const gone = await page.locator('.feed article.dim .name', { hasText: title }).count();
    check('оценённая карточка уехала из «Все»', gone === 0, title);

    await page.getByRole('button', { name: 'Отменить оценку' }).click();
    await page.waitForTimeout(900);
    const backTitle = (await page.locator('.feed article.dim .name').first().textContent())?.trim();
    check('отмена вернула карточку в начало ленты', backTitle === title, `${backTitle} vs ${title}`);
    check('консоль чиста (оценка/отмена)', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }

  // ── bugs/22 + 23: непрозрачность панели и меню (тёмная тема — там всё и просвечивало) ──
  console.log('bugs/22, 23 · тёмная тема: панель и меню непрозрачны:');
  {
    const { context, page, errors } = await person(browser, { theme: 'dark' });
    await page.goto(`${BASE}/dims`);
    await page.waitForSelector('.feed article.dim', { timeout: 20000 });

    const navBg = await page.$eval('nav.bnav', (el) => getComputedStyle(el).backgroundColor);
    check('нижняя панель непрозрачна', isOpaque(navBg), navBg);

    await page.locator('.feed article.dim .dots').first().click();
    await page.waitForSelector('.drop');
    const dropBg = await page.$eval('.drop', (el) => getComputedStyle(el).backgroundColor);
    check('контекстное меню непрозрачно', isOpaque(dropBg), dropBg);
    await page.screenshot({ path: `${SHOTS}/dims-dark-menu.png` });
    check('консоль чиста (тёмная)', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }

  // ── bugs/14: фото — лайтбокс в профиле и в связях ──
  console.log('bugs/14 · фото открывается во весь экран:');
  {
    const { context, page, errors } = await person(browser);
    await page.goto(`${BASE}/profile`);
    await page.waitForSelector('.head-card', { timeout: 20000 });

    const peek = page.locator('.head-card .peek');
    await peek.waitFor({ timeout: 10000 });
    const src = await peek.locator('img').getAttribute('src');
    check('фото на стенде настоящее (эмулятор Storage)', (src ?? '').includes('9199'), src ?? 'нет src');
    // ПИКСЕЛИ, а не DOM: битая картинка имеет naturalWidth 0 (поймано глазами на скриншоте).
    const drawn = await peek.locator('img').evaluate((img) => img.complete && img.naturalWidth > 0);
    check('фото реально отрисовано (naturalWidth > 0)', drawn);

    await peek.click();
    await page.waitForSelector('.lightbox img', { timeout: 5000 });
    await page.waitForTimeout(450); // дождаться конца fade — скриншот должен ПОКАЗЫВАТЬ оверлей
    const drawnBig = await page
      .locator('.lightbox img')
      .evaluate((img) => img.complete && img.naturalWidth > 0);
    check('тап по фото — фото во весь экран и отрисовано', drawnBig);
    await page.screenshot({ path: `${SHOTS}/profile-lightbox.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    check('Esc закрывает', (await page.locator('.lightbox').count()) === 0);

    // Связи: фото Анны — лайтбокс; имя — раскрытие карточки. Кнопки не перепутаны.
    await page.goto(`${BASE}/relations`);
    await page.waitForSelector('.card .head', { timeout: 20000 });
    const anna = page.locator('.card', { hasText: 'Анна' });
    await anna.locator('.peek').waitFor({ timeout: 10000 });
    await anna.locator('.peek').click();
    await page.waitForSelector('.lightbox img', { timeout: 5000 });
    await page.waitForTimeout(450);
    const annaDrawn = await page
      .locator('.lightbox img')
      .evaluate((img) => img.complete && img.naturalWidth > 0);
    check('фото соседа — во весь экран и отрисовано', annaDrawn);
    await page.screenshot({ path: `${SHOTS}/relations-lightbox.png` });
    await page.locator('.lightbox').click();
    await page.waitForTimeout(400);
    check('тап закрывает', (await page.locator('.lightbox').count()) === 0);

    await anna.locator('.who').click();
    await anna.locator('.deep').waitFor({ timeout: 5000 });
    check('тап по имени раскрывает карточку (кнопки не перепутаны)', true);

    const cardsShown = await page.locator('.card .head').count();
    check('связи на месте (прогрессивное раскрытие не съело карточки)', cardsShown === 3, `карточек: ${cardsShown}`);
    check('консоль чиста (фото)', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\nПРОВАЛОВ: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

/**
 * QA-прогон близнецов bugs/76 живым браузером на стенде: СИСТЕМНАЯ «НАЗАД» ЗАКРЫВАЕТ СЛОЙ,
 * а не уводит человека из приложения.
 *
 * Слово владельца (интервью №007, В12б): «ты прав, навигация должна быть честной, фиксим».
 * Речь про два слоя, которые остались без записи в истории после того, как окно «Как меня
 * видят» её получило (`bugs/76`):
 *   · ЛАЙТБОКС ФОТОГРАФИИ — `Avatar.svelte`;
 *   · ПАНЕЛЬ ГЛАВ руководства — `ChapterNav.svelte`.
 *
 * ⚠️ ГЛАВНАЯ ЛОВУШКА ЭТОГО КЛАССА (и причина, по которой прибор устроен так, а не проще):
 * проверка «нажал Назад → слой закрылся» бывает ЗЕЛЁНОЙ ПО НЕВЕРНОЙ ПРИЧИНЕ — например,
 * если «Назад» вообще ничего не сделала (у страницы не было предыдущей записи), а слой
 * закрылся сам или не открывался. Поэтому у каждой проверки есть КОНТРОЛЬ САМОГО ПРИБОРА
 * (EXP-0082): та же «Назад» на странице БЕЗ открытого слоя обязана реально уводить со
 * страницы. Если контроль не срабатывает — прибор не умеет нажимать «Назад», и его зелёному
 * верить нельзя.
 *
 * `history.length` здесь не используется намеренно: он НЕ УБЫВАЕТ при возврате (ожог
 * прошлой сессии, `STATUS.md`). Судим по тому, что видит человек: открыт слой или нет и на
 * каком адресе он остался.
 *
 * Требует поднятый `npm run stand`. Скриншоты — test-results/back-twins/.
 * Запуск: node tools/verify-back-twins.mjs [--quick]
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const STAND = 'http://localhost:5173';
const AUTH = 'http://127.0.0.1:9099';
const PROJECT = 'demo-ndim-dev';
const SHOTS = 'test-results/back-twins';
const QUICK = process.argv.includes('--quick');

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Вход почтовой ссылкой через oob-код эмулятора Auth (приём EXP-0045). */
async function signIn(page) {
  const email = 'dev@ndim.space';
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=demo-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestType: 'EMAIL_SIGNIN', email, continueUrl: `${STAND}/profile` }),
  });
  const res = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes = [] } = await res.json();
  const last = oobCodes.filter((c) => c.email === email && c.requestType === 'EMAIL_SIGNIN').at(-1);
  if (!last) return false;
  await page.goto(`${STAND}/profile?mode=signIn&oobCode=${last.oobCode}&apiKey=demo-api-key`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(2200);
  return true;
}

/** Устойчивое состояние слоя: он приезжает переходом `fade`, мгновенный снимок врёт. */
async function layer(page, selector, expected) {
  try {
    await page.locator(selector).first().waitFor({ state: expected ? 'visible' : 'hidden', timeout: 3000 });
  } catch {
    return !expected;
  }
  return expected;
}

const browser = await chromium.launch();
await mkdir(SHOTS, { recursive: true });

const COMBOS = QUICK ? [['light', 1440]] : [['light', 390], ['light', 1440], ['dark', 390], ['dark', 1440]];

try {
  for (const [theme, width] of COMBOS) {
    console.log(`\nблизнецы bugs/76 · «Назад» закрывает слой (${theme}, ${width}):`);
    const context = await browser.newContext({ viewport: { width, height: 820 }, locale: 'ru-RU' });
    await context.addInitScript((value) => localStorage.setItem('ndim-theme', value), theme);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (event) => errors.push(String(event)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    if (!(await signIn(page))) {
      check('вход на стенд', false, 'не удалось войти почтовой ссылкой');
      await context.close();
      continue;
    }

    // ── БЛИЗНЕЦ 1: ПАНЕЛЬ ГЛАВ РУКОВОДСТВА ──────────────────────────────────────────────
    // Заходим ССЫЛКОЙ с «Меню», а не `goto`: нужна честная предыдущая запись в истории,
    // иначе «Назад» уводила бы в пустоту и контроль ниже нечего было бы проверять.
    await page.goto(`${STAND}/menu`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    await page.goto(`${STAND}/menu/manual`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.pager', { timeout: 20000 });
    /*
     * ⚠️ ЖДЁМ ГИДРАТАЦИИ, а не появления капсулы. Руководство ПРЕРЕНДЕРЕНО: `.pager` лежит в
     * готовом HTML и находится селектором ДО того, как Svelte навесил обработчики. Первый
     * прогон кликал по мёртвой разметке — панель не открывалась, и страж честно краснел на
     * заведомо исправном коде. Признак готовности берём наблюдением: капсула реально
     * отзывается. Тот же приём стоит в `verify-manual-v1.mjs` (пауза после `.doc h2`).
     */
    await page.waitForFunction(() => {
      const capsule = document.querySelector('.pager');
      return capsule !== null && getComputedStyle(capsule).cursor === 'pointer';
    }, { timeout: 20000 });
    await page.waitForTimeout(700);

    check('панель глав закрыта, пока её не открыли', (await page.locator('.panel').count()) === 0);
    await page.locator('.pager').click();
    check('тап по капсуле развернул панель глав', await layer(page, '.panel', true));
    await page.screenshot({ path: `${SHOTS}/chapters-open-${theme}-${width}.png` });

    await page.goBack();
    check('«Назад» СВЕРНУЛА панель глав', !(await layer(page, '.panel', false)));
    check('и оставила человека на странице руководства', page.url().includes('/menu/manual'),
      page.url());
    await page.screenshot({ path: `${SHOTS}/chapters-back-${theme}-${width}.png` });

    // КОНТРОЛЬ ПРИБОРА: та же «Назад» БЕЗ открытого слоя обязана увести со страницы.
    // Без этой проверки «панель свернулась» было бы зелёным и от неработающей «Назад».
    await page.goBack();
    await page.waitForTimeout(600);
    check('контроль прибора: «Назад» без слоя реально уводит со страницы',
      !page.url().includes('/menu/manual'), page.url());

    // ── БЛИЗНЕЦ 2: ЛАЙТБОКС ФОТОГРАФИИ ──────────────────────────────────────────────────
    // Фото на стенде есть у dev-пользователя и у Анны (сид кладёт лица в эмулятор Storage).
    await page.goto(`${STAND}/relations`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    await page.goto(`${STAND}/profile`, { waitUntil: 'domcontentloaded' });

    const peek = page.locator('button.peek').first();
    let hasPhoto = true;
    try {
      await peek.waitFor({ state: 'visible', timeout: 15000 });
    } catch {
      hasPhoto = false;
    }
    check('на стенде есть кружок с фотографией (иначе близнеца не проверить)', hasPhoto);

    if (hasPhoto) {
      check('лайтбокс закрыт, пока по фото не нажали', (await page.locator('.lightbox').count()) === 0);
      await peek.click();
      check('тап по фото развернул лайтбокс', await layer(page, '.lightbox', true));
      await page.screenshot({ path: `${SHOTS}/photo-open-${theme}-${width}.png` });

      await page.goBack();
      check('«Назад» ЗАКРЫЛА лайтбокс', !(await layer(page, '.lightbox', false)));
      check('и оставила человека на «Профиле»', page.url().includes('/profile'), page.url());
      await page.screenshot({ path: `${SHOTS}/photo-back-${theme}-${width}.png` });

      // Контроль прибора — тот же, что и у панели глав.
      await page.goBack();
      await page.waitForTimeout(600);
      check('контроль прибора: «Назад» без слоя реально уводит с «Профиля»',
        !page.url().includes('/profile'), page.url());
    }

    check('консоль чиста', errors.length === 0, errors.slice(0, 3).join(' · '));
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`\n${failures === 0 ? '✅ ВСЁ ЗЕЛЁНОЕ' : `❌ ПРОВАЛОВ: ${failures}`}`);
process.exit(failures === 0 ? 0 : 1);

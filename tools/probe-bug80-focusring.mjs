/**
 * РЕШАЮЩИЙ ОПЫТ (не страж) для bugs/80 — второй подозреваемый на видео владельца:
 * тёмно-синяя РАМКА вокруг звезды после клика, нижняя кромка которой ложится на смайлик.
 *
 * Зачем опыт. Прибор `measure-bug80-halo.mjs` показал: при ОБЫЧНОМ клике мышью звезда
 * фокус получает, но `:focus-visible` НЕ совпадает и обводки нет (`outline: none`). На
 * видео владельца рамка есть. Значит её включает не сам клик, а СЦЕНАРИЙ вокруг него —
 * и пока он не назван, чинить нечего: правка вслепую была бы четвёртым заходом наугад.
 *
 * Опыт перебирает сценарии, отличающиеся ровно одним действием, и печатает по каждому,
 * совпала ли кнопка с `:focus-visible` и какую обводку вычислил браузер. Контроль опыта —
 * сценарий «клавиатурой»: он ОБЯЗАН дать рамку. Если её не даст даже он, значит меряет
 * прибор, а не продукт (класс ожога EXP-0082).
 *
 * Требует поднятый `npm run stand`.
 * Запуск: node tools/probe-bug80-focusring.mjs
 */

import { chromium } from '@playwright/test';

const STAND = 'http://localhost:5173';
const AUTH = 'http://127.0.0.1:9099';
const PROJECT = 'demo-ndim-dev';

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

/** Что браузер думает про активный элемент прямо сейчас. */
async function ringState(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { where: 'нет активного элемента' };
    const s = getComputedStyle(el);
    return {
      where: `${el.tagName.toLowerCase()}.${el.className || '—'}${el.getAttribute('aria-label') ? ` [${el.getAttribute('aria-label')}]` : ''}`,
      focusVisible: el.matches(':focus-visible'),
      outline: s.outlineStyle === 'none' ? 'нет' : `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} (offset ${s.outlineOffset})`,
    };
  });
}

async function report(page, name) {
  const r = await ringState(page);
  console.log(`  ${r.focusVisible ? '🔵 РАМКА ЕСТЬ' : '⚪ рамки нет '} · ${name}`);
  console.log(`      активен: ${r.where}`);
  console.log(`      обводка: ${r.outline}`);
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
  await context.addInitScript(() => localStorage.setItem('ndim-theme', 'light'));
  const page = await context.newPage();

  if (!(await signIn(page))) {
    console.log('❌ не удалось войти — поднят ли `npm run stand`?');
    process.exit(1);
  }
  await page.goto(`${STAND}/dims`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('article.dim[data-dim]', { timeout: 30000 });

  const starOf = (dimId, v) => `article.dim[data-dim="${dimId}"] .stars .st[aria-label="${v}"]`;
  const firstDim = async () => page.locator('article.dim[data-dim]').first().getAttribute('data-dim');

  console.log('\nсценарии (отличаются ровно одним действием):\n');

  // ── A. Голый клик мышью ──
  let dim = await firstDim();
  await page.locator(starOf(dim, 3)).click();
  await page.waitForTimeout(400);
  await report(page, 'A · просто клик мышью по звезде');

  // Снять выбор, чтобы следующий сценарий стартовал с чистого листа (повторный тап, bugs/54).
  await page.locator(starOf(dim, 3)).click();
  await page.waitForTimeout(400);

  // ── B. Клавиатура (КОНТРОЛЬ ОПЫТА: здесь рамка обязана быть) ──
  await page.locator(starOf(dim, 5)).evaluate((el) => el.focus());
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await report(page, 'B · выбор с КЛАВИАТУРЫ (контроль опыта — рамка обязана быть)');

  await page.keyboard.press('Enter'); // снять выбор
  await page.waitForTimeout(400);

  // ── C. Клик мышью ПОСЛЕ того, как страницей пользовались с клавиатуры ──
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  await page.locator(starOf(dim, 4)).click();
  await page.waitForTimeout(400);
  await report(page, 'C · клик мышью ПОСЛЕ работы с клавиатуры');

  await page.locator(starOf(dim, 4)).click();
  await page.waitForTimeout(400);

  // ── D. Клик по звезде СЛЕДУЮЩЕЙ карточки после того, как предыдущая УЛЕТЕЛА ──
  //     Гипотеза: список перестраивается, фокус восстанавливается программно, и Chrome
  //     считает такой фокус «клавиатурным».
  dim = await firstDim();
  await page.locator(starOf(dim, 6)).click();
  await page.locator(`article.dim[data-dim="${dim}"] .countdown .now`).click(); // «Сохранить сейчас»
  await page.waitForTimeout(2200); // улёт 1200 мс + перестроение ленты
  const next = await firstDim();
  console.log(`      (карточка сменилась: ${dim} → ${next})`);
  await page.locator(starOf(next, 3)).click();
  await page.waitForTimeout(400);
  await report(page, 'D · клик по звезде ПОСЛЕ улёта сохранённой карточки');

  await context.close();
} finally {
  await browser.close();
}

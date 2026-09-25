// Драйвер прогона «первая карточка теста видна с первой отрисовки» (находка 1 суда V4).
// Запуск: сборка `npm run build`, затем `npx vite preview --port 4196 --strictPort`, затем
// `node qa/reports/2026-09-26_test-first-card.driver.mjs`. Кадры — в test-results/first-card/.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4196';
const OUT = 'test-results/first-card';
mkdirSync(OUT, { recursive: true });

let fails = 0;
const check = (id, ok, text) => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${text}`);
};

const browser = await chromium.launch();

/** Страница с задержанным JS приложения: встроенный ранний скрипт исполняется, оживления нет, пока не отпустим. */
async function gated(path, { js = true, width = 390 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, javaScriptEnabled: js });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  let release;
  const gate = new Promise((r) => (release = r));
  // Держим только JS приложения: стили нужны до первой отрисовки в любом случае, а встроенный скрипт ждёт их.
  await page.route('**/_app/immutable/**/*.js', async (route) => { await gate; await route.continue(); });
  // DOMContentLoaded ждёт модульные скрипты приложения — а они задержаны; ждём разобранный HTML карточки.
  await page.goto(BASE + path, { waitUntil: 'commit' });
  await page.waitForSelector('.qcard .prestars', { state: 'attached', timeout: 15000 });
  await page.waitForTimeout(300);
  return { ctx, page, errors, release };
}

/** Видимые лица пререндера: имя каждого, у кого есть коробка и видимость. */
const visibleFaces = (page) =>
  page.$$eval('.qcard .pre', (els) =>
    els
      .filter((el) => el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== 'hidden')
      .map((el) => ({ i: el.dataset.i, name: el.querySelector('.name')?.textContent?.trim() ?? '' })),
  );

// ПК-01..03 — три свежих захода: до оживления видно ровно одно лицо с именем; после — та же вещь, без влёта.
const firsts = [];
for (let n = 1; n <= 3; n++) {
  const { ctx, page, errors, release } = await gated('/ru/test/compatibility');
  const before = await visibleFaces(page);
  await page.screenshot({ path: `${OUT}/pk0${n}-before.png` });
  check(`ПК-0${n}а`, before.length === 1 && before[0].name !== '', `до оживления видно лиц: ${before.length}, имя «${before[0]?.name ?? ''}» (лицо ${before[0]?.i ?? '-'})`);
  // Следим за вставкой живой карточки: её коробка в кадре вставки и через 120 мс (влёт x:32 сдвинул бы её).
  await page.evaluate(() => {
    const w = window;
    w.__probe = [];
    // Метки на узлах пререндера: переживут оживление, только если корень не перерисован (гидратация сошлась).
    document.querySelector('h1').__mark = 1;
    document.querySelector('.qcard').__mark = 1;
    new MutationObserver(() => {
      const live = document.querySelector('.qcard > div:not(.pre):not(.prestars) .name');
      if (!live || w.__probe.length) return;
      const box = live.closest('.qcard > div');
      w.__probe.push(box.getBoundingClientRect().x);
      setTimeout(() => w.__probe.push(box.getBoundingClientRect().x), 120);
    }).observe(document.querySelector('.qcard'), { childList: true, subtree: true });
  });
  release();
  await page.waitForFunction(() => document.querySelector('.qcard .pre') === null, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  const liveName = (await page.textContent('.qcard .name'))?.trim() ?? '';
  const probe = await page.evaluate(() => window.__probe);
  await page.screenshot({ path: `${OUT}/pk0${n}-after.png` });
  check(`ПК-0${n}б`, liveName === before[0]?.name, `после оживления «${liveName}»`);
  check(`ПК-0${n}в`, probe.length === 2 && Math.abs(probe[0] - probe[1]) < 1, `коробка живой карточки x: ${probe.map((v) => v.toFixed(1)).join(' → ')} (влёт дал бы сдвиг до 32)`);
  const marks = await page.evaluate(() => [document.querySelector('h1').__mark, document.querySelector('.qcard').__mark]);
  const seedLeft = await page.evaluate(() => '__ndimTestSeed' in window);
  check(`ПК-0${n}г`, marks[0] === 1 && marks[1] === 1 && errors.length === 0, `узлы пререндера пережили оживление: h1 ${marks[0] === 1}, карточка ${marks[1] === 1}; ошибок консоли ${errors.length}`);
  check(`ПК-0${n}д`, !seedLeft, `затравка раннего скрипта стёрта после чтения: ${!seedLeft}`);
  firsts.push(liveName);
  await ctx.close();
}
console.log(`INFO первые вещи трёх заходов: ${firsts.map((f) => `«${f}»`).join(', ')}`);

// ПК-08 — «Тест личности» → «Все тесты» → «Тест на совместимость» ССЫЛКАМИ, без перезагрузки: у каждой
// новой страницы теста своя затравка (суд, О2). Без правки все три пары совпали бы: затравка жила в window.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const live = async () => (await page.waitForSelector('.qcard[data-live] .name'), (await page.textContent('.qcard[data-live] .name'))?.trim() ?? '');
  await page.goto(BASE + '/ru/test/personality');
  let personal = await live();
  await page.evaluate(() => { window.__sameDoc = 1; });
  const pairs = [];
  for (let k = 0; k < 3; k++) {
    await page.click('a[href="/ru/tests"]');
    await page.waitForURL('**/ru/tests');
    await page.click('a[href="/ru/test/compatibility"]');
    await page.waitForURL('**/ru/test/compatibility');
    pairs.push([personal, await live()]);
    await page.click('a[href="/ru/tests"]');
    await page.waitForURL('**/ru/tests');
    await page.click('a[href="/ru/test/personality"]');
    await page.waitForURL('**/ru/test/personality');
    personal = await live();
  }
  const sameDoc = await page.evaluate(() => window.__sameDoc === 1);
  check('ПК-08', sameDoc && pairs.some(([p, c]) => p !== c), `переходы без перезагрузки: ${sameDoc}; личность → совместимость: ${pairs.map(([p, c]) => `«${p}» → «${c}»`).join('; ')}`);
  await ctx.close();
}

// ПК-04 — без JS: видно лицо 0, не пустая карточка.
{
  const { ctx, page } = await gated('/ru/test/compatibility', { js: false });
  const faces = await visibleFaces(page);
  await page.screenshot({ path: `${OUT}/pk04-nojs.png` });
  check('ПК-04', faces.length === 1 && faces[0].i === '0' && faces[0].name !== '', `без JS видно: ${JSON.stringify(faces)}`);
  await ctx.close();
}

// ПК-05 — личная ссылка пары: до оживления лица спрятаны (его первая вещь — из ссылки), как прежде.
{
  const { ctx, page, release } = await gated('/ru/test/compatibility?pair=abcdefghijklmnopqrstuv');
  const faces = await visibleFaces(page);
  await page.screenshot({ path: `${OUT}/pk05-pair-before.png` });
  check('ПК-05', faces.length === 0, `по ссылке пары до оживления видно лиц: ${faces.length}`);
  release();
  await ctx.close();
}

// ПК-07 — КОНТРОЛЬ ПРИБОРА «без влёта»: после «Не знаю» следующая вещь влетает — тот же замер обязан увидеть сдвиг.
{
  const { ctx, page, release } = await gated('/ru/test/compatibility');
  release();
  await page.waitForFunction(() => document.querySelector('.qcard .pre') === null, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  const first = (await page.textContent('.qcard .name'))?.trim() ?? '';
  await page.evaluate((was) => {
    const w = window;
    w.__probe = [];
    new MutationObserver(() => {
      const live = document.querySelector('.qcard > div:not(.pre):not(.prestars) .name');
      if (!live || live.textContent.trim() === was || w.__probe.length) return;
      const box = live.closest('.qcard > div');
      w.__probe.push(box.getBoundingClientRect().x);
      setTimeout(() => w.__probe.push(box.getBoundingClientRect().x), 120);
    }).observe(document.querySelector('.qcard'), { childList: true, subtree: true });
  }, first);
  await page.click('.qcard .skip');
  await page.waitForTimeout(500);
  const probe = await page.evaluate(() => window.__probe);
  check('ПК-07', probe.length === 2 && Math.abs(probe[0] - probe[1]) >= 1, `контроль: влёт следующей вещи после «Не знаю» виден — x: ${probe.map((v) => v.toFixed(1)).join(' → ')}`);
  await ctx.close();
}

// ПК-06 — EN и «Тест личности»: то же правило на другой странице семейства.
{
  const { ctx, page, release } = await gated('/en/test/personality');
  const before = await visibleFaces(page);
  release();
  await page.waitForFunction(() => document.querySelector('.qcard .pre') === null, null, { timeout: 15000 });
  const liveName = (await page.textContent('.qcard .name'))?.trim() ?? '';
  check('ПК-06', before.length === 1 && liveName === before[0].name, `EN личность: до «${before[0]?.name ?? ''}», после «${liveName}»`);
  await ctx.close();
}

await browser.close();
console.log(fails === 0 ? 'ИТОГ: провалов 0' : `ИТОГ: провалов ${fails}`);
process.exit(fails === 0 ? 0 : 1);

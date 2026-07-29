/**
 * Страж панели «Все / Мой NDim ID» — `bugs/75` (волна `ideas/21`, пункт 2).
 *
 * Слово владельца:
 *   «при переключении между Все и Мой NDim ID иногда закрывается эта панель с кнопками
 *    Все и Мой NDim ID, словно разные глубины скрола на этих суб страницах вынуждают панель
 *    скрыться (она думает, что страницу листали) — я это уже чинил в старом NDim…»
 *
 * ⚠️ ГЛАВНЫЙ РИСК КЛАССА — «починить», прибив панель намертво. Прятание при прокрутке ВНИЗ
 * это КАНОН 1.x (`top_sticky_toolbar`, `translateY(-200%)`, 300 мс), а не дефект. Поэтому
 * первой здесь стоит проверка, что панель по-прежнему УМЕЕТ прятаться, и падает она громче
 * остальных: страж, требующий «видна всегда», принял бы за успех потерю задуманного поведения.
 *
 * Дефект живёт в другом месте: при смене вкладки позиция прокрутки восстанавливается
 * ПРОГРАММНО, обработчик читает это как «листают вниз» и уводит панель.
 *
 * ⚠️ Между вкладками ходим КЛИКАМИ по кнопкам панели: переход по адресу пересоздал бы экран
 * и стёр обе позиции прокрутки, то есть измерял бы не то.
 *
 * Запуск: `npm run stand`, затем `node tools/verify-bug75.mjs` (+`--quick`).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const OUT = 'test-results/bug75';
const QUICK = process.argv.includes('--quick');
mkdirSync(OUT, { recursive: true });

const COMBOS = QUICK
  ? [['light', 390]]
  : [['light', 390], ['light', 1440], ['dark', 390], ['dark', 1440]];

const DEEP = 1200; // насколько глубоко листаем «Все» перед переключением

let pass = 0;
const fails = [];
function check(ok, what, detail = '') {
  if (ok) pass++;
  else {
    fails.push(`${what}${detail ? ' — ' + detail : ''}`);
    console.log(`  ❌ ${what}${detail ? ' — ' + detail : ''}`);
  }
}

const browser = await chromium.launch();
try {
  for (const [theme, width] of COMBOS) {
    const tag = `${theme}-${width}`;
    console.log(`\nПанель «Все / Мой NDim ID» (${theme}, ${width}):`);
    const ctx = await browser.newContext({ viewport: { width, height: 820 }, locale: 'ru-RU' });
    await ctx.addInitScript((v) => localStorage.setItem('ndim-theme', v), theme);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    await page.goto(`${BASE}/dims`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3200);

    /**
     * Видима ли панель В ОКНЕ. Меряем ПО САМОЙ КНОПКЕ «Все», а не по контейнеру `.toolbar`:
     * человек видит кнопки, а контейнер вдобавок несёт выдвижной ящик поиска и при уезде
     * может частью оставаться в кадре — по нему «видна» получалось на спрятанной панели.
     */
    const bar = () =>
      page.evaluate(() => {
        const all = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === 'Все');
        if (!all) return null;
        const r = all.getBoundingClientRect();
        const box = all.closest('.toolbar');
        return {
          top: Math.round(r.top),
          inView: r.bottom > 0 && r.top < innerHeight,
          y: Math.round(window.scrollY),
          hiddenClass: !!box && box.classList.contains('hidden'),
        };
      });

    check((await bar()) !== null, 'панель найдена на экране');
    check((await bar()).inView, 'в покое панель видна');

    // 1 · КАНОН 1.x: прокрутка вниз панель прячет. Если это перестанет работать —
    //     значит «починили», прибив панель, и потеряли задуманное поведение.
    await page.evaluate((y) => window.scrollTo(0, y), DEEP);
    await page.waitForTimeout(900);
    const scrolled = await bar();
    check(scrolled.inView === false, 'КАНОН 1.x: прокрутка вниз прячет панель', `top=${scrolled.top}`);
    await page.screenshot({ path: `${OUT}/scrolled-${tag}.png` });

    // 2 · КАНОН 1.x: прокрутка вверх её возвращает.
    await page.evaluate(() => window.scrollBy(0, -300));
    await page.waitForTimeout(900);
    check((await bar()).inView === true, 'КАНОН 1.x: прокрутка вверх возвращает панель');

    // 3 · САМ ДЕФЕКТ: уходим глубоко и переключаем вкладку.
    await page.evaluate((y) => window.scrollTo(0, y), DEEP);
    await page.waitForTimeout(900);
    await page.locator('button:visible', { hasText: /^Мой NDim ID$/ }).first().click();
    await page.waitForTimeout(1400);
    const mine = await bar();
    check(mine.inView === true, 'после перехода на «Мой NDim ID» панель видна', `top=${mine.top}, y=${mine.y}`);
    await page.screenshot({ path: `${OUT}/mine-${tag}.png` });

    // 4 · Возврат на «Все» — здесь позиция ВОССТАНАВЛИВАЕТСЯ программно, и раньше именно
    //     это уводило панель.
    await page.locator('button:visible', { hasText: /^Все$/ }).first().click();
    await page.waitForTimeout(1800);
    const back = await bar();
    check(back.inView === true, 'после возврата на «Все» панель видна', `top=${back.top}, y=${back.y}`);
    check(back.y > 0, 'после возврата на «Все» позиция прокрутки восстановлена (а не сброшена в 0)', `y=${back.y}`);
    await page.screenshot({ path: `${OUT}/back-${tag}.png` });

    // 5 · Круг повторяется — «иногда» владельца проверяем повторением, а не одним заходом.
    for (let round = 2; round <= 3; round++) {
      await page.locator('button:visible', { hasText: /^Мой NDim ID$/ }).first().click();
      await page.waitForTimeout(1200);
      const m = await bar();
      await page.locator('button:visible', { hasText: /^Все$/ }).first().click();
      await page.waitForTimeout(1600);
      const a = await bar();
      check(m.inView && a.inView, `круг ${round}: панель видна в обоих состояниях`, `mine top=${m.top}, all top=${a.top}`);
    }

    // 6 · После восстановления панель обязана снова СЛУШАТЬСЯ прокрутки — признак
    //     программной прокрутки не должен «залипнуть» и выключить поведение навсегда.
    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(900);
    check((await bar()).inView === false, 'после восстановления панель снова реагирует на прокрутку вниз');

    check(errors.length === 0, 'консоль чиста', errors.join(' | ').slice(0, 160));
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(`\nИтог: ${pass} зелёных, ${fails.length} провалов`);
if (fails.length) fails.forEach((f) => console.log('  ❌ ' + f));
process.exit(fails.length ? 1 : 0);

/**
 * Съёмщик наборов макетов — общий инструмент правила четырёх макетов.
 *
 * ЗАЧЕМ. Канон проекта требует показывать владельцу ЧЕТЫРЕ варианта, а урок `plans/11` добавил
 * к этому обязательный шаг: агент сам обязан посмотреть кадры РЯДОМ до показа — два неразличимых
 * кадра это не два варианта, а вариант и примечание к нему. Глазами по HTML этого не увидеть:
 * варианты переключаются кнопкой и в памяти не удерживаются.
 *
 * ЧТО ДЕЛАЕТ. Открывает файл макетов, обходит все варианты × обе темы × обе ширины и кладёт
 * кадры в test-results/<имя набора>/. Ничего не проверяет — это ПРИБОР, а не страж.
 *
 * Запуск:
 *   node tools/shoot-mockups.mjs design/account-mockups.html
 *   node tools/shoot-mockups.mjs design/account-mockups.html --only 1,3
 *
 * Опирается на дом стиля макетов проекта: панель `.picker` с кнопками `[data-v]`, кнопка темы
 * `#theme` и кнопка ширины `#width`. Набор, сделанный по-другому, надо снимать иначе — и это
 * повод привести его к дому стиля, а не чинить прибор.
 */

import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const file = process.argv[2];
if (!file) {
  console.error('Укажите файл макетов: node tools/shoot-mockups.mjs design/<имя>-mockups.html');
  process.exit(1);
}

const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > -1 ? process.argv[onlyArg + 1].split(',').map((s) => s.trim()) : null;

const setName = basename(file).replace(/-mockups\.html$/, '').replace(/\.html$/, '');
const outDir = resolve('test-results', `${setName}-mockups`);
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(resolve(file)).href);

const variants = await page.$$eval('.picker button[data-v]', (bs) =>
  bs.map((b) => ({ v: b.dataset.v, label: b.textContent.trim() })),
);
if (!variants.length) {
  console.error('В файле нет кнопок вариантов `.picker button[data-v]` — это не дом стиля макетов.');
  await browser.close();
  process.exit(1);
}

console.log(`Набор «${setName}»: ${variants.length} вариантов × 2 темы × 2 ширины`);

let shots = 0;
for (const width of ['390', '1440']) {
  // Ширина и тема переключаются КНОПКАМИ самого макета, а не подменой атрибутов: так снимается
  // ровно то состояние, которое увидит владелец, нажав ту же кнопку.
  const wNow = await page.$eval('#stage', (s) => s.dataset.w);
  if (wNow !== width) await page.click('#width');

  for (const theme of ['light', 'dark']) {
    const tNow = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    const isDark = tNow === 'dark';
    if ((theme === 'dark') !== isDark) await page.click('#theme');

    for (const { v, label } of variants) {
      if (only && !only.includes(v)) continue;
      await page.click(`.picker button[data-v="${v}"]`);
      await page.waitForTimeout(120);
      const name = `V${v}-${width}-${theme}.png`;
      await page.screenshot({ path: resolve(outDir, name), fullPage: true });
      shots += 1;
      console.log(`  ${name.padEnd(20)} ${label}`);
    }
  }
}

await browser.close();
console.log(`\nСнято ${shots} кадров → ${outDir}`);
console.log('Теперь посмотрите их РЯДОМ: неразличимые варианты переделываются ДО показа владельцу.');

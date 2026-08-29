/**
 * Съёмщик наборов макетов — общий инструмент правила четырёх макетов.
 *
 * ЗАЧЕМ. Канон проекта требует показывать владельцу ЧЕТЫРЕ варианта, а урок `plans/11` добавил
 * к этому обязательный шаг: агент сам обязан посмотреть кадры РЯДОМ до показа — два неразличимых
 * кадра это не два варианта, а вариант и примечание к нему. Глазами по HTML этого не увидеть:
 * варианты переключаются кнопкой и в памяти не удерживаются.
 *
 * ЧТО ДЕЛАЕТ. Открывает файл макетов, обходит все варианты × обе темы × ВСЕ ширины набора и
 * кладёт кадры в test-results/<имя набора>/. Ничего не проверяет — это ПРИБОР, а не страж.
 *
 * Запуск:
 *   node tools/shoot-mockups.mjs design/account-mockups.html
 *   node tools/shoot-mockups.mjs design/account-mockups.html --only 1,3
 *
 * Опирается на дом стиля макетов проекта: панель `.picker` с кнопками `[data-v]`, кнопка темы
 * `#theme` и кнопка ширины `#width`. Набор, сделанный по-другому, надо снимать иначе — и это
 * повод привести его к дому стиля, а не чинить прибор.
 *
 * ШИРИНЫ. Кнопка `#width` — тумблер 390 ↔ 1440, она есть у всех наборов. Средняя ширина 1024
 * появилась позже и живёт отдельной кнопкой `#width-mid`: на 2026-08-29 она есть у 4 наборов
 * из 13. Поэтому 1024 снимается ТОЛЬКО там, где кнопка действительно есть, — иначе прибор
 * ломался бы на девяти старых наборах ради удобства четырёх новых.
 * 🔴 Ширина после каждого переключения ПРОВЕРЯЕТСЯ по `#stage[data-w]`, а не берётся на веру:
 * до этой правки один клик считался достигшим цели по построению, и промах дал бы кадр с
 * именем одной ширины и содержимым другой — молчаливо неверный артефакт. Из 1024 тумблер
 * `#width` ведёт в 390, а не в 1440, так что «один клик = одна цель» тут уже неверно.
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

// Средняя ширина — только если у набора есть её кнопка (см. «ШИРИНЫ» в шапке).
const hasMid = (await page.$('#width-mid')) !== null;
const widths = hasMid ? ['390', '1024', '1440'] : ['390', '1440'];

// Ширина и тема переключаются КНОПКАМИ самого макета, а не подменой атрибутов: так снимается
// ровно то состояние, которое увидит владелец, нажав ту же кнопку. Кликаем, пока `#stage`
// не покажет нужную ширину, и сдаёмся с внятной ошибкой вместо кадра под чужим именем.
async function setWidth(width) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const now = await page.$eval('#stage', (s) => s.dataset.w);
    if (now === width) return;
    await page.click(width === '1024' ? '#width-mid' : '#width');
  }
  const now = await page.$eval('#stage', (s) => s.dataset.w);
  throw new Error(
    `Ширина ${width} недостижима: после четырёх кликов #stage[data-w] = ${now}. ` +
      'Кнопки ширины набора разошлись с домом стиля — приводите набор, а не прибор.',
  );
}

console.log(`Набор «${setName}»: ${variants.length} вариантов × 2 темы × ${widths.length} ширины`);
if (!hasMid) console.log('  (кнопки #width-mid нет — ширина 1024 у этого набора не снимается)');

let shots = 0;
for (const width of widths) {
  await setWidth(width);

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

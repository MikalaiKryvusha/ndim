/**
 * Съёмщик КРОПОВ — узких кадров под страницу вычитки владельца.
 *
 * ЗАЧЕМ. Слово владельца 2026-08-29, когда вопрос о знаке пришёл к нему текстом: «*могли бы к
 * вопросу и скриншот приложить. Я по тексту видеть не умею, представляете?! (сарказм)*».
 * Вопрос уровня вкуса, поданный словами, — не вопрос, а работа, переложенная на владельца.
 *
 * ЧЕМ ОТЛИЧАЕТСЯ ОТ `shoot-mockups.mjs`. Тот снимает НАБОР целиком: вариант × тема × ширина,
 * страницами, именами `V<n>-<ширина>-<тема>.png`. Этот снимает ОТДЕЛЬНЫЕ ЭЛЕМЕНТЫ и кладёт их
 * под собственными говорящими именами — потому что в страницу вычитки едет не страница макета,
 * а вырезанный кусок рядом с вопросом. Оба нужны, и подменять один другим не надо.
 *
 * Запуск:
 *   node tools/shoot-crops.mjs design/sign-dark-mockups.html <каталог назначения>
 *
 * Дом стиля: элемент, который надо снять, помечается `data-crop="<имя файла без .png>"`.
 * Каталог назначения берётся как есть (в том числе абсолютный путь в главную копию) и НЕ
 * чистится: рядом могут лежать кадры прошлых заходов правок, и стирать их — не дело прибора.
 */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [file, outArg] = process.argv.slice(2);
if (!file || !outArg) {
  console.error('Нужны два пути: node tools/shoot-crops.mjs <html> <каталог назначения>');
  process.exit(1);
}

const outDir = resolve(outArg);
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(resolve(file)).href);

const names = await page.$$eval('[data-crop]', (els) => els.map((e) => e.dataset.crop));
if (!names.length) {
  console.error('В файле нет ни одного элемента с `data-crop` — снимать нечего.');
  await browser.close();
  process.exit(1);
}

const seen = new Set();
for (const name of names) {
  // Два элемента с одним `data-crop` молча перезаписали бы друг друга: один кадр вместо двух,
  // и заметить это можно было бы только по счётчику. Падаем вслух.
  if (seen.has(name)) {
    await browser.close();
    throw new Error(`Имя кропа «${name}» встречается дважды — кадры затёрли бы друг друга.`);
  }
  seen.add(name);
}

for (const name of names) {
  const el = await page.$(`[data-crop="${name}"]`);
  await el.screenshot({ path: resolve(outDir, `${name}.png`) });
  const box = await el.boundingBox();
  console.log(`  ${(name + '.png').padEnd(24)} ${Math.round(box.width)}×${Math.round(box.height)} CSS-пикселей`);
}

await browser.close();
console.log(`\nСнято ${names.length} кропов → ${outDir}`);

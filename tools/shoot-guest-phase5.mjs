/**
 * Съёмщик макетов фазы 5 эпика гостя (`design/guest-phase5-mockups.html`) — ПРИБОР, не страж.
 *
 * Страница рисует варианты РЯДОМ (так выбирает владелец — все четыре перед глазами), поэтому
 * общий `shoot-mockups.mjs` с пикером ей не подходит: снимаем КАЖДУЮ СЕКЦИЮ (A–D) отдельным
 * кадром во всех состояниях — 2 темы × 2 ширины. Перед кадрами — минимальная проверка
 * «страница отрисовалась» (урок `shoot-catalog-place`: иначе владельцу уезжает пустая вкладка):
 * секций ровно 4, в каждой ровно 4 варианта-article, и каждая секция выше 200px.
 *
 * Запуск: node tools/shoot-guest-phase5.mjs
 * Кадры:  test-results/guest-phase5-mockups/<секция>-<ширина>-<тема>.png
 */

import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const FILE = 'design/guest-phase5-mockups.html';
const outDir = resolve('test-results', 'guest-phase5-mockups');
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(resolve(FILE)).href);

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}`);
  if (!ok) failures += 1;
};

const sections = await page.$$('main > section');
check(sections.length === 4, `секций ровно 4 (сейчас ${sections.length})`);
for (const [i, s] of sections.entries()) {
  const n = await s.$$eval('article', (a) => a.length);
  check(n === 4, `секция ${i + 1}: ровно 4 варианта (сейчас ${n})`);
}

const letters = ['A', 'B', 'C', 'D'];
let shots = 0;
for (const width of ['390', '1024']) {
  await page.click(`[data-width-btn="${width}"]`);
  for (const theme of ['light', 'dark']) {
    await page.click(`[data-theme-btn="${theme === 'dark' ? 'dark' : ''}"]`);
    await page.waitForTimeout(200);
    for (const [i, s] of (await page.$$('main > section')).entries()) {
      const box = await s.boundingBox();
      if (!box || box.height < 200) {
        check(false, `секция ${letters[i]} (${width}/${theme}) не отрисовалась (высота ${box?.height ?? 0})`);
        continue;
      }
      const name = `${letters[i]}-${width}-${theme}.png`;
      await s.screenshot({ path: resolve(outDir, name) });
      shots += 1;
    }
  }
}

await browser.close();
console.log(`\nСнято ${shots} кадров → ${outDir}`);
console.log(failures === 0 ? '✅ страница отрисована во всех состояниях' : `❌ провалов: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

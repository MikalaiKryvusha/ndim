/**
 * ПАРЫ КАДРОВ ДЛЯ СТРАНИЦЫ ВЫЧИТКИ — экран варианта в натуральную величину, светлая и тёмная
 * тема рядом, одной картинкой на вариант.
 *
 * Зачем отдельный прибор: страница вычитки растягивает картинку и увеличения не имеет, поэтому
 * полный лист набора (панель, подписи, разбор) превращает экран телефона в четверть кадра
 * (капкан STATUS 2026-09-13, интервью №083). Здесь снимается ТОЛЬКО рамка `.screen`.
 *
 * Работает с любым набором по дому стиля макетов: `.picker button[data-v]` · `#theme` · `.variant`.
 *
 *   node tools/shoot-review-pairs.mjs design/<набор>.html test-results/owner-reviews/<папка>
 *
 * [TESTED: 2026-09-13 · снят набор design/signin-progress-mockups.html, 4 пары прочитаны глазами]
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [file, outArg] = process.argv.slice(2);
if (!file || !outArg) {
  console.error('Нужно: node tools/shoot-review-pairs.mjs <набор.html> <папка кадров>');
  process.exit(2);
}
const out = resolve(outArg);
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 520, height: 1000 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(resolve(file)).href);
// Анимации замирают в ОДНОМ мгновении (1,3 с от начала) — пара светлой и тёмной темы обязана
// показать одно и то же. Не на нуле: первый кадр рисующегося знака — пустой штрих.
await page.addStyleTag({
  content: '*,*::before,*::after{animation-play-state:paused!important;animation-delay:-1.3s!important}',
});

const variants = await page.$$eval('.picker button[data-v]', (bs) => bs.map((b) => [b.dataset.v, b.textContent.trim()]));
for (const [v, label] of variants) {
  await page.click(`.picker button[data-v="${v}"]`);
  const shots = {};
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    await page.waitForTimeout(150);
    const frame = page.locator(`.variant[id="${v}"] .screen`).first();
    shots[theme] = await frame.screenshot();
  }
  // Склейка: две рамки рядом на нейтральном поле.
  const glue = await browser.newPage({ viewport: { width: 860, height: 820 }, deviceScaleFactor: 2 });
  const src = (b) => `data:image/png;base64,${b.toString('base64')}`;
  await glue.setContent(`<body style="margin:0;background:#dfe5ee;display:flex;gap:20px;padding:20px;width:max-content">
    <img src="${src(shots.light)}" style="width:390px"><img src="${src(shots.dark)}" style="width:390px"></body>`);
  const name = `V${v}.png`;
  await glue.locator('body').screenshot({ path: resolve(out, name) });
  await glue.close();
  console.log(`  ${name}  ${label}`);
}
await browser.close();
console.log(`Пары сняты → ${out}`);

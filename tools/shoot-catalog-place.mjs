/**
 * СЪЁМЩИК МАКЕТОВ «МЕСТО ОБЪЕКТА» — `design/catalog-place-mockups.html` (интервью №036, В1).
 *
 * Прибор НЕ страж: он ничего не выносит на приёмку продукта. Его работа — доказать, что страница,
 * которую я отправляю владельцу, ДЕЙСТВИТЕЛЬНО отрисовалась, а не открылась пустой. Правило
 * канона: проверять ПУБЛИКАЦИЮ, а не источник (`AGENT_GUIDE.md` → «Гигиена документов»).
 *
 * 🔑 Числа в проверках зашиты НАМЕРЕННО. Картинки рисует скрипт, и молча опустевший график
 * выглядел бы как исправная страница. Меняешь набор строк на странице — меняй и число здесь;
 * ровно так этот класс проверки уже ловил меня на графике веса голосов.
 *
 * Кадры — `test-results/catalog-place/` (вне git).
 *
 * Запуск: node tools/shoot-catalog-place.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const PAGE = 'file:///d:/work/ai_sandbox/ndim/design/catalog-place-mockups.html';
const OUT = 'test-results/catalog-place';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
let failures = 0;

for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 1180, height: 1400 }, colorScheme: theme });
  const page = await context.newPage();

  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(PAGE);
  await page.waitForTimeout(400);

  const ties = await page.$$eval('#tieRows rect', (n) => n.length);
  const arrows = await page.$$eval('#moveChart polygon', (n) => n.length);
  const bands = await page.$$eval('#bandChart rect', (n) => n.length);
  const rows = await page.$$eval('#kindsTbl tr', (n) => n.length);
  const variants = await page.$$eval('.variant', (n) => n.length);
  const cards = await page.$$eval('.mini', (n) => n.length);

  const say = (ok, what) => {
    console.log(`  ${ok ? '✅' : '❌'} ${what}`);
    if (!ok) failures += 1;
  };

  console.log(`\n— тема ${theme} —`);
  say(ties === 6, `шесть близнецов нарисованы — ${ties}`);
  say(arrows === 5, `пять стрелок сдвига — ${arrows}`);
  say(bands === 8, `четыре полосы × (фон + значение) = 8 — ${bands}`);
  say(rows === 6, `строк в таблице видов 6 — ${rows}`);
  say(variants === 4, `вариантов на выбор ровно 4 (правило четырёх макетов) — ${variants}`);
  say(cards === 12, `4 варианта × 3 примера = 12 карточек — ${cards}`);
  say(errors.length === 0, `консоль чиста — ошибок ${errors.length}${errors[0] ? ': ' + errors[0] : ''}`);

  await page.screenshot({ path: `${OUT}/place-${theme}.png`, fullPage: true });
  await context.close();
}

await browser.close();
console.log(`\nкадры: ${OUT}/place-light.png · place-dark.png`);
console.log(failures ? `\n❌ провалов: ${failures}` : '\n✅ страница отрисована в обеих темах');
process.exit(failures ? 1 : 0);

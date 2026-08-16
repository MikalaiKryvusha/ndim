/**
 * СЪЁМЩИК ГРАФИКА ВЕСА ГОЛОСОВ — `design/vote-weight-curve.html` (интервью №036, В2).
 *
 * Заказан владельцем дословно 2026-08-16: «нарисуй мне график весов рейтинга и количество оценок.
 * Я понимаю математику не цифрами, а когда вижу характер графика визуально».
 *
 * Прибор НЕ страж: он ничего не выносит на приёмку продукта. Его работа — доказать, что страница,
 * которую я отправляю владельцу, ДЕЙСТВИТЕЛЬНО отрисовалась, а не открылась пустой. Правило
 * канона: проверять ПУБЛИКАЦИЮ, а не источник (`AGENT_GUIDE.md` → «Гигиена документов», п. 10).
 * Кадры кладутся в `test-results/vote-curve/` (вне git).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const PAGE = 'file:///d:/work/ai_sandbox/ndim/design/vote-weight-curve.html';
const OUT = 'test-results/vote-curve';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
let failures = 0;

for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 1500 }, colorScheme: theme });
  const page = await context.newPage();

  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(PAGE);
  await page.waitForTimeout(400);

  // Кривые рисует скрипт: пустой набор `polyline` означает, что график не построился вовсе.
  const curves = await page.$$eval('polyline', (ns) =>
    ns.map((n) => (n.getAttribute('points') || '').split(' ').filter(Boolean).length),
  );
  const rows = await page.$$eval('#tbl tbody tr', (n) => n.length);
  const note = await page.$eval('#realcase', (n) => n.textContent.trim());

  const say = (ok, what) => {
    console.log(`  ${ok ? '✅' : '❌'} ${what}`);
    if (!ok) failures += 1;
  };

  console.log(`\n— тема ${theme} —`);
  // Два графика × 4 семейства кривых = 8 линий.
  say(curves.length === 8, `линий на странице 8 — ${curves.length}`);
  say(curves.every((n) => n > 100), `каждая линия несёт точки — минимум ${Math.min(...curves)}`);
  // Число строк зашито намеренно: таблицу заполняет скрипт, и молча опустевшая таблица выглядела
  // бы как «всё в порядке». Меняешь набор строк на странице — меняй и это число (уже ловило меня).
  say(rows === 11, `строк в таблице 11 — ${rows}`);
  say(note.includes('14 голосов'), 'подпись живого примера подставлена');
  say(errors.length === 0, `консоль чиста — ошибок ${errors.length}${errors[0] ? ': ' + errors[0] : ''}`);

  await page.screenshot({ path: `${OUT}/curve-${theme}.png`, fullPage: true });
  await context.close();
}

await browser.close();
console.log(`\nкадры: ${OUT}/curve-light.png · curve-dark.png`);
console.log(failures ? `\n❌ провалов: ${failures}` : '\n✅ страница отрисована в обеих темах');
process.exit(failures ? 1 : 0);

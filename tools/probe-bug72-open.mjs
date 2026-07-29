/** Разовый осмотр: какие кнопки есть в панели «Измерений» и что открывает ящик поиска. */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

await page.goto(BASE + '/dims', { waitUntil: 'domcontentloaded' });
await page.locator('input.search').first().waitFor({ state: 'attached', timeout: 20000 });
await page.waitForTimeout(1500);

const before = await page.evaluate(() =>
  [...document.querySelectorAll('.toolbar button')].map((b, i) => ({
    i,
    cls: b.className,
    expanded: b.getAttribute('aria-expanded'),
    label: (b.getAttribute('aria-label') || b.title || b.textContent || '').trim().slice(0, 30),
  })),
);
console.log('кнопки панели:', JSON.stringify(before, null, 1));
console.log('toolbar классы:', await page.evaluate(() => document.querySelector('.toolbar')?.className));

// Жмём каждую кнопку с aria-expanded и смотрим, открылся ли ящик.
for (const b of before.filter((b) => b.expanded !== null)) {
  await page.evaluate((i) => document.querySelectorAll('.toolbar button')[i].click(), b.i);
  await page.waitForTimeout(600);
  const open = await page.evaluate(() => document.querySelector('.toolbar')?.className);
  const h = await page.evaluate(() => {
    const d = document.querySelector('.drawer');
    return d ? getComputedStyle(d).maxHeight + ' / rect ' + Math.round(d.getBoundingClientRect().height) : 'нет';
  });
  console.log(`  после клика по кнопке ${b.i} (${b.cls}): toolbar="${open}", drawer maxHeight=${h}`);
}

/*
 * СТРОГОЕ A/B в одном процессе: одно и то же поле, один и тот же способ ввода, отличается
 * ТОЛЬКО состояние ящика. Три повтора на каждое состояние — чтобы это не было одиночной удачей.
 */
const input = page.locator('input.search').first();
const toggle = async () => {
  await page.evaluate(() => document.querySelectorAll('.toolbar button')[2].click());
  await page.waitForTimeout(600);
};
const typeWord = async () => {
  await input.fill('');
  await input.focus();
  for (const ch of 'Кошки') {
    await input.type(ch);
    await page.waitForTimeout(80);
  }
  return input.inputValue();
};

console.log('\nA/B — одно поле, один способ ввода, отличается только состояние ящика:');
for (let n = 1; n <= 3; n++) {
  const openNow = await page.evaluate(() => !!document.querySelector('.toolbar.open'));
  if (!openNow) await toggle();
  const opened = await typeWord();

  await toggle(); // закрываем
  const closed = await typeWord();

  console.log(
    `  повтор ${n}: ОТКРЫТ → "${opened}" ${opened === 'Кошки' ? '✅' : '❌'}   ·   ` +
      `ЗАКРЫТ → "${closed}" ${closed === 'Кошки' ? '✅' : '❌ реверс'}`,
  );
}

await browser.close();

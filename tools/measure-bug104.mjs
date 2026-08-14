/**
 * ЗАМЕР ЦЕЛИ РАСКРЫТИЯ КАРТОЧКИ СВЯЗИ — `bugs/104`, шаг 0 (ПРИБОР, не страж).
 *
 * Жалоба владельца «нужно целиться в имя» доказывается ЧИСЛОМ до кода (канон `bugs/17`/`bugs/80`:
 * «мелко» — это величина): прямоугольник кнопки `.who` против прямоугольника всей верхней
 * строки `.head` — какую долю строки занимает цель сегодня.
 *
 * Запуск: `npm run stand` → `node tools/measure-bug104.mjs`
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';

const browser = await chromium.launch();
try {
  for (const width of [390, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 860 } });
    await page.goto(`${BASE}/relations`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.card .head', { timeout: 20000 });
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => {
      const head = document.querySelector('.card .head');
      const who = document.querySelector('.card .head .who');
      if (!head || !who) return null;
      const h = head.getBoundingClientRect();
      const w = who.getBoundingClientRect();
      return {
        head: { w: Math.round(h.width), h: Math.round(h.height), area: Math.round(h.width * h.height) },
        who: { w: Math.round(w.width), h: Math.round(w.height), area: Math.round(w.width * w.height) },
      };
    });
    if (!m) {
      console.error(`${width}px: .head/.who не найдены — карточек нет? Стенд с данными поднят?`);
      process.exitCode = 1;
    } else {
      const share = ((m.who.area / m.head.area) * 100).toFixed(1);
      console.log(`${width}px: цель .who ${m.who.w}×${m.who.h} (${m.who.area}px²) из строки ` +
        `.head ${m.head.w}×${m.head.h} (${m.head.area}px²) → цель занимает ${share} % строки`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}

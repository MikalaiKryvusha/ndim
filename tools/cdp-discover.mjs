/**
 * ОБЩИЙ ПРИБОР РАЗВЕДКИ ЧУЖОЙ СТРАНИЦЫ через отладочный порт браузера владельца.
 *
 * Задача одна: понять, ЕСТЬ ЛИ У СТРАНИЦЫ СВОЙ API и что он отдаёт, — прежде чем писать
 * извлечение. На Вордстате этот приём окупился сразу: нашёлся `wordstat/api/getTable`, и вместо
 * ковыряния разметки мы читаем `totalValue` из JSON (`researches/30`, приложение C).
 *
 * ── AUTH ───────────────────────────────────────────────────────────────────────────────────
 * Подключается к УЖЕ ОТКРЫТОМУ браузеру владельца (CDP, порт 9222) и работает в его сессии.
 * Не логинится, паролей не знает, ничего не нажимает — только переходит по адресу и слушает сеть.
 *
 * Запуск:
 *   node tools/cdp-discover.mjs "https://ads.google.com/aw/keywordplanner/ideas" gads
 *   node tools/cdp-discover.mjs "<адрес>" <имя-папки-для-слепка>
 *
 * Кладёт в `test-results/discover/<имя>/`: HTML, список ответов сети с телами, сводку.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const URL = process.argv[2];
const NAME = process.argv[3] ?? 'probe';
if (!URL) {
  console.error('Укажите адрес: node tools/cdp-discover.mjs "<url>" <имя>');
  process.exit(1);
}
const DIR = `test-results/discover/${NAME}`;

let browser;
try {
  browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
} catch {
  console.error(`❌ Chrome с портом отладки не найден. Запустите:

  & "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\\Users\\krinik\\chrome-debug"`);
  process.exit(1);
}

const context = browser.contexts()[0] ?? (await browser.newContext());
const page = await context.newPage();
mkdirSync(DIR, { recursive: true });

/** Всё, что похоже на данные: JSON, protobuf-подобные ответы, batchexecute. */
const captured = [];
page.on('response', async (res) => {
  const url = res.url();
  const ct = res.headers()['content-type'] ?? '';
  const interesting = /json|javascript|protobuf|text\/plain/i.test(ct) && res.request().method() !== 'OPTIONS';
  if (!interesting) return;
  try {
    const text = await res.text();
    if (text.length < 40) return;
    captured.push({ url, status: res.status(), type: ct, size: text.length, head: text.slice(0, 600) });
  } catch {
    /* тело недоступно — бывает у редиректов и стримов */
  }
});

try {
  console.log(`🔎 разведка: ${URL}`);
  // Не `networkidle`: живые страницы держат соединения открытыми и тишины не наступает никогда
  // (на этом уже упал первый прогон по Вордстату).
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(9000);

  const html = await page.content();
  writeFileSync(`${DIR}/page.html`, html, 'utf8');
  writeFileSync(`${DIR}/network.json`, JSON.stringify(captured, null, 2), 'utf8');

  const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '').trim();
  console.log(`\n📄 заголовок: «${title}»`);
  console.log(`   адрес после переходов: ${page.url().slice(0, 130)}`);
  console.log(`   HTML: ${(html.length / 1024).toFixed(0)} КБ → ${DIR}/page.html`);
  console.log(`\n🌐 ответов с данными поймано: ${captured.length} → ${DIR}/network.json`);

  // Показываем самые крупные — данные обычно там, а не в мелких служебных ответах.
  for (const c of [...captured].sort((a, b) => b.size - a.size).slice(0, 12)) {
    console.log(`   ${String(c.size).padStart(8)} б  ${c.url.slice(0, 105)}`);
  }
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
}

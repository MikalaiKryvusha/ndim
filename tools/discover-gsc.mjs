/**
 * РАЗВЕДКА СТРАНИЦ GSC (только чтение) — слепок того, что отдаёт консоль, для пиннинга
 * извлечения в `tools/console-coverage.mjs` (plans/41, шаг 2). Ни одного клика: навигация по
 * прямым адресам отчётов + чтение DOM и сетевых ответов. Слепки — в test-results/console-coverage/.
 *
 * Запуск: node tools/discover-gsc.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const CDP = 'http://127.0.0.1:9222';
const SCRATCH = 'test-results/console-coverage';
mkdirSync(SCRATCH, { recursive: true });

const RES = 'sc-domain:ndimspace.app';
const PAGES = [
  ['index', `https://search.google.com/search-console/index?resource_id=${encodeURIComponent(RES)}`],
  ['performance', `https://search.google.com/search-console/performance/search-analytics?resource_id=${encodeURIComponent(RES)}&num_of_months=3`],
];

const browser = await chromium.connectOverCDP(CDP);
const ctx = browser.contexts()[0];
const page = await ctx.newPage();

const responses = [];
page.on('response', async (r) => {
  const url = r.url();
  const ct = (r.headers()['content-type'] ?? '');
  if (!/json|text\/plain|javascript/.test(ct)) return;
  if (!/search\.google\.com|searchconsole/.test(url)) return;
  try {
    const body = await r.text();
    if (body.length > 100 && body.length < 3_000_000) responses.push({ url, len: body.length, body: body.slice(0, 200_000) });
  } catch { /* тело могло уже уйти */ }
});

for (const [name, url] of PAGES) {
  responses.length = 0;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(12000); // отчёты дорисовываются асинхронно
  const text = await page.evaluate(() => document.body.innerText);
  writeFileSync(`${SCRATCH}/gsc-${name}-text.txt`, text, 'utf8');
  writeFileSync(`${SCRATCH}/gsc-${name}-net.json`, JSON.stringify(responses.map(({ url, len }) => ({ url, len })), null, 2), 'utf8');
  writeFileSync(`${SCRATCH}/gsc-${name}-net-bodies.txt`, responses.map((r) => `=== ${r.url}\n${r.body}`).join('\n\n'), 'utf8');
  console.log(`${name}: текст ${text.length} зн., сетевых ответов ${responses.length} → ${SCRATCH}/gsc-${name}-*`);
}
await page.close();
await browser.close();

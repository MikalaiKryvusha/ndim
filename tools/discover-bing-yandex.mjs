/**
 * РАЗВЕДКА Bing Webmaster и Яндекс.Вебмастера (только чтение) — слепки для пиннинга извлечения
 * в `tools/console-coverage.mjs` (plans/41, шаг 2). Навигация по прямым адресам, ни одного клика.
 *
 * Запуск: node tools/discover-bing-yandex.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const CDP = 'http://127.0.0.1:9222';
const SCRATCH = 'test-results/console-coverage';
mkdirSync(SCRATCH, { recursive: true });

const SITE = 'https://ndimspace.app';
const PAGES = [
  ['bing-home', `https://www.bing.com/webmasters/home?siteUrl=${encodeURIComponent(SITE + '/')}`],
  ['bing-sitemaps', `https://www.bing.com/webmasters/sitemaps?siteUrl=${encodeURIComponent(SITE + '/')}`],
  ['bing-siteexplorer', `https://www.bing.com/webmasters/siteexplorer?siteUrl=${encodeURIComponent(SITE + '/')}`],
  ['ya-dashboard', 'https://webmaster.yandex.ru/site/https:ndimspace.app:443/dashboard/'],
  ['ya-indexing', 'https://webmaster.yandex.ru/site/https:ndimspace.app:443/indexing/insearch/'],
];

const browser = await chromium.connectOverCDP(CDP);
const ctx = browser.contexts()[0];
const page = await ctx.newPage();

const responses = [];
page.on('response', async (r) => {
  const url = r.url();
  const ct = (r.headers()['content-type'] ?? '');
  if (!/json/.test(ct)) return;
  if (!/bing\.com|webmaster/.test(url)) return;
  try {
    const body = await r.text();
    if (body.length > 50 && body.length < 2_000_000) responses.push({ url, len: body.length, body: body.slice(0, 100_000) });
  } catch { /* пусто */ }
});

for (const [name, url] of PAGES) {
  responses.length = 0;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(10000);
    const text = await page.evaluate(() => document.body.innerText);
    writeFileSync(`${SCRATCH}/${name}-text.txt`, text, 'utf8');
    writeFileSync(`${SCRATCH}/${name}-net.json`, JSON.stringify(responses.map(({ url, len }) => ({ url, len })), null, 2), 'utf8');
    writeFileSync(`${SCRATCH}/${name}-net-bodies.txt`, responses.map((r) => `=== ${r.url}\n${r.body}`).join('\n\n'), 'utf8');
    console.log(`${name}: текст ${text.length} зн., json-ответов ${responses.length}`);
  } catch (e) {
    console.log(`${name}: ⚠️ ${e.message.split('\n')[0]}`);
  }
}
await page.close();
await browser.close();

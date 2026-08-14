/**
 * ЗОНД ЛОГИНОВ КОНСОЛЕЙ (только чтение): подключается к chrome-debug по CDP 9222, открывает
 * каждую консоль и докладывает конечный URL + заголовок. НИ ОДНОГО клика, ни одной отправки.
 */
import { chromium } from '@playwright/test';

const CDP = 'http://127.0.0.1:9222';
const TARGETS = [
  ['GSC', 'https://search.google.com/search-console'],
  ['Bing', 'https://www.bing.com/webmasters'],
  ['Я.Вебмастер', 'https://webmaster.yandex.ru/sites/'],
  ['Вордстат', 'https://wordstat.yandex.ru/'],
];

const browser = await chromium.connectOverCDP(CDP);
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
for (const [name, url] of TARGETS) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);
    const finalUrl = page.url();
    const title = await page.title();
    const loginish = /accounts\.google|login\.live|login\.microsoftonline|passport\.yandex|ServiceLogin|signin/i.test(finalUrl);
    console.log(`${name}: ${loginish ? '❌ НЕ залогинен' : '✅ похоже залогинен'} · ${finalUrl} · «${title}»`);
  } catch (e) {
    console.log(`${name}: ⚠️ ошибка навигации — ${e.message.split('\n')[0]}`);
  }
}
await page.close();
await browser.close();

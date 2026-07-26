/**
 * Снимок HTML-макета в PNG — чтобы показать варианты владельцу прямо в чате,
 * не заставляя его открывать файл руками.
 *
 * Запуск: node tools/shot-mockups.mjs <html> <png> [ширина]
 * Пример: node tools/shot-mockups.mjs design/dims-suggest-fab-mockups.html test-results/v.png 1500
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const [file, out, width = '1500'] = process.argv.slice(2);
if (!file || !out) {
  console.error('нужны два пути: <html> <png>');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(width), height: 1200 } });
await page.goto(pathToFileURL(resolve(file)).href);
// Даём шрифтам и градиентам осесть: снимок «на лету» врёт о макете (EXP-0048).
await page.waitForTimeout(400);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`снято: ${out}`);

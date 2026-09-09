import { chromium } from 'playwright';
import path from 'node:path';
import { grantAppCheckDebug } from './tools/lib/app-check-debug.mjs';
const БАЗА = 'https://ndim-stage.web.app';
const КАРТА = '/ru/dimension/stanford-s-sapolsky-on-depression-in-u-s-ccwi7h6b';
const out = process.argv[2];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 430, height: 940 }, deviceScaleFactor: 2 });
await grantAppCheckDebug(ctx, { required: false, quiet: true });
const p = await ctx.newPage();
const ошибки = [];
p.on('console', (m) => { if (m.type() === 'error') ошибки.push(m.text().slice(0, 200)); });
const след = () => p.evaluate(() => { try { return sessionStorage.getItem('ndim-rated-just-now'); } catch { return 'НЕТ ДОСТУПА'; } });

await p.goto(БАЗА + КАРТА, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.locator('section[data-door] button[data-star][aria-label="8"]').first().click();
for (const с of [1, 2, 3, 5, 8]) {
  await p.waitForTimeout(с === 1 ? 1000 : 1000 * (с - (с === 2 ? 1 : с === 3 ? 2 : с === 5 ? 3 : 5)));
  console.log(`   след через ~${с} с:`, await след());
}
await p.screenshot({ path: path.join(out, '1-карточка.png') });

const вход = p.getByRole('link', { name: /Войти в Пространство/i }).first();
if (await вход.count()) await вход.click();
await p.waitForURL(/profile/, { timeout: 45000 }).catch(() => {});
await p.waitForTimeout(10000);
console.log('   адрес:', p.url());
console.log('   след на профиле:', await след());
const блок = await p.evaluate(() => {
  const к = document.querySelector('.rated-card');
  return к ? { есть: true, текст: к.innerText.replace(/\n+/g, ' | ').slice(0, 200) } : { есть: false, экран: document.body.innerText.slice(0, 120).replace(/\n+/g, ' | ') };
});
console.log('   БЛОК:', JSON.stringify(блок));
await p.screenshot({ path: path.join(out, '2-профиль.png'), fullPage: false });
console.log('   ошибки:', ошибки.length ? ошибки.slice(0, 4) : 'нет');
await b.close();

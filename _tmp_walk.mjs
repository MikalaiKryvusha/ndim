import { chromium } from 'playwright';
import path from 'node:path';
const БАЗА = 'https://ndim-stage.web.app';
const КАРТА = '/ru/dimension/stanford-s-sapolsky-on-depression-in-u-s-ccwi7h6b';
const out = process.argv[2];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 430, height: 940 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const ошибки = [];
p.on('console', (m) => { if (m.type() === 'error') ошибки.push(m.text().slice(0, 160)); });

const след = () => p.evaluate(() => { try { return sessionStorage.getItem('ndim-rated-just-now'); } catch { return 'НЕТ ДОСТУПА'; } });

console.log('1. Человек пришёл из поиска на карточку');
await p.goto(БАЗА + КАРТА, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
console.log('   заголовок:', (await p.locator('h1').first().textContent())?.trim().slice(0, 50));
console.log('   след до жеста:', await след());

console.log('2. Ставит восьмую звезду');
const звёзды = p.locator('[data-star]');
console.log('   звёзд на карточке:', await звёзды.count());
await звёзды.nth(8).click();
await p.waitForTimeout(4000);
console.log('   след ПОСЛЕ жеста:', await след());
await p.screenshot({ path: path.join(out, '1-карточка.png') });

console.log('3. Жмёт кнопку внутрь');
const вход = p.locator('[data-door-enter]');
console.log('   кнопка видна:', await вход.isVisible());
await вход.click();
await p.waitForURL(/profile/, { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(9000);
console.log('   адрес:', p.url());
console.log('   след на профиле:', await след());
const блок = await p.evaluate(() => {
  const к = document.querySelector('.rated-card');
  return k_(к);
  function k_(к) { return к ? { есть: true, текст: к.innerText.replace(/\n+/g, ' | ').slice(0, 160) } : { есть: false }; }
});
console.log('   БЛОК «ВЫ ОЦЕНИЛИ»:', JSON.stringify(блок));
await p.screenshot({ path: path.join(out, '2-профиль.png'), fullPage: false });
console.log('   ошибки консоли:', ошибки.length ? ошибки.slice(0, 3) : 'нет');
await b.close();

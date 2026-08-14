// ПРИЁМОЧНЫЙ ПРИБОР шага 2 `plans/39` — живой Chromium: человек, память, адрес, мост.
// Гонится против СОБРАННОГО сайта (vite preview --strictPort --port 4173, поднять заранее).
// Кадры: --out <каталог> (обязателен для секции кадров; без него кадры пропускаются).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://localhost:4173';
const outIdx = process.argv.indexOf('--out');
const SHOTS = outIdx > -1 ? process.argv[outIdx + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed += 1;
};

const browser = await chromium.launch();

/** Свежий контекст с заданной локалью и, опционально, памятью языка. */
async function person({ locale, memory, width = 1440 }) {
  const ctx = await browser.newContext({ locale, viewport: { width, height: 900 } });
  if (memory) await ctx.addInitScript(`try { localStorage.setItem('ndim-lang', '${memory}'); } catch {}`);
  return ctx;
}

console.log('\n— 1. Корень-распознаватель: пустая память → язык браузера —');
{
  const ctx = await person({ locale: 'ru-RU' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/');
  await page.waitForURL('**/ru');
  check('ru-браузер уехал на /ru', page.url().endsWith('/ru'), page.url());
  await ctx.close();

  const ctx2 = await person({ locale: 'de-DE' });
  const page2 = await ctx2.newPage();
  await page2.goto(BASE + '/');
  await page2.waitForURL('**/en');
  check('de-браузер уехал на /en (x-default-правило)', page2.url().endsWith('/en'), page2.url());
  await ctx2.close();
}

console.log('\n— 2. Корень: письмо входа уводит в /profile с НЕТРОНУТЫМ query —');
{
  const ctx = await person({ locale: 'ru-RU' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/?mode=signIn&oobCode=abc123&apiKey=k');
  await page.waitForURL('**/profile*');
  const u = new URL(page.url());
  check('высадка в /profile', u.pathname === '/profile', u.pathname);
  check('query доехал целиком', u.search.includes('oobCode=abc123') && u.search.includes('mode=signIn'), u.search);
  await ctx.close();
}

console.log('\n— 3. 🔴 ГЛАВНОЕ: человек с «ru» в памяти на /en ОСТАЁТСЯ на английском —');
{
  // Память сидируется РУКАМИ один раз, а не addInitScript: тот исполняется при КАЖДОЙ
  // навигации и затёр бы запись моста перед заходом внутрь приложения (артефакт прибора).
  const ctx = await person({ locale: 'ru-RU' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/menu');
  await page.evaluate(() => localStorage.setItem('ndim-lang', 'ru'));
  await page.goto(BASE + '/en');
  await page.waitForLoadState('networkidle');
  check('адрес не сместился', page.url().endsWith('/en'), page.url());
  check('<html lang="en">', await page.locator('html').getAttribute('lang') === 'en');
  const h1 = await page.locator('h1').first().textContent();
  check('заголовок английский', (h1 ?? '').includes('Welcome'), h1 ?? '');

  // МОСТ «адрес → память»: адрес обязан ЗАПИСАТЬ выбор — внутри приложения будет английский.
  const mem = await page.evaluate(() => localStorage.getItem('ndim-lang'));
  check('мост записал память: en', mem === 'en', String(mem));

  // Проваливаемся внутрь приложения (личный экран) — язык ТОТ ЖЕ.
  await page.goto(BASE + '/menu');
  await page.waitForLoadState('networkidle');
  check('внутри приложения — тот же английский', await page.locator('html').getAttribute('lang') === 'en');
  await ctx.close();
}

console.log('\n— 4. Обратное плечо: «en» в памяти на /ru видит русский —');
{
  const ctx = await person({ locale: 'en-US', memory: 'en' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/ru');
  await page.waitForLoadState('networkidle');
  check('<html lang="ru">', await page.locator('html').getAttribute('lang') === 'ru');
  const h1 = await page.locator('h1').first().textContent();
  check('заголовок русский', (h1 ?? '').includes('Добро пожаловать'), h1 ?? '');
  await ctx.close();
}

console.log('\n— 5. Переключатель на документе: /ru/menu/terms → /en/menu/terms —');
{
  const ctx = await person({ locale: 'ru-RU' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/ru/menu/terms');
  await page.waitForLoadState('networkidle');
  // Выпадашка языка в шапке: кнопка «Ru» → пункт «English»
  await page.locator('header .lang').click();
  await page.getByRole('menuitem', { name: 'English' }).click();
  await page.waitForURL('**/en/menu/terms');
  check('адрес сменился на /en/menu/terms', page.url().endsWith('/en/menu/terms'), page.url());
  check('<html lang="en">', await page.locator('html').getAttribute('lang') === 'en');
  const mem = await page.evaluate(() => localStorage.getItem('ndim-lang'));
  check('память пошла за выбором: en', mem === 'en', String(mem));
  await ctx.close();
}

if (SHOTS) {
  console.log('\n— 6. Кадры: лендинг /ru и /en · обе темы · 390 и 1440 —');
  for (const lang of ['ru', 'en']) {
    for (const width of [390, 1440]) {
      for (const theme of ['light', 'dark']) {
        const ctx = await person({ locale: 'ru-RU', width });
        if (theme === 'dark') await ctx.addInitScript(`try { localStorage.setItem('ndim-theme', 'dark'); } catch {}`);
        const page = await ctx.newPage();
        await page.goto(`${BASE}/${lang}`);
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: join(SHOTS, `landing-${lang}-${theme}-${width}.png`), fullPage: false });
        console.log(`  📸 landing-${lang}-${theme}-${width}.png`);
        await ctx.close();
      }
    }
  }
  // Документ и страница удаления — по кадру (тёмная, 390 — там теснее всего).
  for (const [name, path] of [['terms', '/en/menu/terms'], ['delete', '/ru/delete-account']]) {
    const ctx = await person({ locale: 'ru-RU', width: 390 });
    await ctx.addInitScript(`try { localStorage.setItem('ndim-theme', 'dark'); } catch {}`);
    const page = await ctx.newPage();
    await page.goto(BASE + path);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: join(SHOTS, `page-${name}-dark-390.png`), fullPage: false });
    console.log(`  📸 page-${name}-dark-390.png`);
    await ctx.close();
  }
}

await browser.close();
console.log(`\n${failed === 0 ? '✅ ПРИЁМКА ПРОЙДЕНА' : `❌ провалов ${failed}`}\n`);
process.exit(failed === 0 ? 0 : 1);

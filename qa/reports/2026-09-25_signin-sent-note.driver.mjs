// Разовый ручной прогон строки шага «Письмо отправлено» (интервью №096 В13 = А) на дев-стенде.
import { createRequire } from 'node:module';
const ROOT = process.cwd();
const require = createRequire(`${ROOT}/package.json`);
const { chromium } = require('playwright');
const OUT = `${ROOT}/test-results/sent-note`;
const WANT = { ru: 'Откройте письмо и нажмите ссылку — она откроет Вам вход в Пространство NDim Space.' };
let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures += 1; console.log(`${ok ? '  PASS' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
const browser = await chromium.launch();
try {
  for (const theme of ['light', 'dark']) {
    for (const width of [390, 1440]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU' });
      await ctx.addInitScript((t) => localStorage.setItem('ndim-theme', t), theme);
      const page = await ctx.newPage();
      await page.goto('http://localhost:5173/profile?as=none', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Войти по ссылке на почту' }).click({ timeout: 30000 });
      await page.locator('input[type="email"]').fill(`sent-note-${theme}-${width}@example.com`);
      await page.getByRole('button', { name: 'Получить ссылку для входа' }).click();
      const note = page.locator('.note').filter({ hasText: 'Откройте письмо' });
      await note.waitFor({ timeout: 30000 });
      const text = (await note.innerText()).trim();
      check(`${theme} ${width}: строка = вариант А владельца`, text === WANT.ru, `«${text}»`);
      check(`${theme} ${width}: «на этом устройстве» нет на экране`, !(await page.locator('body').innerText()).includes('на этом устройстве'));
      await page.screenshot({ path: `${OUT}/${theme}-${width}.png` });
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(`ИТОГ: провалов ${failures}`);
process.exitCode = failures === 0 ? 0 : 1;

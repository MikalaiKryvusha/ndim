// Разовая проверка: вкладка гостя на шаге «письмо отправлено» — открывает ли она профиль сама,
// когда ссылку из письма открыли во второй вкладке того же браузера (bugs/233, близнец В13).
import { createRequire } from 'node:module';
const ROOT = process.cwd();
const require = createRequire(`${ROOT}/package.json`);
const { chromium } = require('playwright');
const AUTH = 'http://127.0.0.1:9099';
const PROJECT = 'demo-ndim-dev';
const BASE = 'http://localhost:5173';
const email = `two-tabs-${Date.now()}@example.com`;
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, locale: 'ru-RU' });
  const a = await ctx.newPage();
  await a.goto(`${BASE}/profile?guest=1`, { waitUntil: 'domcontentloaded' });
  await a.getByRole('button', { name: 'Сохранить мои результаты' }).click({ timeout: 30000 });
  await a.waitForTimeout(800);
  const buttons = await a.getByRole('button').allInnerTexts();
  console.log('кнопки после «Сохранить»:', JSON.stringify(buttons.map((s) => s.trim()).filter(Boolean)));
  const mailBtn = a.getByRole('button', { name: /почт/i }).first();
  if (await mailBtn.count()) await mailBtn.click();
  await a.locator('input[type="email"]').fill(email);
  const send = a.getByRole('button', { name: /ссылк|Отправить|Получить/i }).first();
  await send.click();
  await a.getByText('Мы отправили Вам письмо').waitFor({ timeout: 30000 });
  console.log('вкладка А: шаг «письмо отправлено» показан');
  const res = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes = [] } = await res.json();
  const code = oobCodes.filter((c) => c.email === email).at(-1);
  if (!code) throw new Error('ссылки в эмуляторе нет');
  const b = await ctx.newPage();
  await b.goto(code.oobLink, { waitUntil: 'domcontentloaded' });
  await b.waitForTimeout(12000);
  console.log('вкладка Б после ссылки:', b.url());
  console.log('вкладка Б видит «Профиль сохранён»:', await b.getByText('Профиль сохранён').count());
  const stillSent = await a.getByText('Мы отправили Вам письмо').count();
  console.log('вкладка А через 12 с: шаг «письмо отправлено» всё ещё на экране:', stillSent, '· адрес', a.url());
  await a.screenshot({ path: `${ROOT}/test-results/sent-note/two-tabs-A.png` });
  await b.screenshot({ path: `${ROOT}/test-results/sent-note/two-tabs-B.png` });
} finally {
  await browser.close();
}

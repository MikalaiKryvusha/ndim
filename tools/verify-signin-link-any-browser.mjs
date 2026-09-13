/**
 * РУЧНОЙ ФУНКЦИОНАЛЬНЫЙ ПРОГОН — ВХОД ПО ССЫЛКЕ ИЗ ПИСЬМА В ЛЮБОМ БРАУЗЕРЕ (`bugs/233`, `bugs/235`).
 *
 * Решение владельца — интервью №084: В1 = А (адрес в ссылке + строка с адресом на экране),
 * В2 = А (экран «идёт вход» по макету V1 «Шаг двери»).
 *
 * Путь идёт ДВЕРЬЮ ПРОДУКТА, а не в обход: браузер А на двери входа просит письмо, эмулятор Auth
 * отдаёт выпущенную ссылку (письмо без почтового ящика, `EXP-0045`), браузер Б — отдельный
 * контекст Playwright со своим хранилищем — открывает её. Граница названа: два РАЗНЫХ движка
 * браузера этим не доказаны; доказано ровно то, чем дефект вызван, — у Б нет памяти А.
 *
 *   К6 · новый человек, чистый браузер Б → спиннер с адресом → вошёл своей почтой → свой профиль,
 *        без «Не удалось загрузить» (`bugs/235`) и без гостевой пилюли;
 *   К7 · КОНТРОЛЬ: в ссылке подменён адрес → вход НЕ состоялся ни под каким адресом.
 *
 * Кадры: test-results/signin-link-any-browser/ (обе темы, 390 и 1440).
 * Требует поднятого стенда: `npm run stand`. Запуск: node tools/verify-signin-link-any-browser.mjs
 *
 * [TESTED: 2026-09-13 · стенд, 12/0; мутант «без ensureSpaceExists» дал 2 провала адресно]
 */
import { mkdir } from 'node:fs/promises';
import { basename } from 'node:path';
import { chromium } from '@playwright/test';
import { portsFor, slotOf } from './lib/stand-slot.mjs';

const BASE = process.env.PROBE_BASE ?? `http://localhost:${portsFor(slotOf(basename(process.cwd())).slot).dev}`;
const AUTH = 'http://127.0.0.1:9099';
const PROJECT = 'demo-ndim-dev';
const SHOTS = 'test-results/signin-link-any-browser';
const DOWN = 'Не удалось загрузить данные';
const SPINNER = 'Выполняем вход в Пространство NDim Space';
const WHO = 'Вы входите в аккаунт с адресом электронной почты';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Кто вошёл по мнению самого Firebase: IndexedDB `firebaseLocalStorageDb` (см. verify-bug233, К0). */
const whoAmI = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('firebaseLocalStorageDb');
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('firebaseLocalStorage')) return resolve(null);
          const req = db.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
          req.onsuccess = () => {
            const u = (req.result ?? []).find((r) => String(r.fbase_key).startsWith('firebase:authUser:'));
            resolve(u ? { email: u.value.email ?? null, anonymous: u.value.isAnonymous === true } : null);
          };
          req.onerror = () => resolve(null);
        };
      }),
  );

const text = (page, needle) => page.evaluate((t) => document.body.innerText.includes(t), needle);

/** Браузер А просит письмо ДВЕРЬЮ ПРОДУКТА; возвращает ссылку, какой её отдал бы Firebase. */
async function letterFromDoor(browser, email) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/profile?as=none`);
  await page.getByRole('button', { name: 'Войти по ссылке на почту' }).click();
  await page.locator('input[type="email"]').fill(email);
  await page.getByRole('button', { name: 'Получить ссылку для входа' }).click();
  await page.getByText('Письмо отправлено').waitFor({ timeout: 15000 });
  await ctx.close();

  const codes = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`).then((r) => r.json());
  const mine = (codes.oobCodes ?? []).filter((c) => c.email === email && c.requestType === 'EMAIL_SIGNIN').at(-1);
  if (!mine) throw new Error(`эмулятор не выпустил письмо для ${email}`);
  // Боевой обработчик Firebase переводит человека на continueUrl, дописав код — собираем так же.
  const cont = new URL(new URL(mine.oobLink).searchParams.get('continueUrl'));
  cont.searchParams.set('mode', 'signIn');
  cont.searchParams.set('oobCode', mine.oobCode);
  cont.searchParams.set('apiKey', 'demo-api-key');
  return cont;
}

await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch();
const stamp = Date.now();

try {
  // ═══ К6 · новый человек открывает письмо в чистом браузере ═══════════════════════════════════
  const EMAIL = `anybrowser-${stamp}@ndim.space`;
  console.log(`К6 · письмо открыто в ЧИСТОМ браузере Б (почта ${EMAIL}):`);
  {
    const link = await letterFromDoor(browser, EMAIL);
    check('письмо несёт адрес в ссылке', link.searchParams.get('email') === EMAIL, link.search.slice(0, 80));

    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    // Сеть Auth придерживается на 1,5 с: на эмуляторе вход длится миг, и спиннер иначе не поймать.
    await page.route('**/identitytoolkit.googleapis.com/**', async (r) => {
      await new Promise((ok) => setTimeout(ok, 1500));
      await r.continue();
    });
    await page.goto(link.href);
    const spinner = await page.getByText(SPINNER).waitFor({ timeout: 8000 }).then(() => true, () => false);
    const who = spinner && (await text(page, WHO)) && (await text(page, EMAIL));
    await page.screenshot({ path: `${SHOTS}/k6-spinner-390-light.png` });
    check('экран входа показал спиннер «Выполняем вход…»', spinner);
    check('строка называет аккаунт — адрес из письма', Boolean(who));

    // Задержку не снимаем: снятие посреди висящего запроса роняет прибор («Route is already handled»).
    await page.waitForTimeout(12000);
    const me = await whoAmI(page);
    const down = await text(page, DOWN);
    const addressAfter = new URL(page.url()).search;
    await page.screenshot({ path: `${SHOTS}/k6-after-390-light.png`, fullPage: true });
    check('вошёл своей почтой', me?.email === EMAIL && me?.anonymous === false, JSON.stringify(me));
    check('профиль открылся без «Не удалось загрузить» (bugs/235)', !down);
    check('адрес ссылки стёрт из строки браузера', !addressAfter.includes('email'), addressAfter || 'пусто');
    check('консоль чиста', errors.length === 0, errors.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ═══ К6б · тот же шаг «идёт вход» в тёмной теме и на 1440 — кадры для глаз ═══════════════════
  for (const [w, h, theme] of [[390, 844, 'dark'], [1440, 900, 'light'], [1440, 900, 'dark']]) {
    const email = `anybrowser-${stamp}-${w}${theme}@ndim.space`;
    const link = await letterFromDoor(browser, email);
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'ru-RU' });
    await ctx.addInitScript((t) => localStorage.setItem('ndim-theme', t), theme);
    const page = await ctx.newPage();
    await page.route('**/identitytoolkit.googleapis.com/**', async (r) => {
      await new Promise((ok) => setTimeout(ok, 2500));
      await r.continue();
    });
    await page.goto(link.href);
    const seen = await page.getByText(SPINNER).waitFor({ timeout: 8000 }).then(() => true, () => false);
    await page.screenshot({ path: `${SHOTS}/k6-spinner-${w}-${theme}.png` });
    check(`спиннер виден · ${w} · ${theme}`, seen);
    await ctx.close();
  }

  // ═══ К7 · КОНТРОЛЬ: адрес в ссылке подменён ═══════════════════════════════════════════════════
  console.log('\nК7 · контроль — в ссылке подменён адрес:');
  {
    const OWNER = `owner-${stamp}@ndim.space`;
    const link = await letterFromDoor(browser, OWNER);
    link.searchParams.set('email', `stranger-${stamp}@ndim.space`);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
    const page = await ctx.newPage();
    await page.goto(link.href);
    await page.waitForTimeout(6000);
    const me = await whoAmI(page);
    await page.screenshot({ path: `${SHOTS}/k7-forged-address.png`, fullPage: true });
    check('подменённый адрес не впустил никого', !me || me.anonymous === true, JSON.stringify(me));
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(`\nПРОВАЛОВ: ${failures} · кадры: ${SHOTS}/`);
process.exit(failures === 0 ? 0 : 1);

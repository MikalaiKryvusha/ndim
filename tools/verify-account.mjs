/**
 * Страж экрана «Управлять аккаунтом» — фаза 4 эпика `plans/15` (план `plans/18`).
 *
 * ЧТО СТЕРЕЖЁТ, в порядке важности:
 *   🔑 у ГОСТЯ двери нет, но «Выйти» есть — это замок `bugs/84`, в который упирался живой
 *      человек; и прямой заход гостя на /account его НЕ запирает;
 *   🔑 экран НЕ утверждает ничего про пароль — `providerData` этого не знает (`EXP-0109`),
 *      и строка «Пароль не задан» была бы выдумкой. Стережём отсутствие выдумки;
 *   · дверь в «Профиле» живая, слова «скоро» больше нет;
 *   · виджет «Мой аккаунт» показывает почту, дату в формате 1.x и способы входа;
 *   · не вошедшему экран предлагает войти, а не падает;
 *   · возврат в «Профиль» тёплый — навигация туда-обратно не роняет экран в холодный старт.
 *
 * ⚠️ ХОДИТ КЛИКАМИ, а не `goto`: `goto` стирает память приложения, и мерился бы холодный
 * старт вместо навигации (`EXP-0072`).
 *
 * ⚠️ ПОЧЕМУ ПРОВЕРЯЕТСЯ ИМЕННО ОТСУТСТВИЕ СЛОВА «пароль»: у пользователя стенда пароль ЕСТЬ
 * (`tools/seed-dev.mjs`), и соблазн написать «Пароль задан» максимален. Но Firebase такого
 * ответа не даёт: `providerId` у входа по ссылке и у входа паролем ОДИН И ТОТ ЖЕ (`password`).
 * Если кто-то однажды выведет это на экран — здесь станет красно.
 *
 * Запуск: `npm run stand`, затем `node tools/verify-account.mjs`.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const OUT = 'test-results/account';
mkdirSync(OUT, { recursive: true });

let pass = 0;
const fails = [];
function check(ok, what, detail = '') {
  if (ok) pass++;
  else {
    fails.push(`${what}${detail ? ' — ' + detail : ''}`);
    console.log(`  ❌ ${what}${detail ? ' — ' + detail : ''}`);
  }
}

/** Ошибки правил Firestore гостю — ожидаемое поведение продукта, а не дефект экрана. */
const EXPECTED = /permission|insufficient|Missing or insufficient permissions/i;

const browser = await chromium.launch();
try {
  for (const theme of ['light', 'dark']) {
    for (const width of [390, 1440]) {
      const tag = `${theme}-${width}`;
      console.log(`\n«Управлять аккаунтом» (${theme}, ${width}):`);

      const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU' });
      // Тему ставим ключом ДО загрузки: системный colorScheme тему продукта не меняет.
      await ctx.addInitScript((v) => localStorage.setItem('ndim-theme', v), theme);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => m.type() === 'error' && !EXPECTED.test(m.text()) && errors.push(m.text()));
      const text = () => page.evaluate(() => document.body.innerText || '');

      // ── 1 · вошедший человек: дверь на «Профиле» живая ────────────────────
      await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4500);
      const profile = await text();
      check(/Управление аккаунтом/.test(profile), 'в «Профиле» есть дверь «Управление аккаунтом»');
      check(!/скоро/.test(profile), '🔑 слова «скоро» на «Профиле» больше нет');
      const door = page.locator('a.arow[href="/account"]');
      const doorAlive = (await door.count()) > 0;
      check(doorAlive, 'дверь — ССЫЛКА (работают средний клик и «в новой вкладке»)');
      await page.screenshot({ path: `${OUT}/profile-door-${tag}.png` });

      // ── 2 · переход КЛИКОМ и содержимое виджета ───────────────────────────
      // ⚠️ Если двери нет, идём прямым адресом и НЕ падаем исключением: страж обязан
      // досчитать остальные проверки и выдать полный отчёт, а не умереть на первой.
      // (Поймано мутацией «вернуть строку „скоро“»: она роняла прогон на click.)
      if (doorAlive) await door.first().click();
      else await page.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      const acct = await text();
      check(/Управлять аккаунтом/.test(acct), 'заголовок экрана — «Управлять аккаунтом» (канон 1.x)');
      // ⚠️ Регистронезависимо НЕ по лени: `innerText` отдаёт текст КАК ОТРИСОВАНО, а заголовки
      // виджетов набраны `text-transform: uppercase` — на экране это «МОЙ АККАУНТ».
      // Первая редакция стража искала точное написание и краснела на исправном продукте.
      check(/мой аккаунт/i.test(acct), 'виджет «Мой аккаунт» на месте');
      check(/dev@ndim\.space/.test(acct), 'показана почта из сессии');
      check(/Создан/.test(acct), 'строка «Создан» на месте');
      // Формат 1.x: «28 февраля 2025 г. в 20:48» — год с «г.», склейка русским « в ».
      check(/\d{4}\s*г\.\s*в\s*\d{2}:\d{2}/.test(acct), 'дата создания в формате 1.x («… г. в ЧЧ:ММ»)', acct.slice(0, 220));
      check(/Способы входа/.test(acct), 'строка «Способы входа» на месте');
      check(/Почта/.test(acct), 'способ входа назван «Почта»');

      // 🔑 ГЛАВНОЕ: ни слова про пароль. У dev-пользователя пароль ЕСТЬ, но Firebase этого
      // не сообщает — значит и мы не имеем права утверждать (EXP-0109).
      check(!/[Пп]ароль/.test(acct), '🔑 экран НЕ утверждает ничего про пароль (EXP-0109)');
      await page.screenshot({ path: `${OUT}/account-${tag}.png`, fullPage: true });

      // ── 3 · возврат в «Профиль» тёплый ────────────────────────────────────
      await page.locator('a.back').first().click();
      await page.waitForTimeout(1800);
      const back = await text();
      check(/Управление аккаунтом/.test(back), 'возврат в «Профиль» кликом «назад» работает');
      check(!/Загрузка/.test(back), 'возврат ТЁПЛЫЙ — карточки «Загрузка» нет (ideas/18)');

      // ── 4 · ГОСТЬ: двери нет, «Выйти» есть, экран его не запирает ─────────
      await page.goto(`${BASE}/profile?as=guest`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4500);
      const guest = await text();
      check(!/Управление аккаунтом/.test(guest), '🔑 у ГОСТЯ двери «Управление аккаунтом» нет');
      check(/Выйти/.test(guest), '🔑 у ГОСТЯ «Выйти» есть — замок bugs/84 не вернулся');

      await page.goto(`${BASE}/account?as=guest`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3500);
      const guestAcct = await text();
      check(/гостем/i.test(guestAcct), '🔑 гость по прямой ссылке видит объяснение, а не тупик');
      check(/Сохранить результаты/.test(guestAcct), 'гостю предложен выход из положения');
      check(!/dev@ndim\.space/.test(guestAcct), 'гостю не показана чужая почта');
      await page.screenshot({ path: `${OUT}/account-guest-${tag}.png` });

      // ── 5 · не вошёл ──────────────────────────────────────────────────────
      await page.goto(`${BASE}/account?as=none`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3500);
      const none = await text();
      check(/Войдите, чтобы управлять аккаунтом/.test(none), 'не вошедшему экран предлагает войти');
      check(!/мой аккаунт/i.test(none), 'не вошедшему виджет аккаунта не показан');
      await page.screenshot({ path: `${OUT}/account-signedout-${tag}.png` });

      check(errors.length === 0, 'консоль чиста', errors.slice(0, 2).join(' | '));
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}

console.log(`\n${'─'.repeat(64)}`);
console.log(`Пройдено: ${pass}, провалено: ${fails.length}`);
if (fails.length) {
  console.log('\nПровалы:');
  for (const f of fails) console.log(`  · ${f}`);
  process.exit(1);
}
console.log(`Скриншоты — ${OUT}/`);

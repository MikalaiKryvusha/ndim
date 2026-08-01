/**
 * Страж СМЕНЫ ПОЧТЫ — фаза 5 эпика `plans/15` (план `plans/19`).
 *
 * Отдельный файл, а не строки в `verify-account.mjs`, по одной причине: этот прогон
 * НЕОБРАТИМО меняет почту пользователя стенда. Он обязан идти последним и в одиночку,
 * а страж ядра (фаза 4) должен оставаться прогоняемым сколько угодно раз.
 *
 * ЧТО СТЕРЕЖЁТ, в порядке важности:
 *   🔑 ТЕКСТ НЕЙТРАЛЕН. Нигде не утверждается «письмо отправлено» и нигде не говорится
 *      «адрес занят». При включённой в бою защите от перечисления почт письмо уходит,
 *      ТОЛЬКО если адрес свободен, и ошибки при этом нет: утвердительная форма — враньё
 *      половине людей, а «занят» — возврат утечки, которую платформа закрыла (ASVS 6.3.8);
 *   🔑 ПОДТВЕРЖДЕНИЕ ЛИЧНОСТИ ИДЁТ ССЫЛКОЙ НА ТЕКУЩИЙ АДРЕС — это и есть требуемое OWASP
 *      подтверждение со старого адреса, и оно же защита от того, кто сел за чужой экран;
 *   · валидации 1.x дословно (пустой адрес · адрес равен текущему);
 *   · порядок и тексты формы — канон 1.x;
 *   · сквозной путь: письмо подтверждения → возврат → письмо на новый адрес → наша
 *     страница-обработчик → почта РЕАЛЬНО сменилась;
 *   · `/auth/action` не падает на мусорном коде и на его отсутствии.
 *
 * ⚠️ ЧЕГО ЭТОТ СТРАЖ НЕ МОЖЕТ. Режим `recover-email` (ссылка «это была не я») на эмуляторе
 * НЕ ВОСПРОИЗВОДИТСЯ: код RECOVER_EMAIL не рождается на пути verifyBeforeUpdateEmail —
 * замерено в фазе 2, 2 прогона из 2 (`researches/24` §7.3). Этот путь остаётся
 * [NOT-TESTED] до проверки боем. Врать зелёным здесь нельзя.
 *
 * ⚠️ ПОСЛЕ ПРОГОНА ПЕРЕЗАПУСТИТЕ СТЕНД: почта dev-пользователя изменена, и автовход
 * стенда по прежнему адресу больше не сработает.
 *
 * Запуск: `npm run stand`, затем `node tools/verify-account-email.mjs`.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const AUTH = 'http://127.0.0.1:9099';
const PROJECT = 'demo-ndim-dev';
const CURRENT = 'dev@ndim.space';
const FRESH = `dev-moved-${Date.now()}@ndim.space`;
const OUT = 'test-results/account-email';
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

/** Свежий код нужного типа прямо из эмулятора — вместо письма (EXP-0045). */
async function lastCode(requestType) {
  const res = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes = [] } = await res.json();
  const mine = oobCodes.filter((c) => c.requestType === requestType);
  return mine[mine.length - 1] ?? null;
}

/** Утвердительные формы, которых на экране быть НЕ ДОЛЖНО ни на одном шаге. */
const FORBIDDEN = [
  /Письмо отправлено/i,
  /Мы отправили письмо на новый/i,
  /адрес занят/i,
  /уже используется/i, // текст ошибки 1.x уместен, но НЕ как реакция на смену почты
];

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, locale: 'ru-RU' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/permission|insufficient/i.test(m.text()) && errors.push(m.text()));
  // Отдельно собираем НЕУДАЧНЫЕ ответы с адресами: строка «Failed to load resource: 400» без
  // адреса ничего не доказывает, а гадать о причине — ровно то, что запрещает EXP-0063.
  const failedResponses = [];
  page.on('response', (r) => {
    if (r.status() >= 400) failedResponses.push(`${r.status()} ${r.url().replace(/key=[^&]+/, 'key=…')}`);
  });
  const text = () => page.evaluate(() => document.body.innerText || '');

  // ── 1 · страница-обработчик не падает на негодных ссылках ──────────────────
  console.log('\n/auth/action — негодные ссылки:');
  await page.goto(`${BASE}/auth/action`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  let t0 = await text();
  check(/нет ссылки из письма/i.test(t0), 'без кода — честная фраза, а не пустой экран', t0.slice(0, 120));
  await page.goto(`${BASE}/auth/action?mode=verifyEmail&oobCode=totally-made-up`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  t0 = await text();
  check(/истёк|уже использована|Не получилось/i.test(t0), 'мусорный код — честный отказ', t0.slice(0, 120));
  await page.screenshot({ path: `${OUT}/action-bad-code.png` });

  /*
   * Отсечка ПОСЛЕ негативных проб — и это не поблажка себе, а точность.
   *
   * Заведомо мусорный код даёт 400 на `accounts:resetPassword` (через этот эндпоинт устроен
   * `checkActionCode`), и такой отказ — ДОКАЗАТЕЛЬСТВО, что проба действительно сходила в сеть,
   * а не была срисована с разметки. Считать его дефектом — значит требовать, чтобы негативный
   * тест не срабатывал.
   *
   * Первая редакция стража ставила отсечку позже и обвиняла в этом 400 смену почты. Причину
   * дал не домысел, а печать адресов неудачных ответов (`EXP-0063`: причину доказывают
   * заголовки и трасса, а не догадка).
   */
  const noise = errors.length;

  // ── 2 · форма смены почты: тексты и валидации 1.x ──────────────────────────
  console.log('\nВиджет «Поменять Email»:');
  await page.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);
  await page.locator('button.acc-head', { hasText: /Поменять Email/ }).first().click();
  await page.waitForTimeout(600);
  let t1 = await text();
  check(/запросите письмо верификации/i.test(t1), 'пояснение 1.x на месте');
  check(/Введите новый Email:/.test(t1), 'подпись поля 1.x на месте');
  check(/Выслать письмо/.test(t1), 'кнопка 1.x на месте');
  check(/почта — Ваш ключ к аккаунту/i.test(t1), '🔑 предупреждение об опечатке стоит В ШАГЕ ВВОДА');
  await page.screenshot({ path: `${OUT}/email-form.png` });

  await page.locator('button', { hasText: /^Выслать письмо$/ }).first().click();
  await page.waitForTimeout(600);
  check(/Новый Email не может быть пустым/.test(await text()), 'пустой адрес — текст 1.x');

  await page.locator('input.inp').first().fill(CURRENT);
  await page.locator('button', { hasText: /^Выслать письмо$/ }).first().click();
  await page.waitForTimeout(600);
  check(/Новый Email не может быть равен текущему/.test(await text()), 'адрес равен текущему — текст 1.x');

  // ── 3 · подтверждение личности идёт на ТЕКУЩИЙ адрес ───────────────────────
  console.log('\nПодтверждение личности:');
  await page.locator('input.inp').first().fill(FRESH);
  await page.locator('button', { hasText: /^Выслать письмо$/ }).first().click();
  await page.waitForTimeout(3000);
  const t2 = await text();
  check(/Подтвердите, что это Вы/.test(t2), '🔑 экран просит подтвердить личность ДО смены');
  check(/на Ваш текущий адрес/i.test(t2), '🔑 ссылка ушла на ТЕКУЩИЙ адрес (подтверждение со старого)');
  for (const bad of FORBIDDEN) {
    check(!bad.test(t2), `🔑 нет утвердительной формы ${bad}`, t2.slice(0, 140));
  }
  const reauth = await lastCode('EMAIL_SIGNIN');
  check(reauth !== null && reauth.email === CURRENT, 'письмо подтверждения выписано на текущий адрес',
    String(reauth && reauth.email));
  await page.screenshot({ path: `${OUT}/email-waiting.png` });

  // ── 4 · возврат по ссылке → запрос письма на НОВЫЙ адрес ───────────────────
  console.log('\nВозврат по ссылке подтверждения:');
  await page.goto(`${BASE}/account?mode=signIn&oobCode=${reauth.oobCode}&apiKey=demo-api-key`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(5000);
  const t3 = await text();
  check(/Если этот адрес свободен/.test(t3), '🔑 итог сформулирован НЕЙТРАЛЬНО');
  for (const bad of FORBIDDEN) {
    check(!bad.test(t3), `🔑 в итоге нет утвердительной формы ${bad}`, t3.slice(0, 140));
  }
  check(/на других устройствах/i.test(t3), 'человеку сказано про вход на других устройствах');
  await page.screenshot({ path: `${OUT}/email-done.png` });

  const change = await lastCode('VERIFY_AND_CHANGE_EMAIL');
  check(change !== null, 'письмо на новый адрес выписано');

  /*
   * Отсечка ДО применения смены. Дальше 400 законен и ожидаем: смена почты — «крупное
   * изменение аккаунта», и Firebase документированно ОТЗЫВАЕТ refresh-токены
   * («Refresh tokens expire only when… a major account change is detected… password or email
   * address updates», Manage session cookies). SDK после этого пытается обновить токен и
   * получает отказ. То есть 400 здесь — доказательство, что отзыв сработал, а не дефект.
   *
   * Всё, что случилось ДО этой строки, обязано быть чистым: глушить 400 с самого начала
   * значило бы ослепить стража на весь класс сетевых отказов.
   */
  check(errors.length === noise, 'консоль чиста на всём пути ДО применения смены', errors.slice(noise, noise + 2).join(' | '));

  // ── 5 · наша страница-обработчик применяет смену ───────────────────────────
  console.log('\nСмена через /auth/action:');
  await page.goto(`${BASE}/auth/action?mode=verifyAndChangeEmail&oobCode=${change.oobCode}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(3500);
  const t4 = await text();
  check(/Почта изменена/.test(t4), '🔑 наша страница применила смену');
  check(t4.includes(FRESH), 'назван новый адрес', t4.slice(0, 160));
  check(t4.includes(CURRENT), 'назван прежний адрес — на откате это единственный ориентир');
  await page.screenshot({ path: `${OUT}/action-changed.png` });

  // ── 6 · почта РЕАЛЬНО сменилась ────────────────────────────────────────────
  console.log('\nПроверка результата:');
  await page.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);
  const t5 = await text();
  check(t5.includes(FRESH), '🔑 в «Мой аккаунт» стоит НОВЫЙ адрес', t5.slice(0, 200));
  check(!t5.includes(CURRENT), '🔑 прежнего адреса больше нет');
  await page.screenshot({ path: `${OUT}/account-after.png` });

  // На последнем шаге допустим ровно один класс отказов — 400 от автовхода стенда по прежней
  // почте (см. пояснение выше). Всё остальное здесь — по-прежнему провал.
  const tail = errors.slice(noise).filter((e) => !/400|Bad Request/i.test(e));
  check(tail.length === 0, 'после смены нет иных ошибок, кроме ожидаемого отказа обновления токена',
    tail.slice(0, 2).join(' | '));
  // Доказательство, а не догадка: печатаем адреса всех неудачных ответов.
  if (failedResponses.length) console.log('\nНеудачные ответы (для протокола):\n  ' + [...new Set(failedResponses)].join('\n  '));
  await ctx.close();
} finally {
  await browser.close();
}

console.log(`\n${'─'.repeat(64)}`);
console.log(`Пройдено: ${pass}, провалено: ${fails.length}`);
if (fails.length) {
  console.log('\nПровалы:');
  for (const f of fails) console.log(`  · ${f}`);
}
console.log('\n⚠️ Почта dev-пользователя изменена — ПЕРЕЗАПУСТИТЕ СТЕНД перед другими прогонами.');
console.log('⚠️ Режим «откат смены» (recover-email) НЕ проверен: эмулятор такого кода не выдаёт.');
console.log(`Скриншоты — ${OUT}/`);
if (fails.length) process.exit(1);

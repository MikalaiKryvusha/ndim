/**
 * Страж ПУБЛИЧНОЙ ДВЕРИ УДАЛЕНИЯ — `/delete-account`, вход по ссылке на почту.
 *
 * ═══ ЗАЧЕМ ОТДЕЛЬНЫЙ СТРАЖ, КОГДА ЕСТЬ `verify-account-delete` ═══
 *
 * Тот стережёт КАСКАД (что удаляется и в каком порядке) и делает это с «Управлять аккаунтом»,
 * где человек уже вошёл. Здесь стережётся ДРУГОЕ и ровно то, чего не было: путь человека,
 * который пришёл на публичную страницу ИЗВНЕ, без сессии, и входит прямо на ней.
 *
 * Дефект, ради которого страж написан (найден состязательной проверкой 2026-08-01, прожил в
 * бою сутки): страница отправляла письмо и обещала «перейдите по ссылке — и вернётесь сюда,
 * чтобы завершить удаление», но возврат по ссылке не разбирал НИКТО — `completeLoginLink` во
 * всём продукте звался только с «Профиля». Человек возвращался и видел ту же форму почты.
 * Круг замыкался: удалить аккаунт со страницы, созданной ровно для этого, было НЕЛЬЗЯ.
 *
 * ═══ 🔴 ГЛАВНОЕ: ПОЧЕМУ ЭТОТ СТРАЖ ПРОВЕРЯЕТ ЛИЧНОСТЬ, А НЕ «ЭКРАН ОТКРЫЛСЯ» ═══
 *
 * Наивная проверка «прошёл по ссылке → увидел шаг удаления» на стенде ЗЕЛЁНАЯ ВСЕГДА, при любом
 * состоянии этого кода. Причина — автовход стенда: `currentSession()` при отсутствии сессии
 * делает `signInDev()` (`src/lib/data/profile.ts`). То есть даже когда ссылка не разобрана,
 * страница всё равно покажет шаг удаления — но УЖЕ ДЛЯ `dev@ndim.space`, а не для того, кто
 * пришёл. Именно так дефект и просочился в бой мимо всех проверок.
 *
 * Отсюда устройство: страж заводит СВОЙ аккаунт `door@ndim.space`, входит по ссылке и требует
 * удаления ИМЕННО ЕГО. Подтверждение удаления — ввод собственной почты (В2 = А), и продукт сам
 * сверяет её с почтой сессии (`DeleteAccount.svelte`). Значит подставная dev-сессия проваливает
 * проверку почты, и страж краснеет. Это тот же класс, что `EXP-0087`: «человек вошёл как X»
 * непроверяемо, пока стенд молча подменяет X.
 *
 * ЧТО СТЕРЕЖЁТ:
 *   🔑 после возврата по ссылке сессия принадлежит ТОМУ, КТО ВВЁЛ ПОЧТУ (сердце стража);
 *   🔑 удаление с публичной страницы доходит до конца — аккаунта в Auth больше нет;
 *   · без сессии страница предлагает вход (не «не удалось прочитать»);
 *   · обещание письма — то самое, за которое страница отвечает.
 *
 * ⚠️ Прогон уничтожает `door@ndim.space` — это его собственный расходный аккаунт, dev-человека
 * стенда он НЕ ТРОГАЕТ. Поэтому, в отличие от `verify-account-delete`, гонять можно когда угодно.
 *
 * ДОКАЗАН МУТАЦИЕЙ: убрать блок `if (isLoginLink())` из `onMount` страницы `/delete-account` →
 * обязаны покраснеть ровно проверки «сессия принадлежит вошедшему» и «аккаунт удалён», и только
 * они. Возврат блока → 0 провалов.
 *
 * Запуск: `npm run stand`, затем `node tools/verify-delete-door.mjs`.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const AUTH = 'http://127.0.0.1:9099';
const PROJECT = 'demo-ndim-dev';
/** Расходный человек ЭТОГО стража. Намеренно не `dev@` — на различии держится вся проверка. */
const DOOR = 'door@ndim.space';
const OUT = 'test-results/delete-door';
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

const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

/** Все учётные записи эмулятора Auth — источник истины о том, кто существует. */
async function accounts() {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, {
    method: 'POST',
    headers: OWNER,
    body: '{}',
  });
  if (r.status !== 200) throw new Error(`Auth-эмулятор ответил ${r.status} — прибор смотрит мимо`);
  return (await r.json()).userInfo ?? [];
}

const uidOf = async (email) => (await accounts()).find((u) => u.email === email)?.localId ?? null;

/** Свежий код входа ИМЕННО для нашей почты: чужие письма стража не касаются. */
async function signInCodeFor(email) {
  const r = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes = [] } = await r.json();
  const mine = oobCodes.filter((c) => c.requestType === 'EMAIL_SIGNIN' && c.email === email);
  return mine[mine.length - 1] ?? null;
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ru-RU' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // ── ДО: человека нет, и это надо доказать, а не предположить ────────────────────────────
  console.log('\n── ДО ──');
  /*
   * Прибранная площадка — часть прибора. Прерванный прогон оставляет `door@` живым, и тогда
   * следующий начинается с уже существующего человека: проверка «ПОСЛЕ: удалён» перестаёт что
   * либо значить, потому что непонятно, чей это остаток. Убираем сами и сами же это проверяем.
   */
  const stale = await uidOf(DOOR);
  if (stale !== null) {
    await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`, {
      method: 'POST',
      headers: OWNER,
      body: JSON.stringify({ localId: stale }),
    });
    console.log(`  ⚠️ убран остаток прошлого прогона (uid ${stale})`);
  }
  const before = await uidOf(DOOR);
  check(before === null, `${DOOR} до прогона не существует`, before ? `нашёлся uid ${before}` : '');

  // ── Шаг 1. Страница без сессии предлагает войти ─────────────────────────────────────────
  console.log('\n── Шаг 1: пришёл извне, сессии нет ──');
  // `?as=none` — стендовая дверь «сессии нет вовсе» (bugs/84). Без неё стенд впустил бы dev@,
  // и проверять было бы нечего: мы бы мерили не тот случай.
  await page.goto(`${BASE}/delete-account?as=none`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const signedOutText = await page.locator('main').innerText();
  check(/войдите/i.test(signedOutText), 'без сессии страница предлагает ВОЙТИ');
  check(
    !/не удалось прочитать/i.test(signedOutText),
    'без сессии страница НЕ выдаёт «не удалось прочитать»',
    'отсутствие сессии — не поломка, и говорить о ней так нельзя',
  );
  await page.screenshot({ path: `${OUT}/01-signedout.png` });

  // ── Шаг 2. Запрос ссылки ────────────────────────────────────────────────────────────────
  console.log('\n── Шаг 2: просим ссылку на почту ──');
  await page.locator('input[type=email]').fill(DOOR);
  await page.locator('button.btn.ghost').click();
  await page.waitForTimeout(1500);

  const sentText = await page.locator('main').innerText();
  check(/письмо отправлено/i.test(sentText), 'страница подтвердила отправку письма');
  check(
    /вернётесь сюда/i.test(sentText),
    'обещание письма — «вернётесь СЮДА, чтобы завершить удаление»',
    'если обещания нет, стеречь нечего: страж проверяет именно его исполнение',
  );

  const code = await signInCodeFor(DOOR);
  check(code !== null, 'эмулятор выдал код входа для нашей почты');
  if (code === null) throw new Error('без кода дальше мерить нечего');

  // ── Шаг 3. 🔑 ВОЗВРАТ ПО ССЫЛКЕ — СЕРДЦЕ СТРАЖА ─────────────────────────────────────────
  console.log('\n── Шаг 3: возврат по ссылке ──');
  /*
   * Адрес БЕЗ `?as=none` — ровно как в жизни: письмо возвращает на голый `/delete-account`.
   * Именно поэтому стенд здесь и норовит подсунуть dev@, а мы это ловим.
   */
  await page.goto(`${BASE}/delete-account?mode=signIn&oobCode=${code.oobCode}&apiKey=demo-api-key`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(2500);

  const afterLink = await page.locator('main').innerText();
  check(
    !/сначала войдите/i.test(afterLink),
    '🔑 после возврата по ссылке страница НЕ просит войти заново',
    'это и был тупик: письмо приводило обратно на ту же форму',
  );
  await page.screenshot({ path: `${OUT}/02-after-link.png` });

  const confirmField = page.locator('input.inp[type=email]');
  check((await confirmField.count()) > 0, 'шаг подтверждения открыт сам — второй кнопки не нужно');

  // ── Шаг 4. 🔑 ЧЬЯ ЭТО СЕССИЯ. Мутация ловится здесь ─────────────────────────────────────
  console.log('\n── Шаг 4: удаляем — и продукт сам сверяет почту ──');
  /*
   * Вводим почту ТОГО, КТО ПРИШЁЛ. Продукт сверит её с почтой сессии сам. Если ссылку не
   * разобрали и стенд подставил dev@ — сверка провалится, и краснота придёт сюда.
   */
  await confirmField.fill(DOOR);
  await page.locator('button.btn.warn').click();
  await page.waitForTimeout(3000);

  const askedText = await page.locator('main').innerText();
  check(
    !/не совпадает|не та почта|проверьте/i.test(askedText),
    '🔑 введённая почта ПРИНЯТА — значит вошли именно тем, кто пришёл',
    'сессия принадлежит другому человеку: ссылку не разобрали, вошёл dev@',
  );
  check(
    /подтвердите, что это вы/i.test(askedText),
    'продукт требует ПОВТОРНОГО ВХОДА перед необратимым (В2 = А)',
  );
  await page.screenshot({ path: `${OUT}/03-reauth-asked.png` });

  // ── Шаг 5. 🔑 ВТОРОЕ ПИСЬМО — куда оно возвращает ───────────────────────────────────────
  console.log('\n── Шаг 5: подтверждение личности вторым письмом ──');
  /*
   * 🔴 Ради этого шага страж и написан до конца. Первая его редакция останавливалась на шаге 4
   * и была бы зелёной — а адрес возврата второго письма был зашит константой `/account`, то
   * есть человек с ПУБЛИЧНОЙ двери уезжал в приватный экран. Удаление там доводилось до конца,
   * поэтому глазами дефект не виден вовсе: виден он только проверкой АДРЕСА.
   */
  const reauth = await signInCodeFor(DOOR);
  check(reauth !== null && reauth.oobCode !== code.oobCode, 'эмулятор выдал ВТОРОЕ письмо — подтверждения');
  if (reauth === null) throw new Error('без второго кода дальше мерить нечего');

  const backTo = new URL(reauth.oobLink ?? 'http://x/').searchParams.get('continueUrl') ?? '';
  check(
    backTo.includes('/delete-account'),
    '🔑 письмо подтверждения возвращает НА ПУБЛИЧНУЮ СТРАНИЦУ',
    `адрес возврата: ${backTo || '(не прочитан)'} — человека уводит с двери, куда он пришёл`,
  );

  await page.goto(`${BASE}/delete-account?mode=signIn&oobCode=${reauth.oobCode}&apiKey=demo-api-key`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(3500);

  const doneText = await page.locator('main').innerText();
  /*
   * ⚠️ Проверять здесь по корню «удал» НЕЛЬЗЯ, и первая редакция стража на этом попалась:
   * заголовок самой страницы — «Удалить аккаунт», поэтому такая проверка зелёная ВСЕГДА,
   * включая случай, когда человек стоит перед нетронутой формой. Сверяем с точным текстом
   * успеха (`DeleteAccount.svelte` → `doneTitle`) и отдельно требуем, чтобы формы уже НЕ БЫЛО.
   */
  check(/аккаунт удалён/i.test(doneText), 'страница отчиталась: «Аккаунт удалён»', doneText.slice(0, 160));
  check(
    (await page.locator('input.inp[type=email]').count()) === 0,
    'формы подтверждения больше нет — шаг не начался заново',
  );
  await page.screenshot({ path: `${OUT}/04-done.png` });

  // ── ПОСЛЕ: аккаунта нет. Проверяем у Auth, а не по экрану ───────────────────────────────
  console.log('\n── ПОСЛЕ ──');
  const after = await uidOf(DOOR);
  check(after === null, `🔑 ${DOOR} удалён из Auth`, after ? `остался uid ${after}` : '');

  check(errors.length === 0, 'консоль чистая', errors.join(' · '));
} finally {
  await browser.close();
}

console.log(`\n${fails.length === 0 ? '✅' : '❌'} ПРОЙДЕНО ${pass}, ПРОВАЛОВ ${fails.length}`);
if (fails.length > 0) {
  console.log('\nПровалы:');
  for (const f of fails) console.log(`  · ${f}`);
  process.exit(1);
}

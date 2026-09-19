/**
 * ПРОБА ЖИВОГО КОНТУРА — ОТКАЗ ВХОДА ОСТАВЛЯЕТ СЛЕД `signin_failed` В АНАЛИТИКЕ.
 * Набор: `qa/suites/google-signin.md` (кейсы АН-02…АН-06). Повод — слово владельца 2026-09-19:
 * «*почему не видит? почему не добавил ивенты ошибок?*».
 *
 * МЕТКИ ПРИБОРА ЗДЕСЬ НЕТ НАМЕРЕННО: под меткой `capture()` молчит по построению, и доказать, что
 * отказ ДОЕЗЖАЕТ до отправки, можно только без неё. Наружу при этом не уходит НИЧЕГО: каждый запрос
 * к PostHog перехватывается, тело разбирается здесь и запрос обрывается — в рядах PostHog прогон не
 * оставляет ни одного события. След прогона назван честно: счётчики своей воронки стейджа
 * (`space/funnel/days`) получают шаги двери входа и гостей этого прогона, гостевые учётки
 * удаляются своим `idToken`.
 *
 *   АН-02 · дверь входа → «Войти через Google» → окно закрыто → method google · door signin · reason cancelled
 *   АН-03 · дверь входа, окно заблокировано → reason popup_blocked · code auth/popup-blocked
 *   АН-04 · гость → «Сохранить мои результаты» → Google → закрыто → door save · is_guest true
 *   АН-05 · гость → «У меня уже есть аккаунт» → Google → закрыто → door have_account · is_guest true
 *   АН-06 · дверь входа → письмо на адрес `x@` (Firebase его отвергает) → method email · reason invalid_email
 *   Каждый раз: отказ ВИДЕН на экране (иначе красное значило бы «сценарий не дошёл»), ключи свойств ровно из
 *   белого списка, `env = stage`, в свойствах нет ни одного `@`.
 *   Наружу — двойной замок: перехват `route` И подмена имени `*.posthog.com` на 0.0.0.0 у самого браузера
 *   (отправку `sendBeacon` при закрытии страницы перехват может не увидеть — оговорка суда 2026-09-19).
 *
 * Только СТЕЙДЖ: в бою шаги двери и гостей без метки испортили бы боевую воронку (`bugs/202`).
 * Запуск:  node tools/probe-signin-failed-live.mjs --stage
 *
 * [TESTED: 2026-09-19 · стейдж: на сборке f9002ac АН-02…АН-06 0 провалов, канал живой в каждом кейсе; на промежуточной
 *  сборке db7429d покраснел ровно АН-06 (дверь `save` вместо `signin` — настоящий дефект, вылечен); в PostHog за прогоны
 *  0 событий `signin_failed` и 0 событий стейджа — наружу не ушло ничего; отчёт `qa/reports/2026-09-19_google-signin.md`]
 */
import { gunzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { contourFromArgv } from './lib/contours.mjs';

const CONTOUR = contourFromArgv();
if (CONTOUR.name !== 'stage') {
  console.error('Проба ходит только на стейдж (--stage): без метки в бою она испортила бы боевую воронку.');
  process.exit(2);
}
const BASE = CONTOUR.site;
const PROPS = new Set(['lang', 'is_guest', 'entry', 'has_matches', 'env', 'method', 'door', 'reason', 'code']);

let failures = 0;
function check(id, name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${id} · ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Тело запроса posthog-js → список событий. Формы: gzip, base64 в `data=`, чистый JSON; одно или пачка. */
function eventsOf(buffer) {
  if (!buffer || buffer.length === 0) return [];
  const texts = [];
  try { texts.push(gunzipSync(buffer).toString('utf8')); } catch { /* не gzip */ }
  const plain = buffer.toString('utf8');
  texts.push(plain);
  const form = new URLSearchParams(plain).get('data');
  if (form) {
    try { texts.push(Buffer.from(form, 'base64').toString('utf8')); } catch { /* не base64 */ }
    texts.push(form);
  }
  for (const text of texts) {
    try {
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.batch) ? parsed.batch : [parsed];
      return list.filter((e) => e && typeof e.event === 'string');
    } catch { /* следующая форма */ }
  }
  return [];
}

const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP *.posthog.com 0.0.0.0, MAP posthog.com 0.0.0.0'] });
const tokens = new Set();

/*
 * 🔴 БРАУЗЕР ОБЯЗАН ВЫГЛЯДЕТЬ ЧЕЛОВЕКОМ — иначе SDK молча выбрасывает ВСЕ события (замер 2026-09-19).
 * posthog-js по умолчанию не шлёт событий от ботов и узнаёт их по трём приметам: строка браузера
 * (`headlesschrome` в списке), бренды `userAgentData`, `navigator.webdriver` — а у Playwright он `true`.
 * Первая редакция пробы этого не знала: и на старой сборке, и на новой она печатала «события нет», и
 * «отрицательный контроль» был пуст по построению — он не мог позеленеть ни на какой сборке. Лечение —
 * предъявить приметы обычного Chrome; и контроль «канал живой» (кейс ниже) отличает «наш код не зовёт
 * отправку» от «канал мёртв».
 */
const HUMAN_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';

async function contextOf({ blockPopups = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 }, locale: 'ru-RU', hasTouch: true, isMobile: true, userAgent: HUMAN_UA });
  await ctx.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    const brands = [{ brand: 'Chromium', version: '128' }, { brand: 'Google Chrome', version: '128' }];
    try {
      Object.defineProperty(Navigator.prototype, 'userAgentData', {
        get: () => ({ brands, mobile: true, platform: 'Android', getHighEntropyValues: async () => ({ brands, model: 'Pixel 7' }) }),
      });
    } catch { /* нет userAgentData — примета и так отсутствует */ }
  });
  const sent = [];
  // Всё, что идёт к PostHog, — перехват: тело читается, запрос обрывается, наружу не уходит ничего.
  await ctx.route(/posthog\.com/, async (route) => {
    const req = route.request();
    for (const e of eventsOf(req.postDataBuffer())) sent.push({ e, raw: req.postDataBuffer()?.toString('latin1') ?? '' });
    await route.abort();
  });
  ctx.on('response', async (r) => {
    if (!/identitytoolkit.*accounts:signUp/.test(r.url())) return;
    try {
      const body = await r.json();
      if (typeof body.idToken === 'string') tokens.add(body.idToken);
    } catch { /* не JSON */ }
  });
  if (blockPopups) await ctx.addInitScript(() => { window.open = () => null; });
  return { ctx, sent };
}

/** Дождаться события `signin_failed` в перехваченном; posthog-js шлёт пачками, поэтому ждём. */
async function failedEvent(sent, ms = 20000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const hit = sent.find((x) => x.e.event === 'signin_failed');
    if (hit) return hit;
    await new Promise((ok) => setTimeout(ok, 500));
  }
  return null;
}

/** Канал живой: перехвачено хоть одно НАШЕ событие, кроме `signin_failed` (шаг воронки двери или гостя). */
function channelAlive(id, sent) {
  const other = [...new Set(sent.map((x) => x.e.event).filter((name) => name !== 'signin_failed' && !name.startsWith('$')))];
  check(id, 'канал к PostHog живой — перехвачены и другие наши события', other.length > 0, other.join(', ') || 'ни одного');
}

function judge(id, hit, expected) {
  const p = hit?.e.properties ?? {};
  check(id, 'событие signin_failed перехвачено', Boolean(hit));
  if (!hit) return;
  const ours = Object.keys(p).filter((k) => !k.startsWith('$') && !['token', 'distinct_id'].includes(k));
  const stray = ours.filter((k) => !PROPS.has(k));
  check(id, 'ключи свойств — только из белого списка', stray.length === 0, stray.join(', ') || ours.join(', '));
  for (const [k, v] of Object.entries(expected)) check(id, `${k} = ${v}`, p[k] === v, `пришло ${JSON.stringify(p[k])}`);
  check(id, 'env = stage', p.env === 'stage', `пришло ${JSON.stringify(p.env)}`);
  check(id, 'в свойствах события нет ни одного @', !JSON.stringify(p).includes('@'));
}

async function closeGooglePopup(page, button) {
  const popupP = page.waitForEvent('popup', { timeout: 15000 }).catch(() => null);
  await button.click();
  const popup = await popupP;
  if (popup) {
    await popup.waitForLoadState('domcontentloaded').catch(() => {});
    await popup.waitForTimeout(3000);
    await popup.close().catch(() => {});
  }
}

/** Отказ ВИДЕН на экране: без этого красное «события нет» неотличимо от «сценарий не дошёл до отказа». */
async function refusalShown(id, page, locator, label) {
  const seen = await locator.first().waitFor({ timeout: 25000 }).then(() => true, () => false);
  check(id, `отказ виден на экране: ${label}`, seen);
}
const NOT_DONE = 'Вход через Google не завершён';

async function guestPage(ctx) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
  const guestDoor = page.locator('[data-door="guest"]').first();
  await guestDoor.waitFor({ state: 'visible', timeout: 30000 });
  await guestDoor.click();
  await page.getByRole('button', { name: 'Сохранить мои результаты' }).waitFor({ timeout: 30000 });
  return page;
}

try {
  console.log(`контур ${CONTOUR.title} ${BASE} · отправка к PostHog перехватывается и наружу не уходит\n`);

  console.log('АН-02 · дверь входа, окно Google закрыто:');
  {
    const { ctx, sent } = await contextOf();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
    const door = page.getByRole('button', { name: 'Войти через Google' });
    await door.waitFor({ timeout: 30000 });
    await closeGooglePopup(page, door);
    await refusalShown('АН-02', page, page.getByText(NOT_DONE), `«${NOT_DONE}…»`);
    judge('АН-02', await failedEvent(sent), { method: 'google', door: 'signin', reason: 'cancelled', code: 'auth/popup-closed-by-user', is_guest: false });
    channelAlive('АН-02', sent);
    await ctx.close();
  }

  console.log('\nАН-03 · дверь входа, окно заблокировано:');
  {
    const { ctx, sent } = await contextOf({ blockPopups: true });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
    const door = page.getByRole('button', { name: 'Войти через Google' });
    await door.waitFor({ timeout: 30000 });
    await door.click();
    await refusalShown('АН-03', page, page.getByText(NOT_DONE), `«${NOT_DONE}…»`);
    judge('АН-03', await failedEvent(sent), { method: 'google', door: 'signin', reason: 'popup_blocked', code: 'auth/popup-blocked' });
    channelAlive('АН-03', sent);
    await ctx.close();
  }

  console.log('\nАН-04 · гость → «Сохранить мои результаты» → Google, окно закрыто:');
  {
    const { ctx, sent } = await contextOf();
    const page = await guestPage(ctx);
    await page.getByRole('button', { name: 'Сохранить мои результаты' }).click();
    await closeGooglePopup(page, page.getByRole('button', { name: 'Продолжить с Google' }));
    await refusalShown('АН-04', page, page.getByText(NOT_DONE), `«${NOT_DONE}…»`);
    judge('АН-04', await failedEvent(sent), { method: 'google', door: 'save', reason: 'cancelled', is_guest: true });
    channelAlive('АН-04', sent);
    await ctx.close();
  }

  console.log('\nАН-05 · гость → «У меня уже есть аккаунт» → «Войти через Google», окно закрыто:');
  {
    const { ctx, sent } = await contextOf();
    const page = await guestPage(ctx);
    await page.getByRole('button', { name: 'У меня уже есть аккаунт' }).click();
    await page.getByRole('button', { name: 'Войти в свой аккаунт' }).click();
    await closeGooglePopup(page, page.getByRole('button', { name: 'Войти через Google' }));
    await refusalShown('АН-05', page, page.getByText(NOT_DONE), `«${NOT_DONE}…»`);
    judge('АН-05', await failedEvent(sent), { method: 'google', door: 'have_account', reason: 'cancelled', is_guest: true });
    channelAlive('АН-05', sent);
    await ctx.close();
  }

  console.log('\nАН-06 · дверь входа → письмо на адрес «x@»:');
  {
    const { ctx, sent } = await contextOf();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Войти по ссылке на почту' }).click();
    await page.locator('input[type="email"]').fill('x@');
    await page.getByRole('button', { name: 'Получить ссылку для входа' }).click();
    await refusalShown('АН-06', page, page.locator('.err'), 'строка ошибки');
    judge('АН-06', await failedEvent(sent), { method: 'email', door: 'signin', reason: 'invalid_email', code: 'auth/invalid-email' });
    channelAlive('АН-06', sent);
    await ctx.close();
  }
} finally {
  await browser.close();
  // Уборка — в `finally`: кейс, упавший на таймауте, не оставляет гостей на стейдже (оговорка суда 2026-09-19).
  console.log('\nУБОРКА:');
  let removed = 0;
  for (const idToken of tokens) {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${CONTOUR.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (r.ok) removed += 1;
  }
  check('УБОРКА', `гостевых учёток заведено ${tokens.size}, удалено ${removed}`, tokens.size === 2 && removed === tokens.size);
}

console.log(`\nИТОГ: провалов ${failures}.`);
process.exitCode = failures === 0 ? 0 : 1;

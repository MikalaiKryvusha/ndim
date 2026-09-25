/**
 * Разовый драйвер ручного функционального прогона «место входа гостя» (plans/105 Б2, 2026-09-25).
 * НЕ прибор проекта: по решению владельца №096 В2 = А новые приборы в tools/ не заводятся без его слова.
 *
 * Свежая локальная сборка (`build/`, `vite preview` :4173) отдаётся браузеру ПОД ИМЕНЕМ СТЕЙДЖА
 * перехватом маршрута: продукт сам выбирает контур по имени хоста, значит работает с настоящим
 * Firebase стейджа и контуром аналитики `stage`. Всё к PostHog перехватывается и обрывается — наружу
 * не уходит ни одного события. Гостевые учётки удаляются своим idToken.
 *
 * Запуск (из корня проекта, при живом `npx vite preview --port 4173 --strictPort`):
 *   node <этот файл>
 */
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const require = createRequire(`${ROOT}/package.json`);
const { chromium } = require('playwright');
const { contour } = await import(pathToFileURL(`${ROOT}/tools/lib/contours.mjs`).href);

const STAGE = contour('stage');
const HOST = new URL(STAGE.site).hostname;
const BASE = STAGE.site;
const PREVIEW = 'http://localhost:4173';
const PROPS = new Set(['lang', 'is_guest', 'entry', 'has_matches', 'env', 'method', 'door', 'reason', 'code']);
const OUT = `${ROOT}/test-results/guest-entry`;
mkdirSync(OUT, { recursive: true });

let failures = 0;
function check(id, name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  PASS' : '  FAIL'} ${id} · ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Тело запроса posthog-js → события. Формы: gzip, base64 в `data=`, чистый JSON; одно или пачка. */
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

const browser = await chromium.launch({
  args: ['--host-resolver-rules=MAP *.posthog.com 0.0.0.0, MAP posthog.com 0.0.0.0', '--disable-blink-features=AutomationControlled'],
});
const tokens = new Set();
const HUMAN_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';

async function contextOf() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 }, locale: 'ru-RU', hasTouch: true, isMobile: true, userAgent: HUMAN_UA });
  await ctx.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    const brands = [{ brand: 'Chromium', version: '128' }, { brand: 'Google Chrome', version: '128' }];
    try {
      Object.defineProperty(Navigator.prototype, 'userAgentData', {
        get: () => ({ brands, mobile: true, platform: 'Android', getHighEntropyValues: async () => ({ brands, model: 'Pixel 7' }) }),
      });
    } catch { /* нет userAgentData */ }
  });
  const sent = [];
  let served = 0;
  await ctx.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === HOST) {
      served += 1;
      const response = await route.fetch({ url: `${PREVIEW}${url.pathname}${url.search}` });
      return route.fulfill({ response });
    }
    if (url.hostname.endsWith('posthog.com')) {
      for (const e of eventsOf(route.request().postDataBuffer())) sent.push(e);
      // Ответ-заглушка 200, а не обрыв: на обрыв SDK шлёт ту же пачку повторно (прогон 1, 2026-09-25).
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"Ok"}' });
    }
    return route.continue();
  });
  ctx.on('response', async (r) => {
    if (!/identitytoolkit.*accounts:signUp/.test(r.url())) return;
    try {
      const body = await r.json();
      if (typeof body.idToken === 'string') tokens.add(body.idToken);
    } catch { /* не JSON */ }
  });
  return { ctx, sent, servedCount: () => served };
}

async function guestStarts(sent, ms = 25000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const hits = sent.filter((e) => e.event === 'guest_start');
    if (hits.length > 0) {
      await new Promise((ok) => setTimeout(ok, 4000)); // дать второму (ошибочному) событию шанс приехать
      return sent.filter((e) => e.event === 'guest_start');
    }
    await new Promise((ok) => setTimeout(ok, 500));
  }
  return [];
}

async function judge(id, page, sent, expectedEntry, servedCount) {
  const raw = await guestStarts(sent);
  // Одно событие — один `uuid`: повторная отправка той же пачки не второй выстрел продукта.
  const uuids = new Set(raw.map((e) => e.uuid ?? JSON.stringify(e)));
  const hits = [...new Map(raw.map((e) => [e.uuid ?? JSON.stringify(e), e])).values()];
  check(id, 'страница отдана локальной сборкой под именем стейджа', servedCount() > 0, `запросов ${servedCount()}`);
  check(id, 'guest_start выстрелил ровно один раз (по uuid)', uuids.size === 1, `разных ${uuids.size}, отправок ${raw.length}`);
  const p = hits[0]?.properties ?? {};
  check(id, `entry = ${expectedEntry}`, p.entry === expectedEntry, `пришло ${JSON.stringify(p.entry)}`);
  check(id, 'env = stage', p.env === 'stage', `пришло ${JSON.stringify(p.env)}`);
  const ours = Object.keys(p).filter((k) => !k.startsWith('$') && !['token', 'distinct_id'].includes(k));
  const stray = ours.filter((k) => !PROPS.has(k));
  check(id, 'ключи свойств — только из белого списка', stray.length === 0, stray.join(', ') || ours.join(', '));
  check(id, 'в свойствах нет ни одного @', !JSON.stringify(p).includes('@'));
  check(id, 'в адресе после входа нет параметра guest', !/[?&]guest=/.test(page.url()), page.url());
  const other = [...new Set(sent.map((e) => e.event).filter((n) => n !== 'guest_start' && !n.startsWith('$')))];
  console.log(`       прочие события вкладки: ${other.join(', ') || 'нет'}`);
  await page.screenshot({ path: `${OUT}/${id}.png` });
}

function pickCard() {
  const dir = `${ROOT}/build/ru/dimension`;
  const file = readdirSync(dir).find((f) => f.endsWith('.html'));
  return file.replace(/\.html$/, '');
}

try {
  console.log(`сборка ${PREVIEW} под именем ${BASE} · Firebase стейджа · PostHog перехвачен\n`);

  console.log('ЕВ-01 · главная → большая кнопка:');
  {
    const { ctx, sent, servedCount } = await contextOf();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const cta = page.locator('a.cta');
    check('ЕВ-01', 'адрес кнопки главной несёт слово root', (await cta.getAttribute('href')) === '/profile?guest=root');
    await cta.click();
    await page.waitForURL(/\/profile/, { timeout: 30000 });
    await judge('ЕВ-01', page, sent, 'root', servedCount);
    await ctx.close();
  }

  console.log('\nЕВ-02 · лендинг /ru → звезда демо → мост:');
  {
    const { ctx, sent, servedCount } = await contextOf();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/ru`, { waitUntil: 'domcontentloaded' });
    await page.locator('.demo .axis').first().locator('.stars button').nth(8).click();
    const bridge = page.locator('.demo a.gobtn');
    await bridge.waitFor({ state: 'visible', timeout: 15000 });
    check('ЕВ-02', 'адрес моста несёт слово landing', (await bridge.getAttribute('href')) === '/profile?guest=landing');
    await bridge.click();
    await page.waitForURL(/\/profile/, { timeout: 30000 });
    await judge('ЕВ-02', page, sent, 'landing', servedCount);
    await ctx.close();
  }

  console.log('\nЕВ-03 · карточка каталога → звезда (гость рождается касанием) → дверь:');
  {
    const slug = pickCard();
    const { ctx, sent, servedCount } = await contextOf();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/ru/dimension/${slug}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-star]').nth(7).click();
    const door = page.locator('[data-door-enter]');
    await door.waitFor({ state: 'visible', timeout: 15000 });
    check('ЕВ-03', 'адрес двери карточки несёт слово catalog_card', (await door.getAttribute('href')) === '/profile?guest=catalog_card');
    await page.waitForTimeout(6000); // запись оценки и рождение гостя до перехода
    await door.click();
    await page.waitForURL(/\/profile/, { timeout: 30000 });
    await judge('ЕВ-03', page, sent, 'catalog_card', servedCount);
    await ctx.close();
  }

  console.log('\nЕВ-04 · экран входа → «гостем»:');
  {
    const { ctx, sent, servedCount } = await contextOf();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
    const guestDoor = page.locator('[data-door="guest"]').first();
    await guestDoor.waitFor({ state: 'visible', timeout: 30000 });
    await guestDoor.click();
    await page.waitForURL(/\/profile/, { timeout: 30000 });
    await judge('ЕВ-04', page, sent, 'signin', servedCount);
    await ctx.close();
  }

  console.log('\nЕВ-05 · страница теста → первая оценка:');
  {
    const { ctx, sent, servedCount } = await contextOf();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/ru/test/love`, { waitUntil: 'domcontentloaded' });
    const stars = page.locator('.qcard .starsrow .st');
    await stars.first().waitFor({ state: 'visible', timeout: 30000 });
    await stars.nth(7).click();
    const now = page.locator('.qcard .countdown .now');
    await now.waitFor({ state: 'visible', timeout: 15000 });
    await now.click();
    await judge('ЕВ-05', page, sent, 'test', servedCount);
    await ctx.close();
  }

  console.log('\nЕВ-06 · старый адрес /profile?guest=1 (закладка, прежняя ссылка):');
  {
    const { ctx, sent, servedCount } = await contextOf();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/profile?guest=1`, { waitUntil: 'domcontentloaded' });
    await judge('ЕВ-06', page, sent, 'direct', servedCount);
    await ctx.close();
  }

  console.log('\nЕВ-07 · чужое слово /profile?guest=matrix-1999 (не наша дверь):');
  {
    const { ctx, sent, servedCount } = await contextOf();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/profile?guest=matrix-1999`, { waitUntil: 'domcontentloaded' });
    await judge('ЕВ-07', page, sent, 'direct', servedCount);
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log('\nУБОРКА:');
  let removed = 0;
  for (const idToken of tokens) {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${STAGE.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (r.ok) removed += 1;
  }
  check('УБОРКА', `гостевых учёток заведено ${tokens.size}, удалено ${removed}`, tokens.size === 7 && removed === tokens.size);
}

console.log(`\nИТОГ: провалов ${failures}.`);
process.exitCode = failures === 0 ? 0 : 1;

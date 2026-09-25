/**
 * Разовый драйвер ручного функционального прогона — дверь гостя `restart` («Начать заново» после истёкшей гостевой
 * сессии), кейс ЕВ-08 набора `qa/suites/analytics.md` §12 (`plans/105` Б2). НЕ прибор проекта — родня
 * `qa/reports/2026-09-25_guest-entry.driver.mjs`, чьи приёмы взяты дословно: свежая локальная сборка отдаётся ПОД ИМЕНЕМ
 * СТЕЙДЖА перехватом маршрута, продукт работает с настоящим Firebase стейджа и контуром аналитики `stage`, всё к PostHog
 * перехватывается и наружу не уходит; гостевые учётки удаляются своим idToken.
 *
 * Истёкший гость воспроизводится так, как его видит продукт (`isExpiredGuestSession` + `ProfileMissingError`): документ
 * гостя `users/{uid}` удаляется его же токеном (правила: `users/{userId}` — `write` для себя), часы страницы сдвигаются
 * на 8 суток (срок гостя — 7). Перед касанием «Начать заново» часы возвращаются к настоящим: новый гость рождается с
 * настоящими метками, в базе стейджа не остаётся документа «из будущего».
 *
 * Превью — НЕ 4173 (порт выкатной двери): `npx vite preview --port 4183 --strictPort` (или `PREVIEW=<адрес>`).
 * Запуск из корня рабочего места: node qa/reports/2026-09-25_guest-entry-restart.driver.mjs
 */
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const require = createRequire(`${ROOT}/package.json`);
const { chromium } = require('playwright');
const { contour } = await import(pathToFileURL(`${ROOT}/tools/lib/contours.mjs`).href);

const STAGE = contour('stage');
const HOST = new URL(STAGE.site).hostname;
const BASE = STAGE.site;
const PREVIEW = process.env.PREVIEW ?? 'http://localhost:4183';
const PROPS = new Set(['lang', 'is_guest', 'entry', 'has_matches', 'env', 'method', 'door', 'reason', 'code']);
const OUT = `${ROOT}/test-results/guest-entry`;
const DAY = 24 * 60 * 60 * 1000;
mkdirSync(OUT, { recursive: true });

let failures = 0;
function check(id, name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  PASS' : '  FAIL'} ${id} · ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Тело запроса posthog-js → события (как в драйвере мест входа). */
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

/** Кто вошёл и его токен — из IndexedDB Firebase (урок `verify-bug233`, К0). */
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
            resolve(u ? { uid: u.value.uid, anonymous: u.value.isAnonymous === true, token: u.value.stsTokenManager?.accessToken ?? null } : null);
          };
          req.onerror = () => resolve(null);
        };
      }),
  );

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

async function guestStartsAfter(sent, from, ms = 25000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const hits = sent.slice(from).filter((e) => e.event === 'guest_start');
    if (hits.length > 0) {
      await new Promise((ok) => setTimeout(ok, 4000)); // дать второму (ошибочному) событию шанс приехать
      return sent.slice(from).filter((e) => e.event === 'guest_start');
    }
    await new Promise((ok) => setTimeout(ok, 500));
  }
  return [];
}

try {
  console.log(`сборка ${PREVIEW} под именем ${BASE} · Firebase стейджа · PostHog перехвачен\n`);
  console.log('ЕВ-08 · истёкший гость → «Начать заново»:');
  const { ctx, sent, servedCount } = await contextOf();
  const page = await ctx.newPage();
  const said = [];
  page.on('console', (m) => { if (/posthog|rate|limit/i.test(m.text())) said.push(`${m.type()}: ${m.text().slice(0, 160)}`); });
  await page.goto(`${BASE}/profile?guest=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL((u) => !/[?&]guest=/.test(u.search), { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(6000); // гость и его документ записаны
  const first = await whoAmI(page);
  check('ЕВ-08', 'подготовка: гость заведён (стейдж)', first?.anonymous === true && Boolean(first.token), first ? `uid ${first.uid.slice(0, 6)}` : 'нет сессии');

  // Документ гостя уносит уборка сервера синхронизации — здесь его удаляет сам гость, своим токеном.
  const docUrl = `https://firestore.googleapis.com/v1/projects/${STAGE.project}/databases/${STAGE.database}/documents/users/${first?.uid}`;
  const del = await fetch(docUrl, { method: 'DELETE', headers: { Authorization: `Bearer ${first?.token}` } });
  const gone = await fetch(docUrl, { headers: { Authorization: `Bearer ${first?.token}` } });
  check('ЕВ-08', 'подготовка: документ гостя users/{uid} удалён его токеном', del.ok && gone.status === 404, `DELETE ${del.status} · GET ${gone.status}`);

  // Часы страницы +8 суток: для продукта гостю больше 7 дней — он истёк.
  await page.clock.install({ time: Date.now() + 8 * DAY });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const expired = await page.getByText('Гостевая сессия истекла').waitFor({ timeout: 30000 }).then(() => true, () => false);
  const restartBtn = page.getByRole('button', { name: 'Начать заново' });
  const hasBtn = await restartBtn.isVisible().catch(() => false);
  await page.screenshot({ path: `${OUT}/ЕВ-08-expired.png` });
  check('ЕВ-08', 'экран «Гостевая сессия истекла» с кнопкой «Начать заново»', expired && hasBtn);

  // Часы — к настоящим до касания: новый гость рождается с настоящими метками.
  await page.clock.setSystemTime(Date.now());
  const from = sent.length;
  await restartBtn.click({ timeout: 5000 }).catch(() => {});
  await page.waitForURL(/\/profile/, { timeout: 30000 }).catch(() => {});
  await page.waitForURL((u) => !/[?&]guest=/.test(u.search), { timeout: 30000 }).catch(() => {});
  const raw = await guestStartsAfter(sent, from);
  const uuids = new Set(raw.map((e) => e.uuid ?? JSON.stringify(e)));
  const hit = raw[0];
  const p = hit?.properties ?? {};
  await page.waitForTimeout(3000);
  const second = await whoAmI(page);
  await page.screenshot({ path: `${OUT}/ЕВ-08-after-restart.png` });
  check('ЕВ-08', 'страница отдана локальной сборкой под именем стейджа', servedCount() > 0, `запросов ${servedCount()}`);
  check('ЕВ-08', 'после касания — гость НОВЫЙ (другой uid)', second?.anonymous === true && second.uid !== first?.uid, second ? `uid ${second.uid.slice(0, 6)}` : 'нет сессии');
  check('ЕВ-08', 'guest_start после касания — ровно один (по uuid)', uuids.size === 1, `разных ${uuids.size}, отправок ${raw.length}`);
  check('ЕВ-08', 'entry = restart', p.entry === 'restart', `пришло ${JSON.stringify(p.entry)}`);
  check('ЕВ-08', 'env = stage', p.env === 'stage', `пришло ${JSON.stringify(p.env)}`);
  const ours = Object.keys(p).filter((k) => !k.startsWith('$') && !['token', 'distinct_id'].includes(k));
  const stray = ours.filter((k) => !PROPS.has(k));
  check('ЕВ-08', 'ключи свойств — только из белого списка', stray.length === 0, stray.join(', ') || ours.join(', '));
  check('ЕВ-08', 'в свойствах нет ни одного @', !JSON.stringify(p).includes('@'));
  check('ЕВ-08', 'в адресе после входа нет параметра guest', !/[?&]guest=/.test(page.url()), page.url());
  const other = [...new Set(sent.slice(from).map((e) => e.event).filter((n) => n !== 'guest_start' && !n.startsWith('$')))];
  console.log(`       прочие события после касания: ${other.join(', ') || 'нет'}`);
  console.log(`       до касания событий ${from}: ${[...new Set(sent.slice(0, from).map((e) => e.event))].join(', ') || 'нет'}`);
  console.log(`       консоль страницы о PostHog: ${said.length ? `\n         ${said.slice(0, 8).join('\n         ')}` : 'ничего'}`);
  const bucket = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /^ph_.*_posthog$/.test(k));
    if (!key) return null;
    const v = JSON.parse(localStorage.getItem(key) ?? '{}');
    return { limit: v.$capture_rate_limit ?? null, now: Date.now() };
  }).catch(() => null);
  console.log(`       корзина ограничителя PostHog: ${JSON.stringify(bucket)}`);
  await ctx.close();
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
  check('УБОРКА', `гостевых учёток заведено ${tokens.size}, удалено ${removed}`, tokens.size === 2 && removed === tokens.size);
}

console.log(`\nИТОГ: провалов ${failures}.`);
process.exitCode = failures ? 1 : 0;

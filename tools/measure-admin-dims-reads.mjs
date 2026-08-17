/**
 * ПРИБОР ЗАМЕРА (не страж): сколько ЧТЕНИЙ базы стоит комната «Измерения».
 *
 * 🔴 ПОВОД — прямые указания владельца 2026-08-17, дословно:
 *   · «*нужно убедиться, что менеджер грузит весь список измерений только одним запросом
 *     димс лист*»;
 *   · «*детали по каждому измерению загружаются только по запросу явному. Уважительно
 *     расходуем лимит запросов Firebase*».
 *
 * Это применение его же канона (2026-07-12): «*я весь первый NDim писал так, чтобы ЭКОНОМИТЬ
 * ЗАПРОСЫ К БАЗЕ!!! Везде, где могу*». Правило, которое держится на честном слове, тихо
 * протухает от первой удобной правки — поэтому здесь ЧИСЛО.
 *
 * ЧТО ИМЕННО СЧИТАЕТСЯ. Пути документов в телах запросов к Firestore, а НЕ HTTP-запросы:
 * у Firestore большинство обращений — служебные кадры WebChannel, и счёт по ним был бы
 * лотереей (`EXP-0073`, оплачено на `verify-ideas18`).
 *
 * ОТВЕТ ПРИБОРА — три числа:
 *   1. открытие комнаты (ожидание: **1** — только `dims/dims_list`);
 *   2. отбор поиском (ожидание: **0** — поиск идёт по уже прочитанному списку);
 *   3. открытие карточки на правку (ожидание: **1** — точечное чтение, и только по нажатию).
 *
 * Запуск: `npm run stand` → `node tools/measure-admin-dims-reads.mjs`
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const AUTH = 'http://127.0.0.1:9099';
const DB_HOST = '127.0.0.1:8181';
const DEV_USER = { email: 'dev@ndim.space', password: 'ndim-dev-stand' };

const alive = await fetch(`${AUTH}/`).then((r) => r.ok).catch(() => false);
if (!alive) {
  console.error('❌ стенд не отвечает — подними `npm run stand`');
  process.exit(1);
}

/** Клейм админа dev-пользователю — идемпотентно, как это делают сид и стражи панели. */
{
  const call = (path, body, headers = {}) =>
    fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/${path}?key=demo-api-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }).then((r) => r.json());
  const { localId } = await call('accounts:signInWithPassword', { ...DEV_USER, returnSecureToken: true });
  if (!localId) {
    console.error('❌ dev-пользователь не найден — засеян ли стенд?');
    process.exit(1);
  }
  await call('accounts:update', { localId, customAttributes: JSON.stringify({ admin: true }) },
    { Authorization: 'Bearer owner' });
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
const page = await ctx.newPage();

/** Счётчик путей документов в телах запросов к базе. */
const counter = { docs: [] };
page.on('request', (request) => {
  if (!request.url().includes(DB_HOST)) return;
  const body = request.postData() ?? '';
  const paths = [...body.matchAll(/documents(?:%2F|\/)([A-Za-z0-9_\-]+(?:(?:%2F|\/)[A-Za-z0-9_\-]+)*)/g)];
  for (const match of paths) counter.docs.push(decodeURIComponent(match[1]));
});

function take() {
  const seen = counter.docs.slice();
  counter.docs.length = 0;
  return seen;
}

const report = [];
try {
  // Вход и разогрев: чтения экрана «Профиль» к комнате не относятся, поэтому счётчик
  // обнуляется ПОСЛЕ входа, а не до.
  await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  take();

  // ── 1. Открытие комнаты ───────────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/admin/dims`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.rows li', { timeout: 15000 });
  await page.waitForTimeout(1200);
  const open = take();
  const openDims = open.filter((p) => p.startsWith('dims'));
  report.push(['открытие комнаты', openDims.length, 1, openDims.join(', ')]);

  const rows = await page.locator('.rows li').count();

  // ── 2. Отбор поиском ──────────────────────────────────────────────────────────────────────
  const first = await page.locator('.rows li .rn').first().innerText();
  await page.locator('input[type="search"]').fill(first.slice(0, 4));
  await page.waitForTimeout(900);
  const search = take();
  report.push(['отбор поиском', search.length, 0, search.join(', ')]);

  // ── 3. Открытие карточки на правку ────────────────────────────────────────────────────────
  await page.locator('.rows li .rowbtn').first().click();
  await page.waitForSelector('.form', { timeout: 8000 });
  await page.waitForTimeout(900);
  const detail = take();
  const detailDims = detail.filter((p) => p.startsWith('dims'));
  report.push(['открытие карточки на правку', detailDims.length, 1, detailDims.join(', ')]);

  console.log('\n═══ ЧТЕНИЯ БАЗЫ, КОТОРЫЕ СТОИТ КОМНАТА «ИЗМЕРЕНИЯ» ═══\n');
  console.log(`  строк в списке: ${rows}\n`);
  let bad = 0;
  for (const [what, got, want, paths] of report) {
    const ok = got === want;
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✅' : '❌'} ${what.padEnd(30)} чтений ${got} (ожидалось ${want})`);
    if (paths) console.log(`       ${paths}`);
  }

  console.log('\n──────────────────────────────────────────────────────────────');
  if (bad === 0) {
    console.log('✅ Канон экономии соблюдён: список — ОДНО чтение индекса, детали — только по нажатию.');
    process.exitCode = 0;
  } else {
    console.log(`❌ расхождений ${bad} — канон экономии нарушен, смотри пути выше.`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}

/**
 * ПРИЁМКА ВОРОНКИ V2 НА СТЕНДЕ — `plans/74` фаза 1, приёмка Ш2 · Ш3 · Ш4.
 *
 * ═══ ЧТО ЭТОТ ПРИБОР ДОКАЗЫВАЕТ, ЧЕГО НЕ ДОКАЗЫВАЮТ ЮНИТЫ ═══
 *
 * Юниты доказали ЛОГИКУ (`claimStep` молчит под меткой, ключ суток берёт пояс владельца), тесты
 * правил доказали, что база принимает новые счётчики по +1. Ни те, ни другие не доказывают
 * главного: что метка ДОЕХАЛА до страницы раньше кода приложения, и что запись действительно
 * случилась в живом браузере. Между «функция вернула false» и «число в базе не выросло» лежит
 * весь продукт, и ровно там живут дефекты этого класса.
 *
 * Поэтому здесь всё судится ПО БАЗЕ, а не по экрану: вердикт снимается чтением документа
 * `space/funnel/days/{дата}` до и после захода (тот же приём, что в наборе `smoke` — «мутация
 * „оценка не помечает точку грязной“ оставляет экран ЗЕЛЁНЫМ, и ловит её только база»).
 *
 * ═══ КОНТРОЛЬ ПРИБОРА — ПЕРВЫМ (`EXP-0082`) ═══
 *
 * Проверка «прибор с меткой даёт +0» зелена И тогда, когда счётчик не работает вовсе. Поэтому
 * ПЕРВЫМ идёт заход БЕЗ метки, обязанный дать +1: без него весь прогон бессодержателен.
 * Это вопрос 3 лестницы трёх вопросов — «мог ли материал дать проверке упасть».
 *
 * ═══ ГРАНИЦЫ, НАЗВАННЫЕ ЧЕСТНО ═══
 *
 * · 🔴 **`door_click` здесь НЕ проверяется живым касанием, и это не пропуск.** Дверь карточки
 *   строит `dev-1` (`plans/75` Ш1); до её появления касаться нечего. Заводить ради проверки
 *   временную кнопку значило бы завести в продукте «режим тестирования» — ровно то, что красит
 *   зелёным непроверенное. Шаг доказан там, где его можно доказать без двери: юнит на
 *   дедупликацию `claimStep('door_click')`, тест правил на запись `+1` в настоящие правила, и
 *   ЖИВОЙ прогон того же `track()` ниже — `door_click` отличается от `signin_wall_view` ровно
 *   одной строковой константой, общий у них весь путь.
 * · Прибор пишет в ЭМУЛЯТОР и только в него: адрес берётся из слота рабочего места, проект
 *   `demo-ndim-dev`. В бой он не ходит и ходить не должен — там его записи были бы теми самыми
 *   «своими прогонами», ради которых заведена метка.
 * · Экран судится на «не упал и показал ряд», а не на вид: приёмка вида — глаз владельца.
 *
 * Запуск: `npm run build` (свежий build/) + `npm run stand` (эмуляторы) →
 *         `node tools/verify-funnel-v2.mjs`
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { portsFor, slotOf } from './lib/stand-slot.mjs';
import { markProbeContext } from './lib/probe-mark.mjs';

const STAND = portsFor(slotOf(basename(process.cwd())).slot);
const BASE = process.env.PROBE_BASE ?? `http://localhost:${STAND.preview}`;
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST
  ? `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`
  : `http://127.0.0.1:${STAND.auth}`;
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST
  ? `http://${process.env.FIRESTORE_EMULATOR_HOST}`
  : `http://127.0.0.1:${STAND.firestore}`;

/*
 * Проект и база — ТЕ ЖЕ, что берёт приложение на стенде.
 *
 * 🔴 БАЗА НА СТЕНДЕ — «(default)», А НЕ `ndim-db-prod`. Первая редакция этого прибора взяла имя
 * базы из реестра контуров, и весь прогон покраснел на КОНТРОЛЬНОЙ проверке: продукт исправно
 * писал счётчики, а прибор читал пустоту в соседней базе. Развилка живёт в `src/lib/firebase.ts`
 * → `db()`: на стенде `getFirestore(ensureApp())` БЕЗ второго аргумента, именованная база
 * берётся только в бою и на стейдже.
 *
 * Класс уже оплачен проектом: «прибор, ходящий в живое окружение, берёт контур ЦЕЛИКОМ, а не
 * по частям» (`AGENT_GUIDE` → «Два контура: одна дверь»; там смоук брал адрес из аргумента, а
 * ключ уборки — боевой константой). Здесь то же самое: адрес эмулятора из слота, а имя базы —
 * из чужого реестра.
 */
const PROJECT = 'demo-ndim-dev';
const DATABASE = '(default)';
const DEV_USER = { email: 'dev@ndim.space', password: 'ndim-dev-stand' };
const OUT = 'test-results/funnel-v2';
const STEPS = ['landing_view', 'demo_touch', 'guest_start', 'account_created', 'door_click', 'signin_wall_view'];

mkdirSync(OUT, { recursive: true });

let pass = 0;
const fails = [];
function check(ok, what, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ✅ ${what}`);
  } else {
    fails.push(`${what}${detail ? ' — ' + detail : ''}`);
    console.log(`  ❌ ${what}${detail ? ' — ' + detail : ''}`);
  }
}

/* ── Ключ суток — ТОТ ЖЕ, что у продукта ──────────────────────────────────────
 * Считается здесь независимо, из исходника продукта: прибор, взявший ключ у самого продукта
 * импортом, согласился бы с ним и при сломанном ключе. Пояс читается из кода — так расхождение
 * прибора с продуктом становится видимым, а не молчаливым.
 */
const TZ = (readFileSync('src/lib/data/funnel.ts', 'utf8').match(/OWNER_TIMEZONE = '([^']+)'/) ?? [])[1];
if (!TZ) {
  console.error('❌ не найдена константа OWNER_TIMEZONE в src/lib/data/funnel.ts');
  process.exit(1);
}
function dayKey(at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/* ── Документ суток через REST эмулятора (Bearer owner обходит правила) ───────── */
const docUrl = (date) =>
  `${FIRESTORE}/v1/projects/${PROJECT}/databases/${DATABASE}/documents/space/funnel/days/${date}`;

async function readDay(date) {
  const res = await fetch(docUrl(date), { headers: { Authorization: 'Bearer owner' } });
  if (!res.ok) return Object.fromEntries(STEPS.map((s) => [s, 0]));
  const body = await res.json();
  const fields = body.fields ?? {};
  return Object.fromEntries(STEPS.map((s) => [s, Number(fields[s]?.integerValue ?? 0)]));
}

async function seedDay(date, counters) {
  const fields = Object.fromEntries(
    Object.entries(counters).map(([key, value]) => [key, { integerValue: String(value) }]),
  );
  const mask = Object.keys(counters).map((k) => `updateMask.fieldPaths=${k}`).join('&');
  const res = await fetch(`${docUrl(date)}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`сид дня ${date} не удался: ${res.status} ${await res.text()}`);
}

/**
 * Ждёт, пока счётчик дорастёт до ожидаемого, но НЕ дольше окна.
 *
 * 🔑 Возвращает фактическое значение, а не «дождались/нет»: проверка «не выросло» обязана
 * ЖДАТЬ столько же, сколько проверка «выросло». Иначе зелёный у неё был бы от того, что прибор
 * спросил раньше, чем продукт успел записать, — самый дешёвый способ соврать себе.
 */
async function settle(date, step, expected, windowMs = 6000) {
  const deadline = Date.now() + windowMs;
  let value = (await readDay(date))[step];
  while (Date.now() < deadline && value !== expected) {
    await new Promise((r) => setTimeout(r, 250));
    value = (await readDay(date))[step];
  }
  // Окно доживается ВСЕГДА, когда ждём «не выросло»: иначе рост, случившийся на 5-й секунде,
  // остался бы незамеченным.
  if (Date.now() < deadline) await new Promise((r) => setTimeout(r, deadline - Date.now()));
  return (await readDay(date))[step];
}

/* ── Оснастка стенда ─────────────────────────────────────────────────────────── */
const authAlive = await fetch(`${AUTH}/`).then((r) => r.ok).catch(() => false);
if (!authAlive) {
  console.error(`\n❌ Auth-эмулятор (${AUTH}) не отвечает. Подними стенд: npm run stand`);
  process.exit(1);
}

async function grantAdmin() {
  const call = (path, body, headers = {}) =>
    fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/${path}?key=demo-api-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }).then((r) => r.json());
  const { localId } = await call('accounts:signInWithPassword', { ...DEV_USER, returnSecureToken: true });
  if (!localId) throw new Error('dev-пользователь не найден — стенд засеян?');
  await call(
    'accounts:update',
    { localId, customAttributes: JSON.stringify({ admin: true }) },
    { Authorization: 'Bearer owner' },
  );
}
await grantAdmin();

let preview = null;
const previewAlive = await fetch(BASE).then((r) => r.ok).catch(() => false);
if (!previewAlive) {
  preview = spawn('npx', ['vite', 'preview'], { shell: true, stdio: 'ignore' });
  const deadline = Date.now() + 20000;
  let up = false;
  while (Date.now() < deadline && !up) {
    up = await fetch(BASE).then((r) => r.ok).catch(() => false);
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) {
    console.error(`❌ preview на ${BASE} не поднялся за 20 с`);
    process.exit(1);
  }
}

console.log(`Стенд: ${BASE} · Firestore ${FIRESTORE} · база ${DATABASE} · пояс ряда ${TZ}\n`);

/* ── 1. СТАТИКА: экран есть, закрыт от роботов, пуст по данным ────────────────── */
console.log('Статика (build/):');
{
  const page = 'build/admin/funnel.html';
  if (!existsSync(page)) {
    check(false, 'экран воронки есть в сборке', 'нет build/admin/funnel.html');
  } else {
    const html = readFileSync(page, 'utf8');
    check(/<meta name="robots" content="noindex"/.test(html), 'экран воронки несёт noindex');
    // Подписи столбцов в пререндере = данные приехали в статику на публичный хост.
    const leaked = ['Открыл лендинг', 'Стал гостем', 'Увидел стену', 'landing_view'].filter((w) => html.includes(w));
    check(leaked.length === 0, 'в пререндеренном HTML экрана НЕТ данных', leaked.join(', '));
  }
  const sitemap = readFileSync('build/sitemap.xml', 'utf8');
  // Признак ТОЧНЫЙ: «badminton» содержит «admin», и грубый греп по слову дал бы ложную тревогу.
  check(!/<loc>[^<]*\/admin(\/|<)/.test(sitemap), '/admin отсутствует в sitemap.xml');
}

/* ── 2. ЖИВОЕ: счёт, метка, дедупликация ──────────────────────────────────────── */
const browser = await chromium.launch();
const today = dayKey();
console.log(`\nЖивой счёт (сутки ряда — ${today}):`);

async function visit({ marked, path }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  if (marked) await markProbeContext(ctx);
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  return { ctx, page };
}

// 🔑 КОНТРОЛЬ ПРИБОРА ПЕРВЫМ: без роста здесь весь прогон бессодержателен.
{
  const before = (await readDay(today)).landing_view;
  const { ctx, page } = await visit({ marked: false, path: '/ru' });
  const after = await settle(today, 'landing_view', before + 1);
  check(after === before + 1, 'КОНТРОЛЬ: заход БЕЗ метки даёт +1 к landing_view', `${before} → ${after}`);

  // Тот же контекст, второй заход: один визит — один шаг.
  await page.goto(`${BASE}/en`, { waitUntil: 'domcontentloaded' });
  const twice = await settle(today, 'landing_view', after);
  check(twice === after, 'повтор в том же визите не даёт второго счёта', `${after} → ${twice}`);
  await ctx.close();
}

{
  const before = (await readDay(today)).landing_view;
  const { ctx } = await visit({ marked: true, path: '/ru' });
  const after = await settle(today, 'landing_view', before);
  check(after === before, '🔴 прибор С МЕТКОЙ даёт +0 — смоук перестал быть «человеком»', `${before} → ${after}`);
  await ctx.close();
}

/* ── 3. СТЕНА ВХОДА: настоящий путь продукта, а не искусственный вызов ────────── */
console.log('\nСтена входа (Ш2):');
{
  const before = (await readDay(today)).signin_wall_view;
  // ⚠️ Стендовая дверь `?as=none` обязательна: на стенде продукт входит САМ, и без неё
  // состояние «сессии нет» непроверяемо вовсе (EXP-0111 — удобство стенда есть его слепое пятно).
  const { ctx, page } = await visit({ marked: false, path: '/profile?as=none' });
  await page.waitForTimeout(500);
  const wall = await page.locator('text=Войдите в Пространство').count();
  check(wall > 0, 'экран «Войдите в Пространство» действительно показан', `найдено ${wall}`);
  const after = await settle(today, 'signin_wall_view', before + 1);
  check(after === before + 1, 'показ стены входа даёт +1 к signin_wall_view', `${before} → ${after}`);
  await page.screenshot({ path: `${OUT}/wall.png` });
  await ctx.close();
}

/* ── 4. ЭКРАН: исторический день не роняет ряд ────────────────────────────────── */
console.log('\nЭкран воронки (Ш4):');
{
  // День «до второго входа»: РОВНО четыре старых поля, как в боевом ряду до 2026-08-28.
  const historic = (() => {
    const [y, m, d] = today.split('-').map(Number);
    const back = new Date(Date.UTC(y, m - 1, d) - 3 * 86400000);
    const pad = (v) => String(v).padStart(2, '0');
    return `${back.getUTCFullYear()}-${pad(back.getUTCMonth() + 1)}-${pad(back.getUTCDate())}`;
  })();
  await seedDay(historic, { landing_view: 11, demo_touch: 4, guest_start: 2, account_created: 1 });

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await markProbeContext(ctx); // экран смотрит АДМИН, и его заход не должен двигать ряд
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  /*
   * 🔑 СНАЧАЛА СЕССИЯ, ПОТОМ ПАНЕЛЬ. Права читаются из клейма ID-ТОКЕНА, а у свежего контекста
   * токена нет вовсе: экран честно рассудит «не админ» и уведёт на главную. Клейм, выданный
   * REST'ом выше, сам сессии не создаёт.
   * На стенде сессию заводит первый же заход на `/profile` без стендовой двери (автовход
   * dev-пользователем, `data/profile.ts`) — тот же порядок, что у `verify-admin-home`.
   * Контекст ПОМЕЧЕН, поэтому этот заход ряд не двигает.
   */
  await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  await page.goto(`${BASE}/admin/funnel`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  const body = (await page.locator('body').innerText().catch(() => '')) ?? '';
  check(body.includes('Воронка'), 'экран открылся у админа');
  check(body.includes(historic), `строка исторического дня (${historic}) на экране есть`);
  check(body.includes(today), `строка сегодняшних суток (${today}) на экране есть — ключ ЛОКАЛЬНЫЙ`);
  check(/\b11\b/.test(body), 'числа исторического дня показаны (landing_view = 11)');
  check(body.includes('Увидел стену входа'), 'новый счётчик назван на экране');
  check(errors.length === 0, 'консоль экрана чиста', errors.slice(0, 2).join(' · '));

  await page.screenshot({ path: `${OUT}/screen-light.png`, fullPage: true });

  /*
   * Кадр ТЁМНОЙ темы — норма проекта для всего, что видит человек: у видимого дефекта приёмка
   * пиксельная, а не габаритная (`EXP-0155`), и половина экранов продукта живёт в тёмной теме.
   * Тему задаёт ключ `ndim-theme` ДО загрузки: системный `colorScheme` тему продукта не меняет.
   */
  await page.evaluate(() => {
    try {
      localStorage.setItem('ndim-theme', 'dark');
    } catch {
      /* приватный режим */
    }
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const dark = (await page.locator('body').innerText().catch(() => '')) ?? '';
  check(dark.includes(historic), 'тёмная тема: ряд на месте', 'исторического дня не видно');
  await page.screenshot({ path: `${OUT}/screen-dark.png`, fullPage: true });

  await ctx.close();
}

await browser.close();
if (preview) preview.kill();

console.log(`\nПроверок пройдено: ${pass} · провалов: ${fails.length}`);
if (fails.length > 0) {
  console.log('\n❌ ПРОВАЛЫ:');
  for (const f of fails) console.log(`   · ${f}`);
  process.exit(1);
}
console.log('✅ ВОРОНКА V2 ПРИНЯТА НА СТЕНДЕ.');
process.exit(0);

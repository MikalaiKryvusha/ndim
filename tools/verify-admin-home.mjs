/**
 * СТРАЖ ДОМА АДМИН-ПАНЕЛИ — `plans/33`, шаг 5 (эпик `ideas/29`, фаза 3).
 *
 * Решение владельца (интервью №015, В1 = Б): панель — раздел ВНУТРИ приложения, он
 * НЕ индексируется и РЕДИРЕКТИТ не-админа на главную.
 *
 * Стережёт пять вещей фазы (нумерация — из плана):
 *   1. не-админ редиректится на главную (и «нет сессии», и гость);
 *   2. 🔑 при МЕДЛЕННОМ ответе о правах человек НЕ выброшен: пока прав не знаем — ни панели,
 *      ни редиректа (нейтральное ожидание). Контроль прибора (`EXP-0082`): без задержки
 *      редирект ОБЯЗАН происходить — это пункт 1; зелёный п.1 и зелёный п.2 вместе доказывают,
 *      что ожидание — поведение продукта, а не слепота проверки;
 *   3. страниц раздела нет в `sitemap.xml`, и они несут `noindex`;
 *   4. в пререндеренном HTML раздела НЕТ ДАННЫХ (греп по списку запретных слов);
 *   5. двери в «Меню» у не-админа нет НИ ОДНОГО КАДРА (rAF-трасса с первого кадра, а не
 *      единичный снимок — мигнувшая и исчезнувшая дверь хуже отсутствующей).
 *
 * Запуск: `npm run build` (свежий build/) + `npm run stand` (эмуляторы) →
 *         `node tools/verify-admin-home.mjs`
 * Страж сам поднимает `vite preview` на :4173 (--strictPort), если порт свободен, — судим
 * СОБРАННЫЙ сайт, как велит план. Клейм админа dev-пользователю выставляется REST'ом
 * эмулятора (Bearer owner) — идемпотентно, сид делает то же самое.
 */
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:4173';
const AUTH = 'http://127.0.0.1:9099';
const DEV_USER = { email: 'dev@ndim.space', password: 'ndim-dev-stand' };
const OUT = 'test-results/admin-home';
const DOOR_LABEL = 'Менеджер измерений';
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

// ── Статика: собранный сайт ─────────────────────────────────────────────────────────────────
console.log('Статика (build/):');
{
  const sitemap = readFileSync('build/sitemap.xml', 'utf8');
  check(!/\/admin/.test(sitemap), 'п.3а: /admin отсутствует в sitemap.xml');

  const page = 'build/admin.html';
  if (!existsSync(page)) {
    check(false, 'п.3б/п.4: build/admin.html существует', 'раздела нет в сборке');
  } else {
    const html = readFileSync(page, 'utf8');
    check(/<meta name="robots" content="noindex"/.test(html), 'п.3б: admin.html несёт noindex');
    // Запретные слова: данные стенда и боя, почты, имена. Оболочка обязана быть пустой.
    const forbidden = ['Кошки', 'Таксист', 'kotkrinik', '@ndim.space', '@gmail', 'dims_list', 'stand-guest', 'Матрица'];
    const leaked = forbidden.filter((w) => html.includes(w));
    check(leaked.length === 0, 'п.4: в пререндеренном HTML раздела нет данных', leaked.join(', '));
  }
}

// ── Живой сайт: эмуляторы + preview ─────────────────────────────────────────────────────────
const authAlive = await fetch(`${AUTH}/`).then((r) => r.ok).catch(() => false);
if (!authAlive) {
  console.error('\n❌ Auth-эмулятор (9099) не отвечает. Подними стенд: npm run stand');
  process.exit(1);
}

/** Клейм админа dev-пользователю — REST эмулятора, идемпотентно (то же делает сид). */
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

// Поднимаем preview, если порт свободен. --strictPort: молчаливый переезд на 4174 запрещён
// (капкан №2 STATUS — стражи судили бы не тот сервер).
let preview = null;
const previewAlive = await fetch(BASE).then((r) => r.ok).catch(() => false);
if (!previewAlive) {
  preview = spawn('npx', ['vite', 'preview', '--strictPort', '--port', '4173'], {
    shell: true,
    stdio: 'ignore',
  });
  const deadline = Date.now() + 20000;
  let up = false;
  while (Date.now() < deadline && !up) {
    up = await fetch(BASE).then((r) => r.ok).catch(() => false);
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) {
    console.error('❌ preview на :4173 не поднялся за 20 с');
    process.exit(1);
  }
}

const browser = await chromium.launch();

/**
 * Цепочка навигаций главного фрейма. Опрос адреса раз в N мс ПРОСКАКИВАЕТ кадр корня:
 * продукт уводит не-админа на `/`, а корень тут же пересылает гостя внутрь приложения
 * (`/profile` — дисциплина `data/session.ts`), и сэмплирующий страж видел то `/`, то
 * `/profile` — гонку в самом приборе. Событийная запись видит ОБА шага всегда.
 */
function recordNav(page) {
  const chain = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) chain.push(new URL(frame.url()).pathname);
  });
  return chain;
}

/** Ждём ухода с /admin (или null, если остались). Куда ушли — судит цепочка recordNav. */
async function waitLeftAdmin(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const path = new URL(page.url()).pathname;
    if (path !== '/admin') return path;
    await page.waitForTimeout(100);
  }
  return null;
}

try {
  // ── п.1а · сессии нет вовсе → редирект на главную ──────────────────────────────────────
  console.log('\nЖивой сайт — не-админ редиректится (п.1):');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: 'ru-RU' });
    const page = await ctx.newPage();
    const nav = recordNav(page);
    await page.goto(`${BASE}/admin?as=none`, { waitUntil: 'domcontentloaded' });
    const left = await waitLeftAdmin(page, 8000);
    check(left !== null && nav.includes('/'), 'п.1а: без сессии /admin редиректит на главную',
      `цепочка: ${nav.join(' → ')}`);
    await ctx.close();
  }

  // ── п.1б · гость → редирект на главную ─────────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: 'ru-RU' });
    const page = await ctx.newPage();
    // Гостевую сессию заводит дверь стенда `?as=guest` на профиле; затем идём в раздел.
    await page.goto(`${BASE}/profile?as=guest`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const nav = recordNav(page);
    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    const left = await waitLeftAdmin(page, 8000);
    check(left !== null && nav.includes('/'), 'п.1б: гость на /admin редиректится на главную',
      `цепочка: ${nav.join(' → ')}`);
    await ctx.close();
  }

  // ── п.2 · медленный ответ о правах: ни панели, ни редиректа ────────────────────────────
  console.log('\nМедленные права — человек не выброшен (п.2):');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: 'ru-RU' });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/profile?as=guest`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    // Восстановление сессии проверяется у Auth запросом accounts:lookup — придерживаем ЕГО:
    // пока он не ответил, продукт о правах не знает ничего и обязан ждать, а не приговаривать.
    await page.route('**/accounts:lookup*', async (route) => {
      await new Promise((r) => setTimeout(r, 5000));
      await route.continue();
    });
    const nav2 = recordNav(page);
    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500); // задержка ещё держит ответ
    const heldPath = new URL(page.url()).pathname;
    const heldText = await page.evaluate(() => document.body.innerText || '');
    check(heldPath === '/admin', 'п.2а: пока прав не знаем — человек НЕ выброшен', `уже на ${heldPath}`);
    check(!heldText.includes(DOOR_LABEL), 'п.2б: пока прав не знаем — панель НЕ показана');
    await page.screenshot({ path: `${OUT}/holding.png` });
    // Ответ пришёл → гость приговорён честно: редирект на главную (контроль, что ожидание
    // не вечное, — иначе «не выброшен» был бы зелёным и на зависшем продукте).
    const left = await waitLeftAdmin(page, 10000);
    check(left !== null && nav2.includes('/'), 'п.2в: после ответа гость всё же редиректится',
      `цепочка: ${nav2.join(' → ')}`);
    await ctx.close();
  }

  // ── п.5 · дверь в «Меню»: у не-админа НИ ОДНОГО кадра ──────────────────────────────────
  console.log('\nДверь в «Меню» (п.5):');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: 'ru-RU' });
    // rAF-трасса с ПЕРВОГО кадра: единичный снимок мигание не ловит.
    await ctx.addInitScript((label) => {
      window.__doorFrames = [];
      const probe = () => {
        window.__doorFrames.push(document.body ? (document.body.innerText || '').includes(label) : false);
        requestAnimationFrame(probe);
      };
      requestAnimationFrame(probe);
    }, DOOR_LABEL);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/menu?as=guest`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const frames = await page.evaluate(() => window.__doorFrames ?? []);
    const blinked = frames.some(Boolean);
    check(frames.length > 30 && !blinked, 'п.5а: у гостя двери нет ни одного кадра',
      `кадров ${frames.length}, с дверью ${frames.filter(Boolean).length}`);
    await ctx.close();
  }

  // ── п.5б + оболочка · админ видит дверь и панель ───────────────────────────────────────
  console.log('\nАдмин видит дверь и оболочку:');
  for (const [theme, width] of [['light', 390], ['dark', 1440]]) {
    const tag = `${theme}-${width}`;
    const ctx = await browser.newContext({ viewport: { width, height: 860 }, locale: 'ru-RU' });
    await ctx.addInitScript((v) => localStorage.setItem('ndim-theme', v), theme);
    const page = await ctx.newPage();
    // Автовход стенда: dev@ndim.space (клейм admin выставлен выше, токен выпускается уже с ним).
    await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4500);

    await page.goto(`${BASE}/menu`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const menuText = await page.evaluate(() => document.body.innerText || '');
    check(menuText.includes(DOOR_LABEL), `п.5б (${tag}): админ видит дверь в «Меню»`);
    await page.screenshot({ path: `${OUT}/menu-admin-${tag}.png`, fullPage: true });

    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const path = new URL(page.url()).pathname;
    const text = await page.evaluate(() => document.body.innerText || '');
    check(path === '/admin', `оболочка (${tag}): админ остаётся в разделе`, `оказался на ${path}`);
    check(text.includes(DOOR_LABEL), `оболочка (${tag}): шапка «${DOOR_LABEL}» на месте`);
    check(/админ/i.test(text), `оболочка (${tag}): признак «админ» виден`);
    await page.screenshot({ path: `${OUT}/admin-shell-${tag}.png`, fullPage: true });
    await ctx.close();
  }
} finally {
  await browser.close();
  if (preview) {
    // ⚠️ На Windows `kill()` дочернего процесса с shell:true гасит ОБОЛОЧКУ, а vite выживает
    // и продолжает отдавать УСТАРЕВШУЮ сборку следующему прогону (капкан №2 STATUS — этот
    // страж сам на него наступил при первом же прогоне). Гасим всё дерево.
    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /PID ${preview.pid} /T /F`, { stdio: 'ignore' });
      } catch {
        /* уже погас */
      }
    } else {
      preview.kill('SIGTERM');
    }
  }
}

console.log(`\n${fails.length === 0 ? '✅' : '❌'} verify-admin-home: пройдено ${pass}, провалов ${fails.length}`);
if (fails.length) {
  for (const f of fails) console.log('  · ' + f);
  process.exit(1);
}

/**
 * QA-прогон волны 11 (пачка 1) — ворота сдачи по plans/06.
 *
 * Что проверяет (каждая строка = дословная претензия владельца из чата 2026-07-27):
 *  1) «в мобилке не реагирует» / «Пространство вообще вид никак не меняет» —
 *     открытая вкладка нижней панели подсвечена СИНЕЙ ПЛАШКОЙ и синим цветом на
 *     ВСЕХ пяти экранах, ровно как в десктопном рельсе; форма иконки при этом
 *     НЕ подменяется (сравниваем `d` активной и неактивной иконки одного раздела).
 *  2) высота панели не выросла из-за плашки (инвариант «до/после»: 60px).
 *  3) «когда переключаю тему через Settings, кнопка в хедере не переключается» —
 *     переключили тему в «Меню» → значок шапки сменился, `data-theme` сменился,
 *     сегмент «Вид» согласован. И наоборот: переключили в шапке → сегмент следует.
 *  4) «globe Все» — в профиле на экран не печатаются ИМЕНА иконок.
 *  5) «выравнивание иконки и текста ужасное» — в чипах с иконкой и подписью центры
 *     иконки и текста расходятся не больше чем на 1px по вертикали.
 *  6) «контекстные меню не закрываются, когда тапаешь вне меню» — открыли меню
 *     карточки «Измерений», тапнули мимо → закрылось; Esc → закрылось.
 *
 * Запуск: `npm run stand` (эмуляторы + сид + vite dev на :5173), затем
 *   node tools/verify-wave11.mjs
 * Скриншоты — test-results/wave11/ (вне git).
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const STAND = 'http://localhost:5173';
const OUT = 'test-results/wave11';
const ROUTES = [
  ['/profile', 'Профиль'],
  ['/relations', 'Связи'],
  ['/space', 'Пространство'],
  ['/dims', 'Измерения'],
  ['/menu', 'Меню'],
];

let pass = 0;
const fails = [];
const ok = (name) => { pass++; console.log(`  ✓ ${name}`); };
const bad = (name, detail) => { fails.push(`${name}: ${detail}`); console.log(`  ✗ ${name} — ${detail}`); };

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

const AUTH = 'http://127.0.0.1:9099';
/** Проект СТЕНДА, а не боевой: эмулятор держит oobCode'ы под `demo-ndim-dev`. */
const PROJECT = 'demo-ndim-dev';

/**
 * Вход на стенде почтовой ссылкой — как из письма, только без письма (EXP-0045).
 * Тот же приём, что в `tools/verify-bugs08.mjs`; сид кладёт `dev@ndim.space`.
 */
async function signIn(page) {
  const email = 'dev@ndim.space';
  const sent = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=demo-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestType: 'EMAIL_SIGNIN', email, continueUrl: `${STAND}/profile` }),
  });
  if (!sent.ok) return false;
  const res = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes = [] } = await res.json();
  const last = oobCodes.filter((c) => c.email === email && c.requestType === 'EMAIL_SIGNIN').at(-1);
  if (!last) return false;
  await page.goto(`${STAND}/profile?mode=signIn&oobCode=${last.oobCode}&apiKey=demo-api-key`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  return true;
}

// ── 1–2. Подсветка открытой вкладки и высота панели ───────────────────────────
console.log('── Открытая вкладка: синяя плашка, форма иконки не меняется ──');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  const shapes = {};

  for (const [route, label] of ROUTES) {
    await page.goto(STAND + route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    const nav = await page.evaluate(() => {
      const n = document.querySelector('nav.bnav');
      if (!n) return null;
      const height = Math.round(n.getBoundingClientRect().height);
      const links = [...n.querySelectorAll('a')].map((a) => {
        const cs = getComputedStyle(a);
        return {
          text: a.innerText.trim(),
          on: a.classList.contains('on'),
          color: cs.color,
          bg: cs.backgroundColor,
          d: a.querySelector('path')?.getAttribute('d')?.slice(0, 60) ?? '',
        };
      });
      return { height, links };
    });
    if (!nav) { bad(`${label}: панель`, 'nav.bnav не найдена'); continue; }

    const act = nav.links.find((l) => l.on);
    const idle = nav.links.find((l) => !l.on);
    if (!act) { bad(`${label}: активная вкладка`, 'ни одна не помечена .on'); continue; }

    // Плашка: фон активного пункта ОТЛИЧАЕТСЯ от прозрачного, цвет — не серый обычного.
    const tinted = act.bg !== 'rgba(0, 0, 0, 0)' && act.bg !== 'transparent';
    const recoloured = act.color !== idle.color;
    if (tinted && recoloured) ok(`${label}: плашка ${act.bg.slice(0, 24)}… и цвет ${act.color}`);
    else bad(`${label}: подсветка`, `фон=${act.bg} цвет=${act.color} (у обычного ${idle.color})`);

    if (nav.height === 60) ok(`${label}: высота панели 60px (инвариант до/после)`);
    else bad(`${label}: высота панели`, `${nav.height}px, ожидалось 60`);

    // Форму иконки запоминаем: тот же раздел в активном и обычном виде обязан дать один `d`.
    for (const l of nav.links) {
      const key = l.text;
      shapes[key] ??= {};
      shapes[key][l.on ? 'on' : 'off'] = l.d;
    }
    await page.screenshot({ path: `${OUT}/nav-${route.replace(/\//g, '') || 'root'}-390.png` });
  }

  for (const [label, s] of Object.entries(shapes)) {
    if (!s.on || !s.off) continue;
    if (s.on === s.off) ok(`${label}: форма иконки не подменяется`);
    else bad(`${label}: форма иконки`, 'активная и обычная различаются — владелец просил не менять');
  }
  await ctx.close();
}

// ── 3. Тема: «Меню» и шапка ходят вместе ──────────────────────────────────────
console.log('── Тема: сегмент «Вид» и кнопка шапки согласованы ──');
for (const width of [390, 1440]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem('ndim-theme', 'light'));
  await page.goto(`${STAND}/menu`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);

  const state = async () => await page.evaluate(() => {
    const seg = [...document.querySelectorAll('.seg button')].find((b) => b.classList.contains('on') && /Тём|Свет|Dark|Light/.test(b.innerText));
    const headerPath = document.querySelector('header.bar button.theme svg path')?.getAttribute('d')?.slice(0, 40) ?? null;
    return {
      attr: document.documentElement.getAttribute('data-theme'),
      seg: seg?.innerText.trim() ?? null,
      header: headerPath,
    };
  });

  const before = await state();
  // Переключаем тему ИЗ МЕНЮ — ровно то действие владельца.
  await page.locator('.seg button', { hasText: /Тёмная|Dark/ }).first().click();
  await page.waitForTimeout(400);
  const after = await state();

  if (after.attr === 'dark') ok(`${width}px тема применилась из «Меню»`);
  else bad(`${width}px тема из «Меню»`, `data-theme=${after.attr}`);

  if (after.seg && /Тём|Dark/.test(after.seg)) ok(`${width}px сегмент «Вид» показывает тёмную`);
  else bad(`${width}px сегмент «Вид»`, `активна кнопка «${after.seg}»`);

  if (before.header && after.header && before.header !== after.header) ok(`${width}px значок шапки сменился вслед за «Меню»`);
  else bad(`${width}px значок шапки`, `был ${before.header?.slice(0, 16)}…, стал ${after.header?.slice(0, 16)}… — не отреагировал`);

  // Обратная сторона: переключение ИЗ ШАПКИ обязано двигать сегмент «Вид».
  await page.locator('header.bar button.theme').click();
  await page.waitForTimeout(400);
  const back = await state();
  if (back.attr === 'light' && back.seg && /Свет|Light/.test(back.seg)) ok(`${width}px сегмент следует за шапкой`);
  else bad(`${width}px сегмент за шапкой`, `data-theme=${back.attr}, активна «${back.seg}»`);

  await page.screenshot({ path: `${OUT}/theme-${width}.png` });
  await ctx.close();
}

// ── 4–5. Профиль: имена иконок не печатаются, иконка и текст выровнены ────────
console.log('── Профиль: чипы видимости ──');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const signedIn = await signIn(page);
  if (!signedIn) {
    bad('профиль', 'не удалось войти на стенде (нужен `npm run stand`)');
  } else {
    await page.goto(`${STAND}/profile`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    // Чипы аудитории живут в окне «Как меня видят» (слово владельца 2026-07-27:
    // вкладка «Видимость» упразднена — кнопка открывает окно предпросмотра).
    await page.locator('button', { hasText: /^Как меня видят$|^How others see me$/ }).first().click().catch(() => {});
    await page.waitForTimeout(900);

    // 4. На экране не должно быть ИМЁН иконок как текста.
    const names = ['globe', 'lock', 'relations', 'person', 'envelope'];
    const text = await page.locator('main').innerText();
    const leaked = names.filter((n) => new RegExp(`\\b${n}\\b`).test(text));
    if (leaked.length === 0) ok('имена иконок на экран не печатаются');
    else bad('имена иконок', `в тексте найдено: ${leaked.join(', ')} (это был баг «globe Все»)`);

    // 5. Выравнивание: центр иконки и центр строки текста в чипе.
    const offsets = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('.aud, .seg button')) {
        const svg = el.querySelector('svg');
        if (!svg) continue;
        const a = svg.getBoundingClientRect();
        const b = el.getBoundingClientRect();
        out.push({ label: el.innerText.trim().slice(0, 14), delta: Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)) });
      }
      return out;
    });
    if (offsets.length === 0) bad('выравнивание чипов', 'чипов с иконкой на экране не найдено');
    const worst = offsets.sort((x, y) => y.delta - x.delta)[0];
    if (worst && worst.delta <= 1) ok(`иконка и текст в одной линии (худший зазор ${worst.delta.toFixed(2)}px на «${worst.label}»)`);
    else if (worst) bad('выравнивание чипов', `«${worst.label}» — центр иконки уехал на ${worst.delta.toFixed(2)}px`);

    await page.screenshot({ path: `${OUT}/profile-chips-1440.png`, fullPage: false });
  }
  await ctx.close();
}

// ── 6. Контекстное меню закрывается тапом мимо ────────────────────────────────
console.log('── «Измерения»: контекстное меню закрывается тапом мимо ──');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  await signIn(page);
  await page.goto(`${STAND}/dims`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);

  const dots = page.locator('button.dots').first();
  if (await dots.count() === 0) {
    bad('контекстное меню', 'карточек измерений на стенде нет — проверить нечего');
  } else {
    await dots.click();
    await page.waitForTimeout(300);
    const opened = await page.locator('.drop').count();
    if (opened > 0) ok('меню открылось');
    else bad('меню', 'не открылось по тапу «⋮»');

    // Тап МИМО меню.
    await page.mouse.click(30, 400);
    await page.waitForTimeout(400);
    const afterOutside = await page.locator('.drop').count();
    if (afterOutside === 0) ok('тап мимо меню закрывает его (канон 1.x)');
    else bad('тап мимо меню', 'меню осталось открытым');

    // Esc.
    await dots.click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const afterEsc = await page.locator('.drop').count();
    if (afterEsc === 0) ok('Esc закрывает меню');
    else bad('Esc', 'меню осталось открытым');

    await page.screenshot({ path: `${OUT}/dims-menu-390.png` });
  }
  await ctx.close();
}

await browser.close();

console.log('\n────────────────────────────────────────────────────');
console.log(`Пройдено: ${pass}, провалено: ${fails.length}`);
if (fails.length) { fails.forEach((f) => console.log(`  ✗ ${f}`)); process.exitCode = 1; }
console.log(`Скриншоты: ${OUT}/`);

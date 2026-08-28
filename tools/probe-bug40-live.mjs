/**
 * ЗОНД: видит ли ВОШЕДШИЙ человек лендинг, открывая приложение по базовой ссылке.
 *
 * ПОВОД. Владелец 2026-08-22: «*до сих пор я вижу в своём PWA и на десктопе лендинг при
 * открытии, который через пару мгновений прокидывает внутрь моего профиля*». Щит
 * (`bugs/40` пункт 2) сделан 2026-07-29 и лежит в бою — значит проверять надо не наличие
 * кода, а ПОВЕДЕНИЕ.
 *
 * ЧТО МЕРЯЕТ. Открывает боевой корень с ПРИЗНАКОМ СЕССИИ в localStorage (тем самым, по
 * которому щит решает подниматься) и снимает покадрово, ЧТО ВИДИТ ЧЕЛОВЕК в верхней трети
 * экрана: щит, лендинг или приложение. Спрашивает браузер через `elementFromPoint`, а не
 * `innerText`: лендинг пререндерен и лежит в DOM всегда, щит его лишь накрывает — прибор,
 * судящий по тексту, увидел бы лендинг сквозь непрозрачный щит (`bugs/40`, ловушка 1).
 *
 * ⛔ ЧИТАЮЩИЙ. Ничего не пишет ни в базу, ни в учётки: настоящий вход не выполняется, ставится
 * только маркер, который продукт и так держит у вошедшего. Оценок не двигает.
 *
 * 🅿 ВХОДОВ В ПРОДУКТ ТРИ, И ЗОНД ОБЯЗАН УМЕТЬ КАЖДЫЙ (правка 2026-08-22, разбор дефекта).
 * Первая редакция открывала только корень `/` — а человек входит ещё и по языковому адресу
 * (`/ru`, `/en` — лендинг переехал туда, `plans/39`), и через установленное приложение, у
 * которого `start_url` = `/profile` (манифест). Владелец жалуется и на десктоп, и на PWA, значит
 * судить один вход и делать вывод обо всех — это ровно тот класс, из-за которого дефект дожил до
 * его третьей жалобы. Вход задаётся вторым аргументом.
 *
 * 🅿 `--real-session` — НАСТОЯЩАЯ СЕССИЯ ВМЕСТО ПОДДЕЛЬНОГО МАРКЕРА, и это не удобство.
 * С поддельным маркером щит поднимется, но `hasSession()` честно ответит «нет», щит опустится
 * и лендинг покажется ЗАКОННО — то есть «кадров лендинга 0» на стенде так не проверить вовсе.
 * Флаг сначала заходит на `/profile` (стенд логинит dev-пользователя сам) и ждёт, пока продукт
 * САМ поставит маркер, — судим продукт, а не свою заготовку. ⛔ В бою флаг не применим: там
 * входа у зонда нет и быть не должно, поэтому по бою мерится ОКНО МЕЛЬКАНИЯ, а не итог.
 *
 * Запуск: node tools/probe-bug40-live.mjs [адрес] [вход] [--real-session]
 *   node tools/probe-bug40-live.mjs                          # бой, вход `/`
 *   node tools/probe-bug40-live.mjs http://localhost:5213 /ru # стенд слота, вход с лендинга
 *   node tools/probe-bug40-live.mjs http://localhost:5213 /ru --real-session   # стенд, вход по-настоящему
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { markProbeContext } from './lib/probe-mark.mjs';

const BASE = process.argv[2] ?? 'https://ndimspace.app';
/** Вход в продукт: `/` (распознаватель) · `/ru`, `/en` (лендинг) · `/profile` (start_url PWA). */
const ENTRY = process.argv.slice(3).find((a) => !a.startsWith('--')) ?? '/';
/** Стендовый режим: войти по-настоящему, а не подделывать маркер (см. шапку). */
const REAL_SESSION = process.argv.includes('--real-session');
const OUT = 'test-results/bug40-live';
mkdirSync(OUT, { recursive: true });

/** Сколько кадров снимаем и с каким шагом — окно шире, чем на стенде: бой отвечает по сети. */
const FRAMES = 40;
const STEP_MS = 100;

const browser = await chromium.launch();
const results = [];

for (const round of ['холодный контекст', 'повторное открытие']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await markProbeContext(ctx);
  if (!REAL_SESSION) {
    // Признак сессии — ровно тот, по которому щит решает подниматься (`src/lib/data/session.ts`).
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('ndim-session', '1');
      } catch {
        /* приватный режим */
      }
    });
  }
  const page = await ctx.newPage();

  if (REAL_SESSION) {
    // Стенд логинит dev-пользователя сам: заходим внутрь и ЖДЁМ, пока продукт поставит маркер.
    // Ждём именно маркера, а не таймаута: «подождал и надеюсь» — это лотерея, а не проверка.
    await page.goto(BASE + '/profile', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => localStorage.getItem('ndim-session') === '1', null, {
      timeout: 30000,
    });
  }

  await page.goto(BASE + ENTRY, { waitUntil: 'commit' });

  let shield = 0;
  let landing = 0;
  let app = 0;
  const path = new Set();

  for (let i = 0; i < FRAMES; i++) {
    const seen = await page
      .evaluate(() => {
        // Спрашиваем БРАУЗЕР, что лежит сверху в этой точке, а не текст документа.
        const el = document.elementFromPoint(window.innerWidth / 2, 120);
        if (!el) return { what: 'пусто', path: location.pathname };
        const shielded = document.documentElement.hasAttribute('data-booting');
        const inBoot = !!el.closest?.('#boot');
        return {
          what: inBoot || shielded ? 'щит' : location.pathname.startsWith('/profile') ? 'приложение' : 'лендинг',
          path: location.pathname,
        };
      })
      .catch(() => null);
    if (seen) {
      path.add(seen.path);
      if (seen.what === 'щит') shield++;
      else if (seen.what === 'лендинг') landing++;
      else if (seen.what === 'приложение') app++;
      if (i === 3 || i === 10) await page.screenshot({ path: `${OUT}/${round === 'холодный контекст' ? 'cold' : 'warm'}-${i}.png` });
    }
    await page.waitForTimeout(STEP_MS);
  }

  results.push({ round, shield, landing, app, path: [...path].join(' → ') });
  await ctx.close();
}

await browser.close();

console.log(`\nБАЗА: ${BASE}   ·   ВХОД: ${ENTRY}   ·   кадров на раунд: ${FRAMES} по ${STEP_MS} мс\n`);
console.log('раунд                 щит   ЛЕНДИНГ   приложение   путь');
for (const r of results) {
  console.log(
    `${r.round.padEnd(20)}  ${String(r.shield).padStart(3)}   ${String(r.landing).padStart(7)}   ${String(r.app).padStart(10)}   ${r.path}`,
  );
}
const bad = results.some((r) => r.landing > 0);
console.log(
  `\n${bad ? '❌ ВОШЕДШИЙ ВИДИТ ЛЕНДИНГ' : '✅ кадров лендинга нет'} · кадры: ${OUT}/`,
);
process.exit(bad ? 1 : 0);

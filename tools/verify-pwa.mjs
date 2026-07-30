/**
 * Страж установки приложения на телефон — манифест и иконки (`plans/07` B2, `bugs/58`).
 *
 * ⚠️ ГОНЯЕТСЯ ПО СОБРАННОМУ САЙТУ: `npm run build`, затем
 * `npx vite preview --port 4173 --strictPort`, затем этот страж. Проверять надо тот артефакт,
 * который уезжает в бой; в `vite dev` статика раздаётся иначе.
 * ⚠️ `--strictPort` обязателен: при занятом порте preview молча уезжает на 4174, а на 4173
 * отвечает ПРЕЖНИЙ сервер со старой сборкой — страж тогда судит не о том (поймано 2026-07-30).
 *
 * ── ЧТО СТЕРЕЖЁТСЯ И ПОЧЕМУ ИМЕННО ЭТО ────────────────────────────────────────────────────
 * 1. **Манифест реально отдаётся** и является валидным JSON. Файл в `static/` может исчезнуть
 *    из сборки молча — тогда приложение просто перестанет ставиться, и никто не заметит.
 * 2. **Поля, от которых зависит установка** (`researches/19` §1): `name`, `short_name`, `icons`,
 *    `start_url`, `display`. Плюс `id` и `scope` — от `scope` зависит, сможет ли браузер увести
 *    в приложение ссылку из письма (`bugs/83`).
 * 3. **Иконки существуют и имеют заявленный РАЗМЕР В ПИКСЕЛЯХ.** Проверяется `naturalWidth`, а не
 *    код ответа: битый или подменённый файл отдаётся с 200 и выглядит как рабочий (канон
 *    проекта — смотреть пиксели, `bugs/14`).
 * 4. **Есть maskable-иконка.** Без неё Android обрежет знак под свою маску.
 * 5. **HTML ссылается на манифест и apple-touch-icon** — iOS манифест почти не читает.
 * 6. Консоль чиста: битая ссылка на иконку сыплет 404 и портит впечатление о продукте.
 *
 * Запуск: node tools/verify-pwa.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:4173';

let pass = 0;
const fails = [];
function check(ok, what, detail = '') {
  if (ok) pass++;
  else {
    fails.push(`${what}${detail ? ' — ' + detail : ''}`);
    console.log(`  ❌ ${what}${detail ? ' — ' + detail : ''}`);
  }
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 820 } });

  // 1 · Манифест отдаётся и разбирается.
  const res = await ctx.request.get(`${BASE}/manifest.webmanifest`);
  check(res.ok(), 'манифест отдаётся сборкой', `HTTP ${res.status()}`);
  let manifest = null;
  try {
    manifest = JSON.parse(await res.text());
  } catch (error) {
    check(false, 'манифест — валидный JSON', String(error).slice(0, 120));
  }
  check(manifest !== null, 'манифест разобран');

  if (manifest !== null) {
    // 2 · Поля, от которых зависит установка.
    for (const field of ['id', 'name', 'short_name', 'icons', 'start_url', 'scope', 'display']) {
      check(manifest[field] !== undefined, `поле «${field}» на месте`);
    }
    // Имена — канон проекта, а не вкус агента (AGENT_GUIDE → «Идентичность проекта»).
    check(manifest.name === 'NDim Space', 'имя приложения по канону', String(manifest.name));
    check(manifest.short_name === 'NDim', 'короткое имя по канону', String(manifest.short_name));
    check(manifest.display === 'standalone', 'display: standalone', String(manifest.display));
    /*
     * scope обязан покрывать ВЕСЬ сайт. От этого зависит, сможет ли браузер увести ссылку из
     * письма в установленное приложение: он захватывает переход, только если адрес попадает в
     * scope (`researches/19` §2.1, `bugs/83`).
     */
    check(manifest.scope === '/', 'scope покрывает весь сайт — от этого зависит bugs/83', String(manifest.scope));
    check(
      typeof manifest.start_url === 'string' && manifest.start_url.startsWith('/'),
      'start_url — путь внутри сайта',
      String(manifest.start_url),
    );

    // 3+4 · Иконки: существуют, нужного размера, есть maskable.
    const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
    const sizes = icons.map((icon) => icon.sizes);
    check(sizes.includes('192x192'), 'иконка 192×192 объявлена', sizes.join(' · '));
    check(sizes.includes('512x512'), 'иконка 512×512 объявлена', sizes.join(' · '));
    check(
      icons.some((icon) => String(icon.purpose ?? '').includes('maskable')),
      'есть maskable-иконка (иначе Android обрежет знак)',
      icons.map((i) => i.purpose ?? '—').join(' · '),
    );

    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });

    for (const icon of icons) {
      // ПИКСЕЛИ, а не код ответа: битый файл отдаётся с 200 и выглядит рабочим.
      const real = await page.evaluate(
        (src) =>
          new Promise((done) => {
            const probe = new Image();
            probe.onload = () => done({ w: probe.naturalWidth, h: probe.naturalHeight });
            probe.onerror = () => done({ w: 0, h: 0 });
            probe.src = src;
          }),
        icon.src,
      );
      const [wantW, wantH] = String(icon.sizes).split('x').map(Number);
      check(
        real.w === wantW && real.h === wantH,
        `иконка ${icon.src} на месте и ${icon.sizes} ПИКСЕЛЯМИ`,
        `получено ${real.w}×${real.h}`,
      );
    }

    // 5 · Ссылки в HTML.
    const links = await page.evaluate(() => ({
      manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null,
      apple: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') ?? null,
    }));
    check(links.manifest !== null, 'HTML ссылается на манифест', String(links.manifest));
    check(links.apple !== null, 'HTML ссылается на apple-touch-icon (iOS манифест не читает)', String(links.apple));

    const appleReal = links.apple
      ? await page.evaluate(
          (src) =>
            new Promise((done) => {
              const probe = new Image();
              probe.onload = () => done(probe.naturalWidth);
              probe.onerror = () => done(0);
              probe.src = src;
            }),
          links.apple,
        )
      : 0;
    check(appleReal === 180, 'apple-touch-icon 180×180 ПИКСЕЛЯМИ', `ширина ${appleReal}`);

    check(errors.length === 0, 'консоль чиста', errors.join(' | ').slice(0, 160));
    await page.close();
  }

  await ctx.close();
} finally {
  await browser.close();
}

console.log(`\nИтог: ${pass} зелёных, ${fails.length} провалов`);
if (fails.length) fails.forEach((f) => console.log('  ❌ ' + f));
process.exit(fails.length ? 1 : 0);

/**
 * СТРАЖ ЯРУСА 2 ГОТОВНОСТИ ГРАФИКИ — фоновая догрузка полных персон лендинга.
 *
 * План — `plans/46` (шаг 2), идея — `ideas/27` шаг 3б, рецепт и доказательная база —
 * `researches/36` §2–3. Предмет охраны: три полноразмерные иллюстрации персонажей
 * (~1,2 МБ каждая) греются в HTTP-кэше В ФОНЕ, а не едут в момент тапа по зуму.
 *
 * 🔑 СТЕРЕЖЁТ С ОБЕИХ СТОРОН, и в этом весь смысл прибора:
 *   · ссылок `rel=prefetch` НЕТ в СЫРОМ HTML — иначе префетч соревнуется за канал с самой
 *     отрисовкой лендинга и роняет Perf (правило 1 `researches/36` §2);
 *   · ссылки ЕСТЬ в живом `document.head` после `load` — иначе «оптимизация» просто не работает,
 *     и мегабайт снова поедет на горячую.
 * Проверка только одной стороны зелена на сломанном продукте: убрать код — и «в сыром HTML нет»
 * останется правдой.
 *
 * ⚠️ ГОНЯЕТСЯ ПО СОБРАННОМУ САЙТУ:
 *   `npm run build`, затем `npx vite preview --port 4173 --strictPort`, затем этот страж.
 * ⚠️ **`--strictPort` обязателен.** Без него `vite preview` при занятом 4173 молча уезжает на
 * 4174, а на 4173 отвечает ПРЕЖНИЙ сервер со списком файлов от старой сборки — страж судит чужой
 * сервер и краснеет как на дефекте продукта (капкан оплачен 2026-07-30, шапка `verify-bug81`).
 * ⚠️ После каждой пересборки preview НАДО ПЕРЕЗАПУСТИТЬ — он кеширует список файлов при старте.
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:4173';

/** Полные иллюстрации, которые обязаны греться (`static/img/personas/`). */
const EXPECTED = ['alice.png', 'max.png', 'nastya.png'];

let pass = 0;
const fails = [];
const check = (ok, what, detail = '') => {
  if (ok) pass += 1;
  else fails.push(`${what}${detail ? ' — ' + detail : ''}`);
  console.log(`  ${ok ? '✅' : '❌'} ${what}${detail ? ` — ${detail}` : ''}`);
};

/** Читает ссылки префетча из ЖИВОГО head после полной загрузки и простоя. */
const liveLinks = (page) =>
  page.evaluate(() =>
    [...document.head.querySelectorAll('link[rel="prefetch"][as="image"]')].map((l) => l.href),
  );

console.log(`\nСТРАЖ ЯРУСА 2 — префетч полных персон · ${BASE}\n`);

// ── 1. Сырой HTML: ни одной ссылки префетча ──────────────────────────────────
{
  const res = await fetch(`${BASE}/ru`);
  const html = await res.text();
  const hits = (html.match(/rel="prefetch"/g) ?? []).length;
  check(res.status === 200, 'страница /ru отдана', `код ${res.status}`);
  check(
    hits === 0,
    '🔑 в СЫРОМ HTML нет ни одной ссылки префетча (ярус 2 не воюет с первым кадром)',
    `нашлось ${hits}`,
  );
}

const browser = await chromium.launch();

// ── 2. Живая страница: ровно три ссылки, и это именно полные персоны ─────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/ru`, { waitUntil: 'load', timeout: 45000 });
  // Ждём СОСТОЯНИЯ, а не секундомера: ссылки ставятся в простое (`requestIdleCallback`),
  // и жёсткий таймаут сделал бы прибор лотереей на нагруженной машине.
  await page
    .waitForFunction(
      () => document.head.querySelectorAll('link[rel="prefetch"][as="image"]').length >= 3,
      null,
      { timeout: 15000 },
    )
    .catch(() => {});
  const links = await liveLinks(page);
  check(links.length === 3, '🔑 в живом head ровно 3 ссылки префетча', `их ${links.length}`);
  for (const name of EXPECTED) {
    check(
      links.some((h) => h.endsWith(`/${name}`)),
      `греется полная персона ${name}`,
      links.map((h) => h.split('/').pop()).join(', '),
    );
  }
  await ctx.close();
}

// ── 3. Экономия трафика: при saveData не греем ничего ────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  /*
   * `navigator.connection` подменяется ДО загрузки страницы: код яруса 2 читает флаг один раз,
   * в момент прогрева, и подмена после загрузки ничего бы не проверила.
   */
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      get: () => ({ saveData: true }),
    });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/ru`, { waitUntil: 'load', timeout: 45000 });
  // Здесь ждать «появления» нечего — ждём ОТСУТСТВИЯ, поэтому даём коду яруса 2 честно
  // отработать простой и только потом смотрим.
  await page.waitForTimeout(4000);
  const links = await liveLinks(page);
  check(
    links.length === 0,
    '🔑 при saveData=true не греется НИЧЕГО (уважение к чужому трафику)',
    `нашлось ${links.length}: ${links.map((h) => h.split('/').pop()).join(', ')}`,
  );
  await ctx.close();
}

await browser.close();

console.log(`\n${fails.length ? '🔴' : '✅'} ИТОГ: ${pass} прошло, ${fails.length} провалов\n`);
process.exit(fails.length ? 1 : 0);

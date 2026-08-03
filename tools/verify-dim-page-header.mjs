#!/usr/bin/env node
/**
 * СТРАЖ ШАПКИ ПУБЛИЧНОЙ СТРАНИЦЫ — живым браузером по СОБРАННОМУ сайту (`bugs/114`).
 *
 * 🔴 ЗАЧЕМ ОН ЕСТЬ. Кнопка темы на этой странице была поставлена компонентом с `onclick` — и
 * оказалась МЁРТВОЙ: страница объявлена `csr = false`, клиентский бандл там не исполняется
 * вовсе. Сборка была зелёной, типы чистыми, разметка правильной. Дефект увидел ВЛАДЕЛЕЦ, а не
 * прибор, — потому что прибора на «кнопка действительно нажимается» не было.
 *
 * Отсюда правило класса: **интерактив на странице без клиентского JS проверяется НАЖАТИЕМ.**
 * Ни типы, ни сборка, ни разметка этого не видят по построению.
 *
 * Запуск:  npm run build && npx vite preview --port 4173 --strictPort
 *          node tools/verify-dim-page-header.mjs
 * Выход:   0 — чисто; 1 — есть провалы.
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:4173';
const PAGE = '/ru/dimension/the-matrix-z3jmk1ix';

let failed = 0;
let passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  const res = await page.goto(BASE + PAGE, { waitUntil: 'domcontentloaded' });
  check('страница отдана', res?.status() === 200, `HTTP ${res?.status()}`);

  // ── Знак бренда — настоящий, а не цветной квадрат ──────────────────────────
  console.log('\n— знак бренда —');
  const brandSvg = await page.locator('header.bar a svg').count();
  check('в шапке настоящий знак (SVG), а не заглушка', brandSvg > 0, `svg: ${brandSvg}`);

  // ── 🔴 ТЕМА: НАЖАТИЕМ, а не осмотром ───────────────────────────────────────
  console.log('\n— кнопка темы РАБОТАЕТ (проверка нажатием) —');
  const themeOf = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));

  const before = await themeOf();
  check('кнопка темы есть в шапке', (await page.locator('#theme-toggle').count()) === 1);
  // Контроль прибора (EXP-0082): тема ДО клика вообще выставлена — иначе сравнивать нечего.
  check('тема выставлена до клика', before === 'light' || before === 'dark', `${before}`);

  await page.locator('#theme-toggle').click();
  const after = await themeOf();
  check('🔴 клик ПЕРЕКЛЮЧИЛ тему', after !== before && (after === 'light' || after === 'dark'),
    `${before} → ${after}`);

  // Значок обязан показывать ТЕКУЩУЮ тему: солнце в светлой, луна в тёмной.
  const sunVisible = await page.locator('#theme-toggle .sun').isVisible();
  const moonVisible = await page.locator('#theme-toggle .moon').isVisible();
  check('значок показывает текущую тему', (after === 'dark' ? moonVisible : sunVisible) && sunVisible !== moonVisible,
    `солнце ${sunVisible} · луна ${moonVisible}`);

  // Выбор переживает перезагрузку — его пишет тот же инлайн-скрипт.
  await page.reload({ waitUntil: 'domcontentloaded' });
  check('выбор темы пережил перезагрузку', (await themeOf()) === after, `${await themeOf()}`);

  // Обратное плечо: второй клик возвращает исходную тему.
  await page.locator('#theme-toggle').click();
  check('второй клик вернул прежнюю тему', (await themeOf()) === before, `${await themeOf()}`);

  // ── Язык — ссылкой, и она ведёт на парный адрес ────────────────────────────
  console.log('\n— переключатель языка —');
  const langHref = await page.locator('header.bar a.langsw').getAttribute('href');
  check('переключатель языка — ССЫЛКА', typeof langHref === 'string' && langHref.startsWith('/en/dimension/'),
    `${langHref}`);
  await page.locator('header.bar a.langsw').click();
  await page.waitForLoadState('domcontentloaded');
  check('переход даёт английскую страницу',
    (await page.evaluate(() => document.documentElement.getAttribute('lang'))) === 'en');

  // ── «Войти» ведёт в дверь, а не на витрину ────────────────────────────────
  console.log('\n— вход —');
  const enter = await page.locator('header.bar a.enter').getAttribute('href');
  check('«Войти» ведёт в /profile, а не на «/»', enter === '/profile', `${enter}`);
} finally {
  await browser.close();
}

console.log(`\n${failed === 0 ? '✅' : '❌'} проверок ${passed + failed} · провалов ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);

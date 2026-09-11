/**
 * ПРОБА СЛОЯ С — ГЛАВНАЯ СЧИТАЕТ ПРИХОД НА ЖИВОМ КОНТУРЕ (`qa/suites/root-landing-view.md`, ГЛ-13).
 *
 * Что делает: свежий браузер БЕЗ метки прибора открывает корень живого контура (по умолчанию
 * стейдж) и слушает, ушло ли из страницы событие в PostHog и что ответил PostHog. Печатает
 * `distinct_id` отправленного события — по нему событие ищется в ряду через MCP.
 *
 * 🔴 МЕТКИ ПРИБОРА ЗДЕСЬ НЕТ НАМЕРЕННО, и это единственный такой прибор: смысл слоя С — что
 * настоящий приход доезжает до PostHog, а под меткой строка молчит по построению. След прогона —
 * события с `env` контура и `$lib = ndim-root-inline` в общем ряду; на бою прибор не запускать
 * без слова владельца (`--base https://ndimspace.app` считается человеком).
 *
 * 🆕 РЕЖИМ ПРОГУЛКИ `--walk` — по слову владельца 2026-09-12 (интервью №081 В1 = Б: «*сам сходи
 * на стейдж, походи по нему, даже несколько раз, и сам посмотри аналитику*»). Проходы:
 *   П1…П4 — четыре свежих захода на главную: 390×light · 1440×dark · 390×dark · 1440×light
 *           (каждый обязан дать ровно одно событие корня);
 *   П5    — главная → ссылка «Русский» → лендинг `/ru` (там считает SDK — ждём его обращения к
 *           PostHog; событие корня — ровно одно, до перехода);
 *   П6    — главная → большая кнопка «гостем» → `/profile?guest=1` → назад на главную: с маркером
 *           сессии главная обязана увести внутрь и НЕ посчитать второй раз.
 * Все проходы — свежие контексты без метки. Заведённая гостевая учётка убирается ключом контура
 * (`accounts:delete` по перехваченному `idToken`) — тот же приём, что у смоука под сессией.
 * Пропуск App Check ставится как у смоуков (иначе робота отказывает reCAPTCHA, `bugs/169`).
 *
 * Запуск: node tools/probe-root-landing-view-live.mjs [--base https://ndim-stage.web.app] [--walk]
 * Код возврата: 0 — все ожидания сошлись; 1 — хоть одно нет.
 */
import { pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

import { grantAppCheckDebug } from './lib/app-check-debug.mjs';
import { contourOfBase } from './lib/contours.mjs';

// Предохранитель «запущен или подключён» — каноническая форма приборов проекта (`pathToFileURL`).
// ⚠️ Первая редакция сравнивала с `new URL(argv[1], 'file:')` — на Windows это НЕ совпадает
// никогда, прибор молча делал ничего и выходил кодом 0: ложный зелёный первого вопроса
// лестницы. Поймано первым же живым запуском; поэтому ниже прибор ещё и ПЕЧАТАЕТ контур
// первой строкой — молчание больше не похоже на успех.
const ЗАПУЩЕН_НАПРЯМУЮ = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

const CAPTURE = /\/i\/v0\/e\/?/u;

/*
 * 🔴 ПРИБОР ПРИХОДИТ ЧЕЛОВЕКОМ. И строка корня, и SDK PostHog отсеивают роботов одним признаком
 * (`navigator.webdriver` · user agent · `userAgentData.brands`), а headless Chromium — робот по
 * всем трём. Первая прогулка 2026-09-12 показала ровно это: события корня доезжали (строка ещё
 * не отсеивала роботов), события SDK с лендинга и от гостя — нет, SDK честно молчал на робота.
 * Поэтому все три признака снимаются: обычный user agent, флаг `AutomationControlled` и
 * `userAgentData` спрятан. Роботом строку проверяют юнит и e2e, здесь — только человек.
 */
const HUMAN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const HUMAN_ARGS = ['--disable-blink-features=AutomationControlled'];

/** Один свежий контекст-человек: слушает отправки корня, обращения SDK и токены заведённых учёток. */
async function freshPage(browser, { width, height, dark }, tokens) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? 'dark' : 'light', userAgent: HUMAN_UA });
  await context.addInitScript(() => { try { Object.defineProperty(navigator, 'userAgentData', { get: () => undefined }); } catch { /* пусть будет как есть */ } });
  await grantAppCheckDebug(context, { required: false });
  const page = await context.newPage();
  const root = [];
  const sdk = [];
  const answers = [];
  page.on('request', (r) => {
    if (!r.url().includes('posthog.com')) return;
    if (CAPTURE.test(r.url())) root.push(JSON.parse(r.postData() ?? '{}'));
    else sdk.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  page.on('response', async (r) => {
    if (r.url().includes('posthog.com') && CAPTURE.test(r.url())) answers.push(r.status());
    if (/identitytoolkit.*accounts:(signUp|signInWithCustomToken)/u.test(r.url())) {
      try {
        const body = await r.json();
        if (typeof body.idToken === 'string') tokens.add(body.idToken);
      } catch { /* не JSON — не наш ответ */ }
    }
  });
  return { context, page, root, sdk, answers };
}

function describe(root) {
  return root.map((b) => `event=${b.event} id=${b.distinct_id} env=${b.properties?.env} $lib=${b.properties?.$lib} path=${b.properties?.$pathname}`).join('; ');
}

if (ЗАПУЩЕН_НАПРЯМУЮ) {
  const base = process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : 'https://ndim-stage.web.app';
  const walk = process.argv.includes('--walk');
  const contour = contourOfBase(base);
  const startedAt = new Date().toISOString();
  console.log(`контур: ${contour.name} · ${base} · начато ${startedAt} · режим: ${walk ? 'прогулка П1…П6' : 'один заход'}`);

  const browser = await chromium.launch({ args: HUMAN_ARGS });
  const tokens = new Set();
  const results = [];
  const check = (name, ok, detail) => {
    results.push(ok);
    console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  };

  const shapes = [
    { width: 390, height: 844, dark: false },
    { width: 1440, height: 900, dark: true },
    { width: 390, height: 844, dark: true },
    { width: 1440, height: 900, dark: false },
  ];
  const passes = walk ? shapes : shapes.slice(0, 1);

  // П1…П4 (или один заход): свежая главная — ровно одно событие корня, страница без кода.
  for (const [i, shape] of passes.entries()) {
    const { context, page, root, answers } = await freshPage(browser, shape, tokens);
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const h1 = (await page.locator('h1').first().textContent())?.trim();
    const scripts = await page.locator('script[src]').count();
    console.log(`▶ П${i + 1} главная ${shape.width}×${shape.dark ? 'dark' : 'light'}: h1=${h1} · файлов кода ${scripts}`);
    check('ровно одно событие корня, принято 2xx', root.length === 1 && answers.length === 1 && answers[0] >= 200 && answers[0] < 300, describe(root) || `отправок ${root.length}, ответы ${answers.join(',')}`);
    check('тело: landing_view · env контура · $lib корня · путь /', root[0]?.event === 'landing_view' && root[0]?.properties?.env === contour.name && root[0]?.properties?.$lib === 'ndim-root-inline' && root[0]?.properties?.$pathname === '/');
    check('главная без файлов кода', scripts === 0, `script[src] = ${scripts}`);
    await context.close();
  }

  if (walk) {
    // П5: главная → «Русский» → лендинг: корень считает один раз, дальше считает SDK.
    {
      const { context, page, root, sdk } = await freshPage(browser, shapes[0], tokens);
      await page.goto(`${base}/`, { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      await page.locator('.langbar .autos a[href="/ru"]').click();
      await page.waitForURL(/\/ru\/?$/u, { timeout: 15000 });
      await page.waitForTimeout(6000);
      console.log(`▶ П5 главная → «Русский» → ${new URL(page.url()).pathname}`);
      check('корень посчитан ровно один раз до перехода', root.length === 1, describe(root));
      check('на лендинге SDK PostHog ОТПРАВИЛ событие (POST /e/) — человека он не отсеял', sdk.some((x) => /^POST \/e\/?/u.test(x)), `обращений SDK: ${sdk.length} (${[...new Set(sdk)].join(', ')})`);
      await context.close();
    }
    // П6: главная → гостем внутрь → назад на главную: с сессией не считается, уводит внутрь.
    {
      const { context, page, root, sdk } = await freshPage(browser, shapes[1], tokens);
      await page.goto(`${base}/`, { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      const before = root.length;
      await page.locator('a.cta').click();
      await page.waitForURL(/\/profile/u, { timeout: 20000 });
      await page.waitForTimeout(8000);
      const marker = await page.evaluate(() => { try { return localStorage.getItem('ndim-session'); } catch { return null; } });
      await page.goto(`${base}/`, { waitUntil: 'load' });
      await page.waitForTimeout(3000);
      const path = new URL(page.url()).pathname;
      console.log(`▶ П6 главная → гостем → назад: маркер сессии=${marker ? 'есть' : 'нет'} · адрес после возврата ${path}`);
      check('до входа корень посчитан один раз', before === 1, describe(root.slice(0, 1)));
      check('после входа маркер сессии стоит', Boolean(marker));
      check('гостевой вход: SDK отправил событие (POST /e/)', sdk.some((x) => /^POST \/e\/?/u.test(x)), `обращений SDK: ${sdk.length}`);
      check('возврат на главную увёл внутрь и НЕ посчитал второй раз', path.startsWith('/profile') && root.length === 1, `событий корня всего ${root.length}, адрес ${path}`);
      await context.close();
    }
  }

  await browser.close();

  // Уборка: заведённые учётки — ключом ТОГО контура, в который ходили.
  let removed = 0;
  for (const idToken of tokens) {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${contour.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (r.ok) removed += 1;
  }
  console.log(`🧹 гостевых учёток заведено ${tokens.size}, удалено ${removed}${tokens.size === removed ? '' : ' ⚠️ остаток уберёт уборка гостей контура'}`);

  const passed = results.filter(Boolean).length;
  console.log(`\nПроверок: ${passed}/${results.length} · ${passed === results.length ? '✅ все ожидания сошлись' : '❌ есть расхождения'}`);
  // ⚠️ Не `process.exit()`: сразу после `browser.close()` на Windows он ронял Node утверждением
  // libuv (`UV_HANDLE_CLOSING`, код 127) при 17/17 зелёных — код возврата врал. Даём циклу
  // событий дожить и выставляем код мягко.
  process.exitCode = passed === results.length ? 0 : 1;
}

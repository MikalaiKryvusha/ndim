/**
 * ПРОБА СЛОЯ С — ГЛАВНАЯ СЧИТАЕТ ПРИХОД НА ЖИВОМ КОНТУРЕ (`qa/suites/root-landing-view.md`, ГЛ-13).
 *
 * Что делает: свежий браузер БЕЗ метки прибора открывает корень живого контура (по умолчанию
 * стейдж) и слушает, ушло ли из страницы событие в PostHog и что ответил PostHog. Печатает
 * `distinct_id` отправленного события — по нему событие ищется в ряду через MCP.
 *
 * 🔴 МЕТКИ ПРИБОРА ЗДЕСЬ НЕТ НАМЕРЕННО, и это единственный такой прибор: смысл слоя С — что
 * настоящий приход доезжает до PostHog, а под меткой строка молчит по построению. След прогона —
 * ОДНО событие `landing_view` с `env` контура и `$lib = ndim-root-inline` в общем ряду; на бою
 * прибор не запускать без слова владельца (`--base https://ndimspace.app` считается человеком).
 *
 * Запуск: node tools/probe-root-landing-view-live.mjs [--base https://ndim-stage.web.app]
 * Код возврата: 0 — событие ушло и принято (2xx); 1 — не ушло или отбито.
 */
import { pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

// Предохранитель «запущен или подключён» — каноническая форма приборов проекта (`pathToFileURL`).
// ⚠️ Первая редакция сравнивала с `new URL(argv[1], 'file:')` — на Windows это НЕ совпадает
// никогда, прибор молча делал ничего и выходил кодом 0: ложный зелёный первого вопроса
// лестницы. Поймано первым же живым запуском; поэтому ниже прибор ещё и ПЕЧАТАЕТ контур
// первой строкой — молчание больше не похоже на успех.
const ЗАПУЩЕН_НАПРЯМУЮ = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (ЗАПУЩЕН_НАПРЯМУЮ) {
  const base = process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : 'https://ndim-stage.web.app';
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const sent = [];
  page.on('request', (r) => {
    if (r.url().includes('posthog.com') && /\/i\/v0\/e\/?/u.test(r.url())) sent.push({ url: r.url(), body: r.postData() });
  });
  const answers = [];
  page.on('response', (r) => {
    if (r.url().includes('posthog.com') && /\/i\/v0\/e\/?/u.test(r.url())) answers.push(r.status());
  });
  const startedAt = new Date().toISOString();
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const h1 = await page.locator('h1').first().textContent();
  const scripts = await page.locator('script[src]').count();
  await browser.close();

  console.log(`контур: ${base} · начато ${startedAt}`);
  console.log(`h1: ${h1?.trim()} · файлов кода на странице: ${scripts}`);
  console.log(`отправок в PostHog: ${sent.length} · ответы: ${answers.join(', ') || '—'}`);
  for (const s of sent) {
    const b = JSON.parse(s.body ?? '{}');
    console.log(`  event=${b.event} distinct_id=${b.distinct_id} env=${b.properties?.env} $lib=${b.properties?.$lib} $pathname=${b.properties?.$pathname}`);
  }
  const ok = sent.length === 1 && answers.length === 1 && answers[0] >= 200 && answers[0] < 300;
  console.log(ok ? '✅ событие ушло и принято' : '❌ событие не ушло или отбито');
  process.exit(ok ? 0 : 1);
}

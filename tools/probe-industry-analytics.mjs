#!/usr/bin/env node
/**
 * Прибор разведки: ЧЕМ И КАК ТОПЫ МЕРЯЮТ СВОЮ ДВЕРЬ (`plans/78` Ш4, рамка смены 9).
 *
 * ЗАЧЕМ. Владелец потребовал (2026-08-29): «*вот так делают топы… мы у них учимся, понимаем
 * КАКИЕ их решения приводят их к успеху*». Событийные модели топов внутрь не показывают —
 * но то, что их страница ШЛЁТ, видно снаружи полностью. Прибор садится между браузером и
 * сетью и записывает каждый запрос к известным счётчикам и к телеметрическим адресам: кто
 * стоит на двери, сколько их, какие имена событий уезжают и включена ли запись сессии.
 *
 * ЧЕМ ЭТО ЛУЧШЕ ЧТЕНИЯ ОБЗОРОВ. Обзор рассказывает, что вендор УМЕЕТ. Замер показывает, что
 * топ ВКЛЮЧИЛ. Для наших решений (белый список против автозахвата, запись сессии, IP)
 * значение имеет только второе — тот же довод, по которому `researches/60` снимал двери
 * живой разметкой, а не пересказом чужих обзоров.
 *
 * ГРАНИЦЫ, названные до прогона (они же едут в отчёт):
 *   1. Видна только ДВЕРЬ без сессии. Что топ пишет внутри аккаунта — снаружи не наблюдаемо.
 *   2. Первая сторона шлёт СВОИ имена в собственный конвейер пачкой, часто сжатой. Имя
 *      события оттуда достаётся не всегда — прибор пишет «имён 0», а не догадку.
 *   3. Один снимок одного дня с одного адреса. Эксперименты, гео-варианты и режим согласия
 *      меняют состав счётчиков — сравнивать строки надо по порядку величины.
 *   4. Прибор НИЧЕГО не кликает и согласия не даёт: он снимает дверь ровно такой, какой её
 *      видит пришедший человек до единого касания. Что зажигается ПОСЛЕ «принять куки» —
 *      этим замером не снято, и это отдельный факт, а не пробел.
 *
 * Распознавание живёт в `tools/lib/industry-analytics-core.mjs` и стережётся юнитами
 * (`tools/industry-analytics.test.mjs`) — здесь только браузер, обход и печать.
 *
 * ЗАПУСК:  node tools/probe-industry-analytics.mjs [--only <ключ,ключ>] [--headed] [--wait 9000]
 * ВЫХОД:   test-results/industry-analytics/<дата>.json + таблица в консоль.
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CONSENT_VENDORS,
  classify,
  isTelemetry,
  pickJson,
  registrableDomain,
} from './lib/industry-analytics-core.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Двери замера. Набор не «десять самых больших», а **наш класс задачи**: продукт, куда
 * человек приходит из органики и должен что-то получить до аккаунта. Гиганты внутри набора
 * нужны как планка ремесла, ближние аналоги (16personalities, Duolingo) — как переносимый
 * образец: у них наше топливо (`researches/30`, `researches/60`).
 */
export const DOORS = [
  { key: '16personalities', url: 'https://www.16personalities.com/', why: 'ближайший аналог: инструмент до аккаунта, органический вход' },
  { key: 'duolingo', url: 'https://www.duolingo.com/', why: 'дело до аккаунта, органика + бренд' },
  { key: 'tinder', url: 'https://tinder.com/', why: 'наша предметная область' },
  { key: 'linkedin', url: 'https://www.linkedin.com/', why: 'назван владельцем' },
  { key: 'tiktok', url: 'https://www.tiktok.com/', why: 'назван владельцем' },
  { key: 'instagram', url: 'https://www.instagram.com/', why: 'назван владельцем' },
  { key: 'pinterest', url: 'https://www.pinterest.com/', why: 'органический вход из поиска — как у нас' },
  { key: 'spotify', url: 'https://open.spotify.com/', why: 'продукт виден до входа' },
  { key: 'youtube', url: 'https://www.youtube.com/', why: 'продукт виден до входа' },
  { key: 'reddit', url: 'https://www.reddit.com/', why: 'органический вход из поиска' },
];

/** Ключи, по которым имя события ищется в теле запроса — у своих конвейеров они те же. */
const EVENT_PATHS = ['event', 'event_name', 'eventName', 'name', 'eventInfo.eventName', '0.event', 'events.0.event_type'];

/** Один замер одной двери. Ничего не кликает — снимает состояние «человек только пришёл». */
async function measure(browser, door, waitMs) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    timezoneId: 'Europe/Moscow',
  });
  const page = await context.newPage();

  const doorBase = registrableDomain(new URL(door.url).hostname);
  const hits = [];
  const telemetry = new Map();
  const thirdPartyHosts = new Set();
  let consent = null;
  let total = 0;

  page.on('request', (request) => {
    const url = request.url();
    total += 1;

    let host = '';
    let path = '';
    try {
      const parsed = new URL(url);
      host = parsed.hostname;
      path = parsed.pathname;
    } catch { /* адрес не разбирается */ }
    const own = host.endsWith(doorBase);
    if (!own && host) thirdPartyHosts.add(host);
    if (!consent && CONSENT_VENDORS.test(url)) consent = host;

    const vendor = classify(url);
    if (vendor) {
      let event = null;
      try { event = vendor.event(url, request.postData()); } catch { event = null; }
      hits.push({ vendor: vendor.key, name: vendor.name, kind: vendor.kind, event });
      return;
    }

    // Не из известного набора — но телеметрия по адресу. Именно здесь живут собственные
    // конвейеры гигантов, ради которых замер и затевался.
    if (!isTelemetry(url, request.resourceType())) return;
    const address = `${own ? 'свой' : 'чужой'} ${host}${path}`.slice(0, 90);
    const entry = telemetry.get(address) ?? { address, own, count: 0, events: new Set() };
    entry.count += 1;
    const guess = pickJson(request.postData(), EVENT_PATHS);
    if (guess) entry.events.add(guess);
    telemetry.set(address, entry);
  });

  const result = { ...door, ok: false, error: null, vendors: [], events: [], replay: [], telemetry: [], thirdPartyHosts: 0, consent: null, totalRequests: 0 };
  try {
    await page.goto(door.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(waitMs);
    result.ok = true;
  } catch (error) {
    result.error = String(error).split('\n')[0].slice(0, 160);
  }

  const byVendor = new Map();
  for (const hit of hits) {
    if (!byVendor.has(hit.vendor)) byVendor.set(hit.vendor, { name: hit.name, kind: hit.kind, count: 0, events: new Set() });
    const entry = byVendor.get(hit.vendor);
    entry.count += 1;
    if (hit.event) entry.events.add(hit.event);
  }
  result.vendors = [...byVendor.entries()].map(([key, entry]) => ({
    key, name: entry.name, kind: entry.kind, count: entry.count, events: [...entry.events].sort(),
  }));
  result.replay = result.vendors.filter((vendor) => vendor.kind.includes('запись сессии')).map((vendor) => vendor.name);
  result.telemetry = [...telemetry.values()]
    .sort((left, right) => right.count - left.count)
    .map((entry) => ({ address: entry.address, own: entry.own, count: entry.count, events: [...entry.events].sort() }));
  result.events = [...new Set([
    ...result.vendors.flatMap((vendor) => vendor.events),
    ...result.telemetry.flatMap((entry) => entry.events),
  ])].sort();
  result.thirdPartyHosts = thirdPartyHosts.size;
  result.consent = consent;
  result.totalRequests = total;

  await context.close();
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
  const waitMs = args.includes('--wait') ? Number(args[args.indexOf('--wait') + 1]) : 9000;
  const doors = only ? DOORS.filter((door) => only.includes(door.key)) : DOORS;

  const browser = await chromium.launch({ headless: !args.includes('--headed') });
  const measured = [];
  for (const door of doors) {
    process.stdout.write(`  · ${door.key} … `);
    const result = await measure(browser, door, waitMs);
    measured.push(result);
    process.stdout.write(result.ok
      ? `счётчиков ${result.vendors.length} · телеметрии ${result.telemetry.length} · имён ${result.events.length}\n`
      : `❌ ${result.error}\n`);
  }
  await browser.close();

  const at = new Date();
  const stamp = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
  const outDir = resolve(ROOT, 'test-results/industry-analytics');
  mkdirSync(outDir, { recursive: true });
  const outFile = resolve(outDir, `${stamp}.json`);
  writeFileSync(outFile, JSON.stringify({ at: at.toISOString(), waitMs, doors: measured }, null, 2), 'utf8');

  console.log('\n── ЧТО СТОИТ НА ДВЕРИ ──────────────────────────────────────────');
  for (const door of measured) {
    if (!door.ok) { console.log(`  ${door.key.padEnd(16)} ❌ ${door.error}`); continue; }
    const names = door.vendors.map((vendor) => vendor.name).join(', ') || '—';
    console.log(`  ${door.key.padEnd(16)} счётчиков ${String(door.vendors.length).padStart(2)} · чужих доменов ${String(door.thirdPartyHosts).padStart(3)} · запросов ${String(door.totalRequests).padStart(3)} · запись сессии: ${door.replay.length ? door.replay.join('/') : 'нет'} · CMP: ${door.consent ?? 'нет'}`);
    console.log(`  ${''.padEnd(16)} счётчики: ${names}`);
    for (const entry of door.telemetry.slice(0, 5)) {
      console.log(`  ${''.padEnd(16)} ×${String(entry.count).padStart(2)} ${entry.address}${entry.events.length ? `  → ${entry.events.join(' · ')}` : ''}`);
    }
    if (door.events.length) console.log(`  ${''.padEnd(16)} ИМЕНА СОБЫТИЙ: ${door.events.join(' · ')}`);
  }
  console.log(`\n📄 ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

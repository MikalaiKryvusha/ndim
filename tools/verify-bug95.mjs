/**
 * QA-прогон bugs/95 на стенде: ДВЕРЬ «?guest=1» УВАЖАЕТ ЖИВУЮ СЕССИЮ.
 *
 * Дефект (аудит 2026-07-31): ветка ?guest= звала signInAnonymously ПЕРВОЙ, и у вошедшего
 * человека (F5 сразу после апгрейда, закладка /profile?guest=1) Firebase заводил НОВОГО
 * анонима, молча выбрасывая настоящий аккаунт из сессии.
 *
 * Что сторожится и почему именно так:
 *  1. Вошедший (автовход стенда dev@ndim.space) открывает /profile?guest=1 — гостевой
 *     пилюли `.badge` НЕТ, экран остаётся экраном вошедшего. До фикса здесь появлялся
 *     новый гость.
 *  2. Параметр одноразовый: адрес очищен от `guest` (replaceState) — F5 не воспроизведёт.
 *  3. КОНТРОЛЬ ПРИБОРА (EXP-0082): в свежем контексте БЕЗ сессии та же дверь обязана
 *     завести гостя — пилюля `.badge` ЕСТЬ. Без этой пары «пилюли нет» доказывало бы
 *     и протухший селектор, и сломанную гостевую дверь.
 *  4. Консоль чиста (фильтр отказов правил — узкий, канон verify-bug84/87).
 *
 * Требует поднятый `npm run stand`. Запуск: node tools/verify-bug95.mjs
 */

import { chromium } from '@playwright/test';

const STAND = 'http://localhost:5173';
const EXPECTED = /permission|insufficient|Missing or insufficient/i;
const CONFIGS = [
  { theme: 'light', w: 390, h: 844 },
  { theme: 'dark', w: 1440, h: 900 },
];

let failures = 0;
let passed = 0;
function check(name, ok, detail = '') {
  ok ? passed++ : failures++;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch();

for (const cfg of CONFIGS) {
  const tag = `${cfg.theme}/${cfg.w}`;
  console.log(`\n— конфигурация ${tag} —`);

  // ── Сценарий А: живая сессия побеждает дверь гостя ──────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: cfg.w, height: cfg.h } });
    await ctx.addInitScript((t) => localStorage.setItem('ndim-theme', t), cfg.theme);
    const page = await ctx.newPage();
    const noise = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !EXPECTED.test(m.text())) noise.push(m.text());
    });

    // Автовход стенда заводит dev@ndim.space — живую НЕ-анонимную сессию.
    await page.goto(`${STAND}/menu`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    await page.goto(`${STAND}/profile?guest=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    check(`${tag} А: гостевой пилюли НЕТ у вошедшего`, (await page.locator('.badge').count()) === 0);
    check(`${tag} А: адрес очищен от guest`, !new URL(page.url()).searchParams.has('guest'), page.url());
    const text = (await page.evaluate(() => document.body.innerText)).trim();
    check(`${tag} А: экран вошедшего отрисован`, text.length > 200, `${text.length} симв.`);
    check(`${tag} А: консоль чиста`, noise.length === 0, noise.join(' | '));
    await ctx.close();
  }

  // ── Сценарий Б (контроль прибора): без сессии дверь честно заводит гостя ────
  {
    const ctx = await browser.newContext({ viewport: { width: cfg.w, height: cfg.h } });
    await ctx.addInitScript((t) => localStorage.setItem('ndim-theme', t), cfg.theme);
    const page = await ctx.newPage();

    await page.goto(`${STAND}/profile?guest=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500); // анонимный вход + ensureSpaceExists дольше готовой сессии

    check(`${tag} Б (контроль): без сессии пилюля гостя ЕСТЬ`, (await page.locator('.badge').count()) > 0);
    check(`${tag} Б: адрес очищен от guest и у гостя`, !new URL(page.url()).searchParams.has('guest'), page.url());
    await ctx.close();
  }
}

await browser.close();

console.log(`\nИтог: ${passed} зелёных, ${failures} провалов`);
process.exit(failures === 0 ? 0 : 1);

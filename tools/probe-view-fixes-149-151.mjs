#!/usr/bin/env node
/**
 * ПРИБОР ЖИВОЙ ПРИЁМКИ правок вида, ждущих выката: `bugs/149` · `bugs/150` · `bugs/151`.
 * Заказ Менеджера команде (2026-08-21): выкат держится за отсутствие живой приёмки — этот
 * прибор её снимает. Пишет вердикт ЧИСЛАМИ и оставляет кадры для глаз.
 *
 * ЧТО МЕРЯЕТ (каждый пункт — DoD своего бага):
 *   1. `bugs/149` — тени карточек «Связей». Тень снята В ПОКОЕ и НА НАВЕДЕНИИ и убрана ИЗ
 *      ПЕРЕХОДА; подъём 1px и подкраска рамки ЖИВЫ (владелец их оставил); свечение «яркости
 *      связи» (`.lv3 .mini i`) НЕ задето. Вердикт снимается вычисленным стилем, а не глазом:
 *      «тени не видно» на кадре и «тени нет» — разные утверждения.
 *   2. `bugs/150` — имя на английском больше не прячется + человек без имени несёт фирменное N.
 *      Оба случая на стенде НЕ существуют (сид даёт трёх людей с русскими именами), поэтому
 *      прибор их СОЗДАЁТ: сосед с пустой русской строкой и английским именем и сосед без имени
 *      вовсе. Убирает за собой, уборка проверяется.
 *   3. `bugs/151` — курсор-палец вместо лупы: лицо человека (`.peek`), открытое фото
 *      (`.lightbox`), портрет на лендинге (`SimilarityDemo .overlay`). Курсор кадром не
 *      снимается — вердикт по `getComputedStyle().cursor`.
 *
 * КАПКАНЫ, УЧТЁННЫЕ ПО КАНОНУ:
 *   · тема — атрибут `data-theme`, `emulateMedia` её НЕ переключает: тема ставится тем же
 *     ключом хранилища `ndim-theme`, что читает инлайн-скрипт `app.html` (путь продукта);
 *   · на голом адресе стенд входит dev-пользователем — это ЗДЕСЬ и нужно (у него есть связи),
 *     гостевые двери `?as=guest` не применяются сознательно (EXP-0174 — про обратный случай);
 *   · прибор ТОЛЬКО для стенда: он пишет людей в базу.
 *
 * Запуск: стенд поднят (`npm run stand`).
 *   node tools/probe-view-fixes-149-151.mjs [--base http://localhost:5173] [--headed]
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const BASE = opt('--base', 'http://localhost:5173').replace(/\/$/, '');
const FIRESTORE = 'http://127.0.0.1:8181';
const PROJECT = 'demo-ndim-dev';
const OUT = 'test-results/probe-view-fixes';
mkdirSync(OUT, { recursive: true });

if (!/localhost|127\.0\.0\.1/.test(BASE)) {
  console.error('Только стенд: прибор заводит людей в базу — в бою это недопустимо.');
  process.exit(1);
}

/* ── База эмулятора: `Bearer owner` обходит правила (роль сида) ── */

const url = (path) => `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`;
const H = { Authorization: 'Bearer owner', 'content-type': 'application/json' };

async function put(path, fields) {
  const res = await fetch(url(path), { method: 'PATCH', headers: H, body: JSON.stringify({ fields }) });
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status} ${await res.text()}`);
}
async function get(path) {
  const res = await fetch(url(path), { headers: H });
  return res.ok ? res.json() : null;
}
async function del(path) {
  await fetch(url(path), { method: 'DELETE', headers: H }).catch(() => {});
}
async function listNames(collection) {
  const res = await fetch(`${url(collection)}?pageSize=300`, { headers: H });
  if (!res.ok) return [];
  const { documents = [] } = await res.json();
  return documents.map((d) => d.name.split('/documents/')[1]);
}

/** Значения Firestore REST — ровно те формы, что использует сид. */
const S = (v) => ({ stringValue: v });
const N = (v) => ({ integerValue: String(v) });
const B = (v) => ({ booleanValue: v });
const loc = (ru, en) => ({ mapValue: { fields: { ru: ru === null ? { nullValue: null } : S(ru), en: en === null ? { nullValue: null } : S(en) } } });

/** Два соседа под `bugs/150`: пустая русская строка + английское имя, и полностью безымянный. */
const PROBES = [
  { uid: 'probe150-en-only', first: loc('', 'John Barleycorn'), what: 'пустая ru + английское имя' },
  { uid: 'probe150-nameless', first: loc('', ''), what: 'без имени вовсе' },
];
/** Оценки те же, что у жителей сида, — иначе сосед не попадёт в топ владельца. */
const RATINGS = { cats: 9, silence: 8, theatre: 6, travel: 7 };

async function seedProbePeople(now) {
  for (const p of PROBES) {
    await put(`users/${p.uid}`, {
      visibility: { mapValue: { fields: { name: S('everyone') } } },
      settings: { mapValue: { fields: { language: S('ru') } } },
      groupCount: N(0),
    });
    await put(`users/${p.uid}/profile/everyone`, {
      name: {
        mapValue: {
          fields: {
            first: p.first,
            middle: loc(null, null),
            last: loc(null, null),
            nick: loc(null, null),
          },
        },
      },
    });
    for (const [dim, value] of Object.entries(RATINGS)) {
      await put(`points/${p.uid}/dims/${dim}`, { value: N(value), updated: N(now) });
    }
    await put(`points/${p.uid}`, { dirty: B(true), updated: N(now), lastSync: { nullValue: null } });
  }
}

async function cleanupProbePeople() {
  for (const p of PROBES) {
    for (const path of await listNames(`points/${p.uid}/dims`)) await del(path);
    for (const path of await listNames(`users/${p.uid}/profile`)) await del(path);
    await del(`points/${p.uid}`);
    await del(`relations/${p.uid}`);
    await del(`users/${p.uid}`);
  }
  const traces = [];
  for (const p of PROBES) {
    if ((await get(`users/${p.uid}`)) !== null) traces.push(`users/${p.uid}`);
    if ((await get(`points/${p.uid}`)) !== null) traces.push(`points/${p.uid}`);
    if ((await get(`relations/${p.uid}`)) !== null) traces.push(`relations/${p.uid}`);
  }
  return traces;
}

/** Хозяин стенда — dev-пользователь; его точку метим грязной, чтобы цикл пересчитал ЕГО топ. */
async function markOwnerDirty(now) {
  const points = await listNames('points');
  const owner = points.find((p) => !p.includes('stand-guest') && !p.includes('probe150'));
  if (!owner) return null;
  const uid = owner.split('/').pop();
  await put(`points/${uid}`, { dirty: B(true), updated: N(now) });
  return uid;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ждём, пока сервер синхронизации впишет пробных людей в топ владельца. */
async function waitForTop(ownerUid, wantSlugs, timeoutMs = 70_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const snap = await get(`relations/${ownerUid}`);
    const top = snap?.fields?.top?.arrayValue?.values ?? [];
    const uids = top.map((v) => v.mapValue?.fields?.guestUid?.stringValue);
    if (wantSlugs.every((u) => uids.includes(u))) return { ok: true, people: uids.length };
    await sleep(2000);
  }
  const snap = await get(`relations/${ownerUid}`);
  const top = snap?.fields?.top?.arrayValue?.values ?? [];
  return { ok: false, people: top.length, uids: top.map((v) => v.mapValue?.fields?.guestUid?.stringValue) };
}

/* ── Проверки ── */

const results = [];
const check = (bug, name, ok, detail) => {
  results.push({ bug, name, ok, detail });
  console.log(`  ${ok ? '✅' : '❌'} [${bug}] ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Стенд жив? Спрашиваем порты, а не память о них. */
for (const [u, what] of [[BASE, 'dev-сервер'], [`${FIRESTORE}/`, 'эмулятор Firestore']]) {
  try {
    await fetch(u, { signal: AbortSignal.timeout(3000) });
  } catch {
    console.error(`Стенд не поднят: ${what} (${u}) не отвечает.`);
    process.exit(1);
  }
}

const now = Date.now();
console.log('── Подготовка данных под bugs/150 ──');
await seedProbePeople(now);
const ownerUid = await markOwnerDirty(now);
console.log(`владелец стенда: ${ownerUid ?? 'НЕ НАЙДЕН'}; ждём цикл сервера синхронизации (такт 15 с)…`);
const top = ownerUid ? await waitForTop(ownerUid, PROBES.map((p) => p.uid)) : { ok: false, people: 0 };
console.log(top.ok ? `топ владельца пересчитан, людей ${top.people}` : `⚠️ пробные люди в топ не попали (людей ${top.people}) — проверки bugs/150 будут пропущены`);

const browser = await chromium.launch({ headless: !argv.includes('--headed') });
let traces = [];
try {
  for (const theme of ['light', 'dark']) {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, locale: 'ru-RU' });
      // Тема — путём продукта: ключ хранилища, который читает инлайн-скрипт app.html до отрисовки.
      await context.addInitScript((t) => localStorage.setItem('ndim-theme', t), theme);
      const page = await context.newPage();
      const tag = `${theme}-${width}`;

      await page.goto(`${BASE}/relations`, { waitUntil: 'domcontentloaded' });
      await page.locator('.card').first().waitFor({ timeout: 30000 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/relations-${tag}.png`, fullPage: false });

      const themeNow = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      check('149', `тема применилась (${tag})`, themeNow === theme, `data-theme = ${themeNow}`);

      // ── bugs/149: тень карточки в покое ──
      const card = page.locator('.card').first();
      const rest = await card.evaluate((el) => {
        const s = getComputedStyle(el);
        return { shadow: s.boxShadow, transition: s.transitionProperty, transform: s.transform };
      });
      check('149', `тень карточки В ПОКОЕ снята (${tag})`, rest.shadow === 'none', `box-shadow: ${rest.shadow}`);
      check('149', `тень убрана ИЗ ПЕРЕХОДА (${tag})`, !/box-shadow/.test(rest.transition), `transition-property: ${rest.transition}`);

      // ── bugs/149: наведение — тени нет, подъём и подкраска рамки живы ──
      const before = await card.evaluate((el) => getComputedStyle(el).borderColor);
      await card.hover();
      await page.waitForTimeout(400);
      const hov = await card.evaluate((el) => {
        const s = getComputedStyle(el);
        return { shadow: s.boxShadow, transform: s.transform, border: s.borderColor };
      });
      check('149', `тень НА НАВЕДЕНИИ снята (${tag})`, hov.shadow === 'none', `box-shadow: ${hov.shadow}`);
      const lifted = hov.transform !== 'none' && /matrix\(1, 0, 0, 1, 0, -1\)/.test(hov.transform);
      check('149', `подъём 1px ЖИВ (${tag})`, lifted, `transform: ${hov.transform}`);
      check('149', `подкраска рамки ЖИВА (${tag})`, hov.border !== before, `${before} → ${hov.border}`);

      // ── bugs/149: свечение «яркости связи» не задето ──
      const glow = await page.evaluate(() => {
        const el = document.querySelector('.lv3 .mini i');
        return el ? getComputedStyle(el).boxShadow : null;
      });
      if (glow === null) console.log(`  ⚪ [149] свечения lv3 на экране нет (нет сильных связей) — проверка пропущена (${tag})`);
      else check('149', `свечение «яркости связи» ЖИВО (${tag})`, glow !== 'none', `box-shadow: ${glow}`);

      // ── bugs/151: курсор на лице ──
      // 🔑 Кнопка-лицо (`.peek`) существует только в РАСКРЫТОЙ карточке: в свёрнутой аватар
      //    отдан родителю (`peek={false}`, bugs/104). Раскрываем карточку человека С ФОТО —
      //    без этого проверка молча пропускалась бы, а пропуск читается как «нечего проверять».
      const withPhoto = page.locator('.card').filter({ has: page.locator('img.ava') }).first();
      if ((await withPhoto.count()) > 0) {
        await withPhoto.locator('.who').first().click().catch(() => {});
        await page.waitForTimeout(800);
      }
      const peek = await page.evaluate(() => {
        const el = document.querySelector('.peek');
        return el ? getComputedStyle(el).cursor : null;
      });
      if (peek === null) console.log(`  ⚪ [151] лиц-кнопок на экране нет (${tag}) — проверка пропущена`);
      else check('151', `курсор на лице — палец (${tag})`, peek === 'pointer', `cursor: ${peek}`);

      // ── bugs/151: курсор на открытом фото ──
      if (peek !== null) {
        await page.locator('.peek').first().click();
        await page.waitForTimeout(700);
        const light = await page.evaluate(() => {
          const el = document.querySelector('.lightbox');
          return el ? getComputedStyle(el).cursor : null;
        });
        if (light === null) console.log(`  ⚪ [151] фото не открылось (${tag}) — проверка пропущена`);
        else {
          check('151', `курсор на открытом фото — палец (${tag})`, light === 'pointer', `cursor: ${light}`);
          await page.screenshot({ path: `${OUT}/lightbox-${tag}.png` });
        }
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(400);
      }

      // ── bugs/150: имена в карточках ──
      if (top.ok) {
        const names = await page.locator('.card .who').allInnerTexts();
        const flat = names.map((s) => s.replace(/\s+/g, ' ').trim());
        check('150', `английское имя ПОКАЗАНО, а не спрятано (${tag})`, flat.some((n) => /John Barleycorn/.test(n)), `имена: ${flat.join(' · ')}`);
        const brandInNameless = await page.evaluate(() => {
          const cards = [...document.querySelectorAll('.card')];
          const target = cards.find((c) => /Без имени/i.test(c.textContent ?? ''));
          if (!target) return 'карточки «Без имени» нет';
          const ava = target.querySelector('.ava[role="img"]');
          if (!ava) return 'кружка-знака нет';
          return ava.querySelector('svg') ? 'ok' : `в кружке буква: «${(ava.textContent ?? '').trim()}»`;
        });
        check('150', `человек без имени несёт фирменное N (${tag})`, brandInNameless === 'ok', brandInNameless);
        await page.screenshot({ path: `${OUT}/names-${tag}.png`, fullPage: true });
      }

      // ── bugs/151: портрет на лендинге ──
      /*
       * 🔑 ЛЕНДИНГ СМОТРИМ СВЕЖИМ ОКНОМ, а не той же вкладкой. Витрина похожести — поверхность
       * ДЛЯ НЕЗНАКОМЦА: у вкладки, уже побывавшей в приложении под сессией, лиц в ней нет
       * вовсе (снято этим же прибором: «лиц в витрине 0» во всех четырёх видах). Проверка
       * молча пропускалась — то есть прибор врал видом «нечего проверять».
       * Голый `/` уводит редиректом на языковой адрес — идём сразу на него.
       */
      const guest = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, locale: 'ru-RU' });
      await guest.addInitScript((t) => localStorage.setItem('ndim-theme', t), theme);
      const landing = await guest.newPage();
      await landing.goto(`${BASE}/ru`, { waitUntil: 'domcontentloaded' });
      await landing.waitForTimeout(4000);
      // Оверлей портрета рождается только по тапу на лицо в витрине похожести — тапаем.
      const face = landing.locator('.personas button.ava').first();
      const faces = await face.count();
      if (faces > 0) {
        await face.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {});
        await landing.waitForTimeout(600);
        // force: лицо живёт под анимацией витрины, обычный клик ждёт её вечно.
        // 🔑 Ошибку тапа ПЕЧАТАЕМ: молчаливый промах прибора читается как «нечего проверять».
        await face.click({ force: true, timeout: 10000 }).catch((e) => console.log('  ⚠️ тап по лицу витрины не прошёл: ' + String(e).slice(0, 120)));
        await landing.waitForTimeout(1200);
      } else {
        console.log('  ⚠️ витрина похожести не отрисовалась — лиц на лендинге нет');
      }
      const overlay = await landing.evaluate(() => {
        const el = document.querySelector('.overlay');
        return el ? getComputedStyle(el).cursor : null;
      });
      if (overlay === null) console.log(`  ⚪ [151] портрета-оверлея на лендинге не видно (${tag}, лиц в витрине ${faces}) — проверка пропущена`);
      else check('151', `курсор на портрете лендинга — палец (${tag})`, overlay === 'pointer', `cursor: ${overlay}`);
      await landing.screenshot({ path: `${OUT}/landing-${tag}.png` });
      await guest.close();

      await context.close();
    }
  }
} finally {
  await browser.close();
  traces = await cleanupProbePeople();
}

/* ── Отчёт ── */
const failed = results.filter((r) => !r.ok);
console.log('\n════ ЖИВАЯ ПРИЁМКА ПРАВОК ВИДА ════');
for (const bug of ['149', '150', '151']) {
  const mine = results.filter((r) => r.bug === bug);
  const bad = mine.filter((r) => !r.ok).length;
  console.log(`bugs/${bug}: проверок ${mine.length}, провалов ${bad} ${bad === 0 && mine.length > 0 ? '✅' : mine.length === 0 ? '⚪ не проверено' : '🔴'}`);
}
console.log(`уборка: ${traces.length === 0 ? 'следов пробных людей не осталось (проверено базой)' : `🔴 остались: ${traces.join(', ')}`}`);
console.log(`кадры — ${OUT}/`);
process.exitCode = failed.length === 0 && traces.length === 0 ? 0 : 1;

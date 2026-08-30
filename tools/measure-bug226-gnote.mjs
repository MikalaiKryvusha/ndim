#!/usr/bin/env node
/**
 * ПРИБОР ЗАМЕРА ШИРИНЫ ПЛАШКИ ГОСТЯ (`bugs/226`) — ПРИБОР, не страж.
 *
 * Владелец: «плашка "сейчас вы гость" в десктопе разной ширины на разных страницах» (2026-08-30).
 * Разбор в `bugs/226` установил причину ЧТЕНИЕМ кода и сам это назвал: «пиксели ещё НЕ сняты…
 * до кадров это гипотеза с сильным доводом, а не доказанный факт». Этот прибор снимает пиксели.
 *
 * Что печатает по каждому сочетанию «экран × ширина окна × тема»:
 *   · ширину `.gnote` (сама плашка) и ширину содержимого `.body` (её родителя);
 *   · `display` родителя и его `grid-template-columns` — то есть СЕТКА ли он и на сколько колонок;
 *   · `grid-column` самой плашки — назначил ли ей кто-нибудь всю строку.
 * Последние две колонки и есть предмет спора: плашка своей ширины не имеет вовсе, поэтому
 * «сколько у неё пикселей» — вопрос не к ней, а к родителю.
 *
 * 🔑 ПОЧЕМУ ЭТО ПРИБОР, А НЕ СТРАЖ. Он ничего не судит и не краснеет по ширине: эталона у него
 * нет, потому что эталон — решение уровня вида, и оно принадлежит владельцу (правило четырёх
 * макетов, `AGENT_GUIDE.md` → «Дизайн»). Прибор отвечает на один вопрос — «сколько сейчас», — и
 * одинаково годен «до» и «после» фикса. Страж класса живёт отдельно: `verify-bug226-gnote.mjs`.
 *
 * 🔴 КОНТРОЛЬ ПРИБОРА ИДЁТ ПЕРВЫМ И ОБЯЗАТЕЛЕН (`EXP-0082`). Прибор, не нашедший плашку, обязан
 * СКАЗАТЬ это, а не напечатать пустую таблицу: молчаливое «замеров 0» читается как «расхождений
 * нет». Число найденных плашек сверяется с числом ожидаемых сочетаний, и при недоборе — код 1.
 *
 * ⚠️ EXP-0174: на стенде гостевая сессия живёт только за дверью `?as=guest` — каждый переход
 * прямой (`goto` с параметром), SPA-тапов нет. ⚠️ EXP-0087: голый адрес автовходит
 * dev-пользователем, и плашки у него не будет вовсе.
 *
 * 🔴 УБОРКА ИДЁТ ЧЕРЕЗ `lib/guest-session.mjs`, И ЭТО НЕ КОСМЕТИКА. Первая редакция прибора
 * читала uid «первой попавшейся» записью и своей же уборкой снесла dev-пользователя стенда
 * целиком. Разбор класса и оба лечения — в шапке модуля; здесь остаётся только правило:
 * гостя выбираем по СВОЙСТВУ, удаляем — спросив у самой учётки, гостевая ли она.
 *
 * Запуск: стенд своего слота поднят (`npm run stand`) → node tools/measure-bug226-gnote.mjs
 *   --width 1440         замерить одну ширину окна (по умолчанию 1024, 1440, 1560)
 *   --no-shots           не снимать кадры
 *   --slot N             ЯВНЫЙ слот (или переменная STAND_SLOT) — для прогона из ЧУЖОГО дерева:
 *                        судья работает временным деревом, а его имя даёт слот 0 (главную копию)
 */

import { mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

import { portsFor, slotFromRequest } from './lib/stand-slot.mjs';
import { readGuestSession, removeGuest } from './lib/guest-session.mjs';

/* ── Адрес стенда — из СЛОТА рабочего места, а не литералом ──────────────────────────────────
 * Литерал `localhost:5173` мерил бы слот 0 (главную копию) из любого worktree — ровно тот
 * третий род ложного зелёного, за который проект уже платил: «проверка исполнилась, признак
 * верен, ПРЕДМЕТ другой» (класс дня смены 11, прибор кадров `bugs/187`).
 */
const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const { slot, role, источник } = slotFromRequest({
  argv: process.argv.slice(2),
  env: process.env,
  dirName: basename(root),
});
const ports = portsFor(slot);
const BASE = `http://localhost:${ports.dev}`;

const OUT = 'test-results/bug226-gnote';
mkdirSync(OUT, { recursive: true });

/* Admin SDK — из экземпляра sync-server (капкан plans/63: у него СВОЙ node_modules).
   Адреса эмуляторов — слотовые: тот же довод, что и у адреса стенда выше. */
process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${ports.firestore}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${ports.auth}`;
process.env.FIREBASE_PROJECT_ID = 'demo-ndim-dev';
const requireSync = createRequire(new URL('../sync-server/', import.meta.url));
const { initializeApp, getApps } = requireSync('firebase-admin/app');
if (getApps().length === 0) initializeApp({ projectId: 'demo-ndim-dev' });
const { getFirestore } = requireSync('firebase-admin/firestore');
const { getAuth } = requireSync('firebase-admin/auth');
const db = getFirestore();

const args = process.argv.slice(2);
const widthFlag = args.indexOf('--width');
const WIDTHS = widthFlag === -1 ? [1024, 1440, 1560] : [Number(args[widthFlag + 1])];
const SHOTS = !args.includes('--no-shots');
/** Метка кадров: один прибор снимает и «до», и «после», путать их нельзя. */
const stampFlag = args.indexOf('--stamp');
const STAMP = stampFlag === -1 ? 'shot' : String(args[stampFlag + 1]);

/** Пять экранов, на которых плашка живёт (`plans/22` фаза 5; профиль — исключение). */
const SCREENS = ['/account', '/menu', '/dims', '/relations', '/space'];
const THEMES = ['light', 'dark'];

const rows = [];
let measured = 0;
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}`);
  if (!ok) failures += 1;
};

/**
 * Снять геометрию плашки и её родителя со ЖИВОЙ страницы.
 * Ширина берётся `getBoundingClientRect().width` — то, что элемент реально занимает на экране,
 * а не то, что ему назначено правилом: назначенное и занятое расходятся ровно в спорных случаях.
 */
function measure(page) {
  return page.evaluate(() => {
    const note = document.querySelector('.gnote');
    if (!note) return null;
    const body = note.parentElement;
    const cs = getComputedStyle(body);
    const noteCs = getComputedStyle(note);
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    return {
      note: note.getBoundingClientRect().width,
      bodyContent: body.getBoundingClientRect().width - pad,
      display: cs.display,
      cols: cs.gridTemplateColumns,
      gridColumn: `${noteCs.gridColumnStart} / ${noteCs.gridColumnEnd}`,
      gap: cs.columnGap,
    };
  });
}

console.log('═══ ЗАМЕР ШИРИНЫ ПЛАШКИ ГОСТЯ (bugs/226) ═══');
console.log(`  стенд: слот ${slot} · роль ${role ?? '—'} · источник слота: ${источник} · ${BASE}\n`);

const browser = await chromium.launch();
let guestUid = null;

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
  const page = await ctx.newPage();

  /*
   * 🔴 ГОСТЬ ЗАВОДИТСЯ ДВЕРЬЮ `?as=guest`, И ТОЛЬКО ЕЮ. Прежняя редакция открывала
   * `/profile?guest=1` и читала сессию оттуда — приём, скопированный из `probe-guest-card.mjs`.
   * Он НЕДЕТЕРМИНИРОВАН по построению: без параметра `?as` стенд автовходит dev-пользователем
   * (`src/lib/data/profile.ts:127` — «голый адрес по-прежнему отдаёт dev-пользователя»), и что
   * окажется в базе браузера к моменту чтения, решает гонка. Один прогон из нескольких читал
   * uid `dev@ndim.space` — и уборка сносила его.
   * Дверь `?as=guest` подделкой не является: она зовёт настоящий `signInAnonymously`
   * (`profile.ts:103`), то есть меряем мы НАСТОЯЩЕГО гостя, а не наш макет гостя.
   */
  await page.goto(`${BASE}${SCREENS[0]}?as=guest`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const session = await readGuestSession(page);
  if (!session.uid) throw new Error(`гостевая сессия не опознана: ${session.reason}`);
  guestUid = session.uid;
  console.log(
    `  гость рождён дверью продукта: ${guestUid} · записей аутентификации ${session.authRecords}, гостевых ${session.anonymous}\n`,
  );

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of SCREENS) {
      await page.goto(`${BASE}${path}?as=guest`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1800);
      for (const theme of THEMES) {
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
        await page.waitForTimeout(250);
        const m = await measure(page);
        if (m) measured += 1;
        rows.push({ width, path, theme, m });
        if (SHOTS && width === 1440) {
          await page.screenshot({ path: `${OUT}/${STAMP}-${path.slice(1)}-${theme}-1440.png` });
        }
      }
    }
  }
  await ctx.close();
} finally {
  await browser.close();
}

/* ── Контроль прибора: замеров обязано быть столько же, сколько сочетаний ── */
const expected = WIDTHS.length * SCREENS.length * THEMES.length;
check(
  measured === expected,
  `КОНТРОЛЬ: плашка найдена во всех сочетаниях — ${measured} из ${expected}` +
    (measured === expected ? '' : ' — прибор мерил не то, таблица ниже неполна'),
);

/* ── Таблица замера ── */
console.log('\n── ЗАМЕР ──\n');
for (const width of WIDTHS) {
  console.log(`  окно ${width}px`);
  console.log(
    `    ${'экран'.padEnd(11)}${'тема'.padEnd(7)}${'плашка'.padEnd(9)}${'содерж. .body'.padEnd(15)}${'display'.padEnd(9)}${'grid-column'.padEnd(13)}колонки`,
  );
  for (const r of rows.filter((x) => x.width === width)) {
    if (!r.m) {
      console.log(`    ${r.path.padEnd(11)}${r.theme.padEnd(7)}— плашки нет —`);
      continue;
    }
    const cols = r.m.display === 'grid' ? `${r.m.cols}  gap ${r.m.gap}` : '—';
    const round = (n) => String(Math.round(n * 10) / 10);
    console.log(
      `    ${r.path.padEnd(11)}${r.theme.padEnd(7)}${round(r.m.note).padEnd(9)}${round(r.m.bodyContent).padEnd(15)}${r.m.display.padEnd(9)}${r.m.gridColumn.padEnd(13)}${cols}`,
    );
  }
  console.log('');
}

/* ── Свод: сколько РАЗНЫХ ширин у одной плашки на каждой ширине окна ── */
console.log('── СВОД: сколько разных ширин у одной плашки ──\n');
for (const width of WIDTHS) {
  const uniq = [
    ...new Set(rows.filter((x) => x.width === width && x.m).map((x) => Math.round(x.m.note))),
  ].sort((a, b) => b - a);
  const ratio = uniq.length > 1 ? (uniq[0] / uniq[uniq.length - 1]).toFixed(2) : '1.00';
  console.log(
    `  окно ${width}px: разных ширин ${uniq.length} → ${uniq.join(' · ')} px (крайние различаются в ${ratio} раза)`,
  );
}

/* ── Уборка следов прибора: РАЗРЕШЕНИЕ СПРАШИВАЕТСЯ У УЧЁТКИ, не предполагается ── */
console.log('\n── Уборка следов прибора ──');
if (guestUid) {
  const done = await removeGuest({ db, auth: getAuth() }, guestUid);
  check(done.removed, `уборка разрешена свойством учётки: ${done.why}`);
  check(
    done.traces.length === 0,
    `следов прибора не осталось${done.traces.length ? ` (остались: ${done.traces.join(', ')})` : ''}`,
  );
}

if (SHOTS) console.log(`\n  кадры «${STAMP}» → ${OUT}/`);
console.log(`\nИтог: ${failures === 0 ? '✅ замер снят' : `❌ провалов контроля: ${failures}`}`);
process.exit(failures === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * СТРАЖ ШИРИНЫ ПЛАШКИ ГОСТЯ — приёмка `bugs/226`.
 *
 * Дефект владельца (2026-08-30): «*плашка "сейчас вы гость" в десктопе разной ширины на разных
 * страницах*». Замер до правки: одна плашка имела **четыре** ширины — на окне 1560 это
 * 1228 · 411 · 298 · 296,5 px, крайние различались вчетверо.
 *
 * ── ЧТО ЗДЕСЬ ГЛАВНОЕ, И ЭТО НЕ ТРИ ШИРИНЫ ─────────────────────────────────────────────────
 * 🔑 **Класс дефекта: список исключений, который пополняется руками, молчит о своём неполном
 * составе.** Механизм «во всю строку» на экранах-сетках существовал и до правки
 * (`grid-column: 1 / -1`), но списки перечисляли элементы ПОИМЁННО — `.head`, `.full`,
 * `.screen-title`, `.state`, `.intro`. Плашка пришла из чужого компонента, в список не попала
 * и молча стала ячейкой сетки. Ни ошибки, ни красного теста: новый элемент в `.body` о себе не
 * сообщает НИЧЕМ.
 *
 * 🔴 **ПОЭТОМУ СПИСОК ЭКРАНОВ ЗДЕСЬ ВЫВОДИТСЯ ИЗ ИСХОДНИКА, А НЕ НАБРАН РУКАМИ.** Страж,
 * несущий свой поимённый список пяти экранов, был бы ТЕМ ЖЕ САМЫМ дефектом этажом выше:
 * шестой экран, куда завтра поставят `<GuestCard />`, в него не попал бы и молчал бы ровно так
 * же. Корпус — файлы `src/routes/<экран>/+page.svelte`, в которых стоит `<GuestCard`; новый
 * экран входит в проверку сам, в тот же коммит, которым его добавили.
 * ⚠️ Путь записан углами намеренно: звёздочка-глоб рядом с косой чертой закрывает этот самый
 * блочный комментарий, и файл перестаёт разбираться. Стоило одного прогона.
 *
 * ── ЧТО СТРАЖ УТВЕРЖДАЕТ ───────────────────────────────────────────────────────────────────
 *   A. **Плашка занимает всю ширину содержимого своего родителя** — на каждом экране корпуса,
 *      на каждой ширине окна, в обеих темах. Это и есть объявленное правило, а не «ширины
 *      равны между экранами»: полоса контента на `relations` от 1560 px ШИРЕ прочих по
 *      утверждённому макету V2 (1261 против 1228), и плашка обязана следовать за содержимым,
 *      а не спорить с ним. Утверждение «ширины равны» покраснело бы на исправном продукте.
 *   B. **Текст плашки не превышает читаемую меру** (правило `.gnote p`, 700 px) — на ОБОИХ языках.
 *      Оплачено замером Дизайнера: на 1228 px русский текст даёт 172 знака в строке при
 *      потолке ≈90 и роняет сироту в 36 px. ⚠️ RU и EN ломаются на РАЗНЫХ ширинах, поэтому
 *      мера — число, а не ширина родителя, и проверяется она на двух языках.
 *   C. **Телефон не изменился:** на 390 px плашка занимает всю ширину `.body`, как и до правки.
 *
 * ⛔ Чего страж НЕ утверждает, названо честно: **отсутствия висячей строки-сироты.** Он мерит
 * МЕРУ, а сироту при 700 px доказал зонд Дизайнера на обоих языках. Признак «нет сироты»
 * потребовал бы разбора переносов и на коротком слове дал бы ложное красное.
 *
 * ── КОНТРОЛЬ ПРИБОРА ИДЁТ ПЕРВЫМ (`EXP-0082`) ──────────────────────────────────────────────
 * Плашка живёт только у гостя. Прибор, не нашедший её, обязан ПОКРАСНЕТЬ, а не напечатать
 * «расхождений 0»: молчаливое «замеров ноль» — тот самый ложный зелёный, за которым проект
 * охотится всем своим каноном. Поэтому число найденных плашек сверяется с числом ожидаемых
 * сочетаний, и корпус, оказавшийся пустым, — тоже красное.
 *
 * Доказан мутациями (числа — в отчёте задачи и в `bugs/226`):
 *   1. снять `grid-column: 1 / -1` у одного экрана → красное А адресно по этому экрану;
 *   2. снять `max-width: 700px` у `.gnote p` → красное B на широких окнах, оба языка;
 *   3. переименовать `.gnote` в компоненте → красный КОНТРОЛЬ (а не зелёная пустая таблица).
 *
 * ⚠️ EXP-0174: на стенде гостевая сессия живёт только за дверью `?as=guest` — переходы прямые.
 * ⚠️ Язык фиксируется явно ключом `ndim-lang` ДО загрузки: умолчание языка зависит от настроек
 * машины, где идёт прогон (`lang.svelte.ts` — «в стражах фиксировать язык явно»).
 *
 * Запуск: стенд своего слота поднят (`npm run stand`) → node tools/verify-bug226-gnote.mjs
 *   --quick   только 1440 и один язык — для проверки самого стража мутациями
 *   --slot N  ЯВНЫЙ слот (или переменная STAND_SLOT) — для прогона из ЧУЖОГО дерева: судья
 *             работает временным деревом, а его имя даёт слот 0 (слот главной копии)
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

import { portsFor, slotFromRequest } from './lib/stand-slot.mjs';
import { readGuestSession, removeGuest } from './lib/guest-session.mjs';

const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const { slot, role, источник } = slotFromRequest({
  argv: process.argv.slice(2),
  env: process.env,
  dirName: basename(root),
});
const ports = portsFor(slot);
const BASE = `http://localhost:${ports.dev}`;

process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${ports.firestore}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${ports.auth}`;
process.env.FIREBASE_PROJECT_ID = 'demo-ndim-dev';
const requireSync = createRequire(new URL('../sync-server/', import.meta.url));
const { initializeApp, getApps } = requireSync('firebase-admin/app');
if (getApps().length === 0) initializeApp({ projectId: 'demo-ndim-dev' });
const { getFirestore } = requireSync('firebase-admin/firestore');
const { getAuth } = requireSync('firebase-admin/auth');
const db = getFirestore();

const QUICK = process.argv.includes('--quick');

/** Читаемая мера строки плашки. Одна истина с `.gnote p { max-width }` в компоненте. */
const TEXT_MEASURE = 700;
/** Допуск сравнения пикселей: браузер отдаёт дробные ширины (`296.5`), а не целые. */
const EPS = 0.6;

const WIDTHS = QUICK ? [1440] : [390, 1024, 1440, 1560];
const THEMES = QUICK ? ['light'] : ['light', 'dark'];
const LANGS = QUICK ? ['ru'] : ['ru', 'en'];

/**
 * КОРПУС — выводится из исходника, а не набирается руками (довод в шапке).
 * Экран = каталог `src/routes/<путь>/+page.svelte`, в разметке которого стоит `<GuestCard`.
 */
function screensFromSource() {
  const dir = join(root, 'src', 'routes');
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const page = join(dir, entry.name, '+page.svelte');
    if (!existsSync(page)) continue;
    if (readFileSync(page, 'utf8').includes('<GuestCard')) found.push(`/${entry.name}`);
  }
  return found.sort();
}

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}`);
  if (!ok) failures += 1;
};

/** Геометрия плашки, её текста и содержимого родителя — со ЖИВОЙ страницы. */
function geometry(page) {
  return page.evaluate(() => {
    const note = document.querySelector('.gnote');
    if (!note) return null;
    const text = note.querySelector('p');
    const body = note.parentElement;
    const cs = getComputedStyle(body);
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    return {
      note: note.getBoundingClientRect().width,
      text: text ? text.getBoundingClientRect().width : null,
      bodyContent: body.getBoundingClientRect().width - pad,
      display: cs.display,
    };
  });
}

const SCREENS = screensFromSource();
console.log('═══ СТРАЖ ШИРИНЫ ПЛАШКИ ГОСТЯ (bugs/226) ═══');
console.log(`  стенд: слот ${slot} · роль ${role ?? '—'} · источник слота: ${источник} · ${BASE}`);
console.log(`  корпус выведен из исходника: ${SCREENS.length ? SCREENS.join(' · ') : '— ПУСТО —'}\n`);

/* Контроль корпуса ПЕРВЫМ: пустой корпус зелёным быть не смеет. */
check(
  SCREENS.length > 0,
  `корпус непуст: экранов с <GuestCard /> — ${SCREENS.length}` +
    (SCREENS.length ? '' : ' — мерить нечего, зелёное здесь означало бы слепоту'),
);

const browser = await chromium.launch();
/** Все гости, заведённые прогоном: по одному на языковой контекст. Убираются ВСЕ. */
const guests = new Set();
let seen = 0;
const wide = []; // нарушения А
const longText = []; // нарушения B

try {
  for (const lang of LANGS) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
    // Язык фиксируется ДО загрузки: умолчание зависит от машины прогона.
    await ctx.addInitScript((l) => {
      try {
        localStorage.setItem('ndim-lang', l);
      } catch {
        /* приватный режим — язык останется машинным, это увидит проверка B */
      }
    }, lang);
    const page = await ctx.newPage();

    /*
     * 🔴 ГОСТЬ ЗАВОДИТСЯ ДВЕРЬЮ `?as=guest`, И ТОЛЬКО ЕЮ. Без параметра `?as` стенд автовходит
     * dev-пользователем (`src/lib/data/profile.ts:127`), и чтение сессии сразу после
     * `/profile?guest=1` — гонка: один прогон из нескольких отдавал uid `dev@ndim.space`.
     * Подделкой дверь не является — она зовёт настоящий `signInAnonymously` (`profile.ts:103`).
     *
     * ⚠️ И ГОСТЬ ЗАВОДИТСЯ У КАЖДОГО КОНТЕКСТА СВОЙ. Первая редакция читала uid только один
     * раз (`if (!guestUid)`), а контекстов здесь по числу языков — второй гость оставался в
     * Auth навсегда. Уборка идёт по МНОЖЕСТВУ заведённых, а не по последнему.
     */
    await page.goto(`${BASE}${SCREENS[0]}?as=guest`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const session = await readGuestSession(page);
    if (!session.uid) throw new Error(`гостевая сессия не опознана: ${session.reason}`);
    guests.add(session.uid);
    console.log(
      `  гость (${lang}) рождён дверью продукта: ${session.uid} · записей аутентификации ${session.authRecords}, гостевых ${session.anonymous}`,
    );

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of SCREENS) {
        await page.goto(`${BASE}${path}?as=guest`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1600);
        for (const theme of THEMES) {
          await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
          await page.waitForTimeout(200);
          const g = await geometry(page);
          const at = `${path} · ${width}px · ${theme} · ${lang}`;
          if (!g) continue; // не засчитываем — контроль «найдено столько же, сколько ожидалось» покраснеет
          seen += 1;
          if (Math.abs(g.note - g.bodyContent) > EPS) {
            wide.push(`${at}: плашка ${g.note}px при содержимом ${g.bodyContent}px (${g.display})`);
          }
          if (g.text !== null && g.text > TEXT_MEASURE + EPS) {
            longText.push(`${at}: строка ${Math.round(g.text)}px при мере ${TEXT_MEASURE}px`);
          }
        }
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

/* ── Контроль прибора: плашка обязана найтись во ВСЕХ сочетаниях ── */
const expected = LANGS.length * WIDTHS.length * SCREENS.length * THEMES.length;
check(
  seen === expected && expected > 0,
  `КОНТРОЛЬ: плашка найдена во всех сочетаниях — ${seen} из ${expected}` +
    (seen === expected ? '' : ' — прибор мерил не то, проверки ниже бессодержательны'),
);

/* ── A. Плашка — во всю ширину содержимого ── */
check(
  wide.length === 0,
  `A · плашка занимает всю ширину содержимого родителя (нарушений ${wide.length})`,
);
for (const line of wide.slice(0, 12)) console.log(`       ${line}`);
if (wide.length > 12) console.log(`       … и ещё ${wide.length - 12}`);

/* ── B. Текст не превышает читаемую меру ── */
check(
  longText.length === 0,
  `B · строка плашки не превышает читаемую меру ${TEXT_MEASURE}px на обоих языках (нарушений ${longText.length})`,
);
for (const line of longText.slice(0, 12)) console.log(`       ${line}`);
if (longText.length > 12) console.log(`       … и ещё ${longText.length - 12}`);

/* ── Уборка следов с проверкой ── */
console.log('\n── Уборка следов стража ──');
check(guests.size === LANGS.length, `КОНТРОЛЬ уборки: гостей заведено ${guests.size}, языковых контекстов ${LANGS.length} — убираем всех`);
for (const uid of guests) {
  const done = await removeGuest({ db, auth: getAuth() }, uid);
  check(done.removed, `${uid}: уборка разрешена свойством учётки — ${done.why}`);
  check(
    done.traces.length === 0,
    `${uid}: следов не осталось${done.traces.length ? ` (остались: ${done.traces.join(', ')})` : ''}`,
  );
}

console.log(`\nИтог: ${failures === 0 ? `✅ страж пройден (${seen} замеров)` : `❌ провалов: ${failures}`}`);
process.exit(failures === 0 ? 0 : 1);

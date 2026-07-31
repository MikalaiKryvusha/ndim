/**
 * ПРИБОР ЗАМЕРА (не страж) для `ideas/24` — «виджеты схлопывают дыры».
 * Фаза 1 эпика, шаги Ш1–Ш3 плана `plans/11`.
 *
 * Слово владельца (`ideas/24`):
 *   «Виджетам выделено фиксированное место, и они его держатся. Из-за этого появляются „дыры“
 *    в рабочем пространстве — это некрасиво.»
 *
 * ЗАЧЕМ. Метаплан (`plans/10`) начинается с прибора, а не с правки CSS, потому что прибор решает
 * не «насколько плохо», а КАКОЙ ТЕХНИКОЙ ЛЕЧИТЬ. Разведка `researches/22` §2.3 утверждает, что
 * дыра — это синхронизация ВЫСОТ СТРОК CSS Grid, а не пустые ячейки, и потому названный в идее
 * кандидат `grid-auto-flow: dense` не изменит ни пикселя. Это утверждение помечено [NOT-TESTED]
 * и должно быть подтверждено или опровергнуто ЗДЕСЬ, числом.
 *
 * ЧТО МЕРИТСЯ И КАК. Ячейка CSS Grid — не узел DOM, её `getBoundingClientRect()` не существует.
 * Поэтому геометрия строки выводится из СОСЕДЕЙ: дети `.body` группируются по `rect.top`, низ
 * строки = максимум низов её детей, а дыра виджета = низ строки − низ виджета. При
 * `align-items: start` (наш случай) короткий виджет не растягивается, и эта разница и есть то
 * пустое место, на которое смотрит владелец. Отдельной строкой печатаются ИСПОЛЬЗОВАННЫЕ
 * значения `grid-template-rows` — независимая сверка вывода о высотах строк.
 *
 * ⚠️ КОНТРОЛЬ ПРИБОРА ДВУСТОРОННИЙ (EXP-0082; шаг Ш2 плана). Прибор, который не умеет показать
 * ИЗМЕНЕНИЕ, красит зелёным любой код — на этом проекте так уже случалось. Поэтому после базового
 * замера прибор сам ставит два опыта на самом дырявом виджете:
 *   (1) удлинить его ровно до высоты строки → его дыра обязана ИСЧЕЗНУТЬ;
 *   (2) укоротить вдвое соседа-великана той же строки → дыра обязана ПЕРЕЕХАТЬ на соседа.
 * Не сработал хотя бы один опыт — прибор меряет не то, и все выводы недействительны.
 *
 * ⚠️ Ходим по экранам ОТДЕЛЬНЫМИ контекстами, а не кликами. Здесь это законно: мы меряем
 * СТАТИЧЕСКУЮ геометрию раскладки, а не память приложения (в отличие от EXP-0072, где `goto`
 * стирал измеряемое). Каждый экран открывается начисто — так замер не зависит от порядка.
 *
 * Запуск: `npm run stand`, затем `node tools/measure-ideas24.mjs`
 *         `--quick` — только светлая тема × 1440
 * Выход:  test-results/ideas24/ (report.txt + скриншоты раскладки)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const OUT = 'test-results/ideas24';
const QUICK = process.argv.includes('--quick');
mkdirSync(OUT, { recursive: true });

/** Экраны с двухколоночной виджетной сеткой (`researches/22` §2.4 — их ДВА, а не один). */
const SCREENS = [
  { path: '/space', name: 'Пространство' },
  { path: '/profile', name: 'Профиль' },
];

const COMBOS = QUICK
  ? [['light', 1440]]
  : [['light', 1024], ['light', 1440], ['dark', 1024], ['dark', 1440], ['light', 390]];

const lines = [];
function say(text = '') {
  console.log(text);
  lines.push(text);
}

/**
 * Снимает раскладку `.body`: колонки, зазор, строки и дыру под каждым виджетом.
 * Возвращает данные, а не вердикт, — это прибор.
 */
const READ_LAYOUT = () => {
  const body = document.querySelector('main.body');
  if (!body) return { error: 'нет main.body' };

  const cs = getComputedStyle(body);
  const kids = [...body.children].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.height > 0 && getComputedStyle(el).display !== 'none';
  });

  const label = (el, i) => {
    const h3 = el.querySelector('h3, h1, h2');
    const text = h3?.textContent?.trim();
    if (text) return text.slice(0, 34);
    const cls = [...el.classList].filter((c) => c !== 'card').join('.');
    return cls || `${el.tagName.toLowerCase()}#${i + 1}`;
  };

  const items = kids.map((el, i) => {
    const r = el.getBoundingClientRect();
    return {
      nth: i + 1, // 1-based — им же адресуются опыты контроля
      label: label(el, i),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      height: Math.round(r.height),
      width: Math.round(r.width),
    };
  });

  // Группировка по строкам: дети одной строки начинаются на одной высоте (допуск 2px).
  const rows = [];
  for (const it of items) {
    const row = rows.find((r) => Math.abs(r.top - it.top) <= 2);
    if (row) row.items.push(it);
    else rows.push({ top: it.top, items: [it] });
  }
  rows.sort((a, b) => a.top - b.top);

  for (const row of rows) {
    row.bottom = Math.max(...row.items.map((i) => i.bottom));
    for (const it of row.items) it.hole = row.bottom - it.bottom;
  }

  return {
    display: cs.display,
    columns: cs.gridTemplateColumns,
    // ИСПОЛЬЗОВАННЫЕ высоты строк — независимая сверка нашего вывода из соседей.
    rowsUsed: cs.gridTemplateRows,
    flow: cs.gridAutoFlow,
    rowGap: Math.round(Number.parseFloat(cs.rowGap) || 0),
    columnCount: cs.gridTemplateColumns.split(' ').filter(Boolean).length,
    rows: rows.map((r) => ({ top: r.top, bottom: r.bottom, items: r.items })),
    items,
    totalHole: items.reduce((sum, i) => sum + (i.hole ?? 0), 0),
    maxHole: items.reduce((m, i) => Math.max(m, i.hole ?? 0), 0),
  };
};

/** Открыть экран и дождаться, что виджеты РЕАЛЬНО отрисованы, а не что разметка есть. */
async function openScreen(browser, { theme, width, path }) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    deviceScaleFactor: 1,
    locale: 'ru-RU',
  });
  await context.addInitScript((v) => localStorage.setItem('ndim-theme', v), theme);
  const page = await context.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });

  // Признак готовности — данные экрана, а не наличие пререндеренной оболочки:
  // карточка загрузки ушла И виджетов набралось больше двух.
  await page.waitForFunction(
    () =>
      document.querySelector('.load-card') === null &&
      document.querySelectorAll('main.body > *').length >= 3,
    undefined,
    { timeout: 30000 },
  );
  // Виджеты приезжают лесенкой (bugs/05: delay = order × 45мс) — ждём конца анимации,
  // иначе замер поймает виджет в полёте и высоты будут врать.
  await page.waitForTimeout(700);
  return { context, page };
}

/** Печать одного замера. */
function report(seen, indent = '  ') {
  if (seen.error) {
    say(`${indent}⚠️ ${seen.error}`);
    return;
  }
  say(`${indent}display: ${seen.display} · колонок: ${seen.columnCount} · flow: ${seen.flow} · row-gap: ${seen.rowGap}px`);
  say(`${indent}колонки : ${seen.columns}`);
  say(`${indent}строки  : ${seen.rowsUsed}`);
  for (const row of seen.rows) {
    const names = row.items.map((i) => `${i.label} (h${i.height}${i.hole ? `, дыра ${i.hole}` : ''})`);
    say(`${indent}строка ↑${row.top} ↓${row.bottom}: ${names.join('  |  ')}`);
  }
  say(`${indent}▸ ДЫРА суммарно ${seen.totalHole}px · максимум ${seen.maxHole}px`);
}

const browser = await chromium.launch();
/** Базовые замеры по ключу «экран·тема·ширина» — на них считаются опыты и сравнение вариантов. */
const base = new Map();

try {
  // ─────────────────────────── Ш1 · базовый замер ───────────────────────────
  say('╔══ Ш1 · ЗАМЕР «ДО» ══════════════════════════════════════════════════════');
  say(`база: ${BASE}`);
  say('');

  for (const screen of SCREENS) {
    for (const [theme, width] of COMBOS) {
      const { context, page } = await openScreen(browser, { theme, width, path: screen.path });
      const seen = await page.evaluate(READ_LAYOUT);
      base.set(`${screen.path}|${theme}|${width}`, seen);

      say(`── ${screen.name} · ${theme} · ${width}px ──`);
      report(seen);
      say('');

      await page.screenshot({ path: `${OUT}/base-${screen.path.slice(1)}-${theme}-${width}.png`, fullPage: true });
      await context.close();
    }
  }

  // ─────────────────────── Ш2 · двусторонний контроль ───────────────────────
  say('╔══ Ш2 · КОНТРОЛЬ ПРИБОРА (EXP-0082) ═════════════════════════════════════');
  say('Прибор обязан УВИДЕТЬ изменение, которое мы вносим сами. Два опыта на самой');
  say('дырявой строке: удлинить дырявого — дыра исчезает; укоротить великана — переезжает.');
  say('');

  const controls = [];
  for (const screen of SCREENS) {
    const key = `${screen.path}|light|1440`;
    const seen = base.get(key);
    if (!seen || seen.maxHole === 0) {
      say(`── ${screen.name}: дыр в базовом замере нет — контролировать нечего, опыт пропущен.`);
      say('');
      continue;
    }

    // Самый дырявый виджет и великан его строки.
    const holed = seen.items.reduce((a, b) => ((b.hole ?? 0) > (a.hole ?? 0) ? b : a));
    const row = seen.rows.find((r) => r.items.some((i) => i.nth === holed.nth));
    const giant = row.items.reduce((a, b) => (b.height > a.height ? b : a));
    const rowHeight = row.bottom - row.top;

    // Опыт 1: удлинить дырявого ровно до высоты строки → его дыра обязана исчезнуть.
    {
      const { context, page } = await openScreen(browser, { theme: 'light', width: 1440, path: screen.path });
      await page.addStyleTag({
        content: `main.body > :nth-child(${holed.nth}) { min-height: ${rowHeight}px !important; }`,
      });
      await page.waitForTimeout(200);
      const after = await page.evaluate(READ_LAYOUT);
      const now = after.items.find((i) => i.nth === holed.nth)?.hole ?? -1;
      const ok = now <= 2;
      say(`── ${screen.name} · опыт 1 «удлинить дырявого» (${holed.label}) ──`);
      say(`   дыра ${holed.hole}px → ${now}px   ${ok ? '✔ прибор видит изменение' : '✘ ПРИБОР НЕ ВИДИТ — замеру верить нельзя'}`);
      controls.push(ok);
      await context.close();
    }

    // Опыт 2: укоротить великана вдвое → дыра обязана переехать на него.
    {
      const { context, page } = await openScreen(browser, { theme: 'light', width: 1440, path: screen.path });
      await page.addStyleTag({
        content: `main.body > :nth-child(${giant.nth}) { max-height: ${Math.round(giant.height / 2)}px !important; overflow: hidden !important; }`,
      });
      await page.waitForTimeout(200);
      const after = await page.evaluate(READ_LAYOUT);
      const giantHole = after.items.find((i) => i.nth === giant.nth)?.hole ?? -1;
      const holedHole = after.items.find((i) => i.nth === holed.nth)?.hole ?? -1;
      const ok = giantHole > 2 || holedHole < (holed.hole ?? 0);
      say(`── ${screen.name} · опыт 2 «укоротить великана» (${giant.label}) ──`);
      say(`   дыра великана 0 → ${giantHole}px · дыра ${holed.label}: ${holed.hole} → ${holedHole}px`);
      say(`   ${ok ? '✔ дыра переехала — прибор следит за строкой, а не за виджетом' : '✘ дыра не переехала — вывод о строках неверен'}`);
      controls.push(ok);
      await context.close();
    }
    say('');
  }

  // ─────────────── Ш3 · опровержение `grid-auto-flow: dense` числом ───────────────
  say('╔══ Ш3 · КАНДИДАТ `grid-auto-flow: dense` ════════════════════════════════');
  say('Гипотеза researches/22 §2.3: у нас все ячейки заполнены, подбирать `dense` нечего,');
  say('и геометрия обязана совпасть ДО ПИКСЕЛЯ. Совпала — кандидат опровергнут.');
  say('');

  const denseVerdicts = [];
  for (const screen of SCREENS) {
    for (const [theme, width] of QUICK ? [['light', 1440]] : [['light', 1024], ['light', 1440]]) {
      const before = base.get(`${screen.path}|${theme}|${width}`);
      if (!before || before.error) continue;

      const { context, page } = await openScreen(browser, { theme, width, path: screen.path });
      await page.addStyleTag({ content: 'main.body { grid-auto-flow: row dense !important; }' });
      await page.waitForTimeout(200);
      const after = await page.evaluate(READ_LAYOUT);
      await context.close();

      const moved = before.items.filter((b) => {
        const a = after.items.find((x) => x.nth === b.nth);
        return !a || a.top !== b.top || a.height !== b.height;
      });
      const same = moved.length === 0 && before.totalHole === after.totalHole;
      denseVerdicts.push(same);

      say(`── ${screen.name} · ${theme} · ${width}px ──`);
      say(`   flow: ${before.flow} → ${after.flow}`);
      say(`   дыра суммарно: ${before.totalHole}px → ${after.totalHole}px · сдвинулось виджетов: ${moved.length}`);
      say(`   ${same ? '⇒ НИ ОДНОГО ПИКСЕЛЯ РАЗНИЦЫ — кандидат `dense` опровергнут' : '⇒ ⚠️ РАЗНИЦА ЕСТЬ — researches/22 §2.3 неверен, метаплан пересмотреть ДО макетов'}`);
      if (!same) {
        for (const m of moved) {
          const a = after.items.find((x) => x.nth === m.nth);
          say(`      ${m.label}: top ${m.top}→${a?.top} · h ${m.height}→${a?.height}`);
        }
      }
      say('');
    }
  }

  // ─────────────────────────────── Итог ───────────────────────────────
  say('╔══ ИТОГ ═════════════════════════════════════════════════════════════════');
  const controlsOk = controls.length > 0 && controls.every(Boolean);
  say(`Контроль прибора : ${controls.filter(Boolean).length}/${controls.length} ${controlsOk ? '✔ прибору можно верить' : '✘ ПРИБОРУ ВЕРИТЬ НЕЛЬЗЯ'}`);
  const denseOk = denseVerdicts.length > 0 && denseVerdicts.every(Boolean);
  say(`Кандидат dense   : ${denseVerdicts.filter(Boolean).length}/${denseVerdicts.length} замеров без разницы ${denseOk ? '✔ опровергнут' : '✘ гипотеза §2.3 под вопросом'}`);
  say('');
  say('Таблица «до» (для plans/11):');
  say('| Экран | Ширина | Тема | Виджет | Высота | Дыра |');
  say('|---|---|---|---|---|---|');
  for (const screen of SCREENS) {
    for (const [theme, width] of COMBOS) {
      const seen = base.get(`${screen.path}|${theme}|${width}`);
      if (!seen || seen.error) continue;
      for (const it of seen.items.filter((i) => (i.hole ?? 0) > 0)) {
        say(`| ${screen.name} | ${width} | ${theme} | ${it.label} | ${it.height} | **${it.hole}** |`);
      }
    }
  }
} finally {
  await browser.close();
  await writeFile(`${OUT}/report.txt`, lines.join('\n'), 'utf8');
  console.log(`\nотчёт: ${OUT}/report.txt · скриншоты: ${OUT}/`);
}

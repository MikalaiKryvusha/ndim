/**
 * СТРАЖ виджетной сетки с шагом — `ideas/24`, фаза 2 (`plans/12`, Ш3).
 *
 * Слова владельца, которые здесь стережём:
 *   «Виджетам выделено фиксированное место, и они его держатся. Из-за этого появляются „дыры“
 *    в рабочем пространстве — это некрасиво.»
 *   «есть шаг виджета. есть малые виджены на один шаг, и большие на два шага»
 *   «не нужно исскуственно их растягивать»
 *
 * ЧТО СТЕРЕЖЁТ И ПОЧЕМУ ИМЕННО ТАК:
 *
 * 1. ★ ПУСТОТЫ не выше своего потолка на КАЖДОЙ ширине (24% на 1440, 29% на 1024 — см.
 *    EMPTY_LIMIT ниже). Мера — доля габаритного прямоугольника содержимого, не покрытая
 *    карточками. Она выбрана МОДЕЛЬ-НЕЗАВИСИМОЙ намеренно: в фазе 1 метрику пришлось
 *    переписывать ЧЕТЫРЕЖДЫ, потому что каждая опиралась на структуру («строки», «колонки»,
 *    «полосы») и врала, как только техника менялась (EXP-0104). Площадь есть у любой раскладки.
 *
 * 2. ★ НИ ОДНОЙ ДЫРЫ МЕЖДУ СОСЕДЯМИ ПО КОЛОННЕ. Это главное обещание модели: виджеты внутри
 *    колонны идут стопкой и никого не ждут. Зазор больше обычного = раскладка снова
 *    синхронизирует строки. Хвост колонны при этом законен — колонны разной длины бывают.
 *
 * 3. ★ ШАГ ЕСТЬ И ОН РОВНО ТАКОЙ: четыре равные колонки-шага, плитка занимает один шаг,
 *    колонна — два. Проверяется по ГЕОМЕТРИИ, а не по CSS-тексту: подменённое правило
 *    в другом файле дало бы зелёный на строковой проверке.
 *
 * 4. ★ КАРТОЧКИ НЕ РАСТЯНУТЫ. Прямой запрет владельца. Признак растяжки — карточка, чья
 *    высота равна высоте соседа по строке с точностью до пикселя при разном содержимом.
 *
 * 5. ★ ТЕЛЕФОН НЕ ИЗМЕНИЛСЯ: на 390px одна колонка, `.col`/`.tiles` растворены
 *    (`display: contents`), порядок виджетов прежний. Это самая дорогая строка стража:
 *    правка ради десктопа не имеет права тронуть телефон.
 *
 * 6. ★ ПОРЯДОК ФОКУСА не разошёлся с видимым порядком (researches/22 §3.2): колонны дают
 *    связный порядок «вниз по левой, затем вниз по правой», и это надо доказать, а не
 *    предположить.
 *
 * ⚠️ КОНТРОЛЬ САМОГО СТРАЖА (EXP-0082) встроен: под флагом `--mutant` страж возвращает
 * СТАРУЮ сетку инъекцией и обязан покраснеть. Зелёный мутант = страж не стережёт ничего.
 *
 * Запуск: `npm run stand`, затем `node tools/verify-ideas24.mjs`
 *         `--quick`  — светлая тема × 1440
 *         `--mutant` — доказательство: вернуть старую сетку, страж обязан краснеть
 * Выход:  test-results/ideas24-guard/ (скриншоты + report.txt)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const OUT = 'test-results/ideas24-guard';
const QUICK = process.argv.includes('--quick');
const MUTANT = process.argv.includes('--mutant');
mkdirSync(OUT, { recursive: true });

/*
 * Потолок пустоты — СВОЙ НА КАЖДУЮ ШИРИНУ, и это не придирка. На узком десктопе колонки
 * уже, виджеты выше, разброс высот больше: одна цифра на обе ширины либо пропускает
 * регрессию на 1440, либо краснеет на исправном коде при 1024 (первая редакция стража
 * поставила общие 24% и покраснела дважды на здоровом продукте).
 *
 * Каждый порог выбран МЕЖДУ замеренным «после» и замеренным «до» (`tools/measure-ideas24.mjs`,
 * стенд, 2026-07-31) — так он терпит дрожание высот от данных, но ловит возврат старой сетки:
 *
 *   ширина │ было  │ стало │ порог
 *   1440   │ 26.8% │ 22.2% │ 24%
 *   1024   │ 30.9% │ 27.2% │ 29%
 *
 * Порог, поднятый выше «было», перестаёт быть стражем — это проверять мутацией `--mutant`.
 */
const EMPTY_LIMIT = { 1024: 29, 1440: 24 };
/** Зазор десктопной сетки «Пространства». Больше него между соседями по колонне — дыра. */
const GAP = 12;
/** Допуск на дробные пиксели раскладки. */
const EPS = 2;

/** Мутация: возврат старой двухколоночной сетки без колонн-контейнеров. */
const MUTATION = `
  @media (min-width: 1024px) {
    main.body { grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr) !important; }
    main.body > .col { display: contents !important; }
    main.body > .tiles { display: grid !important; grid-column: 1 / -1 !important;
                         grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
  }`;

const COMBOS = QUICK ? [['light', 1440]] : [['light', 1024], ['light', 1440], ['dark', 1024], ['dark', 1440]];

let pass = 0;
const fails = [];
const lines = [];
function say(text = '') {
  console.log(text);
  lines.push(text);
}
function check(ok, name) {
  if (ok) pass += 1;
  else fails.push(name);
  say(`  ${ok ? '✔' : '✘'} ${name}`);
}

/** Снимает раскладку так же, как прибор: виджеты берутся И внутри колонн. */
const READ = (gap) => {
  const body = document.querySelector('main.body');
  if (!body) return { error: 'нет main.body' };
  const cs = getComputedStyle(body);
  const box = body.getBoundingClientRect();

  const kids = [...body.querySelectorAll(':scope > *, :scope > .col > *, :scope > .tiles > *')]
    .filter((el) => {
      if (el.classList.contains('col') || el.classList.contains('tiles')) return false;
      const r = el.getBoundingClientRect();
      return r.height > 0 && getComputedStyle(el).display !== 'none';
    });

  const items = kids.map((el) => {
    const r = el.getBoundingClientRect();
    const h3 = el.querySelector('h3, h1, h2');
    return {
      label: h3?.textContent?.trim()?.slice(0, 30) ?? [...el.classList].join('.'),
      top: r.top, bottom: r.bottom, left: r.left, right: r.right,
      w: r.width, h: r.height, cx: (r.left + r.right) / 2,
      card: el.classList.contains('card'),
      tile: el.classList.contains('tile'),
      inCol: el.parentElement?.classList.contains('col') === true,
    };
  });

  const covered = items.reduce((s, i) => s + i.w * i.h, 0);
  const top = Math.min(...items.map((i) => i.top));
  const bottom = Math.max(...items.map((i) => i.bottom));
  const empty = Math.round((1 - covered / (box.width * (bottom - top))) * 1000) / 10;

  // Дыры МЕЖДУ СОСЕДЯМИ ПО КОЛОННЕ. Хвост колонны законен и не считается.
  const cols = [];
  for (const it of items.filter((i) => i.w < box.width * 0.9)) {
    const col = cols.find((c) => Math.abs(c.cx - it.cx) < 60);
    if (col) col.items.push(it);
    else cols.push({ cx: it.cx, items: [it] });
  }
  const gaps = [];
  for (const col of cols) {
    col.items.sort((a, b) => a.top - b.top);
    for (let i = 1; i < col.items.length; i++) {
      const g = col.items[i].top - col.items[i - 1].bottom;
      if (g > gap + 2) gaps.push({ after: col.items[i - 1].label, size: Math.round(g - gap) });
    }
  }

  // Растяжка: карточка ровно той же высоты, что сосед по строке, при разном содержимом.
  const stretched = [];
  for (const a of items) {
    for (const b of items) {
      if (a === b || Math.abs(a.top - b.top) > 2) continue;
      if (Math.abs(a.h - b.h) < 0.5 && a.label !== b.label && !a.tile && !b.tile) {
        stretched.push(`${a.label} = ${b.label}`);
      }
    }
  }

  /*
   * ПОРЯДОК ОБХОДА. Первая редакция сравнивала DOM-порядок со сплошной сортировкой
   * «слева-сверху» и краснела на исправном продукте: у дашборда порядок не сплошной —
   * строка плиток читается поперёк, а колонны вдоль. Проверяемое утверждение уже́:
   * ВНУТРИ КАЖДОЙ КОЛОННЫ порядок DOM обязан совпадать с порядком сверху вниз. Именно его
   * нарушение и означало бы, что фокус прыгает не туда (researches/22 §3.2).
   */
  const orderOk = cols.every((col) => {
    const byDom = col.items.map((i) => i.label).join('|');
    const byTop = [...col.items].sort((a, b) => a.top - b.top).map((i) => i.label).join('|');
    return byDom === byTop;
  });

  // Ширины колонн ВИДЖЕТОВ — кластеры больше чем из одного элемента либо шире плитки.
  // Плитки образуют свои кластеры по одному шагу и колоннами не являются.
  const widgetCols = cols.filter((c) => c.items.some((i) => !i.tile));

  return {
    display: cs.display,
    columns: cs.gridTemplateColumns.split(' ').map((v) => Math.round(Number.parseFloat(v))),
    empty, gaps, stretched, orderOk,
    tiles: items.filter((i) => i.tile).map((i) => Math.round(i.w)),
    colWidths: widgetCols.map((c) =>
      Math.round(Math.max(...c.items.map((i) => i.right)) - Math.min(...c.items.map((i) => i.left)))),
    order: items.map((i) => i.label),
    count: items.length,
  };
};

const browser = await chromium.launch();
try {
  say(`╔══ СТРАЖ ideas/24 · виджетная сетка с шагом ${MUTANT ? '· РЕЖИМ МУТАНТА' : ''} ══`);
  say(`база: ${BASE} · потолки пустоты: ${Object.entries(EMPTY_LIMIT).map(([w, v]) => `${w}px→${v}%`).join(' · ')}`);
  say('');

  // ── Десктоп: «Пространство» ──
  for (const [theme, width] of COMBOS) {
    const ctx = await browser.newContext({ viewport: { width, height: 1000 }, locale: 'ru-RU' });
    await ctx.addInitScript((v) => localStorage.setItem('ndim-theme', v), theme);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/space`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.querySelector('.load-card') === null && document.querySelectorAll('main.body .card').length >= 5,
      undefined, { timeout: 30000 },
    );
    if (MUTANT) await page.addStyleTag({ content: MUTATION });
    await page.waitForTimeout(700);

    const seen = await page.evaluate(READ, GAP);
    say(`── Пространство · ${theme} · ${width}px ──`);
    say(`   пустоты ${seen.empty}% · колонки ${seen.columns.join('/')} · виджетов ${seen.count}`);

    const limit = EMPTY_LIMIT[width];
    check(seen.empty <= limit, `пустоты ${seen.empty}% ≤ ${limit}% (${theme}/${width})`);
    check(seen.gaps.length === 0,
      `нет дыр между соседями по колонне (${theme}/${width})${seen.gaps.length ? ' — ' + seen.gaps.map((g) => `после «${g.after}» ${g.size}px`).join(', ') : ''}`);
    check(seen.columns.length === 4 && new Set(seen.columns).size === 1,
      `сетка — ЧЕТЫРЕ равных шага (${theme}/${width}): ${seen.columns.join('/')}`);
    // Плитка — один шаг, колонна — два: ширина колонны вдвое больше плитки (±зазор).
    const step = seen.tiles[0] ?? 0;
    check(seen.tiles.length === 4 && seen.tiles.every((w) => Math.abs(w - step) <= EPS),
      `четыре плитки по одному шагу (${theme}/${width}): ${seen.tiles.join('/')}`);
    const twoSteps = step * 2 + GAP;
    check(seen.colWidths.length === 2 && seen.colWidths.every((w) => Math.abs(w - twoSteps) <= 4),
      `колонн ровно две, каждая в два шага (${theme}/${width}): ${seen.colWidths.join('/')} против ${twoSteps}`);
    check(seen.stretched.length === 0,
      `карточки не растянуты под соседа (${theme}/${width})${seen.stretched.length ? ' — ' + seen.stretched.join(', ') : ''}`);
    check(seen.orderOk, `внутри каждой колонны порядок DOM идёт сверху вниз — фокус не прыгает (${theme}/${width})`);

    await page.screenshot({ path: `${OUT}/space-${theme}-${width}${MUTANT ? '-mutant' : ''}.png`, fullPage: true });
    await ctx.close();
  }

  // ── Телефон: не изменился ──
  say('');
  say('── Телефон 390px — правка ради десктопа не имеет права его тронуть ──');
  for (const theme of QUICK ? ['light'] : ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, locale: 'ru-RU' });
    await ctx.addInitScript((v) => localStorage.setItem('ndim-theme', v), theme);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/space`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.querySelector('.load-card') === null && document.querySelectorAll('main.body .card').length >= 5,
      undefined, { timeout: 30000 },
    );
    if (MUTANT) await page.addStyleTag({ content: MUTATION });
    await page.waitForTimeout(500);

    const phone = await page.evaluate(() => {
      const body = document.querySelector('main.body');
      const col = body.querySelector('.col');
      const tiles = body.querySelector('.tiles');
      const cards = [...body.querySelectorAll('.card')];
      return {
        bodyDisplay: getComputedStyle(body).display,
        colDisplay: col ? getComputedStyle(col).display : 'нет',
        tilesCols: tiles ? getComputedStyle(tiles).gridTemplateColumns.split(' ').length : 0,
        /* Одна колонна = все СОДЕРЖАТЕЛЬНЫЕ карточки во всю ширину. Плитки метрик исключены
           намеренно: они и на телефоне стоят по две в ряд, и первая редакция стража краснела
           на исправном продукте именно из-за них. */
        oneColumn: cards
          .filter((c) => !c.classList.contains('tile'))
          .every((c) => c.getBoundingClientRect().width > body.getBoundingClientRect().width * 0.6),
        order: cards.map((c) => c.querySelector('h3')?.textContent?.trim() ?? '·').filter((t) => t !== '·'),
      };
    });

    check(phone.colDisplay === 'contents', `на телефоне колонна растворена (display: contents), а не контейнер — ${theme}`);
    check(phone.oneColumn, `на телефоне одна колонна виджетов — ${theme}`);
    check(phone.tilesCols === 2, `плитки на телефоне по-прежнему в две колонки — ${theme}: ${phone.tilesCols}`);
    check(
      phone.order.join('|') === ['Сегодня', 'Сейчас в Пространстве', 'Как распределена похожесть', 'Сервер синхронизации'].join('|'),
      `порядок виджетов на телефоне прежний — ${theme}: ${phone.order.join(' → ')}`,
    );
    await page.screenshot({ path: `${OUT}/phone-${theme}${MUTANT ? '-mutant' : ''}.png`, fullPage: true });
    await ctx.close();
  }

  say('');
  say(`ИТОГ: ${pass} пройдено · ${fails.length} провалов`);
  for (const f of fails) say(`   ✘ ${f}`);
  if (MUTANT) {
    say('');
    say(fails.length > 0
      ? `✔ МУТАНТ ПОЙМАН: на старой сетке страж даёт ${fails.length} провалов — он действительно стережёт.`
      : '✘ МУТАНТ НЕ ПОЙМАН: страж зелёный на возвращённой старой сетке. Он не стережёт ничего.');
  }
} finally {
  await browser.close();
  await writeFile(`${OUT}/report${MUTANT ? '-mutant' : ''}.txt`, lines.join('\n'), 'utf8');
  console.log(`\nотчёт: ${OUT}/report${MUTANT ? '-mutant' : ''}.txt`);
}

process.exit(MUTANT ? 0 : fails.length > 0 ? 1 : 0);

/**
 * СТРАЖ ВОРОНКИ V2 — три пары, каждая из которых разъезжается МОЛЧА (`plans/74` фаза 1 Ш5).
 *
 * ═══ ПОЧЕМУ ЭТОТ СТРАЖ ВООБЩЕ НУЖЕН ═══
 *
 * У воронки нет ни одного громкого отказа. `track()` глотает ошибку в `catch` намеренно —
 * аналитика не имеет права ломать продукт (`EXP-0028`). Цена этого решения в том, что КАЖДАЯ
 * поломка воронки бесшумна: шаг не записался, экран показал ноль, а ноль неотличим от честного
 * «в этот день никто не приходил». Читающий не узнает ничего, и узнает он это не сразу, а через
 * недели — когда ряд уже потерян, потому что задним числом его не восстановить.
 *
 * Поэтому здесь стерегутся ровно те три пары, чей разъезд даёт ТИХИЙ НОЛЬ:
 *
 *   1. **шаги ↔ правила.** `FUNNEL_STEPS` в `src/lib/data/funnel.ts` и `funnelCounters()` в
 *      `firestore.rules`. Шаг, забытый в правилах, продукт запишет, база отобьёт, `track()`
 *      проглотит. Счётчик будет вечным нулём, и никто не заметит.
 *   2. **имя метки.** `PROBE_MARK` здесь (`tools/lib/probe-mark.mjs`) и в `funnel.ts`. Разъезд
 *      даёт худший из исходов — ЛОЖНОЕ СПОКОЙСТВИЕ: прибор считает себя помеченным, продукт
 *      считает его человеком, и всплески в дни выкатов возвращаются, но уже «объяснёнными».
 *   3. **прибор ↔ метка.** Каждый прибор, ходящий браузером в живой контур, обязан метить
 *      КАЖДЫЙ заведённый контекст. Один непомеченный контекст — и `guest_start` снова считает
 *      нас самих (`bugs/202`, дефект 2: 77 гостей за 25 дней, четыре всплеска = четыре выката).
 *
 * ═══ ГРАНИЦЫ, НАЗВАННЫЕ ЧЕСТНО ═══
 *
 * · Страж СТАТИЧЕСКИЙ: он читает исходники, а не гоняет браузер. Он докажет, что метка
 *   ПОСТАВЛЕНА в коде прибора, и не докажет, что она доехала до страницы, — это работа стенда
 *   (прогон с меткой даёт +0) и она в приёмке фазы отдельным пунктом.
 * · Он судит приборы, которые МОГУТ дойти до живого контура (адрес боя/стейджа в файле либо
 *   реестр контуров). Прибор, ходящий только на `localhost`, не судится: на стенде счётчики
 *   пишутся в эмулятор, который никто не читает. Признак назван явно ниже и меряется.
 * · Он НЕ судит `e2e/` (Playwright ходит по локальному preview) и не судит порядок вызова
 *   внутри файла — «метка до первого goto» держится формой помощника, а не грепом.
 *
 * Запуск: `node tools/verify-probe-mark.mjs` · самотест: `--selftest`
 * Ворота: `npm run guards` (страж дешёвый — ни стенда, ни сети, ни сборки).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const TOOLS = join(ROOT, 'tools');

/* ── ЧИСТЫЕ ФУНКЦИИ ВЕРДИКТА ───────────────────────────────────────────────────
 *
 * Вердикт вынесен в функции без файловой системы — их гоняет самотест на синтетических
 * случаях. Прибор, у которого нет самотеста, доказывает только сам себя.
 */

/**
 * Ходит ли прибор браузером в ЖИВОЙ контур?
 *
 * Признак составной, и обе половины обязательны: браузер (иначе счётчикам неоткуда взяться —
 * продукт не исполняется) И достижимость живого адреса (иначе счёт уходит в эмулятор стенда).
 */
export function isLiveBrowserProbe(source) {
  const drivesBrowser = /chromium\.launch\(/.test(source);
  const reachesLive =
    /ndimspace\.app/.test(source) ||
    /ndim-stage\.web\.app/.test(source) ||
    /lib\/contours\.mjs/.test(source);
  /*
   * 🔑 ТРЕТЬЯ ПОЛОВИНА ПРИЗНАКА — «уже знает метку». Она закрывает слепую зону, названную
   * первым же прогоном: `smoke.mjs` и `probe-bridge.mjs` живого адреса в себе не держат
   * (по умолчанию идут на `localhost`), но принимают `--base` и в живой контур направляются
   * рукой. Признак «есть адрес боя в файле» их не видит, и добавленный завтра контекст
   * остался бы непомеченным.
   * Правило простое и не расширяет корпус: **опт-ин необратим**. Прибор, однажды взявший
   * помощник, судится на ПОЛНОТУ — все его сессии обязаны быть помечены.
   */
  const knowsMark = /lib\/probe-mark\.mjs/.test(source);
  return drivesBrowser && (reachesLive || knowsMark);
}

/** Сколько сессий браузера прибор заводит: каждая — своё `sessionStorage`, своя метка. */
export function countSessions(source) {
  const contexts = source.match(/await\s+browser\.newContext\(/g) ?? [];
  const pages = source.match(/await\s+browser\.newPage\(/g) ?? [];
  return contexts.length + pages.length;
}

/** Сколько из них помечено. */
export function countMarks(source) {
  const marks = source.match(/await\s+markProbe(?:Context|Page)\(/g) ?? [];
  return marks.length;
}

/**
 * Вердикт по одному прибору. Возвращает список нарушений (пустой — чисто).
 *
 * 🔑 Сравнение по ЧИСЛУ, а не по факту «импорт есть». Прибор, заводящий два контекста и
 * пометивший один, импорт имеет — и ровно этот случай самый вероятный: контекст добавляют
 * позже, к метке привыкли и о ней не думают.
 */
export function judgeProbe(name, source) {
  if (!isLiveBrowserProbe(source)) return [];
  const sessions = countSessions(source);
  if (sessions === 0) return [];
  const marks = countMarks(source);
  const faults = [];
  if (!/lib\/probe-mark\.mjs/.test(source)) {
    faults.push(`${name}: ходит браузером в живой контур и НЕ ЗНАЕТ метку прогона (нет импорта probe-mark)`);
    return faults;
  }
  if (marks < sessions) {
    faults.push(
      `${name}: сессий браузера ${sessions}, помечено ${marks} — ` +
        `${sessions - marks} непомеченных будут посчитаны как люди`,
    );
  }
  return faults;
}

/** Шаги воронки, объявленные продуктом (список `FUNNEL_STEPS`). */
export function stepsFromProduct(source) {
  const block = source.match(/FUNNEL_STEPS[^=]*=\s*\[([\s\S]*?)\]/);
  if (block === null) return [];
  return [...block[1].matchAll(/'([a-z_]+)'/g)].map((hit) => hit[1]);
}

/** Счётчики, разрешённые правилами (тело `funnelCounters()`). */
export function countersFromRules(source) {
  const block = source.match(/function\s+funnelCounters\(\)\s*\{[^}]*return\s*\[([\s\S]*?)\]/);
  if (block === null) return [];
  return [...block[1].matchAll(/'([a-z_]+)'/g)].map((hit) => hit[1]);
}

/** Значение константы `PROBE_MARK` в любом из двух файлов. */
export function markName(source) {
  const hit = source.match(/PROBE_MARK\s*(?::\s*string\s*)?=\s*'([^']+)'/);
  return hit === null ? null : hit[1];
}

/** Расхождение двух списков — обе стороны, потому что забыть можно в любой. */
export function pairFaults(product, rules) {
  const faults = [];
  for (const step of product) {
    if (!rules.includes(step)) {
      faults.push(`шаг «${step}» объявлен продуктом и НЕ РАЗРЕШЁН правилами — счётчик будет вечным нулём`);
    }
  }
  for (const counter of rules) {
    if (!product.includes(counter)) {
      faults.push(`счётчик «${counter}» разрешён правилами и не объявлен продуктом — правило шире продукта`);
    }
  }
  return faults;
}

/* ── САМОТЕСТ ──────────────────────────────────────────────────────────────────
 *
 * 🔴 ПРЕДОХРАНИТЕЛЬ «ЗАПУСТИЛИ ИЛИ ПОДКЛЮЧИЛИ» (вопрос 1 лестницы трёх вопросов, `EXP-0193`):
 * самотест обязан УПАСТЬ, если его случаи перестали быть способны краснеть. Поэтому каждый
 * случай несёт ОЖИДАЕМЫЙ вердикт, и совпадение проверяется, а не печатается.
 */
const SELFTEST_CASES = [
  {
    name: 'живой прибор без метки вовсе — красный',
    run: () =>
      judgeProbe('probe-x.mjs', `import { chromium } from 'playwright';\nconst BASE='https://ndimspace.app';\nawait chromium.launch();\nconst ctx = await browser.newContext();\n`).length === 1,
  },
  {
    name: '🔑 живой прибор пометил ОДИН контекст из двух — красный',
    run: () =>
      judgeProbe('probe-x.mjs', `import { markProbeContext } from './lib/probe-mark.mjs';\nconst BASE='https://ndimspace.app';\nawait chromium.launch();\nconst a = await browser.newContext();\nawait markProbeContext(a);\nconst b = await browser.newContext();\n`).length === 1,
  },
  {
    name: 'живой прибор пометил все — чисто',
    run: () =>
      judgeProbe('probe-x.mjs', `import { markProbeContext } from './lib/probe-mark.mjs';\nconst BASE='https://ndimspace.app';\nawait chromium.launch();\nconst a = await browser.newContext();\nawait markProbeContext(a);\n`).length === 0,
  },
  {
    name: 'прибор с newPage тоже судится',
    run: () =>
      judgeProbe('probe-x.mjs', `import { CONTOURS } from './lib/contours.mjs';\nawait chromium.launch();\nconst page = await browser.newPage();\n`).length === 1,
  },
  {
    name: 'КОНТРОЛЬ: прибор только на localhost НЕ судится — счёт уходит в эмулятор',
    run: () =>
      judgeProbe('probe-x.mjs', `import { chromium } from 'playwright';\nconst BASE='http://localhost:5173';\nawait chromium.launch();\nconst ctx = await browser.newContext();\n`).length === 0,
  },
  {
    name: 'КОНТРОЛЬ: живой адрес БЕЗ браузера не судится — продукт не исполняется',
    run: () =>
      judgeProbe('fetcher.mjs', `const BASE='https://ndimspace.app';\nconst res = await fetch(BASE);\n`).length === 0,
  },
  {
    name: 'шаг продукта, забытый в правилах, — красный',
    run: () => pairFaults(['landing_view', 'door_click'], ['landing_view']).length === 1,
  },
  {
    name: 'счётчик правил, забытый продуктом, — тоже красный (пара судится с обеих сторон)',
    run: () => pairFaults(['landing_view'], ['landing_view', 'catalog_view']).length === 1,
  },
  {
    name: 'совпавшие списки — чисто, порядок значения не имеет',
    run: () => pairFaults(['a_b', 'c_d'], ['c_d', 'a_b']).length === 0,
  },
  {
    name: 'разбор списка шагов из продукта',
    run: () => {
      const steps = stepsFromProduct("export const FUNNEL_STEPS: readonly FunnelStep[] = [\n  'landing_view',\n  'door_click',\n];");
      return steps.length === 2 && steps[0] === 'landing_view' && steps[1] === 'door_click';
    },
  },
  {
    name: 'разбор счётчиков из правил',
    run: () => {
      const counters = countersFromRules("function funnelCounters() {\n  return ['landing_view', 'door_click'];\n}");
      return counters.length === 2 && counters[1] === 'door_click';
    },
  },
  {
    name: 'разбор имени метки — и из .mjs, и из типизированного .ts',
    run: () =>
      markName("export const PROBE_MARK = 'ndim-probe';") === 'ndim-probe' &&
      markName("export const PROBE_MARK: string = 'ndim-probe';") === 'ndim-probe',
  },
];

function selftest() {
  let failed = 0;
  for (const item of SELFTEST_CASES) {
    const ok = item.run() === true;
    console.log(`${ok ? '  ✓' : '  ✗'} ${item.name}`);
    if (!ok) failed += 1;
  }
  console.log(
    failed === 0
      ? `\n✅ САМОТЕСТ ЧИСТ: случаев ${SELFTEST_CASES.length}, все ведут себя как объявлено.`
      : `\n❌ САМОТЕСТ КРАСНЫЙ: ${failed} из ${SELFTEST_CASES.length}.`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

/* ── РАБОЧИЙ ПРОГОН ────────────────────────────────────────────────────────── */

function run() {
  const faults = [];
  let judged = 0;

  // Пара 1 — шаги продукта против счётчиков правил.
  const product = readFileSync(join(ROOT, 'src/lib/data/funnel.ts'), 'utf8');
  const rules = readFileSync(join(ROOT, 'firestore.rules'), 'utf8');
  const steps = stepsFromProduct(product);
  const counters = countersFromRules(rules);

  // 🔑 Контроль прибора ПЕРВЫМ: пустые списки дали бы «расхождений 0» бессодержательно —
  // ровно тот зелёный, который не способен покраснеть (вопрос 3 лестницы).
  if (steps.length === 0) faults.push('НЕ НАЙДЕН список FUNNEL_STEPS в src/lib/data/funnel.ts — прибор судит пустоту');
  if (counters.length === 0) faults.push('НЕ НАЙДЕНО тело funnelCounters() в firestore.rules — прибор судит пустоту');
  faults.push(...pairFaults(steps, counters));

  // Пара 2 — имя метки в помощнике и в продукте.
  const helper = readFileSync(join(TOOLS, 'lib/probe-mark.mjs'), 'utf8');
  const helperMark = markName(helper);
  const productMark = markName(product);
  if (helperMark === null || productMark === null) {
    faults.push('НЕ НАЙДЕНА константа PROBE_MARK в помощнике или в продукте — пару сверять нечем');
  } else if (helperMark !== productMark) {
    faults.push(
      `имя метки разъехалось: помощник ставит «${helperMark}», продукт слушает «${productMark}» — ` +
        'прибор считает себя помеченным, продукт считает его человеком',
    );
  }

  /*
   * Пара 3 — приборы против метки.
   *
   * 🔴 САМ СТРАЖ ИЗ КОРПУСА ИСКЛЮЧЁН, И ЭТО НЕ ПОБЛАЖКА СЕБЕ. Его самотест держит образцы
   * приборов СТРОКАМИ — с `chromium.launch(`, адресом боя и `browser.newContext(`, — и
   * первый же живой прогон обвинил стража в шести непомеченных сессиях, которых у него нет:
   * он не запускает браузер вовсе. Это ложное срабатывание признака на живом корпусе
   * (вопрос 2 лестницы трёх вопросов, `AGENT_GUIDE`), и лечится оно замером, а не ослаблением
   * правила: единственный файл, чьи «приборы» живут внутри строк, — этот.
   * ⚠️ Исключение ИМЕННОЕ и одно. Появится второй такой файл — он объявляется здесь же,
   * с причиной; молчаливого списка исключений тут не будет.
   */
  const SELF = 'verify-probe-mark.mjs';
  for (const file of readdirSync(TOOLS).filter((name) => name.endsWith('.mjs')).sort()) {
    if (file === SELF) continue;
    const source = readFileSync(join(TOOLS, file), 'utf8');
    if (!isLiveBrowserProbe(source)) continue;
    judged += 1;
    faults.push(...judgeProbe(file, source));
  }

  if (judged === 0) {
    // Тот же контроль: ноль осмотренных приборов — это поломка признака, а не чистота дерева.
    faults.push('НЕ НАЙДЕНО НИ ОДНОГО живого браузерного прибора — признак сломан, прогон бессодержателен');
  }

  console.log(`Шаги воронки: ${steps.length} · счётчики правил: ${counters.length} · живых приборов осмотрено: ${judged}`);

  if (faults.length === 0) {
    console.log(`✅ ВОРОНКА СОГЛАСОВАНА: три пары сходятся, все ${judged} живых приборов метят свои сессии.`);
    process.exit(0);
  }
  console.log(`\n❌ НАРУШЕНИЙ: ${faults.length}`);
  for (const fault of faults) console.log(`   · ${fault}`);
  process.exit(1);
}

if (process.argv.includes('--selftest')) selftest();
else run();

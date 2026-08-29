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
 * · Корпус пары 3 держится ОБЪЯВЛЕННОЙ НИЖНЕЙ ГРАНИЦЕЙ (`CORPUS_FLOOR` ниже): усыхание корпуса —
 *   нарушение, рост — нет. Без неё прибор, потерявший членство целиком, уходил из-под суда молча.
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
/**
 * 🔴 ПОИМЁННЫЙ ОПТ-ИН — приборы, чьё членство в корпусе НЕЛЬЗЯ вывести из их текста.
 *
 * ═══ ПОЧЕМУ СПИСОК, А НЕ ПРИЗНАК «УЖЕ ЗНАЕТ МЕТКУ» ═══
 *
 * Первая редакция держала этих троих в корпусе их СОБСТВЕННОЙ меткой:
 * `drivesBrowser && (reachesLive || knowsMark)`. Это дефект, найденный судом QA, и он
 * ровно того класса, за которым охотится вопрос 1 лестницы трёх вопросов:
 *
 *   снял метку с прибора → прибор ВЫПАЛ ИЗ КОРПУСА → страж зелёный, «осмотрено 15» молча
 *   стало 14. Проверка не покраснела, потому что её ОТЦЕПИЛИ, а не сломали.
 *
 * Воспроизведено дважды перед починкой: снятие ТОЛЬКО вызова краснит (импорт держит
 * членство), снятие вызова ВМЕСТЕ с импортом — зелёный с кодом 0. То есть моя собственная
 * мутация при постройке стража НЕ СОСТОЯЛАСЬ: она била по вызову, а не по членству
 * (`EXP-0193` — тот же класс, другая одежда).
 *
 * ═══ ПОЧЕМУ ЭТО ЛЕЧИТ ═══
 *
 * Членство теперь выводится из того, чего мутация стереть НЕ МОЖЕТ: либо адрес живого
 * контура в тексте прибора, либо имя в этом списке. Метка перестала быть пропуском в корпус
 * и осталась тем, чем должна быть, — предметом суда.
 *
 * ⚠️ Список ПОИМЁННЫЙ и с причиной у каждой строки — той же формы, что исключение самого
 * стража ниже. Молчаливого списка здесь не будет: он растёт, и через месяц страж судит
 * пустоту.
 */
const LIVE_BY_NAME = new Map([
  ['smoke.mjs', 'набор SMOKE гоняется дверью выката и принимает --base — в живой контур направляется рукой'],
  ['probe-bridge.mjs', 'зонд моста лендинга: по умолчанию localhost, но --base уводит его в бой'],
  ['verify-funnel-v2.mjs', 'приёмка воронки: ходит по слоту стенда, а пишет РЕАЛЬНЫЕ счётчики'],
]);

export function isLiveBrowserProbe(source, name = '') {
  const drivesBrowser = /chromium\.launch\(/.test(source);
  const reachesLive =
    /ndimspace\.app/.test(source) ||
    /ndim-stage\.web\.app/.test(source) ||
    /lib\/contours\.mjs/.test(source);
  return drivesBrowser && (reachesLive || LIVE_BY_NAME.has(name));
}

/**
 * Прибор носит метку — но по признакам в корпус не попадает.
 *
 * Это ровно то состояние, из которого рождался дефект: пока метка на месте, всё выглядит
 * исправным; снимут — и прибор молча уйдёт из-под суда. Поэтому состояние объявляется
 * НАРУШЕНИЕМ сразу, а не ждёт мутации: лечение — одна строка в `LIVE_BY_NAME` с причиной.
 */
export function marksWithoutMembership(name, source) {
  const knowsMark = /lib\/probe-mark\.mjs/.test(source);
  return knowsMark && !isLiveBrowserProbe(source, name);
}

/**
 * 🔴 ОБЪЯВЛЕННАЯ НИЖНЯЯ ГРАНИЦА КОРПУСА — критерий 2 `bugs/209`.
 *
 * ═══ ЧЕГО НЕ ЗАКРЫВАЕТ ПОИМЁННЫЙ СПИСОК ВЫШЕ ═══
 *
 * `LIVE_BY_NAME` стережёт троих, чьё членство держится ИМЕНЕМ. Остальные двенадцать держатся
 * ЖИВЫМ АДРЕСОМ В ТЕКСТЕ — и у них своя дыра ровно того же класса. Замер на живом дереве
 * (`verify-icons.mjs`, 2026-08-29, обе пробы откатаны из git):
 *
 *   снял ТОЛЬКО метку   → ❌ красный, прибор назван  — это ловит `judgeProbe`
 *   снял метку И адрес  → ✅ ЗЕЛЁНЫЙ, «осмотрено 14» — 🔴 прибор ушёл из-под суда МОЛЧА
 *
 * То же самое даёт переименование файла и его удаление. Проверку снова ОТЦЕПИЛИ, а не сломали
 * (вопрос 1 лестницы трёх вопросов) — третья одежда одного класса после `EXP-0193` и суда QA.
 *
 * ═══ ПОЧЕМУ ГРАНИЦА, А НЕ РАВЕНСТВО «ПРИБОРОВ ДОЛЖНО БЫТЬ N» ═══
 *
 * Прежняя редакция от жёсткого N отказалась доводом «такое число устаревает первым». Довод верен
 * для РАВЕНСТВА и неверен для ГРАНИЦЫ, и вся разница — в НАПРАВЛЕНИИ устаревания:
 *
 * · равенство краснеет на КАЖДОМ честном новом приборе, и чинится правкой числа. На третий раз
 *   правка числа становится рефлексом — проверка выучивает человека себя обходить. Такая хуже
 *   отсутствующей: она сверх того числится работающей;
 * · граница на новом приборе молчит. Устаревает она только ВВЕРХ (корпус ушёл выше объявленного),
 *   и это устаревание делает её слабее — но никогда ложно красной.
 *
 * Поднять границу — отдельное осознанное действие со свежим замером, а не условие зелёного.
 * Опустить — тоже: снял прибор намеренно, скажи это здесь строкой с причиной.
 *
 * ═══ ЧИСЛО НАЗВАНО ВМЕСТЕ С КОНТУРОМ (`EXP-0226`: число без контура — слух) ═══
 *
 * Замер 2026-08-29 повторением предикатов стража поверх `git show <ref>:tools/*.mjs`:
 * `ndim_dev3` (dfcb2ba) — 15 · `main` (4f9b87b) — 15, и списки совпадают ПОИМЁННО, файл в файл.
 * Поэтому мерж порции в `main` границу красной не сделает: это проверено, а не предположено.
 */
const CORPUS_FLOOR = 15;

/**
 * Вердикт по РАЗМЕРУ корпуса.
 *
 * Два диагноза, и путать их нельзя: ноль осмотренных — сломанный признак (прогон бессодержателен
 * целиком), а не усохший корпус. Лечения у них разные, поэтому и слова разные.
 */
export function corpusFloorFaults(judged, floor = CORPUS_FLOOR) {
  if (judged === 0) {
    return ['НЕ НАЙДЕНО НИ ОДНОГО живого браузерного прибора — признак сломан, прогон бессодержателен'];
  }
  if (judged < floor) {
    return [
      `КОРПУС УСОХ: живых приборов ${judged}, объявленная нижняя граница ${floor} — ` +
        `из-под суда молча ушло приборов: ${floor - judged}. Причина одна из трёх: файл удалён, ` +
        'переименован либо потерял И живой адрес, И метку. Лечение: вернуть прибор в корпус — ' +
        'а если он снят намеренно, опустить CORPUS_FLOOR отдельной правкой с причиной',
    ];
  }
  return [];
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
  if (!isLiveBrowserProbe(source, name)) return [];
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
  /*
   * ── СЛУЧАИ САМОГО ДЕФЕКТА (найден судом QA 2026-08-28) ────────────────────────────
   * Прежняя редакция держала приборы без живого адреса в корпусе их СОБСТВЕННОЙ меткой,
   * и полный отцеп (вызов + импорт) ронял прибор ИЗ КОРПУСА, а не в красное. Эти три
   * случая существуют, чтобы дефект не вернулся молча.
   */
  {
    name: '🔴 ДЕФЕКТ СУДА: поимённый прибор БЕЗ живого адреса и БЕЗ метки вовсе — красный, а не выпавший',
    run: () =>
      judgeProbe('smoke.mjs', `import { chromium } from 'playwright';\nconst BASE='http://localhost:4173';\nawait chromium.launch();\nconst context = await browser.newContext();\n`).length === 1,
  },
  {
    name: '🔴 членство даёт ИМЯ, а не метка: тот же текст под ЧУЖИМ именем в корпус не попадает',
    run: () =>
      judgeProbe('probe-neizvestnyj.mjs', `import { chromium } from 'playwright';\nconst BASE='http://localhost:4173';\nawait chromium.launch();\nconst context = await browser.newContext();\n`).length === 0,
  },
  {
    name: '🔑 носит метку, но в корпусе не числится — само по себе нарушение',
    run: () =>
      marksWithoutMembership('probe-neizvestnyj.mjs', `import { markProbeContext } from './lib/probe-mark.mjs';\nconst BASE='http://localhost:4173';\nawait chromium.launch();\nconst c = await browser.newContext();\nawait markProbeContext(c);\n`) === true,
  },
  {
    name: 'КОНТРОЛЬ: поимённый прибор с меткой нарушением НЕ является',
    run: () =>
      marksWithoutMembership('smoke.mjs', `import { markProbeContext } from './lib/probe-mark.mjs';\nconst BASE='http://localhost:4173';\nawait chromium.launch();\nconst c = await browser.newContext();\nawait markProbeContext(c);\n`) === false,
  },
  {
    name: 'КОНТРОЛЬ: живой адрес БЕЗ браузера не судится — продукт не исполняется',
    run: () =>
      judgeProbe('fetcher.mjs', `const BASE='https://ndimspace.app';\nconst res = await fetch(BASE);\n`).length === 0,
  },
  /*
   * ── НИЖНЯЯ ГРАНИЦА КОРПУСА (критерий 2 `bugs/209`) ────────────────────────────────
   * Граница обязана краснеть на усыхании и МОЛЧАТЬ на росте. Проверяется и то, и другое:
   * односторонняя проба доказала бы половину, а вредны обе стороны — каждая по-своему.
   */
  {
    name: '🔴 КРИТЕРИЙ 2: корпус ниже объявленной границы — красный',
    run: () => {
      const faults = corpusFloorFaults(14, 15);
      return faults.length === 1 && /КОРПУС УСОХ/.test(faults[0]);
    },
  },
  {
    name: 'КОНТРОЛЬ: корпус ровно на границе — чисто',
    run: () => corpusFloorFaults(15, 15).length === 0,
  },
  {
    name: 'КОНТРОЛЬ: корпус ВЫШЕ границы — чисто (новый прибор правки стража не требует)',
    run: () => corpusFloorFaults(16, 15).length === 0,
  },
  {
    name: 'КОНТРОЛЬ: ноль осмотренных — свой диагноз «признак сломан», а не «усох»',
    run: () => {
      const faults = corpusFloorFaults(0, 15);
      return faults.length === 1 && /признак сломан/.test(faults[0]) && !/УСОХ/.test(faults[0]);
    },
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
  const files = readdirSync(TOOLS).filter((name) => name.endsWith('.mjs')).sort();
  const seenByName = new Set();

  for (const file of files) {
    if (file === SELF) continue;
    const source = readFileSync(join(TOOLS, file), 'utf8');

    // Носит метку, а в корпус не попадает — состояние, из которого рождался дефект суда.
    if (marksWithoutMembership(file, source)) {
      faults.push(
        `${file}: носит метку, но в корпусе НЕ ЧИСЛИТСЯ — снятие метки прошло бы молча. ` +
          'Лечение: строка в LIVE_BY_NAME с причиной',
      );
    }

    if (!isLiveBrowserProbe(source, file)) continue;
    if (LIVE_BY_NAME.has(file)) seenByName.add(file);
    judged += 1;
    faults.push(...judgeProbe(file, source));
  }

  /*
   * 🔑 ПОИМЁННЫЙ СПИСОК — ЭТО И ЕСТЬ ПОЛ КОРПУСА, и он обязан сойтись.
   * Прибор, переименованный или удалённый, унёс бы с собой и суд над собой: корпус тихо
   * сократился бы, а страж остался зелёным. Число в списке проверяет себя само — жёсткого
   * «приборов должно быть N» здесь нет намеренно, такое число устаревает первым.
   */
  for (const [name, why] of LIVE_BY_NAME) {
    if (!seenByName.has(name)) {
      faults.push(`${name}: назван в LIVE_BY_NAME, но в tools/ не найден или браузер не запускает (${why})`);
    }
  }

  // Размер корпуса против объявленной границы: усыхание — нарушение, рост — нет (`bugs/209`, критерий 2).
  faults.push(...corpusFloorFaults(judged));

  // 🔑 Границу печатаем РЯДОМ с числом: без неё «осмотрено 14» читалось как норма — не с чем сравнить.
  console.log(
    `Шаги воронки: ${steps.length} · счётчики правил: ${counters.length} · ` +
      `живых приборов осмотрено: ${judged} (объявленная нижняя граница ${CORPUS_FLOOR})`,
  );

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

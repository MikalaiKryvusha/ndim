/**
 * СТРАЖ ВОРОНКИ V2 — четыре пары, каждая из которых разъезжается МОЛЧА (`plans/74` фаза 1 Ш5;
 * четвёртая — `plans/78` Ш4, добавлена 2026-08-29 Интегратором).
 *
 * ═══ ПОЧЕМУ ЭТОТ СТРАЖ ВООБЩЕ НУЖЕН ═══
 *
 * У воронки нет ни одного громкого отказа. `track()` глотает ошибку в `catch` намеренно —
 * аналитика не имеет права ломать продукт (`EXP-0028`). Цена этого решения в том, что КАЖДАЯ
 * поломка воронки бесшумна: шаг не записался, экран показал ноль, а ноль неотличим от честного
 * «в этот день никто не приходил». Читающий не узнает ничего, и узнает он это не сразу, а через
 * недели — когда ряд уже потерян, потому что задним числом его не восстановить.
 *
 * Поэтому здесь стерегутся ровно те четыре пары, чей разъезд даёт ТИХИЙ НОЛЬ:
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
 *   4. 🆕 **белый список событий ↔ настоящие места вызова** (`ANALYTICS_EVENTS` в
 *      `src/lib/data/analytics.ts` против `capture('имя')` и `track('имя')` в продукте).
 *      Разъезд тише всех трёх предыдущих, потому что тих С ОБЕИХ СТОРОН, и `capture()` глотает
 *      по контракту: имя, выброшенное из экрана правкой вёрстки, оставит список ОБЕЩАЮЩИМ
 *      событие при вечном нуле ряда; имя, дописанное в список и никем не позванное, даст ровно
 *      тот же ноль. Ни один из двух не закричит сам.
 *      🔑 Пара сверяет ИМЯ события со списком и НИКОГДА место вызова с экраном: события
 *      `rating_saved` и `profile_filled` стоят в СЛОЕ ДАННЫХ намеренно (в `saveRating`
 *      приходят обе дороги — лента «Измерения» и дверь карточки каталога), и проверка,
 *      привязанная к экрану, дала бы ложный красный на первой же правке вёрстки.
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
 * · Пара 4 видит только ЛИТЕРАЛЬНОЕ имя в вызове. Имя, собранное переменной, ей не по зубам —
 *   и это не пробел, а устройство: единственная такая пересылка в проекте (`capture(step)`
 *   внутри `track()`) проверяется отдельным, ТРЕТЬИМ условием пары, потому что её исчезновение
 *   не убирает ни одного литерала и потому невидимо для обеих сторон сверки.
 * · Пара 4 доказывает, что вызов СТОИТ В КОДЕ, и не доказывает, что событие ДОЕХАЛО до
 *   PostHog. Живой приём — работа выката (`ingested_event`), и она честно помечена
 *   невыполненной в `plans/78`, а не засчитана этим зелёным.
 *
 * Запуск: `node tools/verify-probe-mark.mjs` · самотест: `--selftest`
 * Ворота: `npm run guards` (страж дешёвый — ни стенда, ни сети, ни сборки).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const TOOLS = join(ROOT, 'tools');
const SRC = join(ROOT, 'src');

/**
 * Корпус пары 4 — файлы продукта, в которых МОЖЕТ стоять место вызова.
 *
 * Два файла исключены ИМЕННО и с причиной, молчаливого списка тут не будет:
 *   · `analytics.ts` — дом самой `capture()`. Её объявление и разбор в шапке местом вызова
 *     не являются;
 *   · `funnel.ts` — ТРАНСПОРТ, а не место вызова: он пересылает шаг переменной
 *     (`capture(step)`), и эта пересылка проверяется отдельным, третьим условием пары.
 * Тесты исключены как класс: они зовут события заведомо негодными именами — это их работа.
 */
function srcFilesWithCalls(dir = SRC) {
  const ИСКЛЮЧЕНЫ = new Set(['analytics.ts', 'funnel.ts']);
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...srcFilesWithCalls(full));
      continue;
    }
    if (!/\.(ts|svelte)$/.test(entry.name)) continue;
    if (entry.name.endsWith('.test.ts')) continue;
    if (ИСКЛЮЧЕНЫ.has(entry.name)) continue;
    out.push(full);
  }
  return out;
}

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
 * То же самое даёт исчезновение файла из корпуса: удаление, уход из плоского `tools/` (вынос
 * наружу или перенос в подкаталог) и переименование СО СМЕНОЙ РАСШИРЕНИЯ. Проверку снова
 * ОТЦЕПИЛИ, а не сломали (вопрос 1 лестницы трёх вопросов) — третья одежда одного класса после
 * `EXP-0193` и суда QA.
 *
 * ⚠️ А вот обычное переименование НА МЕСТЕ (то же расширение, тот же каталог) границу НЕ
 * трогает — и это правильно, а не дыра: членство адресного прибора держится его СОДЕРЖАНИЕМ,
 * а не именем, и переименованный файл остаётся в корпусе под новым именем. Первая редакция
 * этой шапки говорила просто «переименование», то есть шире факта; поправлено по замечанию
 * вердикта №15 (замер QA повторён мной: на месте — зелёное, три прочие формы — красные).
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
        `из-под суда молча ушло приборов: ${floor - judged}. Причина: файл удалён, ушёл из ` +
        'плоского tools/ (вынесен наружу или перенесён в подкаталог), переименован со сменой ' +
        'расширения, либо потерял И живой адрес, И метку. Лечение: вернуть прибор в корпус — ' +
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

/* ── ПАРА 4 — БЕЛЫЙ СПИСОК СОБЫТИЙ ↔ НАСТОЯЩИЕ МЕСТА ВЫЗОВА ──────────────────────
 *
 * Разбор — почему пара нужна и почему её разъезд тише остальных — в шапке файла.
 */

/**
 * Снимает комментарии ПЕРЕД поиском мест вызова.
 *
 * 🔴 БЕЗ ЭТОГО ПРИЗНАК ЛОЖЕН, и это не гипотеза — замер на живом дереве: в шапке
 * `src/lib/door/engine.ts:46` разбирается прежняя редакция словами «*Первая редакция звала
 * `track('door_click')` ПЕРВОЙ строкой*». Упоминание в РАЗБОРЕ читалось бы как место вызова,
 * и удалённый настоящий вызов остался бы прикрытым собственным некрологом.
 *
 * ⚠️ Граница названа: это снятие комментариев, а не разбор языка. Строковый литерал, внутри
 * которого лежит `/*`, обманет его — такой строки в дереве нет, а появится, поймает её чтение
 * диффа, не этот прибор. Зато `//` внутри `https://` НЕ съедает строку: перед ним стоит `:`,
 * которого нет в наборе предшественников (случай в самотесте).
 *
 * @param {string} source
 * @returns {string}
 */
export function stripComments(source) {
  const noBlocks = source.replace(/\/\*[\s\S]*?\*\//g, ' ');
  return noBlocks
    .split('\n')
    .map((line) => line.replace(/(^|[\s;{(])\/\/.*$/, '$1'))
    .join('\n');
}

/**
 * Собственные события белого списка — те, что объявлены ЛИТЕРАЛАМИ в `ANALYTICS_EVENTS`.
 * Шесть шагов воронки приезжают туда спредом `...FUNNEL_STEPS` и разбираются отдельно
 * (`stepsFromProduct`): у них другой транспорт и другое место вызова.
 */
export function ownEventsFromWhitelist(source) {
  const block = source.match(/ANALYTICS_EVENTS\s*=\s*\[([\s\S]*?)\]/);
  if (block === null) return [];
  return [...block[1].matchAll(/'([a-z0-9_]+)'/g)].map((hit) => hit[1]);
}

/**
 * Места вызова: имя-литерал, поданное в `capture()` или `track()`.
 * @returns {{fn: string, name: string, where: string}[]}
 */
export function callSites(source, where = '') {
  return [...stripComments(source).matchAll(/\b(capture|track)\(\s*'([a-z0-9_]+)'/g)].map((hit) => ({
    fn: hit[1],
    name: hit[2],
    where,
  }));
}

/**
 * Доезжает ли шаг воронки до ВТОРОГО прибора. `track()` пересылает шаг в `capture()`
 * ПЕРЕМЕННОЙ (`capture(step)`), поэтому литеральных мест вызова у шести шагов нет вовсе —
 * и без этой проверки их отсутствие читалось бы как норма.
 */
export function forwardsStepsToAnalytics(funnelSource) {
  return /capture\(\s*step\s*\)/.test(stripComments(funnelSource));
}

/**
 * Пара 4, обе стороны. Контроли прибора живут ЗДЕСЬ, а не в `run()`, намеренно: в чистой
 * функции их достаёт самотест, и «судит пустоту» становится доказанным случаем, а не
 * строкой, написанной из добрых побуждений.
 *
 * @param {string[]} ownEvents события белого списка, объявленные литералами
 * @param {string[]} steps шаги воронки
 * @param {{fn: string, name: string, where: string}[]} sites найденные места вызова
 * @param {boolean} forwards есть ли переброска `capture(step)` внутри `track()`
 */
export function eventCallSiteFaults(ownEvents, steps, sites, forwards) {
  const faults = [];

  if (ownEvents.length === 0) {
    faults.push('НЕ НАЙДЕН белый список ANALYTICS_EVENTS в src/lib/data/analytics.ts — прибор судит пустоту');
    return faults;
  }
  if (sites.length === 0) {
    faults.push(
      'НИ ОДНОГО литерального места вызова capture()/track() в src/ — это диагноз ПРИЗНАКУ, ' +
        'а не продукту: пустой корпус даёт «расхождений 0» бессодержательно',
    );
    return faults;
  }

  const declared = new Set([...ownEvents, ...steps]);

  for (const event of ownEvents) {
    if (!sites.some((site) => site.fn === 'capture' && site.name === event)) {
      faults.push(
        `событие «${event}» объявлено белым списком и НЕ ЗОВЁТСЯ ни из одного места продукта — ` +
          'ряд будет вечным нулём, а ноль неотличим от честного «никто этого не делал»',
      );
    }
  }
  for (const step of steps) {
    if (!sites.some((site) => site.fn === 'track' && site.name === step)) {
      faults.push(`шаг «${step}» объявлен воронкой и НЕ ЗОВЁТСЯ ни из одного места продукта — тот же тихий ноль`);
    }
  }
  for (const site of sites) {
    if (!declared.has(site.name)) {
      faults.push(
        `«${site.name}» зовётся в ${site.where} и НЕ ОБЪЯВЛЕН — белый список отбросит его молча, ` +
          'вызов будет выглядеть работающим',
      );
    }
  }
  if (!forwards) {
    faults.push(
      'переброска шага во второй прибор (capture(step) внутри track()) НЕ НАЙДЕНА — ' +
        'шаги воронки перестанут доезжать до PostHog ЦЕЛИКОМ, и ни один литерал этого не покажет',
    );
  }
  return faults;
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
  /*
   * ── ПАРА 4: БЕЛЫЙ СПИСОК ↔ МЕСТА ВЫЗОВА ──────────────────────────────────────────
   * Обе стороны обязательны. Прибор, видящий только исчезнувший вызов, слеп ровно наполовину:
   * имя, дописанное в список и никем не позванное, даёт тот же вечный ноль.
   * Ниже: сначала оба разъезда, потом третье условие (пересылка), потом контроли признака —
   * включая тот, на котором признак был бы ЛОЖЕН без снятия комментариев.
   */
  {
    name: '🔴 ПАРА 4, сторона 1: событие объявлено и НЕ зовётся — красный',
    run: () => {
      const faults = eventCallSiteFaults(['rating_saved'], [], [{ fn: 'capture', name: 'profile_filled', where: 'a.ts' }], true);
      return faults.length === 2 && /rating_saved.*НЕ ЗОВЁТСЯ/.test(faults[0]);
    },
  },
  {
    name: '🔴 ПАРА 4, сторона 2: имя зовётся и НЕ объявлено — красный, с названным местом',
    run: () => {
      const faults = eventCallSiteFaults(['rating_saved'], [], [
        { fn: 'capture', name: 'rating_saved', where: 'a.ts' },
        { fn: 'capture', name: 'vydumannoe', where: 'src/routes/x/+page.svelte' },
      ], true);
      return faults.length === 1 && /vydumannoe.*src\/routes\/x/.test(faults[0]);
    },
  },
  {
    name: '🔴 ПАРА 4: шаг воронки объявлен и не зовётся — красный (у шага транспорт свой)',
    run: () =>
      eventCallSiteFaults(['rating_saved'], ['landing_view'], [{ fn: 'capture', name: 'rating_saved', where: 'a.ts' }], true)
        .length === 1,
  },
  {
    name: '🔴 ПАРА 4: пересылка capture(step) снята — красный, хотя ни один литерал не исчез',
    run: () => {
      const sites = [
        { fn: 'capture', name: 'rating_saved', where: 'a.ts' },
        { fn: 'track', name: 'landing_view', where: 'b.svelte' },
      ];
      const faults = eventCallSiteFaults(['rating_saved'], ['landing_view'], sites, false);
      return faults.length === 1 && /пересылка|пересылк|переброска/.test(faults[0]);
    },
  },
  {
    name: 'КОНТРОЛЬ: список и вызовы сошлись — чисто',
    run: () =>
      eventCallSiteFaults(['rating_saved'], ['landing_view'], [
        { fn: 'capture', name: 'rating_saved', where: 'a.ts' },
        { fn: 'track', name: 'landing_view', where: 'b.svelte' },
      ], true).length === 0,
  },
  {
    name: 'КОНТРОЛЬ признака: пустой белый список — свой диагноз «судит пустоту», а не «не зовётся»',
    run: () => {
      const faults = eventCallSiteFaults([], ['landing_view'], [], true);
      return faults.length === 1 && /судит пустоту/.test(faults[0]);
    },
  },
  {
    name: 'КОНТРОЛЬ признака: ноль мест вызова — диагноз ПРИЗНАКУ, а не продукту',
    run: () => {
      const faults = eventCallSiteFaults(['rating_saved'], [], [], true);
      return faults.length === 1 && /диагноз ПРИЗНАКУ/.test(faults[0]);
    },
  },
  {
    name: '🔑 УПОМИНАНИЕ В КОММЕНТАРИИ местом вызова НЕ считается — иначе некролог прикрыл бы удалённый вызов',
    run: () => {
      const source = "/**\n * Первая редакция звала track('door_click') первой строкой.\n */\nexport function f() {}\n";
      return callSites(source, 'x.ts').length === 0;
    },
  },
  {
    name: '🔑 КОНТРОЛЬ обратной стороны: тот же вызов ВНЕ комментария признак видит',
    run: () => callSites("export function f() {\n  void track('door_click');\n}\n", 'x.ts').length === 1,
  },
  {
    name: '🔑 `//` внутри https:// НЕ съедает настоящий вызов на той же строке',
    run: () => {
      const source = "const u = 'https://ndimspace.app'; void capture('rating_saved');\n";
      return callSites(source, 'x.ts').length === 1;
    },
  },
  {
    name: 'КОНТРОЛЬ: строчный комментарий после кода снимает ТОЛЬКО хвост',
    run: () => {
      const source = "void track('landing_view'); // раньше здесь звали capture('vydumannoe')\n";
      const sites = callSites(source, 'x.ts');
      return sites.length === 1 && sites[0].name === 'landing_view';
    },
  },
  {
    name: 'разбор белого списка: литералы берутся, спред ...FUNNEL_STEPS — нет',
    run: () => {
      const own = ownEventsFromWhitelist("export const ANALYTICS_EVENTS = [\n  ...FUNNEL_STEPS,\n  'rating_saved',\n  'person_opened',\n] as const;");
      return own.length === 2 && own[0] === 'rating_saved' && own[1] === 'person_opened';
    },
  },
  {
    name: 'разбор пересылки: переменная — да, литерал соседнего вызова — не в счёт',
    run: () =>
      forwardsStepsToAnalytics('.then(({ capture }) => capture(step))') === true &&
      forwardsStepsToAnalytics(".then(({ capture }) => capture('landing_view'))") === false,
  },
  {
    /*
     * 🔴 СЛУЧАЙ НАЙДЕН СОБСТВЕННОЙ МУТАЦИЕЙ, а не придуман. Первая редакция признака брала
     * `'([a-z_]+)'` — и живая мутация `capture('profile_filled')` → `capture('profile_filled_v2')`
     * дала ОДНО нарушение вместо двух: имя с цифрой признак не видел вовсе, поэтому сторона
     * «зовётся и не объявлено» промолчала ровно там, где обязана была кричать. То есть половина
     * пары была слепа на целом классе имён, и обнаружилось это только потому, что мутация
     * ставилась на живом дереве, а не на синтетике.
     */
    name: '🔴 имя с цифрой признак ВИДИТ — иначе половина пары слепа (найдено живой мутацией)',
    run: () => {
      const sites = callSites("void capture('profile_filled_v2');\n", 'x.ts');
      return sites.length === 1 && sites[0].name === 'profile_filled_v2';
    },
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

  /*
   * Пара 4 — белый список событий против настоящих мест вызова.
   *
   * Транспорта два, и путать их нельзя: собственные события зовутся `capture('имя')` прямо из
   * продукта, шаги воронки — `track('имя')`, а до второго прибора едут ПЕРЕМЕННОЙ внутри
   * `track()`. Поэтому у шагов литеральных `capture()` нет по построению, и проверять их
   * доезд надо третьим условием, а не отсутствием строки.
   */
  const analytics = readFileSync(join(ROOT, 'src/lib/data/analytics.ts'), 'utf8');
  const ownEvents = ownEventsFromWhitelist(analytics);
  const sites = [];
  for (const file of srcFilesWithCalls()) {
    sites.push(...callSites(readFileSync(file, 'utf8'), relative(ROOT, file).replace(/\\/g, '/')));
  }
  faults.push(...eventCallSiteFaults(ownEvents, steps, sites, forwardsStepsToAnalytics(product)));

  // 🔑 Границу и ОХВАТ печатаем РЯДОМ с числами: без них «осмотрено 14» и «мест вызова 12»
  // читаются как норма — не с чем сравнить (`EXP-0226`: число без охвата говорит о другом).
  console.log(
    `Шаги воронки: ${steps.length} · счётчики правил: ${counters.length} · ` +
      `события белого списка: ${ownEvents.length} собственных + ${steps.length} шагов · ` +
      `мест вызова найдено: ${sites.length} (охват: src/**/*.{ts,svelte}, кроме тестов, ` +
      `analytics.ts и funnel.ts) · ` +
      `живых приборов осмотрено: ${judged} (объявленная нижняя граница ${CORPUS_FLOOR})`,
  );

  if (faults.length === 0) {
    console.log(`✅ ВОРОНКА СОГЛАСОВАНА: четыре пары сходятся, все ${judged} живых приборов метят свои сессии.`);
    process.exit(0);
  }
  console.log(`\n❌ НАРУШЕНИЙ: ${faults.length}`);
  for (const fault of faults) console.log(`   · ${fault}`);
  process.exit(1);
}

/**
 * 🔴 ПРЕДОХРАНИТЕЛЬ «ЗАПУЩЕН ИЛИ ПОДКЛЮЧЁН» (`ideas/43`; страж класса — `verify-import-safety.mjs`).
 * Без него импорт этого файла ради чистых функций (их здесь девять экспортов, и они просятся в
 * чужие проверки) запускал обход дерева и звал `process.exit`, убивая чужой процесс.
 */
const ЗАПУЩЕН_НАПРЯМУЮ = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

function выполнить() {
  if (process.argv.includes('--selftest')) selftest();
  else run();
}

if (ЗАПУЩЕН_НАПРЯМУЮ) выполнить();

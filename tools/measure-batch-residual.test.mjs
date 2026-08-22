/**
 * ТЕСТ ПРИБОРА ПРИЁМКИ К1 — и того, что его самотест ВООБЩЕ КОГО-ТО ЗОВЁТ.
 *
 * 🔴 ПОВОД, названный прямо. `tools/measure-batch-residual.mjs` несёт собственный `--selftest`,
 * но `npm run test:tools` берёт только `tools/*.test.mjs` — то есть самотест нового прибора не
 * позвал бы НИКТО. Это класс «страж вне ворот» (`EXP-0194`) и первый вопрос лестницы трёх
 * вопросов: «проверка ВООБЩЕ исполнилась?». Прибор приёмки, чей самотест не в воротах, — это
 * зелёный, которого никто не проверял. Поэтому файл существует: он ставит самотест В ВОРОТА.
 *
 * 🔴🔴 ПРИБОР НЕ ПОДКЛЮЧАЕТСЯ В ЭТОТ ПРОЦЕСС — НИ СТРОКОЙ, НИ ЛЕНИВО. Правило и его довод взяты
 * у соседа (`check-candidate-descriptions.test.mjs`), где выведены двумя мутациями: при снятом
 * предохранителе любой импорт запускает рабочий режим, тот зовёт `process.exit`, и `node --test`
 * печатает «pass 0 · fail 1» на весь файл. Такой вердикт НЕАДРЕСЕН и читается как «тесты не
 * запускались». Весь разговор с прибором идёт через ДОЧЕРНИЙ процесс.
 *
 * Прогон: node --test tools/measure-batch-residual.test.mjs   (или `npm run test:tools`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ЗДЕСЬ = dirname(fileURLToPath(import.meta.url));
const ПРИБОР = join(ЗДЕСЬ, 'measure-batch-residual.mjs');
const МОДУЛЬ = pathToFileURL(ПРИБОР).href;
const КОРЕНЬ = dirname(ЗДЕСЬ);

/** Прямой запуск прибора. Возвращает вывод и код — падение здесь не исключение, а результат. */
function запустить(аргументы) {
  try {
    return {
      вывод: execFileSync(process.execPath, [ПРИБОР, ...аргументы], {
        cwd: КОРЕНЬ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      }),
      код: 0,
    };
  } catch (e) {
    return { вывод: `${e.stdout ?? ''}${e.stderr ?? ''}`, код: e.status };
  }
}

/**
 * Дочерний процесс ПОДКЛЮЧАЕТ прибор и печатает величины строкой `RESULT <json>`.
 *
 * ⚠️ Тело импортёра едет ВРЕМЕННЫМ ФАЙЛОМ, а не через `node -e`: при `-e` сам node разбирает
 * хвост командной строки как свои опции и падает на «bad option: --selftest», то есть проверка
 * мерила бы node, а не нас. Довод замерен соседом, здесь он переиспользован, а не переоткрыт.
 */
function подключитьВДочернем(лишниеАргументы = []) {
  const метка = `${process.pid}-${лишниеАргументы.join('_') || 'bare'}`.replace(/[^\w.-]/gu, '');
  const импортёр = join(tmpdir(), `ndim-residual-probe-${метка}.mjs`);
  const тело = [
    'const m = await import(process.env.NDIM_MODULE);',
    'const статья = m.__nothing ?? null;',
    "const слова = 'the story is set in san tiburon the world s most dangerous maximum security prison designed to incarcerate supervillains'.split(' ');",
    'const целиком = m.приговор("x", "A clean opening sentence. The story is set in San Tiburon, the world\\u0027s most dangerous maximum-security prison designed to incarcerate supervillains.", слова);',
    'const чисто = m.приговор("x", "The action unfolds inside a jail for unusual people.", слова);',
    'const один = m.собрать("aaa bbb ccc", { find: "bbb", replace: "zzz" });',
    'const дважды = m.собрать("aaa bbb aaa", { find: "aaa", replace: "zzz" });',
    'const разнойДлины = m.собрать("aaa bbb", { find: ["aaa", "bbb"], replace: ["zzz"] });',
    'const подряд = m.собрать("aaa bbb ccc", { find: ["aaa", "ccc"], replace: ["1", "2"] });',
    'const out = {',
    '  целикомКопия: целиком.копия, целикомРяд: целиком.после,',
    '  чистоКопия: чисто.копия,',
    '  одинAfter: один.after, одинБеда: один.беда,',
    '  дваждыAfter: дважды.after, дваждыБеда: дважды.беда,',
    '  разнойДлиныБеда: разнойДлины.беда,',
    '  подрядAfter: подряд.after,',
    '};',
    'console.log("RESULT " + JSON.stringify(out));',
  ].join('\n');
  writeFileSync(импортёр, тело, 'utf8');
  try {
    const вывод = execFileSync(process.execPath, [импортёр, ...лишниеАргументы], {
      cwd: КОРЕНЬ, encoding: 'utf8', env: { ...process.env, NDIM_MODULE: МОДУЛЬ },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return вывод;
  } finally {
    rmSync(импортёр, { force: true });
  }
}

const разобрать = (вывод) => JSON.parse(вывод.slice(вывод.indexOf('RESULT ') + 7).split('\n')[0]);

test('самотест прибора приёмки исполняется и проходит — ради этого файл и существует', () => {
  const { вывод, код } = запустить(['--selftest']);
  assert.equal(код, 0, `самотест обязан выходить нулём, вышел ${код}: ${вывод}`);
  assert.match(вывод, /самотест пройден: \d+ случаев/u);
  assert.doesNotMatch(вывод, /❌/u);
});

test('подключение НЕ запускает рабочий режим — даже когда чужой argv несёт файл правок', () => {
  const вывод = подключитьВДочернем(['tools/en-rewrites-fanout-batch-01.json']);
  assert.match(вывод, /RESULT /u, 'импортёр обязан дожить до печати результата');
  assert.doesNotMatch(вывод, /ОСТАТОЧНЫЙ РЯД/u, 'рабочий режим не должен запускаться при импорте');
});

test('подключение НЕ запускает и самотест — чужой --selftest в argv нас не касается', () => {
  const вывод = подключитьВДочернем(['--selftest']);
  assert.match(вывод, /RESULT /u);
  assert.doesNotMatch(вывод, /самотест/u, 'чужой --selftest не должен гонять НАШ самотест');
});

test('🔴 ряд считается по ВСЕЙ записи: чистый зачин не извиняет уцелевшее заимствование', () => {
  const r = разобрать(подключитьВДочернем());
  assert.equal(r.целикомКопия, true, 'запись с уцелевшим рядом обязана считаться копией');
  assert.ok(r.целикомРяд >= 10, `ряд обязан дотянуть до порога, получено ${r.целикомРяд}`);
});

test('правка, снявшая заимствование, копией не считается — пара к случаю выше', () => {
  const r = разобрать(подключитьВДочернем());
  assert.equal(r.чистоКопия, false);
});

test('фрагмент, найденный дважды, ОТКАЗ, а не догадка — правка неоднозначна', () => {
  const r = разобрать(подключитьВДочернем());
  assert.equal(r.одинAfter, 'aaa zzz ccc', 'однозначный фрагмент обязан примениться');
  assert.equal(r.одинБеда, null);
  assert.equal(r.дваждыAfter, null, 'неоднозначный фрагмент не должен применяться');
  assert.match(r.дваждыБеда, /найден 2 раз/u);
});

test('find и replace разной длины — отказ, а не тихая потеря фрагмента', () => {
  const r = разобрать(подключитьВДочернем());
  assert.match(r.разнойДлиныБеда, /разной длины/u);
});

test('несколько фрагментов применяются ПОДРЯД к одному результату, а не к исходнику', () => {
  const r = разобрать(подключитьВДочернем());
  assert.equal(r.подрядAfter, '1 bbb 2', 'второй фрагмент обязан лечь поверх результата первого');
});

test('без файла правок прибор отказывается работать, а не молчит', () => {
  const { вывод, код } = запустить([]);
  assert.notEqual(код, 0, 'отсутствие входа обязано быть красным');
  assert.match(вывод, /нужен файл правок/u);
});

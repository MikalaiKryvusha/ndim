#!/usr/bin/env node
/**
 * ПРИБОР ЗАМЕРА — литералы адреса стенда в приборах (`bugs/NEW_pribor_pishet_v_chuzhoy_stend`). НЕ страж.
 *
 * Класс, который он меряет: прибор с литеральным адресом стенда (`localhost:5173`,
 * `127.0.0.1:8181` и т. п.) при живом парке из трёх слотов (`plans/69`) работает с ЧУЖИМ
 * стендом, если запущен ролью из её рабочего места. Два подтверждённых экземпляра заводили и
 * **удаляли** там гостей. Замок доски от этого не защищает: он делит МЕСТО (ёмкость машины),
 * а не АДРЕС (порты роли).
 *
 * 🔴 ПОЧЕМУ ЭТО ПРИБОР, А НЕ СТРАЖ, И ЭТО НЕ ЛЕНЬ. Признак «есть литерал» даёт **90 файлов из
 * 251** — страж, покрасневший на девяноста, будет обойдён, а не исполнен: «признак без
 * объявленного корпуса не просто слабее, он ВРЕДЕН». Прибор печатает РАЗЛОЖЕНИЕ по корпусам и
 * оставляет суждение человеку; стражем он станет после того, как корпус пишущих будет прочитан
 * поимённо (критерии приёмки — `bugs/NEW_pribor_pishet_v_chuzhoy_stend`).
 *
 * ⚠️ ГРАНИЦЫ, НАЗВАННЫЕ ЧЕСТНО:
 *   · комментарии и блочные разборы исключаются — литерал внутри объяснения дефекта дефектом
 *     не является, иначе прибор покраснел бы на документе, который сам класс и описывает;
 *   · «пишет» — ЭВРИСТИКА по именам методов Admin SDK, а не свойство. Среди пишущих есть
 *     приборы, чья запись идёт в файл или в каталог мастерской, а не в стенд. Список — это
 *     кандидаты к прочтению, а не обвинение;
 *   · адрес, собранный из переменной или пришедший флагом `--base`, прибор НЕ видит по
 *     построению.
 *
 * Запуск: node tools/measure-stand-address-literals.mjs [--list]
 *   --list   напечатать поимённо все три корпуса, а не только пишущих
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Литерал адреса стенда: порты слота 0 — приложение, preview и три эмулятора. */
const ADDRESS = /(localhost|127\.0\.0\.1):(5173|4173|8181|9099|9199)/;

/** Эвристика «прибор пишет»: разрушающие и записывающие вызовы Admin SDK и Auth. */
const WRITES = /\b(deleteUser|recursiveDelete|createUser|bulkWrite)\b|\.set\(|\.delete\(\)|\.update\(/;

/** Прибор считается вылеченным, когда берёт адрес у модуля слотов. */
const CURED = /stand-slot\.mjs/;

const LIST = process.argv.includes('--list');
const DIR = 'tools';

/**
 * Исходник без комментариев. Блочные `/* … *\/` и строчные `//`, а также строки-продолжения
 * блока (`*` в начале) — это ПРОЗА, и литерал в ней описывает дефект, а не совершает его.
 */
function codeOnly(raw) {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs'));
const writers = [];
const readers = [];
const partly = [];

for (const file of files) {
  const raw = readFileSync(join(DIR, file), 'utf8');
  const code = codeOnly(raw);
  if (!ADDRESS.test(code)) continue;
  if (CURED.test(raw)) partly.push(file);
  else if (WRITES.test(code)) writers.push(file);
  else readers.push(file);
}

const total = files.length;
const carrying = writers.length + readers.length + partly.length;

console.log('═══ ЛИТЕРАЛЫ АДРЕСА СТЕНДА В ПРИБОРАХ (bugs/NEW_pribor_pishet_v_chuzhoy_stend) ═══\n');
console.log(`  всего .mjs в ${DIR}/                          : ${total}`);
console.log(`  несут литерал адреса В КОДЕ                  : ${carrying}`);
console.log(`  · ПИШУТ и адрес не выведен из слота          : ${writers.length}  ← корпус к прочтению`);
console.log(`  · только читают                              : ${readers.length}`);
console.log(`  · берут адрес из слота, но литерал ещё несут : ${partly.length}`);

console.log('\n── Пишущие (кандидаты, а не обвинение) ──');
for (const f of writers) console.log(`  · ${f}`);

if (LIST) {
  console.log('\n── Только читающие ──');
  for (const f of readers) console.log(`  · ${f}`);
  console.log('\n── Частично вылеченные ──');
  for (const f of partly) console.log(`  · ${f}`);
}

console.log(
  `\n⚠️ «Пишет» — эвристика по именам методов. Прежде чем звать это дефектом, прочитай файл:` +
    ` запись может идти не в стенд. Разбор и критерии приёмки — bugs/NEW_pribor_pishet_v_chuzhoy_stend.`,
);

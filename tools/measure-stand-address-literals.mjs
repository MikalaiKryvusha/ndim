#!/usr/bin/env node
/**
 * ПРИБОР ЗАМЕРА — адреса стенда в приборах (`bugs/NEW_pribor_pishet_v_chuzhoy_stend`). НЕ страж.
 *
 * Класс: прибор с адресом стенда «слота 0» при живом парке из трёх слотов (`plans/69`) работает
 * с ЧУЖИМ стендом, если запущен ролью из её рабочего места. Два подтверждённых экземпляра там
 * не читали, а УДАЛЯЛИ. Замок доски не защищает: он делит МЕСТО, а не АДРЕС.
 *
 * 🔴 ПОЧЕМУ ЭТО ПРИБОР, А СТРАЖ — ОТДЕЛЬНЫЙ ФАЙЛ. Здесь печатается ВСЯ картина, включая то, что
 * дефектом не является: сколько приборов несут литерал вообще (90 из 254 — потому заказанный
 * широкий признак стражем и не стал), и как распределены четыре формы адреса. Страж
 * (`verify-stand-address-form.mjs`) краснеет ровно на одной из них и молчит об остальном.
 * Прибор отвечает «сколько и как сейчас», страж — «есть ли дефект». Их нельзя объединять:
 * прибор обязан печатать зелёное и жёлтое, а страж — только приговор.
 *
 * 🔑 СУЖДЕНИЕ О ФОРМЕ ЖИВЁТ В ОДНОМ МЕСТЕ — `lib/stand-address-form.mjs`, общем со стражем.
 * Здесь стояла его копия; у этого признака уже ТРИ поправки, каждая оплачена ложным
 * срабатыванием, и копия разъехалась бы с оригиналом на первой же из них.
 *
 * ⚠️ Границы: «пишет» — эвристика по именам методов Admin SDK, а не свойство; адрес, собранный
 * из переменной или пришедший флагом `--base`, прибор не видит по построению.
 *
 * Запуск: node tools/measure-stand-address-literals.mjs [--list]
 *   --list   напечатать поимённо ещё и читающие
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { формаАдреса, безКомментариев } from './lib/stand-address-form.mjs';

/** Литерал адреса стенда: порты слота 0 — приложение, preview и три эмулятора. */
const ADDRESS = /(localhost|127\.0\.0\.1):(5173|4173|8181|9099|9199)/;

/** Эвристика «прибор пишет»: разрушающие и записывающие вызовы Admin SDK и Auth. */
const WRITES = /\b(deleteUser|recursiveDelete|createUser|bulkWrite)\b|\.set\(|\.delete\(\)|\.update\(/;

/** Прибор считается вылеченным, когда берёт адрес у модуля слотов. */
const CURED = /stand-slot\.mjs/;

const LIST = process.argv.includes('--list');
const DIR = 'tools';

/**
 * Фикстуры исключаются ИМЕННО (`EXP-0215`): в `*.test.mjs` дефектная строка живёт строкой
 * образца, и считать её наравне с живым кодом значило бы запретить проверять сам признак.
 * Себя прибор исключает по той же причине.
 */
const исключить = (file) => file.endsWith('.test.mjs') || file === 'measure-stand-address-literals.mjs';

const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs') && !исключить(f));

/* ── Слой 1: кто вообще несёт литерал адреса и кто из них пишет ── */
const writers = [];
const readers = [];
const partly = [];
for (const file of files) {
  const raw = readFileSync(join(DIR, file), 'utf8');
  const code = безКомментариев(raw);
  if (!ADDRESS.test(code)) continue;
  if (CURED.test(raw)) partly.push(file);
  else if (WRITES.test(code)) writers.push(file);
  else readers.push(file);
}
const carrying = writers.length + readers.length + partly.length;

console.log('═══ АДРЕС СТЕНДА В ПРИБОРАХ (bugs/NEW_pribor_pishet_v_chuzhoy_stend) ═══\n');
console.log(`  всего .mjs в ${DIR}/                          : ${files.length}  ⚠️ растёт с деревом`);
console.log(`  несут литерал адреса В КОДЕ                  : ${carrying}`);
console.log(`  · ПИШУТ и адрес не выведен из слота          : ${writers.length}`);
console.log(`  · только читают                              : ${readers.length}`);
console.log(`  · берут адрес из слота, но литерал ещё несут : ${partly.length}`);
console.log('\n── Пишущие (кандидаты к прочтению, а не обвинение) ──');
for (const f of writers) console.log(`  · ${f}`);

/* ── Слой 2: ФОРМА адреса — она и решает, опасен ли литерал ── */
const формы = { присвоение: [], запасное: [], изСлота: [], отказ: [] };
for (const file of files) {
  const форма = формаАдреса(readFileSync(join(DIR, file), 'utf8'));
  if (форма) формы[форма].push(file);
}

console.log('\n── ФОРМА адреса эмулятора (решает, опасен ли литерал) ──');
const подпись = {
  присвоение: '⛔ ПРИСВОЕНИЕ литералом (перебивает верный env)  ',
  запасное: '⚠️ ЗАПАСНОЕ значение (опасно при запуске РУКОЙ)  ',
  изСлота: '✅ ИЗ СЛОТА (адрес собран из портов своего места)',
  отказ: '✅ ОТКАЗ без env (безопасен по построению)       ',
};
for (const форма of ['присвоение', 'запасное', 'изСлота', 'отказ']) {
  console.log(`  ${подпись[форма]}: ${формы[форма].length}`);
  for (const f of формы[форма]) console.log(`       ${f}`);
}
console.log('\n  🔴 Красным краснеет только ПРИСВОЕНИЕ — страж tools/verify-stand-address-form.mjs.');

if (LIST) {
  console.log('\n── Только читающие ──');
  for (const f of readers) console.log(`  · ${f}`);
}

console.log(
  '\n⚠️ «Пишет» — эвристика по именам методов; прежде чем звать это дефектом, прочитай файл.' +
    ' Разбор класса и критерии приёмки — bugs/NEW_pribor_pishet_v_chuzhoy_stend.md',
);

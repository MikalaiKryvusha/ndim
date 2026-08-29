/**
 * ТЕСТ СТРАЖА ВХОДНОГО ПРЕДОХРАНИТЕЛЯ (`tools/verify-import-safety.mjs` + ядро
 * `tools/lib/import-safety.mjs`).
 *
 * 🔴 ПОЧЕМУ У СТРАЖА, У КОТОРОГО ЕСТЬ `--selftest`, ЕЩЁ И ЮНИТ. Самотест не способен поймать
 * собственный незапуск: сломай стражу предохранитель наоборот — и `--selftest` промолчит,
 * напечатав ноль символов, а прогон отчитается успехом. Это замерено мутацией на доске команды
 * смены 10 и стоило класса `EXP-0227`. Поэтому здесь самотест ЗОВУТ СНАРУЖИ и требуют, чтобы он
 * ответил, а не просто «не упал».
 *
 * 🔴 ЯДРО ИМПОРТИРУЕТСЯ, СТРАЖ — НЕТ. `lib/import-safety.mjs` чист (одни объявления), его импорт
 * безопасен. Сам страж спрашивается ТОЛЬКО дочерним процессом: импортируй его этот файл строкой
 * `import`, и при возврате дефекта набор умер бы молча и засчитался бы пройденным — то есть
 * страж исчез бы ровно в тот момент, ради которого заведён.
 *
 * Прогон: node --test tools/verify-import-safety.test.mjs   (или `npm run test:tools`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { судить, красный } from './lib/import-safety.mjs';

const ЗДЕСЬ = dirname(fileURLToPath(import.meta.url));
const СТРАЖ = join(ЗДЕСЬ, 'verify-import-safety.mjs');
const СТРАЖ_URL = new URL('./verify-import-safety.mjs', import.meta.url).href;
const прогон = (...argv) => spawnSync(process.execPath, [СТРАЖ, ...argv], { encoding: 'utf8' });

/* ── Ядро: договор функции суда ──────────────────────────────────────────────────────── */

test('вердикт несёт строку и вид оператора — по нему чинят не думая', () => {
  const в = судить('export const a = 1;\nmain();\nfunction main() {}\n');
  assert.equal(красный(в), true);
  assert.deepEqual(в.незакрытая, [{ строка: 2, вид: 'ExpressionStatement' }]);
});

test('без экспорта работа на верхнем уровне не судится вовсе', () => {
  const в = судить('main();\nfunction main() {}\n');
  assert.equal(в.экспорт, false);
  assert.equal(красный(в), false);
});

test('🔑 предохранитель опознан по СМЫСЛУ: стороны сравнения можно поменять местами', () => {
  // Обе известные проекту формы написаны в разном порядке — признак обязан быть симметричным.
  const прямо = 'import { pathToFileURL } from "node:url";\nexport const a = 1;\n'
    + 'if (import.meta.url === pathToFileURL(process.argv[1]).href) main();\nfunction main() {}\n';
  const наоборот = 'import { resolve } from "node:path";\nimport { fileURLToPath } from "node:url";\nexport const a = 1;\n'
    + 'if (resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();\nfunction main() {}\n';
  assert.equal(судить(прямо).предохранитель, true);
  assert.equal(судить(наоборот).предохранитель, true);
  assert.equal(красный(судить(прямо)), false);
  assert.equal(красный(судить(наоборот)), false);
});

test('🔴 предохранитель есть, а работа снаружи — красный (случай rewrite-catalog-descriptions)', () => {
  const в = судить(
    'import { pathToFileURL } from "node:url";\nexport const a = 1;\n'
    + 'const З = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;\n'
    + 'if (process.argv.includes("--selftest")) selftest();\n'
    + 'if (З) main();\nfunction main() {}\nfunction selftest() {}\n',
  );
  assert.equal(в.предохранитель, true, 'предохранитель в файле есть');
  assert.equal(красный(в), true, 'и всё равно красный: самотест стоит снаружи него');
});

test('неразобранный исходник — не зелёный, а исключение', () => {
  // Страж, не сумевший разобрать файл, ничего о нём не знает и не вправе говорить «зелено».
  assert.throws(() => судить('export const = ;'));
});

/* ── Страж целиком: только дочерним процессом ────────────────────────────────────────── */

test('🔴 ЗАПУЩЕН: --selftest ОТВЕТИЛ и зелен', () => {
  const r = прогон('--selftest');
  assert.notEqual(r.stdout.trim(), '', 'самотест не ответил вовсе: предохранитель отключил стража');
  assert.match(r.stdout, /✅ самопроверка чиста: (\d+)\/\1/);
  assert.equal(r.status, 0);
});

test('🔑 К2 ideas/43: контрольные случаи неосновных форм стоят в самотесте и зелены', () => {
  // Без них собственный зелёный стража ничего не значит — это условие приёмки, а не украшение.
  const { stdout } = прогон('--selftest');
  assert.match(stdout, /^✅ 🔑 К2: вторая форма /m);
  assert.match(stdout, /^✅ 🔑 К2: третья форма /m);
});

test('🔴 ПОДКЛЮЧЁН: импорт стража не исполняет обход и не убивает чужой процесс', () => {
  const r = spawnSync(process.execPath, [
    '--input-type=module',
    '-e', `await import(${JSON.stringify(СТРАЖ_URL)}); console.log('ЖИВ-ПОСЛЕ-ИМПОРТА');`,
  ], { encoding: 'utf8' });
  assert.ok(r.stdout.includes('ЖИВ-ПОСЛЕ-ИМПОРТА'), 'импорт убил чужой процесс');
  assert.ok(!r.stdout.includes('осмотрено файлов'), 'импорт запустил обход дерева');
  assert.equal(r.status, 0);
});

test('К4: суд не вакуумен — печатает, сколько наблюдений сделал', () => {
  const { stdout } = прогон();
  assert.match(stdout, /осмотрено файлов \.mjs: \d+/);
  assert.match(stdout, /из них с экспортом: \d+ · с предохранителем: \d+/);
});

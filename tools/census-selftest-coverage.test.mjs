/**
 * ЮНИТЫ ПЕРЕПИСИ САМОТЕСТОВ (`tools/census-selftest-coverage.mjs`).
 *
 * 🔴 ЭТОТ ФАЙЛ ЗАКАЗАН САМИМ СТРАЖЕМ, И ЭТО НЕ ШУТКА, А ПРИЁМКА. Первый же прогон нового
 * прибора покраснел НА СВОЁМ АВТОРЕ: «ДОЛГ ВЫРОС — census-selftest-coverage.mjs несёт
 * --selftest, и звать его некому». Страж против приборов, чей самотест никто не зовёт, поймал
 * ровно такой прибор — себя. Файл заведён в ответ и **ЗОВЁТ самотест**, а не лежит рядом.
 *
 * ⚠️ И это ровно то различие, ради которого порция и написана: замер покрытия показал шесть
 * приборов, у которых парный файл ЕСТЬ, а самотест всё равно не исполняется. Наличие пары —
 * форма; вызов — существо. Здесь вызов настоящий, строкой ниже.
 *
 * Прогон: node --test tools/census-selftest-coverage.test.mjs · npm run test:tools
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { перепись, судХраповика, несётСамотест, безКомментариев, составВорот, selftest } from './census-selftest-coverage.mjs';

/** Поддельное дерево: tools/, tools/lib/, src/ — три места, где перепись ищет пары. */
function песочница({ приборы = {}, тесты = {}, srcТесты = {}, ворота = [] }) {
  const корень = mkdtempSync(join(tmpdir(), 'census-selftest-'));
  mkdirSync(join(корень, 'tools', 'lib'), { recursive: true });
  mkdirSync(join(корень, 'src', 'lib'), { recursive: true });
  for (const [имя, текст] of Object.entries(приборы)) writeFileSync(join(корень, 'tools', имя), текст, 'utf8');
  for (const [имя, текст] of Object.entries(тесты)) writeFileSync(join(корень, 'tools', имя), текст, 'utf8');
  for (const [имя, текст] of Object.entries(srcТесты)) writeFileSync(join(корень, 'src', 'lib', имя), текст, 'utf8');
  // Поддельный guards.mjs: первая запись — прогон юнитов, как в настоящем.
  const записи = [
    "  { argv: ['--test', 'tools/*.test.mjs'] },",
    ...ворота.map((и) => `  { argv: ['tools/${и}'] },`),
  ];
  const текстВорот = ['const GUARDS = [', ...записи, '];', ''].join('\n');
  writeFileSync(join(корень, 'tools', 'guards.mjs'), текстВорот, 'utf8');
  return корень;
}

const НЕСЁТ = "if (process.argv.includes('--selftest')) selftest();\n";
const НЕ_НЕСЁТ = 'export function main() {}\n';

test('перепись считает ЧУЖОЕ дерево: два носителя, один с парой', () => {
  const к = песочница({
    приборы: { 'a.mjs': НЕСЁТ, 'b.mjs': НЕСЁТ, 'c.mjs': НЕ_НЕСЁТ },
    тесты: { 'a.test.mjs': 'import {} from "./a.mjs";\n' },
  });
  try {
    const и = перепись(к);
    assert.equal(и.носителей, 2, 'c.mjs самотеста не несёт и в знаменатель не идёт');
    assert.deepEqual(и.группаА, ['b.mjs'], 'у a.mjs пара есть, у b.mjs нет');
    assert.deepEqual(и.долг, ['b.mjs']);
  } finally {
    rmSync(к, { recursive: true, force: true });
  }
});

test('пара, лежащая в src/ (дверь npm test), тоже засчитывается', () => {
  const к = песочница({ приборы: { 'a.mjs': НЕСЁТ }, srcТесты: { 'a.test.ts': 'import {} from "x";\n' } });
  try {
    assert.deepEqual(перепись(к).долг, [], 'src-дверь — такие же ворота, как tools');
  } finally {
    rmSync(к, { recursive: true, force: true });
  }
});

test('🔴 упоминание --selftest в ПРОЗЕ носителем не делает', () => {
  const к = песочница({ приборы: { 'a.mjs': '/**\n * Запуск: node a.mjs --selftest\n */\nmain();\n' } });
  try {
    assert.equal(перепись(к).носителей, 0, 'иначе знаменатель раздувается прозой — в дереве таких трое');
  } finally {
    rmSync(к, { recursive: true, force: true });
  }
});

test('снятие комментариев не съедает URL со слэшами', () => {
  assert.ok(безКомментариев("const u = 'https://x/y';").includes('https://x/y'));
});

test('носитель опознаётся и по строчному, и по блочному оформлению кода', () => {
  assert.ok(несётСамотест("argv.includes('--selftest')"));
  assert.ok(!несётСамотест("// --selftest\nmain();"));
  assert.ok(!несётСамотест("/* --selftest */\nmain();"));
});

// ── Группа Б: приборы В ВОРОТАХ без пары (слепая зона группы А) ───────────────────────────

test('🔴 прибор в воротах БЕЗ --selftest и без пары попадает в долг — группа А его не видит', () => {
  const к = песочница({ приборы: { 'g.mjs': НЕ_НЕСЁТ }, ворота: ['g.mjs'] });
  try {
    const и = перепись(к);
    assert.equal(и.группаА.length, 0, 'самотеста не несёт — в группу А не попадает');
    assert.deepEqual(и.группаБ, ['g.mjs'], 'но стоит в воротах без пары — это долг');
    assert.deepEqual(и.долг, ['g.mjs'], 'долг — ОБЪЕДИНЕНИЕ групп');
  } finally {
    rmSync(к, { recursive: true, force: true });
  }
});

test('прибор в воротах с парой в долг не идёт', () => {
  const к = песочница({ приборы: { 'g.mjs': НЕ_НЕСЁТ }, тесты: { 'g.test.mjs': 'x' }, ворота: ['g.mjs'] });
  try {
    assert.deepEqual(перепись(к).долг, []);
  } finally {
    rmSync(к, { recursive: true, force: true });
  }
});

test('состав ворот НЕ считает прогон юнитов прибором', () => {
  const к = песочница({ приборы: { 'g.mjs': НЕ_НЕСЁТ }, ворота: ['g.mjs'] });
  try {
    assert.equal(составВорот(к).length, 1, 'первая запись `--test tools/*.test.mjs` — не прибор');
  } finally {
    rmSync(к, { recursive: true, force: true });
  }
});

test('долг не двоится, если прибор попал в ОБЕ группы', () => {
  const к = песочница({ приборы: { 'g.mjs': НЕСЁТ }, ворота: ['g.mjs'] });
  try {
    const и = перепись(к);
    assert.deepEqual(и.группаА, ['g.mjs']);
    assert.deepEqual(и.группаБ, ['g.mjs']);
    assert.deepEqual(и.долг, ['g.mjs'], 'объединение, а не сумма');
  } finally {
    rmSync(к, { recursive: true, force: true });
  }
});

// ── Храповик ───────────────────────────────────────────────────────────────────────────────

test('храповик молчит на совпавшем долге', () => {
  assert.ok(судХраповика(['a.mjs'], ['a.mjs']).чисто);
});

test('🔴 храповик краснеет на ВЫРОСШЕМ долге и называет новичка', () => {
  const с = судХраповика(['a.mjs', 'b.mjs'], ['a.mjs']);
  assert.equal(с.чисто, false);
  assert.deepEqual(с.появились, ['b.mjs']);
});

test('🔴 храповик краснеет на ПРОТУХШЕМ списке — иначе он сам станет старым числом', () => {
  const с = судХраповика(['a.mjs'], ['a.mjs', 'b.mjs']);
  assert.equal(с.чисто, false);
  assert.deepEqual(с.ушли, ['b.mjs']);
});

// ── И собственно то, ради чего файл заведён ────────────────────────────────────────────────

test('самотест прибора ВЫЗЫВАЕТСЯ отсюда и зелёный', () => {
  assert.equal(selftest(), 0);
});

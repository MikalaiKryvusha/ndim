/**
 * ПАРА К `fix-catalog-tag-pairs.mjs` — зовёт его самотест (импортом И дочерним процессом) и судит
 * замок массовой правки: без слов владельца `--apply` обязан отказать до всякого обращения к базе.
 *
 * Запуск: node --test tools/fix-catalog-tag-pairs.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { selftest } from './fix-catalog-tag-pairs.mjs';

const TOOL = fileURLToPath(new URL('./fix-catalog-tag-pairs.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' });

test('самотест доставки пар чист (импортом)', () => {
  assert.deepEqual(selftest(), []);
});

test('самотест доставки пар чист (дочерним процессом, как его зовут ворота)', () => {
  const r = run('--selftest');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /самотест доставки пар чист/u);
});

test('замок: --apply без слов владельца отказывает кодом 2 и не лезет в базу', () => {
  const r = run('--contour', 'prod', '--group', 'rpg', '--apply');
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /требует слова владельца/u);
});

test('неизвестная группа — отказ кодом 2 с перечнем известных', () => {
  const r = run('--contour', 'prod', '--group', 'нет-такой');
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /Неизвестная группа/u);
  assert.match(r.stderr, /rpg/u);
});

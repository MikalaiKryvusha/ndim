/**
 * ПАРА К `verify-boot-shield.mjs` — зовёт самотест и судит ЖИВУЮ цепь плюс мутацию живого корня:
 * убери из настоящего `+page.svelte` ветку маркера — страж обязан покраснеть ровно на корне.
 *
 * Запуск: node --test tools/verify-boot-shield.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { judgeShield, readChain, selftest } from './verify-boot-shield.mjs';

const TOOL = fileURLToPath(new URL('./verify-boot-shield.mjs', import.meta.url));

test('самотест стража чист (импортом и дочерним процессом)', () => {
  assert.deepEqual(selftest(), []);
  const r = spawnSync(process.execPath, [TOOL, '--selftest'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('живая цепь цела', () => {
  assert.deepEqual(judgeShield(readChain()), []);
});

test('🔴 МУТАЦИЯ живого корня: без ветки маркера страж краснеет на корне (регрессия боя 2026-09-05)', () => {
  const chain = readChain();
  const mutated = { ...chain, root: chain.root.replace(/localStorage\.getItem\(['"]ndim-session['"]\)/gu, 'false') };
  const беды = judgeShield(mutated);
  assert.ok(беды.some((b) => /корень/u.test(b)), `ожидалась претензия к корню, получено: ${беды.join(' | ')}`);
});

test('🔴 МУТАЦИЯ: лендинг без endBoot — красный', () => {
  const chain = readChain();
  const mutated = { ...chain, landing: chain.landing.replace(/endBoot\(\)/gu, 'noop()') };
  assert.ok(judgeShield(mutated).some((b) => /лендинг/u.test(b)));
});

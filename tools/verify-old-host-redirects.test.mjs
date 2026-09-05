// Пара стража старого хоста: самотест ВЫЗВАН, мутация роняет, живой конфиг сходится с деревом.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { actualRedirects, expectedRedirects, langs, missing, topRoutes } from './verify-old-host-redirects.mjs';

const TOOL = new URL('./verify-old-host-redirects.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

test('самотест прибора зовётся дочерним процессом и зелёный', () => {
  const r = spawnSync(process.execPath, [TOOL, '--selftest'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('дерево маршрутов и языки читаются из источников, а не из головы', () => {
  assert.ok(topRoutes().includes('[lang=lang]'));
  assert.ok(topRoutes().includes('profile'));
  assert.deepEqual(langs(), ['ru', 'en']);
});

test('живой firebase.json: старый хост уводит на домен каждый маршрут дерева', () => {
  assert.deepEqual(missing(expectedRedirects(), actualRedirects()), []);
});

test('МУТАЦИЯ: конфиг без правила для /ru/** — красный, и назван именно он', () => {
  const без = actualRedirects().filter((r) => r.source !== '/ru/:rest*');
  const lack = missing(expectedRedirects(), без);
  assert.equal(lack.length, 1);
  assert.equal(lack[0].source, '/ru/:rest*');
});

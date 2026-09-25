/**
 * Двойник приёма `ready` до оживления страницы (`readyEarlyScript`, 2026-09-25).
 *
 * Стерегутся две вещи, которые поведенческая проверка на быстром стенде не видит: строка — исполнимый JS без модулей
 * (её исполняет браузер при разборе HTML, до всякого JS приложения), и пара «контейнер в разметке ↔ имя в строке»:
 * переименованный `id` молча вернул бы портретам ожидание гидрации.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { readyEarlyScript } from './ready.ts';

test('строка — исполнимый JS: без контейнера молчит и не бросает', () => {
  const src = readyEarlyScript('hero-trio');
  assert.doesNotThrow(() => new Function('document', src)({ getElementById: () => null }));
});

test('проявляет загруженную картинку сразу, незагруженную — по load или error', () => {
  const added: string[] = [];
  const listeners: Record<string, () => void> = {};
  const mk = (complete: boolean, w: number, name: string) => ({
    complete,
    naturalWidth: w,
    classList: { add: (c: string) => added.push(`${name}:${c}`) },
    addEventListener: (ev: string, fn: () => void) => (listeners[`${name}:${ev}`] = fn),
  });
  const imgs = [mk(true, 480, 'a'), mk(false, 0, 'b')];
  const doc = { getElementById: (id: string) => (id === 'hero-trio' ? { getElementsByTagName: () => imgs } : null) };
  new Function('document', readyEarlyScript('hero-trio'))(doc);
  assert.deepEqual(added, ['a:ok'], 'загруженная — сразу, незагруженная — ещё нет');
  listeners['b:load']();
  assert.deepEqual(added, ['a:ok', 'b:ok']);
});

test('главная несёт контейнер и строку с тем же id', () => {
  const svelte = readFileSync(new URL('./landing/LandingV1.svelte', import.meta.url), 'utf8');
  assert.match(svelte, /class="trio" id="hero-trio"/);
  assert.match(svelte, /readyEarlyScript\('hero-trio'\)/);
});

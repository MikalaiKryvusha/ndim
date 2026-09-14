/**
 * Юниты чистых частей `edit.mjs`: якоря вставок по словам и фильтр монтажа (эпик `plans/90`, репетиция пилота).
 * Запуск: node --test tools/video/edit.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { brollFilter, parseSegment, wordRange } from './edit.mjs';

const words = ['Вы', 'открываете', 'карточку', 'от', 'нуля', 'до', 'десяти.', 'Пространство NDim', 'считает', 'Связи —', 'людей', 'вкусами.']
  .map((text, i) => ({ text, from: i * 1000, to: i * 1000 + 800 }));

test('отрезок вставки — от первого слова до первого после него конечного, знаки не мешают', () => {
  assert.deepEqual(wordRange(words, 'открываете', 'десяти'), { start: 1, end: 6.8 });
  assert.deepEqual(wordRange(words, 'считает', 'вкусами'), { start: 8, end: 11.8 });
});

test('🔴 нет якоря — остановка с именем слова, а не монтаж без показа', () => {
  assert.throws(() => wordRange(words, 'открываете', 'десять'), /«десять»/);
  assert.throws(() => wordRange(words, 'закрываете', 'десяти'), /«закрываете»/);
});

test('отрезок из командной строки: путь Windows с двоеточием не ломает разбор', () => {
  assert.deepEqual(parseSegment('D:\\studio\\broll\\a.mp4|открываете|десяти'), { file: 'D:\\studio\\broll\\a.mp4', fromWord: 'открываете', toWord: 'десяти' });
  assert.throws(() => parseSegment('a.mp4|открываете'));
});

test('🔴 фильтр: каждая запись на своём отрезке, окна с лицом нет, субтитры последними', () => {
  const f = brollFilter({ segments: [{ start: 1, end: 6.8 }, { start: 8, end: 11.8 }], assArg: 'x.ass' });
  assert.match(f, /\[1:v\].*setpts=PTS-STARTPTS\+1\.000\/TB\[s0\]/);
  assert.match(f, /\[0:v\]\[s0\]overlay=0:0:enable='between\(t,1\.000,6\.800\)'/);
  assert.match(f, /\[v0\]\[s1\]overlay=0:0:enable='between\(t,8\.000,11\.800\)'/);
  assert.doesNotMatch(f, /pip|face/, 'окно лица снято репетицией — закрывало проценты «Связей»');
  assert.ok(f.endsWith("[v1]ass='x.ass'[v]"));
});

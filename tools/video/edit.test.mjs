/**
 * Юниты чистых частей `edit.mjs`: якоря вставок по словам и фильтр монтажа (эпик `plans/90`, репетиция пилота).
 * Запуск: node --test tools/video/edit.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { brollFilter, musicFilter, musicLicense, parseLogo, parseSegment, VOICE_CLEAN, wordRange } from './edit.mjs';
import { speechHfLoss } from './selfcheck.mjs';

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

test('🔴 запись экрана короче отрезка держит последний кадр, а не начинается заново (пилот 001)', () => {
  const f = brollFilter({ segments: [{ start: 20, end: 26 }], assArg: 'x.ass' });
  assert.match(f, /tpad=stop_mode=clone:stop_duration=6\.000,/);
  // …и медленно наезжает: статичный экран «Связи» иначе законно краснел проверкой застывшего кадра (5,7 с).
  assert.match(f, /scale=w='trunc\(1080\*\(1\+0\.06\*min\(t\/6\.000,1\)\)\/2\)\*2':h=-2:eval=frame,crop=1080:1920,setpts=PTS-STARTPTS\+20\.000\/TB\[s0\]/);
});

test('🔴 плашка по умолчанию — по центру НИЖЕ субтитров, чтобы не легла на бороду (слово владельца 2026-09-15)', () => {
  const f = brollFilter({ segments: [], assArg: 'x.ass', logo: { start: 6, end: 18 } });
  assert.match(f, /\[1:v\]format=rgba,.*fade=t=in:st=0:d=0\.3:alpha=1.*setpts=PTS-STARTPTS\+6\.000\/TB\[lg\]/);
  // Низ плашки 1460 + 108 = 1568: ниже субтитров (низ 1402) и выше подписи площадки. Прежние 300 — знак у верха.
  assert.match(f, /\[0:v\]\[lg\]overlay=\(W-w\)\/2:1460:enable='between\(t,6\.000,18\.000\)'/);
  assert.ok(!/scale=150/.test(f), 'плашка идёт своим размером, без масштаба');
  assert.ok(f.endsWith("[vl]ass='x.ass'[v]"), 'субтитры поверх знака');
  assert.equal(brollFilter({ segments: [], assArg: 'x.ass' }), "[0:v]ass='x.ass'[v]", 'без вставок и знака — одни субтитры');
});

test('плашка-логотип встаёт своим PNG на заданное место, без масштаба при ширине 0 (№088 В1)', () => {
  const logo = parseLogo('D:\\studio\\brand\\lockup.png|Пространство NDim|Вашим|(W-w)/2|1000|0');
  assert.deepEqual(logo, { file: 'D:\\studio\\brand\\lockup.png', fromWord: 'Пространство NDim', toWord: 'Вашим', x: '(W-w)/2', y: '1000', width: 0 });
  const f = brollFilter({ segments: [], assArg: 'x.ass', logo: { ...logo, start: 6, end: 18 } });
  assert.match(f, /\[1:v\]format=rgba,loop/, 'ширина 0 — без scale');
  assert.match(f, /overlay=\(W-w\)\/2:1000:enable=/);
  assert.deepEqual(parseLogo('a.png|x|y'), { file: 'a.png', fromWord: 'x', toWord: 'y' }, 'без места — место по умолчанию из LOGO');
});

test('🔴 музыка: голос — ключ приглушения, подложка по длине ролика, смесь без нормировки amix', () => {
  const f = musicFilter({ duration: 50, gainDb: -15.8 });
  assert.match(f, /\[1:a\].*atrim=duration=50\.000,volume=-15\.80dB,afade=t=in:st=0:d=1,afade=t=out:st=48\.000:d=2\[m\]/);
  assert.match(f, /\[0:a\].*asplit=2\[voice\]\[key\]/);
  assert.match(f, /\[m\]\[key\]sidechaincompress=/, 'ключ — голос, приглушается музыка');
  assert.match(f, /\[voice\]\[duck\]amix=inputs=2:duration=first:normalize=0\[mix\]/, 'normalize=0 — иначе amix вдвое тише голоса');
});

test('🔴 музыка без файла лицензии рядом в ролик не попадает', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndim-music-'));
  const mp3 = join(dir, 'ocean-breeze.mp3');
  writeFileSync(mp3, 'x');
  assert.throws(() => musicLicense(mp3), /нет файла лицензии/);
  writeFileSync(join(dir, 'ocean-breeze.license.txt'), 'CC0 1.0');
  assert.equal(musicLicense(mp3), join(dir, 'ocean-breeze.license.txt'));
});

test('🔴 очистка голоса не принимает речь за шум: порог шума замерен, а не −25 (пилот 001)', () => {
  assert.match(VOICE_CLEAN, /^highpass=f=80,afftdn=nf=-60/);
  assert.doesNotMatch(VOICE_CLEAN, /nf=-25/);
  // Замер пилота 001: до очистки низ −33,5 / верх −51,9 дБ; прежняя очистка −34,2 / −62,0; нынешняя −33,5 / −52,0.
  const before = { low: -33.5, high: -51.9 };
  assert.ok(Math.abs(speechHfLoss(before, { low: -34.2, high: -62.0 }) - 9.4) < 1e-9);
  assert.ok(Math.abs(speechHfLoss(before, { low: -33.5, high: -52.0 }) - 0.1) < 1e-9);
});

/**
 * Юниты разбора отчётов ffmpeg в `selfcheck.mjs` (эпик `plans/90`, Ш5 `plans/91`).
 * Живые мутанты на видео — набор `qa/suites/video-pipeline.md`; здесь — только разбор текста.
 * Запуск: node --test tools/video/selfcheck.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { countMatches, parseIntegratedLufs, subtitleDrift } from './selfcheck.mjs';

const ass = (lines) => lines.map(([t, text]) => `Dialogue: 0,${t},0:00:09.00,Default,,0,0,0,,${text}`).join('\n');

test('субтитры со своего звука — зелёные; имя бренда и запятые в строке не мешают сопоставлению', () => {
  const words = [{ from: 300, text: 'Привет.' }, { from: 1120, text: 'Меня' }, { from: 1440, text: 'зовут' }, { from: 2990, text: 'Я' }, { from: 3500, text: 'NDim Space,' }];
  const d = subtitleDrift(ass([['0:00:00.30', 'Привет.'], ['0:00:01.12', 'Меня зовут'], ['0:00:02.99', 'Я сделал NDim Space, где']]), words);
  assert.deepEqual({ ok: d.ok, matched: d.matched, maxDrift: d.maxDrift }, { ok: true, matched: 3, maxDrift: 0 });
});

test('🔴 субтитры сняты до вырезания паузы — сдвиг больше порога краснеет', () => {
  const words = [{ from: 300, text: 'Привет.' }, { from: 1120, text: 'Меня' }];
  const d = subtitleDrift(ass([['0:00:00.30', 'Привет.'], ['0:00:03.60', 'Меня зовут']]), words);
  assert.equal(d.ok, false);
  assert.equal(d.maxDrift, 2480);
});

test('пустые субтитры не бывают зелёными', () => {
  assert.equal(subtitleDrift('', [{ from: 0, text: 'слово' }]).ok, false);
});

test('громкость берётся из итоговой сводки, а не из промежуточных строк', () => {
  const text = '[Parsed_ebur128_0] t: 0.4 M: -20.0 S:-120.7 I: -19.0 LUFS\n[Parsed_ebur128_0] Summary:\n\n  Integrated loudness:\n    I:         -14.6 LUFS\n';
  assert.equal(parseIntegratedLufs(text), -14.6);
});

test('тишина целиком — минус бесконечность, а не «нет данных» и не зелёное', () => {
  assert.equal(parseIntegratedLufs('Summary:\n    I:         -inf LUFS'), -Infinity);
  assert.equal(parseIntegratedLufs('нет сводки'), null);
});

test('счёт событий фильтров', () => {
  assert.equal(countMatches('silence_end: 1\nsilence_end: 2', /silence_end:/g), 2);
  assert.equal(countMatches('', /black_start:/g), 0);
});

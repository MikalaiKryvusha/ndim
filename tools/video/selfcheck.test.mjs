/**
 * Юниты разбора отчётов ffmpeg в `selfcheck.mjs` (эпик `plans/90`, Ш5 `plans/91`).
 * Живые мутанты на видео — набор `qa/suites/video-pipeline.md`; здесь — только разбор текста.
 * Запуск: node --test tools/video/selfcheck.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { countMatches, parseIntegratedLufs } from './selfcheck.mjs';

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

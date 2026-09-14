/**
 * Юниты `words-to-ass.mjs` (эпик `plans/90`, шаг Ш3 `plans/91`).
 * Каждый тест держит дефект, найденный прогоном на пробе 2026-09-14, а не придуманный.
 * Запуск: node --test tools/video/words-to-ass.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { alignScript, assTime, groupWords, readWords, toAss } from './words-to-ass.mjs';

test('🔴 субтитры берут текст сценария, время — из распознавания (репетиция пилота 2026-09-14)', () => {
  // Распознавание дословно как на репетиции: «пространство НДИМ», «звезды», «от 0 до 10».
  const rec = ['Я', 'сделал', 'пространство', 'НДИМ', 'ставите', 'фильму', 'звезды', 'от', '0', 'до', '10', 'Ваши', 'связи']
    .map((text, i) => ({ text, from: i * 500, to: i * 500 + 400 }));
  const { words, matched } = alignScript('Я сделал Пространство NDim. Ставите фильму звёзды, от нуля до десяти. Ваши Связи — людей', rec);
  const texts = words.map((w) => w.text);
  assert.ok(texts.includes('Пространство NDim.'), JSON.stringify(texts));
  assert.ok(texts.includes('звёзды,'));
  assert.ok(texts.includes('Связи —'), 'тире сценария не теряется');
  const nulya = words.find((w) => w.text === 'нуля');
  assert.ok(nulya.from >= 3500 && nulya.to <= 5000, `«нуля» без пары получает время между соседями: ${JSON.stringify(nulya)}`);
  assert.ok(matched > 0.5 && matched < 1);
});

const seg = (from, to, text) => ({ offsets: { from, to }, text });

test('🔴 имя бренда не разрезается между субтитрами и пишется как в продукте', () => {
  // Ровно тот вход, на котором первый прогон отдал «Я сделал Ndim» и «Space, бесплатное…».
  const json = { transcription: [seg(0, 300, ''), seg(2990, 2990, ' Я'), seg(2990, 2990, ' сделал'), seg(2990, 3820, ' Ndim'), seg(3820, 4400, ' Space,'), seg(4400, 5000, ' бесплатное')] };
  const groups = groupWords(readWords(json), 3);
  const texts = groups.map((g) => g.text);
  assert.ok(texts.some((t) => t.includes('NDim Space,')), `имя целиком в одной группе: ${JSON.stringify(texts)}`);
  assert.ok(!texts.some((t) => /\bNdim\b/.test(t)), 'написание модели не доезжает до кадра');
});

test('английская речь: «Endim Space» тоже становится «NDim Space»', () => {
  // Дословно из распознавания английской пробы 2026-09-14: «I built Endim Space, a free space…».
  const json = { transcription: [seg(0, 400, ' I'), seg(400, 800, ' built'), seg(800, 1200, ' Endim'), seg(1200, 1700, ' Space,'), seg(1700, 1900, ' a')] };
  const texts = groupWords(readWords(json), 3).map((g) => g.text);
  assert.ok(texts.some((t) => t.includes('NDim Space,')), JSON.stringify(texts));
});

test('нулевое слово не рождает мигания: группа живёт до начала следующей', () => {
  const words = [
    { from: 1000, to: 1000, text: 'Я' },
    { from: 1000, to: 1000, text: 'сделал' },
    { from: 1000, to: 1500, text: 'сайт.' },
    { from: 2000, to: 2400, text: 'Смотрите' },
  ];
  const [first, second] = groupWords(words, 3);
  assert.equal(first.end, second.start);
  assert.ok(first.end > first.start);
});

test('конец фразы закрывает группу раньше лимита', () => {
  const words = [{ from: 0, to: 500, text: 'Привет.' }, { from: 600, to: 900, text: 'Меня' }];
  assert.deepEqual(groupWords(words, 3).map((g) => g.text), ['Привет.', 'Меня']);
});

test('время ASS и фигурные скобки в тексте', () => {
  assert.equal(assTime(3_723_450), '1:02:03.45');
  const ass = toAss([{ start: 0, end: 1000, text: 'a {\\b1}b' }]);
  assert.ok(ass.includes(',a \\b1b'), 'теги ASS из речи не исполняются');
});

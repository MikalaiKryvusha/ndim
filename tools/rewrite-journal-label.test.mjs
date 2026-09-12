/**
 * ЯРЛЫК ПРОПОРЦИИ В ЖУРНАЛЕ ПРАВОК (`tools/rewrite-catalog-descriptions.mjs` → `journalText`) —
 * `bugs/190`: раздутый дроблением знаменатель журнал называл улучшением.
 *
 * Четыре случая стоят ПАРАМИ, порознь они не различают ярлык от отказа:
 *   · дробление (предложений больше, слов не больше)   → НЕ «✅ лучше», а «раздроблено»;
 *   · прирост содержания (предложений и слов больше)   → «содержания прибавилось»;
 *   · слияние (сжатый знаменатель, `bugs/180`)         → «⚠️ знаменатель сжался», как было;
 *   · мета упала                                       → «✅ лучше» — единственное честное «лучше».
 * Плюс: слова печатаются рядом с предложениями — без этого числа дробление не отличить вовсе.
 *
 * Образцы английские, потому что и правки английские (`plans/70`); классификация меты снята
 * прогоном `пропорцияПравки` до написания теста: 1/2 → 1/3 при 21 → 21 словах и т. д.
 *
 * Мутация (К4): вернуть прежний ярлык `п.после.доля < п.до.доля ? '✅ лучше'` — первый случай
 * краснеет («дробление названо улучшением»), остальные зелёные.
 *
 * Прогон: node --test tools/rewrite-journal-label.test.mjs   (или `npm run test:tools`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { journalText, словВТексте } from './rewrite-catalog-descriptions.mjs';

const META = 'Steven Spielberg directed the film and Kathleen Kennedy produced it.';
const строка = (before, after) =>
  journalText([{ slug: 'x', lang: 'en', before, after }], { applied: 1, skipped: 0 })
    .split('\n').find((l) => l.startsWith('*Доля производства'));

test('дробление одной мысли надвое НЕ называется улучшением', () => {
  const l = строка(
    `${META} It follows a boy who finds a robot in the woods.`,
    `${META} It follows a boy. He finds a robot in the woods.`,
  );
  assert.match(l, /1 → 1, всего 2 → 3/, 'контроль прибора: мета та же, знаменатель вырос');
  assert.match(l, /слов 21 → 21/, 'слова напечатаны рядом с предложениями');
  assert.doesNotMatch(l, /✅ лучше/, 'дробление названо улучшением');
  assert.match(l, /раздроблено, не добавлено/);
});

test('настоящий прирост содержания назван приростом, не дроблением', () => {
  const l = строка(
    `${META} It follows a boy who finds a robot in the woods.`,
    `${META} It follows a boy who finds a robot in the woods. The robot teaches him to fly.`,
  );
  assert.match(l, /слов 21 → 27/);
  assert.match(l, /содержания прибавилось/);
  assert.doesNotMatch(l, /✅ лучше/);
});

test('сжатый знаменатель по-прежнему виден (пара к bugs/180)', () => {
  const l = строка(
    `${META} It follows a boy. He finds a robot in the woods.`,
    `${META} It follows a boy who finds a robot in the woods.`,
  );
  assert.match(l, /⚠️ знаменатель сжался/);
});

test('мета упала — единственное честное «✅ лучше»', () => {
  const l = строка(
    `${META} It follows a boy who finds a robot in the woods.`,
    'It follows a boy who finds a robot in the woods. The robot teaches him to fly.',
  );
  assert.match(l, /1 → 0/);
  assert.match(l, /✅ лучше/);
});

test('словВТексте: пробелы и пустота', () => {
  assert.equal(словВТексте('  a  b\nc '), 3);
  assert.equal(словВТексте(''), 0);
  assert.equal(словВТексте(undefined), 0);
});

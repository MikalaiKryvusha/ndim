/**
 * ТЕСТЫ МОДЕЛИ ПАРЫ + СТРАЖ «РЕЗУЛЬТАТ БЕЗ ЧИСЕЛ ПОХОЖЕСТИ» (`plans/42`, критерий 5 фазы).
 *
 * Мутации, которые страж обязан ронять (проверено при написании, см. план):
 *   · добавить в PairFacts поле `percent`/`similarity` — падает тест закрытого набора ключей;
 *   · вернуть в строке результата производную величину — падает тест формы строки.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  answersFromRatings,
  sanitizeAnswers,
  pairFacts,
  DIFFER_FROM,
  MAX_PAIR_ANSWERS,
} from './test-pair.ts';

const QUEUE = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'];

test('в ответы уходит ТОЛЬКО пересечение оценок с набором обёртки (№002 В4)', () => {
  const ratings = new Map([
    ['q1', 7],
    ['q3', 10],
    ['вне-набора', 9], // оценка из приложения, не из теста — не покидает points
  ]);
  assert.deepEqual(answersFromRatings(ratings, QUEUE), { q1: 7, q3: 10 });
});

test('чужие ответы фильтруются при чтении: не-целое, вне 0…10, вне набора', () => {
  const raw = { q1: 5, q2: 11, q3: -1, q4: 7.5, q5: 'десять', чужое: 3 };
  const clean = sanitizeAnswers(raw, new Set(QUEUE));
  assert.deepEqual([...clean], [['q1', 5]]);
  assert.equal(sanitizeAnswers(null, new Set(QUEUE)).size, 0);
});

test('факты пары: точные, десятки, рядом, по-разному — и честный знаменатель', () => {
  const mine = new Map([
    ['q1', 10], // оба 10 → exact + tens
    ['q2', 7], // 7 против 7 → exact
    ['q3', 5], // 5 против 6 → close
    ['q4', 2], // 2 против 8 → differ
    ['q5', 5], // 5 против 7 → ни то ни сё (разница 2)
  ]);
  const theirs = new Map([
    ['q1', 10],
    ['q2', 7],
    ['q3', 6],
    ['q4', 8],
    ['q5', 7],
    ['q6', 9], // у меня не оценено — в сравнение не входит
  ]);
  const facts = pairFacts(mine, theirs, QUEUE);
  assert.equal(facts.compared, 5);
  assert.deepEqual(facts.exact.map((r) => r.id), ['q1', 'q2']);
  assert.deepEqual(facts.tens.map((r) => r.id), ['q1']);
  assert.deepEqual(facts.close.map((r) => r.id), ['q3']);
  assert.deepEqual(facts.differ.map((r) => r.id), ['q4']);
  assert.equal(DIFFER_FROM, 4);
});

// ── СТРАЖ: в результате нет ни процентов, ни похожести, ни порядка близости ──────────────

test('страж: закрытый набор полей результата — ничего похожего на похожесть', () => {
  const facts = pairFacts(new Map([['q1', 10]]), new Map([['q1', 10]]), QUEUE);

  // Ключи результата закрыты СПИСКОМ. Новое поле обязано сначала пройти через этот тест —
  // и через вопрос «не производная ли это величина похожести» (№018 В4).
  assert.deepEqual(Object.keys(facts).sort(), ['close', 'compared', 'differ', 'exact', 'tens']);

  // Строка результата несёт только объект и ДВЕ сырые оценки — никаких вычисленных величин.
  assert.deepEqual(Object.keys(facts.exact[0]!).sort(), ['a', 'b', 'id']);

  // Запрещённая лексика не появляется нигде в сериализованном результате.
  const dump = JSON.stringify(facts).toLowerCase();
  for (const banned of ['%', 'percent', 'процент', 'similar', 'похож', 'proximity', 'близост']) {
    assert.ok(!dump.includes(banned), `в результате пары нашлось запрещённое: «${banned}»`);
  }
});

test('потолок ответов — зеркало правила Firestore (size() ≤ 40)', () => {
  assert.equal(MAX_PAIR_ANSWERS, 40);
});

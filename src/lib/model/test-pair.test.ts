/**
 * ТЕСТЫ МОДЕЛИ ПАРЫ + СТРАЖ «РЕЗУЛЬТАТ БЕЗ ЧИСЕЛ ПОХОЖЕСТИ» (`plans/42`, критерий 5 фазы).
 *
 * Мутации, которые страж обязан ронять (проверено при написании, см. план):
 *   · добавить в PairFacts поле `percent`/`similarity` — падает тест закрытого набора ключей;
 *   · вернуть в строке результата производную величину — падает тест формы строки;
 *   · 🆕 2026-09-26 (№098 В2): «второй получает свою случайную дюжину» (`pairQueueIds` тасует пул
 *     вместо вещей первого) — падают три теста очереди второго (прогон мутанта: 27 прошло, 3 упало).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  answersFromRatings,
  sanitizeAnswers,
  pairFacts,
  pairQueueIds,
  encodePairSet,
  decodePairSet,
  DIFFER_FROM,
  MAX_PAIR_ANSWERS,
  PAIR_SET_PARAM,
} from './test-pair.ts';
import { shuffledIds, TEST_POOL } from '../content/test-set.ts';

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
  // Пул целиком влезает в документ пары: вернувшийся человек мог оценить все вещи пула.
  assert.ok(TEST_POOL.length <= MAX_PAIR_ANSWERS);
});

// ── Второй человек пары оценивает ТЕ ЖЕ вещи, что первый (№098 В2, пул и случайная дюжина) ─────

/** Первый проходит свою попытку: перетасовка затравкой, `skip` вещей пропущено «не знаю». */
function firstAttempt(seed: number, skip = 0): { answers: Record<string, number>; rated: string[] } {
  const order = shuffledIds(TEST_POOL, seed);
  const rated = order.slice(skip, skip + 12);
  const ratings = new Map(rated.map((id, i) => [id, i % 11]));
  return { answers: answersFromRatings(ratings, order), rated };
}

test('🔑 второй получает РОВНО вещи первого — не свою случайную дюжину', () => {
  for (const [seed, skip] of [[7, 0], [99, 3], [2024, 8]]) {
    const { answers, rated } = firstAttempt(seed, skip);
    const second = pairQueueIds(TEST_POOL, new Set(Object.keys(answers)));
    assert.deepEqual([...second].sort(), [...rated].sort(), `затравка ${seed}: у второго другие вещи`);
    // Порядок — порядок пула: одинаков у всех, кто открыл одну ссылку, и не зависит от перетасовки первого.
    assert.deepEqual(second, TEST_POOL.filter((id) => rated.includes(id)));
  }
});

test('очередь второго не зависит от того, как перетасовал пул первый', () => {
  const rated = new Set(TEST_POOL.slice(3, 15));
  assert.deepEqual(pairQueueIds(TEST_POOL, rated), pairQueueIds([...TEST_POOL], new Set([...rated].reverse())));
  // Вещь вне пула (пул сменился между выкатами) выпадает: карточки для неё у страницы нет.
  assert.deepEqual(pairQueueIds(TEST_POOL, new Set(['не-из-пула', TEST_POOL[0]])), [TEST_POOL[0]]);
});

test('🔑 код набора в ссылке: туда и обратно — те же вещи, та же очередь, что из прочитанной пары', () => {
  const { answers } = firstAttempt(31337, 2);
  const fromPair = pairQueueIds(TEST_POOL, new Set(Object.keys(answers)));
  const code = encodePairSet(TEST_POOL, Object.keys(answers));
  assert.equal(code.length, 12, 'символ на вещь');
  assert.match(code, /^[0-9a-z]+$/, 'код — адресная строка без экранирования');
  const decoded = decodePairSet(TEST_POOL, code);
  assert.ok(decoded !== null);
  assert.deepEqual(pairQueueIds(TEST_POOL, decoded), fromPair, 'код ссылки и пара дают разные очереди');
});

test('код набора — внешние данные: чужие символы и номера вне пула выпадают, пусто — «подсказки нет»', () => {
  assert.equal(decodePairSet(TEST_POOL, null), null);
  assert.equal(decodePairSet(TEST_POOL, ''), null);
  assert.equal(decodePairSet(TEST_POOL, '!!—z'), null, 'z = 35 — вне пула из 20');
  assert.deepEqual([...(decodePairSet(TEST_POOL, '0!j') ?? [])], [TEST_POOL[0], TEST_POOL[19]]);
  assert.throws(() => encodePairSet(Array.from({ length: 37 }, (_, i) => `d${i}`), ['d0']), /длиннее 36/);
  assert.equal(PAIR_SET_PARAM, 'set');
});

/**
 * Юниты следа двери. Судим ЧИСТУЮ функцию разбора — она и есть место, где след может соврать
 * первому экрану. Хранилище здесь не поднимаем: `sessionStorage` в узле нет, а обёртки над ним
 * содержат ровно `try/catch` и одну строку.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRatedTrace, RATED_TRACE_KEY } from './rated-trace.ts';

const целый = JSON.stringify({ id: 'd1', title: '«Аллея кошмаров»', year: '2021', kind: 'Фильм', value: 8 });

test('целый след разбирается полностью', () => {
  assert.deepEqual(parseRatedTrace(целый), {
    id: 'd1',
    title: '«Аллея кошмаров»',
    year: '2021',
    kind: 'Фильм',
    value: 8,
  });
});

test('ноль — законная оценка, а не «не оценивал»', () => {
  const т = parseRatedTrace(JSON.stringify({ id: 'd1', title: 'X', value: 0 }));
  assert.equal(т?.value, 0, 'ноль обязан пережить разбор: это осознанная оценка человека');
});

test('десятка проходит, одиннадцать — нет', () => {
  assert.equal(parseRatedTrace(JSON.stringify({ id: 'd1', title: 'X', value: 10 }))?.value, 10);
  assert.equal(parseRatedTrace(JSON.stringify({ id: 'd1', title: 'X', value: 11 })), null);
  assert.equal(parseRatedTrace(JSON.stringify({ id: 'd1', title: 'X', value: -1 })), null);
});

test('год и вид необязательны — объект без года не ломает след', () => {
  const т = parseRatedTrace(JSON.stringify({ id: 'd1', title: 'X', value: 5 }));
  assert.deepEqual(т, { id: 'd1', title: 'X', year: '', kind: '', value: 5 });
});

test('без идентификатора следа нет — сверить с оценками нечем', () => {
  assert.equal(parseRatedTrace(JSON.stringify({ title: 'X', value: 5 })), null);
});

test('без названия следа нет — показывать нечего', () => {
  assert.equal(parseRatedTrace(JSON.stringify({ id: 'd1', value: 5 })), null);
});

test('без отметки следа нет — нечего утверждать', () => {
  assert.equal(parseRatedTrace(JSON.stringify({ id: 'd1', title: 'X' })), null);
  assert.equal(parseRatedTrace(JSON.stringify({ id: 'd1', title: 'X', value: 'восемь' })), null);
});

test('мусор молчит, а не падает — первый экран не имеет права упасть из-за подсказки', () => {
  assert.equal(parseRatedTrace(null), null);
  assert.equal(parseRatedTrace(''), null);
  assert.equal(parseRatedTrace('не json'), null);
  assert.equal(parseRatedTrace('null'), null);
  assert.equal(parseRatedTrace('[]'), null);
  assert.equal(parseRatedTrace('42'), null);
});

test('ключ следа — один на проект и не пустой', () => {
  assert.equal(RATED_TRACE_KEY, 'ndim-rated-just-now');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { completePairs, ГРУППЫ } from './tag-pairs.mjs';
import { tagPairsOf } from './tag-conventions.mjs';

// Примеры взяты из живого каталога (замер 2026-09-05): 90 записей «ролевая игра» ↔ «RPG»,
// 24 — «ролевая игра» ↔ «role-playing game», 1 — строчное «rpg», 6 — все три слова разом.
const G = ГРУППЫ.rpg;
// `tagPairsOf` нормализует теги в нижний регистр — сравниваем пары по нему же.
const пары = (tags) => tagPairsOf({ tags });
const н = (pairs) => pairs.map(([a, b]) => [a.toLowerCase(), b.toLowerCase()]);
const ГРУППА = ['ролевая игра', 'role-playing game', 'РПГ', 'RPG'];

test('запись без слов группы не трогается', () => {
  const r = completePairs(['фильм', 'movie', 'драма', 'drama'], G);
  assert.equal(r.touched, false);
  assert.deepEqual(r.tags, ['фильм', 'movie', 'драма', 'drama']);
});

test('«ролевая игра» ↔ «RPG» (90 живых записей): достраиваются обе пары, соседи на местах', () => {
  const было = ['видеоигра', 'video game', 'ролевая игра', 'RPG', 'детектив', 'detective'];
  const r = completePairs(было, G);
  assert.deepEqual(r.tags, ['видеоигра', 'video game', 'ролевая игра', 'role-playing game', 'РПГ', 'RPG', 'детектив', 'detective']);
  assert.deepEqual(r.added, ['role-playing game', 'РПГ']);
  assert.deepEqual(пары(r.tags), н([
    ['видеоигра', 'video game'],
    ['ролевая игра', 'role-playing game'],
    ['РПГ', 'RPG'],
    ['детектив', 'detective'],
  ]));
});

test('«ролевая игра» ↔ «role-playing game» (24 записи): добавляется пара «РПГ» ↔ «RPG»', () => {
  const r = completePairs(['видеоигра', 'video game', 'ролевая игра', 'role-playing game', 'фэнтези', 'fantasy'], G);
  assert.deepEqual(r.tags, ['видеоигра', 'video game', 'ролевая игра', 'role-playing game', 'РПГ', 'RPG', 'фэнтези', 'fantasy']);
  assert.deepEqual(пары(r.tags).slice(1, 3), н([['ролевая игра', 'role-playing game'], ['РПГ', 'RPG']]));
});

test('строчное «rpg» — тот же тег, уходит в канон и называется в журнале', () => {
  const r = completePairs(['видеоигра', 'video game', 'rpg', 'ролевая игра', 'инди', 'indie'], G);
  assert.ok(!r.tags.includes('rpg'));
  assert.ok(r.tags.includes('RPG'));
  assert.deepEqual(r.normalized, ['rpg → RPG']);
  assert.equal(r.tags.filter((t) => t === 'RPG').length, 1, 'дубля RPG нет');
});

test('всё уже стоит — запись не трогается', () => {
  const r = completePairs(['видеоигра', 'video game', 'ролевая игра', 'role-playing game', 'РПГ', 'RPG'], G);
  assert.equal(r.touched, false);
  assert.deepEqual(r.added, []);
});

test('ни один чужой тег не удалён и не переставлен относительно других', () => {
  const было = ['PC game', 'game', 'video game', 'видеоигра', 'игра', 'компьютерная игра', 'role-playing game', 'action', 'RPG', 'экшн', 'ролевая игра'];
  const r = completePairs(было, G);
  const чужие = (arr) => arr.filter((t) => !ГРУППА.includes(t));
  assert.deepEqual(чужие(r.tags), чужие(было));
  for (const t of ГРУППА) assert.equal(r.tags.filter((x) => x === t).length, 1, `${t} стоит ровно один раз`);
});

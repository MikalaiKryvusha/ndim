/**
 * Лента измерений: порядок, случайность и новизна.
 *
 * Это не «тесты ради тестов». Владелец на боевом проде увидел АЛФАВИТНЫЙ список из 5111 измерений
 * и сказал: «бред!!!» — и был прав: при любом фиксированном порядке хвост каталога не увидит
 * никто и никогда. Значит случайность здесь — свойство ПРОДУКТА, и она обязана быть доказана.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildUnratedFeed,
  dimCardTitle,
  isNewDim,
  parseDimsIndex,
  searchIndex,
  shuffle,
  sortMyDims,
  type DimsIndex,
} from './feed.ts';

/** Индекс каталога, как он лежит в базе, — JSON-СТРОКОЙ (наследие 1.x). */
const RAW_INDEX = JSON.stringify({
  a: { ru: 'Лолита', en: 'Lolita', year: '1955' },
  b: { ru: 'Таксист', en: 'Taxi Driver', year: '1976' },
  c: { ru: 'Ход королевы', en: "The Queen's Gambit", year: '2020' },
  d: { ru: 'Зардоз', en: 'Zardoz', year: '1974' },
});

const index: DimsIndex = parseDimsIndex(RAW_INDEX);

test('индекс каталога разбирается из JSON-строки, а не из карты', () => {
  assert.equal(index.size, 4);
  assert.equal(index.get('a')?.ru, 'Лолита');
  assert.equal(index.get('c')?.year, '2020');
});

test('битый индекс не роняет экран — возвращается пустая карта', () => {
  // Один странный документ не имеет права уносить с собой весь экран (урок EXP-0041).
  for (const broken of ['', 'не json', '[1,2,3]', null, undefined, 42]) {
    assert.equal(parseDimsIndex(broken).size, 0, `сломалось на ${JSON.stringify(broken)}`);
  }
});

test('лента «Все» — это НЕОЦЕНЁННОЕ: оценённое в неё не попадает', () => {
  const feed = buildUnratedFeed(index, new Set(['a', 'c']));

  assert.equal(feed.length, 2);
  assert.deepEqual([...feed].sort(), ['b', 'd']);
});

test('оценил всё — лента пуста (работа заканчивается, а не длится вечно)', () => {
  assert.deepEqual(buildUnratedFeed(index, new Set(['a', 'b', 'c', 'd'])), []);
});

test('порядок ленты СЛУЧАЙНЫЙ, а не алфавитный', () => {
  // Подсовываем предсказуемый источник случайности: перемешивание обязано его слушаться.
  const reverse = () => 0; // всегда берём нулевой индекс — Фишер-Йейтс развернёт список
  const feed = buildUnratedFeed(index, new Set(), reverse);

  assert.notDeepEqual(feed, ['a', 'b', 'c', 'd'], 'порядок совпал с исходным — случайности нет');
  assert.deepEqual([...feed].sort(), ['a', 'b', 'c', 'd'], 'ни одно измерение не потеряно');
});

test('перемешивание ничего не теряет и не двоит', () => {
  const items = Array.from({ length: 200 }, (_, i) => i);
  const mixed = shuffle(items);

  assert.equal(mixed.length, items.length);
  assert.deepEqual([...mixed].sort((a, b) => a - b), items);
});

test('перемешивание действительно перемешивает: 200 элементов не остаются на месте', () => {
  const items = Array.from({ length: 200 }, (_, i) => i);
  const mixed = shuffle(items);

  const moved = mixed.filter((value, position) => value !== position).length;
  // Вероятность, что честное перемешивание оставит на месте больше половины, исчезающе мала.
  assert.ok(moved > 100, `на своих местах осталось слишком много: сдвинулось лишь ${moved} из 200`);
});

test('каждое измерение получает шанс: за много прогонов первым побывает любое', () => {
  // Смысл случайности — справедливость к измерениям: не только «А…» и не только популярные.
  const firstSeen = new Set<string>();
  for (let run = 0; run < 300; run += 1) {
    firstSeen.add(buildUnratedFeed(index, new Set())[0]);
  }
  assert.equal(firstSeen.size, 4, 'какое-то измерение НИ РАЗУ не оказалось первым');
});

test('«Мой NDim ID» — по убыванию СВОЕЙ оценки; язык на порядок НЕ влияет', () => {
  // bugs/37: тай-брейк по локализованному имени заставлял равные оценки «прыгать» при
  // смене RU↔EN. Канон 1.x — строго по оценке; при равных — стабильный ключ (id).
  const mine = sortMyDims(new Map([['b', 10], ['c', 7], ['d', 7], ['a', 0]]));

  assert.equal(mine[0], 'b', 'десятка обязана быть первой');
  assert.equal(mine[3], 'a', 'ноль обязан быть последним');
  // 'c' (Ход королевы / The Queen's Gambit) и 'd' (Зардоз / Zardoz) — обе семёрки.
  // По id: c → d. Тай-брейк по русскому имени дал бы ОБРАТНЫЙ порядок (Зардоз < Ход) —
  // регресс к сортировке по имени этот тест роняет.
  assert.deepEqual(mine.slice(1, 3), ['c', 'd']);
  // У сортировки нет входа «язык» — порядок один для RU и EN по построению.

  // Порядок не смеет зависеть и от порядка вставки в Map (иначе он «дрожал» бы между
  // загрузками): та же карта, собранная в обратном порядке, обязана дать тот же ответ.
  const reversed = sortMyDims(new Map([['a', 0], ['d', 7], ['c', 7], ['b', 10]]));
  assert.deepEqual(reversed, mine, 'порядок вставки не должен влиять');
});

test('поиск ищет на обоих языках сразу', () => {
  assert.deepEqual(searchIndex(index, 'такси'), ['b']);
  assert.deepEqual(searchIndex(index, 'queen'), ['c']);
  assert.deepEqual(searchIndex(index, 'ЛОЛ'), ['a'], 'регистр не должен мешать');
  assert.deepEqual(searchIndex(index, '   '), [], 'пустой запрос ничего не ищет');
});

test('бейдж «Новое» живёт две недели и не выдумывается', () => {
  const now = Date.UTC(2026, 6, 12);
  // Бой (Admin SDK): Timestamp как { seconds }. Стенд: плоское число. Оба обличья — настоящие.
  const prod = (n: number) => ({ time: { created: { seconds: (now - n * 86_400_000) / 1000 } } });
  const stand = (n: number) => ({ created: now - n * 86_400_000 });

  assert.equal(isNewDim(prod(3), now), true, 'три дня — новое');
  assert.equal(isNewDim(prod(13), now), true, 'тринадцать дней — ещё новое');
  assert.equal(isNewDim(prod(15), now), false, 'пятнадцать дней — уже не новое');
  assert.equal(isNewDim(stand(2), now), true, 'форма стенда тоже понимается');
  assert.equal(isNewDim(stand(30), now), false);
  assert.equal(isNewDim(undefined, now), false, 'нет даты — новизну НЕ выдумываем');
  assert.equal(isNewDim({}, now), false);
});

test('имя карточки: грязь 1.x «„Название" (год)» не задваивается на экране', () => {
  // Настоящая грязь боевого каталога: люди заводили измерения в уже оформленном виде,
  // и на проде выходило ««Алхимик» (1988)» (1988). Правим показ, не данные.
  assert.deepEqual(dimCardTitle('«Алхимик» (1988)', '1988'), { name: 'Алхимик', year: '1988' });
  assert.deepEqual(dimCardTitle('«Таксист» (1976)', 1976), { name: 'Таксист', year: '1976' }, 'год-число со стенда');
  assert.deepEqual(dimCardTitle('«Таксист» (1976)', null), { name: 'Таксист', year: '1976' }, 'год вынимается из имени');
});

test('имя карточки: чистые данные и внутренние кавычки не трогаются', () => {
  assert.deepEqual(dimCardTitle('Вива, Сапата!', '1952'), { name: 'Вива, Сапата!', year: '1952' });
  assert.deepEqual(dimCardTitle('Театр', null), { name: 'Театр', year: null });
  assert.deepEqual(
    dimCardTitle('Сериал «Друзья»', null),
    { name: 'Сериал «Друзья»', year: null },
    'кавычки внутри имени — не обрамление',
  );
  assert.deepEqual(
    dimCardTitle('«А» и «Б»', null),
    { name: '«А» и «Б»', year: null },
    'первая закрывающая кавычка не в конце — обрамления нет',
  );
  assert.deepEqual(
    dimCardTitle('Восстание (2049)', '1999'),
    { name: 'Восстание (2049)', year: '1999' },
    'год в имени не совпал с полем — не выдумываем, показываем как есть',
  );
});

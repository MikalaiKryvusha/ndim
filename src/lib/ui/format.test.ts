/**
 * Русская морфология на лице продукта.
 *
 * Здесь проверяется то, чего браузер сделать не может, а человек замечает мгновенно: падежи.
 * `toLocaleDateString` знает дату, но не знает ФРАЗУ, в которую её ставят, — и потому всегда
 * даёт именительный падеж.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { monthYearSince } from './format.ts';

// День берём из середины месяца: так перевод UTC → местное время не утащит дату в соседний месяц.
const midMonth = (year: number, month: number) => new Date(year, month, 15).getTime();

test('«В Пространстве с …»: месяц в РОДИТЕЛЬНОМ падеже, а не в именительном', () => {
  // Поймано владельцем на боевом выкате 2026-07-12: в профиле стояло
  // «В Пространстве с феврал_ь_ 2025 г.» — так по-русски не говорят.
  const value = monthYearSince(midMonth(2025, 1), 'ru');

  assert.equal(value, 'февраля 2025 г.');
  assert.doesNotMatch(value, /февраль/, 'именительный падеж после предлога «с» — это ошибка');
});

test('склоняются все двенадцать месяцев', () => {
  const expected = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ];

  for (let month = 0; month < 12; month += 1) {
    assert.equal(monthYearSince(midMonth(2025, month), 'ru'), `${expected[month]} 2025 г.`);
  }
});

test('в английском падежей нет — месяц остаётся как есть', () => {
  assert.equal(monthYearSince(midMonth(2025, 1), 'en'), 'February 2025');
});

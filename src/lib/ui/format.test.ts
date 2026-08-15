/**
 * Русская морфология на лице продукта.
 *
 * Здесь проверяется то, чего браузер сделать не может, а человек замечает мгновенно: падежи.
 * `toLocaleDateString` знает дату, но не знает ФРАЗУ, в которую её ставят, — и потому всегда
 * даёт именительный падеж.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ageAt, bornWithAge, monthYearSince, versionLabel, yearsUnit } from './format.ts';

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

// ── Возраст в чужой карточке связи (bugs/46) ────────────────────────────────
//
// Возраст — единственное число раскрытой карточки, которое НЕ приходит из базы, а считается
// на месте. Ошибка на год выглядит как враньё продукта, поэтому проверяются именно границы:
// день рождения вчера / сегодня / завтра.

const born = (year: number | null, month: number | null, day: number | null) => ({ year, month, day });
const at = (year: number, month: number, day: number) => new Date(year, month - 1, day).getTime();

test('возраст: день рождения уже прошёл в этом году', () => {
  assert.equal(ageAt(born(1986, 5, 13), at(2026, 7, 26)), 40);
});

test('возраст: день рождения в этом году ещё НЕ наступил — минус год', () => {
  assert.equal(ageAt(born(1986, 12, 13), at(2026, 7, 26)), 39);
});

test('возраст: границы «вчера · сегодня · завтра»', () => {
  // Сегодня исполнилось — возраст уже новый; завтра исполнится — ещё старый.
  assert.equal(ageAt(born(2000, 7, 25), at(2026, 7, 26)), 26, 'вчера');
  assert.equal(ageAt(born(2000, 7, 26), at(2026, 7, 26)), 26, 'сегодня');
  assert.equal(ageAt(born(2000, 7, 27), at(2026, 7, 26)), 25, 'завтра');
});

test('возраст: неполная дата НЕ достраивается — возраста нет', () => {
  // Человек вправе указать только год (BirthDate). Достроить месяц и день — значит выдумать
  // число; 1.x в этом случае считал от декабря предыдущего года и врал.
  assert.equal(ageAt(born(1986, null, null), at(2026, 7, 26)), null);
  assert.equal(ageAt(born(1986, 5, null), at(2026, 7, 26)), null);
  assert.equal(ageAt(born(null, null, null), at(2026, 7, 26)), null);
});

test('склонение возраста — формы 1.x (getAgeWord)', () => {
  assert.equal(yearsUnit(1, 'ru'), 'год');
  assert.equal(yearsUnit(21, 'ru'), 'год');
  assert.equal(yearsUnit(2, 'ru'), 'года');
  assert.equal(yearsUnit(34, 'ru'), 'года');
  assert.equal(yearsUnit(5, 'ru'), 'лет');
  assert.equal(yearsUnit(11, 'ru'), 'лет', '11…14 — исключение: «одиннадцать лет», не «год»');
  assert.equal(yearsUnit(12, 'ru'), 'лет');
  assert.equal(yearsUnit(14, 'ru'), 'лет');
  assert.equal(yearsUnit(40, 'ru'), 'лет');
  assert.equal(yearsUnit(1, 'en'), 'year old');
  assert.equal(yearsUnit(40, 'en'), 'years old');
});

test('день рождения целиком: «13 мая 1986 г. (40 лет)» — форма 1.x', () => {
  assert.equal(bornWithAge(born(1986, 5, 13), 'ru', at(2026, 7, 26)), '13 мая 1986 г. (40 лет)');
  assert.equal(bornWithAge(born(1986, 5, 13), 'en', at(2026, 7, 26)), 'May 13, 1986 (40 years old)');
});

test('день рождения: только год — показываем год без возраста, а не пустоту и не догадку', () => {
  assert.equal(bornWithAge(born(1986, null, null), 'ru', at(2026, 7, 26)), '1986');
});

test('день рождения не заполнен — строки на экране нет вовсе', () => {
  assert.equal(bornWithAge(born(null, null, null), 'ru', at(2026, 7, 26)), null);
});

/**
 * Версия на лице продукта. Два правила владельца (2026-07-27), каждое со своим стражем:
 * патч-ноль не пишем, номер сборки — в скобках. Мутации, которые эти тесты обязаны ловить:
 * оставить `2.0.0`; потерять скобки; напечатать `dev`; срезать патч у ненулевого `2.0.3`.
 */
test('версия: нулевой патч не пишем, номер сборки — в скобках', () => {
  assert.equal(versionLabel('2.0.0', 123), '2.0 (123)');
  assert.equal(versionLabel('0.2.0', 17), '0.2 (17)');
});

test('версия: ненулевой патч остаётся целиком', () => {
  assert.equal(versionLabel('2.0.3', 7), '2.0.3 (7)');
  assert.equal(versionLabel('2.10.0', 5), '2.10 (5)');
});

test('версия: номера сборки нет — нет и скобок (а не слово «dev»)', () => {
  assert.equal(versionLabel('2.0.0', null), '2.0');
  assert.equal(versionLabel('2.0.0'), '2.0');
  assert.equal(versionLabel('2.0.0', 0), '2.0');
  // Строка из окружения тоже считается числом: Docker передаёт SYNC_BUILD строкой.
  assert.equal(versionLabel('0.2.0', '17'), '0.2 (17)');
  assert.equal(versionLabel('0.2.0', 'dev'), '0.2');
});

/**
 * СТРАЖ ПРАВИЛА ОЦЕНОК — строки 1 и 2 таблицы стражей `plans/36`, шаг 5.
 *
 * Мутации, которые эти тесты обязаны ронять (и роняют — проверено):
 *   · «звёзды при `rates` = 0» — подставить измерение с нулём и ждать звёзд;
 *   · «счётчик при `rates` < 3» — подставить `rates` = 2.
 *
 * Проверяется не только функция, но и ВЕСЬ боевой срез: правило существует ради каталога, а не
 * ради красивого юнита. Числа 1873 / 3238 / **526** сняты по бою (третье исправлено 2026-08-03:
 * стояло 892 — ошибка счёта, разошедшаяся по семи документам; см. врезку в `dims-rating.ts`).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ratingView, STARS_FROM, RATER_COUNT_FROM } from './dims-rating.ts';
import slice from './dims-slice.json' with { type: 'json' };

test('нет голосов — нет звёзд (две трети каталога)', () => {
  const v = ratingView(0);
  assert.equal(v.showStars, false, 'ноль означает «не оценивали», а не «оценили на ноль»');
  assert.equal(v.showRaterCount, false);
});

test('один голос — звёзды есть, счётчика нет', () => {
  const v = ratingView(1);
  assert.equal(v.showStars, true);
  assert.equal(v.showRaterCount, false, 'при одном голосе счётчик выдал бы, что человек один');
});

test('два голоса — всё ещё без счётчика', () => {
  assert.deepEqual(ratingView(2), { showStars: true, showRaterCount: false });
});

test('три голоса — показываем и звёзды, и счётчик', () => {
  assert.deepEqual(ratingView(3), { showStars: true, showRaterCount: true });
});

test('пороги именно такие, какие выбрал владелец', () => {
  assert.equal(STARS_FROM, 1, 'интервью №022 В1 = А');
  assert.equal(RATER_COUNT_FROM, 3, 'интервью №021 В1');
});

test('счётчик НИКОГДА не показывается без звёзд', () => {
  // Инвариант формы: «оценили: 5» без самой оценки — бессмысленная строка на публичной странице.
  for (let n = -3; n <= 30; n += 1) {
    const v = ratingView(n);
    if (v.showRaterCount) assert.equal(v.showStars, true, `сломалось на rates=${n}`);
  }
});

test('битое значение ведёт себя как «оценок нет», а не как «показать звёзды»', () => {
  // Каталог — ВНЕШНИЕ данные: типы у нас, а числа приезжают из Firestore.
  // 🔴 `Infinity` здесь не украшение, а ЕДИНСТВЕННЫЙ случай, который отличает защиту от её
  // отсутствия: `NaN >= 1` и `-1 >= 1` ложны и без неё, а `Infinity >= 1` — истинно, и битое
  // поле показало бы звёзды. Первая редакция теста писала `Infinity * 0` (это NaN) и мутацию
  // «защиту убрали» НЕ ловила.
  for (const bad of [NaN, -1, -0.5, Infinity, -Infinity]) {
    assert.equal(ratingView(bad as number).showStars, false, `сломалось на ${bad}`);
    assert.equal(ratingView(bad as number).showRaterCount, false, `сломалось на ${bad}`);
  }
  assert.equal(ratingView(0.9).showStars, false, 'дробное меньше единицы — это ещё ноль голосов');
  assert.equal(ratingView(2.9).showRaterCount, false, 'дробное меньше трёх — счётчика нет');
});

test('на РЕАЛЬНОМ срезе каталога правило не даёт ни одной неправды', () => {
  const dims = slice as readonly { rates: number; rating: number; title: { ru: string } }[];
  let zero = 0;
  for (const d of dims) {
    const v = ratingView(d.rates);
    if (d.rates === 0) {
      zero += 1;
      assert.equal(v.showStars, false, `«${d.title.ru}» без голосов, а звёзды показаны`);
      assert.equal(d.rating, 0, 'у измерения без голосов средняя обязана быть нулём');
    }
    if (v.showStars) assert.ok(d.rating > 0, `«${d.title.ru}»: звёзды есть, а средняя ${d.rating}`);
    if (v.showRaterCount) assert.ok(d.rates >= 3);
  }
  assert.ok(zero > 0, 'в срезе обязаны быть измерения без голосов — иначе тест ничего не проверил');
});

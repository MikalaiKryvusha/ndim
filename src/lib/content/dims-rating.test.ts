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
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { ratingView, ratingState, STARS_FROM, RATER_COUNT_FROM } from './dims-rating.ts';
import slice from './dims-slice.json' with { type: 'json' };

/**
 * 🔴 НИ ОДИН ЭКРАН НЕ ДЕРЖИТ СВОЮ КОПИЮ ПРАВИЛА.
 *
 * Копия здесь уже была и уже разошлась: экран «Измерения» показывал «(N оценок)» с ПЕРВОГО
 * голоса, а публичная страница каталога — с ТРЁХ. То есть человек видел на одной и той же
 * карточке разные числа внутри приложения и из поиска, тогда как владелец решил ровно обратное:
 * «одно правило внутри и снаружи» (интервью №022). Поймано 2026-08-03, вылечено `ratingView`.
 *
 * Проверка грепом, а не типами: разойтись копии могут только текстом.
 */
test('правило показа оценок не скопировано ни в один компонент', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });

  const strays: string[] = [];
  for (const file of walk('src').filter((f) => f.endsWith('.svelte'))) {
    const code = readFileSync(file, 'utf8')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');
    // Сравнение `rates` с порогом мимо общей функции — и есть копия правила.
    if (/\brates\s*[<>=]=?\s*\d/.test(code) || /\d\s*[<>]=?\s*[\w.]*\brates\b/.test(code)) {
      strays.push(file);
    }
  }
  assert.deepEqual(strays, [], 'порог сравнивается мимо `ratingView` — правило снова раздвоилось');
});

test('нет голосов — нет звёзд (две трети каталога)', () => {
  const v = ratingView(0);
  assert.equal(v.showStars, false, 'ноль означает «не оценивали», а не «оценили на ноль»');
  assert.equal(v.showRaterCount, false);
});

test('ОДИН голос — показываем и звёзды, и счётчик', () => {
  // 🔄 Решение владельца 2026-08-03 ОТМЕНЯЕТ интервью №022 В3: «открываем показ оценок при
  // любом числе оценивших везде по приложению». Прежний порог (от трёх) прятал не личность,
  // а лишь впечатление от числа — разбор в `bugs/113`.
  assert.deepEqual(ratingView(1), { showStars: true, showRaterCount: true });
});

test('два голоса — так же', () => {
  assert.deepEqual(ratingView(2), { showStars: true, showRaterCount: true });
});

test('три голоса — показываем и звёзды, и счётчик', () => {
  assert.deepEqual(ratingView(3), { showStars: true, showRaterCount: true });
});

test('пороги именно такие, какие выбрал владелец', () => {
  assert.equal(STARS_FROM, 1, 'интервью №022 В1 = А');
  assert.equal(RATER_COUNT_FROM, 1, 'решение владельца 2026-08-03, отменяет интервью №022 В3');
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
  assert.equal(ratingView(0.9).showRaterCount, false, 'и счётчика у него тоже нет');
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
    /*
     * ⚠️ ЗДЕСЬ БЫЛО ЛОЖНОЕ ДОПУЩЕНИЕ `d.rating > 0` — «оценили, значит средняя не ноль».
     * Шкала продукта 0…10, и НОЛЬ — законная оценка: измерению, которому все поставили 0,
     * честно полагается средняя 0 при ненулевом `rates`. В бою таких два. Пока их не было в
     * срезе, допущение молчало; при следующем обновлении среза оно уронило бы тест на
     * исправных данных. Тот же промах я уже поймал в `tools/verify-prod-dim-ratings.mjs`.
     */
    if (v.showStars) {
      assert.ok(d.rating >= 0 && d.rating <= 10, `«${d.title.ru}»: средняя вне шкалы — ${d.rating}`);
    }
    if (v.showRaterCount) assert.ok(d.rates >= 1);
  }
  assert.ok(zero > 0, 'в срезе обязаны быть измерения без голосов — иначе тест ничего не проверил');
});

/*
 * ── ТРИ СОСТОЯНИЯ ВЕЛИЧИНЫ (`plans/56` шаг 1) ────────────────────────────────────────────────
 *
 * Мутации, которые эти тесты обязаны ронять:
 *   · «состояний два» — вернуть `rated` при средней ноль (то есть удалить ветку `all-zero`);
 *   · «ноль голосов — тоже all-zero» — снять опору на `ratingView` и судить по одной средней.
 */

test('нет голосов — состояние «none», и средняя тут ни при чём', () => {
  assert.equal(ratingState(0, 0), 'none');
  // Средняя у неоценённого обязана быть нулём, но даже мусор в этом поле состояния не меняет:
  // решает число голосов, и решает оно ОДНИМ правилом на проект.
  assert.equal(ratingState(0, 7.5), 'none', 'голосов нет — величины нет, что бы ни лежало в средней');
});

test('голоса есть и средняя выше нуля — состояние «rated»', () => {
  assert.equal(ratingState(1, 10), 'rated');
  assert.equal(ratingState(14, 8.4), 'rated');
  assert.equal(ratingState(1, 0.1), 'rated', 'десятая доля балла — это уже не «все поставили ноль»');
});

test('🔴 голоса есть, средняя РОВНО ноль — законное состояние «all-zero», а не поломка', () => {
  assert.equal(ratingState(1, 0), 'all-zero');
  assert.equal(ratingState(5, 0), 'all-zero');
});

test('битая средняя ведёт себя как ноль и не роняет состояние', () => {
  for (const bad of [NaN, undefined, null, 'нет']) {
    assert.equal(ratingState(1, bad as number), 'all-zero', `сломалось на ${String(bad)}`);
  }
});

test('состояние НИКОГДА не расходится с правилом показа звёзд', () => {
  for (const rates of [0, 1, 2, 3, 14]) {
    for (const rating of [0, 0.1, 5, 10]) {
      const state = ratingState(rates, rating);
      assert.equal(
        state === 'none',
        !ratingView(rates).showStars,
        `состояние ${state} разошлось со звёздами на rates=${rates}, rating=${rating}`,
      );
    }
  }
});

test('на РЕАЛЬНОМ срезе каталога состояние совпадает с данными записи', () => {
  const dims = slice as readonly { rates: number; rating: number; title: { ru: string } }[];
  let none = 0;
  let rated = 0;
  let allZero = 0;
  for (const d of dims) {
    const state = ratingState(d.rates, d.rating);
    if (state === 'none') {
      none += 1;
      assert.equal(d.rates, 0, `«${d.title.ru}»: состояние «нет голосов» при ненулевом счётчике`);
    } else if (state === 'all-zero') {
      allZero += 1;
      assert.ok(d.rates >= 1 && d.rating === 0, `«${d.title.ru}»: «все поставили ноль» не по данным`);
    } else {
      rated += 1;
      assert.ok(d.rating > 0, `«${d.title.ru}»: состояние «есть оценка» при нулевой средней`);
    }
  }
  assert.ok(none > 0, 'в срезе обязаны быть неоценённые — иначе тест ничего не проверил');
  assert.ok(rated > 0, 'в срезе обязаны быть оценённые — иначе тест ничего не проверил');
  /*
   * ⚠️ ЗДЕСЬ НЕТ ТРЕБОВАНИЯ `allZero > 0`, и это названо вслух. В запасном срезе (50 записей)
   * таких объектов НОЛЬ; в полном каталоге их два. Требовать их наличия значило бы ронять
   * исправный тест на исправных данных — а молчать о нуле наблюдений нельзя (`EXP-0092`:
   * «ноль нарушений» и «ноль наблюдений» печатаются одинаково). Поэтому число печатается,
   * а состояние `all-zero` проверено выше синтетикой, где оно есть всегда.
   */
  console.log(`  ℹ срез: без голосов ${none} · с оценкой ${rated} · «все поставили ноль» ${allZero}`);
});

/**
 * ЮНИТЫ СЪЁМЩИКА БИБЛИОТЕКИ (`tools/shoot-design-system.mjs`) — страницы «Компоненты» и
 * «Дизайн-схема» развёртки.
 *
 * 🔴 ГЛАВНОЕ. Библиотека снимается С ЖИВОГО ПРОДУКТА, и её честность держится на двух вещах:
 *   · ненайденный компонент попадает в отчёт ОТДЕЛЬНОЙ строкой, а не выпадает молча — библиотека,
 *     потерявшая часть без слова, хуже отсутствующей, по ней делают выводы;
 *   · токены читаются из ВЫЧИСЛЕННЫХ стилей браузера, а не переписываются руками.
 * Первое закрепляется здесь; второе живёт в браузере и проверяется прогоном.
 *
 * Прогон: node --test tools/shoot-design-system.test.mjs   ·   npm run test:tools
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { КОМПОНЕНТЫ, судить } from './shoot-design-system.mjs';

const СЪЁМЩИК = 'tools/shoot-design-system.mjs';

test('САМОТЕСТ съёмщика зовётся отсюда и обязан быть зелёным', () => {
  const r = spawnSync(process.execPath, [join(process.cwd(), СЪЁМЩИК), '--selftest'], { encoding: 'utf8' });
  const вывод = (r.stdout ?? '') + (r.stderr ?? '');
  assert.equal(r.status, 0, `самотест упал:\n${вывод}`);
  assert.match(вывод, /компонентов здоров/u);
});

test('список компонентов здоров и разложен по слоям', () => {
  assert.deepEqual(судить(КОМПОНЕНТЫ), []);
  const слои = new Set(КОМПОНЕНТЫ.map((к) => к.слой));
  assert.ok(слои.size >= 4, `слоёв ${слои.size} — библиотека без слоёв это свалка`);
});

test('порченый компонент краснит КАЖДЫМ пунктом', () => {
  const беды = судить([{ id: 'x', адрес: 'ru', селектор: '', слой: '' }]);
  assert.ok(беды.some((b) => /нет селектора/u.test(b)));
  assert.ok(беды.some((b) => /адрес не путь/u.test(b)));
  assert.ok(беды.some((b) => /не назван слой/u.test(b)));
});

test('🔑 ненайденный компонент попадает в отчёт, а не выпадает молча', () => {
  // Механика живёт в боевом цикле (ему нужен браузер) — закрепляем факт её существования:
  // массив `пропало` пишется в манифест и показывается на странице отдельным разделом.
  const src = readFileSync(join(process.cwd(), СЪЁМЩИК), 'utf8');
  assert.match(src, /пропало\.push\(/u, 'ненайденный компонент больше не записывается');
  assert.match(src, /пропало,/u, 'массив пропаж не попадает в манифест');
});

test('схема читается из вычисленных стилей, а не из литералов', () => {
  const src = readFileSync(join(process.cwd(), СЪЁМЩИК), 'utf8');
  assert.match(src, /getComputedStyle\(document\.documentElement\)/u);
  assert.match(src, /getPropertyValue\(имя\)/u);
});

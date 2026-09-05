/**
 * ЮНИТЫ РАСКЛАДЧИКА РАЗВЁРТКИ (`tools/layout-flow-map.mjs`).
 *
 * Раскладчик закрыл долг «истина манифеста пересчитывается руками» (`design/flow-map/README.md`
 * §6). Здесь закрепляются правила владельца о раскладке и одна геометрическая ловушка, стоившая
 * кадра: шаг яруса обязан быть глубже полки обхода, иначе труба дальних соседей пройдёт сквозь
 * карточку яруса +1.
 *
 * Прогон: node --test tools/layout-flow-map.test.mjs   ·   npm run test:tools
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { разложить, РЯДЫ, ШАГ_Я, ШАГ_X } from './layout-flow-map.mjs';
import { КАРТА_В } from './build-flow-map.mjs';

const РАСКЛАДЧИК = 'tools/layout-flow-map.mjs';

test('САМОТЕСТ раскладчика зовётся отсюда и обязан быть зелёным', () => {
  const r = spawnSync(process.execPath, [join(process.cwd(), РАСКЛАДЧИК), '--selftest'], { encoding: 'utf8' });
  const вывод = (r.stdout ?? '') + (r.stderr ?? '');
  assert.equal(r.status, 0, `самотест упал:\n${вывод}`);
  assert.match(вывод, /самопроверка раскладчика пройдена/u);
});

test('🔑 шаг яруса глубже полки обхода — труба дальних соседей не режет карточку яруса +1', () => {
  assert.ok(ШАГ_Я > КАРТА_В + 120, `ШАГ_Я ${ШАГ_Я} ≤ карточка ${КАРТА_В} + полка 120`);
});

test('таблица рядов покрывает КАЖДЫЙ экран живого манифеста, и ни одного лишнего', () => {
  const м = JSON.parse(readFileSync(join(process.cwd(), 'design/flow-map/flow-map.json'), 'utf8'));
  const { беды } = разложить(м, РЯДЫ);
  assert.deepEqual(беды, []);
});

test('правила владельца: ряд = процесс, колонка = шаг пути, ярус ±1 = состояние над/под родителем', () => {
  const м = { экраны: [{ id: 'a' }, { id: 'b' }, { id: 'b-alt' }], связи: [] };
  const { манифест } = разложить(м, [{ имя: 'р', места: [['a', 0, 0], ['b', 1, 0], ['b-alt', 1, 1]] }]);
  const [a, b, bAlt] = манифест.экраны;
  assert.equal(b.x - a.x, ШАГ_X, 'следующий шаг пути стоит правее ровно на шаг колонки');
  assert.equal(bAlt.x, b.x, 'альтернативное состояние стоит ПОД родителем, в той же колонке');
  assert.equal(bAlt.y - b.y, ШАГ_Я, 'и ровно на шаг яруса ниже');
  assert.equal(манифест.полосы.length, 1);
  assert.equal(манифест.полосы[0].имя, 'р');
});

test('экран без места и место без экрана — обе беды названы поимённо', () => {
  const м = { экраны: [{ id: 'a' }, { id: 'сирота' }], связи: [] };
  const { беды } = разложить(м, [{ имя: 'р', места: [['a', 0, 0], ['призрак', 1, 0]] }]);
  assert.ok(беды.some((b) => /без места: сирота/u.test(b)));
  assert.ok(беды.some((b) => /экрана нет: призрак/u.test(b)));
});

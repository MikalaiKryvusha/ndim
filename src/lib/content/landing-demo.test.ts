/**
 * Материал теста на совместимость — сверка с живым каталогом (`plans/106` Д1).
 *
 * 🔴 Каждый объект демо обязан быть НАСТОЯЩИМ измерением каталога (№096 В8 = А): звезда из демо
 * уезжает в NDim ID гостя под этим id. Снимок в `landing-demo.ts` сверяется с полным каталогом
 * сборки `dims-build.json`; без него (чистый клон, файл вне git) проверка говорит, что пропущена,
 * — а не зеленеет молча.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { DEMO_ITEMS, DEMO_PERSONAS } from './landing-demo.ts';

const BUILD = new URL('./dims-build.json', import.meta.url);

test('в демо до десяти объектов, id уникальны', () => {
  assert.ok(DEMO_ITEMS.length >= 5 && DEMO_ITEMS.length <= 10);
  assert.equal(new Set(DEMO_ITEMS.map((d) => d.id)).size, DEMO_ITEMS.length);
});

test('персонажи оценивают только объекты демо, звёздами 1…10; Макс оценил не всё — Общность видна', () => {
  const ids = new Set(DEMO_ITEMS.map((d) => d.id));
  for (const p of DEMO_PERSONAS) {
    for (const [id, v] of Object.entries(p.ratings)) {
      assert.ok(ids.has(id), `${p.id}: «${id}» не из демо`);
      assert.ok(Number.isInteger(v) && v >= 1 && v <= 10, `${p.id}: оценка ${v}`);
    }
  }
  const max = DEMO_PERSONAS.find((p) => p.id === 'max');
  assert.ok(max && Object.keys(max.ratings).length < DEMO_ITEMS.length);
});

test('каждый объект демо — настоящая запись каталога, названия и вид совпадают', { skip: !existsSync(BUILD) && 'нет dims-build.json (полный каталог, вне git) — сверка с каталогом пропущена; получить: npm run build после node tools/fetch-dims-slice.mjs --all' }, () => {
  const dims = JSON.parse(readFileSync(BUILD, 'utf8')) as Array<{ id: string; slug: string; title: { ru: string; en: string } }>;
  const byId = new Map(dims.map((d) => [d.id, d]));
  for (const item of DEMO_ITEMS) {
    const d = byId.get(item.id);
    assert.ok(d, `нет в каталоге: ${item.title.ru} (${item.id})`);
    assert.equal(d.title.ru, item.title.ru);
    assert.equal(d.title.en, item.title.en);
    assert.equal(d.slug, item.slug);
  }
});

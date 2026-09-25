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

/*
 * ПРАКТИКИ ТЕСТА ОТБИРАЮТ ГОЛОСА ЛЮДЕЙ, А НЕ ВКУС АГЕНТА (2026-09-25).
 * За один день агент дважды подменил голоса вкусом: «Путешествия» (3 голоса) вместо «Секса» (11) и «Велоспорт» (6) вместо
 * «Употребления алкогольных напитков» (7); оба раза нашёл суд. Затем владелец сказал о тесте на главной: «давай уберем
 * сенситив темы, оставим добрые и одобряемые» (интервью №097) — сенситивные практики объявлены в `SENSITIVE_PRACTICES`.
 * Правило теперь стережёт этот тест: практики демо = самые оцениваемые практики каталога без сенситивных, в порядке
 * голосов, при равных голосах — по NDim Space Rating.
 */
test('практики теста — самые оцениваемые практики каталога без сенситивных, по голосам, при равенстве по NDSR', { skip: !existsSync(BUILD) && 'нет dims-build.json — сверка с каталогом пропущена' }, async () => {
  const { kindKeyOf } = await import('./dim-kind.ts');
  const { SENSITIVE_PRACTICES } = await import('./landing-demo.ts');
  const dims = JSON.parse(readFileSync(BUILD, 'utf8')) as Array<{ id: string; type?: { ru?: string; en?: string }; rates: number; rating: number | null }>;
  const practices = dims.filter((d) => kindKeyOf(d.type) === 'practice');
  // Контроль прибора: практик в каталоге сотни; ноль значил бы «смотрю не туда».
  assert.ok(practices.length > 100, `практик в каталоге ${practices.length} — сверка смотрит не туда`);
  const inDemo = DEMO_ITEMS.filter((d) => d.kind === 'practice').map((d) => d.id);
  const expected = practices
    .filter((d) => !SENSITIVE_PRACTICES.includes(d.id))
    .sort((a, b) => b.rates - a.rates || (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, inDemo.length)
    .map((d) => d.id);
  assert.deepEqual(inDemo, expected, 'практики теста не совпадают с верхом по голосам без сенситивных');
  for (const id of SENSITIVE_PRACTICES) assert.ok(!DEMO_ITEMS.some((d) => d.id === id), `сенситивная практика ${id} в тесте`);
});

test('«Любит:» у каждого персонажа — его высшие оценки', () => {
  for (const p of DEMO_PERSONAS) {
    const lovedMin = Math.min(...p.loves.map((id) => p.ratings[id] ?? -1));
    const others = Object.entries(p.ratings).filter(([id]) => !p.loves.includes(id)).map(([, v]) => v);
    assert.ok(others.every((v) => v <= lovedMin), `${p.id}: «Любит» не высшие оценки (${lovedMin} при ${Math.max(...others)})`);
    assert.equal(p.ratings[p.favorite], Math.max(...Object.values(p.ratings)), `${p.id}: любимое — не высшая оценка`);
  }
});

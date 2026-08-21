/**
 * ЮНИТЫ ЧИСТОГО ЯДРА ПРИБОРА РАЗМЕТКИ (`tools/tag-dims-approval.mjs`, шаг 1 `plans/58`).
 *
 * Проверяется то, что можно проверить БЕЗ базы, эмулятора и сети: разбор по своду, соединение
 * записи каталога со сводом, предохранитель утечки в публичное поле, слияние облака тегов и
 * нарезка на пакеты. Живой прогон по каталогу — отдельная работа стенда; здесь границы.
 *
 * 🔴 Мутация плана («подменить порог так, чтобы копии считались чистыми») стоит здесь ОТДЕЛЬНЫМ
 * тестом: она обязана ронять сверку разбора со сводом, а не проходить молча.
 *
 * Запуск: node --test tools/tag-dims-approval.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { slugify } from '../src/lib/content/dim-slug.ts';
import {
  TECH_TAG,
  LIFECYCLE_TECH_TAGS,
  RUN_THRESHOLD,
  SERVICE_DOC_ID,
  BATCH_SIZE,
  isVerbatimCopy,
  isUnverified,
  classify,
  recordedClass,
  indexSvod,
  indexApprovedCandidates,
  matchSvod,
  leakedTechTag,
  techTagsFor,
  chunk,
  planCatalog,
  crossCheck,
} from './tag-dims-approval.mjs';

/** Запись свода в том виде, в каком её пишет `measure-wikipedia-overlap.mjs`. */
const запись = (slug, verdict, run) => ({ slug, verdict, run, улика: '', shingles: 0, error: null });

// ── РАЗБОР ОДНОЙ ЗАПИСИ ────────────────────────────────────────────────────────────────────

test('копия — это длинный ряд СВЯЗНОЙ речи, а не перечень имён и не ненайденная статья', () => {
  assert.equal(isVerbatimCopy(запись('a', 'copied', 28)), true);
  assert.equal(isVerbatimCopy(запись('a', 'names', 58)), false, 'перечень имён — не заимствование');
  assert.equal(isVerbatimCopy(запись('a', 'unverified', 0)), false);
  assert.equal(isVerbatimCopy(null), false);
});

test('порог ряда — граница, а не пожелание: 9 слов чисто, 10 уже копия', () => {
  assert.equal(isVerbatimCopy(запись('a', 'copied', RUN_THRESHOLD - 1)), false);
  assert.equal(isVerbatimCopy(запись('a', 'copied', RUN_THRESHOLD)), true);
});

test('«не проверено» — про поиск, а не про текст', () => {
  assert.equal(isUnverified(запись('a', 'unverified', 0)), true);
  assert.equal(isUnverified(запись('a', 'clean', 3)), false);
  assert.equal(isUnverified(undefined), false);
});

// ── КЛАСС ПО ДВУМ ЯЗЫКАМ ───────────────────────────────────────────────────────────────────

test('заимствование в ЛЮБОМ языке делает запись требующей правки', () => {
  assert.equal(classify({ ru: запись('a', 'copied', 28), en: запись('a', 'clean', 4) }), TECH_TAG.NEEDS_REWRITE);
  assert.equal(classify({ ru: запись('a', 'clean', 4), en: запись('a', 'copied', 50) }), TECH_TAG.NEEDS_REWRITE);
});

test('🔴 заимствование БЬЁТ «не проверено» — иначе известный дефект прятался бы за незнанием', () => {
  const entry = { ru: запись('a', 'unverified', 0), en: запись('a', 'copied', 20) };
  assert.equal(classify(entry), TECH_TAG.NEEDS_REWRITE);
  assert.equal(recordedClass(entry), TECH_TAG.NEEDS_REWRITE, 'ярлыки свода судят так же');
});

test('чистая запись принята миграцией, ненайденная — не проверена', () => {
  assert.equal(classify({ ru: запись('a', 'clean', 5), en: запись('a', 'clean', 7) }), TECH_TAG.MIGRATED);
  assert.equal(classify({ ru: запись('a', 'unverified', 0), en: запись('a', 'clean', 4) }), TECH_TAG.UNCHECKED);
});

test('класс у записи ровно один — классы взаимоисключающие', () => {
  const все = [
    { ru: запись('a', 'copied', 28), en: запись('a', 'unverified', 0) },
    { ru: запись('a', 'unverified', 0), en: запись('a', 'names', 12) },
    { ru: запись('a', 'clean', 2), en: запись('a', 'clean', 3) },
  ];
  for (const entry of все) {
    const cls = classify(entry);
    assert.equal(LIFECYCLE_TECH_TAGS.filter((t) => t === cls).length, 1);
  }
});

// ── МУТАЦИЯ ПЛАНА ──────────────────────────────────────────────────────────────────────────

test('🔴 МУТАЦИЯ: подменённый порог объявляет копию чистой — и сверка со сводом краснеет', () => {
  const свод = indexSvod({
    ru: [запись('film-aaaaaaaa', 'copied', 12), запись('book-bbbbbbbb', 'clean', 3)],
    en: [запись('film-aaaaaaaa', 'clean', 4), запись('book-bbbbbbbb', 'clean', 2)],
  });
  const dims = [
    { id: 'aaaaaaaa', title: { en: 'film' }, tags: [], techTags: [] },
    { id: 'bbbbbbbb', title: { en: 'book' }, tags: [], techTags: [] },
  ];

  const честно = planCatalog(dims, свод, RUN_THRESHOLD);
  assert.equal(честно.counts[TECH_TAG.NEEDS_REWRITE], 1);
  assert.equal(crossCheck(честно, dims.length).svodOk, true);

  const мутант = planCatalog(dims, свод, 30);
  assert.equal(мутант.counts[TECH_TAG.NEEDS_REWRITE], 0, 'числа разбора обязаны сдвинуться');
  assert.equal(мутант.counts[TECH_TAG.MIGRATED], 2);
  assert.equal(crossCheck(мутант, dims.length).svodOk, false, 'проверка обязана покраснеть');
  assert.equal(crossCheck(мутант, dims.length).sumOk, true, 'сумма при этом цела — краснеет именно сверка');
});

// ── СОЕДИНЕНИЕ СО СВОДОМ ───────────────────────────────────────────────────────────────────

test('запись соединяется со сводом по слагу — той же функцией, что слаг и родила', () => {
  const slug = slugify('The Matrix', 'z3jmk1ixQWERTY123456');
  const свод = indexSvod({ ru: [запись(slug, 'copied', 28)], en: [] });
  const hit = matchSvod({ id: 'z3jmk1ixQWERTY123456', title: { en: 'The Matrix' } }, свод);
  assert.equal(hit.via, 'слаг');
  assert.equal(hit.slug, slug);
});

test('название правили после снятия свода — запись находится по хвосту идентификатора', () => {
  const старый = slugify('The Matrix', 'z3jmk1ixQWERTY123456');
  const свод = indexSvod({ ru: [запись(старый, 'copied', 28)], en: [] });
  const hit = matchSvod({ id: 'z3jmk1ixQWERTY123456', title: { en: 'The Matrix (1999)' } }, свод);
  assert.equal(hit.via, 'хвост');
  assert.equal(hit.slug, старый);
});

test('🔴 записи, которой нет в своде, класс НЕ придумывается', () => {
  const свод = indexSvod({ ru: [запись('film-aaaaaaaa', 'clean', 1)], en: [] });
  assert.equal(matchSvod({ id: 'zzzzzzzz9999', title: { en: 'new' } }, свод), null);

  const plan = planCatalog([{ id: 'zzzzzzzz9999', title: { ru: 'Новинка' }, tags: [], techTags: [] }], свод);
  assert.equal(plan.rows.length, 0, 'ни одной разметки');
  assert.deepEqual(plan.unknown, [{ id: 'zzzzzzzz9999', title: 'Новинка' }]);
  assert.equal(Object.values(plan.counts).reduce((a, b) => a + b, 0), 0);
});

test('неоднозначный хвост не даёт классa — прибор не выбирает первую попавшуюся', () => {
  const свод = indexSvod({
    ru: [запись('one-aabbccdd', 'clean', 1), запись('two-aabbccdd', 'clean', 1)],
    en: [],
  });
  const hit = matchSvod({ id: 'aabbccddEEFF', title: { en: 'третье имя' } }, свод);
  assert.deepEqual(hit.ambiguous.sort(), ['one-aabbccdd', 'two-aabbccdd']);

  const plan = planCatalog([{ id: 'aabbccddEEFF', title: { en: 'третье имя' }, tags: [], techTags: [] }], свод);
  assert.equal(plan.rows.length, 0);
  assert.equal(plan.ambiguous.length, 1);
});

// ── ПРЕДОХРАНИТЕЛЬ УТЕЧКИ ──────────────────────────────────────────────────────────────────

test('🔴 служебное значение в ПУБЛИЧНОМ поле tags — находится, каким бы из трёх оно ни было', () => {
  for (const t of LIFECYCLE_TECH_TAGS) {
    assert.equal(leakedTechTag(['кино', 'драма', t]), t);
  }
  assert.equal(leakedTechTag(['кино', 'драма']), null);
  assert.equal(leakedTechTag([]), null);
  assert.equal(leakedTechTag(undefined), null);
});

// ── ОБЛАКО ТЕХНИЧЕСКИХ ТЕГОВ ───────────────────────────────────────────────────────────────

test('тег жизненного цикла добавляется, чужие технические теги сохраняются', () => {
  assert.deepEqual(techTagsFor([], TECH_TAG.MIGRATED), ['migrated']);
  assert.deepEqual(techTagsFor(['from-wikidata'], TECH_TAG.UNCHECKED), ['from-wikidata', 'unchecked']);
});

test('повторный прогон не пишет НИЧЕГО — квота записей не тратится на известное', () => {
  assert.equal(techTagsFor(['migrated'], TECH_TAG.MIGRATED), null);
  assert.equal(techTagsFor(['from-wikidata', 'unchecked'], TECH_TAG.UNCHECKED), null);
});

test('смена класса ЗАМЕНЯЕТ прежний тег цикла, а не копит их рядом', () => {
  assert.deepEqual(techTagsFor(['needs-rewrite'], TECH_TAG.MIGRATED), ['migrated']);
  assert.deepEqual(techTagsFor(['unchecked', 'from-wikidata'], TECH_TAG.NEEDS_REWRITE), [
    'from-wikidata',
    'needs-rewrite',
  ]);
});

// ── ПАКЕТЫ ЗАПИСИ ──────────────────────────────────────────────────────────────────────────

test('нарезка держит потолок пакета Firestore', () => {
  const items = Array.from({ length: BATCH_SIZE + 1 }, (_, i) => i);
  const пакеты = chunk(items);
  assert.equal(пакеты.length, 2);
  assert.equal(пакеты[0].length, BATCH_SIZE);
  assert.equal(пакеты[1].length, 1);
  assert.equal(chunk([]).length, 0);
});

// ── РАЗБОР КАТАЛОГА ЦЕЛИКОМ ────────────────────────────────────────────────────────────────

test('служебный документ каталога измерением не считается', () => {
  const свод = indexSvod({ ru: [запись('film-aaaaaaaa', 'clean', 1)], en: [] });
  const dims = [
    { id: SERVICE_DOC_ID, title: {}, tags: [], techTags: [] },
    { id: 'aaaaaaaa', title: { en: 'film' }, tags: [], techTags: [] },
  ];
  const plan = planCatalog(dims, свод);
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.unknown.length, 0, 'служебный документ не попадает и в «нет в своде»');
});

test('сумма разбора равна числу записей каталога — и краснеет, если разбор кого-то потерял', () => {
  const свод = indexSvod({
    ru: [запись('a-aaaaaaaa', 'copied', 20), запись('b-bbbbbbbb', 'unverified', 0), запись('c-cccccccc', 'clean', 2)],
    en: [],
  });
  const dims = [
    { id: 'aaaaaaaa', title: { en: 'a' }, tags: [], techTags: [] },
    { id: 'bbbbbbbb', title: { en: 'b' }, tags: [], techTags: [] },
    { id: 'cccccccc', title: { en: 'c' }, tags: [], techTags: [] },
    { id: 'dddddddd', title: { en: 'd' }, tags: [], techTags: [] },
  ];
  const plan = planCatalog(dims, свод);
  // Четвёртый счётчик нулевой намеренно: `owner-approved` приходит из очереди кандидатов,
  // а её здесь нет вовсе — значит и записи вне свода класса не получают.
  assert.deepEqual(plan.counts, { migrated: 1, 'needs-rewrite': 1, unchecked: 1, 'owner-approved': 0 });
  assert.equal(plan.unknown.length, 1, 'четвёртой записи в своде нет');

  const check = crossCheck(plan, dims.length);
  assert.equal(check.sumOk, true);
  assert.equal(check.svodOk, true);

  // Потеря записи разбором — то, ради чего проверка ① существует.
  const порченый = { ...plan, counts: { ...plan.counts, migrated: 0 } };
  assert.equal(crossCheck(порченый, dims.length).sumOk, false);
});

// ── ОДОБРЕНО ВЛАДЕЛЬЦЕМ: второй источник суждения (интервью №044, В4 = A) ───────────────────

/** Кандидат в том виде, в каком его пишет конвейер одобрения (`admin-dims.ts`). */
const кандидат = (id, status, approvedDimId) => ({ id, status, ...(approvedDimId ? { approvedDimId } : {}) });

test('одобренным считается ТОЛЬКО статус approved — прочие три не дают тега', () => {
  const index = indexApprovedCandidates([
    кандидат('wikidata-Q1', 'approved', 'dimAAA'),
    кандидат('wikidata-Q2', 'pending', 'dimBBB'),
    кандидат('wikidata-Q3', 'returned', 'dimCCC'),
    кандидат('wikidata-Q4', 'rejected', 'dimDDD'),
  ]);
  assert.equal(index.get('dimAAA'), 'wikidata-Q1');
  assert.equal(index.size, 1, 'возвращённый на доработку несёт адрес измерения, но одобрением не является');
});

test('кандидат без адреса рождённого измерения в указатель не идёт', () => {
  const index = indexApprovedCandidates([кандидат('wikidata-Q5', 'approved'), кандидат('wikidata-Q6', 'approved', '')]);
  assert.equal(index.size, 0);
});

test('🔴 запись вне свода с одобренным кандидатом получает owner-approved', () => {
  const свод = indexSvod({ ru: [запись('film-aaaaaaaa', 'clean', 1)], en: [] });
  const dims = [
    { id: 'aaaaaaaa', title: { en: 'film' }, tags: [], techTags: [] },
    { id: 'новаяЗапись01', title: { ru: 'Новинка' }, tags: [], techTags: [] },
  ];
  const approved = indexApprovedCandidates([кандидат('wikidata-Q7', 'approved', 'новаяЗапись01')]);

  const plan = planCatalog(dims, свод, RUN_THRESHOLD, approved);
  assert.equal(plan.counts[TECH_TAG.OWNER_APPROVED], 1);
  assert.equal(plan.unknown.length, 0, 'источник суждения нашёлся — в безымянные она не падает');
  const row = plan.rows.find((r) => r.id === 'новаяЗапись01');
  assert.equal(row.cls, TECH_TAG.OWNER_APPROVED);
  assert.equal(row.via, 'кандидат wikidata-Q7', 'основание названо: по какому кандидату судили');
});

test('запись вне свода с НЕодобренным кандидатом класса не получает', () => {
  const свод = indexSvod({ ru: [], en: [] });
  const dims = [{ id: 'новаяЗапись02', title: { ru: 'Ждёт вычитки' }, tags: [], techTags: [] }];
  const approved = indexApprovedCandidates([кандидат('wikidata-Q8', 'pending', 'новаяЗапись02')]);

  const plan = planCatalog(dims, свод, RUN_THRESHOLD, approved);
  assert.equal(plan.counts[TECH_TAG.OWNER_APPROVED], 0);
  assert.equal(plan.unknown.length, 1);
});

test('🔑 запись вне свода и без кандидата — это ручная форма комнаты, а не аномалия: класса нет', () => {
  /*
   * Измерение можно завести и минуя очередь кандидатов (`admin/dims/+page.svelte` зовёт
   * `createDim` напрямую). Отсутствие кандидата поэтому — утверждение о нашем ПОИСКЕ, а не о
   * том, что владелец записи не видел (`EXP-0165`). Машине судить нечем — решает человек.
   */
  const plan = planCatalog(
    [{ id: 'рукамиЗаведено', title: { ru: 'Заведено руками' }, tags: [], techTags: [] }],
    indexSvod({ ru: [], en: [] }),
    RUN_THRESHOLD,
    new Map(),
  );
  assert.equal(plan.rows.length, 0);
  assert.deepEqual(plan.unknown, [{ id: 'рукамиЗаведено', title: 'Заведено руками' }]);
});

test('owner-approved входит в сумму разбора и НЕ ломает сверку со сводом', () => {
  const свод = indexSvod({
    ru: [запись('film-aaaaaaaa', 'copied', 20)],
    en: [запись('film-aaaaaaaa', 'clean', 2)],
  });
  const dims = [
    { id: 'aaaaaaaa', title: { en: 'film' }, tags: [], techTags: [] },
    { id: 'новинка01', title: { ru: 'Новинка' }, tags: [], techTags: [] },
    { id: 'рукамиЗаведено', title: { ru: 'Руками' }, tags: [], techTags: [] },
  ];
  const approved = indexApprovedCandidates([кандидат('wikidata-Q9', 'approved', 'новинка01')]);

  const plan = planCatalog(dims, свод, RUN_THRESHOLD, approved);
  const check = crossCheck(plan, dims.length);
  assert.equal(plan.counts[TECH_TAG.NEEDS_REWRITE], 1);
  assert.equal(plan.counts[TECH_TAG.OWNER_APPROVED], 1);
  assert.equal(plan.unknown.length, 1);
  assert.equal(check.sumOk, true, '1 + 1 + 1 = 3 записи каталога');
  assert.equal(check.svodOk, true, 'сверка судит только классы, выведенные из свода');
});

test('смена класса на owner-approved заменяет прежний тег цикла', () => {
  assert.deepEqual(techTagsFor(['unchecked'], TECH_TAG.OWNER_APPROVED), ['owner-approved']);
  assert.equal(techTagsFor(['owner-approved'], TECH_TAG.OWNER_APPROVED), null, 'повтор не пишет');
});

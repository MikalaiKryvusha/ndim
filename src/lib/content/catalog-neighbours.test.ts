/**
 * СТРАЖ СОСЕДЕЙ ПО КАТАЛОГУ — `plans/48` шаг 4 (интервью №025, В7 = А).
 *
 * Мутации, которые эти тесты обязаны ронять:
 *   · вернуть ненулевой вес всеобщим тегам вида — «Матрица» снова получит в соседи первое по
 *     алфавиту, потому что все фильмы станут равны;
 *   · сделать десятилетие самостоятельным признаком — вернётся тот же алфавитный мусор, только
 *     через другое поле;
 *   · показать соседей в порядке убывания оценки соседства — это раскрытый ПОРЯДОК близости,
 *     запрещённый инвариантом владельца;
 *   · убрать запасной путь по году — 184 фильма без жанровых тегов останутся без соседей вовсе.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

import {
  NEIGHBOURS,
  neighboursOf,
  returnLostNeighbours,
  tagWeights,
  type NeighbourItem,
} from './catalog-neighbours.ts';
import { groupByKind } from './catalog-hub.ts';
import slice from './dims-slice.json' with { type: 'json' };

const item = (over: Partial<NeighbourItem> & { slug: string }): NeighbourItem => ({
  title: { ru: 'Название', en: 'Title' },
  author: { ru: '-', en: '-' },
  type: { ru: 'Фильм', en: 'Movie' },
  year: '2000',
  rates: 0,
  rating: 0,
  tags: [],
  ...over,
});

/** Каталог-фикстура: тег «фильм» есть у всех (значит бесполезен), «нуар» — у двоих. */
const POOL: NeighbourItem[] = [
  item({ slug: 'a-target', tags: ['фильм', 'нуар'], year: '1999', author: { ru: 'Реж', en: 'Dir' } }),
  item({ slug: 'b-noir', tags: ['фильм', 'нуар'], year: '1974' }),
  item({ slug: 'c-same-author', tags: ['фильм'], year: '2010', author: { ru: 'Реж', en: 'Dir' } }),
  ...Array.from({ length: 6 }, (_, i) =>
    item({ slug: `z-plain-${i}`, tags: ['фильм'], year: String(1998 + i) }),
  ),
];
const W = tagWeights(POOL);
const target = POOL[0];

test('🔴 всеобщий тег вида весит РОВНО НОЛЬ, редкий — больше нуля', () => {
  assert.equal(W.get('фильм'), 0, '«фильм» есть у всех девяти — он ни о чём не говорит');
  assert.ok((W.get('нуар') ?? 0) > 0, 'редкий тег обязан весить');
});

test('редкий общий тег и тот же автор дают соседство, а всеобщий тег — нет', () => {
  const got = neighboursOf(target, POOL, W, NEIGHBOURS).map((d) => d.slug);
  assert.ok(got.includes('b-noir'), 'общий редкий тег «нуар» — признак');
  assert.ok(got.includes('c-same-author'), 'тот же автор — признак');
  assert.ok(!got.includes('a-target'), 'объект не сосед сам себе');
});

test('🔴 десятилетие САМО ПО СЕБЕ соседом не делает — иначе вернётся алфавитный мусор', () => {
  // Все `z-plain-*` — те же девяностые/нулевые и тот же всеобщий тег. Признака у них нет.
  const scoredOnly = neighboursOf(target, POOL, W, 2).map((d) => d.slug);
  assert.deepEqual(scoredOnly.sort(), ['b-noir', 'c-same-author'].sort());
});

test('🔴 ПОРЯДОК ПОКАЗА НЕЙТРАЛЬНЫЙ (по слагу) — сила связи наружу не выходит', () => {
  const got = neighboursOf(target, POOL, W, NEIGHBOURS).map((d) => d.slug);
  assert.deepEqual(got, [...got].sort(), 'список обязан быть отсортирован по слагу');
  // Контроль фикстуры: по силе связи порядок был бы ДРУГИМ — «нуар» сильнее совпадения автора.
  // Без этой проверки тест был бы зелёным и на реализации, показывающей порядок близости.
  assert.ok(got.indexOf('b-noir') < got.indexOf('c-same-author'), 'по слагу b идёт раньше c');
});

test('запасной путь по году: объект без признаков всё равно получает соседей', () => {
  const lonely = item({ slug: 'x-lonely', tags: ['фильм'], year: '2000' });
  const got = neighboursOf(lonely, [lonely, ...POOL], W, 4);
  assert.equal(got.length, 4, 'блок не остаётся пустым');
  assert.ok(!got.some((d) => d.slug === 'x-lonely'));
  // Берутся БЛИЖАЙШИЕ по году, а не первые по алфавиту: 2000 → 1999/2001/1998/2002…
  const years = got.map((d) => Math.abs(Number(d.year) - 2000)).sort((a, b) => a - b);
  assert.ok(years[0] <= 1, `ближайший сосед по году должен быть рядом, а не в ${years[0]} годах`);
});

test('соседей не больше запрошенного и все они разные', () => {
  const got = neighboursOf(target, POOL, W, 3);
  assert.equal(got.length, 3);
  assert.equal(new Set(got.map((d) => d.slug)).size, 3);
});

test('🔴 возврат потерянных: объект, которого никто не выбрал, получает входящую ссылку', () => {
  const index = new Map<string, NeighbourItem[]>();
  const lost = item({ slug: 'z-lost' });
  const a = item({ slug: 'a-host' });
  const b = item({ slug: 'b-host' });
  // Потерянный знает соседей, но НИ ОДИН список не содержит его самого.
  index.set('z-lost', [a, b]);
  index.set('a-host', [b]);
  index.set('b-host', [a]);

  const returned = returnLostNeighbours(index, [lost, a, b]);
  assert.equal(returned, 1);
  const inbound = [...index.values()].flat().filter((n) => n.slug === 'z-lost').length;
  assert.equal(inbound, 1, 'после прохода на потерянного ссылается ровно один список');
  // Возврат идёт в КОРОТКИЙ список: у `a-host` и `b-host` длина 1, равенство разводит слаг.
  assert.ok(index.get('a-host')?.some((n) => n.slug === 'z-lost'));
  assert.deepEqual(
    index.get('a-host')?.map((n) => n.slug),
    ['b-host', 'z-lost'],
    'список остаётся отсортированным по слагу — порядок близости наружу не выходит',
  );
});

test('возврат потерянных идемпотентен: второй проход не возвращает никого', () => {
  const index = new Map<string, NeighbourItem[]>();
  const lost = item({ slug: 'z-lost' });
  const a = item({ slug: 'a-host' });
  index.set('z-lost', [a]);
  index.set('a-host', []);
  assert.equal(returnLostNeighbours(index, [lost, a]), 1);
  assert.equal(returnLostNeighbours(index, [lost, a]), 0, 'второй проход возвращать уже некого');
  assert.equal(returnLostNeighbours(index, [lost, a]), 0, 'и третий тоже — проход идемпотентен');
});

/** Живой каталог: правило существует ради 10 222 страниц, а не ради фикстуры из девяти строк. */
const BUILD = new URL('./dims-build.json', import.meta.url);
const full = existsSync(BUILD) ? (JSON.parse(readFileSync(BUILD, 'utf8')) as NeighbourItem[]) : null;

if (full) {
  test('боевой каталог: соседи есть у КАЖДОГО объекта, и их ровно восемь', () => {
    const { hubs, tail } = groupByKind(full);
    const weights = tagWeights(full);
    let checked = 0;
    for (const pool of [...hubs.values(), tail] as NeighbourItem[][]) {
      for (const d of pool) {
        const got = neighboursOf(d, pool, weights);
        // Пул меньше девяти объектов физически не даст восьми соседей — там проверяем «сколько есть».
        const want = Math.min(NEIGHBOURS, pool.length - 1);
        assert.equal(got.length, want, `${d.slug}: соседей ${got.length}, ожидалось ${want}`);
        assert.ok(!got.some((n) => n.slug === d.slug), `${d.slug}: сам себе сосед`);
        checked += 1;
      }
    }
    assert.equal(checked, full.length);
  });

  test('боевой каталог: сосед НИКОГДА не из чужого вида — слияние видов запрещено', () => {
    const { hubs } = groupByKind(full);
    const weights = tagWeights(full);
    const movies = (hubs.get('movie') ?? []) as NeighbourItem[];
    const slugs = new Set(movies.map((d) => d.slug));
    for (const d of movies.slice(0, 200)) {
      for (const n of neighboursOf(d, movies, weights)) {
        assert.ok(slugs.has(n.slug), `${d.slug}: сосед ${n.slug} не из хаба «Фильмы»`);
      }
    }
  });
}

test('запасной срез в git тоже обрабатывается без падений', () => {
  const pool = slice as unknown as NeighbourItem[];
  const weights = tagWeights(pool);
  assert.doesNotThrow(() => neighboursOf(pool[0], pool, weights));
});

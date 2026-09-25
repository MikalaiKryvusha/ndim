/**
 * ТЕСТЫ НАБОРА ДВИЖКА ТЕСТ (`plans/42`, шаг 3, такт Б; пул и случайная дюжина — №098 В2).
 *
 * Главное, что стерегут:
 *   · ПУЛ — 20 вещей по правилу владельца: самые оценённые, которые все любят (NDSR ≥ 8), одна
 *     вещь от серии, НИ ОДНОЙ сенситивной; на каталоге сборки константа = правилу;
 *   · ДЮЖИНА — 12 разных вещей пула, воспроизводимая затравкой (перетасовка без затравки была
 *     бы непроверяемой);
 *   · согласие длин набора с числами, обещанными текстами страниц.
 * Очередь второго человека пары («вещи первого») стережёт `model/test-pair.test.ts`.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  buildTestQueue,
  derivePool,
  isSensitive,
  kindLabelFor,
  poolQueue,
  rowLabel,
  seriesKey,
  shuffledIds,
  POOL_MIN_RATING,
  POOL_SIZE,
  TEST_POOL,
  TEST_TARGET,
  RATED_FACT_FROM,
} from './test-set.ts';
import { SENSITIVE_PRACTICES } from './landing-demo.ts';
import { landingFaq } from './landing-v1-copy.ts';
import { kindKeyOf, type KindKey } from './dim-kind.ts';
import { TESTS, TEST_SLUGS } from './test-copy.ts';
import type { DimPage } from './dims-source.ts';
// Запасной срез каталога (лежит в git) — тот же файл, на котором собирается сайт без боевой
// выгрузки; `dims-source.ts` сюда не импортируется (import.meta.glob не живёт под node --test).
import slice from './dims-slice.json' with { type: 'json' };

/** Полный каталог сборки — вне git; без него сверки с каталогом говорят, что пропущены. */
const BUILD = new URL('./dims-build.json', import.meta.url);
const NO_CATALOG = !existsSync(BUILD) && 'нет dims-build.json (полный каталог, вне git) — сверка пула с каталогом пропущена; получить: npm run build после node tools/fetch-dims-slice.mjs --all';
const catalog = (): DimPage[] => JSON.parse(readFileSync(BUILD, 'utf8')) as DimPage[];

const dim = (id: string, rates: number, over: Partial<DimPage> = {}): DimPage => ({
  id,
  slug: id,
  title: { ru: `«${id}»`, en: id },
  description: { ru: '', en: '' },
  type: { ru: 'Фильм', en: 'Movie' },
  author: { ru: '', en: '' },
  year: '2000',
  tags: [],
  rates,
  rating: 5,
  ...over,
});

test('очередь детерминирована: rates ↓, при равенстве id ↑', () => {
  const pool = [dim('b', 5), dim('a', 5), dim('c', 9), dim('d', 1)];
  const twice = [buildTestQueue(pool, 4), buildTestQueue([...pool].reverse(), 4)];
  for (const queue of twice) {
    assert.deepEqual(queue.map((e) => e.id), ['c', 'a', 'b', 'd']);
  }
});

test('карточка без имени на одном из языков или без вида в очередь не попадает', () => {
  const pool = [
    dim('named', 9),
    dim('no-en', 9, { title: { ru: '«Есть»', en: '  ' } }),
    dim('no-kind', 9, { type: { ru: '', en: '' } }),
  ];
  assert.deepEqual(buildTestQueue(pool, 3).map((e) => e.id), ['named']);
});

test('год «-» каталога означает «неизвестен» и в карточку не течёт', () => {
  const [entry] = buildTestQueue([dim('x', 1, { year: '-' })], 1);
  assert.equal(entry.year, '');
});

test('длины набора совпадают с числами, обещанными текстами страниц', () => {
  // Числа «12 вещей» / «7 вещей» стоят в строках фактов и шагов обеих локалей —
  // разъехавшаяся константа сделала бы обещание страницы неправдой.
  for (const slug of TEST_SLUGS) {
    const target = String(TEST_TARGET[slug]);
    for (const lang of ['ru', 'en'] as const) {
      const copy = TESTS[slug][lang];
      const promised = [copy.facts.join(' '), ...copy.steps.map((s) => `${s.lead} ${s.rest}`)].join(' ');
      assert.ok(
        promised.includes(target),
        `${slug}/${lang}: тексты не называют длину набора ${target}`,
      );
    }
  }
});

test('на запасном срезе очередь пула всё равно длиннее каждого набора и без сенситивных', () => {
  // Среза (50 записей в git) пул не знает — очередь добирается популярнейшими несенситивными
  // записями среза. Она обязана быть строго длиннее набора: иначе первый же пропуск оборвал бы тест.
  const dims = slice as DimPage[];
  const queue = poolQueue(dims, SENSITIVE_PRACTICES);
  assert.ok(queue.length <= POOL_SIZE, `очередь ${queue.length} длиннее пула`);
  for (const slug of TEST_SLUGS) {
    assert.ok(queue.length > TEST_TARGET[slug], `${slug}: очередь ${queue.length} не длиннее набора`);
  }
  const byId = new Map(dims.map((d) => [d.id, d]));
  for (const e of queue) {
    const d = byId.get(e.id);
    assert.ok(d !== undefined && !isSensitive(d, SENSITIVE_PRACTICES), `сенситивная вещь в очереди среза: ${e.id}`);
  }
});

// ── Пул теста: ≈20 вещей, одна от серии, без сенситивных тем (№098 В2) ────────────────────────

test('🔑 пул — 20 разных id, и в нём НИ ОДНОЙ сенситивной практики из списка главной', () => {
  assert.equal(TEST_POOL.length, POOL_SIZE, 'пул — «с два десятка» (№098 В2)');
  assert.equal(new Set(TEST_POOL).size, TEST_POOL.length, 'id пула повторяются');
  for (const id of SENSITIVE_PRACTICES) {
    assert.ok(!TEST_POOL.includes(id), `сенситивная практика ${id} в пуле`);
  }
  // Длиннее набора с запасом под «не знаю»: иначе дюжину было бы не из чего тянуть.
  for (const slug of TEST_SLUGS) assert.ok(TEST_POOL.length > TEST_TARGET[slug]);
});

test('ключ серии: части одной серии и роман с фильмом — один ключ; разные вещи — разные', () => {
  assert.equal(seriesKey('Гарри Поттер и философский камень'), seriesKey('Гарри Поттер и Тайная комната'));
  assert.equal(seriesKey('Пираты Карибского моря: На краю света'), seriesKey('Пираты Карибского моря: Сундук мертвеца'));
  assert.equal(seriesKey('Матрица'), seriesKey('Матрица: Перезагрузка'));
  assert.equal(seriesKey('Брат'), seriesKey('Брат 2'));
  assert.equal(seriesKey('Терминатор'), seriesKey('Терминатор 2: Судный день'));
  assert.notEqual(seriesKey('1+1'), seriesKey('Леон'));
  assert.notEqual(seriesKey('Ирония судьбы, или С лёгким паром!'), seriesKey('Иван Васильевич меняет профессию'));
});

test('правило пула на синтетике: сенситивная по тегу и по списку выпадает, от серии — самая оценённая, NDSR ниже порога — нет', () => {
  const d = (id: string, title: string, rates: number, rating: number, tags: string[] = []): DimPage => ({
    id, slug: id, title: { ru: title, en: title }, description: { ru: '', en: '' },
    type: { ru: 'Фильм', en: 'Movie' }, author: { ru: '', en: '' }, year: '2000', tags, rates, rating,
  });
  const dims = [
    d('hp1', 'Гарри Поттер и философский камень', 14, 8.4),
    d('hp2', 'Гарри Поттер и Тайная комната', 11, 9.4),
    d('sex', 'Секс', 11, 9.4),
    d('drug', 'Реквием по мечте', 10, 9.0, ['драма', 'наркомания', 'addiction']),
    d('gump', 'Форрест Гамп', 10, 7.6),
    d('leon', 'Леон', 10, 9.2),
  ];
  assert.deepEqual(derivePool(dims, ['sex'], 20), ['hp1', 'leon']);
  assert.ok(isSensitive(dims[3], []), 'тег «наркомания» — сенситивная тема');
  assert.ok(!isSensitive(d('lock', 'Lock, Stock and Two Smoking Barrels', 7, 8.4, ['кино', 'crime']), []),
    'название с «Smoking» — кино, а не курение: судятся теги');
});

test('каждая вещь пула — запись каталога сборки с именем на двух языках и видом', { skip: NO_CATALOG }, () => {
  const byId = new Map(catalog().map((d) => [d.id, d]));
  for (const id of TEST_POOL) {
    const dim = byId.get(id);
    assert.ok(dim, `нет в каталоге: ${id}`);
    assert.ok(dim.title.ru.trim() !== '' && dim.title.en.trim() !== '' && dim.type.ru.trim() !== '', `${id}: карточка без имени или вида`);
  }
});

test('🔑 в пуле ни одной сенситивной вещи — ни по списку, ни по тегам', { skip: NO_CATALOG }, () => {
  const byId = new Map(catalog().map((d) => [d.id, d]));
  for (const id of TEST_POOL) {
    const dim = byId.get(id);
    assert.ok(dim && !isSensitive(dim, SENSITIVE_PRACTICES), `сенситивная вещь в пуле: ${dim?.title.ru ?? id}`);
  }
});

test('🔑 в пуле одна вещь от серии и все вещи любимые (NDim Space Rating ≥ порога)', { skip: NO_CATALOG }, () => {
  const byId = new Map(catalog().map((d) => [d.id, d]));
  const keys = new Map<string, string>();
  for (const id of TEST_POOL) {
    const dim = byId.get(id);
    assert.ok(dim);
    const key = seriesKey(dim.title.ru);
    assert.ok(!keys.has(key), `две вещи одной серии: «${keys.get(key)}» и «${dim.title.ru}»`);
    keys.set(key, dim.title.ru);
    assert.ok(dim.rating >= POOL_MIN_RATING, `«${dim.title.ru}»: NDSR ${dim.rating} ниже ${POOL_MIN_RATING}`);
  }
});

test('🔑 пул = правилу на каталоге сборки: подмена голосов вкусом краснеет сама', { skip: NO_CATALOG }, () => {
  // Урок `landing-demo.test.ts` (2026-09-25): за день агент дважды подменил голоса вкусом.
  // Правка состава идёт через правило (порог, список сенситивных, исключение со словом владельца).
  assert.deepEqual([...TEST_POOL], derivePool(catalog(), SENSITIVE_PRACTICES));
  const queue = poolQueue(catalog(), SENSITIVE_PRACTICES);
  assert.deepEqual(queue.map((e) => e.id), [...TEST_POOL], 'на полном каталоге очередь — пул целиком, в его порядке');
});

// ── Тексты о наборе называют только виды, которые есть в пуле (суд V4, находка 2) ─────────────
//
// Пул общий для трёх тестов. С №098 практик в нём нет, а «Тест личности» и FAQ главной ещё обещали
// «фильмы, игры и привычки». Строка «о наборе» — та, что называет число вещей («12 вещей», «12 things»)
// или «знакомые фильмы»; строки о каталоге целиком (там есть и книги, и практики) не судятся.

const KIND_WORDS: ReadonlyArray<[readonly KindKey[], RegExp]> = [
  [['practice'], /привычк\p{L}*|практик\p{L}*|habits?|practices?/iu],
  [['novel', 'book'], /книг\p{L}*|роман\p{L}*|books?|novels?/iu],
  [['music-artist'], /музык\p{L}*|music/iu],
  [['video-game'], /(?<!\p{L})игр\p{L}*|games?/iu],
  [['tv-series'], /сериал\p{L}*|series/iu],
  [['movie'], /фильм\p{L}*|films?|movies?/iu],
];
const ABOUT_THE_SET = /(?<![\p{L}\d])\d{1,2}\s+(вещ\p{L}*|things)|знаком\p{L}*\s+фильм|familiar movies/iu;

/** Строки копирайта с путём; шаг «lead + rest» — одной строкой, как его читает человек. */
function copyStrings(node: unknown, path: string, out: Array<[string, string]> = []): Array<[string, string]> {
  if (typeof node === 'string') out.push([path, node]);
  else if (Array.isArray(node)) node.forEach((v, i) => copyStrings(v, `${path}[${i}]`, out));
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (typeof o.lead === 'string' && typeof o.rest === 'string') out.push([path, `${o.lead} ${o.rest}`]);
    else for (const [k, v] of Object.entries(o)) copyStrings(v, `${path}.${k}`, out);
  }
  return out;
}

/** Виды, которых в пуле нет, найденные в строках о наборе. */
function kindsNotInPool(poolKinds: ReadonlySet<KindKey>, lines: Array<[string, string]>): string[] {
  const bad: string[] = [];
  for (const [path, text] of lines) {
    if (!ABOUT_THE_SET.test(text)) continue;
    for (const [keys, re] of KIND_WORDS) {
      if (keys.some((k) => poolKinds.has(k))) continue;
      const hit = text.match(re);
      if (hit) bad.push(`${path}: «${hit[0]}» — такого вида в пуле нет`);
    }
  }
  return bad;
}

test('прибор видов: ловит «привычки» в строке о наборе и молчит о строке про каталог', () => {
  const kinds = new Set<KindKey>(['movie', 'tv-series', 'video-game']);
  assert.equal(kindsNotInPool(kinds, [['a', 'Оцените 12 вещей звёздами — фильмы, игры и привычки.']]).length, 1);
  assert.equal(kindsNotInPool(kinds, [['b', 'Rate 12 things with stars — films, series, games and habits.']]).length, 1);
  assert.equal(kindsNotInPool(kinds, [['c', 'каталог Пространства — фильмы, книги, сериалы, игры и практики']]).length, 0);
  assert.equal(kindsNotInPool(kinds, [['d', 'Оцените 12 вещей — фильмы, сериалы и игры.']]).length, 0);
});

test('🔑 тексты тестов и FAQ главной о наборе называют только виды, которые есть в пуле', { skip: NO_CATALOG }, () => {
  const byId = new Map(catalog().map((d) => [d.id, d]));
  const poolKinds = new Set<KindKey>();
  for (const id of TEST_POOL) {
    const key = kindKeyOf(byId.get(id)?.type);
    if (key !== null) poolKinds.add(key);
  }
  const lines = [...copyStrings(TESTS, 'TESTS'), ...copyStrings(landingFaq, 'landingFaq')];
  const aboutSet = lines.filter(([, t]) => ABOUT_THE_SET.test(t));
  // Выборка не пуста: иначе страж молча судил бы ноль строк.
  assert.ok(aboutSet.length >= 6, `строк о наборе найдено ${aboutSet.length} — выборка сломалась`);
  assert.deepEqual(kindsNotInPool(poolKinds, lines), []);
});

// ── Дюжина попытки: случайная, но воспроизводимая затравкой (№098 В2) ──────────────────────────

test('🔑 дюжина — 12 разных вещей пула, воспроизводимая затравкой; вся перетасовка — перестановка пула', () => {
  const once = shuffledIds(TEST_POOL, 12345);
  const again = shuffledIds(TEST_POOL, 12345);
  assert.deepEqual(once, again, 'одна затравка — одна перетасовка');
  assert.deepEqual([...once].sort(), [...TEST_POOL].sort(), 'перетасовка теряет или дублирует вещи');
  const dozen = once.slice(0, TEST_TARGET.compatibility);
  assert.equal(new Set(dozen).size, 12);
  assert.ok(dozen.every((id) => TEST_POOL.includes(id)));
  const input = [...TEST_POOL];
  shuffledIds(input, 1);
  assert.deepEqual(input, [...TEST_POOL], 'перетасовка портит свой вход');
});

test('разные затравки дают разные дюжины — «рандомом они выносятся в дюжину»', () => {
  const dozens = new Set(
    [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => shuffledIds(TEST_POOL, seed).slice(0, 12).sort().join(',')),
  );
  assert.ok(dozens.size >= 6, `восемь затравок дали всего ${dozens.size} разных дюжин`);
  const firsts = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => shuffledIds(TEST_POOL, seed)[0]));
  assert.ok(firsts.size >= 4, `первая карточка почти не меняется: ${firsts.size} разных из 8`);
});

test('порог факта «оценили ещё N» — три (№021 В1), и он строже правила каталога', () => {
  assert.equal(RATED_FACT_FROM, 3);
});

// ── Подпись строки: различитель одноимённых вещей (bugs/126, интервью №032 В1 = В) ─────────

test('🔑 одноимённые вещи в строке РАЗЛИЧИМЫ: имя · вид, год', () => {
  const film = rowLabel({ name: 'Гарри Поттер и философский камень', kind: 'Фильм', year: '2001' });
  const novel = rowLabel({ name: 'Гарри Поттер и философский камень', kind: 'Роман', year: '1997' });
  assert.notEqual(film, novel, 'две разные вещи обязаны читаться по-разному');
  assert.equal(film, 'Гарри Поттер и философский камень · Фильм, 2001');
  assert.equal(novel, 'Гарри Поттер и философский камень · Роман, 1997');
});

test('имя НЕ обрезается и не сокращается — закон владельца от 2026-08-14', () => {
  const long = 'Пираты Карибского моря: На краю света';
  const label = rowLabel({ name: long, kind: 'Фильм', year: '2007' });
  assert.ok(label.startsWith(long), 'имя обязано стоять целиком и первым');
  assert.ok(!label.includes('…'), 'многоточия в имени быть не может');
});

test('без года — только вид, без висящей запятой; без обоих — голое имя', () => {
  assert.equal(rowLabel({ name: 'Секс', kind: 'Практика', year: '' }), 'Секс · Практика');
  assert.equal(rowLabel({ name: 'Секс', kind: '', year: '' }), 'Секс');
  assert.equal(rowLabel({ name: 'Нечто', kind: '', year: '1999' }), 'Нечто · 1999');
});

test('🔑 вид приводится к канону: грязь каталога на лицо не выходит', () => {
  // Замер `plans/48` шаг 0: регистр вразнобой и невидимый U+200B в 44 записях.
  assert.equal(kindLabelFor({ ru: 'фильм', en: 'movie' }, 'ru'), 'Фильм');
  assert.equal(kindLabelFor({ ru: 'Телесериал​', en: 'TV Series​' }, 'en'), 'TV series');
  // Язык не в своём поле (5 записей) — вид всё равно известен точно.
  assert.equal(kindLabelFor({ ru: 'Movie', en: 'Movie' }, 'ru'), 'Фильм');
});

test('вид, которого нет в словаре, получает подпись, но НЕ выдуманный вид', () => {
  // «Повесть» романом не становится (граница `dim-kind.ts`) — но и без подписи не остаётся.
  assert.equal(kindLabelFor({ ru: 'повесть', en: 'novella' }, 'ru'), 'Повесть');
  // Год, попавший в поле вида (4 записи), — это не вид: подписи нет вовсе.
  assert.equal(kindLabelFor({ ru: '1998', en: '1998' }, 'ru'), '');
});

test('подпись строится на ОБОИХ языках из одного каталога', () => {
  const [entry] = buildTestQueue(slice as DimPage[], 1);
  for (const lang of ['ru', 'en'] as const) {
    const label = rowLabel({ name: entry.name[lang], kind: kindLabelFor(entry.kind, lang), year: entry.year });
    assert.ok(label.includes(entry.name[lang]), `${lang}: имя обязано остаться в подписи целиком`);
  }
});

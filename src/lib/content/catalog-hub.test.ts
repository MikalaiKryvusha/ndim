/**
 * СТРАЖ ХАБОВ КАТАЛОГА — `plans/48` (фаза 2 эпика 40), шаг 3.
 *
 * Мутации, которые эти тесты обязаны ронять:
 *   · сортировать по НАЗВАНИЮ вместо слага — русская и английская страницы хаба перестанут быть
 *     переводами друг друга, а `hreflang` продолжит это утверждать (самый дорогой класс: разметка
 *     врёт, а сборка зелёная);
 *   · пустить неоценённые вперёд оценённых — «топ по версии NDim Space» начнётся с пустых карточек;
 *   · сделать первую страницу адресом `…/1` — у одного содержания станет два адреса;
 *   · сбить сквозную нумерацию мест (считать номер от начала страницы, а не от начала хаба).
 *
 * Проверяется не только функция, но и ВЕСЬ боевой каталог, когда он выгружен: правило существует
 * ради 89 страниц на язык, а не ради красивого юнита. Числа — замер 2026-08-14 по `dims-build.json`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

import {
  PER_PAGE,
  catalogPath,
  catalogPrior,
  groupByKind,
  hubPath,
  makeComparator,
  pageCount,
  placesIn,
  slicePage,
  summarize,
  toCard,
  VOTE_HALF,
  voteWeight,
  weighted,
  type CatalogItem,
} from './catalog-hub.ts';
import { KIND_KEYS } from './dim-kind.ts';
import slice from './dims-slice.json' with { type: 'json' };

/** Заготовка объекта каталога: в тестах меняется ровно то, что тест проверяет. */
const item = (over: Partial<CatalogItem> & { slug: string }): CatalogItem => ({
  title: { ru: 'Название', en: 'Title' },
  author: { ru: 'Автор', en: 'Author' },
  type: { ru: 'Фильм', en: 'Movie' },
  year: '2000',
  rates: 0,
  rating: 0,
  ...over,
});

/** Опора для юнитов: числа круглые, чтобы ожидания считались в уме, а не подгонялись. */
const PRIOR = { m: 4, c: 8 };
const compareForHub = makeComparator(PRIOR);

test('оценённые идут перед неоценёнными — «топ» не начинается с пустых карточек', () => {
  const rated = item({ slug: 'zzz-last-by-slug', rates: 1, rating: 5 });
  const unrated = item({ slug: 'aaa-first-by-slug' });
  assert.deepEqual([unrated, rated].sort(compareForHub), [rated, unrated]);
});

test('🔴 интервью №030, В2 = Д: число голосов УЧАСТВУЕТ — одинокая десятка ниже устойчивой девятки', () => {
  // При опоре m = 4, C = 8: «10,0 от одного» = (1·10 + 4·8)/5 = 8,4 · «9,0 от двадцати» =
  // (20·9 + 4·8)/24 ≈ 8,83. Прежнее правило («по чистой средней») поставило бы десятку первой —
  // ровно эту мутацию тест и обязан ронять.
  const lonely = item({ slug: 'a-lonely', rates: 1, rating: 10 });
  const solid = item({ slug: 'b-solid', rates: 20, rating: 9 });
  assert.ok(weighted(solid, PRIOR) > weighted(lonely, PRIOR));
  assert.deepEqual([lonely, solid].sort(compareForHub).map((x) => x.slug), ['b-solid', 'a-lonely']);
});

test('взвешенная оценка НЕ показывается: карточка несёт настоящую среднюю', () => {
  const d = item({ slug: 'x', rates: 1, rating: 10 });
  assert.notEqual(weighted(d, PRIOR), d.rating); // величины разные…
  assert.equal(toCard(d, 'ru').rating, 10); // …а наружу идёт настоящая
});

test('опора считается ИЗ ДАННЫХ: m — 90-й процентиль голосов, C — средняя по оценённым', () => {
  // Десять оценённых: восемь по одному голосу, один с пятью, один с семью.
  // Ряд голосов [1,1,1,1,1,1,1,1,5,7], индекс floor(9 × 0,9) = 8 → p90 = 5.
  const items = [
    ...Array.from({ length: 8 }, (_, i) => item({ slug: `s${i}`, rates: 1, rating: 6 })),
    item({ slug: 's8', rates: 5, rating: 9 }),
    item({ slug: 's9', rates: 7, rating: 10 }),
    item({ slug: 'u', rates: 0, rating: 0 }), // неоценённый в опору НЕ входит
  ];
  const prior = catalogPrior(items);
  assert.equal(prior.m, 5);
  assert.equal(prior.c, (6 * 8 + 9 + 10) / 10);
  // Пустой каталог не роняет расчёт и не делит на ноль.
  assert.deepEqual(catalogPrior([]), { m: 1, c: 0 });
});

/*
 * ── ВЕС ЧИСЛА ГОЛОСОВ (решение владельца 2026-08-16) ─────────────────────────────────────────
 *
 * Его слова задают ФОРМУ кривой, и каждое проверяется отдельным утверждением:
 *   · «вес убывает логарифмически по мере роста количество голосов»;
 *   · «между 5 и 10 голосов — большая разница в весе»;
 *   · «между 200 и 205 голосов разница в весе уже почти неразличима»;
 *   · «малое количество голосов — низкий вес», «большое — высокий вес на позицию».
 *
 * Мутации, которые эти тесты обязаны ронять: вернуть линейный вес · снять насыщение · вернуть
 * прежнюю формулу без слагаемого голосов (тогда одинокая десятка снова обгонит четырнадцать).
 */

test('🔴 владелец: кривая быстро растёт от нуля, потом замедляется, потом плато у единицы', () => {
  assert.equal(voteWeight(0), 0, 'без голосов веса нет');
  // Растёт строго и нигде не превышает единицу.
  let prev = -1;
  for (const v of [0, 1, 2, 3, 5, 10, 20, 50]) {
    const w = voteWeight(v);
    assert.ok(w > prev, `вес не растёт на ${v}`);
    assert.ok(w <= 1, `вес превысил единицу на ${v}`);
    prev = w;
  }
  // 🔴 БЫСТРЫЙ РОСТ В НАЧАЛЕ — то, за что владелец выбрал гиперболу: «быстро растёт в начале».
  // На половинной опоре десять голосов дают ровно половину веса. Мутация «опора больше» роняет.
  assert.equal(voteWeight(VOTE_HALF), 0.5, 'половинная опора не даёт половины веса');
  assert.ok(voteWeight(5) > 0.3, `на пяти голосах вес всего ${voteWeight(5)} — рост слишком вялый`);
  // 🔴 РАЗНИЦА НА БОЛЬШИХ ЧИСЛАХ НЕ ИСЧЕЗАЕТ СОВСЕМ — граница, отделяющая гиперболу от
  // экспоненты, которую владелец забраковал («почти нет разницы на высоких числах»). Порог здесь
  // 0,05, а не прежние 0,15: гипербола даёт 0,119, и это ЕГО осознанный размен — числа четырёх
  // семейств стояли перед ним в таблице, когда он выбирал. У экспоненты на том же месте 0,02.
  assert.ok(
    voteWeight(200) - voteWeight(50) > 0.05,
    `между 50 и 200 голосами разница всего ${voteWeight(200) - voteWeight(50)} — кривая насытилась`,
  );
  // 🔑 ЗАМЕДЛЕНИЕ, А НЕ ОБРЫВ: шаг у нуля кратно больше шага у плато, но плато не «мёртвое».
  const step = (a: number) => voteWeight(2 * a) - voteWeight(a);
  assert.ok(step(5) > step(50) * 2, 'кривая не замедляется');
  assert.ok(step(50) > 0.02, 'на больших числах шаг выродился в ноль — это уже экспонента');
  // 🔴 «Малое количество голосов — низкий вес» — проверяется ОТНОШЕНИЕМ, а не зашитой цифрой.
  // Абсолютный порог здесь стоял 0,15 и был откалиброван под кривую БЕЗ выгиба; владелец добавил
  // выгиб («резче выгнуть кверху»), и вес одного голоса поднялся с 0,12 до 0,23 — это названная
  // им цена, а не регресс. Инвариант, который переживает любую его правку: одинокий голос обязан
  // стоить заметно меньше, чем десяток, и меньше трети полного веса.
  assert.ok(voteWeight(1) < 0.33, `один голос стоит ${voteWeight(1)} — это уже не «низкий вес»`);
  assert.ok(
    voteWeight(1) * 2 < voteWeight(10),
    `один голос (${voteWeight(1)}) слишком близок к десяти (${voteWeight(10)})`,
  );
  assert.ok(voteWeight(100000) <= 1, 'вес поднялся выше единицы');
});

test('🔴 владелец: «между 5 и 10 голосов — большая разница», «между 200 и 205 — почти неразличима»', () => {
  // Обе фразы владельца верны ОДНОВРЕМЕННО: плато приходит задолго до двухсот, поэтому там
  // разница равна нулю — а на первых голосах шаг велик (интервью №036, В2 + правки по графику).
  const near = voteWeight(10) - voteWeight(5);
  const far = voteWeight(205) - voteWeight(200);
  // 🔴 ПОРОГ ЗДЕСЬ ОТНОСИТЕЛЬНЫЙ, И ЭТО НЕ ПОСЛАБЛЕНИЕ. Смысл слов владельца — в СООТНОШЕНИИ
  // шагов («большая разница» против «почти неразличима»), а не в конкретной сотой доле: абсолютное
  // число шага задаётся опорой, которую он же и двигает, поэтому зашитая константа краснела бы при
  // каждой его правке кривой, ничего не проверяя по существу. Прежний порог 0,1 был откалиброван
  // под опору 200; при опоре 1000 тот же шаг равен 0,088, и кривая от этого не стала хуже.
  assert.ok(near > 0.05, `скачок 5→10 неразличим: ${near}`);
  assert.ok(far < 0.005, `разница 200→205 слишком велика: ${far}`);
  // Именно ЗАМЕДЛЕНИЕ: тот же шаг в пять голосов у нуля весит несравнимо больше, чем далеко справа.
  assert.ok(near > far * 20, 'кривая не замедляется — это не логарифм');
  // Контроль самого теста: у ПРЯМОЙ (без насыщения) оба шага одинаковы — значит утверждения выше
  // проверяют форму кривой, а не арифметику вычитания. Насыщение здесь снимать обязательно:
  // с ним прямая тоже даёт ноль на втором шаге, и контроль ничего бы не доказывал.
  const linear = (v: number) => v / 200;
  assert.ok(Math.abs((linear(10) - linear(5)) - (linear(205) - linear(200))) < 1e-12);
});

test('🔴 БОЕВОЙ СЛУЧАЙ, из которого выросло решение: 14 голосов перевешивают одинокую десятку', () => {
  // Числа боя 2026-08-16: «Гарри Поттер» 8,4 при 14 голосах — максимум каталога — стоял НИЖЕ
  // «Дома Дракона» с ОДНИМ голосом 10,0. Прежняя формула давала 8,365 против 8,592.
  const prior = { m: 4, c: 8.2405 };
  const many = item({ slug: 'a-many', rates: 14, rating: 8.4 });
  const lonely = item({ slug: 'b-lonely', rates: 1, rating: 10 });
  assert.ok(
    weighted(many, prior) > weighted(lonely, prior),
    'одинокая десятка снова обгоняет четырнадцать голосов — слагаемое голосов потеряно',
  );
  assert.deepEqual([lonely, many].sort(makeComparator(prior)).map((x) => x.slug), ['a-many', 'b-lonely']);
});

test('внутри оценённых равенство взвешенной разводит число голосов', () => {
  const a = item({ slug: 'a', rates: 2, rating: 9 });
  const b = item({ slug: 'b', rates: 8, rating: 9 });
  // Оба выше опоры и равны по средней; больше голосов — выше место.
  assert.deepEqual([a, b].sort(compareForHub).map((x) => x.slug), ['b', 'a']);
});

test('🔴 ПОРЯДОК НЕ ЗАВИСИТ ОТ ЯЗЫКА: равенства разводит слаг, а не название', () => {
  // Оба объекта равны по оценке и числу голосов, а их названия УПОРЯДОЧЕНЫ ПО-РАЗНОМУ в двух
  // языках: по-русски первой идёт «Аврора» (объект `b`), по-английски — «Anger» (объект `a`).
  // Сортировка по названию дала бы на `/ru/catalog/movie/2` и `/en/catalog/movie/2` РАЗНЫЕ
  // наборы объектов — при том что `hreflang` объявляет эти страницы переводами друг друга.
  const a = item({ slug: 'a-anger', title: { ru: 'Ярость', en: 'Anger' }, rates: 3, rating: 8 });
  const b = item({ slug: 'b-zenith', title: { ru: 'Аврора', en: 'Zenith' }, rates: 3, rating: 8 });
  assert.deepEqual([b, a].sort(compareForHub).map((x) => x.slug), ['a-anger', 'b-zenith']);
  assert.deepEqual([a, b].sort(compareForHub).map((x) => x.slug), ['a-anger', 'b-zenith']);
  // Контроль самого теста: убеждаемся, что фикстура ДЕЙСТВИТЕЛЬНО расходится по языкам, —
  // иначе этот тест был бы зелёным на любой реализации, включая сортировку по названию.
  const byTitle = (l: 'ru' | 'en') =>
    [b, a].sort((x, y) => x.title[l].localeCompare(y.title[l], l)).map((x) => x.slug);
  assert.notDeepEqual(byTitle('ru'), byTitle('en'));
});

test('сравнение детерминировано: одинаковые объекты не меняются местами', () => {
  const list = [item({ slug: 'b' }), item({ slug: 'a' }), item({ slug: 'c' })];
  const once = [...list].sort(compareForHub).map((x) => x.slug);
  const twice = [...list].sort(compareForHub).sort(compareForHub).map((x) => x.slug);
  assert.deepEqual(once, twice);
  assert.deepEqual(once, ['a', 'b', 'c']);
});

test('страниц ровно столько, сколько нужно, и не меньше одной', () => {
  assert.equal(pageCount(0), 1);
  assert.equal(pageCount(1), 1);
  assert.equal(pageCount(PER_PAGE), 1);
  assert.equal(pageCount(PER_PAGE + 1), 2);
  assert.equal(pageCount(2774), 47); // «Фильмы» в бою на 2026-08-14
});

test('срез страницы не теряет и не дублирует объекты', () => {
  const list = Array.from({ length: PER_PAGE * 2 + 7 }, (_, i) => `x${i}`);
  const pages = pageCount(list.length);
  const seen = pages > 0 ? Array.from({ length: pages }, (_, i) => slicePage(list, i + 1)).flat() : [];
  assert.deepEqual(seen, list);
  assert.equal(slicePage(list, 1).length, PER_PAGE);
  assert.equal(slicePage(list, pages).length, 7);
  assert.deepEqual(slicePage(list, pages + 1), []);
});

test('🔴 первая страница хаба живёт БЕЗ номера — второго адреса у одного содержания нет', () => {
  assert.equal(hubPath('ru', 'movie'), '/ru/catalog/movie');
  assert.equal(hubPath('ru', 'movie', 1), '/ru/catalog/movie');
  assert.equal(hubPath('en', 'video-game', 2), '/en/catalog/video-game/2');
  assert.equal(catalogPath('en'), '/en/catalog');
});

test('раскладка по видам: известный вид — в хаб, остальное — в хвост, и ничего не теряется', () => {
  const items = [
    item({ slug: 'm', type: { ru: 'Фильм', en: 'Movie' } }),
    item({ slug: 'g', type: { ru: 'Видеоигра', en: 'Video game' } }),
    // Невидимый U+200B — тот самый класс грязи, ради которого нормализация делается на чтении.
    item({ slug: 's', type: { ru: 'Телесериал', en: 'TV Series​' } }),
    // «Повесть» смыслово в «Роман» НЕ вливается: это была бы правка данных под видом чтения.
    item({ slug: 'n', type: { ru: 'Повесть', en: 'Novella' } }),
  ];
  const { hubs, tail } = groupByKind(items);
  assert.deepEqual(hubs.get('movie')?.map((x) => x.slug), ['m']);
  assert.deepEqual(hubs.get('video-game')?.map((x) => x.slug), ['g']);
  assert.deepEqual(hubs.get('tv-series')?.map((x) => x.slug), ['s']);
  assert.deepEqual(hubs.get('novel')?.map((x) => x.slug), []);
  assert.deepEqual(tail.map((x) => x.slug), ['n']);
  const inHubs = [...hubs.values()].reduce((s, l) => s + l.length, 0);
  assert.equal(inHubs + tail.length, items.length);
});

test('карточка несёт то, что рисуется, а прочерк-неизвестность превращается в пусто', () => {
  const card = toCard(
    item({ slug: 'x', year: '-', author: { ru: '-', en: '-' }, rates: 4, rating: 7.5 }),
    'ru',
  );
  assert.deepEqual(card, { slug: 'x', title: 'Название', year: '', author: '', rating: 7.5, rates: 4 });
  assert.equal(toCard(item({ slug: 'y' }), 'en').title, 'Title');
});

/**
 * ЖИВОЙ КАТАЛОГ — числа замера 2026-08-14. Полный файл лежит вне git (17 МБ), поэтому на чистом
 * клоне тест честно уходит на запасной срез и проверяет то, что там есть: суммы сходятся,
 * порядок держится, страницы не теряют объектов.
 */
const BUILD = new URL('./dims-build.json', import.meta.url);
const full = existsSync(BUILD) ? (JSON.parse(readFileSync(BUILD, 'utf8')) as CatalogItem[]) : null;
const catalog = (full ?? (slice as unknown as CatalogItem[])) as CatalogItem[];

/**
 * ПРИЧИНА ПРОПУСКА ОБЪЯВЛЯЕТСЯ, А НЕ УМАЛЧИВАЕТСЯ (`bugs/163`).
 *
 * 🔴 Полный каталог (`dims-build.json`, 17 МБ) лежит ВНЕ git, и это правильно. Неправильно было
 * другое: тесты, которым он нужен, объявлялись внутри `if (full)` — то есть на чистой рабочей
 * копии не объявлялись ВООБЩЕ, а `node --test` не может сообщить о том, чего ему не дали.
 * Прогон, короче полного на четыре теста, выглядел ровно так же зелено: `skipped 0` в обоих
 * случаях. Хуже того, один тест был объявлен, но выходил по `if (!full) return` — и печатался
 * как ПРОЙДЕННЫЙ, ничего не проверив.
 *
 * Цена уплачена в командном режиме: у ролей команды пять рабочих копий, артефакт есть не у
 * всех, и числа прогонов расходились МОЛЧА — 325 против 329 за один вечер. Расхождение каждый
 * раз приходилось объяснять человеку вместо того, чтобы его объявлял прибор.
 *
 * Форма пропуска — родная для `node --test`: `{ skip: <причина> }`. Тест объявлен ВСЕГДА,
 * поэтому общее число не зависит от артефакта, а разница видна строкой `skipped` и причиной.
 * Образец честного вырождения был в проекте и раньше — `dim-kind.test.ts`: он печатает вслух,
 * что проверил запасной срез. Здесь тот же принцип, только средствами самого прогона.
 */
const NO_BUILD = full ? false : 'нет src/lib/content/dims-build.json — сначала npm run build';


test('боевой каталог: опора взвешивания — числа замера 2026-08-14', { skip: NO_BUILD }, () => {
  /*
   * 🔄 Перемерено 2026-08-22 (Менеджер): **C 8,2405 → 8,2401**, `m` не сдвинулся.
   * Причина названа замером, а не догадкой: оценённых фильмов стало **981 → 983** — то есть
   * два объекта каталога получили голоса ЖИВЫХ людей, и оба чуть ниже прежней средней.
   * 🔑 Эта величина ЖИВАЯ по своей природе: C — средняя по оценённым объектам, и она обязана
   * шевелиться каждый раз, когда кто-то ставит звезду. Растяжка здесь стережёт не постоянство
   * числа, а то, чтобы его сдвиг был ОБЪЯСНЁН, — сдвиг без объяснения означал бы, что поменялась
   * формула или корпус, а не мнение людей.
   */
  const prior = catalogPrior(catalog);
  assert.equal(prior.m, 4, 'm — 90-й процентиль числа голосов среди оценённых');
  assert.equal(prior.c.toFixed(4), '8.2401', 'C — средняя по оценённым объектам');
});

test('боевой каталог: суммы хабов и хвоста сходятся с числом объектов', () => {
  const { hubs, tail } = groupByKind(catalog);
  const sums = summarize(hubs);
  const inHubs = sums.reduce((s, h) => s + h.count, 0);
  assert.equal(inHubs + tail.length, catalog.length);
  assert.equal(sums.length, KIND_KEYS.length);
  // Оценённых не может быть больше, чем объектов, — граница, а не «не ноль» (правило шкалы 0…10).
  for (const h of sums) assert.ok(h.rated <= h.count, `${h.key}: оценённых больше, чем объектов`);
});

test('боевой каталог: каждая страница каждого хаба непуста и в сумме даёт весь хаб', () => {
  const { hubs } = groupByKind(catalog);
  for (const key of KIND_KEYS) {
    const list = hubs.get(key) ?? [];
    if (!list.length) continue;
    const pages = pageCount(list.length);
    const seen: string[] = [];
    for (let p = 1; p <= pages; p += 1) {
      const chunk = slicePage(list, p);
      assert.ok(chunk.length > 0, `${key}: страница ${p} пуста`);
      assert.ok(chunk.length <= PER_PAGE, `${key}: на странице ${p} больше ${PER_PAGE} карточек`);
      seen.push(...chunk.map((x) => x.slug));
    }
    assert.equal(seen.length, list.length);
    assert.equal(new Set(seen).size, list.length, `${key}: карточка попала на две страницы`);
  }
});

test('боевой каталог: в голове каждого хаба нет ни одной карточки без голосов', () => {
  const { hubs } = groupByKind(catalog);
  for (const key of KIND_KEYS) {
    const list = hubs.get(key) ?? [];
    const rated = list.filter((d) => d.rates >= 1).length;
    if (!rated) continue;
    // Первые `rated` мест — ровно оценённые объекты. Мутация «неоценённые вперёд» роняет это.
    for (let i = 0; i < rated; i += 1) {
      assert.ok(list[i].rates >= 1, `${key}: место ${i + 1} занято карточкой без голосов`);
    }
  }
});

/*
 * ── МЕСТО ОБЪЕКТА В СВОЁМ ВИДЕ (`plans/56` шаг 2) ────────────────────────────────────────────
 *
 * Мутации, которые эти тесты обязаны ронять:
 *   · считать место среди ВСЕХ объектов вида, а не среди оценённых — знаменатель раздувается с
 *     981 до 2774, и каждая карточка начинает утверждать неправду;
 *   · выдать место неоценённому объекту — «3106-е место» из ряда, разведённого по алфавиту адреса;
 *   · разойтись с номером строки на странице хаба — две публичные поверхности скажут об одном
 *     объекте разное, и заметит это человек, а не сборка.
 */

test('место считается среди ОЦЕНЁННЫХ, а не среди всех объектов вида', () => {
  const list = [
    item({ slug: 'a-rated', rates: 10, rating: 9 }),
    item({ slug: 'b-rated', rates: 10, rating: 8 }),
    item({ slug: 'c-empty' }),
    item({ slug: 'd-empty' }),
  ].sort(compareForHub);

  const places = placesIn(list);
  assert.equal(places.size, 2, 'мест ровно столько, сколько оценённых');
  // Знаменатель — 2 (оценённые), а НЕ 4 (все). Мутация «of = sortedList.length» роняет обе строки.
  assert.deepEqual(places.get('a-rated'), { rank: 1, of: 2 });
  assert.deepEqual(places.get('b-rated'), { rank: 2, of: 2 });
});

test('🔴 неоценённый объект места НЕ получает — иначе это выдуманный факт', () => {
  const list = [item({ slug: 'rated', rates: 3, rating: 7 }), item({ slug: 'empty' })].sort(compareForHub);
  const places = placesIn(list);
  assert.equal(places.has('empty'), false, 'неоценённому выдано место');
  assert.equal(places.get('rated')?.rank, 1);
});

test('места идут подряд от единицы и ни одно не повторяется', () => {
  const list = Array.from({ length: 7 }, (_, i) =>
    item({ slug: `s${i}`, rates: i < 5 ? 2 : 0, rating: 10 - i }),
  ).sort(compareForHub);
  const ranks = [...placesIn(list).values()].map((p) => p.rank).sort((a, b) => a - b);
  assert.deepEqual(ranks, [1, 2, 3, 4, 5]);
});

test('пустой список и список без единой оценки мест не порождают', () => {
  assert.equal(placesIn([]).size, 0);
  assert.equal(placesIn([item({ slug: 'x' }), item({ slug: 'y' })]).size, 0);
});

test('🔑 ПАРА «истина ↔ зеркало»: место карточки = номер её строки на странице хаба', () => {
  const { hubs } = groupByKind(catalog);
  for (const key of KIND_KEYS) {
    const list = hubs.get(key) ?? [];
    if (!list.length) continue;
    const places = placesIn(list);
    // Номер строки хаба считается как `firstRank + i` = (page-1)*PER_PAGE + i + 1, то есть
    // сквозной индекс по списку + 1. Для ОЦЕНЁННЫХ он обязан совпасть с местом на карточке.
    list.forEach((d, i) => {
      const place = places.get(d.slug);
      if (!place) return;
      assert.equal(
        place.rank,
        i + 1,
        `${key}/${d.slug}: карточка говорит «${place.rank}-е», хаб показывает «${i + 1}-е»`,
      );
    });
  }
});

test('боевой каталог: знаменатель места совпадает со сводкой «с оценками»', { skip: NO_BUILD }, () => {
  const { hubs } = groupByKind(catalog);
  const byKey = Object.fromEntries(summarize(hubs).map((h) => [h.key, h]));
  for (const key of KIND_KEYS) {
    const list = hubs.get(key) ?? [];
    const places = placesIn(list);
    if (!places.size) continue;
    const of = [...places.values()][0].of;
    assert.equal(of, byKey[key].rated, `${key}: знаменатель места разошёлся со сводкой хаба`);
  }
  // Замер 2026-08-14, который держит вся арифметика фазы: фильмов оценено 981 из 2774.
  // 🔄 2026-08-22: **983** — два фильма получили голоса живых людей (разбор в тесте опоры выше).
  assert.equal([...placesIn(hubs.get('movie') ?? []).values()][0].of, 983);
});

test('боевой каталог: числа замера 2026-08-14 держатся', { skip: NO_BUILD }, () => {
  const { hubs, tail } = groupByKind(catalog);
  const sums = summarize(hubs);
  const byKey = Object.fromEntries(sums.map((h) => [h.key, h]));
  /*
   * 🔄 Перемерено 2026-08-18 после первого пополнения каталога с переноса: владелец одобрил
   * десять кандидатов-фильмов. Сдвинулись РОВНО ДВЕ величины — размер каталога и число
   * фильмов, обе на десять. Оценённых фильмов по-прежнему 981 (новые записи без оценок),
   * страниц по-прежнему 47 и 89 (десять карточек в разбивку не влезли новой страницей),
   * хвост 25 — тот же. Сойдись числа иначе, правкой констант это не закрывалось бы.
   *
   * 🔄 Перемерено 2026-08-22 (Менеджер). Сдвинулись ЧЕТЫРЕ величины, и каждая объяснена:
   * · каталог **5121 → 5125** (+4) — владелец продолжает одобрять кандидатов мастерской;
   * · фильмов **2784 → 2787** (+3) и видеоигр **1221 → 1222** (+1) — вместе ровно +4, то есть
   *   ВЕСЬ прирост каталога разошёлся по существующим хабам;
   * · оценённых фильмов **981 → 983** (+2) — это другое событие: голоса живых людей, а не рост.
   * НЕ сдвинулись и потому проверены отдельно: хвост 25 · страниц у фильмов 47 (три карточки в
   * разбивку не влезли новой страницей) · сериалы 370 · романы 231 · практики 228 · музыканты
   * 198. И `unknown` в парном тесте `dim-kind` равен НУЛЮ — словарь видов не тронут.
   * 🔑 Числа правятся только после этой сверки. Правка «чтобы позеленело» превратила бы растяжку
   * в украшение, а она заведена ровно затем, чтобы рост каталога не проходил молча.
   */
  assert.equal(catalog.length, 5125);
  assert.equal(tail.length, 25);
  assert.equal(byKey.movie.count, 2787);
  assert.equal(byKey.movie.rated, 983);
  assert.equal(byKey.movie.pages, 47);
  assert.equal(byKey['video-game'].count, 1222);
  assert.equal(byKey['tv-series'].count, 370);
  assert.equal(byKey.novel.count, 231);
  assert.equal(byKey.practice.count, 228);
  assert.equal(byKey['music-artist'].count, 198);
  assert.equal(byKey.book.count, 64);
  // 89 страниц на язык — число, на котором стоит вся арифметика фазы.
  assert.equal(sums.reduce((s, h) => s + h.pages, 0), 89);
});

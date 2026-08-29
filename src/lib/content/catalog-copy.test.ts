/**
 * СНИППЕТ СТРАНИЦЫ ХАБА — заголовок, описание и строка смысла (`plans/56` шаг 7).
 *
 * Предмет проверки один: **текст говорит о том, что НА ЭТОЙ странице**. До шага 7 все три текста
 * знали только вид целиком, и страница `/en/catalog/movie/25` называлась «top rated on NDim
 * Space», имея ноль оценённых из шестидесяти (`researches/57`, находка 1 — 53 страницы из 89).
 *
 * Мутации, которые эти тесты обязаны ронять:
 *   · ветвить тексты по сводке ВИДА (`summary.rated`) вместо состава СТРАНИЦЫ — вернётся ровно
 *     та неправда, ради которой шаг существует;
 *   · вернуть одно описание на все страницы вида — 47 страниц «Фильмов» снова станут дублями;
 *   · уронить границы страницы (первое и последнее имя) — описания соседних страниц перестанут
 *     различаться, и «своё описание» станет своим только по номеру;
 *   · подставить в заголовок страницы без оценённых слово «топ» / «top rated».
 *
 * ⚠️ Тексты лица продукта здесь НЕ судятся на вкус — они ждут вычитки владельца. Судится
 * ПОВЕДЕНИЕ: какой из вариантов выбран и какие числа в него подставлены.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DESC_LIMIT, hubLede, hubMetaDesc, hubMetaTitle } from './catalog-copy.ts';
import { hubPageFacts, hubPageState, type CatalogCard } from './catalog-hub.ts';

/** Карточка страницы: в тестах меняется ровно то, что тест проверяет. */
const card = (title: string, rates = 0): CatalogCard => ({
  slug: title.toLowerCase().replace(/\s+/g, '-'),
  title,
  year: '2000',
  author: 'Автор',
  rating: rates > 0 ? 8 : 0,
  rates,
});

const page = (cards: CatalogCard[], p = 1, pages = 1) => hubPageFacts(cards, p, pages);

/* ── СОСТАВ СТРАНИЦЫ ──────────────────────────────────────────────────────────────────────── */

test('состав страницы: считает СВОИ карточки, а не вид целиком', () => {
  const facts = page([card('Alpha', 3), card('Beta'), card('Gamma', 1)], 25, 47);
  assert.equal(facts.count, 3);
  assert.equal(facts.rated, 2);
  assert.deepEqual(facts.names, ['Alpha', 'Beta']);
  assert.equal(facts.page, 25);
  assert.equal(facts.pages, 47);
});

test('порог оценённости тот же, что у остального проекта: дробные голоса округляются вниз', () => {
  // 0,9 голоса — это ноль голосов. Второй порог в проекте развёл бы страницу с её же звёздами.
  assert.equal(page([card('A', 0.9)]).rated, 0);
  assert.equal(page([card('A', 1)]).rated, 1);
  assert.equal(page([card('A', Number.NaN)]).rated, 0);
});

test('🔴 имена идут ПЕРЕЧИСЛЕНИЕМ — слова «от … до …» нет ни на одном языке', () => {
  // Диапазон был бы неправдой: неоценённые разведены по слагу из АНГЛИЙСКОГО названия, поэтому
  // на русской странице видимые имена в алфавитном порядке не стоят (З → А на странице 18).
  const facts = page([card('Zulu'), card('Alpha')], 18, 47);
  assert.ok(!hubMetaDesc('Фильмы', 'ru', facts).includes(' до '));
  assert.ok(!hubMetaDesc('Movies', 'en', facts).includes(' to '));
});

test('страница из одного объекта даёт одно имя, а не пару', () => {
  const facts = page([card('Alpha')]);
  assert.deepEqual(facts.names, ['Alpha']);
  assert.match(hubMetaDesc('Фильмы', 'ru', facts), /«Alpha»/);
});

test('пустая страница не даёт ни одного имени', () => {
  const facts = page([]);
  assert.equal(facts.count, 0);
  assert.deepEqual(facts.names, []);
});

/* ── ТРИ СОСТОЯНИЯ, А НЕ ДВА ──────────────────────────────────────────────────────────────── */

test('🔴 состояний ТРИ: ни одной оценки · часть · все', () => {
  assert.equal(hubPageState(page([card('A'), card('B')])), 'none');
  assert.equal(hubPageState(page([card('A', 3), card('B')])), 'mixed');
  assert.equal(hubPageState(page([card('A', 3), card('B', 1)])), 'all');
});

test('🔴 смешанная страница НАЗЫВАЕТ ЧИСЛО — это и отличает 9 из 60 от 58 из 60', () => {
  // Двоичное деление свалило бы `book` (9 из 60) и `tv-series/2` (58 из 60) в одну корзину.
  const few = page([card('A', 3), ...Array.from({ length: 59 }, (_, i) => card(`B${i}`))], 1, 47);
  const many = page([...Array.from({ length: 58 }, (_, i) => card(`A${i}`, 3)), card('Z'), card('Y')], 2, 47);
  assert.match(hubMetaDesc('Книги', 'ru', few), /Оценено 1 из 60/);
  assert.match(hubMetaDesc('Сериалы', 'ru', many), /Оценено 58 из 60/);
  assert.notEqual(hubMetaDesc('Книги', 'ru', few), hubMetaDesc('Книги', 'ru', many));
});

/* ── ЗАГОЛОВОК ────────────────────────────────────────────────────────────────────────────── */

test('заголовок: есть оценённые — страница называет себя топом', () => {
  const facts = page([card('Alpha', 5)], 1, 47);
  assert.match(hubMetaTitle('Фильмы', 'ru', facts), /топ по версии NDim Space/);
  assert.match(hubMetaTitle('Movies', 'en', facts), /top rated on NDim Space/);
});

test('🔴 заголовок: НЕТ оценённых — слова «топ» нет ни на одном языке', () => {
  // Это и есть предмет шага: заголовок не обещает рейтинг, которого на странице нет.
  const facts = page([card('Entrapment'), card('Even Cowgirls Get the Blues')], 25, 47);
  const ru = hubMetaTitle('Фильмы', 'ru', facts);
  const en = hubMetaTitle('Movies', 'en', facts);
  assert.doesNotMatch(ru, /топ/i);
  assert.doesNotMatch(en, /top rated/i);
  assert.match(ru, /каталог NDim Space/);
  assert.match(en, /NDim Space catalog/);
});

test('заголовок несёт номер страницы, когда страниц больше одной, и молчит, когда она одна', () => {
  const many = page([card('A', 1)], 25, 47);
  assert.match(hubMetaTitle('Фильмы', 'ru', many), /страница 25 из 47/);
  assert.match(hubMetaTitle('Movies', 'en', many), /page 25 of 47/);

  const alone = page([card('A', 1)], 1, 1);
  assert.doesNotMatch(hubMetaTitle('Фильмы', 'ru', alone), /страница/);
});

test('🔴 у первой страницы номера НЕТ, хотя страниц 47 — правило шага 7 не тронуло', () => {
  // Первая страница хаба живёт на адресе без номера (`/ru/catalog/movie`), и «страница 1 из 47»
  // в заголовке спорила бы с её же адресом. Тест стоит здесь, чтобы правка снippета не увезла
  // заодно и это — поведение прежнее, и менять его шаг 7 не просили.
  const first = page([card('A', 1)], 1, 47);
  assert.doesNotMatch(hubMetaTitle('Фильмы', 'ru', first), /страница 1 из 47/);
  assert.match(hubMetaTitle('Фильмы', 'ru', first), /^Фильмы — топ по версии NDim Space$/);
});

/* ── ОПИСАНИЕ ─────────────────────────────────────────────────────────────────────────────── */

test('🔴 описание РАЗЛИЧАЕТ соседние страницы одного вида', () => {
  // Прежде `hubMetaDesc(title, lang)` не знал номера страницы вовсе: 47 страниц «Фильмов»
  // несли буквально одинаковое описание. Google называет это бесполезным прямым текстом.
  const p25 = page([card('Entrapment'), card('Even Cowgirls Get the Blues')], 25, 47);
  const p26 = page([card('Fargo'), card('Fight Club')], 26, 47);
  assert.notEqual(hubMetaDesc('Фильмы', 'ru', p25), hubMetaDesc('Фильмы', 'ru', p26));
  assert.notEqual(hubMetaDesc('Movies', 'en', p25), hubMetaDesc('Movies', 'en', p26));
});

test('описание называет имена страницы — то единственное, чего нет у соседок', () => {
  const facts = page([card('Fargo'), card('Alien')], 25, 47);
  const ru = hubMetaDesc('Фильмы', 'ru', facts);
  const en = hubMetaDesc('Movies', 'en', facts);
  assert.match(ru, /«Fargo»/);
  assert.match(en, /“Fargo”/);
});

test('описание называет число объектов ЭТОЙ страницы, а не вида', () => {
  const facts = page([card('A'), card('B'), card('C')], 47, 47);
  assert.match(hubMetaDesc('Фильмы', 'ru', facts), /ещё 1 на этой странице/);
  assert.match(hubMetaDesc('Movies', 'en', facts), /1 more on this page/);
});

/* ── ЛЕСТНИЦА ОТКАТА ДЛИНЫ ───────────────────────────────────────────────────────────────────
 *
 * Замер Дизайнера: шаблон без лестницы дал 35 переполнений из 178 (20 %), худшее — 204 знака,
 * и хуже всех именно случай «без оценок». Лестница снимает содержимое кусками, а не рвёт слово.
 */

test('🔴 описание НИКОГДА не длиннее ориентира — на длинных именах откатывается ступенью', () => {
  const long = 'Even Cowgirls Get the Blues and Then Some More Words To Push It Over';
  for (const [ru, en] of [
    [page([card(long), card(long)], 25, 47), page([card(long), card(long)], 25, 47)],
    [page([card(long, 3), card(long, 2)], 2, 47), page([card(long, 3), card(long, 2)], 2, 47)],
    [page([card(long, 3), card(long)], 2, 47), page([card(long, 3), card(long)], 2, 47)],
  ]) {
    assert.ok(hubMetaDesc('Фильмы', 'ru', ru).length <= DESC_LIMIT);
    assert.ok(hubMetaDesc('Movies', 'en', en).length <= DESC_LIMIT);
  }
});

test('лестница идёт по ступеням: два имени → одно → без имён, но с номером страницы', () => {
  const short = page([card('A'), card('B')], 25, 47);
  assert.match(hubMetaDesc('Фильмы', 'ru', short), /«A», «B»/);

  const mid = page([card('Even Cowgirls Get the Blues'), card('Entrapment')], 25, 47);
  const midText = hubMetaDesc('Фильмы', 'ru', mid);
  assert.match(midText, /«Even Cowgirls Get the Blues»/);
  assert.doesNotMatch(midText, /«Entrapment»/);

  const huge = 'A'.repeat(140);
  const last = hubMetaDesc('Фильмы', 'ru', page([card(huge), card(huge)], 25, 47));
  assert.doesNotMatch(last, /«A+»/);
  assert.match(last, /страница 25 из 47/);
});

test('🔴 последняя ступень несёт НОМЕР — иначе две страницы вида совпали бы побайтно', () => {
  // Без номера у двух страниц одного вида, докатившихся до третьей ступени, описание было бы
  // одинаковым: имён нет, число объектов одно и то же. Замер: без номера совпали две.
  const huge = 'A'.repeat(140);
  const p25 = hubMetaDesc('Фильмы', 'ru', page([card(huge), card(huge)], 25, 47));
  const p26 = hubMetaDesc('Фильмы', 'ru', page([card(huge), card(huge)], 26, 47));
  assert.notEqual(p25, p26);
});

test('описание ветвится по составу страницы: есть оценённые — сказано про оценки', () => {
  const rated = page([card('Alpha', 4), card('Beta', 2)], 1, 47);
  const bare = page([card('Alpha'), card('Beta')], 25, 47);
  assert.match(hubMetaDesc('Фильмы', 'ru', rated), /С оценками людей Пространства NDim/);
  assert.doesNotMatch(hubMetaDesc('Фильмы', 'ru', bare), /С оценками людей/);
  assert.match(hubMetaDesc('Movies', 'en', rated), /Rated by people of NDim Space/);
  assert.doesNotMatch(hubMetaDesc('Movies', 'en', bare), /Rated by people of NDim Space/);
});

test('🔴 ОДНОГО оценённого хватает, чтобы страница считалась оценённой', () => {
  // Граница названа тестом, а не памятью: правило «есть хотя бы один», а не «большинство».
  const facts = page([card('Alpha', 1), card('B'), card('C')], 17, 47);
  assert.match(hubMetaTitle('Фильмы', 'ru', facts), /топ по версии NDim Space/);
});

/* ── СТРОКА СМЫСЛА НА САМОЙ СТРАНИЦЕ ──────────────────────────────────────────────────────── */

test('🔴 строка смысла: НЕТ оценённых — «топа» не обещает и человеку', () => {
  // Заголовок вкладки видит робот, эту строку видит ЧЕЛОВЕК. Правда у них обязана быть одна.
  const bare = page([card('Alpha'), card('Beta')], 25, 47);
  assert.doesNotMatch(hubLede('ru', bare), /Топ по версии/);
  assert.doesNotMatch(hubLede('en', bare), /top/i);
});

test('строка смысла страницы с оценёнными — прежняя, ни на знак не тронутая', () => {
  const rated = page([card('Alpha', 3)], 1, 47);
  assert.match(hubLede('ru', rated), /^Топ по версии NDim Space:/);
  assert.match(hubLede('en', rated), /^The NDim Space top:/);
});

/* ── ИНВАРИАНТЫ ВЛАДЕЛЬЦА НА ВСЕХ ЧЕТЫРЁХ СОСТОЯНИЯХ ──────────────────────────────────────── */

test('🔴 имя величины НЕ переводится ни в одном из состояний', () => {
  for (const facts of [page([card('A', 3)], 1, 47), page([card('A')], 25, 47)]) {
    for (const lang of ['ru', 'en'] as const) {
      const text = `${hubMetaDesc('Фильмы', lang, facts)} ${hubLede(lang, facts)}`;
      assert.match(text, /NDim Space Rating/);
      assert.doesNotMatch(text, /рейтинг NDim|NDim рейтинг/i);
    }
  }
});

test('🔴 ни числа похожести, ни «Рядом в Пространстве» — инвариант владельца', () => {
  for (const facts of [page([card('A', 3)], 1, 47), page([card('A')], 25, 47)]) {
    for (const lang of ['ru', 'en'] as const) {
      const text = [
        hubMetaTitle('Фильмы', lang, facts),
        hubMetaDesc('Фильмы', lang, facts),
        hubLede(lang, facts),
      ].join(' ');
      assert.doesNotMatch(text, /похожест[\p{L}]*/u);
      assert.doesNotMatch(text, /Рядом в Пространстве/);
      assert.doesNotMatch(text, /%/);
    }
  }
});

test('🔴 лицо продукта: ни обещаний, ни оправданий (канон владельца 2026-08-28)', () => {
  // «Мы обещаем…», «у нас нет…», «мы никогда…» — запрещённый класс. Тексты этого шага
  // констатируют факт и мягко поясняют, что такое NDSR, — и ничего не обещают.
  for (const facts of [page([card('A', 3)], 1, 47), page([card('A')], 25, 47)]) {
    for (const lang of ['ru', 'en'] as const) {
      const text = [
        hubMetaTitle('Фильмы', lang, facts),
        hubMetaDesc('Фильмы', lang, facts),
        hubLede(lang, facts),
      ].join(' ');
      assert.doesNotMatch(text, /обеща|мы никогда|у нас нет|we promise|we never|we don't/i);
      assert.doesNotMatch(text, /навсегда|forever/i);
    }
  }
});

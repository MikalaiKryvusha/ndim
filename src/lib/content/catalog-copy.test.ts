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
 * 🔴 ТЕКСТЫ ЗДЕСЬ — ПРИНЯТЫЕ ВЛАДЕЛЬЦЕМ (интервью №066 В1 = А, расписка 2026-08-29 21:55;
 * продолжение случая А — №068 В2 = А с его правкой рукой; «в каталоге» — №067 В2 = А,
 * подтверждено №068 В1 = Б). Источник — `design/hub-texts-approved.md`. Прежняя редакция этих
 * тестов судила АГЕНТСКИЕ тексты с пометкой `[AI]`, и вердикт №36 остановил порцию именно на
 * этом: набор объявлял принятым то, чего владелец не видел.
 *
 * ⚠️ На вкус тексты здесь по-прежнему НЕ судятся — вкус принадлежит владельцу. Судится
 * ПОВЕДЕНИЕ (какой вариант выбран, какие числа подставлены) и ДОСЛОВНОСТЬ (тот ли текст уехал).
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { DESC_LIMIT, hubLede, hubMetaDesc, hubMetaTitle } from './catalog-copy.ts';
import {
  groupByKind,
  hubPageFacts,
  hubPageState,
  pageCount,
  slicePage,
  toCard,
  type CatalogCard,
  type CatalogItem,
} from './catalog-hub.ts';
import { kindTitle, kindTitleLower, type KindKey } from './dim-kind.ts';

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
  assert.deepEqual(facts.names, ['Alpha', 'Gamma']);
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

test('🔴 имена страницы — ПЕРВОЕ и ПОСЛЕДНЕЕ, а не первые два', () => {
  // Принятые тексты, §3: «{перв}», «{посл}». Два соседа по списку — одна точка списка, показанная
  // дважды; первое и последнее очерчивают страницу целиком. Прежняя редакция брала `slice(0, 2)`,
  // и на `movie/8` это давало «Академия вампиров» вместо принятого «Топ Ган: Мэверик» (вердикт
  // №36, Д1, класс различий 2). Тест падает при возврате `slice(0, 2)` — середина сюда не попадёт.
  const facts = page([card('Первый'), card('Средний'), card('Ещё средний'), card('Последний')], 3, 47);
  assert.deepEqual(facts.names, ['Первый', 'Последний']);
  const ru = hubMetaDesc('Фильмы', 'ru', facts);
  assert.match(ru, /«Первый», «Последний»/);
  assert.doesNotMatch(ru, /Средний/);
});

test('страница из одного объекта даёт одно имя, а не пару', () => {
  const facts = page([card('Alpha')]);
  assert.deepEqual(facts.names, ['Alpha']);
  assert.match(hubMetaDesc('Фильмы', 'ru', facts), /«Alpha»/);
});

test('🔴 Р6: страница из одной карточки не задваивает имя', () => {
  // Первое и последнее — одна и та же карточка. Шаблон напечатал бы ««X», «X» и другие»; вместо
  // этого лестница берётся за ступень «одно имя».
  // 📐 Замер каталога 2026-08-30: страниц с одной карточкой НОЛЬ (минимум 4, `book/2`), то есть
  // риск сегодня не встречается и стоит на будущую партию. Синтетическая фикстура — единственный
  // способ его проверить, и это названо честно.
  const facts = page([card('Одинокий')], 7, 47);
  assert.deepEqual(facts.names, ['Одинокий']);
  const ru = hubMetaDesc('Фильмы', 'ru', facts);
  assert.match(ru, /«Одинокий» и другие/);
  assert.doesNotMatch(ru, /«Одинокий», «Одинокий»/);
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

test('🔴 три состояния дают ТРИ разных текста, а не два', () => {
  // Двоичное деление свалило бы `book/1` (9 из 60) и `tv-series/2` (58 из 60) в одну корзину.
  // Разделение живёт, но говорит теперь не числом, а хвостом: «Ваша оценка будет первой» ·
  // «Ставьте оценки» · «Что выбрать — подскажет».
  const none = page([card('A'), card('B')], 1, 47);
  const mixed = page([card('A', 3), card('B')], 2, 47);
  const all = page([card('A', 3), card('B', 1)], 3, 47);
  const d = (f: ReturnType<typeof page>) => hubMetaDesc('Книги', 'ru', f);
  assert.match(d(none), /Ваша оценка будет первой/);
  assert.match(d(mixed), /Ставьте оценки/);
  assert.match(d(all), /Что выбрать — подскажет/);
  assert.equal(new Set([d(none), d(mixed), d(all)]).size, 3);
});

test('🔴 ЧИСЛО «оценено 9 из 60» в принятой редакции ОТСУТСТВУЕТ — и это записано, а не забыто', () => {
  /*
   * Прежняя агентская редакция несла в смешанном случае «Оценено 9 из 60» — один факт, которым
   * `book/1` отличался от `tv-series/2` (58 из 60). Принятая владельцем редакция (§3) его не
   * содержит, и тест закрепляет ПРИНЯТОЕ, а не сожаление автора.
   *
   * 📌 Вопрос о возврате числа подан владельцу через Менеджера отдельной строкой очереди
   * (смена 14). Придёт его слово «вернуть» — падает ЭТОТ тест, и падает адресно: он и есть
   * место, где решение записано. До тех пор число не возвращается ничьей инициативой.
   */
  const mixed = page([card('A', 3), ...Array.from({ length: 59 }, (_, i) => card(`B${i}`))], 1, 47);
  assert.doesNotMatch(hubMetaDesc('Книги', 'ru', mixed), /Оценено \d+ из \d+/);
  assert.doesNotMatch(hubMetaDesc('Books', 'en', mixed), /\d+ of \d+ rated/);
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
  assert.match(ru, /^Фильмы в каталоге NDim Space/);
  assert.match(en, /^Movies in the NDim Space catalog/);
});

test('🔴 заголовок: СМЕШАННАЯ страница тоже не зовёт себя топом', () => {
  /*
   * Прежняя редакция отдавала «топ» всему, где `rated !== 0`, — то есть и странице с 9
   * оценёнными из 60. Порядок на ней действительно взвешенный, ложью это не было, но заголовок
   * оверселлил. Владелец решил иначе: топ — только случай А (§2 принятых текстов).
   * Мутация «вернуть `!== 'none'`» роняет ровно этот тест.
   */
  const mixed = page([card('A', 3), card('B'), card('C')], 4, 47);
  assert.match(hubMetaTitle('Книги', 'ru', mixed), /^Книги в каталоге NDim Space/);
  assert.doesNotMatch(hubMetaTitle('Книги', 'ru', mixed), /топ/i);
  assert.match(hubMetaTitle('Books', 'en', mixed), /^Books in the NDim Space catalog/);
});

test('🔴 «в каталоге» — слово владельца, решённое ДВАЖДЫ, а не самая короткая форма', () => {
  /*
   * №067 В2 = А (2026-08-29 22:51), подтверждено №068 В1 = Б (23:28) после того, как ему честно
   * показали столкновение с уже принятым №066 В1. Цена названа в документе: «Музыкальные
   * исполнители в каталоге NDim Space, страница 4 из 4» — 62 знака при ориентире 60. Единство
   * 89 заголовков куплено двумя знаками сверх ориентира на ОДНОМ виде из семи.
   * ⛔ Тест стоит здесь, чтобы будущая сессия не «оптимизировала» это в «каталог NDim Space».
   */
  const facts = page([card('A'), card('B')], 4, 4);
  assert.equal(
    hubMetaTitle('Музыкальные исполнители', 'ru', facts),
    'Музыкальные исполнители в каталоге NDim Space, страница 4 из 4',
  );
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

test('🔴 описание собрано в порядке ГОЛОВА · ИМЕНА · ХВОСТ и дословно совпадает с принятым', () => {
  /*
   * Дословная сверка — единственное, что ловит дефект Д1 вердикта №36: прежняя реализация была
   * исправна ПО ПОВЕДЕНИЮ (ветвилась по составу страницы, откатывалась лестницей) и при этом
   * несла не тот текст. Поведенческая проверка это пропускала по построению.
   */
  const facts = page([card('Непрощённый', 4), card('Топ Ган: Мэверик', 3)], 8, 47);
  assert.equal(
    hubMetaDesc('Фильмы', 'ru', facts),
    'Фильмы с оценками людей Пространства NDim Space: «Непрощённый», «Топ Ган: Мэверик» и другие. ' +
      'Что выбрать — подскажет NDim Space Rating, рейтинг сообщества.',
  );
  const bare = page([card('Западня'), card('Крепость')], 25, 47);
  assert.equal(
    hubMetaDesc('Фильмы', 'ru', bare),
    'Фильмы каталога NDim Space: «Западня», «Крепость» и другие. ' +
      'Ваша оценка будет первой, и Пространство NDim Space найдёт Вам похожих людей.',
  );
  assert.equal(
    hubMetaDesc('Movies', 'en', bare),
    'Movies in the NDim Space catalog: “Западня”, “Крепость” and more. ' +
      'Your rating will be the first, and NDim Space will find you similar people.',
  );
});

/* ── ЛЕСТНИЦА ОТКАТА ДЛИНЫ ───────────────────────────────────────────────────────────────────
 *
 * Замер на ПРИНЯТЫХ текстах: шаблон с двумя именами, ДО всякого отката, даёт 87 переполнений из
 * 178 (49 %), худшее — 208 знаков (`video-game/14` en). Лестница снимает содержимое кусками, а не
 * рвёт слово. Перемер одной командой: `node tools/measure-hub-copy.mjs`.
 *
 * ⚠️ Прежняя редакция этого блока говорила «35 из 178 (20 %), худшее 204» — число было снято на
 * ДРУГОЙ редакции текстов и перенесено без перемера (`design/hub-texts-approved.md` §5).
 */

/** Длина в ЗНАКАХ — тем же измерителем, каким мерит реализация и прибор замера. */
const chars = (v: string) => [...v].length;

test('🔴 описание НИКОГДА не длиннее ориентира — на длинных именах откатывается ступенью', () => {
  const long = 'Even Cowgirls Get the Blues and Then Some More Words To Push It Over';
  for (const [ru, en] of [
    [page([card(long), card(long)], 25, 47), page([card(long), card(long)], 25, 47)],
    [page([card(long, 3), card(long, 2)], 2, 47), page([card(long, 3), card(long, 2)], 2, 47)],
    [page([card(long, 3), card(long)], 2, 47), page([card(long, 3), card(long)], 2, 47)],
  ]) {
    assert.ok(chars(hubMetaDesc('Фильмы', 'ru', ru)) <= DESC_LIMIT);
    assert.ok(chars(hubMetaDesc('Movies', 'en', en)) <= DESC_LIMIT);
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
  assert.match(hubMetaDesc('Фильмы', 'ru', rated), /с оценками людей Пространства NDim Space/);
  assert.doesNotMatch(hubMetaDesc('Фильмы', 'ru', bare), /с оценками людей/);
  assert.match(hubMetaDesc('Movies', 'en', rated), /rated by people of NDim Space/);
  assert.doesNotMatch(hubMetaDesc('Movies', 'en', bare), /rated by people of NDim Space/);
});

test('🔴 ОДНОГО НЕОЦЕНЁННОГО хватает, чтобы страница перестала быть топом', () => {
  /*
   * ⚠️ ГРАНИЦА ПЕРЕВЁРНУТА ПО СЛОВУ ВЛАДЕЛЬЦА, и это записано, а не сделано молча.
   *
   * Прежний тест утверждал обратное: «одного оценённого хватает, чтобы страница считалась
   * оценённой», и заголовок звал топом всё, где `rated !== 0`. Принятые тексты (§2, №066 В1 = А)
   * оставляют «топ» ТОЛЬКО случаю А — когда оценены ВСЕ карточки страницы.
   *
   * Что тест стережёт теперь: 59 оценённых из 60 — ещё не топ. Мутация «вернуть `!== 'none'`»
   * роняет его первым, потому что он стоит ровно на единице, отделяющей А от В.
   */
  const almost = page([...Array.from({ length: 59 }, (_, i) => card(`A${i}`, 3)), card('Один без оценки')], 17, 47);
  assert.equal(hubPageState(almost), 'mixed');
  assert.doesNotMatch(hubMetaTitle('Фильмы', 'ru', almost), /топ по версии NDim Space/);

  const full = page(Array.from({ length: 60 }, (_, i) => card(`A${i}`, 3)), 17, 47);
  assert.equal(hubPageState(full), 'all');
  assert.match(hubMetaTitle('Фильмы', 'ru', full), /топ по версии NDim Space/);
});

/* ── СТРОКА СМЫСЛА НА САМОЙ СТРАНИЦЕ ──────────────────────────────────────────────────────── */

test('🔴 вводная строка: НЕТ оценённых — «топа» не обещает и человеку', () => {
  // Заголовок вкладки видит робот, эту строку видит ЧЕЛОВЕК. Правда у них обязана быть одна.
  const bare = page([card('Alpha'), card('Beta')], 25, 47);
  assert.doesNotMatch(hubLede('фильмы', 'ru', bare), /Топ по версии/);
  assert.doesNotMatch(hubLede('movies', 'en', bare), /top/i);
});

test('вводная строка случая А — прежняя, плюс принятое владельцем продолжение', () => {
  /*
   * 🔴 Продолжение принято интервью №068 В2 = А, и владелец переставил слова СВОЕЙ РУКОЙ: было
   * «то, что любите Вы», стало «то, что Вы любите». Сверка ДОСЛОВНАЯ, потому что предмет здесь —
   * его рука: перестановка обратно была бы нашей редактурой чужого текста (вердикт №35, У3).
   */
  const rated = page([card('Alpha', 3)], 1, 47);
  assert.equal(
    hubLede('фильмы', 'ru', rated),
    'Топ по версии NDim Space: выше то, что людям понравилось больше, — с поправкой на то, ' +
      'сколько человек оценило. Оцените то, что Вы любите, и Пространство NDim Space найдёт Вам ' +
      'людей, которые думают так же, как и Вы.',
  );
  assert.equal(
    hubLede('movies', 'en', rated),
    'The NDim Space top: what people liked more comes first, adjusted for how many rated it. ' +
      'Rate what you love, and NDim Space will find you people who think the way you do.',
  );
});

test('🔴 вводная строка случая Б — принятая редакция, дословно, со строчной формой вида', () => {
  const bare = page([card('Alpha'), card('Beta')], 25, 47);
  assert.equal(
    hubLede('фильмы', 'ru', bare),
    'NDim Space Rating отображает симпатии пользователей Пространства NDim Space. Эти фильмы ' +
      'пока ждут первой оценки. Оцените фильмы, которые Вы любите, и Пространство NDim Space ' +
      'найдёт Вам людей, которые думают так же, как и Вы. Ваша оценка будет первой!',
  );
  assert.equal(
    hubLede('movies', 'en', bare),
    'NDim Space Rating shows what people of NDim Space like. These movies are waiting for a ' +
      'first rating. Rate the movies you love, and NDim Space will find you people who think ' +
      'the way you do. Your rating will be the first here!',
  );
});

test('🔴 вводная строка случая В — «ниже на этой странице» правда ПО ПОСТРОЕНИЮ', () => {
  // `makeComparator` ставит оценённых первыми, значит ждущие первой оценки стоят ниже. Строка
  // привязана к порядку сортировки: поменяется порядок — эту строку надо менять вместе с ним.
  const mixed = page([card('Alpha', 3), card('Beta')], 2, 47);
  assert.equal(
    hubLede('книги', 'ru', mixed),
    'Топ по версии NDim Space: выше то, что людям понравилось больше, — с поправкой на то, ' +
      'сколько человек оценило. Ниже на этой странице стоят книги, которые ждут первой оценки. ' +
      'Оцените их, и Пространство NDim Space найдёт Вам людей, которые думают так же, как и Вы.',
  );
});

test('🔴 КЕЙС-14: строчная форма вида приходит ТАБЛИЦЕЙ — «TV series» не становится «tv series»', () => {
  /*
   * Разделяющий случай правила §7 п.4. Проверяется САМА таблица (`kindTitleLower`), а не то,
   * что вводная строка подставила переданную ей строку: подстановку доказать легко и бесполезно,
   * дефект живёт в источнике формы. Мутация `toLowerCase()` роняет ровно эту проверку.
   */
  assert.equal(kindTitleLower('tv-series', 'en'), 'TV series');
  assert.equal(kindTitleLower('movie', 'en'), 'movies');
  assert.equal(kindTitleLower('tv-series', 'ru'), 'телесериалы');
  assert.notEqual(kindTitleLower('tv-series', 'en'), kindTitle('tv-series', 'en').toLowerCase());

  const bare = page([card('A'), card('B')], 2, 7);
  assert.match(hubLede(kindTitleLower('tv-series', 'en'), 'en', bare), /These TV series are waiting/);
});

/* ── ИНВАРИАНТЫ ВЛАДЕЛЬЦА НА ВСЕХ ЧЕТЫРЁХ СОСТОЯНИЯХ ──────────────────────────────────────── */

test('🔴 имя величины НЕ переводится ни в одном из состояний', () => {
  for (const facts of [page([card('A', 3)], 1, 47), page([card('A')], 25, 47)]) {
    for (const lang of ['ru', 'en'] as const) {
      const text = `${hubMetaDesc('Фильмы', lang, facts)} ${hubLede('фильмы', lang, facts)}`;
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
        hubLede('фильмы', lang, facts),
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
        hubLede('фильмы', lang, facts),
      ].join(' ');
      assert.doesNotMatch(text, /обеща|мы никогда|у нас нет|we promise|we never|we don't/i);
      assert.doesNotMatch(text, /навсегда|forever/i);
    }
  }
});

/* ── БОЕВОЙ КАТАЛОГ: КЕЙС-06…13 НАБОРА `qa/suites/catalog-hub-snippets.md` ────────────────────
 *
 * 🔴 ЗАЧЕМ ЭТОТ БЛОК СУЩЕСТВУЕТ — условие 2 вердикта №36, дословно: «Числа КЕЙС-06/07/08
 * пересчитать на той редакции, которая уедет, и ЗАКРЫТЬ ЮНИТОМ — иначе они разъедутся снова при
 * первой правке шаблона».
 *
 * 🔑 Что показал пересчёт, и это стоит записать: **менять в наборе не пришлось ни одного числа.**
 * 155 и 135 были верны для ПРИНЯТЫХ владельцем текстов с самого начала — расходилась с ними
 * реализация, которая несла другую редакцию (вердикт №36, Д1). Судья назвал причину точно: «кейс
 * списан с текстов Дизайнера, а проверяет код с другими». Код пришёл к чек-листу, а не наоборот.
 *
 * ⚠️ ЧТО ЭТИ ТЕСТЫ МЕРЯЮТ И ЧЕГО НЕ МЕРЯЮТ. Они зовут настоящую цепочку продукта —
 * `slicePage` → `toCard` → `hubPageFacts` → `hubMetaDesc` — на настоящем каталоге. Они НЕ
 * поднимают сборку и ничего не говорят об отданном HTML: это работа стража
 * `tools/verify-catalog-hubs.mjs` и кадров живого браузера. Здесь судится ТЕКСТ, а не страница.
 *
 * ⚠️ Числа привязаны к составу каталога (замер 2026-08-30, 5125 записей). Придёт новая партия —
 * состав страниц сдвинется, и эти тесты покраснеют. Это НЕ ложная тревога: сдвиг состава меняет
 * то, что читают люди в выдаче, и требует перемера, а не молчания. Перемер одной командой:
 * `node tools/measure-hub-copy.mjs`.
 */

const BUILD = new URL('./dims-build.json', import.meta.url);
const CATALOG = existsSync(BUILD) ? (JSON.parse(readFileSync(BUILD, 'utf8')) as CatalogItem[]) : null;

/*
 * Форма пропуска — родная для `node --test`: тест объявлен ВСЕГДА, поэтому общее число тестов не
 * зависит от наличия артефакта, а разница видна строкой `skipped` и названной причиной. Приём
 * взят у соседнего набора (`catalog-hub.test.ts`), где он оплачен прогоном, который был короче
 * полного на четыре теста и выглядел ровно так же зелено.
 */
const NO_BUILD = CATALOG ? false : 'нет src/lib/content/dims-build.json — сначала npm run build';
const HUBS = CATALOG ? groupByKind(CATALOG).hubs : null;

/** Страница боевого каталога, пройденная настоящей цепочкой продукта. */
const live = (kind: KindKey, page: number, lang: 'ru' | 'en') => {
  const list = HUBS!.get(kind)!;
  const pages = pageCount(list.length);
  const facts = hubPageFacts(
    slicePage(list, page).map((d) => toCard(d, lang)),
    page,
    pages,
  );
  return { facts, title: kindTitle(kind, lang) };
};

/** Сколько имён в описании: считаем ОТКРЫВАЮЩИЕ кавычки — по одной на имя, в обоих языках. */
const namesIn = (desc: string) => (desc.match(/[«“]/g) ?? []).length;

test('🔴 КЕЙС-06 · 07 · 08: граница ступени на `movie/8` ru, ТРИ значения порога', { skip: NO_BUILD }, () => {
  /*
   * Одна страница, три порога — и это тот самый юнит, «падающий при сдвиге длины на знак»,
   * которого потребовало условие 2 вердикта. Сдвинь шаблон на один знак в любую сторону, и хотя
   * бы одна из строк ниже покраснеет: при 155 текст перестанет влезать (уйдёт на ступень 2)
   * либо при 154 внезапно влезет (останется на ступени 1).
   */
  const { facts, title } = live('movie', 8, 'ru');
  const at = (limit: number) => hubMetaDesc(title, 'ru', facts, limit);

  // КЕЙС-06 — ориентир 155: ступень 1 (два имени), длина РОВНО 155.
  assert.equal(namesIn(at(155)), 2);
  assert.equal(chars(at(155)), 155);

  // КЕЙС-07 — ориентир 156: та же ступень 1. Граница не «плавает» от запаса.
  assert.equal(namesIn(at(156)), 2);
  assert.equal(at(156), at(155));

  // КЕЙС-08 — ориентир 154: ступень 2 (одно имя), длина 135.
  assert.equal(namesIn(at(154)), 1);
  assert.equal(chars(at(154)), 135);
});

test('КЕЙС-09: `video-game/10` en — верхняя граница ступени 2, ровно 155 с ОДНИМ именем', { skip: NO_BUILD }, () => {
  const { facts, title } = live('video-game', 10, 'en');
  const desc = hubMetaDesc(title, 'en', facts);
  assert.equal(namesIn(desc), 1);
  assert.equal(chars(desc), 155);
});

test('КЕЙС-10: `video-game/14` — ступень 3: имён нет, номер страницы есть, 127 ru и 129 en', { skip: NO_BUILD }, () => {
  const ru = live('video-game', 14, 'ru');
  const en = live('video-game', 14, 'en');
  const dRu = hubMetaDesc(ru.title, 'ru', ru.facts);
  const dEn = hubMetaDesc(en.title, 'en', en.facts);
  assert.equal(namesIn(dRu), 0);
  assert.equal(namesIn(dEn), 0);
  assert.equal(chars(dRu), 127);
  assert.equal(chars(dEn), 129);
  assert.match(dRu, /страница 14 из 21/);
  assert.match(dEn, /page 14 of 21/);
});

/** Все 89 страниц × 2 языка, собранные настоящей цепочкой, — материал КЕЙС-11 и КЕЙС-12. */
const allPages = () => {
  const out: { where: string; lang: 'ru' | 'en'; desc: string }[] = [];
  for (const [kind, list] of HUBS!) {
    const pages = pageCount(list.length);
    for (let page = 1; page <= pages; page += 1) {
      for (const lang of ['ru', 'en'] as const) {
        const { facts, title } = live(kind, page, lang);
        out.push({ where: `${kind}/${page} ${lang}`, lang, desc: hubMetaDesc(title, lang, facts) });
      }
    }
  }
  return out;
};

test('🔴 КЕЙС-11: 89 из 89 описаний различны на каждом языке, переполнений НОЛЬ, 155 · 121', { skip: NO_BUILD }, () => {
  const rows = allPages();
  assert.equal(rows.length, 178, 'ожидались 89 страниц × 2 языка');

  assert.deepEqual(
    rows.filter((r) => chars(r.desc) > DESC_LIMIT).map((r) => `${r.where} = ${chars(r.desc)}`),
    [],
    'ни одно описание не смеет перерасти ориентир — лестница обязана была отступить',
  );

  const lens = rows.map((r) => chars(r.desc));
  assert.equal(Math.max(...lens), 155);
  assert.equal(Math.min(...lens), 121);

  for (const lang of ['ru', 'en'] as const) {
    const side = rows.filter((r) => r.lang === lang);
    assert.equal(side.length, 89);
    assert.equal(new Set(side.map((r) => r.desc)).size, 89, `дубль описания на языке ${lang}`);
  }
});

test('🔴 КЕЙС-12: ступени 91 / 82 / 5, и третью занимают ровно пять НАЗВАННЫХ страниц', { skip: NO_BUILD }, () => {
  const rows = allPages();
  assert.equal(rows.filter((r) => namesIn(r.desc) === 2).length, 91);
  assert.equal(rows.filter((r) => namesIn(r.desc) === 1).length, 82);
  assert.equal(rows.filter((r) => namesIn(r.desc) === 0).length, 5);

  // Поимённо — иначе «пять» держалось бы арифметикой, а не адресами: пять ЛЮБЫХ страниц дали бы
  // то же число. Список — из фикстуры §6 принятого документа.
  assert.deepEqual(
    rows.filter((r) => namesIn(r.desc) === 0).map((r) => r.where).sort(),
    ['movie/1 ru', 'video-game/1 ru', 'video-game/14 en', 'video-game/14 ru', 'video-game/4 ru'],
  );
});

test('🔴 КЕЙС-13: `movie/25` — контроль признака. Оценённых на СТРАНИЦЕ ноль при 983 по виду', { skip: NO_BUILD }, () => {
  /*
   * Главная проверка всей порции. Признак, взятый от сводки ВИДА (`rated > 0`), выбрал бы здесь
   * «вариант про рейтинг» — то есть воспроизвёл бы ровно тот дефект, ради которого работа
   * затевается: страница с нулём оценённых называлась «top rated on NDim Space».
   * Мутация М5 (подменить признак на сводку вида) роняет этот тест первым.
   */
  const { facts, title } = live('movie', 25, 'ru');
  assert.equal(facts.rated, 0, 'на странице 25 «Фильмов» оценённых нет');
  assert.equal(facts.count, 60);
  assert.equal(hubPageState(facts), 'none');

  // Сводка ВИДА знает совсем другое число — и она тут ни при чём. Дробью, а не голым нулём:
  // «оценённых 0» без знаменателя читалось бы как «прибор ничего не нашёл» (правило 10).
  const byKind = HUBS!.get('movie')!.filter((d) => Math.floor(d.rates ?? 0) >= 1).length;
  assert.ok(byKind > 900, `сводка вида: оценённых ${byKind} из ${HUBS!.get('movie')!.length}`);

  assert.doesNotMatch(hubMetaTitle(title, 'ru', facts), /топ/i);
  assert.match(hubMetaDesc(title, 'ru', facts), /Ваша оценка будет первой/);
  assert.doesNotMatch(hubLede('фильмы', 'ru', facts), /Топ по версии/);
});

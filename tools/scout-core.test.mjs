/**
 * ЮНИТЫ ЯДРА РАЗВЕДКИ (`tools/lib/scout-core.mjs`) — три фикса скаута, постановка 2026-08-22.
 *
 * 🔴 ПРИЁМКА ДЕТЕРМИНИРОВАННАЯ: ответы источника ЗАФИКСИРОВАНЫ фикстурами, сети здесь нет ни в
 * одном тесте. Решение Менеджера, и оно верное: живая Wikidata недетерминирована, вчерашний
 * зелёный на ней ничего не говорит о сегодняшнем коде. Живой прогон у прибора остаётся, но он —
 * НАБЛЮДЕНИЕ, а не ворота.
 *
 * Фикстуры сняты по форме настоящего ответа WDQS (`results.bindings`, значения в `.value`),
 * а числа и даты в них — настоящие: «Кобра» 1986 года действительно имеет свежую дату
 * переиздания рядом с первой, и ровно поэтому она выбрана обязательным случаем постановки.
 *
 * Прогон: node --test tools/scout-core.test.mjs   ·   npm run test:tools
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  firstReleaseYear, firstReleaseDate, sparqlNarrow, sparqlEnrich, narrowRowsToQids, rowsToItems,
  resolveOutPath, SEASON_PROPS, DEFAULT_OUT_DIR,
} from './lib/scout-core.mjs';

const ВИД_ФИЛЬМ = { qid: 'Q11424', ru: 'Фильм', en: 'Film' };
const ВИД_СЕРИАЛ = { qid: 'Q5398426', ru: 'Сериал', en: 'TV series', viaSeasons: true };

/** Строка ответа WDQS в той форме, в какой её отдаёт сервис. */
const строка = ({ qid, sitelinks, ru = '', en = '', dates, srcs = 'item' }) => ({
  item: { value: `http://www.wikidata.org/entity/${qid}` },
  sitelinks: { value: String(sitelinks) },
  ...(ru ? { labelRu: { value: ru } } : {}),
  ...(en ? { labelEn: { value: en } } : {}),
  dates: { value: dates },
  srcs: { value: srcs },
});

// ── 1. ОБЯЗАТЕЛЬНЫЙ СЛУЧАЙ: «Кобра» Q637290 — полный набор дат даёт 1986, а не 2026 ─────────

test('«Кобра» Q637290: минимум полного набора дат — 1986, и в новинки 2026 она НЕ идёт', () => {
  // У фильма 1986 года рядом с первой датой живёт дата переиздания. Прежний прибор брал ту дату,
  // что попала в фильтр года, и объявлял «Кобру» новинкой 2026-го. Это и есть замеренный класс
  // «почти половина новинок оказалась переизданиями».
  const даты = '1986-05-23T00:00:00Z|1987-02-06T00:00:00Z|2026-03-11T00:00:00Z';
  assert.equal(firstReleaseYear(даты), 1986);

  const { найденные, переиздания } = rowsToItems(
    [строка({ qid: 'Q637290', sitelinks: 34, ru: 'Кобра', en: 'Cobra', dates: даты })],
    ВИД_ФИЛЬМ, 2026,
  );
  assert.equal(найденные.length, 0, '«Кобра» не имеет права попасть в новинки 2026');
  assert.equal(переиздания.length, 1, 'она обязана быть НАЗВАНА отсеянной, а не исчезнуть молча');
  assert.equal(переиздания[0].year, '1986');
});

test('настоящая новинка года проходит', () => {
  const { найденные, переиздания } = rowsToItems(
    [строка({ qid: 'Q999', sitelinks: 20, ru: 'Новинка', en: 'Novelty', dates: '2026-04-01T00:00:00Z|2026-09-02T00:00:00Z' })],
    ВИД_ФИЛЬМ, 2026,
  );
  assert.equal(найденные.length, 1);
  assert.equal(переиздания.length, 0);
  assert.equal(найденные[0].year, '2026');
});

test('минимум берётся по ВСЕМУ набору, а порядок дат значения не имеет', () => {
  assert.equal(firstReleaseYear('2026-01-01T00:00:00Z|1999-05-05T00:00:00Z'), 1999);
  assert.equal(firstReleaseYear(['1999-05-05T00:00:00Z', '2026-01-01T00:00:00Z']), 1999);
});

test('пустой набор дат — null, а не «сегодня»', () => {
  // Отсутствующая дата это отсутствующий факт. Выдуманное число хуже отсутствующего.
  assert.equal(firstReleaseYear(''), null);
  assert.equal(firstReleaseYear([]), null);
  assert.equal(firstReleaseYear(null), null);
  const { найденные, переиздания } = rowsToItems(
    [строка({ qid: 'Q1', sitelinks: 20, ru: 'Без даты', dates: '' })], ВИД_ФИЛЬМ, 2026);
  assert.equal(найденные.length, 0, 'запись без даты не может числиться новинкой года');
  assert.equal(переиздания[0].year, '');
});

// ── 2. ОБЯЗАТЕЛЬНЫЙ СЛУЧАЙ: сериал без своей P577 находится через сезон ─────────────────────

test('сериал БЕЗ своей даты находится через сезон и считается добранным', () => {
  // Даты пришли только от сезонов — значит своей у сериала не было, и прежний запрос терял его
  // целиком: не «его нет», а «его не спросили».
  const { найденные, черезСезон } = rowsToItems(
    [строка({ qid: 'Q42', sitelinks: 19, ru: 'Сериал', en: 'Series', dates: '2026-02-10T00:00:00Z', srcs: 'season' })],
    ВИД_СЕРИАЛ, 2026,
  );
  assert.equal(найденные.length, 1, 'сериал обязан находиться');
  assert.equal(черезСезон, 1, 'добор через сезон обязан считаться числом, а не подразумеваться');
  assert.equal(найденные[0].датыОтСезона, true);
});

test('сериал СО своей датой добранным не числится', () => {
  // Иначе число «добрано через сезон» врало бы вверх и хвалило прибор за работу, которой не было.
  const { найденные, черезСезон } = rowsToItems(
    [строка({ qid: 'Q43', sitelinks: 25, ru: 'Свой', dates: '2026-02-10T00:00:00Z', srcs: 'item|season' })],
    ВИД_СЕРИАЛ, 2026,
  );
  assert.equal(найденные.length, 1);
  assert.equal(черезСезон, 0);
  assert.equal(найденные[0].датыОтСезона, false);
});

test('сезон СТАРОГО сериала не делает его новинкой', () => {
  // Свежий сезон сериала 2011 года — не новинка 2026-го: минимум по полному набору это ловит.
  const { найденные, переиздания } = rowsToItems(
    [строка({ qid: 'Q44', sitelinks: 90, ru: 'Старый', dates: '2011-04-17T00:00:00Z|2026-01-05T00:00:00Z', srcs: 'season' })],
    ВИД_СЕРИАЛ, 2026,
  );
  assert.equal(найденные.length, 0);
  assert.equal(переиздания[0].year, '2011');
});

// ── 3. ЗАПРОС: полный набор утверждений и ветка сезонов ────────────────────────────────────

test('ДОБОР берёт ПОЛНЫЙ набор утверждений, а не `wdt:`', () => {
  // Это и есть фикс 1: решение «новинка или переиздание» принимается по полному набору дат.
  const q = sparqlEnrich(['Q1', 'Q2']);
  assert.match(q, /p:P577\/ps:P577/u, 'полный набор утверждений обязателен');
  assert.doesNotMatch(q, /wdt:P577/u, '`wdt:` отдаёт только предпочтительные — минимум завышается');
  assert.match(q, /GROUP_CONCAT\(DISTINCT STR\(\?date\)/u, 'набор дат обязан доехать до кода целиком');
  assert.match(q, /VALUES \?item \{ wd:Q1 wd:Q2 \}/u, 'добор обязан быть сужен перечнем QID');
});

test('СУЖЕНИЕ остаётся дешёвым: `wdt:`, без меток и без DISTINCT', () => {
  // Цена замерена живым прогоном: `DISTINCT` стоит +23 с, `OPTIONAL`-метки — обрыв на 60 с.
  const q = sparqlNarrow('Q11424', { year: 2026, minSitelinks: 12, limit: 400 });
  assert.match(q, /wdt:P577/u);
  assert.doesNotMatch(q, /DISTINCT/u, 'DISTINCT в сужении стоит десятки секунд');
  assert.doesNotMatch(q, /rdfs:label/u, 'метки на широком наборе роняют запрос в потолок WDQS');
  assert.match(q, /LIMIT 400/u);
  assert.match(q, /YEAR\(\?d\) = 2026/u);
  assert.match(q, /\?sitelinks >= 12/u);
});

test('ветка сезонов есть у сериала и отсутствует у фильма — в ОБОИХ запросах', () => {
  const сужениеС = sparqlNarrow('Q5398426', { year: 2026, minSitelinks: 12, limit: 400, viaSeasons: true });
  const сужениеФ = sparqlNarrow('Q11424', { year: 2026, minSitelinks: 12, limit: 400 });
  const доборС = sparqlEnrich(['Q1'], { viaSeasons: true });
  const доборФ = sparqlEnrich(['Q1']);
  for (const p of SEASON_PROPS) {
    assert.match(сужениеС, new RegExp(`wdt:${p}`, 'u'), `связь ${p} обязана быть в сужении сериалов`);
    assert.match(доборС, new RegExp(`wdt:${p}`, 'u'), `связь ${p} обязана быть в доборе сериалов`);
    assert.doesNotMatch(сужениеФ, new RegExp(`wdt:${p}`, 'u'), 'фильму ветка сезонов ничего не находит');
    assert.doesNotMatch(доборФ, new RegExp(`wdt:${p}`, 'u'), 'фильму ветка сезонов ничего не находит');
  }
  assert.match(доборС, /BIND\("season" AS \?src\)/u, 'источник даты обязан быть помечен');
});

test('QID из сужения собираются без повторов', () => {
  // Повторы неизбежны: у объекта несколько дат, и он приходит несколькими строками. Дедупликация
  // ушла в код именно потому, что `DISTINCT` на стороне сервиса стоил 23 лишние секунды.
  const строки = [
    { item: { value: 'http://www.wikidata.org/entity/Q1' } },
    { item: { value: 'http://www.wikidata.org/entity/Q1' } },
    { item: { value: 'http://www.wikidata.org/entity/Q2' } },
    {},
  ];
  assert.deepEqual(narrowRowsToQids(строки), ['Q1', 'Q2']);
  assert.deepEqual(narrowRowsToQids(null), []);
});

// ── 4. ОБЯЗАТЕЛЬНЫЙ СЛУЧАЙ: --out уводит отчёт из candidates/ ──────────────────────────────

test('--out уводит отчёт из candidates/, и прежнее поведение сохранено', () => {
  // Ради этого фикс и затевался: при замороженном судом `candidates/` прибор обязан запускаться.
  assert.equal(resolveOutPath('test-results/scout.md', 2026), 'test-results/scout.md');
  assert.equal(resolveOutPath('test-results/', 2026), 'test-results/2026_wikidata_new_releases.md');
  assert.equal(resolveOutPath('reports/разведка', 2026), 'reports/разведка.md');
  assert.doesNotMatch(resolveOutPath('test-results/scout.md', 2026), /candidates/u);

  // Умолчание и голое имя — прежние: вызовы, записанные в документах, ломать нельзя.
  assert.equal(resolveOutPath('', 2026), `${DEFAULT_OUT_DIR}/2026_wikidata_new_releases.md`);
  assert.equal(resolveOutPath(undefined, 2031), `${DEFAULT_OUT_DIR}/2031_wikidata_new_releases.md`);
  assert.equal(resolveOutPath('мой_отчёт', 2026), `${DEFAULT_OUT_DIR}/мой_отчёт.md`);
});

test('--out принимает windows-путь с обратными косыми', () => {
  assert.equal(resolveOutPath('test-results\\scout.md', 2026), 'test-results/scout.md');
});

// ── 6. КЛАСС 1 ВЛАДЕЛЬЦА: НЕ ВЫШЕДШИЙ ОБЪЕКТ В РАЗВЕДКУ НЕ ИДЁТ ─────────────────────────────
//
// Его слово 2026-08-22, самое злое из девяти классов: «Если назначен, то какого хуя ты завёл его
// и даёшь мне на вычитку как то, чем якобы люди будут формировать свой профиль NDim ID? Как ты
// себе это представляешь, если люди ещё не видели этот фильм?»
// Класс 1 — фильтр ОТБОРА, а не правка текста, поэтому он и стоит здесь, в разведке.

test('дата первого выпуска берётся целиком, минимумом по всему набору', () => {
  assert.equal(firstReleaseDate('2026-12-14T00:00:00Z|2026-03-01T00:00:00Z'), '2026-03-01');
  assert.equal(firstReleaseDate(['2026-05-07T00:00:00Z']), '2026-05-07');
});

test('пустой набор — null, а не «сегодня»: отсутствующая дата это отсутствующий факт', () => {
  assert.equal(firstReleaseDate(''), null);
  assert.equal(firstReleaseDate(null), null);
});

test('🔴 новинка года, которая ЕЩЁ НЕ ВЫШЛА, отсеивается и НАЗЫВАЕТСЯ', () => {
  // Resident Evil Requiem — ровно тот случай, за который он вернул карточку: год 2026 верный,
  // а дата в будущем. Года для класса 1 мало, нужна дата.
  const { найденные, невышедшие, переиздания } = rowsToItems(
    [строка({ qid: 'Q124983920', sitelinks: 20, ru: 'Resident Evil Requiem', en: 'Resident Evil Requiem', dates: '2026-12-14T00:00:00Z' })],
    ВИД_ФИЛЬМ, 2026, { releasedBy: '2026-08-22' },
  );
  assert.equal(найденные.length, 0, 'невышедшему в партии не место');
  assert.equal(переиздания.length, 0, 'это не переиздание — причина отсева другая, и путать их нельзя');
  assert.equal(невышедшие.length, 1, 'отсев обязан быть НАЗВАН, а не молчалив');
  assert.equal(невышедшие[0].перваяДата, '2026-12-14');
});

test('🔴 контроль: ВЫШЕДШАЯ новинка того же года проходит', () => {
  const { найденные, невышедшие } = rowsToItems(
    [строка({ qid: 'Q125131076', sitelinks: 20, ru: 'Закулисье реальности', en: 'Backrooms', dates: '2026-05-07T00:00:00Z|2026-05-29T00:00:00Z' })],
    ВИД_ФИЛЬМ, 2026, { releasedBy: '2026-08-22' },
  );
  assert.equal(найденные.length, 1);
  assert.equal(невышедшие.length, 0);
  assert.equal(найденные[0].перваяДата, '2026-05-07');
});

test('🔴 граница: объект БЕЗ ЕДИНОЙ ДАТЫ фильтром выхода не отсеивается — решает человек', () => {
  // Отсутствие даты не доказывает выхода, но и не доказывает обратного. Умолчание прибора здесь
  // было бы решением за человека, а канон мастерской велит называть нехватку, а не гадать.
  const { найденные, невышедшие } = rowsToItems(
    [строка({ qid: 'Q1', sitelinks: 20, ru: 'Без даты', en: 'No date', dates: '' })],
    ВИД_ФИЛЬМ, 2026, { releasedBy: '2026-08-22' },
  );
  assert.equal(найденные.length + невышедшие.length, 0, 'без даты год не совпадёт и запись уйдёт в переиздания');
});

test('без releasedBy прибор ведёт себя как прежде — фильтр не включается сам', () => {
  const { найденные, невышедшие } = rowsToItems(
    [строка({ qid: 'Q124983920', sitelinks: 20, ru: 'Ещё не вышло', en: 'Not out yet', dates: '2026-12-14T00:00:00Z' })],
    ВИД_ФИЛЬМ, 2026,
  );
  assert.equal(найденные.length, 1);
  assert.equal(невышедшие.length, 0);
});

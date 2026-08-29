/**
 * ЮНИТЫ ЯДРА СНИМКА ЯНДЕКС.ВЕБМАСТЕРА (`tools/lib/yandex-snapshot-core.mjs`).
 *
 * Сети и токена не требуют — ради этого ядро и отделено. Прогон:
 *   node --test tools/yandex-snapshot.test.mjs   ·   npm run test:tools
 *
 * 🔴 ФИКСТУРЫ ПОСТРОЕНЫ НА ДВУХ РАЗНЫХ ИСТОЧНИКАХ, И ЭТО ГЛАВНОЕ В ЭТОМ ФАЙЛЕ.
 * Форма ответа взята из документации Яндекса (`researches/56_console_apis_bing_yandex.md`), а
 * ЗНАЧЕНИЯ кодов — из ЖИВОЙ консоли, снятой Менеджером 2026-08-28 на нашем инциденте
 * (`bugs/203`): `LOW_DEMAND` и `META_NO_INDEX`. Обоих этих кодов в документированном перечне
 * `ApiExcludedUrlStatus` НЕТ.
 *
 * Если бы фикстуры набирались только по документации, они содержали бы `LOW_QUALITY` и
 * `NO_INDEX` — и прибор, отбирающий строки по известному списку, прошёл бы юниты и нашёл НОЛЬ
 * страниц на живом ответе. Тест был бы зелёным, прибор — слепым. Это вопрос 3 лестницы трёх
 * вопросов: «мог ли МАТЕРИАЛ дать проверке упасть?».
 *
 * Что стережётся, по слоям:
 *   1. незнакомый код НЕ теряется и НЕ приписывается к соседнему;
 *   2. строка без причины получает честное имя, а не молча исчезает;
 *   3. событие без известного типа собирается, а не выбрасывается;
 *   4. хост ищется вхождением домена, а не равенством строки;
 *   5. приговор квоте различает общий пул, раздельный и «неизвестно» — и не выбирает удобное;
 *   6. развёртка показателей не теряет дни и не путает показатели между собой.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	findHost,
	splitEvents,
	groupByReason,
	groupBySection,
	sectionOf,
	quotaVerdict,
	indicatorsToRows,
	EVENT_REMOVED,
	EVENT_APPEARED,
	shouldWriteSnapshot,
	snapshotExitCode,
	snapshotComplete,
	incompleteReason,
} from './lib/yandex-snapshot-core.mjs';

/** Строка выборки в форме первоисточника. Коды — из ЖИВОЙ консоли, см. шапку. */
const выпала = (url, статус) => ({
	url,
	title: 'что-то',
	event: EVENT_REMOVED,
	event_date: '2026-08-20T00:00:00.000+03:00',
	excluded_url_status: статус,
});

// ── 1. КОДЫ ПРИЧИН СКЛАДЫВАЮТСЯ КАК ЕСТЬ ─────────────────────────────────────────────────

test('НЕЗНАКОМЫЙ код причины считается, а не теряется', () => {
	// LOW_DEMAND — ровно то, что Яндекс написал про наши 1352 страницы, и ровно то, чего нет
	// в документированном перечне. Прибор со списком известных кодов дал бы здесь ноль.
	const выпавшие = [
		выпала('https://ndimspace.app/ru/dimension/a-1', 'LOW_DEMAND'),
		выпала('https://ndimspace.app/ru/dimension/b-2', 'LOW_DEMAND'),
		выпала('https://ndimspace.app/', 'META_NO_INDEX'),
	];
	const причины = groupByReason(выпавшие);

	assert.equal(причины.length, 2, 'две разные причины');
	assert.equal(причины[0].reason, 'LOW_DEMAND', 'самая массовая — первой');
	assert.equal(причины[0].count, 2);
	assert.equal(причины[1].reason, 'META_NO_INDEX');
	assert.equal(причины[1].count, 1);

	// Сумма по причинам обязана сойтись со входом — ни одна строка не потерялась по дороге.
	assert.equal(
		причины.reduce((s, p) => s + p.count, 0),
		выпавшие.length,
	);
});

test('документированный и живой коды уживаются РЯДОМ, без перевода одного в другой', () => {
	// Пока неизвестно, какой словарь придёт по API. Прибор обязан пережить оба сразу и не
	// «нормализовать» LOW_DEMAND в LOW_QUALITY: это была бы выдумка, вписанная в данные.
	const причины = groupByReason([
		выпала('https://ndimspace.app/a', 'LOW_DEMAND'),
		выпала('https://ndimspace.app/b', 'LOW_QUALITY'),
	]);
	assert.equal(причины.length, 2, 'два разных кода остаются двумя разными');
	assert.deepEqual(причины.map((p) => p.reason).sort(), ['LOW_DEMAND', 'LOW_QUALITY']);
});

test('строка БЕЗ причины получает честное имя, а не исчезает', () => {
	const причины = groupByReason([
		{ url: 'https://ndimspace.app/x', event: EVENT_REMOVED },
		выпала('https://ndimspace.app/y', ''),
	]);
	assert.equal(причины.length, 1);
	assert.equal(причины[0].reason, '(причина не указана)');
	assert.equal(причины[0].count, 2, 'пустая строка и отсутствие поля — один случай');
});

test('образцы адресов копятся, но не разрастаются без предела', () => {
	const много = Array.from({ length: 50 }, (_, i) =>
		выпала(`https://ndimspace.app/ru/dimension/x-${i}`, 'LOW_DEMAND'),
	);
	const [причина] = groupByReason(много);
	assert.equal(причина.count, 50, 'счёт полный');
	assert.equal(причина.samples.length, 20, 'а образцов ровно двадцать');
});

// ── 2. СОБЫТИЯ ───────────────────────────────────────────────────────────────────────────

test('событие без известного типа собирается в other, а не выбрасывается', () => {
	const { removed, appeared, other } = splitEvents([
		выпала('https://ndimspace.app/a', 'LOW_DEMAND'),
		{ url: 'https://ndimspace.app/b', event: EVENT_APPEARED },
		{ url: 'https://ndimspace.app/c', event: 'ЧТО_ТО_НОВОЕ' },
		{ url: 'https://ndimspace.app/d' },
	]);
	assert.equal(removed.length, 1);
	assert.equal(appeared.length, 1);
	assert.equal(other.length, 2, 'непонятное сохраняется — молчаливое отбрасывание запрещено');
});

// ── 3. РАЗДЕЛЫ САЙТА ─────────────────────────────────────────────────────────────────────

test('раздел определяется по адресу, корень отличается от языкового лендинга', () => {
	assert.equal(sectionOf('https://ndimspace.app/ru/dimension/finist-2h'), 'карточки каталога');
	assert.equal(sectionOf('https://ndimspace.app/en/catalog/movie/3'), 'хабы каталога');
	assert.equal(sectionOf('https://ndimspace.app/ru/test/love'), 'семейство ТЕСТ');
	assert.equal(sectionOf('https://ndimspace.app/ru/menu/support'), 'документы «Меню»');
	assert.equal(sectionOf('https://ndimspace.app/ru'), 'языковой лендинг');
	assert.equal(sectionOf('https://ndimspace.app/'), 'корень');
	assert.equal(sectionOf('https://ndimspace.app/nechto'), 'прочее');
});

test('разрез по разделам показывает масштаб беды там, где она есть', () => {
	// Форма нашего инцидента: выкинуло каталог, а корень — отдельным случаем.
	const разделы = groupBySection([
		выпала('https://ndimspace.app/ru/dimension/a', 'LOW_DEMAND'),
		выпала('https://ndimspace.app/ru/dimension/b', 'LOW_DEMAND'),
		выпала('https://ndimspace.app/en/dimension/c', 'LOW_DEMAND'),
		выпала('https://ndimspace.app/', 'META_NO_INDEX'),
	]);
	assert.deepEqual(разделы, [
		{ section: 'карточки каталога', count: 3 },
		{ section: 'корень', count: 1 },
	]);
});

// ── 4. ХОСТ ──────────────────────────────────────────────────────────────────────────────

test('хост ищется ВХОЖДЕНИЕМ домена — равенство сломалось бы о схему и порт', () => {
	// Яндекс адресует хост строкой вида `https:ndimspace.app:443`, а не голым доменом.
	const список = [
		{ host_id: 'https:example.com:443', unicode_host_url: 'https://example.com' },
		{ host_id: 'https:ndimspace.app:443', unicode_host_url: 'https://ndimspace.app' },
	];
	const наш = findHost(список, 'ndimspace.app');
	assert.ok(наш, 'наш хост обязан найтись');
	assert.equal(наш.host_id, 'https:ndimspace.app:443');
});

test('когда хоста нет — честный null, а не первый попавшийся', () => {
	const чужие = [{ host_id: 'https:example.com:443', unicode_host_url: 'https://example.com' }];
	assert.equal(findHost(чужие, 'ndimspace.app'), null);
	assert.equal(findHost([], 'ndimspace.app'), null);
});

// ── 5. КВОТА ПЕРЕОБХОДА: ОДИН ПУЛ ИЛИ ДВА ────────────────────────────────────────────────

test('общий пул опознаётся: израсходовано ровно столько, сколько отправили руками', () => {
	// Менеджер отправил 150 через интерфейс. Если API покажет расход 150 — квота одна.
	const в = quotaVerdict({ dailyQuota: 150, quotaRemainder: 0, sentByHand: 150 });
	assert.equal(в.pool, 'общий');
	assert.equal(в.spent, 150);
});

test('раздельный пул опознаётся: расход ноль при отправленных руками', () => {
	const в = quotaVerdict({ dailyQuota: 150, quotaRemainder: 150, sentByHand: 150 });
	assert.equal(в.pool, 'раздельный');
	assert.equal(в.spent, 0);
});

test('несходящееся называется НЕИЗВЕСТНЫМ, а не подгоняется под удобный ответ', () => {
	const в = quotaVerdict({ dailyQuota: 150, quotaRemainder: 80, sentByHand: 150 });
	assert.equal(в.pool, 'неизвестно', 'расход 70 при 150 отправленных не объясняется ни тем, ни другим');
	assert.equal(в.spent, 70);
});

test('без отправленного руками сопоставлять не с чем — и прибор так и говорит', () => {
	assert.equal(quotaVerdict({ dailyQuota: 150, quotaRemainder: 150 }).pool, 'неизвестно');
	assert.equal(quotaVerdict({ dailyQuota: null, quotaRemainder: null, sentByHand: 150 }).pool, 'неизвестно');
});

test('допуск в единицу: между отправкой и опросом мог проскочить один адрес', () => {
	assert.equal(quotaVerdict({ dailyQuota: 150, quotaRemainder: 1, sentByHand: 150 }).pool, 'общий');
	assert.equal(quotaVerdict({ dailyQuota: 150, quotaRemainder: 5, sentByHand: 150 }).pool, 'неизвестно');
});

// ── 6. РАЗВЁРТКА ПОКАЗАТЕЛЕЙ ─────────────────────────────────────────────────────────────

test('показатели разворачиваются в ряд по датам, не теряя дней и не путая столбцов', () => {
	const ряд = indicatorsToRows({
		indicators: {
			TOTAL_SHOWS: [
				{ date: '2026-08-19T00:00:00.000+03:00', value: 100 },
				{ date: '2026-08-20T00:00:00.000+03:00', value: 120 },
			],
			TOTAL_CLICKS: [{ date: '2026-08-20T00:00:00.000+03:00', value: 3 }],
		},
	});
	assert.deepEqual(ряд, [
		{ date: '2026-08-19', TOTAL_SHOWS: 100 },
		{ date: '2026-08-20', TOTAL_SHOWS: 120, TOTAL_CLICKS: 3 },
	]);
});

test('имена показателей НЕ зашиты: новый показатель Яндекса доедет сам', () => {
	const ряд = indicatorsToRows({
		indicators: { НЕЧТО_НОВОЕ: [{ date: '2026-08-20T00:00:00.000+03:00', value: 7 }] },
	});
	assert.equal(ряд[0].НЕЧТО_НОВОЕ, 7, 'что пришло, то и стало столбцом');
});

test('пустой и кривой ответ не роняют развёртку', () => {
	assert.deepEqual(indicatorsToRows({}), []);
	assert.deepEqual(indicatorsToRows({ indicators: { TOTAL_SHOWS: [{ value: 1 }] } }), []);
});

// ── bugs/215: ХУДШИЙ СНИМОК НЕ ЗАТИРАЕТ ЛУЧШИЙ ─────────────────────────────────────────────
//
// Дефект нашёл суд QA: половины снимка переживали отказ API несимметрично — события бросали,
// статистика тихо давала пустой массив, и файл дня перезаписывался пустотой с кодом 0.
// Инвариант лечения: частичный снимок НИКОГДА не затирает существующий, полный — затирает всегда.

test('🔴 неполный снимок НЕ затирает уже лежащий файл дня', () => {
	const v = shouldWriteSnapshot({ complete: false, fileExists: true });
	assert.equal(v.write, false, 'иначе худший снимок молча затрёт лучший — ровно дефект bugs/215');
	assert.match(v.why, /худший не затирает лучший/);
});

test('неполный снимок ПИШЕТСЯ, когда файла дня ещё нет — день без файла хуже', () => {
	const v = shouldWriteSnapshot({ complete: false, fileExists: false });
	assert.equal(v.write, true, 'ряд копится, и пропущенный день невосстановим');
});

test('полный снимок перезаписывает день — идемпотентность НЕ сломана', () => {
	// ⛔ Отменять перезапись дня было бы лечением не того: консоль пересматривает свежие дни
	// задним числом, и поздний ПОЛНЫЙ прогон несёт строго лучшие данные.
	const v = shouldWriteSnapshot({ complete: true, fileExists: true });
	assert.equal(v.write, true);
	assert.match(v.why, /перезапись дня полным снимком/);
});

test('полный снимок пишется и первым за день', () => {
	assert.equal(shouldWriteSnapshot({ complete: true, fileExists: false }).write, true);
});

test('🔴 неполный снимок СЛЫШЕН вызывающему кодом возврата', () => {
	assert.equal(snapshotExitCode({ complete: false }), 1, 'тихий ноль — это и был дефект');
	assert.equal(snapshotExitCode({ complete: true }), 0);
});

test('таблица решений покрыта целиком: четыре сочетания полноты и наличия файла', () => {
	const cases = [
		[true, true, true],
		[true, false, true],
		[false, false, true],
		[false, true, false],
	];
	for (const [complete, fileExists, expected] of cases) {
		assert.equal(
			shouldWriteSnapshot({ complete, fileExists }).write,
			expected,
			`полный=${complete} файл=${fileExists}`,
		);
	}
});

// ── 🔴 ПОЛНОТА СЧИТАЕТСЯ ПО ОБЕИМ МОЛЧАЩИМ ЧАСТЯМ (дефект 2 вердикта №10 QA) ─────────────────
//
// Инвариант `shouldWriteSnapshot` был верен и раньше — врал ВХОД: прибор подавал ему
// `complete = history.ok`, полноту одной половины под именем, обещающим всеобщность.
// Наблюдение судьи подменённым fetch: квота 503 + статистика ОК + файл дня есть → файл
// ПЕРЕЗАПИСАН, код 0, хеш сменился, живая квота заменена на `{error: 503}`.
// Решение Менеджера 2026-08-29: «не затирает, пока не полны ОБЕ половины».

test('🔴 отказ КВОТЫ при живой статистике делает снимок НЕПОЛНЫМ', () => {
	// Ровно случай судьи. Прежний вход (`history.ok`) дал бы здесь true — и затёр день.
	assert.equal(snapshotComplete({ historyOk: true, quotaOk: false }), false);
});

test('🔴 отказ СТАТИСТИКИ при живой квоте — тоже неполный (симметрия половин)', () => {
	assert.equal(snapshotComplete({ historyOk: false, quotaOk: true }), false);
});

test('полон только тогда, когда приехали ОБЕ половины', () => {
	assert.equal(snapshotComplete({ historyOk: true, quotaOk: true }), true);
	assert.equal(snapshotComplete({ historyOk: false, quotaOk: false }), false);
});

test('🔴 СКВОЗНОЙ случай судьи: квота 503 + файл дня есть → день НЕ затирается, код 1', () => {
	// Связка целиком, от входа до последствия: именно её судья снимет подменённым fetch.
	const complete = snapshotComplete({ historyOk: true, quotaOk: false });
	assert.equal(shouldWriteSnapshot({ complete, fileExists: true }).write, false);
	assert.equal(snapshotExitCode({ complete }), 1);
});

test('🔴 совет судьи соблюдён: день БЕЗ файла пишется даже при отказе квоты', () => {
	// «Делать отказ квоты поводом не писать день я НЕ советую — это выбросит события ради
	// второстепенного счётчика». Запрещена ПЕРЕЗАПИСЬ, а не запись: события не теряются.
	const complete = snapshotComplete({ historyOk: true, quotaOk: false });
	assert.equal(shouldWriteSnapshot({ complete, fileExists: false }).write, true);
});

// ── 🔴 ТЕКСТ ОТКАЗА — ТОЖЕ НАБЛЮДАЕМОЕ ПОВЕДЕНИЕ (замечание 1 вердикта №12 QA) ───────────────
//
// Класс назвала судья, и он сильнее своего случая: **правильность текста отказа НЕ следует из
// правильности кода возврата.** Мутация ловит код и молчит про смысл, поэтому текст собирается
// функцией и стережётся юнитом, а не пишется строкой на месте вызова.
// Наблюдение, оплатившее класс: при отказе КВОТЫ прибор говорил «поле queryHistory.error несёт
// код отказа», а этого поля не было вовсе — статистика пришла целой, код лежал в recrawlQuota.error.

test('🔴 отказ КВОТЫ показывает на recrawlQuota, а НЕ на queryHistory', () => {
	const текст = incompleteReason({ historyOk: true, quotaOk: false });
	assert.match(текст, /recrawlQuota\.error/);
	assert.doesNotMatch(текст, /queryHistory\.error/, 'палец показывал на исправную половину');
});

test('отказ СТАТИСТИКИ показывает на queryHistory, а не на квоту', () => {
	const текст = incompleteReason({ historyOk: false, quotaOk: true });
	assert.match(текст, /queryHistory\.error/);
	assert.doesNotMatch(текст, /recrawlQuota\.error/);
});

test('отказали ОБЕ — названы обе, ни одна не проглочена', () => {
	const текст = incompleteReason({ historyOk: false, quotaOk: false });
	assert.match(текст, /queryHistory\.error/);
	assert.match(текст, /recrawlQuota\.error/);
});

test('полный снимок причины НЕ выдумывает', () => {
	assert.equal(incompleteReason({ historyOk: true, quotaOk: true }), null);
});

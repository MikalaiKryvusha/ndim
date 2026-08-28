/**
 * ЮНИТЫ ЯДРА СНИМКА BING (`tools/lib/bing-snapshot-core.mjs`). Сети и ключа не требуют.
 *
 * Прогон: node --test tools/bing-snapshot.test.mjs   ·   npm run test:tools
 *
 * 🔴 ГЛАВНОЕ ЗДЕСЬ — ДАТА WCF, и это не педантизм, а класс «неверный разбор не падает».
 * `new Date("/Date(1316156400000-0700)/")` возвращает `Invalid Date` МОЛЧА. Прибор с наивным
 * разбором отдал бы ряд, где все даты пустые, — и это читалось бы как «в Bing показов нет», то
 * есть как факт о продукте вместо факта о нашем парсере.
 *
 * Фикстура взята из документированного примера ответа Microsoft, а не набрана по памяти:
 * `{"d":[{"__type":"RankAndTrafficStats:#Microsoft.Bing.Webmaster.Api","Clicks":15,
 * "Date":"/Date(1316156400000-0700)/","Impressions":100}]}`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	parseWcfDate,
	rankAndTrafficRows,
	bingTotals,
	explainBingError,
} from './lib/bing-snapshot-core.mjs';

// ── ДАТА WCF ─────────────────────────────────────────────────────────────────────────────

test('дата WCF разбирается, а наивный путь молча даёт мусор', () => {
	assert.equal(parseWcfDate('/Date(1316156400000-0700)/'), '2011-09-16');
	// Контроль: то, что сделала бы наивная попытка.
	assert.ok(Number.isNaN(new Date('/Date(1316156400000-0700)/').getTime()), 'Invalid Date молча');
	assert.ok(Number.isNaN(Number('/Date(1316156400000-0700)/')), 'NaN молча');
});

test('смещение в хвосте НЕ применяется к метке — иначе часть дней съедет на сутки', () => {
	// Одна и та же метка с разными «часовыми поясами» сериализатора обязана дать ОДНУ дату:
	// число перед смещением — уже UTC-метка, а смещение это украшение WCF.
	assert.equal(parseWcfDate('/Date(1316156400000-0700)/'), parseWcfDate('/Date(1316156400000+0300)/'));
	assert.equal(parseWcfDate('/Date(1316156400000)/'), '2011-09-16', 'смещения может не быть вовсе');
});

test('чужая форма даты честно даёт null, а не выдуманную дату', () => {
	for (const плохое of ['2026-08-28', '/Date(abc)/', '', null, undefined, 42, '/Date()/']) {
		assert.equal(parseWcfDate(плохое), null, `на входе ${JSON.stringify(плохое)}`);
	}
});

test('отрицательная метка (до 1970) разбирается, а не отбрасывается', () => {
	assert.equal(parseWcfDate('/Date(-86400000)/'), '1969-12-31');
});

// ── РЯД ──────────────────────────────────────────────────────────────────────────────────

test('ряд достаётся ИЗ ОБЁРТКИ d — забыть про неё значит получить пустоту на исправном ответе', () => {
	const ответ = {
		d: [
			{
				__type: 'RankAndTrafficStats:#Microsoft.Bing.Webmaster.Api',
				Clicks: 15,
				Date: '/Date(1316156400000-0700)/',
				Impressions: 100,
			},
		],
	};
	const { rows, dropped } = rankAndTrafficRows(ответ);
	assert.equal(rows.length, 1);
	assert.deepEqual(rows[0], { date: '2011-09-16', impressions: 100, clicks: 15 });
	assert.equal(dropped.length, 0);

	// Тот же массив БЕЗ обёртки — прибор обязан вернуть пусто, а не угадывать.
	assert.equal(rankAndTrafficRows(ответ.d).rows.length, 0);
});

test('строка с неразобранной датой уходит в dropped, а не пропадает молча', () => {
	const { rows, dropped } = rankAndTrafficRows({
		d: [
			{ Date: '/Date(1316156400000)/', Impressions: 10, Clicks: 1 },
			{ Date: '2026-08-28', Impressions: 999, Clicks: 99 },
		],
	});
	assert.equal(rows.length, 1);
	assert.equal(dropped.length, 1, 'непонятое предъявляется вызывающему');
	assert.equal(dropped[0].Impressions, 999);
});

test('ряд упорядочен по датам независимо от порядка ответа', () => {
	const { rows } = rankAndTrafficRows({
		d: [
			{ Date: '/Date(1316242800000)/', Impressions: 2, Clicks: 0 },
			{ Date: '/Date(1316156400000)/', Impressions: 1, Clicks: 0 },
		],
	});
	assert.deepEqual(rows.map((r) => r.impressions), [1, 2]);
});

test('пустой и кривой ответ не роняют разбор', () => {
	assert.deepEqual(rankAndTrafficRows({}), { rows: [], dropped: [] });
	assert.deepEqual(rankAndTrafficRows(null), { rows: [], dropped: [] });
});

// ── СВОД ─────────────────────────────────────────────────────────────────────────────────

test('свод считает CTR из сумм и НЕ выдумывает позицию, которой Bing не отдаёт', () => {
	const свод = bingTotals([
		{ date: '2026-08-01', impressions: 100, clicks: 1 },
		{ date: '2026-08-02', impressions: 900, clicks: 9 },
	]);
	assert.equal(свод.impressions, 1000);
	assert.equal(свод.clicks, 10);
	assert.equal(свод.ctr, 0.01);
	assert.equal('position' in свод, false, 'величины нет — и выдумывать её нельзя');
});

test('свод пустого ряда не делит на ноль', () => {
	assert.deepEqual(bingTotals([]), { impressions: 0, clicks: 0, ctr: 0 });
});

// ── ОШИБКА ───────────────────────────────────────────────────────────────────────────────

test('ошибка Bing читается машиной, а не по тексту', () => {
	assert.match(explainBingError({ ErrorCode: 3, Message: 'InvalidApiKey' }), /InvalidApiKey/);
	assert.match(explainBingError({ ErrorCode: 3, Message: 'InvalidApiKey' }), /3/);
	assert.match(explainBingError({}), /не разобран/);
});

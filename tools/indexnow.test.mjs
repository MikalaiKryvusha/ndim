/**
 * ЮНИТЫ ЛОГИКИ INDEXNOW (`tools/lib/indexnow.mjs`). Сети не касаются.
 *
 * Прогон: node --test tools/indexnow.test.mjs   ·   npm run test:tools
 *
 * 🔴 ГЛАВНОЕ, ЧТО ЗДЕСЬ СТЕРЕЖЁТСЯ, — НЕ АРИФМЕТИКА, А ДВЕ ЛОВУШКИ ПРОТОКОЛА:
 *   · **202 выглядит успехом и успехом НЕ является** — это «ключ ещё проверяется», то есть файл
 *     ключа поисковик не прочитал. Прибор, считающий 2xx успехом, отчитается о поданных
 *     10 000 адресов, которых никто не принял;
 *   · **один чужой адрес роняет ВСЮ пачку** (403), поэтому отбор строгий, а отвергнутые
 *     возвращаются вызывающему поимённо — молча отбросить их значило бы отчитаться о подаче
 *     того, что не подавалось.
 *
 * Числа взяты не с потолка: потолок пачки 10 000 и границы ключа 8…128 — из первоисточника
 * (`researches/NEW_console_apis_bing_yandex.md` §3.6), а 10 460 — настоящий размер нашей карты
 * сайта на 2026-08-28 (`bugs/203`), то есть случай «сайт не влезает в одну пачку» у нас уже
 * наступил, а не «на вырост».
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	MAX_URLS_PER_REQUEST,
	KEY_MIN,
	KEY_MAX,
	generateKey,
	validateKey,
	keyFileName,
	chunkUrls,
	partitionUrls,
	buildPayload,
	explainStatus,
} from './lib/indexnow.mjs';

const HOST = 'ndimspace.app';

// ── КЛЮЧ ─────────────────────────────────────────────────────────────────────────────────

test('сгенерированный ключ проходит собственную проверку', () => {
	for (let i = 0; i < 20; i += 1) {
		const key = generateKey();
		assert.deepEqual(validateKey(key), [], `ключ ${key} обязан быть годным`);
		assert.ok(key.length >= KEY_MIN && key.length <= KEY_MAX);
	}
});

test('ключи не повторяются', () => {
	const набор = new Set(Array.from({ length: 50 }, () => generateKey()));
	assert.equal(набор.size, 50);
});

test('проверка ключа называет ПРИЧИНУ, а не отвечает да/нет', () => {
	assert.deepEqual(validateKey(''), ['ключ пуст']);
	assert.deepEqual(validateKey('abc'), [`короче ${KEY_MIN} знаков (3)`]);
	assert.equal(validateKey('a'.repeat(KEY_MAX + 1)).length, 1);
	assert.match(validateKey('ключ_с_подчёркиванием').join(' '), /вне алфавита/);
});

test('дефис в алфавите, подчёркивание и точка — нет', () => {
	assert.deepEqual(validateKey('abcd-1234'), []);
	assert.equal(validateKey('abcd_1234').length, 1);
	assert.equal(validateKey('abcd.1234').length, 1);
});

test('имя файла ключа — сам ключ плюс .txt', () => {
	assert.equal(keyFileName('abc12345'), 'abc12345.txt');
});

// ── ПАЧКИ ────────────────────────────────────────────────────────────────────────────────

test('наш каталог НЕ влезает в одну пачку — это уже так, а не «на вырост»', () => {
	const карта = Array.from({ length: 10_460 }, (_, i) => `https://${HOST}/p${i}`);
	const пачки = chunkUrls(карта);
	assert.equal(пачки.length, 2);
	assert.equal(пачки[0].length, MAX_URLS_PER_REQUEST);
	assert.equal(пачки[1].length, 460);
	assert.equal(пачки.flat().length, карта.length, 'ни один адрес не потерян при разбиении');
});

test('ровно потолок — одна пачка, потолок плюс один — две', () => {
	assert.equal(chunkUrls(new Array(MAX_URLS_PER_REQUEST).fill('u')).length, 1);
	assert.equal(chunkUrls(new Array(MAX_URLS_PER_REQUEST + 1).fill('u')).length, 2);
});

test('пустой список даёт ноль пачек, а не одну пустую', () => {
	assert.deepEqual(chunkUrls([]), []);
});

test('негодный размер пачки — отказ, а не тихое поведение по умолчанию', () => {
	assert.throws(() => chunkUrls(['u'], 0), /размер пачки/);
	assert.throws(() => chunkUrls(['u'], -5), /размер пачки/);
});

// ── ОТБОР АДРЕСОВ ────────────────────────────────────────────────────────────────────────

test('отвергнутые адреса ВОЗВРАЩАЮТСЯ поимённо, с причиной у каждого', () => {
	const { ok, rejected } = partitionUrls(
		[
			`https://${HOST}/ru/dimension/a`,
			`http://${HOST}/insecure`,
			'https://example.com/chuzhoy',
			'ne-adres',
			'',
			'   ',
		],
		HOST,
	);
	assert.equal(ok.length, 1);
	assert.equal(rejected.length, 3, 'пустые строки не считаются отказом — их просто нет');
	assert.match(rejected.find((r) => r.url.startsWith('http://')).why, /схема/);
	assert.match(rejected.find((r) => r.url.includes('example.com')).why, /чужой хост/);
	assert.match(rejected.find((r) => r.url === 'ne-adres').why, /не разбирается/);
});

test('чужой хост отвергается — один такой адрес уронил бы ВСЮ пачку', () => {
	const { ok, rejected } = partitionUrls(['https://ndimspace.app.evil.com/x'], HOST);
	assert.equal(ok.length, 0, 'подстрока домена в чужом хосте — не наш хост');
	assert.equal(rejected.length, 1);
});

test('поддомен нашего домена — тоже чужой хост для этого ключа', () => {
	const { ok } = partitionUrls([`https://www.${HOST}/x`], HOST);
	assert.equal(ok.length, 0, 'ключ подтверждает ndimspace.app, а не www.ndimspace.app');
});

// ── ТЕЛО ЗАПРОСА ─────────────────────────────────────────────────────────────────────────

test('тело запроса несёт ровно поля протокола', () => {
	const тело = buildPayload({ host: HOST, key: 'abc12345', urlList: ['https://a', 'https://b'] });
	assert.deepEqual(Object.keys(тело).sort(), ['host', 'key', 'urlList']);
	assert.equal(тело.host, HOST);
});

test('keyLocation появляется, только когда он задан', () => {
	assert.equal(buildPayload({ host: HOST, key: 'k', urlList: [] }).keyLocation, undefined);
	assert.equal(
		buildPayload({ host: HOST, key: 'k', urlList: [], keyLocation: 'https://x/k.txt' }).keyLocation,
		'https://x/k.txt',
	);
});

// ── КОДЫ ОТВЕТА ──────────────────────────────────────────────────────────────────────────

test('🔴 202 — НЕ успех подачи: ключ ещё не проверен', () => {
	const в = explainStatus(202);
	assert.equal(в.ok, true, 'запрос принят');
	assert.equal(в.pending, true, 'но адреса ещё не в работе — ключ не прочитан');
	assert.match(в.meaning, /ключ/);

	const успех = explainStatus(200);
	assert.equal(успех.pending, false, 'а вот 200 — это действительно принято');
});

test('отказы различаются по смыслу, а не сваливаются в один «не вышло»', () => {
	assert.match(explainStatus(403).meaning, /ключ не подошёл/);
	assert.match(explainStatus(429).meaning, /темп/);
	assert.match(explainStatus(422).meaning, /кривой адрес|формат/);
	assert.equal(explainStatus(400).ok, false);
});

test('неожиданный код называется числом, а не выдаётся за известный', () => {
	const в = explainStatus(500);
	assert.equal(в.ok, false);
	assert.match(в.meaning, /500/);
});

/**
 * ПОДАЧА АДРЕСОВ ЧЕРЕЗ INDEXNOW — Яндекс и Bing одним протоколом.
 *
 * Фаза 2 эпика `plans/74`, постановка Менеджера смены 7. Разбор протокола с первоисточниками —
 * `researches/56_console_apis_bing_yandex.md` §3.6.
 *
 * Запуск:
 *   node tools/indexnow-submit.mjs --file <список.txt>            # СУХОЙ прогон (по умолчанию)
 *   node tools/indexnow-submit.mjs --file <список.txt> --apply --auth-owner "<слова владельца>"
 *   node tools/indexnow-submit.mjs --sitemap                      # взять адреса из карты сайта
 *   node tools/indexnow-submit.mjs --endpoint bing                # по умолчанию yandex
 *
 * 🔴🔴 ДВА ПРЕДОХРАНИТЕЛЯ, И ОНИ ЗДЕСЬ НЕ ЦЕРЕМОНИЯ.
 *
 * 1. **По умолчанию прибор НИЧЕГО НЕ ОТПРАВЛЯЕТ.** Без `--apply` он считает, отбирает, разбивает
 *    на пачки и печатает, что БЫЛО БЫ отправлено. Подача — необратимое действие в чужой системе:
 *    отозвать поданное нельзя, а темп подачи ограничен (429), то есть ошибка стоит не только
 *    этой пачки, но и следующих.
 * 2. **`--apply` требует `--auth-owner` с дословными словами владельца.** Это то же правило, по
 *    которому живёт `tools/send-outbound.mjs`: исходящее наружу от имени владельца идёт только
 *    с его слова. Агент себе разрешения не выписывает.
 *
 * ⚠️ И ПРЕДУСЛОВИЕ, БЕЗ КОТОРОГО ПОДАЧА БЕССМЫСЛЕННА: файл ключа обязан ОТДАВАТЬСЯ БОЕВЫМ САЙТОМ.
 * Он лежит в `static/` и попадает в бой только выкатом (`npm run deploy`, дверь Менеджера). Пока
 * выката не было, поисковик ответит 403 либо 202 «ключ проверяется», и подача уйдёт впустую.
 * Прибор проверяет доступность файла САМ и без него не отправляет даже под `--apply`.
 *
 * Код возврата: 0 — прогон состоялся · 1 — отказ предохранителя либо ошибка подачи.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
	MAX_URLS_PER_REQUEST,
	validateKey,
	keyFileName,
	chunkUrls,
	partitionUrls,
	buildPayload,
	explainStatus,
} from './lib/indexnow.mjs';
import { settleExit } from './lib/exit-code.mjs';

const HOST = 'ndimspace.app';
const STATIC_DIR = 'static';

/** Точки приёма протокола. Один ключ работает на обе — они участники одного IndexNow. */
const ENDPOINTS = {
	yandex: 'https://yandex.com/indexnow',
	bing: 'https://www.bing.com/indexnow',
};

function parseArgs(argv) {
	const args = { file: null, sitemap: false, apply: false, auth: null, endpoint: 'yandex' };
	for (let i = 0; i < argv.length; i += 1) {
		if (argv[i] === '--file') args.file = argv[++i];
		else if (argv[i] === '--sitemap') args.sitemap = true;
		else if (argv[i] === '--apply') args.apply = true;
		else if (argv[i] === '--auth-owner') args.auth = argv[++i];
		else if (argv[i] === '--endpoint') args.endpoint = argv[++i];
	}
	if (!ENDPOINTS[args.endpoint]) {
		throw new Error(`--endpoint ожидает ${Object.keys(ENDPOINTS).join(' | ')}, дано «${args.endpoint}»`);
	}
	if (!args.file && !args.sitemap) {
		throw new Error('нечего подавать: укажите --file <список.txt> либо --sitemap');
	}
	return args;
}

/**
 * Ключ сайта — читается из `static/`, а не хранится в коде.
 *
 * Источник истины один: файл, который отдаёт сайт. Продублировать ключ константой значило бы
 * завести пару «истина ↔ зеркало», которая молча разъедется при первой же смене ключа.
 */
function siteKey() {
	const files = existsSync(STATIC_DIR) ? readdirSync(STATIC_DIR) : [];
	const candidates = files.filter((name) => /^[a-zA-Z0-9-]{8,128}\.txt$/.test(name));
	const found = candidates.filter((name) => {
		const body = readFileSync(join(STATIC_DIR, name), 'utf8').trim();
		return body === name.replace(/\.txt$/, '');
	});
	if (found.length === 0) {
		throw new Error(
			'ключа IndexNow нет: в static/ не найден файл <ключ>.txt, содержащий сам ключ.\n' +
				'Завести: node tools/indexnow-key.mjs',
		);
	}
	if (found.length > 1) {
		throw new Error(
			`ключей IndexNow несколько (${found.join(', ')}) — неоднозначно, оставьте один.`,
		);
	}
	return found[0].replace(/\.txt$/, '');
}

/** Адреса из карты сайта — источник, который всегда совпадает с тем, что реально опубликовано. */
function urlsFromSitemap() {
	const path = join('build', 'sitemap.xml');
	if (!existsSync(path)) {
		throw new Error(`нет ${path} — соберите сайт (npm run build) либо подайте --file`);
	}
	const xml = readFileSync(path, 'utf8');
	return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

/**
 * Живёт ли файл ключа на боевом сайте. Без этого подача уходит впустую.
 *
 * ⚠️ ТЕЛО ОТВЕТА ВЫЧИТЫВАЕТСЯ ВСЕГДА, В ТОМ ЧИСЛЕ У ОШИБОЧНОГО КОДА, и это не аккуратность ради
 * аккуратности. Первая редакция возвращалась из ветки `!response.ok`, не тронув `response.body`:
 * недренированный поток держал сокет живым, и `process.exit()` следом ронял процесс с
 * `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` — прибор печатал ПРАВИЛЬНЫЙ отказ и
 * выходил кодом **127** вместо 1. То есть вызывающий, судящий по коду возврата, увидел бы
 * бессмыслицу вместо внятного «не разрешено». Поймано прогоном 2026-08-28.
 */
async function keyIsPublished(key) {
	const url = `https://${HOST}/${keyFileName(key)}`;
	try {
		const response = await fetch(url);
		const body = (await response.text()).trim(); // читаем ВСЕГДА — иначе сокет остаётся висеть
		if (!response.ok) return { published: false, why: `${url} отдал ${response.status}` };
		if (body !== key) return { published: false, why: `${url} отдал не тот ключ` };
		return { published: true, why: `${url} отдаёт ключ` };
	} catch (error) {
		return { published: false, why: `${url} недоступен: ${error.message}` };
	}
}

async function main(argv) {
	const args = parseArgs(argv);
	const key = siteKey();
	const problems = validateKey(key);
	if (problems.length > 0) throw new Error(`ключ негоден: ${problems.join('; ')}`);

	const raw = args.sitemap
		? urlsFromSitemap()
		: readFileSync(args.file, 'utf8').split(/\r?\n/);
	const { ok, rejected } = partitionUrls(raw, HOST);
	const chunks = chunkUrls(ok);

	console.log('ПОДАЧА ЧЕРЕЗ INDEXNOW\n');
	console.log(`точка приёма: ${args.endpoint} — ${ENDPOINTS[args.endpoint]}`);
	console.log(`ключ:         ${key}  (файл static/${keyFileName(key)})`);
	console.log(`адресов:      годных ${ok.length} · отвергнуто ${rejected.length}`);
	console.log(`пачек:        ${chunks.length} при потолке ${MAX_URLS_PER_REQUEST}\n`);

	if (rejected.length > 0) {
		console.log('ОТВЕРГНУТЫЕ АДРЕСА (подать их значило бы уронить всю пачку):');
		for (const item of rejected.slice(0, 10)) console.log(`  · ${item.url} — ${item.why}`);
		if (rejected.length > 10) console.log(`  … и ещё ${rejected.length - 10}`);
		console.log('');
	}

	if (!args.apply) {
		console.log('СУХОЙ ПРОГОН — не отправлено ничего.');
		console.log('Для настоящей подачи: --apply --auth-owner "<дословные слова владельца>"');
		return 0;
	}

	// ── Предохранитель 1: слово владельца ──────────────────────────────────────────────────
	if (!args.auth || args.auth.trim().length === 0) {
		console.error('🔴 ОТКАЗ: --apply без --auth-owner.');
		console.error('   Подача — исходящее действие наружу; агент себе разрешения не выписывает.');
		return 1;
	}

	// ── Предохранитель 2: ключ обязан отдаваться боем ──────────────────────────────────────
	const published = await keyIsPublished(key);
	console.log(`проверка ключа: ${published.why}`);
	if (!published.published) {
		console.error('\n🔴 ОТКАЗ: файл ключа не отдаётся боевым сайтом.');
		console.error('   Он лежит в static/ и попадает в бой только выкатом — дверь Менеджера.');
		console.error('   Подача без опубликованного ключа уходит впустую (403 либо вечное 202).');
		return 1;
	}

	console.log(`\nAUTH: ${args.auth}\n`);

	let failed = 0;
	for (const [index, chunk] of chunks.entries()) {
		const payload = buildPayload({ host: HOST, key, urlList: chunk });
		const response = await fetch(ENDPOINTS[args.endpoint], {
			method: 'POST',
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
			body: JSON.stringify(payload),
		});
		const verdict = explainStatus(response.status);
		console.log(
			`пачка ${index + 1}/${chunks.length} (${chunk.length} адресов) → ` +
				`${response.status} ${verdict.meaning}`,
		);
		if (!verdict.ok) failed += 1;
	}

	if (failed > 0) {
		console.error(`\n🔴 пачек с отказом: ${failed} из ${chunks.length}`);
		return 1;
	}
	console.log('\n✅ подача завершена');
	return 0;
}

// Хвост общий на все сетевые приборы. Довод и уплаченная за него цена (код 127 вместо 1 при
// живом сокете) живут в `tools/lib/exit-code.mjs` — здесь они не повторяются.
settleExit(main(process.argv.slice(2)));

/**
 * СНИМОК BING WEBMASTER TOOLS — третий машинный источник миссии консолей (`ideas/37`, `plans/74` Ф2).
 *
 * Даёт то, чего нет у Google: **сведения об индексе по адресу и по каталогу адресов**
 * (`GetUrlInfo`, `GetChildrenUrlInfo`). Дыра покрытия, записанная в `researches/40` §6 как
 * неустранимая, оказалась неустранимой только у Google.
 *
 * Запуск:
 *   node tools/bing-snapshot.mjs           # снимок сегодняшним днём
 *   node tools/bing-snapshot.mjs --dry     # сходить и напечатать, не записывая
 *
 * Код возврата: 0 — снято · 1 — ключа нет либо Bing не ответил.
 *
 * 🔴 СОСТОЯНИЕ НА 2026-08-28: **ЖИВОГО ПРОГОНА НЕ БЫЛО — ключа ещё нет** (шаг владельца, 2 минуты
 * в панели). Прибор написан вперёд ключа по постановке Менеджера. Разбор ответов покрыт юнитами
 * на фикстурах документированной формы (`tools/bing-snapshot.test.mjs`), сеть — нет, поэтому
 * снимок несёт пометку `[NOT-TESTED: живой ответ Bing]`.
 *
 * 🔴 И ВТОРОЕ, СРОЧНОЕ: прибор построен на JSON-протоколе в допущении, что он переживает отставку
 * SOAP и POX 31.08.2026. Допущение помечено в `tools/lib/bing-webmaster.mjs` и проверяется первым
 * же прогоном после рубежа — то есть через три дня от написания.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { bingKey, callMethod, SITE_URL, API, LEGACY_RETIREMENT } from './lib/bing-webmaster.mjs';
import { rankAndTrafficRows, bingTotals, explainBingError } from './lib/bing-snapshot-core.mjs';
import { isoDate, snapshotFileName } from './lib/console-snapshot-core.mjs';

const DEFAULT_OUT = join('reports', 'CONSOLES');

function parseArgs(argv) {
	const args = { out: DEFAULT_OUT, dry: false };
	for (let i = 0; i < argv.length; i += 1) {
		if (argv[i] === '--out') args.out = argv[++i];
		else if (argv[i] === '--dry') args.dry = true;
	}
	return args;
}

function localIso(date) {
	const offsetMin = -date.getTimezoneOffset();
	const sign = offsetMin >= 0 ? '+' : '-';
	const pad = (n) => String(Math.abs(n)).padStart(2, '0');
	return (
		`${isoDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
		`${sign}${pad(Math.trunc(offsetMin / 60))}:${pad(offsetMin % 60)}`
	);
}

async function main(argv) {
	const args = parseArgs(argv);
	const now = new Date();
	const todayIso = isoDate(now);
	const key = bingKey(); // бросит с адресом шага владельца, если ключа нет

	console.log('СНИМОК BING WEBMASTER TOOLS\n');
	console.log(`ресурс: ${SITE_URL}`);
	if (todayIso <= LEGACY_RETIREMENT) {
		console.log(
			`⚠️ рубеж отставки SOAP/POX — ${LEGACY_RETIREMENT}; допущение «JSON остаётся» ещё не проверено\n`,
		);
	}

	const traffic = await callMethod('GetRankAndTrafficStats', key, { siteUrl: SITE_URL });
	if (!traffic.ok) {
		console.error(`🔴 GetRankAndTrafficStats не отдан (${traffic.status}): ${explainBingError(traffic.body)}`);
		return 1;
	}
	const { rows, dropped } = rankAndTrafficRows(traffic.body);
	const totals = bingTotals(rows);

	console.log(`ПО ДНЯМ — строк ${rows.length}` + (dropped.length ? ` · не разобрано ${dropped.length}` : ''));
	console.log(
		`ИТОГО: показов ${totals.impressions} · кликов ${totals.clicks} · ` +
			`CTR ${(totals.ctr * 100).toFixed(2)} %\n`,
	);
	if (dropped.length > 0) {
		console.log('⚠️ строки с неразобранной датой (форма ответа изменилась?):');
		for (const item of dropped.slice(0, 3)) console.log(`   ${JSON.stringify(item)}`);
		console.log('');
	}

	const queries = await callMethod('GetQueryStats', key, { siteUrl: SITE_URL });
	const pages = await callMethod('GetPageStats', key, { siteUrl: SITE_URL });

	const snapshot = {
		formatVersion: 1,
		takenAt: localIso(now),
		takenBy: 'tools/bing-snapshot.mjs',
		source: { console: 'Bing Webmaster Tools', api: API, siteUrl: SITE_URL, protocol: 'JSON/HTTP' },
		trust: '[NOT-TESTED: живой ответ Bing] — снять может только первый настоящий прогон',
		assumption: {
			claim: 'JSON-протокол переживает отставку SOAP и POX',
			retirementDate: LEGACY_RETIREMENT,
			verified: false,
			how: 'первый прогон после рубежа: отдаст данные или нет',
		},
		totals,
		byDate: rows,
		unparsedRows: dropped,
		byQuery: queries.ok ? (queries.body.d ?? []) : { error: queries.status },
		byPage: pages.ok ? (pages.body.d ?? []) : { error: pages.status },
		boundaries: [
			'позиции этот метод не отдаёт — величины нет, и выдумывать её нельзя',
			'разрезы по устройствам и странам в списке методов не найдены (researches §6 п.5)',
		],
	};

	if (args.dry) {
		console.log('(--dry: файл не записан)');
		return 0;
	}
	mkdirSync(args.out, { recursive: true });
	const file = join(args.out, snapshotFileName(todayIso, 'bing_webmaster'));
	writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
	console.log(`✅ ЗАПИСАН: ${file}`);
	return 0;
}

// Код возврата выставляется, а не выстреливается: прибор ходит в сеть, и `process.exit()` при
// живом соединении роняет процесс с кодом 127 вместо честного 1 (поймано на indexnow-submit).
main(process.argv.slice(2)).then(
	(code) => {
		process.exitCode = code;
	},
	(error) => {
		console.error(`🔴 ${error.message}`);
		process.exitCode = 1;
	},
);

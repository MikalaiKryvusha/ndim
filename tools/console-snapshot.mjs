/**
 * СНИМОК ПОИСКОВЫХ КОНСОЛЕЙ — прибор миссии `ideas/37`, фаза 2 эпика `plans/74` («Зрение»).
 *
 * Снимает всю доступную глубину Google Search Console по пяти срезам (дни · страницы · запросы ·
 * страны · устройства) и кладёт датированный JSON в `reports/CONSOLES/`. Ряд этих файлов в git
 * И ЕСТЬ история: консоль хранит 16 месяцев и прошлое не восстанавливает, поэтому каждый
 * несделанный снимок — день, который через 16 месяцев исчезнет навсегда.
 *
 * Запуск:
 *   node tools/console-snapshot.mjs                # снимок сегодняшним днём
 *   node tools/console-snapshot.mjs --months 3     # окно короче (быстрее, для проб)
 *   node tools/console-snapshot.mjs --dry          # сходить и напечатать, ничего не записывая
 *   node tools/console-snapshot.mjs --out <дир>    # другая директория (по умолчанию reports/CONSOLES)
 *   node tools/console-snapshot.mjs --check-age 8 # СТРАЖ ВОЗРАСТА ряда: сети не касается,
 *                                                  код 1, если свежего снимка нет
 *
 * Код возврата: 0 — снимок снят · 1 — доступа нет либо консоль не ответила.
 *
 * 🔑 ИДЕМПОТЕНТНОСТЬ — ВЫБОР НАЗВАН, А НЕ ПОДРАЗУМЕВАЕТСЯ: повторный прогон в тот же день
 * ПЕРЕЗАПИСЫВАЕТ файл этого дня. Второго файла за день не бывает. Довод: Search Console
 * пересматривает свежие дни задним числом, поэтому более поздний прогон того же дня несёт
 * СТРОГО лучшие данные, и отказ от перезаписи заморозил бы худший снимок. Прежнее содержимое
 * при этом не теряется — оно лежит в истории git, а `takenAt` в файле всегда говорит, когда
 * снимали на самом деле.
 *
 * ⚠️ ГРАНИЦЫ, названные честно (полностью — в `researches/56_console_apis_bing_yandex.md`):
 * · снимается ТИП ПОИСКА `web` — картинки, видео и Discover сюда не входят;
 * · ПОКРЫТИЯ (проиндексировано / исключено и почему) у этого API нет вовсе — дыра остаётся дырой;
 * · Bing и Яндекс машинного снимка пока не дают — состояние их API стоит в шапке снимка.
 *
 * ⛔ Ключ — только из `.env` (канон-правило владельца 2026-08-15). Прибор ЧИТАЮЩИЙ: область
 * доступа `webmasters.readonly`, ни одной пишущей операции в коде нет.
 */
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
	consoleReaderKey,
	accessToken,
	apiGet,
	apiPost,
	API,
	SCOPE,
	EXPECTED_PROPERTY,
} from './lib/console-auth.mjs';
import {
	ROW_LIMIT,
	RETENTION_MONTHS,
	isoDate,
	snapshotWindow,
	snapshotFileName,
	totals,
	freshness,
	weeklyBuckets,
	weekOverWeek,
	topBy,
	ageVerdict,
	positionBands,
	bandsByDevice,
} from './lib/console-snapshot-core.mjs';

const DEFAULT_OUT = join('reports', 'CONSOLES');

/** Пять срезов заказа `plans/74` Ш1. Ключ — имя среза в файле, значение — измерение API. */
const SLICES = [
	{ name: 'byDate', dimension: 'date' },
	{ name: 'byPage', dimension: 'page' },
	{ name: 'byQuery', dimension: 'query' },
	{ name: 'byCountry', dimension: 'country' },
	{ name: 'byDevice', dimension: 'device' },
];

/**
 * ШЕСТОЙ СРЕЗ — ПЕРЕКРЁСТНЫЙ, и он не «ещё один», а единственный, на котором проверяема
 * гипотеза Г-2 (`reports/CONSOLES/2026-08-28_hypotheses.md`). Раздельные срезы устройств и
 * страниц не позволяют сравнить устройства ВНУТРИ одной полосы позиций — а именно это и
 * различает «десктоп хуже конвертирует» от «десктопные показы просто глубже».
 */
const CROSS_SLICE = { name: 'byDevicePage', dimensions: ['device', 'page'] };

/**
 * Состояние ДРУГИХ консолей — результат разведки Ш2, вписывается в шапку каждого снимка.
 *
 * Живёт здесь константой, а не в отдельном файле, намеренно: снимок обязан отвечать на вопрос
 * «а что с остальными двумя» ИЗ СЕБЯ. Читающий через полгода не должен догадываться, почему в
 * файле только Google. Разбор с первоисточниками — в разведдоке, ссылка ниже.
 */
const OTHER_CONSOLES = {
	research: 'researches/56_console_apis_bing_yandex.md',
	bing: {
		machineReadable: true,
		blocked: 'нужен ключ API из веб-интерфейса Bing Webmaster Tools — шаг владельца',
		note: 'API есть и отдаёт статистику по запросам и страницам; ключ владелец получает в панели за минуту.',
	},
	yandex: {
		machineReadable: true,
		blocked: 'нужен OAuth-токен Яндекс ID — шаг владельца',
		note: 'Webmaster API 4.0 отдаёт статистику поиска, историю индексации и очередь переобхода.',
	},
};

/** Разбор аргументов. Намеренно скудный: у прибора пять флагов и все они очевидны. */
function parseArgs(argv) {
	const args = { months: RETENTION_MONTHS, out: DEFAULT_OUT, dry: false, checkAge: null };
	for (let i = 0; i < argv.length; i += 1) {
		if (argv[i] === '--months') args.months = Number(argv[++i]);
		else if (argv[i] === '--out') args.out = argv[++i];
		else if (argv[i] === '--dry') args.dry = true;
		else if (argv[i] === '--check-age') args.checkAge = Number(argv[++i]);
	}
	if (args.checkAge !== null && (!Number.isFinite(args.checkAge) || args.checkAge < 0)) {
		throw new Error(`--check-age ожидает неотрицательное число суток, получено «${args.checkAge}»`);
	}
	if (!Number.isFinite(args.months) || args.months <= 0) {
		throw new Error(`--months ожидает положительное число, получено «${args.months}»`);
	}
	return args;
}

/**
 * Одна выборка со СТРАНИЧНОЙ ДОГРУЗКОЙ.
 *
 * 🔴 Без страниц прибор молча врал бы: API отдаёт максимум 25 000 строк за запрос и НЕ сообщает,
 * что строки кончились не все. Срез запросов у растущего каталога упрётся в этот потолок первым,
 * и «топ-10 по показам» посчитался бы по усечённому набору — то есть был бы неверен, оставаясь
 * правдоподобным.
 */
async function fetchSlice(token, property, dimensions, window) {
	const rows = [];
	for (let startRow = 0; ; startRow += ROW_LIMIT) {
		const response = await apiPost(
			token,
			`/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
			{
				startDate: window.startDate,
				endDate: window.endDate,
				dimensions,
				type: 'web',
				dataState: 'all',
				rowLimit: ROW_LIMIT,
				startRow,
			},
		);
		if (!response.ok) {
			throw new Error(
				`срез «${dimensions.join('×')}» не отдан (${response.status}): ${response.body.error?.message ?? ''}`,
			);
		}
		const page = response.body.rows ?? [];
		rows.push(...page);
		if (page.length < ROW_LIMIT) return rows;
	}
}

/** Локальный момент полным ISO 8601 со смещением — по канону «метка несёт дату и время». */
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
	const now = new Date(); // ЛОКАЛЬНЫЕ часы машины — правило владельца, `bugs/195`
	const todayIso = isoDate(now);
	const window = snapshotWindow(now, args.months);

	// ── Режим стража возраста: сети не касается, снимка не делает ─────────────────────────
	if (args.checkAge !== null) {
		const names = existsSync(args.out) ? readdirSync(args.out) : [];
		const verdict = ageVerdict(names, todayIso, args.checkAge);
		console.log(`ВОЗРАСТ РЯДА СНИМКОВ (${args.out})\n`);
		console.log(`  ${verdict.reason}`);
		if (verdict.stale) {
			console.error('\n🔴 РЯД ПРОСРОЧЕН — снимите снимок: node tools/console-snapshot.mjs');
			return 1;
		}
		console.log('\n✅ ряд свежий');
		return 0;
	}

	console.log('СНИМОК ПОИСКОВЫХ КОНСОЛЕЙ\n');
	console.log(`сегодня: ${todayIso}`);
	console.log(`окно:    ${window.startDate} … ${window.endDate}  (${args.months} мес.)\n`);

	const key = consoleReaderKey();
	const token = await accessToken(key);

	const sites = await apiGet(token, '/sites');
	if (!sites.ok) {
		console.error(`🔴 список ресурсов не отдан (${sites.status}): ${sites.body.error?.message ?? ''}`);
		return 1;
	}
	const entries = sites.body.siteEntry ?? [];
	const target = entries.find((entry) => entry.siteUrl === EXPECTED_PROPERTY) ?? entries[0];
	if (!target) {
		console.error('🔴 РЕСУРСОВ НОЛЬ — Search Console этот аккаунт не знает (см. homeworks/12).');
		return 1;
	}
	console.log(`ресурс:  ${target.siteUrl}  (доступ: ${target.permissionLevel})\n`);

	// ── Пять срезов ────────────────────────────────────────────────────────────────────────
	const slices = {};
	for (const slice of SLICES) {
		const rows = await fetchSlice(token, target.siteUrl, [slice.dimension], window);
		slices[slice.name] = rows.map((row) => ({
			key: row.keys?.[0] ?? null,
			clicks: row.clicks ?? 0,
			impressions: row.impressions ?? 0,
			ctr: row.ctr ?? 0,
			position: row.position ?? null,
		}));
		console.log(`  ${slice.dimension.padEnd(8)} — строк ${rows.length}`);
		if (slice.name === 'byDate') slices.__rawDate = rows;
	}

	const dateRows = slices.__rawDate ?? [];
	delete slices.__rawDate;

	// Перекрёстный разрез: устройство × страница. Ключи составные, порядок — как в запросе.
	const crossRaw = await fetchSlice(token, target.siteUrl, CROSS_SLICE.dimensions, window);
	const cross = crossRaw.map((row) => ({
		device: row.keys?.[0] ?? null,
		page: row.keys?.[1] ?? null,
		clicks: row.clicks ?? 0,
		impressions: row.impressions ?? 0,
		ctr: row.ctr ?? 0,
		position: row.position ?? null,
	}));
	console.log(`  device×page — строк ${cross.length}`);
	const deviceBands = bandsByDevice(cross);

	const summary = totals(dateRows);
	const fresh = freshness(dateRows, todayIso);
	const weeks = weeklyBuckets(dateRows);
	const wow = weekOverWeek(weeks);

	const snapshot = {
		formatVersion: 1,
		takenAt: localIso(now),
		takenBy: 'tools/console-snapshot.mjs',
		source: {
			console: 'Google Search Console',
			property: target.siteUrl,
			permissionLevel: target.permissionLevel,
			api: `${API}/searchAnalytics/query`,
			scope: SCOPE,
			searchType: 'web',
			dataState: 'all',
		},
		window: { ...window, months: args.months, retentionMonths: RETENTION_MONTHS },
		freshness: fresh,
		totals: summary,
		weeks,
		weekOverWeek: wow,
		top: {
			pages: topBy(slices.byPage.map(toRow), 'impressions', 20),
			queries: topBy(slices.byQuery.map(toRow), 'impressions', 20),
		},
		positionBands: positionBands(slices.byPage.map(toRow)),
		deviceBands,
		slices: { ...slices, byDevicePage: cross },
		otherConsoles: OTHER_CONSOLES,
		boundaries: [
			'тип поиска — только web (картинки, видео, Discover не входят)',
			'ПОКРЫТИЯ (проиндексировано / исключено и почему) этот API не отдаёт вовсе',
			'свежие дни консоль пересматривает задним числом — сравнивать снимки, а не верить последнему дню',
		],
	};

	// ── Печать человеку ────────────────────────────────────────────────────────────────────
	console.log(`\nИТОГО за окно: показов ${summary.impressions} · кликов ${summary.clicks} · ` +
		`CTR ${(summary.ctr * 100).toFixed(2)} % · позиция ${summary.position?.toFixed(1) ?? '—'}`);
	console.log(
		`СВЕЖЕСТЬ: последний день с показами ${fresh.lastDayWithImpressions ?? '—'} ` +
			`(отставание ${fresh.lagDays ?? '—'} сут.), хвост пустых дней ${fresh.trailingEmptyDays ?? '—'}`,
	);
	if (wow) {
		console.log(
			`НЕДЕЛЯ К НЕДЕЛЕ (${wow.previous} → ${wow.current}): ` +
				`показы ${wow.impressions.before}→${wow.impressions.after} ` +
				`[${wow.impressions.signal ? 'СИГНАЛ' : 'шум'}] · ` +
				`клики ${wow.clicks.before}→${wow.clicks.after} ` +
				`[${wow.clicks.signal ? 'СИГНАЛ' : 'шум'}]`,
		);
	} else {
		console.log('НЕДЕЛЯ К НЕДЕЛЕ: полных недель меньше двух — сравнивать нечем');
	}

	// Полосы позиций по устройствам — то, ради чего снят перекрёстный разрез (гипотеза Г-2).
	console.log('\nПОЛОСЫ ПОЗИЦИЙ ПО УСТРОЙСТВАМ (различают «устройство» и «глубина выдачи»):');
	for (const item of deviceBands) {
		console.log(
			`  ${item.device}: показов ${item.impressions} · кликов ${item.clicks} · ` +
				`CTR ${(item.ctr * 100).toFixed(2)} % · позиция ${item.position?.toFixed(1) ?? '—'}`,
		);
		for (const band of item.bands) {
			if (band.impressions === 0) continue;
			console.log(
				`      поз ${band.band.padEnd(7)} показов ${String(band.impressions).padStart(5)} ` +
					`кликов ${String(band.clicks).padStart(3)}  CTR ${(band.ctr * 100).toFixed(2)} %`,
			);
		}
	}

	if (args.dry) {
		console.log('\n(--dry: файл не записан)');
		return 0;
	}

	mkdirSync(args.out, { recursive: true });
	const file = join(args.out, snapshotFileName(todayIso));
	const existed = existsSync(file);
	writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
	console.log(`\n✅ ${existed ? 'ПЕРЕЗАПИСАН' : 'ЗАПИСАН'}: ${file}`);
	if (existed) console.log('   (повтор дня — прежнее содержимое осталось в истории git)');
	return 0;
}

/** Строка среза → форма, которую понимает `topBy` (он работает с сырыми `keys`). */
function toRow(entry) {
	return { keys: [entry.key], ...entry };
}

main(process.argv.slice(2)).then(
	(code) => process.exit(code),
	(error) => {
		console.error(`🔴 ${error.message}`);
		process.exit(1);
	},
);

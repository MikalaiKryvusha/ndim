/**
 * СНИМОК ЯНДЕКС.ВЕБМАСТЕРА — второй машинный источник миссии консолей (`ideas/37`, `plans/74` Ф2).
 *
 * Отвечает на вопрос, которого нет у Google: **какие наши страницы выпали из поиска и почему**.
 * Повод не теоретический — 2026-08-28 Яндекс выкинул 1352 страницы (`bugs/203`), и прочитать это
 * машиной сегодня нечем; всё, что есть, — скриншот дайджеста и ручная выгрузка CSV.
 *
 * Запуск:
 *   node tools/yandex-snapshot.mjs                    # снимок сегодняшним днём
 *   node tools/yandex-snapshot.mjs --dry              # сходить и напечатать, не записывая
 *   node tools/yandex-snapshot.mjs --quota            # только квота переобхода
 *   node tools/yandex-snapshot.mjs --quota --sent-by-hand 150
 *                                                     # …и сопоставить с отправленным руками
 *   node tools/yandex-snapshot.mjs --days 90          # окно статистики запросов
 *
 * Код возврата: 0 — снято · 1 — токена нет либо Вебмастер не ответил.
 *
 * ✅ [TESTED: 2026-08-28 · набор `qa/suites/yandex-webmaster.md`, 9 случаев сняты живым прогоном
 * на боевом токене владельца] — маркер ФИЧИ законен только вместе с написанным набором случаев
 * (`TESTING_FRAMEWORK.md`, правило маркеров 7); одно наблюдение переворачивает маркер СЛУЧАЯ.
 * Первая редакция этого маркера стояла на одном прогоне — исправлено в тот же день. Прибор написан был
 * вперёд токена намеренно (постановка Менеджера), и первый настоящий прогон состоялся в тот же
 * день. **Что живой прогон подтвердил поимённо:** права хоста (`ndimspace.app` подтверждён,
 * пользователь 130280754) · квота переобхода (суточная 150, остаток 0) и вердикт пула · ряд
 * статистики за 90 суток — 91 строка · события поиска — 2767, из них выпало 1379, появилось 1388 ·
 * разбор причин и разрез по разделам.
 * ⚠️ **ЧТО ЖИВЫМ ПРОГОНОМ НЕ ПРОВЕРЕНО, И ЭТО НАЗВАНО ЧЕСТНО:** ветка ошибок API (отказ, 4xx,
 * пустой ответ) — Вебмастер отвечал исправно, и уронить его нарочно я не вправе; она остаётся на
 * юнитах фикстур. Разбор причин проверен на ДВУХ кодах, пришедших сегодня, а не на всём словаре.
 *
 * 🔑 НАХОДКА ПЕРВОГО ПРОГОНА, СТОЯЩАЯ ОТДЕЛЬНО: **API и выгрузка интерфейса называют одни и те же
 * события РАЗНЫМИ словами.** Выгрузка CSV дала `LOW_DEMAND` 1378 + `META_NO_INDEX` 1; API за то же
 * окно — `LOW_QUALITY` 1378 + `NO_INDEX` 1. Счёт сходится до единицы, словарь — нет. Это ровно то,
 * ради чего в ядре стоит правило «коды складываются как пришли, без перевода»: прибор, который
 * «нормализовал» бы одно в другое, вписал бы в данные выдумку. Разбор — `bugs/203`.
 *
 * ⛔ ПРИБОР ЧИТАЮЩИЙ. Переобход (`recrawl/queue`) отсюда НЕ вызывается: это действие, меняющее
 * поведение наших страниц в чужом индексе, и оно требует слова владельца. Читается только КВОТА —
 * это вопрос «сколько можно», а не действие.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	yandexToken,
	apiGet,
	pagedSamples,
	userId,
	hosts,
	EXPECTED_HOST,
	API,
} from './lib/yandex-webmaster.mjs';
import {
	findHost,
	splitEvents,
	groupByReason,
	groupBySection,
	quotaVerdict,
	indicatorsToRows,
} from './lib/yandex-snapshot-core.mjs';
import { isoDate, snapshotFileName } from './lib/console-snapshot-core.mjs';
import { settleExit } from './lib/exit-code.mjs';

const DEFAULT_OUT = join('reports', 'CONSOLES');

/** Показатели статистики поиска. Имена — из первоисточника; что придёт, то и ляжет в ряд. */
const QUERY_INDICATORS = ['TOTAL_SHOWS', 'TOTAL_CLICKS', 'AVG_SHOW_POSITION', 'AVG_CLICK_POSITION'];

function parseArgs(argv) {
	const args = { out: DEFAULT_OUT, dry: false, quota: false, sentByHand: 0, days: 90 };
	for (let i = 0; i < argv.length; i += 1) {
		if (argv[i] === '--out') args.out = argv[++i];
		else if (argv[i] === '--dry') args.dry = true;
		else if (argv[i] === '--quota') args.quota = true;
		else if (argv[i] === '--sent-by-hand') args.sentByHand = Number(argv[++i]);
		else if (argv[i] === '--days') args.days = Number(argv[++i]);
	}
	if (!Number.isFinite(args.days) || args.days <= 0) {
		throw new Error(`--days ожидает положительное число, получено «${args.days}»`);
	}
	if (!Number.isFinite(args.sentByHand) || args.sentByHand < 0) {
		throw new Error(`--sent-by-hand ожидает неотрицательное число, получено «${args.sentByHand}»`);
	}
	return args;
}

/** Локальный момент полным ISO 8601 — канон «метка несёт дату и время». */
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
	const now = new Date(); // ЛОКАЛЬНЫЕ часы машины (`bugs/195`)
	const todayIso = isoDate(now);

	const token = yandexToken(); // бросит с адресом домашки, если токена нет
	const user = await userId(token);
	const hostList = await hosts(token, user);
	const host = findHost(hostList, EXPECTED_HOST);
	if (!host) {
		console.error(`🔴 хост ${EXPECTED_HOST} токену не виден. Доступные: ${hostList.length}`);
		for (const item of hostList) console.error(`   · ${item.host_id ?? item.unicode_host_url}`);
		console.error('   Права на сайт подтверждает владелец в Вебмастере — см. homeworks/15_console_keys_yandex_bing.md.');
		return 1;
	}

	const base = `/user/${user}/hosts/${encodeURIComponent(host.host_id)}`;
	console.log('СНИМОК ЯНДЕКС.ВЕБМАСТЕРА\n');
	console.log(`пользователь: ${user}`);
	console.log(`хост:         ${host.host_id}`);
	console.log(`права:        ${host.verified === true ? 'подтверждены' : 'НЕ подтверждены'}\n`);

	// ── Квота переобхода: отдельный режим, ничего не снимает ───────────────────────────────
	const quota = await apiGet(token, `${base}/recrawl/quota`);
	const quotaBody = quota.ok ? quota.body : null;
	const verdict = quotaBody
		? quotaVerdict({
				dailyQuota: quotaBody.daily_quota,
				quotaRemainder: quotaBody.quota_remainder,
				sentByHand: args.sentByHand,
			})
		: { pool: 'неизвестно', reason: `квота не отдана (${quota.status})` };

	console.log('КВОТА ПЕРЕОБХОДА');
	if (quotaBody) {
		console.log(`  суточная ${quotaBody.daily_quota} · остаток ${quotaBody.quota_remainder}`);
	}
	console.log(`  пул с интерфейсом: ${verdict.pool} — ${verdict.reason}\n`);

	if (args.quota) return 0;

	// ── Статистика поиска ──────────────────────────────────────────────────────────────────
	const from = new Date(now.getTime() - args.days * 86_400_000);
	const history = await apiGet(token, `${base}/search-queries/all/history`, {
		query_indicator: QUERY_INDICATORS,
		date_from: isoDate(from),
		date_to: todayIso,
	});
	const queryHistory = history.ok ? indicatorsToRows(history.body) : [];
	console.log(`СТАТИСТИКА ПОИСКА за ${args.days} сут. — строк ${queryHistory.length}`);

	// ── События поиска: что появилось и что выпало, с причинами ────────────────────────────
	const samples = await pagedSamples(token, `${base}/search-urls/events/samples`);
	const { removed, appeared, other } = splitEvents(samples);
	const reasons = groupByReason(removed);
	const sections = groupBySection(removed);

	console.log(`СОБЫТИЯ ПОИСКА — всего ${samples.length}: выпало ${removed.length} · ` +
		`появилось ${appeared.length} · без типа ${other.length}\n`);
	if (reasons.length > 0) {
		console.log('ПРИЧИНЫ ВЫПАДЕНИЯ (как их назвал Вебмастер, без нашего перевода):');
		for (const item of reasons) console.log(`  ${String(item.count).padStart(5)}  ${item.reason}`);
		console.log('');
	}
	if (sections.length > 0) {
		console.log('ВЫПАЛО ПО РАЗДЕЛАМ:');
		for (const item of sections) console.log(`  ${String(item.count).padStart(5)}  ${item.section}`);
		console.log('');
	}

	const snapshot = {
		formatVersion: 1,
		takenAt: localIso(now),
		takenBy: 'tools/yandex-snapshot.mjs',
		source: {
			console: 'Яндекс.Вебмастер',
			api: `${API}/user/{user}/hosts/{host}`,
			hostId: host.host_id,
			verified: host.verified ?? null,
		},
		trust: '[TESTED: 2026-08-28 · qa/suites/yandex-webmaster.md — 9 живых случаев] — ветка отказов API на юнитах',
		recrawlQuota: quotaBody
			? { ...quotaBody, sentByHand: args.sentByHand, poolVerdict: verdict }
			: { error: quota.status, poolVerdict: verdict },
		queryHistory: { days: args.days, rows: queryHistory },
		searchEvents: {
			total: samples.length,
			removed: removed.length,
			appeared: appeared.length,
			withoutType: other.length,
			byReason: reasons,
			bySection: sections,
			samples,
		},
		boundaries: [
			'коды причин НЕ переводятся и НЕ сверяются со списком — складываются как пришли',
			'переобход отсюда не вызывается: это действие, оно требует слова владельца',
			'выборка событий ограничена 50 000 адресов — потолок самого API',
		],
	};

	if (args.dry) {
		console.log('(--dry: файл не записан)');
		return 0;
	}

	mkdirSync(args.out, { recursive: true });
	const file = join(args.out, snapshotFileName(todayIso, 'yandex_webmaster'));
	writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
	console.log(`✅ ЗАПИСАН: ${file}`);
	return 0;
}

settleExit(main(process.argv.slice(2)));

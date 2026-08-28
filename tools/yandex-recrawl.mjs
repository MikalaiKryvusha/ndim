/**
 * МАШИННАЯ ПОДАЧА ПЕРЕОБХОДА В ЯНДЕКС.ВЕБМАСТЕР — остаток очереди инцидента `bugs/203`.
 *
 * Запуск:
 *   node tools/yandex-recrawl.mjs                       # сухой прогон: план и числа, ничего не шлём
 *   node tools/yandex-recrawl.mjs --apply --auth-owner "<дословные слова владельца>"
 *   node tools/yandex-recrawl.mjs --cap 50              # потолок порции меньше квоты
 *   node tools/yandex-recrawl.mjs --queue <файл> --sent <файл>
 *
 * Код возврата: 0 — прогон состоялся (в том числе «слать нечего») · 1 — отказ предохранителя,
 * нет токена либо Вебмастер не ответил.
 *
 * ── AUTH ───────────────────────────────────────────────────────────────────────────────────
 * 🔴 **Слово владельца, дословно (чат, 2026-08-28 ~19:0x):** «*агент будет сам отправлять правки
 * в яндекс*». Дано в ответ на развилку «агент шлёт сам ежедневно / владелец шлёт руками», с
 * названной ему честной ценой: **машина не ускоряет — пул общий, она снимает только труд**.
 *
 * ⛔ **ГРАНИЦА РАЗРЕШЕНИЯ, и она узкая.** Слово покрывает МАШИННУЮ ПОДАЧУ ПЕРЕОБХОДА
 * (`recrawl/queue`) адресов из очереди инцидента, ежедневными порциями по суточной квоте.
 * Никаких других пишущих действий в Вебмастере оно не открывает — ни настроек, ни удалений, ни
 * подачи чего-либо, кроме этой очереди. Разрешение НА ДЕЙСТВИЕ, а не на область.
 *
 * ── ЧЕГО ЭТОТ ПРИБОР НЕ ДЕЛАЕТ, И ПОЧЕМУ ЭТО ВАЖНО ─────────────────────────────────────────
 * Он не живёт в приборе наблюдения (`tools/yandex-snapshot.mjs`) и не пользуется его библиотекой
 * для записи: шапка `lib/yandex-webmaster.mjs` объявляет свою область ЧИТАЮЩЕЙ, и пишущий вызов
 * внутри неё сделал бы это объявление неправдой. Наблюдение и действие разведены файлами, а не
 * обещанием.
 *
 * ── 🔴 МАШИНА УСТУПАЕТ ЧЕЛОВЕКУ ────────────────────────────────────────────────────────────
 * Квота у интерфейса и API **общая** — замерено живым вызовом (`bugs/203`: израсходовано 150 при
 * 150, отправленных владельцем руками). Поэтому перед каждой подачей прибор СПРАШИВАЕТ остаток и
 * шлёт не больше него: владелец может слать сам в тот же день, и спорить с ним за общий ресурс
 * прибор не вправе. Зашитого числа суточной квоты здесь нет намеренно — оно зависит от сайта и
 * сообщается сервисом (`researches/56` §3.5); зашитая константа была бы будущим 429.
 *
 * Контракт API — `researches/56` §3.5, снят с первоисточника. Логика и её юниты —
 * `tools/lib/yandex-recrawl-core.mjs` + `tools/yandex-recrawl.test.mjs`.
 */
import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { yandexToken, apiGet, userId, hosts, API, EXPECTED_HOST } from './lib/yandex-webmaster.mjs';
import {
	parseAddresses,
	remainingQueue,
	planBatch,
	classifyResponse,
	ledgerLine,
} from './lib/yandex-recrawl-core.mjs';
import { settleExit } from './lib/exit-code.mjs';

const DEFAULT_QUEUE = join('test-results', 'ya-incident', 'recrawl-rest.txt');
const DEFAULT_SENT = join('test-results', 'ya-incident', 'recrawl-sent.txt');

/** Пауза между вызовами: 150 запросов подряд в чужой сервис — это вежливость, а не техника. */
const PACE_MS = 400;

function parseArgs(argv) {
	const args = { apply: false, auth: '', queue: DEFAULT_QUEUE, sent: DEFAULT_SENT, cap: Infinity };
	for (let i = 0; i < argv.length; i += 1) {
		if (argv[i] === '--apply') args.apply = true;
		else if (argv[i] === '--auth-owner') args.auth = argv[++i] ?? '';
		else if (argv[i] === '--queue') args.queue = argv[++i];
		else if (argv[i] === '--sent') args.sent = argv[++i];
		else if (argv[i] === '--cap') args.cap = Number(argv[++i]);
		else throw new Error(`неизвестный довод «${argv[i]}»`);
	}
	if (!Number.isFinite(args.cap) && args.cap !== Infinity) {
		throw new Error('--cap ожидает число');
	}
	return args;
}

/** Один адрес в очередь переобхода. Пишущий вызов живёт здесь и только здесь. */
async function submit(token, user, hostId, url) {
	const response = await fetch(`${API}/user/${user}/hosts/${hostId}/recrawl/queue`, {
		method: 'POST',
		headers: { Authorization: `OAuth ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ url }),
	});
	// Тело вычитывается ВСЕГДА, в том числе у ошибочного кода: недренированный поток держит сокет
	// живым (класс, оплаченный на indexnow-submit — см. `tools/lib/exit-code.mjs`).
	const body = await response.json().catch(() => ({}));
	return classifyResponse({ status: response.status, body });
}

const isoDate = (d = new Date()) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function main(argv) {
	const args = parseArgs(argv);

	// ── Предохранитель слова владельца — ПЕРВЫМ, ДО ВСЯКОЙ СЕТИ ────────────────────────────
	// Он стоит здесь, а не перед самой отправкой, по двум причинам. Строгость: без разрешения
	// прибор не заводит с чужим сервисом даже разговора. Проверяемость: отказ воспроизводится
	// без токена и без сети, то есть его можно предъявить судье в любой день, а не только в
	// день со свободной квотой (первая редакция прятала эту ветку за тремя вызовами API —
	// поймано собственным прогоном 2026-08-28, когда квота была выбрана и ветка оказалась
	// недостижима).
	if (args.apply && args.auth.trim().length === 0) {
		console.error('🔴 ОТКАЗ: --apply без --auth-owner.');
		console.error('   Подача — действие наружу; агент себе разрешения не выписывает.');
		console.error('   Стоячее слово владельца — в шапке этого файла, блок AUTH.');
		return 1;
	}

	const token = yandexToken();

	if (!existsSync(args.queue)) {
		throw new Error(
			`нет файла очереди ${args.queue} — он лежит в test-results/ (вне git) и в рабочие копии\n` +
				'ролей не едет. Возьмите его из главной копии либо укажите путь доводом --queue.',
		);
	}
	const queue = parseAddresses(readFileSync(args.queue, 'utf8'));
	const sent = existsSync(args.sent) ? parseAddresses(readFileSync(args.sent, 'utf8')) : [];
	const remaining = remainingQueue(queue, sent);

	const user = await userId(token);
	const list = await hosts(token, user);
	const host = list.find((h) => h.unicode_host_url?.includes(EXPECTED_HOST));
	if (!host) throw new Error(`хост ${EXPECTED_HOST} не найден среди подтверждённых`);
	const hostId = host.host_id;

	console.log('ПОДАЧА ПЕРЕОБХОДА В ЯНДЕКС.ВЕБМАСТЕР\n');
	console.log(`очередь:    ${args.queue} — адресов ${queue.length}`);
	console.log(`отправлено раньше: ${sent.length} · осталось ${remaining.length}`);

	const quota = await apiGet(token, `/user/${user}/hosts/${hostId}/recrawl/quota`);
	if (!quota.ok) throw new Error(`квота не отдана (${quota.status})`);
	const quotaRemainder = quota.body.quota_remainder;
	console.log(`квота:      суточная ${quota.body.daily_quota} · остаток ${quotaRemainder}`);

	const plan = planBatch({ remaining, quotaRemainder, cap: args.cap });
	console.log(`к отправке: ${plan.size} (ограничитель — ${plan.limitedBy})\n`);

	if (plan.size === 0) {
		console.log(
			plan.limitedBy === 'очередь пуста'
				? '✅ ОЧЕРЕДЬ РАЗОБРАНА ЦЕЛИКОМ — слать больше нечего.'
				: 'СЕГОДНЯ СЛАТЬ НЕЧЕГО: квота выбрана. Прибор уступает — возможно, владелец слал руками.',
		);
		return 0;
	}

	if (!args.apply) {
		console.log('СУХОЙ ПРОГОН — не отправлено ничего.');
		console.log('Для настоящей подачи: --apply --auth-owner "<дословные слова владельца>"');
		return 0;
	}

	mkdirSync(dirname(args.sent), { recursive: true });
	const today = isoDate();
	let accepted = 0;
	let skipped = 0;
	let failed = 0;
	let quotaLeft = quotaRemainder;

	for (const url of plan.urls) {
		const result = await submit(token, user, hostId, url);
		if (result.outcome === 'accepted') {
			accepted += 1;
			if (result.quotaRemainder !== null) quotaLeft = result.quotaRemainder;
			appendFileSync(args.sent, `${url}\n`, 'utf8');
		} else if (result.outcome === 'skipped') {
			skipped += 1;
			appendFileSync(args.sent, `${url}\n`, 'utf8'); // уже в очереди — повторять незачем
		} else if (result.outcome === 'stop') {
			console.log(`\n⏹ ОСТАНОВ: ${result.why}`);
			break;
		} else {
			failed += 1;
			console.log(`  ⚠️ ${url} — ${result.why}`);
		}
		if (accepted % 25 === 0 && accepted > 0) console.log(`  … принято ${accepted}`);
		await new Promise((resolve) => setTimeout(resolve, PACE_MS));
	}

	const queueLeft = remaining.length - accepted - skipped;
	console.log(`\n✅ ПОДАЧА ЗАВЕРШЕНА: принято ${accepted} · пропущено ${skipped} · отказов ${failed}`);
	console.log(`   остаток очереди ${queueLeft} · остаток квоты ${quotaLeft}`);
	console.log('\nСТРОКА ДЛЯ bugs/203 (скопировать в журнал подач):');
	console.log(ledgerLine({ date: today, accepted, skipped, failed, queueLeft, quotaLeft }));
	return 0;
}

settleExit(main(process.argv.slice(2)));

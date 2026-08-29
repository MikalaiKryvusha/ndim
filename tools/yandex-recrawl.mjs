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
 * ✅ [TESTED: 2026-08-29 · набор `qa/suites/yandex-webmaster.md`, случаи П-01…П-25] — маркер
 * выставлен только СЕГОДНЯ и намеренно не раньше: набор сам запретил его до первой живой подачи
 * («подача, ни разу не подавшая ни одного адреса, фичей проверенной не является, сколько бы
 * юнитов под ней ни лежало»). Что подтвердила первая живая подача: 150 адресов приняты кодом
 * 202 · журнал вырос с 0 до 150 строк без дубликатов · повторный прогон их не переподал
 * (П-15) · остаток квоты, замеренный после, сошёлся с израсходованным (150 из 150).
 * ⚠️ **Чем маркер НЕ покрыт, и это названо честно:** ветка отказов Вебмастера (400/403/404/409/
 * 429) живьём не наблюдалась ни разу — сервис отвечал исправно, ронять его нарочно мы не вправе;
 * она стоит на юнитах фикстур. Подача НЕ проверена на границе суток при живом сбросе квоты.
 *
 * ── AUTH ───────────────────────────────────────────────────────────────────────────────────
 * 🔴 **Первоисточник разрешения — `bugs/203` § «Разрешение владельца — МАШИННАЯ ПОДАЧА
 * ПЕРЕОБХОДА».** Там цитата дословно, дата со временем, транспорт, развилка с названной ценой,
 * граница и механика. Здесь — ССЫЛКА, и это условие вердикта №7 QA, а не оформление.
 *
 * 🔑 **Почему шапка не цитирует сама себя.** Прежняя редакция держала слово владельца прямо
 * тут — и получалась самоссылка: прибор утверждал, что ему разрешено, ссылаясь на собственный
 * комментарий. Судье нечего проверять, а автор прибора и автор разрешения оказывались одним
 * лицом. Разрешение на необратимое действие обязано жить ВНЕ инструмента, который его исполняет.
 *
 * ⛔ **ГРАНИЦА РАЗРЕШЕНИЯ, и она узкая** (полностью — в `bugs/203`): слово покрывает подачу
 * переобхода (`recrawl/queue`) адресов очереди ЭТОГО инцидента ежедневными порциями в пределах
 * суточной квоты. Никаких других пишущих действий в Вебмастере оно не открывает — разрешение НА
 * ДЕЙСТВИЕ, а не на область.
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
import { readFileSync, existsSync, appendFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { yandexToken, apiGet, userId, hosts, API, EXPECTED_HOST } from './lib/yandex-webmaster.mjs';
import {
	parseAddresses,
	remainingQueue,
	planBatch,
	classifyResponse,
	ledgerLine,
	readOwnerQuote,
	authMatches,
	findAuthDoc,
	settleQuotaLeft,
} from './lib/yandex-recrawl-core.mjs';
import { settleExit } from './lib/exit-code.mjs';

/**
 * Директория первоисточника. САМ документ опознаётся по НОМЕРУ (`findAuthDoc`), а не по имени:
 * имя канон меняет при закрытии бага (`bugs/README.md` → `git mv NN_x.md NN_DONE_x.md`), и
 * прибор, державший признаком полное имя, запирался на целом разрешении — дефект 1 вердикта
 * №10 QA, воспроизведённый судьёй живьём.
 */
const BUGS_DIR = 'bugs';

/**
 * Очередь и журнал живут в ВЕРСИОНИРУЕМОМ месте (замечание З3 вердикта №7 QA).
 *
 * 🔴 Прежде они лежали под `test-results/`, а он в `.gitignore`. Для наблюдений это нормально,
 * но здесь — память о НЕОБРАТИМОМ действии: подача уходит в чужой индекс и назад не отзывается.
 * Без версионируемого журнала на вопрос «что мы уже отправили» ответить нечем, и адреса уходят
 * повторно, тратя суточную квоту впустую. Тождество перенесённой очереди доказано хешом —
 * `reports/YANDEX_RECRAWL/README.md`.
 */
const DEFAULT_QUEUE = join('reports', 'YANDEX_RECRAWL', 'recrawl-queue.txt');
const DEFAULT_SENT = join('reports', 'YANDEX_RECRAWL', 'recrawl-sent.txt');

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
	if (args.apply) {
		// Опознание по НОМЕРУ переживает штатное закрытие бага (`_DONE_`); отказы РАЗЛИЧАЮТСЯ —
		// «документа нет» и «раздел разрешения не найден» ведут читающего в разные стороны.
		const found = findAuthDoc(existsSync(BUGS_DIR) ? readdirSync(BUGS_DIR) : []);
		if (!found.file) {
			console.error(`🔴 ОТКАЗ: ${found.why}.`);
			console.error('   Прибор не исполняет необратимое действие, не прочитав разрешения.');
			return 1;
		}
		const authDoc = join(BUGS_DIR, found.file);
		const recorded = readOwnerQuote(readFileSync(authDoc, 'utf8'));
		if (!recorded.quote) {
			console.error(`🔴 ОТКАЗ: ${recorded.why} (${authDoc}).`);
			console.error('   Разрешение стёрли или переписали — подача останавливается.');
			return 1;
		}
		if (!authMatches(args.auth, recorded.quote)) {
			console.error('🔴 ОТКАЗ: --auth-owner не совпадает со словом, записанным в первоисточнике.');
			console.error(`   Первоисточник: ${authDoc} § «Разрешение владельца».`);
			console.error('   Сверка ТОЧНАЯ: для необратимого действия «что-то набрано» — не ворота.');
			console.error(`   Подано: «${args.auth.trim() || '(пусто)'}»`);
			return 1;
		}
		console.log(`разрешение:  сверено с ${authDoc} § «Разрешение владельца» ✅
`);
	}

	const token = yandexToken();

	if (!existsSync(args.queue)) {
		throw new Error(
			`нет файла очереди ${args.queue}.` +
				'\nОчередь версионируется (reports/YANDEX_RECRAWL/) — значит она обязана быть в дереве.' +
				'\nНет её — либо ветка отстала, либо путь доводом --queue задан неверно.',
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

	// Остаток квоты для журнала ЗАМЕРЯЕТСЯ, а не берётся из последнего ответа: Яндекс отдаёт
	// `quota_remainder` ДО списания того же вызова, и строка отставала на единицу (наблюдение
	// первой живой подачи 2026-08-29 — напечатано 1, немедленный опрос дал 0).
	const after = await apiGet(token, `/user/${user}/hosts/${hostId}/recrawl/quota`);
	const settled = settleQuotaLeft({
		measured: after.ok ? after.body.quota_remainder : null,
		fromLastResponse: quotaLeft,
	});

	const queueLeft = remaining.length - accepted - skipped;
	console.log(`\n✅ ПОДАЧА ЗАВЕРШЕНА: принято ${accepted} · пропущено ${skipped} · отказов ${failed}`);
	console.log(`   остаток очереди ${queueLeft} · остаток квоты ${settled.value}`);
	if (!settled.measured) console.log(`   ⚠️ ${settled.why}`);
	console.log('\nСТРОКА ДЛЯ bugs/203 (скопировать в журнал подач):');
	console.log(ledgerLine({ date: today, accepted, skipped, failed, queueLeft, quotaLeft: settled.value }));
	return 0;
}

settleExit(main(process.argv.slice(2)));

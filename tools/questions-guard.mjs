#!/usr/bin/env node
/**
 * questions-guard.mjs — СТРАЖ МЕСТА ВОПРОСОВ.
 *
 * Жёсткое правило проекта (`AGENT_GUIDE.md` → «Решения, которые агент НЕ принимает один»):
 * всё, что агент хочет ОТ владельца — развилка, вычитка, одобрение, ответ — живёт ТОЛЬКО в
 * `interviews/` (или в явно названном документе-очереди решений), НИКОГДА в хвосте плана,
 * исследования или бага.
 *
 * Полевой факт, ради которого страж вообще существует: это правило нарушают даже агенты, которые
 * его ЗНАЮТ, — чат и хвост документа в моменте дешевле. Страж переводит правило из пожелания в
 * проверяемое утверждение.
 *
 * Страж делает ДВЕ вещи:
 *   1) ищет вопросы владельцу ВНЕ `interviews/` — это нарушение, выход 1;
 *   2) печатает состояние самих интервью: у каждого есть статус, и сколько вопросов ждут ответа.
 *      Неотвеченное интервью — это НЕ нарушение (владелец имеет право ещё не ответить), это отчёт.
 *      Ровно он и есть исполняемая команда «покажи ВСЕ неотвеченные интервью» — без неё, по
 *      полевому опыту, инструмент не считается принятым.
 *
 * ⚠️ Конструктивное решение, оплаченное замером ДО кода (`plans/27`): у текстового правила ложных
 * срабатываний примерно столько же, сколько настоящих находок (26 вхождений «вопрос владельц…»,
 * из них ~14 настоящих). Хитрить регулярным выражением бесполезно — ложная тревога хуже пропуска,
 * потому что приучает игнорировать стража. Поэтому исключения объявляются ЯВНО И С ПРИЧИНОЙ:
 *
 *     ... строка текста ...   <!-- ВОПРОС-ОК: канон описывает само правило, вопроса здесь нет -->
 *
 * Маркер действует на строку, в которой стоит, либо на следующую (если стоит отдельной строкой).
 * Причина обязательна — маркер без причины сам считается нарушением.
 *
 * Запуск:  node tools/questions-guard.mjs [--json]
 * Выход:   0 — чисто; 1 — есть вопросы вне `interviews/` или интервью без статуса.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Разбор документов — из общего ядра контура: одна реализация на страж, страницу и гейт.
import { ROOT, readMd, parseInterview } from './lib/review-core.mjs';

/**
 * БАЗОВАЯ ЛИНИЯ ДОЛГА. Первый прогон стража нашёл 26 настоящих очередей вопросов, накопленных за
 * месяц работы. Страж, красный с самого рождения, бесполезен как ворота и, хуже того, приучает
 * себя игнорировать — а он стережёт правило, которое нарушают даже знающие его агенты.
 *
 * Поэтому: унаследованное записано в базовую линию, страж краснеет только на НОВЫХ нарушениях,
 * а размер долга печатается КАЖДЫЙ раз. Долг не спрятан — он назван числом, которое обязано
 * убывать. Строка выбывает из линии, как только вопрос переехал в `interviews/` (или её текст
 * изменился — правка вопроса значит, что до него дошли руки, и он снова проходит правило).
 */
const BASELINE_FILE = join(ROOT, 'tools', 'questions-baseline.json');

/** Ключ строки долга: файл + отпечаток ТЕКСТА (не номер строки — тот едет при любой правке). */
const debtKey = (h) =>
	`${h.file}#${createHash('sha1').update(h.text.trim()).digest('hex').slice(0, 12)}`;

/** Рабочие директории, где вопросу владельцу висеть НЕЛЬЗЯ. */
// `candidates` и `reports` добавлены 2026-08-28: разнос №048 уехал в канон мастерской
// (candidates/README.md), и страж, не видя каталога, объявил разнесённое неразнесённым —
// ложный красный, который дважды доложили роли на запуске смены 7.
const SCAN_DIRS = ['bugs', 'plans', 'ideas', 'researches', 'homeworks', 'design', 'candidates', 'reports'];

/**
 * Документы, объявленные ОЧЕРЕДЬЮ РЕШЕНИЙ или ЛЕТОПИСЬЮ, — правило их не касается по замыслу.
 * Это единственное файловое исключение в страже, и у каждой строки есть причина.
 */
const DECLARED = {
	'STATUS.md':
		'явно названный документ-очередь решений: раздел «⛔ ЧТО ЖДЁТ ВЛАДЕЛЬЦА» — это разрешённое каноном место',
	'PROJECT_HISTORY.md': 'летопись: прошлое проекта, а не открытые вопросы',
	'AUTHOR_STYLOMETRY.md':
		'сгенерированное зеркало портрета голоса (байт-в-байт слепок KAIF, правится только у источника — реестр зеркал AGENT_GUIDE); слово «вопрос» там — лингвистические правила автора, а не обращения к владельцу',
};

/**
 * ⚠️ Флаг `u` обязателен, а классы букв пишутся через `\p{L}`: в Node `\w` и `\b` остаются
 * ASCII-only даже с `u`, и страж молча промахивался бы мимо собственного языка (грабли №7).
 */

/** Само обращение к владельцу — без «ждёт», которое живёт только в заголовках (правило A). */
const ASK = String.raw`(?:вопрос\p{L}*\s+(?:к\s+)?(?:владельц|автор)\p{L}*|спросит[ья]\s+(?:у\s+)?владельца|требует\s+решения\s+владельца)`;

/**
 * ПРАВИЛО A — ЗАГОЛОВОК, объявляющий очередь владельца.
 * Самый сильный и самый дешёвый сигнал: раздел «⛔ Ждёт владельца» или «❓ Вопросы владельцу»
 * внутри бага, плана или идеи — это буквально то, что канон запрещает.
 */
const HEADING_QUEUE = new RegExp(
	String.raw`^#{1,6}\s.*(?:жд[её]т\s+(?:ответ\p{L}*\s+|решения\s+)?владельца|${ASK})`,
	'iu',
);

/**
 * ПРАВИЛО B — прямое обращение В НАЧАЛЕ строки.
 * Полевая эвристика вместо хитрого разбора: висящий вопрос объявляет себя сразу, а ссылка на
 * вопрос («…, и это, кстати, вопрос владельцу, занесён в plans/24») лежит глубоко в прозе.
 * Порог — 40 знаков от начала СОДЕРЖАНИЯ строки (маркеры списка, цитаты, эмодзи и выделения
 * не считаются).
 */
const ASK_ANYWHERE = new RegExp(ASK, 'iu');
const LINE_PREFIX = /^[>\s*_\-+#|]*(?:[\p{Extended_Pictographic}️‍\s]*)/u;
const HEAD_WINDOW = 40;

/**
 * Ссылка, а не вопрос: строка, которая уже показывает на место вопросов, по определению не
 * нарушает правило — вопрос доехал куда следовало.
 */
const ROUTED = /interviews\/|интервью\s*№/iu;

/**
 * `PENDING:` — неулаженное допущение фейбл-цикла. Считается ОТЧЁТОМ, а не провалом: по канону
 * (`AGENT_GUIDE` → «Беклог и DONE-тег») у каждого допущения есть хозяин и судьба к моменту
 * закрытия работы, но в работе, идущей прямо сейчас, `PENDING:` законен. Красить им стража
 * значило бы завести ложную тревогу, а она приучает стража игнорировать (грабли №5).
 */
const PENDING = /(?<!\p{L})PENDING:/u;

/** Маркер исключения: `<!-- ВОПРОС-ОК: причина -->`. Причина обязательна и непустая. */
const EXCUSE = /<!--\s*ВОПРОС-ОК:\s*(?<reason>[^>]*?)\s*-->/iu;

// ─────────────────────────────────────────────────────────────────────────────
// Чтение файлов
// ─────────────────────────────────────────────────────────────────────────────

/** Рекурсивный обход директории за *.md. */
function walkMd(dir, out = []) {
	let entries;
	try {
		entries = readdirSync(dir);
	} catch {
		return out; // директории может не быть — это не ошибка стража
	}
	for (const name of entries) {
		const full = join(dir, name);
		const st = statSync(full);
		if (st.isDirectory()) walkMd(full, out);
		else if (name.endsWith('.md')) out.push(full);
	}
	return out;
}

/** Все документы, подлежащие проверке «вопрос не должен здесь висеть». */
function docsInScope() {
	const files = [];
	for (const d of SCAN_DIRS) files.push(...walkMd(join(ROOT, d)));
	for (const name of readdirSync(ROOT)) {
		if (name.endsWith('.md') && statSync(join(ROOT, name)).isFile()) files.push(join(ROOT, name));
	}
	return files.filter((f) => {
		const rel = relative(ROOT, f).split(sep).join('/');
		if (rel.startsWith('interviews/')) return false; // это и есть место вопросов
		if (basename(f).includes('_DONE_')) return false; // закрытая работа: её вопросы отвечены
		if (DECLARED[rel]) return false; // объявленная очередь решений / летопись
		return true;
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// Половина 3 — ОБРАТНОЕ ПЛЕЧО: доехал ли ОТВЕТ до документов, которые его ждали
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 ЗАЧЕМ ЭТО ЕСТЬ. Страж родился, стерегущим одно плечо контура: «вопрос лежит в правильном
 * месте». Второе плечо — «ответ доехал до документа, который на нём стоял» — не стерёг никто, и
 * это не мелочь, а дыра в самом KAIF: его же принцип 3 требует, чтобы конвенция была накрыта
 * стражем, а `/interview` шаг 5 («обнови релевантные файлы в plans/») оставался прозой, которую
 * судит уставшая сессия в конце дня.
 *
 * ЦЕНА, УПЛАЧЕННАЯ ПОЛЕМ. Ответ владельца Р5 интервью №010 (2026-08-01) не доехал до `plans/24`.
 * Документ два дня носил вопрос как открытый и держал риск «флип корня», которого при этом ответе
 * не существует. Свежая сессия 2026-08-03, прошедшая полный `/resume`, СОБИРАЛАСЬ спросить то же
 * самое заново — остановило только то, что владелец читал чат. Его слова: «странно, что это не
 * записано! Меня агент спрашивал, я ему отвечал на это!»
 *
 * ПОЧЕМУ ЕДИНИЦА — ВОПРОС, А НЕ ИНТЕРВЬЮ. Замер по трём проектам KAIF (NDim, KLAS, Unliminium):
 * интервью-сирот, на которые не ссылается никто, — НОЛЬ. А ответов без единой ссылки — 124 из 227
 * (55 %). Разносится не интервью, а конкретный ответ: `interview_010` цитировался 12 раз, и это
 * ничего не говорило про Р5.
 *
 * ЧЕГО СТРАЖ НЕ ДОКАЗЫВАЕТ. Ноль ссылок ≠ «ответ потерян»: его могли впитать без цитаты. Стражу
 * важна ПРОСЛЕЖИВАЕМОСТЬ — без неё впитывание не может проверить никто, и ровно так Р5 и
 * проскользнул.
 */
const PROPAGATION_BASELINE = join(ROOT, 'tools', 'propagation-baseline.json');

/** Ищем «№NNN» и код вопроса РЯДОМ — цитата ответа выглядит как «интервью №010, Р5 = В». */
const NEAR = 90;

function propagation(interviews) {
	// Корпус: всё, что НЕ интервью, включая STATUS.md и закрытые документы — ссылка есть ссылка.
	const corpus = [];
	for (const d of [...SCAN_DIRS, '.']) {
		for (const f of d === '.' ? [] : walkMd(join(ROOT, d))) corpus.push(f);
	}
	for (const name of readdirSync(ROOT)) {
		if (name.endsWith('.md') && statSync(join(ROOT, name)).isFile()) corpus.push(join(ROOT, name));
	}
	const texts = corpus.map((f) => readFileSync(f, 'utf8'));

	const orphans = [];
	let total = 0;

	for (const iv of interviews) {
		const num = basename(iv.file).match(/interview_(\d+)/)?.[1];
		if (!num) continue;
		const short = String(Number(num));
		for (const q of iv.questions) {
			if (!q.answered) continue;
			total += 1;
			// ⚠️ `\b` здесь бесполезен: для движка JS кириллическая «В» — НЕ буквенный знак, и
			// границы слова перед ней не возникает. Первая редакция прибора из-за этого показала
			// «не разнесено 100 %» — то есть меряла себя, а не проект.
			const rx = new RegExp(`(?<![А-Яа-яЁёA-Za-z0-9])${q.label}(?![0-9])`, 'gu');
			const cited = texts.some((t) => {
				for (const m of t.matchAll(rx)) {
					const near = t.slice(Math.max(0, m.index - NEAR), m.index + NEAR);
					if (
						near.includes(`№${num}`) || near.includes(`№ ${num}`) ||
						near.includes(`№${short}`) || near.includes(`interview_${num}`)
					) return true;
				}
				return false;
			});
			if (!cited) orphans.push(`№${num} ${q.label}`);
		}
	}

	// Базовая линия — тем же приёмом, что у половины 1: страж, красный с рождения, приучает себя
	// игнорировать. Краснеем только на НОВЫХ, унаследованное печатаем числом, которое обязано убывать.
	let baseline = [];
	if (existsSync(PROPAGATION_BASELINE)) {
		try {
			baseline = JSON.parse(readFileSync(PROPAGATION_BASELINE, 'utf8')).items ?? [];
		} catch {
			baseline = [];
		}
	} else {
		writeFileSync(
			PROPAGATION_BASELINE,
			JSON.stringify(
				{
					снято: new Date().toISOString().slice(0, 10),
					почему:
						'Унаследованные неразнесённые ответы на момент постройки стража обратного плеча. ' +
						'Страж краснеет только на НОВЫХ; это число обязано убывать.',
					items: orphans,
				},
				null,
				'\t',
			) + '\n',
			'utf8',
		);
		baseline = orphans;
	}

	const known = new Set(baseline);
	return {
		total,
		orphans,
		fresh: orphans.filter((o) => !known.has(o)),
		debt: orphans.filter((o) => known.has(o)),
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Проверка 4 — ПРОСРОЧЕННЫЙ ЗАМОК: блокада ссылается на ОТВЕЧЕННОЕ интервью
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Класс дефекта, ради которого проверка написана, и его цена (2026-08-15, `plans/50`).
 *
 * `MASTER_PLAN.md` держал строку «⛔ Волна заблокирована `interviews/interview_010` — 15 развилок,
 * которые агент решать не вправе». Владелец ответил на все пятнадцать 2026-08-01 — коммитом,
 * который так и назывался: «волна «Ворота» РАЗБЛОКИРОВАНА». Замок простоял ещё ДВЕ НЕДЕЛИ, и всё
 * это время фаза, помеченная в том же документе словами «ГЛАВНОЕ СЕЙЧАС», не двигалась. Соседняя
 * половина воронки (каталог, языковые адреса, семейство «ТЕСТ») росла, ворота не трогал никто.
 *
 * Заметить было НЕЧЕМ: «ждут владельца 0» и «⛔ заблокировано» — два разных отчёта, и сводил их
 * только тот, кто догадается посмотреть в оба. Теперь сводит машина.
 *
 * Это третий пойманный случай одного класса: `plans/28` ждал выката, который состоялся
 * одиннадцать дней назад; `plans/29` ждал портрета голоса, который уже лежал в
 * `AUTHOR_STYLOMETRY.md`. Пункт «ждём X» без дешёвой проверки «а не случилось ли X»
 * переживает собственное исполнение.
 *
 * 🔴 ГРАНИЦА, названная честно: проверка знает только про ИНТЕРВЬЮ — только про них машине
 * известно, отвечены они или нет. Второй замок того же дня («фаза 2 заблокирована
 * `researches/27`», а `researches/27` давно закрыт) она НЕ поймала бы. Класс проверкой не закрыт —
 * закрыт его самый дорогой представитель.
 */

/** Слова, которыми документ объявляет работу закрытой до чьего-то ответа. */
const LOCK_WORD =
	/⛔|заблокирован|блокиру[ею]|жд[ёеу]\p{L}*\s+ответ|до\s+ответа\s+владельца|не\s+начина\p{L}*\s+до/iu;

/** Ссылка на интервью В ТОЙ ЖЕ строке: `interview_010` либо «интервью №010». */
const LOCK_REF = /interview_(\d{1,3})|№\s?(\d{1,3})/gu;

/**
 * Явное исключение с ОБЯЗАТЕЛЬНОЙ причиной — тот же приём и тот же канон, что у половины 1.
 * Нужен там, где строка ЦИТИРУЕТ снятый замок как улику (разборы, планы починки, уроки).
 */
const LOCK_EXCUSE = /<!--\s*ЗАМОК-ОК:\s*(?<reason>[^>]*?)\s*-->/iu;

function staleLocks(interviews) {
	/** номер интервью без ведущих нулей → сколько его вопросов ещё без ответа */
	const openByNum = new Map();
	for (const iv of interviews) {
		const num = basename(iv.file).match(/interview_(\d+)/)?.[1];
		if (!num) continue;
		openByNum.set(String(Number(num)), iv.questions.filter((q) => !q.answered).length);
	}

	const files = [];
	for (const d of SCAN_DIRS) walkMd(join(ROOT, d), files);
	for (const name of readdirSync(ROOT)) {
		if (name.endsWith('.md') && statSync(join(ROOT, name)).isFile()) files.push(join(ROOT, name));
	}

	const hits = [];
	for (const file of files) {
		const rel = relative(ROOT, file).split(sep).join('/');
		// Летопись append-only: замок в ней — исторический факт, а не действующий статус.
		if (rel === 'PROJECT_HISTORY.md') continue;
		// Закрытый документ — тоже запись о прошлом: работа сделана, и её замки вместе с ней.
		// Тег `DONE` в имени ставится только по проверке (`AGENT_GUIDE.md` → «Беклог и DONE-тег»),
		// поэтому признак надёжен настолько же, насколько сам тег.
		if (basename(rel).includes('_DONE_')) continue;
		const lines = readFileSync(file, 'utf8').split(/\r?\n/);
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (!LOCK_WORD.test(line)) continue;
			if (LOCK_EXCUSE.test(line) || (i > 0 && LOCK_EXCUSE.test(lines[i - 1]))) continue;
			for (const m of line.matchAll(LOCK_REF)) {
				// Форма «№NNN» сама по себе двусмысленна (номер плана, бага, пачки), поэтому для неё
				// требуем слово «интервью» непосредственно перед ссылкой. Форма `interview_NNN`
				// однозначна и в подпорке не нуждается.
				if (m[2] && !/интервью/iu.test(line.slice(Math.max(0, m.index - 40), m.index))) continue;
				const num = String(Number(m[1] ?? m[2]));
				const open = openByNum.get(num);
				if (open === undefined || open > 0) continue; // интервью нет либо ещё ждёт — замок честный
				hits.push({ file: rel, line: i + 1, num, text: line.trim() });
				break;
			}
		}
	}
	return hits;
}

// ─────────────────────────────────────────────────────────────────────────────
// Половина 1 — вопросы вне interviews/
// ─────────────────────────────────────────────────────────────────────────────

/** Классифицирует ОДНУ строку. Возвращает id правила или null. */
export function classifyLine(line) {
	if (HEADING_QUEUE.test(line)) return 'заголовок-очереди';
	const m = ASK_ANYWHERE.exec(line);
	if (m) {
		const prefix = LINE_PREFIX.exec(line)?.[0].length ?? 0;
		if (m.index - prefix <= HEAD_WINDOW) return 'обращение-в-начале-строки';
	}
	return null;
}

/**
 * Находит нарушения в одном документе.
 * Возвращает {hits, pendings} — первое красит стража, второе только печатается.
 */
export function scanDoc(relPath, text) {
	const lines = text.split('\n');
	const hits = [];
	const pendings = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (PENDING.test(line)) pendings.push({ file: relPath, line: i + 1, text: line.trim() });

		const rule = classifyLine(line);
		if (!rule) continue;
		if (ROUTED.test(line)) continue; // вопрос уже показывает на своё место

		// Исключение действует на СВОЮ строку либо на строку, следующую за ним.
		const own = EXCUSE.exec(line);
		const aboveLine = i > 0 ? lines[i - 1] : '';
		const above = aboveLine.trim().startsWith('<!--') ? EXCUSE.exec(aboveLine) : null;
		const excuse = own ?? above;
		if (excuse) {
			// Маркер без причины сам является нарушением: иначе он станет способом заткнуть стража.
			if (!excuse.groups.reason)
				hits.push({ file: relPath, line: i + 1, rule: 'исключение-без-причины', text: line.trim() });
			continue;
		}
		hits.push({ file: relPath, line: i + 1, rule, text: line.trim() });
	}
	return { hits, pendings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Половина 2 — состояние интервью
// ─────────────────────────────────────────────────────────────────────────────
//
// Разбор интервью НЕ дублируется здесь: его ведёт `lib/review-core.mjs`, тот же, что рисует
// страницу вычитки. Две копии разбора разошлись бы молча, и страж со страницей начали бы считать
// открытыми разные вопросы — это ровно те грабли, из-за которых регламент требует одной
// реализации на весь контур.

/** Все документы интервью. */
export function interviewDocs() {
	return walkMd(join(ROOT, 'interviews'))
		.filter((f) => basename(f).startsWith('interview_'))
		.sort();
}

// ─────────────────────────────────────────────────────────────────────────────
// Отчёт
// ─────────────────────────────────────────────────────────────────────────────

/** Собирает полную картину: нарушения + неулаженные допущения + состояние интервью. */
export function collect() {
	const violations = [];
	const pendings = [];
	for (const f of docsInScope()) {
		const rel = relative(ROOT, f).split(sep).join('/');
		const r = scanDoc(rel, readMd(f));
		violations.push(...r.hits);
		pendings.push(...r.pendings);
	}
	const interviews = interviewDocs().map((f) =>
		parseInterview(relative(ROOT, f).split(sep).join('/'), readMd(f)),
	);
	const noStatus = interviews.filter((i) => !i.status);

	// Разделение на долг (унаследованное) и новые нарушения — единственное, что красит стража.
	const baseline = existsSync(BASELINE_FILE)
		? new Set(JSON.parse(readFileSync(BASELINE_FILE, 'utf8')).entries.map((e) => e.key))
		: new Set();
	const fresh = violations.filter((v) => !baseline.has(debtKey(v)));
	const debt = violations.filter((v) => baseline.has(debtKey(v)));

	return { violations, fresh, debt, baselineSize: baseline.size, pendings, interviews, noStatus };
}

/** Записывает текущие нарушения как базовую линию долга (осознанная разовая операция). */
function updateBaseline() {
	const { violations } = collect();
	const entries = violations.map((v) => ({
		key: debtKey(v),
		file: v.file,
		rule: v.rule,
		text: v.text.length > 160 ? v.text.slice(0, 160) + '…' : v.text,
	}));
	writeFileSync(
		BASELINE_FILE,
		JSON.stringify(
			{
				_комментарий:
					'Унаследованный долг «место вопросов». Страж краснеет только на НОВЫХ строках; ' +
					'этот список обязан УБЫВАТЬ. Строка выбывает, когда вопрос переехал в interviews/ ' +
					'или когда её текст изменился. Пополнять этот файл руками — значит обмануть себя.',
				снят: new Date().toISOString().slice(0, 10),
				entries,
			},
			null,
			'\t',
		) + '\n',
		'utf8',
	);
	console.log(`Базовая линия записана: ${entries.length} строк → ${relative(ROOT, BASELINE_FILE)}`);
}

/** Печатает список нарушений, сгруппированный по файлам. */
function printHits(hits) {
	let last = null;
	for (const v of hits) {
		if (v.file !== last) {
			console.log(`  ${v.file}`);
			last = v.file;
		}
		const cut = v.text.length > 100 ? v.text.slice(0, 100) + '…' : v.text;
		console.log(`    :${String(v.line).padEnd(4)} [${v.rule}]  ${cut}`);
	}
}

function main() {
	if (process.argv.includes('--update-baseline')) {
		updateBaseline();
		return 0;
	}
	const json = process.argv.includes('--json');
	const { fresh, debt, pendings, interviews, noStatus } = collect();
	const locks = staleLocks(interviews);

	if (json) {
		console.log(JSON.stringify({ fresh, debt, pendings, interviews, noStatus, locks }, null, 2));
		return fresh.length || noStatus.length || locks.length ? 1 : 0;
	}

	console.log('СТРАЖ МЕСТА ВОПРОСОВ — AGENT_GUIDE.md → «Место вопросов»\n');

	// ── Половина 1: НОВЫЕ нарушения — единственное, что красит стража
	if (fresh.length === 0) {
		console.log('✅ Новых вопросов владельцу вне interviews/ не появилось.');
	} else {
		console.log(`🔴 НОВЫЕ вопросы владельцу ВНЕ interviews/ — ${fresh.length}:\n`);
		printHits(fresh);
		console.log(
			'\n  Лечение: перенести вопрос в interviews/ (скилл /interview) — либо, если это НЕ вопрос,\n' +
				'  объявить исключение прямо в строке:  <!-- ВОПРОС-ОК: причина -->',
		);
	}

	// ── Унаследованный долг: не красит, но и не прячется
	if (debt.length) {
		console.log(`\n📉 УНАСЛЕДОВАННЫЙ ДОЛГ — ${debt.length} очередей вопросов вне interviews/.`);
		console.log('   Это число обязано убывать. Разбирается по одной, когда трогаешь документ.\n');
		printHits(debt);
	}

	// ── Половина 2: исполняемая команда «покажи ВСЕ неотвеченные интервью»
	console.log('\nСОСТОЯНИЕ ИНТЕРВЬЮ\n');
	let waiting = 0;
	for (const iv of interviews) {
		const open = iv.questions.filter((q) => !q.answered);
		if (iv.waiting) waiting++;
		const mark = !iv.status ? '🔴 БЕЗ СТАТУСА' : iv.waiting ? '🟡 ЖДЁТ ВЛАДЕЛЬЦА' : '✅';
		console.log(`  ${mark}  ${iv.file}  (вопросов: ${iv.questions.length})`);
		if (iv.waiting) {
			console.log(`        статус: ${iv.status}`);
			for (const q of open) console.log(`        ⛔ пустой ответ: ${q.title}`);
			// 🔑 РАСХОЖДЕНИЕ СТАТУСА С СОДЕРЖИМЫМ. Ровно на нём попался №007: ответы владельца
			// лежали в документе два дня, а статус кричал «ЖДЁТ ОТВЕТОВ». Симптом мягкий —
			// документ выглядит живым, — поэтому его надо называть вслух, а не оставлять глазам.
			if (open.length === 0 && iv.questions.length > 0) {
				console.log('        ⚠️ СТАТУС ПРОТУХ: ждущим числится, а пустых полей нет.');
				console.log('           Владелец ответил — обнови статус и разнеси решения.');
			}
		}
	}
	console.log(
		`\n  Итого: интервью ${interviews.length}, ждут владельца ${waiting}.` +
			'\n  Неотвеченное интервью — не нарушение, а очередь владельца.',
	);

	// ── Половина 3: ОБРАТНОЕ ПЛЕЧО — доехал ли ответ до документов, которые его ждали
	const back = propagation(interviews);
	console.log('\nРАЗНОС ОТВЕТОВ (обратное плечо контура)\n');
	console.log(
		`  Отвеченных вопросов ${back.total} · без единой ссылки вне interviews/ ` +
			`${back.orphans.length} (${back.total ? Math.round((back.orphans.length / back.total) * 100) : 0} %).`,
	);
	if (back.fresh.length) {
		console.log(`\n  🔴 НОВЫЕ НЕРАЗНЕСЁННЫЕ ОТВЕТЫ — ${back.fresh.length}:`);
		for (const o of back.fresh) console.log(`     ${o}`);
		console.log('     Ответ получен, а документ, который на нём стоял, о нём не знает.');
	}
	if (back.debt.length) {
		console.log(`\n  📉 Унаследованный долг разноса — ${back.debt.length}: ${back.debt.join(' · ')}`);
		console.log('     Число обязано убывать: разносишь ответ — цитируй «интервью №NNN, ВN».');
	}

	// ── Проверка 4: ПРОСРОЧЕННЫЙ ЗАМОК — блокада ссылается на отвеченное интервью
	console.log('\nПРОСРОЧЕННЫЕ ЗАМКИ (блокада пережила своё снятие)\n');
	if (locks.length === 0) {
		console.log('  ✅ Ни одна блокада не ссылается на полностью отвеченное интервью.');
	} else {
		console.log(`  🔴 ЗАМОК ПЕРЕЖИЛ СВОЁ СНЯТИЕ — ${locks.length}:\n`);
		for (const l of locks) {
			console.log(`     ${l.file}:${l.line}  → интервью №${l.num} отвечено ПОЛНОСТЬЮ`);
			console.log(`        ${l.text.slice(0, 150)}`);
		}
		console.log(
			'\n     Документ объявляет работу заблокированной, а блокиратор снят.\n' +
				'     Лечение: снять замок и разнести ответы — либо, если строка ЦИТИРУЕТ старый\n' +
				'     замок как улику, объявить исключение в строке:  <!-- ЗАМОК-ОК: причина -->',
		);
	}

	// ── Отчёт (не провал): неулаженные допущения фейбл-цикла
	if (pendings.length) {
		console.log(`\nНЕУЛАЖЕННЫЕ ДОПУЩЕНИЯ (PENDING:) — ${pendings.length}, к закрытию работы у`);
		console.log('каждого обязана быть судьба: подтверждено / опровергнуто / спрошено.\n');
		for (const p of pendings) console.log(`  ${p.file}:${p.line}`);
	}

	const failed = fresh.length + noStatus.length + back.fresh.length + locks.length;
	console.log(
		failed
			? `\n🔴 ПРОВАЛОВ: ${failed}`
			: `\n✅ ЧИСТО (долг: вопросов вне interviews/ ${debt.length} · неразнесённых ответов ${back.debt.length})`,
	);
	return failed ? 1 : 0;
}

// Запуск как программы (а не импорт из самотеста). Сравниваем РЕАЛЬНЫЕ пути: на Windows
// склейка `file://` + argv даёт разные строки для одного файла (диск, слэши, регистр).
import { resolve } from 'node:path';
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
	process.exit(main());
}

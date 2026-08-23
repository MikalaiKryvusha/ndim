/**
 * СТРАЖ ИМЕНИ «МЕНЕДЖЕР ИЗМЕРЕНИЙ».
 *
 * Слово владельца 2026-08-23, дословно: «*что за дурное слово "комната"? Комната - это в доме,
 * блять!!! У нас это МЕНЕДЖЕР ИЗМЕРЕНИЙ!!! Изменить везде! Линтер страж на термин Менеджер
 * Измерений!*»
 *
 * 🔑 ПОЧЕМУ СТРАЖ, А НЕ ЗАПИСЬ В КАНОНЕ. «Комната» — отсебятина агента: в продукте этого слова
 * нет ни на одной кнопке, ни в одном заголовке. Она расползлась по документам ровно потому, что
 * запрета не было — её никто не проверял. Тот же путь прошло «вычислитель» (`bugs/136`), и
 * лечение там оказалось не записью, а стражем. Порядок канона: убрать ловушку → страж → и только
 * потом запись (`AGENT_GUIDE.md` → «Журнал опыта»).
 *
 * ⚠️ ЧЕГО СТРАЖ НЕ ДЕЛАЕТ: он не запрещает слово «комната» вообще. В каталоге живут «Гарри Поттер
 * и Тайная комната» и «Четыре комнаты» — это НАЗВАНИЯ ПРОИЗВЕДЕНИЙ, чужой текст. Страж смотрит
 * только НАШ текст: документы, код, тексты продукта.
 *
 * Запуск: node tools/verify-dims-manager-name.mjs
 * Выход: 0 — чисто; 1 — найдено запрещённое слово.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/*
 * ⛔ Исключения. Каждое — с причиной; исключение без причины само является нарушением.
 */
const ALLOW = [
	{ test: /^src\/lib\/content\/dims-(build|slice)\.json$/, why: 'каталог измерений — чужие тексты, там есть «Тайная комната»' },
	{ test: /^candidates\/batches\//, why: 'карточки кандидатов — описания произведений' },
	{ test: /^researches\/34_/, why: 'выгрузка спроса — чужие данные' },
	{ test: /^PROJECT_HISTORY\.md$/, why: 'append-only хроника: прошлое не переписывается' },
	{ test: /^\.kaif\/backup-/, why: 'архивный слепок канона' },
	{ test: /^interviews\/decisions\//, why: 'ответы владельца дословно' },
	{ test: /^tools\/verify-dims-manager-name\.mjs$/, why: 'сам страж — называет запрещённое слово по долгу службы' },
];

/**
 * Запрещённое слово во всех падежах и числах.
 * 🔴 Границы слова заданы через `\p{L}`, а НЕ через `\b`: в JS `\b` определена по ASCII и рядом с
 * кириллицей молча не срабатывает — на этом уже сгорели два стража проекта (`bugs/192`, `bugs/193`).
 */
const FORBIDDEN = /(?<!\p{L})[Кк]омнат(?:а|ы|е|у|ой|ою|ам|ами|ах|)(?!\p{L})/gu;

/** Названия произведений — они законны и в нашем тексте, когда мы их цитируем. */
const TITLES = [/Тайная комната/i, /Четыре комнаты/i, /Комната желаний/i, /комната страха/i];

/** Маркер исключения по месту: `ИМЯ-ОК: причина`. Без причины маркер не действует. */
const MARKER = /ИМЯ-ОК:\s*\S+/;
const MARKER_LINES = 15;

const files = execSync('git ls-files', { encoding: 'utf8', maxBuffer: 1 << 28 })
	.split('\n')
	.filter(Boolean);

const allowed = (file) => ALLOW.find((a) => a.test.test(file));

let violations = 0;
let scanned = 0;
const skipped = new Map();

for (const file of files) {
	// Охват стража — это список расширений; тихо пропущенный файл выглядит как успех (`bugs/136`).
	if (!/\.(mjs|ts|svelte|md|json|yml|html|txt|rules|ps1|webmanifest|svg)$/.test(file)) continue;
	const skip = allowed(file);
	if (skip) {
		skipped.set(file, skip.why);
		continue;
	}
	let text;
	try {
		text = readFileSync(file, 'utf8');
	} catch {
		continue;
	}
	scanned += 1;
	// Разбиение учитывает CRLF: у проекта `core.autocrlf=true`.
	const lines = text.split(/\r?\n/);
	let markerUntil = -1;

	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		if (MARKER.test(line)) markerUntil = i + MARKER_LINES;
		if (i <= markerUntil) continue;
		if (TITLES.some((t) => t.test(line))) continue;
		const found = line.match(FORBIDDEN);
		if (!found) continue;
		violations += 1;
		console.log(`❌ ${file}:${i + 1}`);
		console.log(`   ${line.trim().slice(0, 160)}`);
		console.log(`   правильное имя: «Менеджер измерений» (слово владельца 2026-08-23)`);
	}
}

console.log(`\nпросмотрено файлов: ${scanned} · пропущено по исключениям: ${skipped.size}`);
if (violations > 0) {
	console.log(`\n❌ НАРУШЕНИЙ: ${violations}. «Комната» — отсебятина агента, в продукте её нет.`);
	console.log('   Если слово стоит ПО ДЕЛУ (название произведения, цитата), пометь место');
	console.log('   комментарием «ИМЯ-ОК: <причина>» — маркер без причины не действует.');
	process.exit(1);
}
console.log('✅ имя «Менеджер измерений» соблюдается: запрещённого слова нет.');

/**
 * СТРАЖ СОСТОЯНИЯ ДОКУМЕНТОВ `bugs/` — две проверки, оба признака ДОКАЗУЕМЫЕ.
 *
 * ПОЧЕМУ НЕ ДЕТЕКТОР «ФИКС В MAIN, А ДОКУМЕНТ НЕ ЗНАЕТ». Такой страж заказывался первым, и
 * замер перед постройкой его отменил (смена 9): кандидат «имя бага в коммите, менявшем код»
 * красит 62 документа из 97 при контроле 92 % на закрытых — «назван» не значит «вылечен»,
 * баг называют и когда его ЗАВОДЯТ. Сужение «плюс ссылка из журнала вердиктов» даёт 19, но
 * теряет половину эталонных случаев. И решающее: у ШЕСТИ из восьми заведомо вылеченных багов
 * машинного следа лечения в дереве НЕТ ВОВСЕ — ровно потому, что у шага закрытия не было
 * механизма (его дала `tools/close-bug.mjs`). Судить дерево пришлось бы догадкой, а догадка
 * в воротах — ложный красный на две трети корпуса.
 *
 * ПОЭТОМУ ЗДЕСЬ СУДЯТ ТОЛЬКО ТО, ЧТО ДОКАЗУЕМО БЕЗ ДЕРЕВА:
 *
 *   П1 — САМОПРОТИВОРЕЧИЕ. Шапка документа объявляет баг вылеченным БЕЗ оговорок
 *        (`✅` + ПОЧИНЕН/ЗАКРЫТ/ИСПРАВЛЕНО/DONE), а имя файла не несёт `_DONE_`.
 *        Документ спорит сам с собой — гадать не о чем.
 *        Замер до объявления: 14 из 97 открытых. Контроль обратной стороны: на закрытых
 *        признак срабатывает 76 из 122 (62 %) — значит он описывает «вылечен», а не шум.
 *        Ложные отсеяны замером, а не вкусом: `bugs/40` («🟡 ПУНКТ 2 ЗАКРЫТ… в бой НЕ
 *        выкачен — ждёт слова») НЕ красится, потому что оговорки исключены явно.
 *
 *   П2 — СИРОТА. Открытый документ, на который не ссылается НИ ОДИН живой документ.
 *        Входящей считается ссылка не из самого себя и НЕ из закрытого (`_DONE_`) документа:
 *        закрытый — это история, а не указатель, он никого к багу не приведёт (формулировка
 *        Менеджера, смена 9). Замер: 6 из 97.
 *        Цена класса оплачена полем: `bugs/171` пролежал открытым семь дней без единой
 *        входящей ссылки и пришёл к следующей сессии как «новая находка» — то есть был
 *        оплачен дважды.
 *
 *   П3 — САМОПРОТИВОРЕЧИЕ НАОБОРОТ. Имя файла несёт `_DONE_`, а шапка объявляет баг ОТКРЫТЫМ.
 *        Тот же спор документа с самим собой, только другой стороной, и он опаснее, чем кажется:
 *        читатель верит шапке и заводит «новый» баг поверх закрытого.
 *        Пойман на `bugs/78` при вычистке хвоста (смена 10). Замер ширины ДО объявления признака:
 *        таких документов было СЕМЬ — 75, 76, 77, 79, 82, 86, 87, и ВСЕ из одной волны `ideas/21`
 *        (июль). То есть это не семь описок, а след ОДНОГО захода: волну закрывали пачкой
 *        переименований, и шапки не догнали ни у одного. Все семь приведены к правде имени
 *        датированными поправками в тот же день; на момент постановки признака красных НОЛЬ.
 *        🔑 Правило взято сюда сразу, а не отложено: Менеджер назвал расширение несрочным, но
 *        «фикс без стража — фикс в кредит» (вердикт №8) — а семь одинаковых правок без стража
 *        гарантируют восьмую. Строка кода дешевле восьмого раза.
 *
 * 🔴 В ВОРОТА (`npm run guards`) ВПИСЫВАЕТСЯ ПЕРВЫМ ДЕЙСТВИЕМ ПОСЛЕ МЕРЖА, А НЕ РАНЬШЕ.
 * Условие Менеджера — «только при нуле красных» — ПРОВЕРЕНО и выполняется ровно на слитом
 * дереве, ни на одном из двух по отдельности (замер 2026-08-29, команды в конце шапки):
 *     ndim_integrator 57ab8db … 4 красных (все П2 — сироты, усыновление лежит в main)
 *     main            4f9b87b … 14 красных (все П1 — закрытие лежит в этой ветке)
 *     предпросмотр их мержа … 0 красных
 * Ветки лечат друг друга: поодиночке красны обе. Вписать строку раньше мержа значит отдать
 * команде красные ворота; забыть после мержа — оставить `EXP-0227` («страж без мержа — кредит»)
 * неоплаченным ровно тем способом, ради которого урок и записан.
 *
 * Запуск:   node tools/verify-bug-doc-state.mjs            # судит РАБОЧЕЕ ДЕРЕВО запустившего
 *           node tools/verify-bug-doc-state.mjs --tree <ref>   # любой контур, дерево не трогая
 *           node tools/verify-bug-doc-state.mjs --holders      # КТО держит каждый баг живым
 * Самотест: node tools/verify-bug-doc-state.mjs --selftest
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Строка статуса из шапки — первая `**Статус:**`, возможно за цитатным «> ». */
export function statusLine(text) {
	const m = text.match(/^>?\s*\*\*Статус:\*\*[^\n]*/m);
	return m ? m[0] : null;
}

/**
 * Объявляет ли шапка баг вылеченным БЕЗ оговорок.
 *
 * Оговорки перечислены явно и найдены замером, а не воображением: без них признак красил
 * `bugs/40`, где закрыт ОДИН ПУНКТ, а сам баг ждёт выката. Слово «пункт» в списке именно
 * поэтому — это не догадка, а имя пойманного ложного срабатывания.
 */
const CLOSED = /ПОЧИНЕН|ЗАКРЫТ|ИСПРАВЛЕН|DONE/i;
const HEDGE = /🟡|🔴|🔬|частичн|ждёт|ждет|пункт|НЕ выкачен|не закрыт|остал/i;
export function claimsFixed(line) {
	if (!line || !line.includes('✅')) return false;
	if (!CLOSED.test(line)) return false;
	return !HEDGE.test(line);
}

/** Номер документа по имени `bugs/NNN_...md`. `null` — имя не по канону. */
export function bugNumber(path) {
	const m = path.match(/^bugs\/([0-9]+)_/);
	return m ? m[1] : null;
}

export const isClosed = (path) => path.includes('_DONE_');

/**
 * Объявляет ли шапка баг ОТКРЫТЫМ. Признак П3, зеркало `claimsFixed`.
 *
 * Галочка перебивает слово: строка «✅ DONE … пункт 2 ОТКРЫТ» говорит о ЧАСТИ, а не о документе,
 * и красить её было бы тем же ложным срабатыванием, ради которого у `claimsFixed` заведён список
 * оговорок. Поэтому наличие `✅` снимает подозрение целиком.
 */
const OPEN = /ОТКРЫТ|OPEN/i;
export function claimsOpen(line) {
	if (!line || line.includes('✅')) return false;
	return OPEN.test(line);
}

/**
 * Есть ли у документа входящая ссылка из ЖИВОГО документа.
 *
 * Границу номера держит проверка «следом не цифра», а не граница слова: обратный слеш в
 * шаблонной строке однажды превратился в символ забоя и ослепил правило (`bugs/218`), и тот
 * же класс поймал сам себя на замере, из которого вырос этот страж (`EXP-NEW-черновой-прибор-
 * мимо-ворот`). Здесь регулярка собирается конкатенацией без единого обратного слеша.
 */
export function hasLiveIncoming(number, self, corpus) {
	const re = new RegExp('bugs?[/ ]?' + number + '(?![0-9])', 'i');
	for (const [path, text] of corpus) {
		if (path === self) continue;
		if (path.startsWith('bugs/') && isClosed(path)) continue;
		if (re.test(text)) return true;
	}
	return false;
}

/** Приговор по корпусу: список нарушений. Чистая функция — её и судит самотест. */
export function judgeCorpus(corpus) {
	const bugs = [...corpus.keys()].filter((p) => bugNumber(p) !== null);
	const open = bugs.filter((p) => !isClosed(p));
	const rows = [];
	for (const path of bugs.filter(isClosed)) {
		if (claimsOpen(statusLine(corpus.get(path)))) {
			rows.push({ path, rule: 'П3', why: 'имя файла несёт _DONE_, а шапка объявляет баг открытым' });
		}
	}
	for (const path of open) {
		const text = corpus.get(path);
		const n = bugNumber(path);
		if (claimsFixed(statusLine(text))) {
			rows.push({ path, rule: 'П1', why: 'шапка объявляет баг вылеченным, а имени _DONE_ нет' });
		}
		if (!hasLiveIncoming(n, path, corpus)) {
			rows.push({ path, rule: 'П2', why: 'ни один живой документ на него не ссылается — сирота' });
		}
	}
	return rows;
}

const CORPUS_FILES = /\.(md|mjs|js|ts|svelte|json|yml|yaml)$/;

function corpusFromGit() {
	const list = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
		.trim()
		.split('\n')
		.filter((f) => CORPUS_FILES.test(f));
	const corpus = new Map();
	for (const f of list) {
		try {
			corpus.set(f, readFileSync(f, 'utf8'));
		} catch {
			/* нечитаемое пропускаем: страж судит текст, а не права доступа */
		}
	}
	return corpus;
}

/**
 * Корпус ЛЮБОГО дерева git — `--tree <ref>`.
 *
 * ЗАЧЕМ. Страж судит рабочее дерево запустившего, поэтому его число без адреса дерева — слух,
 * а не число (`EXP-0226`). В командном режиме контуров шесть, и один и тот же документ бывает
 * сиротой в одной ветке и не сиротой в другой: замер 2026-08-29 дал `ndim_integrator` 4 красных
 * (все П2), `main` 14 красных (все П1) и НОЛЬ на предпросмотре их мержа — то есть ветки лечат
 * друг друга, а поодиночке обе красные. Без этой двери такое не увидишь, не сделав мерж.
 *
 * Годится и для предпросмотра мержа, не трогая рабочее дерево:
 *   git merge-tree --write-tree main <ветка>   # печатает oid слитого дерева
 *   node tools/verify-bug-doc-state.mjs --tree <oid>
 *
 * Содержимое берётся по oid-ам блобов через `git cat-file --batch`, а НЕ парой `ref:путь`:
 * Git Bash (MSYS) молча коверкает такие аргументы (`origin/main:путь` → `origin\main;путь`) и
 * даёт ложный ответ прибора вместо факта — класс пойман QA на замере ветки dev3-shift6.
 */
function corpusFromTree(ref) {
	const list = execFileSync('git', ['ls-tree', '-r', ref], { encoding: 'utf8', maxBuffer: 1 << 28 })
		.trim()
		.split('\n')
		.map((l) => {
			const [meta, path] = l.split('\t');
			const [, type, oid] = meta.split(/\s+/);
			return { type, oid, path };
		})
		.filter((e) => e.type === 'blob' && CORPUS_FILES.test(e.path));

	const out = spawnSync('git', ['cat-file', '--batch'], {
		input: list.map((e) => e.oid).join('\n') + '\n',
		maxBuffer: 1 << 30,
	}).stdout;

	const corpus = new Map();
	let pos = 0;
	for (const e of list) {
		const nl = out.indexOf(0x0a, pos);
		const size = Number(out.subarray(pos, nl).toString('utf8').split(' ')[2]);
		corpus.set(e.path, out.subarray(nl + 1, nl + 1 + size).toString('utf8'));
		pos = nl + 1 + size + 1;
	}
	return corpus;
}

/**
 * КТО ДЕРЖИТ каждый открытый баг живым — `--holders`. Не приговор, а перемер.
 *
 * Заведено потому, что «перемерить потом» без команды не делает никто (тот же класс, ради
 * которого появилась `close-bug.mjs`). Конкретный повод назван Менеджером заранее: после
 * ближайшей стрижки бонсая часть ссылок уедет из `STATUS.md` в летопись, и ноль сирот
 * перестанет быть нулём. Замер 2026-08-29 на предпросмотре мержа: ШЕСТЬ открытых документов
 * держатся ровно одной строкой `STATUS.md` и ничем больше — 168, 170, 182, 183, 191, 211.
 */
export function holdersOf(corpus) {
	const open = [...corpus.keys()].filter((p) => bugNumber(p) !== null && !isClosed(p));
	const map = new Map();
	for (const path of open) {
		const re = new RegExp('bugs?[/ ]?' + bugNumber(path) + '(?![0-9])', 'i');
		const who = [];
		for (const [p, t] of corpus) {
			if (p === path) continue;
			if (p.startsWith('bugs/') && isClosed(p)) continue;
			if (re.test(t)) who.push(p);
		}
		map.set(path, who);
	}
	return map;
}

function selftest() {
	const cases = [
		['П1 ловит самопротиворечие', () => {
			const c = new Map([['bugs/1_x.md', '**Статус:** ✅ ПОЧИНЕН 2026-01-01\nтело bugs/1 ссылка'], ['STATUS.md', 'см. bugs/1']]);
			return judgeCorpus(c).some((r) => r.rule === 'П1');
		}],
		['🔑 П1 НЕ красит частичное («пункт 2 закрыт, ждёт выката»)', () => {
			const c = new Map([['bugs/1_x.md', '**Статус:** 🟡 **ПУНКТ 2 ЗАКРЫТ** — в бой НЕ выкачен, ждёт слова'], ['STATUS.md', 'см. bugs/1']]);
			return !judgeCorpus(c).some((r) => r.rule === 'П1');
		}],
		['П1 не срабатывает без галочки', () => {
			const c = new Map([['bugs/1_x.md', '**Статус:** ПОЧИНЕН когда-нибудь'], ['STATUS.md', 'см. bugs/1']]);
			return !judgeCorpus(c).some((r) => r.rule === 'П1');
		}],
		['П2 ловит сироту', () => {
			const c = new Map([['bugs/2_y.md', '**Статус:** 🔴 OPEN'], ['STATUS.md', 'ничего про него']]);
			return judgeCorpus(c).some((r) => r.rule === 'П2');
		}],
		['🔑 П2 НЕ считает ссылку из ЗАКРЫТОГО документа', () => {
			const c = new Map([['bugs/2_y.md', '**Статус:** 🔴 OPEN'], ['bugs/9_DONE_z.md', 'см. bugs/2 — история']]);
			return judgeCorpus(c).some((r) => r.rule === 'П2');
		}],
		['П2 засчитывает ссылку из живого документа', () => {
			const c = new Map([['bugs/2_y.md', '**Статус:** 🔴 OPEN'], ['plans/7_p.md', 'разбор в bugs/2 подробно']]);
			return !judgeCorpus(c).some((r) => r.rule === 'П2');
		}],
		['П2 не считает входящей ссылку из самого себя', () => {
			const c = new Map([['bugs/2_y.md', '**Статус:** 🔴 OPEN — сам про bugs/2'], ['STATUS.md', 'пусто']]);
			return judgeCorpus(c).some((r) => r.rule === 'П2');
		}],
		['граница номера: bugs/2 не удовлетворяется словом bugs/20', () => {
			const c = new Map([['bugs/2_y.md', '**Статус:** 🔴 OPEN'], ['STATUS.md', 'речь про bugs/20 совсем']]);
			return judgeCorpus(c).some((r) => r.rule === 'П2');
		}],
		['закрытые документы не судятся правилами открытых', () => {
			const c = new Map([['bugs/3_DONE_z.md', '**Статус:** ✅ ПОЧИНЕН'], ['STATUS.md', 'пусто']]);
			return judgeCorpus(c).length === 0;
		}],
		['П3 ловит самопротиворечие наоборот: имя _DONE_, шапка «ОТКРЫТ»', () => {
			const c = new Map([['bugs/8_DONE_x.md', '**Статус:** 🔴 ОТКРЫТ · волна ideas/21'], ['STATUS.md', 'пусто']]);
			return judgeCorpus(c).some((r) => r.rule === 'П3');
		}],
		['🔑 П3 НЕ красит «✅ DONE … пункт 2 ОТКРЫТ» — галочка перебивает слово', () => {
			const c = new Map([['bugs/8_DONE_x.md', '**Статус:** ✅ DONE (2026-07-29), пункт 2 ОТКРЫТ отдельным документом']]);
			return !judgeCorpus(c).some((r) => r.rule === 'П3');
		}],
		['П3 не трогает ОТКРЫТЫЕ документы — там правит П1', () => {
			const c = new Map([['bugs/9_x.md', '**Статус:** 🔴 ОТКРЫТ'], ['STATUS.md', 'работа по bugs/9']]);
			return !judgeCorpus(c).some((r) => r.rule === 'П3');
		}],
		/*
		 * 🔑 КОНТРОЛЬ, БЕЗ КОТОРОГО НАБОР БЫЛ БЫ ЗЕЛЁНОЙ ШИРМОЙ: страж, который краснеет всегда,
		 * проходит все проверки выше. Здесь корпус ИСПРАВЕН, и приговор обязан быть пустым.
		 */
		['ПРОПУСК: исправный корпус даёт ноль нарушений', () => {
			const c = new Map([['bugs/4_ok.md', '**Статус:** 🔴 OPEN'], ['STATUS.md', 'работа идёт по bugs/4']]);
			return judgeCorpus(c).length === 0;
		}],
		['перемер: держатель назван поимённо', () => {
			const c = new Map([['bugs/4_ok.md', '**Статус:** 🔴 OPEN'], ['STATUS.md', 'работа идёт по bugs/4'], ['plans/1_p.md', 'пусто']]);
			const w = holdersOf(c).get('bugs/4_ok.md');
			return w.length === 1 && w[0] === 'STATUS.md';
		}],
		['перемер: у сироты держателей ноль, и он в перечне', () => {
			const c = new Map([['bugs/5_x.md', '**Статус:** 🔴 OPEN'], ['STATUS.md', 'ничего']]);
			const m = holdersOf(c);
			return m.size === 1 && m.get('bugs/5_x.md').length === 0;
		}],
		['перемер судит те же документы, что и приговор', () => {
			const c = new Map([['bugs/6_a.md', '**Статус:** 🔴 OPEN'], ['bugs/7_DONE_b.md', '**Статус:** ✅ ПОЧИНЕН'], ['STATUS.md', 'пусто']]);
			return holdersOf(c).size === 1 && holdersOf(c).has('bugs/6_a.md');
		}],
	];

	let bad = 0;
	for (const [label, run] of cases) {
		let ok = false;
		try {
			ok = Boolean(run());
		} catch {
			ok = false;
		}
		if (!ok) bad += 1;
		console.log(`  ${ok ? '✅' : '❌'} ${label}`);
	}
	console.log(`\nпроверок ${cases.length} · провалов ${bad}`);
	return bad === 0 ? 0 : 1;
}

function main(argv) {
	if (argv.includes('--selftest')) return selftest();

	const ti = argv.indexOf('--tree');
	const ref = ti !== -1 && argv[ti + 1] && !argv[ti + 1].startsWith('--') ? argv[ti + 1] : null;
	const corpus = ref ? corpusFromTree(ref) : corpusFromGit();
	const open = [...corpus.keys()].filter((p) => bugNumber(p) !== null && !isClosed(p));

	/* Контур называется ВСЕГДА: число без адреса дерева — слух, а не число (EXP-0226). */
	const contour = ref
		? `дерево ${ref}`
		: `рабочее дерево ${execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()}`;

	if (argv.includes('--holders')) {
		const map = holdersOf(corpus);
		console.log(`\n══ кто держит открытые bugs/ живыми ══  ${contour} · открытых ${open.length}`);
		for (const [path, who] of [...map].sort((a, b) => a[1].length - b[1].length)) {
			console.log(`   ${who.length === 0 ? '🔴 СИРОТА' : String(who.length).padStart(2)} ${path}`);
			if (who.length > 0 && who.length <= 3) console.log(`        ${who.join(' · ')}`);
		}
		const fragile = [...map].filter(([, w]) => w.length === 1 && w[0] === 'STATUS.md');
		console.log(
			`\n⚠️ держатся ЕДИНСТВЕННОЙ строкой STATUS.md: ${fragile.length} — они осиротеют, если` +
				'\n   стрижка бонсая унесёт строку, а летопись указателем не считается. Перемерить ПОСЛЕ стрижки.',
		);
		for (const [p] of fragile) console.log(`   ${p}`);
		return 0;
	}

	const rows = judgeCorpus(corpus);

	console.log(`\n══ состояние документов bugs/ ══  ${contour} · открытых ${open.length}`);
	if (rows.length === 0) {
		console.log('✅ рассогласований нет.');
		return 0;
	}
	const p1 = rows.filter((r) => r.rule === 'П1');
	const p2 = rows.filter((r) => r.rule === 'П2');
	const p3 = rows.filter((r) => r.rule === 'П3');
	console.log(`\n🔴 П1 самопротиворечие (шапка вылечен, имени _DONE_ нет): ${p1.length}`);
	for (const r of p1) console.log(`   ${r.path}`);
	console.log(`\n🔴 П2 сирота (ни одной ссылки из живого документа): ${p2.length}`);
	for (const r of p2) console.log(`   ${r.path}`);
	console.log(`\n🔴 П3 самопротиворечие наоборот (имя _DONE_, шапка «открыт»): ${p3.length}`);
	for (const r of p3) console.log(`   ${r.path}`);
	console.log(
		'\n   Лечение П1: `node tools/close-bug.mjs <NNN> --proof "<чем доказано>"` — либо снять' +
			'\n   из шапки утверждение о лечении, если оно преждевременно.' +
			'\n   Лечение П2: поставить ссылку из живого документа (STATUS, план, вердикт) — либо' +
			'\n   закрыть баг, если он уже не живой.',
	);
	return 1;
}

const запущенНапрямую =
	Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (запущенНапрямую) process.exitCode = main(process.argv.slice(2));

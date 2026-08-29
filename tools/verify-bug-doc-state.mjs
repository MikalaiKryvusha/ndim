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
 * Запуск:  node tools/verify-bug-doc-state.mjs   ·   самотест: --selftest
 */

import { execFileSync } from 'node:child_process';
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

function corpusFromGit() {
	const list = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
		.trim()
		.split('\n')
		.filter((f) => /\.(md|mjs|js|ts|svelte|json|yml|yaml)$/.test(f));
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
		['закрытые документы не судятся вовсе', () => {
			const c = new Map([['bugs/3_DONE_z.md', '**Статус:** ✅ ПОЧИНЕН'], ['STATUS.md', 'пусто']]);
			return judgeCorpus(c).length === 0;
		}],
		/*
		 * 🔑 КОНТРОЛЬ, БЕЗ КОТОРОГО НАБОР БЫЛ БЫ ЗЕЛЁНОЙ ШИРМОЙ: страж, который краснеет всегда,
		 * проходит все проверки выше. Здесь корпус ИСПРАВЕН, и приговор обязан быть пустым.
		 */
		['ПРОПУСК: исправный корпус даёт ноль нарушений', () => {
			const c = new Map([['bugs/4_ok.md', '**Статус:** 🔴 OPEN'], ['STATUS.md', 'работа идёт по bugs/4']]);
			return judgeCorpus(c).length === 0;
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

	const corpus = corpusFromGit();
	const open = [...corpus.keys()].filter((p) => bugNumber(p) !== null && !isClosed(p));
	const rows = judgeCorpus(corpus);

	console.log(`\n══ состояние документов bugs/ ══  открытых ${open.length}`);
	if (rows.length === 0) {
		console.log('✅ рассогласований нет.');
		return 0;
	}
	const p1 = rows.filter((r) => r.rule === 'П1');
	const p2 = rows.filter((r) => r.rule === 'П2');
	console.log(`\n🔴 П1 самопротиворечие (шапка вылечен, имени _DONE_ нет): ${p1.length}`);
	for (const r of p1) console.log(`   ${r.path}`);
	console.log(`\n🔴 П2 сирота (ни одной ссылки из живого документа): ${p2.length}`);
	for (const r of p2) console.log(`   ${r.path}`);
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

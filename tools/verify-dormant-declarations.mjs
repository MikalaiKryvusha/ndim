/**
 * СТРАЖ СПЯЩИХ ОБЪЯВЛЕНИЙ — объявлено и никем не читается.
 *
 * ПОВОД. Класс пойман полем дважды за две смены, и оба раза дорого:
 *   · блок витрины «Ни одной рекламы…» оказался МЁРТВЫМ экспортом — он никогда не рендерился,
 *     а развилка по его тексту готовилась владельцу (смена 9, решение №056: удалить целиком);
 *   · блок `dimsEmpty` в `profile/+page.svelte` («Здесь пока пусто.») объявлен и не читается
 *     никем — живые тексты пустых списков давно на экране «Измерения» (`bugs/211`, замер
 *     Менеджера, смена 10).
 * Общее у обоих: строка ЕСТЬ в дереве, поэтому её судят, обсуждают и носят владельцу — а
 * человеку она не показывалась ни разу. Мёртвый текст дороже мёртвого кода: он ворует внимание
 * ровно там, где внимание самое дорогое — на лице продукта.
 *
 * ДВЕ ПРОВЕРКИ, ОБЕ ЗАМЕРЕНЫ ДО ОБЪЯВЛЕНИЯ ПРИЗНАКА (дерево ndim_integrator, 2026-08-29):
 *
 *   П1 — СПЯЩИЙ ТЕКСТ. Ключ карты текстов (значение несёт `ru:` и `en:`), чьё имя не
 *        встречается НИ В ОДНОМ файле кода, кроме собственного объявления. Замер: 23 из 47
 *        экранов, все в четырёх файлах, и у каждого нашлась причина, а не случайность:
 *        16 ключей `del*` в `account/+page.svelte` — остаток после выноса удаления аккаунта в
 *        компонент `DeleteAccount.svelte` (тот же текст «Удаление аккаунта» живёт там, 21 ключ);
 *        6 ключей в `profile/+page.svelte` — остаток после переезда списка измерений на экран
 *        «Измерения»; `nextCycle` в `space/+page.svelte`. Контроль обратной стороны: живые
 *        ключи того же вида не красятся — `title` встречается в 56 файлах, `card` в 32.
 *
 *   П2 — СПЯЩИЙ ЭКСПОРТ. Экспорт `src/`, не читаемый ни одним файлом кода И не названный ни
 *        одним ЖИВЫМ документом. Вторая половина признака — НЕ украшение, она сузила его
 *        5 → 3 и сняла два ложных: `readFunnelDay` назван в `plans/76` (экран воронки ещё не
 *        подключён), `HTML_LANG` — в разведдоке аудита текстов. 🔑 Код, написанный ВПЕРЁД под
 *        живой план, — это не мертвечина, и страж, не умеющий их различать, учит команду
 *        удалять завтрашнюю работу. Закрытые (`_DONE_`) документы указателем не считаются —
 *        закрытый документ это история (тот же принцип, что в `verify-bug-doc-state.mjs`).
 *
 * ЧЕГО СТРАЖ НЕ СУДИТ, И ПОЧЕМУ ИМЕНА ПЕРЕЧИСЛЕНЫ ЯВНО. Имена контракта SvelteKit (`load`,
 * `prerender`, `csr`, `ssr`, `handle`, `actions`, `entries`, методы HTTP) читает ФРЕЙМВОРК, а не
 * наш код: ссылок на них нет по построению. Сегодня они не красятся случайно — каждое имя
 * встречается в нескольких маршрутах сразу; останься `prerender` в одном файле, страж покрасил
 * бы контракт фреймворка. Список исключает эту ловушку до того, как она сработала.
 *
 * ⚠️ НИ ОДНОГО ОБРАТНОГО СЛЕША в сравнении имён — сравниваются ТОКЕНЫ-идентификаторы, а не
 * подстроки. Первая редакция ЗАМЕРЩИКА этого стража получила от оболочки символ забоя вместо
 * границы слова (класс `bugs/218`) и покрасила 397 объявлений из 397. Токены заодно снимают и
 * подстрочные совпадения: `card` не удовлетворяется словом `delCard`.
 *
 * Запуск:   node tools/verify-dormant-declarations.mjs   ·   самотест: --selftest
 * Ворота:   `npm run guards` — с окна мержей смены 10 (правило «ноль красных на слитом дереве»:
 *           на дереве шага 3 даёт 0/0, а на каждой ветке по отдельности давал красные).
 * Код возврата: 0 — спящих объявлений нет · 1 — есть П0/П1/П2.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const IDENT = /[A-Za-z_$][A-Za-z0-9_$]*/g;
const IS_CODE = /[.](ts|js|mjs|svelte|html)$/;
const IS_DOC = /[.]md$/;
const IS_SRC_DECL = /^src[/].+[.](ts|svelte)$/;

/**
 * Имена, которые читает фреймворк, а не наш код. Список закрытый и обязан оставаться коротким:
 * каждое имя здесь — дыра в страже, оплаченная тем, что иначе он врёт.
 */
const FRAMEWORK = new Set([
	'load',
	'prerender',
	'csr',
	'ssr',
	'trailingSlash',
	'handle',
	'handleError',
	'handleFetch',
	'actions',
	'entries',
	'config',
	'match',
	'GET',
	'POST',
	'PUT',
	'PATCH',
	'DELETE',
	'HEAD',
	'OPTIONS',
	'snapshot',
]);

/** Множество идентификаторов файла. Токены, а не подстроки. */
export function identifiers(text) {
	const set = new Set();
	for (const m of String(text || '').matchAll(IDENT)) set.add(m[0]);
	return set;
}

/**
 * Имена, к которым в файле обращаются ПО ИНДЕКСУ — `labels[step]`, `T[lang]`.
 *
 * Такая карта читается вычисленным ключом, и статически доказать смерть её ключа НЕЛЬЗЯ: имя
 * ключа в коде не появляется вовсе. Замер поймал два таких семейства до объявления признака —
 * `satisfies Record<FunnelStep, …>` в панели воронки (`labels[step]`) и карта «язык первым»
 * `const T = { ru: {…}, en: {…} }` в `PublicBar.svelte` (`T[lang]`). Обе краснели ложно.
 * Молчать про такую карту честнее, чем требовать удалить работающий текст.
 */
export function indexedIdents(text) {
	const s = String(text || '');
	const out = new Set();
	for (const m of s.matchAll(IDENT)) {
		let i = m.index + m[0].length;
		while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i += 1;
		if (s[i] === '[') out.add(m[0]);
	}
	return out;
}

/**
 * Приговор по ОДНОМУ доводу опт-аута. `null` — довод годен и освобождает.
 * Отдельная чистая функция: судья ломала именно её, и ломать её должно быть удобно.
 */
export function judgeReason(reason) {
	if (reason.length < MIN_REASON) return 'довод короче двенадцати знаков — это отписка, а не причина';
	if (!ANCHOR.test(reason)) {
		return 'довод не называет НИ документа, НИ урока, НИ файла, НИ решения — его нечем проверить';
	}
	return null;
}

/** Сколько раз идентификатор встречается в тексте. */
export function countIdent(text, name) {
	let n = 0;
	for (const m of String(text || '').matchAll(IDENT)) if (m[0] === name) n += 1;
	return n;
}

/**
 * ОПТ-АУТ С ОБЯЗАТЕЛЬНОЙ ПРИЧИНОЙ — `// СПЯЩЕЕ НАМЕРЕННО: <причина>`.
 *
 * Заведён по замечанию З1 вердикта №17. Вычистка смены 10 была механически безупречна — читателя
 * у сорока двух ключей не было по построению языка, — но вместе с мёртвыми текстами уехал
 * комментарий, ПРЯМО ЗАПИСАВШИЙ НАМЕРЕНИЕ СОХРАНИТЬ спящее: «`acctSince` убран по слову владельца
 * (интервью №007 В10)… оставленный перевод — приглашение вернуть её обратно следующей сессии».
 * Намерение было записано человеческим языком, и машина прочла его как мертвечину.
 *
 * 🔑 Формулировка судьи, которая тут важнее механики: это ЗЕРКАЛО `EXP-0228`. Там отказ,
 * записанный в код с доводом, следующий агент прочёл как закрытый вопрос; здесь СОХРАНЕНИЕ,
 * записанное с доводом, машина прочла как мусор. Оба раза довод был, и оба раза его формат не
 * был машиночитаем. Опт-аут даёт намерению форму, которую видит прибор.
 *
 * ПРИЧИНА ОБЯЗАТЕЛЬНА, и это не формальность: маркер без причины — это «не трогай, потому что не
 * трогай», то есть вечное исключение без срока и без автора. Образец взят у соседа —
 * `LIVE_BY_NAME` в `verify-probe-mark.mjs` (форма предложена судьёй). Маркер без причины НЕ
 * освобождает: прибор краснеет отдельной строкой и требует дописать довод.
 */
const OPT_OUT = 'СПЯЩЕЕ НАМЕРЕННО:';
const MIN_REASON = 12;

/**
 * ДОВОД ОБЯЗАН НА ЧТО-ТО УКАЗЫВАТЬ — якорь, а не длина.
 *
 * Третья дверь, найденная судьёй (вердикт №23): длины мало. Причина из ВОСЕМНАДЦАТИ ТОЧЕК
 * проходила порог `MIN_REASON` и освобождала мёртвый текст. Класс тот же, что судья нашла у
 * реестра стража импорта dev-1, — там довод «так надо» тоже был засчитан: **обязательность
 * довода механизирована, а весомость — нет**. Лечение то же, что Менеджер уже принял для dev-1.
 *
 * Якорь — ссылка на документ, урок, файл или решение: то, что следующий читатель может ОТКРЫТЬ
 * и проверить. «Так надо» и «..................» открыть нельзя, поэтому они не доводы.
 * Замер перед объявлением признака (замер судьи, повторён мной): опт-аутов в `src/` сегодня
 * НОЛЬ, значит ложных красных признак даёт 0 — он вводится в пустую комнату и никого не ломает.
 */
const ANCHOR =
	/(bugs|plans|ideas|researches|interviews|homeworks|reports|qa|tools|src)[/]|EXP-[0-9]|интервью|вердикт|решени|слов[а-я]* владельц|[.](ts|mjs|js|svelte|json|md)\b/i;

/**
 * Причина опт-аута для объявления в строке `i`: ищется в самой строке и в сплошном блоке
 * комментариев НАД ней. Возвращает `null` (маркера нет) либо строку причины (возможно пустую —
 * тогда прибор краснеет по-другому).
 */
export function optOutReason(lines, i) {
	const has = (s) => s.includes(OPT_OUT);
	if (has(lines[i])) return lines[i].slice(lines[i].indexOf(OPT_OUT) + OPT_OUT.length).trim();
	for (let j = i - 1; j >= 0; j -= 1) {
		const t = lines[j].trim();
		if (!(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))) break;
		if (has(t)) return t.slice(t.indexOf(OPT_OUT) + OPT_OUT.length).trim();
	}
	return null;
}

const DECL = /^[ \t]*export[ \t]+(?:async[ \t]+)?(?:const|let|var|function|class)[ \t]+([A-Za-z_$][A-Za-z0-9_$]*)/;

/** Экспорты модуля: [{ name, line }]. CRLF снимается — точка не матчит возврат каретки. */
export function declaredExports(text) {
	const out = [];
	const lines = String(text || '').split('\n');
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].replace(/\r$/, '').match(DECL);
		if (m && !FRAMEWORK.has(m[1])) out.push({ name: m[1], line: i + 1, optOut: optOutReason(lines, i) });
	}
	return out;
}

const KEY = /^[ \t]*([A-Za-z_$][A-Za-z0-9_$]*)[ \t]*:[ \t]*[{]/;
const HAS_RU = /[ {]ru[ \t]*:/;
const HAS_EN = /[ {]en[ \t]*:/;
const LOOKAHEAD = 14;

/**
 * Ключи карт текстов: `имя: {`, внутри которого есть и `ru:`, и `en:`. Заглядываем вперёд на
 * `LOOKAHEAD` строк — этого хватает и однострочной форме `none: { ru: '…', en: '…' }`, и
 * многострочной; обе живут в корпусе.
 */
/* Отступ допускается: карты компонентов живут внутри `<script>`, а не в нулевой колонке. */
const TOP_DECL = /^[ \t]*(export[ \t]+)?(?:const|let|var)[ \t]+([A-Za-z_$][A-Za-z0-9_$]*)/;

export function declaredTexts(text) {
	const out = [];
	const lines = String(text || '')
		.split('\n')
		.map((l) => l.replace(/\r$/, ''));
	let owner = null;
	let ownerExported = true; // до первого объявления считаем чужим — судить нечего
	/*
	 * Стек предков по отступу. Нужен потому, что индексируют обычно НЕ корень карты, а её ветку:
	 * `t.steps[step][lang]` в панели воронки. Пока предки не считались, страж требовал удалить
	 * шесть живых подписей шагов воронки — карту, объявленную как `satisfies Record<FunnelStep, …>`,
	 * то есть словарь по построению.
	 */
	let stack = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const top = line.match(TOP_DECL);
		if (top) {
			ownerExported = Boolean(top[1]);
			owner = top[2];
			stack = [];
		}
		const m = line.match(KEY);
		if (!m) continue;
		const indent = line.length - line.trimStart().length;
		while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
		const ancestors = stack.map((e) => e.name);
		const block = lines.slice(i, i + LOOKAHEAD).join(' ');
		if (HAS_RU.test(block) && HAS_EN.test(block)) {
			out.push({ name: m[1], line: i + 1, owner, ownerExported, ancestors, optOut: optOutReason(lines, i) });
		}
		stack.push({ indent, name: m[1] });
	}
	return out;
}

/**
 * Приговор по корпусу: список нарушений. Чистая функция — её и судит самотест, а не рабочий
 * путь с диском и git.
 */
export function judgeCorpus(corpus) {
	const paths = [...corpus.keys()];
	const code = paths.filter((p) => IS_CODE.test(p));
	const liveDocs = paths.filter((p) => IS_DOC.test(p) && !(p.startsWith('bugs/') && p.includes('_DONE_')));
	const idents = new Map(paths.map((p) => [p, identifiers(corpus.get(p))]));

	const usedInOtherCode = (name, own) => code.some((p) => p !== own && idents.get(p).has(name));
	const namedInLiveDoc = (name) => liveDocs.filter((p) => idents.get(p).has(name));

	const rows = [];
	for (const path of paths.filter((p) => IS_SRC_DECL.test(p))) {
		const text = corpus.get(path);

		/*
		 * 🔑 СУДЯТСЯ ТОЛЬКО МЕСТНЫЕ КАРТЫ — и это ДОКАЗАТЕЛЬСТВО, а не эвристика.
		 *
		 * Карта, объявленная без `export`, видна ровно одному файлу — своему. Значит её ключ,
		 * ни разу не упомянутый в этом файле, не может отрендериться НИКОМУ и НИКОГДА: читателя
		 * у него нет по построению языка, а не по нашему замеру. Отсюда и ноль ложных.
		 *
		 * Экспортированные карты (`landing-copy.ts` и родня) НЕ судятся: их читают по имени
		 * свойства из других файлов, а имена ключей там общие — `title`, `primary`, `anchor`.
		 * Замер это и показал: сравнение по токенам считало `gateCopyPhase4` живым из-за
		 * ЧУЖИХ `title` в 56 файлах, и одновременно требовало удалить `painLine` — три текста
		 * первого экрана, про которые в самом коде написано «отдельным экспортом, чтобы не
		 * ехать в бандл лендинга, пока их никто не рендерит». Признак, который в одной и той же
		 * карте half считает живым, а half мёртвым, не различает ничего — он снят.
		 */
		/* Фикстуры тестов — не лицо продукта: объект отдают функции целиком, по имени ключа не зовут. */
		if (!/[.]test[.]/.test(path)) {
			const indexed = indexedIdents(text);
			for (const { name, line, owner, ownerExported, ancestors, optOut } of declaredTexts(text)) {
				if (ownerExported) continue;
				// карту или её ветку читают вычисленным ключом — доказать смерть нельзя
				if (indexed.has(owner) || ancestors.some((a) => indexed.has(a))) continue;
				if (countIdent(text, name) > 1) continue;
				if (optOut !== null) {
					const bad = judgeReason(optOut);
					if (bad === null) continue; // намерение объявлено с проверяемым доводом
					rows.push({ path, line, name, rule: 'П0', why: `маркер «СПЯЩЕЕ НАМЕРЕННО»: ${bad}` });
					continue;
				}
				rows.push({ path, line, name, rule: 'П1', why: 'текст объявлен в местной карте и не читается даже своим файлом' });
			}
		}

		for (const { name, line, optOut } of declaredExports(text)) {
			if (countIdent(text, name) > 1 || usedInOtherCode(name, path)) continue;
			const planned = namedInLiveDoc(name);
			if (planned.length > 0) continue; // код под живой план — не мертвечина
			if (optOut !== null) {
				const bad = judgeReason(optOut);
				if (bad === null) continue;
				rows.push({ path, line, name, rule: 'П0', why: `маркер «СПЯЩЕЕ НАМЕРЕННО»: ${bad}` });
				continue;
			}
			rows.push({ path, line, name, rule: 'П2', why: 'экспорт не читается кодом и не назван ни одним живым документом' });
		}
	}
	return rows;
}

function corpusFromGit() {
	const list = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
		.trim()
		.split('\n')
		.filter((f) => IS_CODE.test(f) || IS_DOC.test(f));
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
		['П1 ловит спящий текст', () => {
			const c = new Map([
				['src/routes/a/+page.svelte', 'const t = {\n  alive: { ru: 1, en: 2 },\n  dead: { ru: 3, en: 4 },\n};'],
				['src/routes/b/+page.svelte', 'читаем t.alive'],
			]);
			return judgeCorpus(c).some((r) => r.rule === 'П1' && r.name === 'dead');
		}],
		/*
		 * Обратная сторона доказательства: раз карта местная, чужой файл её прочитать НЕ МОЖЕТ,
		 * и случайное совпадение имени в соседнем модуле не должно спасать мёртвый ключ. Именно
		 * на этом ломался прежний признак по токенам — чужие `title` в 56 файлах делали живым
		 * то, что не рендерилось никогда.
		 */
		['🔑 П1 не спасает ключ случайным совпадением имени в ЧУЖОМ файле', () => {
			const c = new Map([
				['src/routes/a/+page.svelte', 'const t = {\n  alive: { ru: 1, en: 2 },\n  dead: { ru: 3, en: 4 },\n};\nconst s = t.alive;'],
				['src/lib/x.ts', 'export const dead = 1;'],
			]);
			return judgeCorpus(c).some((r) => r.rule === 'П1' && r.name === 'dead');
		}],
		['🔑 П1 НЕ красит текст, читаемый в СВОЁМ же файле', () => {
			const c = new Map([['src/routes/a/+page.svelte', 'const t = {\n  alive: { ru: 1, en: 2 },\n};\nconst s = t.alive;']]);
			return !judgeCorpus(c).some((r) => r.rule === 'П1');
		}],
		['🔑 П1 НЕ судит ЭКСПОРТИРОВАННУЮ карту — её читают по имени свойства извне', () => {
			const c = new Map([
				['src/lib/content/landing-copy.ts', 'export const ahead = {\n  one: { ru: 1, en: 2 },\n  two: { ru: 3, en: 4 },\n};'],
				['src/routes/a/+page.svelte', 'ничего про них'],
			]);
			return judgeCorpus(c).filter((r) => r.rule === 'П1').length === 0;
		}],
		['🔑 П1 КРАСИТ ключ местной карты, у которого сосед жив (остаток)', () => {
			const c = new Map([
				['src/routes/a/+page.svelte', 'const t = {\n  alive: { ru: 1, en: 2 },\n  leftover: { ru: 3, en: 4 },\n};\nconst s = t.alive;'],
			]);
			const p1 = judgeCorpus(c).filter((r) => r.rule === 'П1');
			return p1.length === 1 && p1[0].name === 'leftover';
		}],
		/*
		 * ОПТ-АУТ. Замечание З1 вердикта №17: намерение сохранить спящее было записано словами и
		 * прочитано машиной как мусор. Проверяется ОБЕ стороны — что маркер освобождает и что
		 * маркер БЕЗ ДОВОДА не освобождает: иначе он выродится в «не трогай, потому что не трогай».
		 */
		['🔑 опт-аут с причиной освобождает ключ', () => {
			const c = new Map([
				['src/routes/a/+page.svelte', 'const t = {\n  alive: { ru: 1, en: 2 },\n  // СПЯЩЕЕ НАМЕРЕННО: перевод оставлен под возврат строки по слову владельца\n  kept: { ru: 3, en: 4 },\n};\nconst s = t.alive;'],
			]);
			return judgeCorpus(c).length === 0;
		}],
		['🔑 опт-аут БЕЗ причины НЕ освобождает — краснеет отдельным правилом П0', () => {
			const c = new Map([
				['src/routes/a/+page.svelte', 'const t = {\n  alive: { ru: 1, en: 2 },\n  // СПЯЩЕЕ НАМЕРЕННО:\n  kept: { ru: 3, en: 4 },\n};\nconst s = t.alive;'],
			]);
			const r = judgeCorpus(c);
			return r.length === 1 && r[0].rule === 'П0' && r[0].name === 'kept';
		}],
		/*
		 * ТРЕТЬЯ ДВЕРЬ, найденная судьёй (вердикт №23): порог проверял ДЛИНУ, а не содержание, и
		 * восемнадцать точек освобождали мёртвый текст. Теперь довод обязан НАЗЫВАТЬ проверяемое.
		 */
		['🔴 ТРЕТЬЯ ДВЕРЬ: восемнадцать точек больше не довод', () =>
			judgeReason('..................') !== null],
		['«так надо» не довод — тот же класс, что у соседа (вердикт №18)', () =>
			judgeReason('так надо, потом разберёмся') !== null],
		['довод со ссылкой на документ годен', () => judgeReason('ждёт решения по bugs/211') === null],
		['довод со ссылкой на урок годен', () => judgeReason('подключается по EXP-0227') === null],
		['довод со словом владельца годен', () => judgeReason('оставлено по слову владельца, интервью №007') === null],
		['короткий довод отбивается ДРУГИМ сообщением, чем беспредметный', () =>
			judgeReason('bugs/1').includes('короче') && judgeReason('совершенно непонятная отписка').includes('не называет')],
		['опт-аут работает и на экспорте (П2)', () => {
			const c = new Map([['src/lib/x.ts', '// СПЯЩЕЕ НАМЕРЕННО: подключается фазой 2 эпика plans/74, читателя ещё нет\nexport function later() {}']]);
			return judgeCorpus(c).length === 0;
		}],
		['опт-аут виден и в хвосте самой строки', () =>
			optOutReason(['const q = 1; // СПЯЩЕЕ НАМЕРЕННО: довод внутри строки'], 0) === 'довод внутри строки'],
		['опт-аут НЕ подхватывается через пустую строку (чужой комментарий не освобождает)', () =>
			optOutReason(['// СПЯЩЕЕ НАМЕРЕННО: чужой довод', '', '  dead: {'], 2) === null],
		['П1 не считает картой объект без ru/en', () => {
			const c = new Map([['src/routes/a/+page.svelte', 'const t = {\n  plain: { size: 1 },\n};']]);
			return !judgeCorpus(c).some((r) => r.rule === 'П1');
		}],
		['П2 ловит спящий экспорт', () => {
			const c = new Map([['src/lib/x.ts', 'export function sleeper() {}'], ['src/lib/y.ts', 'пусто']]);
			return judgeCorpus(c).some((r) => r.rule === 'П2' && r.name === 'sleeper');
		}],
		['🔑 П2 НЕ красит код под ЖИВОЙ план', () => {
			const c = new Map([['src/lib/x.ts', 'export function planned() {}'], ['plans/76_p.md', 'шаг 3 — подключить planned']]);
			return !judgeCorpus(c).some((r) => r.rule === 'П2');
		}],
		['🔑 П2 краснеет, если имя названо только ЗАКРЫТЫМ документом (история, не указатель)', () => {
			const c = new Map([['src/lib/x.ts', 'export function tail() {}'], ['bugs/78_DONE_z.md', 'удалить импорт tail']]);
			return judgeCorpus(c).some((r) => r.rule === 'П2' && r.name === 'tail');
		}],
		['🔑 П2 НЕ красит имена контракта SvelteKit', () => {
			const c = new Map([['src/routes/a/+page.ts', 'export const prerender = true;']]);
			return !judgeCorpus(c).some((r) => r.rule === 'П2');
		}],
		['токен, а не подстрока: card не удовлетворяется словом delCard', () => {
			const c = new Map([
				['src/routes/a/+page.svelte', 'const t = {\n  alive: { ru: 1, en: 2 },\n  card: { ru: 3, en: 4 },\n};'],
				['src/routes/b/+page.svelte', 'читаем t.alive, а ещё есть delCard'],
			]);
			return judgeCorpus(c).some((r) => r.name === 'card');
		}],
		['CRLF судится так же, как LF (EXP-0047)', () => {
			const c = new Map([
				['src/routes/a/+page.svelte', 'const t = {\r\n  alive: { ru: 1, en: 2 },\r\n  dead: { ru: 3, en: 4 },\r\n};\r\n'],
				['src/routes/b/+page.svelte', 'читаем t.alive'],
			]);
			return judgeCorpus(c).some((r) => r.rule === 'П1' && r.name === 'dead');
		}],
		['нарушение несёт номер строки', () => {
			const c = new Map([
				['src/routes/a/+page.svelte', 'const t = {\n  alive: { ru: 1, en: 2 },\n  dead: { ru: 3, en: 4 },\n};\nconst s = t.alive;'],
			]);
			const p1 = judgeCorpus(c).filter((r) => r.rule === 'П1');
			return p1.length === 1 && p1[0].line === 3;
		}],
		/*
		 * 🔑 КОНТРОЛЬ, БЕЗ КОТОРОГО НАБОР БЫЛ БЫ ЗЕЛЁНОЙ ШИРМОЙ: страж, который краснеет всегда,
		 * проходит все проверки выше. Здесь корпус ИСПРАВЕН, и приговор обязан быть пустым.
		 */
		['ПРОПУСК: исправный корпус даёт ноль нарушений', () => {
			const c = new Map([
				['src/lib/x.ts', 'export const alive = 1;'],
				['src/routes/a/+page.svelte', 'import { alive } from "$lib/x";\nconst t = {\n  used: { ru: 1, en: 2 },\n};\nconst s = t.used;'],
			]);
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
	const rows = judgeCorpus(corpus);
	const contour = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
	const screens = [...corpus.keys()].filter((p) => IS_SRC_DECL.test(p)).length;

	console.log(`\n══ спящие объявления ══  рабочее дерево ${contour} · осмотрено модулей src/ ${screens}`);
	if (rows.length === 0) {
		console.log('✅ спящих объявлений нет.');
		return 0;
	}
	const p0 = rows.filter((r) => r.rule === 'П0');
	const p1 = rows.filter((r) => r.rule === 'П1');
	const p2 = rows.filter((r) => r.rule === 'П2');
	if (p0.length) {
		console.log(`\n🔴 П0 маркер «СПЯЩЕЕ НАМЕРЕННО» без внятной причины: ${p0.length}`);
		for (const r of p0) console.log(`   ${r.path}:${r.line}  ${r.name}`);
	}
	console.log(`\n🔴 П1 спящий текст (объявлен, не читается ни одним файлом кода): ${p1.length}`);
	for (const r of p1) console.log(`   ${r.path}:${r.line}  ${r.name}`);
	console.log(`\n🔴 П2 спящий экспорт (не читается кодом и не назван живым документом): ${p2.length}`);
	for (const r of p2) console.log(`   ${r.path}:${r.line}  ${r.name}`);
	console.log(
		'\n   Лечение: удалить объявление — оно ничего не показывает и никем не зовётся.' +
			'\n   Если это код ВПЕРЁД под план — назови его в живом плане, и П2 замолчит по праву,' +
			'\n   а не по исключению: план и есть доказательство, что у кода будет читатель.',
	);
	return 1;
}

const запущенНапрямую =
	Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (запущенНапрямую) process.exitCode = main(process.argv.slice(2));

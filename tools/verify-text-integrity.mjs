/**
 * СТРАЖ ЦЕЛОСТНОСТИ ТЕКСТА — в отслеживаемых файлах нет маркеров конфликта и нет UTF-8 BOM.
 *
 * ── ЗАЧЕМ ЭТОТ СТРАЖ СУЩЕСТВУЕТ, И ПОЧЕМУ ИМЕННО ЭТИ ДВЕ ПРОВЕРКИ ─────────────────────────
 * Обе порчи приехали в `main` 2026-08-28 ОДНИМ днём и разными руками, и ни одни ворота их не
 * увидели: юниты, `check`, `typecheck` и `guards` были зелёными, потому что судят КОД, а не
 * целостность текста.
 *   · `EXPERIENCE.md:202` нёс забытый маркер `>` × 7 после разрешения конфликта мержа. Файл этот
 *     грепает каждая сессия перед задачей, и строка читается как часть записи;
 *   · тот же файл и `qa/team-verdicts.md` получили UTF-8 BOM от `Set-Content` без `-Encoding
 *     utf8` — причуда PowerShell 5.1, стоящая прямо в досье окружения (`AGENT_GUIDE.md`). BOM
 *     ломает точные сравнения первой строки: судья на нём уже споткнулся при сверке мержа.
 * Дефект прошёл ворота ДВАЖДЫ — значит лечение первого сорта — страж, а не запись в журнале
 * (`AGENT_GUIDE.md` → «Журнал опыта»: убрать ловушку → страж → и только потом запись).
 *
 * ── 🔴 ШИРИНА ПРАВИЛА ЗАМЕРЕНА ДО ОБЪЯВЛЕНИЯ, А НЕ ПОСЛЕ ─────────────────────────────────
 * Урок этой же смены (dev-3, класс «`exit()` после `fetch`»): признак объявляется ПОСЛЕ замера
 * по живому корпусу, иначе правило красит красным исправное. Замер на `8cb4701`:
 *   · строк `=` × 7 в отслеживаемом тексте — **0**, поэтому строка-маркер судится безусловно и
 *     подчёркивание заголовка markdown под правило не попадает;
 *   · файлов с BOM — **17** (десять закрытых баг-доков, шесть страниц `+page.ts`, один прибор).
 *     Правило в лоб покрасило бы красным исправный корпус, поэтому BOM снят ТОЙ ЖЕ порцией —
 *     ловушка убрана, а не признак ослаблен. Диффы у всех семнадцати — ровно первые три байта.
 *
 * ── ГРАНИЦЫ, НАЗВАННЫЕ ЧЕСТНО ────────────────────────────────────────────────────────────
 * · ⛔ `.ps1` из проверки BOM ИСКЛЮЧЁН ИМЕНЕМ РАСШИРЕНИЯ: скрипты PowerShell с кириллицей
 *   обязаны быть UTF-8 **с BOM** — это канон проекта (`CLAUDE.md`), и страж, требующий обратного,
 *   был бы неверен. Исключение узкое и с причиной, молчаливого списка здесь нет (`EXP-0215`).
 * · Судятся только ОТСЛЕЖИВАЕМЫЕ файлы: неотслеживаемый черновик — дело автора, а не ворот.
 * · Пути берутся `git ls-files -z`: кириллические имена git иначе экранирует (`core.quotepath`),
 *   и десяток документов молча выпал бы из корпуса — тот самый тихий недосмотр, за которым
 *   охотится вопрос 3 «Лестницы трёх вопросов».
 *
 * Запуск:  node tools/verify-text-integrity.mjs   ·   самотест: --selftest
 * Ворота:  `npm run guards` (страж дешёвый — ни сети, ни стенда, ни сборки).
 * Код возврата: 0 — чисто · 1 — найдена порча.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Расширения, которые мы считаем текстом проекта. */
const TEXT = /\.(md|ts|mjs|js|svelte|json|html|rules|txt|yml|yaml|css)$/i;

/** Расширения, которым BOM положен по канону проекта. Причина — у каждой строки. */
const BOM_ALLOWED = new Map([
	['.ps1', 'скрипты PowerShell с кириллицей обязаны быть UTF-8 С BOM (CLAUDE.md)'],
]);

/**
 * Маркеры конфликта собираются ИЗ ЧАСТЕЙ намеренно.
 *
 * Иначе исходник самого стража нёс бы то, что страж запрещает, и первый же прогон обвинил бы
 * его самого — фикстуры в собственном корпусе, первая половина `EXP-0215`. Приём тот же, каким
 * юнит острова двери прячет от себя закрывающий тег script.
 */
const OPEN = '<'.repeat(7);
const MIDDLE = '='.repeat(7);
const CLOSE = '>'.repeat(7);

/**
 * Приговор одному тексту. Чистая функция: ни диска, ни git — её и гоняет самотест.
 *
 * @param {string} content текст файла
 * @param {string} name имя файла (нужно только для правила BOM)
 * @returns {{line: number, what: string}[]} находки, пустой массив — чисто
 */
export function judgeText(content, name = '') {
	const found = [];
	const ext = name.slice(name.lastIndexOf('.')).toLowerCase();

	if (content.charCodeAt(0) === 0xfeff && !BOM_ALLOWED.has(ext)) {
		found.push({ line: 1, what: 'UTF-8 BOM в начале файла' });
	}

	const lines = content.split(/\r?\n/);
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i].replace(/^﻿/, '');
		if (line.startsWith(OPEN) || line.startsWith(CLOSE) || line === MIDDLE) {
			found.push({ line: i + 1, what: `маркер конфликта: ${line.slice(0, 40)}` });
		}
	}
	return found;
}

/** Отслеживаемые текстовые файлы. `-z` — потому что кириллические имена git экранирует. */
function trackedTextFiles() {
	return execFileSync('git', ['ls-files', '-z'], { encoding: 'buffer' })
		.toString('utf8')
		.split('\0')
		.filter(Boolean)
		.filter((file) => TEXT.test(file) || BOM_ALLOWED.has(file.slice(file.lastIndexOf('.'))));
}

/** Самотест: страж обязан доказать, что умеет краснеть, прежде чем ему верить. */
function selftest() {
	const cases = [
		{ name: 'чистый текст', content: '# Заголовок\n\nтекст\n', file: 'a.md', expect: 0 },
		{ name: '🔴 маркер открытия конфликта', content: `${OPEN} HEAD\nтекст\n`, file: 'a.md', expect: 1 },
		{ name: '🔴 маркер закрытия конфликта', content: `текст\n${CLOSE} ndim_qa\n`, file: 'a.md', expect: 1 },
		{ name: '🔴 разделитель конфликта отдельной строкой', content: `а\n${MIDDLE}\nб\n`, file: 'a.md', expect: 1 },
		{ name: '🔴 UTF-8 BOM в начале', content: '﻿# Заголовок\n', file: 'a.md', expect: 1 },
		{ name: 'BOM в .ps1 законен — исключение с причиной', content: '﻿Write-Host "привет"\n', file: 'a.ps1', expect: 0 },
		{ name: 'подчёркивание заголовка markdown длиннее семи — не маркер', content: 'Заголовок\n=========\n', file: 'a.md', expect: 0 },
		{ name: 'знаки равенства внутри строки — не маркер', content: `const a = "${MIDDLE}";\n`, file: 'a.ts', expect: 0 },
		{ name: '🔴 три порчи в одном файле считаются все', content: `﻿${OPEN} HEAD\nа\n${MIDDLE}\nб\n`, file: 'a.md', expect: 3 },
	];

	let failed = 0;
	for (const item of cases) {
		const got = judgeText(item.content, item.file).length;
		const ok = got === item.expect;
		if (!ok) failed += 1;
		console.log(`  ${ok ? '✅' : '🔴'} ${item.name} — находок ${got}, ждали ${item.expect}`);
	}
	console.log(`\nСАМОТЕСТ: случаев ${cases.length}, провалов ${failed}`);
	return failed === 0 ? 0 : 1;
}

function main(argv) {
	if (argv.includes('--selftest')) {
		console.log('САМОТЕСТ СТРАЖА ЦЕЛОСТНОСТИ ТЕКСТА\n');
		return selftest();
	}

	const files = trackedTextFiles();
	const damaged = [];
	for (const file of files) {
		let content;
		try {
			content = readFileSync(file, 'utf8');
		} catch {
			continue; // файл удалён из дерева, но ещё в индексе — не наша забота
		}
		for (const hit of judgeText(content, file)) damaged.push({ file, ...hit });
	}

	// Число осмотренных печатается ВСЕГДА: «0 нарушений» и «0 наблюдений» выглядят одинаково.
	console.log(`ЦЕЛОСТНОСТЬ ТЕКСТА — осмотрено отслеживаемых файлов: ${files.length}`);

	if (damaged.length > 0) {
		console.error(`\n🔴 ПОРЧА ТЕКСТА — ${damaged.length}:`);
		for (const hit of damaged) console.error(`  ${hit.file}:${hit.line} — ${hit.what}`);
		console.error('\n   Маркер конфликта — недоведённое разрешение мержа: снимите строку.');
		console.error('   BOM — обычно Set-Content без -Encoding utf8 (PowerShell 5.1): перезапишите файл без BOM.');
		return 1;
	}
	console.log('✅ маркеров конфликта нет, BOM нет');
	return 0;
}

process.exitCode = main(process.argv.slice(2));

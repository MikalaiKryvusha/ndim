/**
 * QA-прогон КОНТУРА ВЫЧИТКИ ВЛАДЕЛЬЦА (`plans/27`) живым браузером — ворота сдачи проекта
 * (`plans/06`: «тесты зелёные» ≠ готово, путь человека прогоняется настоящим Chrome).
 *
 * Что сторожится и почему именно так:
 *
 *  1. СТРАНИЦА ЖИВА в обеих темах и на обеих ширинах. Проверяется не «страница открылась», а
 *     СВЯЗНОСТЬ разметки и стиля (EXP-0015: структурные проверки не ловят несвязанность) и
 *     контраст ПИКСЕЛЯМИ. Тёмное на тёмном — грабли №6 регламента: их поймал владелец, а не
 *     самопроверки, поэтому здесь считается светлота фона и текста, а не «класс на месте».
 *
 *  2. ОТВЕТ В ОДИН КЛИК доезжает до ТРЁХ мест (I2): исходный md · файл решения · архив с by/at.
 *     🔑 ПАРНАЯ ПРОВЕРКА (EXP-0070/0082): до клика прогон обязан доказать, что ответа НЕТ ни в
 *     одном из трёх мест. Без этой пары «ответ найден» красило бы зелёным любую предысторию.
 *
 *  3. ГЕЙТ FAIL-CLOSED (I4): без решения — отказ; после одобрения — пропуск; после ПОДМЕНЫ БАЙТА
 *     в теле — снова отказ, и отправщик отказывает даже под явным `--apply`.
 *
 *  4. ПЕРВОИСТОЧНИК ВЛАДЕЛЬЦА НЕПРИКОСНОВЕНЕН: повторный ответ на уже отвеченный вопрос не
 *     затирает прежний текст, а приезжает уточнением.
 *
 *  5. ЖИВОЙ ДОКУМЕНТ, а не фикстура (грабли №4 регламента: три дефекта рендерера всплыли только
 *     на настоящих файлах). Последний блок открывает НАСТОЯЩЕЕ интервью №010 и требует, чтобы
 *     открытый вопрос Р5 был на странице и помечен как ждущий.
 *
 * ⚠️ Прогон ПИШЕТ в `interviews/decisions/` и обязан за собой убрать (правило класса, bugs/103):
 * в конце стоит встроенная проверка «след убран», красная при отключённой уборке.
 *
 * Запуск: node tools/verify-owner-reviews.mjs        (стенд НЕ нужен — контур автономен)
 * Кадры:  test-results/owner-reviews/
 */

import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { textHash, decisionPath, ARCHIVE_DIR, selftest } from './lib/review-core.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'test-results', 'owner-reviews');
const FIX = join(OUT, 'fixture');
const DOC = join(FIX, 'interview_999_проба_контура.md');
const BODY = join(FIX, 'тело-тикета.md');
const PORT = 47311;

const CONFIGS = [
	{ theme: 'light', w: 430, h: 900 },
	{ theme: 'light', w: 1440, h: 900 },
	{ theme: 'dark', w: 430, h: 900 },
	{ theme: 'dark', w: 1440, h: 900 },
];

let passed = 0;
let failures = 0;
function check(name, ok, detail = '') {
	ok ? passed++ : failures++;
	console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Светлота цвета из строки `rgb(r, g, b)` — 0 (чёрный) … 1 (белый). */
function luma(css) {
	const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css || '');
	if (!m) return null;
	const [r, g, b] = m.slice(1, 4).map((n) => Number(n) / 255);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Запускает CLI проекта и возвращает {code, out}.
 *
 * ⚠️ ЖЁСТКИЙ СРОК ОБЯЗАТЕЛЕН. Без него команда, которая по замыслу не завершается (а такая в
 * контуре есть — `batch` держит сервер), вешает весь прогон намертво и оставляет осиротевшие
 * процессы на портах. Поймано на себе: четыре сироты и два прогона в никуда.
 */
function run(args, timeout = 60_000) {
	const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout });
	const out = (r.stdout || '') + (r.stderr || '');
	if (r.error?.code === 'ETIMEDOUT') return { code: 124, out: out + `\n[прогон убит по сроку ${timeout} мс]` };
	return { code: r.status, out };
}

// ─────────────────────────────────────────────────────────────────────────────
// Фикстура: документ с ОДНИМ открытым вопросом, ОДНИМ уже отвеченным и артефактом на отправку
// ─────────────────────────────────────────────────────────────────────────────

const ANSWER_TEXT = 'проверка контура — этого текста в документе до клика быть не должно';
const Q_COMMENT = 'пометка к одному вопросу — она обязана лечь рядом со СВОИМ вопросом';
const DOC_COMMENT = 'общий комментарий по документу целиком — его место в самом низу';

mkdirSync(FIX, { recursive: true });
writeFileSync(
	BODY,
	'Заголовок пробного тикета\n\nТело тикета для проверки гейта отправки. Кириллица здесь намеренно.\n',
	'utf8',
);
writeFileSync(
	DOC,
	[
		'```yaml',
		'title: Проба контура вычитки',
		'kind: outbound',
		'artifacts:',
		'  - {id: art1, target: "GitHub · demo/demo", format: github-issue, body_file: test-results/owner-reviews/fixture/тело-тикета.md}',
		'```',
		'',
		'# Проба контура вычитки',
		'',
		'> **Статус:** 🟡 ожидает ответов владельца',
		'',
		'| столбец | ещё столбец |',
		'|---|---|',
		'| таблица | обязана отрисоваться |',
		'',
		'### В1. Открытый вопрос — на него отвечает прогон?',
		'',
		'- **А) (рекомендуется)** первый вариант, он же рекомендация',
		'- **Б) второй вариант** с хвостом',
		'- **В) свой ответ** —',
		'',
		'**Ответ:**',
		'',
		'### В2. Уже отвеченный вопрос — его текст обязан уцелеть',
		'',
		'- **А)** вариант',
		'',
		'**Ответ:** ИСХОДНЫЙ ОТВЕТ ВЛАДЕЛЬЦА',
		'',
	].join('\n'),
	'utf8',
);

console.log('КОНТУР ВЫЧИТКИ ВЛАДЕЛЬЦА — QA-прогон\n');

// ── Блок 0. Самотест ядра (согласие нормализации, тихие часы, разбор, рендер)
console.log('— блок 0: самотест ядра —');
const coreFails = selftest();
check('самотест ядра чист', coreFails.length === 0, coreFails.join('; '));

// ── Блок 1. ПАРНАЯ ПРОВЕРКА до клика: ответа нет ни в одном из трёх мест
console.log('\n— блок 1: до клика (контроль прибора) —');
check('в документе ответа НЕТ', !readFileSync(DOC, 'utf8').includes(ANSWER_TEXT));
check('файла решения НЕТ', !existsSync(decisionPath(DOC)));
const archiveBefore = existsSync(ARCHIVE_DIR)
	? readdirSync(ARCHIVE_DIR).filter((f) => f.startsWith('interview_999')).length
	: 0;
check('в архиве записей по этому документу НЕТ', archiveBefore === 0);

// ── Блок 1б. Гейт ДО одобрения обязан отказать (fail-closed)
const gateBefore = run(['tools/review-gate.mjs', 'check', DOC, 'art1']);
check('гейт БЕЗ решения отказывает', gateBefore.code === 1, `код ${gateBefore.code}`);
check('гейт называет причину', /решения нет/.test(gateBefore.out), gateBefore.out.trim().slice(0, 80));

const sendBefore = run(['tools/send-outbound.mjs', DOC, 'art1', '--apply']);
check(
	'отправщик отказывает ДАЖЕ под --apply (I4)',
	sendBefore.code === 1 && /ОТКЛОНЕНА/.test(sendBefore.out),
	`код ${sendBefore.code}`,
);

// ── Блок 2. Страница живым браузером
console.log('\n— блок 2: страница живым браузером —');

const server = spawn(
	process.execPath,
	['tools/review.mjs', 'open', DOC, '--no-open', '--no-signal', '--port', String(PORT), '--by', 'Николай Кривуша'],
	{ cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
);
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));

const PAGE_URL = `http://127.0.0.1:${PORT}/`;
const up = await waitFor(async () => {
	try {
		const r = await fetch(PAGE_URL);
		return r.ok;
	} catch {
		return false;
	}
}, 15000);
// ⚠️ Первая редакция этой строки была ФИКТИВНОЙ: `… || true` красил её зелёным всегда, и когда
// сервер честно падал синтаксической ошибкой, прогон рапортовал «поднялся» и валился ниже
// невнятным ERR_CONNECTION_REFUSED. Проверка, которую нельзя провалить, — не проверка.
check('сервер поднялся и отвечает', up, serverLog.trim().split('\n').pop());
if (!up) {
	console.error('\n🔴 Сервер не поднялся. Вывод процесса:\n' + serverLog);
	process.exit(1);
}

const browser = await chromium.launch();

for (const cfg of CONFIGS) {
	const tag = `${cfg.theme}/${cfg.w}`;
	const ctx = await browser.newContext({
		viewport: { width: cfg.w, height: cfg.h },
		colorScheme: cfg.theme,
	});
	const page = await ctx.newPage();
	const errors = [];
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
	await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });

	check(`${tag} заголовок документа на месте`, (await page.locator('h1').first().innerText()).includes('Проба контура'));
	check(`${tag} карточек вопросов ровно 2`, (await page.locator('[data-q]').count()) === 2);
	check(`${tag} варианты ответа отрисованы`, (await page.locator('[data-q="В1"] .opt').count()) === 3);
	check(`${tag} таблица отрисована`, (await page.locator('table td').count()) >= 2);
	check(`${tag} артефакт отправки показан целиком`, (await page.locator('[data-art="art1"] pre').innerText()).includes('Тело тикета'));
	// ⚠️ Плашка .tag набрана text-transform: uppercase, а innerText отдаёт текст КАК ОТРИСОВАНО —
	// сверяем регистронезависимо (тот же капкан, что в verify-account.mjs).
	check(`${tag} отвеченный вопрос помечен «отвечено»`, (await page.locator('[data-q="В2"] .tag').innerText()).toLowerCase().includes('отвечено'));
	check(`${tag} прежний ответ владельца показан`, (await page.locator('[data-q="В2"]').innerText()).includes('ИСХОДНЫЙ ОТВЕТ'));

	// Грабли №6 — обе темы ПИКСЕЛЯМИ, а не по наличию класса.
	const colors = await page.evaluate(() => {
		const s = getComputedStyle(document.body);
		const card = document.querySelector('.q');
		return {
			bg: s.backgroundColor,
			ink: s.color,
			cardBg: getComputedStyle(card).backgroundColor,
			cardInk: getComputedStyle(card).color,
		};
	});
	const bg = luma(colors.bg);
	const ink = luma(colors.ink);
	const cardBg = luma(colors.cardBg);
	check(`${tag} контраст «текст ↔ фон» достаточен`, Math.abs(bg - ink) > 0.45, `${bg?.toFixed(2)} vs ${ink?.toFixed(2)}`);
	check(`${tag} карточка контрастна тексту`, Math.abs(cardBg - luma(colors.cardInk)) > 0.45);
	check(
		`${tag} тема «${cfg.theme}» реально применилась`,
		cfg.theme === 'dark' ? bg < 0.3 : bg > 0.7,
		`светлота фона ${bg?.toFixed(2)}`,
	);
	check(`${tag} страница не уезжает по горизонтали`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
	check(`${tag} консоль чиста`, errors.length === 0, errors[0]);

	await page.screenshot({ path: join(OUT, `page-${cfg.theme}-${cfg.w}.png`), fullPage: false });
	await ctx.close();
}

// ── Блок 3. Ответ в один клик → три места
console.log('\n— блок 3: ответ в один клик —');
{
	const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await ctx.newPage();
	await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });

	const optA = page.locator('[data-q="В1"] .opt', { hasText: 'А)' }).first();
	await optA.click();
	check('клик по варианту подсвечивает его', (await page.locator('[data-q="В1"] .opt.sel').count()) === 1);

	// Слово владельца 2026-08-01: «радиокнопку нельзя снять повторным кликом — должно сниматься».
	// Родная радиокнопка этого не умеет, поэтому поведение обязано стеречься: молчаливая регрессия
	// вернула бы вопрос, на который нельзя передумать.
	await optA.click();
	check('ПОВТОРНЫЙ клик снимает выбор', (await page.locator('[data-q="В1"] .opt.sel').count()) === 0);
	check(
		'снятый выбор снят и в самом поле',
		(await page.locator('[data-q="В1"] input[type=radio]:checked').count()) === 0,
	);
	// Третий клик обязан снова выбрать — иначе «снимается» превратилось бы в «не выбирается».
	await optA.click();
	check('третий клик снова выбирает', (await page.locator('[data-q="В1"] .opt.sel').count()) === 1);
	// Переключение на соседний вариант не должно оставлять два выбранных.
	await page.locator('[data-q="В1"] .opt', { hasText: 'Б)' }).first().click();
	check('выбор соседа гасит прежний', (await page.locator('[data-q="В1"] .opt.sel').count()) === 1);
	await optA.click();
	await page.locator('[data-q="В1"] [data-text]').fill(ANSWER_TEXT);
	await page.locator('[data-q="В2"] [data-text]').fill('уточнение поверх прежнего');

	// Комментарии: по каждому вопросу в отдельности И по документу целиком (слово владельца).
	await page.locator('[data-q="В1"] [data-comment]').fill(Q_COMMENT);
	check('поле общего комментария по документу есть', (await page.locator('#docComment').count()) === 1);
	await page.locator('#docComment').fill(DOC_COMMENT);

	await page.locator('#save').click();
	await page.waitForSelector('.note.ok', { timeout: 10000 });
	check('страница подтвердила запись', (await page.locator('.note.ok').innerText()).includes('Записано'));
	await page.screenshot({ path: join(OUT, 'after-save.png') });

	// Автозакрытие через 2 с (слово владельца). Браузер обычно НЕ даёт закрыть вкладку, которую
	// открыл не скрипт, — поэтому стережём наблюдаемое: через 3 с страница либо закрыта, либо
	// честно говорит об этом. Молчаливого «висит как было» быть не должно.
	await page.waitForTimeout(3000);
	const closed = page.isClosed();
	const fallback = closed ? '' : await page.locator('body').innerText().catch(() => '');
	check(
		'через 2 с вкладка закрыта ЛИБО честно просит закрыть',
		closed || /не дал закрыть вкладку|Записано/.test(fallback),
		closed ? 'закрылась сама' : 'осталась с честным сообщением',
	);
	await ctx.close();
}
await browser.close();

// Сервер обязан умереть сам: поднялся → записал → умер.
await waitFor(async () => server.exitCode !== null, 8000);
check('сервер умер сам после записи решения', server.exitCode === 0, `код ${server.exitCode}`);

const md = readFileSync(DOC, 'utf8');
check('МЕСТО 1 — ответ лёг в исходный md', md.includes(ANSWER_TEXT));
check('МЕСТО 1 — выбранная буква записана', /\*\*Ответ:\*\*\s*\*\*А\*\*/.test(md));
check('МЕСТО 1 — провенанс by/at проставлен', /owner-review: by="Николай Кривуша" at="\d{4}-/.test(md));
check('ПЕРВОИСТОЧНИК ЦЕЛ — прежний ответ владельца не затёрт', md.includes('**Ответ:** ИСХОДНЫЙ ОТВЕТ ВЛАДЕЛЬЦА'));
check('уточнение приехало отдельным полем', /Ответ \(уточнение \d{4}-\d{2}-\d{2}\)/.test(md));

check('пометка к вопросу легла рядом со СВОИМ вопросом', md.indexOf(Q_COMMENT) > md.indexOf('### В1'), '');
check(
	'общий комментарий стоит в САМОМ НИЗУ документа',
	md.includes(DOC_COMMENT) && md.indexOf(DOC_COMMENT) > md.lastIndexOf('### В2'),
);
check('у общего комментария свой заголовок с датой', /## 💬 Комментарий владельца — \d{4}-\d{2}-\d{2}/.test(md));

check('МЕСТО 2 — файл решения создан', existsSync(decisionPath(DOC)));
const decision = existsSync(decisionPath(DOC)) ? JSON.parse(readFileSync(decisionPath(DOC), 'utf8')) : {};
check('МЕСТО 2 — выбор записан машинно', decision.answers?.['В1']?.choice === 'А');
check('МЕСТО 2 — by записан', decision.by === 'Николай Кривуша');
check('МЕСТО 2 — at записан в ISO', /^\d{4}-\d{2}-\d{2}T/.test(decision.at || ''));
check(
	'МЕСТО 2 — имя файла ПРОИЗВОДНО от документа (I2)',
	decisionPath(DOC).endsWith('interview_999_проба_контура.decision.json'),
);

const archiveAfter = existsSync(ARCHIVE_DIR)
	? readdirSync(ARCHIVE_DIR).filter((f) => f.startsWith('interview_999')).length
	: 0;
check('МЕСТО 3 — копия легла в архив', archiveAfter === 1, `было ${archiveBefore}, стало ${archiveAfter}`);

// ── Блок 4. Гейт после одобрения и после дрейфа текста
console.log('\n— блок 4: гейт (I3, I4) —');
{
	// Одобрение артефакта пишем тем же путём, что и страница, — через ядро.
	const { writeDecision } = await import('./lib/review-core.mjs');
	writeDecision({
		docPath: DOC,
		kind: 'outbound',
		by: 'Николай Кривуша',
		at: new Date().toISOString(),
		artifacts: { art1: { status: 'approved', sha256: textHash(readFileSync(BODY, 'utf8')) } },
	});
	const okGate = run(['tools/review-gate.mjs', 'check', DOC, 'art1']);
	check('гейт ПОСЛЕ одобрения пропускает', okGate.code === 0, okGate.out.trim().split('\n')[0]);

	const dry = run(['tools/send-outbound.mjs', DOC, 'art1']);
	check('сухой прогон отправщика не отправляет', dry.code === 0 && /СУХОЙ ПРОГОН/.test(dry.out));

	// Дрейф текста: одобрение обязано аннулироваться (I3).
	const before = readFileSync(BODY, 'utf8');
	writeFileSync(BODY, before + 'дописанная строка после одобрения\n', 'utf8');
	const drift = run(['tools/review-gate.mjs', 'check', DOC, 'art1']);
	check('дрейф текста аннулирует одобрение', drift.code === 1 && /ИЗМЕНИЛСЯ/.test(drift.out));
	const driftSend = run(['tools/send-outbound.mjs', DOC, 'art1', '--apply']);
	check('отправщик при дрейфе отказывает под --apply', driftSend.code === 1);

	// Нормализация: возврат к исходному тексту с ДРУГИМИ переводами строк и BOM обязан снова
	// пройти — иначе гейт отказывал бы всегда, а это главные грабли регламента (№1).
	writeFileSync(BODY, '﻿' + before.replace(/\n/g, '\r\n') + '\n\n', 'utf8');
	const back = run(['tools/review-gate.mjs', 'check', DOC, 'art1']);
	check('CRLF + BOM + лишние пустые строки НЕ ломают одобрение', back.code === 0, back.out.trim().split('\n')[0]);
}

// ── Блок 5. Очередь для автономных циклов (I7)
console.log('\n— блок 5: накопление (I7) —');
{
	const q = run(['tools/review.mjs', 'queue', DOC]);
	check('документ встаёт в очередь', q.code === 0 && /В очередь|Уже в очереди/.test(q.out));
	// `--no-serve`: пачка собирается в файл и ВЫХОДИТ. Без него она поднимает сервер и не
	// завершается — синхронный вызов повис бы навсегда (см. комментарий у `run`).
	const batch = run(['tools/review.mjs', 'batch', '--no-open', '--no-signal', '--no-serve']);
	check('пачка собирается одной страницей', batch.code === 0 && /Пачка собрана|Очередь пуста/.test(batch.out), batch.out.trim().slice(0, 70));
	check('пачка не виснет (завершается сама)', batch.code !== 124);
}

// ── Блок 5б. Голос называет документ и его скоуп (решение владельца, интервью №011 В2)
console.log('\n— блок 5б: что произносит голос —');
{
	const { scopeOf } = await import('./review.mjs');
	const { parseMeta, readMd: rmd } = await import('./lib/review-core.mjs');
	const cases = [
		['interviews/interview_010_gates_forks.md', 'интервью'],
		['bugs/104_relation_card_expands_only_by_name.md', 'баг'],
		['plans/27_owner_reviews_contour.md', 'план'],
	];
	for (const [rel, kind] of cases) {
		const p = join(ROOT, rel);
		if (!existsSync(p)) {
			check(`скоуп: ${rel} существует`, false);
			continue;
		}
		const s = scopeOf(p, parseMeta(rmd(p)));
		check(`скоуп «${kind}» опознан по директории (${rel.split('/')[0]})`, s.kind === kind, s.kind);
		check(`название документа не пустое и без служебного префикса`, s.title.length > 3 && !/^№|^\d/.test(s.title), s.title.slice(0, 60));
	}
	// Ключевое: в речь не должно уезжать «Интервью №011 — Интервью…» — тип называется один раз.
	const iv = join(ROOT, 'interviews/interview_011_signal_voice.md');
	if (existsSync(iv)) {
		const s = scopeOf(iv, parseMeta(rmd(iv)));
		check('тип не дублируется в названии', !/^интервью/iu.test(s.title), s.title);
	}
}

// ── Блок 5в. НИ ОДИН ВАРИАНТ НЕ ПРОПАЛ — счётная проверка по ВСЕМ живым интервью
//
// 🔴 Худший дефект этого контура: страница выглядит исправной, но показывает УРЕЗАННЫЙ список
// вариантов, и владелец выбирает из того, что видит. Поймано им самим на живом Р5 интервью №010 —
// исчез ровно рекомендованный вариант, потому что его жирный заголовок перенесён на вторую строку.
// Впечатление здесь бесполезно: считаем строки-кандидаты и сверяем с разобранными вариантами.
console.log('\n— блок 5в: варианты не теряются (все живые интервью) —');
{
	const { parseInterview, readMd: rmd } = await import('./lib/review-core.mjs');
	const dir = join(ROOT, 'interviews');
	const files = readdirSync(dir).filter((f) => f.startsWith('interview_') && f.endsWith('.md'));
	let lost = 0;
	let total = 0;
	for (const f of files) {
		const p = join(dir, f);
		const iv = parseInterview(p, rmd(p));
		for (const q of iv.questions) {
			const candidates = q.optionLines ?? 0;
			total += candidates;
			if (q.options.length !== candidates) {
				lost++;
				check(`${f} ${q.label}: разобрано ${q.options.length} из ${candidates} вариантов`, false);
			}
		}
	}
	check(`ни один вариант не потерян (${total} по ${files.length} интервью)`, lost === 0, `потеряно у ${lost} вопросов`);

	// Точечно: тот самый вариант, на котором дефект нашёлся.
	const p10 = join(ROOT, 'interviews/interview_010_gates_forks.md');
	if (existsSync(p10)) {
		const q5 = parseInterview(p10, rmd(p10)).questions.find((q) => q.label === 'Р5');
		check('Р5: разобраны все четыре варианта', q5?.options.length === 4, `${q5?.options.length}`);
		check('Р5: вариант В (рекомендованный) на месте', !!q5?.options.some((o) => o.letter === 'В'));
		// ⚠️ Здесь НЕ проверяется «Р5 ждёт ответа»: первая редакция это делала и покраснела ровно
		// в тот час, когда владелец на него ответил. Проверка, привязанная к переменному состоянию
		// живых данных, стережёт календарь, а не продукт. Само правило «поле-встречный-вопрос не
		// считается ответом» стережётся самотестом ядра, где случай зафиксирован фикстурой.
	}
}

// ── Блок 6. ЖИВОЙ документ, а не фикстура (грабли №4)
console.log('\n— блок 6: настоящее интервью №010 —');
{
	const real = run(['tools/review.mjs', 'render', 'interviews/interview_010_gates_forks.md']);
	check('живое интервью №010 рендерится', real.code === 0, real.out.trim());
	const html = readFileSync(join(ROOT, real.out.trim()), 'utf8');
	check('в нём 15 карточек вопросов', (html.match(/class="q /g) || []).length === 15);
	check('открытый вопрос Р5 на месте', html.includes('data-q="Р5"'));
	check('Р5 предлагает варианты кликом', /data-q="Р5"[\s\S]*?class="opt"/.test(html));
	check('страница самодостаточна (ни одной внешней загрузки)', !/(src|href)="https?:/.test(html));
}

// ── Блок 7. Уборка и встроенная проверка «след убран» (правило класса, bugs/103)
console.log('\n— блок 7: уборка —');
{
	const dec = decisionPath(DOC);
	if (existsSync(dec)) rmSync(dec);
	for (const f of existsSync(ARCHIVE_DIR) ? readdirSync(ARCHIVE_DIR) : [])
		if (f.startsWith('interview_999')) rmSync(join(ARCHIVE_DIR, f));
	// Фикстуру из очереди тоже вынимаем, иначе она будет звать владельца вечно.
	const qf = join(ROOT, 'interviews', 'decisions', 'queue.json');
	if (existsSync(qf)) {
		const q = JSON.parse(readFileSync(qf, 'utf8'));
		q.items = q.items.filter((i) => !i.doc.includes('interview_999'));
		writeFileSync(qf, JSON.stringify(q, null, '\t') + '\n', 'utf8');
	}
	rmSync(FIX, { recursive: true, force: true });

	check('след убран: файла решения нет', !existsSync(dec));
	check(
		'след убран: архивных записей фикстуры нет',
		!(existsSync(ARCHIVE_DIR) ? readdirSync(ARCHIVE_DIR) : []).some((f) => f.startsWith('interview_999')),
	);
	check('след убран: фикстура удалена', !existsSync(FIX));
	check(
		'след убран: очередь без фикстуры',
		!existsSync(qf) || !JSON.parse(readFileSync(qf, 'utf8')).items.some((i) => i.doc.includes('interview_999')),
	);
}

console.log(`\n${failures ? '🔴' : '✅'} ИТОГ: ${passed} прошло, ${failures} провалов`);
console.log(`Кадры: ${join('test-results', 'owner-reviews')}`);
process.exit(failures ? 1 : 0);

/** Ждёт условия, опрашивая его каждые 200 мс. */
async function waitFor(fn, ms) {
	const until = Date.now() + ms;
	while (Date.now() < until) {
		if (await fn()) return true;
		await new Promise((r) => setTimeout(r, 200));
	}
	return false;
}

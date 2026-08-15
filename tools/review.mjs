#!/usr/bin/env node
/**
 * review.mjs — КОНТУР ВЫЧИТКИ ВЛАДЕЛЬЦА: страница вопросов, запись решений, сигнал, очередь.
 *
 * Регламент — `.claude/skills/owner-reviews/SKILL.md`; операционный план — `plans/27`.
 * Главная мысль регламента, которую легко потерять: **HTML — не цель, а транспорт; цель — страж.**
 * Жёсткое правило («место вопросов — только `interviews/`») живёт в `AGENT_GUIDE.md` и стережётся
 * `tools/questions-guard.mjs`. Этот инструмент — необязательная надстройка сверху, делающая ответ
 * делом одного клика. Сила ответа от транспорта не зависит: **HTML = md = чат**.
 *
 * Команды:
 *   node tools/review.mjs open  <документ.md>   поднять страницу, открыть браузер, позвать владельца
 *   node tools/review.mjs render <документ.md>  снять страницу в файл (самодостаточный, офлайн)
 *   node tools/review.mjs list                  все интервью, ждущие владельца
 *   node tools/review.mjs queue <документ.md>   поставить в очередь (для автономных циклов)
 *   node tools/review.mjs batch                 одна страница «накопилось N» на всю очередь
 *   node tools/review.mjs --selftest            самотест ядра и стражей контура
 *
 * Флаги: --by "Имя" · --voice "Имя голоса" · --no-signal · --no-open · --timeout МИН · --port N
 */

import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
	ROOT,
	DECISIONS_DIR,
	QUEUE_FILE,
	readMd,
	parseMeta,
	parseInterview,
	lintSelfContained,
	mdToHtml,
	inline,
	bodyHash,
	artifactsOf,
	writeDecision,
	savedStamp,
	isQuiet,
	selftest,
} from './lib/review-core.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Разбор аргументов
// ─────────────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, dflt = null) => {
	const i = argv.indexOf(name);
	return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const positional = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));

/** Кто отвечает. Параметр, а не догадка: `by` — это то, что делает архив читаемым месяцы спустя. */
const BY = opt('--by', process.env.NDIM_OWNER || 'Николай Кривуша');
/**
 * Голос — ПАРАМЕТР, а не меню (регламент: в поле у машины оказался ровно один пригодный голос
 * из 185).
 *
 * 🎙 У проекта ДВА тракта, и первый взят взаймы у соседнего проекта KLAS (слово владельца
 * 2026-08-01: «голос нужно поприятнее, есть соседний проект KLAS — там есть голосовой контур,
 * можно позаимствовать»):
 *
 *   1. **Silero v5 ru** — `F:\KLAS\tools\voice-say.mjs` (локально, офлайн, CPU; голоса `aidar`,
 *      `baya`, `kseniya`, `xenia`, `eugene`). Звучит по-человечески, а не роботом.
 *      Умолчание `eugene` — **выбор владельца** слепым прослушиванием пяти образцов на одном
 *      материале (интервью №011, В1 = Д). Менять его может только он.
 *   2. **SAPI** Windows — запасной путь, если тракта KLAS на машине нет.
 *
 * 🔴 ВЗАЙМЫ, А НЕ КОПИЕЙ. Модель 145 МБ, venv с torch и весь тракт остаются жить в KLAS: копия
 * означала бы две правды и два места починки. NDim берёт КОМАНДУ, а не содержимое — и честно
 * откатывается на SAPI, когда диска KLAS нет. Путь переопределяется `NDIM_VOICE_TOOL`.
 *
 * ⚠️ Уроки, УЖЕ ОПЛАЧЕННЫЕ KLAS, — не переоткрывать (`F:\KLAS\bugs\`): `06` текст без букв и цифр
 * произносить нечего (код 2 — это не поломка) · `08` кракозябры cp1251 · `13` тракт молча глотал
 * цифры, пока не появилась нормализация «56 → пятьдесят шесть» · `14` разметка утекала в речь,
 * поэтому в голос уходит ЧИСТЫЙ текст, без markdown.
 */
/**
 * КТО спрашивает. Владелец ведёт несколько проектов сразу, и каждый зовёт его страницей ОДНОГО И
 * ТОГО ЖЕ вида — значит страница обязана назвать себя раньше, чем он прочтёт хоть слово (его слово
 * 2026-08-02, увидев это в контуре соседнего проекта: «я понимаю, по какому проекту меня
 * спрашивают, и сколько вопросов в этом интервью в каком статусе»).
 *
 * Имя — каноническое написание из `AGENT_GUIDE.md` → «Идентичность проекта», а не новое брендовое
 * решение: агент бренд не сочиняет. Форк переопределяет `NDIM_PROJECT`, а не правит код.
 */
const PROJECT = process.env.NDIM_PROJECT || 'NDim Space';

/** Когда спрошено — человеческой строкой, а не ISO: её читает человек, а не разбор. */
const stamp = (d = new Date()) =>
	`${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}, ` +
	`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

const VOICE = opt('--voice', process.env.NDIM_VOICE || 'eugene');
const SAPI_VOICE = process.env.NDIM_SAPI_VOICE || 'Microsoft Irina Desktop';
const VOICE_TOOL = opt('--voice-tool', process.env.NDIM_VOICE_TOOL || 'F:\\KLAS\\tools\\voice-say.mjs');
/**
 * МЕРА 1 — «ТЕРПЕНИЕ БЕСКОНЕЧНО» (`bugs/110`).
 *
 * Умолчание — **0, то есть ждать без конца**. Часы остались только для автоматики: автономный
 * цикл, поднявший страницу, обязан уметь завершиться сам, а живой человек — никогда не обязан
 * укладываться в чужой срок. Слово владельца соседнего проекта: «Ждать ответы владельца
 * ХОТЬ ВЕЧНОСТЬ!».
 *
 * Прежнее умолчание было 30 минут, и агент этого проекта ещё и передавал `--timeout 90…180`
 * руками — то есть заводил часы над работой человека, который в это время ДУМАЛ.
 */
const TIMEOUT_MIN = Number(opt('--timeout', '0'));

// ─────────────────────────────────────────────────────────────────────────────
// СТРАНИЦА
// ─────────────────────────────────────────────────────────────────────────────

const esc = (s) =>
	String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Стиль страницы. Обе темы ОС обязательны: полевые грабли №6 — «тёмное на тёмном поймал владелец,
 * а не самопроверки». Поэтому цвета заданы переменными и переопределяются медиазапросом, а не
 * подбираются на глаз в одной теме.
 */
const STYLE = `
:root{
	--bg:#f7f7f5; --card:#fff; --ink:#1a1a1a; --dim:#5b5b57; --line:#e2e2dd;
	--accent:#1a6fd4; --accent-ink:#fff; --ok:#1f7a3d; --warn:#b06000; --bad:#b3261e;
	--code-bg:#f0f0ec;
}
@media (prefers-color-scheme: dark){
	:root{
		--bg:#14161a; --card:#1b1e24; --ink:#e8e8e6; --dim:#a0a4ad; --line:#2c313a;
		--accent:#4d9bff; --accent-ink:#0b1220; --ok:#5fd08a; --warn:#e0a34a; --bad:#ff6b60;
		--code-bg:#232830;
	}
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
	font:16px/1.6 -apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
.wrap{max-width:920px;margin:0 auto;padding:24px 18px 120px}
header.top{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);
	padding:14px 0;margin-bottom:18px}
h1{font-size:1.45rem;line-height:1.3;margin:0 0 6px}
h2{font-size:1.2rem;margin:1.6em 0 .5em}
h3{font-size:1.05rem;margin:1.4em 0 .4em}
h4{font-size:1rem;margin:1.2em 0 .4em}
p{margin:.6em 0}
a{color:var(--accent)}
code{background:var(--code-bg);padding:.1em .35em;border-radius:4px;font-size:.9em}
pre{background:var(--code-bg);padding:12px;border-radius:8px;overflow:auto}
pre code{background:none;padding:0}
blockquote{margin:.8em 0;padding:.1em 0 .1em 14px;border-left:3px solid var(--line);color:var(--dim)}
hr{border:0;border-top:1px solid var(--line);margin:1.6em 0}
.tw{overflow-x:auto}
table{border-collapse:collapse;width:100%;margin:.8em 0;font-size:.92em}
th,td{border:1px solid var(--line);padding:6px 9px;text-align:left;vertical-align:top}
th{background:var(--code-bg)}
.meta{color:var(--dim);font-size:.86rem}
/* Виджет вопроса. Полоса слева — выбор владельца (интервью №012: В1=А «Полоса слева»,
   В2=А «красится состоянием»). Она делает две работы разом: отделяет один вопрос от другого и
   показывает, ждёт он ответа или нет, — на длинном интервью это главное, что нужно видеть глазом. */
.q{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--line);
	border-radius:4px 12px 12px 4px;padding:16px 18px;margin:20px 0}
.q.open{border-left-color:var(--warn)}
.q.done{opacity:.72;border-left-color:var(--ok)}
/* Шапка: КТО спрашивает, КОГДА и состояние интервью двумя пилюлями, читаемыми одним взглядом.
   Пилюли ЗАЛИВНЫЕ, а не обводкой: обводка уже занята тегами вопросов, и два похожих элемента
   рядом читались бы как один список. Цвет — по СОСТОЯНИЮ (тот же принцип, что владелец выбрал
   для карточек вопросов, интервью №012, V1 «Полоса слева»). Ноль гасится в серое: «отвечено: 0»
   зелёным было бы похвалой за несделанное. */
.asks{font-size:.86rem;color:var(--dim);margin-top:2px}
.pills{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 2px}
.pill{font-size:.8rem;font-weight:600;padding:3px 11px;border-radius:99px;border:1px solid transparent}
.pill.wait{background:var(--warn);color:var(--card)}
.pill.done{background:var(--ok);color:var(--card)}
.pill.art{background:var(--accent);color:var(--accent-ink,var(--card))}
.pill.zero{background:transparent;color:var(--dim);border-color:var(--line);font-weight:400}
.qhead{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.tag{font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;padding:2px 8px;border-radius:99px;
	border:1px solid var(--line);color:var(--dim)}
.tag.open{color:var(--warn);border-color:var(--warn)}
.tag.ok{color:var(--ok);border-color:var(--ok)}
/* Когда ответ сохранён. Тише плашки состояния: это справка, а не состояние. */
.when{font-size:.78rem;color:var(--dim)}
.opts{display:flex;flex-direction:column;gap:8px;margin:12px 0}
.opt{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid var(--line);
	border-radius:10px;cursor:pointer;background:transparent}
.opt:hover{border-color:var(--accent)}
.opt input{margin-top:4px}
.opt b{white-space:nowrap}
.opt.sel{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
textarea{width:100%;min-height:70px;padding:10px;border:1px solid var(--line);border-radius:10px;
	background:var(--bg);color:var(--ink);font:inherit;font-size:.95rem;resize:vertical}
label.f{display:block;margin:10px 0 4px;font-size:.85rem;color:var(--dim)}
.prev{background:var(--code-bg);border-radius:8px;padding:10px 12px;margin:.5em 0;font-size:.95em}
.bar{position:fixed;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--line);
	padding:12px 18px;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap}
button{font:inherit;padding:10px 18px;border-radius:10px;border:1px solid var(--line);
	background:var(--card);color:var(--ink);cursor:pointer}
button.primary{background:var(--accent);color:var(--accent-ink);border-color:var(--accent);font-weight:600}
button.bad{color:var(--bad);border-color:var(--bad)}
button:disabled{opacity:.5;cursor:default}
.note{padding:10px 14px;border-radius:10px;border:1px solid var(--line);background:var(--card);
	margin:14px 0;font-size:.92rem}
.audio{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:.3em 0}
.audio audio{height:34px;max-width:100%}
.embed{margin:.8em 0;display:block}
.embed figcaption{color:var(--dim);font-size:.85rem;margin-bottom:6px;
	display:flex;gap:10px;align-items:center;flex-wrap:wrap}
/* Рамка компактная НАМЕРЕННО: внутри вопроса она для быстрого просмотра, а полноценный выбор
   макета делается отдельным экраном (правило владельца). */
.embed .frame{width:100%;height:440px;border:1px solid var(--line);
	border-radius:10px;background:var(--card);display:block}
.embed button.full{font-size:.8rem;padding:4px 10px}
.shot{margin:.6em 0;display:block}
.shot img{width:100%;height:auto;border:1px solid var(--line);border-radius:10px;display:block}
.shot figcaption{color:var(--dim);font-size:.82rem;margin-top:4px}
.q.whole{border-style:dashed}
.note.ok{border-color:var(--ok);color:var(--ok)}
.note.bad{border-color:var(--bad);color:var(--bad)}
.art{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:20px 0}
.art pre{max-height:420px}
.hash{font-family:ui-monospace,Consolas,monospace;font-size:.78rem;color:var(--dim);word-break:break-all}
@media (max-width:560px){ .wrap{padding:16px 12px 140px} h1{font-size:1.2rem} }
`;

/**
 * Ссылка на звуковой файл превращается в проигрыватель, а сам файл ВШИВАЕТСЯ в страницу.
 *
 * Зачем вшивать, а не ссылаться: страница обязана быть самодостаточной и открываться офлайн
 * (регламент), а ссылка `file://` из страницы, отданной по http, браузером блокируется — владелец
 * увидел бы мёртвый проигрыватель и решил, что сломан контур.
 *
 * Зачем вообще звук: есть класс критериев, который агент измерить не может — «красиво», «приятно»
 * (`AGENT_GUIDE` → «Класс вкуса»). Судящему звук нужен ЗВУК, а не описание звука.
 */
function inlineAudio(html) {
	return html.replace(/<a href="([^"]+\.(wav|mp3|ogg))">([^<]*)<\/a>/g, (_, src, ext, label) => {
		const p = resolve(ROOT, decodeURIComponent(src));
		if (!existsSync(p)) return `<span class="meta">нет файла: ${esc(src)}</span>`;
		const mime = ext === 'mp3' ? 'audio/mpeg' : ext === 'ogg' ? 'audio/ogg' : 'audio/wav';
		const b64 = readFileSync(p).toString('base64');
		return `<span class="audio">${esc(label)}<audio controls preload="metadata" src="data:${mime};base64,${b64}"></audio></span>`;
	});
}

/**
 * Ссылка на HTML-файл превращается в ЖИВУЮ страницу внутри вопроса (слово владельца 2026-08-01:
 * «рендер HTML страниц внутри вопросов — чтобы там можно просмотр макетов делать»).
 *
 * Почему `srcdoc`, а не `src`: страница вычитки обязана оставаться САМОДОСТАТОЧНОЙ и открываться
 * офлайн одним файлом. Ссылка `src="design/…"` требовала бы раздачи файлов сервером и умирала бы в
 * снимке страницы; `srcdoc` вшивает документ целиком, и макет живёт внутри вопроса даже без сети.
 *
 * ⚠️ Вкладывается ровно то, что лежит в файле. Макет с внешними зависимостями внутри рамки
 * развалится — но в этом проекте макеты по канону самодостаточны (свои стили, свои скрипты).
 */
function inlineHtmlFrames(html) {
	return html.replace(/<a href="([^"]+\.html)">([^<]*)<\/a>/g, (_, src, label) => {
		const p = resolve(ROOT, decodeURIComponent(src));
		if (!existsSync(p)) return `<span class="meta">нет файла: ${esc(src)}</span>`;
		return `<figure class="embed">
			<figcaption><b>${esc(label)}</b>
				<button type="button" class="apart primary">Открыть отдельным экраном</button>
				<button type="button" class="full">Во весь экран</button>
				<span class="meta">ниже — быстрый просмотр</span></figcaption>
			<iframe class="frame" srcdoc="${esc(readFileSync(p, 'utf8'))}"></iframe>
		</figure>`;
	});
}

/**
 * Ссылка на картинку превращается в саму картинку, вшитую в страницу.
 *
 * Тот же довод, что у звука: судящему ВИД нужен вид, а не описание вида (`AGENT_GUIDE` → «Класс
 * вкуса»), и страница обязана открываться офлайн одним файлом. Кадры макетов живут в
 * `test-results/` вне git — ссылка на них с http-страницы браузером блокируется, а вшитая
 * картинка работает всегда.
 */
function inlineImages(html) {
	return html.replace(/<a href="([^"]+\.(png|jpe?g|webp|svg))">([^<]*)<\/a>/g, (_, src, ext, label) => {
		const p = resolve(ROOT, decodeURIComponent(src));
		if (!existsSync(p)) return `<span class="meta">нет файла: ${esc(src)}</span>`;
		const mime =
			ext === 'svg' ? 'image/svg+xml' : ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : 'image/jpeg';
		const b64 = readFileSync(p).toString('base64');
		return `<figure class="shot"><img src="data:${mime};base64,${b64}" alt="${esc(label)}" loading="lazy"><figcaption>${esc(label)}</figcaption></figure>`;
	});
}

/** Карточка одного вопроса интервью: тело + варианты + поля ввода. */
function questionCard(q, bodyMd) {
	const opts = q.options
		.map(
			(o) => `
			<label class="opt" data-l="${esc(o.letter)}">
				<input type="radio" name="ch-${esc(q.label)}" value="${esc(o.letter)}">
				<span><b>${esc(o.letter)})</b> ${inline(o.label)}</span>
			</label>`,
		)
		.join('');

	const existing = q.answered
		? `<div class="prev"><b>Уже отвечено:</b><br>${mdToHtml(q.answer)}</div>`
		: '';

	// Когда ответ был сохранён — просьба владельца 2026-08-03: «чтобы ответы имели таймстемп».
	// Время местное и словами; ISO живёт в машинной метке и человеку не показывается (`bugs/112`).
	const when = q.answered && q.savedAt
		? `<span class="when" title="${esc(q.savedAt)}">${esc(savedStamp(q.savedBy || BY, q.savedAt).replace(/^\*🕒 Сохранено /, '').replace(/\*$/, ''))}</span>`
		: '';

	return `
	<section class="q ${q.answered ? 'done' : 'open'}" data-q="${esc(q.label)}">
		<div class="qhead">
			<span class="tag ${q.answered ? 'ok' : 'open'}">${q.answered ? 'отвечено' : 'ждёт вас'}</span>
			${when}
			<h3 style="margin:0">${esc(q.title)}</h3>
		</div>
		${mdToHtml(bodyMd)}
		${existing}
		${opts ? `<div class="opts">${opts}</div>` : ''}
		<label class="f">${q.answered ? 'Уточнение (старый ответ останется дословно)' : 'Ответ своими словами'}</label>
		<textarea data-text="${esc(q.label)}" placeholder="можно только букву выше, можно только текст, можно оба"></textarea>
		<label class="f">Пометка для агента (необязательно)</label>
		<textarea data-comment="${esc(q.label)}" style="min-height:44px"></textarea>
	</section>`;
}

/** Карточка исходящего артефакта: полная полезная нагрузка + промышленная четвёрка действий. */
function artifactCard(a, bodyText, hash) {
	return `
	<section class="art" data-art="${esc(a.id)}" data-hash="${esc(hash)}">
		<div class="qhead">
			<span class="tag open">на одобрение</span>
			<h3 style="margin:0">${esc(a.id)} → ${esc(a.target || 'адресат не указан')}</h3>
		</div>
		<p class="meta">Файл тела: <code>${esc(a.body_file)}</code> · формат: ${esc(a.format || 'text')}</p>
		<p class="meta">Уйдёт ровно это, байт в байт:</p>
		<pre><code>${esc(bodyText)}</code></pre>
		<p class="hash">SHA-256 тела: ${esc(hash)}</p>
		<div class="opts">
			<label class="opt"><input type="radio" name="st-${esc(a.id)}" value="approved"><span><b>Одобрить</b> — отправлять как есть</span></label>
			<label class="opt"><input type="radio" name="st-${esc(a.id)}" value="rejected"><span><b>Отклонить</b> — с причиной ниже</span></label>
			<label class="opt"><input type="radio" name="st-${esc(a.id)}" value="edit"><span><b>Поправить</b> — что именно, ниже</span></label>
			<label class="opt"><input type="radio" name="st-${esc(a.id)}" value="reply"><span><b>Ответить</b> — вопрос агенту, решения пока нет</span></label>
		</div>
		<label class="f">Причина / правка / вопрос</label>
		<textarea data-text="${esc(a.id)}"></textarea>
	</section>`;
}

/**
 * Собирает страницу документа.
 * @param live — живая страница (можно ответить) или снимок в файл (только чтение).
 */
export function buildPage({ docPath, live }) {
	const relPath = relative(ROOT, docPath).split('\\').join('/');
	const text = readMd(docPath);
	const meta = parseMeta(text);
	const parsed = parseInterview(docPath, text);
	const lines = parsed.lines;

	// Сегменты в исходном порядке: карточки вопросов и всё, что между ними, — ничего не теряем.
	const chunks = [];
	let cursor = 0;
	for (const q of parsed.questions) {
		if (q.startLine > cursor) chunks.push(mdToHtml(lines.slice(cursor, q.startLine).join('\n')));
		const bodyEnd = q.answerLine >= 0 ? q.answerLine : q.endLine;
		chunks.push(questionCard(q, lines.slice(q.startLine + 1, bodyEnd).join('\n')));
		cursor = q.endLine;
	}
	if (cursor < lines.length) chunks.push(mdToHtml(lines.slice(cursor).join('\n')));

	// Исходящие артефакты (черновики отправки): тело берётся ССЫЛКОЙ на файл, не копипастой —
	// страница показывает ровно те байты, что уйдут, и хеш считается по ним же (I3).
	const arts = [];
	for (const a of meta.artifacts) {
		const p = resolve(ROOT, a.body_file || '');
		if (!a.body_file || !existsSync(p)) {
			arts.push(
				`<section class="art"><div class="note bad">Артефакт <b>${esc(a.id)}</b>: файл тела
				<code>${esc(a.body_file || '—')}</code> не найден. Одобрять нечего.</div></section>`,
			);
			continue;
		}
		arts.push(artifactCard(a, readFileSync(p, 'utf8'), bodyHash(p)));
	}

	const open = parsed.questions.filter((q) => !q.answered).length;
	const answered = parsed.questions.length - open;

	const page = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(meta.title)}</title>
<style>${STYLE}</style></head>
<body data-doc="${esc(relPath)}" data-kind="${esc(meta.kind)}">
<div class="wrap">
	<header class="top">
		<h1>${esc(meta.title)}</h1>
		<div class="asks">Спрашивает ИИ-агент <b>${esc(PROJECT)}</b> · ${esc(stamp())}</div>
		<div class="pills">
			<span class="pill ${open ? 'wait' : 'zero'}">ждут вас: ${open}</span>
			<span class="pill ${answered ? 'done' : 'zero'}">отвечено: ${answered}</span>
			${meta.artifacts.length ? `<span class="pill art">на одобрение: ${meta.artifacts.length}</span>` : ''}
		</div>
		<div class="meta">${esc(relPath)}</div>
		${parsed.statusRaw ? `<div class="meta">${mdToHtml(parsed.statusRaw)}</div>` : ''}
	</header>

	${live ? '' : '<div class="note">Это СНИМОК страницы в файл. Отвечать можно на живой: <code>node tools/review.mjs open ' + esc(relPath) + '</code></div>'}

	${arts.join('\n')}
	${chunks.join('\n')}

	${
		live
			? `<section class="q whole">
		<div class="qhead"><span class="tag">по документу целиком</span></div>
		<label class="f">Общий комментарий — то, что относится ко всему документу, а не к одному вопросу</label>
		<textarea id="docComment" placeholder="необязательно"></textarea>
	</section>`
			: ''
	}
</div>

${
	live
		? `<div class="bar">
	<button class="primary" id="save">Сохранить ответы</button>
	<span class="meta" id="status"></span>
</div>`
		: ''
}

<script>
// Выбор варианта. Единственная «логика» страницы — всё остальное собирает сервер.
//
// 🔑 ПОВТОРНЫЙ КЛИК ПО ВЫБРАННОМУ ПУНКТУ СНИМАЕТ ВЫБОР (слово владельца 2026-08-01). Радиокнопка
// такого не умеет по природе: раз выбрав, передумать «ни один» уже нельзя — а в интервью это
// нужно постоянно, потому что вопрос можно начать отвечать и отложить.
// Механика: состояние запоминается на mousedown (ДО того, как браузер применит активацию), а
// снимается на клике САМОГО поля — к этому моменту браузер свою активацию уже сделал, и наш
// «отжим» её не перетрёт. События с целью-подписью пропускаем: клик по тексту порождает ВТОРОЕ,
// синтетическое событие на поле, и обработай мы оба — выбор снимался бы дважды, то есть никогда.
let wasChecked = false;
const paint = (box) => {
	for (const l of box.querySelectorAll('.opt'))
		l.classList.toggle('sel', !!l.querySelector('input[type=radio]')?.checked);
};
document.addEventListener('mousedown', (e) => {
	wasChecked = !!e.target.closest?.('.opt')?.querySelector('input[type=radio]')?.checked;
});
document.addEventListener('keydown', () => { wasChecked = false; });
document.addEventListener('click', (e) => {
	const radio = e.target.closest?.('.opt')?.querySelector('input[type=radio]');
	if (!radio || e.target !== radio) return;
	if (wasChecked) radio.checked = false;
	wasChecked = false;
	paint(radio.closest('.opts'));
});
document.addEventListener('change', (e) => {
	if (e.target.type === 'radio') paint(e.target.closest('.opts'));
});

// Живой макет внутри вопроса. Правило владельца (2026-08-01): выбор из четырёх макетов смотрят
// ОТДЕЛЬНЫМ ЭКРАНОМ, а внутри вопроса рамка нужна для быстрого просмотра мелких решений. Поэтому
// рамка компактная, а рядом две двери наружу — отдельное окно и полный экран.
document.addEventListener('click', (e) => {
	const frame = e.target.closest?.('.embed')?.querySelector('.frame');
	if (!frame) return;
	if (e.target.classList.contains('full') && frame.requestFullscreen) frame.requestFullscreen();
	if (e.target.classList.contains('apart')) {
		// Окно открывает СКРИПТ — значит макет живёт полноценным экраном и закрывается как обычное
		// окно. Содержимое берём из самой рамки: второй копии документа не заводим.
		const blob = new Blob([frame.getAttribute('srcdoc')], { type: 'text/html;charset=utf-8' });
		window.open(URL.createObjectURL(blob), '_blank', 'noopener');
	}
});

// ── ЧЕРНОВИК И СЕРДЦЕБИЕНИЕ (bugs/100) ──────────────────────────────────────
// Третий из трёх дефектов, потопивших час работы владельца в соседнем проекте: ответы
// жили ТОЛЬКО в DOM и умирали вместе со вкладкой. Теперь каждая правка тут же ложится
// в браузер, а восстановление происходит само при следующем открытии той же страницы.
const draftKey = 'ndim-review-draft:' + (document.body.dataset.doc || 'x');

function snapshotDraft() {
	const d = { q: {}, a: {}, comment: '' };
	for (const sec of document.querySelectorAll('[data-q]')) {
		d.q[sec.dataset.q] = {
			choice: sec.querySelector('input[type=radio]:checked')?.value || '',
			text: sec.querySelector('[data-text]')?.value || '',
			comment: sec.querySelector('[data-comment]')?.value || '',
		};
	}
	for (const sec of document.querySelectorAll('[data-art]')) {
		d.a[sec.dataset.art] = {
			status: sec.querySelector('input[type=radio]:checked')?.value || '',
			text: sec.querySelector('[data-text]')?.value || '',
		};
	}
	d.comment = document.getElementById('docComment')?.value || '';
	return d;
}

function saveDraft() {
	try { localStorage.setItem(draftKey, JSON.stringify(snapshotDraft())); } catch (e) {}
}

function restoreDraft() {
	let d = null;
	try { d = JSON.parse(localStorage.getItem(draftKey) || 'null'); } catch (e) {}
	if (!d) return;
	let n = 0;
	const pick = (sec, value) => {
		if (!value) return;
		const r = sec.querySelector('input[type=radio][value="' + value + '"]');
		if (r && !r.checked) { r.checked = true; n++; }
	};
	for (const sec of document.querySelectorAll('[data-q]')) {
		const rec = (d.q || {})[sec.dataset.q];
		if (!rec) continue;
		pick(sec, rec.choice);
		const t = sec.querySelector('[data-text]');
		if (t && rec.text && !t.value) { t.value = rec.text; n++; }
		const c = sec.querySelector('[data-comment]');
		if (c && rec.comment && !c.value) { c.value = rec.comment; n++; }
	}
	for (const sec of document.querySelectorAll('[data-art]')) {
		const rec = (d.a || {})[sec.dataset.art];
		if (!rec) continue;
		pick(sec, rec.status);
		const t = sec.querySelector('[data-text]');
		if (t && rec.text && !t.value) { t.value = rec.text; n++; }
	}
	const dc = document.getElementById('docComment');
	if (dc && d.comment && !dc.value) { dc.value = d.comment; n++; }
	if (n > 0) {
		document.querySelector('.wrap').insertAdjacentHTML('afterbegin',
			'<div class="note ok"><b>Восстановлен черновик.</b> Прошлый раз записать не удалось — ' +
			'ваши отметки и тексты возвращены на места. Проверьте и нажмите «Сохранить».</div>');
	}
}

addEventListener('input', saveDraft);
addEventListener('change', saveDraft);
restoreDraft();

// ── МЕРА 5: ПУЛЬС, КОТОРЫЙ ГОВОРИТ ВСЛУХ (bugs/110) ─────────────────────────
// Из пяти мер только эта делает дефект НЕВОЗМОЖНЫМ: остальные четыре делают его поправимым.
// Пульс не только держит сервер живым — он немедленно сообщает, если сервер замолчал. Владелец
// узнаёт о беде в ту же секунду, а не через час письма в мёртвую страницу.
// Раз в 10 секунд: один пустой ответ 204 не стоит ничего, а цена пропущенного удара —
// потерянный час работы человека.
let pulseLost = false;
function pulseBanner(text, ok) {
	let el = document.getElementById('pulseWarn');
	if (!el) {
		document.querySelector('.wrap').insertAdjacentHTML('afterbegin', '<div id="pulseWarn"></div>');
		el = document.getElementById('pulseWarn');
	}
	el.className = ok ? 'note ok' : 'note';
	el.innerHTML = text;
}
setInterval(async () => {
	try {
		const r = await fetch('/alive', { cache: 'no-store' });
		if (!r.ok) throw new Error('bad status');
		if (pulseLost) {
			pulseLost = false;
			pulseBanner('<b>Связь восстановлена.</b> Можно сохранять — ответы запишутся.', true);
		}
	} catch (e) {
		if (pulseLost) return;
		pulseLost = true;
		pulseBanner(
			'<b>Сервер агента замолчал.</b> Продолжайте писать — всё, что Вы уже отметили и написали, ' +
			'сохранено в этом браузере и не потеряется. Но записать это сейчас нельзя: попросите ' +
			'агента поднять страницу заново, и Ваши ответы вернутся на места сами.',
			false,
		);
	}
}, 10000);

const saveBtn = document.getElementById('save');
if (saveBtn) saveBtn.addEventListener('click', async () => {
	const answers = {};
	for (const sec of document.querySelectorAll('[data-q]')) {
		const label = sec.dataset.q;
		const choice = sec.querySelector('input[type=radio]:checked')?.value || '';
		const text = sec.querySelector('[data-text]')?.value.trim() || '';
		const comment = sec.querySelector('[data-comment]')?.value.trim() || '';
		if (choice || text) answers[label] = { choice, text, comment };
	}
	const artifacts = {};
	for (const sec of document.querySelectorAll('[data-art]')) {
		const id = sec.dataset.art;
		const status = sec.querySelector('input[type=radio]:checked')?.value || '';
		const text = sec.querySelector('[data-text]')?.value.trim() || '';
		// Хеш едет ТОТ, что страница показала. Сервер сверит его с файлом заново: если текст
		// изменился, пока владелец читал, одобрять нечего — он видел не то (I3).
		if (status) artifacts[id] = { status, comment: text, sha256: sec.dataset.hash };
	}
	// Общий комментарий по документу целиком (слово владельца 2026-08-01). Он САМ ПО СЕБЕ
	// достаточен для сохранения: «ответов нет, но есть что сказать» — законный исход вычитки.
	const comment = document.getElementById('docComment')?.value.trim() || '';
	if (!Object.keys(answers).length && !Object.keys(artifacts).length && !comment) {
		document.getElementById('status').textContent = 'Ничего не отмечено — нечего сохранять.';
		return;
	}
	saveBtn.disabled = true;
	document.getElementById('status').textContent = 'Записываю…';
	// Поле «кто отвечает» со страницы убрано по слову владельца 2026-08-01: «убрать это поле
	// вообще полностью, я всегда отвечаю». На проекте владелец ровно один, и спрашивать его имя
	// каждый раз — трение без выгоды. Само поле "by" при этом никуда не делось: его проставляет
	// сервер (параметр --by, умолчание — владелец), потому что архив решений без «кто» нечитаем
	// месяцы спустя (I2). Убрали ВОПРОС, а не ЗАПИСЬ.
	// ⚠️ Внутри этого <script> живут ШАБЛОННЫЕ СТРОКИ — обратная кавычка здесь обрывает всю
	// страницу и роняет модуль синтаксической ошибкой. В комментариях кавычки только «ёлочки».
	// 🔴 try/catch ОБЯЗАТЕЛЕН (bugs/100). Без него мёртвый сервер отвергает промис, обработчик
	// клика молча умирает на необработанном отказе — и кнопка остаётся навсегда заблокированной,
	// а статус навсегда «Записываю…». Владелец соседнего проекта потерял так час работы.
	let out;
	try {
		const res = await fetch('/decision', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			// Какой документ отвечают — говорит сама страница: один сервер обслуживает всю пачку.
			body: JSON.stringify({ doc: document.body.dataset.doc, answers, artifacts, comment }),
		});
		out = await res.json();
	} catch (err) {
		// Ответы НЕ ПОТЕРЯНЫ: черновик лежит в браузере, и мы тут же кладём текст на стол,
		// чтобы его можно было выделить и скопировать в чат одним движением.
		// ── МЕРА 3: СПАСАТЕЛЬНЫЙ КРУГ ────────────────────────────────────────────
		// Мало сказать «не записалось» — надо вернуть человеку его труд В РУКИ: текст на
		// странице, кнопка «Скопировать» (чтобы отправить в чат одним движением) и кнопка
		// «Повторить» (сервер мог просто моргнуть). Кнопка сохранения — снова активна.
		// 🔴 ФОРМУЛИРОВКА ЗДЕСЬ — ОТДЕЛЬНОЕ РЕШЕНИЕ, И ОНА ОПЛАЧЕНА (bugs/122, интервью №031).
		// Первая редакция утверждала «Записать не удалось» — а страница ЭТОГО НЕ ЗНАЕТ. Отказ
		// fetch одинаков в двух разных случаях: сервер умер ДО записи и сервер записал, но умер
		// ДО ОТВЕТА (он уходит через 2,5 с после записи — гонка узкая, но настоящая). Владелец
		// однажды увидел эту тревогу над ответом, который лёг во все три места, и написал
		// «сломался контур». На вопрос «в какой вкладке» он ответил «я не помню» — значит
		// развилку не закрыть воспоминанием, и обе версии обязаны стать безвредными.
		// Поэтому страница говорит РОВНО ТО, ЧТО ЗНАЕТ: ответа от сервера нет, судьба записи
		// неизвестна, труд цел. Кричать она при этом не перестаёт (bugs/110): молчаливое
		// «записано» осталось запрещённым, изменилось только ложное «НЕ записано».
		saveBtn.disabled = false;
		document.getElementById('status').textContent = 'ОТВЕТА ОТ СЕРВЕРА НЕТ — ответы ниже, они не потеряны';
		const old = document.getElementById('rescue');
		if (old) old.remove();
		document.querySelector('.wrap').insertAdjacentHTML('afterbegin',
			'<div class="note" id="rescue"><b>Сервер агента не ответил. Записался ответ или нет — ' +
			'страница знать не может.</b> Повторить сохранение безопасно: уже записанный ответ не ' +
			'затирается, новый приезжает уточнением. ' +
			'Ваши ответы целы — они сохранены в этом браузере и вернутся на места сами, когда ' +
			'страницу поднимут заново. Ниже они же текстом.' +
			'<textarea id="rescueText" readonly rows="10" style="width:100%;margin-top:10px"></textarea>' +
			'<div style="margin-top:8px"><button id="rescueCopy" type="button">Скопировать</button> ' +
			'<button id="rescueRetry" type="button">Повторить</button> ' +
			'<span id="rescueMsg"></span></div></div>');
		document.getElementById('rescueText').value =
			JSON.stringify({ answers, artifacts, comment }, null, 2);
		document.getElementById('rescueCopy').addEventListener('click', async () => {
			const ta = document.getElementById('rescueText');
			try {
				await navigator.clipboard.writeText(ta.value);
			} catch (e) {
				// Буфер обмена доступен не всегда (нет разрешения, не защищённый контекст) —
				// тогда честно выделяем текст, чтобы сработало Ctrl+C.
				ta.select();
			}
			document.getElementById('rescueMsg').textContent = 'скопировано';
		});
		document.getElementById('rescueRetry').addEventListener('click', () => {
			document.getElementById('rescueMsg').textContent = 'пробую ещё раз…';
			saveBtn.click();
		});
		window.scrollTo({ top: 0, behavior: 'smooth' });
		return;
	}
	if (out.ok) {
		try { localStorage.removeItem(draftKey); } catch (e) {}
		document.querySelector('.wrap').insertAdjacentHTML('afterbegin',
			'<div class="note ok"><b>Записано.</b> Ответ лёг в три места: сам документ, файл решения и архив. ' +
			'Вкладка закроется сама.</div>');
		document.getElementById('status').textContent = 'готово, закрываю…';
		window.scrollTo({ top: 0, behavior: 'smooth' });
		// Автозакрытие через 2 секунды (слово владельца 2026-08-01).
		// ⚠️ Браузер разрешает window.close() только вкладке, ОТКРЫТОЙ скриптом, а нашу открыла
		// операционная система. Поэтому закрытие — попытка, а не обещание: если браузер её не дал,
		// страница честно превращается в короткое «готово», а не притворяется закрытой.
		//
		// 🔴 НО ПЕРВАЯ РЕДАКЦИЯ ЭТОЙ ЧЕСТНОСТИ САМА ВРАЛА — И ЭТО ПОЙМАЛ ВЛАДЕЛЕЦ (интервью №013,
		// В4, дословно): «я нажал [Сохранить ответы] — появилась ошибка, что закрыть не получилось,
		// закройте мол сами», а следом: «сейчас само закрылось».
		//
		// Причина: откатное сообщение печаталось БЕЗУСЛОВНО через 400 мс после вызова, как будто
		// закрытие мгновенно. Закрытие не мгновенно — браузер разбирает окно заметно дольше, и
		// владелец успевал прочитать «не получилось» у окна, которое исправно закрывалось.
		// То есть чинить надо было не закрытие (оно работало), а СУЖДЕНИЕ О НЁМ.
		//
		// Лечение — ДВА слоя, и честно сказать, какой из них работает. Пауза поднята 400 → 2000 мс,
		// и на быстрой машине именно она снимает симптом: замер показал, что окно уходит за ~73 мс,
		// то есть до таймера дело не доходит вовсе. Но пауза — лотерея (медленная машина владельца
		// её и проиграла), поэтому под ней лежит СОБЫТИЕ:
		// уходящая страница обязана погасить свой же приговор. Событие «pagehide» наступает ровно тогда,
		// когда окно действительно уходит; если оно ушло — сообщения не будет никогда, сколько бы
		// ни занял разбор. Запас в 2 с оставлен только на случай, когда закрытие ЗАПРЕЩЕНО и
		// события не будет вовсе.
		setTimeout(() => {
			let dying = false;
			const giveUp = setTimeout(() => {
				if (dying) return;
				document.body.innerHTML =
					'<div class="wrap"><div class="note ok"><b>Записано.</b> ' +
					'Браузер не дал закрыть вкладку сам — закройте её, пожалуйста.</div></div>';
			}, 2000);
			addEventListener('pagehide', () => { dying = true; clearTimeout(giveUp); }, { once: true });
			window.close();
		}, 2000);
	} else {
		document.getElementById('status').textContent = 'ОШИБКА: ' + (out.error || 'неизвестно');
		saveBtn.disabled = false;
	}
});
</script>
</body></html>`;

	// Порядок важен: HTML-рамки первыми — иначе ссылка на макет успела бы стать картинкой.
	return inlineImages(inlineAudio(inlineHtmlFrames(page)));
}

// ─────────────────────────────────────────────────────────────────────────────
// СИГНАЛ (I5, I6)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Зовёт владельца. Вызывается ТОЛЬКО после успешно поднятой страницы (I5) — иначе получается
 * класс «позвали, а показать нечего».
 *
 * 🔴 Грабли №3 регламента: `exit 0` ≠ человек услышал. Системные уведомления Windows глушатся
 * настройками фокуса МОЛЧА и с успешным кодом возврата. Поэтому сигнал идёт звуком через звуковую
 * карту (`[console]::beep`) и голосом, а доставка подтверждается ЧЕЛОВЕКОМ, а не кодом возврата, —
 * инструмент прямо об этом печатает.
 *
 * ⚠️ Текст едет ФАЙЛОМ, не аргументом командной строки: кириллица в аргументе PowerShell 5.1
 * превращается в мусор (`EXP-0002`, `EXP-0069`, канон «Гигиена текста»). Сама команда — только ASCII.
 */
export async function signal(say, { voice = VOICE, quiet = null } = {}) {
	const now = new Date();
	if (quiet ?? isQuiet(now)) {
		console.log('🔇 Тихие часы (23:00–09:00) — сигнал подавлен. Страница ждёт владельца молча.');
		return { signalled: false, reason: 'тихие часы' };
	}
	if (process.platform !== 'win32') {
		console.log('🔔 (сигнал звуком реализован для Windows; здесь — только текстом)');
		return { signalled: false, reason: 'не Windows' };
	}

	// Разметка в голос не уходит (урок KLAS bugs/14): произносится чистый текст.
	const clean = String(say).replace(/[*_`#>\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();

	// Короткий звук — первым и всегда: он не зависит от настроек уведомлений ОС, которые глушат
	// системные всплывашки МОЛЧА и с успешным кодом возврата (грабли №3 регламента).
	spawnSync(
		'powershell',
		['-NoProfile', '-NonInteractive', '-Command', '[console]::beep(880,160); [console]::beep(660,160); [console]::beep(990,260);'],
		{ stdio: 'ignore', timeout: 8000 },
	);

	const engine = await speak(clean, voice);

	console.log(`🔔 Сигнал подан (звук + голос: ${engine}).`);
	console.log(
		'   ⚠️ Код возврата этого НЕ доказывает: уведомления и звук глушатся настройками ОС молча.\n' +
			'   Доставка считается подтверждённой только словом человека.',
	);
	return { signalled: true, engine };
}

/** Произносит текст: сначала Silero из KLAS, при неудаче — SAPI. Возвращает имя тракта. */
async function speak(text, voice) {
	if (existsSync(VOICE_TOOL)) {
		const ok = await new Promise((resolve) => {
			const p = spawn(process.execPath, [VOICE_TOOL, text, '--play', '--voice', voice], {
				stdio: 'ignore',
				windowsHide: true,
			});
			// Код 2 у тракта KLAS означает «нечего произносить» — это не поломка (их bugs/06).
			p.on('exit', (code) => resolve(code === 0));
			p.on('error', () => resolve(false));
			setTimeout(() => resolve(false), 120_000).unref?.();
		});
		if (ok) return `Silero/${voice}`;
		console.log('   (тракт KLAS не ответил — говорю системным голосом)');
	}

	// Запасной путь. Текст едет ФАЙЛОМ, команда — только ASCII: кириллица в аргументе
	// PowerShell 5.1 портится кодировкой консоли ещё до того, как её увидит программа
	// (`EXP-0002`, `EXP-0069`; тот же класс, что KLAS bugs/08).
	const sayFile = join(tmpdir(), `ndim-review-say-${process.pid}.txt`);
	writeFileSync(sayFile, text, 'utf8');
	const ps = [
		'try {',
		'  Add-Type -AssemblyName System.Speech;',
		'  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer;',
		`  try { $s.SelectVoice("${SAPI_VOICE.replace(/"/g, '')}") } catch {};`,
		`  $t = [IO.File]::ReadAllText("${sayFile.replace(/\\/g, '\\\\')}", [Text.Encoding]::UTF8);`,
		'  $s.Speak($t);',
		'} catch { }',
	].join(' ');
	spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
		stdio: 'ignore',
		timeout: 60_000,
	});
	return `SAPI/${SAPI_VOICE}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// КОМАНДЫ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Открывает страницу в браузере — по возможности ОКНОМ-ПРИЛОЖЕНИЕМ (`--app=`).
 *
 * Зачем именно так (слово владельца 2026-08-01: «страницу нужно автоматически закрывать после
 * 2 секунд от ответа»): браузер разрешает `window.close()` только окну, которое открыл САМ, —
 * обычную вкладку, запущенную через `start`, скрипт закрыть не может, и обещание автозакрытия
 * было бы враньём. Режим `--app` даёт отдельное окно без вкладок и адресной строки, и закрытие
 * в нём работает.
 *
 * Порядок поиска: Edge (владелец им проверяет вёрстку) → Chrome → обычная вкладка по умолчанию.
 * Откат честный: если ни одного браузера не нашли, страница всё равно откроется, просто закрывать
 * вкладку придётся рукой — об этом она сама и скажет.
 */
function openBrowser(url) {
	const candidates = [
		'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
		'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
		'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
		'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
	];
	const exe = candidates.find((p) => existsSync(p));
	if (exe) {
		spawn(exe, [`--app=${url}`, '--window-size=1100,900'], { detached: true, stdio: 'ignore' }).unref();
		return 'окно-приложение';
	}
	spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
	return 'вкладка браузера по умолчанию';
}

/**
 * Поднимает сервер контура.
 *
 * Один и тот же сервер обслуживает и ОДИН документ (`open`), и ПАЧКУ (`batch`): владелец не должен
 * печатать команды, чтобы перейти от списка накопившегося к самому вопросу — карточка пачки
 * обязана быть ссылкой, а не инструкцией. Разные серверы на каждый документ означали бы ровно тот
 * порок, ради устранения которого контур и строился.
 *
 * @param index — функция, рисующая корневую страницу (для пачки), либо null (тогда корень — сам
 *                документ)
 */
/**
 * Гасит сервер, только когда СТРАНИЦЫ НИКТО НЕ ДЕРЖИТ (`bugs/100`).
 *
 * `--timeout` теперь означает не «сколько ждём ответа», а «сколько терпим ТИШИНУ». Открытая
 * вкладка бьётся в `/alive` каждые 20 секунд, и пока она бьётся, ждать можно хоть вечность —
 * ровно этого потребовал владелец: «Ждать ответы владельца ХОТЬ ВЕЧНОСТЬ!».
 *
 * Часы всё же нужны: без них автономный цикл, поднявший страницу, висел бы вечно, даже если
 * владельца нет у машины вовсе. Но теперь они считают отсутствие человека, а не его раздумья.
 */
/** Как честно назвать срок ожидания: сообщение не имеет права обещать часы, которых нет. */
function waitPhrase() {
	return TIMEOUT_MIN
		? `(закроется после ${TIMEOUT_MIN} мин тишины — вкладка закрыта)`
		: 'столько, сколько нужно';
}

function watchIdle(server) {
	server.lastBeat = Date.now();
	const idleMs = TIMEOUT_MIN * 60_000;
	if (!idleMs) {
		console.log('Терпение бесконечно: часов нет, страница ждёт столько, сколько нужно человеку.');
		return;
	}
	setInterval(() => {
		if (Date.now() - server.lastBeat < idleMs) return;
		console.log(
			`\n⏳ Страницу никто не держит уже ${TIMEOUT_MIN} мин (вкладка закрыта) — ответов не записано.`,
		);
		server.close(() => process.exit(2));
	}, 15_000).unref?.();
}

function startServer({ docPath = null, index = null, onDecision = null }) {
	const server = createServer((req, res) => {
		const url = new URL(req.url, 'http://127.0.0.1');

		/*
		 * 🔴 СЕРДЦЕБИЕНИЕ ОТКРЫТОЙ ВКЛАДКИ (`bugs/100`, весть из Unliminium 2026-08-02).
		 *
		 * Раньше сервер умирал ПО ЧАСАМ, а вкладка в браузере об этом не знала: владелец писал
		 * ответы час, жал «Сохранить» и получал вечное «Записываю…». Его слова из соседнего
		 * проекта: «Я писал ответы, работал, а оно не может их записать!!!!»
		 *
		 * Ловушка была в ложной симметрии. Наш инвариант «сохранение будит ждущего» требует,
		 * чтобы процесс ЗАВЕРШАЛСЯ по сохранению, — отсюда соблазн добавить и смерть по времени.
		 * Но умирать он обязан ПО СОБЫТИЮ и НИКОГДА по часам: агент ждёт минуты, а владелец
		 * отвечает часами, потому что ДУМАЕТ. Таймаут был выставлен по мерке агента, а платил
		 * по нему человек.
		 *
		 * Теперь часы считают не «сколько мы ждём», а «сколько НИКОГО НЕТ». Открытая страница
		 * бьётся каждые 20 секунд и держит сервер живым сколько угодно долго; закрытая — не
		 * бьётся, и сервер честно уходит.
		 */
		if (req.method === 'GET' && url.pathname === '/alive') {
			server.lastBeat = Date.now();
			res.writeHead(204);
			return res.end();
		}

		if (req.method === 'GET' && url.pathname === '/') {
			server.lastBeat = Date.now();
			res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
			// Страница всегда собирается заново: документ мог измениться, пока владелец читал.
			return res.end(index ? index() : buildPage({ docPath, live: true }));
		}
		if (req.method === 'GET' && url.pathname === '/doc') {
			const p = resolve(ROOT, url.searchParams.get('p') ?? '');
			if (!p.startsWith(ROOT) || !existsSync(p)) {
				res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
				return res.end('нет такого документа');
			}
			res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
			return res.end(buildPage({ docPath: p, live: true }));
		}
		if (req.method === 'POST' && url.pathname === '/decision') {
			let body = '';
			req.on('data', (c) => (body += c));
			req.on('end', () => {
				try {
					const got = JSON.parse(body);
					const at = new Date().toISOString();
					// Какой документ отвечают, говорит САМА страница (`<body data-doc>`): один сервер
					// обслуживает и одиночный документ, и всю пачку.
					const target = got.doc ? resolve(ROOT, got.doc) : docPath;
					if (!target || !target.startsWith(ROOT) || !existsSync(target))
						throw new Error('документ не найден');

					// I3 — одобрение привязано к байтам тела. Сверяем показанный странице хеш с файлом
					// ПРЯМО СЕЙЧАС: если текст успел измениться, владелец одобрял не то, что уйдёт.
					for (const [id, rec] of Object.entries(got.artifacts || {})) {
						const art = artifactsOf(target).find((a) => a.id === id);
						if (!art?.absolute || !existsSync(art.absolute))
							throw new Error(`тело артефакта «${id}» пропало`);
						const now = bodyHash(art.absolute);
						if (rec.sha256 !== now)
							throw new Error(
								`текст артефакта «${id}» изменился, пока страница была открыта — ` +
									'перезагрузите её и посмотрите новую редакцию',
							);
					}
					const paths = writeDecision({
						docPath: target,
						kind: parseMeta(readMd(target)).kind,
						by: (got.by || BY).trim() || BY,
						at,
						comment: got.comment,
						answers: got.answers || {},
						artifacts: got.artifacts || {},
					});
					res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: true, paths }));
					console.log('\n✅ РЕШЕНИЕ ЗАПИСАНО В ТРИ МЕСТА:');
					console.log('   документ: ' + relative(ROOT, paths.md ?? target));
					console.log('   решение:  ' + relative(ROOT, paths.decision));
					console.log('   архив:    ' + relative(ROOT, paths.archive));
					if (onDecision) onDecision(target, server);
				} catch (e) {
					res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: String(e.message) }));
				}
			});
			return;
		}
		res.writeHead(404).end('нет');
	});
	return server;
}

/** Поднимает сервер на свободном порту и возвращает адрес. */
async function listen(server) {
	const port = Number(opt('--port', '0'));
	await new Promise((r) => server.listen(port, '127.0.0.1', r));
	return `http://127.0.0.1:${server.address().port}/`;
}

/** Открывает ОДИН документ: страница, браузер, сигнал, ожидание ответа. */
/**
 * ПРЕДПОЛЁТНАЯ ПРОВЕРКА: вопрос, отсылающий за своим содержимым наружу, страницу не поднимает.
 * Куплена словом владельца 2026-08-15 — «не собираюсь скролить этот длинный документ»
 * (`lintSelfContained` в `lib/review-core.mjs` несёт полную историю и цену).
 */
function preflight(docPath) {
	const text = readMd(docPath);
	const bad = lintSelfContained(parseInterview(docPath, text), text);
	if (!bad.length) return true;
	console.error('\n⛔ СТРАНИЦА НЕ ПОДНЯТА: вопрос отсылает за своим содержимым НАРУЖУ.\n');
	for (const b of bad) {
		console.error(`   ${b.label} — ${relative(ROOT, docPath)}:${b.line}`);
		console.error(`      ${b.text}`);
	}
	console.error(
		'\n   Слово владельца, ради которого стоит эта проверка:\n' +
			'   «Пиши прямо в вопросе то, что предлагаешь взять. Я не собираюсь скролить этот\n' +
			'    длинный документ и искать „вон ту формулу“».\n\n' +
			'   Лечение: перенеси текст ВНУТРЬ вопроса. Если отсылка законна — объяви её в строке:\n' +
			'   <!-- ССЫЛКА-ОК: причина -->\n',
	);
	return false;
}

async function cmdOpen(docPath) {
	if (!preflight(docPath)) return 1;
	const server = startServer({
		docPath,
		// Сервер одного документа живёт ровно до записи решения: поднялся → записал → умер.
		onDecision: (_, srv) => setTimeout(() => srv.close(() => process.exit(0)), 2500),
	});
	const url = await listen(server);

	const parsed = parseInterview(docPath, readMd(docPath));
	const open = parsed.questions.filter((q) => !q.answered).length;
	console.log(`\nСтраница поднята: ${url}`);
	console.log(`Документ: ${relative(ROOT, docPath)} · ждут ответа: ${open}`);

	if (!flag('--no-open')) openBrowser(url);

	// I5 — сигнал ПОСЛЕ того, как страница поднята и открыта. Не раньше.
	// Намеренно БЕЗ await: синтез речи занимает секунды, а сервер уже слушает — ждать его значило
	// бы держать первый запрос браузера в очереди и показать владельцу пустую вкладку.
	if (!flag('--no-signal')) {
		const { kind, title } = scopeOf(docPath, parseMeta(readMd(docPath)));
		void signal(
			`Николай, вас зовёт ${kind}${title ? `: ${title}` : ''}. ` +
				`${open} ${plural(open, 'вопрос', 'вопроса', 'вопросов')} без ответа.`,
		);
	}

	console.log(`\nЖду ответа ${waitPhrase()}. Ctrl+C — прекратить, документ не изменится.`);
	watchIdle(server);
	return url;
}

/**
 * Что именно произносит голос (решение владельца, интервью №011, В2, дословно): «читать название
 * документа, скоупа вопросов, по которому зовут. Макет, интервью, эпик, баг, выкатка в прод и
 * так далее».
 *
 * Тип берётся из метаблока, если он есть, иначе — из директории документа: она на этом проекте и
 * ЕСТЬ скоуп (`bugs/` — баг, `plans/` — план, `design/` — макеты). Из заголовка снимается
 * служебный префикс «Интервью №011 — »: тип мы уже назвали словом, и повторять его — только
 * удлинять речь, за что владелец и не любит длинные сигналы.
 */
export function scopeOf(docPath, meta) {
	const rel = relative(ROOT, docPath).split('\\').join('/');
	const byDir = rel.startsWith('interviews/')
		? 'интервью'
		: rel.startsWith('bugs/')
			? 'баг'
			: rel.startsWith('plans/')
				? 'план'
				: rel.startsWith('ideas/')
					? 'идея'
					: rel.startsWith('researches/')
						? 'исследование'
						: rel.startsWith('design/')
							? 'макеты'
							: rel.startsWith('homeworks/')
								? 'домашка'
								: 'документ';
	const kind = meta?.kind === 'outbound' ? 'черновик отправки' : byDir;
	let title = String(meta?.title ?? '').replace(/^[^—:]{0,40}[—:]\s*/u, '').trim();
	if (title.length > 90) title = title.split(/[.:—]/u)[0].trim();
	return { kind, title };
}

/** Сравнение путей без оглядки на регистр и слэши — Windows отдаёт их по-разному. */
const samePath = (a, b) => resolve(a).toLowerCase() === resolve(b ?? '').toLowerCase();

const plural = (n, a, b, c) => {
	const m10 = n % 10;
	const m100 = n % 100;
	if (m10 === 1 && m100 !== 11) return a;
	if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return b;
	return c;
};

/** Снимает страницу в файл — самодостаточную и открывающуюся офлайн. */
function cmdRender(docPath) {
	// Та же предполётная проверка, что и у `open`: офлайн-страница отнимает время владельца
	// ровно так же, как живая, и отсылка «см. выше» в ней ничем не лучше.
	if (!preflight(docPath)) return 1;
	const outDir = join(ROOT, 'test-results', 'owner-reviews');
	mkdirSync(outDir, { recursive: true });
	const out = opt('--out', join(outDir, basename(docPath).replace(/\.md$/, '.html')));
	writeFileSync(out, buildPage({ docPath, live: false }), 'utf8');
	console.log(relative(ROOT, out));
	return out;
}

/** Все интервью, ждущие владельца. Это исполняемая команда ритуала, а не украшение. */
function cmdList() {
	const dir = join(ROOT, 'interviews');
	const files = readdirSyncSafe(dir)
		.filter((f) => f.startsWith('interview_') && f.endsWith('.md'))
		.sort();
	let waiting = 0;
	console.log('ИНТЕРВЬЮ, ЖДУЩИЕ ВЛАДЕЛЬЦА\n');
	for (const f of files) {
		const p = join(dir, f);
		const iv = parseInterview(p, readMd(p));
		if (!iv.waiting) continue;
		waiting++;
		const open = iv.questions.filter((q) => !q.answered);
		console.log(`  🟡 interviews/${f}`);
		console.log(`     ${iv.status}`);
		for (const q of open) console.log(`     ⛔ ${q.title}`);
		console.log(`     открыть: node tools/review.mjs open interviews/${f}\n`);
	}
	if (!waiting) console.log('  ✅ ни одного — очередь владельца пуста.');
	return waiting;
}

function readdirSyncSafe(d) {
	try {
		return readdirSync(d);
	} catch {
		return [];
	}
}

/**
 * Ставит документ в очередь (I7). Автономный цикл НИКОГДА не стоит у открытой страницы: он
 * паркует документ и идёт к следующей незаблокированной работе, а зовут владельца один раз на пачку.
 */
function cmdQueue(docPath) {
	mkdirSync(DECISIONS_DIR, { recursive: true });
	const rel = relative(ROOT, docPath).split('\\').join('/');
	const q = existsSync(QUEUE_FILE) ? JSON.parse(readFileSync(QUEUE_FILE, 'utf8')) : { items: [] };
	if (!q.items.some((i) => i.doc === rel)) {
		q.items.push({ doc: rel, поставлен: new Date().toISOString() });
		writeFileSync(QUEUE_FILE, JSON.stringify(q, null, '\t') + '\n', 'utf8');
		console.log(`В очередь: ${rel} (всего накоплено: ${q.items.length})`);
	} else {
		console.log(`Уже в очереди: ${rel} (всего накоплено: ${q.items.length})`);
	}
	return q.items.length;
}

/** Одна страница «накопилось N» — карточка на документ, сигнал ОДИН раз на пачку (I7). */
async function cmdBatch() {
	const q = existsSync(QUEUE_FILE) ? JSON.parse(readFileSync(QUEUE_FILE, 'utf8')) : { items: [] };
	// Из очереди выпадает всё, на что владелец уже ответил — иначе пачка растёт вечно.
	const live = q.items.filter((i) => {
		const p = join(ROOT, i.doc);
		if (!existsSync(p)) return false;
		return parseInterview(p, readMd(p)).waiting;
	});
	if (!live.length) {
		console.log('Очередь пуста — звать владельца незачем.');
		return 0;
	}

	/**
	 * Страница пачки. 🔑 Карточка — ССЫЛКА, а не инструкция: владелец не должен печатать команду,
	 * чтобы перейти от списка к вопросу. Первая редакция печатала на карточке
	 * `node tools/review.mjs open …` — это тот же порок «расскажу вместо сделаю», ради устранения
	 * которого контур и строился.
	 */
	const batchPage = () => {
		const cards = live
			.map((i) => {
				const p = join(ROOT, i.doc);
				const iv = parseInterview(p, readMd(p));
				const open = iv.questions.filter((x) => !x.answered);
				const { kind } = scopeOf(p, parseMeta(readMd(p)));
				return `<a class="q card-link" href="/doc?p=${encodeURIComponent(i.doc)}">
				<div class="qhead"><span class="tag ${open.length ? 'open' : 'ok'}">${open.length ? 'ждёт вас' : 'отвечено'}</span>
				<h3 style="margin:0">${esc(parseMeta(readMd(p)).title)}</h3></div>
				<p class="meta">${esc(kind)} · ${esc(i.doc)} · без ответа: ${open.length} из ${iv.questions.length}
					· в очереди с ${esc(String(i.поставлен).slice(0, 10))}</p>
				${open.length ? '<ul>' + open.map((x) => `<li>${esc(x.title)}</li>`).join('') + '</ul>' : ''}
			</a>`;
			})
			.join('\n');

		return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Накопилось: ${live.length}</title><style>${STYLE}
a.card-link{display:block;text-decoration:none;color:inherit}
a.card-link:hover{border-color:var(--accent)}
</style></head><body><div class="wrap">
<header class="top"><h1>Накопилось ${live.length} ${plural(live.length, 'документ', 'документа', 'документов')}</h1>
<div class="asks">Спрашивает ИИ-агент <b>${esc(PROJECT)}</b> · ${esc(stamp())}</div>
<div class="pills">
	<span class="pill wait">ждут вас: ${live.reduce((n, i) => n + parseInterview(join(ROOT, i.doc), readMd(join(ROOT, i.doc))).questions.filter((x) => !x.answered).length, 0)}</span>
	<span class="pill zero">документов: ${live.length}</span>
</div>
<div class="meta">Пока вы были заняты, агент работал и складывал сюда всё, что решать не вправе.
Нажмите карточку — откроется сам документ.</div>
</header>${cards}</div></body></html>`;
	};

	// `--no-serve` — снять пачку в файл и выйти. Нужен не для красоты: без него команда НИКОГДА не
	// завершается (сервер живёт до срока), и всякий, кто зовёт её синхронно, виснет намертво. Ровно
	// это и случилось с собственным QA-прогоном контура — четыре осиротевших процесса держали порты.
	if (flag('--no-serve')) {
		const outDir = join(ROOT, 'test-results', 'owner-reviews');
		mkdirSync(outDir, { recursive: true });
		const out = join(outDir, 'batch.html');
		writeFileSync(out, batchPage(), 'utf8');
		console.log(`Пачка собрана в файл: ${relative(ROOT, out)} (${live.length})`);
		return 0;
	}

	/**
	 * 🔑 «СОХРАНИТЬ» БУДИТ АГЕНТА. Слово владельца, дословно: «если я дал ответы, нажал сохранить —
	 * оно должно дёргать тебя».
	 *
	 * Как это устроено технически: агент узнаёт о событии, когда ЗАВЕРШАЕТСЯ запущенный им процесс.
	 * Значит контур обязан завершиться сразу после записи решения — иначе ответ лежит записанным, а
	 * за ним никто не приходит (ровно это и случилось: пачка держала сервер три часа).
	 *
	 * Отсюда правило, одинаковое для одиночного документа и для пачки: ЛЮБОЕ сохранение закрывает
	 * контур. Если в очереди осталось неотвеченное — это забота АГЕНТА поднять страницу заново, а
	 * не владельца держать вкладку открытой.
	 */
	const server = startServer({
		index: batchPage,
		onDecision: (target, srv) => {
			const rest = live.filter((i) => {
				const p = join(ROOT, i.doc);
				return existsSync(p) && !samePath(p, target) && parseInterview(p, readMd(p)).waiting;
			});
			console.log(
				rest.length
					? `\n📌 Осталось ждать владельца: ${rest.length} — подними пачку заново.`
					: '\n✅ Очередь пуста.',
			);
			setTimeout(() => srv.close(() => process.exit(0)), 2500);
		},
	});
	const url = await listen(server);
	console.log(`Пачка поднята: ${url} (${live.length})`);
	// 🔴 ЗДЕСЬ БЫЛИ ВТОРЫЕ ЧАСЫ, И ПЕРВАЯ РЕДАКЦИЯ ФИКСА `bugs/110` ИХ НЕ УВИДЕЛА.
	// Починка одиночной страницы прошла мимо пачки, потому что у пачки другое сообщение в логе —
	// и правка по тексту его не нашла. А с новым умолчанием `--timeout 0` это стало ХУЖЕ, чем
	// было: `setTimeout(…, 0)` срабатывает НЕМЕДЛЕННО, и страница пачки закрывалась бы сразу
	// после открытия. Класс дефекта: правишь пару близнецов — правь ОБОИХ, ищи по механизму
	// (`TIMEOUT_MIN * 60_000`), а не по тексту сообщения.
	watchIdle(server);

	if (!flag('--no-open')) openBrowser(url);
	// Здесь await обязателен: команда `batch` завершается сразу, и без ожидания процесс умер бы
	// раньше, чем синтезатор успел открыть рот.
	if (!flag('--no-signal')) {
		// Пачка тоже называет, ЧЕМ именно она набрана: «два интервью и баг» полезнее, чем «три
		// документа», — по этому голос и решают, идти сейчас или после дела (интервью №011, В2).
		const kinds = live.map((i) => scopeOf(join(ROOT, i.doc), parseMeta(readMd(join(ROOT, i.doc)))).kind);
		const uniq = [...new Set(kinds)].join(', ');
		await signal(
			`Николай, накопилось ${live.length} ${plural(live.length, 'документ', 'документа', 'документов')} ` +
				`на вашу вычитку: ${uniq}.`,
		);
	}
	console.log(`\nЖду ответов ${waitPhrase()}. Ctrl+C — прекратить, документы не изменятся.`);
	// null означает «сервер жив»: процесс не завершается, иначе страница умрёт вместе с ним.
	return null;
}

// ─────────────────────────────────────────────────────────────────────────────

function usage() {
	console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?|^ \* ?/gm, ''));
}

async function main() {
	if (flag('--selftest')) {
		const fails = selftest();
		console.log(fails.length ? '🔴 ПРОВАЛЫ:\n  ' + fails.join('\n  ') : '✅ самотест ядра чист');
		return fails.length ? 1 : 0;
	}
	const [cmd, arg] = positional;
	const docPath = arg ? resolve(ROOT, arg) : null;
	if (docPath && !existsSync(docPath)) {
		console.error(`Нет такого документа: ${arg}`);
		return 1;
	}

	switch (cmd) {
		/*
		 * 🔴 КОД ВОЗВРАТА ОБЯЗАН ДОЕХАТЬ. Здесь стояло `await cmdOpen(docPath); return null;` и
		 * `cmdRender(docPath); return 0;` — возвращаемое значение отбрасывалось. Предполётная
		 * проверка самодостаточности печатала «⛔ СТРАНИЦА НЕ ПОДНЯТА» и выходила С НУЛ�ём:
		 * страж краснел на глаз и зеленел для машины.
		 *
		 * Поймано СУДЬЁЙ (`/fable-judge`) в тот же день, что и написано, — при перепрогоне
		 * мутации: лечение было заявлено как «дверь отказывает», а отказывала только печать.
		 * Цена, если бы уехало: автономный цикл делает `review.mjs open X && дальше` и идёт
		 * дальше как ни в чём не бывало, считая страницу поднятой.
		 */
		case 'open': {
			if (!docPath) return usage(), 1;
			const code = await cmdOpen(docPath);
			// null — сервер жив, выход произойдёт после записи решения; число — отказ предполёта.
			return code === undefined ? null : code;
		}
		case 'render': {
			if (!docPath) return usage(), 1;
			// cmdRender отдаёт ПУТЬ к снимку при успехе и 1 при отказе предполёта — приводим к коду
			// явно: `?? 0` пропустил бы строку пути прямиком в `process.exit`.
			const r = cmdRender(docPath);
			return r === 1 ? 1 : 0;
		}
		case 'list':
			cmdList();
			return 0;
		case 'queue':
			if (!docPath) return usage(), 1;
			cmdQueue(docPath);
			return 0;
		case 'batch':
			return await cmdBatch();
		default:
			usage();
			return 1;
	}
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
	const code = await main();
	if (code !== null) process.exit(code);
}

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
 *   node tools/review.mjs close <документ.md>   закрыть живую страницу (отказ кодом 4, пока владелец пишет;
 *                                               --force только с --owner-word "<дословно>")
 *   node tools/review.mjs render <документ.md>  снять страницу в файл (самодостаточный, офлайн)
 *   node tools/review.mjs list                  все интервью, ждущие владельца
 *   node tools/review.mjs queue <документ.md>   поставить в очередь (для автономных циклов)
 *   node tools/review.mjs batch                 одна страница «накопилось N» на всю очередь
 *   node tools/review.mjs --selftest            самотест ядра и стражей контура
 *
 * Флаги: --by "Имя" · --voice "Имя голоса" · --no-signal · --no-open · --timeout МИН · --port N
 *
 * Запуск: node tools/review.mjs · самотест: --selftest
 */

import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync, statSync, createReadStream, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, relative, resolve, basename, dirname, sep } from 'node:path';
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
	batchExitAfterDecision,
	docRevision,
	questionPrint,
	lockPathOf,
	readLock,
	lockState,
	closeVerdict,
	mapDraft,
	stablePort,
	sameAsRecorded,
	readDecision,
	decisionPath as decisionPathOf,
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
// Файл очереди пачки: общий queue.json либо `--queue <файл>` — флаг ради ЖИВОГО теста пачки
// (`tools/review-batch.test.mjs`): прогон поднимает пачку из подложных документов, не трогая очередь владельца.
const QUEUE = opt("--queue") ? resolve(ROOT, opt("--queue")) : QUEUE_FILE;
import { pruneQueue } from './lib/review-core.mjs'; // bugs/NEW_review_queue_keeps_answered
// Сколько пачка живёт после ПОСЛЕДНЕГО ответа без единого пульса от вкладок владельца. Живой тест
// ставит секунду; для человека — полминуты: пока вкладка открыта, страница не имеет права умереть.
const GRACE_MS = Number(opt('--grace', '30000'));

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
/* Шапка НЕ липкая — уезжает со всем содержимым (слово владельца 2026-09-04: «верхняя шапка
   интерактивного контура должна быть не стики, а скролиться вместе со всем контентом»).
   Была position:sticky;top:0;z-index:5 — на длинном интервью она съедала верх экрана и
   отвлекала от вопроса, который читают.
   ВНИМАНИЕ: этот CSS живёт внутри шаблонной строки JS — обратных кавычек здесь быть не может,
   они обрывают литерал (поймано на этой же правке: SyntaxError на строке 149). */
header.top{background:var(--bg);border-bottom:1px solid var(--line);
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
.clip{margin:.6em 0;display:inline-block;vertical-align:top;width:min(100%,300px);margin-right:12px}
.clip video{width:100%;aspect-ratio:9/16;background:#000;border:1px solid var(--line);border-radius:10px;display:block}
.clip figcaption{color:var(--dim);font-size:.82rem;margin-top:4px}
.shot{margin:.6em 0;display:block}
.shot img{width:100%;height:auto;border:1px solid var(--line);border-radius:10px;display:block}
.shot figcaption{color:var(--dim);font-size:.82rem;margin-top:4px}
.q.whole{border-style:dashed}
.note.ok{border-color:var(--ok);color:var(--ok)}
.note.bad{border-color:var(--bad);color:var(--bad)}
/* ПЛАШКА «ЭТА СТРАНИЦА БОЛЬШЕ НЕ ПРИНИМАЕТ ОТВЕТЫ» (bugs/NEW_review_page_stale_tab_accepts_answers): перекрывает страницу
   целиком, а сама страница под ней получает inert — ввод невозможен, а не только не советуется. */
#gate{position:fixed;inset:0;background:rgba(10,12,16,.72);display:flex;align-items:flex-start;justify-content:center;
	padding:48px 16px;z-index:60;overflow:auto}
#gate .box{max-width:720px;width:100%;background:var(--card);color:var(--ink);border:2px solid var(--bad);
	border-radius:14px;padding:18px 20px;box-shadow:0 12px 40px rgba(0,0,0,.35)}
#gate.ok .box{border-color:var(--ok)}
#gate .box b.head{display:block;font-size:1.1rem;margin-bottom:6px}
#gate .box textarea{width:100%;margin-top:8px}
#gate .box button{margin-top:10px;margin-right:8px}
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
/**
 * Адрес файла разрешается ОТ САМОГО ДОКУМЕНТА и лишь затем — от корня проекта.
 *
 * Порядок куплен №055 (`bugs/210`): интервью лежит в `interviews/` и честно писало
 * `../test-results/…` — корневое разрешение уводило `../` ВЫШЕ проекта, файл «не находился»,
 * и владелец получил вопрос «какой макет берём» без единого кадра. Внешние адреса (`http…`)
 * не разрешаются вовсе — они остаются обычными ссылками.
 */
function resolveAsset(src, docDir) {
	const rel = decodeURIComponent(src);
	const near = resolve(docDir, rel);
	if (existsSync(near)) return near;
	const atRoot = resolve(ROOT, rel);
	if (existsSync(atRoot)) return atRoot;
	return null;
}

const isExternal = (src) => /^[a-z][a-z0-9+.-]*:\/\//i.test(src);

function inlineAudio(html, docDir) {
	return html.replace(/<a href="([^"]+\.(wav|mp3|ogg))">([^<]*)<\/a>/g, (m, src, ext, label) => {
		if (isExternal(src)) return m;
		const p = resolveAsset(src, docDir);
		if (!p) return `<span class="meta">нет файла: ${esc(src)}</span>`;
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
function inlineHtmlFrames(html, docDir) {
	return html.replace(/<a href="([^"]+\.html)">([^<]*)<\/a>/g, (m, src, label) => {
		if (isExternal(src)) return m;
		const p = resolveAsset(src, docDir);
		if (!p) return `<span class="meta">нет файла: ${esc(src)}</span>`;
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
function inlineImages(html, docDir) {
	return html.replace(/<a href="([^"]+\.(png|jpe?g|webp|svg))">([^<]*)<\/a>/g, (m, src, ext, label) => {
		if (isExternal(src)) return m;
		const p = resolveAsset(src, docDir);
		if (!p) return `<span class="meta">нет файла: ${esc(src)}</span>`;
		const mime =
			ext === 'svg' ? 'image/svg+xml' : ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : 'image/jpeg';
		const b64 = readFileSync(p).toString('base64');
		return `<figure class="shot"><img src="data:${mime};base64,${b64}" alt="${esc(label)}" loading="lazy"><figcaption>${esc(label)}</figcaption></figure>`;
	});
}

/**
 * Ссылка на ролик `.mp4` превращается в проигрыватель (эпик `plans/90`: ролик владельцу — страницей вычитки).
 *
 * Видео НЕ вшивается, в отличие от картинок и звука: четыре ролика по десяткам мегабайт сделали бы страницу
 * неподъёмной. Файл отдаёт сервер страницы (`/media`, с перемоткой по Range) — только `.mp4` из проекта и из
 * папки студии (`MEDIA_DIRS`). В снимке `render` проигрыватель не играет, и подпись это говорит.
 */
export const MEDIA_DIRS = () => [ROOT, resolve(process.env.NDIM_STUDIO_DIR || 'D:\\work\\ai_sandbox\\ndim-studio')];

export const mediaAllowed = (p) =>
	/\.mp4$/i.test(p) && MEDIA_DIRS().some((dir) => p.toLowerCase().startsWith(`${dir.toLowerCase()}${sep}`));

function inlineVideos(html, docDir, live) {
	return html.replace(/<a href="([^"]+\.mp4)">([^<]*)<\/a>/g, (m, src, label) => {
		if (isExternal(src)) return m;
		const p = resolveAsset(src, docDir);
		if (!p || !mediaAllowed(p)) return `<span class="meta">нет файла: ${esc(src)}</span>`;
		// `#t=0.5` — браузер показывает кадр полусекунды вместо чёрного прямоугольника: вид ролика виден до запуска.
		return `<figure class="clip"><video controls preload="metadata" playsinline src="/media?p=${encodeURIComponent(p)}#t=0.5"></video><figcaption>${esc(label)}${live ? '' : ' · видео играет только на живой странице'}</figcaption></figure>`;
	});
}

/** Отдача ролика с поддержкой Range: без неё браузер играет, но не перематывает. */
function serveMedia(req, res, p) {
	const size = statSync(p).size;
	const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
	if (!m) {
		res.writeHead(200, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-length': size });
		return createReadStream(p).pipe(res);
	}
	const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
	const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
	if (start >= size || start > end) {
		res.writeHead(416, { 'content-range': `bytes */${size}` });
		return res.end();
	}
	res.writeHead(206, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
	return createReadStream(p, { start, end }).pipe(res);
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

	// Отпечаток вопроса и его заголовок едут в разметку: черновик переносится в другую редакцию только на вопрос с тем же
	// текстом, а заголовок нужен блоку «черновик прошлой редакции» (`mapDraft`, план `plans/NEW_review_contour_stale_tab.md`).
	return `
	<section class="q ${q.answered ? 'done' : 'open'}" data-q="${esc(q.label)}" data-qh="${esc(questionPrint(q.title, bodyMd))}" data-title="${esc(q.title)}">
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
<body data-doc="${esc(relPath)}" data-kind="${esc(meta.kind)}" data-rev="${esc(docRevision(docPath))}">
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
// Редакция документа, по которой собрана ЭТА страница (bugs/NEW_review_page_stale_tab_accepts_answers). Черновик хранит
// её и отпечаток каждого вопроса: в другой редакции ответ встанет только на вопрос с тем же текстом.
const myRev = document.body.dataset.rev || '';
// Ответы на вопросы прошлой редакции, которых на этой странице нет: они живут в черновике, пока не записан ответ.
let orphans = [];

function snapshotDraft() {
	const d = { rev: myRev, q: {}, a: {}, comment: '', prev: orphans };
	for (const sec of document.querySelectorAll('[data-q]')) {
		d.q[sec.dataset.q] = {
			qh: sec.dataset.qh || '',
			title: sec.dataset.title || '',
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

// Правило переноса — одно на ядро и на страницу: исходник той же функции, что стерегут юниты tools/review-contour.test.mjs.
${mapDraft.toString()}

/** Ответ из черновика — одной строкой для человека: буква, текст, пометка. */
function draftLine(rec) {
	return [rec.choice ? 'выбор ' + rec.choice : '', rec.text || '', rec.comment ? 'пометка: ' + rec.comment : '']
		.filter(Boolean).join(' · ');
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
	const sections = Array.from(document.querySelectorAll('[data-q]'));
	const mapped = mapDraft(d, sections.map((s) => ({ label: s.dataset.q, qh: s.dataset.qh })), myRev);
	for (const p of mapped.place) {
		const sec = sections.find((s) => s.dataset.q === p.label);
		if (!sec) continue;
		const rec = p.rec;
		pick(sec, rec.choice);
		const t = sec.querySelector('[data-text]');
		if (t && rec.text && !t.value) { t.value = rec.text; n++; }
		const c = sec.querySelector('[data-comment]');
		if (c && rec.comment && !c.value) { c.value = rec.comment; n++; }
	}
	// Ответы на вопросы, которых в этой редакции нет или которые переписаны, — не на чужие места, а блоком с текстом.
	orphans = mapped.orphan.concat(Array.isArray(d.prev) ? d.prev : []);
	if (orphans.length) {
		// '\\n' — скрипт живёт в шаблонной строке: одиночная обратная косая черта стала бы настоящим переводом строки
		// и разорвала бы строковый литерал страницы (поймано разбором встроенного скрипта до живого прогона).
		const lines = orphans.map((o) => o.title + ' — ' + draftLine(o.rec)).join('\\n');
		document.querySelector('.wrap').insertAdjacentHTML('afterbegin',
			'<div class="note" id="orphans"><b>Черновик прошлой редакции.</b> Агент изменил или убрал эти вопросы после того, ' +
			'как Вы на них ответили. Ваши ответы на них — текстом, чтобы ничего не пропало: перенесите нужное в вопросы ниже ' +
			'или скопируйте агенту в чат.<textarea id="orphansText" readonly rows="5" style="width:100%;margin-top:8px"></textarea>' +
			'<div style="margin-top:6px"><button id="orphansCopy" type="button">Скопировать</button></div></div>');
		document.getElementById('orphansText').value = lines;
		document.getElementById('orphansCopy').addEventListener('click', async () => {
			const ta = document.getElementById('orphansText');
			try { await navigator.clipboard.writeText(ta.value); } catch (e) { ta.select(); }
		});
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
	// Причину здесь не называем: черновик возвращается и после неудачной записи, и после смерти сервера до записи, и после
	// «Открыть новую редакцию». Верно во всех трёх одно — черновик стирается только успешной записью, значит до записи
	// эти ответы не дошли (прежнее «Прошлый раз записать не удалось» было неправдой в двух из трёх, кадр rs06 прогона).
	if (n > 0) {
		document.querySelector('.wrap').insertAdjacentHTML('afterbegin',
			'<div class="note ok"><b>Восстановлен черновик.</b> Ваши отметки и тексты, которые ещё не записаны, ' +
			'возвращены на места. Проверьте и нажмите «Сохранить».</div>');
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
function pulseBanner(text, ok) {
	let el = document.getElementById('pulseWarn');
	if (!el) {
		document.querySelector('.wrap').insertAdjacentHTML('afterbegin', '<div id="pulseWarn"></div>');
		el = document.getElementById('pulseWarn');
	}
	el.className = ok ? 'note ok' : 'note';
	el.innerHTML = text;
}
// ── ПЛАШКА «ЭТА СТРАНИЦА БОЛЬШЕ НЕ ПРИНИМАЕТ ОТВЕТЫ» (bugs/NEW_review_page_stale_tab_accepts_answers, S1) ─────────
// Слово владельца: «так какого хуя страницу переписали, новую блять открыли и старую ОСТАВИЛИ!!!! … вот я в сторой
// блять и отвечал!». Прежняя плашка звала «Продолжайте писать» и ввод не блокировала — владелец и писал в страницу,
// которая уже не могла записать. Теперь страница, которая не может записать ответ, перекрывает себя и становится inert:
//   dead      — сервер молчит два пульса подряд;
//   rewritten — сервер жив, но документ переписан: редакция на пульсе не та, что у страницы;
//   closed    — агент закрыл страницу командой close;
//   saved     — ответ записан, сервер по правилу ушёл.
// [TESTED: 2026-09-25 · ручной прогон набора qa/suites/review-stale-tab.md живым Chromium на стенде агента (dev-1):
//   25/25 в 18:48, вывод команд и кадры прочитаны; мутанты А и Б краснеют адресно —
//   qa/reports/2026-09-25_review-stale-tab.md; Chrome владельца с его старыми вкладками не проверен — ждёт первой
//   страницы после мержа]
let lastInput = 0;
let savedOk = false;
let misses = 0;
let gateKind = '';
addEventListener('input', () => { lastInput = Date.now(); });
addEventListener('change', () => { lastInput = Date.now(); });

/** Сколько полей черновика заполнено — пульс несёт это серверу, чтобы close не закрыл страницу с несохранённым. */
function draftFields() {
	let n = document.querySelectorAll('input[type=radio]:checked').length;
	for (const t of document.querySelectorAll('textarea[data-text], textarea[data-comment], #docComment'))
		if (t.value.trim()) n++;
	return n;
}

/** Ответы этой страницы — текстом для плашки: вопрос и то, что владелец отметил или написал. */
function answersText() {
	const d = snapshotDraft();
	const lines = [];
	for (const label in d.q) {
		const rec = d.q[label];
		const line = draftLine(rec);
		if (line) lines.push((rec.title || label) + ' — ' + line);
	}
	if (d.comment) lines.push('Общий комментарий — ' + d.comment);
	return lines.concat(orphans.map((o) => o.title + ' — ' + draftLine(o.rec))).join('\\n');
}

const GATE = {
	dead: ['Сервер агента замолчал — эта страница больше не принимает ответы.',
		'Всё, что Вы уже отметили и написали, сохранено в этом браузере. Когда агент поднимет страницу этого документа ' +
		'заново, эта вкладка оживёт сама, и ответы останутся на местах. Если вкладка не ожила, а агент открыл новую, ' +
		'скопируйте ответы ниже и вставьте их в новую страницу или отправьте агенту в чат.'],
	rewritten: ['Документ переписан — эта страница больше не принимает ответы.',
		'Агент изменил документ после того, как Вы открыли эту страницу. Откройте новую редакцию: ответы на вопросы, ' +
		'которые не изменились, встанут на места сами, а ответы на изменённые вопросы будут показаны отдельным блоком.'],
	closed: ['Агент закрыл эту страницу — она больше не принимает ответы.',
		'Всё, что Вы отметили и написали, сохранено в этом браузере и вернётся на места, когда агент поднимет страницу ' +
		'этого документа заново.'],
	saved: ['Ответ записан — эта страница больше не принимает ответы.',
		'Ответ лёг в документ, файл решения и архив. Если в документе остались вопросы, агент поднимет страницу заново, ' +
		'и черновик вернётся на места.'],
};

function gate(kind) {
	if (gateKind === kind) return;
	gateKind = kind;
	for (const el of document.querySelectorAll('.wrap, .bar')) el.inert = true;
	let g = document.getElementById('gate');
	if (!g) {
		document.body.insertAdjacentHTML('beforeend', '<div id="gate" role="alertdialog" aria-live="assertive"></div>');
		g = document.getElementById('gate');
	}
	g.className = kind === 'saved' ? 'ok' : '';
	g.dataset.kind = kind;
	const text = kind === 'saved' ? '' : answersText();
	g.innerHTML = '<div class="box"><b class="head">' + GATE[kind][0] + '</b><p>' + GATE[kind][1] + '</p>' +
		(kind === 'rewritten' ? '<button id="gateReload" type="button" class="primary">Открыть новую редакцию</button>' : '') +
		(text ? '<p>Ваши ответы этой страницы — текстом:</p><textarea id="gateText" readonly rows="8"></textarea>' +
			'<button id="gateCopy" type="button">Скопировать</button><span id="gateMsg"></span>' : '') +
		'</div>';
	if (text) document.getElementById('gateText').value = text;
	document.getElementById('gateReload')?.addEventListener('click', () => { saveDraft(); location.reload(); });
	document.getElementById('gateCopy')?.addEventListener('click', async () => {
		const ta = document.getElementById('gateText');
		try { await navigator.clipboard.writeText(ta.value); } catch (e) { ta.select(); }
		document.getElementById('gateMsg').textContent = ' скопировано';
	});
}

function ungate() {
	gateKind = '';
	for (const el of document.querySelectorAll('.wrap, .bar')) el.inert = false;
	document.getElementById('gate')?.remove();
}

// Пульс раз в 5 секунд и сразу при возврате на вкладку: скрытой вкладке Chrome урезает таймеры до раза в минуту, а
// владелец, вернувшийся к странице, должен узнать правду ДО первого слова (донор — Unliminium, visibilitychange).
// Два промаха подряд, а не один: краткий сбой не пугает плашкой. Пульс несёт состояние ввода — команда close читает
// его из замка и не закрывает страницу, пока владелец пишет (KAIF 2.7: /alive?i&d&s).
// urgent — стук при возврате на вкладку: владелец вот-вот начнёт писать, и решает ПЕРВЫЙ промах (на Windows отказ
// соединения с закрытым портом localhost приходит лишь через ≈ 2 с — два промаха с паузой дали бы ≈ 5 с, замер
// прогона 2026-09-25 РС-02). Случайный сбой снимет плашку сам: следующий успешный пульс её убирает.
async function beat(urgent) {
	const q = '/alive?doc=' + encodeURIComponent(document.body.dataset.doc || '') + '&rev=' + encodeURIComponent(myRev) +
		'&i=' + (lastInput ? Date.now() - lastInput : -1) + '&d=' + draftFields() + '&s=' + (savedOk ? 1 : 0);
	try {
		const r = await fetch(q, { cache: 'no-store' });
		if (!r.ok) throw new Error('bad status');
		let j = {};
		try { j = await r.json(); } catch (e) {}
		misses = 0;
		if (j.closing) return gate('closed');
		// После записи ответа документ меняется САМОЙ записью — это не «переписан агентом», а «записано».
		if (j.rev && myRev && j.rev !== myRev) return gate(savedOk ? 'saved' : 'rewritten');
		if (gateKind === 'dead') {
			ungate();
			pulseBanner('<b>Связь восстановлена.</b> Можно сохранять — ответы запишутся.', true);
		}
	} catch (e) {
		misses++;
		if (misses === 1 && !urgent) { setTimeout(beat, 1000); return; }
		if (gateKind) return;
		// Ответ уже записан (или на странице нечего записывать) — сервер ушёл по правилу, это не беда
		// (bugs/NEW_review_batch_dies_after_first_answer: плашка «замолчал» над записанным читалась как потеря).
		if (savedOk || document.querySelectorAll('.q.open').length === 0) return gate('saved');
		gate('dead');
	}
}
setInterval(() => beat(false), 5000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') beat(true); });
addEventListener('focus', () => { beat(true); });
beat(false);

const saveBtn = document.getElementById('save');
if (saveBtn) saveBtn.addEventListener('click', async () => {
	const answers = {};
	for (const sec of document.querySelectorAll('[data-q]')) {
		const label = sec.dataset.q;
		const choice = sec.querySelector('input[type=radio]:checked')?.value || '';
		const text = sec.querySelector('[data-text]')?.value.trim() || '';
		const comment = sec.querySelector('[data-comment]')?.value.trim() || '';
		/*
		 * 🔴 КОММЕНТАРИЙ САМ ПО СЕБЕ — ЗАКОННЫЙ ОТВЕТ (bugs/138, слово владельца 2026-08-17).
		 *
		 * Здесь стояло условие «choice ИЛИ text», и оно МОЛЧА ВЫБРАСЫВАЛО слова владельца, если он
		 * написал только в поле комментария, не выбрав букву. Ровно так он и ответил на №036 В3:
		 * «я помню, что мне уже это показывали и я писал свои комментарии, не давал конкретный
		 * ответ, а комментарии написал». В снимке решения приехал один выбор «C», оба текстовых
		 * поля пустые — а страница отчиталась «готово».
		 *
		 * 🔑 И правило уже было записано в этом файле — двумя абзацами ниже, для комментария к
		 * документу целиком: «он САМ ПО СЕБЕ достаточен для сохранения: „ответов нет, но есть что
		 * сказать“ — законный исход вычитки». К вопросу его просто не применили. Это класс
		 * «правило живёт в одном месте и не доехало до близнеца» — и цена его тут максимальная:
		 * контур существует ровно для того, чтобы слова владельца не терялись.
		 */
		if (choice || text || comment) answers[label] = { choice, text, comment };
	}
	const artifacts = {};
	for (const sec of document.querySelectorAll('[data-art]')) {
		const id = sec.dataset.art;
		const status = sec.querySelector('input[type=radio]:checked')?.value || '';
		const text = sec.querySelector('[data-text]')?.value.trim() || '';
		// Хеш едет ТОТ, что страница показала. Сервер сверит его с файлом заново: если текст
		// изменился, пока владелец читал, одобрять нечего — он видел не то (I3).
		// ⚠️ Тот же класс, что выше: замечание к артефакту без выбранного статуса — тоже слова
		// владельца, и терять их нельзя. Статус тогда уезжает пустым, и это честно.
		if (status || text) artifacts[id] = { status, comment: text, sha256: sec.dataset.hash };
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
			// Редакция страницы едет с ответом: сервер отвергнет ответ, собранный по другой редакции документа (S1).
			body: JSON.stringify({ doc: document.body.dataset.doc, rev: myRev, answers, artifacts, comment }),
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
		savedOk = true;
		try { localStorage.removeItem(draftKey); } catch (e) {}
		// РЕЖИМ ПАЧКИ: документ открыт со списка (адрес /doc?p=...), и после записи владельца ждёт
		// СЛЕДУЮЩИЙ документ, а не закрытие вкладки. Возвращаем к списку — он пересобирается сервером
		// и уже показывает этот документ отвеченным. Закрывать вкладку здесь было бы той же ошибкой,
		// что гасить сервер после первого ответа (bugs/NEW_review_batch_dies_after_first_answer).
		// ВНИМАНИЕ: этот скрипт живёт внутри шаблонной строки — обратных кавычек в комментарии быть
		// не может (EXP-0279; поймано на этой же правке второй раз).
		if (location.pathname === '/doc') {
			document.querySelector('.wrap').insertAdjacentHTML('afterbegin',
				'<div class="note ok"><b>Записано.</b> Ответ лёг в три места: сам документ, файл решения и архив. ' +
				'Возвращаю к списку пачки…</div>');
			document.getElementById('status').textContent = 'готово, возвращаю к списку…';
			window.scrollTo({ top: 0, behavior: 'smooth' });
			setTimeout(() => { location.href = '/'; }, 1200);
			return;
		}
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
	} else if (out.stale) {
		// Документ переписан, пока страница была открыта: ответ НЕ записан, и страница говорит это прямо — вместе с текстом
		// ответов на плашке, чтобы ни одно слово владельца не пропало (S1).
		saveBtn.disabled = false;
		document.getElementById('status').textContent = 'НЕ ЗАПИСАНО: документ переписан — откройте новую редакцию';
		gate('rewritten');
	} else {
		document.getElementById('status').textContent = 'ОШИБКА: ' + (out.error || 'неизвестно');
		saveBtn.disabled = false;
	}
});
</script>
</body></html>`;

	// Порядок важен: HTML-рамки первыми — иначе ссылка на макет успела бы стать картинкой.
	const docDir = dirname(docPath);
	return inlineVideos(inlineImages(inlineAudio(inlineHtmlFrames(page, docDir), docDir), docDir), docDir, live);
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
		/*
		 * 🔴 СВОЙ ПРОФИЛЬ ОБЯЗАТЕЛЕН, И ЭТО НЕ УКРАШЕНИЕ (найдено 2026-09-09).
		 *
		 * Без `--user-data-dir` уже запущенный браузер перехватывает команду и открывает её
		 * СВОИМ окном — режим `--app` при этом теряется, а бывает, что не появляется ничего.
		 * Процесс завершается кодом 0, агент докладывает «страница открыта», и владелец видит
		 * пустой экран. Его слова в тот вечер: «*в каком нахуй браузере?*» и «*ТЫ ВРЁШЬ! ТЫ
		 * ЛЖЕЦ!*» — цена ровно этой строки.
		 *
		 * Отдельный профиль делает окно НАШИМ: оно поднимается всегда, живёт своей сессией и
		 * закрывается по `window.close()` (ради чего режим `--app` и выбран). Тот же приём уже
		 * применён к макетам (`%TEMP%
dim-mockups-edge`) — здесь он просто доведён до конца.
		 */
		const profile = join(tmpdir(), 'ndim-review-edge');
		spawn(
			exe,
			[`--app=${url}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--window-size=1100,900'],
			{ detached: true, stdio: 'ignore' },
		).unref();
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
			/*
			 * Пульс отвечает РЕДАКЦИЕЙ документа, который показывает страница, и признаком «агент закрыл страницу» —
			 * страница с другой редакцией перекрывает себя плашкой (S1, `bugs/NEW_review_page_stale_tab_accepts_answers`).
			 * Пульс же ПРИНОСИТ состояние ввода (мс с последнего ввода · заполненных полей · записано ли) — команда
			 * close читает его из замка и не закрывает страницу, пока владелец пишет (KAIF 2.7, `/alive?i&d&s`).
			 */
			const rel = url.searchParams.get('doc');
			const target = rel ? resolve(ROOT, rel) : docPath;
			const rev = target && target.startsWith(ROOT) && existsSync(target) ? docRevision(target) : null;
			const i = Number(url.searchParams.get('i'));
			if (Number.isFinite(i)) {
				server.input = {
					lastInputAt: i >= 0 ? Date.now() - i : server.input?.lastInputAt ?? null,
					draftFields: Number(url.searchParams.get('d')) || 0,
					saved: url.searchParams.get('s') === '1',
				};
				server.onPulse?.();
			}
			res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
			return res.end(JSON.stringify({ ok: true, rev, closing: Boolean(server.closing) }));
		}

		/*
		 * ЗАКРЫТИЕ ЖИВОЙ СТРАНИЦЫ ВЛАДЕЛЬЦА — только своим сервером и только по токену из замка (KAIF 2.7 I46). Отказ 409 с
		 * причиной, пока владелец печатал < 180 с, странице < 180 с или черновик не сохранён; `force` — только со словом
		 * владельца, и оно ложится в лог. Страница узнаёт о закрытии ближайшим пульсом (`closing`) и гаснет плашкой.
		 */
		if (req.method === 'GET' && url.pathname === '/close') {
			if (!server.closeToken || url.searchParams.get('token') !== server.closeToken) {
				res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
				return res.end(JSON.stringify({ ok: false, reason: 'токен не тот — закрывает только команда, прочитавшая ЭТОТ замок' }));
			}
			const force = url.searchParams.get('force') === '1';
			const word = (url.searchParams.get('word') || '').trim();
			const verdict = closeVerdict({ startedAt: server.startedAt, ...(server.input || {}) });
			if (!verdict.ok && !(force && word)) {
				res.writeHead(409, { 'content-type': 'application/json; charset=utf-8' });
				return res.end(JSON.stringify({ ok: false, reason: verdict.reason }));
			}
			if (!verdict.ok) console.log(`\n⚠️ ЗАКРЫТИЕ СИЛОЙ поверх отказа («${verdict.reason}») — слово владельца: «${word}»`);
			server.closing = true;
			res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
			res.end(JSON.stringify({ ok: true }));
			console.log('\n🔒 Страницу закрыл агент командой close — жду пульса, чтобы вкладка узнала об этом, и ухожу.');
			// Два пульса страницы (5 с каждый) — вкладка успевает получить `closing` и погасить себя своей плашкой.
			setTimeout(() => server.close(() => process.exit(2)), 11_000).unref?.();
			return;
		}

		if (req.method === 'GET' && url.pathname === '/') {
			server.lastBeat = Date.now();
			res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
			// Страница всегда собирается заново: документ мог измениться, пока владелец читал.
			return res.end(index ? index() : buildPage({ docPath, live: true }));
		}
		if (req.method === 'GET' && url.pathname === '/media') {
			const p = resolve(url.searchParams.get('p') ?? '');
			if (!mediaAllowed(p) || !existsSync(p)) {
				res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
				return res.end('нет такого ролика');
			}
			server.lastBeat = Date.now();
			return serveMedia(req, res, p);
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

					/*
					 * 🔴 ОТВЕТ ЧУЖОЙ РЕДАКЦИИ НЕ ЗАПИСЫВАЕТСЯ (S1, `bugs/NEW_review_page_stale_tab_accepts_answers`). Страница,
					 * собранная до правки документа, несёт номера вопросов СТАРОЙ редакции — записать их в новую значит
					 * положить ответ владельца не на тот вопрос (№097: шесть вопросов против пяти). Нет редакции вовсе —
					 * страница старой версии контура, отказ тот же. Зазор открыт и в поставляемом KAIF 2.7 (OW6 эпика 2.8).
					 */
					const nowRev = docRevision(target);
					if (got.rev !== nowRev && got.rev && sameAsRecorded(readDecision(target), got)) {
						res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
						res.end(JSON.stringify({ ok: true, duplicate: true, paths: { decision: decisionPathOf(target) } }));
						console.log('\n↩️ Повтор уже записанного ответа — второй записи не делаю: ' + relative(ROOT, target));
						if (onDecision) onDecision(target, server);
						return;
					}
					if (got.rev !== nowRev) {
						res.writeHead(409, { 'content-type': 'application/json; charset=utf-8' });
						res.end(JSON.stringify({
							ok: false,
							stale: true,
							error: got.rev
								? 'документ переписан после того, как страница открылась — ответ НЕ записан; откройте новую редакцию'
								: 'страница старой версии контура — ответ НЕ записан; обновите страницу',
						}));
						console.log(`\n⛔ Ответ отвергнут: редакция страницы ${got.rev || '(нет)'} ≠ редакции документа ${nowRev} — ${relative(ROOT, target)}`);
						return;
					}

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

/**
 * Поднимает сервер и возвращает адрес. Порт — по старшинству: явный `--port` (приборы) → ПОСТОЯННЫЙ порт документа
 * (`stablePort`, донор Unliminium: тот же адрес после перезапуска — черновик и старая вкладка возвращаются) и его соседи
 * +1…+20, когда он занят, — вслух → любой свободный.
 */
async function listen(server, preferred = 0) {
	const tryPort = (p) =>
		new Promise((ok, fail) => {
			const onErr = (e) => { server.off('listening', onOk); fail(e); };
			const onOk = () => { server.off('error', onErr); ok(); };
			server.once('error', onErr);
			server.once('listening', onOk);
			server.listen(p, '127.0.0.1');
		});
	const explicit = opt('--port', null);
	if (explicit !== null) await tryPort(Number(explicit));
	else if (preferred) {
		let up = false;
		for (let k = 0; k <= 20 && !up; k++) {
			try {
				await tryPort(preferred + k);
				up = true;
				if (k)
					console.log(`⚠️ Постоянный порт документа ${preferred} занят — страница на ${preferred + k}. Черновик прежней ` +
						'вкладки этого документа сюда не переедет: он остаётся в её браузере, и её плашка покажет ответы текстом.');
			} catch (e) {
				if (e.code !== 'EADDRINUSE' && e.code !== 'EACCES') throw e;
			}
		}
		if (!up) await tryPort(0);
	} else await tryPort(0);
	return `http://127.0.0.1:${server.address().port}/`;
}

/** Жив ли процесс (EPERM — жив под другим пользователем). */
function pidAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (e) {
		return e.code === 'EPERM';
	}
}

/**
 * ЗАМОК «ОДИН ДОКУМЕНТ — ОДНО ОКНО» (KAIF 2.7 I29, Unliminium): pid · порт · адрес · документ · редакция при подъёме ·
 * момент подъёма · токен закрытия · состояние ввода (его приносит пульс страницы). Живёт рядом с решениями, в git не
 * едет (`.gitignore`). Снимается, когда ответ записан; после смерти процесса остаётся — его читает `open` («процесс мёртв»).
 */
function armLock(server, docPath, url) {
	const lockFile = lockPathOf(docPath);
	server.startedAt = new Date().toISOString();
	server.closeToken = randomBytes(16).toString('hex');
	const rev = docRevision(docPath);
	const write = () => {
		try {
			mkdirSync(DECISIONS_DIR, { recursive: true });
			writeFileSync(lockFile, JSON.stringify({
				pid: process.pid,
				port: server.address().port,
				url,
				doc: relative(ROOT, docPath).split('\\').join('/'),
				rev,
				startedAt: server.startedAt,
				closeToken: server.closeToken,
				...(server.input || {}),
			}, null, '\t') + '\n', 'utf8');
		} catch (e) {
			console.log('⚠️ Замок страницы не записан: ' + e.message);
		}
	};
	server.onPulse = write;
	write();
	return lockFile;
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

/**
 * ПРЕДПОЛЁТНАЯ ПРОВЕРКА 2: страница без единого ЖДУЩЕГО вопроса не поднимается.
 *
 * Куплена словом владельца 2026-08-21 («ноль вопросов без ответов ты мне интерактивный контур
 * открыл. И что ты от меня ждёшь?»). Класс: агент дописал вопросы с заголовком вне канона
 * («### В2-просто.» — Q_HEADING требует «буква+номер+точка»), парсер их не увидел, страница
 * поднялась с «ждут вас: 0», и владелец был позван к пустому столу. Ноль ждущих — это либо
 * «всё отвечено» (поднимать незачем), либо «вопросы-невидимки» (чинить заголовки); обе причины
 * означают отказ, и подсказка называет вторую — она дороже.
 */
function preflightHasOpenQuestions(docPath) {
	const parsed = parseInterview(docPath, readMd(docPath));
	const open = parsed.questions.filter((q) => !q.answered).length;
	if (open > 0) return true;
	console.error('\n⛔ СТРАНИЦА НЕ ПОДНЯТА: ни одного вопроса, ждущего ответа.');
	console.error(`   Вопросов распознано: ${parsed.questions.length}, все отвечены.`);
	console.error(
		'   Если ты только что ДОПИСАЛ вопросы — проверь заголовки: парсер узнаёт только\n' +
			'   форму «### В<номер>.» (буква + номер + точка). «В2-просто.» — невидимка.\n' +
			'   Если документ действительно отвечен целиком — поднимать его незачем.\n',
	);
	return false;
}

/**
 * ПРЕДПОЛЁТНАЯ ПРОВЕРКА 3: страница, ссылающаяся на файл, которого НЕТ, не поднимается.
 *
 * Куплена №055 (`bugs/210`, слово владельца дословно в баге): вопрос «какой макет берём»
 * поднялся без единого кадра — картинки «не находились» и тихо деградировали в подпись
 * «нет файла». Для ВИЗУАЛЬНОГО выбора это пустой стол; «есть в md» и «дошло до глаз» —
 * разные факты, и проверяется здесь второй.
 */
function preflightAssets(docPath) {
	const text = readMd(docPath);
	const docDir = dirname(docPath);
	const missing = [];
	const seen = new Set();
	const ASSET_REF = /!?\[[^\]]*\]\(([^)\s]+\.(?:png|jpe?g|webp|svg|wav|mp3|ogg|html|mp4))\)/gi;
	for (const m of text.matchAll(ASSET_REF)) {
		const src = m[1];
		if (isExternal(src) || seen.has(src)) continue;
		seen.add(src);
		const p = resolveAsset(src, docDir);
		// Ролик вне проекта и папки студии сервер страницы не отдаст — для владельца это тот же пустой стол.
		if (!p || (/\.mp4$/i.test(src) && !mediaAllowed(p))) missing.push(src);
	}
	if (!missing.length) return true;
	console.error('\n⛔ СТРАНИЦА НЕ ПОДНЯТА: она ссылается на файлы, которых НЕТ.\n');
	for (const s of missing) console.error(`   нет файла: ${s}`);
	console.error(
		'\n   Кадры и макеты — СОДЕРЖИМОЕ вопроса: без них владелец получает пустой стол\n' +
			'   (уже случилось на выборе макета двери корня — `bugs/210`).\n\n' +
			'   Лечение: поправь путь (он разрешается от самого документа, затем от корня\n' +
			'   проекта) либо положи файл на место.\n',
	);
	return false;
}

async function cmdOpen(docPath) {
	if (!preflight(docPath)) return 1;
	if (!preflightHasOpenQuestions(docPath)) return 1;
	if (!preflightAssets(docPath)) return 1;

	// Одно окно на документ: живая страница — второе окно не поднимается; агент говорит, где она, и чем её закрыть.
	const held = readLock(lockPathOf(docPath));
	const state = lockState(held, pidAlive);
	if (state === 'live') {
		console.log(`\nСтраница этого документа уже открыта: ${held.url} (pid ${held.pid}) — второе окно не поднимаю.`);
		if (held.rev && held.rev !== docRevision(docPath))
			console.log('Документ изменён после подъёма: открытая страница сама покажет владельцу «Документ переписан» ' +
				'ближайшим пульсом (≤ 5 с) и откроет новую редакцию по его кнопке — на месте, в той же вкладке.');
		console.log(`Закрыть её — только командой: node tools/review.mjs close ${relative(ROOT, docPath).split('\\').join('/')}`);
		return 0;
	}
	if (state === 'stale')
		console.log(`\nПрежняя страница этого документа (pid ${held.pid}) не работает — поднимаю на её же адресе, ` +
			'чтобы её вкладка ожила, а черновик владельца вернулся на места.');

	const server = startServer({
		docPath,
		// Сервер одного документа живёт ровно до записи решения: поднялся → записал → снял замок → умер.
		onDecision: (_, srv) =>
			setTimeout(() => {
				rmSync(lockPathOf(docPath), { force: true });
				srv.close(() => process.exit(0));
			}, 2500),
	});
	const url = await listen(server, stablePort(relative(ROOT, docPath)));
	armLock(server, docPath, url);

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
 * ЗАКРЫТЬ ЖИВУЮ СТРАНИЦУ ВЛАДЕЛЬЦА — единственная законная дверь (KAIF 2.7 I46; `bugs/NEW_review_page_stale_tab_accepts_answers`:
 * агент дважды гасил процесс страницы №097, не узнав, пишет ли в ней владелец). Печатает адрес · pid · документ; просит СВОЙ
 * сервер страницы закрыться по токену из замка; сервер отказывает (здесь — код 4), пока владелец печатал < 180 с, странице
 * < 180 с или черновик не сохранён. `--force` — только со словом владельца `--owner-word "<дословно>"`, оно ложится в лог
 * сервера. Процесс по pid из файла не убивается никогда; окно браузера не трогается — черновик остаётся в нём.
 * [TESTED: 2026-09-25 · ручной прогон набора qa/suites/review-stale-tab.md живым Chromium на стенде агента (dev-1):
 *   25/25 в 18:48, вывод команд и кадры прочитаны; мутанты А и Б краснеют адресно —
 *   qa/reports/2026-09-25_review-stale-tab.md; Chrome владельца с его старыми вкладками не проверен — ждёт первой
 *   страницы после мержа]
 */
async function cmdClose(docPath) {
	// `--force` без слова владельца — ошибка вызова при ЛЮБОМ состоянии страницы: проверка стоит первой, чтобы отказ не
	// зависел от того, жива ли страница (мутант «отказ снят» закрывал страницу раньше, и РС-09 молча отвечал «закрывать нечего»).
	const force = flag('--force');
	const word = opt('--owner-word', '') || '';
	if (force && !word.trim()) {
		console.error('⛔ --force только со словом владельца: --owner-word "<дословно>".');
		return 1;
	}
	const held = readLock(lockPathOf(docPath));
	const state = lockState(held, pidAlive);
	if (state !== 'live') {
		console.log(state === 'none'
			? 'Страница этого документа не открыта — закрывать нечего.'
			: `Страница этого документа не работает (pid ${held.pid} не отвечает) — закрывать нечего; адрес в замке: ${held.url}`);
		return 0;
	}
	console.log(`Страница: ${held.url} · pid ${held.pid} · ${held.doc} — сверь с той, о которой говорил владельцу.`);
	let res;
	try {
		res = await fetch(`${held.url}close?token=${encodeURIComponent(held.closeToken)}` +
			(force ? `&force=1&word=${encodeURIComponent(word)}` : ''));
	} catch (e) {
		console.error(`⛔ Сервер страницы не ответил: ${e.message}`);
		return 1;
	}
	const j = await res.json().catch(() => ({}));
	if (res.ok) {
		console.log(`closed ${held.doc} — вкладка погаснет своей плашкой ближайшим пульсом; черновик владельца остаётся в его браузере.`);
		return 0;
	}
	console.log(`⛔ НЕ ЗАКРЫТО: ${j.reason || 'код ' + res.status}. Страницу держит владелец — дождись его ответа или спроси его в чате.`);
	return 4;
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
	// Те же предполётные проверки, что и у `open`: офлайн-страница отнимает время владельца
	// ровно так же, как живая, и отсылка «см. выше» или пропавший кадр в ней ничем не лучше.
	if (!preflight(docPath)) return 1;
	if (!preflightAssets(docPath)) return 1;
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
/** Документ очереди существует и ждёт владельца — тот же признак, что у `npm run questions`. */
function queueItemWaiting(item) {
	const p = join(ROOT, item.doc);
	if (!existsSync(p)) return false;
	return parseInterview(p, readMd(p)).waiting;
}

/** Читает очередь и сразу вычищает отвеченные (`bugs/NEW_review_queue_keeps_answered`). */
function readQueuePruned() {
	const q = existsSync(QUEUE) ? JSON.parse(readFileSync(QUEUE, 'utf8')) : { items: [] };
	const { live, dropped } = pruneQueue(q.items, queueItemWaiting);
	if (dropped.length) {
		writeFileSync(QUEUE, JSON.stringify({ ...q, items: live }, null, '\t') + '\n', 'utf8');
		console.log(`Из очереди убрано отвеченных или исчезнувших: ${dropped.length}`);
	}
	return { ...q, items: live };
}

function cmdQueue(docPath) {
	mkdirSync(DECISIONS_DIR, { recursive: true });
	const rel = relative(ROOT, docPath).split('\\').join('/');
	const q = readQueuePruned();
	if (q.items.some((i) => i.doc === rel)) {
		console.log(`Уже в очереди: ${rel} (всего накоплено: ${q.items.length})`);
		return q.items.length;
	}
	const item = { doc: rel, поставлен: new Date().toISOString() };
	// Отвеченный документ в очередь не кладётся: пачка его всё равно не покажет, а число соврёт.
	if (!queueItemWaiting(item)) {
		console.log(`Не в очередь: ${rel} — документ не ждёт владельца (всего накоплено: ${q.items.length})`);
		return q.items.length;
	}
	q.items.push(item);
	writeFileSync(QUEUE, JSON.stringify(q, null, '\t') + '\n', 'utf8');
	console.log(`В очередь: ${rel} (всего накоплено: ${q.items.length})`);
	return q.items.length;
}

/** Одна страница «накопилось N» — карточка на документ, сигнал ОДИН раз на пачку (I7). */
async function cmdBatch() {
	// Из очереди выпадает всё, на что владелец уже ответил, — и выпадает ИЗ ФАЙЛА, а не только из
	// показа (`bugs/NEW_review_queue_keeps_answered`): иначе список копит отвеченные вечно.
	const q = readQueuePruned();
	const live = q.items;
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
</header>${cards}</div>
<script>
// Пульс списка: пока эта вкладка открыта, сервер пачки живёт (после последнего ответа он ждёт
// тишины пульса GRACE_MS, а не уходит по таймеру). Без пульса список умирал бы под открытой вкладкой.
setInterval(function () { fetch('/alive', { cache: 'no-store' }).catch(function () {}); }, 10000);
</script></body></html>`;
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
	 * 🔴 НО ДЛЯ ПАЧКИ ЭТО ПРАВИЛО БЫЛО ПРОЧИТАНО СЛИШКОМ БУКВАЛЬНО — И СЛОМАЛО КОНТУР У ВЛАДЕЛЬЦА
	 * (2026-09-05, `bugs/NEW_review_batch_dies_after_first_answer`). Прежняя редакция гасила сервер
	 * после ЛЮБОГО сохранения — в том числе когда в пачке оставались документы без ответа. Владелец
	 * ответил на первый документ, перешёл ко второму, третьему — и получил «Сервер агента замолчал»,
	 * а два вопроса третьего документа так и не записались. Его слова: «*опять сломался твой
	 * интерактивный контур*».
	 *
	 * Правило теперь такое: пачка живёт, пока в ней есть хоть один документ без ответа, и умирает
	 * по сохранению ПОСЛЕДНЕГО — оно и есть событие «владелец закончил», которое будит агента.
	 * Промежуточные сохранения пишутся на диск сразу (агент видит их файлами), а страница уводит
	 * владельца обратно к списку пачки. Решение о выходе — чистая функция `batchExitAfterDecision`
	 * (`lib/review-core.mjs`), у неё есть юнит.
	 */
	const server = startServer({
		index: batchPage,
		onDecision: (target, srv) => {
			// «Без ответа» судится ПО ВОПРОСАМ, а не по строке статуса: статус «ЖДЁТ ОТВЕТА» переписывает
			// агент руками уже после ответов, и по нему только что отвеченный документ всё ещё «ждёт» —
			// с такой мерой пачка не закрылась бы никогда (поймано живым тестом с первого прогона).
			const rest = live
				.map((i) => join(ROOT, i.doc))
				.filter((p) => existsSync(p) && !samePath(p, target) && parseInterview(p, readMd(p)).questions.some((q) => !q.answered))
				.map((p) => relative(ROOT, p));
			if (batchExitAfterDecision(rest)) {
				// Очередь пуста, но вкладки владельца ещё открыты и бьют пульсом: закрыться СЕЙЧАС значит
				// показать ему «сервер замолчал» над только что записанным (второй кадр владельца
				// 2026-09-05). Ждём, пока пульс стихнет на GRACE_MS — то есть пока он сам закроет вкладки.
				console.log(`\n✅ Очередь пуста — пачка закроется, когда вкладки будут закрыты (${GRACE_MS / 1000} с без пульса).`);
				srv.lastBeat = Date.now();
				const grace = setInterval(() => {
					if (Date.now() - srv.lastBeat < GRACE_MS) return;
					clearInterval(grace);
					srv.close(() => process.exit(0));
				}, 1000);
				return;
			}
			console.log(`\n📌 Записано. В пачке ещё без ответа: ${rest.length} — сервер живёт, страница ждёт.`);
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
			const result = await cmdOpen(docPath);
			// 🔴 ТОЛЬКО ЧИСЛО — это код возврата. `cmdOpen` при успехе отдаёт АДРЕС поднятой
			// страницы (строку), и прежняя проверка `=== undefined` пропускала его прямиком в
			// `process.exit('http://127.0.0.1:58239/')` — Node падал на этом, сервер умирал через
			// миг после того, как браузер уже открылся, и владелец видел ERR_CONNECTION_REFUSED.
			// Поймано владельцем на живой домашке 2026-08-15 (`bugs/128`). Проверяем ТИП, а не
			// частное значение: контракт «число = отказ предполёта, всё прочее = сервер жив».
			return typeof result === 'number' ? result : null;
		}
		case 'render': {
			if (!docPath) return usage(), 1;
			// cmdRender отдаёт ПУТЬ к снимку при успехе и 1 при отказе предполёта — приводим к коду
			// явно: `?? 0` пропустил бы строку пути прямиком в `process.exit`.
			const r = cmdRender(docPath);
			return r === 1 ? 1 : 0;
		}
		case 'close':
			if (!docPath) return usage(), 1;
			return await cmdClose(docPath);
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

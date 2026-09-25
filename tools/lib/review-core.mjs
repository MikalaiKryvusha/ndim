/**
 * review-core.mjs — ЯДРО КОНТУРА ВЫЧИТКИ ВЛАДЕЛЬЦА.
 *
 * Здесь живёт всё, что ОБЯЗАНО быть одинаковым у страницы и у отправщика: нормализация текста,
 * хеш тела, разбор документа, пути решений. Модуль один намеренно.
 *
 * 🔴 ПОЧЕМУ ОДИН — САМЫЕ ДОРОГИЕ ГРАБЛИ РЕГЛАМЕНТА (`owner-reviews`, №1):
 *   «the page hashing file bytes while the sender hashed normalized text (trailing \n stripped);
 *    both self-tests green, the gate would refuse every artifact always.»
 * Две реализации хеша расходятся молча, оба самотеста при этом зелёные, а гейт отказывает ВСЕГДА.
 * Поэтому нормализация объявлена здесь как единственный контракт, и обе стороны зовут одну функцию.
 *
 * Инварианты регламента, которые держит этот модуль:
 *   I1 — md источник, HTML производное (HTML собирается здесь и НИКОГДА не правится руками);
 *   I2 — решение пишется в ТРИ места, имя файла решения ПРОИЗВОДНО от имени документа;
 *   I3 — одобрение привязано к SHA-256 ТЕЛА при согласованной нормализации;
 *   I6 — тихие часы ПЕРЕСЕКАЮТ полночь.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, basename, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const DECISIONS_DIR = join(ROOT, 'interviews', 'decisions');
export const ARCHIVE_DIR = join(DECISIONS_DIR, 'archive');
export const QUEUE_FILE = join(DECISIONS_DIR, 'queue.json');

// ─────────────────────────────────────────────────────────────────────────────
// КОНТРАКТ НОРМАЛИЗАЦИИ И ХЕША (I3) — ЕДИНСТВЕННЫЙ на весь контур
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Нормализация текста перед хешированием. Ровно четыре шага, в этом порядке:
 *   1) снять BOM (Windows-редакторы его ставят, git — нет);
 *   2) CRLF и CR → LF (проект на Windows с `core.autocrlf`, EXP-0067);
 *   3) снять пробельный хвост в конце файла;
 *   4) поставить ровно один завершающий перевод строки.
 * Менять этот список — значит обнулить ВСЕ выданные одобрения. Это осознанная операция.
 */
export function normalizeText(input) {
	return String(input).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\s+$/, '') + '\n';
}

/** SHA-256 нормализованного текста. Одна функция на страницу и на гейт. */
export function textHash(input) {
	return createHash('sha256').update(normalizeText(input), 'utf8').digest('hex');
}

/** SHA-256 тела, лежащего файлом. Читает БАЙТЫ и гонит их через ту же нормализацию. */
export function bodyHash(path) {
	return textHash(readFileSync(path, 'utf8'));
}

// ─────────────────────────────────────────────────────────────────────────────
// РЕДАКЦИЯ, ЗАМОК, ЗАКРЫТИЕ, ПЕРЕНОС ЧЕРНОВИКА — старая вкладка не принимает ответы в пустоту
// (`bugs/NEW_review_page_stale_tab_accepts_answers.md`, S1; план `plans/NEW_review_contour_stale_tab.md`).
//
// Повод — слово владельца 2026-09-25: «так какого хуя страницу переписали, новую блять открыли и старую ОСТАВИЛИ!!!!
// баг нахуцй! вот я в сторой блять и отвечал!». Образец — поставляемый контур KAIF 2.7 (замок «один документ — одно
// окно», прежний порт первым, `--close` с отказом — `_interactive-contour-spec.md` §5); зазор, открытый и там, —
// сверка РЕДАКЦИИ — закрывается здесь (агент KAIF: OW6 эпика 2.8).
// [TESTED: 2026-09-25 · ручной прогон набора qa/suites/review-stale-tab.md живым Chromium на стенде агента (dev-1):
//   34/34 в 20:27 с головы 52d43c1 (с поправками суда p3), вывод и кадры прочитаны; мутанты А и Б краснеют адресно —
//   qa/reports/2026-09-25_review-stale-tab.md; Chrome владельца с его старыми вкладками не проверен — ждёт первой
//   страницы после мержа; юниты tools/review-contour.test.mjs — гигиена]
// ─────────────────────────────────────────────────────────────────────────────

/** Редакция документа — короткий хеш его текста при той же нормализации, что у I3. Меняется при любой правке. */
export function docRevision(path) {
	return bodyHash(path).slice(0, 16);
}

/**
 * Отпечаток вопроса (заголовок БЕЗ номера + тело): черновик переносится только на вопрос с ТЕМ ЖЕ текстом. Номер снят
 * намеренно — вопрос, который при переписывании документа только сменил номер («В2. Язык?» → «В1. Язык?»), остаётся
 * тем же вопросом, и ответ владельца встаёт на его новое место.
 */
export function questionPrint(title, body) {
	const bare = String(title).replace(/^[\p{Lu}]{1,2}\d+\s*[.．)]\s*/u, '');
	return textHash(bare + '\n' + String(body)).slice(0, 12);
}

/** Где лежит замок страницы документа: рядом с решениями, имя производно от имени документа (как у решения, I2). */
export function lockPathOf(docPath) {
	return join(DECISIONS_DIR, basename(docPath).replace(/\.md$/u, '') + '.lock');
}

/** Прочитать замок; нечитаемый — как нет (сломанный файл не должен запирать документ навсегда). */
export function readLock(path) {
	try {
		return JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		return null;
	}
}

/**
 * Состояние замка: `none` — страницы не было · `live` — процесс страницы жив (второе окно НЕ поднимается) ·
 * `stale` — процесс умер, но замок помнит ПОРТ: новая страница встаёт на него первым — тот же адрес, тот же
 * origin браузера, и черновик старой вкладки и сама вкладка возвращаются (KAIF 2.7, I29 / issue #64 истока).
 * `isAlive(pid)` приходит доводом — функция чистая и проверяется `node --test`.
 */
export function lockState(lock, isAlive) {
	if (!lock || !Number.isInteger(lock.pid)) return 'none';
	return isAlive(lock.pid) ? 'live' : 'stale';
}

/**
 * ПОСТОЯННЫЙ ПОРТ ДОКУМЕНТА — донор Unliminium (`tools/interview-page.mjs:1107-1122`, их bugs/65): порт входит в origin
 * браузера, а черновик владельца привязан к origin. Случайный порт при каждом подъёме (прежнее поведение) уводил новую
 * страницу на другой адрес — черновик оставался в старом origin, и старая вкладка к новому серверу не возвращалась.
 * Ключ — путь документа относительно корня (одинаков из любого рабочего места); диапазон 20000–35999 ниже эфемерных.
 */
export function stablePort(key) {
	const h = createHash('sha1').update(String(key).split('\\').join('/'), 'utf8').digest();
	return 20000 + (h.readUInt32BE(0) % 16000);
}

/** Порог тишины: живую страницу владельца агент закрывает, только если он не печатал столько (KAIF 2.7: 180 с). */
export const CLOSE_QUIET_MS = 180_000;

/**
 * Можно ли закрыть живую страницу владельца (`review close`). Отказ — с причиной словами:
 *   · странице меньше порога — владелец мог только открыть её и начать читать;
 *   · владелец печатал меньше порога назад;
 *   · в черновике есть заполненные поля, а сохранения не было.
 * Состояние ввода страница сама присылает пульсом (`/alive?i&d&s`), сервер держит его в замке.
 * Причины называются ВСЕ сразу, через «; » (суд p3, п. 7): первая-и-единственная прятала остальные — отказ «печатал»
 * на молодой странице не был виден никогда.
 */
export function closeVerdict({ startedAt, lastInputAt = null, draftFields = 0, saved = false } = {}, now = Date.now()) {
	const secs = (ms) => Math.round(ms / 1000);
	const born = Date.parse(startedAt);
	const reasons = [];
	if (Number.isFinite(born) && now - born < CLOSE_QUIET_MS)
		reasons.push(`странице ${secs(now - born)} с — меньше ${secs(CLOSE_QUIET_MS)} с, владелец мог только начать читать`);
	if (lastInputAt && now - lastInputAt < CLOSE_QUIET_MS)
		reasons.push(`владелец печатал ${secs(now - lastInputAt)} с назад — меньше ${secs(CLOSE_QUIET_MS)} с`);
	if (draftFields > 0 && !saved) reasons.push(`в черновике заполнено полей: ${draftFields}, сохранения не было`);
	return { ok: reasons.length === 0, reason: reasons.join('; ') };
}

/**
 * ПЕРЕНОС ЧЕРНОВИКА В ДРУГУЮ РЕДАКЦИЮ. Ответ ставится на место только у вопроса с ТЕМ ЖЕ отпечатком (текстом) —
 * даже если номер у него сменился; ответ на вопрос, которого в новой редакции нет или который переписан, уходит в
 * «черновик прошлой редакции» и показывается владельцу текстом — не пропадает молча и не переезжает на чужой вопрос
 * с тем же номером (ровно так №097 разошёлся бы: шесть вопросов против пяти).
 * Черновик без отпечатков (старая версия страницы) переносится по номеру — только если редакция та же.
 *
 * ⚠️ Функция едет в страницу исходником (`mapDraft.toString()` внутри шаблонной строки) — поэтому в её теле нет
 * ни обратных кавычек, ни знака доллара с фигурной скобкой.
 */
export function mapDraft(draft, questions, rev) {
	var place = [];
	var orphan = [];
	var byPrint = {};
	var byLabel = {};
	for (var i = 0; i < questions.length; i++) {
		byPrint[questions[i].qh] = questions[i].label;
		byLabel[questions[i].label] = true;
	}
	var q = (draft && draft.q) || {};
	var sameRev = draft && draft.rev === rev;
	for (var label in q) {
		var rec = q[label];
		if (!rec || !(rec.choice || rec.text || rec.comment)) continue;
		// Без отпечатка — по номеру только при ТОЙ ЖЕ редакции; черновик без редакции вовсе (её не знает никто) — в прошлую
		// редакцию текстом (суд p3, п. 6: прежнее условие «или редакции нет» переносило такой черновик по номеру вопреки этому
		// тексту).
		var target = rec.qh ? byPrint[rec.qh] : sameRev ? (byLabel[label] ? label : undefined) : undefined;
		if (target) place.push({ label: target, rec: rec });
		else orphan.push({ label: label, title: rec.title || label, rec: rec });
	}
	return { place: place, orphan: orphan };
}

/**
 * ПОВТОР УЖЕ ЗАПИСАННОГО ОТВЕТА — не «документ переписан». Запись ответа сама меняет документ (ответ ложится в md), и
 * «Повторить» после потерянного ответа сервера (`bugs/122`: сервер записал и ушёл раньше ответа) пришёл бы с прежней
 * редакцией. Если последнее решение уже несёт ровно эти ответы и этот комментарий — это тот же ответ, и сервер говорит
 * «записано», а не отказ.
 */
export function sameAsRecorded(prev, got) {
	if (!prev) return false;
	const answers = got.answers || {};
	const labels = Object.keys(answers);
	if (!labels.length && !(got.comment || '').trim()) return false;
	const same = (a, b) => (a?.choice || '') === (b?.choice || '') && (a?.text || '') === (b?.text || '') && (a?.comment || '') === (b?.comment || '');
	if (!labels.every((l) => same(answers[l], (prev.answers || {})[l]))) return false;
	if ((got.comment || '').trim() && (prev.comment || '') !== got.comment) return false;
	return !Object.keys(got.artifacts || {}).length;
}

/** Чтение markdown с нормализацией переводов строк (для разбора, не для хеша). */
export function readMd(path) {
	return readFileSync(path, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// КОНТРАКТ ИМЁН — метаблок документа
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Мини-разбор YAML-метаблока в шапке документа. Поддержан ровно тот срез, что описан контрактом
 * имён регламента: скаляры и список `artifacts` из отображений.
 *
 * ⚠️ Метаблок НЕОБЯЗАТЕЛЕН. Все десять живых интервью проекта написаны без него, и требовать его
 * значило бы переписать чужие документы ради инструмента — прямо против I1 («md — источник»).
 * Нет блока → `kind: interview`, заголовок берётся из первого `# `.
 */
export function parseMeta(text) {
	const m = /^```ya?ml\n([\s\S]*?)\n```/u.exec(text);
	const meta = { kind: 'interview', title: null, artifacts: [] };
	if (m) {
		let current = null;
		for (const line of m[1].split('\n')) {
			if (!line.trim() || line.trim().startsWith('#')) continue;
			const item = /^\s*-\s*(.*)$/u.exec(line);
			if (item && current === 'artifacts') {
				meta.artifacts.push(parseInline(item[1]));
				continue;
			}
			const kv = /^(\w+):\s*(.*)$/u.exec(line);
			if (!kv) continue;
			current = kv[1];
			if (kv[2].trim()) meta[kv[1]] = strip(kv[2]);
		}
	}
	if (!meta.title) {
		const h = /^#\s+(.+)$/mu.exec(text);
		meta.title = h ? h[1].trim() : 'Документ';
	}
	return meta;
}

const strip = (s) => s.trim().replace(/^["']|["']$/g, '');

/** Разбор строки вида `{id: a1, target: "Slack · #general", body_file: drafts/a1.md}`. */
function parseInline(s) {
	const out = {};
	const inner = s.trim().replace(/^\{|\}$/g, '');
	for (const part of inner.split(/,(?![^"']*["'][^"']*$)/u)) {
		const kv = /^\s*(\w+)\s*:\s*(.*)$/u.exec(part);
		if (kv) out[kv[1]] = strip(kv[2]);
	}
	return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// РАЗБОР ИНТЕРВЬЮ
// ─────────────────────────────────────────────────────────────────────────────

/** Заголовок вопроса: `### В1.`, `### Р5.`, `#### Q2.` — буква(ы) + номер + точка. */
const Q_HEADING = /^#{2,4}\s*(?<label>[\p{Lu}]{1,2}\d+)\s*[.．)]/u;
const ANSWER_FIELD = /\*\*Ответ(?<note>[^*]*?):?\*\*:?/u;
/**
 * 🔴 ПОЛЕ, ПОДПИСАННОЕ КАК ВСТРЕЧНЫЙ ВОПРОС, — НЕ ОТВЕТ.
 * Поймано на живом документе: в интервью №010 поле Р5 подписано «**Ответ (вопрос владельца):**»,
 * внутри — вопрос владельца агенту и ответ агента, а сама развилка НЕ выбрана. Формально поле
 * непустое, и страница показывала «ждут ответа: 0» на единственном блокирующем вопросе волны
 * ворот — то есть звала владельца туда, где всё выглядело закрытым.
 */
const COUNTER_QUESTION = /вопрос/iu;

/**
 * Машинная метка авторства и времени, которую контур ставит под каждым ответом.
 *
 * 🔴 Она НЕ ДОЛЖНА попадать в текст ответа. Разбор складывал в `answer` все строки после поля
 * «Ответ:», включая эту, а `mdToHtml` экранирует HTML — и метка приезжала владельцу на страницу
 * видимым мусором: «**А** &lt;!-- owner-review: by="…" at="2026-08-02T17:51:49.003Z" … --&gt;»
 * (`bugs/112`). Отсюда же и его просьба про время: время писалось всегда, но подавалось шумом.
 */
const OWNER_MARK = /^\s*<!--\s*owner-review:/u;
const OWNER_MARK_FIELDS = /by="(?<by>[^"]*)"\s+at="(?<at>[^"]*)"/u;

/** Видимая человеку отметка сохранения — её и просил владелец 2026-08-03. */
const SAVED_STAMP = /^\s*[*_]*\s*🕒\s*Сохранено\s/u;

/**
 * Момент сохранения — словами и в МЕСТНОМ времени.
 *
 * 🔴 Почему не ISO: в архиве стоит `at="2026-08-02T17:51:49.003Z"`, а владелец нажал «Сохранить»
 * в 20:51 по своим часам. Показать ему UTC — значит показать неправду о его же действии.
 * Машинная метка остаётся ISO (её читают программы), человеку показывается местное время.
 */
export function savedStamp(by, at) {
  const d = new Date(at);
  const when = Number.isNaN(d.getTime())
    ? at
    : d.toLocaleString('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
  return `*🕒 Сохранено ${when} · ${by}*`;
}
/**
 * Вариант ответа: `- **А) (рекомендуется)** текст` — буква латиницей или кириллицей.
 *
 * 🔴 РАЗБОР ОБЯЗАН БЫТЬ МНОГОСТРОЧНЫМ. Первая редакция искала закрывающие `**` в ТОЙ ЖЕ строке —
 * и вариант, чей жирный заголовок перенесён на вторую строку, просто ИСЧЕЗАЛ со страницы. Поймано
 * владельцем на живом Р5 интервью №010: из четырёх вариантов кликабельными оказались три, а
 * пропал ровно тот, который рекомендован и который надо выбрать.
 *
 * Молчаливая потеря варианта — худший из возможных дефектов этого контура: страница выглядит
 * исправной, владелец выбирает из того, что видит, и решение принимается по УРЕЗАННОМУ списку.
 * Поэтому ниже — не только починка, но и счётная проверка в `verify-owner-reviews.mjs`: число
 * строк-кандидатов обязано совпадать с числом разобранных вариантов у КАЖДОГО вопроса ВСЕХ живых
 * интервью.
 */
// После буквы — «)» или «. » (форма «- **A. …**» — №092, 21 строка; найдена замером при лечении, тот же класс).
// «. » или «.» сразу перед закрывающим «**» — форма «- **A.** Впишу…» (№092 В6, суд радиокнопок Н1).
const OPTION_START = /^\s*[-*]\s+\*\*(?<letter>[\p{Lu}])(?:\)|\.(?:\s|\*\*))/u;
/**
 * 🔴 ВТОРАЯ ФОРМА ВАРИАНТА — АБЗАЦ: `**А) V1 «…».** текст`, продолжение — следующие строки без отступа до пустой строки
 * (`bugs/NEW_review_page_options_without_radio.md`, S1). Интервью №097 и №098 несли варианты абзацами, разбор знал только
 * пункт списка, вернул 0 вариантов — и страница нарисовала владельцу одно поле текста. Его слово 2026-09-25: «*какого хуя
 * ты опять радиокнопки забыл сделать?*». Буква — любая заглавная, как у пункта списка, и сразу за ней «)».
 */
const OPTION_PARA = /^\*\*(?<letter>[\p{Lu}])(?:\)|\.(?:\s|\*\*))/u;
const OPTION_FULL = /\*\*(?<letter>[\p{Lu}])(?:\)|\.(?=\s|\*\*))\s*(?<label>[\s\S]*?)\*\*(?<rest>[\s\S]*)/u;
/**
 * Строка, ПОХОЖАЯ на вариант, в любой форме: `- **А) …`, `**А) …`, `А) …`. Её счёт — `optionLines`: страж
 * `verify-owner-reviews` (блок 5в) и предполётная проверка сверяют его с числом РАЗОБРАННЫХ вариантов. Прежде счёт вёлся
 * по той же строгой регулярке, что и разбор, — неузнанная форма давала «0 из 0», и сверка молчала ровно тогда, когда
 * терялись все варианты.
 */
// Точка без жирного («В. текст») не считается: в прозе так стоит инициал.
const OPTION_LIKE = /^\s*(?:[-*]\s+)?(?:\*\*)?\s*[\p{Lu}]\)\s|^\s*(?:[-*]\s+)?\*\*[\p{Lu}]\.(?:\s|\*\*)/u;
/** Продолжение пункта списка: отступ, не новый пункт, не пусто. */
const LIST_CONT = /^\s{2,}\S/u;

/**
 * Разбирает документ интервью в структуру, пригодную и для стража, и для страницы.
 * Каждый вопрос: метка, заголовок, варианты, текст ответа, строки блока.
 */
/**
 * ВОПРОС ОБЯЗАН БЫТЬ САМОДОСТАТОЧНЫМ — проверка, купленная словом владельца.
 *
 * 2026-08-15, второй заход вычитки `plans/29`. Вопрос В7 звучал так: «Переписанная формула
 * похожести (ВЫШЕ) — это Ваш язык?», а сам текст формулы лежал в другом разделе документа.
 * Ответ владельца дословно:
 *
 *   «Пиши прямо в вопросе то, что предлагаешь взять. Я НЕ СОБИРАЮСЬ СКРОЛИТЬ этот длинный
 *    документ и искать „вон ту формулу“»
 *
 * Это ВТОРАЯ его правка о доставке подряд: первой была «не вынуждай меня лазить по md файлам»
 * (`EXP-0125`), и тогда лечением стала поднятая страница. Страницу подняли — и внутри неё
 * воспроизвели ту же болезнь на уровень ниже: кликабельный документ, в котором ответ всё равно
 * требует поиска. Класс один: **работа владельца растёт там, где агенту дешевле сослаться.**
 *
 * Поэтому лечение теперь механическое, а не «буду внимательнее»: вопрос, отсылающий за своим
 * содержимым НАРУЖУ блока, страницу не поднимает.
 *
 * Отсылка ВПЕРЁД («варианты ниже») законна: варианты стоят внутри того же блока. Ловим только
 * отсылку НАЗАД и в сторону — туда, где читателю придётся искать.
 */
const OUTWARD_REF =
	/(?<![А-Яа-яЁё])(?:выше(?![А-Яа-яЁё])|вон\s+т[оеа]\p{L}*|в\s+разделе|в\s+шапке|см\.\s|§\s?\d)/iu;

/** Явное исключение с обязательной причиной — тот же канон, что у прочих стражей проекта. */
const REF_EXCUSE = /<!--\s*ССЫЛКА-ОК:\s*(?<reason>[^>]*?)\s*-->/iu;

/**
 * Возвращает список вопросов, которые отсылают за своим содержимым наружу.
 * @param {{questions: Array}} parsed — результат `parseInterview`
 * @param {string} text — тело того же документа
 */
export function lintSelfContained(parsed, text) {
	const lines = text.split('\n');
	const bad = [];
	for (const q of parsed.questions ?? []) {
		if (q.answered) continue; // отвеченный вопрос уже не отнимает время владельца
		const from = q.startLine ?? 0;
		const to = q.answerLine > 0 ? q.answerLine : (q.endLine ?? from);
		for (let i = from; i <= to && i < lines.length; i++) {
			const line = lines[i];
			if (!OUTWARD_REF.test(line)) continue;
			if (REF_EXCUSE.test(line) || (i > 0 && REF_EXCUSE.test(lines[i - 1]))) continue;
			bad.push({ label: q.label, line: i + 1, text: line.trim().slice(0, 120) });
			break;
		}
	}
	return bad;
}

/**
 * ВОПРОС С ВАРИАНТАМИ ОБЯЗАН ПОЛУЧИТЬ КНОПКИ — предполётная проверка (`bugs/NEW_review_page_options_without_radio.md`).
 * Вопрос, ждущий ответа, в котором строк-вариантов не меньше двух, а разобрано меньше, чем их, страницу не поднимает:
 * владелец иначе видит варианты текстом и одно поле ввода. Возвращает `[{ label, line, found, parsed }]`.
 *
 * @guard review-options-lost
 * THREAT:         страница вычитки поднимается владельцу с вариантами, для которых нет кнопок выбора (2026-09-25, №098:
 *                 варианты абзацами, разбор вернул 0, владелец ответил текстом — «*какого хуя ты опять радиокнопки забыл
 *                 сделать?*»)
 * PROVED-AGAINST: мутант M2 «счёт кандидатов строгий» (`OPTION_LIKE` снят) — юнит «предполёт: варианты неузнанной формы»
 *                 красный; живой РК-03 — копия №098 с вариантами без «**» — `open` отказал кодом 1 и назвал «В1 … строк-вариантов 5,
 *                 разобрано 0» (dev-1 2026-09-25 23:29 и 23:34)
 * GAP:            вариант без «)» и без жирной точки («А —», «А:») счётом не видится; отвеченный вопрос не судится;
 *                 вопрос с ОДНОЙ строкой-вариантом порог «≥ 2» не судит (№070 В2 — варианты картинками)
 * ON-REAL-PATH:   `npm run review -- open` зовёт `preflight`; `queue` отказывает ставить такой документ (код 1); страница
 *                 документа пачки `/doc?p=` отдаёт 409 «агент ещё чинит» — `batch` мимо проверки больше не ходит (суд Н2;
 *                 живьём РК-03…РК-05 2026-09-25 23:56); блок 5в `verify-owner-reviews` судит тем же счётом все живые интервью
 *                 (1196 строк-кандидатов, 0 расхождений на 2026-09-25)
 * @param {{questions: Array}} parsed — результат `parseInterview`
 */
export function lintOptionsLost(parsed) {
	const bad = [];
	for (const q of parsed.questions ?? []) {
		if (q.answered) continue;
		const found = q.optionLines ?? 0;
		if (found < 2 || q.options.length >= found) continue;
		// Называется первая строка-вариант, которую разбор НЕ узнал; при смеси форм первая похожая могла быть узнанной.
		const inBlock = (l, i) => i > q.startLine && (q.answerLine < 0 || i < q.answerLine) && OPTION_LIKE.test(l);
		const lines = parsed.lines ?? [];
		let first = lines.findIndex((l, i) => inBlock(l, i) && !OPTION_START.test(l) && !OPTION_PARA.test(l));
		if (first < 0) first = lines.findIndex(inBlock);
		bad.push({ label: q.label, line: first + 1, found, parsed: q.options.length, text: (parsed.lines?.[first] ?? '').trim().slice(0, 120) });
	}
	return bad;
}

export function parseInterview(relPath, text) {
	const lines = text.split('\n');
	const statusLine = lines.find((l) => /Статус[:\s*]/u.test(l) && /^[>|\s*#-]/u.test(l));
	const questions = [];

	let current = null;
	const close = (endLine) => {
		if (current) {
			current.endLine = endLine;
			questions.push(current);
		}
		current = null;
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const h = Q_HEADING.exec(line);
		if (h) {
			close(i);
			current = {
				label: h.groups.label,
				title: line.replace(/^#+\s*/u, '').trim(),
				startLine: i,
				answerLine: -1,
				options: [],
				// Две формы варианта копятся раздельно; какая станет кнопками — решается при закрытии вопроса (ниже).
				listOptions: [],
				paraOptions: [],
				listLines: 0,
				paraLines: 0,
				looseLines: 0,
				answer: '',
				body: [],
			};
			continue;
		}
		// Блок вопроса закрывает заголовок 1–2 уровня ИЛИ горизонтальная линейка.
		// 🔴 Линейку добавил ПИЛОТ на живых данных, а не фикстура: без неё `---`, стоящая после
		// пустого поля «**Ответ:**», попадала В ОТВЕТ и делала пустой вопрос «отвеченным».
		// Симптом был мягкий и потому опасный: страница честно рисовала поле ввода, но в шапке
		// писала «ждут ответа: 2» при трёх пустых, а страж считал бы интервью закрытым.
		if (/^#{1,2}\s/u.test(line) || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/u.test(line)) {
			close(i);
			continue;
		}
		if (!current) continue;

		const listForm = OPTION_START.test(line);
		const paraForm = !listForm && OPTION_PARA.test(line);
		if (current.answerLine < 0) {
			if (listForm) current.listLines += 1;
			else if (paraForm) current.paraLines += 1;
			else if (OPTION_LIKE.test(line)) current.looseLines += 1;
		}
		if ((listForm || paraForm) && current.answerLine < 0) {
			// Собираем вариант ЦЕЛИКОМ: пункт списка — маркер плюс продолжения с отступом; абзац — все строки до пустой.
			// Жирный заголовок варианта запросто переносится на вторую строку — на этом контур уже обжёгся.
			let text = line;
			for (let j = i + 1; j < lines.length; j++) {
				const next = lines[j];
				if (OPTION_START.test(next) || OPTION_PARA.test(next) || ANSWER_FIELD.test(next)) break;
				if (listForm) {
					if (!LIST_CONT.test(next) || /^\s*[-*]\s/u.test(next)) break;
				} else if (!next.trim() || /^#{1,6}\s/u.test(next) || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/u.test(next)) break;
				text += ' ' + next.trim();
			}
			const o = OPTION_FULL.exec(text);
			if (o) {
				(listForm ? current.listOptions : current.paraOptions).push({
					letter: o.groups.letter,
					/*
					 * 🔴 ТЕКСТ ВАРИАНТА НЕ РЕЖЕТСЯ. Здесь стояло `.slice(0, 300)` без причины и без
					 * теста — и резало МОЛЧА: ни ошибки, ни многоточия, обрыв на полуслове.
					 * Замер 2026-08-30 (смена 14): обрезано 99 вариантов из 831 (11,9 %) в 38
					 * интервью, из них **90 в уже ОТВЕЧЕННЫХ** — то есть владелец принимал решения
					 * по усечённому тексту начиная с интервью №001. Обрезалось ровно то, что стоит
					 * в конце варианта, а по форме документа в конце стоит ЦЕНА: «Довод: … Цена: …».
					 * Нашёл владелец, своими словами: «Не могу ответить, у тебя обрезаны текста
					 * вариантов» (интервью №069 В2).
					 * 🔑 Класс: предел, поставленный без причины, становится невидимой цензурой —
					 * страница выглядит целой, и обрыв виден только тому, кто знает исходник.
					 * Стережёт `tools/lib/review-core.test.mjs`.
					 */
					label: (o.groups.label + ' ' + o.groups.rest).trim().replace(/\s+/g, ' '),
				});
			}
		}
		const field = current.answerLine < 0 ? ANSWER_FIELD.exec(line) : null;
		if (field) {
			current.answerLine = i;
			// Поле-встречный-вопрос считается ПУСТЫМ: развилка не выбрана, вопрос жив.
			current.counterQuestion = COUNTER_QUESTION.test(field.groups.note ?? '');
			current.answer += line.replace(ANSWER_FIELD, '').trim() + '\n';
			continue;
		}
		if (current.answerLine >= 0) {
			// Служебные строки под ответом в САМ ОТВЕТ не входят: из машинной метки забираем
			// авторство и время (их показывает страница отдельным элементом), видимую отметку
			// пропускаем — иначе она удвоится при повторном разборе. `bugs/112`.
			const mark = OWNER_MARK.test(line) ? OWNER_MARK_FIELDS.exec(line) : null;
			if (mark) {
				current.savedBy = mark.groups.by;
				current.savedAt = mark.groups.at;
				continue;
			}
			if (SAVED_STAMP.test(line)) continue;
			current.answer += line + '\n';
		} else current.body.push(line);
	}
	close(lines.length);

	for (const q of questions) {
		q.answer = q.answer.trim();
		q.answered = q.answerLine >= 0 && q.answer.length > 0 && !q.counterQuestion;
		/*
		 * Кнопки — по СПИСКУ, если он есть: так агенты обходили дефект абзацев (№097 — описание вариантов абзацами и
		 * короткий кликабельный список «- **А) русский**» ниже), и абзацы там — описание, а не второй набор кнопок.
		 * Списка нет — кнопки по абзацам (№098). Счёт кандидатов `optionLines` ведётся по той же форме плюс строки
		 * «А) …» без жирного: неузнанная форма даёт «0 из N», и сверка краснеет (`verify-owner-reviews` 5в, предполёт).
		 */
		q.options = q.listLines > 0 ? q.listOptions : q.paraOptions;
		q.optionLines = (q.listLines > 0 ? q.listLines : q.paraLines) + q.looseLines;
		delete q.listOptions;
		delete q.paraOptions;
		delete q.listLines;
		delete q.paraLines;
		delete q.looseLines;
	}

	// Две формы одной строки: `statusRaw` сохраняет markdown (её рендерит страница),
	// `status` — чистый текст для консоли. Раньше общий strip срезал `>` вместе с `**` и на
	// странице протекало «Статус:** 🟡 …» — поймано глазами на кадре, а не проверкой.
	const statusRaw = statusLine ? statusLine.replace(/^[>\s]+/u, '').trim() : null;
	const status = statusRaw ? statusRaw.replace(/\*\*/g, '').trim() : null;
	// 🔑 Истина о том, закрыто интервью или нет, — СТАТУС ДОКУМЕНТА, а не заполненность полей.
	// Проверено на живых данных: в №010 поле Р5 непустое (владелец задал встречный вопрос, агент
	// ответил), но развилка не выбрана и интервью открыто. Судить по полям значило бы объявить
	// закрытым единственный блокирующий вопрос волны ворот.
	const waiting = status ? /🟡|🔴|ожида|жд[её]т/iu.test(status) : false;
	return { file: relPath, status, statusRaw, waiting, questions, lines };
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKDOWN → HTML (мини-рендерер, ноль зависимостей)
// ─────────────────────────────────────────────────────────────────────────────

const esc = (s) =>
	String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Строчные преобразования: код, жирный, курсив, изображения, ссылки, зачёркнутое. */
export function inline(s) {
	let t = esc(s);
	t = t.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
	t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
	t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>');
	// `![подпись](кадр.png)` — синтаксис ИЗОБРАЖЕНИЯ — приводится к ссылке дом-конвенции
	// `[подпись](кадр.png)`: дальше по конвейеру (`review.mjs`) файл вшивается data-URI.
	// До этой строки рендерер синтаксиса не знал, и №055 поднялся без единого кадра (`bugs/210`).
	t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
	t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
	return t;
}

/**
 * Markdown → HTML. Покрывает то, чем реально написаны документы проекта: заголовки, списки,
 * таблицы, цитаты, ограждённый код, горизонтальные линии, абзацы.
 * Сознательно НЕ покрывает: вложенные списки глубже одного уровня, сноски, HTML внутри.
 */
export function mdToHtml(md) {
	const lines = md.split('\n');
	const out = [];
	let i = 0;
	let inCode = false;
	let listType = null;
	let para = [];

	const flushPara = () => {
		if (para.length) {
			out.push(`<p>${inline(para.join(' '))}</p>`);
			para = [];
		}
	};
	const flushList = () => {
		if (listType) {
			out.push(`</${listType}>`);
			listType = null;
		}
	};

	while (i < lines.length) {
		const line = lines[i];

		// Ограждённый код — отдаётся дословно
		if (/^```/.test(line)) {
			flushPara();
			flushList();
			if (!inCode) {
				out.push('<pre><code>');
				inCode = true;
			} else {
				out.push('</code></pre>');
				inCode = false;
			}
			i++;
			continue;
		}
		if (inCode) {
			out.push(esc(line));
			i++;
			continue;
		}

		// ── `bugs/112`: HTML-комментарий по определению НЕВИДИМ, а мы его показывали ──────────
		// Разметка здесь экранируется целиком (это защита от чужого HTML в документе), и потому
		// служебная метка `<!-- owner-review: by="…" at="2026-08-02T17:51:49.003Z" … -->`
		// приезжала владельцу на страницу видимым мусором. Мест утечки было ДВА — под ответом и
		// под общим комментарием документа, — поэтому лечим здесь, в одном месте на все будущие.
		// Внутри ограждённого кода комментарии остаются: там они содержание, а не служебка.
		const bare = line.replace(/<!--[\s\S]*?-->/g, '');
		if (/<!--/.test(line) && !bare.trim()) { i++; continue; }
		if (bare !== line) {
			lines[i] = bare;
			continue;
		}

		// Таблица: строка с | и следующая — разделитель
		if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) {
			flushPara();
			flushList();
			const cells = (l) =>
				l.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
			out.push('<div class="tw"><table><thead><tr>');
			for (const c of cells(line)) out.push(`<th>${c}</th>`);
			out.push('</tr></thead><tbody>');
			i += 2;
			while (i < lines.length && /^\s*\|/.test(lines[i])) {
				out.push('<tr>');
				for (const c of cells(lines[i])) out.push(`<td>${c}</td>`);
				out.push('</tr>');
				i++;
			}
			out.push('</tbody></table></div>');
			continue;
		}

		// Заголовок
		const h = /^(#{1,6})\s+(.*)$/.exec(line);
		if (h) {
			flushPara();
			flushList();
			const n = h[1].length;
			out.push(`<h${n}>${inline(h[2])}</h${n}>`);
			i++;
			continue;
		}

		// Горизонтальная линия
		if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
			flushPara();
			flushList();
			out.push('<hr>');
			i++;
			continue;
		}

		// Цитата (собирается блоком и рендерится рекурсивно)
		if (/^\s*>/.test(line)) {
			flushPara();
			flushList();
			const buf = [];
			while (i < lines.length && /^\s*>/.test(lines[i])) {
				buf.push(lines[i].replace(/^\s*>\s?/, ''));
				i++;
			}
			out.push(`<blockquote>${mdToHtml(buf.join('\n'))}</blockquote>`);
			continue;
		}

		// Список
		const li = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
		if (li) {
			flushPara();
			const want = /^\d/.test(li[1]) ? 'ol' : 'ul';
			if (listType !== want) {
				flushList();
				out.push(`<${want}>`);
				listType = want;
			}
			// Продолжения пункта (отступ) приклеиваются к нему же
			let item = li[2];
			while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1]) && !/^\s*([-*+]|\d+[.)])\s/.test(lines[i + 1])) {
				item += ' ' + lines[i + 1].trim();
				i++;
			}
			out.push(`<li>${inline(item)}</li>`);
			i++;
			continue;
		}

		// Пустая строка
		if (!line.trim()) {
			flushPara();
			flushList();
			i++;
			continue;
		}

		para.push(line.trim());
		i++;
	}
	flushPara();
	flushList();
	if (inCode) out.push('</code></pre>');
	return out.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// РЕШЕНИЯ (I2) — три места
// ─────────────────────────────────────────────────────────────────────────────

/** База имени документа без расширения — из неё ПРОИЗВОДЯТСЯ имена файлов решения. */
export const docBase = (docPath) => basename(docPath).replace(/\.md$/u, '');

/** Путь файла решения. Производен от имени документа: общий файл затирался бы следующим. */
export const decisionPath = (docPath) => join(DECISIONS_DIR, `${docBase(docPath)}.decision.json`);

/** Читает решение, если оно есть. Ошибка чтения = «решения нет» (гейт fail-closed сам решит). */
export function readDecision(docPath) {
	const p = decisionPath(docPath);
	if (!existsSync(p)) return null;
	try {
		return JSON.parse(readFileSync(p, 'utf8'));
	} catch {
		return null;
	}
}

/**
 * Записывает решение в ТРИ места (I2):
 *   1) обратно в исходный md — его читает следующая сессия с пустым контекстом;
 *   2) `<база>.decision.json` — машинная проверка до отправки;
 *   3) копия в архив с `by` и `at` — именно это делает архив читаемым месяцы спустя.
 * Возвращает список путей, которых коснулись.
 */
export function writeDecision({ docPath, kind, by, at, comment, answers = {}, artifacts = {} }) {
	mkdirSync(ARCHIVE_DIR, { recursive: true });
	const record = {
		kind,
		document: relative(ROOT, docPath).split('\\').join('/'),
		by,
		at,
		comment: comment || '',
		...(Object.keys(answers).length ? { answers } : {}),
		...(Object.keys(artifacts).length ? { artifacts } : {}),
	};

	// (1) — обратно в md: ответы по вопросам и общий комментарий по документу
	const touchedMd = applyAnswersToMd(docPath, answers, by, at) ?? (comment ? docPath : null);
	if (comment && comment.trim()) appendDocComment(docPath, comment.trim(), by, at);

	// (2) — файл решения рядом, имя производно от документа
	const prev = readDecision(docPath);
	const merged = prev
		? {
				...record,
				answers: { ...(prev.answers ?? {}), ...answers },
				artifacts: { ...(prev.artifacts ?? {}), ...artifacts },
				история: [...(prev.история ?? []), { by: prev.by, at: prev.at }],
			}
		: record;
	writeFileSync(decisionPath(docPath), JSON.stringify(merged, null, '\t') + '\n', 'utf8');

	// (3) — копия в архив, никогда не перезаписывается
	const stamp = at.replace(/[:.]/g, '-');
	writeFileSync(
		join(ARCHIVE_DIR, `${docBase(docPath)}--${stamp}.json`),
		JSON.stringify(record, null, '\t') + '\n',
		'utf8',
	);

	return {
		md: touchedMd,
		decision: decisionPath(docPath),
		archive: join(ARCHIVE_DIR, `${docBase(docPath)}--${stamp}.json`),
	};
}

/**
 * Дописывает общий комментарий по документу в КОНЕЦ md (слово владельца 2026-08-01: «по всему
 * документу целиком — в самом низу, общий комментарий владельца»).
 *
 * Почему в конец, а не в шапку: шапку документа пишет агент, и она отвечает на вопрос «о чём это».
 * Комментарий владельца — это его реакция НА ПРОЧИТАННОЕ, её место после текста. Каждый приезд —
 * отдельный блок с датой: комментарии копятся, а не затирают друг друга.
 */
export function appendDocComment(docPath, comment, by, at) {
	const raw = readFileSync(docPath, 'utf8');
	const eol = raw.includes('\r\n') ? '\r\n' : '\n';
	const lines = raw.replace(/^﻿/, '').replace(/\s+$/, '').split(/\r?\n/);
	lines.push(
		'',
		'---',
		'',
		`## 💬 Комментарий владельца — ${at.slice(0, 10)}`,
		'',
		...comment.split(/\r?\n/),
		'',
		// Время — рядом с комментарием, а не только в машинной метке (просьба владельца 2026-08-03).
		savedStamp(by, at),
		`<!-- owner-review: by="${by}" at="${at}" транспорт=страница вид=общий-комментарий -->`,
	);
	writeFileSync(docPath, lines.join(eol) + eol, 'utf8');
	return docPath;
}

/**
 * Вписывает ответы в исходный md.
 *
 * 🔴 Правило неприкосновенности первоисточника (`AGENT_GUIDE` → git-гигиена): УЖЕ НАПИСАННЫЙ
 * владельцем ответ не перезаписывается никогда. Новый текст приходит отдельным полем-уточнением
 * с датой, старый остаётся дословно.
 */
export function applyAnswersToMd(docPath, answers, by, at) {
	if (!Object.keys(answers).length) return null;
	const raw = readFileSync(docPath, 'utf8');
	const eol = raw.includes('\r\n') ? '\r\n' : '\n';
	const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/);
	const parsed = parseInterview(docPath, lines.join('\n'));

	// Идём СНИЗУ ВВЕРХ: вставки не сдвигают ещё не обработанные номера строк.
	const targets = parsed.questions
		.filter((q) => answers[q.label])
		.sort((a, b) => b.startLine - a.startLine);

	for (const q of targets) {
		const a = answers[q.label];
		const parts = [];
		if (a.choice) parts.push(`**${a.choice}**`);
		if (a.text && a.text.trim()) parts.push(a.text.trim());
		const body = parts.join(' — ') || '—';
		const mark = `<!-- owner-review: by="${by}" at="${at}" транспорт=страница -->`;
		// Видимая отметка времени идёт РЯДОМ с машинной, а не вместо неё: программы читают ISO,
		// человек — местное время. Просьба владельца 2026-08-03: «чтобы ответы имели таймстемп».
		const stamp = savedStamp(by, at);

		if (!q.answered && q.answerLine >= 0) {
			// Поле пустое — заполняем его же.
			lines[q.answerLine] = `**Ответ:** ${body}`;
			lines.splice(q.answerLine + 1, 0, stamp, mark);
		} else {
			// Ответ уже есть (или поля нет вовсе) — дописываем уточнение, ничего не затирая.
			const at1 = q.endLine;
			lines.splice(at1, 0, '', `**Ответ (уточнение ${at.slice(0, 10)}):** ${body}`, stamp, mark);
		}
		if (a.comment && a.comment.trim()) {
			const idx = lines.indexOf(mark);
			lines.splice(idx, 0, `> ${a.comment.trim()}`);
		}
	}
	writeFileSync(docPath, lines.join(eol), 'utf8');
	return docPath;
}

// ─────────────────────────────────────────────────────────────────────────────
// ГЕЙТ ОДОБРЕНИЯ (I3, I4) — одна реализация на страницу, гейт и отправщик
// ─────────────────────────────────────────────────────────────────────────────

/** Артефакты документа с разрешёнными путями тел. */
export function artifactsOf(docPath) {
	const meta = parseMeta(readMd(docPath));
	return meta.artifacts.map((a) => ({
		...a,
		path: a.body_file ? join(dirname(docPath), '..', a.body_file) : null,
		absolute: a.body_file ? join(ROOT, a.body_file) : null,
	}));
}

/**
 * Единственная проверка «можно ли это отправлять».
 *
 * 🔴 FAIL-CLOSED (I4): любое сомнение — ОТКАЗ. Нет решения, `rejected`, артефакт не объявлен,
 * тело пропало, хеш разъехался, файл решения не читается — всё это отказ, а не «наверное можно».
 * Запрос НИКОГДА не одобряет сам себя по таймауту.
 *
 * Возвращает {ok:boolean, reason:string, ...} — и никогда не бросает.
 */
export function checkApproval(docPath, artifactId) {
	try {
		if (!existsSync(docPath)) return { ok: false, reason: `документа нет: ${docPath}` };

		const art = artifactsOf(docPath).find((a) => a.id === artifactId);
		if (!art) return { ok: false, reason: `артефакт «${artifactId}» не объявлен в метаблоке документа` };
		if (!art.absolute || !existsSync(art.absolute))
			return { ok: false, reason: `файл тела не найден: ${art.body_file}` };

		const decision = readDecision(docPath);
		if (!decision) return { ok: false, reason: 'решения нет — владелец ничего не одобрял' };

		const rec = decision.artifacts?.[artifactId];
		if (!rec) return { ok: false, reason: `в решении нет записи про артефакт «${artifactId}»` };
		if (rec.status !== 'approved')
			return { ok: false, reason: `статус «${rec.status}», а не «approved»` };
		if (!rec.sha256) return { ok: false, reason: 'в решении нет хеша — одобрение не привязано к тексту' };

		const now = bodyHash(art.absolute);
		if (now !== rec.sha256)
			return {
				ok: false,
				reason: 'ТЕКСТ ИЗМЕНИЛСЯ ПОСЛЕ ОДОБРЕНИЯ — одобрение аннулировано',
				approved: rec.sha256,
				current: now,
			};

		return { ok: true, reason: 'одобрено', by: decision.by, at: decision.at, sha256: now, artifact: art };
	} catch (e) {
		// Даже неожиданная ошибка — отказ. Гейт не имеет права пропускать по недоразумению.
		return { ok: false, reason: `сбой проверки (считаем отказом): ${e.message}` };
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// ТИХИЕ ЧАСЫ (I6)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Тихие часы. Окно ПЕРЕСЕКАЕТ ПОЛНОЧЬ (умолчание 23:00–09:00), и наивное сравнение
 * `from <= now <= to` при таком окне молчит весь день и звучит всю ночь — ровно наоборот.
 * Регламент (I6) требует отдельного стража на это сравнение; он есть в `selftest()`.
 */
export function isQuiet(date, from = '23:00', to = '09:00') {
	const min = (s) => {
		const [h, m] = s.split(':').map(Number);
		return h * 60 + m;
	};
	const now = date.getHours() * 60 + date.getMinutes();
	const a = min(from);
	const b = min(to);
	return a <= b ? now >= a && now < b : now >= a || now < b;
}

// ─────────────────────────────────────────────────────────────────────────────
// САМОТЕСТ — тот самый, которого не хватило полю
// ─────────────────────────────────────────────────────────────────────────────

export function selftest() {
	const fails = [];
	const ok = (name, cond) => {
		if (!cond) fails.push(name);
	};

	// I3 — согласие нормализации. Проверяем, что все четыре «лица» одного текста дают ОДИН хеш.
	const base = 'привет\nмир\n';
	ok('хеш: CRLF = LF', textHash('привет\r\nмир\r\n') === textHash(base));
	ok('хеш: BOM не влияет', textHash('\uFEFFпривет\nмир\n') === textHash(base));
	ok('хеш: хвост из пустых строк не влияет', textHash('привет\nмир\n\n\n  \n') === textHash(base));
	ok('хеш: нет хвостового перевода строки', textHash('привет\nмир') === textHash(base));
	ok('хеш: разный текст — разный хеш', textHash('привет\nмиp\n') !== textHash(base));

	// I6 — тихие часы, пересекающие полночь. Ровно тот случай, который ломает наивное сравнение.
	const at = (h, m = 0) => new Date(2026, 7, 1, h, m);
	ok('тихо в 23:30', isQuiet(at(23, 30)) === true);
	ok('тихо в 03:00', isQuiet(at(3)) === true);
	ok('тихо в 08:59', isQuiet(at(8, 59)) === true);
	ok('шумно в 09:00', isQuiet(at(9)) === false);
	ok('шумно в 14:00', isQuiet(at(14)) === false);
	ok('шумно в 22:59', isQuiet(at(22, 59)) === false);
	// Окно, НЕ пересекающее полночь, обязано работать тоже.
	ok('обычное окно 13–14: тихо в 13:30', isQuiet(at(13, 30), '13:00', '14:00') === true);
	ok('обычное окно 13–14: шумно в 12:00', isQuiet(at(12), '13:00', '14:00') === false);

	// Строчный рендер: изображение — тот же класс, что №055 (`bugs/210`)
	ok('строчный: картинка становится ссылкой', inline('![кадр](a/b.png)') === '<a href="a/b.png">кадр</a>');
	ok('строчный: картинка без подписи', inline('![](a.png)') === '<a href="a.png"></a>');
	ok('строчный: обычная ссылка живёт', inline('[имя](x.md)') === '<a href="x.md">имя</a>');

	// Разбор вопросов и вариантов
	const doc = [
		'# Интервью №999 — проба',
		'> **Статус:** 🟡 ожидает',
		'',
		'### В1. Первый вопрос?',
		'- **А) (рекомендуется)** первый вариант',
		'- **Б) второй** хвост',
		'',
		'**Ответ:**',
		'',
		'### В2. Второй вопрос?',
		'',
		'**Ответ:** Б',
		'',
	].join('\n');
	const p = parseInterview('проба.md', doc);
	ok('разбор: два вопроса', p.questions.length === 2);
	ok('разбор: метки В1/В2', p.questions.map((q) => q.label).join() === 'В1,В2');
	ok('разбор: два варианта у В1', p.questions[0].options.length === 2);
	ok('разбор: буквы вариантов', p.questions[0].options.map((o) => o.letter).join() === 'А,Б');
	ok('разбор: В1 без ответа', p.questions[0].answered === false);
	ok('разбор: В2 с ответом', p.questions[1].answered === true);
	ok('разбор: статус прочитан', p.waiting === true);

	// Поле, подписанное как ВСТРЕЧНЫЙ ВОПРОС, ответом не считается: развилка не выбрана.
	// Случай снят с живого Р5 интервью №010 и закреплён здесь фикстурой — на живых данных он
	// перестал бы стеречь правило в тот час, когда владелец ответит.
	const counter = [
		'### Р9. Развилка?',
		'- **А) (рекомендуется)** вариант',
		'',
		'**Ответ (вопрос владельца):** «а можно иначе?»',
		'',
		'> ### Ответ агента: можно, но…',
		'',
	].join('\n');
	const pc = parseInterview('проба.md', counter);
	ok('встречный вопрос НЕ считается ответом', pc.questions[0]?.answered === false);
	ok('встречный вопрос помечен признаком', pc.questions[0]?.counterQuestion === true);
	ok(
		'обычное поле ответом считается',
		parseInterview('x.md', '### Р9. Вопрос?\n\n**Ответ:** В\n').questions[0]?.answered === true,
	);
	// Многострочный вариант (жирный заголовок перенесён) обязан разобраться — на этом контур обжёгся.
	const wrapped = [
		'### Р8. Развилка?',
		'- **А) первый** хвост',
		'- **Б) (ДОБАВЛЕН по вашему вопросу — и это лучший вариант) Ни один язык не сидит на',
		'  корне.** Оба живут своими адресами.',
		'- **В) свой ответ** —',
		'',
		'**Ответ:**',
		'',
	].join('\n');
	const pw = parseInterview('x.md', wrapped);
	ok('вариант с переносом строки не теряется', pw.questions[0]?.options.length === 3);
	ok('буквы вариантов с переносом верны', pw.questions[0]?.options.map((o) => o.letter).join() === 'А,Б,В');

	// Рендерер: связка, а не просто отсутствие падения (EXP-0015 — структура ≠ связность)
	const html = mdToHtml(doc);
	ok('рендер: заголовок', html.includes('<h1>'));
	ok('рендер: список', html.includes('<li>'));
	ok('рендер: цитата', html.includes('<blockquote>'));
	ok('рендер: жирный', html.includes('<strong>'));
	ok('рендер: таблица', mdToHtml('| а | б |\n|---|---|\n| 1 | 2 |').includes('<table>'));
	ok('рендер: код дословно', mdToHtml('```\n<b>\n```').includes('&lt;b&gt;'));
	ok('рендер: экранирование', mdToHtml('<script>').includes('&lt;script&gt;'));
	ok('рендер: ссылка', mdToHtml('[а](/б)').includes('<a href="/б">'));

	// Метаблок
	const meta = parseMeta('```yaml\ntitle: Черновик\nkind: outbound\nartifacts:\n  - {id: a1, target: "GitHub · repo", body_file: drafts/a1.md}\n```\n\n# Заголовок\n');
	ok('мета: kind', meta.kind === 'outbound');
	ok('мета: title', meta.title === 'Черновик');
	ok('мета: артефакт разобран', meta.artifacts[0]?.id === 'a1');
	ok('мета: цель с пробелами', meta.artifacts[0]?.target === 'GitHub · repo');
	ok('мета: без блока — интервью', parseMeta('# Просто\n').kind === 'interview');
	ok('мета: заголовок из #', parseMeta('# Просто\n').title === 'Просто');

	// Имена решений производны от документа (I2)
	ok(
		'решение: имя производно',
		decisionPath('/x/interviews/interview_010_a.md').endsWith('interview_010_a.decision.json'),
	);
	ok(
		'решение: разные документы — разные файлы',
		decisionPath('/x/a.md') !== decisionPath('/x/b.md'),
	);

	return fails;
}

// ─────────────────────────────────────────────────────────────────────────────
// ПАЧКА: КОГДА СЕРВЕРУ ПОРА УМИРАТЬ (bugs/NEW_review_batch_dies_after_first_answer, 2026-09-05)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Пачка закрывается ТОЛЬКО когда в ней не осталось ни одного документа, ждущего владельца.
 *
 * Прежнее правило «любое сохранение закрывает контур» верно для одиночной страницы и разрушительно
 * для пачки: владелец ответил на первый документ — сервер умер — второй и третий он писал в
 * мёртвую страницу («Сервер агента замолчал»). Функция чистая нарочно: решение о выходе судится
 * юнитом, а не живым владельцем.
 *
 * @param {string[]} rest документы пачки, всё ещё ждущие ответа (без только что отвеченного)
 * @returns {boolean} true — очередь пуста, серверу пора завершиться; false — жить дальше
 */
/**
 * Очередь спрашивает признак «отвечено», а не доверяет списку (`bugs/NEW_review_queue_keeps_answered`).
 *
 * Очередь — простой список в `queue.json`: `queue` в него дописывал, а вынимал только успешный
 * проход пачки. Ответ любым другим путём (страницей одного документа, правкой руками, чатом с
 * разносом) очередь не трогал — и она копила отвеченные: «всего накоплено: 10» при одном
 * ждущем; пачка показала бы владельцу девять вопросов, которые он уже закрыл своей рукой.
 * Признак «ждёт» у проекта один и надёжен (`parseInterview().waiting`, его же читает
 * `npm run questions`), поэтому и `queue`, и `batch` фильтруют список им и ПИШУТ отфильтрованное
 * обратно — список перестаёт быть второй правдой рядом с самими документами.
 *
 * @param {Array<{doc: string}>} items записи очереди
 * @param {(item: {doc: string}) => boolean} isWaiting документ существует и ждёт владельца
 * @returns {{ live: Array, dropped: Array }} живые и отброшенные (отвеченные или исчезнувшие)
 */
export function pruneQueue(items, isWaiting) {
	const live = [];
	const dropped = [];
	for (const item of items ?? []) (isWaiting(item) ? live : dropped).push(item);
	return { live, dropped };
}

export function batchExitAfterDecision(rest) {
	return Array.isArray(rest) && rest.length === 0;
}

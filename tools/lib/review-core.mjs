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
const OPTION_START = /^\s*[-*]\s+\*\*(?<letter>[\p{Lu}])\)/u;
const OPTION_FULL = /\*\*(?<letter>[\p{Lu}])\)\s*(?<label>[\s\S]*?)\*\*(?<rest>[\s\S]*)/u;
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

		if (OPTION_START.test(line) && current.answerLine < 0) {
			current.optionLines = (current.optionLines ?? 0) + 1;
			// Собираем пункт ЦЕЛИКОМ: сам маркер плюс его продолжения с отступом. Жирный заголовок
			// варианта запросто переносится на вторую строку — на этом контур уже обжёгся.
			let text = line;
			for (let j = i + 1; j < lines.length; j++) {
				if (!LIST_CONT.test(lines[j]) || OPTION_START.test(lines[j])) break;
				if (/^\s*[-*]\s/u.test(lines[j])) break;
				text += ' ' + lines[j].trim();
			}
			const o = OPTION_FULL.exec(text);
			if (o) {
				current.options.push({
					letter: o.groups.letter,
					label: (o.groups.label + ' ' + o.groups.rest).trim().replace(/\s+/g, ' ').slice(0, 300),
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

/** Строчные преобразования: код, жирный, курсив, ссылки, зачёркнутое. */
export function inline(s) {
	let t = esc(s);
	t = t.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
	t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
	t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>');
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

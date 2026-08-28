/**
 * ЮНИТЫ МАШИННОЙ ПОДАЧИ ПЕРЕОБХОДА (`tools/lib/yandex-recrawl-core.mjs`). Сети не касаются.
 *
 * Прогон: node --test tools/yandex-recrawl.test.mjs   ·   npm run test:tools
 *
 * 🔴 ЧТО ЗДЕСЬ СТЕРЕЖЁТСЯ ПО-НАСТОЯЩЕМУ — ТРИ ВЕЩИ, КАЖДАЯ ОПЛАЧЕНА ЗАМЕРОМ ИЛИ КАНОНОМ:
 *   · **машина уступает человеку.** Квота у интерфейса и API ОБЩАЯ — это замерено живым вызовом
 *     (`bugs/203`: израсходовано 150 при 150 отправленных руками). Владелец может слать сам в тот
 *     же день, поэтому прибор берёт остаток квоты как есть и никогда не шлёт сверх него;
 *   · **409 — это НЕ ошибка прогона.** «Адрес уже в очереди» означает, что работа уже сделана, и
 *     квота на него не потрачена. Прибор, считающий 409 провалом, отчитается о беде там, где всё
 *     хорошо, — и наоборот, потратит попытки, приняв отказ за успех;
 *   · **429 останавливает прогон, а не пропускается.** Иначе прибор долбит API полутора сотнями
 *     одинаковых отказов подряд — по чужому сервису и по нашей репутации.
 *
 * Числа не с потолка: 1201 — настоящий остаток очереди (`recrawl-rest.txt`), 150 — суточная
 * квота, названная самим API в живом вызове 2026-08-28.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	parseAddresses,
	remainingQueue,
	planBatch,
	classifyResponse,
	ledgerLine,
	REFUSALS,
} from './lib/yandex-recrawl-core.mjs';

const url = (n) => `https://ndimspace.app/ru/dimension/x-${n}`;
const many = (n) => Array.from({ length: n }, (_, i) => url(i));

// ── РАЗБОР ФАЙЛА АДРЕСОВ ─────────────────────────────────────────────────────────────────────

test('последняя строка БЕЗ перевода считается — иначе очередь занижена на единицу', () => {
	// Цена уже уплачена в разведке: `wc -l` дал 1200 при 1201 адресе, и число поехало в план.
	const text = `${url(1)}\n${url(2)}\n${url(3)}`; // хвостового \n нет намеренно
	assert.equal(parseAddresses(text).length, 3);
});

test('пустые строки и пробелы не превращаются в адреса', () => {
	assert.deepEqual(parseAddresses(`${url(1)}\n\n   \n${url(2)}\n`), [url(1), url(2)]);
});

// ── ЧТО ОСТАЛОСЬ ПОДАТЬ ──────────────────────────────────────────────────────────────────────

test('уже отправленное не подаётся повторно, порядок очереди сохраняется', () => {
	const queue = [url(1), url(2), url(3), url(4)];
	const left = remainingQueue(queue, [url(2)]);
	assert.deepEqual(left, [url(1), url(3), url(4)], 'порядок «последние удалённые первыми» цел');
});

test('пустой журнал отправленного оставляет очередь целой', () => {
	assert.equal(remainingQueue(many(1201), []).length, 1201);
});

// ── СКОЛЬКО СЛАТЬ: МАШИНА УСТУПАЕТ ЧЕЛОВЕКУ ─────────────────────────────────────────────────

test('🔴 остаток квоты — потолок: владелец слал руками, машина берёт только оставшееся', () => {
	// Он отправил 40 из 150 своей рукой; API отдаёт остаток 110 — столько и шлём, не 150.
	const план = planBatch({ remaining: many(1201), quotaRemainder: 110, cap: 150 });
	assert.equal(план.size, 110);
	assert.equal(план.limitedBy, 'квота');
	assert.equal(план.urls.length, 110);
});

test('квота ноль — не шлём НИЧЕГО и говорим почему', () => {
	const план = planBatch({ remaining: many(1201), quotaRemainder: 0, cap: 150 });
	assert.equal(план.size, 0);
	assert.equal(план.limitedBy, 'квота исчерпана');
	assert.deepEqual(план.urls, []);
});

test('отрицательный остаток квоты не превращается в отрицательную порцию', () => {
	// API такого не обещает, но прибор не имеет права сломаться о чужое число.
	assert.equal(planBatch({ remaining: many(10), quotaRemainder: -5, cap: 150 }).size, 0);
});

test('очередь короче квоты — шлём очередь и называем ограничителем её', () => {
	const план = planBatch({ remaining: many(7), quotaRemainder: 150, cap: 150 });
	assert.equal(план.size, 7);
	assert.equal(план.limitedBy, 'очередь');
});

test('пустая очередь — работа окончена, а не «квота исчерпана»', () => {
	const план = planBatch({ remaining: [], quotaRemainder: 150, cap: 150 });
	assert.equal(план.size, 0);
	assert.equal(план.limitedBy, 'очередь пуста', 'причина различает конец работы и упор в квоту');
});

test('потолок порции ограничивает, когда и очередь, и квота больше него', () => {
	const план = planBatch({ remaining: many(1201), quotaRemainder: 150, cap: 50 });
	assert.equal(план.size, 50);
	assert.equal(план.limitedBy, 'потолок порции');
});

// ── КАК ПОНИМАТЬ ОТВЕТЫ ──────────────────────────────────────────────────────────────────────

test('202 — принято, остаток квоты приезжает вместе с ответом', () => {
	const r = classifyResponse({ status: 202, body: { task_id: 'abc', quota_remainder: 149 } });
	assert.equal(r.outcome, 'accepted');
	assert.equal(r.taskId, 'abc');
	assert.equal(r.quotaRemainder, 149);
});

test('🔴 409 — это ПРОПУСК, а не провал: адрес уже в очереди, квота не потрачена', () => {
	const r = classifyResponse({ status: 409, body: {} });
	assert.equal(r.outcome, 'skipped');
	assert.match(r.why, /URL_ALREADY_ADDED/);
});

test('🔴 429 ОСТАНАВЛИВАЕТ прогон, а не пропускает адрес', () => {
	const r = classifyResponse({ status: 429, body: {} });
	assert.equal(r.outcome, 'stop', 'иначе прибор пошлёт ещё 149 заведомо отказных запросов');
	assert.match(r.why, /QUOTA_EXCEEDED/);
});

test('403 и 404 останавливают: сломан доступ, а не адрес', () => {
	assert.equal(classifyResponse({ status: 403, body: {} }).outcome, 'stop');
	assert.equal(classifyResponse({ status: 404, body: {} }).outcome, 'stop');
});

test('400 — беда одного адреса, прогон продолжается', () => {
	const r = classifyResponse({ status: 400, body: {} });
	assert.equal(r.outcome, 'failed');
	assert.match(r.why, /INVALID_URL/);
});

test('незнакомый код не выдаётся за успех и называет себя числом', () => {
	const r = classifyResponse({ status: 503, body: {} });
	assert.equal(r.outcome, 'failed');
	assert.match(r.why, /503/);
});

test('коды отказов названы словами первоисточника, без нашего перевода', () => {
	for (const code of [400, 403, 404, 409, 429]) {
		assert.match(REFUSALS[code], /^[A-Z_]+ —/, `${code} обязан нести имя Яндекса`);
	}
});

// ── СТРОКА ОТЧЁТА В bugs/203 ────────────────────────────────────────────────────────────────

test('строка журнала несёт три числа, которых требует Менеджер', () => {
	const line = ledgerLine({
		date: '2026-08-29',
		accepted: 150,
		skipped: 0,
		failed: 0,
		queueLeft: 1051,
		quotaLeft: 0,
	});
	assert.match(line, /2026-08-29/);
	assert.match(line, /отправлено \*\*150\*\*/);
	assert.match(line, /остаток очереди \*\*1051\*\*/);
	assert.match(line, /остаток квоты 0/);
	assert.doesNotMatch(line, /уже в очереди/, 'нулевые подробности строку не засоряют');
});

test('пропуски и отказы попадают в строку, когда они были', () => {
	const line = ledgerLine({
		date: '2026-08-30',
		accepted: 140,
		skipped: 8,
		failed: 2,
		queueLeft: 901,
		quotaLeft: 0,
	});
	assert.match(line, /уже в очереди 8/);
	assert.match(line, /отказов 2/);
});

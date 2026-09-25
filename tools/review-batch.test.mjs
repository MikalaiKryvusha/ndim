/**
 * ЖИВОЙ ТЕСТ ПАЧКИ ВЫЧИТКИ — `tools/review.mjs batch` (bugs/NEW_review_batch_dies_after_first_answer).
 *
 * 2026-09-05 владелец ответил на первый документ пачки, а сервер погас: правило «любое сохранение
 * закрывает контур» было применено к пачке. Второй и третий документы он писал в мёртвую страницу.
 * Этот тест поднимает НАСТОЯЩИЙ сервер пачки на двух подложных документах и проверяет цикл, который
 * никто не гонял: ответ на первый → сервер жив → ответ на последний → сервер завершился кодом 0.
 *
 * Очередь — своя (`--queue`), документы — под `test-results/`, решения — с приметным префиксом и
 * убираются за собой: настоящая очередь владельца и его интервью не трогаются.
 *
 * Запуск: node --test tools/review-batch.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = join(ROOT, 'test-results', 'owner-reviews', 'selftest-batch');
const DECISIONS = join(ROOT, 'interviews', 'decisions');
const PREFIX = 'zz-selftest-batch-';

const doc = (title) =>
	`# Интервью №999 — ${title}\n\n` +
	`> Тема: подложный документ живого теста пачки, владельцу не показывается.\n` +
	`> Создан: 2026-09-05 · **Статус:** 🔴 ЖДЁТ ОТВЕТА\n\n---\n\n` +
	`### В1. Подложный вопрос теста — какой вариант?\n\n**Адресат ответа:** тест пачки\n\n` +
	`Текст вопроса целиком стоит здесь, отсылок наружу нет.\n\n- **А) Первый.**\n- **Б) Второй.**\n\n**Ответ:**\n`;

function cleanup() {
	rmSync(DIR, { recursive: true, force: true });
	for (const sub of ['', 'archive']) {
		const d = join(DECISIONS, sub);
		if (!existsSync(d)) continue;
		for (const f of readdirSync(d)) if (f.startsWith(PREFIX)) rmSync(join(d, f), { force: true });
	}
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Тело ответа — как у страницы документа пачки: с 2026-09-25 она несёт редакцию документа (`<body data-rev>`), и сервер
// отвергает ответ без неё (`bugs/NEW_review_page_stale_tab_accepts_answers`). Редакция берётся тем же путём, что у
// страницы, — из разметки, которую отдаёт сервер пачки, а не вычисляется тестом сам.
async function decide(url, relDoc, choice) {
	const page = await fetch(`${url}doc?p=${encodeURIComponent(relDoc)}`).then((r) => r.text());
	const rev = /<body[^>]*\sdata-rev="([^"]+)"/u.exec(page)?.[1];
	assert.ok(rev, `страница документа пачки не несёт редакцию (data-rev): ${relDoc}`);
	const res = await fetch(`${url}decision`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ doc: relDoc, rev, by: 'тест пачки', answers: { В1: { choice, text: '', comment: '' } }, artifacts: {}, comment: '' }),
	});
	return res.json();
}

test('пачка живёт после первого ответа и закрывается после последнего', async () => {
	cleanup();
	mkdirSync(DIR, { recursive: true });
	const a = join(DIR, `${PREFIX}a.md`);
	const b = join(DIR, `${PREFIX}b.md`);
	writeFileSync(a, doc('первый подложный'), 'utf8');
	writeFileSync(b, doc('второй подложный'), 'utf8');
	const relA = relative(ROOT, a).split(sep).join('/');
	const relB = relative(ROOT, b).split(sep).join('/');
	const queue = join(DIR, 'queue.json');
	writeFileSync(queue, JSON.stringify({ items: [{ doc: relA, поставлен: 'тест' }, { doc: relB, поставлен: 'тест' }] }), 'utf8');

	// `--grace 1000`: после ПОСЛЕДНЕГО ответа сервер ждёт секунду тишины пульса и уходит; у человека
	// это полминуты, чтобы открытая вкладка не увидела «сервер замолчал» над записанным.
	const child = spawn(process.execPath, ['tools/review.mjs', 'batch', '--port', '0', '--no-open', '--no-signal', '--grace', '1000', '--queue', relative(ROOT, queue)], {
		cwd: ROOT,
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let out = '';
	child.stdout.on('data', (c) => (out += c));
	child.stderr.on('data', (c) => (out += c));
	const exited = new Promise((r) => child.on('exit', (code) => r(code)));

	try {
		let url = null;
		for (let i = 0; i < 100 && !url; i++) {
			const m = out.match(/Пачка поднята: (http:\/\/127\.0\.0\.1:\d+\/)/u);
			if (m) url = m[1];
			else await wait(100);
		}
		assert.ok(url, `сервер пачки не поднялся за 10 с:\n${out}`);

		// 0 · контроль: ответ без редакции (страница старой версии контура) НЕ записывается и сервер не гасит
		const legacy = await fetch(`${url}decision`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ doc: relA, by: 'тест пачки', answers: { В1: { choice: 'Б', text: '', comment: '' } }, artifacts: {}, comment: '' }),
		});
		assert.equal(legacy.status, 409, 'ответ без редакции обязан получить отказ 409');
		assert.equal((await legacy.json()).stale, true, 'отказ назван stale');
		assert.doesNotMatch(readFileSync(a, 'utf8'), /\*\*Ответ:\*\* \*\*Б\*\*/u, 'ответ без редакции в md не лёг');

		// 1 · первый документ отвечен → записан → СЕРВЕР ЖИВ (раньше здесь он умирал)
		const first = await decide(url, relA, 'А');
		assert.equal(first.ok, true, `первый ответ не записан: ${JSON.stringify(first)}`);
		await wait(3000); // прежняя редакция гасила сервер через 2,5 с — ждём дольше её таймера
		// Пульс с 2026-09-25 отвечает 200 и JSON (редакция документа и признак закрытия — их читает страница), прежде 204:
		// судится «сервер ответил успехом», мёртвый сервер по-прежнему даёт отказ соединения.
		const alive = await fetch(`${url}alive`).then((r) => (r.ok ? 'жив' : r.status)).catch(() => 'мёртв');
		assert.equal(alive, 'жив', 'после первого ответа сервер пачки обязан жить: остался второй документ');
		assert.match(readFileSync(a, 'utf8'), /\*\*Ответ:\*\* \*\*А\*\*/u, 'ответ по первому документу лёг в md');
		const index = await fetch(url).then((r) => r.text());
		assert.match(index, /отвечено/u, 'список пачки показывает первый документ отвеченным');

		// 2 · последний документ отвечен → сервер завершается сам, кодом 0
		const second = await decide(url, relB, 'Б');
		assert.equal(second.ok, true, `второй ответ не записан: ${JSON.stringify(second)}`);
		const code = await Promise.race([exited, wait(8000).then(() => 'не завершился')]);
		assert.equal(code, 0, `после последнего ответа пачка обязана завершиться кодом 0, получено: ${code}\n${out}`);
		assert.match(out, /Очередь пуста/u, 'лог называет причину выхода');
	} finally {
		if (child.exitCode === null) child.kill('SIGKILL');
		cleanup();
	}
});

/**
 * ОЧЕРЕДЬ ВЫЧИТКИ НЕ КОПИТ ОТВЕЧЕННЫЕ (`bugs/NEW_review_queue_keeps_answered`).
 *
 * Приёмка документа бага, дословно: «положить в очередь отвеченный документ → `batch` его не
 * показывает и убирает из файла»; «положить неотвеченный → показывает» (вторую половину держит
 * живой тест `tools/review-batch.test.mjs`). Здесь — чистая функция `pruneQueue` и два живых
 * прогона CLI на подложных документах под `test-results/` со своей очередью (`--queue`):
 * настоящая очередь владельца не трогается.
 *
 * Мутация (К4): в `readQueuePruned` заменить `pruneQueue(...)` на `{ live: q.items, dropped: [] }`
 * — оба живых случая краснеют (файл не опустошён, `queue` посчитал отвеченный).
 *
 * Прогон: node --test tools/review-queue-prune.test.mjs   (или `npm run test:tools`)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pruneQueue } from './lib/review-core.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = join(ROOT, 'test-results', 'owner-reviews', 'selftest-queue-prune');
const rel = (p) => relative(ROOT, p).split(sep).join('/');

const answered =
	`# Интервью №998 — подложный отвеченный\n\n> Тема: подложный документ теста очереди.\n` +
	`> Создан: 2026-09-12 · **Статус:** ✅ ОТВЕЧЕНО 2026-09-12\n\n---\n\n` +
	`### В1. Подложный вопрос?\n\n**Адресат ответа:** тест\n\nТекст вопроса целиком здесь.\n\n- **А) Да.**\n\n**Ответ:** **А**\n`;
const waiting =
	`# Интервью №997 — подложный ждущий\n\n> Тема: подложный документ теста очереди.\n` +
	`> Создан: 2026-09-12 · **Статус:** 🔴 ЖДЁТ ОТВЕТА\n\n---\n\n` +
	`### В1. Подложный вопрос?\n\n**Адресат ответа:** тест\n\nТекст вопроса целиком здесь.\n\n- **А) Да.**\n\n**Ответ:**\n`;

/*
 * 🔴 ТАЙМАУТ ОБЯЗАТЕЛЕН: на мутанте (очистка снята) отвеченный документ остаётся «живым», `batch`
 * поднимает настоящий сервер и ЖДЁТ владельца — без таймаута тест ВИСИТ, а не краснеет
 * (замер 2026-09-12: прогон ушёл за 120 с). Проверка, которая не умеет покраснеть, ничего не
 * доказывает (`TESTING_FRAMEWORK.md`, ворота 5); `timeout` превращает зависание в красное.
 */
const cli = (...args) => spawnSync(process.execPath, ['tools/review.mjs', ...args], {
	cwd: ROOT, encoding: 'utf8', timeout: 15000, killSignal: 'SIGKILL',
});

test('pruneQueue: отвеченные и исчезнувшие отбрасываются, ждущие остаются', () => {
	const items = [{ doc: 'a' }, { doc: 'b' }, { doc: 'c' }];
	const r = pruneQueue(items, (i) => i.doc === 'b');
	assert.deepEqual(r.live.map((i) => i.doc), ['b']);
	assert.deepEqual(r.dropped.map((i) => i.doc), ['a', 'c']);
	assert.deepEqual(pruneQueue(undefined, () => true), { live: [], dropped: [] });
});

test('🔴 отвеченный документ в очереди: batch его не показывает и УБИРАЕТ ИЗ ФАЙЛА', () => {
	rmSync(DIR, { recursive: true, force: true });
	mkdirSync(DIR, { recursive: true });
	try {
		const a = join(DIR, 'answered.md');
		writeFileSync(a, answered, 'utf8');
		const queue = join(DIR, 'queue.json');
		writeFileSync(queue, JSON.stringify({ items: [{ doc: rel(a), поставлен: 'тест' }] }), 'utf8');
		const r = cli('batch', '--port', '0', '--no-open', '--no-signal', '--queue', rel(queue));
		assert.equal(r.status, 0, `batch упал:\n${r.stdout}${r.stderr}`);
		assert.match(r.stdout, /Очередь пуста/u, 'отвеченный документ не показан');
		assert.match(r.stdout, /убрано отвеченных или исчезнувших: 1/u, 'лог называет уборку');
		assert.deepEqual(JSON.parse(readFileSync(queue, 'utf8')).items, [], 'файл очереди опустошён');
	} finally { rmSync(DIR, { recursive: true, force: true }); }
});

test('queue: отвеченный в очередь не кладётся, ждущий кладётся, число честное', () => {
	rmSync(DIR, { recursive: true, force: true });
	mkdirSync(DIR, { recursive: true });
	try {
		const a = join(DIR, 'answered.md');
		const w = join(DIR, 'waiting.md');
		writeFileSync(a, answered, 'utf8');
		writeFileSync(w, waiting, 'utf8');
		const queue = join(DIR, 'queue.json');
		// в файле уже лежит отвеченный — как в инциденте (девять отвеченных из десяти)
		writeFileSync(queue, JSON.stringify({ items: [{ doc: rel(a), поставлен: 'тест' }] }), 'utf8');
		const r1 = cli('queue', rel(a), '--queue', rel(queue));
		assert.match(r1.stdout, /Не в очередь[\s\S]*всего накоплено: 0/u, 'отвеченный не посчитан');
		assert.deepEqual(JSON.parse(readFileSync(queue, 'utf8')).items, [], 'старый отвеченный вычищен из файла');
		const r2 = cli('queue', rel(w), '--queue', rel(queue));
		assert.match(r2.stdout, /В очередь[\s\S]*всего накоплено: 1/u, 'ждущий положен и посчитан');
		assert.equal(JSON.parse(readFileSync(queue, 'utf8')).items.length, 1);
	} finally { rmSync(DIR, { recursive: true, force: true }); }
});

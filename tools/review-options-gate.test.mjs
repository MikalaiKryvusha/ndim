// Юнит суда радиокнопок, Н2 (`bugs/NEW_review_page_options_without_radio.md`): вопрос с вариантами без кнопок в очередь
// пачки не встаёт — пачка строит страницу через /doc?p= мимо preflight. Очередь — временный файл (`--queue`), живая
// `interviews/decisions/queue.json` не трогается. Страница /doc — живой кейс РК-05 драйвера
// `qa/reports/2026-09-25_review-radio.driver.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const doc = (options) =>
	['# Интервью №995 — проверочное', '', '> **Статус:** 🔴 ЖДЁТ ОТВЕТА', '', '---', '', '### В1. Проверочный вопрос', '', ...options, '', '**Ответ:**', ''].join('\n');

function queue(text) {
	const dir = mkdtempSync(join(tmpdir(), 'review-gate-'));
	const file = join(dir, 'interview_995_gate.md');
	const q = join(dir, 'queue.json');
	writeFileSync(file, text, 'utf8');
	const r = spawnSync(process.execPath, ['tools/review.mjs', 'queue', file, '--queue', q], { encoding: 'utf8' });
	const queued = existsSync(q) && readFileSync(q, 'utf8').includes('interview_995_gate');
	rmSync(dir, { recursive: true, force: true });
	return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), queued };
}

test('🔴 варианты без кнопок («А) …» без жирного) — queue отказывает кодом 1, в очередь не пишет', () => {
	const r = queue(doc(['А) Первый путь.', 'Б) Второй путь.']));
	assert.equal(r.code, 1, r.out);
	assert.match(r.out, /НЕ В ОЧЕРЕДЬ/);
	assert.equal(r.queued, false);
});

test('КОНТРОЛЬ: узнанные варианты — отказа «НЕ В ОЧЕРЕДЬ» нет, код 0', () => {
	// Файл лежит вне interviews/, поэтому очередь говорит «не ждёт владельца» — это другое её правило; здесь судится
	// только то, что проверка кнопок узнанные варианты пропускает.
	const r = queue(doc(['**А) Первый путь.** Довод.', '', '**Б) Второй путь.** Довод.']));
	assert.equal(r.code, 0, r.out);
	assert.doesNotMatch(r.out, /НЕ В ОЧЕРЕДЬ/);
});

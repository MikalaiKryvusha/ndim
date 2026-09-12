/**
 * СВОДКА СДАЧИ ОДНОЙ КОМАНДОЙ (`tools/check-owner-classes.mjs --summary`, `bugs/206`).
 *
 * Приёмка документа: (1) форма печатает популяцию поимённо, находки ДО и ПОСЛЕ, отказы и
 * пожелания раздельно; (2) число производится прибором; (3) «сводка, снятая с ДРУГОЙ популяции,
 * чем заявлена, обязана расходиться видимо» — карточка, которой нет в одном из файлов, помечена,
 * и итог несёт число расхождения, а CLI выходит кодом 1.
 *
 * Класс 1 (дата в будущем) — единственный ОТКАЗ, воспроизводимый одной строкой; класс 16 даёт
 * пожелание. Фикстуры сняты по образцам `check-owner-classes.test.mjs`, «сегодня» задано явно.
 *
 * Мутация (К4): в `сводкаСдачи` считать `где` всегда как 'обе' — тест расхождения краснеет.
 *
 * Прогон: node --test tools/owner-classes-summary.test.mjs   (или `npm run test:tools`)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { сводкаСдачи } from './check-owner-classes.mjs';

const СЕГОДНЯ = '2026-08-23';
const ROOT = fileURLToPath(new URL('..', import.meta.url));

const card = (wikidata, ru) => ({ wikidata, title: { ru: `Образец ${wikidata}`, en: 'Sample' }, description: { ru, en: '' } });
const БУДУЩЕЕ = 'Картина выйдет в прокат 14 декабря 2026 года. Приняли её тепло.';
const ЧИСТО = 'Картина вышла в прокат 19 июля 2022 года. Приняли её тепло.';

test('сводка: находки ДО и ПОСЛЕ сняты одним прогоном, популяция поимённо', () => {
	const до = { candidates: [card('Q1', БУДУЩЕЕ), card('Q2', ЧИСТО)] };
	const после = { candidates: [card('Q1', ЧИСТО), card('Q2', ЧИСТО)] };
	const s = сводкаСдачи(до, после, СЕГОДНЯ);
	assert.deepEqual(s.rows.map((r) => r.wikidata), ['Q1', 'Q2']);
	const q1 = s.rows.find((r) => r.wikidata === 'Q1');
	assert.ok(q1.до.отказов >= 1, 'контроль прибора: у Q1 ДО есть отказ (дата в будущем)');
	assert.equal(q1.после.отказов, 0, 'ПОСЛЕ отказов нет');
	assert.equal(s.итог.расхождениеПопуляции, 0);
	assert.equal(s.итог.вОбеих, 2);
	assert.ok(s.итог.находокДо > s.итог.находокПосле);
});

test('🔴 сводка с ДРУГОЙ популяции расходится видимо: карточка только в одном файле помечена', () => {
	const до = { candidates: [card('Q1', БУДУЩЕЕ), card('Q2', ЧИСТО)] };
	const после = { candidates: [card('Q1', ЧИСТО), card('Q3', ЧИСТО)] };
	const s = сводкаСдачи(до, после, СЕГОДНЯ);
	assert.equal(s.итог.расхождениеПопуляции, 2, 'Q2 только ДО и Q3 только ПОСЛЕ');
	assert.equal(s.rows.find((r) => r.wikidata === 'Q2').где, 'только ДО');
	assert.equal(s.rows.find((r) => r.wikidata === 'Q3').где, 'только ПОСЛЕ');
	assert.equal(s.rows.find((r) => r.wikidata === 'Q2').после, null, 'нет карточки — нет числа, не ноль');
});

test('CLI --summary: печатает таблицу и выходит 1 при расхождении популяций, 0 без него', () => {
	const dir = mkdtempSync(join(tmpdir(), 'ndim-summary-'));
	try {
		const fДо = join(dir, 'do.json');
		const fПосле = join(dir, 'posle.json');
		const fДругая = join(dir, 'drugaya.json');
		writeFileSync(fДо, JSON.stringify({ candidates: [card('Q1', БУДУЩЕЕ)] }), 'utf8');
		writeFileSync(fПосле, JSON.stringify({ candidates: [card('Q1', ЧИСТО)] }), 'utf8');
		writeFileSync(fДругая, JSON.stringify({ candidates: [card('Q9', ЧИСТО)] }), 'utf8');
		const run = (...f) => spawnSync(process.execPath, ['tools/check-owner-classes.mjs', '--summary', ...f, '--today', СЕГОДНЯ], { cwd: ROOT, encoding: 'utf8' });
		const ok = run(fДо, fПосле);
		assert.equal(ok.status, 0, ok.stdout + ok.stderr);
		assert.match(ok.stdout, /Q1 Образец Q1 · \d+ → 0 · 0 · \d+ · обе/u, 'строка карточки: находки ДО → ПОСЛЕ, отказы, пожелания');
		assert.match(ok.stdout, /карточек 1 \(в обеих 1\)/u);
		const bad = run(fДо, fДругая);
		assert.equal(bad.status, 1, 'расхождение популяций — ненулевой код');
		assert.match(bad.stdout, /популяции расходятся: 2/u);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

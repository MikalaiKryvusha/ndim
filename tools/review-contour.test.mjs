/**
 * ЮНИТЫ КОНТРАКТА «СТАРАЯ ВКЛАДКА НЕ ПРИНИМАЕТ ОТВЕТЫ В ПУСТОТУ» (`tools/lib/review-core.mjs`).
 *
 * `bugs/NEW_review_page_stale_tab_accepts_answers.md` (S1), план `plans/NEW_review_contour_stale_tab.md`. Сети и браузера
 * не касаются; живое поведение страницы — ручной прогон `qa/suites/review-stale-tab.md`.
 * Прогон: `node --test tools/review-contour.test.mjs` · `npm run test:tools`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { docRevision, questionPrint, lockState, closeVerdict, mapDraft, stablePort, sameAsRecorded, CLOSE_QUIET_MS } from './lib/review-core.mjs';

test('повтор уже записанного ответа — «записано», а не «документ переписан»; другой ответ — не повтор', () => {
  const prev = { answers: { 'В1': { choice: 'А', text: '', comment: '' }, 'В2': { choice: '', text: 'да', comment: '' } }, comment: '' };
  assert.equal(sameAsRecorded(prev, { answers: { 'В1': { choice: 'А', text: '', comment: '' } } }), true);
  assert.equal(sameAsRecorded(prev, { answers: { 'В1': { choice: 'Б', text: '', comment: '' } } }), false);
  assert.equal(sameAsRecorded(prev, { answers: { 'В3': { choice: 'А' } } }), false);
  assert.equal(sameAsRecorded(null, { answers: { 'В1': { choice: 'А' } } }), false);
  assert.equal(sameAsRecorded(prev, { answers: {} }), false);
  assert.equal(sameAsRecorded(prev, { answers: { 'В1': { choice: 'А' } }, comment: 'новый комментарий' }), false);
});

test('постоянный порт документа: один и тот же для документа, разный для разных, в диапазоне 20000–35999, слэш не важен', () => {
  const a = stablePort('interviews/interview_097_new_main_page_on_stage.md');
  assert.equal(a, stablePort('interviews/interview_097_new_main_page_on_stage.md'));
  assert.equal(a, stablePort('interviews\\interview_097_new_main_page_on_stage.md'));
  assert.notEqual(a, stablePort('interviews/interview_096_how_agents_work_next.md'));
  assert.ok(a >= 20000 && a < 36000);
});

test('редакция меняется от правки текста и не меняется от CRLF, BOM и хвостовых пробелов (та же нормализация, что I3)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rev-'));
  try {
    const a = join(dir, 'a.md');
    writeFileSync(a, '# Интервью\n\n### В1. Вопрос?\n');
    const r1 = docRevision(a);
    writeFileSync(a, '﻿# Интервью\r\n\r\n### В1. Вопрос?\r\n\r\n   ');
    assert.equal(docRevision(a), r1);
    writeFileSync(a, '# Интервью\n\n### В1. Другой вопрос?\n');
    assert.notEqual(docRevision(a), r1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('отпечаток вопроса зависит от текста заголовка и тела, но НЕ от номера (перенумерация — тот же вопрос)', () => {
  assert.equal(questionPrint('В1. Язык?', 'тело'), questionPrint('В1. Язык?', 'тело'));
  assert.notEqual(questionPrint('В1. Язык?', 'тело'), questionPrint('В1. Язык?', 'другое тело'));
  assert.notEqual(questionPrint('В1. Язык?', 'тело'), questionPrint('В1. Другой язык?', 'тело'));
  assert.equal(questionPrint('В1. Язык?', 'тело'), questionPrint('В2. Язык?', 'тело'));
});

test('замок: нет · живой · мёртвый процесс (помнит порт)', () => {
  assert.equal(lockState(null, () => true), 'none');
  assert.equal(lockState({ pid: 'x' }, () => true), 'none');
  assert.equal(lockState({ pid: 42, port: 5000 }, () => true), 'live');
  assert.equal(lockState({ pid: 42, port: 5000 }, () => false), 'stale');
});

test('закрытие живой страницы: отказ, пока страница молода, владелец печатал или черновик не сохранён', () => {
  const now = Date.parse('2026-09-25T18:30:00+03:00');
  const old = new Date(now - CLOSE_QUIET_MS - 1000).toISOString();
  assert.equal(closeVerdict({ startedAt: new Date(now - 60_000).toISOString() }, now).ok, false);
  assert.match(closeVerdict({ startedAt: new Date(now - 60_000).toISOString() }, now).reason, /странице 60 с/);
  assert.equal(closeVerdict({ startedAt: old, lastInputAt: now - 30_000 }, now).ok, false);
  assert.match(closeVerdict({ startedAt: old, lastInputAt: now - 30_000 }, now).reason, /печатал 30 с назад/);
  assert.equal(closeVerdict({ startedAt: old, draftFields: 2, saved: false }, now).ok, false);
  assert.match(closeVerdict({ startedAt: old, draftFields: 2 }, now).reason, /полей: 2/);
  // Граница: тишина дольше порога, черновик пуст или сохранён — закрыть можно.
  assert.equal(closeVerdict({ startedAt: old, lastInputAt: now - CLOSE_QUIET_MS - 1, draftFields: 0 }, now).ok, true);
  assert.equal(closeVerdict({ startedAt: old, draftFields: 3, saved: true }, now).ok, true);
});

// Две редакции №097-подобного интервью: в новой вопрос о практиках убран, язык стал В1, а текст вопроса о строках изменён.
const OLD_REV = 'rev-old';
const NEW_REV = 'rev-new';
const qLang = questionPrint('На каком языке открывается ndimspace.app?', 'тело языка');
const qPractices = questionPrint('Три практики рядом с «Сексом» — так оставить?', 'тело практик');
const qLinesOld = questionPrint('Новые русские строки главной — принимаете?', 'старое тело строк');
const qLinesNew = questionPrint('Новые русские строки главной — принимаете?', 'новое тело строк');
const draftOld = {
  rev: OLD_REV,
  q: {
    'В1': { qh: qPractices, title: 'В1. Три практики рядом с «Сексом» — так оставить?', choice: 'В', text: 'уберём сенситив темы', comment: '' },
    'В2': { qh: qLang, title: 'В2. На каком языке открывается ndimspace.app?', choice: 'А', text: '', comment: '' },
    'В3': { qh: qLinesOld, title: 'В3. Новые русские строки главной — принимаете?', choice: 'В', text: 'кейворды?', comment: '' },
    'В4': { qh: 'нет-такого', title: 'В4. Пустой', choice: '', text: '', comment: '' },
  },
};
const newQuestions = [
  { label: 'В1', qh: qLang },
  { label: 'В2', qh: qLinesNew },
];

test('🔴 перенос в новую редакцию: вопрос с тем же текстом получает ответ по ОТПЕЧАТКУ, даже со сменой номера', () => {
  const m = mapDraft(draftOld, newQuestions, NEW_REV);
  assert.deepEqual(m.place.map((p) => [p.label, p.rec.choice]), [['В1', 'А']]); // язык: был В2 — стал В1
});

test('🔴 ответ на убранный или переписанный вопрос НЕ садится на чужой вопрос с тем же номером — уходит в прошлую редакцию', () => {
  const m = mapDraft(draftOld, newQuestions, NEW_REV);
  assert.deepEqual(m.orphan.map((o) => o.label).sort(), ['В1', 'В3']);
  assert.ok(m.orphan.find((o) => o.label === 'В1').title.includes('практики'));
  assert.ok(!m.place.some((p) => p.label === 'В1' && p.rec.text === 'уберём сенситив темы'));
});

test('пустые записи черновика не переносятся и не считаются прошлой редакцией', () => {
  const m = mapDraft(draftOld, newQuestions, NEW_REV);
  assert.ok(!m.orphan.some((o) => o.label === 'В4'));
});

test('та же редакция — всё на своих местах; черновик старой страницы без отпечатков — по номеру', () => {
  const same = mapDraft({ rev: NEW_REV, q: { 'В1': { qh: qLang, choice: 'Б' } } }, newQuestions, NEW_REV);
  assert.deepEqual(same.place.map((p) => p.label), ['В1']);
  const legacy = mapDraft({ q: { 'В2': { choice: 'А' } } }, newQuestions, NEW_REV);
  assert.deepEqual(legacy.place.map((p) => p.label), ['В2']);
});

test('черновик ДРУГОЙ редакции без отпечатков по номеру не переносится — только в прошлую редакцию', () => {
  const m = mapDraft({ rev: OLD_REV, q: { 'В1': { choice: 'В', text: 'x' } } }, newQuestions, NEW_REV);
  assert.equal(m.place.length, 0);
  assert.deepEqual(m.orphan.map((o) => o.label), ['В1']);
});

test('mapDraft пригоден к вставке в страницу исходником: без обратных кавычек и без знака доллара с фигурной скобкой', () => {
  const src = mapDraft.toString();
  assert.ok(!src.includes('`'));
  assert.ok(!src.includes('$' + '{'));
});

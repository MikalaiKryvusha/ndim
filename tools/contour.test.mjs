// Юнит двери `npm run review` → готовая страница вопросов KAIF (`tools/contour.mjs`, `plans/100`). Стережёт три вещи,
// которые обёртка добавляет к поставляемому генератору: голос владельца, отказ вопросу со ссылкой наружу (слово владельца
// 2026-08-15) и перевод старых слов. Сам генератор судит его самотест (`node .kaif/tools/contour/review.mjs --selftest`).
// Документы — во временной папке; живые `interviews/` и `interviews/decisions/` не трогаются: единственный прогон генератора
// здесь — `--check`, а он ничего не показывает, никого не зовёт и ничего не пишет.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { translateArgs, voiceEnv, docsToLint, outwardRefs } from './contour.mjs';
import { renderMd } from '../.kaif/tools/contour/core.mjs';
import { buildPage } from '../.kaif/tools/contour/review.mjs';

const doc = (questionLine, { answered = false } = {}) => [
  '# Интервью №996 — проверочное', '',
  '> **Создан:** 2026-09-01 · **Статус:** 🟡 ждёт ответа', '', '---', '',
  '### В1. Проверочный вопрос', '', questionLine, '',
  '- **А)** Первый путь.', '- **Б)** Второй путь.', '',
  answered ? '**Ответ:** **А**' : '**Ответ:**', '',
].join('\n');

function withDocs(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'contour-'));
  try {
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text, 'utf8');
    return fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('старые слова переводятся во флаги генератора', () => {
  assert.deepEqual(translateArgs(['open', 'interviews/x.md']).args, ['interviews/x.md']);
  assert.deepEqual(translateArgs(['list']).args, ['--queue', '--list']);
  assert.deepEqual(translateArgs(['queue', 'interviews/x.md']).args, ['--enqueue', 'interviews/x.md']);
  assert.deepEqual(translateArgs(['batch']).args, ['--queue']);
  assert.deepEqual(translateArgs(['close', 'interviews/x.md', '--force']).args, ['interviews/x.md', '--close', '--force']);
  assert.deepEqual(translateArgs(['render', 'interviews/x.md']).args, ['interviews/x.md', '--no-serve']);
  assert.deepEqual(translateArgs(['open', 'interviews/x.md', '--no-signal']).args, ['interviews/x.md', '--silent']);
  assert.deepEqual(translateArgs(['interviews/x.md', '--check']).args, ['interviews/x.md', '--check'], 'новые флаги проходят как есть');
});

test('--voice уходит в окружение, а не флагом: генератор неизвестный флаг отказывает', () => {
  const t = translateArgs(['open', 'interviews/x.md', '--voice', 'baya']);
  assert.deepEqual(t.args, ['interviews/x.md']);
  assert.equal(t.voice, 'baya');
});

test('голос владельца: eugene по умолчанию, тракт — только существующий файл, заданное машиной не перетирается', () => {
  withDocs({ 'say.mjs': '// тракт' }, (dir) => {
    const tool = join(dir, 'say.mjs');
    const e1 = voiceEnv({ NDIM_VOICE_TOOL: tool });
    assert.equal(e1.KAIF_VOICE_TOOL, tool);
    assert.equal(e1.KAIF_VOICE, 'eugene', 'интервью №011, В1 = Д');
    const e2 = voiceEnv({ NDIM_VOICE_TOOL: join(dir, 'нет-такого.mjs') });
    assert.equal(e2.KAIF_VOICE_TOOL, undefined, 'несуществующий тракт не подставляется — генератор честно уйдёт на системный голос');
    const e3 = voiceEnv({ KAIF_VOICE_TOOL: 'X:/своё.mjs', KAIF_VOICE: 'aidar' });
    assert.equal(e3.KAIF_VOICE_TOOL, 'X:/своё.mjs');
    assert.equal(e3.KAIF_VOICE, 'aidar');
    assert.equal(voiceEnv({}, 'xenia').KAIF_VOICE, 'xenia');
  });
});

test('проверяются ровно те документы, которые увидит владелец', async () => {
  assert.deepEqual(await docsToLint(['interviews/x.md']), ['interviews/x.md'], 'показ');
  assert.deepEqual(await docsToLint(['interviews/x.md', '--check']), ['interviews/x.md'], 'проверка говорит правду о показе');
  assert.deepEqual(await docsToLint(['--enqueue', 'interviews/x.md']), ['interviews/x.md'], 'очередь');
  assert.deepEqual(await docsToLint(['--wait', 'interviews/x.md']), [], 'ожидатель ничего не показывает');
  assert.deepEqual(await docsToLint(['interviews/x.md', '--close']), []);
  assert.deepEqual(await docsToLint(['interviews/x.md', '--notice']), [], 'у сообщения вопросов нет');
  assert.deepEqual(await docsToLint(['--queue', '--list']), [], 'список без браузера');
  assert.deepEqual(await docsToLint(['--call', 'нужен пароль']), []);
  assert.deepEqual(await docsToLint(['interviews/x.md', '--where', 'plans/y.md', '--mark-implemented', 'В1']), [], 'аргумент флага — не документ');
});

test('🔴 вопрос со ссылкой наружу находится; объявленная ссылка и отвеченный вопрос — нет', () => {
  withDocs({
    'bad.md': doc('Формула — см. выше, в разделе про ядро.'),
    'ok.md': doc('Формула: похожесть = близость × общность.'),
    'excused.md': doc('Полный список — выше. <!-- ССЫЛКА-ОК: проверочный документ -->'),
    'answered.md': doc('Формула — см. выше.', { answered: true }),
  }, (dir) => {
    assert.equal(outwardRefs(['bad.md'], dir).length, 1);
    assert.equal(outwardRefs(['ok.md'], dir).length, 0);
    assert.equal(outwardRefs(['excused.md'], dir).length, 0);
    assert.equal(outwardRefs(['answered.md'], dir).length, 0);
  });
});

test('🔴 рендер готовой страницы: строки с переносом — один абзац, жирное через перенос не рвётся (местная починка, bugs/KAIF/20)', () => {
  // Наши документы переносятся около 110-й колонки. Поставляемый рендерер 2.8 ставил <p> на КАЖДУЮ строку: вопрос
  // разваливался построчно, а «**…**», перенесённое на следующую строку, оставалось звёздочками — в подписи варианта
  // самопроверка страницы отказывала (16 из 105 интервью). Обновление KAIF, вернувшее рендерер без починки, краснеет здесь.
  const p = renderMd('Первая строка **жирного\nпродолжение** конец.\n\nВторой абзац.');
  assert.equal((p.match(/<p>/g) || []).length, 2, p);
  assert.doesNotMatch(p, /\*\*/, p);
  const li = renderMd('- **А)** вариант **с переносом\n  жирного** и хвост\n- **Б)** второй');
  assert.equal((li.match(/<li>/g) || []).length, 2, li);
  assert.doesNotMatch(li, /\*\*|<p>/, li);
  const q = renderMd('> **Тема:** строка\n> продолжение\n>\n> новый абзац');
  assert.equal((q.match(/<p>/g) || []).length, 2, q);
});

test('🔴 страница несёт местную починку радиокнопки: клик того же нажатия гасится (баг владельца на №106, bugs/KAIF/23)', () => {
  // Поведение судит живой кейс К11 драйвера `qa/reports/2026-09-26_shipped-review-page.driver.mjs` (на поставке — красный).
  // Здесь — ворота: обновление KAIF, вернувшее страницу без починки, краснеет в `npm run test:tools`, а не у владельца.
  withDocs({ 'q.md': doc('Формула: похожесть = близость × общность.') }, (dir) => {
    const html = buildPage(process.cwd(), join(dir, 'q.md')).html;
    assert.match(html, /ptrUntil=Date\.now\(\)\+800/, 'pointerdown ставит окно гашения клика');
    assert.match(html, /addEventListener\('click',function\(e\)\{if\(Date\.now\(\)>ptrUntil\)return;[\s\S]{0,200}e\.preventDefault\(\)\},true\)/, 'клик того же нажатия гасится на фазе захвата');
  });
});

test('🔴 живой отказ: `--check` вопроса со ссылкой наружу — код 3 ДО генератора; чистый документ проходит к генератору', () => {
  withDocs({ 'bad.md': doc('Формула — см. выше.'), 'ok.md': doc('Формула: похожесть = близость × общность.') }, (dir) => {
    const run = (name) => spawnSync(process.execPath, ['tools/contour.mjs', join(dir, name), '--check'], { encoding: 'utf8' });
    const bad = run('bad.md');
    assert.equal(bad.status, 3, bad.stderr);
    assert.match(bad.stderr, /отсылает за своим содержимым НАРУЖУ/);
    assert.doesNotMatch(bad.stdout, /проверка:/, 'генератор не звался');
    const ok = run('ok.md');
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /проверка:.*блоков 1, узнано 1/);
  });
});

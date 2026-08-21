/**
 * ТЕСТ ПРЕДОХРАНИТЕЛЯ «ЗАПУСТИЛИ ИЛИ ПОДКЛЮЧИЛИ» + чистых функций приёмки описаний.
 *
 * 🔴 ПОВОД. `tools/check-candidate-descriptions.mjs` экспортирует `punctuationArtifacts`,
 * `ARTIFACT_PATTERNS`, `sentenceCount`, `opensWithTitle`, `externalAuthority` — то есть его
 * ПОДКЛЮЧАЮТ из других приборов. При этом рабочий режим стоял на верхнем уровне и начинался
 * с `const FILE = process.argv[2]` + `process.exit(2)`. Импорт из чужого прибора убивал ЧУЖОЙ
 * процесс, разобрав чужой аргумент как имя файла партии.
 *
 * Класс закреплён у соседа (`tools/rewrite-catalog-descriptions.mjs:167-174`): **файл, у
 * которого есть и экспорт, и работа на верхнем уровне, обязан спрашивать, запустили его или
 * подключили.** Это ЧЕТВЁРТЫЙ случай за неделю, поэтому у правила теперь есть тест, а не
 * только комментарий: записанный урок — третий сорт лечения (`AGENT_GUIDE.md` → «Журнал опыта»).
 *
 * 🔴🔴 ЭТОТ ФАЙЛ НЕ ПОДКЛЮЧАЕТ ПРИБОР В СВОЙ ПРОЦЕСС — НИ СТРОКОЙ, НИ ЛЕНИВО. Правило выведено
 * двумя мутациями, а не осторожностью: при снятом предохранителе ЛЮБОЙ импорт в процессе
 * прогона запускает рабочий режим, тот зовёт `process.exit(2)`, и `node --test` печатает
 * «pass 0 · fail 1» на весь файл. Такой вердикт НЕАДРЕСЕН и читается как «тесты не
 * запускались» — ровно то, что `BUG_FIXING_FRAMEWORK.md` велит отличать от «опровергнуто».
 * Первая редакция теста импортировала наверху, вторая — лениво внутри тестов; неадресными
 * оказались ОБЕ. Поэтому весь разговор с прибором идёт через ДОЧЕРНИЙ процесс: тогда мутация
 * роняет ровно те тесты, которые её сторожат, и называет их поимённо.
 *
 * Прогон: node --test tools/check-candidate-descriptions.test.mjs   (или `npm run test:tools`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ЗДЕСЬ = dirname(fileURLToPath(import.meta.url));
const ПРИБОР = join(ЗДЕСЬ, 'check-candidate-descriptions.mjs');
const МОДУЛЬ = pathToFileURL(ПРИБОР).href;

/**
 * Запускает дочерний node, который ПОДКЛЮЧАЕТ прибор, считает нужные величины и печатает их
 * одной строкой `RESULT <json>`.
 *
 * ⚠️ Импортёр пишется ВРЕМЕННЫМ ФАЙЛОМ, а не передаётся через `node -e`. Причина замерена:
 * при `-e` сам node разбирает хвост командной строки как СВОИ опции и падает с
 * «bad option: --selftest» — то есть до прибора аргумент не доезжает вовсе, и проверка
 * измеряла бы node, а не нас. Со скриптом-файлом argv устроен ровно так же, как у настоящего
 * прибора, который нас подключает.
 *
 * Тело импортёра едет ФАЙЛОМ, а его аргументы держим ASCII-only: не-ASCII в argv портится
 * кодировкой консоли (`AGENT_GUIDE.md` → «Гигиена документов и текста», лицо 1).
 */
function подключитьВДочернем(лишниеАргументы = []) {
  const метка = `${process.pid}-${лишниеАргументы.join('_') || 'bare'}`.replace(/[^\w.-]/gu, '');
  const импортёр = join(tmpdir(), `ndim-import-probe-${метка}.mjs`);
  const тело = [
    "const m = await import(process.env.NDIM_MODULE);",
    "const out = {",
    "  sentence: [m.sentenceCount('Раз. Два! Три? Четыре.'), m.sentenceCount('Одно предложение без точки'), m.sentenceCount('')],",
    "  opensYes: m.opensWithTitle('Обсессия', '«Обсессия» — американский фильм ужасов 2025 года.'),",
    "  opensNo: m.opensWithTitle('Кобра', 'Американский боевик 1986 года «Кобра», поставленный Косматосом.'),",
    "  authorityYes: m.externalAuthority('Реестр относит картину к драме.').length,",
    "  authorityNo: m.externalAuthority('According to legend, the First Watch was established here.').length,",
    "  artifactYes: m.punctuationArtifacts('Она пишет для крупных постановок. ; продюсерами выступили другие.').length,",
    "  artifactNo: m.punctuationArtifacts('Игра вышла 19 июля 2022 года; издание — 28 мая 2026 года.').length,",
    "};",
    "console.log('RESULT ' + JSON.stringify(out));",
  ].join('\n');
  writeFileSync(импортёр, тело + '\n', 'utf8');
  try {
    return execFileSync(
      process.execPath,
      [импортёр, ...лишниеАргументы],
      { env: { ...process.env, NDIM_MODULE: МОДУЛЬ }, encoding: 'utf8' },
    );
  } finally {
    rmSync(импортёр, { force: true });
  }
}

/** Достаёт разобранный `RESULT` из вывода дочернего процесса. */
function результат(вывод) {
  const m = /RESULT (\{.*\})/u.exec(вывод);
  assert.ok(m, 'дочерний процесс обязан напечатать строку RESULT');
  return JSON.parse(m[1]);
}

// ── ПРЕДОХРАНИТЕЛЬ ─────────────────────────────────────────────────────────────────────────

test('подключение НЕ запускает рабочий режим — процесс жив, чужой argv не разобран', () => {
  // Аргумент, который прежде уходил в `const FILE = process.argv[2]` и валил процесс кодом 2.
  const вывод = подключитьВДочернем(['some-foreign-argument.json']);
  assert.match(вывод, /RESULT /u, 'экспорт обязан работать при подключении');
  assert.doesNotMatch(вывод, /ПРИЁМКА ОПИСАНИЙ/u, 'рабочий режим при подключении запускаться не должен');
});

test('подключение НЕ запускает и самотест — даже когда --selftest стоит в чужом argv', () => {
  // Дыра, которая у соседа осталась открытой: его самотест живёт вне предохранителя.
  const вывод = подключитьВДочернем(['--selftest']);
  assert.match(вывод, /RESULT /u);
  assert.doesNotMatch(вывод, /самотест/u, 'чужой --selftest не должен гонять НАШ самотест');
});

test('прямой запуск с --selftest по-прежнему работает — предохранитель не сломал прибор', () => {
  const вывод = execFileSync(process.execPath, [ПРИБОР, '--selftest'], { encoding: 'utf8' });
  assert.match(вывод, /самотест пройден/u, 'самотест обязан проходить при прямом запуске');
});

test('прямой запуск без файла партии по-прежнему отказывает — рабочий режим на месте', () => {
  /*
   * Контроль прибора (`EXP-0082`): если бы предохранитель погасил рабочий режим НАСОВСЕМ,
   * проверки выше остались бы зелёными на сломанном приборе. Этот случай доказывает, что
   * рабочий режим жив и по-прежнему отказывает без аргумента.
   */
  let код = 0;
  let stderr = '';
  try {
    execFileSync(process.execPath, [ПРИБОР], { encoding: 'utf8' });
  } catch (e) {
    код = e.status;
    stderr = String(e.stderr ?? '');
  }
  assert.equal(код, 2, 'без файла партии прибор обязан выйти кодом 2');
  assert.match(stderr, /Укажи файл партии/u);
});

// ── Чистые функции: они и есть то, ради чего прибор подключают ──────────────────────────────

test('чистые функции приёмки считают то, что заявляют', () => {
  const r = результат(подключитьВДочернем());
  assert.deepEqual(r.sentence, [4, 1, 0], 'sentenceCount: три случая самотеста прибора');
  assert.equal(r.opensYes, true, 'зачин с названия ловится');
  assert.equal(r.opensNo, false, 'упоминание названия дальше по тексту — не нарушение');
  assert.equal(r.authorityYes, 1, 'приписка к источнику ловится');
  assert.equal(r.authorityNo, 0, 'отсылка внутри сюжета — не нарушение');
  assert.ok(r.artifactYes > 0, 'след машинной правки ловится');
  assert.equal(r.artifactNo, 0, 'здоровый текст пропускается');
});

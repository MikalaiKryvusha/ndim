#!/usr/bin/env node
/**
 * ЗАМЕР ПАМЯТИ ДЕРЕВА СТЕНДА — прибор под `bugs/134` («стенд умирает от нехватки памяти»).
 *
 * ЗАЧЕМ ОН ЕСТЬ. Документ бага требует буквально: «Тот процесс, чей `WorkingSetSize` растёт от
 * прогона к прогону, и есть виновник. Пока он не назван числом, любое „лечение“ — угадывание».
 * Замер 2026-08-16 исполнил это по набору Smoke и виновника НЕ НАШЁЛ: рос только `vite dev`, и
 * прирост ЗАТУХАЛ (форма прогрева кэша, не течи), падение не воспроизвелось. Документ сам назвал,
 * куда смотреть дальше: в день падения рядом со стендом шла **сборка НАЧИСТО** — самое тяжёлое по
 * памяти событие проекта (каталог 17,5 МБ, серверный чанк 18 МБ), и шла она ПРИ ЖИВОМ СТЕНДЕ.
 * Этот прибор гоняет ровно ту улику: шаги сценария рядом с поднятым стендом и снимок памяти
 * ПОСЛЕ КАЖДОГО шага, одной таблицей.
 *
 * ЧТО ОН НЕ ДЕЛАЕТ. Он не поднимает стенд и не гасит его: стенд — ресурс под замком доски, и
 * распоряжается им человек, а не прибор. Стенд обязан быть поднят заранее.
 *
 * 🔑 ЧЕСТНОСТЬ ЗАМЕРА. Смерть стенда — это ТОЖЕ результат, и он не должен потеряться: прибор
 * проверяет живость портов и наличие процессов ПЕРЕД каждым шагом и ПОСЛЕ него, и если дерево
 * умерло — печатает последний снимок до смерти и на каком шаге это случилось. Молчаливое
 * «прогон закончился» после смерти стенда — ровно тот ложный диагноз, ради которого баг и заведён.
 *
 * Запуск (стенд уже поднят, замок доски у тебя):
 *   node tools/measure-stand-memory.mjs --steps build,build,smoke,build
 *   node tools/measure-stand-memory.mjs --steps smoke,smoke,smoke,smoke,smoke,smoke   (повтор замера 2026-08-16)
 *
 * Запуск: node tools/measure-stand-memory.mjs
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const STEPS = opt('--steps', 'build,smoke,build,smoke,build,smoke').split(',').map((s) => s.trim()).filter(Boolean);
const OUT = 'test-results/stand-memory';
mkdirSync(OUT, { recursive: true });

/** Порты стенда — по ним видно, жив ли он, ещё до всякой памяти. */
const PORTS = [
  ['http://localhost:5173', 'dev-сервер приложения'],
  ['http://127.0.0.1:8181/', 'эмулятор Firestore'],
  ['http://127.0.0.1:9099/', 'эмулятор Auth'],
];

async function standAlive() {
  const dead = [];
  for (const [url, what] of PORTS) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(3000) });
    } catch {
      dead.push(what);
    }
  }
  return dead;
}

/**
 * СНИМОК РАБОЧЕГО МНОЖЕСТВА — тем же способом, что назван в документе бага
 * (`Get-CimInstance Win32_Process`), потому что сравнивать надо с ЕГО числами, а не со своими.
 * Роль процесса определяется по командной строке; порядок проверок важен — `firebase-tools`
 * несёт в своей строке и `stand.mjs` (он его и запускает), поэтому судится первым.
 */
function snapshot() {
  const ps = `
    $rows = Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='java.exe'"
    foreach ($r in $rows) {
      $c = [string]$r.CommandLine
      $tag = if ($r.Name -eq 'java.exe') { 'java(эмуляторы)' }
        elseif ($c -match 'firebase-tools') { 'firebase-tools' }
        elseif ($c -match 'sync-server[\\\\/]index') { 'сервер синхронизации' }
        elseif ($c -match 'stand\\.mjs') { 'stand.mjs' }
        elseif ($c -match 'vite[\\\\/]bin[\\\\/]vite\\.js') { 'vite dev' }
        elseif ($c -match 'measure-stand-memory') { 'прибор замера' }
        else { 'прочее' }
      if ($tag -ne 'прочее') { '{0};{1};{2}' -f $tag, $r.ProcessId, [math]::Round($r.WorkingSetSize/1MB,1) }
    }`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  const rows = [];
  for (const line of (r.stdout ?? '').split(/\r?\n/)) {
    const [tag, pid, mb] = line.trim().split(';');
    if (tag && pid && mb) rows.push({ tag, pid: Number(pid), mb: Number(mb.replace(',', '.')) });
  }
  return rows;
}

/** Один шаг сценария. Возвращает код выхода и время — чтобы в таблице было видно, что шёл долго. */
function runStep(step) {
  const t0 = Date.now();
  const cmd =
    step === 'build'
      ? { file: 'npm', args: ['run', 'build'] }
      : step === 'smoke'
        ? { file: process.execPath, args: ['tools/smoke.mjs'] }
        : null;
  if (cmd === null) return { code: null, seconds: 0, skipped: `неизвестный шаг «${step}»` };
  const r = spawnSync(cmd.file, cmd.args, {
    encoding: 'utf8',
    shell: process.platform === 'win32', // npm на Windows — .cmd, без shell не запускается
    env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS ?? '--max-old-space-size=6144' },
  });
  return { code: r.status, seconds: ((Date.now() - t0) / 1000).toFixed(1), tail: (r.stdout ?? '').split(/\r?\n/).filter(Boolean).slice(-2).join(' | ') };
}

/* ── Прогон ── */

/*
 * САМОПРОВЕРКА ПРИБОРА (`--sample-only`): печатает один снимок и выходит. Нужна ровно затем,
 * чтобы сломанный сборщик не выяснился ПОСРЕДИ длинного замера под замком стенда: пустая
 * таблица и «процессов нет» выглядят одинаково, а стоят разного. Стенда не требует.
 */
if (argv.includes('--sample-only')) {
  const rows = snapshot();
  console.log(`снимок: строк ${rows.length}`);
  for (const r of rows) console.log(`  ${r.tag.padEnd(22)} pid ${String(r.pid).padStart(6)} ${String(r.mb).padStart(7)} МБ`);
  console.log(rows.length === 0 ? '⚠️ сборщик вернул ПУСТО — это либо мёртвый стенд, либо сломанный прибор; проверь на живом стенде' : '✅ сборщик читает процессы');
  process.exit(rows.length === 0 ? 1 : 0);
}

const dead0 = await standAlive();
if (dead0.length) {
  console.error(`Стенд не поднят: не отвечает — ${dead0.join(', ')}. Подними \`npm run stand\` и повтори.`);
  process.exit(1);
}

const history = [{ step: 'база', rows: snapshot() }];
console.log(`═══ ЗАМЕР ПАМЯТИ ДЕРЕВА СТЕНДА (bugs/134) ═══`);
console.log(`Сценарий: ${STEPS.join(' → ')}\n`);
console.log('база:');
for (const r of history[0].rows) console.log(`  ${r.tag.padEnd(22)} pid ${String(r.pid).padStart(6)} ${String(r.mb).padStart(7)} МБ`);

let diedAt = null;
for (const [i, step] of STEPS.entries()) {
  const before = await standAlive();
  if (before.length) {
    diedAt = `перед шагом ${i + 1} («${step}»)`;
    console.log(`\n🔴 СТЕНД МЁРТВ ${diedAt}: не отвечают — ${before.join(', ')}`);
    break;
  }
  process.stdout.write(`\nшаг ${i + 1}/${STEPS.length} — ${step}… `);
  const res = runStep(step);
  console.log(`код ${res.code}, ${res.seconds} с${res.skipped ? ` (${res.skipped})` : ''}`);
  const rows = snapshot();
  history.push({ step: `${i + 1}. ${step}`, rows, code: res.code, seconds: res.seconds });
  const after = await standAlive();
  if (after.length) {
    diedAt = `ПОСЛЕ шага ${i + 1} («${step}»)`;
    console.log(`🔴 СТЕНД УМЕР ${diedAt}: не отвечают — ${after.join(', ')}`);
    break;
  }
}

/* ── Таблица: строка на процесс, колонка на шаг ── */

const tags = [...new Set(history.flatMap((h) => h.rows.map((r) => r.tag)))];
const head = history.map((h) => h.step);
console.log('\n════ РАБОЧЕЕ МНОЖЕСТВО, МБ ════');
console.log(['процесс'.padEnd(22), ...head.map((h) => h.padStart(12))].join(' |'));
for (const tag of tags) {
  const cells = history.map((h) => {
    const rows = h.rows.filter((r) => r.tag === tag);
    if (rows.length === 0) return '—';
    return rows.reduce((a, r) => a + r.mb, 0).toFixed(1);
  });
  console.log([tag.padEnd(22), ...cells.map((c) => String(c).padStart(12))].join(' |'));
}

const stamp = history.at(-1).rows.reduce((a, r) => a + r.mb, 0).toFixed(1);
console.log(`\nсумма по дереву на последнем снимке: ${stamp} МБ`);
console.log(diedAt ? `🔴 ИТОГ: дерево стенда умерло ${diedAt} — падение ВОСПРОИЗВЕДЕНО.` : '⚪ ИТОГ: за сценарий стенд НЕ умер — падение не воспроизведено этим прогоном.');

const file = `${OUT}/measure-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify({ steps: STEPS, diedAt, history }, null, 2), 'utf8');
console.log(`числа сохранены — ${file}`);
process.exitCode = 0;

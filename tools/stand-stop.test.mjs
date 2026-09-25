// Юниты адресной остановки стенда (`tools/stand-stop.mjs`): гасится дерево СВОЕГО рабочего места и только оно.
// ⚠️ Пути в фикстурах — с ДВОЙНОЙ обратной косой: в шаблонной строке JS одинарная «\f» — перевод страницы, «\n» — перевод
// строки (прежняя редакция этого файла, записанная через heredoc, несла такие символы и проходила случайно).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pickStandRoots } from './stand-stop.mjs';

const MY = 'D:\\work\\ai_sandbox\\ndim-team\\ndim_dev1\\firebase.slot3.json';
const MANAGER = 'D:\\work\\ai_sandbox\\ndim\\firebase.json';
const FB = 'C:\\Users\\krinik\\AppData\\Roaming\\npm\\node_modules\\firebase-tools\\lib\\bin\\firebase.js';
const emu = (config) => `"node" "${FB}" emulators:exec -c "${config}"`;

/** Даты создания по порядку перечисления: родитель в списке раньше ребёнка — и создан раньше. */
const dated = (procs) => procs.map((p, i) => ({ created: (i + 1) * 10, ...p }));

/** Дерево стенда так, как его видел `Win32_Process` 2026-09-25 22:21 (слот 3), и чужое рядом. */
function table({ viaNpm = false } = {}) {
  return dated([
    { pid: 1, ppid: 0, cmd: 'C:\\WINDOWS\\Explorer.EXE' },
    { pid: 42288, ppid: 1, cmd: 'bash.exe' },
    ...(viaNpm ? [{ pid: 45000, ppid: 42288, cmd: '"node" "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js" run stand' }] : []),
    { pid: 45756, ppid: viaNpm ? 45000 : 42288, cmd: 'C:\\WINDOWS\\system32\\cmd.exe /d /s /c node tools/stand-launch.mjs' },
    { pid: 48172, ppid: 45756, cmd: 'node  tools/stand-launch.mjs' },
    { pid: 17184, ppid: 48172, name: 'cmd.exe', cmd: `C:\\WINDOWS\\system32\\cmd.exe /d /s /c "firebase emulators:exec -c "${MY}" --only firestore,auth,storage "node tools/stand.mjs""` },
    { pid: 2212, ppid: 17184, name: 'node.exe', cmd: emu(MY) },
    { pid: 34600, ppid: 2212, cmd: 'java -jar cloud-firestore-emulator.jar --port 8211' },
    { pid: 21056, ppid: 34600, cmd: 'node tools/stand.mjs' },
    // чужой стенд главной копии — та же строка запуска, другой конфиг
    { pid: 41100, ppid: 42356, cmd: 'C:\\WINDOWS\\system32\\cmd.exe /d /s /c node tools/stand-launch.mjs' },
    { pid: 19732, ppid: 41100, cmd: 'node  tools/stand-launch.mjs' },
    { pid: 19800, ppid: 19732, name: 'node.exe', cmd: emu(MANAGER) },
    // превью сборки моего рабочего места — не стенд
    { pid: 5340, ppid: 48404, cmd: '"node" "D:\\work\\ai_sandbox\\ndim-team\\ndim_dev1\\node_modules\\.bin\\..\\vite\\bin\\vite.js" preview --port 4183 --strictPort' },
  ]);
}

test('🔴 гасится только МОЁ дерево: чужой стенд с той же строкой запуска не тронут', () => {
  const { mine, roots } = pickStandRoots(table(), MY);
  assert.deepEqual(mine, [17184, 2212]);
  assert.deepEqual(roots, [45756]);
});

test('превью vite моего рабочего места в дерево стенда не входит', () => {
  assert.ok(!pickStandRoots(table(), MY).roots.includes(5340));
});

test('стенд, поднятый `npm run stand`, гасится от npm-обёртки', () => {
  assert.deepEqual(pickStandRoots(table({ viaNpm: true }), MY).roots, [45000]);
});

test('стенд, поднятый из Git Bash (`bash.exe "/c/…/npm" run stand` — форма живого прогона 23:00), гасится от этой обёртки', () => {
  const procs = dated([
    { pid: 900, ppid: 1, cmd: 'claude.exe' },
    { pid: 41864, ppid: 900, cmd: '"C:\\Program Files\\Git\\usr\\bin\\bash.exe" "/c/Program Files/nodejs/npm" run stand' },
    { pid: 41900, ppid: 41864, cmd: '"node" "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js" run stand' },
    { pid: 41950, ppid: 41900, cmd: 'node  tools/stand-launch.mjs' },
    { pid: 42000, ppid: 41950, cmd: emu(MY) },
  ]);
  assert.deepEqual(pickStandRoots(procs, MY).roots, [41864]);
});

test('🔑 предки самой команды не гасятся, и `run stand:stop` — не запуск стенда', () => {
  const procs = dated([
    { pid: 10, ppid: 1, cmd: '"node" "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js" run stand:stop' },
    { pid: 11, ppid: 10, cmd: 'node tools/stand-stop.mjs' },
    { pid: 12, ppid: 11, cmd: emu(MY) },
  ]);
  assert.deepEqual(pickStandRoots(procs, MY, 11).roots, [12]);
  assert.deepEqual(pickStandRoots(procs, MY, 12).roots, []);
});

test('путь конфига сравнивается без регистра и вида косой черты', () => {
  assert.deepEqual(pickStandRoots(table(), 'd:/work/ai_sandbox/ndim-team/ndim_dev1/firebase.slot3.json').roots, [45756]);
});

test('чужой конфиг — чужое дерево: стенд главной копии выбирается ТОЛЬКО своим конфигом', () => {
  assert.deepEqual(pickStandRoots(table(), MANAGER).roots, [41100]);
});

test('стенда нет — гасить нечего', () => {
  const procs = table().filter((p) => !String(p.cmd).includes('slot3'));
  assert.deepEqual(pickStandRoots(procs, MY), { mine: [], roots: [] });
});

// ── Первый суд stand:stop (37f502f) ─────────────────────────────────────────────────────────────────────────────────

test('🔴 редактор, открытый на firebase.json, — НЕ мой (суд, п. 1)', () => {
  const procs = [
    ...table(),
    { pid: 200, ppid: 1, name: 'notepad++.exe', cmd: `"C:\\Program Files\\Notepad++\\notepad++.exe" "${MY}"`, created: 5 },
    { pid: 201, ppid: 1, name: 'Code.exe', cmd: `"C:\\Users\\krinik\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe" "${MY}"`, created: 5 },
  ];
  const { mine, roots } = pickStandRoots(procs, MY);
  assert.ok(!mine.includes(200) && !mine.includes(201), `редакторы не «мои»: ${mine}`);
  assert.deepEqual(roots, [45756]);
});

test('🔴 повтор PID: сирота emulators:exec, PID её мёртвого родителя занят чужим stand-launch, — чужой корень не выбран (суд, п. 2)', () => {
  const procs = [
    { pid: 700, ppid: 1, cmd: 'node  tools/stand-launch.mjs', created: 2000 }, // родился ПОЗЖЕ сироты — не её родитель
    { pid: 701, ppid: 700, cmd: emu(MANAGER), created: 2100 },
    { pid: 800, ppid: 700, cmd: emu(MY), created: 1000 },
  ];
  assert.deepEqual(pickStandRoots(procs, MY).roots, [800], 'корень — сама сирота');
  procs[0].created = 500; // контроль: настоящий родитель (создан раньше) по-прежнему поднимает к корню
  assert.deepEqual(pickStandRoots(procs, MY).roots, [700]);
});

test('🔴 цикл ppid не вешает обход — все подъёмы ограничены числом процессов (суд, пп. 3 и 4 повторного)', () => {
  // При строгом порядке дат цикл невозможен, поэтому даты РАВНЫ: граница проверяется там, где цикл реален.
  // ⚠️ Без границы обход висит СИНХРОННО — таймаут node:test такой цикл не прерывает; висящий прогон и есть красное.
  const procs = [
    { pid: 900, ppid: 901, cmd: 'node  tools/stand-launch.mjs', created: 5 },
    { pid: 901, ppid: 900, cmd: 'node  tools/stand-launch.mjs', created: 5 },
    { pid: 902, ppid: 900, cmd: emu(MY), created: 5 },
    { pid: 903, ppid: 902, cmd: emu(MY), created: 5 },
  ];
  assert.equal(pickStandRoots(procs, MY).roots.length, 1);
  assert.deepEqual(pickStandRoots(procs, MY, 900).roots, [], 'сама команда в цикле: её предки не гасятся, обход конечен');
  const twoRoots = [
    { pid: 910, ppid: 911, cmd: 'x.exe', created: 5 },
    { pid: 911, ppid: 910, cmd: 'x.exe', created: 5 },
    { pid: 912, ppid: 910, cmd: emu(MY), created: 5 },
    { pid: 950, ppid: 1, cmd: emu(MY), created: 5 },
  ];
  assert.deepEqual(pickStandRoots(twoRoots, MY).roots, [912, 950]);
});

test('🔴 `npm run stand:stop` в предках — не запуск стенда: подъём останавливается под ним (суд, п. 4)', () => {
  const procs = dated([
    { pid: 10, ppid: 1, cmd: '"node" "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js" run stand:stop' },
    { pid: 11, ppid: 10, cmd: emu(MY) },
  ]);
  assert.deepEqual(pickStandRoots(procs, MY).roots, [11]); // self не передан: защищает только упреждение шаблона
});

test('🔴 корень внутри дерева другого корня вторым не называется (суд, п. 4)', () => {
  const procs = dated([
    { pid: 1, ppid: 0, cmd: 'bash.exe' },
    { pid: 2, ppid: 1, cmd: 'node  tools/stand-launch.mjs' },
    { pid: 3, ppid: 2, cmd: emu(MY) },
    { pid: 4, ppid: 3, cmd: 'java -jar cloud-firestore-emulator.jar' },
    { pid: 5, ppid: 4, cmd: emu(MY) }, // подъём от 5 упирается в java → корень 5, но он внутри дерева корня 2
  ]);
  assert.deepEqual(pickStandRoots(procs, MY).roots, [2]);
});

// ── Повторный суд stand:stop (5f430a0) ──────────────────────────────────────────────────────────────────────────────

// Два слоя отсева проб разведены по юнитам намеренно: проба, отсечённая ОБОИМИ слоями, не доказывает ни один из них
// (мутант, снявший один слой, остался бы зелёным).

test('🔴 проба node/cmd с обеими подстроками — не моя: якорь «firebase emulators:exec -c <путь>» (повторный суд, п. 1)', () => {
  const procs = [
    ...table(),
    { pid: 300, ppid: 1, name: 'cmd.exe', cmd: `cmd /c "wmic process where \\"CommandLine like '%emulators:exec -c ${MY}%'\\" get ProcessId"`, created: 5 },
    { pid: 301, ppid: 1, name: 'node.exe', cmd: `node -e "ps.filter((c) => c.includes('emulators:exec') && c.includes('${MY}'))"`, created: 5 },
  ];
  const { mine, roots } = pickStandRoots(procs, MY);
  assert.ok(![300, 301].some((p) => mine.includes(p)), `пробы не «мои»: ${mine}`);
  assert.deepEqual(roots, [45756]);
});

test('🔴 без слова firebase — не мой: node со строкой «emulators:exec -c <мой конфиг> » и границей пути (суд bd195ef, J2)', () => {
  // Форма живой приманки 46932 (прогон 2026-09-26 00:16): имя node.exe проходит, путь с границей есть, слова firebase
  // перед emulators:exec нет. Стережёт именно слово firebase в якоре: без него эта строка стала бы «моей».
  const procs = [
    ...table(),
    { pid: 304, ppid: 1, name: 'node.exe', cmd: `"C:\\Program Files\\nodejs\\node.exe" -e setTimeout(()=>{},900000) grep emulators:exec -c ${MY} `, created: 5 },
  ];
  const { mine, roots } = pickStandRoots(procs, MY);
  assert.ok(!mine.includes(304), `без firebase не «мой»: ${mine}`);
  assert.deepEqual(roots, [45756]);
});

test('🔴 не node/cmd — не мой, даже когда строка несёт якорь целиком: сессия агента с поручением (повторный суд, п. 1)', () => {
  const procs = [
    ...table(),
    { pid: 302, ppid: 1, name: 'claude.exe', cmd: `claude -p "погаси firebase emulators:exec -c ${MY} адресно"`, created: 5 },
    { pid: 303, ppid: 1, name: 'powershell.exe', cmd: `powershell -NoProfile -Command "echo firebase emulators:exec -c ${MY} --only auth"`, created: 5 },
  ];
  const { mine, roots } = pickStandRoots(procs, MY);
  assert.ok(![302, 303].some((p) => mine.includes(p)), `не node/cmd не «мои»: ${mine}`);
  assert.deepEqual(roots, [45756]);
});

test('🔴 «…\\firebase.slot3.jsonc» — не мой конфиг: путь с границей (повторный суд, п. 1)', () => {
  const procs = dated([{ pid: 400, ppid: 1, name: 'node.exe', cmd: emu(`${MY}c`) }]);
  assert.deepEqual(pickStandRoots(procs, MY), { mine: [], roots: [] });
});

test('даты создания нет — к корню не поднимаюсь: гасится только поддерево emulators:exec (повторный суд, п. 2)', () => {
  // Без дат не доверяется и связь cmd 17184 → node 2212: каждый «мой» — свой корень. Выше `emulators:exec` не
  // гасится ничего — ни stand-launch 48172, ни обёртка 45756; второй `taskkill` по уже погасшему дереву безвреден.
  const procs = table().map(({ created, ...p }) => p);
  const { roots } = pickStandRoots(procs, MY);
  assert.deepEqual(roots, [2212, 17184]);
  assert.ok(!roots.includes(45756) && !roots.includes(48172), 'выше emulators:exec не поднялся');
});

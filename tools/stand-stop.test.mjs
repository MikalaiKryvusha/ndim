// Юниты адресной остановки стенда (`tools/stand-stop.mjs`): гасится дерево СВОЕГО рабочего места и только оно.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pickStandRoots } from './stand-stop.mjs';

const MY = 'D:\\work\\ai_sandbox\\ndim-team\\ndim_dev1\\firebase.slot3.json';
const MANAGER = 'D:\\work\\ai_sandbox\\ndim\\firebase.json';

/** Дерево стенда так, как его видел `Win32_Process` 2026-09-25 22:21 (слот 3), и чужое рядом. */
function table({ viaNpm = false } = {}) {
  return [
    { pid: 1, ppid: 0, cmd: 'C:\\WINDOWS\\Explorer.EXE' },
    { pid: 42288, ppid: 1, cmd: 'bash.exe' },
    ...(viaNpm ? [{ pid: 45000, ppid: 42288, cmd: '"node" "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js" run stand' }] : []),
    { pid: 45756, ppid: viaNpm ? 45000 : 42288, cmd: 'C:\\WINDOWS\\system32\\cmd.exe /d /s /c node tools/stand-launch.mjs' },
    { pid: 48172, ppid: 45756, cmd: 'node  tools/stand-launch.mjs' },
    { pid: 17184, ppid: 48172, cmd: `C:\\WINDOWS\\system32\\cmd.exe /d /s /c "firebase emulators:exec -c "${MY}" --only firestore,auth,storage "node tools/stand.mjs""` },
    { pid: 2212, ppid: 17184, cmd: `"node" "C:\\Users\\krinik\\AppData\\Roaming\\npm\\node_modules\\firebase-tools\\lib\\bin\\firebase.js" emulators:exec -c "${MY}"` },
    { pid: 34600, ppid: 2212, cmd: 'java -jar cloud-firestore-emulator.jar --port 8211' },
    { pid: 21056, ppid: 34600, cmd: 'node tools/stand.mjs' },
    // чужой стенд главной копии — та же строка запуска, другой конфиг
    { pid: 41100, ppid: 42356, cmd: 'C:\\WINDOWS\\system32\\cmd.exe /d /s /c node tools/stand-launch.mjs' },
    { pid: 19732, ppid: 41100, cmd: 'node  tools/stand-launch.mjs' },
    { pid: 19800, ppid: 19732, cmd: `"node" "…\\firebase.js" emulators:exec -c "${MANAGER}"` },
    // превью сборки моего рабочего места — не стенд
    { pid: 5340, ppid: 48404, cmd: '"node" "D:\\work\\ai_sandbox\\ndim-team\\ndim_dev1\\node_modules\\.bin\\..\\vite\\bin\\vite.js" preview --port 4183 --strictPort' },
  ];
}

test('🔴 гасится только МОЁ дерево: чужой стенд с той же строкой запуска не тронут', () => {
  const { mine, roots } = pickStandRoots(table(), MY);
  assert.deepEqual(mine, [17184, 2212]);
  assert.deepEqual(roots, [45756]);
});

test('превью vite моего рабочего места в дерево стенда не входит', () => {
  const { roots } = pickStandRoots(table(), MY);
  assert.ok(!roots.includes(5340));
});

test('стенд, поднятый `npm run stand`, гасится от npm-обёртки', () => {
  assert.deepEqual(pickStandRoots(table({ viaNpm: true }), MY).roots, [45000]);
});

test('стенд, поднятый из Git Bash (`bash.exe "/c/…/npm" run stand` — форма живого прогона 23:00), гасится от этой обёртки', () => {
  const procs = [
    { pid: 900, ppid: 1, cmd: 'claude.exe' },
    { pid: 41864, ppid: 900, cmd: '"C:\\Program Files\\Git\\usr\\bin\\bash.exe" "/c/Program Files/nodejs/npm" run stand' },
    { pid: 41900, ppid: 41864, cmd: '"node" "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js" run stand' },
    { pid: 41950, ppid: 41900, cmd: 'node  tools/stand-launch.mjs' },
    { pid: 42000, ppid: 41950, cmd: `"node" "…\\firebase.js" emulators:exec -c "${MY}"` },
  ];
  assert.deepEqual(pickStandRoots(procs, MY).roots, [41864]);
});

test('🔑 предки самой команды не гасятся, и `run stand:stop` — не запуск стенда', () => {
  const procs = [
    { pid: 10, ppid: 1, cmd: '"node" "…\\npm-cli.js" run stand:stop' },
    { pid: 11, ppid: 10, cmd: 'node tools/stand-stop.mjs' },
    { pid: 12, ppid: 11, cmd: `"node" "…\\firebase.js" emulators:exec -c "${MY}"` },
  ];
  // даже если бы что-то «моё» висело под самой командой — её предков гасить нельзя
  assert.deepEqual(pickStandRoots(procs, MY, 11).roots, [12]);
  assert.deepEqual(pickStandRoots(procs, MY, 12).roots, []);
});

test('путь конфига сравнивается без регистра и вида косой черты', () => {
  const lower = 'd:/work/ai_sandbox/ndim-team/ndim_dev1/firebase.slot3.json';
  assert.deepEqual(pickStandRoots(table(), lower).roots, [45756]);
});

test('чужой конфиг — чужое дерево: стенд главной копии выбирается ТОЛЬКО своим конфигом', () => {
  assert.deepEqual(pickStandRoots(table(), MANAGER).roots, [41100]);
});

test('стенда нет — гасить нечего', () => {
  const procs = table().filter((p) => !String(p.cmd).includes('slot3'));
  assert.deepEqual(pickStandRoots(procs, MY), { mine: [], roots: [] });
});

// ── Суд stand:stop (37f502f): пять правок, каждая со своим юнитом ────────────────────────────────────────────────────

test('🔴 редактор, открытый на firebase.json, — НЕ мой: taskkill убил бы несохранённую работу (суд, п. 1)', () => {
  const procs = [
    ...table(),
    { pid: 200, ppid: 1, cmd: `"C:\Program Files\Notepad++\notepad++.exe" "${MY}"` },
    { pid: 201, ppid: 1, cmd: `"C:\Users\krinik\AppData\Local\Programs\Microsoft VS Code\Code.exe" "${MY}"` },
  ];
  const { mine, roots } = pickStandRoots(procs, MY);
  assert.ok(!mine.includes(200) && !mine.includes(201), `редакторы не «мои»: ${mine}`);
  assert.deepEqual(roots, [45756]);
});

test('🔴 повтор PID: сирота emulators:exec, PID её мёртвого родителя занят чужим stand-launch, — чужой корень не выбран (суд, п. 2)', () => {
  const procs = [
    { pid: 700, ppid: 1, cmd: 'node  tools/stand-launch.mjs', created: 2000 }, // родился ПОЗЖЕ сироты — не её родитель
    { pid: 701, ppid: 700, cmd: `"node" "…\firebase.js" emulators:exec -c "${MANAGER}"`, created: 2100 },
    { pid: 800, ppid: 700, cmd: `"node" "…\firebase.js" emulators:exec -c "${MY}"`, created: 1000 },
  ];
  assert.deepEqual(pickStandRoots(procs, MY).roots, [800], 'корень — сама сирота');
  // Контроль: настоящий родитель (создан раньше) по-прежнему поднимает к корню.
  procs[0].created = 500;
  assert.deepEqual(pickStandRoots(procs, MY).roots, [700]);
});

test('цикл ppid не вешает обход (суд, п. 3)', { timeout: 2000 }, () => {
  const procs = [
    { pid: 900, ppid: 901, cmd: 'node  tools/stand-launch.mjs' },
    { pid: 901, ppid: 900, cmd: 'node  tools/stand-launch.mjs' },
    { pid: 902, ppid: 900, cmd: `"node" "…\firebase.js" emulators:exec -c "${MY}"` },
    { pid: 903, ppid: 902, cmd: `"node" "…\firebase.js" emulators:exec -c "${MY}"` },
  ];
  const { roots } = pickStandRoots(procs, MY);
  assert.equal(roots.length, 1, `один корень: ${roots}`);
  // Два корня, и предки одного из них — цикл: проверка «корень внутри дерева другого» обязана остановиться.
  // (Первый прогон мутанта «без seen в inside()» остался зелёным: при одном корне inside() не зовётся вовсе.)
  const twoRoots = [
    { pid: 910, ppid: 911, cmd: 'x.exe' },
    { pid: 911, ppid: 910, cmd: 'x.exe' },
    { pid: 912, ppid: 910, cmd: `"node" "…\\firebase.js" emulators:exec -c "${MY}"` },
    { pid: 950, ppid: 1, cmd: `"node" "…\\firebase.js" emulators:exec -c "${MY}"` },
  ];
  assert.deepEqual(pickStandRoots(twoRoots, MY).roots, [912, 950]);
});

test('🔴 `npm run stand:stop` в предках — не запуск стенда: подъём останавливается под ним (суд, п. 4)', () => {
  const procs = [
    { pid: 10, ppid: 1, cmd: '"node" "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run stand:stop' },
    { pid: 11, ppid: 10, cmd: `"node" "…\firebase.js" emulators:exec -c "${MY}"` },
  ];
  // self не передан: защищает ТОЛЬКО упреждение шаблона (?=\s|"|$), а не защита предков команды.
  assert.deepEqual(pickStandRoots(procs, MY).roots, [11]);
});

test('🔴 корень внутри дерева другого корня вторым не называется (суд, п. 4)', () => {
  const procs = [
    { pid: 1, ppid: 0, cmd: 'bash.exe' },
    { pid: 2, ppid: 1, cmd: 'node  tools/stand-launch.mjs' },
    { pid: 3, ppid: 2, cmd: `"node" "…\firebase.js" emulators:exec -c "${MY}"` },
    { pid: 4, ppid: 3, cmd: 'java -jar cloud-firestore-emulator.jar' },
    { pid: 5, ppid: 4, cmd: `"node" "…\firebase.js" emulators:exec -c "${MY}"` }, // подъём от 5 упирается в java → корень 5
  ];
  assert.deepEqual(pickStandRoots(procs, MY).roots, [2], 'только верхний корень 2; корень 5 — внутри его дерева');
});

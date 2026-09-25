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

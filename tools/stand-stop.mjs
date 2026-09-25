/**
 * АДРЕСНАЯ ОСТАНОВКА СТЕНДА СВОЕГО РАБОЧЕГО МЕСТА — пара к `npm run stand` (`tools/stand-launch.mjs`).
 *
 * Повод (`STATUS.md`, 2026-09-25): стенд гасили фильтром по «`npm-cli.js run stand`» — 17:35 такой фильтр погасил и стенд
 * dev-1 (слот 3), потому что строка запуска одинакова у всех рабочих мест. Отличает стенды одно: путь конфига слота в
 * `firebase emulators:exec -c "<корень рабочего места>\firebase[.slot<N>].json"`. По нему команда и находит своё.
 *
 * Как, по порядку:
 *   1. слот — из имени рабочего места (`lib/stand-slot.mjs`), конфиг — `<корень>\firebase.slot<N>.json` (у слота 0 —
 *      `<корень>\firebase.json`);
 *   2. процессы Windows (`Win32_Process`: pid · родитель · командная строка);
 *   3. «мои» — процессы, чья командная строка несёт путь МОЕГО конфига (регистр и вид косой черты не важны);
 *   4. корень дерева — самый верхний предок «моего» процесса, чья строка — запуск стенда (`stand-launch.mjs`,
 *      `emulators:exec`, `npm … run stand`). Строка `node tools/stand-launch.mjs` сама по себе чья угодно: путь у неё
 *      относительный — поэтому её предок «мой» только через потомка с моим конфигом;
 *   5. `taskkill /PID <корень> /T /F` — всё дерево, и только оно; предки самой команды не трогаются никогда;
 *   6. порты слота (vite · Firestore · Auth · Storage) проверяются свободными, конфиг слота убирается.
 *
 * `vite preview` (превью сборки) в дерево стенда не входит и не трогается: у него нет конфига слота.
 *
 * Запуск:  npm run stand:stop                 # найти и погасить стенд этого рабочего места
 *          node tools/stand-stop.mjs --dry-run # только напечатать, что было бы погашено
 */
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { portsFor, slotConfigName, slotOf } from './lib/stand-slot.mjs';

const norm = (s) => String(s ?? '').replace(/\//g, '\\').toLowerCase();

/** Строка процесса — запуск стенда (и потому поднимается к корню). `run stand:stop` — НЕ запуск стенда. */
const LAUNCHER = /stand-launch\.mjs|emulators:exec|\brun\s+stand(?=\s|"|$)/i;

/**
 * Чистая развилка: какие деревья гасить. `procs` — `[{ pid, ppid, cmd }]`, `config` — полный путь конфига слота,
 * `self` — pid этой команды (её предки не гасятся никогда). Возвращает `{ mine, roots }` — pid «моих» и корней.
 */
export function pickStandRoots(procs, config, self = null) {
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const needle = norm(config);
  const mine = procs.filter((p) => norm(p.cmd).includes(needle)).map((p) => p.pid);
  const protectedPids = new Set();
  for (let p = byPid.get(self); p; p = byPid.get(p.ppid)) {
    if (protectedPids.has(p.pid)) break;
    protectedPids.add(p.pid);
  }
  const roots = new Set();
  for (const pid of mine) {
    let top = pid;
    const seen = new Set([pid]);
    for (let p = byPid.get(byPid.get(pid)?.ppid); p && !seen.has(p.pid) && LAUNCHER.test(p.cmd ?? ''); p = byPid.get(p.ppid)) {
      seen.add(p.pid);
      top = p.pid;
    }
    if (!protectedPids.has(top)) roots.add(top);
  }
  // Корень, лежащий внутри дерева другого корня, гасится вместе с ним — вторым не называется.
  const inside = (pid, root) => {
    for (let p = byPid.get(pid); p; p = byPid.get(p.ppid)) if (p.ppid === root) return true;
    return false;
  };
  const top = [...roots].filter((r) => ![...roots].some((o) => o !== r && inside(r, o)));
  return { mine, roots: top.sort((a, b) => a - b) };
}

/** Процессы Windows одной командой. */
function processTable() {
  const ps = 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress';
  const raw = execSync(`powershell -NoProfile -Command "${ps}"`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(raw).map((p) => ({ pid: p.ProcessId, ppid: p.ParentProcessId, cmd: p.CommandLine ?? '' }));
}

function listens(port, ms = 400) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    const done = (v) => { socket.destroy(); resolve(v); };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(ms, () => done(false));
  });
}

async function main() {
  if (process.platform !== 'win32') {
    console.error('stand-stop: команда написана для Windows (Win32_Process, taskkill).');
    return 2;
  }
  const root = process.cwd();
  const slot = slotOf(basename(root));
  if (slot === null) {
    console.error(`stand-stop: слот не выводится из имени рабочего места «${basename(root)}».`);
    return 2;
  }
  const config = join(root, slotConfigName(slot));
  const ports = portsFor(slot);
  const dry = process.argv.includes('--dry-run');
  console.log(`Стенд рабочего места ${root} · слот ${slot} · конфиг ${config}`);

  const procs = processTable();
  const { mine, roots } = pickStandRoots(procs, config, process.pid);
  if (mine.length === 0) {
    console.log('Стенда этого рабочего места нет: ни один процесс не несёт его конфиг. Гасить нечего.');
  }
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  for (const r of roots) console.log(`  ${dry ? 'погасил бы' : 'гашу'} дерево ${r}: ${byPid.get(r)?.cmd.slice(0, 140)}`);
  if (dry) return 0;
  for (const r of roots) {
    try { execSync(`taskkill /PID ${r} /T /F`, { stdio: 'pipe' }); } catch (error) { console.error(`  ⚠️ taskkill ${r}: ${String(error?.stderr ?? error).trim().slice(0, 160)}`); }
  }

  const want = [['vite', ports.dev], ['Firestore', ports.firestore], ['Auth', ports.auth], ['Storage', ports.storage]];
  let busy = [];
  for (let i = 0; i < 10; i++) {
    busy = [];
    for (const [name, port] of want) if (await listens(port)) busy.push(`${name} ${port}`);
    if (busy.length === 0) break;
    await new Promise((ok) => setTimeout(ok, 500));
  }
  if (slot !== 0 && existsSync(config)) {
    rmSync(config);
    console.log(`  конфиг слота убран: ${basename(config)}`);
  }
  if (busy.length) {
    console.error(`🔴 порты слота заняты после остановки: ${busy.join(' · ')} — их держит не стенд этого рабочего места или он не погас.`);
    return 1;
  }
  console.log(`✅ порты слота свободны: ${want.map(([n, p]) => `${n} ${p}`).join(' · ')}`);
  return 0;
}

const ЗАПУЩЕН_НАПРЯМУЮ = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (ЗАПУЩЕН_НАПРЯМУЮ) process.exitCode = await main();

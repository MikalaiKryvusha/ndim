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
 *   3. «мои» — исполняемые node/cmd, чья строка несёт якорь «`firebase emulators:exec -c <МОЙ конфиг>`» с границей пути
 *      (регистр и вид косой черты не важны). Редактор, открытый на том же `firebase.json`, проба-поиск с обеими
 *      подстроками и сессия агента с поручением в строке «моими» не считаются (суд stand:stop, п. 1; повторный, п. 1);
 *      родитель принимается, только если обе даты создания известны и он создан раньше ребёнка (повтор PID, п. 2);
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
 *          node tools/stand-stop.mjs --slot N  # стенд, поднятый `stand-launch.mjs --slot N` из этого же каталога
 */
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { portsFor, slotConfigName, slotOf, SLOTS } from './lib/stand-slot.mjs';

const norm = (s) => String(s ?? '').replace(/\//g, '\\').toLowerCase();

/**
 * ЯКОРЬ ЗАПУСКА ЭМУЛЯТОРОВ (повторный суд stand:stop, п. 1): слово `firebase` (или `firebase.js` / `firebase.cmd`), сразу
 * `emulators:exec -c` и ПУТЬ С ГРАНИЦЕЙ. Подстроки «emulators:exec» и пути где угодно в строке мало: проба-поиск другого
 * агента, `bash -c "…grep 'emulators:exec -c <путь>'"` или сессия агента с поручением в строке запуска несут обе подстроки,
 * и `taskkill /T /F` погасил бы их деревья; `…\firebase.jsonc` — не мой конфиг.
 */
const EMU_EXEC = String.raw`firebase(?:\.js|\.cmd)?"?\s+emulators:exec`;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const emulatorsOf = (config) => new RegExp(`${EMU_EXEC}\\s+-c\\s+"?${escapeRe(norm(config))}"?(?=\\s|$)`, 'i');

/** Процессы, которые запускают стенд: только исполняемые node/cmd — PowerShell, bash и сессии агентов не бывают «моими». */
const EXE_OK = /^(?:node|cmd)\.exe$/i;

/** Строка процесса — запуск стенда (и потому поднимается к корню). `run stand:stop` — НЕ запуск стенда. */
const LAUNCHER = new RegExp(String.raw`stand-launch\.mjs|${EMU_EXEC}|\brun\s+stand(?=\s|"|$)`, 'i');

/**
 * Родитель процесса — только если он создан РАНЬШЕ ребёнка (суд stand:stop, п. 2). Windows переиспользует PID: у сироты
 * `emulators:exec` PID её мёртвого родителя может занять чужой `stand-launch`, и подъём к корню выбрал бы ЧУЖОЕ дерево.
 * 🔴 Даты создания нет у родителя или ребёнка — родителя НЕТ (повторный суд, п. 2): тогда гасится только поддерево
 * самого `emulators:exec`, без подъёма.
 */
function parentOf(byPid, p) {
  const parent = byPid.get(p?.ppid);
  if (!parent || parent.pid === p.pid) return undefined;
  if (!Number.isFinite(parent.created) || !Number.isFinite(p.created) || parent.created > p.created) return undefined;
  return parent;
}

/**
 * Чистая развилка: какие деревья гасить. `procs` — `[{ pid, ppid, cmd, created? }]`, `config` — полный путь конфига
 * слота, `self` — pid этой команды (её предки не гасятся никогда). Возвращает `{ mine, roots }` — pid «моих» и корней.
 */
export function pickStandRoots(procs, config, self = null) {
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const anchor = emulatorsOf(config);
  // 🔴 «Мой» — запуск эмуляторов С МОИМ конфигом по якорю (повторный суд, п. 1) и исполняемый node/cmd. Редактор,
  // открытый на firebase.json (первый суд, п. 1), и проба-поиск с обеими подстроками «моими» не бывают.
  const mine = procs
    .filter((p) => anchor.test(norm(p.cmd)) && (p.name === undefined || EXE_OK.test(p.name)))
    .map((p) => p.pid);
  // Все обходы вверх ограничены числом процессов (повторный суд, п. 4): цикл ppid не вешает команду по построению.
  const limit = procs.length;
  const protectedPids = new Set();
  for (let p = byPid.get(self), n = 0; p && n < limit; p = parentOf(byPid, p), n++) protectedPids.add(p.pid);
  const roots = new Set();
  for (const pid of mine) {
    let top = pid;
    for (let p = parentOf(byPid, byPid.get(pid)), n = 0; p && n < limit && LAUNCHER.test(p.cmd ?? ''); p = parentOf(byPid, p), n++) {
      top = p.pid;
    }
    if (!protectedPids.has(top)) roots.add(top);
  }
  // Корень, лежащий внутри дерева другого корня, гасится вместе с ним — вторым не называется. Два корня внутри друг
  // друга бывают только в цикле ppid (равные даты создания) — тогда остаётся меньший pid, а не ни один.
  const inside = (pid, root) => {
    for (let p = parentOf(byPid, byPid.get(pid)), n = 0; p && n < limit; p = parentOf(byPid, p), n++) {
      if (p.pid === root) return true;
    }
    return false;
  };
  const top = [...roots].filter((r) => ![...roots].some((o) => o !== r && inside(r, o) && (!inside(o, r) || o < r)));
  return { mine, roots: top.sort((a, b) => a - b) };
}

/** Процессы Windows одной командой; `created` — момент создания в мс (PowerShell 5.1 отдаёт дату как «/Date(мс)/»). */
function processTable() {
  const ps = 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,CreationDate | ConvertTo-Json -Compress';
  const raw = execSync(`powershell -NoProfile -Command "${ps}"`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const ms = (d) => {
    const m = /Date\((\d+)/.exec(String(d ?? ''));
    return m ? Number(m[1]) : Date.parse(d ?? '');
  };
  return JSON.parse(raw).map((p) => ({ pid: p.ProcessId, ppid: p.ParentProcessId, name: p.Name ?? '', cmd: p.CommandLine ?? '', created: ms(p.CreationDate) }));
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
  // Слот — ровно как у запуска (`stand-launch.mjs`): явный `--slot` или вывод из имени каталога.
  const i = process.argv.indexOf('--slot');
  const derived = slotOf(basename(root));
  if (derived.note && i < 0) console.log(`⚠️  ${derived.note}`);
  const slot = i >= 0 ? Number(process.argv[i + 1]) : derived.slot;
  if (!SLOTS.includes(slot)) {
    console.error(`stand-stop: слота ${slot} нет: разведены ${SLOTS.join(', ')}`);
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

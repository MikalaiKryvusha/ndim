/**
 * Рабочие места команды NDIM_WORKTREE_DEV_TEAM (`plans/66` фаза 2, шаг 2.1).
 *
 * Создаёт, показывает, перезапускает и убирает git worktree ролей по карте манифеста
 * `NDIM_WORKTREE_DEV_TEAM_MANIFEST.md`: каталог `<родитель главной копии>\ndim-team\<роль>`,
 * ветка `team/<роль>` (имя ветки — по роли, слово владельца в `ideas/40`).
 *
 * Команды:
 *   node tools/team-workplaces.mjs create <роль>|--all   # идемпотентно: worktree + ветка + npm ci
 *   node tools/team-workplaces.mjs list                  # что развёрнуто, отставание веток от main
 *   node tools/team-workplaces.mjs reset <роль>          # перезапуск ветки от свежего main (после мержа)
 *   node tools/team-workplaces.mjs remove <роль>         # уборка ПО EXP-0175 (junction-скан ДО удаления)
 *   node tools/team-workplaces.mjs --selftest            # чистые функции, без git и диска
 *
 * 🔴 Уборка — урок EXP-0175: `git worktree remove --force` и рекурсивное удаление PowerShell
 * СЛЕДУЮТ сквозь junction в настоящую цель (уже съедали корневой node_modules главной копии).
 * Поэтому remove сначала сканирует reparse-точки в известных местах (корень worktree и
 * sync-server/) и снимает их `cmd /c rmdir` (снимает ССЫЛКУ, не следуя в цель), и только потом
 * зовёт `git worktree remove`. При npm ci junction'ов не бывает — скан это ПОДТВЕРЖДАЕТ, а не
 * предполагает.
 *
 * Ветка при remove НЕ удаляется: коммиты роли — ценность, к ним вернётся новая сессия.
 */
import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, basename, join, resolve } from 'node:path';

const ROLES = ['designer', 'qa', 'dev-1', 'dev-2', 'dev-3']; // manager живёт в главной копии — места ему не создаём
const TEAM_DIR_NAME = 'ndim-team';

/* ── Чистые функции (--selftest) ───────────────────────────────────────────────────────── */

/** Ветка роли: понятное имя согласно роли (слово владельца). */
export function branchFor(role) { return `team/${role}`; }

/** Каталог рабочего места роли от корня главной копии. */
export function workplaceFor(mainRoot, role) { return join(dirname(mainRoot), TEAM_DIR_NAME, role); }

/** Допустима ли роль для операции с рабочим местом. */
export function validateRole(role) {
  if (role === 'manager') return { ok: false, reason: 'Менеджер живёт в главной копии — worktree ему не создаётся (манифест → Карта команды)' };
  if (!ROLES.includes(role)) return { ok: false, reason: `неизвестная роль «${role}» — роли: ${ROLES.join(', ')}` };
  return { ok: true };
}

/** Решение об уборке: грязное дерево без --force не убираем. */
export function removalDecision({ dirty, force }) {
  if (dirty && !force) return { ok: false, reason: 'в рабочем месте незакоммиченные правки — сначала коммит в ветку роли (или явный --force)' };
  return { ok: true };
}

/* ── git-обвязка ───────────────────────────────────────────────────────────────────────── */

function sh(cmd, opts = {}) { return execSync(cmd, { encoding: 'utf8', ...opts }).trim(); }
function mainRepoRoot() { return dirname(sh('git rev-parse --path-format=absolute --git-common-dir')); }

/** Reparse-точки (junction/симлинк) в известных местах worktree — EXP-0175. */
function findReparse(wt) {
  const spots = [];
  const scanDir = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      try { if (lstatSync(p).isSymbolicLink()) spots.push(p); } catch {}
    }
  };
  // Известные места junction'ов (EXP-0175): сам корень и sync-server. Плюс прямые кандидаты.
  for (const p of [join(wt, 'node_modules'), join(wt, 'sync-server', 'node_modules')]) {
    try { if (existsSync(p) && lstatSync(p).isSymbolicLink()) spots.push(p); } catch {}
  }
  scanDir(wt);
  scanDir(join(wt, 'sync-server'));
  return [...new Set(spots)];
}

function npmCi(dir, label) {
  console.log(`   npm ci — ${label} (${dir})…`);
  const t0 = Date.now();
  execSync('npm ci --no-audit --no-fund', { cwd: dir, stdio: 'inherit' });
  console.log(`   ✅ ${label}: ${Math.round((Date.now() - t0) / 1000)} с`);
}

function createOne(main, role) {
  const v = validateRole(role);
  if (!v.ok) { console.error(`⛔ ${v.reason}`); process.exitCode = 1; return; }
  const wt = workplaceFor(main, role);
  const branch = branchFor(role);
  const worktrees = sh('git worktree list --porcelain', { cwd: main });
  const registered = worktrees.split(/\r?\n/).some((l) => l.startsWith('worktree ') && resolve(l.slice(9)) === resolve(wt));

  if (registered) {
    console.log(`✅ ${role}: worktree уже зарегистрирован — ${wt}`);
  } else {
    const branchExists = sh(`git branch --list ${branch}`, { cwd: main }) !== '';
    console.log(`▶ ${role}: создаю worktree ${wt} (ветка ${branch}${branchExists ? ', существующая' : ' от main'})`);
    sh(branchExists
      ? `git worktree add "${wt}" ${branch}`
      : `git worktree add -b ${branch} "${wt}" main`, { cwd: main });
  }
  // Хуки обязаны приехать с деревом (страж выката и таймер свежести действуют у всех ролей).
  if (!existsSync(join(wt, '.claude', 'settings.json'))) {
    console.error(`⛔ ${role}: в worktree нет .claude/settings.json — хуки не приехали, разберись прежде чем работать`);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(join(wt, 'node_modules'))) npmCi(wt, `${role}: корень`);
  else console.log(`   ✅ node_modules корня уже есть`);
  if (!existsSync(join(wt, 'sync-server', 'node_modules'))) npmCi(join(wt, 'sync-server'), `${role}: sync-server`);
  else console.log(`   ✅ node_modules sync-server уже есть`);
  console.log(`✅ ${role}: рабочее место готово — ${wt} [${branch}]`);
}

/* ── Команды ───────────────────────────────────────────────────────────────────────────── */

function selftest() {
  const cases = [
    ['ветка роли — по роли', () => branchFor('qa') === 'team/qa'],
    ['каталог — сиблинг ndim-team', () => workplaceFor('D:\\work\\ai_sandbox\\ndim', 'dev-1').toLowerCase() === 'd:\\work\\ai_sandbox\\ndim-team\\dev-1'],
    ['менеджеру место не создаётся', () => !validateRole('manager').ok],
    ['неизвестная роль — отказ', () => !validateRole('ghost').ok],
    ['известная роль — допуск', () => validateRole('designer').ok],
    ['грязное дерево без force не убирается', () => !removalDecision({ dirty: true, force: false }).ok],
    ['грязное дерево с force убирается', () => removalDecision({ dirty: true, force: true }).ok],
    ['чистое дерево убирается', () => removalDecision({ dirty: false, force: false }).ok],
  ];
  let fail = 0;
  for (const [name, fn] of cases) {
    const ok = (() => { try { return fn(); } catch { return false; } })();
    console.log(`${ok ? '✅' : '❌'} ${name}`);
    if (!ok) fail++;
  }
  console.log(fail ? `\n❌ провалов: ${fail}` : `\n✅ самопроверка чиста: ${cases.length}/${cases.length}`);
  process.exit(fail ? 1 : 0);
}

const [cmd, roleArg] = process.argv.slice(2);
if (process.argv.includes('--selftest')) selftest();
else if (cmd === 'create') {
  const main = mainRepoRoot();
  if (roleArg === '--all' || process.argv.includes('--all')) for (const r of ROLES) createOne(main, r);
  else if (roleArg) createOne(main, roleArg);
  else { console.error('⛔ create: назови роль или --all'); process.exit(1); }
} else if (cmd === 'list') {
  const main = mainRepoRoot();
  console.log(sh('git worktree list', { cwd: main }));
  for (const r of ROLES) {
    const wt = workplaceFor(main, r);
    if (!existsSync(wt)) { console.log(`🔲 ${r}: не развёрнут`); continue; }
    const behind = sh(`git rev-list --count ${branchFor(r)}..main`, { cwd: main });
    const nm = existsSync(join(wt, 'node_modules')) ? 'node_modules ✅' : 'node_modules ❌';
    console.log(`✅ ${r}: ${wt} [${branchFor(r)}] · отстаёт от main на ${behind} · ${nm}`);
  }
} else if (cmd === 'reset') {
  const main = mainRepoRoot();
  const v = validateRole(roleArg);
  if (!v.ok) { console.error(`⛔ ${v.reason}`); process.exit(1); }
  const wt = workplaceFor(main, roleArg);
  if (sh('git status --porcelain', { cwd: wt }) !== '') {
    console.error(`⛔ ${roleArg}: дерево грязное — коммит в ветку роли прежде перезапуска`);
    process.exit(1);
  }
  sh(`git reset --hard main`, { cwd: wt });
  console.log(`✅ ${roleArg}: ветка ${branchFor(roleArg)} перезапущена от текущего main (${sh('git rev-parse --short main', { cwd: main })})`);
} else if (cmd === 'remove') {
  const main = mainRepoRoot();
  const v = validateRole(roleArg);
  if (!v.ok) { console.error(`⛔ ${v.reason}`); process.exit(1); }
  const wt = workplaceFor(main, roleArg);
  if (!existsSync(wt)) { console.log(`🔲 ${roleArg}: рабочего места нет — убирать нечего`); process.exit(0); }
  const dirty = sh('git status --porcelain', { cwd: wt }) !== '';
  const d = removalDecision({ dirty, force: process.argv.includes('--force') });
  if (!d.ok) { console.error(`⛔ ${roleArg}: ${d.reason}`); process.exit(1); }
  // EXP-0175: junction снимается ДО любого рекурсивного удаления.
  for (const link of findReparse(wt)) {
    console.log(`   снимаю reparse-точку: ${link}`);
    execSync(`cmd /c rmdir "${link}"`);
  }
  sh(`git worktree remove --force "${wt}"`, { cwd: main });
  console.log(`✅ ${roleArg}: рабочее место убрано; ветка ${branchFor(roleArg)} сохранена (коммиты — ценность)`);
} else {
  console.log('команды: create <роль>|--all · list · reset <роль> · remove <роль> [--force] · --selftest');
  process.exit(cmd ? 1 : 0);
}

/**
 * Инструмент статус-доски команды NDIM_WORKTREE_DEV_TEAM (`plans/66` шаг 1.3).
 *
 * Каждая роль правит ТОЛЬКО СВОЮ строку доски `NDIM_WORKTREE_DEV_TEAM_STATUS.md`,
 * лежащей в ГЛАВНОЙ копии репозитория, — из какого бы worktree роль ни работала.
 *
 * Почему главная копия ищется через git, а не через __dirname: этот файл отслеживается git
 * и существует копией в КАЖДОМ worktree. Скрипт, запущенный из копии worktree, через
 * __dirname писал бы доску в worktree — и у каждой роли была бы своя «доска», которую никто
 * не читает. `git rev-parse --git-common-dir` из любого worktree указывает на общий .git
 * главной копии — а значит, и на единственную настоящую доску.
 *
 * Роль вызывающего выводится из рабочего каталога (worktree роли назван её именем; главная
 * копия = manager) — чужую строку инструмент не трогает: право Менеджера чинить зависшие
 * строки объявлено флагом `--role` и работает только из главной копии.
 *
 * Команды:
 *   node tools/team-status.mjs set [--busy|--free] [--doing "…"] [--waiting "…"] [--role <р>]
 *   node tools/team-status.mjs lock-stand | unlock-stand [--role <р>]
 *   node tools/team-status.mjs show
 *   node tools/team-status.mjs --selftest   # доказательства на чистых функциях, git не нужен
 *
 * Гонки записи: доска правится под файловым замком `<доска>.lock` (create-exclusive с
 * ретраями; замок старше 30 с считается брошенным и снимается). Запись атомарна:
 * временный файл + rename.
 */
import { readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync, statSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, basename, join, resolve } from 'node:path';

const BOARD_NAME = 'NDIM_WORKTREE_DEV_TEAM_STATUS.md';
const ROLES = ['manager', 'designer', 'qa', 'dev-1', 'dev-2', 'dev-3'];
const TEAM_DIR_NAME = 'ndim-team'; // сиблинг главной копии: D:\work\ai_sandbox\ndim-team\<роль>

/* ── Чистые функции (их доказывает --selftest) ─────────────────────────────────────────── */

/** Локальная метка момента по канону проекта: YYYY-MM-DD HH:MM ±HH:MM. */
export function stampNow(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())} ${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`;
}

/**
 * Кто кому какую строку вправе править.
 * Право одно: своя строка. Исключение одно: Менеджер флагом --role чинит зависшие чужие.
 */
export function authorize(callerRole, targetRole) {
  if (callerRole === targetRole) return { ok: true };
  if (callerRole === 'manager') return { ok: true, note: 'менеджер правит чужую строку по праву уборки' };
  return { ok: false, reason: `роль «${callerRole}» не правит строку «${targetRole}» — своя строка или сообщение её хозяину (манифест → Статус-доска)` };
}

/** Перезаписать в тексте доски строку роли. Возвращает новый текст или причину отказа. */
export function replaceRoleRow(text, role, { state, doing, waiting, stamp }) {
  const lines = text.split(/\r?\n/);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const re = new RegExp(`^\\|\\s*${role}\\s*\\|`);
  const i = lines.findIndex((l) => re.test(l));
  if (i === -1) return { error: `строка роли «${role}» на доске не найдена` };
  const esc = (s) => String(s ?? '—').replace(/\|/g, '·').trim() || '—';
  lines[i] = `| ${role} | ${esc(state)} | ${esc(doing)} | ${esc(waiting)} | ${esc(stamp)} |`;
  return { text: lines.join(eol) };
}

/** Перезаписать строку замка стенда. lock=true берёт, lock=false отдаёт. */
export function replaceStandLock(text, role, lock, stamp) {
  const lines = text.split(/\r?\n/);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const i = lines.findIndex((l) => /^\|\s*стенд\/e2e\/порты/.test(l));
  if (i === -1) return { error: 'строка замка стенда на доске не найдена' };
  const m = lines[i].match(/^\|[^|]+\|\s*([^|]+?)\s*\|/);
  const holder = m && !/^—/.test(m[1]) ? m[1].trim() : null;
  if (lock) {
    if (holder && holder !== role) return { error: `замок стенда занят: держатель «${holder}» — договорись с ним сообщением` };
    lines[i] = `| стенд/e2e/порты (8181·9099·9199·4173) | ${role} | ${stamp} |`;
  } else {
    if (holder && holder !== role && role !== 'manager')
      return { error: `замок стенда держит «${holder}» — отдать его может он или Менеджер` };
    lines[i] = `| стенд/e2e/порты (8181·9099·9199·4173) | — свободен — | — |`;
  }
  return { text: lines.join(eol) };
}

/* ── Обвязка: git, замок файла, команды ────────────────────────────────────────────────── */

/** Главная копия: dirname общего .git. Работает из главной копии и из любого worktree. */
function mainRepoRoot() {
  const common = execSync('git rev-parse --path-format=absolute --git-common-dir', { encoding: 'utf8' }).trim();
  return dirname(common);
}

/**
 * Роль по имени каталога рабочего места. Канон — `ndim_<роль>` (приписка владельца
 * 2026-08-21: отличает окна команды NDim в VS Code); старые имена без приписки принимаются
 * на время переезда (`team-workplaces.mjs relocate`).
 */
export function roleFromDirName(dir) {
  if (ROLES.includes(dir)) return dir; // старое имя каталога, до приписки
  const m = dir.match(/^ndim_(.+)$/);
  if (!m) return null;
  const role = m[1].replace(/^dev(\d)$/, 'dev-$1'); // ndim_dev1 → dev-1
  return ROLES.includes(role) ? role : null;
}

/** Роль вызывающего — по каталогу текущего worktree. */
function callerRole() {
  const top = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  const main = mainRepoRoot();
  if (resolve(top) === resolve(main)) return 'manager';
  const role = roleFromDirName(basename(top));
  if (role && resolve(dirname(top)) === resolve(join(dirname(main), TEAM_DIR_NAME))) return role;
  throw new Error(`каталог «${top}» не является рабочим местом роли команды (ожидаю главную копию или ${TEAM_DIR_NAME}\\ndim_<роль>)`);
}

/** Правка доски под файловым замком, атомарной заменой. */
function editBoard(mutate) {
  const board = join(mainRepoRoot(), BOARD_NAME);
  if (!existsSync(board)) throw new Error(`доска не найдена: ${board}`);
  const lock = board + '.lock';
  const deadline = Date.now() + 5000;
  for (;;) {
    try {
      const fd = openSync(lock, 'wx');
      closeSync(fd);
      break;
    } catch {
      // Брошенный замок (умерла сессия) старше 30 с снимается — иначе доска встала бы навсегда.
      try { if (Date.now() - statSync(lock).mtimeMs > 30_000) unlinkSync(lock); } catch {}
      if (Date.now() > deadline) throw new Error(`доска заперта дольше 5 с (${lock}) — сними замок руками, если он брошен`);
      const until = Date.now() + 100;
      while (Date.now() < until); // короткое ожидание без таймеров — скрипт одноразовый
    }
  }
  try {
    const text = readFileSync(board, 'utf8');
    const out = mutate(text);
    if (out.error) throw new Error(out.error);
    const tmp = board + '.tmp';
    writeFileSync(tmp, out.text, 'utf8');
    renameSync(tmp, board);
  } finally {
    try { unlinkSync(lock); } catch {}
  }
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : undefined;
}

/* ── Самопроверка (доказательства отказов и перезаписи — без git и диска) ─────────────── */

function selftest() {
  const board = [
    '| Роль | Состояние | Что делаю | Жду | Обновлено |',
    '|---|---|---|---|---|',
    '| manager | 🔲 не в сети | — | — | — |',
    '| qa | 🔲 не в сети | — | — | — |',
    '| Ресурс | Держатель | Взят |',
    '| стенд/e2e/порты (8181·9099·9199·4173) | — свободен — | — |',
  ].join('\n');
  const cases = [
    ['роль из нового имени каталога', () => roleFromDirName('ndim_dev1') === 'dev-1' && roleFromDirName('ndim_qa') === 'qa' && roleFromDirName('ndim_designer') === 'designer'],
    ['роль из старого имени каталога', () => roleFromDirName('dev-1') === 'dev-1' && roleFromDirName('qa') === 'qa'],
    ['чужой каталог — не роль', () => roleFromDirName('ndim_ghost') === null && roleFromDirName('kumm-d2') === null],
    ['чужая строка отказана', () => !authorize('qa', 'dev-1').ok],
    ['своя строка разрешена', () => authorize('qa', 'qa').ok],
    ['менеджер чинит чужую', () => authorize('manager', 'qa').ok],
    ['перезапись меняет ровно свою строку', () => {
      const r = replaceRoleRow(board, 'qa', { state: '🟢 свободен', doing: 'жду задач', waiting: '—', stamp: 'T' });
      return !r.error && r.text.includes('| qa | 🟢 свободен | жду задач | — | T |') && r.text.includes('| manager | 🔲 не в сети |');
    }],
    ['неизвестная роль — отказ', () => !!replaceRoleRow(board, 'ghost', { state: 'x' }).error],
    ['вертикальная черта в тексте не рвёт таблицу', () => {
      const r = replaceRoleRow(board, 'qa', { state: 'a|b', doing: 'c|d', waiting: '—', stamp: 'T' });
      return !r.error && !r.text.includes('a|b');
    }],
    ['замок берётся свободным', () => {
      const r = replaceStandLock(board, 'qa', true, 'T');
      return !r.error && r.text.includes('| qa | T |');
    }],
    ['занятый замок отказывает с именем держателя', () => {
      const taken = replaceStandLock(board, 'qa', true, 'T').text;
      const r = replaceStandLock(taken, 'dev-1', true, 'T2');
      return !!r.error && r.error.includes('qa');
    }],
    ['держатель отдаёт замок', () => {
      const taken = replaceStandLock(board, 'qa', true, 'T').text;
      const r = replaceStandLock(taken, 'qa', false, 'T2');
      return !r.error && r.text.includes('— свободен —');
    }],
    ['чужой замок не отдать (кроме менеджера)', () => {
      const taken = replaceStandLock(board, 'qa', true, 'T').text;
      return !!replaceStandLock(taken, 'dev-1', false, 'T2').error && !replaceStandLock(taken, 'manager', false, 'T2').error;
    }],
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

/* ── Точка входа ───────────────────────────────────────────────────────────────────────── */

const cmd = process.argv[2];
if (process.argv.includes('--selftest')) selftest();
else if (cmd === 'show') {
  console.log(readFileSync(join(mainRepoRoot(), BOARD_NAME), 'utf8'));
} else if (cmd === 'set' || cmd === 'lock-stand' || cmd === 'unlock-stand') {
  const caller = callerRole();
  const target = arg('--role') ?? caller;
  const auth = authorize(caller, target);
  if (!auth.ok) { console.error(`⛔ ${auth.reason}`); process.exit(1); }
  const stamp = stampNow();
  if (cmd === 'set') {
    const state = process.argv.includes('--busy') ? '🔴 занят'
      : process.argv.includes('--free') ? '🟢 свободен'
      : process.argv.includes('--offline') ? '🔲 не в сети' : '🟢 свободен';
    editBoard((t) => replaceRoleRow(t, target, { state, doing: arg('--doing') ?? '—', waiting: arg('--waiting') ?? '—', stamp }));
    console.log(`✅ строка «${target}»: ${state} · ${stamp}`);
  } else {
    editBoard((t) => replaceStandLock(t, target, cmd === 'lock-stand', stamp));
    console.log(cmd === 'lock-stand' ? `✅ замок стенда у «${target}» · ${stamp}` : `✅ замок стенда свободен`);
  }
} else {
  console.log('команды: set [--busy|--free|--offline] [--doing "…"] [--waiting "…"] [--role <р>] · lock-stand · unlock-stand · show · --selftest');
  process.exit(cmd ? 1 : 0);
}

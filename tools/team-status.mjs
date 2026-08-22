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
 *   node tools/team-status.mjs lock-stand | unlock-stand [--slot N] [--role <р>]
 *
 * 🆕 ТРИ СТРОКИ ЗАМКА — ПО СТРОКЕ НА СЛОТ (слово владельца 2026-08-22, дословно: «*а тут
 * осталось про один стенд. Если их три уже у нас, то на каждый по строчке заведите*»).
 * Замер `plans/69` шага 1 доказал, что машина держит три стенда разом, — доска обязана
 * показывать три ресурса, а не один.
 *
 * 🔴 И ОДНА ЧЕСТНОСТЬ, БЕЗ КОТОРОЙ ДОСКА СОВРЁТ. Три стенда сегодня — доказанная
 * ВОЗМОЖНОСТЬ, а не построенная работа: шаги 2–6 фазы 1 не сделаны, роль пока не может
 * поднять стенд на слоте ≠ 0 без правки конфигов руками. Поэтому слоты 1 и 2 несут в
 * подписи ресурса пометку «НЕ ПОСТРОЕН» — её снимает тот коммит, который слот действительно
 * построит. Строка, обещающая несуществующее, хуже одной честной.
 *
 * Умолчание команд без `--slot` — слот 0: сегодняшнее поведение не меняется ни для кого.
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

import { ROLES, portsFor, roleFromDirName } from './lib/stand-slot.mjs';

const BOARD_NAME = 'NDIM_WORKTREE_DEV_TEAM_STATUS.md';
const TEAM_DIR_NAME = 'ndim-team'; // сиблинг главной копии: D:\work\ai_sandbox\ndim-team\<роль>

/* ── Слоты стенда ──────────────────────────────────────────────────────────────────────── */

/**
 * Строки замка на доске. Замер `plans/69` шага 1 доказал, что машина держит ТРИ стенда разом,
 * и владелец велел завести по строке на каждый.
 *
 * 🔴 ЧЕСТНАЯ ГРАНИЦА, ЗАМЕЧЕННАЯ ПРИ ПОСТРОЙКЕ ПАРКА (`plans/69` шаг 2). Строк три, а ролей
 * шесть — значит строка замка это МЕСТО ЗА СТОЛОМ («сколько стендов машина тянет разом»), а не
 * адрес роли. Адрес живёт в `tools/lib/stand-slot.mjs` и у каждой роли свой (0…5): порты двух
 * ролей не пересекаются никогда, поэтому замок больше не защищает порты — он показывает, кто
 * сейчас занимает одно из трёх мест.
 * ⏭ Имя строки («слот N») от этого стало неточным. Переименование — правка доски, которую
 * владелец видел своими глазами, поэтому решение о нём за Менеджером; вопрос ему назван
 * отдельной строкой в отчёте фазы. До ответа имя оставлено как есть, чтобы живая доска и
 * инструмент не разъехались посреди смены.
 */
const SLOTS = [0, 1, 2];

/**
 * Слоты, которые ещё НЕ ПОСТРОЕНЫ кодом. Пометка снимается тем коммитом, который слот построит.
 * ⚠️ Это не украшение: доска, показавшая свободный слот 1, отправит роль на пустое место.
 */
const NOT_BUILT = new Set([1, 2]);

/**
 * Порты слота в порядке подписи владельца: firestore·auth·storage·preview·dev.
 * 🔴 Числа считает `lib/stand-slot.mjs` — ЕДИНСТВЕННОЕ место, где живёт арифметика слота (а базы
 * под ней — `lib/stand-cleanup.mjs`). Своя формула здесь была бы парой «истина ↔ зеркало»,
 * рождённой в день своего появления.
 */
export const slotPorts = (slot) => {
  const p = portsFor(slot);
  return [p.firestore, p.auth, p.storage, p.preview, p.dev];
};

/** Подпись ресурса на доске: чем слот является и построен ли он. */
export const slotLabel = (slot) =>
  `слот ${slot} · ${slotPorts(slot).join('·')}` + (NOT_BUILT.has(slot) ? ' — НЕ ПОСТРОЕН (plans/69 шаги 2–6)' : '');

/** Готовая строка таблицы замка. */
const slotRow = (slot, holder, stamp) => `| ${slotLabel(slot)} | ${holder} | ${stamp} |`;

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

/** Держатель, прочитанный из строки таблицы замка. `null` = свободен. */
const holderOf = (line) => {
  const m = line.match(/^\|[^|]+\|\s*([^|]+?)\s*\|/);
  return m && !/^—/.test(m[1]) ? m[1].trim() : null;
};

/**
 * Привести секцию замка к трём строкам слотов — ПРЯМО В ЖИВОЙ ДОСКЕ.
 *
 * 🔑 ПОЧЕМУ МИГРАЦИЯ В КОДЕ, А НЕ ПРАВКОЙ ФАЙЛА ДОСКИ. Доска живёт только в главной копии и
 * прямо сейчас правится пятью ролями. Правка её из worktree уехала бы в мерж и столкнулась с
 * живым состоянием — то есть с чужими строками, записанными за это время. Миграция в коде
 * случается при первой же операции замка, никого не будит и конфликтовать ей не с чем.
 *
 * Держатель старой одиночной строки НАСЛЕДУЕТСЯ слотом 0: он и есть тот стенд, который эта
 * строка описывала. Потерять его при миграции значило бы тихо освободить занятый ресурс.
 */
function ensureSlotRows(lines) {
  const legacy = lines.findIndex((l) => /^\|\s*стенд\/e2e\/порты/.test(l));
  if (legacy !== -1) {
    const inherited = holderOf(lines[legacy]);
    const stamp = inherited ? (lines[legacy].match(/\|\s*([^|]*?)\s*\|\s*$/)?.[1] ?? '—') : '—';
    lines.splice(legacy, 1, ...SLOTS.map((s) =>
      s === 0 ? slotRow(0, inherited ?? '— свободен —', inherited ? stamp : '—') : slotRow(s, '— свободен —', '—')));
    return { migrated: true };
  }
  // Строки слотов уже есть — но могла появиться не вся тройка (ручная правка, старый мерж).
  const missing = SLOTS.filter((s) => !lines.some((l) => new RegExp(`^\\|\\s*слот ${s}\\b`).test(l)));
  if (missing.length === SLOTS.length) return { error: 'секция замка стенда на доске не найдена' };
  for (const s of missing) {
    const after = lines.findIndex((l) => new RegExp(`^\\|\\s*слот ${s - 1}\\b`).test(l));
    lines.splice(after === -1 ? lines.length : after + 1, 0, slotRow(s, '— свободен —', '—'));
  }
  return { migrated: missing.length > 0 };
}

/**
 * Перезаписать строку замка КОНКРЕТНОГО СЛОТА. lock=true берёт, lock=false отдаёт.
 *
 * Слоты независимы по построению: занятый слот 1 не мешает взять слот 0 — это и есть та
 * польза парка, ради которой он строится, и она обязана быть видна на доске.
 */
export function replaceStandLock(text, role, lock, stamp, slot = 0) {
  if (!SLOTS.includes(slot)) return { error: `слота ${slot} нет: сегодня разведены ${SLOTS.join(', ')}` };
  const lines = text.split(/\r?\n/);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';

  const prep = ensureSlotRows(lines);
  if (prep.error) return { error: prep.error };

  const i = lines.findIndex((l) => new RegExp(`^\\|\\s*слот ${slot}\\b`).test(l));
  if (i === -1) return { error: `строка слота ${slot} на доске не найдена` };

  const holder = holderOf(lines[i]);
  if (lock) {
    if (holder && holder !== role)
      return { error: `слот ${slot} занят: держатель «${holder}» — договорись с ним сообщением или возьми свободный слот` };
    lines[i] = slotRow(slot, role, stamp);
  } else {
    if (holder && holder !== role && role !== 'manager')
      return { error: `слот ${slot} держит «${holder}» — отдать его может он или Менеджер` };
    lines[i] = slotRow(slot, '— свободен —', '—');
  }
  return { text: lines.join(eol), migrated: prep.migrated };
}

/* ── Обвязка: git, замок файла, команды ────────────────────────────────────────────────── */

/** Главная копия: dirname общего .git. Работает из главной копии и из любого worktree. */
function mainRepoRoot() {
  const common = execSync('git rev-parse --path-format=absolute --git-common-dir', { encoding: 'utf8' }).trim();
  return dirname(common);
}

/**
 * 🔑 Разбор имени каталога рабочего места ПЕРЕЕХАЛ в `lib/stand-slot.mjs` (`plans/69` шаг 2) —
 * не скопирован. Парку нужен тот же разбор, чтобы вывести адрес стенда; две копии дали бы роли
 * одну строку на доске и другой адрес стенда — расхождение, которого никто не заметит, пока не
 * станет поздно. Здесь функция только используется, и её самотест ниже остаётся на месте:
 * доска обязана краснеть, если разбор имён сломается, — ей от этого больно первой.
 *
 * Роль вызывающего — по каталогу текущего worktree.
 */
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

    /* ── Три слота (слово владельца 2026-08-22) ────────────────────────────────────────── */

    ['старая одиночная строка мигрирует в ТРИ', () => {
      const held = replaceStandLock(board, 'qa', true, 'T').text; // на входе ещё старая форма
      return SLOTS.every((s) => new RegExp(`^\\|\\s*слот ${s}\\b`, 'm').test(held))
        && /^\|\s*слот 0\b.*\|\s*qa\s*\|/m.test(held);
    }],

    /*
     * 🔴 СЛУЧАЙ С ЖИВЫМ ДЕРЖАТЕЛЕМ — тот, ради которого наследование вообще написано.
     *
     * Почему он заведён отдельно. Случай выше проходил ЗЕЛЁНЫМ, не доказывая наследования:
     * старая строка в его доске СВОБОДНА, поэтому в слоте 0 оказывался тот, кто прямо сейчас
     * берёт замок, а ветка `inherited` не исполнялась ни разу. Тест, проходящий по неверной
     * причине, хуже отсутствующего: он занимает место настоящего (`AGENT_GUIDE.md` → «Коммиты»:
     * после смены поведения спроси, не проходят ли старые тесты по НЕВЕРНОЙ причине).
     *
     * Цена ошибки, которую он стережёт: миграция случается при ПЕРВОЙ же операции замка, а роли
     * работают круглосуточно. Потерять держателя значит тихо освободить занятый стенд — сосед
     * поднимет свой на тех же портах, и оба увидят чужие данные, не поняв почему.
     */
    ['🔑 ЖИВОЙ держатель переживает миграцию: слот 0 наследует и роль, и её отметку', () => {
      const busy = board.replace(
        /^\| стенд\/e2e\/порты .*$/m,
        '| стенд/e2e/порты (8181·9099·9199·4173) | dev-3 | 2026-08-21 23:10 |',
      );
      const r = replaceStandLock(busy, 'qa', true, 'T', 1); // слот берёт ДРУГАЯ роль
      return !r.error
        && /^\|\s*слот 0\b.*\|\s*dev-3\s*\|\s*2026-08-21 23:10\s*\|/m.test(r.text)
        && /^\|\s*слот 1\b.*\|\s*qa\s*\|/m.test(r.text)
        && /^\|\s*слот 2\b.*\|\s*—\s*свободен\s*—\s*\|/m.test(r.text);
    }],
    ['🔑 унаследованный замок — НАСТОЯЩИЙ: слот 0 после миграции чужому не отдаётся', () => {
      const busy = board.replace(
        /^\| стенд\/e2e\/порты .*$/m,
        '| стенд/e2e/порты (8181·9099·9199·4173) | dev-3 | 2026-08-21 23:10 |',
      );
      const migrated = replaceStandLock(busy, 'qa', true, 'T', 1).text;
      const steal = replaceStandLock(migrated, 'dev-1', true, 'T2', 0);
      const release = replaceStandLock(migrated, 'dev-3', false, 'T2', 0);
      return !!steal.error && steal.error.includes('dev-3') && !release.error;
    }],
    ['🔑 ЗАНЯТЫЙ СЛОТ 1 НЕ МЕШАЕТ ВЗЯТЬ СЛОТ 0 — это и есть польза парка', () => {
      const s1 = replaceStandLock(board, 'qa', true, 'T', 1);
      if (s1.error) return false;
      const s0 = replaceStandLock(s1.text, 'dev-2', true, 'T2', 0);
      return !s0.error
        && /^\|\s*слот 1\b.*\|\s*qa\s*\|/m.test(s0.text)
        && /^\|\s*слот 0\b.*\|\s*dev-2\s*\|/m.test(s0.text);
    }],
    ['тот же слот дважды — отказ с именем держателя и советом взять свободный', () => {
      const s1 = replaceStandLock(board, 'qa', true, 'T', 1).text;
      const again = replaceStandLock(s1, 'dev-2', true, 'T2', 1);
      return !!again.error && again.error.includes('qa') && again.error.includes('свободный слот');
    }],
    ['слоты 1 и 2 честно помечены непостроенными, слот 0 — нет', () => {
      const t = replaceStandLock(board, 'qa', true, 'T', 0).text;
      return /слот 1[^|]*НЕ ПОСТРОЕН/.test(t) && /слот 2[^|]*НЕ ПОСТРОЕН/.test(t)
        && !/слот 0[^|]*НЕ ПОСТРОЕН/.test(t);
    }],
    ['порты слотов взяты из ЕДИНСТВЕННОГО списка и не пересекаются', () => {
      const all = SLOTS.flatMap(slotPorts);
      return all.length === new Set(all).size
        && slotPorts(0).join('·') === '8181·9099·9199·4173·5173'
        && slotPorts(1).join('·') === '8191·9109·9209·4183·5183'
        && slotPorts(2).join('·') === '8201·9119·9219·4193·5193';
    }],
    ['несуществующий слот — отказ, а не тихая правка слота 0', () => {
      const r = replaceStandLock(board, 'qa', true, 'T', 7);
      return !!r.error && r.error.includes('7');
    }],
    ['отдать чужой слот нельзя, свой — можно', () => {
      const s2 = replaceStandLock(board, 'qa', true, 'T', 2).text;
      return !!replaceStandLock(s2, 'dev-1', false, 'T2', 2).error
        && !replaceStandLock(s2, 'qa', false, 'T2', 2).error;
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
    const slot = Number(arg('--slot') ?? 0);
    if (!SLOTS.includes(slot)) { console.error(`⛔ слота ${slot} нет: сегодня разведены ${SLOTS.join(', ')}`); process.exit(1); }
    editBoard((t) => replaceStandLock(t, target, cmd === 'lock-stand', stamp, slot));
    console.log(cmd === 'lock-stand' ? `✅ слот ${slot} у «${target}» · ${stamp}` : `✅ слот ${slot} свободен`);
    if (NOT_BUILT.has(slot))
      console.log(`⚠️  слот ${slot} ещё НЕ ПОСТРОЕН (plans/69 шаги 2–6): стенд там руками не поднимется`);
  }
} else {
  console.log('команды: set [--busy|--free|--offline] [--doing "…"] [--waiting "…"] [--role <р>] · lock-stand · unlock-stand · show · --selftest');
  process.exit(cmd ? 1 : 0);
}

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
 *   node tools/team-status.mjs lock-stand | unlock-stand [--place N] [--role <р>]
 *
 * 🆕 ТРИ СТРОКИ ЗАМКА — ПО СТРОКЕ НА СТЕНД (слово владельца 2026-08-22, дословно: «*а тут
 * осталось про один стенд. Если их три уже у нас, то на каждый по строчке заведите*»).
 * Замер `plans/69` шага 1 доказал, что машина держит три стенда разом, — доска обязана
 * показывать три ресурса, а не один.
 *
 * 🔴 «СТЕНД N ИЗ 3» — ЭТО МЕСТО, А НЕ АДРЕС (переименование 2026-08-22: решение Менеджера по
 * вопросу владельца тем же утром — «*почему слот, а не стенд?*»). Полдня строки звались
 * «слот N», и это было неправдой дважды: строк три, а слотов шесть, и порты в подписи
 * принадлежали не тому, кто строку занимал.
 *   · **МЕСТО** (1…3) — ёмкость машины: сколько стендов она тянет РАЗОМ. Безымянно, любое
 *     свободное годится любой роли; берётся без флага.
 *   · **СЛОТ** (0…5, `tools/lib/stand-slot.mjs`) — адрес портов роли, выведенный из каталога.
 *     Роль его не выбирает; занятое место показывает адрес прямо в колонке держателя.
 *
 * Умолчания: `lock-stand` без флага берёт первое СВОБОДНОЕ место, `unlock-stand` — своё
 * ЗАНЯТОЕ. Флага `--slot` больше нет, и отказ на него громкий.
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

import { ROLES, portsFor, roleFromDirName, slotOfRole } from './lib/stand-slot.mjs';

const BOARD_NAME = 'NDIM_WORKTREE_DEV_TEAM_STATUS.md';
const TEAM_DIR_NAME = 'ndim-team'; // сиблинг главной копии: D:\work\ai_sandbox\ndim-team\<роль>

/* ── Места стенда ──────────────────────────────────────────────────────────────────────── */

/**
 * МЕСТА за столом: сколько стендов машина держит ОДНОВРЕМЕННО. Замер `plans/69` шага 1 доказал,
 * что три живут разом, и владелец велел завести по строке на каждый.
 *
 * 🔴 МЕСТО И СЛОТ — РАЗНЫЕ ВЕЩИ, И ЭТО ПЕРЕИМЕНОВАНИЕ ИМЕННО ОБ ЭТОМ (решение Менеджера
 * 2026-08-22 по вопросу владельца тем же утром: «*почему слот, а не стенд?*»).
 *   · **МЕСТО** (эта таблица, 1…3) — ЁМКОСТЬ МАШИНЫ. Их три, потому что больше трёх стендов
 *     машина не тянет. Место безымянное: любое свободное годится любой роли.
 *   · **СЛОТ** (`tools/lib/stand-slot.mjs`, 0…5) — АДРЕС РОЛИ. Их шесть, по одному на роль, и
 *     он выводится из каталога. Порты двух ролей не пересекаются никогда.
 * Раньше строки звались «слот N», и это было неправдой дважды: строк три, а слотов шесть, и
 * порты в подписи принадлежали не тому, кто строку занимал. Слово «слот» с этого коммита
 * означает ТОЛЬКО адрес портов роли.
 *
 * 🔑 Поэтому занятое место НЕСЁТ АДРЕС: `dev-2 · слот 4`. Роль не выбирает адрес и не может
 * ошибиться — он выведен из её каталога; место же берётся любое свободное.
 */
const PLACES = [1, 2, 3];

/**
 * Держатель места вместе с его адресом: `dev-2 · слот 4`. Роль сюда приходит одна, адрес
 * добавляется выводом — второго источника у него нет.
 */
const holderWithSlot = (role) => {
  const slot = slotOfRole(role);
  return slot === null ? role : `${role} · слот ${slot}`;
};

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

/**
 * Подпись места. Портов в ней НЕТ намеренно: место безымянно, а порты принадлежат слоту того,
 * кто место занял, и уже названы в колонке держателя. Подпись с чужими портами — это ровно та
 * неправда, ради устранения которой строки и переименованы.
 */
export const placeLabel = (place) => `стенд ${place} из ${PLACES.length}`;

/** Готовая строка таблицы замка. */
const placeRow = (place, holder, stamp) => `| ${placeLabel(place)} | ${holder} | ${stamp} |`;

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

/**
 * Держатель, прочитанный из строки таблицы замка. `null` = свободен.
 *
 * Из ячейки берётся РОЛЬ: с переименования строк держатель пишется как `dev-2 · слот 4`, и
 * сравнивать с ролью надо первую половину. Старая форма (одна роль без адреса) читается тем же
 * разбором — хвост просто отсутствует.
 */
const holderOf = (line) => {
  const m = line.match(/^\|[^|]+\|\s*([^|]+?)\s*\|/);
  if (!m || /^—/.test(m[1])) return null;
  return m[1].trim().split('·')[0].trim();
};

/**
 * Привести секцию замка к трём строкам МЕСТ — ПРЯМО В ЖИВОЙ ДОСКЕ.
 *
 * 🔑 ПОЧЕМУ МИГРАЦИЯ В КОДЕ, А НЕ ПРАВКОЙ ФАЙЛА ДОСКИ. Доска живёт только в главной копии и
 * прямо сейчас правится пятью ролями. Правка её из worktree уехала бы в мерж и столкнулась с
 * живым состоянием — то есть с чужими строками, записанными за это время. Миграция в коде
 * случается при первой же операции замка, никого не будит и конфликтовать ей не с чем.
 *
 * 🔴 ФОРМ, ИЗ КОТОРЫХ НАДО ПОДНЯТЬСЯ, ТЕПЕРЬ ДВЕ, И ОБЕ ЖИВЫЕ:
 *   1. одна строка «стенд/e2e/порты …» — доска до трёх мест;
 *   2. три строки «слот 0…2» — доска между трёх мест и переименования (жила полдня).
 * Держатель НАСЛЕДУЕТСЯ вместе со своей отметкой в обоих случаях. Потерять его значило бы тихо
 * освободить занятый стенд: сосед поднимет свой, и оба увидят чужие данные, не поняв почему.
 * Порядок мест при миграции из формы 2 сохраняется: слот 0 → место 1, слот 1 → место 2, и так же
 * дальше — иначе держатели переехали бы по строкам без причины.
 */
function ensurePlaceRows(lines) {
  const legacy = lines.findIndex((l) => /^\|\s*стенд\/e2e\/порты/.test(l));
  const stampOf = (line) => line.match(/\|\s*([^|]*?)\s*\|\s*$/)?.[1] ?? '—';

  if (legacy !== -1) {
    const inherited = holderOf(lines[legacy]);
    const stamp = inherited ? stampOf(lines[legacy]) : '—';
    lines.splice(legacy, 1, ...PLACES.map((p) => (p === 1
      ? placeRow(1, inherited ? holderWithSlot(inherited) : '— свободен —', inherited ? stamp : '—')
      : placeRow(p, '— свободен —', '—'))));
    return { migrated: true };
  }

  // Форма 2: строки «слот 0…2». Переписываем их в места, держателей несём с собой.
  const old = [0, 1, 2].map((s) => lines.findIndex((l) => new RegExp(`^\\|\\s*слот ${s} `).test(l)));
  if (old.every((i) => i !== -1)) {
    const carried = old.map((i) => ({ holder: holderOf(lines[i]), stamp: stampOf(lines[i]) }));
    for (const [k, i] of old.entries()) {
      const { holder, stamp } = carried[k];
      lines[i] = placeRow(k + 1, holder ? holderWithSlot(holder) : '— свободен —', holder ? stamp : '—');
    }
    return { migrated: true };
  }

  // Строки мест уже есть — но могла появиться не вся тройка (ручная правка, старый мерж).
  const missing = PLACES.filter((p) => !lines.some((l) => new RegExp(`^\\|\\s*стенд ${p} из `).test(l)));
  if (missing.length === PLACES.length) return { error: 'секция замка стенда на доске не найдена' };
  for (const p of missing) {
    const after = lines.findIndex((l) => new RegExp(`^\\|\\s*стенд ${p - 1} из `).test(l));
    lines.splice(after === -1 ? lines.length : after + 1, 0, placeRow(p, '— свободен —', '—'));
  }
  return { migrated: missing.length > 0 };
}

/**
 * Перезаписать строку замка КОНКРЕТНОГО МЕСТА. lock=true берёт, lock=false отдаёт.
 *
 * Места независимы: занятое место 2 не мешает взять место 1 — и это та самая польза парка,
 * ради которой он строился. Взяв место, роль поднимает стенд на СВОЁМ слоте; какой это слот,
 * видно прямо в колонке держателя, и роль его не выбирает.
 */
export function replaceStandLock(text, role, lock, stamp, place = 1) {
  if (!PLACES.includes(place))
    return { error: `места ${place} нет: машина держит ${PLACES.length} стенда разом (${PLACES.join(', ')})` };
  const lines = text.split(/\r?\n/);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';

  const prep = ensurePlaceRows(lines);
  if (prep.error) return { error: prep.error };

  const i = lines.findIndex((l) => new RegExp(`^\\|\\s*стенд ${place} из `).test(l));
  if (i === -1) return { error: `строка места ${place} на доске не найдена` };

  const holder = holderOf(lines[i]);
  if (lock) {
    if (holder && holder !== role)
      return { error: `стенд ${place} занят: держатель «${holder}» — договорись с ним сообщением или возьми свободное место` };
    lines[i] = placeRow(place, holderWithSlot(role), stamp);
  } else {
    if (holder && holder !== role && role !== 'manager')
      return { error: `стенд ${place} держит «${holder}» — отдать его может он или Менеджер` };
    lines[i] = placeRow(place, '— свободен —', '—');
  }
  return { text: lines.join(eol), migrated: prep.migrated };
}

/** Первое свободное место, или `null`. Роль не должна выбирать номер — места безымянны. */
export function firstFreePlace(text) {
  const lines = text.split(/\r?\n/);
  for (const p of PLACES) {
    const i = lines.findIndex((l) => new RegExp(`^\\|\\s*стенд ${p} из `).test(l));
    if (i !== -1 && holderOf(lines[i]) === null) return p;
  }
  return null;
}

/**
 * Место, которое держит роль, или `null`.
 *
 * 🔴 Нужно ОТДЕЛЬНО от `firstFreePlace`, и вот почему: умолчание у взятия и у отдачи разное.
 * Беря место, роль хочет любое СВОБОДНОЕ; отдавая — своё ЗАНЯТОЕ. Одно умолчание на два действия
 * означало бы, что `unlock-stand` без флага целится в чужую пустую строку и отвечает «отдано»,
 * не отдав ничего, — а стенд роли остаётся числиться занятым до конца смены.
 */
export function placeHeldBy(text, role) {
  const lines = text.split(/\r?\n/);
  for (const p of PLACES) {
    const i = lines.findIndex((l) => new RegExp(`^\\|\\s*стенд ${p} из `).test(l));
    if (i !== -1 && holderOf(lines[i]) === role) return p;
  }
  return null;
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
    /* ── МЕСТА СТЕНДА: три за столом, адрес выводится из роли ───────────────────────────── */

    ['место берётся свободным и НЕСЁТ АДРЕС слота роли', () => {
      const r = replaceStandLock(board, 'qa', true, 'T', 1);
      return !r.error && /^\|\s*стенд 1 из 3\s*\|\s*qa · слот 2\s*\|\s*T\s*\|/m.test(r.text);
    }],
    ['занятое место отказывает с именем держателя и советом взять свободное', () => {
      const taken = replaceStandLock(board, 'qa', true, 'T', 1).text;
      const r = replaceStandLock(taken, 'dev-1', true, 'T2', 1);
      return !!r.error && r.error.includes('qa') && r.error.includes('свободное место');
    }],
    ['держатель отдаёт своё место', () => {
      const taken = replaceStandLock(board, 'qa', true, 'T', 1).text;
      const r = replaceStandLock(taken, 'qa', false, 'T2', 1);
      return !r.error && /^\|\s*стенд 1 из 3\s*\|\s*—\s*свободен\s*—\s*\|/m.test(r.text);
    }],
    ['чужое место не отдать — кроме Менеджера по праву уборки', () => {
      const taken = replaceStandLock(board, 'qa', true, 'T', 1).text;
      return !!replaceStandLock(taken, 'dev-1', false, 'T2', 1).error
        && !replaceStandLock(taken, 'manager', false, 'T2', 1).error;
    }],
    ['🔑 ЗАНЯТОЕ МЕСТО 2 НЕ МЕШАЕТ ВЗЯТЬ МЕСТО 1 — это и есть польза парка', () => {
      const p2 = replaceStandLock(board, 'qa', true, 'T', 2);
      if (p2.error) return false;
      const p1 = replaceStandLock(p2.text, 'dev-2', true, 'T2', 1);
      return !p1.error
        && /^\|\s*стенд 2 из 3\s*\|\s*qa · слот 2\s*\|/m.test(p1.text)
        && /^\|\s*стенд 1 из 3\s*\|\s*dev-2 · слот 4\s*\|/m.test(p1.text);
    }],
    ['несуществующее место — отказ, а не тихая правка первого', () => {
      const r = replaceStandLock(board, 'qa', true, 'T', 7);
      return !!r.error && r.error.includes('7');
    }],
    ['подпись места НЕ несёт портов — они принадлежат слоту держателя', () => {
      const t = replaceStandLock(board, 'qa', true, 'T', 1).text;
      const row = t.split(/\r?\n/).find((l) => /^\|\s*стенд 1 из 3\b/.test(l)) ?? '';
      return !/8181|8191|8201|4173|5173/.test(row) && row.includes('слот 2');
    }],
    ['первое свободное место и место роли — разные вопросы с разными ответами', () => {
      const t = replaceStandLock(board, 'qa', true, 'T', 1).text;
      return firstFreePlace(t) === 2 && placeHeldBy(t, 'qa') === 1 && placeHeldBy(t, 'dev-1') === null;
    }],

    /* ── Миграции: две живые формы доски, и держатель переживает обе ─────────────────────── */

    ['старая ОДИНОЧНАЯ строка мигрирует в ТРИ места', () => {
      const held = replaceStandLock(board, 'qa', true, 'T').text;
      return [1, 2, 3].every((p) => new RegExp(`^\\|\\s*стенд ${p} из 3\\b`, 'm').test(held));
    }],

    /*
     * 🔴 СЛУЧАЙ С ЖИВЫМ ДЕРЖАТЕЛЕМ — тот, ради которого наследование вообще написано.
     *
     * Почему он заведён отдельно. Случай выше проходил ЗЕЛЁНЫМ, не доказывая наследования:
     * старая строка в его доске СВОБОДНА, поэтому в первом месте оказывался тот, кто прямо
     * сейчас берёт замок, а ветка `inherited` не исполнялась ни разу. Тест, проходящий по
     * неверной причине, хуже отсутствующего: он занимает место настоящего (`AGENT_GUIDE.md`
     * → «Коммиты»: после смены поведения спроси, не проходят ли старые тесты по НЕВЕРНОЙ
     * причине).
     *
     * Цена ошибки, которую он стережёт: миграция случается при ПЕРВОЙ же операции замка, а роли
     * работают круглосуточно. Потерять держателя значит тихо освободить занятый стенд — сосед
     * поднимет свой, и оба увидят чужие данные, не поняв почему.
     */
    ['🔑 ЖИВОЙ держатель переживает миграцию из одиночной строки — с отметкой и адресом', () => {
      const busy = board.replace(
        /^\| стенд\/e2e\/порты .*$/m,
        '| стенд/e2e/порты (8181·9099·9199·4173) | dev-3 | 2026-08-21 23:10 |',
      );
      const r = replaceStandLock(busy, 'qa', true, 'T', 2);
      return !r.error
        && /^\|\s*стенд 1 из 3\s*\|\s*dev-3 · слот 5\s*\|\s*2026-08-21 23:10\s*\|/m.test(r.text)
        && /^\|\s*стенд 2 из 3\s*\|\s*qa · слот 2\s*\|/m.test(r.text)
        && /^\|\s*стенд 3 из 3\s*\|\s*—\s*свободен\s*—\s*\|/m.test(r.text);
    }],
    ['🔑 унаследованный замок — НАСТОЯЩИЙ: чужому место не отдаётся, своему отдаётся', () => {
      const busy = board.replace(
        /^\| стенд\/e2e\/порты .*$/m,
        '| стенд/e2e/порты (8181·9099·9199·4173) | dev-3 | 2026-08-21 23:10 |',
      );
      const migrated = replaceStandLock(busy, 'qa', true, 'T', 2).text;
      return !!replaceStandLock(migrated, 'dev-1', true, 'T2', 1).error
        && !replaceStandLock(migrated, 'dev-3', false, 'T2', 1).error;
    }],

    /*
     * 🔴 ВТОРАЯ ЖИВАЯ ФОРМА — доска «слот 0…2», прожившая полдня между тремя строками и
     * переименованием. На момент правки она ЗАНЯТА двумя ролями, и мерж случится, когда роли
     * работают. Держатели обязаны переехать по местам В ТОМ ЖЕ ПОРЯДКЕ, иначе они молча
     * поменяются стендами.
     */
    ['🔑 форма «слот 0…2» мигрирует в места, держатели едут по порядку и не теряются', () => {
      const mid = [
        '| Ресурс | Держатель | Взят |',
        '| слот 0 · 8181·9099·9199·4173·5173 | dev-1 | 2026-08-22 09:46 |',
        '| слот 1 · 8191·9109·9209·4183·5183 — НЕ ПОСТРОЕН (plans/69 шаги 2–6) | dev-2 | 2026-08-22 10:12 |',
        '| слот 2 · 8201·9119·9219·4193·5193 — НЕ ПОСТРОЕН (plans/69 шаги 2–6) | — свободен — | — |',
      ].join('\n');
      const r = replaceStandLock(mid, 'qa', true, 'T', 3);
      return !r.error
        && /^\|\s*стенд 1 из 3\s*\|\s*dev-1 · слот 3\s*\|\s*2026-08-22 09:46\s*\|/m.test(r.text)
        && /^\|\s*стенд 2 из 3\s*\|\s*dev-2 · слот 4\s*\|\s*2026-08-22 10:12\s*\|/m.test(r.text)
        && /^\|\s*стенд 3 из 3\s*\|\s*qa · слот 2\s*\|/m.test(r.text)
        && !/НЕ ПОСТРОЕН/.test(r.text)
        && !/слот 0 ·/.test(r.text);
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
    /*
     * 🔴 `--slot` здесь БОЛЬШЕ НЕ ПРИНИМАЕТСЯ, и отказ громкий (переименование 2026-08-22).
     * Флаг полдня означал строку замка, а теперь слот — это адрес портов роли, который никто не
     * выбирает руками. Молча истолковать старый флаг как место значило бы исполнить не то, что
     * человек сказал; отказ с объяснением стоит одной строки и никого не обманывает.
     */
    if (process.argv.includes('--slot')) {
      console.error('⛔ флага --slot больше нет: слот — это АДРЕС портов роли, он выводится из каталога.');
      console.error('   Строка замка теперь МЕСТО («стенд N из 3»), и берётся оно флагом --place N');
      console.error('   либо без флага — тогда занимается первое свободное.');
      process.exit(1);
    }
    /*
     * Умолчания РАЗНЫЕ у взятия и у отдачи, и это не симметрия ради симметрии: беря, роль хочет
     * любое свободное место; отдавая — своё занятое. Общее умолчание отдавало бы чужую пустую
     * строку и рапортовало об успехе, оставив стенд роли занятым до конца смены.
     */
    const wanted = arg('--place');
    const lock = cmd === 'lock-stand';
    editBoard((t) => {
      // ⚠️ Место ищется в ТЕКСТЕ ДОСКИ, но до миграции строк там может ещё не быть формы мест.
      // Поэтому сперва приводим форму, а уже потом ищем: иначе первое взятие после переименования
      // не нашло бы ни одного места и отказало бы на исправной доске.
      const migrated = (() => { const l = t.split(/\r?\n/); ensurePlaceRows(l); return l.join('\n'); })();
      const place = wanted !== undefined ? Number(wanted)
        : lock ? firstFreePlace(migrated) : placeHeldBy(migrated, target);
      if (place === null) return {
        error: lock
          ? 'все три места заняты — посмотри доску (show) и договорись с держателем'
          : `место за «${target}» не числится: отдавать нечего (посмотри доску: show)`,
      };
      const out = replaceStandLock(t, target, lock, stamp, place);
      if (!out.error) console.log(lock
        ? `✅ стенд ${place} из 3 у «${holderWithSlot(target)}» · ${stamp}`
        : `✅ стенд ${place} из 3 свободен`);
      return out;
    });
  }
} else {
  console.log('команды: set [--busy|--free|--offline] [--doing "…"] [--waiting "…"] [--role <р>] · lock-stand · unlock-stand · show · --selftest');
  process.exit(cmd ? 1 : 0);
}

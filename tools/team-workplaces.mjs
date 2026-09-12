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
 *   node tools/team-workplaces.mjs relocate              # переезд каталогов на имена ndim_<роль>
 *   node tools/team-workplaces.mjs reset <роль>          # перезапуск ветки от свежего main (после мержа)
 *   node tools/team-workplaces.mjs reset <роль> --force  # …и когда в ветке есть НЕВЛИТОЕ — со спасательной веткой
 *   node tools/team-workplaces.mjs remove <роль>         # уборка ПО EXP-0175 (junction-скан ДО удаления)
 *   node tools/team-workplaces.mjs --selftest            # чистые функции, без git и диска
 *
 * 🔴 `reset` — предохранитель невлитой работы (`bugs/168`). Перед `git reset --hard main`
 * инструмент считает `git rev-list --count main..<ветка>`: не ноль — ОТКАЗ кодом 1 с числом и
 * заголовками коммитов и двумя законными выходами (смержить · `--force`). С `--force` сброс идёт,
 * но СНАЧАЛА ставится спасательная ветка `<ветка>-rescue-<ГГГГММДД-ЧЧММ>` на прежнюю голову — reflog
 * истекает, ветка нет. Повод: ночь 2026-08-22, четыре коммита Дизайнера уехали на `main` от сброса
 * «списком по всем ролям», и снаружи опасная ветка ничем не отличалась от четырёх безопасных.
 * Юнит на временном репозитории — `tools/team-workplaces.test.mjs` (К1–К3), мутация — К4.
 *
 * 🔴 Уборка — урок EXP-0175: `git worktree remove --force` и рекурсивное удаление PowerShell
 * СЛЕДУЮТ сквозь junction в настоящую цель (уже съедали корневой node_modules главной копии).
 * Поэтому remove сначала сканирует reparse-точки в известных местах (корень worktree и
 * sync-server/) и снимает их `cmd /c rmdir` (снимает ССЫЛКУ, не следуя в цель), и только потом
 * зовёт `git worktree remove`. При npm ci junction'ов не бывает — скан это ПОДТВЕРЖДАЕТ, а не
 * предполагает.
 *
 * Ветка при remove НЕ удаляется: коммиты роли — ценность, к ним вернётся новая сессия.
 *
 * Запуск: node tools/team-workplaces.mjs · самотест: --selftest
 */
import { existsSync, lstatSync, readdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROLES = ['designer', 'qa', 'dev-1', 'integrator', 'dev-3']; // manager живёт в главной копии — места ему не создаём
// ✅ Каталог Интегратора переехал ndim_dev2 → ndim_integrator (2026-08-29, смена 13): владелец
// закрыл окно VS Code, git worktree move прошёл. ⚠️ Команда relocate этого НЕ умела и не умеет —
// её legacyWorkplaceFor знает только имя без приписки (ndim-team/<роль>), а там менялось имя РОЛИ.
// Переквалификация роли переезжает прямым `git worktree move`, не этой командой.
const TEAM_DIR_NAME = 'ndim-team';

/* ── Чистые функции (--selftest) ───────────────────────────────────────────────────────── */

/** Ветка роли: понятное имя согласно роли, с припиской ndim_ (слово владельца, 2026-08-21). */
export function branchFor(role) { return `ndim_${role.replace(/-/g, '')}`; }

/**
 * Имя каталога рабочего места = имя ветки = имя сессии: `ndim_<роль>`.
 * Приписка нужна владельцу в заголовке окна VS Code — окна ролей должны отличаться от окон
 * чужих проектов на этой машине (слово владельца, 2026-08-21 вечером). Побочная выгода: имя
 * сессии по умолчанию начинается с имени каталога, поэтому адрес роли верен и без /rename.
 */
export function dirNameFor(role) { return branchFor(role); }

/** Каталог рабочего места роли от корня главной копии. */
export function workplaceFor(mainRoot, role) { return join(dirname(mainRoot), TEAM_DIR_NAME, dirNameFor(role)); }

/** Прежнее имя каталога (до приписки ndim_) — нужно только команде relocate. */
export function legacyWorkplaceFor(mainRoot, role) { return join(dirname(mainRoot), TEAM_DIR_NAME, role); }

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

/**
 * Решение о перезапуске ветки (`bugs/168`): `ahead` — сколько у ветки СВОИХ коммитов, которых нет
 * в `main` (`git rev-list --count main..<ветка>`). Не ноль без `--force` — отказ; не ноль с
 * `--force` — сброс разрешён, но обязан оставить спасательную ветку (`rescue: true`).
 */
export function resetDecision({ ahead, force }) {
  if (ahead > 0 && !force) {
    return { ok: false, rescue: false, reason: `в ветке ${ahead} ${plural(ahead, 'свой коммит', 'своих коммита', 'своих коммитов')}, которых нет в main — сброс уничтожил бы их` };
  }
  return { ok: true, rescue: ahead > 0 };
}

/** Имя спасательной ветки: прежняя ветка + метка момента, чтобы два спасения не столкнулись именем. */
export function rescueBranchName(branch, now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${branch}-rescue-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/* ── git-обвязка ───────────────────────────────────────────────────────────────────────── */

function sh(cmd, opts = {}) { return execSync(cmd, { encoding: 'utf8', ...opts }).trim(); }
function mainRepoRoot() { return dirname(sh('git rev-parse --path-format=absolute --git-common-dir')); }

/**
 * Перезапуск ветки роли от `main` — с предохранителем невлитой работы (`bugs/168`).
 *
 * Принимает адреса явно (`main` — корень главной копии, `wt` — рабочее место, `branch` — ветка),
 * а не роль: так процедуру гоняет юнит на ВРЕМЕННОМ репозитории (`team-workplaces.test.mjs`),
 * а живые рабочие места ролей мутациями не трогаются. Ничего не печатает и процесс не гасит —
 * возвращает результат, а слова и код выхода — у CLI.
 *
 * Порядок обязателен: грязное дерево → отказ; свои коммиты без `--force` → отказ; свои коммиты с
 * `--force` → СНАЧАЛА спасательная ветка на прежнюю голову, ПОТОМ сброс. Спасение ставится до
 * разрушения, потому что разрушение, случившееся до спасения, спасать уже нечем.
 */
export function performReset({ main, wt, branch, force = false, now = new Date() }) {
  if (sh('git status --porcelain', { cwd: wt }) !== '') {
    return { ok: false, reason: 'дерево грязное — коммит в ветку роли прежде перезапуска', ahead: null };
  }
  const ahead = Number(sh(`git rev-list --count main..${branch}`, { cwd: main }));
  const titles = ahead ? sh(`git log --oneline main..${branch}`, { cwd: main }).split(/\r?\n/) : [];
  const d = resetDecision({ ahead, force });
  if (!d.ok) return { ok: false, reason: d.reason, ahead, titles };
  let rescue = null;
  if (d.rescue) {
    rescue = rescueBranchName(branch, now);
    sh(`git branch ${rescue} ${branch}`, { cwd: main }); // на ПРЕЖНЮЮ голову, до сброса
  }
  sh('git reset --hard main', { cwd: wt });
  return { ok: true, ahead, titles, rescue, head: sh('git rev-parse --short main', { cwd: main }) };
}

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
  // Модель роли предзадана конфигом места (слово владельца 2026-08-21: роли — на Opus 5).
  // Файл локальный (.gitignore), поэтому его пишет create, а не git.
  const localSettings = join(wt, '.claude', 'settings.local.json');
  if (!existsSync(localSettings)) {
    writeFileSync(localSettings, JSON.stringify({
      _team: 'Рабочее место команды NDIM_WORKTREE_DEV_TEAM: модель роли предзадана Менеджером (слово владельца 2026-08-21). Файл локальный, в git не едет.',
      model: 'opus',
    }, null, 2) + '\n', 'utf8');
    console.log(`   ✅ модель роли предзадана: .claude/settings.local.json → opus`);
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
    ['ветка роли — по роли с припиской ndim_', () => branchFor('qa') === 'ndim_qa' && branchFor('dev-1') === 'ndim_dev1'],
    ['каталог = ветка = адрес (ndim_<роль>)', () => dirNameFor('dev-1') === 'ndim_dev1' && dirNameFor('designer') === 'ndim_designer'],
    ['каталог — сиблинг ndim-team с припиской', () => workplaceFor('D:\\work\\ai_sandbox\\ndim', 'dev-1').toLowerCase() === 'd:\\work\\ai_sandbox\\ndim-team\\ndim_dev1'],
    ['старый каталог — без приписки', () => legacyWorkplaceFor('D:\\work\\ai_sandbox\\ndim', 'dev-1').toLowerCase() === 'd:\\work\\ai_sandbox\\ndim-team\\dev-1'],
    ['менеджеру место не создаётся', () => !validateRole('manager').ok],
    ['неизвестная роль — отказ', () => !validateRole('ghost').ok],
    ['известная роль — допуск', () => validateRole('designer').ok],
    ['грязное дерево без force не убирается', () => !removalDecision({ dirty: true, force: false }).ok],
    ['грязное дерево с force убирается', () => removalDecision({ dirty: true, force: true }).ok],
    ['чистое дерево убирается', () => removalDecision({ dirty: false, force: false }).ok],
    // bugs/168 — предохранитель невлитой работы при reset
    ['reset: свои коммиты без force — отказ с числом', () => { const d = resetDecision({ ahead: 4, force: false }); return !d.ok && /4 своих коммита/.test(d.reason); }],
    ['reset: свои коммиты с force — сброс со спасением', () => { const d = resetDecision({ ahead: 1, force: true }); return d.ok && d.rescue === true; }],
    ['reset: влитая ветка — сброс без спасения', () => { const d = resetDecision({ ahead: 0, force: false }); return d.ok && d.rescue === false; }],
    ['reset: имя спасательной ветки несёт ветку и момент', () => rescueBranchName('ndim_designer', new Date(2026, 7, 22, 2, 15)) === 'ndim_designer-rescue-20260822-0215'],
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

/**
 * 🔴 ПРЕДОХРАНИТЕЛЬ «ЗАПУЩЕН ИЛИ ПОДКЛЮЧЁН» (`ideas/43`; страж класса — `verify-import-safety.mjs`).
 *
 * Парк рабочих мест — точный близнец статус-доски по устройству, и дефект у него был тот же:
 * импорт ради экспортов уходил в последнюю ветку чейна, печатал подсказку и звал
 * `process.exit(0)`, убивая чужой процесс кодом успеха. У доски это замерено (`team-status`,
 * смена 10) и оказалось дороже, чем считалось: такой прибор нельзя покрыть юнитом — файл
 * умирает до первого утверждения, а `node --test` засчитывает его пройденным.
 *
 * Форма выражения сверена на трёх способах вызова (Windows, node 24): абсолютный путь с
 * обратными слэшами, относительный и со СТРОЧНОЙ буквой диска — совпали во всех трёх.
 * Снимать эту сверку нельзя: разъедься формы регистром диска, парк молча перестал бы
 * работать у всех ролей.
 *
 * Семантика `reset` вылечена отдельно (`bugs/168`, `performReset` выше) — предохранитель и
 * правка входа друг друга не касаются.
 */
const ЗАПУЩЕН_НАПРЯМУЮ = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

// Имя не `main`: внутри веток уже живёт `const main = mainRepoRoot()` — главная копия.
function выполнить() {
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
  } else if (cmd === 'relocate') {
    // Переезд каталогов на имена ndim_<роль> (правка владельца 2026-08-21: приписка нужна
    // и в заголовках окон VS Code). Требует ЗАКРЫТЫХ окон ролей: Windows держит открытый
    // рабочий каталог, и git worktree move падает Permission denied.
    const main = mainRepoRoot();
    let moved = 0, skipped = 0, failed = 0;
    for (const r of ROLES) {
      const from = legacyWorkplaceFor(main, r);
      const to = workplaceFor(main, r);
      if (existsSync(to)) { console.log(`✅ ${r}: уже на новом месте — ${to}`); skipped++; continue; }
      if (!existsSync(from)) { console.log(`🔲 ${r}: не развёрнут — нечего переносить`); skipped++; continue; }
      try {
        sh(`git worktree move "${from}" "${to}"`, { cwd: main });
        console.log(`✅ ${r}: ${from} → ${to}`);
        moved++;
      } catch (e) {
        console.error(`⛔ ${r}: переезд не удался — ${String(e.message).split('\n')[0]}`);
        console.error(`   Каталог заперт открытым окном VS Code? Закрой окно роли и повтори.`);
        failed++;
      }
    }
    console.log(`\nИтог: переехало ${moved} · пропущено ${skipped} · отказов ${failed}`);
    if (!failed) console.log('Проверка: node tools/team-workplaces.mjs list');
    process.exitCode = failed ? 1 : 0;
  } else if (cmd === 'reset') {
    const main = mainRepoRoot();
    const v = validateRole(roleArg);
    if (!v.ok) { console.error(`⛔ ${v.reason}`); process.exit(1); }
    const wt = workplaceFor(main, roleArg);
    const branch = branchFor(roleArg);
    const r = performReset({ main, wt, branch, force: process.argv.includes('--force') });
    if (!r.ok) {
      console.error(`⛔ ${roleArg}: ${r.reason}`);
      if (r.ahead) {
        for (const t of r.titles) console.error(`   ${t}`);
        console.error(`   Два выхода: смержить работу в main — либо сбросить осознанно: node tools/team-workplaces.mjs reset ${roleArg} --force`);
        console.error(`   (с --force инструмент сперва поставит спасательную ветку на нынешнюю голову ${branch})`);
      }
      process.exit(1);
    }
    if (r.rescue) console.log(`🛟 ${roleArg}: спасательная ветка ${r.rescue} держит ${r.ahead} невлитых коммита(ов) — reflog истекает, ветка нет`);
    console.log(`✅ ${roleArg}: ветка ${branch} перезапущена от текущего main (${r.head})`);
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
    console.log('команды: create <роль>|--all · list · relocate · reset <роль> · remove <роль> [--force] · --selftest');
    process.exit(cmd ? 1 : 0);
  }
}

if (ЗАПУЩЕН_НАПРЯМУЮ) выполнить();

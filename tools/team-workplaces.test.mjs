/**
 * ЮНИТ ПРЕДОХРАНИТЕЛЯ `reset` РАБОЧЕГО МЕСТА (`tools/team-workplaces.mjs`, `bugs/168`).
 *
 * Повод: ночь 2026-08-22 — сброс «списком по всем ролям» увёз ветку Дизайнера на `main` с
 * четырьмя невлитыми коммитами, и снаружи опасная ветка ничем не отличалась от безопасных.
 * Лечение — `performReset`: счёт своих коммитов ДО сброса, отказ без `--force`, спасательная
 * ветка с `--force`. Здесь критерии приёмки документа К1–К3 гоняются на ВРЕМЕННОМ репозитории
 * (mkdtemp → `git init` → worktree с N своими коммитами): живые рабочие места ролей мутациями
 * не трогаются никогда — ровно тот инцидент, ради которого предохранитель написан.
 *
 * К4 (мутация): снять проверку `ahead > 0 && !force` в `resetDecision` — К1 краснеет адресно
 * («ветка с 2 своими коммитами НЕ сброшена»), остальные остаются зелёными. Прогнано при
 * заведении, результат — в `bugs/168`.
 *
 * Прогон: node --test tools/team-workplaces.test.mjs   (или `npm run test:tools`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performReset, resetDecision, rescueBranchName } from './team-workplaces.mjs';

// Временный репозиторий не наследует ни подпись, ни хуки машины владельца — всё задано явно.
const git = (cwd, args) => execSync(
  `git -c user.name=t -c user.email=t@t -c commit.gpgsign=false -c core.autocrlf=false ${args}`,
  { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
).trim();

/** Главная копия: ветка main с одним коммитом. */
function repo() {
  const root = mkdtempSync(join(tmpdir(), 'ndim-reset-'));
  git(root, 'init -q -b main');
  writeFileSync(join(root, 'base.txt'), 'base\n');
  git(root, 'add base.txt');
  git(root, 'commit -q -m base');
  return root;
}

/** Рабочее место роли: worktree на ветке от main + `own` своих коммитов, которых в main нет. */
function workplace(root, branch, own) {
  const wt = join(root, `wt-${branch}`);
  git(root, `worktree add -q -b ${branch} "${wt}" main`);
  for (let i = 1; i <= own; i++) {
    writeFileSync(join(wt, `own-${i}.txt`), `${i}\n`);
    git(wt, `add own-${i}.txt`);
    git(wt, `commit -q -m "own ${i}"`);
  }
  return wt;
}

const head = (cwd, ref = 'HEAD') => git(cwd, `rev-parse ${ref}`);
const cleanup = (root) => { try { rmSync(root, { recursive: true, force: true, maxRetries: 3 }); } catch {} };

/* ── К1: несмерженное не уничтожается ──────────────────────────────────────────────────── */

test('К1 · ветка с 2 своими коммитами без --force: отказ, число и заголовки, голова цела', () => {
  const root = repo();
  try {
    const wt = workplace(root, 'ndim_x', 2);
    const before = head(wt);
    const r = performReset({ main: root, wt, branch: 'ndim_x', force: false });
    assert.equal(r.ok, false, 'сброс ветки с невлитой работой обязан быть отказом');
    assert.equal(r.ahead, 2);
    assert.match(r.reason, /2 своих коммита/);
    assert.equal(r.titles.length, 2, 'отказ перечисляет заголовки коммитов');
    assert.match(r.titles.join('\n'), /own 2[\s\S]*own 1/);
    assert.equal(head(wt), before, 'ветка с 2 своими коммитами НЕ сброшена');
    assert.equal(git(root, 'branch --list "*rescue*"'), '', 'без --force спасательная ветка не ставится');
  } finally { cleanup(root); }
});

/* ── К2: безопасный случай не сломан ───────────────────────────────────────────────────── */

test('К2 · влитая ветка: сброс на свежий main работает как прежде, без спасения', () => {
  const root = repo();
  try {
    const wt = workplace(root, 'ndim_y', 0);
    // main уходит вперёд — иначе сбрасывать не на что и К2 зелен на любом коде.
    writeFileSync(join(root, 'ahead.txt'), 'main\n');
    git(root, 'add ahead.txt');
    git(root, 'commit -q -m "main moves on"');
    assert.notEqual(head(wt), head(root, 'main'), 'контроль прибора: до сброса ветка отстаёт от main');
    const r = performReset({ main: root, wt, branch: 'ndim_y', force: false });
    assert.equal(r.ok, true);
    assert.equal(r.ahead, 0);
    assert.equal(r.rescue, null);
    assert.equal(head(wt), head(root, 'main'), 'после сброса ветка стоит на main');
  } finally { cleanup(root); }
});

/* ── К3: --force оставляет след ─────────────────────────────────────────────────────────── */

test('К3 · ветка с 1 своим коммитом и --force: спасательная ветка на ПРЕЖНЮЮ голову, потом сброс', () => {
  const root = repo();
  try {
    const wt = workplace(root, 'ndim_z', 1);
    const before = head(wt);
    const now = new Date(2026, 7, 22, 2, 15);
    const r = performReset({ main: root, wt, branch: 'ndim_z', force: true, now });
    assert.equal(r.ok, true);
    assert.equal(r.rescue, 'ndim_z-rescue-20260822-0215', 'имя спасения названо в результате');
    assert.equal(head(root, r.rescue), before, 'спасательная ветка держит ПРЕЖНЮЮ голову');
    assert.equal(head(wt), head(root, 'main'), 'после спасения ветка сброшена на main');
  } finally { cleanup(root); }
});

/* ── Прежний отказ грязному дереву не потерян ───────────────────────────────────────────── */

test('грязное дерево: отказ ДО счёта коммитов, ничего не тронуто', () => {
  const root = repo();
  try {
    const wt = workplace(root, 'ndim_d', 0);
    writeFileSync(join(wt, 'draft.txt'), 'незакоммиченное\n');
    const before = head(wt);
    const r = performReset({ main: root, wt, branch: 'ndim_d', force: true });
    assert.equal(r.ok, false);
    assert.match(r.reason, /дерево грязное/);
    assert.equal(head(wt), before);
  } finally { cleanup(root); }
});

/* ── Чистые функции — те же случаи, что в --selftest, чтобы юнит не зависел от него ────── */

test('resetDecision · rescueBranchName: форма решения и имени', () => {
  assert.equal(resetDecision({ ahead: 3, force: false }).ok, false);
  assert.deepEqual(resetDecision({ ahead: 3, force: true }), { ok: true, rescue: true });
  assert.deepEqual(resetDecision({ ahead: 0, force: false }), { ok: true, rescue: false });
  assert.equal(rescueBranchName('ndim_qa', new Date(2026, 0, 5, 9, 7)), 'ndim_qa-rescue-20260105-0907');
});

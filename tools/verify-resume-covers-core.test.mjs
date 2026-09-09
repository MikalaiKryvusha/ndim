/**
 * ЮНИТ СТРАЖА ВХОДА В СЕССИЮ — доказательство, что его самотест ИСПОЛНЯЕТСЯ.
 *
 * Заведён вместе со стражем, а не «потом»: перепись самотестов проекта показала замером, что
 * самотест реально исполняется у 8 приборов из 31, и у шести пара ЕСТЬ, а самотест всё равно
 * мёртв. Пара, которая только запускает файл, — форма; пара, которая требует красного на
 * мутации, — доказательство.
 *
 * 🔑 Разговор со стражем идёт ТОЛЬКО через дочерний процесс: у него предохранитель зовёт
 * `process.exit()`, а он убил бы сам прогон, и вердикт читался бы как «тесты не запускались».
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TOOL = 'tools/verify-resume-covers-core.mjs';
const run = (args = []) => spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' });

test('самотест стража ИСПОЛНЯЕТСЯ и зелен', () => {
  const r = run(['--selftest']);
  assert.equal(r.status, 0, `самотест красный:\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /САМОТЕСТ ЧИСТ: случаев \d+/, 'самотест не напечатал число случаев — он не отработал');
});

test('на живом дереве страж зелен и называет ОБА числа', () => {
  const r = run();
  assert.equal(r.status, 0, `страж красный на стволе:\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /ядро перечитывания: \d+ · открывает \/resume: \d+/);
});

test('МУТАЦИЯ: документ ядра выпал из списка — страж краснеет и называет его', () => {
  /*
   * Мутация ставится на КОПИИ дерева, а не на живом файле: юнит, правящий рабочее дерево,
   * ломает соседние прогоны и оставляет след при падении.
   */
  const dir = mkdtempSync(join(tmpdir(), 'ndim-resume-guard-'));
  try {
    mkdirSync(join(dir, '.claude/skills/resume'), { recursive: true });
    writeFileSync(
      join(dir, 'AGENT_GUIDE.md'),
      'ядро перечитывания. Набор: `GOAL.md` · `TESTING_FRAMEWORK.md`. Главные документы ссылаются дальше.',
    );
    writeFileSync(join(dir, '.claude/skills/resume/SKILL.md'), '## Шаг 1. Читай\n\n- `GOAL.md` — видение\n\n## Шаг 2.\n');
    const r = run(['--root', dir]);
    assert.equal(r.status, 1, 'страж НЕ покраснел на дереве, где методология тестирования выпала из списка');
    assert.match(r.stderr, /TESTING_FRAMEWORK\.md/, 'страж покраснел, но не назвал пропавший документ');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

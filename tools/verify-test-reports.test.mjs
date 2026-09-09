/**
 * ЮНИТ СТРАЖА ОТЧЁТОВ ПО ПРОГОНАМ — доказательство, что его самотест ИСПОЛНЯЕТСЯ и что страж
 * умеет краснеть на настоящем нарушении, а не только на фикстуре внутри себя.
 *
 * 🔑 Со стражем разговариваем ТОЛЬКО дочерним процессом: его предохранитель зовёт
 * `process.exit()`, который убил бы сам прогон.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TOOL = 'tools/verify-test-reports.mjs';
const run = (args = []) => spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' });

const FULL = [
  '# Отчёт',
  '## Карточка прогона',
  '- **Работа:** проба',
  '- **Контур:** стенд',
  '- **Прогонов:** 1 — 12:00',
  '- **Проверок:** 3 · пройдено 3',
  '- **Найдено:** ноль',
  '- **Следы:** ничего не оставлено',
  '- **Вердикт:** годится',
  '',
].join('\n');

/** Дерево-копия с каталогом отчётов; возвращает путь, который сам тест и убирает. */
function tree(reportBody, indexBody) {
  const dir = mkdtempSync(join(tmpdir(), 'ndim-reports-guard-'));
  mkdirSync(join(dir, 'qa/reports'), { recursive: true });
  writeFileSync(join(dir, 'qa/reports/2026-01-01_proba.md'), reportBody);
  writeFileSync(join(dir, 'qa/reports/README.md'), indexBody);
  return dir;
}

test('самотест стража ИСПОЛНЯЕТСЯ и зелен', () => {
  const r = run(['--selftest']);
  assert.equal(r.status, 0, `самотест красный:\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /САМОТЕСТ ЧИСТ: случаев \d+/);
});

test('на живом дереве страж зелен', () => {
  const r = run();
  assert.equal(r.status, 0, `страж красный на стволе:\n${r.stdout}${r.stderr}`);
});

test('полная карточка и полный реестр — зелено (контроль прибора)', () => {
  const dir = tree(FULL, 'реестр: [x](2026-01-01_proba.md)');
  try {
    assert.equal(run(['--root', dir]).status, 0, 'страж краснеет на исправном дереве — он бы краснел всегда');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('МУТАЦИЯ: из отчёта убрано поле «Найдено» — страж краснеет и называет поле', () => {
  const dir = tree(FULL.replace('- **Найдено:** ноль\n', ''), 'реестр: [x](2026-01-01_proba.md)');
  try {
    const r = run(['--root', dir]);
    assert.equal(r.status, 1, 'отчёт без раздела «Найдено» прошёл — страж слеп');
    assert.match(r.stderr, /Найдено/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('МУТАЦИЯ: отчёт есть, а реестр его не называет — страж краснеет', () => {
  const dir = tree(FULL, 'реестр пуст');
  try {
    const r = run(['--root', dir]);
    assert.equal(r.status, 1, 'отчёт вне реестра прошёл — пара не стережётся');
    assert.match(r.stderr, /не называет отчёты/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

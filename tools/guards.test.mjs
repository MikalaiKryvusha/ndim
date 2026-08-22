/**
 * ЮНИТЫ ВОРОТ СДАЧИ — перепись неотслеживаемых (`tools/guards.mjs`).
 *
 * 🔴 ЧТО ИМЕННО ЗДЕСЬ СТЕРЕЖЁТСЯ, И ПОЧЕМУ ЭТО НЕ ФОРМАЛЬНОСТЬ. Ворота судят РЕПОЗИТОРИЙ
 * (`git ls-files`), а рабочее дерево бывает шире него: новый файл до `git add` для стражей не
 * существует. Раньше об этом стояла проза в шапке — и проза не работала, потому что её надо
 * помнить в ту минуту, когда некогда (`EXP-0194`: страж вне ворот не помогает). Теперь ворота
 * кричат сами и отказываются выдавать зелёное. Юниты держат три вещи, каждая из которых уже
 * ломалась в проекте на других приборах:
 *   1. **флаг `--exclude-standard`** — без него перепись считает `node_modules` и `build`
 *      (замер на этом дереве: 63 777 против 0). Крик, стоящий всегда, умирает за один прогон;
 *   2. **разбор вывода** — CRLF (`core.autocrlf=true`) и хвостовая пустая строка. Ровно этот
 *      капкан уже оплачен в страже бренд-имени: `split('\n')` оставлял `\r` в конце строки;
 *   3. **текст отказа** — он обязан назвать ЧИСЛО, ИМЕНА и ЛЕЧЕНИЕ. Отказ без лечения читается
 *      как шум и обходится, а не исполняется.
 *
 * 🔑 И четвёртое, молчаливое: сам факт, что этот файл импортирует `guards.mjs` и при этом НЕ
 * поднимает ворота, доказывает предохранитель точки входа. Сломается он — юниты уйдут в
 * рекурсию через `--test tools/*.test.mjs` и это будет видно сразу, а не однажды.
 *
 * Прогон: node --test tools/guards.test.mjs   ·   npm run test:tools   ·   npm run guards
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import { UNTRACKED_ARGV, UNTRACKED_SHOWN, untrackedCry, untrackedFrom } from './guards.mjs';

test('перепись зовётся с --exclude-standard: без него в неё попадают node_modules и build', () => {
  assert.deepEqual([...UNTRACKED_ARGV], ['ls-files', '--others', '--exclude-standard']);
});

test('чистое дерево не кричит: пустой вывод git даёт пустой список и пустой крик', () => {
  assert.deepEqual(untrackedFrom(''), []);
  assert.deepEqual(untrackedFrom('\n'), []);
  assert.deepEqual(untrackedCry([]), []);
});

test('разбор переживает CRLF и хвостовую пустую строку', () => {
  // Именно так вывод выглядит на этой машине: `core.autocrlf=true` плюс перевод строки в конце.
  assert.deepEqual(untrackedFrom('plans/NEW_a.md\r\ntools/b.mjs\r\n'), ['plans/NEW_a.md', 'tools/b.mjs']);
  assert.deepEqual(untrackedFrom('plans/NEW_a.md\ntools/b.mjs\n'), ['plans/NEW_a.md', 'tools/b.mjs']);
});

test('крик называет ЧИСЛО, ВСЕ имена (пока их немного) и ЛЕЧЕНИЕ', () => {
  const cry = untrackedCry(['plans/NEW_a.md', 'tools/b.mjs']).join('\n');
  assert.match(cry, /НЕОТСЛЕЖИВАЕМЫХ ФАЙЛОВ: 2/);
  assert.match(cry, /plans\/NEW_a\.md/);
  assert.match(cry, /tools\/b\.mjs/);
  assert.match(cry, /git add/, 'отказ без лечения читается как шум и обходится');
  assert.doesNotMatch(cry, /и ещё/, 'два файла обрезать нечего');
});

test('длинный список обрезается, и остаток НАЗЫВАЕТСЯ числом, а не молчит', () => {
  const files = Array.from({ length: UNTRACKED_SHOWN + 5 }, (_, i) => `tools/f${i}.mjs`);
  const cry = untrackedCry(files);
  const named = cry.filter((line) => /^ {3}· tools\/f\d+\.mjs$/.test(line));
  assert.equal(named.length, UNTRACKED_SHOWN);
  assert.equal(cry.join('\n').includes(`…и ещё 5`), true);
  // Число в шапке — ПОЛНОЕ, а не показанное: обрезка касается печати, а не учёта.
  assert.match(cry[0], new RegExp(`НЕОТСЛЕЖИВАЕМЫХ ФАЙЛОВ: ${UNTRACKED_SHOWN + 5}`));
});

test('🔴 ЖИВАЯ ПРОВЕРКА: перепись этого репозитория идёт и не тащит игнорируемое', () => {
  // Не «мок правильной формы», а настоящий git на настоящем дереве: флаг обязан работать здесь,
  // а не только в теории. Дешёво — на чистом дереве вывод пуст.
  const out = execFileSync('git', [...UNTRACKED_ARGV], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const files = untrackedFrom(out);
  assert.equal(Array.isArray(files), true);
  const ignored = files.filter((f) => /^(node_modules|build|\.svelte-kit|test-results)\//.test(f));
  assert.deepEqual(ignored, [], 'игнорируемое просочилось в перепись — проверь --exclude-standard');
});

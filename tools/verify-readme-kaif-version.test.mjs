/**
 * ЮНИТЫ СТРАЖА ПАРЫ «МАРКЕР KAIF ↔ ВИТРИНА README» (`tools/verify-readme-kaif-version.mjs`).
 *
 * 🔴 ГЛАВНОЕ ЗДЕСЬ — НЕ АРИФМЕТИКА, А ТО, ЧТО САМОТЕСТ СТРАЖА КТО-ТО ЗОВЁТ. Прибор, чей
 * `--selftest` не вызывается ни из одних ворот, стережёт ровно до первой правки, после которой
 * никто не заметил, что он ослеп (`tools/census-selftest-coverage.mjs`, группа А; `EXP-0194`:
 * «страж, не стоящий ни в одних воротах, не защищает — он ЖДЁТ, пока о нём вспомнят»). Этот
 * файл — та самая пара: он поднимает самотест ДОЧЕРНИМ ПРОЦЕССОМ, потому что именно так его
 * запускает человек, и требует зелёного кода возврата.
 *
 * Вторая половина файла проверяет то, ради чего страж написан, — что он КРАСНЕЕТ на настоящем
 * дрейфе. Дрейф берётся не из головы: юнит собирает README, у которого английская половина
 * отстала на версию, ровно как это было в бою 2026-09-04 (`bugs/KAIF/06`, issue #44 истока).
 *
 * Прогон: node --test tools/verify-readme-kaif-version.test.mjs   ·   npm run test:tools
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const СТРАЖ = 'tools/verify-readme-kaif-version.mjs';

/** Поднять стража в отдельном каталоге-песочнице (у него пути относительные — значит, cwd решает). */
function прогон(cwd, args = []) {
  const r = spawnSync(process.execPath, [join(process.cwd(), СТРАЖ), ...args], {
    cwd,
    encoding: 'utf8',
  });
  return { код: r.status, вывод: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Песочница = копия README и маркера боевого дерева, чтобы дрейф собирался из НАСТОЯЩЕГО текста. */
function песочница() {
  const dir = mkdtempSync(join(tmpdir(), 'readme-kaif-'));
  mkdirSync(join(dir, '.kaif'));
  cpSync('README.md', join(dir, 'README.md'));
  cpSync('.kaif/kaif.json', join(dir, '.kaif/kaif.json'));
  return dir;
}

test('САМОТЕСТ стража зовётся отсюда и обязан быть зелёным — иначе прибор ослеп молча', () => {
  const { код, вывод } = прогон(process.cwd(), ['--selftest']);
  assert.equal(код, 0, `самотест упал:\n${вывод}`);
  assert.match(вывод, /самотест стража пары/u, 'самотест обязан объявлять себя, а не молчать зелёным');
  // Мутации всех трёх мест обязаны быть в отчёте — самотест, проверяющий одно место, не пара.
  for (const место of ['бейдж', 'русская половина', 'английская половина']) {
    assert.match(вывод, new RegExp(`мутация места «${место}»`, 'u'), `самотест не мутирует место «${место}»`);
  }
});

test('на боевом дереве страж зелёный: три места README называют версию маркера', () => {
  const { код, вывод } = прогон(process.cwd());
  assert.equal(код, 0, `страж красен на боевом дереве:\n${вывод}`);
  const версия = JSON.parse(readFileSync('.kaif/kaif.json', 'utf8')).version;
  assert.match(вывод, new RegExp(`называют ${версия.replace('.', '\\.')}`, 'u'));
});

test('НАСТОЯЩИЙ дрейф из боя: английская половина отстала — страж краснеет и называет её', () => {
  const dir = песочница();
  try {
    const readme = readFileSync(join(dir, 'README.md'), 'utf8');
    // Ровно тот дрейф, что жил в бою три интервала: en-половина на старой версии.
    const сломанный = readme.replace(
      /(the version deployed here is\s*\n?\*\*)(\d+\.\d+)/u,
      (_, до) => `${до}2.2`,
    );
    assert.notEqual(сломанный, readme, 'мутация не сработала — регэксп места разошёлся с текстом');
    writeFileSync(join(dir, 'README.md'), сломанный);

    const { код, вывод } = прогон(dir);
    assert.equal(код, 1, 'страж обязан краснеть на дрейфе — зелёный здесь и есть тот дефект');
    assert.match(вывод, /английская половина/u, 'краснеть мало: страж обязан НАЗВАТЬ разошедшееся место');
    assert.doesNotMatch(вывод, /место «бейдж» называет/u, 'ложная тревога по бейджу — он не тронут');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('пропавшее место краснит, а не молчит: перепись README не должна ослеплять стража', () => {
  const dir = песочница();
  try {
    const readme = readFileSync(join(dir, 'README.md'), 'utf8');
    writeFileSync(join(dir, 'README.md'), readme.replace(/Framework-KAIF%20\d+\.\d+-/u, 'Framework-KAIF-'));
    const { код, вывод } = прогон(dir);
    assert.equal(код, 1);
    assert.match(вывод, /не найдено/u, 'исчезнувшее место обязано быть претензией, а не тишиной');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

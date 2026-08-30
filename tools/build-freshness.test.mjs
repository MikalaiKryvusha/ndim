/**
 * ЮНИТ КОНТРОЛЯ СВЕЖЕСТИ СБОРКИ — `tools/lib/build-freshness.mjs`.
 *
 * Прогон: node --test tools/build-freshness.test.mjs   ·   npm run test:tools
 *
 * 🔴 ПОЧЕМУ ФИКСТУРА СИНТЕТИЧЕСКАЯ, И ЭТО НАЗВАНО, А НЕ СПРЯТАНО. Предмет проверки — ОТНОШЕНИЕ
 * ДВУХ МОМЕНТОВ ВРЕМЕНИ, и на живом дереве им нельзя управлять: чтобы получить «устарело», надо
 * ждать или трогать чужие файлы, а чтобы получить «свежо» — гонять минутную сборку внутри юнита.
 * Здесь материал СТРОИТСЯ тремя строками выше проверки, поэтому адресацией промахнуться не во
 * что, и дробь по правилу 10 не нужна (`TESTING_FRAMEWORK.md`, границы правила).
 *
 * ⚠️ Живая двусторонняя проверка при этом БЫЛА, и её результат стоит здесь как улика, потому что
 * синтетика её не заменяет: на дереве dev-1 2026-08-30 контроль сказал «СБОРКА УСТАРЕЛА: 13:32
 * против исходника 14:05» сразу после мержа ствола — то есть поймал настоящую несвежесть, никем
 * не подстроенную; после `npm run build` тот же вызов сказал «сборка не старше исходников».
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildFreshness, buildProvenance, freshnessLine, newestIn } from './lib/build-freshness.mjs';
import { метка } from './stamp-build.mjs';

/** Пара деревьев с УПРАВЛЯЕМЫМ временем: секунды задаются, а не выпрашиваются у планировщика. */
function пара({ srcSec, buildSec, srcFiles = ['a.ts'], buildFiles = ['index.html'] }) {
  const root = mkdtempSync(join(tmpdir(), 'ndim-fresh-'));
  const src = join(root, 'src');
  const build = join(root, 'build');
  mkdirSync(src, { recursive: true });
  mkdirSync(build, { recursive: true });
  for (const f of srcFiles) {
    writeFileSync(join(src, f), 'x');
    utimesSync(join(src, f), srcSec, srcSec);
  }
  for (const f of buildFiles) {
    writeFileSync(join(build, f), 'y');
    utimesSync(join(build, f), buildSec, buildSec);
  }
  return { root, src, build, снести: () => rmSync(root, { recursive: true, force: true }) };
}

const T = 1_700_000_000; // произвольная опора; важны только РАЗНОСТИ

test('🔴 сборка СТАРШЕ исходника — контроль краснеет и НАЗЫВАЕТ виновный файл', () => {
  const p = пара({ srcSec: T + 100, buildSec: T });
  try {
    const f = buildFreshness({ src: p.src, build: p.build });
    assert.equal(f.fresh, false);
    assert.match(f.why, /СБОРКА УСТАРЕЛА/);
    // Имя файла обязательно: «устарела» без адреса заставляет искать причину руками.
    assert.match(f.why, /a\.ts/);
  } finally {
    p.снести();
  }
});

test('сборка НОВЕЕ исходника — контроль молчит', () => {
  const p = пара({ srcSec: T, buildSec: T + 100 });
  try {
    const f = buildFreshness({ src: p.src, build: p.build });
    assert.equal(f.fresh, true);
    assert.match(f.why, /не старше/);
  } finally {
    p.снести();
  }
});

test('🔴 РАВНОЕ время — свежо: сборка не может быть СТРОГО новее файла, из которого собрана', () => {
  // Граница названа тестом, а не памятью. Строгое `>` дало бы ложное красное на дереве, где
  // сборка и правка попали в одну секунду, — а это штатный случай быстрой машины.
  const p = пара({ srcSec: T, buildSec: T });
  try {
    assert.equal(buildFreshness({ src: p.src, build: p.build }).fresh, true);
  } finally {
    p.снести();
  }
});

test('🔴 сборки НЕТ — это не «свежо», а отдельный ответ со своим лечением', () => {
  const p = пара({ srcSec: T, buildSec: T });
  try {
    rmSync(p.build, { recursive: true, force: true });
    const f = buildFreshness({ src: p.src, build: p.build });
    assert.equal(f.fresh, false);
    assert.match(f.why, /нет или он пуст/);
    assert.match(f.why, /npm run build/);
  } finally {
    p.снести();
  }
});

test('🔴 ИСХОДНИКОВ НЕТ — «мерить нечем» НЕ красится зелёным', () => {
  /*
   * Ловушка, ради которой этот случай существует отдельно: при пустом `src` сравнение «сборка
   * не старше исходников» истинно ПО ПОСТРОЕНИЮ, и наивная реализация вернула бы «свежо» на
   * дереве, где мерить было нечего. Это ровно вопрос 3 лестницы трёх вопросов — прибор достал
   * материал вообще?
   */
  const p = пара({ srcSec: T, buildSec: T + 100 });
  try {
    rmSync(p.src, { recursive: true, force: true });
    const f = buildFreshness({ src: p.src, build: p.build });
    assert.equal(f.fresh, false);
    assert.match(f.why, /мерить нечем/);
  } finally {
    p.снести();
  }
});

test('строка отчёта несёт ОБА размера корпуса — ноль осмотренных не читается как здоровье', () => {
  const p = пара({ srcSec: T, buildSec: T + 100, srcFiles: ['a.ts', 'b.ts'] });
  try {
    const line = freshnessLine(buildFreshness({ src: p.src, build: p.build }));
    assert.match(line, /осмотрено src 2 · build 1/);
  } finally {
    p.снести();
  }
});

test('обход НЕ спускается в node_modules и .svelte-kit — иначе меряет чужое время', () => {
  const p = пара({ srcSec: T, buildSec: T + 100 });
  try {
    const nm = join(p.src, 'node_modules');
    mkdirSync(nm, { recursive: true });
    writeFileSync(join(nm, 'huge.js'), 'z');
    utimesSync(join(nm, 'huge.js'), T + 9999, T + 9999); // новее всего на свете
    const f = buildFreshness({ src: p.src, build: p.build });
    assert.equal(f.fresh, true, 'зависимость, обновлённая npm, не делает сборку устаревшей');
    assert.equal(f.srcCount, 1);
  } finally {
    p.снести();
  }
});

test('пустого дерева не бывает «самым свежим» — newestIn отдаёт null, а не ноль', () => {
  const p = пара({ srcSec: T, buildSec: T });
  try {
    rmSync(p.build, { recursive: true, force: true });
    assert.equal(newestIn(p.build), null);
  } finally {
    p.снести();
  }
});

/* ── ВТОРОЙ ВОПРОС: собрана ли сборка из ЭТОГО дерева ──────────────────────────────────────────
 *
 * Время отвечает на «не устарела ли». Переключили ветку, откатили правку, сделали `amend` — и
 * сборка МОЛОЖЕ исходников, но чужая. Эти случаи закрывает метка `build/build-stamp.json`.
 *
 * 🔴 Граница была названа при сдаче контроля свежести и НЕ выдана тогда за закрытую; здесь она
 * закрывается, и юнит стоит рядом с тем, чей остаток он доделывает.
 */

/** Дерево `build/` с готовой меткой — содержимое задаётся, а не выпрашивается у git. */
function сМеткой(содержимое) {
  const root = mkdtempSync(join(tmpdir(), 'ndim-prov-'));
  const build = join(root, 'build');
  mkdirSync(build, { recursive: true });
  if (содержимое !== null) {
    // Строка кладётся СЫРОЙ: `JSON.stringify('{ это не json')` даёт ВАЛИДНЫЙ json-строку,
    // и фикстура проверяла бы не то. Поймано падением этого же теста.
    const текст = typeof содержимое === 'string' ? содержимое : JSON.stringify(содержимое);
    writeFileSync(join(build, 'build-stamp.json'), текст, 'utf8');
  }
  return { build, снести: () => rmSync(root, { recursive: true, force: true }) };
}

const SHA = 'a'.repeat(40);
const ДРУГОЙ = 'b'.repeat(40);

test('метка совпала с HEAD — сборка СВОЯ', () => {
  const p = сМеткой({ sha: SHA, dirty: false });
  try {
    const r = buildProvenance({ build: p.build, head: SHA });
    assert.equal(r.статус, 'своя');
  } finally {
    p.снести();
  }
});

test('🔴 метка НЕ совпала — сборка ЧУЖАЯ, и обе стороны названы', () => {
  const p = сМеткой({ sha: ДРУГОЙ, dirty: false });
  try {
    const r = buildProvenance({ build: p.build, head: SHA });
    assert.equal(r.статус, 'чужая');
    // Оба sha в самой формулировке — правило «утверждение о ПАРЕ несёт оба sha».
    assert.match(r.why, /bbbbbbb/);
    assert.match(r.why, /aaaaaaa/);
  } finally {
    p.снести();
  }
});

test('🔴 ГРЯЗНОЕ дерево сильнее совпадения sha: код был, а коммита у него нет', () => {
  // Ловушка: `sha` совпадает, и наивная проверка сказала бы «своя». Но в артефакте лежал код,
  // которого нет ни в одном коммите, — значит метка его НЕ ОПИСЫВАЕТ.
  const p = сМеткой({ sha: SHA, dirty: true });
  try {
    const r = buildProvenance({ build: p.build, head: SHA });
    assert.equal(r.статус, 'грязная');
    assert.notEqual(r.статус, 'своя');
  } finally {
    p.снести();
  }
});

test('🔴 МЕТКИ НЕТ — это третий ответ, а не «своя» и не «чужая»', () => {
  /*
   * Ни зелёного, ни красного: сборка могла приехать из контура без git (архив, CI без истории).
   * Объявить её чужой — ложное обвинение; объявить своей — ложный зелёный. Третий ответ честнее
   * обоих, и он ЕСТЬ в перечне статусов, а не выражен отсутствием.
   */
  const p = сМеткой(null);
  try {
    const r = buildProvenance({ build: p.build, head: SHA });
    assert.equal(r.статус, 'нет метки');
    assert.match(r.why, /сказать НЕЧЕМ/);
  } finally {
    p.снести();
  }
});

test('битая метка читается как «нет метки», а не роняет прибор', () => {
  const p = сМеткой('{ это не json');
  try {
    const r = buildProvenance({ build: p.build, head: SHA });
    assert.equal(r.статус, 'нет метки');
  } finally {
    p.снести();
  }
});

test('git молчит — сверять не с чем, и это тоже отдельный ответ', () => {
  const p = сМеткой({ sha: SHA, dirty: false });
  try {
    assert.equal(buildProvenance({ build: p.build, head: '' }).статус, 'git молчит');
  } finally {
    p.снести();
  }
});

/* ── Сама метка ──────────────────────────────────────────────────────────────────────────── */

test('🔴 метка несёт sha, признак грязного дерева и момент — все три, а не два', () => {
  // Каждое поле отвечает на свой вопрос, и потеря любого делает метку неполной молча:
  // sha — «какое дерево», dirty — «описывает ли оно артефакт», builtAt — «когда».
  const m = метка(new Date('2026-08-30T12:00:00Z'));
  assert.equal(m.builtAt, '2026-08-30T12:00:00.000Z');
  assert.ok(typeof m.sha === 'string' || m.sha === null);
  assert.ok(typeof m.dirty === 'boolean' || m.dirty === null);
  assert.ok(Number.isInteger(m.buildNumber));
});

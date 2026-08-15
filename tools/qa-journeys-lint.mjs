#!/usr/bin/env node
/**
 * Страж КАРТЫ ПУТЕЙ ЧЕЛОВЕКА — `qa/JOURNEYS.md` (фаза 0 эпика `plans/54`, план `plans/55`).
 *
 * Зачем он нужен уже в фазе 0, а не в фазе 1. Карта — ИСТОЧНИК, из которого разметка `@covers`
 * читает идентификаторы. Дубль номера, опечатка в области или путь, потерявший поле, превращаются
 * в путь, который нельзя покрыть, — и обнаружится это через месяц, когда `verify-qa-coverage`
 * тихо не сойдётся ни с чем. Дешевле сторожить источник.
 *
 * Что судит (критерии Ф0.1…Ф0.5 плана `plans/55`):
 *   1. ФОРМА СТРОКИ — у каждого пути есть все четыре поля: уровень, группа, описание, где живёт.
 *   2. ИДЕНТИФИКАТОРЫ — формат `NDIM-<ОБЛАСТЬ>-<NNN>`, ни одного дубля, область строки совпадает
 *      с областью её раздела (перепутанная область — самый тихий способ потерять путь).
 *   3. СЛОВАРЬ — уровень из {Smoke, CP, Ext}, группа из {позитив, негатив}.
 *   4. ПОТОЛОК SMOKE — не больше 15 путей: Smoke, вылезший из десяти минут, перестаёт гоняться
 *      на каждую сборку, то есть перестаёт быть Smoke (К3 эпика).
 *   5. ПАРА «ИСТИНА ↔ ЗЕРКАЛО» — сводная таблица «Области и счёт путей» пересчитывается ПО СТРОКАМ
 *      и обязана сойтись с ними до единицы. Сводка, которую правят руками, разъезжается за месяц.
 *   6. ПОКРЫТИЕ ПОВЕРХНОСТЕЙ — каждый маршрут продукта (`src/routes/`) назван хотя бы одним путём
 *      либо объявлен в разделе границ. Это и есть ворота выхода фазы 0: «карта покрывает все пять
 *      экранов приложения, публичные страницы и админ-панель».
 *
 * ЧЕГО НЕ СУДИТ намеренно: качество формулировки пути и правильность расстановки уровней. Это
 * оценочные суждения, и их приёмка — владелец, а не машина.
 *
 * Запуск: node tools/qa-journeys-lint.mjs [--quiet]
 * Код выхода 0 — карта здорова; ненулевой — есть нарушения.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const MAP = join(ROOT, 'qa', 'JOURNEYS.md');
const ROUTES = join(ROOT, 'src', 'routes');

const LEVELS = new Set(['Smoke', 'CP', 'Ext']);
const GROUPS = new Set(['позитив', 'негатив']);
/** Потолок Smoke — критерий Ф0.5. Не «пока столько», а граница. */
const SMOKE_CAP = 15;

const quiet = process.argv.includes('--quiet');
const problems = [];
const fail = (what) => problems.push(what);

/* ─────────────────────────── 1. Читаем карту ─────────────────────────── */

const text = readFileSync(MAP, 'utf8');
const lines = text.split(/\r?\n/);

/** Раздел области: `## \`AREA\` — заголовок`. */
const AREA_HEADING = /^##\s+`([A-Z]+)`/u;
/** Строка пути: `| NDIM-AREA-001 | описание | уровень | группа | где живёт |`. */
const ROW = /^\|\s*(NDIM-[A-Z]+-\d+)\s*\|(.+)$/u;

const paths = [];
let area = null;

for (let i = 0; i < lines.length; i++) {
  const heading = AREA_HEADING.exec(lines[i]);
  if (heading) {
    area = heading[1];
    continue;
  }
  const row = ROW.exec(lines[i]);
  if (!row) continue;

  const id = row[1];
  const cells = row[2].split('|').map((c) => c.trim());
  // Хвостовая пустая ячейка от закрывающей палки — её в счёт полей не берём.
  while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();

  const [what = '', level = '', group = '', where = ''] = cells;
  const entry = { id, area, what, level, group, where, line: i + 1 };
  paths.push(entry);

  if (cells.length !== 4) {
    fail(`строка ${i + 1}: у пути ${id} полей ${cells.length}, а должно быть 4 (описание · уровень · группа · где живёт)`);
    continue;
  }
  if (!what) fail(`строка ${i + 1}: у пути ${id} пустое описание`);
  if (!where) fail(`строка ${i + 1}: у пути ${id} не сказано, где он живёт в продукте`);
  if (!LEVELS.has(level)) fail(`строка ${i + 1}: у пути ${id} уровень «${level}» — вне словаря {Smoke, CP, Ext}`);
  if (!GROUPS.has(group)) fail(`строка ${i + 1}: у пути ${id} группа «${group}» — вне словаря {позитив, негатив}`);

  const idArea = id.split('-')[1];
  if (area === null) fail(`строка ${i + 1}: путь ${id} стоит вне раздела области`);
  else if (idArea !== area) fail(`строка ${i + 1}: путь ${id} лежит в разделе \`${area}\` — область в номере и область раздела разошлись`);
}

if (paths.length === 0) fail('в карте не найдено ни одного пути — разбор сломан или файл пуст');

/* ─────────────────── 2. Дубли идентификаторов ─────────────────── */

const seen = new Map();
for (const p of paths) {
  if (seen.has(p.id)) fail(`путь ${p.id} объявлен дважды: строки ${seen.get(p.id)} и ${p.line}`);
  else seen.set(p.id, p.line);
}

/* ─────────────────── 3. Счёт: истина по строкам ─────────────────── */

const byArea = new Map();
for (const p of paths) {
  const stat = byArea.get(p.area) ?? { total: 0, Smoke: 0, CP: 0, Ext: 0, позитив: 0, негатив: 0 };
  stat.total++;
  if (LEVELS.has(p.level)) stat[p.level]++;
  if (GROUPS.has(p.group)) stat[p.group]++;
  byArea.set(p.area, stat);
}

const smoke = paths.filter((p) => p.level === 'Smoke').length;
if (smoke > SMOKE_CAP) fail(`путей уровня Smoke ${smoke} при потолке ${SMOKE_CAP} — Smoke перестаёт укладываться в своё окно`);

/* ────────── 4. Пара «истина ↔ зеркало»: сводная таблица против строк ────────── */

/** Строка сводки: `| \`AREA\` | о чём | 14 | 3 | 5 | 6 |`. */
const SUMMARY = /^\|\s*`([A-Z]+)`\s*\|[^|]*\|\s*(\d+)\s*\|\s*([\d—-]+)\s*\|\s*([\d—-]+)\s*\|\s*([\d—-]+)\s*\|/u;
const num = (v) => (/^\d+$/u.test(v) ? Number(v) : 0);

let summaryRows = 0;
for (let i = 0; i < lines.length; i++) {
  const m = SUMMARY.exec(lines[i]);
  if (!m) continue;
  const [, key, total, s, cp, ext] = m;
  const stat = byArea.get(key);
  summaryRows++;
  if (!stat) {
    fail(`сводка называет область \`${key}\`, а раздела с её путями в карте нет (строка ${i + 1})`);
    continue;
  }
  const claim = { total: num(total), Smoke: num(s), CP: num(cp), Ext: num(ext) };
  for (const field of ['total', 'Smoke', 'CP', 'Ext']) {
    if (claim[field] !== stat[field]) {
      fail(`сводка расходится со строками: \`${key}\` · ${field} — заявлено ${claim[field]}, пересчитано ${stat[field]} (строка ${i + 1})`);
    }
  }
}
if (summaryRows !== byArea.size) {
  fail(`в сводке ${summaryRows} областей, а разделов с путями ${byArea.size} — таблица и карта разошлись`);
}

const TOTALS = /^\|\s*\*\*Итого\*\*\s*\|[^|]*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|/u;
const totalsLine = lines.findIndex((l) => TOTALS.test(l));
if (totalsLine < 0) {
  fail('в сводке нет строки «Итого» — числу покрытия неоткуда взяться');
} else {
  const [, all, s, cp, ext] = TOTALS.exec(lines[totalsLine]);
  const real = {
    all: paths.length,
    s: smoke,
    cp: paths.filter((p) => p.level === 'CP').length,
    ext: paths.filter((p) => p.level === 'Ext').length,
  };
  if (Number(all) !== real.all) fail(`«Итого» заявляет путей ${all}, пересчитано ${real.all} (строка ${totalsLine + 1})`);
  if (Number(s) !== real.s) fail(`«Итого» заявляет Smoke ${s}, пересчитано ${real.s}`);
  if (Number(cp) !== real.cp) fail(`«Итого» заявляет CP ${cp}, пересчитано ${real.cp}`);
  if (Number(ext) !== real.ext) fail(`«Итого» заявляет Ext ${ext}, пересчитано ${real.ext}`);
}

/* ────────── 5. Поверхности продукта: ворота выхода фазы 0 ────────── */

/**
 * Маршруты снимаются с ДЕРЕВА, а не перечисляются руками: список, набранный руками, устареет
 * ровно в тот день, когда появится новый экран, — и карта промолчит именно о нём.
 */
function surfaces(dir, prefix = '') {
  const found = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      const segment = name
        .replace(/^\[([a-z]+)=[a-z]+\]$/u, '{$1}') // [lang=lang] → {lang}
        .replace(/^\[([a-z]+)\]$/u, '{$1}'); //        [slug]      → {slug}
      found.push(...surfaces(full, `${prefix}/${segment}`));
      continue;
    }
    if (name === '+page.svelte' || name === '+server.ts') found.push(prefix === '' ? '/' : prefix);
  }
  return found;
}

const routes = [...new Set(surfaces(ROUTES))].sort();
const missing = [];
for (const route of routes) {
  if (route === '/') continue; // корень-распознаватель назван модулем, а не адресом
  // Плейсхолдер в карте позволено писать и `{lang}`, и `[lang]` — судится маршрут, а не скобка.
  const pattern = route
    .replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    .replace(/\\\{[a-z]+\\\}/gu, '(?:\\{[a-z]+\\}|\\[[a-z]+\\])');
  if (!new RegExp(pattern, 'u').test(text)) missing.push(route);
}
if (missing.length > 0) {
  fail(`маршруты продукта, о которых карта молчит (${missing.length}): ${missing.join(' · ')}`);
}

/* ─────────────────────────── Отчёт ─────────────────────────── */

if (!quiet) {
  console.log('КАРТА ПУТЕЙ ЧЕЛОВЕКА — qa/JOURNEYS.md\n');
  console.log(`Путей: ${paths.length} · областей: ${byArea.size} · маршрутов продукта: ${routes.length}\n`);
  const pad = (v, n) => String(v).padStart(n);
  console.log('  Область      Всего  Smoke     CP    Ext  позитив  негатив');
  for (const [key, stat] of [...byArea].sort()) {
    console.log(
      `  ${key.padEnd(11)}${pad(stat.total, 6)}${pad(stat.Smoke, 7)}${pad(stat.CP, 7)}${pad(stat.Ext, 7)}${pad(stat['позитив'], 9)}${pad(stat['негатив'], 9)}`,
    );
  }
  const pos = paths.filter((p) => p.group === 'позитив').length;
  console.log(
    `  ${'ИТОГО'.padEnd(11)}${pad(paths.length, 6)}${pad(smoke, 7)}${pad(paths.filter((p) => p.level === 'CP').length, 7)}${pad(paths.filter((p) => p.level === 'Ext').length, 7)}${pad(pos, 9)}${pad(paths.length - pos, 9)}\n`,
  );
}

if (problems.length > 0) {
  console.log(`НАРУШЕНИЙ: ${problems.length}\n`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  process.exit(1);
}

console.log('✅ Карта здорова: поля на месте, номера уникальны, сводка сошлась со строками,');
console.log(`   Smoke ${smoke} из ${SMOKE_CAP}, ни один маршрут продукта не остался без пути.`);

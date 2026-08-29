/**
 * ГДЕ ЭТОТ КЛАСС УЖЕ НАЗВАН В КОДЕ — прибор маршрута «шаг 2а» (`AGENT_GUIDE.md`).
 *
 * Запуск: node tools/where-cured.mjs <слова | EXP-NNNN | bugs/NNN> [--branches] · самотест: --selftest
 * Ворота: нет — это ПРИБОР, а не страж: он отвечает на вопрос, а не судит дерево.
 * Код возврата: 0 всегда, включая «нигде» — «нигде» это ответ, а не поломка.
 *
 * ═══ ЗАЧЕМ ═══
 *
 * Замер 2026-08-29 (ветка `ndim_dev3`, 0786666), из-за которого прибор и написан:
 *
 *   журнал → код: из 232 уроков поле `mechanized:` несут 14, ФАЙЛ называют 6 — это 2,6 %;
 *   код → журнал: 121 файл в `tools/` и 44 в `src/` ссылаются на `EXP-NNNN`, всего 286
 *                 упоминаний; 145 файлов ссылаются на `bugs/NNN`; разных уроков, названных
 *                 в коде, — 79 из 232 (34 %).
 *
 * 🔑 Карта существует, но написана В ОБРАТНУЮ СТОРОНУ, а канон посылал грепать журнал — то есть
 * ровно то направление, где адресов почти нет. Пять живых случаев одной смены, где это стоило
 * времени: `\b` после кириллицы (лечение стояло В ВОРОТАХ, список адресов лежал прозой в шапке
 * постороннего файла) · `close-bug.mjs` (лечение в неслитой ветке) · второй признак
 * `looksLikeList` (нашёлся чтением шапки функции) · CRLF-безопасная правка (образец писался
 * заново трижды за смену) · предохранитель «запущен или подключён».
 *
 * ═══ ПОЧЕМУ ШАПКА ВЕСИТ БОЛЬШЕ ТЕЛА ═══
 *
 * Замер того же дня: «граница слова» — 2 совпадения в шапках против 4 в телах;
 * «запустили или подключили» — 2 против 5; «CRLF» — 1 против 8. Сигнал слабый, но он сужает
 * ответ с 5–9 файлов до одного-двух: в шапке класс ОБЪЯСНЯЮТ, в теле его чаще просто применяют.
 * Поэтому шапочные совпадения печатаются первыми и со строкой шапки, а не просто списком.
 *
 * ═══ ГРАНИЦЫ, НАЗВАННЫЕ ЧЕСТНО ═══
 *
 * · 🔴 Прибор находит, где класс НАЗВАН, а не где он доказанно ВЫЛЕЧЕН. Это разные вещи, и
 *   вторую машина не знает: лечение проверяется ЧТЕНИЕМ найденного. Строка об этом стоит первой
 *   в выводе намеренно — чтобы её нельзя было не прочесть.
 * · 66 % уроков журнала в коде не упомянуты вовсе. Ответ «нигде» законен и сам по себе сигнал:
 *   у класса нет машинного лечения, оно третьего сорта (запись в журнале).
 * · Лечение БЕЗ ПРОЗЫ невидимо и останется невидимым: голая регулярка без комментария не несёт
 *   слов, по которым её найдут. Дёшево это не чинится, и прибор этого не обещает.
 * · `--branches` заглядывает в неслитые ветки, и это лечит случай `close-bug.mjs` лишь
 *   НАПОЛОВИНУ: он покажет, что лечение существует в чужой ветке, но взять его оттуда —
 *   вопрос очереди мержей, а не поиска.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const ГДЕ_ИСКАТЬ = ['tools', 'src'];
const РАСШИРЕНИЯ = new Set(['.mjs', '.js', '.ts', '.svelte']);

/* ── ЧИСТЫЕ ФУНКЦИИ ────────────────────────────────────────────────────────────
 * Всё, что решает, вынесено сюда и не касается файловой системы: самотест гоняет их на
 * синтетических случаях. Прибор без самотеста доказывает только сам себя.
 */

/**
 * Конец верхней шапки файла — позиция, после которой начинается тело.
 *
 * Форм шапки в дереве две (замер переписи приборов): блочная `/** … *\/` и строчная `//`.
 * Шебанг пропускается. Файла без верхнего комментария шапки нет вовсе — тогда 0.
 */
export function headerEnd(source) {
  const lines = String(source).split(/\r?\n/);
  let i = lines[0]?.startsWith('#!') ? 1 : 0;
  while (i < lines.length && lines[i].trim() === '') i += 1;

  if (lines[i]?.trimStart().startsWith('/*')) {
    const at = String(source).indexOf('*/');
    return at === -1 ? 0 : at + 2;
  }
  if (lines[i]?.trimStart().startsWith('//')) {
    let chars = lines.slice(0, i).join('\n').length;
    while (i < lines.length && lines[i].trimStart().startsWith('//')) {
      chars += lines[i].length + 1;
      i += 1;
    }
    return chars;
  }
  return 0;
}

/**
 * Совпадения запроса в одном файле: `{ line, text, inHeader }`.
 *
 * Регистр не важен: класс называют и «CRLF», и «crlf». Пустой запрос совпадений не даёт —
 * иначе прибор вывалил бы всё дерево и ответ перестал бы что-то значить.
 */
export function hitsIn(source, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return [];
  const end = headerEnd(source);
  const lines = String(source).split(/\r?\n/);
  const found = [];
  let offset = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].toLowerCase().includes(q)) {
      found.push({ line: i + 1, text: lines[i].trim(), inHeader: offset < end });
    }
    offset += lines[i].length + 1;
  }
  return found;
}

/**
 * Порядок ответа: сначала файлы с совпадением В ШАПКЕ, внутри группы — по числу совпадений.
 * Довод — в шапке прибора: в шапке класс объясняют, в теле применяют.
 */
export function rank(files) {
  return [...files].sort((a, b) => {
    const ah = a.hits.some((h) => h.inHeader) ? 1 : 0;
    const bh = b.hits.some((h) => h.inHeader) ? 1 : 0;
    if (ah !== bh) return bh - ah;
    if (a.hits.length !== b.hits.length) return b.hits.length - a.hits.length;
    return a.path.localeCompare(b.path);
  });
}

/* ── САМОТЕСТ ────────────────────────────────────────────────────────────────── */

const БЛОЧНАЯ = '/**\n * Класс CRLF объясняется здесь.\n */\nconst x = 1; // CRLF применяется тут\n';
const СТРОЧНАЯ = '#!/usr/bin/env node\n// Класс CRLF объясняется здесь.\nconst x = 1;\n';
const СЛУЧАИ = [
  {
    name: 'совпадение в блочной шапке помечено шапочным, в теле — нет',
    run: () => {
      const h = hitsIn(БЛОЧНАЯ, 'CRLF');
      return h.length === 2 && h[0].inHeader === true && h[1].inHeader === false;
    },
  },
  {
    name: 'шапка формы `//` за шебангом читается наравне с блочной',
    run: () => hitsIn(СТРОЧНАЯ, 'CRLF')[0]?.inHeader === true,
  },
  {
    name: 'регистр не важен — класс называют и «CRLF», и «crlf»',
    run: () => hitsIn(БЛОЧНАЯ, 'crlf').length === 2,
  },
  {
    name: '🔑 КОНТРОЛЬ: пустой запрос НЕ совпадает ни с чем (иначе прибор вывалит дерево)',
    run: () => hitsIn(БЛОЧНАЯ, '').length === 0 && hitsIn(БЛОЧНАЯ, '   ').length === 0,
  },
  {
    name: 'КОНТРОЛЬ: чего в файле нет — того нет («нигде» это ответ)',
    run: () => hitsIn(БЛОЧНАЯ, 'кириллица').length === 0,
  },
  {
    name: 'у файла без верхнего комментария шапки нет — совпадения все телесные',
    run: () => headerEnd('const x = 1; // CRLF\n') === 0 && hitsIn('const x = 1; // CRLF\n', 'CRLF')[0].inHeader === false,
  },
  {
    name: '🔴 порядок: файл с шапочным совпадением идёт ВПЕРЕДИ файла с пятью телесными',
    run: () => {
      const r = rank([
        { path: 'b.mjs', hits: [{ inHeader: false }, { inHeader: false }, { inHeader: false }, { inHeader: false }, { inHeader: false }] },
        { path: 'a.mjs', hits: [{ inHeader: true }] },
      ]);
      return r[0].path === 'a.mjs';
    },
  },
  {
    name: 'КОНТРОЛЬ: при равенстве по шапке впереди тот, у кого совпадений больше',
    run: () => {
      const r = rank([
        { path: 'a.mjs', hits: [{ inHeader: false }] },
        { path: 'b.mjs', hits: [{ inHeader: false }, { inHeader: false }] },
      ]);
      return r[0].path === 'b.mjs';
    },
  },
];

function selftest() {
  let bad = 0;
  for (const c of СЛУЧАИ) {
    let ok = false;
    try {
      ok = c.run() === true;
    } catch {
      ok = false;
    }
    console.log(`${ok ? '  ✓' : '  ✗'} ${c.name}`);
    if (!ok) bad += 1;
  }
  console.log(bad === 0 ? `\n✅ САМОТЕСТ ЧИСТ: случаев ${СЛУЧАИ.length}.` : `\n❌ САМОТЕСТ КРАСНЫЙ: ${bad} из ${СЛУЧАИ.length}.`);
  process.exit(bad === 0 ? 0 : 1);
}

/* ── РАБОЧИЙ ПРОГОН ───────────────────────────────────────────────────────────── */

function walk(dir) {
  const out = [];
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (РАСШИРЕНИЯ.has(extname(name))) out.push(path);
  }
  return out;
}

/** Неслитые ветки: где класс назван у соседей. Лечит случай `close-bug.mjs` наполовину. */
function inBranches(query) {
  let branches = [];
  try {
    branches = execFileSync('git', ['branch', '--format=%(refname:short)'], { encoding: 'utf8' })
      .split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
  const here = branches.length ? execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim() : '';
  const rows = [];
  for (const b of branches) {
    if (b === here) continue;
    try {
      const out = execFileSync('git', ['grep', '-n', '-i', '--', query, b, '--', 'tools', 'src'], { encoding: 'utf8' });
      for (const line of out.split(/\r?\n/).filter(Boolean).slice(0, 4)) rows.push({ branch: b, line });
    } catch {
      /* git grep выходит кодом 1, когда не нашёл, — это не ошибка, а ответ */
    }
  }
  return rows;
}

function run(argv) {
  const branches = argv.includes('--branches');
  const query = argv.filter((a) => !a.startsWith('--')).join(' ').trim();
  if (!query) {
    console.error('Запуск: node tools/where-cured.mjs <слова | EXP-NNNN | bugs/NNN> [--branches]');
    process.exit(2);
  }

  const files = [];
  for (const dir of ГДЕ_ИСКАТЬ) {
    for (const path of walk(dir)) {
      const hits = hitsIn(readFileSync(path, 'utf8'), query);
      if (hits.length) files.push({ path, hits });
    }
  }

  // 🔴 Первой строкой — и это не вежливость: без неё «нашёл» читается как «вылечено».
  console.log('\n⚠️  Прибор находит, где класс НАЗВАН, а не где он доказанно ВЫЛЕЧЕН.');
  console.log('   Лечение проверяй ЧТЕНИЕМ найденного.\n');
  console.log(`Запрос: «${query}» · файлов с упоминанием: ${files.length}\n`);

  if (files.length === 0) {
    console.log('НИГДЕ — и это ответ, а не поломка: у класса нет упоминания в коде.');
    console.log('Значит машинного лечения, скорее всего, нет вовсе, а урок живёт записью — третий сорт.');
  }

  for (const f of rank(files)) {
    const шапка = f.hits.filter((h) => h.inHeader);
    const тело = f.hits.filter((h) => !h.inHeader);
    console.log(`${шапка.length ? '📌 В ШАПКЕ' : '·  в теле '} ${f.path.split(sep).join('/')} — совпадений ${f.hits.length}`);
    for (const h of шапка.slice(0, 2)) console.log(`      :${h.line}  ${h.text.slice(0, 120)}`);
    if (!шапка.length) for (const h of тело.slice(0, 1)) console.log(`      :${h.line}  ${h.text.slice(0, 120)}`);
  }

  if (branches) {
    const rows = inBranches(query);
    console.log(`\n── НЕСЛИТЫЕ ВЕТКИ: строк ${rows.length} ──`);
    console.log('   ⚠️ Найденное здесь в твоём дереве НЕ ЛЕЖИТ: взять его — вопрос очереди мержей, а не поиска.');
    for (const r of rows) console.log(`   ${r.line.slice(0, 150)}`);
  }
  process.exit(0);
}

const запущенНапрямую =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (запущенНапрямую) {
  if (process.argv.includes('--selftest')) selftest();
  else run(process.argv.slice(2));
}

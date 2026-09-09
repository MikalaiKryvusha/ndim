#!/usr/bin/env node
/**
 * СТРАЖ ОТЧЁТОВ ПО ИСПОЛНЕННЫМ ПРОГОНАМ — `TESTING_FRAMEWORK.md` → «ИСПОЛНЕННЫЙ ПРОГОН
 * РОЖДАЕТ ОТЧЁТ».
 *
 * ЗАЧЕМ. 2026-09-09 владелец спросил по работе приоритета 0: сколько прогонов, сколько кейсов,
 * сколько багов, сколько учёток. Ответа не было ни в одном документе — работу проверяли двумя
 * прогонами одного прибора и подавали как готовую к бою. Его вердикт: «*из этой таблицы я вижу,
 * что ТЕСТИРОВАНИЯ НЕ БЫЛО*» · «*ТЫ ТЕСТИРОВАЛ И НЕ ПИСАЛ ПО ТЕСТИРОВАНИЮ ОТЧЁТ??????*».
 *
 * ЧТО СУДИТСЯ, и это ровно две вещи:
 *   1. ФОРМА каждого отчёта — семь обязательных полей карточки прогона. Отчёт без числа
 *      прогонов или без раздела «Найдено» не отвечает на вопрос, ради которого заведён.
 *   2. ПАРА «отчёт ↔ реестр» (`qa/reports/README.md`). Отчёт, которого нет в реестре, не
 *      находится: реестр читают первым и верят ему, а правят отдельные файлы
 *      (`AGENT_GUIDE.md` → «Реестр пар»).
 *
 * ⚠️ ГРАНИЦА, НАЗВАННАЯ ЧЕСТНО. Страж НЕ умеет доказать, что прогон, о котором не написали,
 * вообще был: ненаписанного отчёта не видит никто. Эту половину держит правило канона и вопрос
 * владельца. Объявлять здесь «правило механизировано» было бы ровно тем изъявительным о
 * несуществующей проверке, за которое проект уже платил.
 *
 * Запуск:  node tools/verify-test-reports.mjs [--selftest]
 * Ворота: `npm run guards` (запись «отчёты по прогонам: форма карточки и полнота реестра»);
 *         страж дешёвый — читает каталог отчётов, ни стенда, ни сети.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Корень судимого дерева; `--root <путь>` даёт юниту судить дерево-КОПИЮ (см. парный тест). */
const rootFlag = process.argv.indexOf('--root');
const ROOT = rootFlag === -1
  ? resolve(dirname(fileURLToPath(import.meta.url)), '..')
  : resolve(process.argv[rootFlag + 1]);
const DIR = 'qa/reports';
const INDEX = 'qa/reports/README.md';

/** Семь полей карточки прогона. Имя поля — то же слово, что в каноне и в README. */
export const FIELDS = ['Работа', 'Контур', 'Прогонов', 'Проверок', 'Найдено', 'Следы', 'Вердикт'];

/**
 * Каких полей не хватает отчёту.
 *
 * Признак поля — жирное имя в начале пункта списка: `- **Работа:**`. Судится ФОРМА, потому что
 * поле, названное в прозе, читатель не найдёт глазами, а следующая сессия не найдёт грепом.
 */
export function missingFields(text) {
  return FIELDS.filter((f) => !new RegExp(`^\\s*[-*]\\s+\\*\\*${f}:?\\*\\*`, 'm').test(text));
}

/** Пустое поле — это отсутствующее поле, названное вслух. Ловим заголовок без содержания. */
export function emptyFields(text) {
  return FIELDS.filter((f) => {
    const m = text.match(new RegExp(`^\\s*[-*]\\s+\\*\\*${f}:?\\*\\*(.*)$`, 'm'));
    return m !== null && m[1].replace(/[\s—·:.]/g, '').length === 0;
  });
}

/** Вердикт по одному отчёту. */
export function judgeReport(name, text) {
  const missing = missingFields(text);
  const empty = emptyFields(text);
  return { name, ok: missing.length === 0 && empty.length === 0, missing, empty };
}

/** Пара «файлы отчётов ↔ реестр»: кого реестр не называет и кого называет напрасно. */
export function judgeIndex(files, indexText) {
  const listed = files.filter((f) => indexText.includes(f));
  return {
    ok: listed.length === files.length,
    unlisted: files.filter((f) => !indexText.includes(f)),
  };
}

function selftest() {
  const full = [
    '# Отчёт',
    '## Карточка прогона',
    '- **Работа:** дверь карточки (`plans/75`)',
    '- **Контур:** стейдж, сборка ff08c58',
    '- **Прогонов:** 2 — 18:04 и 21:33',
    '- **Проверок:** 8 · пройдено 7 · провалено 1',
    '- **Найдено:** ноль',
    '- **Следы:** 1 учётка, кадры в test-results/',
    '- **Вердикт:** годится',
  ].join('\n');

  const cases = [
    { what: 'полная карточка — зелено', text: full, ok: true },
    {
      what: 'нет поля «Найдено» — красное, поле названо',
      text: full.replace('- **Найдено:** ноль\n', ''),
      ok: false,
      missing: ['Найдено'],
    },
    {
      what: 'нет поля «Следы» — красное',
      text: full.replace('- **Следы:** 1 учётка, кадры в test-results/\n', ''),
      ok: false,
      missing: ['Следы'],
    },
    {
      what: 'поле есть, но ПУСТОЕ — красное (заголовок без содержания)',
      text: full.replace('- **Прогонов:** 2 — 18:04 и 21:33', '- **Прогонов:** —'),
      ok: false,
      empty: ['Прогонов'],
    },
    {
      what: 'поле, названное прозой, а не пунктом, за поле не считается',
      text: full.replace('- **Работа:** дверь карточки (`plans/75`)', 'Работа была про дверь карточки.'),
      ok: false,
      missing: ['Работа'],
    },
    {
      what: 'двоеточие внутри жирного или снаружи — обе формы законны',
      text: full.replace('- **Вердикт:** годится', '- **Вердикт**: годится'),
      ok: true,
    },
  ];

  let bad = 0;
  for (const c of cases) {
    const v = judgeReport('проба', c.text);
    let ok = v.ok === c.ok;
    if (ok && c.missing) ok = c.missing.every((f) => v.missing.includes(f));
    if (ok && c.empty) ok = c.empty.every((f) => v.empty.includes(f));
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✅' : '❌'} ${c.what}`);
  }

  const idx = judgeIndex(['a.md', 'b.md'], 'реестр: [x](a.md)');
  const idxOk = !idx.ok && idx.unlisted.includes('b.md');
  if (!idxOk) bad += 1;
  console.log(`  ${idxOk ? '✅' : '❌'} отчёт, которого нет в реестре, — красное и назван`);

  console.log(bad === 0 ? `\n✅ САМОТЕСТ ЧИСТ: случаев ${cases.length + 1}` : `\n🔴 САМОТЕСТ КРАСНЫЙ: провалов ${bad}`);
  return bad === 0 ? 0 : 1;
}

function main() {
  if (process.argv.includes('--selftest')) process.exit(selftest());

  const dir = resolve(ROOT, DIR);
  if (!existsSync(dir)) {
    console.error(`🔴 нет каталога ${DIR} — отчётам по прогонам негде жить (TESTING_FRAMEWORK.md)`);
    process.exit(1);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md');
  const verdicts = files.map((f) => judgeReport(f, readFileSync(resolve(dir, f), 'utf8')));
  const index = judgeIndex(files, readFileSync(resolve(ROOT, INDEX), 'utf8'));

  console.log(`отчётов по прогонам: ${files.length} · полей в карточке: ${FIELDS.length}`);
  let bad = 0;
  for (const v of verdicts) {
    if (v.ok) continue;
    bad += 1;
    const parts = [];
    if (v.missing.length) parts.push(`нет полей: ${v.missing.join(', ')}`);
    if (v.empty.length) parts.push(`пустые поля: ${v.empty.join(', ')}`);
    console.error(`🔴 ${DIR}/${v.name} — ${parts.join(' · ')}`);
  }
  if (!index.ok) {
    bad += 1;
    console.error(`🔴 ${INDEX} не называет отчёты: ${index.unlisted.join(' · ')} — реестр читают первым, а правят файлы`);
  }
  if (bad > 0) {
    console.error(`\nФорма карточки прогона — TESTING_FRAMEWORK.md → «ИСПОЛНЕННЫЙ ПРОГОН РОЖДАЕТ ОТЧЁТ».`);
    process.exit(1);
  }
  console.log('✅ отчёты по форме, реестр полон');

}

/**
 * ПРЕДОХРАНИТЕЛЬ «ЗАПУЩЕН ИЛИ ПОДКЛЮЧЁН» (`ideas/43`, класс `EXP-0188`). Без него `import` этого
 * файла исполнял бы прогон и звал `process.exit()` — юнит умирал бы до первого утверждения, а
 * `node --test` засчитывал бы его пройденным.
 */
const ЗАПУЩЕН_НАПРЯМУЮ = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (ЗАПУЩЕН_НАПРЯМУЮ) main();

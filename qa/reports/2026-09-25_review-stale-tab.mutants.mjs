// МУТАНТЫ ДЛЯ РУЧНОГО ПРОГОНА `qa/reports/2026-09-25_review-stale-tab.driver.mjs` — доказывают, что прогон умеет краснеть.
// Адресаты названы ДО прогона (печатаются перед каждым заходом). Файлы продукта восстанавливаются побайтово в finally.
// Запуск из корня рабочего места: node qa/reports/2026-09-25_review-stale-tab.mutants.mjs   (≈ 3 мин: два захода --quick)
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const RUNS = [
  {
    key: 'A',
    name: 'А: плашка мёртвого сервера снята · сверка редакции в /decision снята · перенос черновика по НОМЕРУ',
    expectRed: ['РС-01 плашка ≤ 15 с', 'РС-02 плашка ≤ 3 с', 'РС-05 409 stale', 'РС-06 переписанный вопрос не сел на новый В2', 'РС-06 блок прошлой редакции'],
    expectGreen: ['РС-03', 'РС-04', 'РС-05 плашка «переписан»', 'РС-07', 'РС-08', 'РС-09'],
    edits: [
      ['tools/review.mjs', "\t\tgate('dead');", '\t\t/* мутант: плашка мёртвого сервера снята */;'],
      ['tools/review.mjs', 'if (got.rev !== nowRev) {', 'if (false) {'],
      ['tools/lib/review-core.mjs', 'var target = rec.qh ? byPrint', 'var target = byLabel[label] ? label : rec.qh ? byPrint'],
    ],
  },
  {
    key: 'B',
    name: 'Б: сверка редакции на пульсе снята · отказ close снят',
    // «РС-08 печатал» — следствие снятого отказа: close закрывает, и причин в выводе нет вовсе (прогноз захода 20:04 был
    // «зелёный» — ошибся, записано в отчёте).
    expectRed: ['РС-05 плашка «переписан»', 'РС-07 «Документ переписан»', 'РС-08 отказ кодом 4', 'РС-08 «печатал»',
      'РС-08 страница жива через 12 с', 'РС-12 «ответ уже записан»'],
    expectGreen: ['РС-01', 'РС-02', 'РС-03', 'РС-04', 'РС-05 409 stale', 'РС-07 чужой pid', 'РС-09', 'РС-13'],
    edits: [
      ['tools/review.mjs', 'if (j.rev && myRev && j.rev !== myRev) {', 'if (false) {'],
      ['tools/review.mjs', 'if (!verdict.ok && !(force && word)) {', 'if (false) {'],
    ],
  },
];

// Заход выбирается латинским ключом (`A` · `B`); без ключа — оба.
const only = process.argv[2];
for (const run of RUNS) {
  if (only && run.key !== only) continue;
  console.log('\n══ МУТАНТ ' + run.name);
  console.log('   обязаны покраснеть: ' + run.expectRed.join(' · '));
  console.log('   обязаны остаться зелёными: ' + run.expectGreen.join(' · '));
  const originals = new Map();
  const mutated = new Map();
  try {
    for (const [f, from, to] of run.edits) {
      if (!originals.has(f)) originals.set(f, readFileSync(f));
      const src = readFileSync(f, 'utf8');
      if (!src.includes(from)) throw new Error('мутация не легла: ' + f + ' · ' + from);
      writeFileSync(f, src.replace(from, to));
      mutated.set(f, readFileSync(f));
    }
    const r = spawnSync(process.execPath, ['qa/reports/2026-09-25_review-stale-tab.driver.mjs', '--quick'], { encoding: 'utf8', timeout: 400000 });
    process.stdout.write(r.stdout.split('\n').filter((l) => /❌|✅|ИТОГ/.test(l)).join('\n') + '\n');
    if (r.stderr) process.stdout.write('stderr: ' + r.stderr.split('\n').slice(0, 5).join(' | ') + '\n');
  } finally {
    // Файл правили, пока мутант держал его мутированным (2026-09-25: правка полосы черновика стёрлась бы молча) —
    // исходник всё равно восстанавливается, но чужая версия сохраняется и называется вслух.
    for (const [f] of originals) {
      const now = readFileSync(f);
      if (mutated.has(f) && Buffer.compare(now, mutated.get(f)) !== 0) {
        const keep = join(tmpdir(), basename(f) + '.changed-during-mutant-' + Date.now());
        writeFileSync(keep, now);
        console.log('   ⚠️ ' + f + ' МЕНЯЛСЯ во время прогона — его версия сохранена: ' + keep + ' (правку внести заново)');
      }
    }
    for (const [f, buf] of originals) writeFileSync(f, buf);
    console.log('   восстановлено побайтово: ' + [...originals].every(([f, buf]) => Buffer.compare(readFileSync(f), buf) === 0));
  }
}

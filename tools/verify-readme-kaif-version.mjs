#!/usr/bin/env node
/**
 * СТРАЖ ПАРЫ «МАРКЕР KAIF ↔ ВИТРИНА README» — три места README обязаны называть ту же версию,
 * что стоит в `.kaif/kaif.json`.
 *
 * ПОВОД — НАСТОЯЩИЙ ДРЕЙФ, НАЙДЕННЫЙ ЗАКРЫТИЕМ ЧАТА 2026-09-04. Пара «двуязычный README (ru ↔ en)»
 * стояла в реестре пар (`AGENT_GUIDE.md` → «Гигиена документов и текста») БЕЗ команды проверки —
 * единственная такая строка реестра. Замер в день заведения стража: русская половина говорила
 * «2.5 «Experienced KAIF»» (её только что поправило обновление), английская — «2.2 "Yolden KAIF"»,
 * бейдж — «KAIF 2.2». Английская половина отстала на ТРИ интервала (2.3, 2.4, 2.5), и ни один
 * прогон этого не увидел.
 *
 * 🔴 ПОЧЕМУ ЭТОГО НЕ ЛОВИЛА МАШИНЕРИЯ KAIF. Её пункт `stale-claims` ищет строки, называющие
 * ПРЕДЫДУЩУЮ версию (при 2.4 → 2.5 — подстроку «2.4»). Строка, отставшая ДВА интервала назад,
 * говорит «2.2» и в этот скан не попадает никогда: чем дольше строка врёт, тем надёжнее она
 * невидима. Сигнал отправлен в исток (`bugs/KAIF/06`); здесь — локальная починка класса, не
 * ждущая апстрима (контур «Дефект в САМОМ KAIF», `AGENT_GUIDE.md`).
 *
 * ⛔ ЧЕГО ПРИБОР НЕ ДЕЛАЕТ. Он не судит содержание README и не сверяет остальные два языка текста
 * между собой — только ОДИН факт, у которого есть машинный источник истины: номер версии KAIF.
 *
 * @guard readme-kaif-version
 * THREAT:         половина двуязычной витрины отстаёт от маркера на один и более интервалов
 *                 обновления и врёт читателю, пока никто не читает обе половины подряд
 * PROVED-AGAINST: боевой дрейф, найденный до написания стража (en «2.2 "Yolden KAIF"» и бейдж
 *                 «KAIF 2.2» против маркера 2.5), плюс мутация каждого из трёх мест по очереди —
 *                 `--selftest` подменяет версию в копии текста и требует красного
 * GAP:            стережёт ТОЛЬКО номер версии. Дрейф смысла между ru и en (абзац есть в одной
 *                 половине и отсутствует в другой) остаётся за человеком
 * ON-REAL-PATH:   зовётся из `npm run kaif:check` — тех самых ворот, что канон проекта требует
 *                 перед КАЖДЫМ push (`CLAUDE.md`), то есть на пути, которым ходит владелец
 *
 * Запуск: node tools/verify-readme-kaif-version.mjs · самотест: --selftest
 * Коды возврата: 0 — все места согласны с маркером; 1 — дрейф или ошибка.
 */

import { readFileSync } from 'node:fs';

const MARKER = '.kaif/kaif.json';
const README = 'README.md';

/**
 * Три места README, называющие версию KAIF. Каждое — регэксп с ОДНОЙ группой захвата: сам номер.
 * `label` печатается в отчёте, `where` объясняет человеку, что именно чинить.
 */
const SPOTS = [
  {
    label: 'бейдж',
    where: 'строка бейджей в шапке (shields.io, Framework-KAIF%20X.Y)',
    re: /Framework-KAIF%20(\d+\.\d+)-/,
  },
  {
    label: 'русская половина',
    where: 'раздел «О проекте» по-русски: «здесь развёрнута версия **X.Y «…»**»',
    re: /здесь развёрнута версия \*\*(\d+\.\d+)\s/,
  },
  {
    label: 'английская половина',
    where: 'the English half: "the version deployed here is **X.Y \\"…\\"**"',
    re: /the version deployed here is\s*\n?\*\*(\d+\.\d+)\s/,
  },
];

/** Собрать находки: для каждого места — найденная версия либо null, если места нет вовсе. */
function findSpots(text) {
  return SPOTS.map((s) => ({ ...s, found: (text.match(s.re) || [])[1] ?? null }));
}

/** Судить находки против версии маркера. Возвращает массив строк-претензий (пустой = чисто). */
function judge(spots, want) {
  const problems = [];
  for (const s of spots) {
    if (s.found === null) problems.push(`место «${s.label}» не найдено в README — ${s.where}`);
    else if (s.found !== want) problems.push(`место «${s.label}» называет ${s.found}, маркер — ${want} (${s.where})`);
  }
  return problems;
}

// --- самотест: мутация каждого места по очереди обязана краснить ------------------------------
if (process.argv.includes('--selftest')) {
  const text = readFileSync(README, 'utf8');
  const want = JSON.parse(readFileSync(MARKER, 'utf8')).version;
  let failed = 0;

  // 1. Чистый текст молчит.
  const clean = judge(findSpots(text), want);
  if (clean.length) { console.error(`✖ самотест: чистый README дал претензии: ${clean.join(' · ')}`); failed++; }
  else console.log('  ✓ чистый README — ноль претензий');

  // 2. Каждое место, сдвинутое на чужую версию, обязано покраснеть ИМЕННО этим местом.
  for (const spot of SPOTS) {
    const m = text.match(spot.re);
    if (!m) { console.error(`✖ самотест: место «${spot.label}» не найдено — мутировать нечего`); failed++; continue; }
    const mutated = text.replace(m[0], m[0].replace(m[1], '0.9'));
    const problems = judge(findSpots(mutated), want);
    const hit = problems.filter((p) => p.includes(`«${spot.label}»`));
    if (hit.length === 1 && problems.length === 1) console.log(`  ✓ мутация места «${spot.label}» краснит ровно его`);
    else { console.error(`✖ самотест: мутация «${spot.label}» дала ${problems.length} претензий: ${problems.join(' · ')}`); failed++; }
  }

  // 3. Исчезнувшее место обязано краснеть, а не молчать (иначе страж слепнет при переписи README).
  const beheaded = text.replace(SPOTS[0].re, 'Framework-KAIF-7F52FF.svg');
  if (judge(findSpots(beheaded), want).some((p) => p.includes('не найдено'))) console.log('  ✓ пропавшее место краснит, а не молчит');
  else { console.error('✖ самотест: пропавшее место не покраснело'); failed++; }

  if (failed) { console.error(`\n✖ самотест провален: ${failed}`); process.exit(1); }
  console.log('\n✅ самотест стража пары «маркер ↔ README» пройден');
  process.exit(0);
}

// --- боевой прогон ----------------------------------------------------------------------------
let want;
try { want = JSON.parse(readFileSync(MARKER, 'utf8')).version; }
catch (err) { console.error(`✖ не читается ${MARKER}: ${err.message}`); process.exit(1); }
if (!want) { console.error(`✖ в ${MARKER} нет поля version`); process.exit(1); }

const problems = judge(findSpots(readFileSync(README, 'utf8')), want);
if (problems.length) {
  console.error(`✖ витрина README разошлась с маркером KAIF (${want}):`);
  for (const p of problems) console.error(`  · ${p}`);
  console.error('\nЧини ВСЕ места разом: полуправленый README — та же пара в дрейфе.');
  process.exit(1);
}
console.log(`✅ README согласен с маркером KAIF: все ${SPOTS.length} места называют ${want}`);

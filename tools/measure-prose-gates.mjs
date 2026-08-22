/**
 * ПРИБОР ЗАМЕРА (не страж) для ворот прозы — `tools/lib/prose-gates.mjs`, предусловие П5 `plans/70`.
 *
 * Зачем отдельный прибор. Разделяющие признаки обоих ворот назначены ЗАМЕРОМ, а не формулировкой,
 * и числа из шапки модуля обязаны быть перевыводимы кем угодно — иначе они превращаются в
 * унаследованное число, каких проект уже держит одно («47 % объёма описаний», метод не назван,
 * воспроизвести не смог никто). Этот прибор гоняет ворота по четырём корпусам и печатает таблицу.
 *
 * 🔴 КОРПУСА — ТОЛЬКО ИЗ GIT. Полный каталог (`dims-build.json`, 16,7 МБ) в git не лежит, а
 * боевая база разработчику не принадлежит (манифест команды: боевая и стейдж базы — Менеджер).
 * Поэтому меряем по тому, что доступно честно, и размер выборки называется вслух, а не
 * умалчивается:
 *   A — `src/lib/content/dims-slice.json` .................. 50 описаний живого каталога;
 *   B — `researches/34_en_boilerplate_candidates.md` ....... 309 настоящих предложений каталога
 *       (снято грепом `tools/grep-en-boilerplate.mjs` по 245 записям из 5111);
 *   C — `candidates/batches/01…03` на голове ............... 30 наших описаний ПОСЛЕ правки;
 *   D — те же партии 02…03 на коммите `dadd669` ........... 20 карточек, которые владелец ВЕРНУЛ.
 *
 * 🔑 ПАРА C/D И ЕСТЬ ДОКАЗАТЕЛЬСТВО. Это один и тот же текст до и после правки по замечаниям
 * владельца: ворота обязаны краснеть на D и молчать на C. Корпуса A и B отвечают на другой
 * вопрос — не краснеют ли ворота на том, как пишет САМ владелец.
 *
 * ⚠️ Чего прибор НЕ доказывает: A и B — выборка, а не весь каталог (50 и 245 записей из 5111).
 * Ноль ложных срабатываний на них — сильный сигнал, но не утверждение обо всём корпусе.
 *
 * Запуск:
 *   node tools/measure-prose-gates.mjs            # таблица по четырём корпусам
 *   node tools/measure-prose-gates.mjs --show     # ещё и сами найденные предложения
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { splitPredicate, splitPredicateNotes, genreAttribution } from './lib/prose-gates.mjs';

const ПАРТИИ = [
  'candidates/batches/01_2026_films.json',
  'candidates/batches/02_2026_films_and_games.json',
  'candidates/batches/03_2026_films_and_games.json',
];

/** Английские описания из файла партии кандидатов. */
export function текстыПартии(json) {
  const d = JSON.parse(json);
  const arr = Array.isArray(d) ? d : (d.candidates ?? Object.values(d));
  return arr
    .filter((x) => x && x.description && x.description.en)
    .map((x) => ({ id: x.wikidata ?? x.slug ?? x.id, text: x.description.en }));
}

/**
 * B — настоящие предложения живого каталога. Формат строки списка задан самим грепом:
 * `- [маркер] «предложение»` под заголовком `## \`slug\``.
 */
export function предложенияКаталога(md) {
  const out = [];
  let slug = '';
  for (const line of String(md).split('\n')) {
    const h = line.match(/^## `([^`]+)`/u);
    if (h) { slug = h[1]; continue; }
    const m = line.match(/^- \[[^\]]+\] «([\s\S]+)»\s*$/u);
    if (m) out.push({ id: slug, text: m[1] });
  }
  return out;
}

const изGit = (rev, path) =>
  execFileSync('git', ['show', `${rev}:${path}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

function корпуса() {
  const срез = JSON.parse(readFileSync('src/lib/content/dims-slice.json', 'utf8'))
    .filter((x) => x && x.description && x.description.en)
    .map((x) => ({ id: x.slug, text: x.description.en }));
  return [
    ['A · срез живого каталога', срез],
    ['B · предложения каталога', предложенияКаталога(readFileSync('researches/34_en_boilerplate_candidates.md', 'utf8'))],
    ['C · наши партии ПОСЛЕ правки', ПАРТИИ.flatMap((f) => текстыПартии(readFileSync(f, 'utf8')))],
    ['D · что владелец ВЕРНУЛ', ПАРТИИ.slice(1).flatMap((f) => текстыПартии(изGit('dadd669', f)))],
  ];
}

const ЗАПУЩЕН_НАПРЯМУЮ = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (ЗАПУЩЕН_НАПРЯМУЮ) {
  const ПОКАЗАТЬ = process.argv.includes('--show');
  const мерки = [
    ['ОТКАЗ  · расщеплённое сказуемое', splitPredicate],
    ['ОТКАЗ  · отнесение к жанру', genreAttribution],
    ['ЗАМЕЧ. · артефактное подлежащее', splitPredicateNotes],
  ];
  console.log('\n═══ ЗАМЕР ВОРОТ ПРОЗЫ (английская сторона, П5 plans/70) ═══');
  for (const [имя, мерка] of мерки) {
    console.log(`\n── ${имя}`);
    for (const [подпись, корпус] of корпуса()) {
      const находки = корпус.flatMap((r) => мерка(r.text, 'en').map((h) => ({ id: r.id, ...h })));
      const записей = new Set(находки.map((x) => x.id)).size;
      console.log(`   ${подпись.padEnd(32)} срабатываний ${String(находки.length).padStart(3)}`
        + ` · записей ${String(записей).padStart(3)} из ${корпус.length}`);
      if (ПОКАЗАТЬ) {
        for (const h of находки.slice(0, 8)) {
          console.log(`        ${h.id} [${h.оборот}]: «${h.предложение.replace(/\s+/gu, ' ').slice(0, 110)}»`);
        }
      }
    }
  }
  console.log('\nЧитать так: у ОТКАЗОВ строки A, B и C обязаны быть нулевыми, а D — нет.');
  console.log('Ноль на D означал бы, что ворота не работают вовсе.\n');
}

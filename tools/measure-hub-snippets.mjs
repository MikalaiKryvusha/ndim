#!/usr/bin/env node
/**
 * ЗАМЕР — ЧТО ОБЕЩАЕТ ХАБ КАТАЛОГА И ЧТО НА НЁМ ЛЕЖИТ (`plans/56` шаг 0, разведка сниппетов).
 *
 * ПОВОД. Аудит 2026-08-28: хабы `/en/catalog/movie/25` и соседние получают по 15–25 показов на
 * позициях 2–10 и **ноль кликов**. Прежде чем обогащать 10 222 карточки, надо понять, почему
 * видимые позиции не кликаются. Первая проверяемая гипотеза родилась из живой страницы боя:
 * заголовок обещает «top rated», а на странице лежит алфавитный кусок НЕОЦЕНЁННЫХ объектов.
 *
 * 🔴 ЭТО ПРИБОР ЗАМЕРА, А НЕ СТРАЖ. Он ничего не судит и никого не роняет: он печатает числа,
 * по которым пишется вердикт разведки. Порядок и разбивку берёт из ПРОДУКТОВОГО модуля
 * (`catalog-hub.ts`) — своя копия правила разъехалась бы с сайтом и дала бы числа о выдуманном
 * каталоге.
 *
 *   node tools/measure-hub-snippets.mjs [--lang en]
 *
 * Запуск: node tools/measure-hub-snippets.mjs
 */

import { existsSync, readFileSync } from 'node:fs';

import { PER_PAGE, groupByKind, pageCount, placesIn } from '../src/lib/content/catalog-hub.ts';

const argv = process.argv.slice(2);
const at = argv.indexOf('--lang');
const LANG = at >= 0 && argv[at + 1] ? argv[at + 1] : 'en';

const FULL = 'src/lib/content/dims-build.json';
const SLICE = 'src/lib/content/dims-slice.json';
const source = existsSync(FULL) ? FULL : SLICE;
const dims = JSON.parse(readFileSync(source, 'utf8'));
console.log(`Источник каталога: ${source} · записей ${dims.length} · язык ${LANG}`);
if (source === SLICE) {
  console.log('⚠️ ЗАПАСНОЙ СРЕЗ: числа ниже описывают срез из 50 записей, а не каталог.');
}

const { hubs } = groupByKind(dims);

/*
 * 🔴 «ОЦЕНЁН ЛИ ОБЪЕКТ» СПРАШИВАЕМ У ПРОДУКТА, А НЕ У СЕБЯ.
 *
 * Предикат `isRated` внутри `catalog-hub.ts` не экспортирован, и своя копия правила
 * («rates >= 1») стала бы вторым источником истины — ровно тот класс, которым проект уже
 * платил. Поэтому спрашиваем `placesIn`: она раздаёт места ТОЛЬКО оценённым, значит наличие
 * слага в её карте и есть ответ самого продукта.
 */
const ratedSlugs = new Map();
for (const [kind, list] of hubs) ratedSlugs.set(kind, placesIn(list));
const isRated = (kind, d) => ratedSlugs.get(kind).has(d.slug);

console.log('\n| вид | объектов | оценённых | страниц | первая страница БЕЗ единой оценки | страниц без оценок | доля |');
console.log('|---|---:|---:|---:|---:|---:|---:|');

let pagesTotal = 0;
let pagesEmpty = 0;

for (const [kind, list] of [...hubs.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const pages = pageCount(list.length);
  const rated = list.filter((d) => isRated(kind, d)).length;
  // Страница «без единой оценки» — та, где НИ ОДИН объект не оценён. Именно на ней заголовок
  // «top rated… page N» и вводная строка про порядок по симпатиям становятся неправдой.
  let firstEmpty = null;
  let empty = 0;
  for (let page = 1; page <= pages; page++) {
    const slice = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    if (slice.every((d) => !isRated(kind, d))) {
      empty += 1;
      if (firstEmpty === null) firstEmpty = page;
    }
  }
  pagesTotal += pages;
  pagesEmpty += empty;
  const share = pages === 0 ? 0 : Math.round((empty / pages) * 100);
  console.log(
    `| ${kind} | ${list.length} | ${rated} | ${pages} | ${firstEmpty ?? '—'} | ${empty} | ${share} % |`,
  );
}

console.log(
  `\nИТОГО по виду страниц хабов одного языка: ${pagesTotal}; из них БЕЗ ЕДИНОЙ ОЦЕНКИ — ` +
    `${pagesEmpty} (${Math.round((pagesEmpty / pagesTotal) * 100)} %).`,
);
console.log(
  'На каждой такой странице заголовок «top rated… page N of M» и вводная строка про порядок ' +
    'по симпатиям людей описывают то, чего на странице нет.',
);

// Что лежит на странице, которую назвал аудит, — дословно, без пересказа.
const movies = hubs.get('movie');
if (movies) {
  const page25 = movies.slice(24 * PER_PAGE, 25 * PER_PAGE);
  console.log(`\nСтраница из аудита — movie/25 (${page25.length} объектов):`);
  console.log(
    '  первые пять: ' +
      page25
        .slice(0, 5)
        .map((d) => `${d.title?.[LANG] ?? d.slug}${isRated('movie', d) ? ' [есть оценка]' : ''}`)
        .join(' · '),
  );
  console.log(`  оценённых на странице: ${page25.filter((d) => isRated('movie', d)).length} из ${page25.length}`);
}

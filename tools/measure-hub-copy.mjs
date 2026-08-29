/**
 * ЗАМЕР ТЕКСТОВ ХАБОВ КАТАЛОГА — длина описаний, работа лестницы отката, фикстура для юнита.
 *
 * Запуск: node tools/measure-hub-copy.mjs · фикстура: --fixture · самотест: --selftest
 *   · порог: D_LIMIT=155
 * Ворота: нет — это МЕРИТЕЛЬ, а не страж: он печатает числа о живом каталоге и никого не судит.
 *   Нижняя граница длины описаний станет воротами внутри юнита порции dev-1, на фикстуре, —
 *   там у неё есть предмет. Здесь предмета нет: каталог растёт, и «красный» означал бы
 *   «пришла новая партия», то есть шум вместо сигнала.
 * Код возврата: 0 всегда — мерителю нечего проваливать.
 *
 * ═══ ЗАЧЕМ ОН ЛЕЖИТ В ДЕРЕВЕ, А НЕ В СКРЕТЧПАДЕ ═══
 *
 * Он родился в скретчпаде сессии смены 12 под именем `measure-v2.mjs` и там же чуть не умер:
 * числа §5 документа `design/hub-texts-approved.md` были им сняты, а воспроизвести их из дерева
 * было НЕЧЕМ. Суд (вердикт №35, замечание З1) назвал это тем самым классом, от которого сам
 * документ спасал тексты владельца: **проверка, живущая в скретчпаде, умирает вместе с сессией,
 * а числа, ею снятые, превращаются в слова.** Прибор привезён сюда, чтобы каждое число §5
 * стоило одной команды, а не одной веры.
 *
 * ═══ ЧТО ИСПРАВЛЕНО ПРИ ПЕРЕЕЗДЕ, И ПОЧЕМУ ЭТО НЕ КОСМЕТИКА ═══
 *
 * Скретчпадная редакция несла ТРИ абсолютных пути `D:/work/ai_sandbox/ndim-team/ndim_designer/…`
 * — то есть намертво целилась в ОДНО рабочее место. Запущенная из любого другого worktree, она
 * молча померила бы ЧУЖОЕ дерево и напечатала числа с полной уверенностью. Это класс, уже
 * пойманный этой ролью на приборе кадров (`stand-addresses` падал на слот 0 главной копии):
 * **проверка исполнилась, признак верен, ПРЕДМЕТ другой** — третий род ложного зелёного.
 * Здесь он лечится корнем, вычисленным от собственного файла: прибор мерит то дерево, из
 * которого запущен, и другого адреса у него нет.
 *
 * ⚠️ ГРАНИЦЫ, НАЗВАННЫЕ ЧЕСТНО:
 * · Числа сняты с ЖИВОГО `dims-build.json` своего дерева. Каталог растёт — придёт партия,
 *   состав страниц сдвинется, и числа поедут. Это свойство предмета, а не дефект прибора:
 *   поэтому §6 документа и требует, чтобы фикстура юнита СЧИТАЛАСЬ, а не была зашита списком.
 * · Прибор мерит ЗНАКИ, а не выдачу. Где именно подрежет Google — он не знает и не заявляет.
 * · 155 и 60 — ОРИЕНТИРЫ публичной практики, а не закон Google (см. §5 документа).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Корень дерева, из которого запущен прибор, — от собственного файла, а не от cwd и не литералом. */
const КОРЕНЬ = new URL('../', import.meta.url);

// Самотест не трогает настоящий каталог и обязан отработать ДО его загрузки: он про то,
// КУДА прибор смотрит, а не про то, что он там увидит.
if (process.argv.includes('--selftest')) {
  const { самотест } = await import(new URL('measure-hub-copy.selftest.mjs', import.meta.url).href);
  process.exit(самотест(КОРЕНЬ));
}

const { groupByKind, pageCount, placesIn, slicePage } = await import(
  new URL('src/lib/content/catalog-hub.ts', КОРЕНЬ).href
);

const D = Number(process.env.D_LIMIT || 155);
const ФИКСТУРА = process.argv.includes('--fixture');
const dims = JSON.parse(
  readFileSync(fileURLToPath(new URL('src/lib/content/dims-build.json', КОРЕНЬ)), 'utf8'),
);

const { hubs } = groupByKind(dims);
const ratedSlugs = new Map();
for (const [kind, list] of hubs) ratedSlugs.set(kind, placesIn(list));

const ВИД = {
  movie: { ru: 'Фильмы', en: 'Movies' },
  'video-game': { ru: 'Видеоигры', en: 'Video games' },
  'tv-series': { ru: 'Телесериалы', en: 'TV series' },
  novel: { ru: 'Романы', en: 'Novels' },
  practice: { ru: 'Практики', en: 'Practices' },
  'music-artist': { ru: 'Музыкальные исполнители', en: 'Music artists' },
  book: { ru: 'Книги', en: 'Books' },
};

/** Описание страницы: ГОЛОВА — что здесь · ИМЕНА · ХВОСТ — что человек здесь получает. */
function описание(случай, lang, kind, first, last, имён, page, pages) {
  const V = ВИД[kind][lang];
  const ru = lang === 'ru';
  const номер = pages > 1 ? (ru ? `, страница ${page} из ${pages}` : `, page ${page} of ${pages}`) : '';

  let голова;
  let хвост;
  if (случай === 'А') {
    голова = ru ? `${V} с оценками людей Пространства NDim Space` : `${V} rated by people of NDim Space`;
    хвост = ru
      ? 'Что выбрать — подскажет NDim Space Rating, рейтинг сообщества.'
      : 'What to pick — see NDim Space Rating, the community rating.';
  } else if (случай === 'Б') {
    голова = ru ? `${V} каталога NDim Space` : `${V} in the NDim Space catalog`;
    хвост = ru
      ? 'Ваша оценка будет первой, и Пространство NDim Space найдёт Вам похожих людей.'
      : 'Your rating will be the first, and NDim Space will find you similar people.';
  } else {
    голова = ru ? `${V} каталога NDim Space` : `${V} in the NDim Space catalog`;
    хвост = ru
      ? 'Ставьте оценки — Пространство NDim Space найдёт Вам похожих людей.'
      : 'Add your ratings — NDim Space will find you similar people.';
  }

  const имена = ru
    ? имён === 2
      ? `: «${first}», «${last}» и другие`
      : имён === 1
        ? `: «${first}» и другие`
        : номер
    : имён === 2
      ? `: “${first}”, “${last}” and more`
      : имён === 1
        ? `: “${first}” and more`
        : номер;

  return `${голова}${имена}. ${хвост}`;
}

/** Знаки, а не байты: кириллица и типографские кавычки считаются по одному. */
const длина = (s) => [...s].length;

function поЛестнице(случай, lang, kind, first, last, page, pages) {
  for (const имён of [2, 1, 0]) {
    const t = описание(случай, lang, kind, first, last, имён, page, pages);
    if (длина(t) <= D) return { текст: t, имён, n: длина(t) };
  }
  const t = описание(случай, lang, kind, first, last, 0, page, pages);
  return { текст: t, имён: 0, n: длина(t) };
}

const итог = [];
for (const [kind, list] of hubs) {
  const pages = pageCount(list.length);
  for (let page = 1; page <= pages; page += 1) {
    const cards = slicePage(list, page);
    const rated = cards.filter((d) => ratedSlugs.get(kind).has(d.slug)).length;
    const случай = rated === cards.length ? 'А' : rated === 0 ? 'Б' : 'В';
    for (const lang of ['ru', 'en']) {
      const first = cards[0]?.title?.[lang] ?? '';
      const last = cards[cards.length - 1]?.title?.[lang] ?? '';
      // ДВА замера на каждую страницу: «как было бы БЕЗ лестницы» и «как есть С лестницей».
      const сырое = описание(случай, lang, kind, first, last, 2, page, pages);
      итог.push({
        kind,
        page,
        lang,
        случай,
        сыраяДлина: длина(сырое),
        ...поЛестнице(случай, lang, kind, first, last, page, pages),
      });
    }
  }
}

console.log(`каталог: ${dims.length} записей · порог D = ${D} · страниц-языков: ${итог.length}`);

// ═══ ЗАМЕР 1: ЗАЧЕМ ЛЕСТНИЦА ВООБЩЕ НУЖНА ═══
// Шаблон с ДВУМЯ именами на всех страницах, до всякого отката. Это число — довод за лестницу.
const сырыеПереборы = итог.filter((r) => r.сыраяДлина > D);
const худший = итог.reduce((a, b) => (b.сыраяДлина > a.сыраяДлина ? b : a));
const доля = Math.round((сырыеПереборы.length / итог.length) * 100);
console.log(`\n═══ БЕЗ ЛЕСТНИЦЫ (шаблон с двумя именами) ═══`);
console.log(`🔴 обрезалось бы: ${сырыеПереборы.length} из ${итог.length} (${доля} %)`);
console.log(`   худший: ${худший.сыраяДлина} знаков · ${худший.kind}/${худший.page} ${худший.lang}`);

// ═══ ЗАМЕР 2: ЧТО ЛЕСТНИЦА ДАЛА ═══
const переборы = итог.filter((r) => r.n > D);
console.log(`\n═══ С ЛЕСТНИЦЕЙ ═══`);
console.log(`🔴 обрезалось бы: ${переборы.length} из ${итог.length}`);
console.log(`длина: максимум ${Math.max(...итог.map((r) => r.n))} · минимум ${Math.min(...итог.map((r) => r.n))}`);
console.log(
  `ступени — два имени: ${итог.filter((r) => r.имён === 2).length} · одно: ${итог.filter((r) => r.имён === 1).length} · без имён: ${итог.filter((r) => r.имён === 0).length}`,
);
for (const lang of ['ru', 'en']) {
  const g = итог.filter((r) => r.lang === lang);
  console.log(`  ${lang}: страниц ${g.length} · различных описаний ${new Set(g.map((r) => r.текст)).size}`);
}

console.log('\nОБРАЗЦЫ ПО СЛУЧАЯМ:');
for (const c of ['А', 'Б', 'В'])
  for (const lang of ['ru', 'en']) {
    const r = итог.find((x) => x.случай === c && x.lang === lang);
    if (r) console.log(`  [${c}/${lang}] ${r.kind}/${r.page} · ${r.n} знаков · имён ${r.имён}\n      ${r.текст}`);
  }

if (!ФИКСТУРА) process.exit(0);

// ═══ ФИКСТУРА ДЛЯ ЮНИТА — страницы, где лестница РЕАЛЬНО отступает ═══
// Тест, взявший только удобные страницы, зелен на подогнанном материале: отступление ступени
// на них просто не наступает. Поэтому фикстура называется ПОИМЁННО и СЧИТАЕТСЯ, а не зашивается.
console.log('\n═══ ФИКСТУРА: все страницы, где ступень < 2 ═══');
const отступ = итог
  .filter((r) => r.имён < 2)
  .sort((a, b) => a.имён - b.имён || a.kind.localeCompare(b.kind) || a.page - b.page);
console.log(
  `всего ${отступ.length}: без имён ${отступ.filter((r) => r.имён === 0).length} · одно имя ${отступ.filter((r) => r.имён === 1).length}`,
);
console.log('\n--- ступень 3 «без имён» (ВСЕ, их мало — берутся в тест целиком) ---');
for (const r of отступ.filter((r) => r.имён === 0))
  console.log(`  ${r.kind}/${r.page} ${r.lang} · случай ${r.случай} · ${r.n} знаков`);
console.log('\n--- ступень 2 «одно имя»: границы диапазона, по три с каждого конца ---');
const один = отступ.filter((r) => r.имён === 1).sort((a, b) => b.n - a.n);
for (const r of [...один.slice(0, 3), ...один.slice(-3)])
  console.log(`  ${r.kind}/${r.page} ${r.lang} · случай ${r.случай} · ${r.n} знаков`);
console.log('\n--- контроль ступени 1: самая длинная страница, ВЛЕЗШАЯ с двумя именами ---');
const два = итог.filter((r) => r.имён === 2).sort((a, b) => b.n - a.n)[0];
console.log(`  ${два.kind}/${два.page} ${два.lang} · случай ${два.случай} · ${два.n} знаков (порог ${D})`);
console.log(`      ${два.текст}`);

const проба = итог.find((r) => r.kind === 'movie' && r.page === 8 && r.lang === 'ru');
if (проба) console.log(`\n[ГРАНИЦА] порог ${D} · movie/8 ru → имён ${проба.имён}, ${проба.n} знаков`);

console.log('\n[СВЕРКА СТРОК ФИКСТУРЫ]');
for (const [k, p, l] of [
  ['video-game', 10, 'en'],
  ['video-game', 14, 'en'],
  ['book', 1, 'ru'],
  ['book', 1, 'en'],
  ['movie', 25, 'ru'],
]) {
  const r = итог.find((x) => x.kind === k && x.page === p && x.lang === l);
  if (r)
    console.log(
      `  ${k}/${p} ${l} · случай ${r.случай} · имён ${r.имён} · ${r.n} знаков (без лестницы ${r.сыраяДлина})\n      ${r.текст}`,
    );
}

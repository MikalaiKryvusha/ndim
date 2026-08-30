#!/usr/bin/env node
/**
 * СТРАЖ ХАБОВ КАТАЛОГА — `plans/48` шаг 6 (фаза 2 эпика 40 «Архитектура веса»).
 *
 * Что охраняет и почему это не роскошь: **180 хабов уже в бою** (замер сегодня: sitemap несёт
 * 10 432 адреса, из них 180 хабовых) и до этого прибора не стереглись ничем. Именно хабы держат
 * главное число фазы — «недостижимых страниц каталога 0» и «карточка в 3 клика»: сломается
 * пагинация или пропадёт хаб — и 10 222 карточки снова станут недостижимыми, молча.
 *
 * Судит СОБРАННЫЙ САЙТ (`build/`), сервера не поднимает.
 * Запуск:  npm run build ; node tools/verify-catalog-hubs.mjs
 *
 * 🔴 Инварианты, которые здесь нельзя ослаблять (интервью №025 В7, №022):
 *   · блок соседства разрешён ТОЛЬКО по классификации — ни числа похожести, ни «Рядом в
 *     Пространстве» (это про людей и про математику, наружу не выходит);
 *   · на публичной странице нет данных человека;
 *   · пагинация полная и БЕЗ ДЫР — страница, на которую ведёт ссылка, обязана существовать.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
// Ряд звёзд берётся у ПРОДУКТА: страж, повторивший правило своими словами, ошибается вместе с ним.
import { starRow } from '../src/lib/content/dims-rating.ts';
// По той же причине у продукта берётся и строка смысла хаба (`plans/56` шаг 7).
import { CATALOG_COPY, DESC_LIMIT } from '../src/lib/content/catalog-copy.ts';

const BUILD = 'build';
const LANGS = ['ru', 'en'];
/** Порог хаба по замыслу фазы: вид с меньшим числом объектов уезжает в индекс каталога. */
const MIN_CARDS = 20;

let failed = 0;
let passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (!existsSync(BUILD)) {
  console.error('❌ нет каталога build/ — сначала `npm run build`');
  process.exit(1);
}

const visible = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Что запрещено на публичной странице каталога — по решениям владельца, а не по вкусу. */
const FORBIDDEN = [
  [/\d+\s*%/, 'число процента (метрика похожести наружу не выходит)'],
  [/похожест/i, 'слово «похожесть»'],
  [/similarity/i, 'слово similarity'],
  [/Рядом в Пространстве|Near in the Space/i, 'запрещённая формулировка «Рядом в Пространстве»'],
];
const LEAKS = [
  [/[\w.+-]+@[\w-]+\.[a-z]{2,}/i, 'адрес почты'],
  [/"uid"\s*:/, 'поле uid'],
  [/\/points\//, 'путь к приватным оценкам'],
];

for (const lang of LANGS) {
  console.log(`\n═══ ${lang.toUpperCase()} ═══`);

  // ── Индекс каталога: он и есть корень достижимости ─────────────────────────
  const indexFile = join(BUILD, lang, 'catalog.html');
  if (!existsSync(indexFile)) {
    check(`индекс каталога /${lang}/catalog собран`, false, indexFile);
    continue;
  }
  const indexHtml = readFileSync(indexFile, 'utf8');
  const hubKinds = [
    ...new Set(
      [...indexHtml.matchAll(new RegExp(`href="/${lang}/catalog/([a-z0-9-]+)"`, 'g'))].map((m) => m[1]),
    ),
  ];
  check(`индекс каталога /${lang}/catalog собран`, true, `${indexHtml.length} байт`);
  check('индекс ведёт хотя бы в 5 хабов', hubKinds.length >= 5, `хабов: ${hubKinds.length} (${hubKinds.join(', ')})`);

  for (const kind of hubKinds) {
    const first = join(BUILD, lang, 'catalog', `${kind}.html`);
    if (!existsSync(first)) {
      check(`хаб ${kind}: страница 1 собрана`, false, first);
      continue;
    }
    const html = readFileSync(first, 'utf8');
    const text = visible(html);

    // Карточек на странице — считаем по ССЫЛКАМ В КАРТОЧКИ, а не по вёрстке: класс строки
    // может смениться при правке макета, а ссылка на карточку — это сам смысл хаба.
    const cards = (html.match(new RegExp(`href="/${lang}/dimension/`, 'g')) ?? []).length;
    check(`хаб ${kind}: карточек не меньше ${MIN_CARDS}`, cards >= MIN_CARDS, `их ${cards}`);

    // hreflang с самоссылкой — без неё разметка игнорируется поиском целиком.
    const missing = LANGS.filter(
      (l) => !html.includes(`hreflang="${l}" href="https://ndimspace.app/${l}/catalog/${kind}"`),
    );
    check(`хаб ${kind}: hreflang двусторонний с самоссылкой`, missing.length === 0,
      missing.length ? `нет: ${missing.join(', ')}` : '');

    const bad = FORBIDDEN.filter(([re]) => re.test(text)).map(([, what]) => what);
    check(`хаб ${kind}: ни одного числа похожести и запретной формулировки`, bad.length === 0, bad.join(' · '));

    const leaks = LEAKS.filter(([re]) => re.test(html)).map(([, what]) => what);
    check(`хаб ${kind}: нет данных человека`, leaks.length === 0, leaks.join(' · '));

    /*
     * ПАГИНАЦИЯ БЕЗ ДЫР. Берём номера страниц, НА КОТОРЫЕ ВЕДЁТ САМА СТРАНИЦА, и требуем, чтобы
     * каждый существовал файлом. Это ловит настоящий симптом: ссылка есть — страницы нет, то есть
     * человек и робот упираются в 404 посреди обхода, а карточки за этой дырой становятся
     * недостижимыми (главное число фазы — «недостижимых 0»).
     */
    const pages = [
      ...new Set(
        [...html.matchAll(new RegExp(`href="/${lang}/catalog/${kind}/(\\d+)"`, 'g'))].map((m) => Number(m[1])),
      ),
    ].sort((a, b) => a - b);
    if (pages.length > 0) {
      const dead = pages.filter((n) => !existsSync(join(BUILD, lang, 'catalog', kind, `${n}.html`)));
      check(`хаб ${kind}: все ${pages.length} страниц пагинации существуют`, dead.length === 0,
        dead.length ? `нет файлов для страниц: ${dead.join(', ')}` : `до страницы ${pages[pages.length - 1]}`);
      // Дыра в НУМЕРАЦИИ: 1,2,4 — это потерянная третья, а не «просто меньше ссылок».
      const expected = Array.from({ length: pages[pages.length - 1] - 1 }, (_, i) => i + 2);
      const gaps = expected.filter((n) => !pages.includes(n));
      check(`хаб ${kind}: в нумерации страниц нет дыр`, gaps.length === 0, gaps.length ? `пропущены: ${gaps.join(', ')}` : '');
    }
  }
}

// ── Вес клиентского бандла: каталог не должен уехать в браузер (`EXP-0136`) ──
console.log('\n— каталог НЕ уехал в браузер —');
{
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
    );
  const appDir = join(BUILD, '_app');
  const mb = existsSync(appDir) ? walk(appDir).reduce((s, f) => s + statSync(f).size, 0) / 1048576 : 0;
  check('клиентский бандл меньше 3 МБ', mb < 3, `${mb.toFixed(1)} МБ`);
}

// ── ПАРИТЕТ ЗВЁЗД: ХАБ ПОКАЗЫВАЕТ ТО ЖЕ, ЧТО КАРТОЧКА ──────────────────────
console.log('\n— ряд звёзд на хабе — тот же, что на карточке объекта —');
{
  /*
   * 🔴 ЗАЧЕМ ЭТА ПРОВЕРКА ПОЯВИЛАСЬ. Правило владельца (№044 В3) сначала легло только на карточку
   * объекта, и один и тот же фильм показывал на карточке восемь золотых звёзд, а на хабе —
   * восемь золотых и две пустых. Две публичные поверхности говорили разное про один объект;
   * это класс «истина ↔ зеркало», которым проект уже платил. Владелец распространил правило на
   * обе поверхности, а страж делает молчаливое расхождение невозможным.
   *
   * Ряд считает `starRow` — тот же код, что рисует продукт: своя формула в страже дала бы второй
   * источник истины, и он разъехался бы с первым при следующей правке.
   */
  const dims = JSON.parse(
    readFileSync(
      existsSync('src/lib/content/dims-build.json')
        ? 'src/lib/content/dims-build.json'
        : 'src/lib/content/dims-slice.json',
      'utf8',
    ),
  );
  const num = (v) => (Number.isFinite(+v) ? +v : 0);
  const bySlug = new Map(dims.map((d) => [d.slug, d]));

  const walkPages = (dir) =>
    existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
          e.isDirectory() ? walkPages(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : [],
        )
      : [];

  let rows = 0;
  let mismatch = 0;
  let empty = 0;
  let greyRows = 0;
  let firstBad = '';

  /*
   * 🔑 ВЫБОРКА ДОБИРАЕТСЯ ПОИМЁННО — тот же приём, что в страже карточек, и по той же причине.
   * Объектов со средней ниже единицы в каталоге ДВА из 5121; в первые 40 страниц хабов они не
   * попадают, и проверка «серая звезда на хабе» печатала бы «0 нарушений» ни разу её не увидев.
   * «Ноль нарушений» и «ноль наблюдений» выглядят одинаково (`EXP-0092`), поэтому страницы,
   * где эти объекты реально стоят, добавляются в выборку ЯВНО, а число наблюдений печатается.
   */
  const allPages = walkPages(join(BUILD, 'ru', 'catalog'));
  const rareSlugs = dims.filter((d) => num(d.rates) >= 1 && num(d.rating) < 1).map((d) => d.slug);
  const picked = new Set(allPages.slice(0, 40));
  for (const page of allPages) {
    const html = readFileSync(page, 'utf8');
    if (rareSlugs.some((slug) => html.includes(`/ru/dimension/${slug}"`))) picked.add(page);
  }

  for (const file of picked) {
    const html = readFileSync(file, 'utf8');
    for (const m of html.matchAll(/<a class="row[^>]*href="\/ru\/dimension\/([a-z0-9-]+)"[\s\S]*?<\/a>/g)) {
      const d = bySlug.get(m[1]);
      if (!d) continue;
      const row = m[0].match(/<span class="stars[\s\S]*?<\/span>/)?.[0] ?? '';
      if (!row) continue; // неоценённый — звёзд нет вовсе, это стережёт правило показа оценок
      rows += 1;
      const gold = (row.match(/<i class="[^"]*\bon\b[^"]*">★<\/i>/g) ?? []).length;
      const grey = (row.match(/<i class="[^"]*\blow\b[^"]*">★<\/i>/g) ?? []).length;
      const total = (row.match(/★/g) ?? []).length;
      const want = starRow(num(d.rating));
      if (grey) greyRows += 1;
      if (gold !== want.gold || grey !== want.grey) {
        mismatch += 1;
        if (!firstBad) firstBad = `${d.slug}: оценка ${d.rating} → хаб ${gold}🟡+${grey}⚪, карточка ${want.gold}🟡+${want.grey}⚪`;
      }
      if (total !== gold + grey) {
        empty += 1;
        if (!firstBad) firstBad = `${d.slug}: на хабе ${total} звёзд, размеченных ${gold + grey}`;
      }
    }
  }

  check('ряд звёзд на хабе совпадает с рядом на карточке', mismatch === 0,
    `сверено рядов ${rows}${mismatch ? `, расхождений ${mismatch}: ${firstBad}` : ''}`);
  check('пустых позиций на хабе НЕТ вовсе', empty === 0, `нарушений: ${empty}`);
  check('сверка паритета вообще состоялась', rows > 0, `рядов: ${rows}`);
  if (rareSlugs.length) {
    check('🔴 тяжёлая серая звезда наблюдалась и НА ХАБЕ (добор поимённо)', greyRows > 0,
      `в каталоге ${rareSlugs.length}, наблюдений ${greyRows}: ${rareSlugs.join(' · ')}`);
  } else {
    console.log('  ℹ в каталоге нет объектов со средней ниже единицы — серая звезда не наблюдалась');
  }
}

/*
 * ── СНИППЕТ СТРАНИЦЫ ГОВОРИТ О НЕЙ САМОЙ (`plans/56` шаг 7) ──────────────────────────────────
 *
 * Что здесь стережётся и чем это оплачено. Разведка `researches/57`: `/en/catalog/movie/25`
 * называлась «Movies — top rated on NDim Space», имея НОЛЬ оценённых из шестидесяти; таких
 * страниц 53 из 89 на язык. Описание при этом было одно на все 47 страниц вида, до знака.
 *
 * 🔴 Проверка идёт ПО ВСЕМ страницам хабов, а не по первым: ровно первые страницы и были теми,
 * где всё в порядке, — оценённые сидят в начале взвешенного порядка. Судить по ним значило бы
 * не увидеть предмет вовсе.
 *
 * 🔑 И печатаются НАБЛЮДЕНИЯ по каждому состоянию, а не только нарушения: «0 нарушений» и
 * «0 наблюдений» выглядят одинаково зелёными (`EXP-0092`). Если в каталоге не окажется ни одной
 * страницы без оценённых, эта проверка обязана сказать об этом вслух, а не промолчать.
 *
 * ⚠️ Чего проверка НЕ делает: она не судит ТЕКСТ на вкус — тексты ждут вычитки владельца. Она
 * судит ВЫБОР варианта: обещает ли страница рейтинг, которого на ней нет.
 */
console.log('\n— сниппет страницы говорит о ней самой, а не о виде целиком —');
{
  /**
   * Слова «топ» в ЗАГОЛОВКЕ — то, чего страница без единой оценки говорить не вправе.
   *
   * 🔴 Образец для СТРОКИ СМЫСЛА руками не пишется, а берётся у продукта — `CATALOG_COPY[lang]
   * .hubLede`. Цена этого решения замерена контрольной мутацией M1: рукописный образец искал
   * формулу ЗАГОЛОВКА («top rated on NDim Space»), а английская строка смысла лжёт другими
   * словами («The NDim Space top: what people liked more comes first…») — и половина проверки
   * молчала: 53 нарушения вместо 106. Правило продукта знает только продукт (тот же приём, что
   * со `starRow` выше).
   */
  const TOP_CLAIM = { ru: /топ по версии NDim Space/i, en: /top rated on NDim Space/i };
  /** Строка смысла «топа» — дословно та, которую продукт даёт странице С оценёнными. */
  const TOP_LEDE = { ru: CATALOG_COPY.ru.hubLede, en: CATALOG_COPY.en.hubLede };

  let withRated = 0;
  let withoutRated = 0;
  let mixedPages = 0;
  let tooLong = 0;
  let longest = 0;
  let firstLong = '';
  let lyingTitle = 0;
  let lyingLede = 0;
  let mutedTitle = 0;
  let mixedClaimsTop = 0;
  let firstLie = '';
  /** Описания, сгруппированные по «язык + вид»: внутри одной группы дублей быть не должно. */
  const descs = new Map();

  for (const lang of LANGS) {
    const hubDir = join(BUILD, lang, 'catalog');
    if (!existsSync(hubDir)) continue;

    // Страницы хаба: первая лежит файлом `<kind>.html`, остальные — в папке `<kind>/<n>.html`.
    const kinds = readdirSync(hubDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.html'))
      .map((e) => e.name.replace(/\.html$/, ''));

    for (const kind of kinds) {
      const files = [join(hubDir, `${kind}.html`)];
      const sub = join(hubDir, kind);
      if (existsSync(sub)) {
        for (const e of readdirSync(sub)) if (e.endsWith('.html')) files.push(join(sub, e));
      }

      for (const file of files) {
        const html = readFileSync(file, 'utf8');
        const cards = (html.match(new RegExp(`href="/${lang}/dimension/`, 'g')) ?? []).length;
        if (cards === 0) continue;

        // Состояние страницы берётся из ЕЁ РАЗМЕТКИ, а не из данных: страж судит то, что уехало
        // человеку. «Без голосов» рисуется отдельным классом — он и есть признак неоценённой.
        const bare = (html.match(/\bnovotes\b/g) ?? []).length;
        const rated = cards - bare;

        const title = (html.match(/<title>([\s\S]*?)<\/title>/) ?? [])[1] ?? '';
        const lede = (html.match(/<p class="lede[^"]*">([\s\S]*?)<\/p>/) ?? [])[1] ?? '';
        const desc = (html.match(/<meta name="description" content="([^"]*)"/) ?? [])[1] ?? '';

        const claimsTop = TOP_CLAIM[lang].test(title);
        // Сравнение со строкой продукта, а не с образцом: разметка экранирует часть знаков,
        // поэтому сверяются видимые тексты обоих.
        const ledeClaimsTop = visible(lede) === visible(TOP_LEDE[lang]);

        // Длина описания — ориентир 155 (лестница отката в `hubMetaDesc`). Проверяется по
        // СОБРАННОМУ сайту: лестница может влезть в юните и не влезть на живом имени объекта.
        if (desc.length > longest) longest = desc.length;
        if (desc.length > DESC_LIMIT) {
          tooLong += 1;
          if (!firstLong) firstLong = `${file}: ${desc.length} знаков`;
        }

        if (rated > 0 && rated < cards) mixedPages += 1;

        if (rated > 0) {
          withRated += 1;
          /*
           * 🔄 ГРАНИЦА «ТОПА» СДВИНУТА РЕШЕНИЕМ ВЛАДЕЛЬЦА — №066 В1 = А, §2
           * `design/hub-texts-approved.md`. Прежде страж требовал «топ» от ЛЮБОЙ страницы, где
           * есть хоть одна оценка; теперь топом зовётся только ПОЛНОСТЬЮ оценённая (случай А), а
           * смешанная — «в каталоге». Довод владельца: при 9 оценённых из 60 «топ» оверселлит.
           *
           * ⛔ Проверка при этом НЕ снята и не ослаблена, потому что риск ДВУСТОРОННИЙ и обе его
           * стороны живы: с одной — «лечением» сошло бы снятие слова «топ» отовсюду, то есть
           * обеднение хаба; с другой — возврат «топа» смешанным страницам вернул бы оверселл,
           * который владелец только что убрал. Поэтому счётчика стало ДВА, а не ноль.
           *
           * 🔑 Красным этот страж стал НА СОБРАННОМ САЙТЕ, когда код уже был приведён к принятым
           * текстам, — и был прав: он держал прежнее правило. Юниты этого не видели, потому что
           * судят функцию, а страж судит 89 отданных страниц.
           */
          if (rated === cards) {
            if (!claimsTop) {
              mutedTitle += 1;
              if (!firstLie) firstLie = `${file}: оценены ВСЕ ${cards}, а «топ» из заголовка ушёл`;
            }
          } else if (claimsTop) {
            mixedClaimsTop += 1;
            if (!firstLie) firstLie = `${file}: оценённых ${rated} из ${cards}, а заголовок зовёт топом`;
          }
        } else {
          withoutRated += 1;
          if (claimsTop) {
            lyingTitle += 1;
            if (!firstLie) firstLie = `${file}: оценённых 0 из ${cards}, заголовок «${title}»`;
          }
          if (ledeClaimsTop) {
            lyingLede += 1;
            if (!firstLie) firstLie = `${file}: оценённых 0 из ${cards}, строка смысла «${lede}»`;
          }
        }

        const group = `${lang}/${kind}`;
        if (!descs.has(group)) descs.set(group, []);
        descs.get(group).push({ desc, file });
      }
    }
  }

  check('🔴 страница без единой оценки НЕ обещает рейтинг в заголовке', lyingTitle === 0,
    `страниц без оценённых ${withoutRated}, лгут ${lyingTitle}${firstLie && lyingTitle ? ` · ${firstLie}` : ''}`);
  check('🔴 та же правда в строке смысла — её видит человек', lyingLede === 0,
    `лгут ${lyingLede}`);
  check('ПОЛНОСТЬЮ оценённая страница по-прежнему называет себя топом (не обеднили)', mutedTitle === 0,
    `полностью оценённых ${withRated - mixedPages}, замолчали ${mutedTitle}`);
  check('🔴 СМЕШАННАЯ страница топом себя НЕ зовёт — решение владельца №066 В1 = А', mixedClaimsTop === 0,
    `смешанных ${mixedPages}, оверселлят ${mixedClaimsTop}`);

  // Вакуум-контроль: проверка бессодержательна, если состояния не наблюдались. Состояний ТРИ,
  // и смешанное — самое редкое (по одной странице на вид), поэтому оно названо отдельно:
  // «0 нарушений» и «0 наблюдений» печатаются одинаково зелёными (`EXP-0092`).
  // Корзины печатаются НЕПЕРЕСЕКАЮЩИМИСЯ: `withRated` включает смешанные, и напечатать их рядом
  // значило бы дать три числа, которые не складываются в общее, — читатель решил бы, что страж врёт.
  check('все ТРИ состояния РЕАЛЬНО наблюдались (иначе проверка вакуумная)',
    withRated > 0 && withoutRated > 0 && mixedPages > 0,
    `без оценённых ${withoutRated}, смешанных ${mixedPages}, полностью оценённых ${withRated - mixedPages}` +
      ` (всего ${withoutRated + withRated})`);

  check('🔴 описание влезает в ориентир — лестница отката сработала везде', tooLong === 0,
    `предел ${DESC_LIMIT}, самое длинное ${longest}, переполнений ${tooLong}${firstLong ? ` · ${firstLong}` : ''}`);

  let dupGroups = 0;
  let firstDup = '';
  let compared = 0;
  for (const [group, rows] of descs) {
    if (rows.length < 2) continue;
    compared += rows.length;
    const seen = new Set();
    for (const { desc, file } of rows) {
      if (seen.has(desc)) {
        dupGroups += 1;
        if (!firstDup) firstDup = `${group}: ${file} повторяет описание соседней страницы`;
        break;
      }
      seen.add(desc);
    }
  }
  check('🔴 у каждой страницы вида СВОЁ описание (дублей нет)', dupGroups === 0,
    `сверено страниц ${compared}, видов с дублем ${dupGroups}${firstDup ? ` · ${firstDup}` : ''}`);
  check('сверка описаний вообще состоялась', compared > 0, `страниц: ${compared}`);
}

console.log(`\n${failed ? '🔴' : '✅'} ИТОГ: ${passed} прошло, ${failed} провалов\n`);
process.exit(failed ? 1 : 0);

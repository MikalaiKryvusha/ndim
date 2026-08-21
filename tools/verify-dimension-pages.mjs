#!/usr/bin/env node
/**
 * СТРАЖ ПУБЛИЧНЫХ СТРАНИЦ КАТАЛОГА — шаг 5 фазы 5 эпика `ideas/30` (`plans/36`).
 *
 * Судит СОБРАННЫЙ САЙТ (`build/`), а не исходники: правило показа оценок можно проверить юнитом
 * (`dims-rating.test.ts` это и делает), но «описание лежит в сыром HTML» и «на странице нет
 * данных человека» — свойства ОТДАННОГО ФАЙЛА. Юнит тут ничего не докажет.
 *
 * Запуск:  npm run build && node tools/verify-dimension-pages.mjs
 * Выход:   0 — чисто; 1 — есть провалы.
 *
 * ⚠️ Страж работает на том, что собрано. Собрано на запасном срезе (50 записей) — он это скажет
 * и проверит срез; молча судить о 10 222 страницах по сотне он не станет.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
// Места пересчитываются ТЕМ ЖЕ кодом, что и в продукте: повтор формулы в страже дал бы второй
// источник истины, и он разъехался бы с первым при следующей правке порядка (а её уже меняли).
import { groupByKind, placesIn } from '../src/lib/content/catalog-hub.ts';
// Состояние величины берётся у ПРОДУКТА, а не считается здесь заново: страж, повторивший
// правило своими словами, зеленеет ровно тогда, когда ошибается вместе с продуктом.
import { ratingState } from '../src/lib/content/dims-rating.ts';

const BUILD = 'build';
const LANGS = ['ru', 'en'];

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

// ── Что вообще собрано ───────────────────────────────────────────────────────
console.log('\n— что собрано —');
const pages = {};
for (const lang of LANGS) {
  const dir = join(BUILD, lang, 'dimension');
  pages[lang] = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.html')) : [];
}
check('страницы собраны на ОБОИХ языках', pages.ru.length > 0 && pages.en.length > 0,
  `ru ${pages.ru.length} · en ${pages.en.length}`);
check('число страниц совпадает между языками', pages.ru.length === pages.en.length,
  `${pages.ru.length} против ${pages.en.length}`);

const FULL = pages.ru.length > 1000;
console.log(FULL
  ? `  ℹ собран ПОЛНЫЙ каталог (${pages.ru.length} × ${LANGS.length})`
  : `  ⚠️ собран ЗАПАСНОЙ СРЕЗ (${pages.ru.length}) — для выката нужен \`node tools/fetch-dims-slice.mjs --all\``);

/** Читает собранную страницу. */
const read = (lang, file) => readFileSync(join(BUILD, lang, 'dimension', file), 'utf8');

/** Видимый текст: выкидываем скрипты, стили, комментарии и теги. */
const visible = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Выборка: до 300 страниц на язык — полный обход 10 222 файлов ради тех же выводов не нужен.
const sample = (lang) => {
  const all = pages[lang];
  const step = Math.max(1, Math.floor(all.length / 300));
  return all.filter((_, i) => i % step === 0).slice(0, 300);
};

// ── Строка «Сырой HTML»: описание отдано готовым, а не скриптом ──────────────
console.log('\n— описание лежит в СЫРОМ HTML —');
{
  let thin = 0;
  let noTitle = 0;
  let noDesc = 0;
  for (const lang of LANGS) {
    for (const f of sample(lang)) {
      const html = read(lang, f);
      if (!/<title>[^<]{3,}<\/title>/.test(html)) noTitle += 1;
      if (!/<meta name="description" content="[^"]{20,}"/.test(html)) noDesc += 1;
      // Собственный текст страницы (без оболочки) обязан быть заметным. 300 знаков — порог
      // с большим запасом: медиана описания по бою 1047 знаков RU и 1026 EN.
      if (visible(html).length < 300) thin += 1;
    }
  }
  check('у каждой страницы есть непустой <title>', noTitle === 0, `без заголовка: ${noTitle}`);
  check('у каждой страницы есть <meta name="description">', noDesc === 0, `без описания: ${noDesc}`);
  check('ни одной «тонкой» страницы (< 300 знаков видимого текста)', thin === 0, `тонких: ${thin}`);
}

// ── Строка «Приватность»: людей на публичной странице нет ────────────────────
console.log('\n— приватность: на публичной странице НЕТ данных человека —');
{
  // Ищем следы, которые могли бы просочиться из модели: адреса почты, идентификаторы людей,
  // поля профиля. `uid` в разметке страницы каталога быть не может ни при каких обстоятельствах.
  const LEAKS = [
    [/[\w.+-]+@[\w-]+\.[a-z]{2,}/i, 'адрес почты'],
    [/"uid"\s*:/, 'поле uid'],
    [/\/points\//, 'путь к приватным оценкам'],
    [/Участник Пространства\s*№/, 'подпись участника'],
  ];
  const hits = [];
  for (const lang of LANGS) {
    for (const f of sample(lang)) {
      const html = read(lang, f);
      for (const [re, what] of LEAKS) if (re.test(html)) hits.push(`${lang}/${f}: ${what}`);
    }
  }
  check('ни одной утечки данных человека', hits.length === 0, hits.slice(0, 3).join(' · '));
}

// Каталог читается ОДИН раз на весь прогон: им пользуются и правило оценок, и сверка мест.
const dimsAll = JSON.parse(
  readFileSync(
    existsSync('src/lib/content/dims-build.json')
      ? 'src/lib/content/dims-build.json'
      : 'src/lib/content/dims-slice.json',
    'utf8',
  ),
);
const bySlugAll = new Map(dimsAll.map((d) => [d.slug, d]));

// ── Строка «Правило оценок» на СОБРАННЫХ страницах ──────────────────────────
console.log('\n— правило показа оценок (интервью №021 В1, №022 В1 = А) —');
{
  const dims = dimsAll;
  const bySlug = bySlugAll;
  let starsAtZero = 0;
  let countMissing = 0;
  let countAtZero = 0;
  let brandMissing = 0;
  let brandAtZero = 0;
  let noStarsAtRated = 0;
  let seenZero = 0;
  let seenRated = 0;

  for (const f of sample('ru')) {
    const slug = f.replace(/\.html$/, '');
    const d = bySlug.get(slug);
    if (!d) continue;
    const text = visible(read('ru', f));
    const hasStars = text.includes('★');
    const hasNoVotes = text.includes('Ещё без голосов');
    /*
     * ⚠️ ЭТА СТРОКА СВЯЗАНА С ТЕКСТОМ СТРАНИЦЫ, и это осознанная цена: страж судит ОТДАННЫЙ
     * ФАЙЛ, то есть видит ровно те слова, что видит человек. Меняется формулировка — меняется
     * и здесь. Формулировка «оценено N людьми» — слово владельца 2026-08-03 (прежняя «оценили: N»
     * называла действие, а не результат).
     * 🔑 Ловим ФОРМУ «оценено <число>», а не точную фразу целиком: склонение «человеком/людьми»
     * зависит от числа, и вшивать его сюда значило бы ронять стража на каждом одиннадцатом.
     */
    const hasCount = /оценено\s+\d+/.test(text);
    /*
     * 🏷 Бренд-имя ищется СТРУКТУРНО — по классу подписи в самой строке оценки, а не по тексту
     * страницы. Первая редакция искала строку «NDim Space Rating» где угодно и покраснела на
     * 201 странице: имя честно упоминается ещё и в блоке-двери («NDim Space ведёт свою систему
     * рейтингов»), в том числе там, где оценок нет. Проверка про ПОДПИСЬ К ОЦЕНКЕ — её и надо
     * спрашивать по месту, а не по совпадению слов.
     */
    const hasBrand = /class="brandname/.test(read('ru', f));

    if (d.rates === 0) {
      seenZero += 1;
      if (hasStars) starsAtZero += 1;
      if (!hasNoVotes) starsAtZero += 1;
      // 🏷 Бренд-имени там, где оценок нет, быть не должно: называть нечего.
      if (hasBrand) brandAtZero += 1;
    } else {
      seenRated += 1;
      if (!hasStars) noStarsAtRated += 1;
      // 🏷 «NDim Space Rating» — фирменный рейтинг (слово владельца 2026-08-03: «наш фирменный
      // бренд-рейтинг, наравне с IMDb и Rotten Tomatoes»). Безымянные звёзды читаются как чей-то
      // случайный агрегат; имя делает их ВЕЛИЧИНОЙ ПРОДУКТА, узнаваемой вне нашего сайта.
      if (!hasBrand) brandMissing += 1;
    }
    // 🔄 Правило сменилось 2026-08-03 (решение владельца отменяет интервью №022 В3):
    // счётчик показывается при ЛЮБОМ числе оценивших. Здесь стерёгся прежний порог «от трёх».
    // Страж не ослаблен, а ПЕРЕНАЦЕЛЕН: раньше он ловил счётчик там, где его быть не должно,
    // теперь — его ОТСУТСТВИЕ там, где он обязан быть, плюс появление там, где голосов нет.
    if (d.rates > 0 && !hasCount) countMissing += 1;
    if (d.rates === 0 && hasCount) countAtZero += 1;
  }

  check('в выборке есть измерения БЕЗ голосов', seenZero > 0, `их ${seenZero}`);
  check('в выборке есть измерения С голосами', seenRated > 0, `их ${seenRated}`);
  check('звёзд НЕТ там, где нет голосов', starsAtZero === 0, `нарушений: ${starsAtZero}`);
  check('звёзды ЕСТЬ там, где голоса есть', noStarsAtRated === 0, `нарушений: ${noStarsAtRated}`);
  check('счётчик ЕСТЬ везде, где есть голоса', countMissing === 0, `нарушений: ${countMissing}`);
  check('счётчика НЕТ там, где голосов нет', countAtZero === 0, `нарушений: ${countAtZero}`);
  check('🏷 «NDim Space Rating» назван везде, где есть оценка', brandMissing === 0, `нарушений: ${brandMissing}`);
  check('🏷 бренд-имени НЕТ там, где оценок нет', brandAtZero === 0, `нарушений: ${brandAtZero}`);
}

// ── ТРИ СОСТОЯНИЯ БЛОКА-ДВЕРИ (`plans/56` шаг 1) ────────────────────────────
console.log('\n— блок-дверь: три состояния, и ни одно не притворяется другим —');
{
  /*
   * 🔴 ЧТО ИМЕННО ЗДЕСЬ СТЕРЕЖЁТСЯ. До этой фазы дверь знала ДВА состояния: «голосов нет» и
   * «голоса есть». Объект, которому все поставили ноль, попадал во второе и показывал «0,0»
   * с десятью пустыми звёздами — то есть выглядел ровно как неоценённый. Ноль на шкале 0…10 —
   * законная оценка, и страница обязана называть её оценкой.
   *
   * 🔑 ВЫБОРКА ДОПОЛНЕНА ПОИМЁННО, И ЭТО ГЛАВНАЯ ЧАСТЬ ПРОВЕРКИ. Обычная выборка берёт каждую
   * N-ю страницу; объектов состояния «все поставили ноль» в каталоге ДВА из 5121, и в такую
   * выборку они не попадают никогда. Проверка была бы вакуумной: «0 нарушений» и «0 наблюдений»
   * печатаются одинаково (`EXP-0092`). Поэтому их слаги ВЫЧИСЛЯЮТСЯ ИЗ ДАННЫХ и добавляются к
   * выборке принудительно — и печатается число наблюдений по каждому состоянию.
   *
   * ⚠️ Слаги не вшиты в страж списком: контроль, привязанный к конкретной записи, умирает
   * вместе с ней (`EXP-0163`). Кто-то поставит «Квадробике» пятёрку — состояние уедет к другому
   * объекту, и страж пойдёт за ним сам.
   */
  const MARKS = {
    ru: {
      none: 'Ваша оценка будет первой!',
      rated: 'Ваш голос отображается в рейтинге',
      'all-zero': 'Все, кто оценил этот объект, поставили ноль баллов',
    },
    en: {
      none: 'Your rating will be the first one!',
      rated: 'Your vote shows in the rating of NDim Space',
      'all-zero': 'Everyone who rated this object gave it a zero',
    },
  };
  const STATES = ['none', 'rated', 'all-zero'];

  const stateOf = (d) => ratingState(d.rates ?? 0, d.rating ?? 0);
  // Поимённое дополнение выборки: редкие состояния добираются из данных целиком.
  const rare = dimsAll.filter((d) => stateOf(d) === 'all-zero').map((d) => d.slug);

  const seen = { none: 0, rated: 0, 'all-zero': 0 };
  let wrongText = 0;
  let pretending = 0;
  let noDoor = 0;
  let brandLost = 0;
  let firstBad = '';

  for (const lang of LANGS) {
    const files = new Set(sample(lang));
    for (const slug of rare) if (existsSync(join(BUILD, lang, 'dimension', `${slug}.html`))) files.add(`${slug}.html`);

    for (const f of files) {
      const slug = f.replace(/\.html$/, '');
      const d = bySlugAll.get(slug);
      if (!d) continue;
      const want = stateOf(d);
      const html = read(lang, f);
      const door = html.match(/<section class="door[\s\S]*?<\/section>/i)?.[0] ?? '';
      if (!door) {
        noDoor += 1;
        continue;
      }
      if (lang === 'ru') seen[want] += 1;
      const text = visible(door);

      // 1. Дверь говорит текст СВОЕГО состояния.
      if (!text.includes(MARKS[lang][want])) {
        wrongText += 1;
        if (!firstBad) firstBad = `${lang}/${slug}: ждали состояние «${want}»`;
      }
      // 2. И не говорит текст ЧУЖОГО — иначе одно состояние притворяется другим.
      for (const other of STATES) {
        if (other !== want && text.includes(MARKS[lang][other])) {
          pretending += 1;
          if (!firstBad) firstBad = `${lang}/${slug}: состояние «${want}» говорит текстом «${other}»`;
        }
      }
      /*
       * 3. 🏷 NDSR НАЗВАН ПОЛНЫМ ИМЕНЕМ И НЕ ПЕРЕВЕДЁН — на обоих языках одинаково. Имя бренда
       * не переводится ни на один язык (слово владельца 2026-08-03), а на этих страницах оно
       * для незнакомца — единственное касание с продуктом.
       */
      if (!text.includes('NDim Space Rating')) {
        brandLost += 1;
        if (!firstBad) firstBad = `${lang}/${slug}: в двери нет полного имени NDSR`;
      }
    }
  }

  check('блок-дверь есть на каждой проверенной странице', noDoor === 0, `без двери: ${noDoor}`);
  check('дверь говорит текст СВОЕГО состояния', wrongText === 0,
    `нарушений: ${wrongText}${firstBad && wrongText ? ` (${firstBad})` : ''}`);
  check('ни одно состояние НЕ притворяется другим', pretending === 0,
    `нарушений: ${pretending}${firstBad && pretending ? ` (${firstBad})` : ''}`);
  check('🏷 «NDim Space Rating» назван полным именем в двери на ОБОИХ языках', brandLost === 0,
    `нарушений: ${brandLost}`);
  check('состояния «нет голосов» и «есть оценка» реально наблюдались',
    seen.none > 0 && seen.rated > 0, `нет голосов ${seen.none} · есть оценка ${seen.rated}`);
  /*
   * Третье состояние проверяется ровно тогда, когда оно есть в каталоге: сегодня таких объектов
   * два, завтра может не быть ни одного — и это не поломка продукта. Молчать о нуле наблюдений
   * при этом нельзя, поэтому число печатается всегда.
   */
  if (rare.length) {
    check('🔴 состояние «все поставили ноль» наблюдалось на собранных страницах',
      seen['all-zero'] > 0, `в каталоге ${rare.length}, наблюдений ${seen['all-zero']}: ${rare.join(' · ')}`);
  } else {
    console.log('  ℹ в каталоге нет объектов «все поставили ноль» — состояние не наблюдалось');
  }
}

// ── Место объекта в своём виде (интервью №036, В5 — «ставим всем, у кого есть оценка») ──────
console.log('\n— место объекта среди оценённых своего вида —');
{
  /*
   * 🔴 ЭТО ПРОВЕРКА ПАРЫ «ИСТИНА ↔ ЗЕРКАЛО», а не наличия строки. Одно и то же число человек
   * видит в ДВУХ местах: номером строки на странице хаба и строкой «Место» на карточке. Страж
   * пересчитывает места ТЕМ ЖЕ кодом, которым их считает продукт (`groupByKind` + `placesIn`),
   * и сверяет с числом, которое реально стоит в отданном HTML. Проверка «строка есть» пропустила
   * бы расхождение, а расхождение означает, что две публичные поверхности говорят об одном
   * объекте разное.
   *
   * ⛔ Порога по месту НЕТ — решение владельца (№036 В5). Поэтому здесь же стережётся и обратное:
   * ни одной страницы с голосами, где строка места пропала бы «сама».
   */
  const items = dimsAll.map((d) => ({
    slug: d.slug,
    type: d.type,
    rating: d.rating ?? 0,
    rates: d.rates ?? 0,
  }));
  const { hubs } = groupByKind(items);
  const truth = new Map();
  for (const list of hubs.values()) for (const [slug, p] of placesIn(list)) truth.set(slug, p);

  let missing = 0;
  let atZero = 0;
  let mismatch = 0;
  let matched = 0;
  let firstBad = '';

  for (const f of sample('ru')) {
    const slug = f.replace(/\.html$/, '');
    const d = bySlugAll.get(slug);
    if (!d) continue;
    const text = visible(read('ru', f));
    const m = text.match(/(\d+)-е среди (\d+) оценённых/);
    const want = truth.get(slug);

    if ((d.rates ?? 0) === 0) {
      if (m) atZero += 1;
      continue;
    }
    if (!want) continue; // хвостовой вид: места среди 25 не бывает — это не поломка
    if (!m) {
      missing += 1;
      if (!firstBad) firstBad = slug;
      continue;
    }
    if (Number(m[1]) !== want.rank || Number(m[2]) !== want.of) {
      mismatch += 1;
      if (!firstBad) firstBad = `${slug}: страница «${m[1]} среди ${m[2]}», каталог «${want.rank} среди ${want.of}»`;
      continue;
    }
    matched += 1;
  }

  check('строка места ЕСТЬ у всех оценённых объектов известных видов', missing === 0,
    `нарушений: ${missing}${firstBad && missing ? ` (${firstBad})` : ''}`);
  check('строки места НЕТ там, где голосов нет', atZero === 0, `нарушений: ${atZero}`);
  check('число на карточке совпадает с местом в хабе', mismatch === 0,
    `сверено ${matched}${mismatch ? `, расхождений ${mismatch}: ${firstBad}` : ''}`);
  check('сверка вообще состоялась', matched > 0, `страниц с местом: ${matched}`);
}

// ── Языковые адреса: hreflang двусторонний, lang честный ────────────────────
console.log('\n— языковые адреса (интервью №010, Р5 = В) —');
{
  let badLang = 0;
  let badCanonical = 0;
  let badAlt = 0;
  let noXDefault = 0;
  let englishMissing = 0;

  for (const lang of LANGS) {
    for (const f of sample(lang)) {
      const html = read(lang, f);
      if (!new RegExp(`<html lang="${lang}"`).test(html)) badLang += 1;
      if (!html.includes(`rel="canonical" href="https://ndimspace.app/${lang}/dimension/`)) badCanonical += 1;
      // Двусторонность: страница обязана называть ОБА языка, включая себя.
      for (const l of LANGS) {
        if (!html.includes(`hreflang="${l}" href="https://ndimspace.app/${l}/dimension/`)) badAlt += 1;
      }
      if (!html.includes('hreflang="x-default"')) noXDefault += 1;
    }
  }
  // Главный приз фазы: английский в отдаваемом HTML. До неё его не было ни знака
  // (`researches/26` §1.2).
  for (const f of sample('en')) {
    const text = visible(read('en', f));
    if (!/[A-Za-z]{4,}\s+[A-Za-z]{4,}\s+[A-Za-z]{4,}/.test(text)) englishMissing += 1;
  }

  check('<html lang> совпадает с языком адреса', badLang === 0, `расхождений: ${badLang}`);
  check('canonical указывает на СВОЙ языковой адрес', badCanonical === 0, `нарушений: ${badCanonical}`);
  check('hreflang ДВУСТОРОННИЙ и с самоссылкой', badAlt === 0, `пропусков: ${badAlt}`);
  check('x-default объявлен', noXDefault === 0, `без x-default: ${noXDefault}`);
  check('на английских страницах ЕСТЬ английский текст', englishMissing === 0, `пустых: ${englishMissing}`);
}

// ── Чего на странице быть НЕ должно ─────────────────────────────────────────
console.log('\n— чего быть не должно —');
{
  let images = 0;
  let banned = 0;
  let noBlock = 0;
  let noUp = 0;
  let percents = 0;
  for (const lang of LANGS) {
    for (const f of sample(lang)) {
      const html = read(lang, f);
      // Изображений произведения нет — авторское право (интервью №020). Значок сайта и
      // инлайновая графика оболочки не в счёт: ищем именно картинки в статье.
      if (/<article[\s\S]*?<img\s/i.test(html)) images += 1;
      /*
       * 🔄 ПРАВИЛО ОБНОВЛЕНО 2026-08-14 (интервью №025, В7 = А). Блок соседства ПО
       * КЛАССИФИКАЦИИ разрешён и построен (`plans/48` шаг 4) — прежняя проверка «блока нет»
       * противоречила бы слову владельца. Что осталось запретным и стережётся здесь:
       * формулировка «Рядом в Пространстве» (она про людей и про математику) и любое число
       * похожести внутри блока.
       */
      if (/Рядом в Пространстве|Near in the Space/i.test(html)) banned += 1;
      const block = html.match(/<nav class="similar[\s\S]*?<\/nav>/i)?.[0] ?? '';
      if (!block) noBlock += 1;
      // Внутри блока допустимы только название и год: процент — это метрика похожести.
      else if (/\d\s*%/.test(block)) percents += 1;
      /*
       * Ссылка вверх — на ней держится критерий «≥3 входящих».
       * ⚠️ Ведёт она НЕ ВСЕГДА в хаб: у объектов хвостовых видов хаба нет по порогу ≥20, и они
       * поднимаются в индекс каталога. Первая редакция этой проверки требовала `/catalog/{kind}`
       * и покраснела на двух страницах — на исправном продукте.
       */
      if (!/<p class="up[^"]*"><a href="\/(ru|en)\/catalog(\/|")/i.test(html)) noUp += 1;
    }
  }
  check('ни одного изображения произведения', images === 0, `страниц с картинкой: ${images}`);
  check('запретной формулировки «Рядом в Пространстве» нет', banned === 0, `страниц с ней: ${banned}`);
  check('блок «Похожие по каталогу» есть на КАЖДОЙ странице', noBlock === 0, `без блока: ${noBlock}`);
  check('в блоке соседей НЕТ ни одного процента похожести', percents === 0, `страниц с числом: ${percents}`);
  check('ссылка вверх — в хаб своего вида', noUp === 0, `без ссылки вверх: ${noUp}`);
}

// ── Вес клиентского бандла ──────────────────────────────────────────────────
console.log('\n— каталог НЕ уехал в браузер —');
{
  /**
   * 🔴 Строка добавлена по следам `EXP-0136`. Первая редакция загрузчика была универсальной
   * (`+page.ts`), и Vite вшил весь каталог в клиентский бандл: чанк узла **16,86 МБ**. Все 22
   * проверки выше при этом были ЗЕЛЁНЫМИ — они смотрели на `build/*.html`. Дефект нашёлся по
   * случайному совпадению слов в чужом стороже.
   * **Вывод, ради которого эта проверка существует: у сборки обязан быть страж ВЕСА, а не
   * только содержания.**
   */
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
    );
  const appDir = join(BUILD, '_app');
  const total = existsSync(appDir)
    ? walk(appDir).reduce((s, f) => s + statSync(f).size, 0)
    : 0;
  const mb = total / 1024 / 1024;
  // Порог с запасом: сегодня 1,3 МБ. Каталог весит 17 МБ — промах будет виден мгновенно.
  check('клиентский бандл меньше 3 МБ', mb < 3, `${mb.toFixed(1)} МБ`);

  const nodesDir = join(appDir, 'immutable', 'nodes');
  if (existsSync(nodesDir)) {
    const biggest = readdirSync(nodesDir)
      .map((f) => ({ f, size: statSync(join(nodesDir, f)).size }))
      .sort((a, b) => b.size - a.size)[0];
    check('ни один чанк страницы не раздут данными (< 500 КБ)', biggest.size < 500 * 1024,
      `крупнейший ${biggest.f} — ${(biggest.size / 1024).toFixed(1)} КБ`);
  }
}

// ── Карта сайта ─────────────────────────────────────────────────────────────
console.log('\n— карта сайта —');
{
  const p = join(BUILD, 'sitemap.xml');
  if (!existsSync(p)) {
    check('sitemap.xml собран', false);
  } else {
    const xml = readFileSync(p, 'utf8');
    const locs = xml.match(/<loc>/g)?.length ?? 0;
    const dimLocs = (xml.match(/\/dimension\//g) ?? []).length;
    const expected = pages.ru.length + pages.en.length;
    check('sitemap.xml собран', true, `${locs} адресов`);
    check('в карте ВСЕ страницы каталога', dimLocs === expected, `${dimLocs} против ${expected}`);
    check('карта влезает в предел 50 000 адресов', locs <= 50000, `${locs}`);
    check('карта влезает в предел 50 МБ', Buffer.byteLength(xml, 'utf8') <= 50 * 1024 * 1024,
      `${(Buffer.byteLength(xml, 'utf8') / 1024 / 1024).toFixed(2)} МБ`);
  }
}

console.log(`\n${failed ? '🔴' : '✅'} ИТОГ: ${passed} прошло, ${failed} провалов\n`);
process.exit(failed ? 1 : 0);

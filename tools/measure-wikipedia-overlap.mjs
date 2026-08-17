/**
 * СВЕРКА ОПИСАНИЙ КАТАЛОГА С ВИКИПЕДИЕЙ — МАШИНОЙ, А НЕ ГЛАЗАМИ.
 *
 * Заказ владельца 2026-08-16, дословно: «*Если ты собираешься каждую страницу вики
 * самостоятельно ветчикть и читать — мы год будем всё исправлять. Пиши скрипт*».
 *
 * Он прав арифметически: 5111 записей × 2 языка вручную — это годы. Прибор делает ту же работу,
 * что я делал руками: находит статью, берёт её текст и МЕРЯЕТ совпадение.
 *
 * 🔴 ЧТО ИМЕННО МЕРИТСЯ — «САМЫЙ ДЛИННЫЙ ДОСЛОВНЫЙ РЯД», а не «процент похожести».
 * Процент похожести на статью о том же фильме высок всегда: там те же имена, тот же год, тот же
 * сюжет — и он не отличает пересказ от копии. Ряд подряд идущих слов отличает: пересказ не даёт
 * двадцати слов подряд, копия даёт. Порог взят из поля, а не из головы: **10 слов** — им я судил
 * шесть подтверждённых английских и два русских случая (`plans/56` шаг 3).
 *
 * 🔴 СЕТЕВОЙ ОТКАЗ — ЭТО НЕ «ЧИСТО». Статья не найдена, API не ответил, текст пуст — запись
 * помечается `unverified` и НИКОГДА не попадает в «чистые». Это ровно класс `EXP-0165`:
 * «нет записи» есть утверждение о ПОИСКЕ, а не о мире. Итог прогона печатает три числа отдельно:
 * найдено · чисто · НЕ ПРОВЕРЕНО.
 *
 * ⚠️ ПРИБОР НИЧЕГО НЕ ПРАВИТ. Его выход — отчёт и машиночитаемый список; правки пишет агент, а
 * записывает `tools/rewrite-catalog-descriptions.mjs`. Разделение намеренное: находка и правка —
 * разные ответственности, и смешивать их в одном прогоне значит править не глядя.
 *
 * Запуск:
 *   node tools/measure-wikipedia-overlap.mjs --lang ru --limit 200
 *   node tools/measure-wikipedia-overlap.mjs --lang en --from 200 --limit 200
 *   node tools/measure-wikipedia-overlap.mjs --slug two-for-the-money-1myjyafy --lang ru
 *   node tools/measure-wikipedia-overlap.mjs --selftest        # без сети
 *
 * Прогон возобновляемый: ответы Википедии кладутся в `test-results/wiki-cache/` (вне git), и
 * повторный запуск по тем же записям сети не касается. Поэтому большой каталог берётся частями:
 * упал прогон — продолжаешь с `--from`, уже скачанное не перекачивается.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const SNAPSHOT = 'src/lib/content/dims-build.json';
const CACHE = 'test-results/wiki-cache';
const OUT_MD = (lang) => `researches/34_${lang}_wikipedia_overlap.md`;
const OUT_JSON = (lang) => `test-results/wiki-overlap-${lang}.json`;

/** Порог, которым судим. Взят из поля: им отделены 8 подтверждённых случаев от чистых текстов. */
export const RUN_THRESHOLD = 10;

/** Вежливость к чужому сервису: пауза между запросами и честное имя в User-Agent. */
const DELAY_MS = 300;
const UA = 'NDimSpace-catalog-audit/1.0 (https://ndimspace.app; catalog text originality check)';

// ── ЯДРО: измеримая часть, работающая БЕЗ СЕТИ ──────────────────────────────────────────────

/**
 * Слова текста в сравнимом виде: без регистра, без пунктуации, без разметки.
 *
 * 🔑 Ё приводится к Е намеренно: «режиссёра» и «режиссера» — одно слово, а не разные, и текст,
 * скопированный с заменой одной буквы, обязан остаться пойманным.
 */
export function words(text) {
  return String(text)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/**
 * Самый длинный общий ряд ПОДРЯД идущих слов — классическая динамика по двум последовательностям.
 *
 * Возвращает `{ length, text }`: длину в словах и сам ряд, чтобы отчёт показывал улику дословно,
 * а не число. Улику владелец и агент читают глазами; число только сортирует список.
 *
 * Память держится одной строкой таблицы (`prev`/`cur`), поэтому статья на 10 000 слов против
 * описания на 200 считается мгновенно и без риска съесть кучу.
 */
export function longestCommonRun(aWords, bWords) {
  if (!aWords.length || !bWords.length) return { length: 0, text: '' };
  let prev = new Uint32Array(bWords.length + 1);
  let cur = new Uint32Array(bWords.length + 1);
  let best = 0;
  let endA = 0;
  for (let i = 1; i <= aWords.length; i += 1) {
    for (let j = 1; j <= bWords.length; j += 1) {
      cur[j] = aWords[i - 1] === bWords[j - 1] ? prev[j - 1] + 1 : 0;
      if (cur[j] > best) {
        best = cur[j];
        endA = i;
      }
    }
    const swap = prev;
    prev = cur;
    cur = swap;
    cur.fill(0);
  }
  return { length: best, text: aWords.slice(endA - best, endA).join(' ') };
}

/**
 * Доля n-грамм описания, которые встречаются в статье. Дополняет длинный ряд, а не заменяет его:
 * текст, собранный из ДЕСЯТКА коротких чужих кусков, длинного ряда не даст, а по доле выделится.
 */
export function sharedShingles(aWords, bWords, n = 6) {
  if (aWords.length < n) return 0;
  const inB = new Set();
  for (let i = 0; i + n <= bWords.length; i += 1) inB.add(bWords.slice(i, i + n).join(' '));
  let hit = 0;
  let total = 0;
  for (let i = 0; i + n <= aWords.length; i += 1) {
    total += 1;
    if (inB.has(aWords.slice(i, i + n).join(' '))) hit += 1;
  }
  return total ? hit / total : 0;
}

/**
 * СЛУЖЕБНЫЕ СЛОВА — ими отличается СВЯЗНАЯ РЕЧЬ от ПЕРЕЧНЯ НАЗВАНИЙ.
 *
 * 🔴 Зачем это здесь. Первый рабочий прогон дал «ряд 32 слова» у Канье Уэста — и это оказался
 * список альбомов с годами: «late registration 2005 graduation 2007 808s heartbreak 2008…».
 * Совпадение стопроцентное и неустранимое: альбомы нельзя переименовать. То же у Pink Floyd,
 * Tomb Raider, Kimbra. Длина ряда сама по себе не отличает копию от перечня.
 *
 * Отличает связность: в скопированном ПРЕДЛОЖЕНИИ есть предлоги, союзы и связки, в перечне
 * названий их почти нет. Порог доли служебных слов — 0,15; ниже него ряд объявляется перечнем
 * имён, а не заимствованием. Это машинная форма того самого правила, которое я объявил словами:
 * «дословный ряд, НЕ являющийся именем собственным или неизбежным обозначением».
 */
const FUNCTION_WORDS = new Set([
  'в', 'во', 'и', 'с', 'со', 'на', 'по', 'к', 'у', 'о', 'об', 'от', 'до', 'за', 'из', 'для', 'при',
  'что', 'как', 'а', 'но', 'же', 'не', 'его', 'её', 'их', 'он', 'она', 'они', 'это', 'году', 'года',
  'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'by', 'with', 'from', 'and', 'or', 'but',
  'is', 'are', 'was', 'were', 'his', 'her', 'their', 'its', 'who', 'which', 'that', 'as', 'after',
]);

/** Доля служебных слов в ряду: мера того, речь это или перечень. */
export function functionWordShare(runText) {
  const w = String(runText).split(' ').filter(Boolean);
  if (!w.length) return 0;
  return w.filter((x) => FUNCTION_WORDS.has(x)).length / w.length;
}

/**
 * Вердикт по одной записи. Четыре исхода, и два из них — не приговор:
 * `unverified` (дорога не прошла) и `names` (совпал перечень названий, а не речь).
 */
export function verdictOf({ run, shingles, articleWords, runText = '' }) {
  if (articleWords === null) return 'unverified';
  if (run >= RUN_THRESHOLD) return looksLikeList(runText) ? 'names' : 'copied';
  if (shingles >= 0.15) return 'suspect';
  return 'clean';
}

/**
 * Признаки ПЕРЕЧНЯ, а не речи — их два, и второй появился потому, что первого не хватило.
 *
 *   1. **мало служебных слов** — перечень имён связок не содержит;
 *   2. **три и более года в одном ряду** — подпись дискографии или серии игр: «the dark side of
 *      the moon 1973 wish you were here 1975 animals 1977». Первый признак их пропускал:
 *      английские названия сами несут «the» и «of», и доля служебных слов выходила выше порога.
 *
 * Одного года мало и он ничего не значит: «фильм 2005 года режиссёра…» — обычная речь, и ровно
 * такие ряды и есть настоящие копии.
 */
export function looksLikeList(runText) {
  /*
   * 🔴 ПОРОГ 0,10, А НЕ 0,15 — понижен ЗАМЕРОМ 2026-08-17, и вот случай, который его понизил.
   * У «Матрицы» дословный ряд в 30 слов СВЯЗНОЙ РЕЧИ («научно-фантастический боевик,
   * поставленный братьями Вачовски по собственному сценарию…») даёт долю служебных слов 0,133 —
   * то есть при пороге 0,15 настоящая копия объявлялась бы «перечнем имён» и уходила из списка.
   * Копия, замаскированная под имя, — худший вид промаха: запись покидает очередь не потому, что
   * вылечена.
   *
   * Перечни при этом не пострадали: дискографии и серии игр ловятся ВТОРЫМ признаком (три и более
   * года в ряду), а у Канье Уэста доля 0,09 — ниже нового порога тоже.
   */
  if (functionWordShare(runText) < 0.1) return true;
  const years = String(runText).match(/\b(19|20)\d{2}\b/g) ?? [];
  return years.length >= 3;
}

/**
 * СОБСТВЕННОЕ НАЗВАНИЕ ОБЪЕКТА — не заимствование, сколько бы слов в нём ни было.
 *
 * Поймано первым большим сводом: «Властелин колец: Возвращение короля» дал ряд в 10 слов —
 * «the lord of the rings the return of the king». Это ИМЯ фильма, стоящее и у нас, и в статье;
 * назвать его копией значит потребовать переименовать произведение.
 *
 * Проверка точная, а не эвристическая: ряд сравнивается с названием объекта на обоих языках,
 * и если он в них укладывается — это имя. Признак «мало служебных слов» здесь не срабатывает
 * как раз потому, что английские названия полны артиклей и предлогов.
 */
/**
 * РЯД ВНУТРИ КАВЫЧЕК — ЦИТАТА, А НЕ ЗАИМСТВОВАНИЕ.
 *
 * Поймано ночью 2026-08-17 на «Panda Plan»: агент правильно снял одну цитату, ряд по которой шёл,
 * и СОХРАНИЛ дословно вторую — цитату Пола Брэмхолла. Ворота отклонили правку за «ряд 37 слов»,
 * хотя это ровно та цитата, которую и мы, и Википедия приводим ОДИНАКОВО, потому что так сказал
 * человек. Переписать её значило бы приписать критику чужие слова.
 *
 * Признак прямой: ряд целиком лежит внутри кавычек нашего текста. Кавычки берутся все, какие
 * встречаются в каталоге: « », " ", “ ”.
 */
export function isInsideQuotes(runText, ourText) {
  const run = words(runText).join(' ');
  if (!run) return false;
  const цитаты = String(ourText).match(/«[^»]{20,}»|"[^"]{20,}"|“[^”]{20,}”/g) ?? [];
  return цитаты.some((q) => words(q).join(' ').includes(run));
}

export function isOwnTitle(runText, dim) {
  const run = String(runText).trim();
  if (!run) return false;
  for (const lang of ['ru', 'en']) {
    const t = words(dim.title?.[lang] ?? '').join(' ');
    if (t && (t.includes(run) || run.includes(t))) return true;
  }
  return false;
}

// ── САМОТЕСТ: ядро проверяется на ПОДТВЕРЖДЁННЫХ полем случаях ──────────────────────────────
if (process.argv.includes('--selftest')) {
  /*
   * Образцы не выдуманы: это настоящие пары «наш текст ↔ Википедия», подтверждённые сверкой
   * вручную 2026-08-16. Прибор обязан согласиться с человеком на них — иначе его числам нельзя
   * верить на остальных 5111.
   */
  const cases = [
    {
      имя: '«Деньги на двоих» — подтверждённая копия',
      наш: 'Американский спортивный драматический фильм 2005 года режиссёра Ди Джея Карузо с Аль Пачино, Мэттью Макконахи и Рене Руссо в главных ролях.',
      вики: 'Деньги на двоих — американский спортивно-драматический кинофильм 2005 года режиссёра Ди Джея Карузо с Аль Пачино, Мэттью Макконахи, Рене Руссо и Карли Поуп в главных ролях.',
      ждём: 'copied',
    },
    {
      имя: '«Foyle’s War» — подтверждённая копия (английская)',
      наш: 'He is assisted by his driver, Samantha "Sam" Stewart (Honeysuckle Weeks), and Detective Sergeant Paul Milner (Anthony Howell), a former soldier who lost a leg in combat.',
      вики: 'Throughout the series, he is assisted by his driver, Samantha "Sam" Stewart (Honeysuckle Weeks), and Detective Sergeant Paul Milner (Anthony Howell).',
      ждём: 'copied',
    },
    {
      имя: '«Ромовый дневник» — проверен и ЧИСТ',
      наш: 'Съёмки проходили в Пуэрто-Рико в марте 2009 года, а премьера состоялась 28 октября 2011 года.',
      вики: 'В марте съёмочная группа отправилась в Пуэрто-Рико, где началось производство «Ромового дневника». Мировая премьера состоялась 13 октября 2011 года, премьера в России — 20 октября 2011 года.',
      ждём: 'clean',
    },
    {
      имя: 'статьи нет — обязан быть «не проверено», а НЕ «чисто»',
      наш: 'Любой текст про что угодно.',
      вики: null,
      ждём: 'unverified',
    },
  ];

  /*
   * Отдельный слой самотеста — РАЗЛИЧЕНИЕ «речь против перечня». Он существует потому, что порог
   * доли служебных слов однажды уже промахнулся: связная речь «Матрицы» (30 слов, доля 0,133)
   * уходила в «перечень имён» при пороге 0,15, то есть настоящая копия маскировалась под имя.
   * Эти три случая держат порог на месте: два перечня обязаны остаться перечнями, речь — речью.
   */
  const различение = [
    ['речь: «Матрица», 30 слов', 'научно фантастический боевик поставленный братьями вачовски по собственному сценарию и спродюсированный джоэлом сильвером главные роли исполнили киану ривз лоренс фишберн керри энн мосс и хьюго уивинг фильм вышел на экраны', false],
    ['перечень: дискография Канье', 'late registration 2005 graduation 2007 808s heartbreak 2008 my beautiful dark twisted fantasy 2010', true],
    ['перечень: альбомы Pink Floyd', 'the dark side of the moon 1973 wish you were here 1975 animals 1977', true],
  ];
  let bad = 0;
  for (const [имя, текст, ждём] of различение) {
    const ok = looksLikeList(текст) === ждём;
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✅' : '❌'} ${имя}: перечень=${looksLikeList(текст)} (доля служебных ${functionWordShare(текст).toFixed(3)})`);
  }
  for (const c of cases) {
    const a = words(c.наш);
    const b = c.вики === null ? null : words(c.вики);
    const run = b ? longestCommonRun(a, b) : { length: 0, text: '' };
    const sh = b ? sharedShingles(a, b) : 0;
    const got = verdictOf({ run: run.length, shingles: sh, articleWords: b ? b.length : null, runText: run.text });
    const ok = got === c.ждём;
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✅' : '❌'} ${c.имя}: «${got}» (ряд ${run.length} слов, n-граммы ${(sh * 100).toFixed(0)} %)`);
    if (run.length >= RUN_THRESHOLD) console.log(`      улика: «${run.text}»`);
  }
  console.log(bad ? `\n❌ самотест провален: ${bad}` : `\n✅ самотест пройден: ${cases.length} случая`);
  process.exit(bad ? 1 : 0);
}

// ── СЕТЕВАЯ ЧАСТЬ ───────────────────────────────────────────────────────────────────────────

/**
 * 🔴 СЕТЕВАЯ ЧАСТЬ НЕ ИСПОЛНЯЕТСЯ ПРИ ИМПОРТЕ, и это оплачено на себе.
 *
 * Ядро прибора экспортируется, чтобы его можно было позвать из другого скрипта или из теста.
 * Пока этой проверки не было, обычный `import { words } from …` ЗАПУСКАЛ полный свод: лез в сеть
 * и перетирал отчёт частичным прогоном. Молча — потому что выглядело это как нормальный вывод.
 *
 * Класс общий: файл, у которого есть и экспорт, и работа на верхнем уровне, обязан спрашивать,
 * запустили его или подключили.
 */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (!isMain) {
  // Подключили как модуль — отдаём только ядро.
} else {

const arg = (name, def = null) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const LANG = arg('--lang', 'ru');
const LIMIT = Number(arg('--limit', '100'));
const FROM = Number(arg('--from', '0'));
const ONLY = arg('--slug', null);

if (!['ru', 'en'].includes(LANG)) {
  console.error('--lang принимает только ru или en');
  process.exit(1);
}
mkdirSync(CACHE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Один запрос к API Википедии с кэшем на диск: повторный прогон сети не касается.
 *
 * 🔴 КЛЮЧ КЭША — ПОЛНЫЙ ХЕШ URL, И ЭТО ОПЛАЧЕНО ОШИБКОЙ. Здесь стоял base64 от адреса,
 * ОБРЕЗАННЫЙ до 120 знаков «чтобы имя файла было коротким». У запроса текста статьи первые
 * 95 знаков адреса одинаковы всегда — значит все статьи писались в ОДИН файл кэша, и весь
 * прогон сравнивал 100 разных описаний с одной и той же статьёй. Итог был «97 чистых», и
 * он выглядел совершенно правдоподобно.
 *
 * 🔑 Поймал это не глаз, а КОНТРОЛЬНЫЙ СЛУЧАЙ: прибор объявил чистыми два текста, про которые
 * уже доказано обратное. Обрезанный ключ — это тихая коллизия; без известного положительного
 * случая она осталась бы в отчёте как хорошая новость.
 */
async function api(params) {
  const url = `https://${LANG}.wikipedia.org/w/api.php?${new URLSearchParams({ ...params, format: 'json' })}`;
  const key = join(CACHE, `${LANG}-${createHash('sha256').update(url).digest('hex')}.json`);
  if (existsSync(key)) return JSON.parse(readFileSync(key, 'utf8'));
  await sleep(DELAY_MS);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  writeFileSync(key, JSON.stringify(data), 'utf8');
  return data;
}

/**
 * Текст статьи о объекте — или `null`, если статью найти не удалось.
 *
 * 🔑 Запрос строится из НАЗВАНИЯ НА НУЖНОМ ЯЗЫКЕ плюс вида и года: «Хуже, чем ложь фильм 2016».
 * Без вида и года поиск сваливается на однофамильцев — а мы сравнивали бы наш текст со статьёй
 * о другом произведении и печатали бы «чисто» с чистой совестью.
 */
async function articleText(dim) {
  const title = dim.title?.[LANG];
  if (!title) return null;
  const kind = dim.type?.[LANG] ?? '';
  const year = dim.year && dim.year !== '-' ? dim.year : '';
  const search = await api({ action: 'query', list: 'search', srsearch: `${title} ${kind} ${year}`.trim(), srlimit: '1' });
  const hit = search?.query?.search?.[0]?.title;
  if (!hit) return null;
  const page = await api({ action: 'query', prop: 'extracts', explaintext: '1', redirects: '1', titles: hit });
  const pages = page?.query?.pages ?? {};
  const first = Object.values(pages)[0];
  const extract = first?.extract ?? '';
  return extract ? { title: hit, text: extract } : null;
}

const dims = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));

/**
 * 🔴 ЖИВОЙ КОНТРОЛЬ — ПРОГОН ЦЕЛИКОМ ПО ИЗВЕСТНОМУ ПОЛОЖИТЕЛЬНОМУ СЛУЧАЮ, ПЕРЕД КАЖДЫМ СВОДОМ.
 *
 * Самотест проверяет арифметику, но не проверяет ДОРОГУ: поиск статьи, кэш, разбор ответа.
 * Ровно там прибор и ослеп в первый раз — обрезанный ключ кэша сваливал все статьи в один файл,
 * и прогон честно печатал «97 чистых». Арифметика при этом была безупречна.
 *
 * Поэтому перед каждым сводом прибор берёт запись, про которую ДОКАЗАНО, что она копия, и гонит
 * её по всей дороге. Не сошлось — прогон не начинается, потому что его числа ничего не значат.
 * Когда фаза вылечит этот текст, контроль упадёт: это сигнал перевесить его на другой доказанный
 * случай, а не снять.
 */
/*
 * 🔄 ПЕРЕВЕШЕН 2026-08-17 — и это ВТОРОЙ случай одного класса за сутки, теперь уже предсказанный
 * самим этим комментарием. Прежним контролем стояли «Деньги на двоих»; владелец записал ночную
 * партию, запись ВЫЛЕЧИЛАСЬ, и контроль честно упал: ряд 11 → 4.
 *
 * **Контроль, привязанный к дефекту, умирает вместе с дефектом.** Это не поломка и не повод снять
 * проверку — повод перевесить её на живой доказанный случай и записать, почему прежний ушёл.
 * Пока в каталоге остаются копии, живой контроль есть на чём держать; когда не останется —
 * держать его будет не на чем, и это будет хорошая новость, а не поломка прибора.
 */
const LIVE_CONTROL = { slug: 'the-terminator-isl2hxdu', lang: 'ru', minRun: 20 };

if (LANG === LIVE_CONTROL.lang && !ONLY) {
  const c = dims.find((d) => d.slug === LIVE_CONTROL.slug);
  const art = c ? await articleText(c).catch(() => null) : null;
  const run = art ? longestCommonRun(words(c.description[LANG]), words(art.text)).length : 0;
  if (run < LIVE_CONTROL.minRun) {
    console.error(
      `\n❌ ЖИВОЙ КОНТРОЛЬ НЕ ПРОШЁЛ: на «${LIVE_CONTROL.slug}» ожидался ряд ≥ ${LIVE_CONTROL.minRun} слов, ` +
        `получено ${run}. Дорога сломана (поиск статьи, кэш или разбор ответа) — числа прогона ` +
        'ничего не значат, свод не начат.',
    );
    process.exit(1);
  }
  console.log(`✅ живой контроль: «${LIVE_CONTROL.slug}» опознан копией (ряд ${run} слов)\n`);
}

const targets = (ONLY ? dims.filter((d) => d.slug === ONLY) : dims.slice(FROM, FROM + LIMIT)).filter(
  (d) => (d.description?.[LANG] ?? '').length > 0,
);

console.log(`\n═══ СВЕРКА С ВИКИПЕДИЕЙ (${LANG}) ═══`);
console.log(`Записей в прогоне: ${targets.length}${ONLY ? '' : ` (с ${FROM})`} · порог ряда: ${RUN_THRESHOLD} слов\n`);

const results = [];
let copied = 0;
let suspect = 0;
let clean = 0;
let unverified = 0;
let names = 0;

for (const [i, d] of targets.entries()) {
  let article = null;
  let error = null;
  try {
    article = await articleText(d);
  } catch (e) {
    error = String(e.message ?? e);
  }
  const ours = words(d.description[LANG]);
  const theirs = article ? words(article.text) : null;
  const run = theirs ? longestCommonRun(ours, theirs) : { length: 0, text: '' };
  const sh = theirs ? sharedShingles(ours, theirs) : 0;
  const базовый = verdictOf({ run: run.length, shingles: sh, articleWords: theirs ? theirs.length : null, runText: run.text });
  // Совпало собственное название объекта — это имя, а не заимствование (см. `isOwnTitle`).
  const verdict = базовый === 'copied' && isOwnTitle(run.text, d) ? 'names' : базовый;

  if (verdict === 'copied') copied += 1;
  else if (verdict === 'suspect') suspect += 1;
  else if (verdict === 'clean') clean += 1;
  else if (verdict === 'names') names += 1;
  else unverified += 1;

  results.push({
    slug: d.slug,
    title: d.title?.[LANG] ?? d.slug,
    article: article?.title ?? null,
    verdict,
    run: run.length,
    улика: run.text,
    shingles: Number(sh.toFixed(3)),
    error,
  });

  if (verdict === 'copied') console.log(`  🔴 ${d.slug} — ряд ${run.length} слов: «${run.text.slice(0, 90)}…»`);
  if ((i + 1) % 25 === 0) console.log(`  … ${i + 1} из ${targets.length}`);

  /*
   * ПРОМЕЖУТОЧНОЕ СОХРАНЕНИЕ каждые 100 записей. Кэш и так бережёт дорогое (скачанные статьи),
   * но разбор терялся целиком: машина владельца зависла на середине свода, и прогон не написал
   * ни строки, потому что писал только в конце. Работа, которая идёт час, обязана оставлять
   * след раньше своего конца.
   */
  if ((i + 1) % 100 === 0) writeFileSync(OUT_JSON(LANG), JSON.stringify(results, null, 1), 'utf8');
}

// Сортировка по длине ряда: сверху то, что чинить в первую очередь.
results.sort((a, b) => b.run - a.run);
writeFileSync(OUT_JSON(LANG), JSON.stringify(results, null, 1), 'utf8');

const md = [
  `# Сверка описаний каталога с Википедией — ${LANG.toUpperCase()}`,
  '',
  `> **Прибор:** \`tools/measure-wikipedia-overlap.mjs\` · **Порог:** дословный ряд от ${RUN_THRESHOLD} слов ·`,
  '> **Заказ владельца:** «пиши скрипт» (2026-08-16) — сверка машиной вместо чтения статей глазами.',
  '',
  `Записей в прогоне: **${targets.length}** · копий: **${copied}** · перечней имён: **${names}** · подозрительных: **${suspect}** ·`,
  `чистых: **${clean}** · 🔴 НЕ ПРОВЕРЕНО: **${unverified}**`,
  '',
  '⚠️ «Не проверено» — это НЕ «чисто»: статья не найдена либо сеть не ответила. Такие записи',
  'обязаны быть перепрогнаны, а не засчитаны (`EXP-0165`: «нет записи» — утверждение о поиске).',
  '',
  '| Запись | Статья | Вердикт | Ряд | Улика |',
  '|---|---|---|---|---|',
  ...results
    .filter((r) => r.verdict === 'copied' || r.verdict === 'suspect' || r.verdict === 'names')
    .map((r) => `| \`${r.slug}\` | ${r.article ?? '—'} | ${r.verdict} | ${r.run} | ${r.улика.slice(0, 120)} |`),
  '',
].join('\n');
writeFileSync(OUT_MD(LANG), md, 'utf8');

console.log(
  `\nкопий: ${copied} · перечней имён: ${names} · подозрительных: ${suspect} · ` +
    `чистых: ${clean} · 🔴 НЕ ПРОВЕРЕНО: ${unverified}`,
);
console.log(`отчёт: ${OUT_MD(LANG)}`);
console.log(`машиночитаемо: ${OUT_JSON(LANG)}`);
}

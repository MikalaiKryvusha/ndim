/**
 * ВОРОТА ПРАВОК — машинная приёмка того, что написали агенты.
 *
 * Зачем. Фан-аут переписывания вернул правки, а скептики забраковали ПАРТИЮ целиком из-за одной
 * плохой правки в ней. Так теряются годные: приговор вынесен пачке, а работа — поштучная.
 *
 * 🔴 И главное: вердикт агента — это МНЕНИЕ, а у нас есть ЧЕМ ИЗМЕРИТЬ. Остаточное совпадение с
 * Википедией считается тем же прибором, что нашёл проблему (`measure-wikipedia-overlap.mjs`), и
 * по тому же порогу. Мнение здесь лишнее.
 *
 * Что проверяется по каждой правке, и всё — механически:
 *   1. фрагмент `find` встречается в описании РОВНО ОДИН раз (иначе правка неоднозначна);
 *   2. ни одно число исходника не потеряно, маркеры справочного стиля в замене отсутствуют
 *      (`checkEdit` писаря — тот же код, что и при записи);
 *   3. 🔑 ОСТАТОЧНЫЙ ДОСЛОВНЫЙ РЯД с текстом статьи Википедии — МЕНЬШЕ порога. Это и есть
 *      настоящая приёмка: правка, оставившая 11 слов подряд, работы не сделала, как бы красиво
 *      она ни звучала.
 *
 * Статья берётся ИЗ КЭША свода (`test-results/wiki-cache/`) — сеть не нужна, приёмка мгновенна.
 * Нет статьи в кэше — правка отправляется в «не проверено», а НЕ в годные (`EXP-0165`).
 *
 * Запуск:
 *   node tools/gate-rewrites.mjs <журнал-прогона.jsonl> --lang ru --out tools/rewrites-06.json
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { words, longestCommonRun, RUN_THRESHOLD } from './measure-wikipedia-overlap.mjs';
import { checkEdit } from './rewrite-catalog-descriptions.mjs';

const arg = (n, d = null) => {
  const i = process.argv.indexOf(n);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const journal = process.argv[2];
const LANG = arg('--lang', 'ru');
const OUT = arg('--out', `tools/rewrites-gated-${LANG}.json`);
const CACHE = 'test-results/wiki-cache';

if (!journal || !existsSync(journal)) {
  console.error('нужен журнал прогона: node tools/gate-rewrites.mjs <journal.jsonl> --lang ru');
  process.exit(1);
}

const dims = JSON.parse(readFileSync('src/lib/content/dims-build.json', 'utf8'));
const bySlug = new Map(dims.map((d) => [d.slug, d]));

/**
 * Статья объекта — ИЗ КЭША свода, по тому же ключу, каким её туда положили.
 *
 * 🔴 Первая редакция искала статью по НАШЕМУ названию объекта и не находила почти ничего: в кэше
 * лежит название статьи ВИКИПЕДИИ, а оно другое («Мендес, Шон» против «Shawn Mendes»). Ворота
 * честно отправили 27 правок из 59 в «не проверено» — и это правильное поведение при непонятной
 * дороге, но чинить надо дорогу.
 *
 * Ключ восстанавливается точно так же, как в своде: адрес запроса → sha256. Сеть не нужна.
 */
const ключ = (params) => {
  const url = `https://${LANG}.wikipedia.org/w/api.php?${new URLSearchParams({ ...params, format: 'json' })}`;
  return join(CACHE, `${LANG}-${createHash('sha256').update(url).digest('hex')}.json`);
};
const изКэша = (params) => {
  const f = ключ(params);
  if (!existsSync(f)) return null;
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};
const статьяДля = (d) => {
  const title = d.title?.[LANG];
  if (!title) return null;
  const kind = d.type?.[LANG] ?? '';
  const year = d.year && d.year !== '-' ? d.year : '';
  const s = изКэша({ action: 'query', list: 'search', srsearch: `${title} ${kind} ${year}`.trim(), srlimit: '1' });
  const hit = s?.query?.search?.[0]?.title;
  if (!hit) return null;
  const p = изКэша({ action: 'query', prop: 'extracts', explaintext: '1', redirects: '1', titles: hit });
  const page = p?.query?.pages ? Object.values(p.query.pages)[0] : null;
  return page?.extract ? { title: hit, words: words(page.extract) } : null;
};

const записи = readFileSync(journal, 'utf8')
  .trim()
  .split('\n')
  .map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  })
  .filter((x) => x && x.type === 'result' && x.result && Array.isArray(x.result.edits));

const все = записи.flatMap((r) => r.result.edits);
console.log(`\n═══ ВОРОТА ПРАВОК (${LANG}) ═══`);
console.log(`правок из журнала: ${все.length}`);

const годные = [];
const брак = [];
let непроверено = 0;
let частично = 0;

for (const e of все) {
  const d = bySlug.get(e.slug);
  if (!d) {
    брак.push({ ...e, беда: 'нет в снимке каталога' });
    continue;
  }
  const текст = d.description?.[LANG] ?? '';
  const кусков = текст.split(e.find).length - 1;
  if (кусков !== 1) {
    брак.push({ ...e, беда: `фрагмент найден ${кусков} раз(а), нужен ровно 1` });
    continue;
  }
  const after = текст.split(e.find).join(e.replace);
  const проблемы = checkEdit({ ...e, before: текст, after, lang: LANG });
  if (проблемы.length) {
    брак.push({ ...e, беда: проблемы.join(' · ') });
    continue;
  }

  // Остаточное совпадение — по статье из кэша.
  const статья = статьяДля(d);
  if (!статья) {
    непроверено += 1;
    брак.push({ ...e, беда: 'статьи нет в кэше — НЕ ПРОВЕРЕНО, а не годно' });
    continue;
  }
  const остаток = longestCommonRun(words(e.replace), статья.words);
  if (остаток.length >= RUN_THRESHOLD) {
    брак.push({ ...e, беда: `остался дословный ряд ${остаток.length} слов: «${остаток.text.slice(0, 70)}»` });
    continue;
  }

  /*
   * 🔴 И ГЛАВНАЯ ПРОВЕРКА — ПО ВСЕЙ ЗАПИСИ, А НЕ ПО ФРАГМЕНТУ. Её потребовал скептик фан-аута, и
   * он был прав: копия часто ПЕРЕСЕКАЕТ ГРАНИЦУ ПРЕДЛОЖЕНИЯ, поэтому чистая правка одного
   * предложения оставляет запись копией. Английский случай `corrective-measures`: ряд 44 слова
   * ДО правки и 44 ПОСЛЕ — самый длинный ряд лежал в СОСЕДНЕМ предложении.
   *
   * Такая правка не брак — она честная и делает свою часть работы. Но объявить запись
   * вылеченной нельзя, поэтому она уходит в годные С ПОМЕТКОЙ, а сводка называет число отдельно.
   */
  const целиком = longestCommonRun(words(after), статья.words);
  const вылечена = целиком.length < RUN_THRESHOLD;
  if (!вылечена) частично += 1;
  годные.push({
    slug: e.slug,
    lang: LANG,
    find: e.find,
    replace: e.replace,
    why: вылечена ? e.why : `${e.why} ⚠️ ЗАПИСЬ ОСТАЁТСЯ КОПИЕЙ: после правки в описании ещё ${целиком.length} слов подряд («${целиком.text.slice(0, 60)}…») — нужна вторая правка.`,
  });
}

writeFileSync(OUT, JSON.stringify(годные, null, 1), 'utf8');

console.log(`  ✅ годных: ${годные.length}`);
console.log(`  ⚠️ из них ЗАПИСЬ ОСТАЁТСЯ КОПИЕЙ (ряд в соседнем предложении): ${частично}`);
console.log(`  ❌ брака: ${брак.length}${непроверено ? ` (из них НЕ ПРОВЕРЕНО: ${непроверено})` : ''}`);
for (const b of брак.slice(0, 12)) console.log(`     ${b.slug}: ${b.беда}`);
console.log(`\nзаписано: ${OUT}`);

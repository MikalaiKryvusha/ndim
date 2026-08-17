/**
 * ПРИЁМКА ОПИСАНИЙ КАНДИДАТА — длина, строение и заимствование, МАШИНОЙ (`bugs/139`).
 *
 * Повод, словами владельца 2026-08-17: «*Я почитал тех кандидатов, что ты написал — мне не нравится
 * скупой объём и стиль текста. Я писал более вики подобно, академически. Ты пишешь как какой-то
 * рассказ, или сообщение другу — неверно. Мы: мини википедия*» и «*мы должны писать в вики подобном
 * стиле, но своими словами, своими формулировками, чтобы не попадать 1 в 1 побайтно в википедию*».
 *
 * 🔴 ДВА ТРЕБОВАНИЯ ТЯНУТ В РАЗНЫЕ СТОРОНЫ, И ИМЕННО ПОЭТОМУ НУЖНА МАШИНА. «Вики-подобно» толкает
 * текст к формулировкам статьи; «своими словами» это запрещает. Разделить их обещанием нельзя —
 * владелец сам сказал, что в его собственных старых текстах копипаста есть. Поэтому:
 *   · ОБЪЁМ и СТРОЕНИЕ мерятся здесь числами (границы взяты из его же текстов, см. ниже);
 *   · ЗАИМСТВОВАНИЕ мерится ТЕМ ЖЕ ядром, что свод каталога (`measure-wikipedia-overlap.mjs`) —
 *     самый длинный ДОСЛОВНЫЙ РЯД при пороге 10 слов. Вторая мера разъехалась бы с первой.
 *
 * ⛔ ЧЕГО ПРИБОР НЕ ДЕЛАЕТ. Он не судит, «похоже ли это на статью Николая»: это вкус автора, и
 * решает его он сам. Прибор закрывает ровно то, что проверяемо, и говорит об этом вслух — иначе
 * зелёный прогон читался бы как приёмка владельцем.
 *
 * ГРАНИЦЫ ЧИСЕЛ — ИЗ ЕГО СОБСТВЕННЫХ ТЕКСТОВ, а не из головы. Замер 2026-08-17 по снимку каталога:
 * «Матрица» 862 знака · «Перезагрузка» 1049 · «Революция» 1071 · «Воскрешение» 1406 ·
 * «Аниматрица» 1740. Средняя запись каталога — 1068 знаков, самая короткая из 5111 — 313.
 * Отсюда рабочий коридор 900…1400 и 8…14 предложений.
 *
 * Запуск:
 *   node tools/check-candidate-descriptions.mjs candidates/batches/01_2026_films.json
 *   node tools/check-candidate-descriptions.mjs <файл> --lang ru      # только один язык
 *   node tools/check-candidate-descriptions.mjs --selftest            # без сети
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { words, longestCommonRun, RUN_THRESHOLD, looksLikeList } from './measure-wikipedia-overlap.mjs';

/** Коридор объёма, выведенный из текстов владельца (разбор в шапке). */
export const MIN_CHARS = 900;
export const MAX_CHARS = 1400;
export const MIN_SENTENCES = 8;
export const MAX_SENTENCES = 14;

/** Предложения считаем по конечным знакам. Сокращения вида «т. д.» здесь не встречаются. */
export function sentenceCount(text) {
  return String(text).split(/[.!?]+(?:\s|$)/u).filter((s) => s.trim().length > 0).length;
}

const CACHE = 'test-results/wiki-cache';
const DELAY_MS = 300;
const UA = 'NDimSpace-catalog-audit/1.0 (https://ndimspace.app; candidate text originality check)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── САМОТЕСТ: арифметика приёмки, без сети ──────────────────────────────────────────────────
if (process.argv.includes('--selftest')) {
  let bad = 0;
  const t = (ok, what) => {
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✅' : '❌'} ${what}`);
  };
  t(sentenceCount('Раз. Два! Три? Четыре.') === 4, 'предложения считаются по конечным знакам');
  t(sentenceCount('Одно предложение без точки') === 1, 'текст без точки — одно предложение');
  t(sentenceCount('') === 0, 'пустой текст — ноль предложений');
  // Контроль самой меры заимствования: она обязана поймать дословный ряд и пропустить пересказ.
  const наш = 'Научно-фантастический боевик братьев Вачовски: они же написали сценарий, продюсировал Джоэл Сильвер.';
  const копия = 'Научно-фантастический боевик братьев Вачовски: они же написали сценарий, продюсировал Джоэл Сильвер и никто другой.';
  const пересказ = 'Постановка братьев Вачовски вышла в прокат весной, продюсером выступил Джоэл Сильвер.';
  t(longestCommonRun(words(наш), words(копия)).length >= RUN_THRESHOLD, 'дословный ряд пойман');
  t(longestCommonRun(words(наш), words(пересказ)).length < RUN_THRESHOLD, 'пересказ не считается копией');
  console.log(bad ? `\n❌ самотест провален: ${bad}` : '\n✅ самотест пройден: 5 случаев');
  process.exit(bad ? 1 : 0);
}

// ── Разбор аргументов ───────────────────────────────────────────────────────────────────────
const FILE = process.argv[2];
if (!FILE || FILE.startsWith('--')) {
  console.error('Укажи файл партии: node tools/check-candidate-descriptions.mjs candidates/batches/01_2026_films.json');
  process.exit(2);
}
const argOf = (name, def = null) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const ONLY_LANG = argOf('--lang', null);
const LANGS = ONLY_LANG ? [ONLY_LANG] : ['ru', 'en'];

mkdirSync(CACHE, { recursive: true });

/** Один запрос к API Википедии с кэшем на диск. Ключ — ПОЛНЫЙ хеш адреса (`EXP`: обрезанный
 *  ключ однажды свалил все статьи в один файл и дал «97 чистых» на копиях). */
async function api(lang, params) {
  const url = `https://${lang}.wikipedia.org/w/api.php?${new URLSearchParams({ ...params, format: 'json' })}`;
  const key = join(CACHE, `${lang}-${createHash('sha256').update(url).digest('hex')}.json`);
  if (existsSync(key)) return JSON.parse(readFileSync(key, 'utf8'));
  await sleep(DELAY_MS);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  writeFileSync(key, JSON.stringify(data), 'utf8');
  return data;
}

/** Текст статьи об объекте или `null`. Запрос строится из названия, вида и года — без них поиск
 *  сваливается на однофамильцев, и мы сверяли бы текст с чужой статьёй. */
async function articleText(lang, c) {
  const title = c.title?.[lang];
  if (!title) return null;
  const kind = c.type?.[lang] ?? '';
  const year = c.year && c.year !== '-' ? c.year : '';
  const search = await api(lang, { action: 'query', list: 'search', srsearch: `${title} ${kind} ${year}`.trim(), srlimit: '1' });
  const hit = search?.query?.search?.[0]?.title;
  if (!hit) return null;
  const page = await api(lang, { action: 'query', prop: 'extracts', explaintext: '1', redirects: '1', titles: hit });
  const first = Object.values(page?.query?.pages ?? {})[0];
  return first?.extract ? { title: hit, text: first.extract } : null;
}

const batch = JSON.parse(readFileSync(FILE, 'utf8'));
const items = batch.candidates ?? [];

console.log('\n═══ ПРИЁМКА ОПИСАНИЙ КАНДИДАТОВ ═══');
console.log(`  файл: ${FILE} · записей: ${items.length} · языки: ${LANGS.join(', ')}`);
console.log(`  коридор объёма: ${MIN_CHARS}…${MAX_CHARS} знаков · ${MIN_SENTENCES}…${MAX_SENTENCES} предложений`);
console.log(`  порог заимствования: дословный ряд ≥ ${RUN_THRESHOLD} слов\n`);

const problems = [];
let checked = 0;
let unverified = 0;

for (const c of items) {
  const name = c.title?.ru ?? c.wikidata;
  const lines = [];
  for (const lang of LANGS) {
    const text = c.description?.[lang] ?? '';
    const chars = text.length;
    const sentences = sentenceCount(text);

    const tooShort = chars < MIN_CHARS;
    const tooLong = chars > MAX_CHARS;
    const badShape = sentences < MIN_SENTENCES || sentences > MAX_SENTENCES;
    if (tooShort) problems.push(`${name} (${lang}): ${chars} знаков — короче ${MIN_CHARS}`);
    if (tooLong) problems.push(`${name} (${lang}): ${chars} знаков — длиннее ${MAX_CHARS}`);
    if (badShape) problems.push(`${name} (${lang}): ${sentences} предложений — вне ${MIN_SENTENCES}…${MAX_SENTENCES}`);

    /*
     * Заимствование. Статья не нашлась — это «НЕ ПРОВЕРЕНО», а не «чисто» (класс `EXP-0165`:
     * «нет записи» есть утверждение о ПОИСКЕ, а не о мире). Такая запись НЕ засчитывается
     * зелёной и печатается отдельным числом.
     */
    let verdict = 'не проверено';
    let runInfo = '';
    const article = await articleText(lang, c).catch(() => null);
    if (article === null) {
      unverified += 1;
    } else {
      const run = longestCommonRun(words(text), words(article.text));
      checked += 1;
      if (run.length >= RUN_THRESHOLD && !looksLikeList(run.text)) {
        verdict = 'КОПИЯ';
        problems.push(`${name} (${lang}): дословный ряд ${run.length} слов — «${run.text.slice(0, 70)}…»`);
      } else {
        verdict = 'чисто';
      }
      runInfo = `ряд ${run.length} сл.`;
    }

    const mark = verdict === 'чисто' && !tooShort && !tooLong && !badShape ? '✅' : (verdict === 'не проверено' ? '⏭' : '❌');
    lines.push(`  ${mark} ${lang}: ${chars} зн. · ${sentences} предл. · ${verdict}${runInfo ? ' · ' + runInfo : ''}`);
  }
  console.log(`${name}`);
  for (const l of lines) console.log(l);
}

console.log('\n──────────────────────────────────────────────────────────────');
console.log(`сверено с Википедией: ${checked} · 🔴 НЕ ПРОВЕРЕНО (статья не найдена): ${unverified}`);
if (problems.length === 0) {
  console.log(`✅ ЧИСТО: замечаний 0`);
  console.log('⚠️ И честная граница: машина закрыла объём, строение и заимствование.');
  console.log('   «Похоже ли это на мою статью» решает владелец — прибор этого не проверяет.');
  process.exit(0);
}
console.log(`❌ ЗАМЕЧАНИЙ ${problems.length}:`);
for (const p of problems) console.log(`   · ${p}`);
process.exit(1);

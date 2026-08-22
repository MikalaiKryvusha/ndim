#!/usr/bin/env node
/**
 * ОСТАТОЧНЫЙ ДОСЛОВНЫЙ РЯД ПО ВСЕЙ ЗАПИСИ — приёмка К1 `plans/70`, до записи в базу.
 *
 * ═══ ЗАЧЕМ ОТДЕЛЬНЫЙ ПРИБОР, КОГДА ЕСТЬ ВОРОТА ═══
 *
 * `tools/gate-rewrites.mjs` считает остаток тем же способом, но принимает журнал прогона, где у
 * правки ОДИН фрагмент `find`/`replace`. В партиях `plans/70` у записи их до ТРЁХ: заимствование
 * лежит в нескольких местах, и каждое вскрывается только после снятия предыдущего. Прогнать такую
 * запись через ворота нельзя — они увидят одну треть правки и объявят остаток от двух остальных.
 *
 * 🔴 ВТОРОЙ РЕДАКЦИИ ПРАВИЛА ЗДЕСЬ НЕТ. Мера, порог и признак цитаты берутся ЭКСПОРТАМИ из
 * `measure-wikipedia-overlap.mjs` (`longestCommonRun`, `words`, `isInsideQuotes`, `RUN_THRESHOLD`),
 * дорога до кэша повторяет ключ свода знак в знак. Разойтись с прибором, который нашёл проблему,
 * этот прибор не может по построению.
 *
 * ═══ 🔴 ПОЧЕМУ ОН ЛЕЖИТ В ДЕРЕВЕ, А НЕ В ПЕСОЧНИЦЕ ИСПОЛНИТЕЛЯ ═══
 *
 * Заведён 2026-08-22 по требованию QA, и повод стоит записать целиком. Приёмка партии 1 `plans/70`
 * была снята скриптом, который жил ВНЕ репозитория. Числа получились верные и внутренне
 * непротиворечивые — а повторить их не мог никто: ни судья, ни следующая сессия. Класс `EXP-0195`,
 * «число из документа, пережившее своё исполнение».
 * **Приёмка, которую нельзя перепроверить, — это мнение с цифрами.** Прибор приёмки обязан лежать
 * там же, где предмет приёмки, и запускаться одной строкой из шапки.
 *
 * ═══ СЕТЬ И КЭШ — ЧЕСТНО ═══
 *
 * Статьи берутся из кэша свода (`test-results/wiki-cache/`), сети прибор не касается. Кэш вне git,
 * поэтому в свежем worktree его НЕТ — и это нормальное состояние, а не поломка. Записи без статьи
 * уходят в «НЕ ПРОВЕРЕНО» и НИКОГДА в «вылечено» (`EXP-0165`: «нет записи» есть утверждение о
 * ПОИСКЕ, а не о мире), а прибор печатает готовую команду добора. Выход при этом НЕНУЛЕВОЙ: судья,
 * запустивший прибор в пустом worktree, обязан увидеть красное, а не зелёное.
 *
 * Запуск:
 *   node tools/measure-batch-residual.mjs tools/en-rewrites-fanout-batch-01.json --lang en
 *   node tools/measure-batch-residual.mjs --selftest
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  words, longestCommonRun, RUN_THRESHOLD, isInsideQuotes,
} from './measure-wikipedia-overlap.mjs';

const SNAPSHOT = 'src/lib/content/dims-build.json';
const CACHE = 'test-results/wiki-cache';

/** Ключ кэша — тот же, что у свода: адрес запроса → sha256. Разойдётся ключ — разойдётся приёмка. */
const ключКэша = (lang, params) => {
  const адрес = `https://${lang}.wikipedia.org/w/api.php?${new URLSearchParams({ ...params, format: 'json' })}`;
  return join(CACHE, `${lang}-${createHash('sha256').update(адрес).digest('hex')}.json`);
};

const изКэша = (lang, params) => {
  const f = ключКэша(lang, params);
  if (!existsSync(f)) return null;
  // Отравленный кэш (файл из нулевых байтов) — это ОТСУТСТВИЕ статьи, а не «чисто»: тот же П1.
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

/** Статья объекта из кэша: сначала поиск по названию, затем выдержка по найденному заголовку. */
export function статьяДля(d, lang) {
  const title = d?.title?.[lang];
  if (!title) return null;
  const срок = `${title} ${d.type?.[lang] ?? ''} ${d.year && d.year !== '-' ? d.year : ''}`.trim();
  const s = изКэша(lang, { action: 'query', list: 'search', srsearch: срок, srlimit: '1' });
  const hit = s?.query?.search?.[0]?.title;
  if (!hit) return null;
  const p = изКэша(lang, {
    action: 'query', prop: 'extracts', explaintext: '1', redirects: '1', titles: hit,
  });
  const page = p?.query?.pages ? Object.values(p.query.pages)[0] : null;
  return page?.extract ? { title: hit, words: words(page.extract) } : null;
}

/**
 * Собрать «стало» из фрагментов. Фрагменты применяются ПОДРЯД к одному результату — так же, как
 * это делает писарь: две отдельные правки одного документа затёрли бы друг друга.
 */
export function собрать(before, entry) {
  const finds = [entry.find].flat();
  const replaces = [entry.replace].flat();
  if (finds.length !== replaces.length) return { after: null, беда: 'find и replace разной длины' };
  let after = before;
  for (let i = 0; i < finds.length; i += 1) {
    const parts = after.split(finds[i]);
    if (parts.length !== 2) {
      return { after: null, беда: `фрагмент ${i + 1} найден ${parts.length - 1} раз(а), нужен ровно 1` };
    }
    after = parts.join(replaces[i]);
  }
  return { after, беда: null };
}

/**
 * Приговор ОДНОЙ записи. Вынесен отдельной функцией ради самотеста: он проверяет приговор, не
 * трогая ни снимок каталога, ни кэш.
 */
export function приговор(before, after, статьяСлова) {
  const до = longestCommonRun(words(before), статьяСлова);
  const после = longestCommonRun(words(after), статьяСлова);
  // Та же поблажка цитате, что у свода и у ворот: совпадение внутри кавычек копией не делает.
  const цитата = после.length >= RUN_THRESHOLD && isInsideQuotes(после.text, after);
  return {
    до: до.length,
    после: после.length,
    текст: после.text,
    цитата,
    копия: после.length >= RUN_THRESHOLD && !цитата,
  };
}

/*
 * 🔴 ЗАПУЩЕН ИЛИ ПОДКЛЮЧЁН — у файла есть и экспорты, и работа на верхнем уровне. Класс закреплён
 * в шапке писаря и ловился в проекте пять раз за двое суток; здесь предохранитель ставится СРАЗУ,
 * и он идёт РАНЬШЕ самотеста — иначе самотест печатал бы зелёный при импорте.
 */
const runAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (runAsScript && process.argv.includes('--selftest')) {
  const статья = words('The story is set in San Tiburon the world s most dangerous maximum security '
    + 'prison designed to incarcerate supervillains and enhanced individuals of every kind');
  const ЗАИМСТВОВАНО = 'The story is set in San Tiburon the world s most dangerous maximum security '
    + 'prison designed to incarcerate supervillains';
  const случаи = [
    // 1. Заимствование на месте — запись остаётся копией.
    ['копия видна', приговор('x', ЗАИМСТВОВАНО, статья).копия, true],
    // 2. Заимствование снято — запись чиста.
    ['правка вылечила', приговор('x', 'The action unfolds inside a jail built to hold unusual people.', статья).копия, false],
    /*
     * 3. 🔴 ПАРА К СЛУЧАЮ 2, И ПООДИНОЧКЕ ОНИ БЕССМЫСЛЕННЫ. Без этого случая «вылечила» была бы
     * зелёной и у прибора, который всегда отвечает «не копия»; различает эти поведения только пара.
     * Здесь чистое первое предложение соседствует с уцелевшим заимствованием — ровно то, ради чего
     * приёмка считается по ВСЕЙ записи, а не по фрагменту правки.
     */
    ['ряд считается по ВСЕЙ записи, а не по правке', приговор('x', `A clean first sentence. ${ЗАИМСТВОВАНО}`, статья).копия, true],
    // 4. Ряд внутри кавычек — цитата рецензента, править запрещено, копией не считается.
    ['цитата извиняет', приговор('x', `The blurb read "${ЗАИМСТВОВАНО}".`, статья).копия, false],
    /*
     * 5. Пустая статья (её нет в кэше) не делает запись чистой САМА — ряд считается нулевым, и
     * решение о разряде принимает рабочий режим, отправляя запись в «НЕ ПРОВЕРЕНО». `EXP-0165`.
     */
    ['пустая статья даёт нулевой ряд, а не вердикт «чисто»', приговор('x', ЗАИМСТВОВАНО, []).после, 0],
  ];
  let плохо = 0;
  случаи.forEach(([имя, было, ждали], i) => {
    const ок = было === ждали;
    if (!ок) плохо += 1;
    console.log(`  ${ок ? '✅' : '❌'} случай ${i + 1} (${имя}): ${было}, ожидалось ${ждали}`);
  });
  // Число случаев СЧИТАЕТСЯ, а не пишется рядом руками — приём взят у писаря и у соседей.
  console.log(плохо ? `\n❌ самотест провален: ${плохо}` : `\n✅ самотест пройден: ${случаи.length} случаев`);
  process.exit(плохо ? 1 : 0);
}

if (runAsScript) {
  const файл = process.argv[2];
  const i = process.argv.indexOf('--lang');
  const LANG = i > 0 && process.argv[i + 1] ? process.argv[i + 1] : 'en';

  if (!файл || !existsSync(файл)) {
    console.error('нужен файл правок: node tools/measure-batch-residual.mjs <правки.json> [--lang en]');
    process.exit(2);
  }

  const dims = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  const bySlug = new Map(dims.map((d) => [d.slug, d]));
  const правки = JSON.parse(readFileSync(файл, 'utf8'));

  console.log(`\n═══ ОСТАТОЧНЫЙ РЯД ПО ВСЕЙ ЗАПИСИ (${LANG}, порог ${RUN_THRESHOLD} слов) ═══`);
  console.log(`файл правок: ${файл} · записей: ${правки.length}\n`);

  let копий = 0;
  let непроверено = 0;
  let сломано = 0;
  const добор = [];

  for (const e of правки) {
    const lang = e.lang ?? LANG;
    const d = bySlug.get(e.slug);
    if (!d) {
      сломано += 1;
      console.log(`  ❌ ${e.slug}: нет в снимке каталога`);
      continue;
    }
    const before = d.description?.[lang] ?? '';
    const { after, беда } = собрать(before, e);
    if (беда) {
      сломано += 1;
      console.log(`  ❌ ${e.slug}: ${беда}`);
      continue;
    }
    const ст = статьяДля(d, lang);
    if (!ст) {
      непроверено += 1;
      добор.push(e.slug);
      console.log(`  🔴 ${e.slug}: статьи нет в кэше — НЕ ПРОВЕРЕНО (не «вылечено»)`);
      continue;
    }
    const п = приговор(before, after, ст.words);
    if (п.копия) копий += 1;
    console.log(`  ${п.копия ? '🔴 ОСТАЁТСЯ КОПИЕЙ' : '✅ вылечена'} ${e.slug}: ряд ${п.до} → ${п.после}`
      + (п.после ? ` · остаток «${п.текст.slice(0, 60)}»` : '')
      + (п.цитата ? ' (внутри кавычек — цитата)' : ''));
  }

  const вылечено = правки.length - копий - непроверено - сломано;
  console.log(`\nИТОГ: вылечено ${вылечено} · остаются копиями ${копий} · 🔴 НЕ ПРОВЕРЕНО ${непроверено}`
    + (сломано ? ` · негодных правок ${сломано}` : ''));

  /*
   * ДОБОР КЭША ПЕЧАТАЕТСЯ ГОТОВОЙ КОМАНДОЙ. Свежий worktree судьи кэша не имеет — и судья не обязан
   * восстанавливать дорогу по памяти. Адресный режим свода в общий свод НЕ пишет (`bugs/176`).
   */
  if (добор.length) {
    console.log('\n⚠️ Кэш не полон. Добрать статьи (нужна сеть), затем повторить эту команду:'
      + `\n   node tools/measure-wikipedia-overlap.mjs --lang ${LANG} --slug ${добор.join(',')}`);
  }

  process.exit(копий + непроверено + сломано ? 1 : 0);
}

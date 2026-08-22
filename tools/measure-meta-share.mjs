/**
 * ПРИБОР ДОЛИ МЕТЫ (не страж) — пропорция «создание против содержания» в описаниях каталога.
 *
 * 🔴🔴 ОН ПРЕДЪЯВЛЯЕТ ЧЕЛОВЕКУ И НЕ КРАСНЕЕТ САМ. Порога-приговора внутри нет и не будет:
 * счёт по списку слов перебирает (контракт ворот мастерской, §4, граница 5), и молча краснеющий
 * порог заворачивал бы исправные карточки. Код выхода у прибора всегда 0 в рабочем режиме —
 * ненулевым он бывает только при собственной поломке и на провале самотеста.
 * Устройство меры, лексиконы и граница класса «приём ≠ мета» — в шапке `tools/lib/meta-share.mjs`.
 *
 * Что печатает:
 *   · долю меты по каждой карточке (доля ПРЕДЛОЖЕНИЙ, а не знаков);
 *   · САМИ производственные предложения адресно — карточка, язык, строка;
 *   · отдельным списком предложения ПРИЁМА, которые владелец одобряет и которые в мету не идут:
 *     прибор ничего не прячет, в том числе то, что сам вывел из-под счёта.
 *
 * Режимы:
 *   node tools/measure-meta-share.mjs candidates/batches/03_2026_films_and_games.json
 *   node tools/measure-meta-share.mjs src/lib/content/dims-slice.json --lang en
 *   node tools/measure-meta-share.mjs --calibration --catalog <путь к dims-build.json>
 *   node tools/measure-meta-share.mjs --selftest
 *
 * Флаги: `--lang ru|en` (по умолчанию оба) · `--top N` (сколько карточек показать, по убыванию
 * доли; по умолчанию 10) · `--quiet` (только числа, без предложений).
 *
 * ⚠️ ПОЛНЫЙ СНИМОК КАТАЛОГА В GIT НЕ ЛЕЖИТ (`dims-build.json`, 17,5 МБ, в `.gitignore`), а
 * боевая база разработчику не принадлежит. Поэтому калибровка требует `--catalog` явным путём,
 * а по умолчанию прибор работает с тем, что в репозитории: партии `candidates/batches/` и срез
 * `src/lib/content/dims-slice.json`.
 */
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { splitSentences } from './lib/prose-gates.mjs';
import {
  metaShare, classifySentence, buildCalibrationCorpus, eligibleForCalibration,
  MATRIX_ROW_SIZE,
} from './lib/meta-share.mjs';

/** Приводит файл партии кандидатов ИЛИ среза каталога к одному виду. Форма распознаётся, а не задаётся. */
export function прочитатьЗаписи(json) {
  const d = JSON.parse(json);
  const arr = Array.isArray(d) ? d : (d.candidates ?? Object.values(d).find(Array.isArray) ?? []);
  return arr
    .filter((x) => x && x.description && (x.description.ru || x.description.en))
    .map((x) => ({
      id: x.wikidata ?? x.slug ?? x.id ?? '?',
      title: x.title?.ru ?? x.title?.en ?? '',
      type: x.type?.ru ?? '',
      author: x.author,
      year: x.year,
      description: x.description,
    }));
}

/** Разбор одной записи по обоим языкам — ядро, которое зовут и рабочий режим, и самотест. */
export function разобратьЗапись(запись, языки) {
  const по = {};
  for (const lang of языки) {
    const t = запись.description?.[lang];
    if (t) по[lang] = metaShare(t, lang, splitSentences);
  }
  return { ...запись, по };
}

const ЗАПУЩЕН_НАПРЯМУЮ = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

// ── САМОТЕСТ: русские И английские образцы (канон «самотест языка X — на образцах X») ─────────
if (ЗАПУЩЕН_НАПРЯМУЮ && process.argv.includes('--selftest')) {
  let плохо = 0;
  let всего = 0;
  const t = (ok, что) => { всего += 1; if (!ok) плохо += 1; console.log(`  ${ok ? '✅' : '❌'} ${что}`); };
  const класс = (s, lang) => classifySentence(s, lang).класс;

  // Пара «Кобры» — то, чем доказывается граница класса, на ОБОИХ языках.
  t(класс('Произвели картину Warner Bros. и The Cannon Group, продюсировали Менахем Голан и Йорам Глобус.', 'ru') === 'мета',
    'RU производство и продюсеры — мета');
  t(класс('При коммерческом успехе фильм получил резкие отзывы критиков за жёсткость и прямолинейность.', 'ru') === 'приём',
    'RU приём сообщества — НЕ мета (слово владельца)');
  t(класс('Warner Bros. and The Cannon Group produced it, with Menahem Golan and Yoram Globus as producers.', 'en') === 'мета',
    'EN производство и продюсеры — мета');
  t(класс('Commercially successful, the film drew sharp reviews for its harshness and its bluntness.', 'en') === 'приём',
    'EN приём сообщества — НЕ мета (слово владельца)');

  // Премьера (выпуск) против премии (приём) — собственный дефект первой редакции, ловившей подстрокой.
  t(класс('Премьера состоялась 2 октября 1986 года в прокате США.', 'ru') === 'мета', 'RU премьера — выпуск, значит мета');
  t(класс('Картина получила премию за лучшую операторскую работу.', 'ru') === 'приём', 'RU премия — приём, а не выпуск');

  // Сюжет с производственным словом внутри — два из трёх ложных, названных контрактом.
  t(класс('Награду за этот бой он получает вместе с искалеченным коленом.', 'ru') !== 'мета', 'RU награда в сюжете — не мета');
  t(класс('Остальные Редфеллоу заняты примерно тем же.', 'ru') === 'содержание', 'RU сюжет без лексикона — содержание');
  t(класс('The hero is known by a fixed set of marks — dark glasses and a match between his teeth.', 'en') === 'содержание',
    'EN сюжет без лексикона — содержание');

  // Допуск в калибровку — по данным, а не по типу.
  t(eligibleForCalibration({ author: { ru: 'Вачовски' }, year: '1999' }) === true, 'объект с автором и выпуском в калибровку допущен');
  t(eligibleForCalibration({ author: { ru: '-', en: '-' }, year: '-' }) === false, 'практика без автора и года НЕ допущена');
  t(eligibleForCalibration({ author: { ru: 'Николя Аппер' }, year: '-' }) === false, 'есть автор, нет выпуска — не допущена');

  console.log(плохо ? `\n❌ самотест провален: ${плохо}` : `\n✅ самотест пройден: ${всего} случаев`);
  process.exit(плохо ? 1 : 0);
}

if (ЗАПУЩЕН_НАПРЯМУЮ) {
  const арг = (имя, поум = null) => {
    const i = process.argv.indexOf(имя);
    return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : поум;
  };
  const ЯЗЫК = арг('--lang');
  const ЯЗЫКИ = ЯЗЫК ? [ЯЗЫК] : ['ru', 'en'];
  const ТИХО = process.argv.includes('--quiet');
  const ВЕРХ = Number(арг('--top', '10'));

  // ── КАЛИБРОВКА ─────────────────────────────────────────────────────────────────────────────
  if (process.argv.includes('--calibration')) {
    const каталог = арг('--catalog', 'src/lib/content/dims-build.json');
    if (!existsSync(каталог)) {
      console.error(`\n🔴 нет файла каталога: ${каталог}`);
      console.error('   Полный снимок в git не лежит (17,5 МБ, .gitignore). Назови путь через --catalog.');
      process.exit(2);
    }
    const записи = прочитатьЗаписи(readFileSync(каталог, 'utf8'));
    const { принятые, отклонённые, названо } = buildCalibrationCorpus(записи);

    console.log('\n═══ КОРПУС КАЛИБРОВКИ — ряд «Матрицы», эталон, названный владельцем ═══');
    console.log(`   в каталоге записей: ${записи.length} · отобрано по ряду: ${названо} · допущено: ${принятые.length}`);
    for (const o of отклонённые) console.log(`   ⛔ ${o.имя}: ${o.причина}`);

    console.log(`\n🔴 ВЫБОРКА МАЛА, И ПРИБОР ГОВОРИТ ЭТО ВСЛУХ: записей ${принятые.length}`
      + ` (ожидается ${MATRIX_ROW_SIZE}). Это не корпус для порога — это всё, что назвал владелец.`);
    console.log('   Расширять эталон непригодным материалом нельзя: у практик производственной');
    console.log('   обвязки нет по построению, и их ноль назначил бы норму нулевой.');

    for (const lang of ЯЗЫКИ) {
      const доли = принятые.map((x) => разобратьЗапись(x, [lang]).по[lang]).filter(Boolean).map((r) => r.доля);
      if (!доли.length) continue;
      const по = [...доли].sort((a, b) => a - b);
      console.log(`\n   ${lang}: ${доли.join(' % · ')} %`);
      console.log(`      медиана ${по[Math.floor(по.length / 2)]} % · максимум ${Math.max(...доли)} %`);
    }
    console.log('\n⛔ Порог по этим числам ПРИБОР НЕ НАЗНАЧАЕТ — он их только предъявляет.\n');
    process.exit(0);
  }

  // ── РАБОЧИЙ РЕЖИМ: партия или срез каталога ────────────────────────────────────────────────
  const ФАЙЛ = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
  if (!ФАЙЛ || !existsSync(ФАЙЛ)) {
    console.error('нужен файл партии или каталога:');
    console.error('  node tools/measure-meta-share.mjs candidates/batches/03_2026_films_and_games.json');
    console.error('  node tools/measure-meta-share.mjs src/lib/content/dims-slice.json --lang en');
    console.error('  node tools/measure-meta-share.mjs --calibration --catalog <путь>');
    process.exit(2);
  }

  const записи = прочитатьЗаписи(readFileSync(ФАЙЛ, 'utf8')).map((x) => разобратьЗапись(x, ЯЗЫКИ));
  console.log(`\n═══ ДОЛЯ МЕТЫ · ${ФАЙЛ} · записей ${записи.length} ═══`);
  console.log('   Мера — доля ПРЕДЛОЖЕНИЙ о создании объекта. Приём сообщества в мету НЕ входит:');
  console.log('   владелец такие строки пишет сам и одобряет (bugs/173).');

  for (const lang of ЯЗЫКИ) {
    const сДолей = записи.filter((x) => x.по[lang]);
    if (!сДолей.length) continue;
    const доли = сДолей.map((x) => x.по[lang].доля);
    const по = [...доли].sort((a, b) => a - b);
    console.log(`\n── ${lang.toUpperCase()} · карточек ${сДолей.length}`
      + ` · средняя ${Math.round(доли.reduce((a, b) => a + b, 0) / доли.length)} %`
      + ` · медиана ${по[Math.floor(по.length / 2)]} % · максимум ${Math.max(...доли)} %`);

    for (const з of [...сДолей].sort((a, b) => b.по[lang].доля - a.по[lang].доля).slice(0, ВЕРХ)) {
      const r = з.по[lang];
      console.log(`\n   ${String(r.доля).padStart(3)} %  ${з.id}  ${з.title}`
        + `  (мета ${r.мета} из ${r.всего}${r.приём ? `, приём ${r.приём}` : ''})`);
      if (ТИХО) continue;
      for (const п of r.предложенияМеты) console.log(`      МЕТА   ${п.предложение.replace(/\s+/gu, ' ')}`);
      for (const п of r.предложенияПриёма) console.log(`      приём  ${п.предложение.replace(/\s+/gu, ' ')}`);
    }
  }
  console.log('\n⛔ Приговора у прибора нет: он показал предложения — решает человек.\n');
}

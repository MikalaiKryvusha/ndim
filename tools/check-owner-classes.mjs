#!/usr/bin/env node
// Самопроверка карточек по КЛАССАМ ЗАМЕЧАНИЙ ВЛАДЕЛЬЦА.
// Источник правил — candidates/owner-critical-notes-2026-08-22.md (его дословное слово).
// Прибор ловит то, что ловится ТЕКСТОМ. Классы 1 и 2 закрываются им лишь частично,
// и он говорит об этом вслух: зелёный прогон означает «машина не нашла», а не «чисто».
//
//   node tools/check-owner-classes.mjs candidates/batches/06_*.json [--today 2026-08-22]
//
// Код возврата 1, если найдено хоть одно нарушение классов 3–9 или будущая дата (класс 1).
//
// 🔴 ПРЕДОХРАНИТЕЛЬ: рабочий режим включается ТОЛЬКО при прямом запуске. Подключение
// модуля (самотест, чужой прибор) argv не разбирает и процесс не роняет — тот же класс,
// что закрыт в check-candidate-descriptions.mjs.
// 🔴 ГРАНИЦА СЛОВА: рядом с кириллицей `\b` и `\w` определены через ASCII и молча не
// срабатывают, поэтому здесь всюду (?<!\p{L})…(?!\p{L}) и [\p{L}] с флагом u.

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Даты вида «7 мая 2026 года» и «7 May 2026» → ISO. Возвращает массив строк. */
export function extractDates(text) {
  const out = [];
  for (const m of (text || '').matchAll(/(\d{1,2})\s+([а-яё]+)\s+(\d{4})/giu)) {
    const mi = MONTHS.indexOf(m[2].toLowerCase());
    if (mi >= 0) out.push(`${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`);
  }
  for (const m of (text || '').matchAll(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/g)) {
    const mi = MONTHS_EN.indexOf(m[2].toLowerCase());
    if (mi >= 0) out.push(`${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`);
  }
  return out;
}

// Существительные класса 8 перечислены СЛОВОФОРМАМИ, а не основой: основа `продюсер\p{L}*`
// поймала бы «своей продюсерской работе» и объявила бы дефектом законное согласование.
const МУЖСКИЕ = 'режиссёр|режиссёра|режиссёру|режиссёром|режиссере|режиссёре|сценарист|сценариста|сценаристу|сценаристом|продюсер|продюсера|продюсеру|продюсером|постановщик|постановщика|постановщику|постановщиком|оператор|оператора|оператору|оператором|композитор|композитора|композитору|композитором';

/** Классы 3–9: признак = образец по тексту описания. Каждый несёт его слово. */
export const RULES = [
  {
    cls: 3, name: 'противопоставление',
    why: '«зачем но и приём противопоставления? Я утверждаю факты»',
    ru: /(^|[.:;—]\s+)(Но|Однако|Зато|Тем не менее)\s/gu,
    en: /(^|[.:;—]\s+)(But|However|Yet|Nevertheless)\s/gu,
  },
  {
    cls: 4, name: 'термин «метр» вместо «полнометражный»',
    why: '«Запрет на термин "метр" в смысле типа полнометражного фильма. Это называется Полнометражный»',
    ru: /(?<!\p{L})(полный|полного|полном|полным|полный)\s+метр(?!\p{L})/giu,
    en: null,
  },
  {
    cls: 5, name: 'дата подана заголовком-обрубком',
    why: '«"Даты выхода" - некрасиво так писать. Ошибка класса»',
    ru: /(Перв(ая|ые)\s+дат[аы]\s+выхода|(^|[.;]\s+)Дат[аы]\s+выхода\s*[—:-])/gu,
    en: /(The\s+(first\s+)?release\s+dates?\s+(is|are))/giu,
  },
  {
    cls: 6, name: 'канцелярское «действие развёрнуто»',
    why: '«"Действие развёрнуто" - действие разворачивается! Ошибка класса!»',
    ru: /Действие\s+(развёрнуто|развернуто|отнесено|перенесено)|(?<!\p{L})был[аио]?\s+развёрнут/giu,
    en: null,
  },
  {
    cls: 7, name: 'длинный залог там, где есть короткая форма',
    why: '«"поставила его" - поставлен»',
    ru: /поставил[аи]\s+(его|её|картину|ленту|фильм)|производство\s+осуществлен|выход\s+состоялся|(Литературной\s+основой|Материалом)\s+послужил/giu,
    en: null,
  },
  {
    cls: 8, name: 'согласование прилагательного с существительным',
    why: '«"тунисской режиссёром" - тунисским режиссёром. Режиссёр - Он Мой, мужской род»',
    ru: new RegExp(`(?<!\\p{L})[а-яё]+(ой|ей|ая|яя|ую|юю)\\s+(${МУЖСКИЕ})(?!\\p{L})`, 'giu'),
    en: null,
  },
  {
    cls: 9, name: 'факт брошен обрубком вместо фразы',
    why: '«"музыка электронная" - брошено как между делом на отъебись»',
    // хвост предложения: «…, музыка электронная.» — существительное с прилагательным без глагола
    ru: /,\s+(музыка|графика|звук|анимация|съёмка|стиль|палитра|темп|подача|озвучание)\s+[а-яё]+(ая|ое|ый|ые|ой)\s*[.;]/giu,
    en: null,
  },
];

/**
 * Разбор одной карточки. Возвращает массив строк-находок (пустой = машина не нашла).
 * today — ISO-дата дня сборки партии.
 */
export function scanCard(card, today) {
  const found = [];
  const dates = [...extractDates(card.description?.ru), ...extractDates(card.description?.en)];
  const earliest = dates.length ? dates.slice().sort()[0] : null;
  if (earliest && earliest > today) {
    found.push(`класс 1 · НЕ ВЫШЕЛ: самая ранняя названная дата ${earliest} в БУДУЩЕМ — «Как ты себе это представляешь, если люди ещё не видели этот фильм?»`);
  }
  if (!dates.length) {
    found.push('класс 1 · дат в описании нет вовсе — выход проверить нечем, сверь по реестру вручную');
  }
  for (const r of RULES) {
    for (const lang of ['ru', 'en']) {
      const re = r[lang];
      if (!re) continue;
      re.lastIndex = 0;
      const hits = [...(card.description?.[lang] || '').matchAll(re)].map((m) => m[0].trim());
      if (hits.length) found.push(`класс ${r.cls} · ${r.name} [${lang}]: ${[...new Set(hits)].join(' | ')} — ${r.why}`);
    }
  }
  return found;
}

function main(argv) {
  const todayArg = argv.indexOf('--today');
  const today = todayArg >= 0 ? argv[todayArg + 1] : new Date().toISOString().slice(0, 10);
  // значение флага не должно уехать в список файлов — иначе прибор падает на «2026-08-22» как на файле
  const files = argv.filter((a, i) => !a.startsWith('--') && i !== todayArg + 1);

  if (!files.length) {
    console.error('Укажи файл партии: node tools/check-owner-classes.mjs candidates/batches/06_*.json');
    process.exit(2);
  }

  let violations = 0;
  let cards = 0;
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    console.log(`\n=== ${file} — ${(data.candidates || []).length} карточек, сегодня ${today}`);
    for (const c of data.candidates || []) {
      cards++;
      const found = scanCard(c, today);
      if (found.length) {
        violations += found.length;
        console.log(`\n  🔴 ${c.wikidata} · ${c.title.ru}`);
        found.forEach((f) => console.log(`     ${f}`));
      }
    }
  }

  console.log(`\n──────── карточек проверено: ${cards} · нарушений найдено: ${violations}`);
  console.log('⚠️ ЧЕСТНАЯ ГРАНИЦА ПРИБОРА: закрыты классы 3–9 признаком по тексту и класс 1 по датам,');
  console.log('   НАЗВАННЫМ В САМОМ ОПИСАНИИ. Класс 2 (проще, прямее) машиной не берётся вовсе —');
  console.log('   он держится письмом и вычиткой владельца. Зелёный прогон = «машина не нашла».');
  process.exit(violations ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));

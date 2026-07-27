// Извлекатель продуктовых текстов владельца в контент приложения 2.0.
//
// ЗАЧЕМ. Тексты документов (условия, политика, отказ, руководство, история версий) написаны
// владельцем и уже сняты ДОСЛОВНО в researches/06 и researches/07. Переписывать их руками в
// код — значит гарантированно наплодить опечаток в юридическом тексте. Поэтому контент
// приложения ГЕНЕРИРУЕТСЯ из этих исследований: источник один, ошибок переписывания нет.
//
// Что не переносится и почему: разделы руководства, описывающие ИНТЕРФЕЙС 1.x (суб-вкладки
// «Все» / «Мой NDim ID», почасовые частичные синхронизации, знакомство через Email) — в 2.0
// этого нет, и дословный перенос был бы враньём о продукте. Их адаптация под 2.0 — отдельная
// задача с участием владельца. Здесь берётся то, что от версии не зависит: манифест, идея,
// шкала оценок, мысленные эксперименты, напутствие.
//
// Запуск: node tools/extract-docs.mjs   → перезаписывает src/lib/content/docs.ts
// Правки текста вносите в исследование (источник истины) и перегенерируйте — либо, если текст
// 2.0 разошёлся с 1.x, отвяжите документ от генератора и ведите его руками.

import { readFileSync, writeFileSync } from 'node:fs';

const RESEARCH_06 = 'researches/06_product_texts_1x.md';
const RESEARCH_07 = 'researches/07_user_manual_1x.md';
const OUT = 'src/lib/content/docs.ts';

/** Заголовок вида «Условия использования / Terms of Use» → { ru, en }. */
function splitHeading(text) {
  const parts = text.split(' / ');
  const ru = parts[0].trim();
  const en = (parts[1] ?? parts[0]).trim();
  return { ru, en };
}

/**
 * Иллюстрации 1.x (bugs/55, выбор владельца — V1 «Как было»): пометки
 * `*[Изображение: файл — подпись]*` в исследовании становятся img-блоками.
 * Файлы уже лежат в static/img/docs/ (сняты из архива 1.x); имена местами отличаются.
 */
const IMAGE_FILES = {
  // Размеры зашиты, чтобы страница РЕЗЕРВИРОВАЛА место до загрузки (глобальное правило
  // владельца 2026-07-27: графика нигде не «доезжает на горячую», раскладка не прыгает).
  // Файлы статичны; меняешь картинку — обнови размер (magick identify -format "%w %h").
  'island_compressed.webp': { file: 'island.webp', w: 737, h: 600 },
  'airplane.webp': { file: 'airplane.webp', w: 582, h: 459 },
  'hospital.webp': { file: 'hospital.webp', w: 653, h: 500 },
  'network.webp': { file: 'network.webp', w: 516, h: 520 },
  'NDim_LOGO_v8_196.webp': { file: 'logo-1x.webp', w: 196, h: 196 },
};

const IMAGE_NOTE = /\*\[(?:Изображение|Image):\s*([\w.-]+)\s*—\s*([^\]]+)\]\*/;

/** Пометка изображения → img-блок (неизвестный файл — честный throw, а не молчание). */
function imageBlock(note, alt) {
  const entry = IMAGE_FILES[note];
  if (!entry) throw new Error(`Неизвестная иллюстрация в пометке: ${note}`);
  return { type: 'img', src: `/img/docs/${entry.file}`, alt, w: entry.w, h: entry.h };
}

/**
 * Разбирает кусок markdown-исследования в блоки контента.
 * Берёт ТОЛЬКО текст владельца: парные цитаты RU и EN, парные списки, парные таблицы и
 * заголовки. Комментарии агента (обычные абзацы) молча пропускаются — они не продукт.
 */
function parseBlocks(lines) {
  const blocks = [];
  let i = 0;

  /**
   * Пункты списка. У пункта бывает продолжение с отступом — например пометка об
   * иллюстрации оригинала (`*[Изображение: …]*`). Такие строки не обрывают список:
   * пометка становится картинкой ПУНКТА (в 1.x иллюстрации мысленных экспериментов
   * стояли внутри пунктов — bugs/55), остальное приклеивается к тексту пункта.
   */
  const listItems = (start) => {
    const items = [];
    const images = [];
    let j = start;
    while (j < lines.length) {
      const line = lines[j];
      if (line.startsWith('- ')) {
        items.push(line.slice(2).trim());
        images.push(null);
        j += 1;
        continue;
      }
      const isIndented = /^\s+\S/.test(line);
      if (isIndented && items.length > 0) {
        const tail = line.trim();
        const note = IMAGE_NOTE.exec(tail);
        if (note) {
          const block = imageBlock(note[1], note[2].trim());
          images[images.length - 1] = { src: block.src, w: block.w, h: block.h };
        } else items[items.length - 1] += ` ${tail}`;
        j += 1;
        continue;
      }
      break;
    }
    return [items, images, j];
  };

  const tableRows = (start) => {
    const rows = [];
    let j = start;
    while (j < lines.length && lines[j].startsWith('|')) {
      const cells = lines[j].split('|').slice(1, -1).map((cell) => cell.trim());
      if (!cells.every((cell) => /^-+$/.test(cell))) rows.push(cells); // строка-разделитель
      j += 1;
    }
    return [rows, j];
  };

  /** Пропускает пустые строки. */
  const skipBlank = (start) => {
    let j = start;
    while (j < lines.length && lines[j].trim() === '') j += 1;
    return j;
  };

  while (i < lines.length) {
    const line = lines[i];

    // Заголовки разделов
    if (line.startsWith('### ') || line.startsWith('#### ')) {
      const level = line.startsWith('#### ') ? 'h3' : 'h2';
      blocks.push({ type: level, text: splitHeading(line.replace(/^#+\s*/, '')) });
      i += 1;
      continue;
    }

    // Абзац: цитата с парой RU/EN
    const ruQuote = /^>\s\*\*RU:\*\*\s?(.*)$/.exec(line);
    if (ruQuote) {
      const ru = [ruQuote[1]];
      let j = i + 1;
      let en = null;
      while (j < lines.length && lines[j].startsWith('>')) {
        const enQuote = /^>\s\*\*EN:\*\*\s?(.*)$/.exec(lines[j]);
        if (enQuote) {
          en = [enQuote[1]];
          j += 1;
          while (j < lines.length && lines[j].startsWith('>') && !/\*\*RU:\*\*/.test(lines[j])) {
            en.push(lines[j].replace(/^>\s?/, ''));
            j += 1;
          }
          break;
        }
        ru.push(lines[j].replace(/^>\s?/, ''));
        j += 1;
      }
      const text = (parts) => parts.join('\n').trim();
      blocks.push({ type: 'p', text: { ru: text(ru), en: en ? text(en) : text(ru) } });
      i = j;
      continue;
    }

    // Список истории версий: у каждого пункта RU и EN лежат в одном элементе списка.
    const ruItem = /^-\s\*\*RU:\*\*\s?(.*)$/.exec(line);
    if (ruItem) {
      const ru = [];
      const en = [];
      let j = i;
      while (j < lines.length) {
        const nextRu = /^-\s\*\*RU:\*\*\s?(.*)$/.exec(lines[j]);
        const nextEn = /^\s+\*\*EN:\*\*\s?(.*)$/.exec(lines[j + 1] ?? '');
        if (!nextRu) break;
        ru.push(nextRu[1].trim());
        en.push((nextEn ? nextEn[1] : nextRu[1]).trim());
        j += nextEn ? 2 : 1;
      }
      blocks.push({ type: 'ul', items: { ru, en } });
      i = j;
      continue;
    }

    // Парный список или парная таблица: **RU:** … **EN:** …
    if (line.trim() === '**RU:**') {
      let j = skipBlank(i + 1);

      if (lines[j]?.startsWith('|')) {
        const [ruRows, afterRu] = tableRows(j);
        let k = skipBlank(afterRu);
        if (lines[k]?.trim() === '**EN:**') {
          k = skipBlank(k + 1);
          const [enRows, afterEn] = tableRows(k);
          blocks.push({
            type: 'table',
            head: { ru: ruRows[0], en: enRows[0] },
            rows: { ru: ruRows.slice(1), en: enRows.slice(1) },
          });
          i = afterEn;
          continue;
        }
      }

      const [ruItems, ruImages, afterRu] = listItems(j);
      let k = skipBlank(afterRu);
      if (ruItems.length > 0 && lines[k]?.trim() === '**EN:**') {
        k = skipBlank(k + 1);
        const [enItems, , afterEn] = listItems(k);
        const block = { type: 'ul', items: { ru: ruItems, en: enItems } };
        // Картинки пунктов берём из RU-списка: пары RU/EN выровнены по индексам.
        if (ruImages.some((image) => image !== null)) block.images = ruImages;
        blocks.push(block);
        i = afterEn;
        continue;
      }
    }

    // Одиночная пометка иллюстрации (финальная network.webp «Напутствия» и т. п.).
    const note = IMAGE_NOTE.exec(line.trim());
    if (note && line.trim().startsWith('*[')) {
      blocks.push(imageBlock(note[1], note[2].trim()));
      i += 1;
      continue;
    }

    i += 1; // всё остальное — комментарий исследования, не продукт
  }

  return blocks;
}

/** Вырезает из файла кусок между заголовком `## <начало>` и следующим `## `. */
function section(markdown, startsWith) {
  const lines = markdown.split(/\r?\n/);
  const from = lines.findIndex((line) => line.startsWith('## ') && line.includes(startsWith));
  if (from < 0) throw new Error(`Раздел «${startsWith}» не найден`);
  let to = from + 1;
  while (to < lines.length && !lines[to].startsWith('## ')) to += 1;
  return { heading: lines[from].replace(/^##\s*/, ''), lines: lines.slice(from + 1, to) };
}

const research06 = readFileSync(RESEARCH_06, 'utf8');
const research07 = readFileSync(RESEARCH_07, 'utf8');

/** Юридические документы 1.x — переносятся ДОСЛОВНО и целиком. */
const legal = [
  { slug: 'terms', source: 'tou.html', title: { ru: 'Условия использования', en: 'Terms of Use' } },
  { slug: 'privacy', source: 'pp.html', title: { ru: 'Политика конфиденциальности', en: 'Privacy Policy' } },
  { slug: 'disclaimer', source: 'disclaimer.html', title: { ru: 'Отказ от ответственности', en: 'Disclaimer' } },
];

const docs = {};

for (const { slug, source, title } of legal) {
  const { lines } = section(research06, source);
  docs[slug] = { slug, title, blocks: parseBlocks(lines) };
}

// История версий 1.x («О системе» → раскрывающийся список, как в 1.x).
docs.history = {
  slug: 'history',
  title: { ru: 'История версий', en: 'Version history' },
  blocks: parseBlocks(section(research06, 'about.html').lines),
};

/**
 * Руководство пользователя: только разделы, НЕ ЗАВИСЯЩИЕ от версии интерфейса.
 * Разделы 1.x про экраны («Дом», «Связи», «Пространство», «Меню», «NDim ID и Измерения»)
 * описывают интерфейс, которого в 2.0 нет, — они не переносятся.
 */
const MANUAL_SECTIONS = ['1. Манифест', '2. Идея', '3. Терминология', '5. Звёзды'];

/**
 * Подразделы про кнопки ВЕРНУЛИСЬ (bugs/55, слово владельца: «кнопки — нужно адаптировать
 * к текущему виду нашей нынешней реализации»). Раньше пропускались как описание интерфейса
 * 1.x; теперь переносятся с точечной адаптацией фраз о МЕСТЕ кнопок (см. ADAPT ниже).
 */
const SKIP_SUBHEADINGS = [];

/**
 * [AI] Адаптация фраз о местоположении: в 1.x кнопки жили «внизу справа на суб-вкладке
 * "Все"», в 2.0 вход «Предложить» — кнопка у строки поиска (bugs/51, выбор владельца V3),
 * а поиск — сама строка под шапкой (bugs/50). Каждая замена — по ТОЧНОЙ строке оригинала:
 * если исследование изменится, генератор упадёт, а не промолчит. Изменённые фразы — черновик
 * агента, ждут вычитки владельца (пометка в bugs/55 → «Решения, принятые без владельца»). [/AI]
 */
const ADAPT = new Map([
  [
    'На суб-вкладке "Все" вкладки Измерений внизу справа есть кнопка предложения нового измерения.',
    'На экране "Измерения" в верхней панели есть кнопка предложения нового измерения.',
  ],
  [
    'On the "All" sub-tab of the Dimensions tab, there is a button to suggest a new dimension at the bottom right.',
    'On the "Dimensions" screen, in the top bar, there is a button to suggest a new dimension.',
  ],
  [
    'Также на суб-вкладке "Все" вкладки Измерений внизу справа есть кнопка поиска.',
    'Также на экране "Измерения" в верхней панели есть кнопка поиска.',
  ],
  [
    'Also on the "All" sub-tab of the Dimensions tab, there is a search button at the bottom right.',
    'Also on the "Dimensions" screen, in the top bar, there is a search button.',
  ],
]);

/** Применяет ADAPT к абзацу; помнит, какие замены сработали (несработавшая = ошибка). */
const adaptUsed = new Set();
function adaptParagraph(block) {
  if (block.type !== 'p') return block;
  const swap = (text) => {
    if (ADAPT.has(text)) {
      adaptUsed.add(text);
      return ADAPT.get(text);
    }
    return text;
  };
  return { ...block, text: { ru: swap(block.text.ru), en: swap(block.text.en) } };
}

/**
 * Термины, чьё ОПРЕДЕЛЕНИЕ в 1.x описывает устаревшую механику: почасовые «частичные»
 * синхронизации и «облачный» сервер. В 2.0 сервер синхронизации работает иначе (Docker на
 * машине владельца, пересчёт по изменившимся точкам). Показывать старое определение —
 * значит врать о продукте; писать новое за владельца — не наше дело. Поэтому пока опускаем,
 * а экран честно говорит, что этот раздел обновляется.
 */
const SKIP_TERMS = ['**Синхронизация**', '**Сервер синхронизации**'];

/** Выбрасывает пропущенные подразделы: от их заголовка до следующего заголовка. */
function dropSkipped(blocks) {
  const kept = [];
  let skipping = false;
  for (const block of blocks) {
    if (block.type === 'h2' || block.type === 'h3') {
      skipping = SKIP_SUBHEADINGS.includes(block.text.ru);
    }
    if (!skipping) kept.push(block);
  }
  return kept;
}

/** Выбрасывает устаревшие термины из парного списка терминологии (индексы RU и EN совпадают). */
function dropStaleTerms(block) {
  if (block.type !== 'ul') return block;
  const keep = block.items.ru.map((item) => !SKIP_TERMS.some((term) => item.startsWith(term)));
  if (keep.every(Boolean)) return block;
  return {
    type: 'ul',
    items: {
      ru: block.items.ru.filter((_, index) => keep[index]),
      en: block.items.en.filter((_, index) => keep[index]),
    },
  };
}

const manualBlocks = [];

// Логотип 1.x в шапке руководства (researches/12 → «Вёрстка страниц документов 1.x»):
// пометка в исследовании стоит вне переносимых разделов, поэтому блок добавляется явно.
manualBlocks.push({ type: 'img', src: '/img/docs/logo-1x.webp', alt: 'NDim', kind: 'logo', w: 196, h: 196 });

/**
 * В руководстве разделы («## 5. Звёзды…») добавляются вручную как h2, а распарсенные
 * подразделы («### Шкала оценок…») парсер тоже отдаёт как h2 — понижаем их до h3, чтобы
 * документ (и пагинатор глав) видел иерархию: глава → подглавы. Юридические документы
 * этим не трогаются — у них плоская структура.
 */
const demoteHeading = (block) => (block.type === 'h2' ? { ...block, type: 'h3' } : block);

for (const name of MANUAL_SECTIONS) {
  const { heading, lines } = section(research07, name);
  manualBlocks.push({ type: 'h2', text: splitHeading(heading.replace(/^\d+\.\s*/, '')) });
  manualBlocks.push(
    ...dropSkipped(parseBlocks(lines)).map(dropStaleTerms).map(adaptParagraph).map(demoteHeading),
  );
}

if (adaptUsed.size !== ADAPT.size) {
  throw new Error(`Адаптация фраз: сработало ${adaptUsed.size} из ${ADAPT.size} — оригинал в researches/07 изменился`);
}

// «Напутствие» + финальная network.webp: подраздел раздела 9 («Меню»), сам раздел — про
// интерфейс 1.x и не переносится, а напутствие вневременное (мандат: bugs/55, счёт разведки).
{
  const { lines } = section(research07, '9. Меню');
  const from = lines.findIndex((line) => line.startsWith('### ') && line.includes('Напутствие'));
  if (from < 0) throw new Error('Подраздел «Напутствие» не найден');
  manualBlocks.push(...parseBlocks(lines.slice(from)));
}

// Таблица шкалы 0–10 → блок «scale»: в 1.x в колонке «Оценка» стояли звезда, цифра и цветной
// смайлик (researches/12). Данные — только описания; звёзды и смайлики рисует рендерер
// текущими средствами 2.0 (слово владельца: «звёзды — адаптировать к нынешней реализации»).
{
  const index = manualBlocks.findIndex(
    (block) => block.type === 'table' && block.head.ru[0] === 'Оценка',
  );
  if (index < 0) throw new Error('Таблица шкалы оценок не найдена');
  const table = manualBlocks[index];
  const grades = table.rows.ru.map((row) => row[0]);
  if (grades.join(',') !== '0,1,2,3,4,5,6,7,8,9,10') {
    throw new Error(`Шкала оценок не 0…10: ${grades.join(',')}`);
  }
  manualBlocks[index] = {
    type: 'scale',
    head: table.head,
    descriptions: { ru: table.rows.ru.map((row) => row[1]), en: table.rows.en.map((row) => row[1]) },
  };
}

// Кнопки-образцы (bugs/55: в 1.x — круглые кнопки в тексте как ОБРАЗЕЦ; в 2.0 рисуем
// НАШИ входы): после первого абзаца «Предложения…» — кнопка-лампочка, после первого
// абзаца «Поиска…» — строка поиска с кнопкой, как они выглядят на экране «Измерения».
function insertSampleAfterFirstParagraph(headingRu, kind) {
  const headingIndex = manualBlocks.findIndex(
    (block) => (block.type === 'h2' || block.type === 'h3') && block.text.ru === headingRu,
  );
  if (headingIndex < 0) throw new Error(`Подраздел «${headingRu}» не найден`);
  const paragraphIndex = manualBlocks.findIndex(
    (block, at) => at > headingIndex && block.type === 'p',
  );
  manualBlocks.splice(paragraphIndex + 1, 0, { type: 'sample', kind });
}
insertSampleAfterFirstParagraph('Предложение нового измерения', 'suggest');
insertSampleAfterFirstParagraph('Поиск по измерениям', 'search');

// Ряд из 11 цветных смайликов (подраздел «Шкала смайликов»): в 1.x здесь стоял визуальный
// ряд; без него текст ссылается на невидимое. Цвета замерены с живого 1.x (EXP-0057).
insertSampleAfterFirstParagraph('Шкала смайликов', 'emojiscale');

docs.manual = {
  slug: 'manual',
  title: { ru: 'Руководство пользователя', en: 'User Manual' },
  blocks: manualBlocks,
};

const header = `/**
 * СГЕНЕРИРОВАННЫЙ ФАЙЛ. Не правьте его руками: перезаписывается командой
 *   node tools/extract-docs.mjs
 *
 * Продуктовые тексты владельца, снятые дословно из версии 1.x (researches/06, researches/07):
 * условия использования, политика конфиденциальности, отказ от ответственности, история версий
 * и вневременные разделы руководства пользователя (манифест, идея, терминология, шкала оценок).
 *
 * Чего здесь НЕТ: разделы руководства 1.x про экраны («Дом», «Связи», «Меню», работа с
 * измерениями) — они описывают интерфейс, которого в 2.0 не существует. Их адаптация — задача
 * с участием владельца, а не механический перенос.
 *
 * ⚠️ Правовые тексты будут ДОПОЛНЕНЫ по ideas/12 (личная ответственность автора контента):
 * это место, куда придут новые пункты, — и придут они со словом владельца.
 */

export interface DocText {
  readonly ru: string;
  readonly en: string;
}

export type DocBlock =
  | { readonly type: 'h2' | 'h3' | 'p'; readonly text: DocText }
  | {
      readonly type: 'ul';
      readonly items: { readonly ru: readonly string[]; readonly en: readonly string[] };
      /** Иллюстрация пункта (1.x: картинки мысленных экспериментов стояли ВНУТРИ пунктов). */
      readonly images?: readonly ({ readonly src: string; readonly w: number; readonly h: number } | null)[];
    }
  | {
      readonly type: 'table';
      readonly head: { readonly ru: readonly string[]; readonly en: readonly string[] };
      readonly rows: { readonly ru: readonly string[][]; readonly en: readonly string[][] };
    }
  /** Иллюстрация 1.x (w/h резервируют место — графика не «доезжает на горячую»);
      kind 'logo' — маленький логотип в шапке руководства. */
  | { readonly type: 'img'; readonly src: string; readonly alt: string; readonly w: number; readonly h: number; readonly kind?: 'logo' }
  /** Шкала оценок 0…10: звезду, цифру и цветной смайлик рисует рендерер (канон 1.x). */
  | {
      readonly type: 'scale';
      readonly head: { readonly ru: readonly string[]; readonly en: readonly string[] };
      readonly descriptions: { readonly ru: readonly string[]; readonly en: readonly string[] };
    }
  /** Образец интерфейса в тексте: кнопка «Предложить», строка поиска, ряд смайликов. */
  | { readonly type: 'sample'; readonly kind: 'suggest' | 'search' | 'emojiscale' };

export interface Doc {
  readonly slug: string;
  readonly title: DocText;
  readonly blocks: readonly DocBlock[];
}

export const DOCS: Readonly<Record<string, Doc>> = `;

writeFileSync(OUT, `${header}${JSON.stringify(docs, null, 2)} as const;\n`);

const stats = Object.entries(docs)
  .map(([slug, doc]) => `${slug}: ${doc.blocks.length} блоков`)
  .join(' · ');
console.log(`✔ ${OUT}: ${stats}`);

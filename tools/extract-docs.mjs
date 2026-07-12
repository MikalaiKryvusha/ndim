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
   * пометки выбрасываем (картинок 1.x у нас нет), остальное приклеиваем к пункту.
   */
  const listItems = (start) => {
    const items = [];
    let j = start;
    while (j < lines.length) {
      const line = lines[j];
      if (line.startsWith('- ')) {
        items.push(line.slice(2).trim());
        j += 1;
        continue;
      }
      const isIndented = /^\s+\S/.test(line);
      if (isIndented && items.length > 0) {
        const tail = line.trim();
        const isImageNote = /^\*\[(Изображение|Image)/.test(tail);
        if (!isImageNote) items[items.length - 1] += ` ${tail}`;
        j += 1;
        continue;
      }
      break;
    }
    return [items, j];
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

      const [ruItems, afterRu] = listItems(j);
      let k = skipBlank(afterRu);
      if (ruItems.length > 0 && lines[k]?.trim() === '**EN:**') {
        k = skipBlank(k + 1);
        const [enItems, afterEn] = listItems(k);
        blocks.push({ type: 'ul', items: { ru: ruItems, en: enItems } });
        i = afterEn;
        continue;
      }
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

/** Подразделы, объясняющие кнопки версии 1.x («суб-вкладка "Все"») — в 2.0 их нет. */
const SKIP_SUBHEADINGS = ['Предложение нового измерения', 'Поиск по измерениям'];

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
for (const name of MANUAL_SECTIONS) {
  const { heading, lines } = section(research07, name);
  manualBlocks.push({ type: 'h2', text: splitHeading(heading.replace(/^\d+\.\s*/, '')) });
  manualBlocks.push(...dropSkipped(parseBlocks(lines)).map(dropStaleTerms));
}

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
  | { readonly type: 'ul'; readonly items: { readonly ru: readonly string[]; readonly en: readonly string[] } }
  | {
      readonly type: 'table';
      readonly head: { readonly ru: readonly string[]; readonly en: readonly string[] };
      readonly rows: { readonly ru: readonly string[][]; readonly en: readonly string[][] };
    };

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

/**
 * ЧИТАТЕЛЬ TXT-СПИСКОВ СПРОСА (`tools/demand-*.txt`, plans/41 шаг 0) — общий для обоих жнецов:
 * `wordstat-harvest.mjs --file` (секция [ru]) и `bing-keywords.mjs --file` (секция [en]).
 * Формат: `#` — комментарий, `[ru]`/`[en]` — секции, строка = запрос. Текст едет файлом, не argv.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

/** Запросы одной языковой секции файла. */
export function readDemandList(file, lang) {
  const out = [];
  let section = '';
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^\[(ru|en)\]$/i);
    if (m) {
      section = m[1].toLowerCase();
      continue;
    }
    if (section === lang) out.push(line);
  }
  return out;
}

/** Имя группы из имени файла: demand-t3-object-rating.txt → «T3». */
export function groupOf(file) {
  return basename(file).match(/demand-(t\d+)/i)?.[1].toUpperCase() ?? basename(file, '.txt');
}

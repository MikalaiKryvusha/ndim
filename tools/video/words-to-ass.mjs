#!/usr/bin/env node
/**
 * words-to-ass.mjs — субтитры ролика из слов whisper.cpp: группы по 2–3 слова, формат ASS.
 *
 * ЗАЧЕМ. Эпик `plans/90` (ИИ-студия роликов), фаза 1, шаг Ш3 `plans/91`: субтитры «слово за
 * словом» — стандарт коротких роликов (`researches/70` §3.1–3.2, приём `video-use` — короткие
 * фрагменты). Вшивает их ffmpeg фильтром `ass`; этот прибор только пишет файл.
 *
 * ВХОД — JSON `whisper-cli … -ml 1 -sow -oj` (сегмент = слово): `transcription[].offsets.{from,to}`
 * в миллисекундах и `text`. Пустые сегменты (тишина в начале) пропускаются.
 *
 * ⚠️ Названная граница (`researches/70` §3.5а): таймкоды слов whisper.cpp неточны — у коротких слов
 * бывает нулевая длина. Поэтому группа живёт от НАЧАЛА своего первого слова до начала следующей
 * группы (не до конца своего последнего слова): нулевое слово не рождает мигания.
 *
 * СЛОВАРЬ ЗАМЕН. Модель пишет имя бренда как `Ndim Space` (проба 2026-09-14, дважды); замена
 * идёт по тексту группы, регистр имени — канон продукта.
 *
 * СТИЛЬ — нейтральный намеренно: вид субтитров решает владелец в фазе 2 из четырёх вариантов
 * (канон «Дизайн»). Здесь только читаемость: белый текст, чёрная обводка, нижняя треть кадра.
 *
 * Запуск: node tools/video/words-to-ass.mjs <words.json> <out.ass> [--width 1080 --height 1920 --words 3]
 * `[NOT-TESTED]` на живой речи владельца; на синтетике — прогон шага Ш3.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Имя бренда и другие слова, которые модель пишет не так, как пишет продукт. */
export const GLOSSARY = [[/\bn\s?dim\s+space\b/gi, 'NDim Space']];

/** Миллисекунды → время ASS `H:MM:SS.cc`. */
export function assTime(ms) {
  const cs = Math.max(0, Math.round(ms / 10));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

/**
 * Слова → группы. Группа закрывается на `maxWords` словах или на знаке конца фразы, чтобы
 * субтитр не переносил начало новой мысли в хвост старой.
 */
export function groupWords(words, maxWords = 3) {
  const groups = [];
  let cur = [];
  for (const w of words) {
    cur.push(w);
    if (cur.length >= maxWords || /[.!?…]$/.test(w.text)) {
      groups.push(cur);
      cur = [];
    }
  }
  if (cur.length) groups.push(cur);
  return groups.map((g, i) => ({
    start: g[0].from,
    // До начала следующей группы — см. шапку про нулевые слова; последняя — до конца своего слова.
    end: i + 1 < groups.length ? groups[i + 1][0].from : g[g.length - 1].to,
    text: GLOSSARY.reduce((t, [re, to]) => t.replace(re, to), g.map((w) => w.text).join(' ')),
  }));
}

/**
 * JSON whisper-cli → список слов `{from, to, text}` без пустых сегментов.
 *
 * 🔴 Имя бренда склеивается в ОДНО слово до группировки. Найдено первым же прогоном 2026-09-14:
 * группа по три слова разрезала `Ndim | Space,` между двумя субтитрами, и словарь замен, который
 * работает по тексту группы, половинку имени не узнал.
 */
export function readWords(json) {
  const words = json.transcription
    .map((s) => ({ from: s.offsets.from, to: s.offsets.to, text: s.text.trim() }))
    .filter((w) => w.text.length > 0);
  const merged = [];
  for (const w of words) {
    const prev = merged[merged.length - 1];
    if (prev && /^n\s?dim$/i.test(prev.text) && /^space\b/i.test(w.text)) {
      merged[merged.length - 1] = { from: prev.from, to: w.to, text: `${prev.text} ${w.text}` };
    } else {
      merged.push(w);
    }
  }
  return merged;
}

/** Группы → текст ASS. */
export function toAss(groups, { width = 1080, height = 1920 } = {}) {
  const fontSize = Math.round(height * 0.045);
  const marginV = Math.round(height * 0.22);
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,Arial,${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${Math.round(fontSize * 0.08)},0,2,60,60,${marginV},204`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const events = groups.map((g) => `Dialogue: 0,${assTime(g.start)},${assTime(g.end)},Default,,0,0,0,,${g.text.replace(/[{}]/g, '')}`);
  return [...header, ...events, ''].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [input, output, ...rest] = process.argv.slice(2);
  if (!input || !output) {
    console.error('usage: node tools/video/words-to-ass.mjs <words.json> <out.ass> [--width N --height N --words N]');
    process.exit(2);
  }
  const opt = (name, dflt) => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? Number(rest[i + 1]) : dflt;
  };
  const words = readWords(JSON.parse(readFileSync(input, 'utf8')));
  const groups = groupWords(words, opt('words', 3));
  writeFileSync(output, toAss(groups, { width: opt('width', 1080), height: opt('height', 1920) }), 'utf8');
  console.log(`слов ${words.length} · групп ${groups.length} → ${output}`);
}

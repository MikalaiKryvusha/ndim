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
 * СТИЛЬ — по умолчанию нейтральный `A`; четыре вида для выбора владельцем — `STYLE_NAMES` / `styleLine` ниже (фаза 2 эпика 90),
 * (канон «Дизайн»). Здесь только читаемость: белый текст, чёрная обводка, нижняя треть кадра.
 *
 * Запуск: node tools/video/words-to-ass.mjs <words.json> <out.ass> [--width 1080 --height 1920 --words 3]
 * `[NOT-TESTED]` на живой речи владельца; на синтетике — прогон шага Ш3.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Имя бренда и другие слова, которые модель пишет не так, как пишет продукт. */
export const GLOSSARY = [[/\b(?:n\s?dim|endim)\s+space\b/gi, 'NDim Space']];

/**
 * Написания первой половины имени, которые модель УЖЕ давала (не догадки — наблюдения):
 * `Ndim` (русская речь, 2026-09-14) · `Endim` (английская речь, 2026-09-14). Новое написание
 * добавляется сюда после живого ролика, в котором оно встретилось.
 */
const BRAND_HEAD = /^(?:n\s?dim|endim)$/i;

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
 * Предлоги, союзы и отрицание — в русской речи они звучат слитно со СЛЕДУЮЩИМ словом, поэтому строка субтитров
 * ими не кончается. Слово владельца 2026-09-14 (№088 В1): «*не разрывать текст субтитров, где фраза связанно
 * читается, например, "музыки с" и на новом кадре "оценками других людей" - С должно было быть во второй фразе,
 * после микропаузы*».
 */
export const PROCLITICS = new Set(['с', 'со', 'в', 'во', 'на', 'к', 'ко', 'по', 'от', 'до', 'из', 'у', 'о', 'об', 'обо', 'за', 'под', 'над', 'при', 'про', 'для', 'без', 'через', 'и', 'а', 'но', 'или', 'да', 'что', 'чтобы', 'как', 'не', 'ни']);

/** Пределы строки: слов и знаков (кегль 4,5 % высоты кадра — около 22 знаков в строку без переноса). */
export const GROUPING = { maxWords: 4, maxChars: 24, pauseMs: 180 };

const bare = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Пауза на границе после слова `i`, мс: самая длинная тишина между серединой слова `i` и серединой следующего
 * ЗНАЧИМОГО слова. 🔴 Предлог пропускается: распознавание ставит короткое «с» прямо в тишину перед ним (пилот 001:
 * «музыки» — тишина 0,29 с — «с оценками»), и граница «музыки | с» иначе паузы бы не видела.
 */
function pauseAfter(words, i, pauses) {
  if (!pauses?.length || i + 1 >= words.length) return 0;
  let j = i + 1;
  while (j + 1 < words.length && PROCLITICS.has(bare(words[j].text))) j++;
  const from = (words[i].from + words[i].to) / 2;
  const to = (words[j].from + words[j].to) / 2;
  let best = 0;
  for (const p of pauses) best = Math.max(best, Math.min(p.end, to) - Math.max(p.start, from));
  return best;
}

/**
 * Слова → строки субтитров. Разбивка ищется целиком (динамическое программирование) по цене строки: разрыв на конце
 * фразы, запятой или паузе в звуке — выгоден; разрыв посреди слитной речи — дорог; строка, кончающаяся предлогом, —
 * очень дорога; длинная строка и строка из одного слова — дороже. Время: строка живёт от начала своего первого слова
 * до начала следующей строки (нулевые слова whisper не рождают мигания).
 *
 * @param {{from:number,to:number,text:string}[]} words время в мс
 * @param {number | {maxWords?:number, maxChars?:number, pauseMs?:number, pauses?:{start:number,end:number}[]}} [opts]
 *   число — прежняя форма (`maxWords`); `pauses` — тишины голоса в мс (`silencedetect`)
 */
export function groupWords(words, opts = {}) {
  const o = { ...GROUPING, ...(typeof opts === 'number' ? { maxWords: opts } : opts) };
  const n = words.length;
  const cost = (a, b) => {
    const g = words.slice(a, b + 1);
    const text = g.map((w) => w.text).join(' ');
    let c = 0;
    if (g.length > o.maxWords) c += 20;
    if (g.slice(0, -1).some((w) => /[.!?…]$/.test(w.text))) c += 20; // строка не переносит конец фразы внутрь
    if (g.length > 1 && text.length > o.maxChars) c += 4 + (text.length - o.maxChars) * 0.3;
    // Строка из одного слова мелькает: дороже паузы, дешевле конца фразы (пилот 001: «чьи», «внизу», «Связи.»).
    if (g.length === 1) c += 2.2;
    if (b === n - 1) return c;
    const last = g[g.length - 1].text;
    if (/[.!?…]$/.test(last)) return c - 2;
    if (PROCLITICS.has(bare(last))) return c + 6;
    if (/[,;:—–]$/.test(last) || /^[—–]/.test(words[b + 1].text)) return c - 1;
    return pauseAfter(words, b, o.pauses) >= o.pauseMs ? c - 1.5 : c + 1.5;
  };
  const best = [0];
  const cut = [0];
  for (let i = 1; i <= n; i++) {
    best[i] = Infinity;
    for (let k = 1; k <= Math.min(i, o.maxWords + 1); k++) {
      const v = best[i - k] + cost(i - k, i - 1);
      if (v < best[i]) {
        best[i] = v;
        cut[i] = i - k;
      }
    }
  }
  const groups = [];
  for (let i = n; i > 0; i = cut[i]) groups.unshift(words.slice(cut[i], i));
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
    if (prev && BRAND_HEAD.test(prev.text) && /^space\b/i.test(w.text)) {
      merged[merged.length - 1] = { from: prev.from, to: w.to, text: `${prev.text} ${w.text}` };
    } else {
      merged.push(w);
    }
  }
  return merged;
}

const alignKey = (w) => w.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Текст утверждённого сценария → слова с таймингом распознавания.
 *
 * 🔴 ЗАЧЕМ — найдено генеральной репетицией пилота 2026-09-14: распознавание пишет «пространство НДИМ»,
 * «НДИМ-ОЙДИ», «вашим», «звезды», «от 0 до 10» и теряет пунктуацию. Сценарий утверждён владельцем
 * (№087) — значит текст субтитров берётся ИЗ СЦЕНАРИЯ («Пространство NDim», «Вашим», «звёзды»), а из
 * распознавания берётся только ВРЕМЯ.
 *
 * Как: наибольшая общая подпоследовательность по ключу слова (нижний регистр, ё→е, без знаков). Слово
 * сценария с парой берёт её `from`/`to`; без пары (например «нуля» против «0») — время делится поровну
 * между соседями, у которых пара есть. ⚠️ Если владелец отступил от текста, субтитры покажут текст
 * СЦЕНАРИЯ — поэтому доля совпавших слов возвращается, и навык обязан её судить (ниже 0,8 — субтитры из
 * распознавания и вопрос владельцу).
 */
export function alignScript(scriptText, words) {
  // Знак без букв («—») приклеивается к предыдущему слову: без этого тире из сценария терялось в субтитрах.
  const script = scriptText.split(/\s+/).map((t) => t.trim()).filter(Boolean).reduce((acc, t) => {
    if (alignKey(t).length > 0 || acc.length === 0) acc.push(t);
    else acc[acc.length - 1] = `${acc[acc.length - 1]} ${t}`;
    return acc;
  }, []).filter((t) => alignKey(t).length > 0);
  const rec = words.flatMap((w) => {
    const parts = w.text.split(/\s+/).filter((t) => alignKey(t).length > 0);
    return parts.map((t) => ({ key: alignKey(t), from: w.from, to: w.to }));
  });
  const n = script.length;
  const m = rec.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = alignKey(script[i]) === rec[j].key ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pair = new Array(n).fill(-1);
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (alignKey(script[i]) === rec[j].key) { pair[i] = j; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const out = script.map((text, i) => (pair[i] >= 0 ? { text, from: rec[pair[i]].from, to: rec[pair[i]].to } : { text, from: null, to: null }));
  // Интерполяция слов без пары между ближайшими соседями с парой.
  for (let i = 0; i < n; i++) {
    if (out[i].from !== null) continue;
    let k = i;
    while (k < n && out[k].from === null) k++;
    const left = i > 0 ? out[i - 1].to : (rec[0]?.from ?? 0);
    const right = k < n ? out[k].from : (rec[m - 1]?.to ?? left);
    const step = (right - left) / (k - i + 1);
    for (let t = i; t < k; t++) {
      out[t].from = Math.round(left + step * (t - i));
      out[t].to = Math.round(left + step * (t - i + 1));
    }
    i = k - 1;
  }
  // Имя бренда и «NDim ID» — одно слово для группировки, чтобы не резалось между субтитрами.
  const merged = [];
  for (const w of out) {
    const prev = merged[merged.length - 1];
    if (prev && ((/^пространств/i.test(prev.text) && /^NDim/.test(w.text)) || (/NDim$/.test(prev.text) && /^(ID|Space)/.test(w.text)))) {
      merged[merged.length - 1] = { text: `${prev.text} ${w.text}`, from: prev.from, to: w.to };
    } else merged.push(w);
  }
  return { words: merged, matched: pair.filter((p) => p >= 0).length / Math.max(1, n) };
}

/**
 * ЧЕТЫРЕ ВАРИАНТА ВИДА СУБТИТРОВ — заготовка фазы 2 эпика `plans/90` («Вид ролика: четыре варианта»).
 * Выбирает владелец (канон «Дизайн»: агент рисует 4 варианта, владелец утверждает один), и выбирает на
 * своём живом ролике — до его выбора конвейер рисует `A`. Цвет бренда — `--primary: #1467d6`
 * (`src/routes/+layout.svelte`); в ASS цвет пишется `&HAABBGGRR`.
 *   A «Обводка»  — белый текст, чёрная обводка, нижняя треть (нейтральный, как в фазе 1);
 *   B «Плашка»   — белый текст на полупрозрачной тёмной плашке, нижняя треть;
 *   C «Бренд»    — белый жирный текст на плашке цвета бренда, нижняя треть;
 *   D «Крупно»   — крупный текст с толстой обводкой по центру кадра.
 */
export const STYLE_NAMES = { A: 'Обводка', B: 'Плашка', C: 'Бренд', D: 'Крупно' };

export function styleLine(style = 'A', { fontSize, marginV, name = 'Default' }) {
  const head = `Style: ${name},Arial`;
  const tail = (align, mv) => `2,${align === 5 ? 0 : 60},${align === 5 ? 0 : 60},${mv},204`.replace(/^2,/, `${align},`);
  switch (style) {
    case 'B': return `${head},${fontSize},&H00FFFFFF,&H00FFFFFF,&H80000000,&H80000000,-1,0,0,0,100,100,0,0,3,${Math.round(fontSize * 0.22)},0,${tail(2, marginV)}`;
    case 'C': return `${head},${fontSize},&H00FFFFFF,&H00FFFFFF,&H00D66714,&H00D66714,-1,0,0,0,100,100,0,0,3,${Math.round(fontSize * 0.22)},0,${tail(2, marginV)}`;
    case 'D': return `${head},${Math.round(fontSize * 1.4)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${Math.round(fontSize * 0.14)},0,${tail(5, 0)}`;
    case 'A': return `${head},${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${Math.round(fontSize * 0.08)},0,${tail(2, marginV)}`;
    default: throw new Error(`вид субтитров «${style}»: только A, B, C, D`);
  }
}

/**
 * Отступ субтитров от низа кадра, доля высоты. Было 0,22; слово владельца 2026-09-14 (№088 В1): «*хочется текст
 * чуть-чуть выше поднять*» — стало 0,27. Слово 2026-09-15, после показа двух роликов: «*субтитры немного ниже,
 * плашку вверх над субтитрами, между сабами и подбородком*» — стало 0,21 (низ строки 1517 вместо 1402, на 115 px ниже).
 * Число выведено кадром, а не арифметикой: при 0,23 ДВУХСТРОЧНАЯ строка начиналась на 1330 и касалась низа плашки (1328). Отступ и место плашки `LOGO` в `edit.mjs` — ПАРА: субтитры опустились ровно затем, чтобы между ними и
 * подбородком освободилось место под плашку. Меняя одно, пересчитывай другое.
 */
export const SUB_MARGIN = 0.21;

/**
 * Отступ субтитров поверх ЗАПИСИ ЭКРАНА — на 0,02 ниже, чем на лице: на высоте 0,27 строка ложилась на проценты
 * карточки Виктора экрана «Связи» (кадр пилота 001, 32 с), а ниже карточек экран пуст. Низ строки 1555 — выше
 * нижней панели навигации (с 1840).
 */
export const SUB_MARGIN_SCREEN = 0.19;

/**
 * Группы → текст ASS. `screens` — окна записей экрана в мс: строка, начавшаяся в окне, получает стиль `Screen`
 * с отступом `SUB_MARGIN_SCREEN`.
 */
export function toAss(groups, { width = 1080, height = 1920, style = 'A', screens = [] } = {}) {
  const fontSize = Math.round(height * 0.045);
  const marginV = Math.round(height * SUB_MARGIN);
  const onScreen = (g) => screens.some((s) => g.start >= s.start && g.start < s.end);
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    styleLine(style, { fontSize, marginV }),
    styleLine(style, { fontSize, marginV: Math.round(height * SUB_MARGIN_SCREEN), name: 'Screen' }),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const events = groups.map((g) => `Dialogue: 0,${assTime(g.start)},${assTime(g.end)},${onScreen(g) ? 'Screen' : 'Default'},,0,0,0,,${g.text.replace(/[{}]/g, '')}`);
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
  const groups = groupWords(words, { maxWords: opt('words', GROUPING.maxWords) });
  writeFileSync(output, toAss(groups, { width: opt('width', 1080), height: opt('height', 1920) }), 'utf8');
  console.log(`слов ${words.length} · групп ${groups.length} → ${output}`);
}

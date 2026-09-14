#!/usr/bin/env node
/**
 * takes.mjs — лучшие фразы из нескольких дублей: дубли → куски речи → предложения → кандидаты по фразам сценария →
 * склейка по листу выбора.
 *
 * ЗАЧЕМ. Заказ владельца 2026-09-14, дословно: «*целых два ролика снял, с разной успешностью… Чисти шум… Из двух
 * выберешь фразы, которые тебе больше нравятся. Монтаж - полностью на твоё усмотрение*». В конвейере `edit.mjs`
 * такого шага не было (эстафета `STATUS.md` 2026-09-14 22:0x).
 *
 * 🔴 ДВА НАБЛЮДЕНИЯ ЖИВЫХ ДУБЛЕЙ ПИЛОТА 001, из которых устроен прибор:
 *  1. Владелец говорит СВОИМИ словами: «я создал» вместо «я сделал», мостик «Как это работает?», фраза про похожесть —
 *     пять попыток подряд. Поэтому предложение сопоставляется фразе сценария ПО ДОЛЕ ОБЩИХ СЛОВ, а текст субтитров
 *     берётся из сказанного (лист выбора), а не из сценария.
 *  2. На целом дубле отметки слов whisper плывут на стыках 30-секундных окон: «Это работает так.» получило
 *     30,95–42,02 с при речи около секунды. Поэтому границы кусков берутся по ТИШИНЕ в звуке (`silencedetect`),
 *     а слова распознаются по кускам речи — там отметки ложатся на звук.
 *
 * РАЗДЕЛЕНИЕ ТРУДА (код прежде когниции). Прибор режет, распознаёт, сопоставляет, уточняет границы, склеивает и
 * проверяет стыки. ВЫБОР предложения — суждение агента: лист выбора `cutlist.json` с доводом у каждой строки;
 * владельцу — таблицей `cutlist.md`.
 *
 * Запуск: node tools/video/takes.mjs analyze … | render <cutlist.json> (режимы ниже)
 *
 * Режимы:
 *   analyze --take T1=<файл> [--take T2=<файл> …] --script <speech.txt> --out <папка> [--lang ru]
 *     → takes.json · candidates.md · sheets/<id>.png (четыре кадра предложения — глазу агента)
 *   render <cutlist.json> [--lang ru]
 *     → рядом с листом: assembled.mp4 (1080×1920, 30 fps, 48 кГц) · spoken.txt (текст для `edit.mjs --script`) ·
 *       cutlist.md · render.json (проверка стыков: каждый кусок склейки распознан заново — первое и последнее слово
 *       на месте, доля совпадения со строкой листа ≥ 0,8)
 *
 * `[NOT-TESTED]` на дублях, кроме пилота 001 (2026-09-14); юниты — `takes.test.mjs`.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { transcribeFiles } from './studio.mjs';
import { readWords } from './words-to-ass.mjs';

/** Пороги сняты замером дублей пилота 001 (2026-09-14), а не взяты из головы. */
export const PARAMS = {
  highpassHz: 80, // шум пилота — гул комнаты ниже 150 Гц (спектрограмма паузы); мужской голос начинается около 85 Гц
  silenceDb: -45, // пауза −71 дБ RMS, речь −32 дБ RMS
  silenceSec: 0.35, // паузы внутри фразы 0,35–0,9 с
  blipSec: 0.15, // «речь» короче — щелчок, вдох, касание петлички
  chunkGapSec: 1.1, // между попытками паузы от 1,9 с, внутри фразы до 0,9 с
  leadSec: 0.1, // запас звука вокруг куска для распознавания
  padInSec: 0.08, // запас перед началом речи в склейке
  padOutSec: 0.15, // запас после конца речи: хвост последнего звука
  matchMin: 0.35, // доля общих слов, ниже которой предложение не кандидат фразе сценария
  joinMin: 0.8, // доля совпадения переслушанного куска склейки со строкой листа
  fadeSec: 0.02, // фейд звука на каждой склейке — без щелчка
};

function run(step, bin, args) {
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.error || r.status !== 0) {
    throw new Error(`шаг «${step}» упал (код ${r.status}): ${r.error?.message ?? `${r.stdout ?? ''}${r.stderr ?? ''}`.slice(-800)}`);
  }
  return `${r.stdout ?? ''}${r.stderr ?? ''}`;
}

export const mediaDuration = (file) =>
  Number(run('длительность', 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]).trim());

/** Отчёт `silencedetect` → паузы в секундах. Пауза, не закрытая до конца файла, закрывается длительностью. */
export function parseSilences(text, total = Infinity) {
  const out = [];
  let start = null;
  for (const m of text.matchAll(/silence_(start|end): (-?[\d.]+)/g)) {
    const t = Math.max(0, Number(m[2]));
    if (m[1] === 'start') start = t;
    else if (start !== null) {
      out.push({ start, end: t });
      start = null;
    }
  }
  if (start !== null) out.push({ start, end: total });
  return out;
}

/** Паузы → куски речи между ними. «Речь» короче `blipSec` — щелчок или вдох: выбрасывается, паузы вокруг сливаются. */
export function speechRegions(silences, total, blipSec = PARAMS.blipSec) {
  const regions = [];
  let t = 0;
  for (const s of silences) {
    if (s.start - t >= blipSec) regions.push({ start: t, end: s.start });
    t = Math.max(t, s.end);
  }
  if (total - t >= blipSec) regions.push({ start: t, end: total });
  return regions;
}

/** Куски речи → попытки: соседние куски с паузой короче `gapSec` — одна попытка. */
export function chunksOf(regions, gapSec = PARAMS.chunkGapSec) {
  const chunks = [];
  for (const r of regions) {
    const last = chunks[chunks.length - 1];
    if (last && r.start - last.end < gapSec) {
      last.end = r.end;
      last.regions.push(r);
    } else chunks.push({ start: r.start, end: r.end, regions: [r] });
  }
  return chunks;
}

/** Слова → предложения по знаку конца (`.`, `!`, `?`, `…`). */
export function sentencesOf(words) {
  const groups = [];
  let cur = [];
  for (const w of words) {
    cur.push(w);
    if (/[.!?…]$/.test(w.text)) {
      groups.push(cur);
      cur = [];
    }
  }
  if (cur.length) groups.push(cur);
  return groups.map((ws) => ({ words: ws, text: ws.map((w) => w.text).join(' '), from: ws[0].from, to: ws[ws.length - 1].to }));
}

/** Кусок речи, содержащий момент `t`, иначе ближайший. */
function regionAt(regions, t) {
  let best = 0;
  let bestD = Infinity;
  regions.forEach((r, i) => {
    const d = t < r.start ? r.start - t : t > r.end ? t - r.end : 0;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/**
 * Границы предложения — по звуку: начало куска речи с его первым словом, конец куска с последним.
 * Два предложения без паузы между ними (граница внутри непрерывной речи) делятся посередине между последним словом
 * одного и первым словом другого, и оба помечаются `seamless`: резать там — рисковать слогом.
 */
export function snapSentences(sentences, regions) {
  const out = sentences.map((s) => {
    const a = regionAt(regions, s.from);
    const b = Math.max(a, regionAt(regions, s.to));
    return { ...s, ra: a, rb: b, start: regions[a].start, end: regions[b].end, seamless: false };
  });
  for (let k = 1; k < out.length; k++) {
    if (out[k].ra <= out[k - 1].rb) {
      const cut = (out[k - 1].to + out[k].from) / 2;
      out[k - 1].end = cut;
      out[k].start = cut;
      out[k - 1].seamless = true;
      out[k].seamless = true;
    }
  }
  return out.map(({ ra, rb, ...rest }) => rest);
}

/** Числа 0…10 словами и цифрами, имя бренда в написаниях модели — один ключ. */
const NUMERALS = { ноль: '0', нуля: '0', нулю: '0', один: '1', одного: '1', два: '2', двух: '2', три: '3', трёх: '3', трех: '3', пять: '5', десять: '10', десяти: '10' };
export const wordKey = (w) => {
  const k = w.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '');
  // «10-ти», «10ти» — число с падежным хвостом (распознавание стыка 5 пилота 001).
  const digits = k.match(/^(\d+)\p{L}*$/u);
  if (digits) return digits[1];
  return NUMERALS[k] ?? (/^(?:endim|ndim|эндим|ндим)$/.test(k) ? 'ndim' : k);
};
const keysOf = (text) => text.split(/\s+/).map(wordKey).filter(Boolean);

/** Доля общих слов двух текстов по порядку: 2·НОП / (|a| + |b|). 1 — те же слова в том же порядке. */
export function similarity(a, b) {
  const x = keysOf(a);
  const y = keysOf(b);
  if (!x.length || !y.length) return 0;
  const dp = Array.from({ length: x.length + 1 }, () => new Uint16Array(y.length + 1));
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  return (2 * dp[0][0]) / (x.length + y.length);
}

/** Текст сценария → фразы (предложения). */
export const splitScript = (text) => (text.replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]+/g) ?? []).map((s) => s.trim());

/** Каждой фразе сценария — предложения дублей, похожие на неё не меньше `min`, лучшие первыми. */
export function matchBlocks(blocks, sentences, min = PARAMS.matchMin) {
  return blocks.map((text, i) => ({
    i: i + 1,
    text,
    candidates: sentences
      .map((s) => ({ id: s.id, sim: Math.round(similarity(text, s.text) * 100) / 100 }))
      .filter((c) => c.sim >= min)
      .sort((a, b) => b.sim - a.sim),
  }));
}

/**
 * Лист выбора → отрезки дублей. Строка листа — один НЕПРЕРЫВНЫЙ кусок одного дубля: предложения подряд (`ids`)
 * либо явное время `{take, start, end}` — для среза ВНУТРИ предложения (оборванный и начатый заново кусок фразы;
 * время агент берёт из карты кусков речи `regions` в takes.json). Запасы `pad` не заходят в соседние предложения.
 */
export function cutRanges(cuts, takes, pad = { in: PARAMS.padInSec, out: PARAMS.padOutSec }) {
  return cuts.map((c, n) => {
    const row = `строка ${n + 1}`;
    if (!c.text?.trim()) throw new Error(`${row}: нет текста субтитров — его пишет агент по сказанному`);
    if (c.take !== undefined) {
      const t = takes[c.take];
      if (!t) throw new Error(`${row}: дубля «${c.take}» нет в разметке`);
      if (!(c.start >= 0 && c.end > c.start && c.end <= t.duration)) throw new Error(`${row}: время ${c.start}–${c.end} вне дубля «${c.take}»`);
      return { n: n + 1, take: c.take, ids: [], start: c.start, end: c.end, text: c.text.trim(), why: c.why ?? '' };
    }
    const ids = Array.isArray(c.ids) ? c.ids : [c.id];
    const take = String(ids[0]).split('-')[0];
    const list = takes[take]?.sentences;
    if (!list) throw new Error(`${row}: дубля «${take}» нет в разметке`);
    const idx = ids.map((id) => {
      if (!String(id).startsWith(`${take}-`)) throw new Error(`${row}: «${id}» из другого дубля — строка листа это кусок одного дубля`);
      const i = list.findIndex((s) => s.id === id);
      if (i < 0) throw new Error(`${row}: предложения «${id}» нет в разметке`);
      return i;
    });
    idx.forEach((v, k) => {
      if (k && v !== idx[k - 1] + 1) throw new Error(`${row}: предложения не подряд (${ids.join(', ')})`);
    });
    const first = list[idx[0]];
    const last = list[idx[idx.length - 1]];
    const prev = list[idx[0] - 1];
    const next = list[idx[idx.length - 1] + 1];
    const start = Math.max(0, prev ? prev.end : 0, first.start - pad.in);
    const end = Math.min(takes[take].duration ?? Infinity, next ? next.start : Infinity, last.end + pad.out);
    return { n: n + 1, take, ids, start, end, text: c.text.trim(), why: c.why ?? '' };
  });
}

/**
 * Фильтр склейки: каждый отрезок — вертикаль 1080×1920 30 fps (поворот телефона ffmpeg применяет сам), звук 48 кГц
 * стерео с фейдом на каждой склейке, затем `concat`.
 * ⚠️ Кадрирование дублей НЕ сводится: положение лица меняется и внутри дубля (пилот 001: к концу первого дубля лицо
 * ушло к центру и ниже), поэтому одна поправка на дубль была бы догадкой. Склейка между попытками — обычная
 * склейка «говорящей головы».
 * 🔴 Картинка и звук отрезка режутся ОДНОЙ длиной `trim`/`atrim`, кратной кадру (`frameGrid`): иначе видео
 * округляется до кадров, звук нет, и позиции кусков в склейке уплывают — проверка стыков пилота 001 слышала в конце
 * третьего куска «и» из начала четвёртого (по звуку источника там тишина −67…−75 дБ).
 */
export function renderGraph(cuts, fade = PARAMS.fadeSec) {
  const parts = [];
  cuts.forEach((c, k) => {
    const d = (c.end - c.start).toFixed(4);
    // `fps` ДО `trim`: после обрезки он дорисовывал кадр до конца последнего и удлинял каждый отрезок на кадр.
    parts.push(`[${k}:v]fps=30,trim=duration=${d},setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p,setsar=1[v${k}]`);
    parts.push(`[${k}:a]atrim=duration=${d},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:st=0:d=${fade},afade=t=out:st=${Math.max(0, d - fade).toFixed(3)}:d=${fade}[a${k}]`);
  });
  parts.push(`${cuts.map((_, k) => `[v${k}][a${k}]`).join('')}concat=n=${cuts.length}:v=1:a=1[v][a]`);
  return parts.join(';');
}

/**
 * Проверка стыков: переслушанный кусок склейки против строки листа. Ловит срезанное первое или последнее слово и
 * чужое слово соседнего предложения, затащенное запасом.
 */
export function checkJoins(cuts, heard, min = PARAMS.joinMin) {
  return cuts.map((c, k) => {
    const want = keysOf(c.text);
    const got = keysOf(heard[k] ?? '');
    const sim = Math.round(similarity(c.text, heard[k] ?? '') * 100) / 100;
    const firstOk = got.slice(0, 2).includes(want[0]);
    const lastOk = got.slice(-2).includes(want[want.length - 1]);
    return { n: c.n, ok: sim >= min && firstOk && lastOk, sim, firstOk, lastOk, heard: heard[k] ?? '' };
  });
}

const sec = (t) => t.toFixed(2).replace('.', ',');

/** Четыре кадра предложения в ряд — глазу агента: взгляд в камеру, лицо, жест. */
function sheet(file, s, out) {
  const at = [0.15, 0.4, 0.65, 0.9].map((q) => s.start + (s.end - s.start) * q);
  const inputs = at.flatMap((t) => ['-ss', t.toFixed(3), '-i', file]);
  const graph = `${at.map((_, k) => `[${k}:v]scale=240:-2[f${k}]`).join(';')};${at.map((_, k) => `[f${k}]`).join('')}hstack=4`;
  run('кадры предложения', 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', graph, '-frames:v', '1', out]);
}

export function analyzeTakes({ takes, script, out, lang = 'ru' }) {
  mkdirSync(join(out, 'chunks'), { recursive: true });
  mkdirSync(join(out, 'sheets'), { recursive: true });
  const result = { params: PARAMS, script, takes: {}, blocks: [] };
  const all = [];
  for (const [name, file] of Object.entries(takes)) {
    const total = mediaDuration(file);
    const silences = parseSilences(
      run('паузы', 'ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', `highpass=f=${PARAMS.highpassHz},silencedetect=noise=${PARAMS.silenceDb}dB:d=${PARAMS.silenceSec}`, '-f', 'null', '-']),
      total,
    );
    const regions = speechRegions(silences, total);
    const chunks = chunksOf(regions);
    const wavs = chunks.map((c, k) => {
      c.wavFrom = Math.max(0, c.start - PARAMS.leadSec);
      const wav = join(out, 'chunks', `${name}-${String(k + 1).padStart(2, '0')}.wav`);
      run('кусок речи', 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', c.wavFrom.toFixed(3), '-t', (c.end + PARAMS.leadSec - c.wavFrom).toFixed(3), '-i', file,
        '-af', `highpass=f=${PARAMS.highpassHz}`, '-ar', '16000', '-ac', '1', wav]);
      return wav;
    });
    const jsons = transcribeFiles(wavs, lang);
    const sentences = [];
    chunks.forEach((c, k) => {
      const words = readWords(JSON.parse(readFileSync(jsons[k], 'utf8'))).map((w) => ({ text: w.text, from: c.wavFrom + w.from / 1000, to: c.wavFrom + w.to / 1000 }));
      for (const s of snapSentences(sentencesOf(words), c.regions)) sentences.push({ ...s, chunk: k + 1 });
    });
    sentences.forEach((s, i) => {
      s.id = `${name}-${String(i + 1).padStart(2, '0')}`;
      s.take = name;
      sheet(file, s, join(out, 'sheets', `${s.id}.png`));
    });
    result.takes[name] = {
      file,
      duration: total,
      regions,
      chunks: chunks.map(({ start, end }) => ({ start, end })),
      sentences: sentences.map(({ words, ...rest }) => rest),
    };
    all.push(...sentences);
  }
  result.blocks = matchBlocks(splitScript(readFileSync(script, 'utf8')), all);
  writeFileSync(join(out, 'takes.json'), JSON.stringify(result, null, 2), 'utf8');

  const byId = Object.fromEntries(all.map((s) => [s.id, s]));
  const row = (id, sim) => {
    const s = byId[id];
    return `| ${id} | ${sec(s.start)}–${sec(s.end)} | ${sec(s.end - s.start)} с | ${sim ?? '—'} | ${s.seamless ? 'без паузы' : ''} | ${s.text} |`;
  };
  const head = '| id | начало–конец | длина | совпадение | стык | сказано |\n|---|---|---|---|---|---|';
  const used = new Set(result.blocks.flatMap((b) => b.candidates.map((c) => c.id)));
  const md = [
    `# Кандидаты фраз — ${Object.entries(takes).map(([n, f]) => `${n}: ${f}`).join(' · ')}`,
    '',
    `Сценарий: ${script} · фраз ${result.blocks.length} · предложений в дублях ${all.length}`,
    '',
    ...result.blocks.flatMap((b) => [`## ${b.i}. ${b.text}`, '', head, ...b.candidates.map((c) => row(c.id, c.sim)), '']),
    '## Не похожи ни на одну фразу сценария',
    '',
    head,
    ...all.filter((s) => !used.has(s.id)).map((s) => row(s.id)),
    '',
  ].join('\n');
  writeFileSync(join(out, 'candidates.md'), md, 'utf8');
  return result;
}

/** Границы отрезков — на сетку кадров 30 fps: длина каждого куска кратна кадру, позиции в склейке точны. */
export const frameGrid = (cuts, fps = 30) =>
  cuts.map((c) => ({ ...c, start: Math.round(c.start * fps) / fps, end: Math.round(c.end * fps) / fps }));

export function renderCutlist(cutlistPath, { lang = 'ru' } = {}) {
  const base = dirname(resolve(cutlistPath));
  const cl = JSON.parse(readFileSync(cutlistPath, 'utf8'));
  const an = JSON.parse(readFileSync(resolve(base, cl.analysis), 'utf8'));
  const cuts = frameGrid(cutRanges(cl.cuts, an.takes));
  const assembled = join(base, 'assembled.mp4');
  // Вход читается с запасом 0,5 с: точную длину отрезает `trim`/`atrim` в фильтре.
  const inputs = cuts.flatMap((c) => ['-ss', c.start.toFixed(4), '-t', (c.end - c.start + 0.5).toFixed(4), '-i', an.takes[c.take].file]);
  run('склейка', 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', renderGraph(cuts),
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-movflags', '+faststart', assembled]);

  // Проверка стыков — по СОБРАННОМУ файлу: куски вырезаются из склейки по накопленному времени.
  const dir = join(base, 'joins');
  mkdirSync(dir, { recursive: true });
  let at = 0;
  const wavs = cuts.map((c) => {
    const wav = join(dir, `cut-${String(c.n).padStart(2, '0')}.wav`);
    run('кусок склейки', 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', at.toFixed(3), '-t', (c.end - c.start).toFixed(3), '-i', assembled, '-ar', '16000', '-ac', '1', wav]);
    c.at = at;
    at += c.end - c.start;
    return wav;
  });
  const heard = transcribeFiles(wavs, lang).map((j) => readWords(JSON.parse(readFileSync(j, 'utf8'))).map((w) => w.text).join(' '));
  const joins = checkJoins(cuts, heard);
  const green = joins.every((j) => j.ok);

  writeFileSync(join(base, 'spoken.txt'), `${cuts.map((c) => c.text).join('\n')}\n`, 'utf8');
  writeFileSync(join(base, 'render.json'), JSON.stringify({ assembled, duration: at, green, cuts, joins }, null, 2), 'utf8');
  writeFileSync(join(base, 'cutlist.md'), [
    '| № | Фраза в ролике | Дубль · время в дубле | Почему этот дубль |',
    '|---|---|---|---|',
    ...cuts.map((c) => `| ${c.n} | ${c.text} | ${c.take === 'T1' ? 'первый' : c.take === 'T2' ? 'второй' : c.take} · ${sec(c.start)}–${sec(c.end)} с | ${c.why} |`),
    '',
  ].join('\n'), 'utf8');
  return { assembled, duration: at, green, joins };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [mode, ...rest] = process.argv.slice(2);
  const opt = (k) => {
    const i = rest.indexOf(`--${k}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  try {
    if (mode === 'analyze') {
      const takes = Object.fromEntries(rest.flatMap((v, i) => (rest[i - 1] === '--take' ? [v.split(/=(.*)/s).slice(0, 2)] : [])));
      if (!Object.keys(takes).length || !opt('script') || !opt('out')) throw new Error('usage: analyze --take T1=<файл> [--take T2=<файл>] --script <speech.txt> --out <папка> [--lang ru]');
      const r = analyzeTakes({ takes, script: opt('script'), out: opt('out'), lang: opt('lang') ?? 'ru' });
      for (const [n, t] of Object.entries(r.takes)) console.log(`${n}: попыток ${t.chunks.length}, предложений ${t.sentences.length}`);
      for (const b of r.blocks) console.log(`фраза ${b.i}: кандидатов ${b.candidates.length}${b.candidates[0] ? `, лучший ${b.candidates[0].id} (${b.candidates[0].sim})` : ''}`);
      console.log(`→ ${join(opt('out'), 'candidates.md')}`);
    } else if (mode === 'render') {
      if (!rest[0]) throw new Error('usage: render <cutlist.json> [--lang ru]');
      const r = renderCutlist(rest[0], { lang: opt('lang') ?? 'ru' });
      for (const j of r.joins) console.log(`${j.ok ? '✅' : '🔴'} стык ${j.n}: совпадение ${j.sim}${j.firstOk ? '' : ' · первое слово не услышано'}${j.lastOk ? '' : ' · последнее слово не услышано'} — «${j.heard}»`);
      console.log(`${r.green ? 'ALL GREEN' : 'RED — см. render.json'} · ${r.duration.toFixed(1)} с → ${r.assembled}`);
      process.exit(r.green ? 0 : 1);
    } else {
      throw new Error('usage: node tools/video/takes.mjs analyze … | render <cutlist.json>');
    }
  } catch (e) {
    console.error(`🔴 ${e.message}`);
    process.exit(1);
  }
}

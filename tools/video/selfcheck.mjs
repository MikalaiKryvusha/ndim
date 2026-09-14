#!/usr/bin/env node
/**
 * selfcheck.mjs — агент проверяет смонтированный ролик САМ, до того как его увидит владелец.
 *
 * ЗАЧЕМ. Эпик `plans/90`, критерий приёмки 2 «Монтаж проверен агентом до владельца»; шаг Ш5
 * `plans/91`. Приёмы — `researches/70` §3.4: `ffprobe` (формат), `ebur128` (громкость),
 * `silencedetect` (невырезанные паузы), `blackdetect` / `freezedetect` (брак кадра).
 *
 * КАЖДАЯ ПРОВЕРКА ОБЯЗАНА УМЕТЬ КРАСНЕТЬ. Доказательство — три мутанта критерия 2 фазы
 * (пауза 3 с · громкость −30 LUFS · чёрная секунда): прогон на каждом называет СВОЮ проверку.
 * Зелёное, которое не могло покраснеть, — класс, за которым охотится `TESTING_FRAMEWORK.md`.
 *
 * Сверка субтитров повторным распознаванием (`subtitleDrift`) идёт, когда передан файл субтитров;
 * без него отчёт пишет строку `skipped`, а не молчит и не красит зелёным.
 *
 * Пороги — выводы разведки, не стандарты площадок (официального числа LUFS YouTube/Instagram
 * разведка не нашла): окно −16…−12 LUFS, пауза длиннее 1,0 с, чёрное и застывшее от 0,5 / 5 с.
 *
 * Запуск: node tools/video/selfcheck.mjs <папка выхода | video.mp4> [--ass <subs.ass>] [--lang ru|en] [--json <out.json>]
 * Код 0 и строка `ALL GREEN` — всё зелёное; код 1 — есть красное (названо поимённо).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { transcribeWords } from './studio.mjs';
import { readWords } from './words-to-ass.mjs';

export const LIMITS = {
  width: 1080,
  height: 1920,
  lufsMin: -16,
  lufsMax: -12,
  pauseSec: 1.0,
  pauseNoiseDb: -35,
  blackSec: 0.5,
  // 5 с, а не 2: запись экрана продукта под живую речь стоит неподвижно по 3 с, и это не брак —
  // порог 2 с ложно краснел на ней (синтетика `synthetic-003-screencast`, 2026-09-14). Брак класса
  // «картинка зависла, звук идёт» длиннее; мутант ВК-05 — 6 с.
  freezeSec: 5,
};

/** ffmpeg/ffprobe без оболочки; stderr ffmpeg и есть его отчёт фильтров. */
function run(bin, args) {
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  return `${r.stdout ?? ''}${r.stderr ?? ''}`;
}

/** Разбор отчётов фильтров — чистые функции, чтобы юниты гоняли их без видео. */
export function parseIntegratedLufs(text) {
  const summary = text.slice(text.lastIndexOf('Summary:'));
  const m = summary.match(/I:\s+(-?[\d.]+|-inf)\s+LUFS/);
  return m ? (m[1] === '-inf' ? -Infinity : Number(m[1])) : null;
}
export const countMatches = (text, re) => (text.match(re) ?? []).length;

/**
 * Застывшие отрезки из отчёта `freezedetect` (снятого с малым `d`), СКЛЕЕННЫЕ по стыкам.
 *
 * 🔴 Зачем склейка — найдено замером 2026-09-14: 6 с неподвижного кадра ffmpeg отдал ДВУМЯ
 * отрезками 4,37 + 1,67 с со стыком на 8,33 с (шов перекодирования), и проверка «отрезок ≥ 5 с»
 * пропустила настоящий брак. Склеиваются только отрезки ВСТЫК (`gapSec` ≈ 0).
 *
 * 🔴 И почему не шире — найдено на записи экрана продукта тем же вечером: прокрутка даёт 1–2 кадра
 * настоящего движения (разрывы 0,03–0,07 с), и склейка с допуском 0,1 с перешагивала через них,
 * называя живую прокрутку застыванием. Разрыв хотя бы в один кадр — движение, не шов.
 */
export function mergedFreezes(text, gapSec = 0.005) {
  const starts = [...text.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...text.matchAll(/freeze_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const merged = [];
  starts.forEach((s, i) => {
    const e = ends[i] ?? s;
    const last = merged[merged.length - 1];
    if (last && s - last.end <= gapSec) last.end = e;
    else merged.push({ start: s, end: e });
  });
  return merged.map((m) => ({ ...m, duration: Math.round((m.end - m.start) * 1000) / 1000 }));
}

/** `H:MM:SS.cc` → миллисекунды. */
const assMs = (t) => {
  const [h, m, s] = t.split(':');
  return Math.round((Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000);
};
const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Сверка субтитров со звуком ГОТОВОГО ролика: начало каждой строки субтитров против начала того же
 * слова в повторном распознавании. Ловит класс «субтитры сняты не с того звука» (например, до
 * вырезания пауз) — рассинхрон, который владелец увидел бы глазом.
 *
 * Сопоставление по тексту: первое слово строки ищется в словах распознавания вперёд от прошлой
 * находки (окно 6 слов). Зелёное — сопоставлено ≥ 90 % строк и наибольший сдвиг ≤ `maxDriftMs`.
 * ⚠️ Таймкоды whisper.cpp сами неточны (`researches/70` §3.5а). Порог 500 мс, а не прежние 200 — по
 * наблюдению генеральной репетиции пилота 2026-09-14: два прогона распознавания на ОДНОМ звуке расходятся
 * на −260…+320 мс в обе стороны, и 200 мс краснели на разбросе прибора. Класс, ради которого проверка
 * существует («субтитры не с того звука»), даёт секунды: мутант «до вырезания пауз» — 9 900 мс.
 */
export function subtitleDrift(assText, words, maxDriftMs = 500) {
  const lines = assText
    .split(/\r?\n/)
    .filter((l) => l.startsWith('Dialogue:'))
    .map((l) => {
      const parts = l.split(',');
      return { start: assMs(parts[1]), first: norm(parts.slice(9).join(',').split(/\s+/)[0] ?? '') };
    });
  let at = 0;
  let matched = 0;
  let maxDrift = 0;
  for (const line of lines) {
    // Из кандидатов в окне — ближайший по времени, а не первый: повторяющееся слово («Пространство»
    // шесть раз в пилоте) иначе хватает соседнее вхождение и даёт ложный сдвиг (1 570 мс на репетиции 2026-09-14).
    let idx = -1;
    words.slice(at, at + 6).forEach((w, k) => {
      if (norm(w.text.split(/\s+/)[0]) !== line.first) return;
      if (idx < 0 || Math.abs(w.from - line.start) < Math.abs(words[at + idx].from - line.start)) idx = k;
    });
    if (idx < 0) continue;
    const w = words[at + idx];
    maxDrift = Math.max(maxDrift, Math.abs(w.from - line.start));
    matched += 1;
    at += idx + 1;
  }
  const ok = lines.length > 0 && matched / lines.length >= 0.9 && maxDrift <= maxDriftMs;
  return { ok, lines: lines.length, matched, maxDrift };
}

/**
 * @param {string} file готовый ролик
 * @param {{ass?: string, lang?: string, workBase?: string}} [opt] без `ass` сверка субтитров
 *   честно помечается `skipped`, а не зелёной
 */
export function checkVideo(file, opt = {}) {
  const results = [];
  const add = (name, ok, detail) => results.push({ name, ok, detail });

  const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', file]));
  const v = probe.streams.find((s) => s.codec_type === 'video');
  const hasAudio = probe.streams.some((s) => s.codec_type === 'audio');
  add('format', !!v && v.width === LIMITS.width && v.height === LIMITS.height, v ? `${v.width}×${v.height}` : 'нет видеодорожки');
  add('audio', hasAudio, hasAudio ? 'есть' : 'нет звуковой дорожки');

  const loud = parseIntegratedLufs(run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-']));
  add('loudness', loud !== null && loud >= LIMITS.lufsMin && loud <= LIMITS.lufsMax, `${loud} LUFS (окно ${LIMITS.lufsMin}…${LIMITS.lufsMax})`);

  const pauses = countMatches(
    run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', `silencedetect=noise=${LIMITS.pauseNoiseDb}dB:d=${LIMITS.pauseSec}`, '-f', 'null', '-']),
    /silence_end:/g,
  );
  add('pauses', pauses === 0, `пауз длиннее ${LIMITS.pauseSec} с: ${pauses}`);

  // freezedetect с малым d=0,5 — длинный брак собирается склейкой отрезков, а не одним событием.
  const frames = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vf', `blackdetect=d=${LIMITS.blackSec}:pix_th=0.10,freezedetect=n=0.001:d=0.5`, '-an', '-f', 'null', '-']);
  const black = countMatches(frames, /black_start:/g);
  const longest = Math.max(0, ...mergedFreezes(frames).map((f) => f.duration));
  add('black', black === 0, `чёрных отрезков ≥ ${LIMITS.blackSec} с: ${black}`);
  add('freeze', longest < LIMITS.freezeSec, `самый длинный застывший отрезок ${longest} с (порог ${LIMITS.freezeSec} с)`);

  if (opt.ass && existsSync(opt.ass)) {
    const wordsJson = transcribeWords(file, opt.workBase ?? `${file}.recheck`, opt.lang ?? 'ru');
    const d = subtitleDrift(readFileSync(opt.ass, 'utf8'), readWords(JSON.parse(readFileSync(wordsJson, 'utf8'))));
    add('subtitles-sync', d.ok, `строк ${d.lines}, сопоставлено ${d.matched}, наибольший сдвиг ${d.maxDrift} мс`);
  } else {
    results.push({ name: 'subtitles-sync', ok: null, detail: 'skipped — файл субтитров не передан' });
  }
  return { file, green: results.every((r) => r.ok !== false), results };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [file, ...rest] = process.argv.slice(2);
  if (!file) {
    console.error('usage: node tools/video/selfcheck.mjs <папка выхода | video.mp4> [--ass <subs.ass>] [--lang ru|en] [--json <out.json>]');
    process.exit(2);
  }
  // Папка выхода конвейера (`ndim-studio\out\<имя>`) — ролик и субтитры берутся из неё сами.
  const isDir = statSync(file).isDirectory();
  const lang = rest.includes('--lang') ? rest[rest.indexOf('--lang') + 1] : 'ru';
  const report = isDir
    ? checkVideo(join(file, 'video.mp4'), { ass: join(file, 'work', '05_subs.ass'), lang, workBase: join(file, 'work', '06_recheck') })
    : checkVideo(file, { lang, ass: rest.includes('--ass') ? rest[rest.indexOf('--ass') + 1] : undefined });
  for (const r of report.results) console.log(`${r.ok === null ? '⏭️ ' : r.ok ? '✅' : '🔴'} ${r.name}: ${r.detail}`);
  const j = rest.indexOf('--json');
  if (j >= 0) writeFileSync(rest[j + 1], JSON.stringify(report, null, 2), 'utf8');
  console.log(report.green ? 'ALL GREEN' : `RED: ${report.results.filter((r) => r.ok === false).map((r) => r.name).join(', ')}`);
  process.exit(report.green ? 0 : 1);
}

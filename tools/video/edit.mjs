#!/usr/bin/env node
/**
 * edit.mjs — монтажный конвейер одной командой: сырой ролик владельца → готовый вертикальный ролик.
 *
 * ЗАЧЕМ. Эпик `plans/90` (ИИ-студия роликов): «*владелец только снимает сырое видео и грузит в
 * соцсети*» (слово 2026-09-14). Шаг Ш4 `plans/91`. Каждый шаг ниже снят пробой на этой машине
 * (`researches/70` §3.5–3.5б), а не взят из памяти.
 *
 * ШАГИ (журнал `journal.json` пишет исполнителя каждого — критерий 1 эпика считает строки «владелец»):
 *   1. приведение к 1080×1920, 30 fps, H.264, звук 48 кГц (вертикаль — масштаб, горизонталь — центр-кроп;
 *      слежение за лицом — не в фазе 1);
 *   2. вырезание пауз — `auto-editor` (порог 4 %, поле 0,2 с);
 *   3. звук — `afftdn` + двухпроходный `loudnorm` (−14 LUFS, TP −1,5);
 *   4. слова — `whisper-cli` на CUDA, модель large-v3-turbo q5 (🔴 без `-ml 1 -sow` таймкодов слов нет);
 *   5. субтитры — `words-to-ass.mjs` → вшивание фильтром `ass`;
 *   6. самопроверка — `selfcheck.mjs` → `selfcheck.json`.
 * Подпись, хэштеги и ссылку с меткой пишет агент навыком (текст по портрету голоса), не этот скрипт:
 * журнал называет этот шаг следующим, а не делает вид, что он сделан.
 *
 * ГДЕ ЖИВУТ ФАЙЛЫ. Видео, программы и модель — ВНЕ git (инвариант эпика): `NDIM_STUDIO_DIR`
 * (по умолчанию `D:\work\ai_sandbox\ndim-studio`) → `bin\auto-editor.exe`, `bin\whisper\whisper-cli.exe`,
 * `models\ggml-large-v3-turbo-q5_0.bin`, `inbox\`, `out\<имя>\`. ffmpeg берётся из PATH (8.1.1 full).
 *
 * ⚠️ Названные границы: HDR/HEVC телефона приводится к SDR только перекодированием, без тонмаппинга —
 * проверить на первом живом файле (риск 4 `plans/91`); язык распознавания по умолчанию `ru`.
 *
 * Запуск: node tools/video/edit.mjs <вход.mp4> [--lang ru|en] [--name <имя>] [--broll <запись экрана> --from-word <слово> --to-word <слово>] [--script <текст речи.txt>]
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { alignScript, groupWords, readWords, toAss } from './words-to-ass.mjs';
import { checkVideo } from './selfcheck.mjs';
import { BIN, STUDIO, transcribeWords } from './studio.mjs';

/** Запуск без оболочки; провал шага останавливает конвейер с именем шага, а не молча. */
function run(step, bin, args) {
  const t0 = Date.now();
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.error || r.status !== 0) {
    throw new Error(`шаг «${step}» упал (код ${r.status}): ${r.error?.message ?? out.slice(-800)}`);
  }
  return { out, ms: Date.now() - t0 };
}

/** Первый проход loudnorm отдаёт JSON замера — второй проход применяет его линейно. */
function measureLoudnorm(file) {
  const { out } = run('звук: замер', 'ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'afftdn=nf=-25,loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-']);
  return JSON.parse(out.slice(out.lastIndexOf('{'), out.lastIndexOf('}') + 1));
}

const normWord = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Отрезок вставки записи экрана — ПО СЛОВАМ сценария, а не по секундам: паузы вырезаются, и секунды
 * сырого файла в готовом ролике уезжают, а слова остаются. От начала первого вхождения `fromWord` до
 * конца первого после него `toWord`. Не нашлось — исключение с именем слова: монтаж без показа, о котором
 * никто не узнал, хуже остановки.
 */
export function wordRange(words, fromWord, toWord) {
  const i = words.findIndex((w) => normWord(w.text) === normWord(fromWord));
  if (i < 0) throw new Error(`слово начала вставки «${fromWord}» не найдено в распознавании`);
  const j = words.findIndex((w, k) => k >= i && normWord(w.text) === normWord(toWord));
  if (j < 0) throw new Error(`слово конца вставки «${toWord}» не найдено после «${fromWord}»`);
  return { start: words[i].from / 1000, end: words[j].to / 1000 };
}

/**
 * Фильтр монтажа: запись экрана во весь кадр на отрезке, лицо автора — малым окном сверху справа
 * (выше нижней трети, где субтитры и интерфейс площадки, `researches/70` §4.7), субтитры поверх всего.
 */
export function brollFilter({ start, end, assArg }) {
  const on = `enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`;
  return [
    '[0:v]split=2[main][face]',
    `[1:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setpts=PTS-STARTPTS+${start.toFixed(3)}/TB[scr]`,
    `[main][scr]overlay=0:0:${on}:eof_action=pass[v1]`,
    '[face]scale=324:576[pip]',
    `[v1][pip]overlay=W-w-48:160:${on}[v2]`,
    `[v2]ass='${assArg}'[v]`,
  ].join(';');
}

export function editVideo(input, { lang = 'ru', name, broll, fromWord, toWord, script } = {}) {
  for (const [k, p] of Object.entries(BIN)) if (!existsSync(p)) throw new Error(`нет ${k}: ${p} (NDIM_STUDIO_DIR)`);
  const id = name || basename(input, extname(input));
  const out = join(STUDIO, 'out', id);
  const work = join(out, 'work');
  mkdirSync(work, { recursive: true });
  const journal = [{ step: 'съёмка', by: 'владелец', file: input }];
  const log = (step, r, extra = {}) => journal.push({ step, by: 'агент', ms: r.ms, ...extra });

  const norm = join(work, '01_norm.mp4');
  log('приведение формата', run('приведение формата', 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input,
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-ar', '48000', '-b:a', '192k', norm]));

  const cut = join(work, '02_cut.mp4');
  log('вырезание пауз', run('вырезание пауз', BIN.autoEditor, [norm, '--edit', 'audio:threshold=0.04', '--margin', '0.2s', '--no-open', '--progress', 'none', '-o', cut]));

  const m = measureLoudnorm(cut);
  const audio = join(work, '03_audio.mp4');
  log('звук', run('звук', 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', cut, '-af',
    `afftdn=nf=-25,loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', audio]), { inputLufs: Number(m.input_i) });

  const t4 = Date.now();
  const wordsJson = transcribeWords(audio, join(work, '04_words'), lang);
  log('распознавание слов', { ms: Date.now() - t4 });

  const words = readWords(JSON.parse(readFileSync(wordsJson, 'utf8')));
  // Утверждённый сценарий даёт ТЕКСТ субтитров, распознавание — только время (alignScript, репетиция 2026-09-14).
  let subWords = words;
  if (script) {
    const aligned = alignScript(readFileSync(script, 'utf8'), words);
    const useScript = aligned.matched >= 0.8;
    if (useScript) subWords = aligned.words;
    journal.push({ step: 'текст субтитров из сценария', by: 'агент', script, matched: Number(aligned.matched.toFixed(3)),
      used: useScript ? 'сценарий' : 'распознавание — речь отошла от сценария, спросить владельца' });
  }
  const groups = groupWords(subWords, 3);
  const ass = join(work, '05_subs.ass');
  writeFileSync(ass, toAss(groups), 'utf8');
  writeFileSync(join(out, 'transcript.txt'), groups.map((g) => g.text).join(' '), 'utf8');

  const video = join(out, 'video.mp4');
  // Фильтр `ass` читает путь как аргумент фильтра: двоеточие диска и обратные слэши экранируются.
  const assArg = ass.replace(/\\/g, '/').replace(/:/g, '\\:');
  if (broll) {
    if (!existsSync(broll)) throw new Error(`нет записи экрана: ${broll}`);
    const range = wordRange(words, fromWord, toWord);
    log('запись экрана + субтитры', run('запись экрана + субтитры', 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', audio, '-stream_loop', '-1', '-i', broll,
      '-filter_complex', brollFilter({ ...range, assArg }), '-map', '[v]', '-map', '0:a', '-shortest',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', video]),
    { words: words.length, groups: groups.length, broll: { file: broll, fromWord, toWord, ...range } });
  } else {
    log('субтитры', run('субтитры', 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', audio, '-vf', `ass='${assArg}'`,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', video]), { words: words.length, groups: groups.length });
  }

  const report = checkVideo(video, { ass, lang, workBase: join(work, '06_recheck') });
  writeFileSync(join(out, 'selfcheck.json'), JSON.stringify(report, null, 2), 'utf8');
  journal.push({ step: 'самопроверка', by: 'агент', green: report.green });
  journal.push({ step: 'подпись, хэштеги, ссылка с меткой', by: 'агент', status: 'следующий шаг навыка — не этот скрипт' });
  journal.push({ step: 'загрузка', by: 'владелец' });
  writeFileSync(join(out, 'journal.json'), JSON.stringify(journal, null, 2), 'utf8');
  return { out, green: report.green, journal };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [input, ...rest] = process.argv.slice(2);
  if (!input) {
    console.error('usage: node tools/video/edit.mjs <вход.mp4> [--lang ru|en] [--name <имя>] [--broll <запись экрана> --from-word <слово> --to-word <слово>] [--script <текст речи.txt>]');
    process.exit(2);
  }
  const opt = (k) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : undefined; };
  try {
    const { out, green, journal } = editVideo(input, { lang: opt('lang'), name: opt('name'), broll: opt('broll'), fromWord: opt('from-word'), toWord: opt('to-word'), script: opt('script') });
    for (const j of journal) console.log(`${j.by === 'владелец' ? '👤' : '🤖'} ${j.step}${j.ms ? ` · ${(j.ms / 1000).toFixed(1)} с` : ''}`);
    console.log(`${green ? 'ALL GREEN' : 'RED — см. selfcheck.json'} → ${out}`);
    process.exit(green ? 0 : 1);
  } catch (e) {
    console.error(`🔴 ${e.message}`);
    process.exit(1);
  }
}

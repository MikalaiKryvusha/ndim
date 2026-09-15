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
 *   3. звук — `VOICE_CLEAN` (срез 80 Гц + `afftdn` по замеренному порогу шума) + двухпроходный `loudnorm`
 *      (−14 LUFS, TP −1,5); с `--music` — подложка под голос с приглушением (`sidechaincompress`) и громкость смеси;
 *   4. слова — `whisper-cli` на CUDA по ГОЛОСУ без музыки, модель large-v3-turbo q5 (🔴 без `-ml 1 -sow` таймкодов слов нет);
 *   5. субтитры — `words-to-ass.mjs` → вшивание фильтром `ass`; записи экрана и знак NDim — по словам;
 *   6. самопроверка — `selfcheck.mjs` → `selfcheck.json`.
 * Подпись, хэштеги и ссылку с меткой пишет агент навыком (текст по портрету голоса), не этот скрипт:
 * журнал называет этот шаг следующим, а не делает вид, что он сделан.
 *
 * ГДЕ ЖИВУТ ФАЙЛЫ. Видео, программы, модель и музыка — ВНЕ git (инвариант эпика): `NDIM_STUDIO_DIR`
 * (по умолчанию `D:\work\ai_sandbox\ndim-studio`) → `bin\auto-editor.exe`, `bin\whisper\whisper-cli.exe`,
 * `models\ggml-large-v3-turbo-q5_0.bin`, `music\`, `inbox\`, `out\<имя>\`. ffmpeg берётся из PATH (8.1.1 full).
 *
 * ⚠️ Названные границы: HDR/HEVC телефона приводится к SDR только перекодированием, без тонмаппинга;
 * язык распознавания по умолчанию `ru`. Несколько дублей в один ролик — `takes.mjs`, затем этот конвейер.
 *
 * Запуск: node tools/video/edit.mjs <вход.mp4> [--lang ru|en] [--name <имя>] [--script <текст речи.txt>]
 *   [--segment "файл|слово|слово" …] [--logo "png|слово|слово"] [--music <mp3 с лицензией рядом>] [--style A|B|C|D]
 *   [--broll <запись экрана> --from-word <слово> --to-word <слово>]
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { alignScript, groupWords, readWords, toAss } from './words-to-ass.mjs';
import { checkVideo, parseIntegratedLufs } from './selfcheck.mjs';
import { BIN, STUDIO, transcribeWords } from './studio.mjs';
import { parseSilences } from './takes.mjs';

/**
 * Очистка голоса. 🔴 Порог шума `nf` — ЗАМЕР, а не число «на глаз»: прежнее `afftdn=nf=-25` на живом голосе
 * владельца (пилот 001, 2026-09-14) съедало 10 дБ речи в полосе 4–8 кГц («с», «ш», «ч») и 1,6 дБ в 1–4 кГц —
 * фильтр принимал тихую речь за шум. У пилота шум паузы −71 дБ, речь −32 дБ: `nf=-60` убирает 10 дБ шума и
 * оставляет речь по полосам в пределах 0,1 дБ. Срез 80 Гц — гул комнаты ниже 150 Гц; мужской голос начинается
 * около 85 Гц. Страж класса — проверка `speech-hf` самопроверки.
 */
export const VOICE_CLEAN = 'highpass=f=80,afftdn=nf=-60:nr=18:tn=1';

/**
 * Подложка без речи — на 10 LU тише голоса (−14 LUFS); под речью её ещё приглушает `sidechaincompress`.
 * Слова владельца 2026-09-14 (пилот 001): «*музыку мо[ж]но тихонько поставить, на фоне*» — было −27, стало −30;
 * затем №088 В2 = Б (Projector Screen) «*на 2 дБ громче*» — стало −28; затем 2026-09-15 «*Музыку и в первой
 * пятерке и в новой - ещё чуть-чуть громче, на 2 дБ*» — стало −26; через час, послушав, «*Музыку еще громче на
 * 2 дБ в обоих роликах*» — стало −24. Громкость судит УХО ВЛАДЕЛЬЦА, замер агента её не судит: агент роликов не слушает.
 */
export const MUSIC_BED_LUFS = -24;

/**
 * Плашка-логотип по умолчанию: своей шириной (0 — как в PNG), по центру, ПОД субтитрами.
 *
 * 🔴 Место — слово владельца 2026-09-15: «*Плашку Ndim с моего лица убери, опусти ниже*» и «*плашку делаем только
 * в одном варианте 1 - черная в одну строку - но ниже опустить ее нужно, чтобы не перекрывала бороду мне*».
 * Прежнее место (y = 1000, на груди) ложилось на подбородок. Полосы кадра 1080×1920 замерены по живым кадрам
 * обоих дублей: борода кончается около y = 1090, субтитры занимают 1240…1402 (отступ `SUB_MARGIN` 0,27).
 * Между бородой и субтитрами остаётся 30–40 px — при наклоне головы плашка (108 px) снова наезжает на лицо,
 * поэтому она уходит ПОД субтитры: y = 1460 (низ 1568) — 352 px до низа кадра, выше подписи площадки.
 * Вариант выбран владельцем один (тёмная в строку), поэтому место живёт здесь, а не числом в команде.
 */
export const LOGO = { width: 0, x: '(W-w)/2', y: '1460', fadeSec: 0.3 };

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
function measureLoudnorm(file, pre = VOICE_CLEAN) {
  const { out } = run('звук: замер', 'ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', `${pre ? `${pre},` : ''}loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-']);
  return JSON.parse(out.slice(out.lastIndexOf('{'), out.lastIndexOf('}') + 1));
}

const loudnormApply = (m) =>
  `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`;

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
 * Фильтр монтажа: каждая запись экрана — во весь кадр на своём отрезке, знак NDim — справа на своих словах,
 * субтитры поверх всего. Входы: 0 — ролик автора, 1…n — записи экрана по порядку `segments`, n+1 — знак.
 *
 * 🔴 Окна с лицом автора на отрезке НЕТ — снято генеральной репетицией 2026-09-14: окно сверху справа
 * закрывало проценты экрана «Связи». Сценарий допускает оба вида («лицо в малом окне или сменяется
 * записью»); берём тот, в котором перекрывать нечего.
 * 🔴 Запись короче своего отрезка ДЕРЖИТ ПОСЛЕДНИЙ КАДР (`tpad` clone), а не начинается заново: на пилоте 001
 * карточка фильма (4,5 с) под фразой ~6 с на повторе прыгала бы к началу прокрутки.
 * 🔴 И медленно НАЕЗЖАЕТ (`BROLL_ZOOM` за отрезок): статичный экран «Связи» стоял 5,7 с — самопроверка `freeze`
 * законно краснела; наезд — обычный приём роликов с записью интерфейса, текст экрана остаётся читаемым.
 */
export const BROLL_ZOOM = 0.06;

export function brollFilter({ segments, assArg, logo }) {
  const parts = [];
  let last = '0:v';
  segments.forEach(({ start, end }, k) => {
    const on = `enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`;
    const len = Math.max(0.5, end - start).toFixed(3);
    const zoom = `scale=w='trunc(1080*(1+${BROLL_ZOOM}*min(t/${len},1))/2)*2':h=-2:eval=frame,crop=1080:1920`;
    parts.push(`[${k + 1}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,tpad=stop_mode=clone:stop_duration=${(end - start).toFixed(3)},${zoom},setpts=PTS-STARTPTS+${start.toFixed(3)}/TB[s${k}]`);
    parts.push(`[${last}][s${k}]overlay=0:0:${on}:eof_action=pass[v${k}]`);
    last = `v${k}`;
  });
  if (logo) {
    const n = segments.length + 1;
    const { start, end } = logo;
    const f = LOGO.fadeSec;
    const len = (end - start).toFixed(3);
    const width = logo.width ?? LOGO.width;
    const scale = width ? `scale=${width}:-1,` : '';
    parts.push(`[${n}:v]${scale}format=rgba,loop=loop=-1:size=1,trim=duration=${len},fade=t=in:st=0:d=${f}:alpha=1,fade=t=out:st=${Math.max(0, end - start - f).toFixed(3)}:d=${f}:alpha=1,setpts=PTS-STARTPTS+${start.toFixed(3)}/TB[lg]`);
    parts.push(`[${last}][lg]overlay=${logo.x ?? LOGO.x}:${logo.y ?? LOGO.y}:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})':eof_action=pass[vl]`);
    last = 'vl';
  }
  parts.push(`[${last}]ass='${assArg}'[v]`);
  return parts.join(';');
}

/**
 * Подложка музыки под голос. Входы: 0 — ролик с голосом, 1 — музыка (читается по кругу). Музыка обрезается по
 * длине ролика, получает громкость подложки, мягко входит и уходит; голос ключом приглушает её, пока звучит.
 */
export function musicFilter({ duration, gainDb }) {
  const d = duration.toFixed(3);
  return [
    `[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=duration=${d},volume=${gainDb.toFixed(2)}dB,afade=t=in:st=0:d=1,afade=t=out:st=${Math.max(0, duration - 2).toFixed(3)}:d=2[m]`,
    '[0:a]aresample=48000,aformat=channel_layouts=stereo,asplit=2[voice][key]',
    '[m][key]sidechaincompress=threshold=0.03:ratio=4:attack=30:release=500[duck]',
    '[voice][duck]amix=inputs=2:duration=first:normalize=0[mix]',
  ].join(';');
}

/** Музыка без файла лицензии рядом (`<имя>.license.txt`) в ролик не попадает (эстафета 2026-09-14). */
export function musicLicense(file) {
  const lic = `${file.slice(0, file.length - extname(file).length)}.license.txt`;
  if (!existsSync(lic)) throw new Error(`у музыки нет файла лицензии рядом: ${lic}`);
  return lic;
}

/** `--segment "файл|слово начала|слово конца"` → объект; разделитель `|`, потому что в пути Windows есть `:`. */
export function parseSegment(spec) {
  const [file, fromWord, toWord] = String(spec).split('|');
  if (!file || !fromWord || !toWord) throw new Error(`отрезок «${spec}»: нужен вид "файл|слово начала|слово конца"`);
  return { file, fromWord, toWord };
}

/** `--logo "png|слово|слово[|x|y[|ширина]]"` — место задают выражения `overlay` (`(W-w)/2`, `1000`); без них — угол справа. */
export function parseLogo(spec) {
  const [file, fromWord, toWord, x, y, width] = String(spec).split('|');
  const base = parseSegment([file, fromWord, toWord].join('|'));
  return { ...base, ...(x ? { x } : {}), ...(y ? { y } : {}), ...(width !== undefined && width !== '' ? { width: Number(width) } : {}) };
}

const probeDuration = (file) =>
  Number(run('длительность', 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]).out.trim());

export function editVideo(input, { lang = 'ru', name, broll, fromWord, toWord, script, segments, logo, music, style = 'A' } = {}) {
  for (const [k, p] of Object.entries(BIN)) if (!existsSync(p)) throw new Error(`нет ${k}: ${p} (NDIM_STUDIO_DIR)`);
  const license = music ? musicLicense(music) : null;
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
  log('звук', run('звук', 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', cut, '-af', `${VOICE_CLEAN},${loudnormApply(m)}`,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', audio]), { inputLufs: Number(m.input_i), clean: VOICE_CLEAN });

  // Музыка — отдельной дорожкой смеси; слова и паузы по-прежнему судятся по ГОЛОСУ (`audio`).
  let sound = audio;
  if (music) {
    const duration = probeDuration(audio);
    const musicLufs = parseIntegratedLufs(run('музыка: замер', 'ffmpeg', ['-hide_banner', '-nostats', '-i', music, '-af', 'ebur128', '-f', 'null', '-']).out);
    const gainDb = MUSIC_BED_LUFS - musicLufs;
    const mix = join(work, '03b_mix.wav');
    log('музыка под голос', run('музыка под голос', 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', audio, '-stream_loop', '-1', '-i', music,
      '-filter_complex', musicFilter({ duration, gainDb }), '-map', '[mix]', '-c:a', 'pcm_s16le', mix]), { music, musicLufs, gainDb: Number(gainDb.toFixed(2)) });
    const mm = measureLoudnorm(mix, '');
    sound = join(work, '03c_audio_music.mp4');
    log('громкость смеси', run('громкость смеси', 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', audio, '-i', mix, '-map', '0:v', '-map', '1:a',
      '-af', loudnormApply(mm), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', sound]));
    copyFileSync(license, join(out, 'music.license.txt'));
  }

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
  // Строки рвутся по паузам ГОЛОСА (№088 В1): тишины замеряются на дорожке без музыки.
  const pauses = parseSilences(run('паузы голоса', 'ffmpeg', ['-hide_banner', '-nostats', '-i', audio, '-af',
    'pan=mono|c0=0.5*c0+0.5*c1,silencedetect=noise=-35dB:d=0.08', '-f', 'null', '-']).out).map((p) => ({ start: p.start * 1000, end: p.end * 1000 }));
  const groups = groupWords(subWords, { pauses });
  const specs = [...(segments ?? []), ...(broll ? [{ file: broll, fromWord, toWord }] : [])];
  // Слова вставок ищутся в тексте СЦЕНАРИЯ с таймингом (subWords): распознавание пишет «10» вместо
  // «десяти», и якорь по распознаванию не находился (репетиция 2026-09-14).
  const placed = specs.map((s) => {
    if (!existsSync(s.file)) throw new Error(`нет записи экрана: ${s.file}`);
    return { ...s, ...wordRange(subWords, s.fromWord, s.toWord) };
  });
  const ass = join(work, '05_subs.ass');
  // Поверх записей экрана субтитры ниже — не закрывают карточки (`SUB_MARGIN_SCREEN`).
  writeFileSync(ass, toAss(groups, { style, screens: placed.map((p) => ({ start: p.start * 1000, end: p.end * 1000 })) }), 'utf8');
  writeFileSync(join(out, 'transcript.txt'), groups.map((g) => g.text).join(' '), 'utf8');

  const video = join(out, 'video.mp4');
  // Фильтр `ass` читает путь как аргумент фильтра: двоеточие диска и обратные слэши экранируются.
  const assArg = ass.replace(/\\/g, '/').replace(/:/g, '\\:');
  const logoPlaced = logo ? { ...logo, ...wordRange(subWords, logo.fromWord, logo.toWord) } : null;
  if (logoPlaced && !existsSync(logoPlaced.file)) throw new Error(`нет знака: ${logoPlaced.file}`);
  const inputs = [...placed.flatMap((s) => ['-i', s.file]), ...(logoPlaced ? ['-i', logoPlaced.file] : [])];
  log('монтаж кадра и субтитры', run('монтаж кадра и субтитры', 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', sound, ...inputs,
    '-filter_complex', brollFilter({ segments: placed, assArg, logo: logoPlaced }), '-map', '[v]', '-map', '0:a', '-shortest',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', video]),
  { words: words.length, groups: groups.length, segments: placed, logo: logoPlaced });

  const report = checkVideo(video, { ass, lang, workBase: join(work, '06_recheck'), voice: audio, before: cut });
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
    console.error('usage: node tools/video/edit.mjs <вход.mp4> [--lang ru|en] [--name <имя>] [--script <текст речи.txt>] [--segment "файл|слово|слово" …] [--logo "png|слово|слово"] [--music <mp3>] [--style A|B|C|D] [--broll <запись экрана> --from-word <слово> --to-word <слово>]');
    process.exit(2);
  }
  const opt = (k) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : undefined; };
  try {
    const { out, green, journal } = editVideo(input, {
      lang: opt('lang'), name: opt('name'), broll: opt('broll'), fromWord: opt('from-word'), toWord: opt('to-word'), script: opt('script'),
      style: opt('style'), music: opt('music'), logo: opt('logo') ? parseLogo(opt('logo')) : undefined,
      segments: rest.flatMap((v, i) => (rest[i - 1] === '--segment' ? [parseSegment(v)] : [])),
    });
    for (const j of journal) console.log(`${j.by === 'владелец' ? '👤' : '🤖'} ${j.step}${j.ms ? ` · ${(j.ms / 1000).toFixed(1)} с` : ''}`);
    console.log(`${green ? 'ALL GREEN' : 'RED — см. selfcheck.json'} → ${out}`);
    process.exit(green ? 0 : 1);
  } catch (e) {
    console.error(`🔴 ${e.message}`);
    process.exit(1);
  }
}

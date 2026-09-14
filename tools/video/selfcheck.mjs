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
 * ⏭️ Не сделано и названо: сверка субтитров повторным распознаванием (допуск 200 мс) — следующий
 * заход Ш5; отчёт пишет её строкой `skipped`, а не молчит.
 *
 * Пороги — выводы разведки, не стандарты площадок (официального числа LUFS YouTube/Instagram
 * разведка не нашла): окно −16…−12 LUFS, пауза длиннее 1,0 с, чёрное и застывшее от 0,5 / 2 с.
 *
 * Запуск: node tools/video/selfcheck.mjs <video.mp4> [--json <out.json>]
 * Код 0 и строка `ALL GREEN` — всё зелёное; код 1 — есть красное (названо поимённо).
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const LIMITS = {
  width: 1080,
  height: 1920,
  lufsMin: -16,
  lufsMax: -12,
  pauseSec: 1.0,
  pauseNoiseDb: -35,
  blackSec: 0.5,
  freezeSec: 2,
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

export function checkVideo(file) {
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

  const frames = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vf', `blackdetect=d=${LIMITS.blackSec}:pix_th=0.10,freezedetect=n=0.001:d=${LIMITS.freezeSec}`, '-an', '-f', 'null', '-']);
  const black = countMatches(frames, /black_start:/g);
  const freeze = countMatches(frames, /freeze_start/g);
  add('black', black === 0, `чёрных отрезков ≥ ${LIMITS.blackSec} с: ${black}`);
  add('freeze', freeze === 0, `застывших отрезков ≥ ${LIMITS.freezeSec} с: ${freeze}`);

  results.push({ name: 'subtitles-sync', ok: null, detail: 'skipped — не реализовано (Ш5, следующий заход)' });
  return { file, green: results.every((r) => r.ok !== false), results };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [file, ...rest] = process.argv.slice(2);
  if (!file) {
    console.error('usage: node tools/video/selfcheck.mjs <video.mp4> [--json <out.json>]');
    process.exit(2);
  }
  const report = checkVideo(file);
  for (const r of report.results) console.log(`${r.ok === null ? '⏭️ ' : r.ok ? '✅' : '🔴'} ${r.name}: ${r.detail}`);
  const j = rest.indexOf('--json');
  if (j >= 0) writeFileSync(rest[j + 1], JSON.stringify(report, null, 2), 'utf8');
  console.log(report.green ? 'ALL GREEN' : `RED: ${report.results.filter((r) => r.ok === false).map((r) => r.name).join(', ')}`);
  process.exit(report.green ? 0 : 1);
}

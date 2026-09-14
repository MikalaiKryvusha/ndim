/**
 * studio.mjs — где живёт ИИ-студия роликов на диске. Один источник путей для `edit.mjs` и
 * `selfcheck.mjs` (DRY: второй список путей разъехался бы с первым на первой же правке).
 *
 * Всё здесь — ВНЕ git (инвариант эпика `plans/90`): программы, модель, сырые и готовые ролики.
 * `NDIM_STUDIO_DIR` в `.env.example`; по умолчанию — соседняя с репозиторием папка.
 *
 * Запуск: сам не запускается — модуль путей и распознавания, его импортируют `edit.mjs`, `selfcheck.mjs`, `takes.mjs`.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export const STUDIO = process.env.NDIM_STUDIO_DIR || 'D:\\work\\ai_sandbox\\ndim-studio';

export const BIN = {
  autoEditor: join(STUDIO, 'bin', 'auto-editor.exe'),
  whisper: join(STUDIO, 'bin', 'whisper', 'whisper-cli.exe'),
  model: join(STUDIO, 'models', 'ggml-large-v3-turbo-q5_0.bin'),
};

/**
 * Слова ролика: звук → 16 кГц моно wav → `whisper-cli -ml 1 -sow -oj` на CUDA.
 * 🔴 Без `-ml 1 -sow` сегмент — фраза, а не слово (`researches/70` §3.5а).
 * Возвращает путь к JSON; провал — исключение с именем шага.
 */
export function transcribeWords(mediaFile, outBase, lang = 'ru') {
  const wav = `${outBase}.16k.wav`;
  const steps = [
    ['речь 16 кГц', 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', mediaFile, '-ar', '16000', '-ac', '1', wav]],
    ['распознавание слов', BIN.whisper, ['-m', BIN.model, '-l', lang, '-f', wav, '-ml', '1', '-sow', '-oj', '-of', outBase, '-np']],
  ];
  for (const [step, bin, args] of steps) {
    const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    if (r.error || r.status !== 0) throw new Error(`шаг «${step}» упал (код ${r.status}): ${r.error?.message ?? `${r.stderr}`.slice(-800)}`);
  }
  return `${outBase}.json`;
}

/**
 * Несколько готовых wav 16 кГц моно — ОДНИМ запуском `whisper-cli`: модель грузится один раз, JSON ложится
 * рядом с каждым входом как `<wav>.json` (проба 2026-09-14: два куска дубля за 1,4 с).
 * 🔴 Зачем куски, а не весь дубль: на длинном файле отметки слов плывут на стыках 30-секундных окон —
 * «Это работает так.» получило 30,95–42,02 с при речи около секунды (дубль 1 пилота 001).
 * ⚠️ Повтор слов на стыке соседних кусков — сначала проверь по звуку, а не вини модель: на пилоте 001 «и находит
 * вам тех, чьи вкусы…» дважды оказалось НАСТОЯЩИМ повтором владельца (отметки слов ложатся на куски речи), а
 * подозрение «текст прошлого файла стал подсказкой» опровергнуто замером: `-mc 0` на 14 кусках — различий 0.
 */
export function transcribeFiles(wavs, lang = 'ru') {
  if (!wavs.length) return [];
  const args = ['-m', BIN.model, '-l', lang, '-ml', '1', '-sow', '-oj', '-np', ...wavs.flatMap((w) => ['-f', w])];
  const r = spawnSync(BIN.whisper, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw new Error(`шаг «распознавание кусков» упал (код ${r.status}): ${r.error?.message ?? `${r.stderr}`.slice(-800)}`);
  return wavs.map((w) => `${w}.json`);
}

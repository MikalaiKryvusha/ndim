/**
 * studio.mjs — где живёт ИИ-студия роликов на диске. Один источник путей для `edit.mjs` и
 * `selfcheck.mjs` (DRY: второй список путей разъехался бы с первым на первой же правке).
 *
 * Всё здесь — ВНЕ git (инвариант эпика `plans/90`): программы, модель, сырые и готовые ролики.
 * `NDIM_STUDIO_DIR` в `.env.example`; по умолчанию — соседняя с репозиторием папка.
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

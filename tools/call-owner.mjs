/**
 * ПОЗВАТЬ ВЛАДЕЛЬЦА ГОЛОСОМ КОНТУРА — тонкая обёртка над `signal()` из `tools/review.mjs`.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ ПРИБОР. У контура вычитки голос НАСТРОЕН (Silero v5 ru, голос `eugene`, откат
 * на SAPI) и владелец его узнаёт. Я позвал его самопальным `System.Speech` — и получил ответ:
 * «неверным голосом ты меня позвал, это не наш голос из интерактивного контура». Голос — часть
 * контура, а не деталь вызова: своя копия синтезатора звучит чужим человеком.
 *
 * Работает только там, где нечего показывать страницей вычитки (открыт макет, график, кадр).
 * Есть документ с вопросами — зови `npm run review -- open <файл>`: он и страницу поднимет, и
 * сигнал подаст сам, строго ПОСЛЕ поднятия (инвариант контура I5).
 *
 * Текст едет ФАЙЛОМ или аргументом: кириллица в argv на Windows портится, поэтому по умолчанию
 * читается `--file`, а строка аргументом оставлена только для ASCII.
 */
import { readFileSync } from 'node:fs';
import { signal } from './review.mjs';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const file = opt('--file');
const text = file ? readFileSync(file, 'utf8').trim() : args.filter((a) => !a.startsWith('--')).join(' ');

if (!text) {
  console.error('нечего произносить: дай --file <путь> или строку аргументом');
  process.exit(1);
}

await signal(text, { voice: opt('--voice') ?? undefined });

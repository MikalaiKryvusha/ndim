/**
 * Сборка образа сервера синхронизации с честными номером сборки и датой.
 *
 * Зачем отдельный скрипт, а не строка в package.json: аргументы надо ВЫЧИСЛИТЬ
 * (`git rev-list --count`, текущее время), а подстановка `$(...)` в npm-скрипте на Windows
 * не работает — npm запускает их через cmd.exe. Скрипт кросс-платформенный и заодно
 * избавляет от необходимости помнить флаги.
 *
 * Номер сборки = число коммитов, ТРОНУВШИХ `calculator/` (требование владельца 2026-07-27:
 * «каждый коммит кода сервера синхронизации повышает номер сборки на +1»).
 * Дата сборки — момент запуска, с часами и минутами (владелец: «нужно добавить время»).
 *
 * Запуск:  npm run calc:image
 * Затем — обычный `docker run` из шапки calculator/Dockerfile.
 */
import { execFileSync, execSync } from 'node:child_process';

const build = Number(
  execSync('git rev-list --count HEAD -- calculator', { encoding: 'utf8' }).trim(),
);
if (!Number.isFinite(build) || build <= 0) {
  console.error('Не удалось получить число коммитов по calculator/ — сборка остановлена.');
  process.exit(1);
}

// ISO в UTC, до минут: контейнер и приложение должны говорить о времени одинаково.
const builtAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

console.log(`Сборка образа ndim-calculator: билд ${build}, собран ${builtAt}`);
execFileSync(
  'docker',
  [
    'build',
    '-f', 'calculator/Dockerfile',
    '-t', 'ndim-calculator',
    '--build-arg', `CALC_BUILD=${build}`,
    '--build-arg', `CALC_BUILT_AT=${builtAt}`,
    '.',
  ],
  { stdio: 'inherit' },
);
console.log(`Готово. Образ ndim-calculator: версия из calculator/package.json, билд ${build}.`);

/**
 * Сборка образа сервера синхронизации с честными номером сборки и датой.
 *
 * Зачем отдельный скрипт, а не строка в package.json: аргументы надо ВЫЧИСЛИТЬ
 * (`git rev-list --count`, текущее время), а подстановка `$(...)` в npm-скрипте на Windows
 * не работает — npm запускает их через cmd.exe. Скрипт кросс-платформенный и заодно
 * избавляет от необходимости помнить флаги.
 *
 * Номер сборки = число коммитов, ТРОНУВШИХ `sync-server/` (требование владельца 2026-07-27:
 * «каждый коммит кода сервера синхронизации повышает номер сборки на +1»).
 * Дата сборки — момент запуска, с часами и минутами (владелец: «нужно добавить время»).
 *
 * Запуск:  npm run sync:image
 * Затем — обычный `docker run` из шапки sync-server/Dockerfile.
 */
import { execFileSync, execSync } from 'node:child_process';

/*
 * 🔑 СЧИТАЕМ ПО ОБОИМ ПУТЯМ — `sync-server` и историческому `calculator`.
 *
 * 2026-08-15 директория переименована по слову владельца («*никакого "вычислителя" быть не
 * должно — это отсебятина ИИ*»). Счёт только по новому пути обнулил бы номер сборки с 28 до 1,
 * то есть версия в продукте соврала бы: номер обязан РАСТИ с каждым коммитом кода сервера
 * (требование владельца 2026-07-27), а не начинаться заново от смены имени папки.
 * `--follow` здесь не годится — он работает с одним файлом, а не с директорией.
 */
const build = Number(
  execSync('git rev-list --count HEAD -- sync-server calculator', { encoding: 'utf8' }).trim(),
);
if (!Number.isFinite(build) || build <= 0) {
  console.error('Не удалось получить число коммитов по sync-server/ — сборка остановлена.');
  process.exit(1);
}

// ISO в UTC, до минут: контейнер и приложение должны говорить о времени одинаково.
const builtAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

console.log(`Сборка образа ndim-sync-server: билд ${build}, собран ${builtAt}`);
execFileSync(
  'docker',
  [
    'build',
    '-f', 'sync-server/Dockerfile',
    '-t', 'ndim-sync-server',
    '--build-arg', `SYNC_BUILD=${build}`,
    '--build-arg', `SYNC_BUILT_AT=${builtAt}`,
    '.',
  ],
  { stdio: 'inherit' },
);
console.log(`Готово. Образ ndim-sync-server: версия из sync-server/package.json, билд ${build}.`);

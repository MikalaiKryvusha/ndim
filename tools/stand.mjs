// Живой дев-стенд NDim Space 2.0: сервер синхронизации как СЛУЖБА + dev-сервер приложения.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ЗАПУСКАТЕЛЬ. Раньше стенд крутил сервер синхронизации один раз
// (`--once`) — этого хватало, чтобы посчитать связи к моменту открытия экрана. С экраном
// «Пространство» этого мало по двум причинам:
//   · состояние «Работает» выводится из СЕРДЦЕБИЕНИЯ (space/server): сервер, отчитавшийся
//     единожды и умолкший, честно показывается как «Не отвечает» — и стенд врал бы о продукте;
//   · оценка, поставленная в браузере, должна долетать до «Связей» и «Пространства» сама,
//     как в жизни, а не после ручного перезапуска.
//
// Поэтому здесь поднимаются два процесса разом. Интервал цикла на стенде короткий (15 с):
// правки видно почти сразу, а не через минуту.
//
// Запускается внутри `npm run stand` (уже под эмуляторами и после сида).

import { execSync } from 'node:child_process';
import { spawn } from 'node:child_process';

/** Цикл сервера синхронизации на стенде — короткий: человек не должен ждать. */
const CALC_INTERVAL_SECONDS = '15';
/** Тихий период на стенде выключен по той же причине: оценка должна долетать сразу. */
const CALC_QUIET_SECONDS = '0';

/**
 * Номер и момент сборки сервера синхронизации.
 *
 * В бою их вшивает в образ `npm run calc:image` (docker --build-arg), и на стенде их не
 * было вовсе — сервер отчитывался версией без сборки и без даты. Стенд, который не умеет
 * показать поле продукта, не может его и проверить: виджет версий (bugs/66) выглядел бы
 * зелёным ровно потому, что показывать нечего. Считаем те же числа тем же способом.
 */
const CALC_BUILD = (() => {
  try {
    return execSync('git rev-list --count HEAD -- calculator', { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
})();
/** До минут, как и у приложения (ideas/15): секунды — шум, а не информация. */
const CALC_BUILT_AT = new Date().toISOString().replace(/:\d{2}\.\d{3}Z$/, ':00Z');

const children = [];

function start(command, args, env = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    // Windows: npm/npx — это .cmd, без shell они не запускаются.
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
  children.push(child);
  return child;
}

/** Гасим всё дерево разом: осиротевший сервер синхронизации держал бы эмулятор занятым. */
function stopAll() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

process.on('SIGINT', () => {
  stopAll();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopAll();
  process.exit(0);
});

// Сервер синхронизации: служба с коротким циклом. Первый цикл он делает сразу.
start('node', ['calculator/index.mjs'], {
  CALC_INTERVAL_SECONDS,
  CALC_QUIET_SECONDS,
  CALC_BUILD,
  CALC_BUILT_AT,
});

// Приложение. Стенд живёт ровно столько, сколько живёт dev-сервер: закрыли его — гасим всё.
const app = start('npx', ['vite', 'dev']);
app.on('exit', (code) => {
  stopAll();
  process.exit(code ?? 0);
});

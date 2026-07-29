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
import { connect } from 'node:net';

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

/**
 * Гасим всё ДЕРЕВО разом: осиротевший сервер синхронизации мешает поднять стенд заново (bugs/73).
 *
 * ⚠️ `child.kill()` на Windows этого НЕ делает. Мы запускаем через `shell: true` (иначе не
 * стартуют `.cmd`-обёртки npm/npx), то есть настоящая цепочка — `cmd.exe → node`. `kill()`
 * убивает только `cmd.exe`, а внук-`node` живёт дальше, крутит цикл каждые 15 с и стучится в
 * уже погашенный эмулятор. Именно так рождались сироты `node calculator/index.mjs`, из-за
 * которых стенд трижды за сессию не поднимался молча (bugs/73, EXP-0059, EXP-0081).
 * `taskkill /T` гасит процесс ВМЕСТЕ С ПОТОМКАМИ — это единственный способ на Windows.
 */
function stopAll() {
  for (const child of children) {
    if (child.killed || child.pid === undefined) continue;
    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
      } catch {
        // процесс мог уже умереть сам — это не ошибка
      }
    } else {
      child.kill();
    }
  }
}

let stopped = false;
function stopOnce(code) {
  if (stopped) return;
  stopped = true;
  stopAll();
  if (code !== undefined) process.exit(code);
}

process.on('SIGINT', () => stopOnce(0));
process.on('SIGTERM', () => stopOnce(0));
// Последний рубеж: любой выход этого процесса обязан унести детей с собой.
process.on('exit', () => stopOnce(undefined));

/**
 * Ворота громкости (bugs/73): убеждаемся, что эмулятор Firestore ДЕЙСТВИТЕЛЬНО слушает, прежде
 * чем поднимать сервер синхронизации.
 *
 * Без этой проверки отказ был НЕМЫМ: `emulators:exec` не поднимал эмулятор, стенд всё равно
 * запускал сервер синхронизации, и тот бесконечно капал `ECONNREFUSED 127.0.0.1:8181` в лог,
 * пока человек (или агент) считал, что стенд работает. Немота стоила ~20 минут за сессию.
 * Лучше упасть сразу и назвать причину (ср. EXP-0067: гейт, который молчит не по делу, опаснее
 * отсутствующего).
 */
async function waitForEmulator(hostPort, seconds = 30) {
  const [host, port] = hostPort.split(':');
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const socket = connect({ host, port: Number(port) });
      socket.once('connect', () => (socket.destroy(), resolve(true)));
      socket.once('error', () => (socket.destroy(), resolve(false)));
      socket.setTimeout(1000, () => (socket.destroy(), resolve(false)));
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const emulatorHostPort = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8181';
if (!(await waitForEmulator(emulatorHostPort))) {
  console.error(
    `\n✖ СТЕНД НЕ ПОДНЯЛСЯ: эмулятор Firestore не слушает ${emulatorHostPort}.\n` +
      `  Чаще всего это сирота от прошлого запуска (bugs/73). Проверь и погаси:\n` +
      `    Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'calculator' }\n` +
      `  Дешёвый признак «сироты живы»: файл stand.log не удаляется.\n`,
  );
  process.exit(1);
}

// Сервер синхронизации: служба с коротким циклом. Первый цикл он делает сразу.
start('node', ['calculator/index.mjs'], {
  CALC_INTERVAL_SECONDS,
  CALC_QUIET_SECONDS,
  CALC_BUILD,
  CALC_BUILT_AT,
});

// Приложение. Стенд живёт ровно столько, сколько живёт dev-сервер: закрыли его — гасим всё.
const app = start('npx', ['vite', 'dev']);
app.on('exit', (code) => stopOnce(code ?? 0));

import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.FIREBASE_PROJECT_ID = 'demo-ndim-cycle-watchdog';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';

const { runCycleWithWatchdog } = await import('./index.mjs');

test('зависший цикл вызывает аварийное завершение для перезапуска PM2', async () => {
  const timeouts = [];
  await assert.rejects(
    runCycleWithWatchdog(() => new Promise(() => {}), {
      timeoutMs: 20,
      onTimeout: (error) => timeouts.push(error),
    }),
    /цикл сервера синхронизации не завершился за 20 мс/,
  );
  assert.equal(timeouts.length, 1);
});

test('завершившийся цикл возвращает результат без срабатывания сторожа', async () => {
  let timeoutCalls = 0;
  const result = await runCycleWithWatchdog(async () => 'готово', {
    timeoutMs: 1000,
    onTimeout: () => {
      timeoutCalls += 1;
    },
  });
  assert.equal(result, 'готово');
  assert.equal(timeoutCalls, 0);
});

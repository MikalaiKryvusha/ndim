// Тесты ПОДПИСКИ ЭСКОРТА (`plans/62` шаг 2, интервью №040 В1).
//
// ЧТО ЗДЕСЬ СТЕРЕЖЁТСЯ. Ворота фазы 2 (`plans/60`): «обрыв подписки восстановлен и событие
// не потеряно». Подписка — слух сервера о первых оценках новичка; молчаливый обрыв — это
// новички, ждущие часа вместо секунд. Поэтому главный тест файла — СОБЫТИЕ ВО ВРЕМЯ ОБРЫВА:
// оно обязано прийти догоном из снимка переподъёма, и обе строки лога (обрыв, переподъём)
// обязаны существовать — по ним живой стенд отличим от молча умершего.
//
// Дверь `_testBreak` рвёт подписку ТЕМ ЖЕ путём, что настоящая ошибка (handleError):
// тест доказывает боевую дорогу восстановления, а не свою собственную.
//
// Запуск: npm run test:sync  (поднимает эмулятор Firestore, Java обязательна)

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST не задан. Запускай через `npm run test:sync`.');
}

// СВОЙ ПРОЕКТ = своя база в эмуляторе (как в остальных файлах набора). Переменные читаются
// при загрузке модуля — ставим ДО импорта index.mjs.
process.env.FIREBASE_PROJECT_ID = 'demo-ndim-escort-watch';

// index.mjs нужен ради боевого правила `escortActive` и инициализации приложения; runCycle
// здесь не зовётся ни разу — файл проверяет слух, а не пересчёт.
const { escortActive } = await import('./index.mjs');
const { getFirestore } = await import('firebase-admin/firestore');
const { createEscortWatch } = await import('./escort_watch.mjs');

const db = getFirestore();

/** Ждать, пока условие не станет истинным; иначе — честное падение с подписью. */
async function waitFor(condition, what, timeoutMs = 5000) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) assert.fail(`не дождались: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Новичок ставит первую оценку: точка рождается dirty и БЕЗ полей сервера. */
const rateVirgin = (uid) => db.doc(`points/${uid}`).set({ dirty: true, updated: Date.now(), lastSync: null });

/** Старожил меняет NDim ID: firstSeen давно стоит, эскорт ему не полагается. */
const rateOldTimer = (uid) =>
  db.doc(`points/${uid}`).set({ dirty: true, updated: Date.now(), lastSync: 1, firstSeen: 1 });

describe('подписка эскорта: слышит новичков, переживает обрыв', () => {
  /** @type {ReturnType<typeof createEscortWatch>} */
  let watch;
  const events = [];
  const logLines = [];
  const heard = (uid) => events.filter((event) => event.uid === uid);

  before(() => {
    watch = createEscortWatch({
      db,
      log: (line) => logLines.push(line),
      onEscortEvent: (event) => events.push(event),
      isEscorting: (data) => escortActive(data),
      retryBaseMs: 100, // в тесте переподъём не должен стоить секунд ожидания
    });
    watch.start();
  });

  after(() => watch.stop());

  test('первая оценка новичка приходит событием; старожил события не рождает', async () => {
    // Старожил пишется ПЕРВЫМ: слушатель отдаёт изменения в порядке коммитов, поэтому
    // пришедшее событие новичка доказывает, что изменение старожила уже было отдано — и
    // отфильтровано, а не ещё едет.
    await rateOldTimer('boris');
    await rateVirgin('nina');

    await waitFor(() => heard('nina').length >= 1, 'событие первой оценки nina');
    assert.equal(heard('boris').length, 0, 'старожил не в эскорте — подписка о нём молчит');
    assert.equal(typeof heard('nina')[0].at, 'number', 'у события есть время');
  });

  test('повторное изменение эскортируемого слышно снова (изменение, не только появление)', async () => {
    const was = heard('nina').length;
    await db.doc('points/nina').set({ dirty: true, updated: Date.now() }, { merge: true });
    await waitFor(() => heard('nina').length > was, 'повторное событие nina');
  });

  test('обрыв: событие во время обрыва НЕ потеряно — приходит догоном переподъёма', async () => {
    watch._testBreak();
    assert.equal(watch.isAlive(), false, 'после обрыва подписка честно мертва');
    assert.ok(
      logLines.some((line) => line.includes('оборвалась')),
      'обрыв назван строкой в логе — молчаливый обрыв запрещён шагом 2',
    );

    // Событие случается, пока подписки НЕТ.
    await rateVirgin('oleg');

    await waitFor(() => heard('oleg').length >= 1, 'догон события oleg после переподъёма');
    assert.equal(watch.isAlive(), true, 'подписка поднята заново');
    assert.ok(
      logLines.some((line) => line.includes('поднята заново')),
      'переподъём назван строкой в логе',
    );
  });

  test('stop() отпускает подписку: новые события не приходят', async () => {
    watch.stop();
    assert.equal(watch.isAlive(), false);
    await rateVirgin('petr');
    // Отрицательное утверждение — ждём дольше типичной задержки слушателя эмулятора.
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(heard('petr').length, 0, 'после stop() подписка молчит');
  });
});

// Тесты СОСТОЯНИЯ ЭСКОРТА НОВИЧКА (`plans/62` шаг 1, интервью №040 В1).
//
// ЧТО ЗДЕСЬ СТЕРЕЖЁТСЯ. Владелец назначил эскорту потолок: «*после трёх пересчётов — эскорт
// новичка прекращаем, переводим его на общую очередь*». Потолок имеет смысл ровно настолько,
// насколько счётчик переживает перезапуск контейнера: держи его сервер в памяти процесса — и
// каждый выкат образа раздавал бы привилегию заново, то есть потолка не было бы вовсе, а
// проект платил бы за это чтениями и записями (повод эпика — `bugs/152`).
//
// Поэтому главный тест файла — РЕСТАРТ ПОСРЕДИ ЭСКОРТА. Он же служит мутантом самому себе:
// перенеси состояние в память процесса (любую переменную модуля вместо поля документа) — и
// прогрессия счётчика встанет на единице, потому что каждый рестарт начинал бы счёт сначала.
//
// Запуск: npm run test:sync  (поднимает эмулятор Firestore, Java обязательна)

import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST не задан. Запускай через `npm run test:sync`.');
}

// СВОЙ ПРОЕКТ = своя база в эмуляторе (как в остальных файлах набора). Переменные читаются
// при загрузке модуля — ставим ДО импорта index.mjs.
process.env.FIREBASE_PROJECT_ID = 'demo-ndim-escort-state';
// Тихий период обязан ДЕЙСТВОВАТЬ: именно освобождением от него видно, идёт эскорт или нет.
process.env.SYNC_QUIET_SECONDS = '120';
delete process.env.SYNC_FULL_EVERY_CYCLE;

const { runCycle, escortActive, _testRestartProcess } = await import('./index.mjs');
const { getFirestore } = await import('firebase-admin/firestore');

const db = getFirestore();

/** Документ точки как он лежит в базе — ради него весь файл и написан. */
const pointDoc = async (uid) => (await db.doc(`points/${uid}`).get()).data();

/**
 * Человек ставит оценку ПРЯМО СЕЙЧАС: свежий `updated` вводит его в тихий период, и дальше
 * видно, освобождает ли его эскорт. Поля эскорта тест не трогает НИКОГДА — их пишет только
 * сервер синхронизации, и подмена их здесь превратила бы проверку в вакуумную.
 */
async function rateNow(uid, dimId, value) {
  await db.doc(`points/${uid}/dims/${dimId}`).set({ value });
  await db.doc(`points/${uid}`).set({ dirty: true, updated: Date.now() }, { merge: true });
}

/** Старожил: сервер синхронизации его уже видел, эскорт ему не полагается. */
async function seedOldTimer(uid, ratings) {
  await db.doc(`points/${uid}`).set({
    dirty: true,
    updated: 1,
    lastSync: 1,
    firstSeen: 1,
  });
  for (const [dimId, value] of Object.entries(ratings)) {
    await db.doc(`points/${uid}/dims/${dimId}`).set({ value });
  }
}

describe('escortActive — правило «эскорт ещё не исчерпан», без базы', () => {
  test('точка, которую сервер ни разу не считал, — в эскорте', () => {
    assert.equal(escortActive({ firstSeen: null, escortRuns: null }), true);
  });

  test('старожил без счётчика — НЕ в эскорте (миграции у фазы нет)', () => {
    assert.equal(escortActive({ firstSeen: 1, escortRuns: null }), false);
  });

  test('счётчик ниже потолка — эскорт идёт', () => {
    assert.equal(escortActive({ firstSeen: 1, escortRuns: 1 }), true);
    assert.equal(escortActive({ firstSeen: 1, escortRuns: 2 }), true);
  });

  test('счётчик на потолке — терминальная отметка «эскорт окончен»', () => {
    assert.equal(escortActive({ firstSeen: 1, escortRuns: 3 }), false);
  });

  test('счётчик выше потолка (порча данных) эскорт НЕ воскрешает', () => {
    assert.equal(escortActive({ firstSeen: 1, escortRuns: 9 }), false);
  });
});

describe('эскорт новичка переживает рестарт процесса и упирается в потолок', () => {
  before(async () => {
    // Старожил нужен, чтобы у новичка было с кем считать связь.
    await seedOldTimer('boris', { calm: 4, sport: 9 });
    await runCycle(); // первый цикл процесса: прогрев кэша, старожил посчитан
  });

  test('пересчёт 1: новичок считается вне очереди, счётчик появляется в БАЗЕ', async () => {
    await rateNow('anna', 'calm', 7);
    await runCycle();

    const anna = await pointDoc('anna');
    assert.equal(anna.escortRuns, 1, 'первый пересчёт эскорта истрачен');
    assert.equal(typeof anna.escortLastAt, 'number', 'якорь окна поставлен');
    assert.equal(anna.dirty, false, 'человек посчитан, флаг снят');
    assert.equal(typeof anna.firstSeen, 'number', 'сервер отметил, что увидел точку');

    const top = (await db.doc('relations/anna').get()).data();
    assert.ok(top?.top?.length > 0, 'новичок получил связи, а не пустой топ');
  });

  test('РЕСТАРТ → пересчёт 2: счётчик НЕ обнулился, а вырос', async () => {
    _testRestartProcess();
    await rateNow('anna', 'sport', 6);
    await runCycle();

    assert.equal((await pointDoc('anna')).escortRuns, 2, 'счёт продолжен, а не начат заново');
  });

  test('РЕСТАРТ → пересчёт 3: потолок достигнут, якорь окна убран как мёртвый вес', async () => {
    _testRestartProcess();
    await rateNow('anna', 'calm', 9);
    await runCycle();

    const anna = await pointDoc('anna');
    assert.equal(anna.escortRuns, 3, 'третий пересчёт истрачен');
    assert.equal('escortLastAt' in anna, false, 'якорь окна удалён при исчерпании');
    assert.equal(escortActive(anna), false, 'эскорт окончен');
  });

  test('РЕСТАРТ → ЧЕТВЁРТОГО НЕТ: счётчик стоит на потолке', async () => {
    _testRestartProcess();
    await rateNow('anna', 'sport', 3);
    await runCycle();

    assert.equal((await pointDoc('anna')).escortRuns, 3, 'четвёртый пересчёт эскорта не выдан');
  });

  test('исчерпавший эскорт человек снова подчиняется тихому периоду', async () => {
    // Рестарта здесь НЕТ намеренно: первый цикл нового процесса — прогрев, а он забирает всех
    // мимо тихого периода. Отличие «эскорт кончился» видно только в ОБЫЧНОМ цикле.
    await rateNow('anna', 'calm', 2);
    await runCycle();

    const anna = await pointDoc('anna');
    assert.equal(anna.dirty, true, 'оценка отложена тихим периодом — привилегии больше нет');
    assert.equal(anna.escortRuns, 3, 'отложенный цикл счётчик не тратит');
  });

  test('старожил счётчика эскорта не получает НИКОГДА', async () => {
    const boris = await pointDoc('boris');
    assert.equal('escortRuns' in boris, false, 'эскорт достаётся только новичку');
  });
});

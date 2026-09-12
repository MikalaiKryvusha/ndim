// Тест обезличивания ПОЛОВИНЫ умершего участника в парах теста (`bugs/154`; интервью №041 В2 = A).
//
// Человек прошёл «Тест для двоих», его оценки легли в `testPairs/{id}` вместе с uid, потом он
// удалил аккаунт. Клиент до своих пар не дотягивается (`allow list: if false`), а сервер
// удалял пару только когда мертвы ОБА — живой второй консервировал чужие ответы навсегда.
//
// ГЛАВНАЯ АСИММЕТРИЯ, ради которой тест и написан: уходит ТОЛЬКО половина умершего. Половина
// живого цела (он вправе вернуться за СВОИМИ ответами), пара двух живых не тронута, пара без
// второго участника не обезличивается — её целиком убирает `cleanupStalePairs`.
//
// Запуск: npm run test:sync  (поднимает эмулятор Firestore, Java обязательна)

import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST не задан. Запускай через `npm run test:sync`.');
}

// Свой проект эмулятора: файлы гоняются параллельно, посеянные точки видны соседям.
process.env.FIREBASE_PROJECT_ID = 'demo-ndim-pairhalf';

const { cleanupDeletedPeople, cleanupStalePairs, anonymizePairHalvesOf } = await import('./index.mjs');
const { getFirestore } = await import('firebase-admin/firestore');

const db = getFirestore();

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
const OLD = NOW - 10 * DAY;

/** Живой = есть точка. Умерший, удаливший аккаунт сам = точки нет, `relations` остался. */
async function seedAlive(uid) {
  await db.doc(`points/${uid}`).set({ dirty: false, updated: NOW, lastSync: NOW });
}
async function seedDeleted(uid) {
  await db.doc(`relations/${uid}`).set({ top: [] });
}
async function seedPair(id, { aUid, bUid = null }) {
  await db.doc(`testPairs/${id}`).set({
    slug: 'love', created: OLD,
    aUid, aAnswers: { calm: 8, brave: 3 },
    bUid, bAnswers: bUid === null ? null : { calm: 7, brave: 5 },
  });
}
const pair = async (id) => (await db.doc(`testPairs/${id}`).get()).data();

describe('Сервер синхронизации: половина умершего в паре теста обезличивается', () => {
  let removedPeople;

  before(async () => {
    await seedAlive('alive-a');
    await seedAlive('alive-b');
    await seedDeleted('dead-a');
    await seedDeleted('dead-b');

    await seedPair('dead-creator', { aUid: 'dead-a', bUid: 'alive-b' });   // умер создатель
    await seedPair('dead-joiner', { aUid: 'alive-a', bUid: 'dead-b' });    // умер присоединившийся
    await seedPair('both-alive', { aUid: 'alive-a', bUid: 'alive-b' });    // оба живы
    await seedPair('dead-solo', { aUid: 'dead-a' });                       // второго нет вовсе

    removedPeople = await cleanupDeletedPeople(NOW);
  });

  test('контроль прибора: умерших опознано двое', () => {
    assert.equal(removedPeople, 2);
  });

  test('🔴 умер создатель: его uid и ответы ушли, половина живого второго цела', async () => {
    const p = await pair('dead-creator');
    assert.equal(p.aUid, null);
    assert.equal(p.aAnswers, null);
    assert.equal(p.aAnonymizedAt, NOW, 'момент обезличивания записан');
    assert.equal(p.bUid, 'alive-b');
    assert.deepEqual(p.bAnswers, { calm: 7, brave: 5 }, 'ответы живого не тронуты');
  });

  test('🔴 умер присоединившийся: симметрично, половина b обезличена', async () => {
    const p = await pair('dead-joiner');
    assert.equal(p.bUid, null);
    assert.equal(p.bAnswers, null);
    assert.equal(p.aUid, 'alive-a');
    assert.deepEqual(p.aAnswers, { calm: 8, brave: 3 });
  });

  test('оба живы — пара не тронута ни в одном поле', async () => {
    const p = await pair('both-alive');
    assert.equal(p.aUid, 'alive-a');
    assert.equal(p.bUid, 'alive-b');
    assert.equal(p.aAnonymizedAt, undefined);
    assert.equal(p.bAnonymizedAt, undefined);
  });

  test('второго нет — половина НЕ обезличивается: пару целиком убирает гигиена пар', async () => {
    const before = await pair('dead-solo');
    assert.equal(before.aUid, 'dead-a', 'создатель на месте — иначе пустая пара стала бы присоединяемой заново');
    await cleanupStalePairs(NOW);
    assert.equal((await db.doc('testPairs/dead-solo').get()).exists, false, 'осиротевшая пара удалена целиком');
    assert.equal((await db.doc('testPairs/dead-creator').get()).exists, true, 'пара с живым вторым осталась');
  });

  test('помощник идемпотентен и возвращает честное число', async () => {
    assert.equal(await anonymizePairHalvesOf('dead-a', NOW + 1), 0, 'повтор ничего не находит');
    assert.equal(await anonymizePairHalvesOf('nobody', NOW + 1), 0);
  });
});

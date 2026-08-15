// Тест гигиены пар теста (plans/42, такт В — снятый `PENDING:` «гигиена старых пар»).
//
// Пару заводят двое, чаще всего оба гости. Гость исчезает, а документ `testPairs/{id}`
// переживает обоих: в нём нет ни `dirty`, ни `lastSync`, ни другого поля, за которое
// зацепился бы существующий уборщик. Без чистки коллекция растёт монотонно и вечно.
//
// ГЛАВНАЯ АСИММЕТРИЯ, ради которой тест и написан: удалять можно ТОЛЬКО пару, где не осталось
// НИ ОДНОГО живого участника. Пара, где жив хоть один, неприкосновенна — второй вправе
// вернуться по своей ссылке и забрать свои ответы (право участника, №002 В4). Тест держит обе
// стороны: и что мусор уходит, и что живое остаётся.
//
// Запуск: npm run test:calc  (поднимает эмулятор Firestore, Java обязательна)

import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST не задан. Запускай через `npm run test:calc`.');
}

/*
 * ⚠️ СВОЙ ПРОЕКТ ЭМУЛЯТОРА (тот же довод, что в deleted_people.test.mjs): `node --test` гоняет
 * файлы параллельно, а точки видны всем — посеянные здесь испортили бы счёт соседу. Переменная
 * ставится ДО динамического импорта: проект выбирается в момент импорта `index.mjs`.
 */
process.env.FIREBASE_PROJECT_ID = 'demo-ndim-pairs';

const { cleanupStalePairs } = await import('./index.mjs');
const { getFirestore } = await import('firebase-admin/firestore');

const db = getFirestore();

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;      // фиксированный «сейчас»: тест не зависит от часов машины
const OLD = NOW - 10 * DAY;         // заведомо старше отсрочки
const FRESH = NOW - 60 * 1000;      // минуту назад

/** Живой человек = существует `points/{uid}`. Ровно этот признак читает уборщик. */
async function seedPerson(uid) {
  await db.doc(`points/${uid}`).set({ dirty: false, updated: NOW, lastSync: NOW });
}

async function seedPair(id, { aUid, bUid = null, created = OLD }) {
  await db.doc(`testPairs/${id}`).set({
    slug: 'love',
    created,
    aUid,
    aAnswers: { calm: 8 },
    bUid,
    bAnswers: bUid === null ? null : { calm: 7 },
  });
}

const exists = async (id) => (await db.doc(`testPairs/${id}`).get()).exists;

describe('Вычислитель: гигиена старых пар теста', () => {
  let removed;

  before(async () => {
    // Живые люди — только эти двое. Все прочие uid ниже мертвы по построению (точки нет).
    await seedPerson('alive-a');
    await seedPerson('alive-b');

    await seedPair('both-dead', { aUid: 'ghost-1', bUid: 'ghost-2' });
    await seedPair('a-alive', { aUid: 'alive-a', bUid: 'ghost-3' });
    await seedPair('b-alive', { aUid: 'ghost-4', bUid: 'alive-b' });
    await seedPair('solo-dead', { aUid: 'ghost-5' });                    // не присоединённая, автор мёртв
    await seedPair('solo-alive', { aUid: 'alive-a' });                   // не присоединённая, автор жив
    await seedPair('fresh-dead', { aUid: 'ghost-6', bUid: 'ghost-7', created: FRESH });
    await seedPair('broken', { aUid: null });                            // битый документ

    removed = await cleanupStalePairs(NOW);
  });

  test('мусор уходит: пара без единого живого участника удалена', async () => {
    assert.equal(await exists('both-dead'), false);
    assert.equal(await exists('solo-dead'), false);
  });

  test('🔑 жив ХОТЬ ОДИН — пара неприкосновенна (право второго забрать свои ответы)', async () => {
    assert.equal(await exists('a-alive'), true, 'жив создатель');
    assert.equal(await exists('b-alive'), true, 'жив присоединившийся');
    assert.equal(await exists('solo-alive'), true, 'жив автор неприсоединённой пары');
  });

  test('свежая пара не рассматривается вовсе — сегодняшний трафик не читается', async () => {
    assert.equal(await exists('fresh-dead'), true);
  });

  test('битый документ НЕ удаляется молча — дефект записи должен найтись, а не спрятаться', async () => {
    assert.equal(await exists('broken'), true);
  });

  test('возвращает честное число удалённых', () => {
    assert.equal(removed, 2, 'удалить полагалось both-dead и solo-dead');
  });

  test('холостой прогон не трогает ничего и не врёт числом', async () => {
    const again = await cleanupStalePairs(NOW);
    assert.equal(again, 0);
    assert.equal(await exists('a-alive'), true);
  });
});

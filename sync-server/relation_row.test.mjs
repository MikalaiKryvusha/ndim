// Тест состава строки топа: «Последнее обновление NDim ID» (`bugs/46`, последний блок канона 1.x).
//
// ЗАЧЕМ ЭТО В ТЕСТАХ СЕРВЕРА, А НЕ ЭКРАНА. Время обновления чужой точки зрителю недоступно по
// правилам: `points/{uid}` читают только владелец и сервер синхронизации (`firestore.rules`). Значит
// единственный законный способ показать эту строку — положить число в саму запись топа. Здесь и
// проверяется, что сервер синхронизации это делает и не врёт значением.
//
// Запуск: npm run test:sync  (поднимает эмулятор Firestore, Java обязательна)
// Прямой `node --test` не сработает: нужен FIRESTORE_EMULATOR_HOST от emulators:exec.

import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST не задан. Запускай через `npm run test:sync`.');
}

// СВОЙ ПРОЕКТ = своя база в эмуляторе: `node --test` гоняет файлы параллельно, и общая база
// смешала бы точки — соседние тесты считают людей и сравнивают состав топов (канон файлов
// сервера синхронизации, см. economy.test.mjs). Первая редакция этого файла канон пропустила и уронила
// `guest_filter.test.mjs`: мои три точки попали в его Пространство.
process.env.FIREBASE_PROJECT_ID = 'demo-ndim-calc-relrow';

const { runCycle } = await import('./index.mjs');
const { getFirestore } = await import('firebase-admin/firestore');

const db = getFirestore();

/** Когда каждый из них последний раз менял свой NDim ID — РАЗНЫЕ числа, иначе тест не различал бы. */
const ANNA_UPDATED = 1_700_000_000_000;
const BORIS_UPDATED = 1_750_000_000_000;

async function seedPoint(uid, ratings, updated) {
  await db.doc(`points/${uid}`).set({ dirty: true, updated, lastSync: 0 });
  for (const [dimId, value] of Object.entries(ratings)) {
    await db.doc(`points/${uid}/dims/${dimId}`).set({ value });
  }
}

/** Строка топа владельца про конкретного человека. */
async function rowFor(ownerUid, guestUid) {
  const snap = await db.doc(`relations/${ownerUid}`).get();
  assert.ok(snap.exists, `relations/${ownerUid} должен существовать`);
  const row = snap.data().top.find((entry) => entry.guestUid === guestUid);
  assert.ok(row !== undefined, `в топе ${ownerUid} нет строки про ${guestUid}`);
  return row;
}

describe('Строка топа несёт время обновления NDim ID (bugs/46)', () => {
  before(async () => {
    await seedPoint('row-anna', { calm: 7, sport: 5 }, ANNA_UPDATED);
    await seedPoint('row-boris', { calm: 4, sport: 9 }, BORIS_UPDATED);
    await runCycle();
  });

  test('в строке топа лежит время обновления ТОГО человека, о котором строка', async () => {
    /*
     * Главная проверка: значение должно быть ЧУЖИМ, а не своим. Ошибка «положили updated
     * владельца в каждую строку» выглядела бы на экране правдоподобно (дата есть, формат верный)
     * и не поймалась бы ничем, кроме сравнения двух РАЗНЫХ чисел.
     */
    assert.equal((await rowFor('row-anna', 'row-boris')).updated, BORIS_UPDATED);
    assert.equal((await rowFor('row-boris', 'row-anna')).updated, ANNA_UPDATED);
  });

  test('поле не подменяется нулём или null, когда время есть', async () => {
    const row = await rowFor('row-anna', 'row-boris');
    assert.equal(typeof row.updated, 'number');
    assert.ok(row.updated > 0);
  });

  test('точка без времени обновления НЕ добавляет поле — экран честно промолчит', async () => {
    /*
     * Так выглядят боевые точки, записанные до появления поля `updated`, и гостевые точки без
     * истории. `null` в топе не место: экран показывает строку ТОЛЬКО когда число есть, а
     * «неизвестно» на месте даты было бы выдумкой (канон `bugs/86`).
     */
    await db.doc('points/row-nodate').set({ dirty: true, lastSync: 0 });
    await db.doc('points/row-nodate/dims/calm').set({ value: 6 });
    await db.doc('points/row-anna').set({ dirty: true }, { merge: true });
    await runCycle();

    const row = await rowFor('row-anna', 'row-nodate');
    assert.equal('updated' in row, false, 'поля быть не должно вовсе, а не null');
  });
});

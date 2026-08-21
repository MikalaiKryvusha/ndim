// Тест уборки следов за человеком, УДАЛИВШИМ АККАУНТ САМ (эпик plans/15, фаза 8; В11 = А).
//
// Клиент удаляет всё, что вправе, и мгновенно. Пять следов ему недоступны по правилам —
// свой топ, чужие топы, членство в чужих группах, подсказка аудитории у другого и его
// предложения измерений. Их убирает суточный проход, и здесь проверяется именно это.
//
// ГЛАВНАЯ АСИММЕТРИЯ, ради которой тест и написан: убирать надо ТОЛЬКО за ушедшим.
// Живой человек рядом обязан остаться нетронутым — включая его собственные группы,
// подсказки и предложения. Тест держит обе стороны.
//
// Запуск: npm run test:sync  (поднимает эмулятор Firestore, Java обязательна)

import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST не задан. Запускай через `npm run test:sync`.');
}

/*
 * ⚠️ СВОЙ ПРОЕКТ ЭМУЛЯТОРА, и это не украшение. `node --test` гоняет файлы параллельно, а
 * статистика Пространства глобальна: точки, посеянные здесь, попали бы в счёт соседнего теста
 * и сделали бы его мигающим. Проект выбирается при импорте `index.mjs` — поэтому переменную
 * ставим ДО динамического импорта, а не в скрипте запуска.
 */
process.env.FIREBASE_PROJECT_ID = 'demo-ndim-deleted';

const { cleanupDeletedPeople } = await import('./index.mjs');
const { getFirestore } = await import('firebase-admin/firestore');

const db = getFirestore();

const GONE = 'gone-person';
const ALIVE = 'alive-person';

describe('Сервер синхронизации: следы за удалившим аккаунт', () => {
  let removed;

  before(async () => {
    // ЖИВОЙ человек: точка на месте — значит он никуда не девался.
    await db.doc(`points/${ALIVE}`).set({ dirty: false, updated: 1, lastSync: 1 });
    await db.doc(`relations/${ALIVE}`).set({ top: [{ guestUid: GONE, similarity: 0.5 }] });
    await db.doc(`users/${ALIVE}`).set({ name: 'жив' });
    await db.doc(`users/${ALIVE}/groups/g1`).set({ title: 'Друзья' });
    // В группе живого лежат ОБА: ушедший и он сам. Уйти должен только первый.
    await db.doc(`users/${ALIVE}/groups/g1/members/${GONE}`).set({ added: 1 });
    await db.doc(`users/${ALIVE}/groups/g1/members/${ALIVE}`).set({ added: 1 });
    await db.doc(`users/${ALIVE}/audience/${GONE}`).set({ buckets: ['friends'] });
    await db.doc(`users/${ALIVE}/audience/${ALIVE}`).set({ buckets: ['friends'] });

    // УШЕДШИЙ: клиент снёс points и users, но топ ему стереть правила не дали.
    await db.doc(`relations/${GONE}`).set({ top: [{ guestUid: ALIVE, similarity: 0.5 }] });

    // Предложения: одно его, одно чужое.
    await db.doc('suggestions/s-gone').set({ authorUid: GONE, description: 'Умение слушать', created: 1 });
    await db.doc('suggestions/s-alive').set({ authorUid: ALIVE, description: 'Любовь к морю', created: 1 });

    // Дружбы (plans/63 шаг 4): пара с ушедшим осиротеет, пара двух живых неприкосновенна.
    // id = min_max (schema.ts → friendshipId); удаление ищет по полям a/b, не по id.
    await db.doc(`friendships/${ALIVE}_${GONE}`).set({
      a: ALIVE, b: GONE, requestedBy: GONE, status: 'accepted', created: 1, acceptedAt: 1,
    });
    await db.doc(`friendships/${ALIVE}_third-person`).set({
      a: ALIVE, b: 'third-person', requestedBy: ALIVE, status: 'pending', created: 1, acceptedAt: null,
    });

    removed = await cleanupDeletedPeople(1000);
  });

  test('ушедший опознан по отсутствию точки при живом relations', () => {
    assert.equal(removed, 1);
  });

  test('его топ удалён — клиенту это запрещено правилами', async () => {
    const snap = await db.doc(`relations/${GONE}`).get();
    assert.equal(snap.exists, false);
  });

  test('его членство в ЧУЖОЙ группе убрано', async () => {
    const snap = await db.doc(`users/${ALIVE}/groups/g1/members/${GONE}`).get();
    assert.equal(snap.exists, false);
  });

  test('подсказка аудитории у другого убрана', async () => {
    const snap = await db.doc(`users/${ALIVE}/audience/${GONE}`).get();
    assert.equal(snap.exists, false);
  });

  test('его дружба удалена — у живого друга не висит несуществующий человек (plans/63 шаг 4)', async () => {
    const snap = await db.doc(`friendships/${ALIVE}_${GONE}`).get();
    assert.equal(snap.exists, false);
  });

  test('его предложение ОБЕЗЛИЧЕНО, а не удалено: текст жив, автора нет', async () => {
    const snap = await db.doc('suggestions/s-gone').get();
    assert.ok(snap.exists, 'предложение должно остаться — оно полезно Пространству');
    assert.equal(snap.data().authorUid, null, 'связка с человеком обязана уйти');
    assert.equal(snap.data().description, 'Умение слушать', 'текст трогать нельзя');
  });

  // ── ВТОРАЯ СТОРОНА: за живым не убирают ──────────────────────────────────
  // Без этих проверок «зелёный» значил бы лишь «что-то удалили», а не «удалили нужное».

  test('живой человек цел: точка, топ и документ на месте', async () => {
    for (const path of [`points/${ALIVE}`, `relations/${ALIVE}`, `users/${ALIVE}`]) {
      assert.ok((await db.doc(path).get()).exists, `${path} обязан уцелеть`);
    }
  });

  test('его собственное членство и подсказка не тронуты', async () => {
    assert.ok((await db.doc(`users/${ALIVE}/groups/g1/members/${ALIVE}`).get()).exists);
    assert.ok((await db.doc(`users/${ALIVE}/audience/${ALIVE}`).get()).exists);
  });

  test('чужое предложение не обезличено', async () => {
    const snap = await db.doc('suggestions/s-alive').get();
    assert.equal(snap.data().authorUid, ALIVE);
  });

  test('дружба двух живых не тронута', async () => {
    assert.ok((await db.doc(`friendships/${ALIVE}_third-person`).get()).exists);
  });

  test('повторный проход без сирот бесплатен и ничего не трогает', async () => {
    assert.equal(await cleanupDeletedPeople(2000), 0);
  });
});

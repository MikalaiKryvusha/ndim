// Тест фильтра анонимных гостей в вычислителе (plans/03, этап 2, В3 интервью №004).
//
// Инвариант невидимости: точка с честным флагом `guest: true` (его гарантируют правила,
// см. honestGuestFlag в firestore.rules) НЕ попадает в чей бы то ни было топ relations —
// но сам гость получает свой топ против публичных точек на общих основаниях.
//
// Запуск: npm run test:calc  (поднимает эмулятор Firestore, Java обязательна)
// Прямой `node --test` не сработает: нужен FIRESTORE_EMULATOR_HOST от emulators:exec.

import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST не задан. Запускай через `npm run test:calc`.');
}

// Импорт после проверки окружения: index.mjs при импорте инициализирует firebase-admin,
// а его точка входа при импорте (не прямом запуске) не срабатывает.
const { runCycle } = await import('./index.mjs');
const { getFirestore } = await import('firebase-admin/firestore');

const db = getFirestore();

/** Сеет точку с оценками; guest: true помечает анонимного гостя. */
async function seedPoint(uid, ratings, { guest = false } = {}) {
  await db.doc(`points/${uid}`).set({ dirty: true, updated: 1, lastSync: 0, ...(guest ? { guest: true } : {}) });
  for (const [dimId, value] of Object.entries(ratings)) {
    await db.doc(`points/${uid}/dims/${dimId}`).set({ value });
  }
}

/** Список uid в топе владельца (поле guestUid — «другой человек связи», формат 1.x). */
async function topUids(ownerUid) {
  const snap = await db.doc(`relations/${ownerUid}`).get();
  assert.ok(snap.exists, `relations/${ownerUid} должен существовать`);
  return snap.data().top.map((entry) => entry.guestUid);
}

describe('Вычислитель: анонимный гость невидим в чужих relations', () => {
  before(async () => {
    // Два публичных человека и один гость с общими осями — все связи математически существуют.
    await seedPoint('alice', { calm: 7, sport: 5 });
    await seedPoint('bob', { calm: 4, sport: 9 });
    await seedPoint('ghost', { calm: 6, sport: 6 }, { guest: true });
    await runCycle();
  });

  test('гость получает свой топ против публичных точек', async () => {
    const top = await topUids('ghost');
    assert.deepEqual([...top].sort(), ['alice', 'bob']);
  });

  test('🔒 гость не появляется в топе ни одного публичного человека', async () => {
    for (const owner of ['alice', 'bob']) {
      const top = await topUids(owner);
      assert.ok(!top.includes('ghost'), `в relations/${owner} не должно быть гостя`);
    }
  });

  test('публичные люди видят друг друга — фильтр не задел обычные связи', async () => {
    assert.ok((await topUids('alice')).includes('bob'));
    assert.ok((await topUids('bob')).includes('alice'));
  });

  test('флаг dirty снят со всех точек, включая гостевую', async () => {
    for (const uid of ['alice', 'bob', 'ghost']) {
      const snap = await db.doc(`points/${uid}`).get();
      assert.equal(snap.data().dirty, false, `points/${uid} должен быть чистым`);
    }
  });

  test('флаг guest переживает снятие dirty — вычислитель пишет с merge', async () => {
    // Иначе после первого же пересчёта гость «легализовался» бы и попал в чужие топы.
    const snap = await db.doc('points/ghost').get();
    assert.equal(snap.data().guest, true);
  });
});

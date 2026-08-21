// Тест фильтра анонимных гостей в сервере синхронизации (plans/03, этап 2, В3 интервью №004).
//
// Инвариант невидимости: точка с честным флагом `guest: true` (его гарантируют правила,
// см. honestGuestFlag в firestore.rules) НЕ попадает в чей бы то ни было топ relations —
// но сам гость получает свой топ против публичных точек на общих основаниях.
//
// Запуск: npm run test:sync  (поднимает эмулятор Firestore, Java обязательна)
// Прямой `node --test` не сработает: нужен FIRESTORE_EMULATOR_HOST от emulators:exec.

import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST не задан. Запускай через `npm run test:sync`.');
}

// Импорт после проверки окружения: index.mjs при импорте инициализирует firebase-admin,
// а его точка входа при импорте (не прямом запуске) не срабатывает.
const { runCycle, cleanupStaleGuests } = await import('./index.mjs');
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

describe('Сервер синхронизации: анонимный гость невидим в чужих relations', () => {
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

  test('флаг guest переживает снятие dirty — сервер синхронизации пишет с merge', async () => {
    // Иначе после первого же пересчёта гость «легализовался» бы и попал в чужие топы.
    const snap = await db.doc('points/ghost').get();
    assert.equal(snap.data().guest, true);
  });
});

describe('Сервер синхронизации: осиротевшие гости вычищаются, живые и полноценные — нет', () => {
  const DAY = 24 * 60 * 60 * 1000;
  // Уборка гостей включается только с 2026-10-01 (№042 В3 — календарный предохранитель,
  // его собственные тесты в guest_death.test.mjs). Механика СРОКОВ проверяется здесь на
  // ПОДСТАВНОМ «сейчас» после включения; возраст посеянных точек отсчитывается от него же,
  // а не от настоящих часов — иначе до октября тесты красили бы исправный продукт.
  const AWAKE = Date.parse('2026-10-02T00:00:00+03:00');

  before(async () => {
    // Гость, не тронутый 31 день: точка чистая, lastSync старый, есть и топ, и users-дерево.
    const staleSync = AWAKE - 31 * DAY;
    await db.doc('points/oldghost').set({ dirty: false, guest: true, updated: staleSync, lastSync: staleSync });
    await db.doc('points/oldghost/dims/calm').set({ value: 5 });
    await db.doc('relations/oldghost').set({ computedAt: staleSync, version: 2, top: [] });
    await db.doc('users/oldghost').set({ settings: { language: 'ru' } });
    await db.doc('users/oldghost/profile/private').set({ gender: 'm' });

    // Гость из первого describe должен остаться «свежим» и в терминах подставного времени:
    // его lastSync поставил runCycle настоящими часами, и к октябрю он был бы честно стар.
    await db.doc('points/ghost').set({ lastSync: AWAKE - 1 * DAY }, { merge: true });

    await cleanupStaleGuests(AWAKE);
  });

  test('данные осиротевшего гостя удалены целиком: точка, оценки, топ, users-дерево', async () => {
    for (const path of [
      'points/oldghost',
      'points/oldghost/dims/calm',
      'relations/oldghost',
      'users/oldghost',
      'users/oldghost/profile/private',
    ]) {
      assert.equal((await db.doc(path).get()).exists, false, `${path} должен быть удалён`);
    }
  });

  test('🔒 свежий гость из прошлого цикла НЕ тронут — его lastSync моложе порога', async () => {
    assert.equal((await db.doc('points/ghost').get()).exists, true);
    assert.equal((await db.doc('relations/ghost').get()).exists, true);
  });

  test('🔒 полноценные люди не вычищаются никогда, каким бы старым ни был lastSync', async () => {
    // Уважительная асимметрия: у alice нет флага guest — её труд неприкосновенен.
    await db.doc('points/alice').set({ lastSync: AWAKE - 400 * DAY }, { merge: true });
    await cleanupStaleGuests(AWAKE);
    assert.equal((await db.doc('points/alice').get()).exists, true);
    assert.equal((await db.doc('points/alice/dims/calm').get()).exists, true);
  });

  test('🔒 гость, ждущий пересчёта (dirty), не сирота — не тронут', async () => {
    const staleSync = AWAKE - 31 * DAY;
    await db.doc('points/dirtyghost').set({ dirty: true, guest: true, updated: staleSync, lastSync: staleSync });
    await cleanupStaleGuests(AWAKE);
    assert.equal((await db.doc('points/dirtyghost').get()).exists, true);
  });
});

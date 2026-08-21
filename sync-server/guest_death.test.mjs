// Тесты фазы 4 эпика 22 — «честная смерть гостя» (plans/63).
//
// Шаг 1: КАЛЕНДАРНЫЙ ПРЕДОХРАНИТЕЛЬ (критерий приёмки 4). Слово владельца, интервью №042 В3:
// «Начнём удалять с октября» — до 2026-10-01 уборка гостей по сроку жизни не удаляет НИКОГО,
// какой бы старой ни была точка, и пишет в лог причину сна.
//
// Файл растёт вместе с фазой: шаг 6 добавит критерии 1–3 (полный перечень следов,
// неприкосновенность живых, отбор кандидатов через Auth).
//
// Запуск: npm run test:sync  (поднимает эмулятор Firestore, Java обязательна)

import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST не задан. Запускай через `npm run test:sync`.');
}

// СВОЙ проект = своя база: `node --test` гоняет файлы параллельно, а мы удаляем гостей.
process.env.FIREBASE_PROJECT_ID = 'demo-ndim-guest-death';

const { cleanupStaleGuests } = await import('./index.mjs');
const { getFirestore } = await import('firebase-admin/firestore');

const db = getFirestore();

const DAY = 24 * 60 * 60 * 1000;
// Дата включения уборки — зеркало константы GUEST_CLEANUP_START_MS продукта. Литерал здесь
// НАМЕРЕННО: сдвиг даты в коде обязан уронить этот тест, а не переехать молча.
const CLEANUP_START = Date.parse('2026-10-01T00:00:00+03:00');

/** Сеет гостя с точкой, оценкой, топом и users-деревом — удалять есть что (EXP-0070). */
async function seedGuest(uid, lastSync) {
  await db.doc(`points/${uid}`).set({ dirty: false, guest: true, updated: lastSync, lastSync });
  await db.doc(`points/${uid}/dims/calm`).set({ value: 5 });
  await db.doc(`relations/${uid}`).set({ computedAt: lastSync, version: 2, top: [] });
  await db.doc(`users/${uid}`).set({ settings: { language: 'ru' } });
}

describe('Фаза 4: календарный предохранитель — уборка гостей спит до 2026-10-01 (№042 В3)', () => {
  before(async () => {
    // Гость, истёкший к ОБЕИМ датам прогонов: возраст точки на предохранитель не влияет.
    await seedGuest('doomed', CLEANUP_START - 200 * DAY);
  });

  test('до даты включения не удаляется никто, и в лог уходит причина сна', async () => {
    const lines = [];
    const original = console.log;
    console.log = (line) => lines.push(String(line));
    let removed;
    try {
      removed = await cleanupStaleGuests(CLEANUP_START - 1 * DAY);
    } finally {
      console.log = original;
    }
    assert.equal(removed, 0, 'до 2026-10-01 уборка обязана вернуть 0');
    assert.equal((await db.doc('points/doomed').get()).exists, true, 'гость обязан пережить сон уборки');
    assert.ok(
      lines.some((line) => line.includes('уборка гостей спит до 2026-10-01')),
      'причина сна обязана быть в логе',
    );
  });

  test('за миг до включения — всё ещё сон: граница даты точная, а не примерная', async () => {
    const removed = await cleanupStaleGuests(CLEANUP_START - 1);
    assert.equal(removed, 0);
    assert.equal((await db.doc('points/doomed').get()).exists, true);
  });

  test('после даты включения тот же гость вычищается целиком', async () => {
    const removed = await cleanupStaleGuests(CLEANUP_START + 1 * DAY);
    assert.equal(removed, 1, 'после включения истёкший гость обязан быть вычищен');
    for (const path of [
      'points/doomed',
      'points/doomed/dims/calm',
      'relations/doomed',
      'users/doomed',
    ]) {
      assert.equal((await db.doc(path).get()).exists, false, `${path} должен быть удалён`);
    }
  });
});

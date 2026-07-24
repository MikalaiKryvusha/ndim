// Тесты экономии запросов сервера синхронизации (ideas/14; устройство 1.x — researches/13).
//
// ЧТО ЗДЕСЬ СТЕРЕЖЁТСЯ. Принцип автора из 1.x: запросы к базе — деньги, и вычислитель
// не имеет права перечитывать и переписывать Пространство целиком на каждый чих. Обычный
// цикл пишет ТОЛЬКО изменившееся (diff), свежую правку пережидает тихим периодом (человек
// ещё оценивает), а чужие топы обновляет лениво — их дописывает суточный полный проход
// (см. full_pass.test.mjs). Исключение из тихого периода — ОКНО НОВИЧКА (ideas/05):
// человек, ждущий свою ПЕРВУЮ ценность, синхронизируется ближайшим циклом; в 1.x новички
// ждали до часа и уходили с мыслью «связей нет».
//
// Запуск: npm run test:calc  (поднимает эмулятор Firestore, Java обязательна)

import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST не задан. Запускай через `npm run test:calc`.');
}

// СВОЙ ПРОЕКТ = своя база в эмуляторе: `node --test` гоняет файлы параллельно,
// и общая база смешала бы счётчики людей (см. space_stats.test.mjs).
process.env.FIREBASE_PROJECT_ID = 'demo-ndim-calc-economy';

const { runCycle } = await import('./index.mjs');
const { getFirestore } = await import('firebase-admin/firestore');

const db = getFirestore();
const MIN = 60 * 1000;

/**
 * Сеет точку; updated по умолчанию древний — тихий период (120 с) таким не мешает.
 * firstSeen задаётся, когда тесту нужен «бывалый» (вне окна новичка).
 */
async function seedPoint(uid, ratings, { updated = 1, guest = false, firstSeen = null } = {}) {
  await db.doc(`points/${uid}`).set({
    dirty: true,
    updated,
    lastSync: null,
    ...(guest ? { guest: true } : {}),
    ...(firstSeen === null ? {} : { firstSeen }),
  });
  for (const [dimId, value] of Object.entries(ratings)) {
    await db.doc(`points/${uid}/dims/${dimId}`).set({ value });
  }
}

const topUids = async (uid) => ((await db.doc(`relations/${uid}`).get()).data()?.top ?? []).map((e) => e.guestUid);

describe('Экономия запросов: обычный цикл пишет только изменившееся', () => {
  // Отметки времени первых записей — чтобы ловить лишние перезаписи в следующих тестах.
  let annaComputedAt = null;
  let metricsComputedAt = null;

  before(async () => {
    await seedPoint('anna', { calm: 7, sport: 5 });
    await seedPoint('boris', { calm: 4, sport: 9 });
    await runCycle(); // первый цикл процесса — всегда полный проход
  });

  test('первый цикл — полный проход: топы записаны, витрина заполнена', async () => {
    assert.deepEqual(await topUids('anna'), ['boris']);
    assert.deepEqual(await topUids('boris'), ['anna']);
    annaComputedAt = (await db.doc('relations/anna').get()).data().computedAt;
    metricsComputedAt = (await db.doc('space/public_metrics').get()).data().computedAt;
    assert.ok(annaComputedAt > 0);
    assert.ok(metricsComputedAt > 0);
  });

  test('холостой цикл: только сердцебиение — ни топы, ни витрина не переписываются', async () => {
    // Раньше каждый холостой цикл читал stats и переписывал витрину тем же числом —
    // ~2880 лишних операций в сутки на ровном месте (ideas/14).
    const written = await runCycle();
    assert.equal(written, 0);
    assert.equal((await db.doc('relations/anna').get()).data().computedAt, annaComputedAt);
    assert.equal((await db.doc('space/public_metrics').get()).data().computedAt, metricsComputedAt);
    const server = (await db.doc('space/server').get()).data();
    assert.ok(server.lastSuccessAt >= server.lastRunAt - MIN, 'холостой цикл — тоже успех (bugs/33)');
  });

  test('diff: пересохранение той же оценки снимает dirty, но топ не переписывает', async () => {
    await db.doc('points/boris').set({ dirty: true, updated: Date.now() - 5 * MIN }, { merge: true });
    const borisComputedAt = (await db.doc('relations/boris').get()).data().computedAt;

    const written = await runCycle();

    assert.equal(written, 0, 'содержимое топа не изменилось — записывать нечего');
    assert.equal((await db.doc('points/boris').get()).data().dirty, false, 'но точка проверена и чиста');
    assert.equal((await db.doc('relations/boris').get()).data().computedAt, borisComputedAt);
  });

  test('окно новичка: первый расчёт не ждёт тихий период — первая ценность сразу', async () => {
    // ideas/05: вера только что поставила первую оценку (updated свежий, firstSeen пуст).
    // Бывалого тихий период отложил бы; новичка ближайший цикл забирает немедленно.
    await seedPoint('vera', { calm: 6 }, { updated: Date.now() });

    const written = await runCycle();

    assert.equal(written, 1, 'записан ровно один топ — верин, первым же циклом');
    assert.deepEqual((await topUids('vera')).sort(), ['anna', 'boris']);
    assert.equal((await db.doc('points/vera').get()).data().dirty, false);
  });

  test('тихий период: бывалого со свежей правкой цикл откладывает', async () => {
    // Олег в Пространстве давно (firstSeen старше окна новичка) — его свежая правка ждёт:
    // человек ещё оценивает, сессия соберётся в один пересчёт.
    await seedPoint('oleg', { calm: 8 }, { updated: Date.now(), firstSeen: Date.now() - 2 * 60 * MIN });

    const written = await runCycle();

    assert.equal(written, 0);
    assert.equal((await db.doc('points/oleg').get()).data().dirty, true, 'точка ждёт своего пересчёта');
    assert.equal((await db.doc('relations/oleg').get()).exists, false);
  });

  test('тихий период истёк: бывалый синхронизирован', async () => {
    await db.doc('points/oleg').set({ updated: Date.now() - 3 * MIN }, { merge: true });

    const written = await runCycle();

    assert.equal(written, 1, 'записан ровно один топ — олегов');
    assert.deepEqual((await topUids('oleg')).sort(), ['anna', 'boris', 'vera']);
    assert.equal((await db.doc('points/oleg').get()).data().dirty, false);
  });

  test('ленивый контракт 1.x: в чужие топы новички попадут полным проходом, не сейчас', async () => {
    // Наследие 1.x (researches/13 §5): свой топ — быстро, появление в чужих — в течение
    // суток. Цена, которой куплена экономия записей; страховка — full_pass.test.mjs.
    const anna = (await db.doc('relations/anna').get()).data();
    assert.equal(anna.computedAt, annaComputedAt, 'аннин документ не переписывался');
    const annaTop = await topUids('anna');
    assert.ok(!annaTop.includes('vera') && !annaTop.includes('oleg'));
  });

  test('счёт людей изменился — витрина лендинга обновлена', async () => {
    const metrics = (await db.doc('space/public_metrics').get()).data();
    assert.equal(metrics.people, 4, 'анна, борис, вера, олег; витрина не отстаёт от Пространства');
    assert.ok(metrics.computedAt > metricsComputedAt, 'запись случилась, потому что счёт изменился');
  });
});

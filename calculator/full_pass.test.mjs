// Тесты полного прохода сервера синхронизации (ideas/14; устройство 1.x — researches/13 §4).
//
// ЧТО ЗДЕСЬ СТЕРЕЖЁТСЯ. Обычные циклы экономят: пишут только топы изменившихся людей,
// а чужие топы намеренно отстают (economy.test.mjs). Полный проход — суточная страховка
// этого контракта: перечитывает всё, дописывает ленивые топы, забирает даже точки в тихом
// периоде и лечит записи, разошедшиеся с реальностью. Без него ленивый контракт превратился
// бы в «никогда».
//
// CALC_FULL_SYNC_HOURS=0 превращает КАЖДЫЙ цикл в полный проход — так суточная логика
// проверяется без ожидания суток.
//
// Запуск: npm run test:calc  (поднимает эмулятор Firestore, Java обязательна)

import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST не задан. Запускай через `npm run test:calc`.');
}

// СВОЙ ПРОЕКТ = своя база в эмуляторе (см. space_stats.test.mjs). Обе переменные читаются
// при загрузке модуля — ставим ДО импорта index.mjs.
process.env.FIREBASE_PROJECT_ID = 'demo-ndim-calc-fullpass';
process.env.CALC_FULL_SYNC_HOURS = '0';

const { runCycle } = await import('./index.mjs');
const { getFirestore } = await import('firebase-admin/firestore');

const db = getFirestore();

async function seedPoint(uid, ratings, { updated = 1, firstSeen = null } = {}) {
  await db.doc(`points/${uid}`).set({
    dirty: true,
    updated,
    lastSync: null,
    ...(firstSeen === null ? {} : { firstSeen }),
  });
  for (const [dimId, value] of Object.entries(ratings)) {
    await db.doc(`points/${uid}/dims/${dimId}`).set({ value });
  }
}

const topUids = async (uid) => ((await db.doc(`relations/${uid}`).get()).data()?.top ?? []).map((e) => e.guestUid);

describe('Полный проход — суточная страховка ленивого контракта', () => {
  before(async () => {
    await seedPoint('anna', { calm: 7, sport: 5 });
    await seedPoint('boris', { calm: 4, sport: 9 });
    // Протухший топ «из прошлой жизни процесса»: полный проход обязан заметить расхождение.
    await db.doc('relations/anna').set({ computedAt: 1, version: 2, top: [] });
    await runCycle();
  });

  test('расхождение записи с реальностью вылечено: пустой топ анны переписан честным', async () => {
    assert.deepEqual(await topUids('anna'), ['boris']);
  });

  test('новый человек полным проходом дописывается в чужие топы', async () => {
    await seedPoint('vera', { calm: 6 });

    await runCycle();

    assert.deepEqual((await topUids('vera')).sort(), ['anna', 'boris'], 'свой топ — сразу');
    assert.ok((await topUids('anna')).includes('vera'), 'и в аннином топе вера уже есть');
    assert.ok((await topUids('boris')).includes('vera'));
  });

  test('полный проход игнорирует тихий период даже у бывалого: суточная партия важнее', async () => {
    // Гриша нарочно «бывалый» (firstSeen старше окна новичка — ideas/05): новичка обычный
    // цикл и так забрал бы, а тест стережёт именно то, что ПОЛНЫЙ проход сильнее тишины.
    await seedPoint('grisha', { calm: 5 }, { updated: Date.now(), firstSeen: Date.now() - 2 * 60 * 60 * 1000 });

    await runCycle();

    assert.equal((await db.doc('points/grisha').get()).data().dirty, false);
    assert.ok((await topUids('grisha')).length > 0, 'топ гриши записан, хотя правка свежая');
  });

  test('полный проход без изменений не переписывает ни одного топа (diff)', async () => {
    const annaComputedAt = (await db.doc('relations/anna').get()).data().computedAt;

    const written = await runCycle();

    assert.equal(written, 0, 'Пространство не менялось — записывать нечего');
    assert.equal((await db.doc('relations/anna').get()).data().computedAt, annaComputedAt);

    // Отчёт полного прохода честен и при нуле записей (bugs/42): «проверено 4, из них
    // обновлено 0» — так владелец читает тишину как норму, а не как поломку.
    const server = (await db.doc('space/server').get()).data();
    assert.equal(server.fullSync.checked, 4, 'анна, борис, вера, гриша — все проверены');
    assert.equal(server.fullSync.updated, 0);
    assert.equal(server.partialSync, undefined, 'в этом файле все циклы полные — частичных не было');
  });

  test('снимок дня пишется и в тихий день — тренды не должны дырявиться', async () => {
    // Побочное улучшение полного прохода: раньше в день без единой правки снимок дня
    // не записывался вовсе (снимки писались только циклами с пересчётом).
    const { dayKey } = await import('../src/lib/model/stats.ts');
    const snapshot = (await db.doc(`space/stats/daily/${dayKey(Date.now())}`).get()).data();
    assert.ok(snapshot, 'снимок дня существует');
    assert.equal(snapshot.people, 4, 'анна, борис, вера, гриша');
  });
});

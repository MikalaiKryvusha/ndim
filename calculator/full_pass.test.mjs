// Тесты полного прохода сервера синхронизации (ideas/14; устройство 1.x — researches/13 §4).
//
// ЧТО ЗДЕСЬ СТЕРЕЖЁТСЯ. Обычные циклы экономят: пишут только топы изменившихся людей,
// а чужие топы намеренно отстают (economy.test.mjs). Полный проход — суточная страховка
// этого контракта: перечитывает всё, дописывает ленивые топы, забирает даже точки в тихом
// периоде и лечит записи, разошедшиеся с реальностью. Без него ленивый контракт превратился
// бы в «никогда».
//
// CALC_FULL_SYNC_EVERY_CYCLE=1 превращает КАЖДЫЙ цикл в ночной полный проход — так суточная
// логика проверяется без ожидания суток. Ручка сменилась вместе с расписанием (bugs/85):
// раньше проход был «раз в CALC_FULL_SYNC_HOURS от старта процесса», теперь — в заданный ЧАС
// СУТОК (CALC_FULL_SYNC_AT_HOUR), и period-ручки больше не существует.
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
process.env.CALC_FULL_SYNC_EVERY_CYCLE = '1';

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

/**
 * РАСПИСАНИЕ ночного прохода (bugs/85) — чистые функции, без базы.
 *
 * Стерегут ровно то, что было сломано: якорем суток должен быть ЧАС СУТОК, а не момент
 * старта процесса. Владелец видел «Запланированная 30 июля в 13:03» — час подъёма
 * контейнера, — и справедливо прочитал это как отсутствие ночного прохода.
 */
const { lastScheduledFullPass, nextScheduledFullPass } = await import('./index.mjs');

describe('расписание ночного полного прохода', () => {
  const DAY = 24 * 60 * 60 * 1000;

  // Час берётся по UTC — паритет с 1.x (см. FULL_SYNC_AT_HOUR в index.mjs).
  const midnightOf = (date) => {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  };

  test('ближайший прошедший проход — полночь ТЕКУЩИХ суток, а не «минус 24 часа»', () => {
    // 13:03 — ровно тот час, который владелец видел в виджете.
    const at1303 = new Date(2026, 6, 29, 13, 3, 0).getTime();
    assert.equal(
      lastScheduledFullPass(at1303),
      midnightOf(at1303),
      'якорь суток — полночь, а не момент старта процесса',
    );
  });

  test('до наступления часа якорь — ВЧЕРАШНИЙ, иначе проход «просрочен» каждую полночь дважды', () => {
    const at0030 = new Date(2026, 6, 29, 0, 30, 0).getTime();
    assert.equal(lastScheduledFullPass(at0030), midnightOf(at0030));

    // 23:59 предыдущих суток: полночь ЭТИХ суток ещё не наступила → якорь вчерашний.
    const at2359 = new Date(2026, 6, 28, 23, 59, 0).getTime();
    assert.equal(lastScheduledFullPass(at2359), midnightOf(at2359));
    assert.ok(lastScheduledFullPass(at2359) < at2359, 'якорь всегда в прошлом');
  });

  test('«Запланированная» — следующая полночь, а не «сейчас + сутки»', () => {
    const at1303 = new Date(2026, 6, 29, 13, 3, 0).getTime();
    const next = nextScheduledFullPass(at1303);
    assert.equal(next, midnightOf(at1303) + DAY, 'следующая полночь');
    assert.notEqual(next, at1303 + DAY, 'а НЕ «сейчас плюс сутки» — это и был дефект');
    assert.equal(new Date(next).getUTCHours(), 0, 'ровно в заданный час по UTC');
  });

  test('проход, сделанный в текущих сутках, повторно НЕ просрочен — рестарт не гонит его заново', () => {
    const now = new Date(2026, 6, 29, 13, 3, 0).getTime();
    const doneToday = midnightOf(now) + 5 * 60 * 1000; // прошёл в 00:05
    assert.ok(doneToday >= lastScheduledFullPass(now), 'сделан после якоря — просрочки нет');

    const doneYesterday = midnightOf(now) - 60 * 1000; // 23:59 вчера
    assert.ok(doneYesterday < lastScheduledFullPass(now), 'сделан до якоря — просрочен');
  });
});

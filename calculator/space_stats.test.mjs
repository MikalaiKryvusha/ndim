// Тест статистики Пространства, которую пишет сервер синхронизации (ideas/06).
//
// ЧТО ЗДЕСЬ СТЕРЕЖЁТСЯ. Экран «Пространство» — единственное место, где продукт сам о себе
// рассказывает. Соврать там — значит пообещать людей, которых не найти, или показать
// зелёную лампочку у сервера, который вторые сутки молчит. Чистая арифметика проверена
// юнит-тестами (src/lib/model/stats.test.ts); здесь — то, чего они увидеть не могут:
// что сервер действительно КЛАДЁТ эти цифры в Firestore, и кладёт правильные.
//
// Запуск: npm run test:calc  (поднимает эмулятор Firestore, Java обязательна)

import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST не задан. Запускай через `npm run test:calc`.');
}

// СВОЙ ПРОЕКТ = своя база в эмуляторе. Статистика — величина ГЛОБАЛЬНАЯ («людей в
// Пространстве»), поэтому чужие точки из соседнего теста ломали бы счёт: `node --test`
// гоняет файлы параллельно, и они делили бы одну базу. Проект задаётся ДО импорта
// index.mjs — он читает FIREBASE_PROJECT_ID при загрузке модуля.
process.env.FIREBASE_PROJECT_ID = 'demo-ndim-calc-stats';

const { runCycle } = await import('./index.mjs');
const { getFirestore } = await import('firebase-admin/firestore');
const { dayKey } = await import('../src/lib/model/stats.ts');

const db = getFirestore();
const DAY_MS = 24 * 60 * 60 * 1000;

const A = 'stats-anna';
const B = 'stats-boris';
const G = 'stats-ghost';

async function seedPoint(uid, ratings, { guest = false, updated = Date.now() } = {}) {
  await db.doc(`points/${uid}`).set({ dirty: true, updated, lastSync: null, ...(guest ? { guest: true } : {}) });
  for (const [dimId, value] of Object.entries(ratings)) {
    await db.doc(`points/${uid}/dims/${dimId}`).set({ value });
  }
}

describe('Сервер синхронизации пишет статистику Пространства', () => {
  before(async () => {
    const now = Date.now();
    // Каталог: три старых измерения и одно, появившееся за последние сутки.
    for (const [id, created] of [
      ['calm', now - 60 * DAY_MS],
      ['sport', now - 60 * DAY_MS],
      ['books', now - 60 * DAY_MS],
      ['early-rising', now - 3 * 60 * 60 * 1000],
    ]) {
      await db.doc(`dims/${id}`).set({ title: { ru: 'Тест', en: 'Test' }, created });
    }

    await seedPoint(A, { calm: 7, sport: 5 });
    await seedPoint(B, { calm: 4, sport: 9 });
    await seedPoint(G, { calm: 6, sport: 6 }, { guest: true });

    await runCycle();
  });

  test('space/stats существует и описывает Пространство', async () => {
    const stats = (await db.doc('space/stats').get()).data();
    assert.ok(stats, 'space/stats должен быть записан');

    assert.equal(stats.people, 2, 'в Пространстве двое: гость невидим, в счётчик не входит');
    assert.equal(stats.ratings, 4, 'оценки гостя тоже не в счёте');
    assert.equal(stats.dims, 4, 'измерения считаются по каталогу, а не по проставленным оценкам');
    assert.equal(stats.diameter, 20, 'диаметр = √4 × 10 звёзд');
    assert.equal(stats.relations, 2, 'по одной связи у каждого из двоих; топ гостя в счёт не идёт');
    assert.ok(stats.avgSimilarity > 0 && stats.avgSimilarity <= 100);
  });

  test('новое измерение попадает в события суток вместе со своим именем', async () => {
    const stats = (await db.doc('space/stats').get()).data();
    assert.deepEqual(
      stats.newDims.map((dim) => dim.id),
      ['early-rising'],
      'за сутки появилось ровно одно измерение — старожилы новыми не считаются',
    );
  });

  test('публичная витрина лендинга: space/public_metrics повторяет счёт людей Пространства', async () => {
    // «С нами уже N человек» на лендинге (bugs/07). Число обязано быть ТЕМ ЖЕ, что на
    // экране «Пространство», — лендинг не имеет права хвастаться другой цифрой.
    const metrics = (await db.doc('space/public_metrics').get()).data();
    assert.ok(metrics, 'space/public_metrics должен быть записан');
    assert.equal(metrics.people, 2, 'тот же счёт, что в space/stats: гость невидим и не в счёте');
  });

  test('снимок дня записан — из снимков растут тренды', async () => {
    const today = dayKey(Date.now());
    const snapshot = (await db.doc(`space/stats/daily/${today}`).get()).data();
    assert.ok(snapshot, `space/stats/daily/${today} должен быть записан`);
    assert.equal(snapshot.date, today);
    assert.equal(snapshot.people, 2);
  });

  test('сервер синхронизации отчитался о себе: сердцебиение, версия, итоги цикла', async () => {
    const server = (await db.doc('space/server').get()).data();
    assert.ok(server, 'space/server должен быть записан');
    assert.ok(server.lastRunAt > 0, 'без отметки о запуске экран не смог бы сказать «Работает»');
    assert.equal(server.lastSuccessAt, server.lastRunAt, 'цикл со связями — успешная синхронизация');
    assert.equal(server.usersSynced, 3, 'топы пересчитаны всем троим, включая гостя (его топ — его дело)');
    assert.equal(server.relationsComputed, 2);
    assert.ok(typeof server.version === 'string' && server.version.length > 0);
    assert.ok(server.intervalSeconds > 0, 'без интервала нельзя понять, молчит сервер или просто ждёт');
  });

  test('человек, которого сервер увидел впервые, отмечен — на этом держится «новых за 30 дней»', async () => {
    const point = (await db.doc(`points/${A}`).get()).data();
    assert.equal(typeof point.firstSeen, 'number');
    assert.equal(point.dirty, false, 'точка пересчитана — флаг снят');
  });

  test('холостой цикл: пересчитывать нечего, но сердцебиение обновляется', async () => {
    const before = (await db.doc('space/server').get()).data();
    const statsBefore = (await db.doc('space/stats').get()).data();

    const recomputed = await runCycle(); // грязных точек не осталось
    assert.equal(recomputed, 0);

    const after = (await db.doc('space/server').get()).data();
    const statsAfter = (await db.doc('space/stats').get()).data();

    assert.ok(after.lastRunAt >= before.lastRunAt, 'сервер обязан отчитаться, что он на месте');
    // ХОЛОСТОЙ ЦИКЛ — ТОЖЕ УСПЕХ (bugs/33): раньше «последний успех» застывал на дни на
    // спокойном Пространстве, и владелец прочёл это как «сервер не работает».
    assert.ok(after.lastSuccessAt >= before.lastSuccessAt, 'холостой цикл — успешная синхронизация');
    assert.ok(after.lastSuccessAt >= after.lastRunAt - 60_000, 'успех свежий, а не застывший');
    assert.deepEqual(statsAfter, statsBefore, 'Пространство не менялось — не менялись и его цифры');

    // Публичная витрина зеркалится и холостым циклом: боевой документ мог остаться
    // в формате 1.x, и без этого счётчик лендинга не родился бы никогда (bugs/07).
    const metrics = (await db.doc('space/public_metrics').get()).data();
    assert.equal(metrics.people, statsAfter.people, 'витрина повторяет счёт людей Пространства');
  });
});

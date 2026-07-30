// Тесты УСТОЙЧИВОСТИ цикла сервера синхронизации (bugs/91, 92, 93, 94 — аудит 2026-07-31).
//
// ЧТО ЗДЕСЬ СТЕРЕЖЁТСЯ. Экономия запросов (ideas/14) сделала цикл ленивым — и ровно этим
// открыла три дыры устойчивости: отметка ночного прохода ставилась ДО работы (сбой терял
// сутки), опустевшая точка выпадала из diff-записи (устаревший топ навсегда), а флаг dirty
// снимался безусловно (гонка съедала оценку, поставленную во время цикла). Каждый тест
// красен на коде до фикса — мутантом служит сам дефект (приём bugs/70).
//
// ⚠️ В этом файле НЕТ CALC_FULL_SYNC_EVERY_CYCLE: тест bugs/91 различает «ночной проход
// повторён, потому что прошлый упал» и «ночной, потому что каждый цикл ночной» — вторым
// режимом это различие неизмеримо. Ночным первый цикл делает пустая база (fullSync.at
// отсутствует → 0 → просрочен).
//
// Запуск: npm run test:calc  (поднимает эмулятор Firestore, Java обязательна)

import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST не задан. Запускай через `npm run test:calc`.');
}

// СВОЙ ПРОЕКТ = своя база в эмуляторе (см. space_stats.test.mjs). Переменные читаются при
// загрузке модуля — ставим ДО импорта index.mjs.
process.env.FIREBASE_PROJECT_ID = 'demo-ndim-calc-resilience';
delete process.env.CALC_FULL_SYNC_EVERY_CYCLE;

const { runCycle, _testFailNextCommit, _testBetweenCommitAndRelease } = await import('./index.mjs');
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

const relationDoc = async (uid) => (await db.doc(`relations/${uid}`).get()).data();

describe('bugs/91 — упавший ночной проход повторяется следующим циклом, а не через сутки', () => {
  before(async () => {
    await seedPoint('anna', { calm: 7, sport: 5 });
    await seedPoint('boris', { calm: 4, sport: 9 });
  });

  test('цикл со сбоем коммита падает, не записав ни топов, ни отчёта', async () => {
    _testFailNextCommit.armed = true;
    await assert.rejects(runCycle(), /тестовый сбой коммита/);
    assert.equal(await relationDoc('anna'), undefined, 'топы не записаны');
    const server = (await db.doc('space/server').get()).data();
    assert.equal(server?.fullSync, undefined, 'отчёт полного прохода не записан');
  });

  test('следующий цикл повторяет ИМЕННО ночной проход (отметка не сгорела при сбое)', async () => {
    // До фикса lastFullPassAt ставился в начале цикла: сбой «съедал» проход, второй цикл
    // шёл частичным, и fullSync не появлялся до следующей полуночи — этот ассерт краснел.
    await runCycle();
    const server = (await db.doc('space/server').get()).data();
    assert.ok(server.fullSync?.at, 'блок «Полная синхронизация» записан повторным заходом');
    assert.deepEqual(
      ((await relationDoc('anna'))?.top ?? []).map((e) => e.guestUid),
      ['boris'],
      'топы дозаписаны повторным заходом',
    );
  });
});

describe('bugs/92 — точка, у которой удалили все оценки, получает честный ПУСТОЙ топ', () => {
  test('удаление всех оценок затирает устаревший relations пустым топом', async () => {
    // У анны есть честный топ (записан выше). Человек удаляет ВСЕ оценки — как removeRating:
    // документы dims уходят, dirty ставится, updated обновляется.
    const dims = await db.collection('points/anna/dims').get();
    for (const dim of dims.docs) await dim.ref.delete();
    await db.doc('points/anna').set({ dirty: true, updated: 2 }, { merge: true });

    await runCycle();

    // До фикса `continue` пропускал опустевшую точку до diff: старый топ жил вечно.
    assert.deepEqual((await relationDoc('anna')).top, [], 'топ из несуществующих оценок затёрт');
    assert.equal((await db.doc('points/anna').get()).data().dirty, false);
  });

  test('новичку без единой оценки пустой документ топа НЕ заводится (экономия)', async () => {
    await db.doc('points/nikita').set({ dirty: true, updated: 3, lastSync: null });

    await runCycle();

    assert.equal(await relationDoc('nikita'), undefined, 'оплаченная запись без смысла не сделана');
    assert.equal((await db.doc('points/nikita').get()).data().dirty, false);
  });
});

describe('bugs/93 — оценка, поставленная во время цикла, не теряется', () => {
  test('dirty, обновлённый посреди цикла, переживает снятие флага', async () => {
    await seedPoint('vera', { calm: 6 }, { updated: 100 });

    // Дверь стенда: «человек ставит оценку», пока цикл уже закоммитил топы, но ещё не снял
    // флаг, — ровно окно гонки. До фикса безусловный batch.set затирал этот dirty:true.
    _testBetweenCommitAndRelease.hook = async () => {
      _testBetweenCommitAndRelease.hook = null;
      await db.doc('points/vera/dims/sport').set({ value: 9 });
      await db.doc('points/vera').set({ dirty: true, updated: 200 }, { merge: true });
    };
    await runCycle();

    assert.equal(
      (await db.doc('points/vera').get()).data().dirty,
      true,
      'свежая оценка не съедена: флаг остался, точка пересчитается следующим циклом',
    );

    // Следующий цикл дожимает: флаг снят, топ учитывает новую оценку.
    await runCycle();
    assert.equal((await db.doc('points/vera').get()).data().dirty, false);
  });
});

describe('bugs/94 — страж не пускает НЕ-demo проект в эмулятор', () => {
  test('ndim-space + FIRESTORE_EMULATOR_HOST = немедленный отказ с внятным текстом', async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const { fileURLToPath } = await import('node:url');
    const run = promisify(execFile);

    // Страж стоит ДО initializeApp — ключи и живой эмулятор процессу не нужны.
    await assert.rejects(
      run(process.execPath, ['calculator/index.mjs', '--once'], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: {
          ...process.env,
          FIREBASE_PROJECT_ID: 'ndim-space',
          FIRESTORE_EMULATOR_HOST: '127.0.0.1:1',
          NDIM_ALLOW_EMULATOR: '',
        },
        timeout: 15000,
      }),
      (error) => {
        assert.equal(error.code, 1, 'код выхода 1, а не падение соединения');
        assert.match(error.stderr, /СТОП: проект ndim-space совмещён с эмулятором/);
        return true;
      },
    );
  });
});

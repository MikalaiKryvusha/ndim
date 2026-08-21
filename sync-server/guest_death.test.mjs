// Тесты фазы 4 эпика 22 — «честная смерть гостя» (plans/63).
//
// Шаг 1: КАЛЕНДАРНЫЙ ПРЕДОХРАНИТЕЛЬ (критерий приёмки 4). Слово владельца, интервью №042 В3:
// «Начнём удалять с октября» — до 2026-10-01 уборка гостей по сроку жизни не удаляет НИКОГО,
// какой бы старой ни была точка, и пишет в лог причину сна.
//
// Шаг 2: ОТБОР КАНДИДАТОВ ЧЕРЕЗ AUTH — 7 дней от рождения аккаунта (№010 Р3), dirty/lastSync
// в отборе не участвуют; страховка вычищает guest-точки, пережившие свою учётку.
//
// Шаг 3: ПОЛНЫЙ ПЕРЕЧЕНЬ СЛЕДОВ (критерии 1–3): членства в чужих группах, подсказки
// аудитории, дружбы обеих сторон, обезличивание заявок, фотография в Storage — и последним
// учётная запись Auth (deleteUser).
//
// Запуск: npm run test:sync  (поднимает эмуляторы Firestore + Auth + Storage, Java обязательна)

import { readFile } from 'node:fs/promises';
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST не задан. Запускай через `npm run test:sync`.');
}

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('FIREBASE_AUTH_EMULATOR_HOST не задан: отбор кандидатов идёт через Auth (plans/63 шаг 2).');
}

if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  throw new Error('FIREBASE_STORAGE_EMULATOR_HOST не задан: в перечне следов фотография Storage (plans/63 шаг 3).');
}

// СВОЙ проект = своя база: `node --test` гоняет файлы параллельно, а мы удаляем гостей.
process.env.FIREBASE_PROJECT_ID = 'demo-ndim-guest-death';

const { cleanupStaleGuests, CONTOUR_BUCKETS } = await import('./index.mjs');
const { getFirestore } = await import('firebase-admin/firestore');
const { getAuth } = await import('firebase-admin/auth');
const { getStorage } = await import('firebase-admin/storage');

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

/** Auth-учётка с нужным возрастом; аноним = без провайдеров (как в живом продукте).
 * importUsers, а не createUser: возраст живёт в metadata.creationTime, и только импорт
 * позволяет посеять его произвольным — createUser ставит «сейчас».
 * ⚠️ Неанониму провайдер рождает ТОЛЬКО passwordHash: email провайдера не даёт, а поле
 * providerData эмулятор при импорте игнорирует молча (снято зондом: import success, getUser →
 * providerData []). Без хеша посеянный «человек» выглядел бы анонимом — поймано первым же
 * прогоном. В живом продукте вход по ссылке даёт провайдер password, Google — google.com. */
async function seedAccount(uid, bornAt, { anonymous = true } = {}) {
  const email = `${uid}@example.com`;
  const record = {
    uid,
    metadata: { creationTime: new Date(bornAt).toUTCString(), lastSignInTime: new Date(bornAt).toUTCString() },
    ...(anonymous
      ? {}
      : {
          email,
          emailVerified: true,
          passwordHash: Buffer.from('0'.repeat(64), 'hex'),
          passwordSalt: Buffer.from('00112233', 'hex'),
        }),
  };
  const result = await getAuth().importUsers(
    [record],
    anonymous ? undefined : { hash: { algorithm: 'SHA256', rounds: 1 } },
  );
  assert.equal(result.failureCount, 0, `учётка ${uid} обязана быть посеяна: ${JSON.stringify(result.errors)}`);
}

describe('Фаза 4: календарный предохранитель — уборка гостей спит до 2026-10-01 (№042 В3)', () => {
  before(async () => {
    // Гость, истёкший к ОБЕИМ датам прогонов: возраст на предохранитель не влияет.
    // Учётка нужна и здесь: с шага 2 кандидатов даёт Auth, и тест «после включения»
    // проверяет уборку по-настоящему, а не через пустой список. Убирать её за собой не
    // нужно: с шага 3 учётку последним следом удаляет сама уборка.
    await seedAccount('doomed', CLEANUP_START - 200 * DAY);
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

describe('Фаза 4, шаг 2: кандидатов на смерть даёт Auth — 7 дней от рождения (№010 Р3)', () => {
  // Условный день прогона — после включения уборки; возраст учёток задаётся importUsers
  // относительно него (metadata.creationTime подделать через createUser нельзя — и не надо).
  const NOW = CLEANUP_START + 30 * DAY;
  let removed;

  before(async () => {
    // Истёкший гость с полным набором данных — умирает.
    await seedAccount('expired-guest', NOW - 10 * DAY);
    await seedGuest('expired-guest', NOW - 10 * DAY);
    // Молодой гость — жив со всеми данными: возраст меньше TTL.
    await seedAccount('young-guest', NOW - 2 * DAY);
    await seedGuest('young-guest', NOW - 2 * DAY);
    // Полноценный человек-ветеран — не кандидат ни при каком возрасте (риск 1 плана).
    await seedAccount('veteran', NOW - 400 * DAY, { anonymous: false });
    await db.doc('points/veteran').set({ dirty: false, updated: NOW - 400 * DAY, lastSync: NOW - 400 * DAY });
    await db.doc('points/veteran/dims/calm').set({ value: 9 });
    // Вечно-dirty истёкший гость — прежний отбор делал его бессмертным (дыра §3 закрыта).
    await seedAccount('dirty-expired', NOW - 10 * DAY);
    await db.doc('points/dirty-expired').set({ dirty: true, guest: true, updated: NOW - 10 * DAY, lastSync: NOW - 10 * DAY });
    // Истёкший гость БЕЗ единой оценки: данных нет, а учётная запись есть (дыра §3 закрыта).
    await seedAccount('no-point-guest', NOW - 10 * DAY);
    // Сирота: guest-точка, чью учётку уже сняла внешняя авточистка, — страховка.
    await seedGuest('orphan-point', NOW - 40 * DAY);

    removed = await cleanupStaleGuests(NOW);
  });

  test('истёкший гость вычищен целиком: точка, оценки, топ, users-дерево', async () => {
    for (const path of [
      'points/expired-guest',
      'points/expired-guest/dims/calm',
      'relations/expired-guest',
      'users/expired-guest',
    ]) {
      assert.equal((await db.doc(path).get()).exists, false, `${path} должен быть удалён`);
    }
  });

  test('🔒 молодой гость жив со всеми данными — 7 дней ему ещё не исполнилось', async () => {
    assert.equal((await db.doc('points/young-guest').get()).exists, true);
    assert.equal((await db.doc('relations/young-guest').get()).exists, true);
    assert.equal((await db.doc('users/young-guest').get()).exists, true);
  });

  test('🔒 полноценный человек не кандидат ни при каком возрасте учётки', async () => {
    assert.equal((await db.doc('points/veteran').get()).exists, true);
    assert.equal((await db.doc('points/veteran/dims/calm').get()).exists, true);
  });

  test('вечно-dirty гость больше не бессмертен: dirty в отборе не участвует', async () => {
    assert.equal((await db.doc('points/dirty-expired').get()).exists, false);
  });

  test('страховка: guest-точка без живой учётки вычищена', async () => {
    assert.equal((await db.doc('points/orphan-point').get()).exists, false);
    assert.equal((await db.doc('relations/orphan-point').get()).exists, false);
  });

  test('счёт вычищенных честный: три кандидата Auth + один сирота страховки', async () => {
    // expired-guest + dirty-expired + no-point-guest (кандидаты по Auth) + orphan-point.
    assert.equal(removed, 4);
  });

  test('учётная запись истёкшего удалена ПОСЛЕДНИМ следом (шаг 3, критерий 3)', async () => {
    // До шага 3 тест фиксировал обратное («учётка пока жива — deleteUser принадлежит
    // шагу 3»); шаг сделан — ожидание перевернулось, как и обещала граница.
    await assert.rejects(
      getAuth().getUser('expired-guest'),
      (error) => error.code === 'auth/user-not-found',
      'учётной записи истёкшего гостя не должно остаться в Auth',
    );
  });

  test('🔒 учётки молодого гостя и ветерана переживают уборку', async () => {
    assert.equal((await getAuth().getUser('young-guest')).uid, 'young-guest');
    assert.equal((await getAuth().getUser('veteran')).uid, 'veteran');
  });
});

describe('Фаза 4, шаг 3: полный перечень следов — таблица §4 метаплана (критерии 1–3)', () => {
  // Тот же условный день, что в шаге 2: остаточные young-guest/veteran обязаны пережить
  // и этот прогон (молодость и провайдер — не функция дня прогона здесь).
  const NOW = CLEANUP_START + 30 * DAY;
  const bucket = getStorage().bucket();
  let removed;

  before(async () => {
    // Умирающий гость со ВСЕМИ следами таблицы §4.
    await seedAccount('full-guest', NOW - 10 * DAY);
    await seedGuest('full-guest', NOW - 10 * DAY);
    // Хозяин следов — полноценный живой человек: его дерево трогать нельзя.
    await seedAccount('host', NOW - 400 * DAY, { anonymous: false });
    await db.doc('points/host').set({ dirty: false, updated: NOW - 400 * DAY, lastSync: NOW - 400 * DAY });
    // Членство гостя в ЧУЖОЙ группе и подсказка аудитории у другого; рядом — те же следы
    // ЖИВОГО гостя (young-guest из шага 2): обход обязан удалять по списку умерших, а не всё.
    await db.doc('users/host/groups/circle/members/full-guest').set({ added: NOW - 9 * DAY });
    await db.doc('users/host/groups/circle/members/young-guest').set({ added: NOW - 1 * DAY });
    await db.doc('users/host/audience/full-guest').set({ buckets: ['friends'] });
    await db.doc('users/host/audience/young-guest').set({ buckets: ['friends'] });
    // Дружбы обеих сторон пары (id = min_max, schema.ts → friendshipId).
    await db.doc('friendships/full-guest_host').set({
      a: 'full-guest', b: 'host', requestedBy: 'full-guest', status: 'accepted',
      created: NOW - 9 * DAY, acceptedAt: NOW - 9 * DAY,
    });
    await db.doc('friendships/host_young-guest').set({
      a: 'host', b: 'young-guest', requestedBy: 'young-guest', status: 'accepted',
      created: NOW - 1 * DAY, acceptedAt: NOW - 1 * DAY,
    });
    // Заявка на измерение — обезличивается, не удаляется (В11 = А).
    await db.doc('suggestions/from-full-guest').set({
      authorUid: 'full-guest', title: 'Одиссея', created: NOW - 9 * DAY,
    });
    // Фотографии: путь клиента (src/lib/data/avatar.ts, наследие 1.x).
    await bucket.file('users/full-guest/avatar/avatar.webp').save(Buffer.from('dead-guest-photo'));
    await bucket.file('users/young-guest/avatar/avatar.webp').save(Buffer.from('alive-guest-photo'));

    removed = await cleanupStaleGuests(NOW);
  });

  test('свои документы гостя удалены: точка, оценки, топ, users-дерево', async () => {
    for (const path of [
      'points/full-guest',
      'points/full-guest/dims/calm',
      'relations/full-guest',
      'users/full-guest',
    ]) {
      assert.equal((await db.doc(path).get()).exists, false, `${path} должен быть удалён`);
    }
  });

  test('членство в чужой группе и подсказка аудитории удалены', async () => {
    assert.equal((await db.doc('users/host/groups/circle/members/full-guest').get()).exists, false);
    assert.equal((await db.doc('users/host/audience/full-guest').get()).exists, false);
  });

  test('дружба удалена — у живого друга не висит несуществующий человек', async () => {
    assert.equal((await db.doc('friendships/full-guest_host').get()).exists, false);
  });

  test('заявка обезличена, а не удалена (В11 = А): вклад остаётся, связка с человеком — нет', async () => {
    const suggestion = await db.doc('suggestions/from-full-guest').get();
    assert.equal(suggestion.exists, true, 'заявка обязана пережить автора');
    assert.equal(suggestion.data().authorUid, null);
    assert.equal(suggestion.data().anonymizedAt, NOW);
  });

  test('фотография в Storage удалена', async () => {
    const [exists] = await bucket.file('users/full-guest/avatar/avatar.webp').exists();
    assert.equal(exists, false, 'файл фотографии не должен пережить хозяина');
  });

  test('учётная запись Auth удалена последним следом', async () => {
    await assert.rejects(
      getAuth().getUser('full-guest'),
      (error) => error.code === 'auth/user-not-found',
    );
  });

  test('🔒 следы ЖИВОГО гостя не задеты: членство, подсказка, дружба, фото, учётка', async () => {
    assert.equal((await db.doc('users/host/groups/circle/members/young-guest').get()).exists, true);
    assert.equal((await db.doc('users/host/audience/young-guest').get()).exists, true);
    assert.equal((await db.doc('friendships/host_young-guest').get()).exists, true);
    const [exists] = await bucket.file('users/young-guest/avatar/avatar.webp').exists();
    assert.equal(exists, true);
    assert.equal((await getAuth().getUser('young-guest')).uid, 'young-guest');
  });

  test('🔒 хозяин следов невредим', async () => {
    assert.equal((await db.doc('points/host').get()).exists, true);
    assert.equal((await getAuth().getUser('host')).uid, 'host');
  });

  test('счёт честный: умер ровно один', async () => {
    assert.equal(removed, 1);
  });

  test('бакеты контуров — зеркало storageBucket из src/lib/firebase.ts (истина у клиента)', async () => {
    const source = await readFile(new URL('../src/lib/firebase.ts', import.meta.url), 'utf8');
    for (const [project, bucketName] of Object.entries(CONTOUR_BUCKETS)) {
      assert.ok(
        source.includes(`'${bucketName}'`),
        `бакет ${bucketName} (проект ${project}) не найден в src/lib/firebase.ts — зеркала разъехались`,
      );
    }
  });
});

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

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST не задан. Запускай через `npm run test:sync`.');
}

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('FIREBASE_AUTH_EMULATOR_HOST не задан: отбор кандидатов идёт через Auth (plans/63 шаг 2).');
}

// СВОЙ проект = своя база: `node --test` гоняет файлы параллельно, а мы удаляем гостей.
process.env.FIREBASE_PROJECT_ID = 'demo-ndim-guest-death';

const { cleanupStaleGuests } = await import('./index.mjs');
const { getFirestore } = await import('firebase-admin/firestore');
const { getAuth } = await import('firebase-admin/auth');

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
    // проверяет уборку по-настоящему, а не через пустой список.
    await seedAccount('doomed', CLEANUP_START - 200 * DAY);
    await seedGuest('doomed', CLEANUP_START - 200 * DAY);
  });

  after(async () => {
    // Учётка doomed — след этого describe (его Firestore-следы унесла сама уборка, а
    // deleteUser принадлежит шагу 3): убираем, чтобы не искажать счёт кандидатов соседям.
    await getAuth().deleteUser('doomed');
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

  test('учётная запись истёкшего пока ЖИВА — её удаление принадлежит шагу 3 (перечень следов)', async () => {
    // Фиксирует границу шага: deleteUser стоит в шаге 3 ПОСЛЕДНИМ из следов. Когда шаг 3
    // будет сделан, это ожидание перевернётся на user-not-found.
    const user = await getAuth().getUser('expired-guest');
    assert.equal(user.uid, 'expired-guest');
  });
});

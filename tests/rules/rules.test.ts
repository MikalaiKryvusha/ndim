/**
 * Тесты правил безопасности Firestore на эмуляторе.
 *
 * ⚠️ ЗДЕСЬ ПРОВЕРЯЮТСЯ ОТКАЗЫ, А НЕ РАЗРЕШЕНИЯ.
 * Сломанное разрешение видно сразу: приложение перестаёт работать. Сломанный отказ не виден
 * никогда — до того дня, когда кто-то прочитает чужую дату рождения. Поэтому «нельзя» здесь
 * важнее, чем «можно», и тестов на отказ больше.
 *
 * Запуск: npm run test:rules  (поднимает эмулятор, Java обязательна)
 * Правила: firestore.rules · Модель: researches/04_data_model_2x_proposal.md
 */

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, increment, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

import { TECH_TAG } from '../../src/lib/model/schema.ts';

const PROJECT_ID = 'ndim-rules-test';

/**
 * Адрес эмулятора берём из окружения: `firebase emulators:exec` выставляет
 * `FIRESTORE_EMULATOR_HOST` вида `127.0.0.1:8181`. Так тест не знает про порт и переживёт
 * его смену в `firebase.json` (8080 на машине владельца занят llama-swap).
 */
function emulatorAddress(): { host: string; port: number } {
  const fromEnv = process.env.FIRESTORE_EMULATOR_HOST;
  if (!fromEnv) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST не задан. Запускай тесты правил через `npm run test:rules` — ' +
        'он поднимает эмулятор. Прямой `node --test` их не выполнит.',
    );
  }

  const [host, port] = fromEnv.split(':');
  return { host: host!, port: Number(port) };
}

const ALICE = 'alice';
const BOB = 'bob';
const EVE = 'eve';
const GHOST = 'ghost'; // гость — анонимный вход (plans/03, этап 2)
const GROUP_WORK = 'g_work';

let testEnv: RulesTestEnvironment;

/** Подтверждённая почта — минимальный порог доступа к чему-либо о других людях. */
const verified = (uid: string) => testEnv.authenticatedContext(uid, { email_verified: true });
/** Вошёл, но почту не подтвердил. */
const unverified = (uid: string) => testEnv.authenticatedContext(uid, { email_verified: false });
const anonymous = () => testEnv.unauthenticatedContext();
const admin = (uid: string) =>
  testEnv.authenticatedContext(uid, { email_verified: true, admin: true });
/** Гость — Firebase Anonymous Auth: у токена firebase.sign_in_provider == 'anonymous'. */
const guest = (uid: string) =>
  testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } });

before(async () => {
  const { host, port } = emulatorAddress();

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

/** Готовит данные в обход правил — так задаётся исходное состояние мира. */
async function seed(write: (db: any) => Promise<void>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await write(context.firestore());
  });
}

/** Алиса открыла свойство публично, друзьям и своей группе «работа». */
async function seedAliceProfile(): Promise<void> {
  await seed(async (db) => {
    await setDoc(doc(db, 'users/alice/profile/everyone'), { avatar: true });
    await setDoc(doc(db, 'users/alice/profile/friends'), { born: { year: 1985 } });
    await setDoc(doc(db, `users/alice/profile/${GROUP_WORK}`), { about: { ru: 'о работе' } });
    await setDoc(doc(db, 'users/alice/profile/private'), { gender: 'm' });
  });
}

/** Подтверждённая дружба Алисы и Боба. */
async function seedFriendship(status: 'pending' | 'accepted', requestedBy = BOB): Promise<void> {
  await seed(async (db) => {
    await setDoc(doc(db, 'friendships/alice_bob'), {
      a: ALICE,
      b: BOB,
      requestedBy,
      status,
      created: 1,
      acceptedAt: status === 'accepted' ? 2 : null,
    });
  });
}

/** Алиса положила Боба в свою группу «работа». */
async function seedGroupMembership(memberUid: string): Promise<void> {
  await seed(async (db) => {
    await setDoc(doc(db, `users/alice/groups/${GROUP_WORK}`), { name: 'Работа', memberCount: 1, created: 1 });
    await setDoc(doc(db, `users/alice/groups/${GROUP_WORK}/members/${memberUid}`), { added: 1 });
  });
}

// ────────────────────────────────────────────────────────────────────────────

describe('Публичный бакет profile/everyone', () => {
  beforeEach(seedAliceProfile);

  test('подтверждённый пользователь читает — на этом держится список связей', async () => {
    const db = verified(BOB).firestore();
    await assertSucceeds(getDoc(doc(db, 'users/alice/profile/everyone')));
  });

  test('🔒 анонимный не читает', async () => {
    const db = anonymous().firestore();
    await assertFails(getDoc(doc(db, 'users/alice/profile/everyone')));
  });

  test('🔒 неподтверждённая почта не читает', async () => {
    const db = unverified(BOB).firestore();
    await assertFails(getDoc(doc(db, 'users/alice/profile/everyone')));
  });

  test('🔒 посторонний не пишет в чужой публичный бакет', async () => {
    const db = verified(EVE).firestore();
    await assertFails(setDoc(doc(db, 'users/alice/profile/everyone'), { avatar: false }));
  });
});

describe('Бакет profile/friends — только при подтверждённой дружбе', () => {
  beforeEach(seedAliceProfile);

  test('🔒 незнакомец не читает', async () => {
    const db = verified(EVE).firestore();
    await assertFails(getDoc(doc(db, 'users/alice/profile/friends')));
  });

  test('🔒 запрос дружбы в статусе pending НЕ даёт доступа', async () => {
    // Иначе достаточно было бы отправить запрос кому угодно, чтобы прочитать его данные.
    await seedFriendship('pending');
    const db = verified(BOB).firestore();
    await assertFails(getDoc(doc(db, 'users/alice/profile/friends')));
  });

  test('подтверждённый друг читает', async () => {
    await seedFriendship('accepted');
    const db = verified(BOB).firestore();
    await assertSucceeds(getDoc(doc(db, 'users/alice/profile/friends')));
  });

  test('🔒 чужая подтверждённая дружба не даёт доступа третьему', async () => {
    await seedFriendship('accepted');
    const db = verified(EVE).firestore();
    await assertFails(getDoc(doc(db, 'users/alice/profile/friends')));
  });
});

describe('Бакет группы — только для тех, кого владелец в неё положил', () => {
  beforeEach(seedAliceProfile);

  test('🔒 незнакомец не читает бакет группы', async () => {
    const db = verified(EVE).firestore();
    await assertFails(getDoc(doc(db, `users/alice/profile/${GROUP_WORK}`)));
  });

  test('участник группы читает', async () => {
    await seedGroupMembership(BOB);
    const db = verified(BOB).firestore();
    await assertSucceeds(getDoc(doc(db, `users/alice/profile/${GROUP_WORK}`)));
  });

  test('🔒 членство в группе Алисы не даёт доступа к бакету Боба', async () => {
    await seedGroupMembership(BOB);
    await seed(async (db) => {
      await setDoc(doc(db, `users/bob/profile/${GROUP_WORK}`), { about: { ru: 'секрет Боба' } });
    });

    const db = verified(BOB).firestore();
    const eveDb = verified(EVE).firestore();
    await assertSucceeds(getDoc(doc(db, `users/alice/profile/${GROUP_WORK}`)));
    await assertFails(getDoc(doc(eveDb, `users/bob/profile/${GROUP_WORK}`)));
  });

  test('🔒 дружба не даёт доступа к бакету группы', async () => {
    // Аудитории независимы: друг — не автоматически коллега.
    await seedFriendship('accepted');
    const db = verified(BOB).firestore();
    await assertFails(getDoc(doc(db, `users/alice/profile/${GROUP_WORK}`)));
  });
});

describe('Бакет profile/private — не видит никто, кроме владельца', () => {
  beforeEach(seedAliceProfile);

  test('владелец читает', async () => {
    const db = verified(ALICE).firestore();
    await assertSucceeds(getDoc(doc(db, 'users/alice/profile/private')));
  });

  test('🔒 подтверждённый друг не читает', async () => {
    await seedFriendship('accepted');
    const db = verified(BOB).firestore();
    await assertFails(getDoc(doc(db, 'users/alice/profile/private')));
  });

  test('🔒 членство в группе с именем private не открывает приватный бакет', async () => {
    // Попытка обойти правило, создав группу с зарезервированным идентификатором.
    await seed(async (db) => {
      await setDoc(doc(db, 'users/alice/groups/private'), { name: 'обход', memberCount: 1, created: 1 });
      await setDoc(doc(db, 'users/alice/groups/private/members/eve'), { added: 1 });
    });

    const db = verified(EVE).firestore();
    await assertFails(getDoc(doc(db, 'users/alice/profile/private')));
  });

  test('🔒 группа с именем friends не подменяет проверку дружбы', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users/alice/groups/friends/members/eve'), { added: 1 });
    });

    const db = verified(EVE).firestore();
    await assertFails(getDoc(doc(db, 'users/alice/profile/friends')));
  });
});

describe('Группы владельца приватны', () => {
  beforeEach(() => seedGroupMembership(BOB));

  test('владелец читает свою группу', async () => {
    const db = verified(ALICE).firestore();
    await assertSucceeds(getDoc(doc(db, `users/alice/groups/${GROUP_WORK}`)));
  });

  test('🔒 участник НЕ знает, в какой он группе', async () => {
    // Человек не должен узнать, что его положили в круг «Бывшие».
    const db = verified(BOB).firestore();
    await assertFails(getDoc(doc(db, `users/alice/groups/${GROUP_WORK}`)));
  });

  test('🔒 участник не видит состав группы', async () => {
    const db = verified(BOB).firestore();
    await assertFails(getDoc(doc(db, `users/alice/groups/${GROUP_WORK}/members/${BOB}`)));
  });

  test('🔒 посторонний не может добавить себя в чужую группу', async () => {
    const db = verified(EVE).firestore();
    await assertFails(setDoc(doc(db, `users/alice/groups/${GROUP_WORK}/members/eve`), { added: 1 }));
  });
});

describe('Корень users/{uid} и карта видимости', () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users/alice'), {
        visibility: { about: [] },
        settings: { language: 'ru' },
        time: { created: 1, updated: 1, lastSignIn: 1 },
        groupCount: 1,
      });
    });
  });

  test('владелец читает свой корень', async () => {
    const db = verified(ALICE).firestore();
    await assertSucceeds(getDoc(doc(db, 'users/alice')));
  });

  test('🔒 никто другой не читает карту видимости — она сама приватна', async () => {
    for (const context of [verified(BOB), verified(EVE), anonymous()]) {
      await assertFails(getDoc(doc(context.firestore(), 'users/alice')));
    }
  });
});

describe('Подсказка audience/{viewerUid}', () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users/alice/audience/bob'), { buckets: ['friends', GROUP_WORK] });
      await setDoc(doc(db, 'users/alice/audience/eve'), { buckets: [GROUP_WORK] });
    });
  });

  test('зритель читает подсказку про себя', async () => {
    const db = verified(BOB).firestore();
    await assertSucceeds(getDoc(doc(db, 'users/alice/audience/bob')));
  });

  test('🔒 зритель не читает подсказку про другого — иначе узнал бы состав групп', async () => {
    const db = verified(BOB).firestore();
    await assertFails(getDoc(doc(db, 'users/alice/audience/eve')));
  });

  test('🔒 подсказка не даёт прав: подделать её нельзя, пишет только владелец', async () => {
    const db = verified(EVE).firestore();
    await assertFails(setDoc(doc(db, 'users/alice/audience/eve'), { buckets: ['private'] }));
  });

  test('🔒 даже настоящая подсказка не открывает бакет без членства', async () => {
    // Ева числится в подсказке, но в группу её никто не клал. Правило проверяет членство, не подсказку.
    await seedAliceProfile();
    const db = verified(EVE).firestore();
    await assertFails(getDoc(doc(db, `users/alice/profile/${GROUP_WORK}`)));
  });
});

describe('Дружба: взаимное согласие обеспечивается правилами', () => {
  test('любой из двоих создаёт запрос со статусом pending', async () => {
    const db = verified(BOB).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'friendships/alice_bob'), {
        a: ALICE,
        b: BOB,
        requestedBy: BOB,
        status: 'pending',
        created: 1,
        acceptedAt: null,
      }),
    );
  });

  test('🔒 нельзя создать запрос сразу принятым', async () => {
    const db = verified(BOB).firestore();
    await assertFails(
      setDoc(doc(db, 'friendships/alice_bob'), {
        a: ALICE,
        b: BOB,
        requestedBy: BOB,
        status: 'accepted',
        created: 1,
        acceptedAt: 2,
      }),
    );
  });

  test('🔒 нельзя создать запрос от чужого имени', async () => {
    const db = verified(EVE).firestore();
    await assertFails(
      setDoc(doc(db, 'friendships/alice_bob'), {
        a: ALICE,
        b: BOB,
        requestedBy: BOB,
        status: 'pending',
        created: 1,
        acceptedAt: null,
      }),
    );
  });

  test('🔒 идентификатор документа обязан совпадать с парой', async () => {
    const db = verified(BOB).firestore();
    await assertFails(
      setDoc(doc(db, 'friendships/подставной_путь'), {
        a: ALICE,
        b: BOB,
        requestedBy: BOB,
        status: 'pending',
        created: 1,
        acceptedAt: null,
      }),
    );
  });

  test('адресат принимает запрос', async () => {
    await seedFriendship('pending', BOB);
    const db = verified(ALICE).firestore();
    await assertSucceeds(updateDoc(doc(db, 'friendships/alice_bob'), { status: 'accepted', acceptedAt: 2 }));
  });

  test('🔒 отправитель НЕ может принять свой собственный запрос', async () => {
    // Иначе «дружба» получалась бы в одностороннем порядке — и открывала бы данные.
    await seedFriendship('pending', BOB);
    const db = verified(BOB).firestore();
    await assertFails(updateDoc(doc(db, 'friendships/alice_bob'), { status: 'accepted', acceptedAt: 2 }));
  });

  test('🔒 посторонний не может принять чужой запрос', async () => {
    await seedFriendship('pending', BOB);
    const db = verified(EVE).firestore();
    await assertFails(updateDoc(doc(db, 'friendships/alice_bob'), { status: 'accepted', acceptedAt: 2 }));
  });

  test('🔒 принявший не может переписать, кто отправлял запрос', async () => {
    await seedFriendship('pending', BOB);
    const db = verified(ALICE).firestore();
    await assertFails(
      updateDoc(doc(db, 'friendships/alice_bob'), { status: 'accepted', requestedBy: ALICE, acceptedAt: 2 }),
    );
  });

  test('🔒 принявший не может переписать дату создания запроса (bugs/99)', async () => {
    // Комментарий правила всегда обещал «принявший не может переписать историю» —
    // до аудита 2026-07-31 он держался только для requestedBy, а created был переписываем.
    await seedFriendship('pending', BOB);
    const db = verified(ALICE).firestore();
    await assertFails(
      updateDoc(doc(db, 'friendships/alice_bob'), { status: 'accepted', acceptedAt: 2, created: 0 }),
    );
  });

  test('🔒 посторонние поля не вкладываются ни при создании, ни при принятии (bugs/99)', async () => {
    const create = verified(BOB).firestore();
    await assertFails(
      setDoc(doc(create, 'friendships/alice_bob'), {
        a: ALICE,
        b: BOB,
        requestedBy: BOB,
        status: 'pending',
        created: 1,
        acceptedAt: null,
        extra: 'мусор',
      }),
    );

    await seedFriendship('pending', BOB);
    const accept = verified(ALICE).firestore();
    await assertFails(
      updateDoc(doc(accept, 'friendships/alice_bob'), { status: 'accepted', acceptedAt: 2, extra: 'мусор' }),
    );
  });

  test('🔒 посторонний не читает чужую дружбу', async () => {
    await seedFriendship('accepted');
    const db = verified(EVE).firestore();
    await assertFails(getDoc(doc(db, 'friendships/alice_bob')));
  });

  test('любой из двоих может расторгнуть дружбу', async () => {
    await seedFriendship('accepted');
    const db = verified(BOB).firestore();
    await assertSucceeds(deleteDoc(doc(db, 'friendships/alice_bob')));
  });

  test('🔒 посторонний не может расторгнуть чужую дружбу', async () => {
    await seedFriendship('accepted');
    const db = verified(EVE).firestore();
    await assertFails(deleteDoc(doc(db, 'friendships/alice_bob')));
  });
});

describe('Оценки по осям — не видит никто, кроме владельца', () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'points/alice'), { dirty: false, updated: 1, lastSync: 1 });
      await setDoc(doc(db, 'points/alice/dims/calm'), { value: 7 });
    });
  });

  test('владелец читает свои оценки', async () => {
    const db = verified(ALICE).firestore();
    await assertSucceeds(getDoc(doc(db, 'points/alice/dims/calm')));
  });

  test('🔒 подтверждённый друг НЕ видит оценок — только общий результат', async () => {
    await seedFriendship('accepted');
    const db = verified(BOB).firestore();
    await assertFails(getDoc(doc(db, 'points/alice/dims/calm')));
  });

  test('🔒 админ НЕ читает чужие оценки — админ не исключение (bugs/100)', async () => {
    // Интервью №002 В4 и ideas/13 дословно: «оценки не видит никто, кроме тебя и
    // сервера синхронизации», «админ не исключение». isAdmin() в points стоял с первого коммита
    // правил вопреки его же описанию и убран аудитом 2026-07-31.
    const db = admin('root').firestore();
    await assertFails(getDoc(doc(db, 'points/alice')));
    await assertFails(getDoc(doc(db, 'points/alice/dims/calm')));
  });

  test('🔒 посторонний не пишет чужие оценки', async () => {
    const db = verified(EVE).firestore();
    await assertFails(setDoc(doc(db, 'points/alice/dims/calm'), { value: 0 }));
  });

  test('оценка 0…10 принимается', async () => {
    const db = verified(ALICE).firestore();
    for (const value of [0, 5, 10]) {
      await assertSucceeds(setDoc(doc(db, 'points/alice/dims/calm'), { value }));
    }
  });

  test('🔒 оценка вне 0…10 отвергается', async () => {
    const db = verified(ALICE).firestore();
    for (const value of [-1, 11, 100]) {
      await assertFails(setDoc(doc(db, 'points/alice/dims/calm'), { value }));
    }
  });

  test('🔒 дробная оценка отвергается', async () => {
    const db = verified(ALICE).firestore();
    await assertFails(setDoc(doc(db, 'points/alice/dims/calm'), { value: 5.5 }));
  });

  test('🔒 лишние поля в документе оси отвергаются', async () => {
    const db = verified(ALICE).firestore();
    await assertFails(setDoc(doc(db, 'points/alice/dims/calm'), { value: 5, secret: 'x' }));
  });

  test('🔒 клиент не может снять флаг dirty — это работа сервера синхронизации', async () => {
    const db = verified(ALICE).firestore();
    await assertFails(setDoc(doc(db, 'points/alice'), { dirty: false, updated: 2, lastSync: 2 }));
    await assertSucceeds(setDoc(doc(db, 'points/alice'), { dirty: true, updated: 2, lastSync: 1 }));
  });

  /*
   * bugs/153 — БЕЛЫЙ СПИСОК ПОЛЕЙ ТОЧКИ.
   *
   * `firstSeen` ставит сервер синхронизации, и на нём держится окно новичка: пока отметка
   * молода, человека считают КАЖДЫЙ цикл вне очереди. Пока правила не ограничивали набор
   * полей, клиент переписывал её сам и оставался новичком навсегда — привилегия была
   * подделываемой, а платил за неё проект (эпик 60).
   *
   * У ПОДКОЛЛЕКЦИИ оценок такая защита стояла с самого начала («лишние поля в документе оси
   * отвергаются», выше). У родительского документа её не было — асимметрия, а не замысел.
   */
  test('🔒 клиент не может подделать firstSeen — это поле сервера синхронизации (bugs/153)', async () => {
    const db = verified(ALICE).firestore();
    await assertFails(
      setDoc(doc(db, 'points/alice'), { dirty: true, updated: 2, firstSeen: 2 }, { merge: true }),
    );
  });

  /*
   * `plans/62` шаг 1 — СЧЁТЧИК ЭСКОРТА НОВИЧКА ЖИВЁТ ЗДЕСЬ ЖЕ, И ЭТО ЕГО ЗАМОК.
   *
   * Место хранения выбрано в том числе потому, что белый список уже закрывает документ точки
   * от клиента (`bugs/153`). Но «уже закрывает» — утверждение о СЕГОДНЯШНЕМ наборе полей;
   * названный тест делает его утверждением о ПОЛЕ. Без него правку белого списка ничто не
   * связывает с эскортом, и расширение набора однажды вернуло бы привилегию клиенту молча.
   *
   * Подделка стоит дорого и стоит конкретно: `escortRuns` = 0 у себя означает вечный эскорт,
   * то есть пересчёт вне очереди на каждой оценке — ровно та бесконечная привилегия, ради
   * отмены которой заведена фаза (интервью №040 В1: «после трёх пересчётов — эскорт
   * прекращаем»).
   */
  test('🔒 клиент не может подделать счётчик эскорта новичка (plans/62)', async () => {
    const db = verified(ALICE).firestore();
    await assertFails(
      setDoc(doc(db, 'points/alice'), { dirty: true, updated: 2, escortRuns: 0 }, { merge: true }),
    );
    await assertFails(
      setDoc(
        doc(db, 'points/alice'),
        { dirty: true, updated: 2, escortLastAt: 2 },
        { merge: true },
      ),
    );
  });

  test('оценка проходит и на точке, где счётчик эскорта уже стоит (plans/62)', async () => {
    // Обратная сторона замка: закрыв поле, легко закрыть и законную запись рядом с ним.
    // Слияние показывает правилам документ ЦЕЛИКОМ — вместе с полями эскорта, которых запись
    // не касалась. Без этого теста «нельзя» было бы доказано, а «можно» — нет.
    await seed(async (db) => {
      await setDoc(doc(db, 'points/alice'), {
        dirty: false,
        updated: 1,
        lastSync: 1,
        firstSeen: 1,
        escortRuns: 2, // ← поставил сервер синхронизации
        escortLastAt: 1,
      });
    });
    const db = verified(ALICE).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'points/alice'), { dirty: true, updated: 2, lastSync: null }, { merge: true }),
    );
  });

  test('🔒 произвольные поля в документе точки отвергаются (bugs/153)', async () => {
    const db = verified(ALICE).firestore();
    await assertFails(
      setDoc(doc(db, 'points/alice'), { dirty: true, updated: 2, escort: 3 }, { merge: true }),
    );
    // И на СОЗДАНИИ тоже: у Боба точки нет, путь документа — его собственный uid.
    const bob = verified(BOB).firestore();
    await assertFails(setDoc(doc(bob, 'points/bob'), { dirty: true, updated: 2, мусор: 'x' }));
  });

  test('🔒 клиент не может стереть серверное поле, записав документ без него (bugs/153)', async () => {
    // Отметку кладём здесь, а не полагаемся на общий сид: сид точки её не содержит, и без этой
    // строки тест был бы зелёным потому, что стирать оказалось нечего.
    await seed(async (db) => {
      await setDoc(doc(db, 'points/alice'), { dirty: false, updated: 1, lastSync: 1, firstSeen: 1 });
    });
    const db = verified(ALICE).firestore();
    // Запись БЕЗ merge затирает документ целиком — вместе с `firstSeen`, который поставил
    // сервер. Для правил это тоже изменение серверного поля, и оно должно быть отвергнуто.
    await assertFails(setDoc(doc(db, 'points/alice'), { dirty: true, updated: 2 }));
  });

  /*
   * 🔑 ОБРАТНАЯ СТОРОНА БЕЛОГО СПИСКА, без которой он опасен: закрыв лишнее, легко закрыть и
   * нужное. Клиент пишет точку через `set(..., { merge: true })`, и при слиянии правила видят
   * документ ЦЕЛИКОМ — вместе с `firstSeen`, которого запись не касалась. Проверка по итоговым
   * ключам отвергла бы законное сохранение оценки у КАЖДОГО, кому сервер уже проставил отметку.
   */
  test('законная оценка проходит и после белого списка — даже когда сервер уже ставил firstSeen', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'points/alice'), {
        dirty: false,
        updated: 1,
        lastSync: 1,
        firstSeen: 1, // ← отметка сервера синхронизации, лежит в документе
      });
    });
    const db = verified(ALICE).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'points/alice'), { dirty: true, updated: 2, lastSync: null }, { merge: true }),
    );
  });

  test('первая оценка СОЗДАЁТ точку и после белого списка', async () => {
    // Путь документа — это uid, поэтому «новый человек» здесь Боб, а не выдуманный путь Алисы:
    // чужой путь отверг бы `isSelf`, и тест был бы зелёным по НЕВЕРНОЙ причине.
    const db = verified(BOB).firestore();
    await assertSucceeds(setDoc(doc(db, 'points/bob'), { dirty: true, updated: 2, lastSync: null }));
  });
});

describe('Связи — приватны и неприкосновенны', () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'relations/alice'), { computedAt: 1, version: 1, top: [] });
    });
  });

  test('владелец читает свои связи', async () => {
    const db = verified(ALICE).firestore();
    await assertSucceeds(getDoc(doc(db, 'relations/alice')));
  });

  test('🔒 никто другой не читает чужие связи — похожесть приватна', async () => {
    await seedFriendship('accepted');
    for (const context of [verified(BOB), verified(EVE)]) {
      await assertFails(getDoc(doc(context.firestore(), 'relations/alice')));
    }
  });

  test('🔒 даже владелец не может писать свои связи', async () => {
    // Иначе человек объявил бы себя похожим на кого угодно. Пишет только сервер синхронизации (Admin SDK).
    const db = verified(ALICE).firestore();
    await assertFails(setDoc(doc(db, 'relations/alice'), { computedAt: 2, version: 2, top: [] }));
  });
});

/*
 * Удаление аккаунта (эпик `plans/15`, фаза 8). Каскад делает КЛИЕНТ — значит правила обязаны
 * его пускать в своё и не пускать в чужое. Ровно эта пара и проверяется.
 *
 * Отказы стоят ПЕРВЫМИ и их больше: разрешение видно по работающему продукту, а запрет не
 * виден никогда — пока его не сломают.
 */
describe('Удаление аккаунта — каждый сносит только своё', () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users/alice'), { visibility: {} });
      await setDoc(doc(db, 'users/alice/profile/everyone'), { name: 'Алиса' });
      await setDoc(doc(db, 'users/alice/audience/bob'), { buckets: ['friends'] });
      await setDoc(doc(db, 'users/alice/groups/g1'), { title: 'Друзья' });
      await setDoc(doc(db, 'users/alice/groups/g1/members/bob'), { added: 1 });
      await setDoc(doc(db, 'points/alice'), { dirty: false, updated: 1, lastSync: 1 });
      await setDoc(doc(db, 'points/alice/dims/calm'), { value: 7 });
      await setDoc(doc(db, 'relations/alice'), { computedAt: 1, version: 1, top: [] });
    });
  });

  // ── 🔒 ОТКАЗЫ ──────────────────────────────────────────────────────────────
  test('🔒 чужой корневой документ снести нельзя', async () => {
    await assertFails(deleteDoc(doc(verified(BOB).firestore(), 'users/alice')));
  });

  test('🔒 чужие бакеты, подсказки и группы снести нельзя', async () => {
    const db = verified(BOB).firestore();
    for (const path of [
      'users/alice/profile/everyone',
      'users/alice/audience/bob', // ⚠️ подсказка ПРО Боба, но в дереве Алисы — и это её документ
      'users/alice/groups/g1',
      'users/alice/groups/g1/members/bob',
    ]) {
      await assertFails(deleteDoc(doc(db, path)));
    }
  });

  test('🔒 чужую точку и чужие оценки снести нельзя', async () => {
    const db = verified(BOB).firestore();
    await assertFails(deleteDoc(doc(db, 'points/alice')));
    await assertFails(deleteDoc(doc(db, 'points/alice/dims/calm')));
  });

  test('🔒 свой топ связей не сносит даже владелец — это работа сервера синхронизации', async () => {
    // Клиенту запись в relations запрещена ПОЛНОСТЬЮ, и удаление — тоже запись.
    // Отсюда и вся серверная уборка следов (`sync-server/cleanupDeletedPeople`).
    await assertFails(deleteDoc(doc(verified(ALICE).firestore(), 'relations/alice')));
  });

  // ── ✓ РАЗРЕШЕНИЯ: без них каскад невозможен, и «зелёные отказы» ничего не стоили бы ──
  test('владелец сносит всё своё: документ, бакеты, подсказки, группы, точку, оценки', async () => {
    const db = verified(ALICE).firestore();
    for (const path of [
      'users/alice/profile/everyone',
      'users/alice/audience/bob',
      'users/alice/groups/g1/members/bob',
      'users/alice/groups/g1',
      'points/alice/dims/calm',
      'points/alice',
      'users/alice',
    ]) {
      await assertSucceeds(deleteDoc(doc(db, path)));
    }
  });
});

describe('Оси и заявки на них', () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'dims/calm'), { title: { ru: 'Спокойствие' }, stars: 10, rates: 2, rating: 5 });
    });
  });

  test('подтверждённый пользователь читает оси', async () => {
    const db = verified(BOB).firestore();
    await assertSucceeds(getDoc(doc(db, 'dims/calm')));
  });

  test('🔒 не вошедший и неподтверждённый оси не читают — каталог не публичен', async () => {
    // Порог остался прежним; гость — единственное добавленное исключение (plans/03).
    await assertFails(getDoc(doc(anonymous().firestore(), 'dims/calm')));
    await assertFails(getDoc(doc(unverified(BOB).firestore(), 'dims/calm')));
  });

  test('🔒 обычный пользователь не правит оси', async () => {
    const db = verified(BOB).firestore();
    await assertFails(setDoc(doc(db, 'dims/calm'), { title: { ru: 'взлом' }, stars: 0, rates: 0, rating: 0 }));
  });

  test('админ правит оси', async () => {
    const db = admin('root').firestore();
    // 🔧 Фикстура дополнена английским названием 2026-08-17 (`plans/44` шаг 1): правила
    // каталога стали проверять ГРАНИЦЫ, и название теперь обязано быть на оба языка —
    // без него измерение не попадает в индекс каталога и человек не видит его вовсе.
    // Предмет теста не изменился: он о ПРАВЕ админа, а не о форме записи; форму стерегут
    // отдельные тесты ниже («Каталог измерений — границы записи»).
    await assertSucceeds(
      setDoc(doc(db, 'dims/calm'), {
        title: { ru: 'Спокойствие', en: 'Calm' },
        stars: 1,
        rates: 1,
        rating: 1,
      }),
    );
  });

  test('пользователь предлагает новую ось', async () => {
    const db = verified(BOB).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'suggestions/s1'), { authorUid: BOB, description: 'Люблю тишину', created: 1 }),
    );
  });

  test('🔒 заявка от чужого имени отвергается', async () => {
    const db = verified(EVE).firestore();
    await assertFails(
      setDoc(doc(db, 'suggestions/s1'), { authorUid: BOB, description: 'Люблю тишину', created: 1 }),
    );
  });

  test('🔒 слишком короткая и слишком длинная заявка отвергаются', async () => {
    const db = verified(BOB).firestore();
    await assertFails(setDoc(doc(db, 'suggestions/s1'), { authorUid: BOB, description: 'ох', created: 1 }));
    await assertFails(
      setDoc(doc(db, 'suggestions/s2'), { authorUid: BOB, description: 'x'.repeat(301), created: 1 }),
    );
  });

  test('🔒 автор не читает даже свою заявку — их разбирает админ', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'suggestions/s1'), { authorUid: BOB, description: 'Люблю тишину', created: 1 });
    });

    const db = verified(BOB).firestore();
    await assertFails(getDoc(doc(db, 'suggestions/s1')));
  });
});

describe('Каталог измерений — границы записи (plans/44 шаг 1)', () => {
  /*
   * ПОЧЕМУ ГРАНИЦЫ, А НЕ ТОЛЬКО ПРАВО. Каталог — 5111 записей труда владельца и лицо
   * продукта на 10 222 публичных страницах. Право писать сюда стояло с первого коммита
   * правил (`allow write: if isAdmin()`), а вот ФОРМУ не стерёг никто: измерение без
   * названия молча не попадает в индекс каталога, и человек не видит его вовсе.
   *
   * Все ожидания ниже сняты ЗОНДОМ по боевой базе 2026-08-17, а не выведены из плана:
   * `year` — строка у всех 5111 (у восьми это диапазон), `title` заполнен на оба языка
   * у всех 5111, `name` лежит тоже у всех 5111. Операционный план требовал «год число» —
   * замер это опроверг.
   */

  /** Валидное измерение по канону `DimDoc`. Именованный набор — чтобы отказы отличались одним полем. */
  const validDim = () => ({
    title: { ru: 'Одиссея', en: 'The Odyssey' },
    description: { ru: 'Фильм Кристофера Нолана.', en: 'A film by Christopher Nolan.' },
    type: { ru: 'Фильм', en: 'Film' },
    author: { ru: 'Кристофер Нолан', en: 'Christopher Nolan' },
    year: '2026',
    tags: ['кино', 'эпос'],
    stars: 0,
    rates: 0,
    rating: 0,
  });

  test('админ создаёт измерение по канону', async () => {
    const db = admin('root').firestore();
    await assertSucceeds(setDoc(doc(db, 'dims/odyssey'), validDim()));
  });

  test('🔒 создать измерение не может НИКТО, кроме админа', async () => {
    // Право стояло и раньше; тест держит его на месте при переписанном блоке правил.
    await assertFails(setDoc(doc(anonymous().firestore(), 'dims/odyssey'), validDim()));
    await assertFails(setDoc(doc(verified(BOB).firestore(), 'dims/odyssey'), validDim()));
    await assertFails(setDoc(doc(unverified(BOB).firestore(), 'dims/odyssey'), validDim()));
    await assertFails(setDoc(doc(guest(GHOST).firestore(), 'dims/odyssey'), validDim()));
  });

  test('🔒 в НОВОЕ измерение поле `name` не идёт (решение владельца В4 = В)', async () => {
    const db = admin('root').firestore();
    await assertFails(
      setDoc(doc(db, 'dims/odyssey'), { ...validDim(), name: { ru: 'Одиссея', en: 'The Odyssey' } }),
    );
  });

  test('правка существующего измерения С полем `name` проходит — легаси терпится до прополки', async () => {
    // 🔑 Асимметрия намеренная и она о ПОРЯДКЕ РАБОТ: `name` лежит у всех 5111 боевых
    // записей, а прополка (шаг 7) ждёт отдельного слова владельца и бэкапа. Симметричный
    // запрет заперл бы правку любого существующего измерения до прополки.
    await seed(async (db) => {
      await setDoc(doc(db, 'dims/odyssey'), { ...validDim(), name: { ru: 'Одиссея', en: 'The Odyssey' } });
    });

    const db = admin('root').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'dims/odyssey'), {
        ...validDim(),
        name: { ru: 'Одиссея', en: 'The Odyssey' },
        year: '2027',
      }),
    );
  });

  test('🔒 измерение без названия на ОБА языка отвергается — иначе его не увидит никто', async () => {
    const db = admin('root').firestore();
    const { title, ...withoutTitle } = validDim();
    await assertFails(setDoc(doc(db, 'dims/d1'), withoutTitle));
    await assertFails(setDoc(doc(db, 'dims/d2'), { ...validDim(), title: { ru: 'Одиссея' } }));
    await assertFails(setDoc(doc(db, 'dims/d3'), { ...validDim(), title: { en: 'The Odyssey' } }));
    await assertFails(setDoc(doc(db, 'dims/d4'), { ...validDim(), title: { ru: '', en: '' } }));
    await assertFails(setDoc(doc(db, 'dims/d5'), { ...validDim(), title: 'Одиссея' }));
  });

  test('🔒 поля очереди вычитки в каталог не просачиваются — это фаза 6 эпика', async () => {
    const db = admin('root').firestore();
    await assertFails(setDoc(doc(db, 'dims/odyssey'), { ...validDim(), status: 'pending' }));
    await assertFails(setDoc(doc(db, 'dims/odyssey'), { ...validDim(), wikidata: 'Q20909133' }));
    // И обычная опечатка в имени поля — тот же механизм ловит её заодно.
    await assertFails(setDoc(doc(db, 'dims/odyssey'), { ...validDim(), titel: { ru: 'x', en: 'y' } }));
  });

  /*
   * ── ТЕХНИЧЕСКИЕ ТЕГИ (`plans/58` шаг 1) ────────────────────────────────────────────────
   *
   * Асимметрия «правка ДА, создание НЕТ» — не оплошность, а смысл: тег одобрения ставит РАЗМЕТКА
   * каталога (Admin SDK, правил не касается), а не форма комнаты. Новая запись ещё никем не
   * судима, и нести тег ей неоткуда; правка же обязана его ПРОНЕСТИ — комната пишет документ
   * полной заменой, и без этого правила отвергали бы правку любого размеченного измерения,
   * то есть всего каталога после разметки.
   */
  test('🔴 правка проносит технический тег — иначе после разметки каталог станет неправимым', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'dims/odyssey'), { ...validDim(), techTags: ['migrated'] });
    });

    const db = admin('root').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'dims/odyssey'), { ...validDim(), techTags: ['migrated'], year: '2027' }),
    );
  });

  /*
   * 🔄 ЭТОТ СЛУЧАЙ ПЕРЕВЁРНУТ 2026-08-22, И ВОТ ПОЧЕМУ (обоснование правки теста).
   *
   * Он гласил «в НОВОЕ измерение технический тег не идёт»: тег ставит разметка, а не форма.
   * Владелец завёл четвёртый тег — «одобрено владельцем» (интервью №044, В4 = A) — и попросил,
   * чтобы его получали «все будущие одобренные кандидаты» автоматически. Решением Менеджера
   * (2026-08-22) штамп поставлен в `createDim`, то есть НА ОБЕИХ дверях комнаты: одобрение
   * кандидата и ручная форма — одинаково руки владельца.
   *
   * Прежний запрет не снят, а СУЖЕН до своего смысла: новая запись не имеет права объявить себя
   * «принятой миграцией» или «требующей правки» — эти три тега суть вывод разметки по своду, и
   * форме их взять неоткуда. Дверь открыта ровно на один литерал, и следующий тест это стережёт.
   */
  test('🔄 НОВОЕ измерение рождается с owner-approved — обе двери комнаты суть руки владельца', async () => {
    const db = admin('root').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'dims/odyssey'), { ...validDim(), techTags: [TECH_TAG.OWNER_APPROVED] }),
    );
  });

  test('🔒 прочие технические теги в НОВОЕ измерение не идут — их выводит разметка, а не форма', async () => {
    const db = admin('root').firestore();
    for (const tag of [TECH_TAG.MIGRATED, TECH_TAG.NEEDS_REWRITE, TECH_TAG.UNCHECKED]) {
      await assertFails(setDoc(doc(db, 'dims/odyssey'), { ...validDim(), techTags: [tag] }));
    }
    // И смесь, в которой законный тег прикрывает незаконный, — тоже отказ.
    await assertFails(
      setDoc(doc(db, 'dims/odyssey'), {
        ...validDim(),
        techTags: [TECH_TAG.OWNER_APPROVED, TECH_TAG.MIGRATED],
      }),
    );
  });

  /*
   * 🔴 ТРЕТЬЯ КОПИЯ ЛИТЕРАЛА — В САМИХ ПРАВИЛАХ, и привязать её импортом невозможно: язык правил
   * не умеет импортировать. Значит переименование тега в словаре разошлось бы с правилами МОЛЧА,
   * оставив всё зелёным: тесты выше берут значение из словаря, правила — из своего текста, и
   * разойтись они могут только в бою. Этот случай и есть привязка: он читает файл правил и
   * требует, чтобы литерал в нём совпадал со словарём.
   */
  test('🔗 литерал в firestore.rules совпадает со словарём TECH_TAG', () => {
    const rules = readFileSync('firestore.rules', 'utf8');
    assert.ok(
      rules.includes(`hasOnly(['${TECH_TAG.OWNER_APPROVED}'])`),
      `правила обязаны пускать при создании ровно «${TECH_TAG.OWNER_APPROVED}» — переименовали тег в schema.ts? перенесите и сюда`,
    );
  });

  test('🔑 новое измерение БЕЗ технического тега законно — поле не обязательное', async () => {
    // Тег не является обязательным полем документа: 5111 боевых записей живут без него до
    // разметки, и запрет на его отсутствие сделал бы их форму незаводимой заново.
    const db = admin('root').firestore();
    await assertSucceeds(setDoc(doc(db, 'dims/odyssey'), validDim()));
  });

  test('🔒 технический тег обязан быть списком — строкой он отвергается', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'dims/odyssey'), { ...validDim(), techTags: ['migrated'] });
    });

    const db = admin('root').firestore();
    await assertFails(setDoc(doc(db, 'dims/odyssey'), { ...validDim(), techTags: 'migrated' }));
  });

  test('🔒 послабление для тега НЕ открыло дверь прочим полям — прежние отказы живы на правке', async () => {
    // Проверяется именно ПРАВКА: расширение белого списка коснулось только её, и оно обязано
    // быть точечным. Тот же набор на создании стережёт тест выше.
    await seed(async (db) => {
      await setDoc(doc(db, 'dims/odyssey'), { ...validDim(), techTags: ['migrated'] });
    });

    const db = admin('root').firestore();
    await assertFails(setDoc(doc(db, 'dims/odyssey'), { ...validDim(), status: 'pending' }));
    await assertFails(setDoc(doc(db, 'dims/odyssey'), { ...validDim(), wikidata: 'Q20909133' }));
    await assertFails(setDoc(doc(db, 'dims/odyssey'), { ...validDim(), titel: { ru: 'x', en: 'y' } }));
  });

  test('год — СТРОКА, включая диапазон; числом он отвергается', async () => {
    const db = admin('root').firestore();
    // Замер: у восьми боевых записей год длиннее четырёх знаков — это диапазоны.
    await assertSucceeds(setDoc(doc(db, 'dims/d1'), { ...validDim(), year: '1966–1969' }));
    await assertFails(setDoc(doc(db, 'dims/d2'), { ...validDim(), year: 2026 }));
  });

  test('🔒 сводка оценок вне границ шкалы отвергается', async () => {
    const db = admin('root').firestore();
    await assertFails(setDoc(doc(db, 'dims/d1'), { ...validDim(), rating: 11 }));
    await assertFails(setDoc(doc(db, 'dims/d2'), { ...validDim(), rating: -1 }));
    await assertFails(setDoc(doc(db, 'dims/d3'), { ...validDim(), rates: -1 }));
    // stars не может превышать 10 × rates — это и есть настоящий инвариант шкалы.
    await assertFails(setDoc(doc(db, 'dims/d4'), { ...validDim(), stars: 31, rates: 3, rating: 10 }));
    await assertFails(setDoc(doc(db, 'dims/d5'), { ...validDim(), rating: '10' }));
  });

  test('🔑 ноль — законная оценка: stars = 0 при ненулевом rates проходит', async () => {
    // Ловушка канона (`AGENT_GUIDE` → шкала 0…10): «rates > 0 значит stars > 0» ЛОЖНО.
    // Измерению, которому все поставили ноль, честно полагается stars = 0; в бою таких два.
    const db = admin('root').firestore();
    await assertSucceeds(setDoc(doc(db, 'dims/d1'), { ...validDim(), stars: 0, rates: 3, rating: 0 }));
  });

  test('🔒 измерение удаляет только админ', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'dims/odyssey'), validDim());
    });

    await assertFails(deleteDoc(doc(verified(BOB).firestore(), 'dims/odyssey')));
    await assertFails(deleteDoc(doc(guest(GHOST).firestore(), 'dims/odyssey')));
    await assertSucceeds(deleteDoc(doc(admin('root').firestore(), 'dims/odyssey')));
  });

  /*
   * ИНДЕКС КАТАЛОГА — отдельная форма в той же коллекции: строка `dims_list` и отметка
   * свежести `built`, никакого `title`. Валидация измерения к нему неприменима.
   *
   * 🔑 Тесты ниже стерегут ПРАВО, которое ужесточение могло отобрать молча: до правки
   * индекс был записываем админу правилом на всю коллекцию, и валидация измерения
   * закрыла бы его как документ без названия. Ужесточение не должно отбирать то, чего
   * не собиралось касаться.
   *
   * ⚠️ Границу тоже держим названной: писатель индекса ОДИН — сервер синхронизации
   * (Admin SDK, правил не касается). Панель строку индекса не пишет намеренно, иначе
   * дельта-механизм сервера уходит в полную пересборку (`plans/44` шаг 4).
   */
  test('админ пишет индекс каталога, у которого своя форма', async () => {
    const db = admin('root').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'dims/dims_list'), { dims_list: '{"calm":{"ru":"Спокойствие","en":"Calm"}}' }),
    );
  });

  test('🔒 индекс каталога не пишет ни обычный человек, ни гость', async () => {
    const payload = { dims_list: '{}' };
    await assertFails(setDoc(doc(verified(BOB).firestore(), 'dims/dims_list'), payload));
    await assertFails(setDoc(doc(guest(GHOST).firestore(), 'dims/dims_list'), payload));
    await assertFails(setDoc(doc(anonymous().firestore(), 'dims/dims_list'), payload));
  });

  test('🔒 в индекс не положить лишнего поля и не подменить строку картой', async () => {
    const db = admin('root').firestore();
    await assertFails(setDoc(doc(db, 'dims/dims_list'), { dims_list: '{}', smuggled: 1 }));
    await assertFails(setDoc(doc(db, 'dims/dims_list'), { dims_list: { calm: 'Спокойствие' } }));
  });
});

describe('Очередь кандидатов на вычитку — dim_candidates (plans/30 фаза 6)', () => {
  /*
   * 🔴 ГЛАВНОЕ, ЧТО ЗДЕСЬ СТЕРЕЖЁТСЯ: кандидат — ещё НЕ измерение, и людям он не виден НИКАК.
   * Лёжа в `dims/`, он попал бы в индекс каталога и на публичную страницу. Отдельная коллекция
   * плюс «читает только админ» делают это невозможным по построению.
   *
   * ⛔ И инвариант В3 = А: у ИИ-агента клейма админа НЕТ, поэтому пути «агент → каталог» в
   * правилах не существует вовсе. Агент кладёт кандидата через Admin SDK (как сервер
   * синхронизации) и завести измерение не может.
   */
  const candidate = () => ({
    title: { ru: 'Одиссея', en: 'The Odyssey' },
    description: { ru: 'Фильм Кристофера Нолана.', en: 'A film by Christopher Nolan.' },
    type: { ru: 'Фильм', en: 'Film' },
    author: { ru: 'Кристофер Нолан', en: 'Christopher Nolan' },
    year: '2026',
    tags: ['фэнтези'],
    status: 'pending',
    source: { registry: 'wikidata', id: 'Q131547207', sitelinks: 61 },
    agentNote: '',
  });

  test('админ читает и пишет очередь', async () => {
    const db = admin('root').firestore();
    await assertSucceeds(setDoc(doc(db, 'dim_candidates/c1'), candidate()));
    await assertSucceeds(getDoc(doc(db, 'dim_candidates/c1')));
  });

  test('🔒 очередь НЕ ВИДИТ никто, кроме админа — ни человек, ни гость, ни не вошедший', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'dim_candidates/c1'), candidate());
    });

    await assertFails(getDoc(doc(verified(BOB).firestore(), 'dim_candidates/c1')));
    await assertFails(getDoc(doc(guest(GHOST).firestore(), 'dim_candidates/c1')));
    await assertFails(getDoc(doc(anonymous().firestore(), 'dim_candidates/c1')));
    await assertFails(getDoc(doc(unverified(BOB).firestore(), 'dim_candidates/c1')));
  });

  test('🔒 в очередь не пишет никто, кроме админа', async () => {
    await assertFails(setDoc(doc(verified(BOB).firestore(), 'dim_candidates/c1'), candidate()));
    await assertFails(setDoc(doc(guest(GHOST).firestore(), 'dim_candidates/c1'), candidate()));
    await assertFails(setDoc(doc(anonymous().firestore(), 'dim_candidates/c1'), candidate()));
  });

  test('🔒 статус вне словаря отвергается — иначе кандидат зависает молча', async () => {
    // Очередь спрашивает `pending`. Опечатка в статусе делает кандидата невидимым для запроса,
    // и он не попадает НИ в одну выборку — ни в очередь, ни в разобранные.
    const db = admin('root').firestore();
    await assertFails(setDoc(doc(db, 'dim_candidates/c1'), { ...candidate(), status: 'pendng' }));
    await assertFails(setDoc(doc(db, 'dim_candidates/c2'), { ...candidate(), status: '' }));
    await assertFails(setDoc(doc(db, 'dim_candidates/c3'), { ...candidate(), status: 1 }));
    const { status, ...withoutStatus } = candidate();
    await assertFails(setDoc(doc(db, 'dim_candidates/c4'), withoutStatus));
  });

  test('все ЧЕТЫРЕ законных статуса проходят', async () => {
    const db = admin('root').firestore();
    for (const status of ['pending', 'approved', 'rejected', 'returned']) {
      await assertSucceeds(setDoc(doc(db, `dim_candidates/s-${status}`), { ...candidate(), status }));
    }
  });

  /*
   * ── ВОЗВРАТ НА ДОРАБОТКУ (`bugs/142`) ────────────────────────────────────────────────────
   *
   * Четвёртое действие владельца. Правила ОБЯЗАНЫ его пропустить — до этой правки словарь
   * статусов знал три значения, и возврат отвергался бы молча, оставляя владельца с выбором
   * «одобрить или потерять».
   */
  test('🆕 возврат на доработку принимается вместе с комментарием владельца', async () => {
    const db = admin('root').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'dim_candidates/back'), {
        ...candidate(),
        status: 'returned',
        ownerNote: 'Описание короткое, перепиши вики-подобно.',
      }),
    );
  });

  test('🔑 возврат НЕ затирает комментарий агента — поля разные, диалог двусторонний', async () => {
    const db = admin('root').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'dim_candidates/both'), {
        ...candidate(),
        status: 'returned',
        agentNote: 'Год в источниках расходится, поставил первое издание.',
        ownerNote: 'Год верный, правь описание.',
      }),
    );
    const saved = await getDoc(doc(db, 'dim_candidates/both'));
    assert.equal(saved.data()?.agentNote, 'Год в источниках расходится, поставил первое издание.');
    assert.equal(saved.data()?.ownerNote, 'Год верный, правь описание.');
  });

  test('🔒 опечатка в статусе возврата отвергается так же, как любая другая', async () => {
    // `returnd`/`return` — самые вероятные описки нового статуса. Кандидат с таким статусом
    // не попал бы НИ в очередь (`pending`), НИ в выборку возвращённых — то есть исчез бы молча.
    const db = admin('root').firestore();
    await assertFails(setDoc(doc(db, 'dim_candidates/r1'), { ...candidate(), status: 'returnd' }));
    await assertFails(setDoc(doc(db, 'dim_candidates/r2'), { ...candidate(), status: 'return' }));
  });
});

describe('Гость (анонимный вход) — может трудиться над своим, невидим для других', () => {
  // Решения интервью №004: В1 = гостю дать «пощупать» по-настоящему, В3 = гость невидим другим.
  // Правила гарантируют невидимость сами, не полагаясь на дисциплину клиента.

  test('гость читает каталог осей — без него нечего оценивать', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'dims/calm'), { title: { ru: 'Спокойствие' }, stars: 10, rates: 2, rating: 5 });
    });

    const db = guest(GHOST).firestore();
    await assertSucceeds(getDoc(doc(db, 'dims/calm')));
  });

  test('гость создаёт свою точку с честным флагом guest и ставит оценки', async () => {
    const db = guest(GHOST).firestore();
    await assertSucceeds(
      setDoc(doc(db, `points/${GHOST}`), { dirty: true, guest: true, updated: 1, lastSync: 0 }),
    );
    await assertSucceeds(setDoc(doc(db, `points/${GHOST}/dims/calm`), { value: 7 }));
  });

  test('🔒 гость не может скрыть флаг guest — на нём держится фильтр сервера синхронизации', async () => {
    const db = guest(GHOST).firestore();
    await assertFails(setDoc(doc(db, `points/${GHOST}`), { dirty: true, updated: 1, lastSync: 0 }));
    await assertFails(
      setDoc(doc(db, `points/${GHOST}`), { dirty: true, guest: false, updated: 1, lastSync: 0 }),
    );
  });

  test('🔒 полноценный пользователь не может прикинуться гостем', async () => {
    // Иначе можно было бы прятаться от чужих relations, продолжая видеть свои.
    const db = verified(BOB).firestore();
    await assertFails(
      setDoc(doc(db, 'points/bob'), { dirty: true, guest: true, updated: 1, lastSync: 0 }),
    );
  });

  test('обычная точка без флага guest по-прежнему принимается', async () => {
    const db = verified(BOB).firestore();
    await assertSucceeds(setDoc(doc(db, 'points/bob'), { dirty: true, updated: 1, lastSync: 0 }));
  });

  test('🔒 гость не читает ЧУЖОЙ публичный бакет — порог «подтверждённая почта» остаётся', async () => {
    await seedAliceProfile();
    const db = guest(GHOST).firestore();
    await assertFails(getDoc(doc(db, 'users/alice/profile/everyone')));
  });

  test('🔒 гость не публикует бакеты everyone и friends — невидимость на уровне правил', async () => {
    const db = guest(GHOST).firestore();
    await assertFails(setDoc(doc(db, `users/${GHOST}/profile/everyone`), { avatar: true }));
    await assertFails(setDoc(doc(db, `users/${GHOST}/profile/friends`), { born: { year: 1990 } }));
  });

  test('приватный бакет гостю можно — его не видит никто', async () => {
    const db = guest(GHOST).firestore();
    await assertSucceeds(setDoc(doc(db, `users/${GHOST}/profile/private`), { gender: 'm' }));
  });

  test('🔒 гость не создаёт группы и не кладёт в них людей — это открыло бы его бакеты', async () => {
    const db = guest(GHOST).firestore();
    await assertFails(setDoc(doc(db, `users/${GHOST}/groups/g1`), { name: 'x', memberCount: 1, created: 1 }));
    await assertFails(setDoc(doc(db, `users/${GHOST}/groups/g1/members/bob`), { added: 1 }));
  });

  test('🔒 гость не пишет audience-подсказки — подсказка приглашает читать его бакеты', async () => {
    const db = guest(GHOST).firestore();
    await assertFails(setDoc(doc(db, `users/${GHOST}/audience/bob`), { buckets: ['everyone'] }));
  });

  test('🔒 гость не создаёт запрос дружбы', async () => {
    const db = guest(GHOST).firestore();
    await assertFails(
      setDoc(doc(db, `friendships/${ALICE}_${GHOST}`), {
        a: ALICE,
        b: GHOST,
        requestedBy: GHOST,
        status: 'pending',
        created: 1,
        acceptedAt: null,
      }),
    );
  });

  test('🔒 гость не может принять дружбу, даже если запрос ему прислали', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, `friendships/${ALICE}_${GHOST}`), {
        a: ALICE,
        b: GHOST,
        requestedBy: ALICE,
        status: 'pending',
        created: 1,
        acceptedAt: null,
      });
    });

    const db = guest(GHOST).firestore();
    await assertFails(
      updateDoc(doc(db, `friendships/${ALICE}_${GHOST}`), { status: 'accepted', acceptedAt: 2 }),
    );
  });

  test('🔒 гость не предлагает новые оси — только подтверждённые пользователи', async () => {
    const db = guest(GHOST).firestore();
    await assertFails(
      setDoc(doc(db, 'suggestions/s1'), { authorUid: GHOST, description: 'Люблю тишину', created: 1 }),
    );
  });

  test('гость читает СВОИ связи — похожесть с публичными точками считается для него', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, `relations/${GHOST}`), { computedAt: 1, version: 1, top: [] });
    });

    const db = guest(GHOST).firestore();
    await assertSucceeds(getDoc(doc(db, `relations/${GHOST}`)));
  });

  test('🔒 гость не читает чужие связи', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'relations/alice'), { computedAt: 1, version: 1, top: [] });
    });

    const db = guest(GHOST).firestore();
    await assertFails(getDoc(doc(db, 'relations/alice')));
  });

  test('гость правит свой корень users/{uid}, чужой — нет', async () => {
    const db = guest(GHOST).firestore();
    await assertSucceeds(setDoc(doc(db, `users/${GHOST}`), { settings: { language: 'ru' } }));
    await assertFails(getDoc(doc(db, 'users/alice')));
  });
});

describe('Умолчание — запрещено', () => {
  test('🔒 неизвестная коллекция недоступна даже админу-пользователю', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'secrets/x'), { value: 1 });
    });

    const db = verified(ALICE).firestore();
    await assertFails(getDoc(doc(db, 'secrets/x')));
    await assertFails(setDoc(doc(db, 'secrets/y'), { value: 1 }));
  });
});

describe('Воронка онбординга — только +1 и ничего больше (plans/03 этап 4)', () => {
  const DAY = 'space/funnel/days/2026-07-12';

  /** День с уже накопленными числами — исходное состояние мира. */
  async function seedDay(): Promise<void> {
    await seed(async (db) => {
      await setDoc(doc(db, DAY), {
        landing_view: 10,
        demo_touch: 4,
        guest_start: 2,
        account_created: 1,
      });
    });
  }

  test('посетитель лендинга (даже не вошедший) может отметить свой шаг: +1', async () => {
    await seedDay();
    const db = anonymous().firestore();
    await assertSucceeds(updateDoc(doc(db, DAY), { landing_view: increment(1) }));
  });

  test('первый за день создаёт документ одним счётчиком со значением 1', async () => {
    const db = anonymous().firestore();
    await assertSucceeds(setDoc(doc(db, DAY), { landing_view: increment(1) }, { merge: true }));
  });

  test('🔒 накрутка: +2 за одну запись запрещена', async () => {
    await seedDay();
    const db = anonymous().firestore();
    await assertFails(updateDoc(doc(db, DAY), { landing_view: increment(2) }));
  });

  test('🔒 счётчик нельзя уменьшить — историю не переписывают', async () => {
    await seedDay();
    const db = anonymous().firestore();
    await assertFails(updateDoc(doc(db, DAY), { landing_view: increment(-1) }));
    await assertFails(updateDoc(doc(db, DAY), { account_created: 0 }));
  });

  test('🔒 два счётчика за одну запись — нельзя (шаг воронки ровно один)', async () => {
    await seedDay();
    const db = anonymous().firestore();
    await assertFails(
      updateDoc(doc(db, DAY), { landing_view: increment(1), demo_touch: increment(1) }),
    );
  });

  test('🔒 подложить постороннее поле нельзя — в воронке только четыре числа', async () => {
    await seedDay();
    const db = anonymous().firestore();
    // Ни ПДн, ни чего угодно ещё: набор имён закрыт правилом.
    await assertFails(updateDoc(doc(db, DAY), { landing_view: increment(1), email: 'kot@x.ru' }));
    await assertFails(setDoc(doc(db, 'space/funnel/days/2026-07-13'), { uid: 'alice' }));
  });

  test('🔒 воронку не читает никто, кроме админа — это приборная панель владельца', async () => {
    await seedDay();
    await assertFails(getDoc(doc(anonymous().firestore(), DAY)));
    await assertFails(getDoc(doc(verified(ALICE).firestore(), DAY)));
    await assertFails(getDoc(doc(guest(GHOST).firestore(), DAY)));
    await assertSucceeds(getDoc(doc(admin(ALICE).firestore(), DAY)));
  });

  test('🔒 удалить день может только админ', async () => {
    await seedDay();
    await assertFails(deleteDoc(doc(anonymous().firestore(), DAY)));
    await assertFails(deleteDoc(doc(verified(ALICE).firestore(), DAY)));
  });
});

describe('Статистика Пространства — витрина, которую никто не может подделать (ideas/06)', () => {
  const STATS = 'space/stats';
  const SERVER = 'space/server';
  const SNAPSHOT = 'space/stats/daily/2026-07-12';
  const PUBLIC = 'space/public_metrics';

  /** Цифры, записанные сервером синхронизации (в жизни — через Admin SDK, мимо правил). */
  async function seedStats(): Promise<void> {
    await seed(async (db) => {
      await setDoc(doc(db, STATS), { computedAt: 1, people: 96, dims: 5111, relations: 318 });
      await setDoc(doc(db, SNAPSHOT), { date: '2026-07-12', people: 96 });
      await setDoc(doc(db, SERVER), { version: '0.1.0', lastRunAt: 1, intervalSeconds: 60 });
      await setDoc(doc(db, PUBLIC), { people: 96, computedAt: 1 });
    });
  }

  test('витрина лендинга читается БЕЗ авторизации — «С нами уже N человек» видит любой посетитель', async () => {
    // Паритет с 1.x (researches/05): счётчик людей на лендинге работал без входа.
    await seedStats();
    await assertSucceeds(getDoc(doc(anonymous().firestore(), PUBLIC)));
  });

  test('🔒 витрину лендинга нельзя переписать с клиента — число пишет только сервер синхронизации', async () => {
    await seedStats();
    for (const db of [verified(ALICE).firestore(), guest(GHOST).firestore(), anonymous().firestore()]) {
      await assertFails(setDoc(doc(db, PUBLIC), { people: 1_000_000 }));
    }
  });

  test('житель Пространства видит его статистику — и гость тоже', async () => {
    await seedStats();
    for (const path of [STATS, SERVER, SNAPSHOT]) {
      await assertSucceeds(getDoc(doc(verified(ALICE).firestore(), path)));
      // Гость — анонимный токен. Правило обязано ПРОЙТИ, а не упасть на вычислении
      // verified() (у анонимного токена нет claim'а email_verified).
      await assertSucceeds(getDoc(doc(guest(GHOST).firestore(), path)));
    }
  });

  test('🔒 не вошедший не читает статистику: это экран продукта, а не витрина лендинга', async () => {
    await seedStats();
    for (const path of [STATS, SERVER, SNAPSHOT]) {
      await assertFails(getDoc(doc(anonymous().firestore(), path)));
    }
  });

  test('🔒 человек не может переписать цифры Пространства — их пишет только сервер синхронизации', async () => {
    await seedStats();
    for (const db of [verified(ALICE).firestore(), guest(GHOST).firestore(), anonymous().firestore()]) {
      await assertFails(setDoc(doc(db, STATS), { people: 1_000_000 }));
      await assertFails(updateDoc(doc(db, SNAPSHOT), { people: 1_000_000 }));
      // Соврать про сервер («Работает») тоже нельзя: состояние выводится из его сердцебиения.
      await assertFails(setDoc(doc(db, SERVER), { lastRunAt: 9_999_999_999 }));
    }
  });

  test('🔒 снимок дня нельзя удалить, стерев историю трендов', async () => {
    await seedStats();
    await assertFails(deleteDoc(doc(verified(ALICE).firestore(), SNAPSHOT)));
    await assertFails(deleteDoc(doc(guest(GHOST).firestore(), SNAPSHOT)));
  });
});

describe('Пара теста — testPairs (plans/42, такт В; №002 В4 + №028)', () => {
  // Длинный неугадываемый id — как генерит клиент (crypto.randomUUID без дефисов).
  const PAIR = 'testPairs/0123456789abcdef0123456789abcdef';
  const SHORT = 'testPairs/short-id';

  const fresh = (aUid: string, over: Record<string, unknown> = {}) => ({
    slug: 'compatibility',
    created: 1,
    aUid,
    aAnswers: { dim1: 7, dim2: 10 },
    bUid: null,
    bAnswers: null,
    ...over,
  });

  /** Пара, созданная гостем-Алисой и ждущая второго. */
  async function seedPair(over: Record<string, unknown> = {}): Promise<void> {
    await seed(async (db) => {
      await setDoc(doc(db, PAIR), fresh(ALICE, over));
    });
  }

  test('гость создаёт пару собой и читает её по прямой ссылке', async () => {
    const db = guest(GHOST).firestore();
    await assertSucceeds(setDoc(doc(db, PAIR), fresh(GHOST)));
    await assertSucceeds(getDoc(doc(db, PAIR)));
  });

  test('второй (в том числе гость) присоединяется, заполняя ТОЛЬКО свою половину', async () => {
    await seedPair();
    const db = guest(GHOST).firestore();
    await assertSucceeds(
      setDoc(doc(db, PAIR), fresh(ALICE, { bUid: GHOST, bAnswers: { dim1: 7, dim3: 0 } })),
    );
  });

  test('🔒 создать пару от чужого имени или с занятой половиной второго нельзя', async () => {
    const db = guest(GHOST).firestore();
    await assertFails(setDoc(doc(db, PAIR), fresh(ALICE))); // aUid — не я
    await assertFails(setDoc(doc(db, PAIR), fresh(GHOST, { bUid: BOB, bAnswers: { dim1: 5 } })));
  });

  test('🔒 короткий id отвергается: непубличность ссылки держится на неугадываемости', async () => {
    await assertFails(setDoc(doc(guest(GHOST).firestore(), SHORT), fresh(GHOST)));
  });

  test('🔒 ответы валидируются целиком: вне 0…10, не числа, пустые, больше 40', async () => {
    const db = guest(GHOST).firestore();
    await assertFails(setDoc(doc(db, PAIR), fresh(GHOST, { aAnswers: { dim1: 11 } })));
    await assertFails(setDoc(doc(db, PAIR), fresh(GHOST, { aAnswers: { dim1: -1 } })));
    await assertFails(setDoc(doc(db, PAIR), fresh(GHOST, { aAnswers: { dim1: 'десять' } })));
    await assertFails(setDoc(doc(db, PAIR), fresh(GHOST, { aAnswers: {} })));
    const bloated: Record<string, number> = {};
    for (let i = 0; i < 41; i += 1) bloated[`dim${i}`] = 5;
    await assertFails(setDoc(doc(db, PAIR), fresh(GHOST, { aAnswers: bloated })));
  });

  test('🔒 постороннее поле и чужой slug не проходят', async () => {
    const db = guest(GHOST).firestore();
    await assertFails(setDoc(doc(db, PAIR), fresh(GHOST, { email: 'kot@x.ru' })));
    await assertFails(setDoc(doc(db, PAIR), fresh(GHOST, { slug: 'иное' })));
  });

  test('🔒 создатель не присоединяется сам к себе', async () => {
    await seedPair();
    const db = guest(ALICE).firestore();
    await assertFails(
      setDoc(doc(db, PAIR), fresh(ALICE, { bUid: ALICE, bAnswers: { dim1: 7 } })),
    );
  });

  test('🔒 присоединяясь, нельзя тронуть половину создателя, slug или дату', async () => {
    await seedPair();
    const db = guest(GHOST).firestore();
    const join = { bUid: GHOST, bAnswers: { dim1: 5 } };
    await assertFails(setDoc(doc(db, PAIR), fresh(ALICE, { ...join, aAnswers: { dim1: 0 } })));
    await assertFails(setDoc(doc(db, PAIR), fresh(BOB, { ...join })));
    await assertFails(setDoc(doc(db, PAIR), fresh(ALICE, { ...join, slug: 'love' })));
    await assertFails(setDoc(doc(db, PAIR), fresh(ALICE, { ...join, created: 2 })));
  });

  test('🔒 сложившаяся пара неизменна: третий не влезет, второй не перепишет', async () => {
    await seedPair({ bUid: BOB, bAnswers: { dim1: 5 } });
    await assertFails( // третий на занятое место
      setDoc(doc(guest(EVE).firestore(), PAIR), fresh(ALICE, { bUid: EVE, bAnswers: { dim1: 9 } })),
    );
    await assertFails( // второй меняет свои ответы задним числом
      setDoc(doc(guest(BOB).firestore(), PAIR), fresh(ALICE, { bUid: BOB, bAnswers: { dim1: 10 } })),
    );
  });

  test('🔒 не вошедший не читает и не создаёт; перечислить пары нельзя никому', async () => {
    await seedPair();
    const db = anonymous().firestore();
    await assertFails(getDoc(doc(db, PAIR)));
    await assertFails(setDoc(doc(db, 'testPairs/aaaaaaaaaaaaaaaaaaaaaaaa'), fresh('nobody')));
    // list запрещён даже участнику: ссылка — единственный путь к паре.
    const { getDocs, collection } = await import('firebase/firestore');
    await assertFails(getDocs(collection(guest(ALICE).firestore(), 'testPairs')));
  });

  test('удалить пару может любой из участников — и только они', async () => {
    await seedPair({ bUid: BOB, bAnswers: { dim1: 5 } });
    await assertFails(deleteDoc(doc(guest(EVE).firestore(), PAIR)));
    await assertSucceeds(deleteDoc(doc(guest(BOB).firestore(), PAIR)));
    await seedPair({ bUid: BOB, bAnswers: { dim1: 5 } });
    await assertSucceeds(deleteDoc(doc(guest(ALICE).firestore(), PAIR)));
  });
});

/*
 * Админ-чтение четырёх коллекций — ЗАМЫСЕЛ владельца, закреплённый тестом (№041 В1).
 *
 * Слово владельца 2026-08-21 дословно: «Админ может всё». Право стояло в правилах без
 * описания и без теста (bugs/155: конфигурация шире собственного комментария) — теперь оно
 * названо в комментариях правил и закреплено здесь, чтобы не быть незадокументированным.
 * Потребитель — будущая Панель администратора (ideas/13: модерация, поддержка людей).
 *
 * ⚠️ Граница замысла НЕ тронута: оценок (points) админ по-прежнему не читает — «админ не
 * исключение» (bugs/100, тест выше). Закреплены обе стороны границы: что можно и что нельзя.
 */
describe('Админ-чтение — замысел владельца, закреплён тестом (№041 В1)', () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users/alice'), { visibility: {} });
      await setDoc(doc(db, 'users/alice/profile/private'), { gender: 'm' });
      await setDoc(doc(db, 'friendships/alice_bob'), {
        a: ALICE, b: BOB, requestedBy: BOB, status: 'pending', created: 1, acceptedAt: null,
      });
      await setDoc(doc(db, 'relations/alice'), { computedAt: 1, version: 1, top: [] });
    });
  });

  test('админ читает корень пользователя, бакеты профиля, дружбу и связи', async () => {
    const db = admin('root').firestore();
    await assertSucceeds(getDoc(doc(db, 'users/alice')));
    await assertSucceeds(getDoc(doc(db, 'users/alice/profile/private')));
    await assertSucceeds(getDoc(doc(db, 'friendships/alice_bob')));
    await assertSucceeds(getDoc(doc(db, 'relations/alice')));
  });

  test('🔒 контроль прибора: обычному подтверждённому те же четыре чтения отказаны', async () => {
    const db = verified(EVE).firestore();
    await assertFails(getDoc(doc(db, 'users/alice')));
    await assertFails(getDoc(doc(db, 'users/alice/profile/private')));
    await assertFails(getDoc(doc(db, 'friendships/alice_bob')));
    await assertFails(getDoc(doc(db, 'relations/alice')));
  });
});

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

  test('🔒 клиент не может снять флаг dirty — это работа вычислителя', async () => {
    const db = verified(ALICE).firestore();
    await assertFails(setDoc(doc(db, 'points/alice'), { dirty: false, updated: 2, lastSync: 2 }));
    await assertSucceeds(setDoc(doc(db, 'points/alice'), { dirty: true, updated: 2, lastSync: 1 }));
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
    // Иначе человек объявил бы себя похожим на кого угодно. Пишет только вычислитель (Admin SDK).
    const db = verified(ALICE).firestore();
    await assertFails(setDoc(doc(db, 'relations/alice'), { computedAt: 2, version: 2, top: [] }));
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
    await assertSucceeds(setDoc(doc(db, 'dims/calm'), { title: { ru: 'Спокойствие' }, stars: 1, rates: 1, rating: 1 }));
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

  test('🔒 гость не может скрыть флаг guest — на нём держится фильтр вычислителя', async () => {
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

  /** Цифры, записанные сервером синхронизации (в жизни — через Admin SDK, мимо правил). */
  async function seedStats(): Promise<void> {
    await seed(async (db) => {
      await setDoc(doc(db, STATS), { computedAt: 1, people: 96, dims: 5111, relations: 318 });
      await setDoc(doc(db, SNAPSHOT), { date: '2026-07-12', people: 96 });
      await setDoc(doc(db, SERVER), { version: '0.1.0', lastRunAt: 1, intervalSeconds: 60 });
    });
  }

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

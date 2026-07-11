// Сид дев-стенда NDim Space 2.0: тестовые данные модели 2.0 в локальные эмуляторы.
//
// Что делает:
//   1. Auth-эмулятор: заводит (или находит) пользователя dev@ndim.space и подтверждает
//      ему почту — правила требуют email_verified для чтения каталога осей.
//   2. Firestore-эмулятор: каталог осей `dims/`, корень пользователя, бакеты профиля
//      (раскладка — ТОЙ ЖЕ функцией distribute, что и в продукте), круг «Клуб»,
//      оценки по осям. Идемпотентен: повторный запуск просто перезаписывает то же.
//
// Запускается внутри `npm run stand` (firebase emulators:exec), но можно и вручную
// при уже поднятых эмуляторах: `node tools/seed-dev.mjs`.
//
// Данные вымышленные, проект demo-* — боевого Firestore этот скрипт не касается никогда.

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { distribute } from '../src/lib/model/visibility.ts';

const PROJECT_ID = 'demo-ndim-dev';
const AUTH_URL = 'http://127.0.0.1:9099';
const FIRESTORE = { host: '127.0.0.1', port: 8181 };
const DEV_USER = { email: 'dev@ndim.space', password: 'ndim-dev-stand' };

// ── 1. Пользователь стенда в Auth-эмуляторе ─────────────────────────────────

async function authRequest(path, body, headers = {}) {
  const response = await fetch(`${AUTH_URL}/identitytoolkit.googleapis.com/v1/${path}?key=demo-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok && json?.error?.message !== 'EMAIL_EXISTS') {
    throw new Error(`${path}: ${json?.error?.message ?? response.status}`);
  }
  return json;
}

async function ensureDevUser() {
  const signUp = await authRequest('accounts:signUp', { ...DEV_USER, returnSecureToken: true });

  const uid =
    signUp.localId ??
    (await authRequest('accounts:signInWithPassword', { ...DEV_USER, returnSecureToken: true })).localId;

  // Подтверждаем почту от имени эмулятора (Bearer owner — его админский токен).
  await authRequest('accounts:update', { localId: uid, emailVerified: true }, { Authorization: 'Bearer owner' });
  return uid;
}

// ── 2. Данные модели 2.0 ────────────────────────────────────────────────────

const now = Date.now();

/** Каталог осей: title/description двуязычные, рейтинг сообщества — как в DimDoc. */
const DIMS = {
  cats: {
    title: { ru: 'Кошки', en: 'Cats' },
    description: { ru: 'Домашние кошки: насколько они «ваши» существа.', en: 'Domestic cats: how much they are “your” creatures.' },
    stars: 522, rates: 58, rating: 9,
  },
  travel: {
    title: { ru: 'Путешествия', en: 'Travel' },
    description: { ru: 'Новые места, дороги и рюкзаки.', en: 'New places, roads and backpacks.' },
    stars: 217, rates: 31, rating: 7,
  },
  silence: {
    title: { ru: 'Тишина', en: 'Silence' },
    description: { ru: 'Ценность тишины и уединения.', en: 'The value of silence and solitude.' },
    stars: 74, rates: 12, rating: 6.2,
  },
  math: {
    title: { ru: 'Математика', en: 'Mathematics' },
    description: { ru: 'Красота строгих доказательств.', en: 'The beauty of rigorous proofs.' },
    stars: 73, rates: 9, rating: 8.1,
  },
  'taxi-driver-1976': {
    title: { ru: '«Таксист» (1976)', en: 'Taxi Driver (1976)' },
    description: {
      ru: 'Драма Мартина Скорсезе о ветеране Вьетнамской войны, работающем таксистом в Нью-Йорке.',
      en: 'Martin Scorsese’s drama about a Vietnam veteran driving a taxi in New York.',
    },
    stars: 37, rates: 4, rating: 9.3,
  },
  'alchemist-1988': {
    title: { ru: '«Алхимик» (1988)', en: 'The Alchemist (1988)' },
    description: { ru: 'Роман Пауло Коэльо о пути к своей Личной Легенде.', en: 'Paulo Coelho’s novel about following your Personal Legend.' },
    stars: 30, rates: 3, rating: 10,
  },
  theatre: {
    title: { ru: 'Театр', en: 'Theatre' },
    description: { ru: 'Живая сцена и всё, что на ней.', en: 'The living stage and everything on it.' },
    stars: 72, rates: 12, rating: 6,
  },
  running: {
    title: { ru: 'Бег', en: 'Running' },
    description: { ru: 'Бег как привычка и удовольствие.', en: 'Running as a habit and a joy.' },
    stars: 44, rates: 8, rating: 5.5,
  },
};

/** Значения профиля пользователя стенда (см. schema.ts → ProfileData). */
const PROFILE_VALUES = {
  name: {
    first: { ru: 'Николай', en: 'Nikolai' },
    middle: { ru: null, en: null },
    last: { ru: null, en: null },
    nick: { ru: 'KOT KRINIK', en: 'KOT KRINIK' },
  },
  about: { ru: 'Ищу похожих на меня людей.', en: 'Looking for people like me.' },
  born: { year: 1986, month: 3, day: 14 },
  gender: 'm',
  avatar: false,
};

/** Карта видимости — как в утверждённом макете: имя и пол всем, о себе друзьям, дата кругу, фото никому. */
const VISIBILITY = {
  name: 'everyone',
  gender: 'everyone',
  about: ['friends'],
  born: ['g-club'],
  avatar: [],
};

const MY_RATINGS = { cats: 10, travel: 9, silence: 7, math: 8 };

/**
 * Гости стенда: соседи по Пространству со своими точками — пища для вычислителя связей.
 * Auth-пользователи им не нужны: вычислитель ходит по points/, экран связей читает
 * relations владельца и profile/everyone гостей.
 */
const GUESTS = {
  'stand-guest-anna': {
    name: { ru: 'Анна', en: 'Anna' },
    ratings: { cats: 9, silence: 8, theatre: 6, travel: 7 },
  },
  'stand-guest-viktor': {
    name: { ru: 'Виктор', en: 'Viktor' },
    ratings: { travel: 10, math: 7, cats: 3, running: 5 },
  },
  'stand-guest-maria': {
    name: { ru: 'Мария', en: 'Maria' },
    ratings: { silence: 2, cats: 10, travel: 8, math: 9, theatre: 4 },
  },
};

// ── 3. Запись в Firestore (правила отключены: сид — это роль вычислителя) ──

const env = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: FIRESTORE,
});

try {
  const uid = await ensureDevUser();

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    for (const [dimId, dim] of Object.entries(DIMS)) {
      await db.doc(`dims/${dimId}`).set(dim);
    }

    await db.doc(`users/${uid}`).set({
      visibility: VISIBILITY,
      settings: { language: 'ru' },
      time: { created: now, updated: now, lastSignIn: now },
      groupCount: 1,
    });

    // Раскладка по бакетам — ТОЙ ЖЕ функцией, что и продукт. Сид не изобретает свою.
    for (const [bucketId, bucketValues] of distribute(PROFILE_VALUES, VISIBILITY)) {
      await db.doc(`users/${uid}/profile/${bucketId}`).set(bucketValues);
    }

    await db.doc(`users/${uid}/groups/g-club`).set({ name: 'Клуб', memberCount: 0, created: now });

    // Точка владельца стенда — «грязная»: вычислителю есть что пересчитать сразу.
    await db.doc(`points/${uid}`).set({ dirty: true, updated: now, lastSync: null });
    for (const [dimId, value] of Object.entries(MY_RATINGS)) {
      await db.doc(`points/${uid}/dims/${dimId}`).set({ value });
    }

    // Гости: публичная карточка (profile/everyone) + точка с оценками.
    for (const [guestUid, guest] of Object.entries(GUESTS)) {
      await db.doc(`users/${guestUid}`).set({
        visibility: { name: 'everyone' },
        settings: { language: 'ru' },
        time: { created: now, updated: now, lastSignIn: now },
        groupCount: 0,
      });
      await db.doc(`users/${guestUid}/profile/everyone`).set({
        name: {
          first: guest.name,
          middle: { ru: null, en: null },
          last: { ru: null, en: null },
          nick: { ru: null, en: null },
        },
      });
      await db.doc(`points/${guestUid}`).set({ dirty: false, updated: now, lastSync: null });
      for (const [dimId, value] of Object.entries(guest.ratings)) {
        await db.doc(`points/${guestUid}/dims/${dimId}`).set({ value });
      }
    }
  });

  console.log(
    `✔ Стенд засеян: ${DEV_USER.email} (${uid}) + ${Object.keys(GUESTS).length} гостя, осей: ${Object.keys(DIMS).length}`,
  );
} finally {
  await env.cleanup();
}

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
import { dayKey } from '../src/lib/model/stats.ts';

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
const DAY_MS = 24 * 60 * 60 * 1000;

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
  // Измерение, появившееся «сегодня»: без него виджету «Сегодня» на экране
  // «Пространство» нечего было бы рассказать про новые измерения.
  'early-rising': {
    title: { ru: 'Ранние подъёмы', en: 'Early rising' },
    description: { ru: 'Утро начинается до рассвета.', en: 'The day starts before dawn.' },
    stars: 0, rates: 0, rating: 0,
  },
};

/** Измерения, появившиеся за последние сутки. Остальные — старожилы каталога. */
const FRESH_DIMS = new Set(['early-rising']);

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
      // `created` — возраст измерения. По нему сервер синхронизации отбирает те, что
      // появились за сутки (виджет «Сегодня»); без даты измерение просто не считается новым.
      const created = now - (FRESH_DIMS.has(dimId) ? 3 * 60 * 60 * 1000 : 60 * DAY_MS);
      await db.doc(`dims/${dimId}`).set({ ...dim, created });
    }

    // СЛУЖЕБНЫЙ ДОКУМЕНТ БЕЗ НАЗВАНИЯ — наследие 1.x, он живёт в боевом каталоге (`dims_list`).
    //
    // Сеем его нарочно. 2026-07-12 ровно такой документ уронил экран «Профиль» У ВСЕХ живых
    // людей: код сортировал каталог по `title.ru`, а у служебного документа никакого `title`
    // нет — `undefined.ru`. Стенд этого не показывал, потому что был засеян ИДЕАЛЬНЫМИ данными,
    // какими им положено быть, а не такими, какие они есть.
    //
    // Стенд обязан быть похож на бой, ВКЛЮЧАЯ ЕГО СОР. Иначе он проверяет не продукт, а мечту
    // о продукте. Экран должен пережить этот документ и молча его пропустить.
    await db.doc('dims/dims_list').set({ dims_list: [] });

    // История Пространства: снимки прошлых дней. Их пишет сервер синхронизации — но на пустом
    // стенде истории неоткуда взяться, а без неё нечему расти: не будет ни трендов, ни линий
    // динамики, ни виджета «Сегодня». Сегодняшний снимок НЕ сеем: его посчитает сам сервер,
    // и цифры дня обязаны быть настоящими.
    const HISTORY_DAYS = 13;
    for (let daysAgo = HISTORY_DAYS; daysAgo >= 1; daysAgo -= 1) {
      const grown = (HISTORY_DAYS - daysAgo) / HISTORY_DAYS; // 0 в начале истории → 1 вчера
      const date = dayKey(now - daysAgo * DAY_MS);
      await db.doc(`space/stats/daily/${date}`).set({
        date,
        people: 1 + Math.round(grown * 2), // 1 → 3 (сегодня их станет 4)
        dims: 5 + Math.round(grown * 3), // 5 → 8 (сегодня добавилось девятое)
        ratings: 6 + Math.round(grown * 8), // 6 → 14
        relations: Math.round(grown * 6),
        avgSimilarity: 61 - Math.round(grown * 5), // Пространство разнообразнее: 61 → 56
      });
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

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
//
// Запуск: node tools/seed-dev.mjs

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
// Timestamp нужен, чтобы сеять БОЕВУЮ форму возраста измерения — `time.created` (bugs/109).
import { Timestamp } from 'firebase/firestore';
import { distribute } from '../src/lib/model/visibility.ts';
import { dayKey } from '../src/lib/model/stats.ts';

const PROJECT_ID = 'demo-ndim-dev';

/**
 * Адрес эмуляторов берётся у ОКРУЖЕНИЯ, литерал остаётся умолчанием (`plans/69` шаг 5).
 *
 * 🔑 Почему это правильный способ, а не «прокинуть слот параметром». Сид исполняется ВНУТРИ
 * `firebase emulators:exec`, а тот сам экспортирует потомкам `FIRESTORE_EMULATOR_HOST` и
 * `FIREBASE_AUTH_EMULATOR_HOST` с настоящими портами поднятых эмуляторов. Значит верный адрес
 * уже лежит в окружении — прибору незачем знать про слоты вовсе, ему достаточно перестать
 * настаивать на литерале. Умолчание сохранено ровно прежним: прямой запуск при поднятом штатном
 * стенде работает как раньше.
 */
const [FS_HOST, FS_PORT] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8181').split(':');
const AUTH_URL = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'}`;
const FIRESTORE = { host: FS_HOST, port: Number(FS_PORT) };
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
  // Клейм `admin` — зеркало боя: владелец несёт его с cutover 2026-07-12, и стенд обязан
  // уметь показывать админские ветки (дверь и дом панели, `plans/33`). Не-админа стенд
  // показывает дверями `?as=guest` / `?as=none` — у них клейма нет по построению.
  await authRequest(
    'accounts:update',
    { localId: uid, emailVerified: true, customAttributes: JSON.stringify({ admin: true }) },
    { Authorization: 'Bearer owner' },
  );
  return uid;
}

// ── 1б. Фотографии в эмулятор Storage (bugs/14): у стенда есть лица ─────────
//
// В бою фото живёт в Storage по пути `users/{uid}/avatar/avatar.webp` (EXP-0043).
// Стенд обязан уметь то же самое — иначе поведение фото (показ, лайтбокс) непроверяемо.
// «Фото» — детерминированный SVG-портрет: браузеру всё равно, а бинарники в репозитории
// не нужны. Content-Type честно svg — расширение пути наследие 1.x, роли не играет.

/*
 * Третий эмулятор той же тройки — и его адрес тоже берётся у окружения (`plans/69` шаг 5).
 *
 * 🔴 ЭТУ СТРОКУ Я ПРОПУСТИЛ, ПРАВЯ ДВЕ СОСЕДНИЕ, И НАШЁЛ ЕЁ ЖИВОЙ ПРОГОН, А НЕ ЧТЕНИЕ.
 * Firestore и Auth объявлены в начале файла и попались на глаза; Storage объявлен шестьюдесятью
 * строками ниже, у своей работы, — и обход «по названным в плане местам» его не увидел. Стенд
 * слота поднялся, сид дошёл до фотографий и умер с `ECONNREFUSED 127.0.0.1:9199`.
 * Урок ровно тот, что записан в каноне: инвентарь класса делается ГРЕПОМ по признаку, а не
 * памятью о том, где правил в прошлый раз.
 */
const STORAGE_URL = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199'}`;
const STORAGE_BUCKET = `${PROJECT_ID}.appspot.com`;

/** Условный портрет: цветной фон + силуэт. Достаточно, чтобы отличать людей на глаз. */
function avatarSvg(hue) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">',
    `<rect width="240" height="240" fill="hsl(${hue} 45% 40%)"/>`,
    `<circle cx="120" cy="92" r="46" fill="hsl(${hue} 55% 84%)"/>`,
    `<path d="M120 150c-52 0-88 32-88 78v12h176v-12c0-46-36-78-88-78z" fill="hsl(${hue} 55% 84%)"/>`,
    '</svg>',
  ].join('');
}

/** Кладёт фото в эмулятор Storage от имени администратора (Bearer owner — мимо правил). */
async function uploadAvatar(ownerUid, hue) {
  const name = encodeURIComponent(`users/${ownerUid}/avatar/avatar.webp`);
  const objects = `${STORAGE_URL}/v0/b/${STORAGE_BUCKET}/o`;

  const upload = await fetch(`${objects}?uploadType=media&name=${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/svg+xml', Authorization: 'Bearer owner' },
    body: avatarSvg(hue),
  });
  if (!upload.ok) {
    throw new Error(`загрузка аватара ${ownerUid}: ${upload.status} ${await upload.text()}`);
  }

  // Эмулятор ИГНОРИРУЕТ Content-Type при media-загрузке и пишет octet-stream, а SVG в <img>
  // без правильного MIME браузер не рендерит вовсе (поймано ГЛАЗАМИ на скриншоте QA-прогона:
  // в кружке был alt-текст, DOM-проверки при этом были зелёные). Тип чиним отдельным PATCH.
  const patch = await fetch(`${objects}/${name}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ contentType: 'image/svg+xml' }),
  });
  if (!patch.ok) {
    throw new Error(`метаданные аватара ${ownerUid}: ${patch.status} ${await patch.text()}`);
  }
}

// ── 2. Данные модели 2.0 ────────────────────────────────────────────────────

const now = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

/** Каталог осей: title/description двуязычные, рейтинг сообщества — как в DimDoc. */
const DIMS = {
  cats: {
    type: { ru: 'Явление', en: 'Phenomenon' }, year: '', tags: ['животные', 'дом'],
    title: { ru: 'Кошки', en: 'Cats' },
    description: { ru: 'Домашние кошки: насколько они «ваши» существа.', en: 'Domestic cats: how much they are “your” creatures.' },
    stars: 522, rates: 58, rating: 9,
  },
  travel: {
    type: { ru: 'Явление', en: 'Phenomenon' }, year: '', tags: ['дорога'],
    title: { ru: 'Путешествия', en: 'Travel' },
    description: { ru: 'Новые места, дороги и рюкзаки.', en: 'New places, roads and backpacks.' },
    stars: 217, rates: 31, rating: 7,
  },
  silence: {
    type: { ru: 'Явление', en: 'Phenomenon' }, year: '', tags: ['покой'],
    title: { ru: 'Тишина', en: 'Silence' },
    description: { ru: 'Ценность тишины и уединения.', en: 'The value of silence and solitude.' },
    stars: 74, rates: 12, rating: 6.2,
  },
  math: {
    type: { ru: 'Наука', en: 'Science' }, year: '', tags: ['наука'],
    title: { ru: 'Математика', en: 'Mathematics' },
    description: { ru: 'Красота строгих доказательств.', en: 'The beauty of rigorous proofs.' },
    stars: 73, rates: 9, rating: 8.1,
  },
  'taxi-driver-1976': {
    type: { ru: 'Фильм', en: 'Movie' }, year: '1976', tags: ['кино', 'драма'],
    author: { ru: 'Мартин Скорсезе', en: 'Martin Scorsese' },
    title: { ru: '«Таксист» (1976)', en: 'Taxi Driver (1976)' },
    description: {
      ru: 'Драма Мартина Скорсезе о ветеране Вьетнамской войны, работающем таксистом в Нью-Йорке.',
      en: 'Martin Scorsese’s drama about a Vietnam veteran driving a taxi in New York.',
    },
    stars: 37, rates: 4, rating: 9.3,
  },
  'alchemist-1988': {
    type: { ru: 'Роман', en: 'Novel' }, year: '1988', tags: ['книга'],
    author: { ru: 'Пауло Коэльо', en: 'Paulo Coelho' },
    title: { ru: '«Алхимик» (1988)', en: 'The Alchemist (1988)' },
    description: { ru: 'Роман Пауло Коэльо о пути к своей Личной Легенде.', en: 'Paulo Coelho’s novel about following your Personal Legend.' },
    stars: 30, rates: 3, rating: 10,
  },
  theatre: {
    type: { ru: 'Явление', en: 'Phenomenon' }, year: '', tags: ['искусство'],
    title: { ru: 'Театр', en: 'Theatre' },
    description: { ru: 'Живая сцена и всё, что на ней.', en: 'The living stage and everything on it.' },
    stars: 72, rates: 12, rating: 6,
  },
  running: {
    type: { ru: 'Спорт', en: 'Sport' }, year: '', tags: ['спорт'],
    title: { ru: 'Бег', en: 'Running' },
    description: { ru: 'Бег как привычка и удовольствие.', en: 'Running as a habit and a joy.' },
    stars: 44, rates: 8, rating: 5.5,
  },
  // ── Сор настоящих данных: имена, которые люди набивали руками (bugs/50) ──
  // Стенд обязан быть похож на бой ВКЛЮЧАЯ его сор (урок EXP-0041). Эти три измерения
  // несут ровно ту грязь, из-за которой поиск в 2.0 не находил существующее: «ё» вместо
  // «е», дефис внутри имени, римская цифра. На идеальных данных проверить нормализацию
  // поиска невозможно — стенд молча говорил бы, что всё хорошо.
  'star-wars-1977': {
    type: { ru: 'Фильм', en: 'Movie' }, year: '1977', tags: ['кино', 'фантастика'],
    author: { ru: 'Джордж Лукас', en: 'George Lucas' },
    title: { ru: '«Звёздные войны» (1977)', en: 'Star Wars (1977)' },
    description: { ru: 'Космическая опера Джорджа Лукаса.', en: 'George Lucas’ space opera.' },
    stars: 61, rates: 7, rating: 8.7,
  },
  'spider-man-2002': {
    type: { ru: 'Фильм', en: 'Movie' }, year: '2002', tags: ['кино', 'комикс'],
    author: { ru: 'Сэм Рэйми', en: 'Sam Raimi' },
    title: { ru: '«Человек-паук» (2002)', en: 'Spider-Man (2002)' },
    description: { ru: 'Экранизация комикса о Питере Паркере.', en: 'The Peter Parker comic on screen.' },
    stars: 42, rates: 6, rating: 7,
  },
  'rocky-4-1985': {
    type: { ru: 'Фильм', en: 'Movie' }, year: '1985', tags: ['кино', 'спорт'],
    author: { ru: 'Сильвестр Сталлоне', en: 'Sylvester Stallone' },
    title: { ru: 'Рокки IV (1985)', en: 'Rocky IV (1985)' },
    description: { ru: 'Четвёртая часть саги о боксёре.', en: 'The fourth part of the boxer saga.' },
    stars: 25, rates: 5, rating: 5,
  },
  // Год-ПРОЧЕРК — сор боевого каталога (`ideas/26` п.2): 170 боевых записей несут year: '-'
  // (почти все — вид «Практика»). Прочерк означает «года нет», и карточка не должна рисовать
  // элемент года. Без этой пробы стенд не умел показывать дефект вовсе (EXP-0041).
  yoga: {
    type: { ru: 'Практика', en: 'Practice' }, year: '-', tags: ['практика', 'здоровье'],
    title: { ru: 'Йога', en: 'Yoga' },
    description: { ru: 'Практика тела и внимания.', en: 'A practice of body and attention.' },
    stars: 18, rates: 3, rating: 6,
  },
  // Измерение, появившееся «сегодня»: без него виджету «Сегодня» на экране
  // «Пространство» нечего было бы рассказать про новые измерения.
  'early-rising': {
    type: { ru: 'Привычка', en: 'Habit' }, year: '', tags: ['режим'],
    title: { ru: 'Ранние подъёмы', en: 'Early rising' },
    description: { ru: 'Утро начинается до рассвета.', en: 'The day starts before dawn.' },
    stars: 0, rates: 0, rating: 0,
  },
};

// Массовка каталога: боевой каталог — 5111 измерений, и ленты живут ПОРЦИЯМИ. На девяти
// карточках прогрессивную подгрузку (bugs/13) не проверить вовсе — стенд врал бы, что
// «всё влезло». Часть проб — с голосами сообщества, часть без (высота карточек, bugs/15).
for (let i = 1; i <= 36; i += 1) {
  DIMS[`probe-${String(i).padStart(2, '0')}`] = {
    type: { ru: 'Явление', en: 'Phenomenon' }, year: '', tags: ['проба'],
    title: { ru: `Проба ${i}`, en: `Probe ${i}` },
    description: {
      ru: `Служебное измерение стенда №${i} — массовка для прокрутки лент.`,
      en: `Stand probe dimension #${i} — crowd filler for feed scrolling.`,
    },
    stars: i % 3 === 0 ? 0 : i * 7,
    rates: i % 3 === 0 ? 0 : (i % 5) + 1,
    rating: i % 3 === 0 ? 0 : Math.round(((i % 10) + 1) * 0.9 * 10) / 10,
  };
}

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
  // Фото ЕСТЬ (bugs/14): сам файл сид кладёт в эмулятор Storage, здесь — только флаг,
  // ровно как в бою (EXP-0043).
  avatar: true,
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
 * Гости стенда: соседи по Пространству со своими точками — пища для сервера синхронизации связей.
 * Auth-пользователи им не нужны: сервер синхронизации ходит по points/, экран связей читает
 * relations владельца и profile/everyone гостей.
 */
const GUESTS = {
  'stand-guest-anna': {
    name: { ru: 'Анна', en: 'Anna' },
    ratings: { cats: 9, silence: 8, theatre: 6, travel: 7 },
    // У Анны есть фото (bugs/14): флаг в её публичном бакете + файл в эмуляторе Storage —
    // «Связи» показывают лицо, тап открывает его во весь экран.
    avatar: true,
    // Анна открыла ВСЕМ ещё и себя: гендер, дату рождения, «о себе». Без такого соседа
    // раскрытая карточка связи (bugs/46) на стенде выглядела бы пустой — и стенд не смог бы
    // показать разницу между «поле скрыто» и «поля нет» (EXP-0041: стенд обязан быть похож
    // на бой, включая его сор И его полноту).
    gender: 'w',
    born: { year: 1990, month: 11, day: 2 },
    about: { ru: 'Люблю тишину и театр.', en: 'I love silence and theatre.' },
  },
  'stand-guest-viktor': {
    name: { ru: 'Виктор', en: 'Viktor' },
    ratings: { travel: 10, math: 7, cats: 3, running: 5 },
    // Виктор указал только год рождения — возраст по неполной дате НЕ достраивается.
    born: { year: 1979, month: null, day: null },
  },
  'stand-guest-maria': {
    name: { ru: 'Мария', en: 'Maria' },
    ratings: { silence: 2, cats: 10, travel: 8, math: 9, theatre: 4 },
    // Мария не открыла о себе ничего: в её карточке блока «Персональная информация»
    // быть не должно вовсе — ни строк, ни прочерков.
  },
};

// ── 3. Запись в Firestore (правила отключены: сид — это роль сервера синхронизации) ──

const env = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: FIRESTORE,
});

try {
  const uid = await ensureDevUser();

  // Лица стенда: владелец и Анна (bugs/14). Файлы — в эмулятор Storage, флаги — ниже.
  await uploadAvatar(uid, 213);
  await uploadAvatar('stand-guest-anna', 8);

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    /*
     * 🔴 ВОЗРАСТ ИЗМЕРЕНИЯ СЕЕТСЯ В ДВУХ ФОРМАХ — И ЭТО НЕ ПРИХОТЬ (`bugs/109`).
     *
     * До 2026-08-02 стенд знал ровно одну форму — ПЛОСКОЕ поле `created` (миллисекунды).
     * В бою такой формы нет ни у одного документа: каталог пришёл из 1.x, где возраст лежит
     * во вложенном `time.created` (Timestamp), а миграция его не трогала. Значит стенд
     * моделировал данные, КОТОРЫХ НЕ СУЩЕСТВУЕТ, и запрос сервера синхронизации «какие измерения
     * появились за сутки» на стенде работал, а в бою не находил ничего никогда.
     *
     * Ни один тест этого поймать не мог: все они смотрели на стендовую форму. Дефект нашёлся
     * чтением кода и был воспроизведён прибором `sync-server/measure-dims-index.mjs`.
     *
     * Теперь обе формы живут рядом, как в реальности: боевая — у большинства, стендовая — у
     * нескольких проб. Проверка, зелёная на одной форме и красная на другой, — это находка,
     * а не поломка сида.
     */
    let flatShaped = 0;
    for (const [dimId, dim] of Object.entries(DIMS)) {
      const created = now - (FRESH_DIMS.has(dimId) ? 3 * 60 * 60 * 1000 : 60 * DAY_MS);
      // Плоскую форму оставляем только трём пробам — ради самой возможности сравнить формы.
      const flat = flatShaped < 3 && dimId.startsWith('probe-');
      if (flat) flatShaped += 1;
      await db.doc(`dims/${dimId}`).set(
        flat ? { ...dim, created } : { ...dim, time: { created: Timestamp.fromMillis(created) } },
      );
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
    // ИНДЕКС КАТАЛОГА — ровно в той форме, что в боевой базе: JSON-СТРОКА `{id: {ru, en, year}}`.
    // Это не «сор», а опора: экран «Измерения» строит по нему ленту и поиск ОДНИМ чтением
    // вместо 5111 (принцип владельца — экономить запросы к базе). Заодно у него нет `title` —
    // и экран обязан это пережить (именно такой документ уронил профиль на выкате, EXP-0041).
    const index = Object.fromEntries(
      Object.entries(DIMS).map(([dimId, dim]) => [
        dimId,
        { ru: dim.title.ru, en: dim.title.en, year: dim.year ?? '' },
      ]),
    );
    await db.doc('dims/dims_list').set({ dims_list: JSON.stringify(index) });

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

    // NDim ID владельца стенда — «обновлённый»: серверу синхронизации есть что пересчитать сразу.
    await db.doc(`points/${uid}`).set({ dirty: true, updated: now, lastSync: null });
    for (const [dimId, value] of Object.entries(MY_RATINGS)) {
      await db.doc(`points/${uid}/dims/${dimId}`).set({ value });
    }

    // Гости: публичная карточка (profile/everyone) + точка с оценками.
    for (const [guestUid, guest] of Object.entries(GUESTS)) {
      await db.doc(`users/${guestUid}`).set({
        visibility: guest.avatar ? { name: 'everyone', avatar: 'everyone' } : { name: 'everyone' },
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
        // Флаг фото — в публичном бакете: его читают «Связи» (guestAvatar).
        ...(guest.avatar ? { avatar: true } : {}),
        // Персональное — только то, что человек открыл всем (bugs/46). Чего нет в бакете,
        // того зритель не увидит: это и есть модель видимости 2.0.
        ...(guest.gender ? { gender: guest.gender } : {}),
        ...(guest.born ? { born: guest.born } : {}),
        ...(guest.about ? { about: guest.about } : {}),
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

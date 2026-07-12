// Вычислитель связей NDim Space 2.0 (фаза 4 мастер-плана).
// В интерфейсе он называется «Сервер синхронизации» — термин 1.x (AGENT_GUIDE → словарь).
//
// Фоновая пакетная задача: находит «грязные» точки (человек изменил оценки),
// пересчитывает их связи со всеми остальными людьми ядром похожести и пишет
// топ-250 в relations/{uid}. Обновляет и топы ВСЕХ соседей: изменение точки A
// меняет связь A в каждом чужом топе.
//
// Он же — ЕДИНСТВЕННЫЙ продюсер статистики Пространства (ideas/06): раз он и так
// обходит все точки, ему дёшево записать агрегаты в space/stats, снимок дня в
// space/stats/daily/{дата} и своё сердцебиение в space/server. Считает их чистый
// модуль src/lib/model/stats.ts — тот же, которым экран читает эти цифры.
//
// Архитектура (интервью №001, В3): работает в Docker, ТОЛЬКО исходящие соединения.
// Клиенту запись в relations запрещена правилами; вычислитель ходит через Admin SDK
// (правила не применяются) — поэтому этот код НИКОГДА не попадает в браузер.
//
// Окружения:
//   · дев (сейчас): эмулятор Firestore. Для demo-* проекта адрес эмулятора
//     подставляется сам; на боевой Firestore такой конфиг физически не смотрит.
//   · прод (после миграции на домашний ПК владельца): GOOGLE_APPLICATION_CREDENTIALS
//     с ключом сервисного аккаунта + FIREBASE_PROJECT_ID=ndim-space.
//
// Запуск: node calculator/index.mjs --once   (один цикл — для стенда и тестов)
//         node calculator/index.mjs          (цикл каждые CALC_INTERVAL_SECONDS, деф. 60)
//
// Масштабирование: сейчас пересчёт «dirty × все» читает все точки разом — это честный
// O(N·M), терпимый до тысяч людей. Уход к инкрементальной схеме — задача фазы 4+,
// зафиксирована в MASTER_PLAN.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { computeRelation } from '../src/lib/similarity/similarity.ts';
import { computeSpaceStats, dayKey, snapshotOf } from '../src/lib/model/stats.ts';

/** Сколько похожих людей храним в топе. Паритет с 1.x. */
const TOP_LIMIT = 250;
/** Версия формата relations-документа. */
const RELATIONS_VERSION = 2;
/** Измерение считается новым для виджета «Сегодня» первые сутки после появления. */
const NEW_DIM_WINDOW_MS = 24 * 60 * 60 * 1000;

// Версия сервера синхронизации — из его package.json; билд и дату сборки проставляет
// Docker при сборке образа (ideas/07: механика номеров билдов общая с приложением).
// Дефолты честные: локальный запуск — это `dev`, а не «билд 118».
const { version: SERVER_VERSION } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
);
const SERVER_BUILD = process.env.CALC_BUILD ?? 'dev';
const SERVER_BUILT_AT = process.env.CALC_BUILT_AT ?? null;
/**
 * Через сколько дней бездействия данные анонимного гостя считаются осиротевшими.
 * Совпадает со сроком автоудаления брошенных анонимных аккаунтов в Firebase
 * (researches/10 §2.4): сам аккаунт умирает без нас, а его Firestore-данные — наша работа.
 */
const GUEST_TTL_DAYS = 30;

const projectId = process.env.FIREBASE_PROJECT_ID ?? 'demo-ndim-dev';

// Проект demo-* живёт только в эмуляторе. Если адрес эмулятора не задан — подставляем
// локальный по умолчанию, чтобы вычислитель случайно не потянулся в боевой Firestore.
if (projectId.startsWith('demo-') && !process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
}

initializeApp({ projectId });
const db = getFirestore();

const log = (message) => console.log(`[calc ${new Date().toISOString()}] ${message}`);

/**
 * Читает точки всех людей: uid → { ratings: { dimId: value }, anonymous: boolean }.
 *
 * ⚠️ Не путать два слова «гость». Флаг `guest: true` на документе points/{uid} —
 * это АНОНИМНЫЙ гость (plans/03, этап 2): правила гарантируют честность флага
 * (honestGuestFlag в firestore.rules). А `guestUid` в записях топа — «другой человек
 * связи», наследие формата 1.x. Чтобы не смешивать, внутри вычислителя аноним
 * называется `anonymous`.
 */
async function loadAllPoints() {
  const points = new Map();
  const owners = await db.collection('points').get();
  await Promise.all(
    owners.docs.map(async (owner) => {
      const dims = await owner.ref.collection('dims').get();
      const ratings = {};
      for (const dim of dims.docs) ratings[dim.id] = dim.data().value;
      const data = owner.data();
      points.set(owner.id, {
        ratings,
        anonymous: data.guest === true,
        // Для статистики Пространства: когда человек последний раз менял оценки и когда
        // сервер синхронизации впервые его увидел (firstSeen ставит он сам, ниже).
        updated: typeof data.updated === 'number' ? data.updated : null,
        firstSeen: typeof data.firstSeen === 'number' ? data.firstSeen : null,
      });
    }),
  );
  return points;
}

/**
 * Каталог измерений: сколько их всего и какие появились за сутки (для виджета «Сегодня»).
 *
 * Каталог читается АГРЕГАЦИЕЙ, а не выгрузкой: в 1.x измерений было больше пяти тысяч, и
 * тянуть их целиком ради одного числа — платить за каждый документ на каждом цикле.
 * У измерения без поля `created` (наследие 1.x до миграции) возраст неизвестен — тогда оно
 * просто не считается новым, и это честнее, чем объявить новым всё сразу.
 */
async function loadDims(now) {
  const catalog = db.collection('dims');
  const [count, fresh] = await Promise.all([
    catalog.count().get(),
    catalog.where('created', '>=', now - NEW_DIM_WINDOW_MS).get(),
  ]);
  return {
    dimsCount: count.data().count,
    newDims: fresh.docs.map((dim) => ({ id: dim.id, title: dim.data().title })),
  };
}

/**
 * Следит за ИНДЕКСОМ КАТАЛОГА — `dims/dims_list`.
 *
 * Индекс — это один документ с JSON-строкой `{dimId: {ru, en, year}}` по всем измерениям.
 * На нём держится экран «Измерения»: одно чтение вместо 5111 (принцип владельца — экономить
 * запросы к базе). Наследие 1.x, и очень удачное.
 *
 * Но у индекса есть цена: он может ПРОТУХНУТЬ. Заведут новое измерение — а в индексе его нет,
 * и человек не увидит его НИКОГДА. Поэтому индекс держит тот, кто и так обходит каталог, —
 * сервер синхронизации.
 *
 * Пересобираем только когда размеры разошлись: перечитывать 5111 документов каждый цикл — ровно
 * то расточительство, против которого индекс и заведён. Сам `dims_list` в индекс не входит,
 * поэтому в каталоге на один документ больше.
 */
async function ensureDimsIndex(dimsCount) {
  const ref = db.doc('dims/dims_list');
  const snapshot = await ref.get();

  let indexed = -1;
  try {
    indexed = Object.keys(JSON.parse(snapshot.data()?.dims_list ?? '{}')).length;
  } catch {
    indexed = -1; // битый индекс — пересоберём
  }

  if (indexed === dimsCount - 1) return; // всё сходится, каталог не менялся

  const catalog = await db.collection('dims').get();
  const index = {};
  for (const dim of catalog.docs) {
    if (dim.id === 'dims_list') continue; // индекс не индексирует сам себя
    const data = dim.data();
    if (!data.title || typeof data.title !== 'object') continue; // без названия показывать нечего
    index[dim.id] = { ru: data.title.ru ?? null, en: data.title.en ?? null, year: data.year ?? '' };
  }

  await ref.set({ dims_list: JSON.stringify(index) }, { merge: true });
  log(`индекс каталога пересобран: было ${indexed}, стало ${Object.keys(index).length} измерений`);
}

/**
 * Топ связей одного владельца против остальных точек.
 * Анонимные гости НЕ кандидаты ни в чей топ (В3: гость невидим другим) — но сам
 * владелец-гость получает свой топ против публичных точек на общих основаниях.
 */
function topFor(ownerUid, points) {
  const ownerDims = points.get(ownerUid).ratings;
  const top = [];
  for (const [otherUid, other] of points) {
    if (otherUid === ownerUid) continue;
    if (other.anonymous) continue; // гостя не видит никто — даже другой гость
    const relation = computeRelation(ownerDims, other.ratings);
    if (relation !== null) top.push({ ...relation, guestUid: otherUid });
  }
  top.sort((a, b) => b.similarity - a.similarity);
  return top.slice(0, TOP_LIMIT);
}

/**
 * Удаляет данные осиротевших гостей: guest-точки, которых вычислитель не трогал
 * GUEST_TTL_DAYS (lastSync — поле вычислителя, любое действие гостя обновляет его
 * через dirty-цикл). Уважительная асимметрия: труд ПОЛНОЦЕННЫХ людей не удаляется
 * никогда, гость же сам выбрал не сохраняться. Возвращает число вычищенных гостей.
 *
 * Запрос нарочно один и простой (guest == true, гостей мало) — dirty и срок
 * проверяются в коде, чтобы не требовать составного индекса на боевом Firestore.
 */
export async function cleanupStaleGuests(now = Date.now()) {
  const cutoff = now - GUEST_TTL_DAYS * 24 * 60 * 60 * 1000;
  const guests = await db.collection('points').where('guest', '==', true).get();

  let removed = 0;
  for (const point of guests.docs) {
    const { dirty, lastSync } = point.data();
    if (dirty === true) continue; // ждёт пересчёта — точно не сирота
    if (typeof lastSync !== 'number' || lastSync >= cutoff) continue;

    // Всё, что гость успел накопить: точка с оценками, его топ, его users-дерево
    // (приватные бакеты, настройки). recursiveDelete добирает подколлекции.
    await db.recursiveDelete(point.ref);
    await db.doc(`relations/${point.id}`).delete();
    await db.recursiveDelete(db.doc(`users/${point.id}`));
    removed += 1;
    log(`гость ${point.id} осиротел (> ${GUEST_TTL_DAYS} дн.) — данные вычищены`);
  }

  return removed;
}

/**
 * Сердцебиение сервера синхронизации: `space/server`.
 *
 * Пишется КАЖДЫЙ цикл, даже когда пересчитывать нечего, — по свежести этой отметки экран
 * и понимает, что сервер работает (`syncServerState` в model/stats.ts). Состояния
 * «остановлен» здесь нет: остановленный сервер не смог бы его записать.
 * Поля успешной синхронизации обновляются только в цикле, где связи действительно считались.
 */
async function reportServer(now, success = null) {
  await db.doc('space/server').set(
    {
      version: SERVER_VERSION,
      build: SERVER_BUILD,
      builtAt: SERVER_BUILT_AT,
      lastRunAt: now,
      intervalSeconds: Number(process.env.CALC_INTERVAL_SECONDS ?? 60),
      ...(success ?? {}),
    },
    { merge: true },
  );
}

/** Один цикл пересчёта. Возвращает число пересчитанных владельцев. */
export async function runCycle() {
  // Сначала гигиена: осиротевшие гости не должны попасть в пересчёт.
  await cleanupStaleGuests();

  const startedAt = Date.now();
  const dirtySnap = await db.collection('points').where('dirty', '==', true).get();
  if (dirtySnap.empty) {
    log('грязных точек нет — пересчитывать нечего');
    // Пересчитывать нечего, но человек на экране «Пространство» должен видеть, что сервер
    // на месте. Агрегаты при этом не трогаем: Пространство не менялось — не менялись и они.
    await reportServer(startedAt);
    return 0;
  }

  const dirtyUids = dirtySnap.docs.map((doc) => doc.id);
  log(`грязных точек: ${dirtyUids.length} (${dirtyUids.join(', ')})`);

  const [points, { dimsCount, newDims }] = await Promise.all([loadAllPoints(), loadDims(startedAt)]);

  // Индекс каталога обязан поспевать за каталогом: на нём держится экран «Измерения».
  await ensureDimsIndex(dimsCount);
  const now = Date.now();
  const batch = db.batch();

  // firstSeen — отметка «сервер синхронизации увидел эту точку впервые»; на ней держится
  // счётчик «Новых за последние 30 дней». Ставим ДО расчёта статистики, чтобы человек,
  // пришедший только что, попал в неё уже сегодня, а не через цикл.
  for (const uid of dirtyUids) {
    const point = points.get(uid);
    if (point && point.firstSeen === null) point.firstSeen = now;
  }

  // Изменение точки A меняет связь с A у каждого: пересчитываем топы ВСЕХ,
  // у кого есть оценки. При «dirty × все» это не дороже точечных вставок,
  // зато код очевиден и не умеет рассинхронизироваться.
  let recomputed = 0;
  const similarities = [];
  for (const [uid, point] of points) {
    if (Object.keys(point.ratings).length === 0) continue;
    const top = topFor(uid, points);
    batch.set(db.doc(`relations/${uid}`), {
      computedAt: now,
      version: RELATIONS_VERSION,
      top,
    });
    recomputed += 1;
    // «Связей рассчитано» и средняя похожесть — про Пространство, а гостя в Пространстве
    // не видно (В3). Его собственный топ мы считаем и пишем, но в статистику не пускаем.
    if (!point.anonymous) similarities.push(...top.map((entry) => entry.similarity));
  }

  for (const uid of dirtyUids) {
    const firstSeen = points.get(uid)?.firstSeen ?? now;
    batch.set(db.doc(`points/${uid}`), { dirty: false, lastSync: now, firstSeen }, { merge: true });
  }

  // Статистика Пространства и снимок дня — тем же батчем, что и топы: цифры на витрине
  // обязаны описывать ровно ту синхронизацию, которая только что случилась.
  //
  // Агрегатору нужно ЧИСЛО оценок человека, а не сами оценки: он считает Пространство,
  // а не связи. Точку сворачиваем в сводку здесь — модель model/stats.ts о Firestore
  // не знает и знать не должна.
  const summaries = [...points.values()].map((point) => ({
    ratings: Object.keys(point.ratings).length,
    anonymous: point.anonymous,
    updated: point.updated,
    firstSeen: point.firstSeen,
  }));
  const stats = computeSpaceStats({ points: summaries, dimsCount, newDims, similarities }, now);
  batch.set(db.doc('space/stats'), stats);
  batch.set(db.doc(`space/stats/daily/${dayKey(now)}`), snapshotOf(stats));

  await batch.commit();

  await reportServer(now, {
    lastSuccessAt: now,
    durationMs: Date.now() - startedAt,
    usersSynced: recomputed,
    relationsComputed: similarities.length,
  });

  log(
    `готово: пересчитано топов — ${recomputed}, флаг dirty снят у ${dirtyUids.length}; ` +
      `в Пространстве людей ${stats.people}, измерений ${stats.dims}, связей рассчитано ${stats.relations}`,
  );
  return recomputed;
}

// ── Точка входа ──────────────────────────────────────────────────────────────
// Срабатывает только при прямом запуске файла. При импорте (тесты) модуль лишь
// отдаёт runCycle и ничего не запускает — иначе тест поднял бы вечную службу.

const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (runDirectly) {
  const once = process.argv.includes('--once');
  const intervalSeconds = Number(process.env.CALC_INTERVAL_SECONDS ?? 60);

  log(`старт: проект ${projectId}, эмулятор: ${process.env.FIRESTORE_EMULATOR_HOST ?? 'нет (боевой Firestore)'}`);

  if (once) {
    await runCycle();
  } else {
    log(`режим службы: цикл каждые ${intervalSeconds} с`);
    await runCycle();
    setInterval(() => {
      runCycle().catch((error) => log(`ошибка цикла: ${error.message}`));
    }, intervalSeconds * 1000);
  }
}

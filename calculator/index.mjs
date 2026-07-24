// Вычислитель связей NDim Space 2.0 (фаза 4 мастер-плана).
// В интерфейсе он называется «Сервер синхронизации» — термин 1.x (AGENT_GUIDE → словарь).
//
// Фоновая пакетная задача: находит «грязные» точки (человек изменил оценки),
// пересчитывает связи ядром похожести и пишет топ-250 в relations/{uid}.
//
// ЭКОНОМИЯ ЗАПРОСОВ — принцип автора из 1.x (ideas/14, устройство 1.x — researches/13).
// Запросы к Firestore стоят денег, вычисления в памяти — нет. Поэтому:
//   · точки живут в КЭШЕ ПРОЦЕССА: полное чтение — только в полном проходе (раз в сутки
//     и первым циклом после старта), дальше дочитываются ТОЛЬКО грязные точки;
//   · топы пересчитываются в памяти ВСЕМ (CPU дёшев, код очевиден), а ПИШУТСЯ только
//     изменившимся: в обычном цикле — грязным точкам, в полном проходе — каждому, чей
//     топ разошёлся с последней записью. Наследие контракта свежести 1.x: свой топ —
//     быстро, появление в чужих топах — в течение суток (researches/13 §5);
//   · тихий период: точку, которую человек менял только что, цикл не трогает — он ещё
//     оценивает; одна сессия оценивания = один пересчёт (в 1.x эту партию собирал
//     часовой цикл). Полный проход тихий период игнорирует;
//   · ОКНО НОВИЧКА (ideas/05): первая ценность важнее экономии. Пока точка молода
//     (первый расчёт ещё не случился или firstSeen моложе CALC_NEWCOMER_MINUTES),
//     тихий период на неё не действует: первый топ — уже следующим циклом после первой
//     оценки, и всю первую сессию топ освежается каждым циклом. В 1.x новички ждали
//     до часа и жаловались, что связей нет, — отсюда и идея;
//   · гигиена осиротевших гостей — раз в сутки (в полном проходе), а не каждую минуту;
//   · холостой цикл стоит один запрос (выборка dirty) и одну запись (сердцебиение).
//
// Он же — ЕДИНСТВЕННЫЙ продюсер статистики Пространства (ideas/06): в цикле с пересчётом
// пишет агрегаты в space/stats, снимок дня в space/stats/daily/{дата} и своё сердцебиение
// в space/server. Считает их чистый модуль src/lib/model/stats.ts — тот же, которым экран
// читает эти цифры. Сердцебиение пишется КАЖДЫЙ цикл — по его свежести экран отличает
// «Работает» от «Не отвечает» (bugs/33), это осознанная цена: 1 запись в цикл.
//
// Архитектура (интервью №001, В3): работает в Docker, ТОЛЬКО исходящие соединения.
// Клиенту запись в relations запрещена правилами; вычислитель ходит через Admin SDK
// (правила не применяются) — поэтому этот код НИКОГДА не попадает в браузер.
//
// Окружения:
//   · дев (сейчас): эмулятор Firestore. Для demo-* проекта адрес эмулятора
//     подставляется сам; на боевой Firestore такой конфиг физически не смотрит.
//   · прод (домашний ПК владельца): GOOGLE_APPLICATION_CREDENTIALS с ключом сервисного
//     аккаунта + FIREBASE_PROJECT_ID=ndim-space.
//
// Запуск: node calculator/index.mjs --once   (один цикл — для стенда и тестов)
//         node calculator/index.mjs          (цикл каждые CALC_INTERVAL_SECONDS, деф. 60)
// Ручки:  CALC_QUIET_SECONDS     — тихий период, с (деф. 120; стенд ставит 0 — там человек
//                                  не должен ждать, tools/stand.mjs)
//         CALC_FULL_SYNC_HOURS   — период полного прохода, ч (деф. 24)
//         CALC_NEWCOMER_MINUTES  — окно новичка без тихого периода, мин (деф. 30)
//
// Масштабирование: чтения и записи — O(изменившегося за цикл); память и CPU пересчёта —
// O(N²·оценок) в цикле с пересчётом, терпимо до тысяч людей. Дальше — инкрементальная
// математика, задача фазы 4+ (MASTER_PLAN).

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
/** Firestore не принимает больше 500 операций в батче — режем с запасом (как tools/migrate). */
const BATCH_LIMIT = 400;

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

/** Тихий период: точка, изменённая менее QUIET_MS назад, ждёт — человек ещё оценивает. */
const QUIET_MS = Number(process.env.CALC_QUIET_SECONDS ?? 120) * 1000;
/** Окно новичка: столько после первого расчёта тихий период на точку не действует. */
const NEWCOMER_MS = Number(process.env.CALC_NEWCOMER_MINUTES ?? 30) * 60 * 1000;
/** Период полного прохода (перечитать всё, дописать ленивые топы, вычистить гостей). */
const FULL_SYNC_MS = Number(process.env.CALC_FULL_SYNC_HOURS ?? 24) * 60 * 60 * 1000;

const projectId = process.env.FIREBASE_PROJECT_ID ?? 'demo-ndim-dev';

// Проект demo-* живёт только в эмуляторе. Если адрес эмулятора не задан — подставляем
// локальный по умолчанию, чтобы вычислитель случайно не потянулся в боевой Firestore.
if (projectId.startsWith('demo-') && !process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
}

initializeApp({ projectId });
const db = getFirestore();

const log = (message) => console.log(`[calc ${new Date().toISOString()}] ${message}`);

// ── Кэш процесса ─────────────────────────────────────────────────────────────
// Вычислитель — единственный писатель relations и единственный полный читатель точек,
// поэтому кэшу можно верить между циклами. Любые изменения точек проходят через флаг
// dirty (клиент ставит его при каждой правке оценок — src/lib/data/profile.ts), а от
// правок мимо флага (консоль, инструменты) кэш лечится суточным полным проходом.

/** uid → { ratings, anonymous, updated, firstSeen }. null — ещё не загружался. */
let pointsCache = null;
/** uid → канонический текст последнего ЗАПИСАННОГО топа. Что в этой мапе — то и в базе. */
let writtenTops = null;
/** Последний счёт людей, ушедший в space/public_metrics: пишем только когда изменился. */
let lastPublishedPeople = null;
/** Когда был последний полный проход. 0 — не было: первый цикл процесса всегда полный. */
let lastFullPassAt = 0;

/**
 * Детерминированная сериализация для сравнения топов: JSON.stringify зависит от порядка
 * ключей, а Firestore возвращает карты в своём порядке — без сортировки diff всегда
 * «видел» бы изменения и переписывал всё.
 */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const body = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',');
    return `{${body}}`;
  }
  return JSON.stringify(value);
}

/** Канонический текст топа для diff: computedAt в сравнении не участвует. */
const topFingerprint = (top) => stableStringify({ version: RELATIONS_VERSION, top });

/**
 * Собирает точку из её документа и подколлекции оценок.
 *
 * ⚠️ Не путать два слова «гость». Флаг `guest: true` на документе points/{uid} —
 * это АНОНИМНЫЙ гость (plans/03, этап 2): правила гарантируют честность флага
 * (honestGuestFlag в firestore.rules). А `guestUid` в записях топа — «другой человек
 * связи», наследие формата 1.x. Чтобы не смешивать, внутри вычислителя аноним
 * называется `anonymous`.
 */
async function loadPoint(owner) {
  const dims = await owner.ref.collection('dims').get();
  const ratings = {};
  for (const dim of dims.docs) ratings[dim.id] = dim.data().value;
  const data = owner.data();
  return {
    ratings,
    anonymous: data.guest === true,
    // Для статистики Пространства: когда человек последний раз менял оценки и когда
    // сервер синхронизации впервые его увидел (firstSeen ставит он сам, ниже).
    updated: typeof data.updated === 'number' ? data.updated : null,
    firstSeen: typeof data.firstSeen === 'number' ? data.firstSeen : null,
  };
}

/** Читает точки всех людей — только в полном проходе; между ними живёт кэш. */
async function loadAllPoints() {
  const points = new Map();
  const owners = await db.collection('points').get();
  await Promise.all(owners.docs.map(async (owner) => points.set(owner.id, await loadPoint(owner))));
  return points;
}

/**
 * Восстанавливает память о записанных топах после старта процесса: одно чтение коллекции
 * relations вместо слепой перезаписи всех топов (чтение втрое дешевле записи).
 */
async function seedWrittenTops() {
  const snapshot = await db.collection('relations').get();
  const map = new Map();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    map.set(doc.id, stableStringify({ version: data.version ?? null, top: data.top ?? null }));
  }
  return map;
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
 * Вызывается в полном проходе (раз в сутки): при TTL в 30 дней минутная точность —
 * расточительство, ровно против которого идея 14. Запрос нарочно один и простой
 * (guest == true, гостей мало) — dirty и срок проверяются в коде, чтобы не требовать
 * составного индекса на боевом Firestore.
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
    pointsCache?.delete(point.id);
    writtenTops?.delete(point.id);
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

/** Пишет операции пачками по BATCH_LIMIT: полный проход большого Пространства не влезает в один батч. */
async function commitInChunks(writes) {
  for (let start = 0; start < writes.length; start += BATCH_LIMIT) {
    const batch = db.batch();
    for (const write of writes.slice(start, start + BATCH_LIMIT)) write(batch);
    await batch.commit();
  }
}

/** Один цикл пересчёта. Возвращает число записанных топов. */
export async function runCycle() {
  const startedAt = Date.now();

  // Полный проход — наследник first_sync/daily_sync 1.x (researches/13 §4): первым циклом
  // процесса и далее раз в FULL_SYNC_MS. Перечитывает все точки (лечит кэш от правок мимо
  // флага dirty), вычищает осиротевших гостей и дописывает «ленивые» чужие топы, которые
  // обычные циклы намеренно не трогали.
  const fullPass = startedAt - lastFullPassAt >= FULL_SYNC_MS;
  if (fullPass) {
    await cleanupStaleGuests(startedAt); // до перечитки: сироты не должны попасть в кэш
    pointsCache = await loadAllPoints();
    if (writtenTops === null) writtenTops = await seedWrittenTops();
    lastFullPassAt = startedAt;
    log(`полный проход: в Пространстве точек — ${pointsCache.size}`);
  }

  const dirtySnap = await db.collection('points').where('dirty', '==', true).get();

  // Тихий период: точку, которую меняли только что, не трогаем — человек ещё оценивает,
  // пересчитывать после каждого тапа расточительно (в 1.x эту партию собирал часовой цикл).
  // Исключения: ОКНО НОВИЧКА (ideas/05) — пока firstSeen пуст или молод, человек ждёт свою
  // ПЕРВУЮ ценность, и тихий период на него не действует (первый топ — ближайшим циклом,
  // всю первую сессию топ свежий; окно якорится на первой оценке, а не на регистрации —
  // так оно достаётся и тому, кто начал оценивать назавтра). И полный проход забирает
  // всех: суточная партия важнее недописанной сессии.
  const ready = [];
  let deferred = 0;
  for (const doc of dirtySnap.docs) {
    const { updated, firstSeen } = doc.data();
    const young = typeof firstSeen !== 'number' || startedAt - firstSeen < NEWCOMER_MS;
    const resting = typeof updated === 'number' && startedAt - updated < QUIET_MS;
    if (!fullPass && !young && resting) deferred += 1;
    else ready.push(doc);
  }

  if (!fullPass && ready.length === 0) {
    log(
      deferred > 0
        ? `тихий период: человек ещё оценивает, отложено точек — ${deferred}`
        : 'грязных точек нет — пересчитывать нечего',
    );
    // Пересчёта не было, но человек на экране «Пространство» должен видеть, что сервер
    // на месте. ХОЛОСТОЙ ЦИКЛ — ТОЖЕ УСПЕХ (bugs/33): без свежего lastSuccessAt владелец
    // читал спокойное Пространство как «сервер не работает». Больше ничего холостой цикл
    // не пишет и не читает — это и есть его цена: один запрос, одна запись.
    await reportServer(startedAt, { lastSuccessAt: startedAt });
    return 0;
  }

  const readyUids = ready.map((doc) => doc.id);
  if (readyUids.length > 0) {
    log(`грязных точек: ${readyUids.length} (${readyUids.join(', ')})${deferred ? `, отложено тихим периодом: ${deferred}` : ''}`);
  }

  // Дельта-чтение — сердце экономии: из базы дочитываются ТОЛЬКО изменившиеся точки,
  // остальные уже в кэше (в полном проходе свежо всё — дочитывать нечего). Каталог
  // измерений — параллельно.
  const [{ dimsCount, newDims }] = await Promise.all([
    loadDims(startedAt),
    ...(fullPass ? [] : ready.map(async (doc) => pointsCache.set(doc.id, await loadPoint(doc)))),
  ]);

  // Индекс каталога обязан поспевать за каталогом: на нём держится экран «Измерения».
  await ensureDimsIndex(dimsCount);
  const now = Date.now();

  // firstSeen — отметка «сервер синхронизации увидел эту точку впервые»; на ней держится
  // счётчик «Новых за последние 30 дней». Ставим ДО расчёта статистики, чтобы человек,
  // пришедший только что, попал в неё уже сегодня, а не через цикл.
  for (const uid of readyUids) {
    const point = pointsCache.get(uid);
    if (point && point.firstSeen === null) point.firstSeen = now;
  }

  // Пересчитываем топы ВСЕХ в памяти (изменение точки A меняет связь с A у каждого; CPU
  // дёшев, а код очевиден), но ЗАПИСЬ заслуживают не все: в обычном цикле — только грязные
  // точки, в полном проходе — каждый, чей топ разошёлся с последней записью. Чужие топы
  // между полными проходами отстают не больше чем на сутки — контракт свежести 1.x.
  const writes = [];
  const writtenNow = []; // писать в writtenTops можно только после успешного коммита
  const readySet = new Set(readyUids);
  const similarities = [];
  let written = 0;
  for (const [uid, point] of pointsCache) {
    if (Object.keys(point.ratings).length === 0) continue;
    const top = topFor(uid, pointsCache);
    // «Связей рассчитано» и средняя похожесть — про Пространство, а гостя в Пространстве
    // не видно (В3). Его собственный топ мы считаем и пишем, но в статистику не пускаем.
    if (!point.anonymous) similarities.push(...top.map((entry) => entry.similarity));

    const fingerprint = topFingerprint(top);
    const changed = writtenTops.get(uid) !== fingerprint;
    if (changed && (fullPass || readySet.has(uid))) {
      writes.push((batch) =>
        batch.set(db.doc(`relations/${uid}`), { computedAt: now, version: RELATIONS_VERSION, top }),
      );
      writtenNow.push([uid, fingerprint]);
      written += 1;
    }
  }

  for (const uid of readyUids) {
    const firstSeen = pointsCache.get(uid)?.firstSeen ?? now;
    writes.push((batch) =>
      batch.set(db.doc(`points/${uid}`), { dirty: false, lastSync: now, firstSeen }, { merge: true }),
    );
  }

  // Статистика Пространства и снимок дня — в том же цикле, что и топы: цифры на витрине
  // обязаны описывать ровно ту синхронизацию, которая только что случилась.
  //
  // Агрегатору нужно ЧИСЛО оценок человека, а не сами оценки: он считает Пространство,
  // а не связи. Точку сворачиваем в сводку здесь — модель model/stats.ts о Firestore
  // не знает и знать не должна.
  const summaries = [...pointsCache.values()].map((point) => ({
    ratings: Object.keys(point.ratings).length,
    anonymous: point.anonymous,
    updated: point.updated,
    firstSeen: point.firstSeen,
  }));
  const stats = computeSpaceStats({ points: summaries, dimsCount, newDims, similarities }, now);
  writes.push((batch) => batch.set(db.doc('space/stats'), stats));
  writes.push((batch) => batch.set(db.doc(`space/stats/daily/${dayKey(now)}`), snapshotOf(stats)));
  // Публичная витрина лендинга («С нами уже N человек», bugs/07): РОВНО тот же счёт людей,
  // что на экране «Пространство». Документ читается без авторизации (правила), поэтому в
  // нём нет ничего, кроме агрегата. Пишется только когда счёт изменился — лендинг свежесть
  // не проверяет, а одинаковые записи каждую минуту были ровно тем расточительством,
  // против которого идея 14. В 1.x он назывался так же — space/public_metrics.
  const publishPeople = stats.people !== lastPublishedPeople;
  if (publishPeople) {
    writes.push((batch) => batch.set(db.doc('space/public_metrics'), { people: stats.people, computedAt: now }));
  }

  await commitInChunks(writes);

  // Коммит прошёл — теперь память о записанном можно обновлять. Раньше нельзя: упади
  // коммит, кэш считал бы топ записанным и не повторил бы запись никогда.
  for (const [uid, fingerprint] of writtenNow) writtenTops.set(uid, fingerprint);
  if (publishPeople) lastPublishedPeople = stats.people;

  await reportServer(now, {
    lastSuccessAt: now,
    durationMs: Date.now() - startedAt,
    usersSynced: written,
    relationsComputed: similarities.length,
  });

  log(
    `готово: записано топов — ${written}${fullPass ? ' (полный проход)' : ''}, флаг dirty снят у ${readyUids.length}; ` +
      `в Пространстве людей ${stats.people}, измерений ${stats.dims}, связей рассчитано ${stats.relations}`,
  );
  return written;
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
    log(`режим службы: цикл каждые ${intervalSeconds} с, тихий период ${QUIET_MS / 1000} с, полный проход раз в ${FULL_SYNC_MS / 3600000} ч`);
    // Тики не накладываются друг на друга: пересечение циклов рвало бы кэш процесса.
    let cycleInFlight = false;
    const tick = async () => {
      if (cycleInFlight) {
        log('предыдущий цикл ещё идёт — тик пропущен');
        return;
      }
      cycleInFlight = true;
      try {
        await runCycle();
      } catch (error) {
        log(`ошибка цикла: ${error.message}`);
      } finally {
        cycleInFlight = false;
      }
    };
    await tick();
    setInterval(tick, intervalSeconds * 1000);
  }
}

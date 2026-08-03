// Вычислитель связей NDim Space 2.0 (фаза 4 мастер-плана).
// В интерфейсе он называется «Сервер синхронизации» — термин 1.x (AGENT_GUIDE → словарь).
//
// Фоновая пакетная задача: находит «грязные» точки (человек изменил оценки),
// пересчитывает связи ядром похожести и пишет топ-250 в relations/{uid}.
//
// ЭКОНОМИЯ ЗАПРОСОВ — принцип автора из 1.x (ideas/14, устройство 1.x — researches/13).
// Запросы к Firestore стоят денег, вычисления в памяти — нет. Поэтому:
//   · точки живут в КЭШЕ ПРОЦЕССА: полное чтение — при прогреве кэша (первый цикл процесса)
//     и в НОЧНОМ полном проходе (заданный час суток), дальше дочитываются ТОЛЬКО грязные
//     точки. Прогрев и ночной проход — РАЗНЫЕ вещи (bugs/85): прогрев неизбежен при старте,
//     но расписания не сдвигает и за суточную сверку себя не выдаёт;
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
//         CALC_FULL_SYNC_AT_HOUR — час суток ночного полного прохода, ПО UTC (деф. 0 — как 1.x)
//         CALC_NEWCOMER_MINUTES  — окно новичка без тихого периода, мин (деф. 30)
//
// Масштабирование: чтения и записи — O(изменившегося за цикл); память и CPU пересчёта —
// O(N²·оценок) в цикле с пересчётом, терпимо до тысяч людей. Дальше — инкрементальная
// математика, задача фазы 4+ (MASTER_PLAN).

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { computeRelation } from '../src/lib/similarity/similarity.ts';
import { computeSpaceStats, dayKey, snapshotOf } from '../src/lib/model/stats.ts';
// Потолок топа объявлен в схеме, а не здесь: его же показывает профиль человека
// («250 (максимум)», bugs/43). Две копии числа разъехались бы молча.
// Идентификатор служебного документа-индекса берётся ОТТУДА ЖЕ, где его знает клиент
// (`src/lib/data/dims.ts` читает индекс по этой же константе). Две копии строки «dims_list»
// разъехались бы молча — а это ровно та пара «истина ↔ зеркало», на которой уже обжёгся
// `bugs/106`: число измерений считалось по документам коллекции, а показывалось по индексу.
import { RELATIONS_TOP_LIMIT as TOP_LIMIT, DIMS_INDEX_ID } from '../src/lib/model/schema.ts';
/** Версия формата relations-документа. */
const RELATIONS_VERSION = 2;
/** Измерение считается новым для виджета «Сегодня» первые сутки после появления. */
const NEW_DIM_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Firestore не принимает больше 500 операций в батче — режем с запасом (как tools/migrate). */
const BATCH_LIMIT = 400;

// Версия сервера синхронизации — из его package.json; номер сборки и дату проставляет
// Docker при сборке образа (механика номеров общая с приложением).
//
// Номер сборки = ЧИСЛО КОММИТОВ, ТРОНУВШИХ `calculator/` (`git rev-list --count HEAD --
// calculator`), вычисляется при сборке образа и приходит сюда через CALC_BUILD. Требование
// владельца 2026-07-27: «каждый коммит кода сервера синхронизации повышает номер сборки
// на +1» — счётчик коммитов по этому пути делает ровно это и не требует хука.
//
// Слово `dev` УБРАНО (владелец: «у сервера синхронизации убрать билд dev»): нет номера —
// нет и скобок на экране. Отсутствующее честнее выдуманного (PHILOSOPHY).
const { version: SERVER_VERSION } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
);
const SERVER_BUILD = Number(process.env.CALC_BUILD) || null;
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
/**
 * ЧАС СУТОК ночного полного прохода — **по UTC**, ровно как в 1.x.
 *
 * 🔍 РАЗВЕДКА 1.x (снято с кода архива `ndim_old/public/scripts/app.js:10376-10378`, а не по
 * памяти) — слово владельца было «как было в оригинальном НДим… 00 по Лондону», и вот что там
 * на самом деле:
 *
 *     } else if (nowUTC.getHours() === 0) {
 *       // PROD: если текущий час равнен 00 по Лондону, то запускаю ежедневную синхронизацию
 *       sync_type = "daily_sync";
 *
 * То есть 1.x сравнивал **UTC-час**, а «по Лондону» — формулировка комментария. Зимой это одно и
 * то же (Лондон = UTC), летом Лондон это UTC+1 — и проход в 1.x всё равно случался в 00:00 UTC.
 * Берём именно UTC: так паритет с 1.x точный и не зависит от перевода часов.
 *
 * ⚠️ ФАКТ, КОТОРЫЙ РАСХОДИТСЯ С ДОВОДОМ ВЛАДЕЛЬЦА, и о котором он должен знать (записано в
 * `bugs/85`): он объяснил выбор часа тем, что «привязывался ко времени обновления лимитов
 * Firebase». По документации Google суточные квоты Firestore сбрасываются около **полуночи по
 * тихоокеанскому времени**, а не по UTC. То есть привязка к лимитам в 1.x не работала — но
 * ПОВЕДЕНИЕ было именно 00:00 UTC, и владелец просил повторить поведение. Захочет привязаться к
 * лимитам по-настоящему — меняется одно число в ручке.
 *
 * ⚠️ Раньше здесь стоял ПЕРИОД (`CALC_FULL_SYNC_HOURS = 24`), и якорем суток был **момент
 * старта процесса**: контейнер подняли в 13:03 — полный проход навсегда в 13:03, и виджет
 * честно печатал «Запланированная 30 июля 13:03». Владелец прочитал это как поломку
 * (`ideas/21` п. 14: «Вроде бы уже чинили сервер, чтобы он делал полные синхронизации
 * уважительно к ресурсам Firestore ПО НОЧАМ… Словно цифры метрик не подтверждают этого»).
 * Он прав: ночного прохода не было — было «раз в сутки от старта».
 *
 * ⚠️ ЧАСОВОЙ ПОЯС — ВОПРОС ВЛАДЕЛЬЦУ (`bugs/85`). Канон 1.x — 00:00 **по Лондону**, но
 * серверный ПК стоит у владельца, и виджет показывает МЕСТНОЕ время: «полночь по Лондону»
 * отобразилась бы как 03:00 и вызвала бы тот же вопрос заново. Взято местное время с явной
 * ручкой на случай переезда; если владелец скажет «по Лондону» — меняется одна строка.
 */
const FULL_SYNC_AT_HOUR = Number(process.env.CALC_FULL_SYNC_AT_HOUR ?? 0);

/** Сутки в миллисекундах — шаг расписания ночного прохода. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Каждый цикл — ночной (только для тестов: суточную логику иначе не проверить за секунды).
 * В бою НЕ включать: полный проход перечитывает все точки.
 */
const FULL_SYNC_EVERY_CYCLE = process.env.CALC_FULL_SYNC_EVERY_CYCLE === '1';

/**
 * Ближайший ПРОШЕДШИЙ момент ночного прохода. Проход считается просроченным, если последний
 * был раньше него, — так расписание не зависит ни от старта процесса, ни от длины цикла.
 */
export function lastScheduledFullPass(now) {
  const moment = new Date(now);
  // UTC, а не местное время: паритет с 1.x (см. пояснение у FULL_SYNC_AT_HOUR).
  moment.setUTCHours(FULL_SYNC_AT_HOUR, 0, 0, 0);
  if (moment.getTime() > now) moment.setUTCDate(moment.getUTCDate() - 1);
  return moment.getTime();
}

/** Следующий момент ночного прохода — то, что виджет показывает как «Запланированная». */
export function nextScheduledFullPass(now) {
  return lastScheduledFullPass(now) + DAY_MS;
}

const projectId = process.env.FIREBASE_PROJECT_ID ?? 'demo-ndim-dev';

// Проект demo-* живёт только в эмуляторе. Если адрес эмулятора не задан — подставляем
// локальный по умолчанию, чтобы вычислитель случайно не потянулся в боевой Firestore.
if (projectId.startsWith('demo-') && !process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
}

// Пустая переменная (наследие compose-подстановки `${VAR:-}`) означает «не задана»:
// Admin SDK пустую строку игнорирует, но наш страж ниже обязан читать её так же.
if (process.env.FIRESTORE_EMULATOR_HOST === '') delete process.env.FIRESTORE_EMULATOR_HOST;

// ДВУСТОРОННИЙ страж (bugs/94). Выше: demo-* не должен утечь в бой. Здесь — обратное:
// НЕ-demo проект не должен молча писать в эмулятор. Ровно это чуть не случилось при
// перевыкате «по документации» compose-файла (researches/14: спасла ручная сверка
// docker inspect, а не страж). Осознанный запуск против эмулятора с реальным именем
// проекта — только через явный NDIM_ALLOW_EMULATOR=1.
if (
  !projectId.startsWith('demo-') &&
  process.env.FIRESTORE_EMULATOR_HOST &&
  process.env.NDIM_ALLOW_EMULATOR !== '1'
) {
  console.error(
    `[calc] СТОП: проект ${projectId} совмещён с эмулятором (FIRESTORE_EMULATOR_HOST=` +
      `${process.env.FIRESTORE_EMULATOR_HOST}). Боевой запуск с эмулятором — почти наверняка ` +
      'ошибка (bugs/94): топы ушли бы в дев-базу, бой остался бы без синхронизации. ' +
      'Если это осознанно — задай NDIM_ALLOW_EMULATOR=1.',
  );
  process.exit(1);
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
/**
 * dimId → «stars|rates» последней ЗАПИСАННОЙ сводки оценок каталога (`bugs/111`).
 * Что в этой мапе — то и в базе. `null` — ещё не поднимали из базы.
 */
let writtenDimRatings = null;
/** При каком размере каталога снята `writtenDimRatings` — по нему видно, что её пора переснять. */
let seededDimsCount = null;
/** Последний счёт людей, ушедший в space/public_metrics: пишем только когда изменился. */
let lastPublishedPeople = null;
/**
 * Когда был последний НОЧНОЙ полный проход. `null` — ещё не спрашивали базу.
 *
 * ⚠️ Значение ПЕРЕЖИВАЕТ рестарт: при первом цикле процесса оно читается из
 * `space/server.fullSync.at` (одно чтение). Без этого каждый выкат образа или ребут
 * серверного ПК гнал ночной проход заново — два выката в день стоили двух суточных
 * проходов вместо одного, прямо против «уважительно к ресурсам Firestore».
 */
let lastFullPassAt = null;

/**
 * Когда ПОДНЯТ сам процесс сервера синхронизации (`bugs/86`).
 *
 * Владелец: «Последний запуск в сервере синхронизации сейчас говорит о времени последней
 * синхронизации — неверно. Должен говорить о времени, когда сервер синхронизации был поднят».
 * Отдельное поле, а не переиспользование `lastRunAt`: тот — СЕРДЦЕБИЕНИЕ, из него выводится
 * состояние «Работает», и заморозить его значило бы показать живой сервер умершим.
 */
const SERVER_STARTED_AT = Date.now();

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
 * Когда был последний ночной полный проход — по отметке в базе (bugs/85).
 *
 * Одно чтение за жизнь процесса. Без него расписание жило только в оперативке: рестарт
 * «забывал» отметку и немедленно гнал суточную сверку, то есть каждый выкат образа стоил
 * полного вычитывания базы.
 *
 * Отсутствие документа или поля — честный `0`: прохода не было, надо сделать.
 */
async function loadLastFullPassAt() {
  const snapshot = await db.doc('space/server').get();
  const at = snapshot.exists ? snapshot.data()?.fullSync?.at : null;
  return typeof at === 'number' ? at : 0;
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

// ── СВОДКА ОЦЕНОК КАТАЛОГА (`bugs/111`, она же шаг 0 эпика `ideas/28`) ──────────────────────
//
// 🔴 ЧТО ЭТО ЧИНИТ. Поля `stars` / `rates` / `rating` документа `dims/{dimId}` — наследие 1.x,
// где их кто-то поддерживал. Миграция переносила ЛЮДЕЙ, каталог остался на месте, и в 2.0
// писать эти поля не стал НИКТО: поиск по всему дереву давал только чтение. Числа замерли на
// эпохе 1.x, а публичные страницы каталога показывают именно их — то есть расхождение не шум,
// а недостающий механизм, и росло бы оно вечно (на 2026-08-03 — 31 оценка).
//
// 🔑 ПОЧЕМУ ЭТО МЕСТО, А НЕ ЗАПИСЬ ПРИ ВЫСТАВЛЕНИИ ОЦЕНКИ. Канон владельца: агрегаты производит
// сервер синхронизации, а не клиент, — он и так обходит все точки, ему это даром. Плюс оценки
// приватны (интервью №002, В4): клиент чужих не видит и сложить их не может в принципе.

/** Канонический текст сводки для diff — ровно то, что уходит в документ. */
const dimRatingFingerprint = (stars, rates) => `${stars}|${rates}`;

/** Среднее «как в 1.x»: `stars / rates`, округлённое до 0,1 (`schema.ts:244-249`). */
const averageRating = (stars, rates) => (rates === 0 ? 0 : Math.round((stars / rates) * 10) / 10);

/**
 * Сворачивает ВСЕ точки в сводку по измерениям: dimId → { stars, rates }.
 *
 * 🔴 ПОПУЛЯЦИЯ ЗДЕСЬ ОБЯЗАНА СОВПАДАТЬ С `space/stats.ratings` — иначе сходимость, которой
 * этот механизм проверяется, не сойдётся никогда. В `model/stats.ts` считаются `inhabitants`:
 * `!anonymous && ratings > 0`. Аноним исключён, и это не придирка к цифре: он живёт 7 дней и
 * исчезает — считай мы его, публичный счётчик измерения УМЕНЬШАЛСЯ бы сам собой, и человек из
 * поиска видел бы, как оценки пропадают. Условие `ratings > 0` выполняется здесь само: точка
 * без оценок в сводку ничего не вносит.
 */
function dimRatingsFrom(points) {
  const summary = new Map();
  for (const point of points.values()) {
    if (point.anonymous) continue;
    for (const [dimId, value] of Object.entries(point.ratings)) {
      // Оценки приезжают из базы, а не из наших типов: битое значение не должно испортить
      // сумму молча. Пропущенная оценка честнее, чем `NaN` на публичной странице.
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const cell = summary.get(dimId) ?? { stars: 0, rates: 0 };
      cell.stars += value;
      cell.rates += 1;
      summary.set(dimId, cell);
    }
  }
  return summary;
}

/**
 * Поднимает из базы то, что в полях каталога лежит СЕЙЧАС, — один раз за жизнь процесса.
 *
 * Устройство скопировано с `seedWrittenTops`, и по той же причине: без него первый цикл после
 * каждого рестарта переписывал бы все 1873 документа с оценками вслепую. Чтение коллекции
 * стóит дешевле такой записи и случается один раз, а дальше diff живёт в памяти —
 * канон экономии запросов (слово владельца: «ЭКОНОМИТЬ ЗАПРОСЫ К БАЗЕ!!!»).
 */
async function seedDimRatings() {
  const snapshot = await db.collection('dims').get();
  const map = new Map();
  for (const doc of snapshot.docs) {
    if (doc.id === DIMS_INDEX_ID) continue; // индекс — не измерение
    const data = doc.data();
    const stars = Number(data.stars) || 0;
    const rates = Number(data.rates) || 0;
    map.set(doc.id, dimRatingFingerprint(stars, rates));
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
  const since = now - NEW_DIM_WINDOW_MS;
  /*
   * 🔴 ВОЗРАСТ ИЗМЕРЕНИЯ ЖИВЁТ В ДВУХ ФОРМАХ, И ЗАПРОС ОБЯЗАН ЗНАТЬ ОБЕ (`bugs/109`).
   *
   * В бою каталог пришёл из 1.x, где возраст лежит во ВЛОЖЕННОМ `time.created` (Timestamp);
   * миграция это поле не трогала. Плоское числовое `created` существует только на стенде.
   * Прежний запрос знал ровно плоскую форму — то есть на стенде работал, а в бою не находил
   * НИЧЕГО и никогда, и виджет «Сегодня» молчал бы, сколько бы измерений ни завели.
   * Дефект нашёлся чтением кода и воспроизведён `calculator/measure-dims-index.mjs`.
   *
   * Два запроса вместо одного стоят ровно столько, сколько документов они вернут (обычно ноль),
   * а знание об обеих формах уже живёт в `src/lib/model/feed.ts` → `createdAt` — здесь тот же
   * инвариант, только на стороне сервера.
   */
  const [count, freshLegacy, freshProd] = await Promise.all([
    catalog.count().get(),
    catalog.where('created', '>=', since).get(),
    catalog.where('time.created', '>=', Timestamp.fromMillis(since)).get(),
  ]);

  const newDims = new Map();
  for (const dim of [...freshLegacy.docs, ...freshProd.docs]) {
    const title = dim.data().title;
    /*
     * 🔴 БЕЗ НАЗВАНИЯ — НЕ НОВОСТЬ, И ЭТО НЕ ПРИДИРКА. Документ каталога без `title`
     * (наследие формы 1.x, где название лежало в `name`) давал `title: undefined`, а Firestore
     * отвергает `undefined` — падала ВСЯ пакетная запись цикла: и статистика, и топы, и
     * снятие флагов dirty. Поймано собственным тестом при первом же прогоне фикса; прежний
     * запрос этого не показывал только потому, что в бою не находил вообще ничего (`bugs/109`).
     */
    if (!title || typeof title !== 'object') continue;
    newDims.set(dim.id, { id: dim.id, title });
  }

  return { dimsCount: count.data().count, newDims: [...newDims.values()] };
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
  const data = snapshot.data() ?? {};

  let index = null;
  try {
    const parsed = JSON.parse(data.dims_list ?? 'null');
    if (parsed && typeof parsed === 'object') index = parsed;
  } catch {
    index = null; // битый индекс — пересоберём целиком
  }

  /*
   * ОТМЕТКА СБОРКИ вместо вычитания единицы.
   *
   * Прежний сторож сравнивал число записей индекса с числом документов минус ОДИН —
   * магической константой «служебный документ ровно один, и всё остальное индексируется».
   * Оба допущения ломались молча: документ без `title` в индекс не попадал, но в счёте
   * документов оставался, условие не выполнялось НИКОГДА, и вычислитель перечитывал весь
   * каталог на каждом цикле (`bugs/108`, замерено: 3 пересборки из 3, «было 13, стало 13»).
   *
   * Теперь свежесть определяется отметкой: сколько документов было в коллекции, когда индекс
   * последний раз обслуживали. Сошлось — не трогаем. Не сошлось — обслуживаем и ОТМЕТКУ
   * ОБНОВЛЯЕМ, поэтому расхождение не может повторяться вечно, какова бы ни была его причина.
   */
  const built = data.built ?? null;
  if (index && built && built.docs === dimsCount) return Object.keys(index).length;

  const catalog = db.collection('dims');
  const entry = (doc) => {
    const d = doc.data();
    if (!d.title || typeof d.title !== 'object') return null; // без названия показывать нечего
    return { ru: d.title.ru ?? null, en: d.title.en ?? null, year: d.year ?? '' };
  };
  /*
   * Слияние НА УРОВНЕ КЛЮЧЕЙ записи, а не подстановкой новой. Требование соседнего эпика
   * `ideas/28`: в записи индекса поселится счётчик оценок, и обслуживание не имеет права
   * стирать поля, которых не знает. Прежний код собирал запись заново — то есть первая же
   * пересборка убила бы все 5111 счётчиков молча.
   */
  const merge = (into, id, fresh) => { into[id] = { ...(into[id] ?? {}), ...fresh }; };

  // ── ДЕЛЬТА: документов стало больше — дочитываем ТОЛЬКО новые ───────────────
  // Это и есть ответ на вопрос владельца «можно ли не перелопачивать всю БД». Одно измерение
  // стоило чтения всего каталога (в бою 5112 документов); теперь — ровно столько документов,
  // сколько добавили.
  if (index && built && dimsCount > built.docs) {
    const added = await catalog.where('time.created', '>=', Timestamp.fromMillis(built.at)).get();
    const before = Object.keys(index).length;
    for (const doc of added.docs) {
      if (doc.id === DIMS_INDEX_ID) continue;
      const fresh = entry(doc);
      if (fresh) merge(index, doc.id, fresh);
    }
    const grew = Object.keys(index).length - before;
    if (grew === dimsCount - built.docs) {
      await ref.set({ dims_list: JSON.stringify(index), built: { at: Date.now(), docs: dimsCount } }, { merge: true });
      log(`индекс каталога дополнен: +${grew}, стало ${Object.keys(index).length} измерений`);
      return Object.keys(index).length;
    }
    // Дельта не сошлась (документ без `time.created`, без `title`, восстановленный старый) —
    // честно падаем в полную пересборку, а не делаем вид, что всё в порядке.
  }

  // ── АВАРИЙНЫЙ ПУТЬ: полная пересборка ──────────────────────────────────────
  const all = await catalog.get();
  const rebuilt = {};
  let skipped = 0;
  for (const doc of all.docs) {
    if (doc.id === DIMS_INDEX_ID) continue; // индекс не индексирует сам себя
    const fresh = entry(doc);
    if (!fresh) { skipped += 1; continue; }
    // Прежнюю запись кладём ПОД новую — это и есть сохранение чужих полей. Единственное место,
    // где оно живёт, — `merge`: первая редакция дублировала ту же логику ещё и здесь, и мутация
    // «слияние заменено подстановкой» осталась ЗЕЛЁНОЙ, потому что дубль её прикрывал.
    if (index?.[doc.id]) rebuilt[doc.id] = { ...index[doc.id] };
    merge(rebuilt, doc.id, fresh);
  }

  const wasIndexed = index ? Object.keys(index).length : -1;
  await ref.set(
    { dims_list: JSON.stringify(rebuilt), built: { at: Date.now(), docs: dimsCount } },
    { merge: true },
  );
  log(`индекс каталога пересобран: было ${wasIndexed}, стало ${Object.keys(rebuilt).length} измерений`);
  if (skipped > 0) {
    // Мина обязана быть ВИДНА. Прежде она молчала: документ без названия просто пропускался,
    // и о том, что каталог и индекс разошлись навсегда, не знал никто.
    log(`⚠️ документов каталога без названия: ${skipped} — они не попали в индекс и не будут показаны`);
  }
  return Object.keys(rebuilt).length;
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
    if (relation === null) continue;
    /*
     * «Последнее обновление NDim ID» — последний блок канона 1.x в раскрытой связи
     * (`bugs/46`, кадр app-16). Кладём его ЗДЕСЬ, а не читаем экраном, потому что
     * `points/{uid}` чужого человека зрителю по правилам недоступен (его читают только
     * владелец и вычислитель). Число у нас уже есть — оно загружено для статистики
     * Пространства, так что ни одного нового чтения базы это не стоит.
     *
     * Поле НЕОБЯЗАТЕЛЬНОЕ: в боевых `relations`, записанных прежними сборками, его нет, и
     * экран обязан честно молчать, а не показывать «неизвестно» (тот же приём, что
     * `startedUpAt` в `bugs/86`). Пишем только настоящее число — `null` в топе не место.
     */
    const row = { ...relation, guestUid: otherUid };
    if (typeof other.updated === 'number') row.updated = other.updated;
    top.push(row);
  }
  // Тай-брейк по uid обязателен: без него порядок людей с равной похожестью зависел бы от
  // порядка чтения точек (он недетерминирован), diff видел бы «изменение» и переписывал
  // топы на ровном месте — дырка в экономии записей (ideas/14).
  top.sort((a, b) => b.similarity - a.similarity || (a.guestUid < b.guestUid ? -1 : 1));
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
 * Убирает следы за человеком, УДАЛИВШИМ АККАУНТ САМ (эпик `plans/15`, фаза 8; ответ владельца
 * В11 = А, 2026-08-01).
 *
 * ═══ ЗАЧЕМ ЭТО ЗДЕСЬ, А НЕ В КЛИЕНТЕ ═══
 *
 * Человек удаляет всё, что вправе удалить, сам и мгновенно (`src/lib/data/erase.ts`). Но пять
 * следов ему недоступны по правилам, и это не недоделка, а устройство безопасности:
 *   · свой `relations/{uid}` — клиенту запись запрещена ПОЛНОСТЬЮ (иначе он мог бы объявить
 *     себя похожим на кого угодно);
 *   · он в ЧУЖИХ топах — чужие документы;
 *   · его членство в ЧУЖИХ группах и подсказка аудитории у другого — чужие документы;
 *   · его предложения измерений — их правит только админ.
 *
 * ═══ КАК УЗНАЁМ, ЧТО ЧЕЛОВЕКА НЕТ ═══
 *
 * По отсутствию точки при живом `relations`. Отдельного «надгробия» не заводим сознательно:
 * его пришлось бы хранить вечно, и оно само стало бы следом человека — ровно тем, что мы
 * пришли убрать.
 *
 * ═══ ЦЕНА ЗАПРОСОВ (канон владельца «экономить запросы к базе») ═══
 *
 * Поиск сирот — ДВА `listDocuments()`: они возвращают ссылки, а НЕ данные, то есть чтений
 * документов не тратят вовсе. Тяжёлый обход членств и подсказок (`collectionGroup`) делается
 * ТОЛЬКО когда сирота действительно нашёлся. Никто не удалялся — проход бесплатен.
 *
 * ⚠️ Чужие топы здесь НЕ правятся руками: ночной проход всё равно пересчитывает их по ЖИВЫМ
 * точкам, удалённого в них уже не будет, и хэш топа изменится — значит он будет переписан
 * штатным путём. Дописывать это отдельно значило бы делать одну работу дважды.
 *
 * Возвращает число людей, за которыми убрали.
 */
export async function cleanupDeletedPeople(now = Date.now()) {
  const [relationRefs, pointRefs] = await Promise.all([
    db.collection('relations').listDocuments(),
    db.collection('points').listDocuments(),
  ]);

  const alive = new Set(pointRefs.map((ref) => ref.id));
  const gone = relationRefs.filter((ref) => !alive.has(ref.id)).map((ref) => ref.id);
  if (gone.length === 0) return 0;

  const goneSet = new Set(gone);

  for (const uid of gone) {
    // Его собственный топ и остатки дерева (клиент мог оборваться на середине каскада).
    await db.doc(`relations/${uid}`).delete();
    await db.recursiveDelete(db.doc(`users/${uid}`));
    await db.recursiveDelete(db.doc(`points/${uid}`));

    /*
     * Предложения измерений ОБЕЗЛИЧИВАЮТСЯ, а не удаляются (решение владельца В11 = А):
     * предложенное измерение полезно Пространству и после ухода автора, а связка с человеком
     * уходит вместе с `authorUid`. Это и есть разница между «удалить данные человека» и
     * «стереть его вклад».
     */
    const mine = await db.collection('suggestions').where('authorUid', '==', uid).get();
    for (const suggestion of mine.docs) {
      await suggestion.ref.update({ authorUid: null, anonymizedAt: now });
    }

    pointsCache?.delete(uid);
    writtenTops?.delete(uid);
    log(`человек ${uid} удалил аккаунт — следы вычищены`);
  }

  /*
   * Членства и подсказки живут в ЧУЖИХ деревьях, а их документы не хранят uid полем — он
   * только в имени документа (`GroupMemberDoc` содержит лишь `added`). Значит запросом по
   * полю их не найти, и остаётся обход группы коллекций.
   *
   * Он дорог — и потому выполняется ТОЛЬКО здесь, внутри ветки «сирота нашёлся», а не в
   * каждом проходе.
   */
  for (const groupName of ['members', 'audience']) {
    const found = await db.collectionGroup(groupName).get();
    for (const entry of found.docs) {
      if (goneSet.has(entry.id)) await entry.ref.delete();
    }
  }

  return gone.length;
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
      // Время ПОДЪЁМА процесса (bugs/86) — отдельно от сердцебиения `lastRunAt`.
      startedUpAt: SERVER_STARTED_AT,
      intervalSeconds: Number(process.env.CALC_INTERVAL_SECONDS ?? 60),
      ...(success ?? {}),
    },
    { merge: true },
  );
}

/**
 * Дверь для тестов устойчивости (bugs/91): взведённая, роняет БЛИЖАЙШИЙ commitInChunks
 * ровно один раз — так тест воспроизводит транзиентный сбой Firestore посреди ночного
 * прохода без ковыряния в сети. В бою дверь никогда не взводится (ничего не экспортирует
 * её наружу процесса), это тот же приём, что стендовые двери `?as=` клиента.
 */
export const _testFailNextCommit = { armed: false };

/**
 * Дверь для теста гонки dirty (bugs/93): хук исполняется внутри runCycle между коммитом
 * топов и снятием флага — ровно там, где в бою успевает вклиниться запись человека.
 * В бою всегда null.
 */
export const _testBetweenCommitAndRelease = { hook: null };

/** Пишет операции пачками по BATCH_LIMIT: полный проход большого Пространства не влезает в один батч. */
async function commitInChunks(writes) {
  if (_testFailNextCommit.armed) {
    _testFailNextCommit.armed = false;
    throw new Error('тестовый сбой коммита (дверь bugs/91)');
  }
  for (let start = 0; start < writes.length; start += BATCH_LIMIT) {
    const batch = db.batch();
    for (const write of writes.slice(start, start + BATCH_LIMIT)) write(batch);
    await batch.commit();
  }
}

/** Один цикл пересчёта. Возвращает число записанных топов. */
export async function runCycle() {
  const startedAt = Date.now();

  // Ночной полный проход — наследник `daily_sync` 1.x (`researches/13` §4, «в 00:00»):
  // раз в сутки в заданный ЧАС. Перечитывает все точки (лечит кэш от правок мимо флага
  // dirty), вычищает осиротевших гостей и дописывает «ленивые» чужие топы, которые обычные
  // циклы намеренно не трогали.
  // Отметку последнего ночного прохода поднимаем из базы ОДИН раз за жизнь процесса —
  // иначе рестарт «забывал» её и гнал суточный проход повторно.
  if (lastFullPassAt === null) {
    lastFullPassAt = await loadLastFullPassAt();
    log(
      lastFullPassAt > 0
        ? `последний ночной проход был ${new Date(lastFullPassAt).toISOString()}`
        : 'ночного прохода в базе ещё нет',
    );
  }

  /*
   * РАЗДЕЛЕНЫ ДВЕ РАЗНЫЕ ВЕЩИ, которые раньше жили под одним флагом:
   *   · `nightly` — ночная сверка по расписанию: чистка осиротевших гостей, дозапись
   *     «ленивых» чужих топов, отчёт в блок «Полная синхронизация»;
   *   · `warmup` — прогрев кэша при старте процесса. Он неизбежен (топы считаются в памяти
   *     по ВСЕМ точкам) и потому не является «ночным проходом»: если считать его им,
   *     каждый рестарт сдвигал бы расписание и переписывал отчёт о суточной сверке.
   */
  const warmup = pointsCache === null;
  const nightly = FULL_SYNC_EVERY_CYCLE || lastFullPassAt < lastScheduledFullPass(startedAt);
  const fullPass = nightly || warmup;

  if (fullPass) {
    if (nightly) {
      // Оба — ДО перечитки точек: ни осиротевший гость, ни следы удалившегося не должны
      // попасть в кэш и в чужие топы этого же прохода.
      await cleanupStaleGuests(startedAt);
      await cleanupDeletedPeople(startedAt);
    }
    pointsCache = await loadAllPoints();
    if (writtenTops === null) writtenTops = await seedWrittenTops();
    // ⚠️ lastFullPassAt здесь НЕ трогаем: отметка «проход сделан» ставится только после
    // успешного конца цикла (bugs/91) — см. низ runCycle, симметрично writtenTops.
    log(
      `${nightly ? 'ночной полный проход' : 'прогрев кэша при старте'}: в Пространстве точек — ${pointsCache.size}`,
    );
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
  /*
   * 🔑 ЧИСЛО ИЗМЕРЕНИЙ РОЖДАЕТСЯ ЗДЕСЬ, И ОНО ОДНО (`bugs/106`).
   *
   * Прежде статистике скармливался `dimsCount` — число ДОКУМЕНТОВ коллекции, куда попадал и
   * служебный индекс. Поэтому «Пространство» показывало 5112, «Измерения» — 5111, а диаметр
   * выходил 715 вместо канона 1.x 714,9. Замер вскрыл, что разрыв бывает и БОЛЬШЕ единицы:
   * документ без названия тоже считается документом, но в индекс не попадает.
   *
   * Теперь «сколько измерений» = «сколько записей в индексе», то есть ровно то, что человек
   * видит на экране «Измерения». Дрейфу этой пары больше неоткуда взяться — число одно.
   * ⚠️ Сторожу свежести (`ensureDimsIndex`) по-прежнему нужны ОБА числа: он сравнивает
   * документы коллекции с отметкой сборки, и схлопывать их в одно нельзя.
   */
  const indexedDims = await ensureDimsIndex(dimsCount);

  /*
   * СВОДКА ОЦЕНОК КАТАЛОГА поднимается из базы (`bugs/111`) — один раз за жизнь процесса и
   * заново, когда каталог ИЗМЕНИЛСЯ в размере. Второе условие обязательно, и вот почему:
   * ключи этой мапы — единственное, что отделяет существующее измерение от сироты (см. запись
   * ниже). Без пересъёмки новое измерение никогда не получило бы своих счётчиков, а удалённое
   * роняло бы весь батч цикла до самого рестарта.
   *
   * Цена названа честно: одно чтение коллекции (5111 документов) при старте и при каждом
   * изменении размера каталога. Измерения заводит владелец вручную и редко, так что на деле
   * это одно чтение за жизнь процесса. Альтернатива — слепая перезапись 1873 документов на
   * каждом рестарте — дороже и грязнее.
   */
  if (writtenDimRatings === null || seededDimsCount !== dimsCount) {
    writtenDimRatings = await seedDimRatings();
    seededDimsCount = dimsCount;
    log(`сводка оценок каталога поднята из базы: измерений ${writtenDimRatings.size}`);
  }

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
  const bests = []; // верхние строки топов — по одному числу на человека (`plans/28` §8)
  let written = 0;
  let checked = 0; // пользователей, чьи топы пересчитаны и сверены в этом цикле
  for (const [uid, point] of pointsCache) {
    /*
     * Опустевшая точка (человек удалил ВСЕ оценки) не пропускается: ей положен честный
     * ПУСТОЙ топ, иначе relations/{uid} навсегда хранит топ из уже не существующих оценок
     * (bugs/92 — `continue` был безобиден, пока топы переписывались каждый цикл, и стал
     * дырой после перехода на diff-запись). Но заводить пустой документ тому, у кого топа
     * никогда не было (новичок без оценок), незачем — оплаченная запись без смысла: пустой
     * топ пишется только ПОВЕРХ существующего документа (см. условие записи ниже).
     */
    const emptied = Object.keys(point.ratings).length === 0;
    // Гость в Пространстве не виден (интервью №004, В3), и в счётчик «проверено» он попадать
    // не должен: иначе на одном экране «Пользователей проверено» и «Всего людей» означают
    // РАЗНЫЕ популяции, и разница читается как поломка (ideas/21 п. 14, часть В).
    // Опустевшие тоже не в счёте — как и до bugs/92: их некому сверять.
    if (!point.anonymous && !emptied) checked += 1;
    const top = emptied ? [] : topFor(uid, pointsCache);
    // «Связей рассчитано» и средняя похожесть — про Пространство, а гостя в Пространстве
    // не видно (В3). Его собственный топ мы считаем и пишем, но в статистику не пускаем.
    if (!point.anonymous) {
      similarities.push(...top.map((entry) => entry.similarity));
      /*
       * ВЕРХНЯЯ СТРОКА — то, что человек видит, открыв «Связи» (`plans/28` §8).
       *
       * Берётся здесь и только здесь, потому что `topFor` уже отсортировал топ по убыванию
       * (строка 401) — значит вершина стоит первой, и она достаётся БЕСПЛАТНО: ни одного
       * лишнего чтения базы, ни одного лишнего прохода.
       *
       * 🔑 Почему без этого нельзя было обойтись: `avgSimilarity` усредняет ВСЕ строки всех
       * топов вместе с хвостом и потому не отвечает на вопрос «что увидит человек» ни при
       * каких данных (замер боя 2026-08-02, `EXP-0124`). Пустой топ сюда не попадает: у него
       * нет верхней строки, а сколько таких людей — видно как `people − bestMatch.people`.
       */
      if (top.length > 0) bests.push(top[0].similarity);
    }

    const fingerprint = topFingerprint(top);
    const changed = writtenTops.get(uid) !== fingerprint;
    if (changed && (fullPass || readySet.has(uid)) && (!emptied || writtenTops.has(uid))) {
      writes.push((batch) =>
        batch.set(db.doc(`relations/${uid}`), { computedAt: now, version: RELATIONS_VERSION, top }),
      );
      writtenNow.push([uid, fingerprint]);
      written += 1;
    }
  }

  // ⚠️ Снятие dirty из этого батча ИЗЪЯТО (bugs/93): оно происходит после коммита топов,
  // транзакцией с проверкой updated — см. ниже.

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
  const stats = computeSpaceStats(
    { points: summaries, dimsCount: indexedDims, newDims, similarities, bests },
    now,
  );
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

  /*
   * ── СВОДКА ОЦЕНОК КАТАЛОГА (`bugs/111`) ──────────────────────────────────────────────────
   *
   * Считается ИЗ ТЕХ ЖЕ точек и в том же цикле, что `space/stats`: все оценки уже в руках,
   * второго прохода не нужно. Пишется diff-ом — как топы и как витрина лендинга: одинаковая
   * запись каждую минуту была бы ровно тем расточительством, против которого идея 14.
   *
   * ⚠️ Обход идёт по ОБЪЕДИНЕНИЮ «что насчитали» и «что лежит в базе», а не только по первому.
   * Иначе измерение, у которого последний оценивший удалил свою оценку (или сам удалился),
   * навсегда сохранило бы прежний счётчик: его просто не было бы в новой сводке, и обнулить
   * его стало бы некому. Это тот же класс, что `bugs/92` у опустевшей точки.
   */
  const dimRatings = dimRatingsFrom(pointsCache);
  let dimsRewritten = 0;
  /*
   * 🔴 ОБХОД ИДЁТ ПО КАТАЛОГУ, А НЕ ПО ОЦЕНКАМ, и это не стилистика.
   *
   * `writtenDimRatings` поднят ИЗ КАТАЛОГА, то есть его ключи — измерения, которые существуют.
   * Оценка человека может ссылаться на измерение, которого в каталоге уже нет (гипотеза 1
   * самого `bugs/111` — «сироты»), и такой ключ обязан быть пропущен:
   *   · `batch.update` несуществующего документа НЕ «тихо отпадает» — Firestore отвечает
   *     NOT_FOUND и роняет ВЕСЬ батч, то есть заодно статистику, снимок дня и все топы цикла;
   *   · `set` с merge вместо него был бы хуже: он ВОСКРЕСИЛ бы измерение пустым документом без
   *     `title`, а это включает вечную пересборку индекса каталога (`bugs/108`).
   * Обход по каталогу закрывает оба пути разом. Заодно он и обнуляет счётчик измерения, у
   * которого последний оценивший удалил оценку: такое измерение в сводке отсутствует, но в
   * каталоге есть, и получает честные нули (тот же класс, что опустевшая точка в `bugs/92`).
   */
  for (const [dimId, previous] of writtenDimRatings) {
    const cell = dimRatings.get(dimId) ?? { stars: 0, rates: 0 };
    const fingerprint = dimRatingFingerprint(cell.stars, cell.rates);
    if (previous === fingerprint) continue;
    writes.push((batch) =>
      batch.update(db.doc(`dims/${dimId}`), {
        stars: cell.stars,
        rates: cell.rates,
        rating: averageRating(cell.stars, cell.rates),
      }),
    );
    writtenDimRatings.set(dimId, fingerprint);
    dimsRewritten += 1;
  }
  const orphanRatings = [...dimRatings.keys()].filter((id) => !writtenDimRatings.has(id));
  if (orphanRatings.length > 0) {
    // Не молчим: это и есть гипотеза 1 `bugs/111`, и её проверка стоила бы отдельного прохода.
    log(`оценки на измерениях вне каталога — ${orphanRatings.length} (сироты, в счёт не идут)`);
  }
  if (dimsRewritten > 0) log(`сводка оценок каталога обновлена у измерений: ${dimsRewritten}`);

  await commitInChunks(writes);

  // Коммит прошёл — теперь память о записанном можно обновлять. Раньше нельзя: упади
  // коммит, кэш считал бы топ записанным и не повторил бы запись никогда.
  for (const [uid, fingerprint] of writtenNow) writtenTops.set(uid, fingerprint);
  if (publishPeople) lastPublishedPeople = stats.people;

  /*
   * Флаг dirty снимается ПОСЛЕ коммита топов и ТРАНЗАКЦИЕЙ с проверкой updated (bugs/93):
   * человек мог поставить оценку, ПОКА цикл считал, и безусловное dirty:false затёрло бы
   * его свежий dirty:true — оценка ждала бы ночного прохода вместо минуты (больнее всего
   * новичку, ideas/05). Транзакция сверяет updated с тем, который цикл ЧИТАЛ: изменился —
   * флаг не трогаем, точка честно пересчитается следующим циклом. Цена: +1 чтение на
   * грязную точку за цикл; грязных единицы — канон экономии не страдает. Порядок (сначала
   * топы, потом флаг) безопасен и при падении между ними: dirty останется, пересчёт
   * повторится, diff подавит лишние записи.
   */
  // Дверь для теста гонки (bugs/93): даёт тесту записать оценку «во время цикла» — между
  // коммитом топов и снятием dirty. В бою всегда null (взводится только импортом из теста).
  if (_testBetweenCommitAndRelease.hook) await _testBetweenCommitAndRelease.hook();

  let dirtyKept = 0;
  for (const uid of readyUids) {
    const point = pointsCache.get(uid);
    const seenUpdated = point?.updated ?? null;
    const firstSeen = point?.firstSeen ?? now;
    const ref = db.doc(`points/${uid}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists && typeof snap.data().updated === 'number' ? snap.data().updated : null;
      if (current !== seenUpdated) {
        dirtyKept += 1; // человек успел оценить во время цикла — dirty остаётся
        return;
      }
      tx.set(ref, { dirty: false, lastSync: now, firstSeen }, { merge: true });
    });
  }
  if (dirtyKept > 0) {
    log(`оценка во время цикла: dirty оставлен у ${dirtyKept} — пересчёт следующим циклом`);
  }

  // Полная и частичная синхронизации отчитываются РАЗДЕЛЬНЫМИ блоками — как в 1.x
  // (researches/13 §6: last_full_sync_* / last_partial_sync_*). Виджет «Пространства»
  // склеивал минутное сердцебиение с числами суточного прохода и врал владельцу (bugs/42).
  // Плоские поля ниже — легаси для закэшированных бандлов экрана; новый экран их не читает.
  const durationMs = Date.now() - startedAt;
  // ⚠️ Отчитывается в блок «Полная синхронизация» ТОЛЬКО ночной проход. Прогрев кэша при
  // старте процесса — не суточная сверка, и выдавать его за неё значило бы врать владельцу
  // ровно тем же способом, из-за которого заведён `bugs/85`.
  const syncBlock = nightly
    ? {
        fullSync: {
          at: now,
          durationMs,
          checked,
          updated: written,
          relationsComputed: similarities.length,
          nextAt: nextScheduledFullPass(now),
        },
      }
    : { partialSync: { at: now, durationMs, updated: written } };
  await reportServer(now, {
    lastSuccessAt: now,
    durationMs,
    usersSynced: written,
    relationsComputed: similarities.length,
    ...syncBlock,
  });

  // Отметка «ночной проход сделан» — ТОЛЬКО когда весь цикл дошёл до конца (bugs/91),
  // симметрично writtenTops выше. Упади цикл на любом шаге — отметка останется старой, и
  // следующий 60-секундный цикл честно повторит проход (повтор дёшев: diff подавит записи).
  // При стабильно падающем Firestore проход будет пробоваться каждый цикл — это и есть
  // желаемое самолечение, а не зацикливание: каждая попытка отражена строкой «ошибка цикла».
  if (nightly) lastFullPassAt = startedAt;

  log(
    `готово: записано топов — ${written}${nightly ? ' (ночной проход)' : warmup ? ' (прогрев кэша)' : ''}, флаг dirty снят у ${readyUids.length - dirtyKept}; ` +
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
    // ⚠️ Эта строка ссылалась на удалённую константу периода и роняла СЛУЖБУ при старте,
    // хотя все 34 теста были зелёными: тесты импортируют `runCycle`, а путь запуска службы
    // не исполняют вовсе. Урок: правя константы расписания, проверяй и стартовый лог.
    log(
      `режим службы: цикл каждые ${intervalSeconds} с, тихий период ${QUIET_MS / 1000} с, ` +
        // ⚠️ Здесь стояло «по местному времени» — лог ВРАЛ: час сравнивается по UTC
        // (`setUTCHours`, паритет с 1.x — см. FULL_SYNC_AT_HOUR). Строка осталась от прежней
        // редакции и в первую же минуту сбила с толку сессию, читавшую лог стенда.
        `ночной полный проход в ${String(FULL_SYNC_AT_HOUR).padStart(2, '0')}:00 UTC` +
        `${FULL_SYNC_EVERY_CYCLE ? ' (ТЕСТОВЫЙ РЕЖИМ: каждый цикл полный)' : ''}`,
    );
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

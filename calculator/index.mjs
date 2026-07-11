// Вычислитель связей NDim Space 2.0 (фаза 4 мастер-плана).
//
// Фоновая пакетная задача: находит «грязные» точки (человек изменил оценки),
// пересчитывает их связи со всеми остальными людьми ядром похожести и пишет
// топ-250 в relations/{uid}. Обновляет и топы ВСЕХ соседей: изменение точки A
// меняет связь A в каждом чужом топе.
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

import { pathToFileURL } from 'node:url';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { computeRelation } from '../src/lib/similarity/similarity.ts';

/** Сколько похожих людей храним в топе. Паритет с 1.x. */
const TOP_LIMIT = 250;
/** Версия формата relations-документа. */
const RELATIONS_VERSION = 2;

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
      points.set(owner.id, { ratings, anonymous: owner.data().guest === true });
    }),
  );
  return points;
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

/** Один цикл пересчёта. Возвращает число пересчитанных владельцев. */
export async function runCycle() {
  const dirtySnap = await db.collection('points').where('dirty', '==', true).get();
  if (dirtySnap.empty) {
    log('грязных точек нет — пересчитывать нечего');
    return 0;
  }

  const dirtyUids = dirtySnap.docs.map((doc) => doc.id);
  log(`грязных точек: ${dirtyUids.length} (${dirtyUids.join(', ')})`);

  const points = await loadAllPoints();
  const now = Date.now();
  const batch = db.batch();

  // Изменение точки A меняет связь с A у каждого: пересчитываем топы ВСЕХ,
  // у кого есть оценки. При «dirty × все» это не дороже точечных вставок,
  // зато код очевиден и не умеет рассинхронизироваться.
  let recomputed = 0;
  for (const [uid, point] of points) {
    if (Object.keys(point.ratings).length === 0) continue;
    batch.set(db.doc(`relations/${uid}`), {
      computedAt: now,
      version: RELATIONS_VERSION,
      top: topFor(uid, points),
    });
    recomputed += 1;
  }

  for (const uid of dirtyUids) {
    batch.set(db.doc(`points/${uid}`), { dirty: false, lastSync: now }, { merge: true });
  }

  await batch.commit();
  log(`готово: пересчитано топов — ${recomputed}, флаг dirty снят у ${dirtyUids.length}`);
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

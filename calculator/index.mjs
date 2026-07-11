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

/** Читает оценки всех людей: uid → { dimId: value }. */
async function loadAllPoints() {
  const points = new Map();
  const owners = await db.collection('points').get();
  await Promise.all(
    owners.docs.map(async (owner) => {
      const dims = await owner.ref.collection('dims').get();
      const ratings = {};
      for (const dim of dims.docs) ratings[dim.id] = dim.data().value;
      points.set(owner.id, ratings);
    }),
  );
  return points;
}

/** Топ связей одного владельца против всех остальных точек. */
function topFor(ownerUid, points) {
  const ownerDims = points.get(ownerUid);
  const top = [];
  for (const [guestUid, guestDims] of points) {
    if (guestUid === ownerUid) continue;
    const relation = computeRelation(ownerDims, guestDims);
    if (relation !== null) top.push({ ...relation, guestUid });
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
  for (const [uid, dims] of points) {
    if (Object.keys(dims).length === 0) continue;
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

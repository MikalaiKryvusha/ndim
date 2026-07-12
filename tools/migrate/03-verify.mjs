// Сверка миграции — шаг 4 плана 02. Только чтение.
//
// Зелёный прогон скрипта миграции сам по себе ничего не доказывает: он мог записать не то и не
// туда. Здесь мы СРАВНИВАЕМ 1.x и 2.0 в одной и той же базе и требуем совпадения:
//
//   1. каждый человек 1.x существует в 2.0 и у него есть публичный бакет профиля;
//   2. у каждого — та же СУММА оценок и то же их ЧИСЛО (оценки — самое ценное, что есть);
//   3. ни один dimId не потерян;
//   4. ПАРИТЕТ СВЯЗЕЙ: пересчёт мигрированных точек ядром 2.0 даёт те же числа, что лежали
//      в старых relations 1.x. Это и есть настоящая проверка «математика не разъехалась».
//   5. в документах 2.0 нет чужих ПДн (email гостя из старых связей).
//
// Запуск:
//   node tools/migrate/03-verify.mjs               # песочница
//   node tools/migrate/03-verify.mjs --production  # боевая база

import { readFileSync } from 'node:fs';

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { computeRelation } from '../../src/lib/similarity/similarity.ts';
import { decodeLegacyRelation } from '../../src/lib/similarity/legacy.ts';
import { parseLegacyTop } from '../../src/lib/migration/transform.ts';

const PROJECT_ID = 'ndim-space';
const KEY_PATH = 'calculator/secrets/sa.json';

const production = process.argv.includes('--production');
const databaseId = production ? '(default)' : 'sandbox2';

initializeApp({
  credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))),
  projectId: PROJECT_ID,
});
const db = getFirestore(databaseId);

console.log(`\n═══ СВЕРКА МИГРАЦИИ (${databaseId}) ═══\n`);

const problems = [];
const check = (ok, message) => {
  console.log(`${ok ? '✅' : '❌'} ${message}`);
  if (!ok) problems.push(message);
};

// ── Данные 1.x ───────────────────────────────────────────────────────────────
const legacyUsers = await db.collection('users').get();
const legacyPoints = await db.collection('ndimids').get();

/** owner_uid → { dimId: value } из 1.x */
const legacyDims = new Map();
for (const doc of legacyPoints.docs) {
  const data = doc.data();
  if (typeof data.owner_uid === 'string') legacyDims.set(data.owner_uid, data.user_dims ?? {});
}

// ── Данные 2.0 ───────────────────────────────────────────────────────────────
const newPoints = await db.collection('points').get();
const newDims = new Map();
await Promise.all(
  newPoints.docs.map(async (doc) => {
    const dims = await doc.ref.collection('dims').get();
    const ratings = {};
    for (const dim of dims.docs) ratings[dim.id] = dim.data().value;
    newDims.set(doc.id, ratings);
  }),
);

// ── 1. Люди на месте ─────────────────────────────────────────────────────────
let missingProfiles = 0;
for (const doc of legacyUsers.docs) {
  const bucket = await db.doc(`users/${doc.id}/profile/everyone`).get();
  if (!bucket.exists) missingProfiles += 1;
}
check(missingProfiles === 0, `у всех ${legacyUsers.size} людей есть публичный бакет профиля (нет у ${missingProfiles})`);

// ── 2. Оценки: число и сумма по каждому человеку ─────────────────────────────
let mismatchedPeople = 0;
let legacyTotal = 0;
let newTotal = 0;
const lostDims = new Set();

for (const [owner, dims] of legacyDims) {
  const before = Object.entries(dims);
  const after = Object.entries(newDims.get(owner) ?? {});

  const sumBefore = before.reduce((sum, [, value]) => sum + Math.round(value), 0);
  const sumAfter = after.reduce((sum, [, value]) => sum + value, 0);

  legacyTotal += before.length;
  newTotal += after.length;

  if (before.length !== after.length || sumBefore !== sumAfter) mismatchedPeople += 1;
  for (const [dimId] of before) if (!(dimId in (newDims.get(owner) ?? {}))) lostDims.add(dimId);
}

check(mismatchedPeople === 0, `у каждого человека столько же оценок и та же их сумма (расхождений: ${mismatchedPeople})`);
check(legacyTotal === newTotal, `оценок всего: было ${legacyTotal}, стало ${newTotal}`);
check(lostDims.size === 0, `ни одно измерение не потеряно (потеряно: ${lostDims.size})`);

// ── 3. Паритет связей: пересчёт ядром 2.0 против чисел 1.x ───────────────────
const legacyRelations = await db.collection('relations').get();

let compared = 0;
let mismatchSameData = 0; // 🔴 математика разъехалась — это стоп
let staleLegacy = 0; //     🟡 человек правил оценки после последней синхронизации 1.x
const examples = [];

for (const doc of legacyRelations.docs) {
  const data = doc.data();
  const owner = data.owner_uid;
  // В боевой базе топ лежит JSON-СТРОКОЙ (а не массивом, как думала модель researches/02).
  // parseLegacyTop разбирает оба формата; пустой топ — человек ни разу не синхронизировался.
  const entries = parseLegacyTop(data.relations);
  if (entries.length === 0 || typeof owner !== 'string') continue;
  const ownerDims = newDims.get(owner);
  if (!ownerDims) continue;

  for (const entry of entries) {
    const { relation, guestUid } = decodeLegacyRelation(entry);
    const guestDims = newDims.get(guestUid);
    if (!guestDims) continue;

    const recomputed = computeRelation(ownerDims, guestDims);
    if (recomputed === null) continue;

    compared += 1;
    if (recomputed.similarity === relation.similarity) continue;

    // Сравнивать числа можно только при ОДНИХ И ТЕХ ЖЕ исходных данных. Если размеры
    // пространств разошлись, значит человек добавил или убрал измерения уже ПОСЛЕ того, как
    // сервер 1.x посчитал эту связь (в 1.x «сервером» был телефон владельца, и он часто
    // не работал). Тогда устарела цифра 1.x, а не наша — и это не повод останавливать миграцию.
    const sameData =
      recomputed.ownerSpaceSize === relation.ownerSpaceSize &&
      recomputed.guestSpaceSize === relation.guestSpaceSize &&
      recomputed.commonSpaceSize === relation.commonSpaceSize;

    if (!sameData) {
      staleLegacy += 1;
      continue;
    }

    mismatchSameData += 1;
    if (examples.length < 5) {
      examples.push(`  ${owner}→${guestUid}: 1.x ${relation.similarity}% vs 2.0 ${recomputed.similarity}%`);
    }
  }
}

check(
  compared > 0 && mismatchSameData === 0,
  `паритет похожести на НЕИЗМЕНИВШИХСЯ данных: сверено ${compared}, расхождений ${mismatchSameData}`,
);
console.log(
  `   🟡 устаревших связей 1.x (человек правил оценки после синхронизации): ${staleLegacy} — ` +
    'их пересчитает сервер синхронизации',
);
if (examples.length > 0) console.log(examples.join('\n'));

// ── 4. ПДн: чужого email в документах 2.0 быть не должно ─────────────────────
let piiLeaks = 0;
const newRelations = await db.collection('relations').get();
for (const doc of newRelations.docs) {
  const data = doc.data();
  if (!Array.isArray(data.top)) continue; // это старый документ 1.x
  for (const entry of data.top) {
    if (typeof entry.guestEmail === 'string' || typeof entry.f === 'string') piiLeaks += 1;
  }
}
check(piiLeaks === 0, `в связях 2.0 нет чужих почт (найдено: ${piiLeaks})`);

// ── Итог ─────────────────────────────────────────────────────────────────────
console.log(
  problems.length === 0
    ? '\n═══ СВЕРКА ЧИСТАЯ ═══\n'
    : `\n═══ ❌ ПРОБЛЕМ: ${problems.length} — дальше не идём ═══\n`,
);
process.exit(problems.length === 0 ? 0 : 1);

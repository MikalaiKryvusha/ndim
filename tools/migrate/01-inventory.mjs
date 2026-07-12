// Инвентаризация боевой базы 1.x — шаг 1 плана 02.
//
// ⚠️ ТОЛЬКО ЧТЕНИЕ. Скрипт не пишет в базу ни одного байта. Он отвечает на вопросы, без которых
// миграцию начинать нельзя:
//   · сколько всего документов и людей;
//   · выполняется ли инвариант «у каждого owner_uid ровно один ndimids и не больше одного
//     relations» (в 1.x связь идёт по ПОЛЮ, а не по ключу — plans/02, «ключевой риск»);
//   · нет ли сирот: ndimids/relations без users;
//   · все ли измерения из оценок людей есть в каталоге dims;
//   · сколько заявок (suggestions) сослано на автора по email и все ли эти email известны;
//   · СКОЛЬКО ЛЮДЕЙ С ПОДТВЕРЖДЁННОЙ ПОЧТОЙ — правила 2.0 требуют email_verified, чтобы
//     показать человеку хоть что-то о других. Если почта у большинства не подтверждена,
//     миграция сломает им продукт молча, и это надо знать ДО, а не после.
//
// ПДн: скрипт печатает ТОЛЬКО агрегаты и обезличенные uid. Ни одной почты, ни одного имени
// в выводе не появляется — репозиторий публичный, а утечка здесь уже случалась (bugs/01).
//
// Запуск: node tools/migrate/01-inventory.mjs
// Доступ: calculator/secrets/sa.json (ключ сервисного аккаунта, вне git).

import { readFileSync } from 'node:fs';

import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'ndim-space';
const KEY_PATH = 'calculator/secrets/sa.json';

initializeApp({
  credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))),
  projectId: PROJECT_ID,
});

const db = getFirestore();
const auth = getAuth();

const line = (label, value) => console.log(`${String(label).padEnd(46, '.')} ${value}`);

console.log(`\n═══ ИНВЕНТАРИЗАЦИЯ БОЕВОЙ БАЗЫ ${PROJECT_ID} (только чтение) ═══\n`);

// ── Что вообще есть в базе ───────────────────────────────────────────────────
const roots = await db.listCollections();
console.log('Корневые коллекции:', roots.map((collection) => collection.id).join(', '), '\n');

const counts = {};
for (const collection of roots) {
  counts[collection.id] = (await collection.count().get()).data().count;
  line(`${collection.id}/`, counts[collection.id]);
}

// ── Люди, точки, связи ───────────────────────────────────────────────────────
console.log('\n── Инвариант «один ndimids на человека» ──');

const users = await db.collection('users').get();
const userIds = new Set(users.docs.map((doc) => doc.id));

/** Группировка по ПОЛЮ owner_uid: в 1.x ключ документа с человеком не связан. */
async function groupByOwner(collectionId) {
  const snapshot = await db.collection(collectionId).get();
  const byOwner = new Map();
  const noOwner = [];
  for (const doc of snapshot.docs) {
    const owner = doc.data().owner_uid;
    if (typeof owner !== 'string' || owner === '') {
      noOwner.push(doc.id);
      continue;
    }
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), doc.id]);
  }
  return { byOwner, noOwner, total: snapshot.size };
}

const points = await groupByOwner('ndimids');
const relations = await groupByOwner('relations');

line('людей (users)', userIds.size);
line('документов ndimids', points.total);
line('владельцев с ndimids', points.byOwner.size);
line('документов relations', relations.total);
line('владельцев с relations', relations.byOwner.size);

const duplicatePoints = [...points.byOwner].filter(([, ids]) => ids.length > 1);
const duplicateRelations = [...relations.byOwner].filter(([, ids]) => ids.length > 1);

line('🔴 владельцев с НЕСКОЛЬКИМИ ndimids', duplicatePoints.length);
line('🔴 владельцев с НЕСКОЛЬКИМИ relations', duplicateRelations.length);
line('🟠 ndimids без owner_uid', points.noOwner.length);
line('🟠 relations без owner_uid', relations.noOwner.length);

const orphanPoints = [...points.byOwner.keys()].filter((uid) => !userIds.has(uid));
const orphanRelations = [...relations.byOwner.keys()].filter((uid) => !userIds.has(uid));
line('🟠 ndimids-сироты (нет users)', orphanPoints.length);
line('🟠 relations-сироты (нет users)', orphanRelations.length);

const usersWithoutPoint = [...userIds].filter((uid) => !points.byOwner.has(uid));
line('людей без ndimids (пустой NDim ID)', usersWithoutPoint.length);

if (duplicatePoints.length > 0) {
  console.log('\n  uid с несколькими ndimids (разбирать с человеком):');
  for (const [uid, ids] of duplicatePoints) console.log(`   ${uid}: ${ids.join(', ')}`);
}
if (duplicateRelations.length > 0) {
  console.log('\n  uid с несколькими relations:');
  for (const [uid, ids] of duplicateRelations) console.log(`   ${uid}: ${ids.join(', ')}`);
}

// ── Оценки и каталог измерений ───────────────────────────────────────────────
console.log('\n── Оценки и каталог измерений ──');

const catalog = new Set((await db.collection('dims').get()).docs.map((doc) => doc.id));
line('измерений в каталоге dims', catalog.size);

let totalRatings = 0;
const usedDims = new Set();
const unknownDims = new Set();
const emptyPoints = [];

for (const [owner, ids] of points.byOwner) {
  const doc = await db.collection('ndimids').doc(ids[0]).get();
  const dims = doc.data()?.user_dims ?? {};
  const entries = Object.entries(dims);
  if (entries.length === 0) emptyPoints.push(owner);
  for (const [dimId] of entries) {
    usedDims.add(dimId);
    if (!catalog.has(dimId)) unknownDims.add(dimId);
  }
  totalRatings += entries.length;
}

line('оценок поставлено всего', totalRatings);
line('измерений, реально использованных людьми', usedDims.size);
line('🔴 оценок по измерениям, которых НЕТ в каталоге', unknownDims.size);
line('ndimids с пустым user_dims', emptyPoints.length);
if (unknownDims.size > 0) console.log('  неизвестные измерения:', [...unknownDims].join(', '));

// ── Заявки на измерения ──────────────────────────────────────────────────────
console.log('\n── Заявки (suggestions) ──');
const suggestions = await db.collection('suggestions').get();
const emailToUid = new Map();
for (const doc of users.docs) {
  const email = doc.data().email;
  if (typeof email === 'string') emailToUid.set(email.toLowerCase(), doc.id);
}
let resolved = 0;
let unresolved = 0;
for (const doc of suggestions.docs) {
  const author = doc.data().author;
  if (typeof author === 'string' && emailToUid.has(author.toLowerCase())) resolved += 1;
  else unresolved += 1;
}
line('заявок всего', suggestions.size);
line('автор опознан по email → uid', resolved);
line('🟠 автора не нашли (нужен человек)', unresolved);

// ── Аккаунты Auth: подтверждена ли почта ─────────────────────────────────────
console.log('\n── Аккаунты Firebase Auth (агрегаты, без ПДн) ──');

let authTotal = 0;
let verifiedCount = 0;
let disabledCount = 0;
const providers = {};
let pageToken;
do {
  const page = await auth.listUsers(1000, pageToken);
  for (const user of page.users) {
    authTotal += 1;
    if (user.emailVerified) verifiedCount += 1;
    if (user.disabled) disabledCount += 1;
    for (const provider of user.providerData) {
      providers[provider.providerId] = (providers[provider.providerId] ?? 0) + 1;
    }
  }
  pageToken = page.pageToken;
} while (pageToken);

line('аккаунтов в Auth', authTotal);
line('✅ почта ПОДТВЕРЖДЕНА', verifiedCount);
line('🔴 почта НЕ подтверждена', authTotal - verifiedCount);
line('заблокированных', disabledCount);
console.log('  провайдеры входа:', JSON.stringify(providers));

console.log('\n═══ Готово. В базу не записано ни одного байта. ═══\n');

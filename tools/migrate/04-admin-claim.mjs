// Права администратора — шаг 5 плана 04 (cutover).
//
// В 1.x админ был списком email прямо в тексте правил (~25 повторений — см. researches/02).
// В 2.0 админ — это CLAIM В ТОКЕНЕ (`isAdmin()` в firestore.rules): права живут в Auth, а не
// в базе, и их нельзя подделать записью документа.
//
// Скрипт читает коллекцию 1.x `admins/` и выдаёт claim тем же людям — чтобы владелец не
// потерял доступ к своей же приборной панели (воронка, заявки на измерения).
//
// Запуск: node tools/migrate/04-admin-claim.mjs            # показать, кому выдаст (сухой прогон)
//         node tools/migrate/04-admin-claim.mjs --apply     # выдать
//
// ПДн: скрипт не печатает почты — только uid.

import { readFileSync } from 'node:fs';

import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'ndim-space';
const KEY_PATH = 'calculator/secrets/sa.json';

const apply = process.argv.includes('--apply');

initializeApp({
  credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))),
  projectId: PROJECT_ID,
});

const db = getFirestore();
const auth = getAuth();

// Как это лежит в боевой базе (проверено 2026-07-12): ОДИН документ
// `admins/list_of_admins` с полем `admins_emails_list` — массивом почт. Не документ на админа.
const list = (await db.doc('admins/list_of_admins').get()).data();
const emails = Array.isArray(list?.admins_emails_list) ? list.admins_emails_list : [];

/** email → uid по коллекции users (в 1.x почта дублировалась в профиле). */
const emailToUid = new Map();
for (const doc of (await db.collection('users').get()).docs) {
  const email = doc.data().email;
  if (typeof email === 'string') emailToUid.set(email.toLowerCase(), doc.id);
}

const uids = new Set();
const unresolved = [];
for (const email of emails) {
  if (typeof email !== 'string') continue;
  const uid = emailToUid.get(email.toLowerCase());
  // Почту не печатаем даже здесь: репозиторий публичный, а лог может уехать куда угодно.
  if (uid) uids.add(uid);
  else unresolved.push('(админ без аккаунта в users)');
}

console.log(`admins/ в 1.x: ${emails.length} почт(ы) → uid для claim: ${uids.size}`);
for (const uid of uids) console.log(`  ${uid}`);
if (unresolved.length > 0) console.log(`  ⚠️ не опознано: ${unresolved.length} — разбирать человеку`);

if (!apply) {
  console.log('\nСухой прогон. Чтобы выдать права: node tools/migrate/04-admin-claim.mjs --apply\n');
  process.exit(0);
}

for (const uid of uids) {
  const user = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, { ...(user.customClaims ?? {}), admin: true });
  console.log(`✅ admin: true → ${uid}`);
}

console.log('\nГотово. Claim появится в токене после следующего входа (или getIdToken(true)).\n');

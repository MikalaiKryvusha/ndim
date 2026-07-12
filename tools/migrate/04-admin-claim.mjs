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

// Почты админов 1.x → uid разрешаем ЧЕРЕЗ FIREBASE AUTH, а не через коллекцию `users`.
//
// Почему не через `users` (поймано на боевом выкате 2026-07-12): миграция 02-run.mjs
// ПЕРЕЗАПИСЫВАЕТ корневой документ `users/{uid}` схемой 2.0, а в ней поля `email` нет вовсе —
// почта это ПДн и в корень профиля не выносится (transform.ts → migrateProfile). Значит, после
// шага 2 карта email→uid по коллекции `users` пуста, и claim не достался бы НИКОМУ. Auth почту
// хранит и остаётся источником истины — там же живёт и сам claim. Порядок шагов больше не важен.
const uids = new Set();
const unresolved = [];
for (const email of emails) {
  if (typeof email !== 'string') continue;
  try {
    const user = await auth.getUserByEmail(email);
    uids.add(user.uid);
  } catch {
    // Почту не печатаем даже здесь: репозиторий публичный, а лог может уехать куда угодно.
    unresolved.push('(админ без аккаунта в Auth)');
  }
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

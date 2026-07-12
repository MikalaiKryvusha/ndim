// Прогон миграции 1.x → 2.0 — шаг 3 плана 02.
//
// ⚠️ РАБОТА С ТРУДОМ ЖИВЫХ ЛЮДЕЙ. Правила, которые здесь нарушать нельзя:
//   · СТАРОЕ НЕ ТРОГАЕМ. Скрипт только СОЗДАЁТ документы 2.0 (users/*/profile, points, relations,
//     suggestions). Коллекции 1.x (ndimids, старые relations, admins) остаются как были —
//     до отдельного решения владельца (plans/02, шаг 6). Всегда можно откатиться.
//   · ИДЕМПОТЕНТНОСТЬ. Повторный запуск даёт тот же результат: пишем по детерминированным
//     ключам (uid), а не добавляем новые документы.
//   · БОЕВАЯ БАЗА — ТОЛЬКО ПО ЯВНОМУ ФЛАГУ. По умолчанию скрипт идёт в песочницу.
//     Перепутать их нельзя: боевой прогон требует `--production`, и это осознанное трение.
//
// Вся трансформация — чистые функции src/lib/migration/transform.ts (покрыты тестами и мутациями).
// Здесь только чтение, запись батчами и журнал.
//
// Запуск:
//   node tools/migrate/02-run.mjs                # песочница migration-sandbox (по умолчанию)
//   node tools/migrate/02-run.mjs --production   # БОЕВАЯ база — только с go владельца

import { readFileSync } from 'node:fs';

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import {
  migratePoint,
  migrateProfile,
  migrateSuggestion,
} from '../../src/lib/migration/transform.ts';

const PROJECT_ID = 'ndim-space';
const SANDBOX_DB = 'sandbox2';
const KEY_PATH = 'calculator/secrets/sa.json';
/** Firestore принимает не больше 500 операций в батче. */
const BATCH_LIMIT = 400;

const production = process.argv.includes('--production');
const databaseId = production ? '(default)' : SANDBOX_DB;

initializeApp({
  credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))),
  projectId: PROJECT_ID,
});

const db = getFirestore(databaseId);

console.log(`\n═══ МИГРАЦИЯ 1.x → 2.0 ═══`);
console.log(`База: ${databaseId}${production ? '  ⚠️  БОЕВАЯ' : '  (песочница)'}\n`);

const now = Date.now();

/** Копилка операций записи: сама режется на батчи по BATCH_LIMIT. */
class Writer {
  #operations = [];
  #written = 0;

  set(path, data) {
    this.#operations.push({ path, data });
  }

  async flush() {
    while (this.#operations.length > 0) {
      const chunk = this.#operations.splice(0, BATCH_LIMIT);
      const batch = db.batch();
      for (const { path, data } of chunk) batch.set(db.doc(path), data);
      await batch.commit();
      this.#written += chunk.length;
      process.stdout.write(`\r  записано документов: ${this.#written}   `);
    }
    console.log();
    return this.#written;
  }
}

const writer = new Writer();

// ── 1. Люди: профиль → корень + публичный бакет ──────────────────────────────
const users = await db.collection('users').get();
const emailToUid = new Map();

for (const doc of users.docs) {
  const legacy = doc.data();
  if (typeof legacy.email === 'string') emailToUid.set(legacy.email.toLowerCase(), doc.id);

  const { root, everyone } = migrateProfile(legacy, now);
  writer.set(`users/${doc.id}`, root);
  writer.set(`users/${doc.id}/profile/everyone`, everyone);
}
console.log(`Люди: ${users.size}`);

// ── 2. Точки: оценки → points/{uid} + документ на измерение ──────────────────
const points = await db.collection('ndimids').get();
let ratingsMigrated = 0;
let pointsMigrated = 0;
const skippedPoints = [];

for (const doc of points.docs) {
  const legacy = doc.data();
  const owner = legacy.owner_uid;
  if (typeof owner !== 'string' || owner === '') {
    skippedPoints.push(doc.id);
    continue;
  }

  const { point, dims } = migratePoint(legacy, now);
  writer.set(`points/${owner}`, point);
  for (const [dimId, rating] of dims) {
    writer.set(`points/${owner}/dims/${dimId}`, rating);
    ratingsMigrated += 1;
  }
  pointsMigrated += 1;
}
console.log(`Точки: ${pointsMigrated}, оценок перенесено: ${ratingsMigrated}`);

// ── 3. Связи НЕ мигрируются — и это осознанное решение ───────────────────────
//
// Две причины, обе выяснились на копии боевой базы (2026-07-12):
//   1. Связи — данные ПРОИЗВОДНЫЕ: сервер синхронизации пересчитает их из точек своим ядром
//      (все перенесённые точки помечены грязными). Переносить производное — лишняя работа.
//   2. Документ 1.x лежит по ТОМУ ЖЕ пути `relations/{uid}`, что и документ 2.0. «Перенос»
//      означал бы ЗАТИРАНИЕ оригинала — прямое нарушение требования «старое не трогаем,
//      всегда можно откатиться» (plans/02).
//
// Числа 1.x при этом не теряются: они лежат в резервной копии, а сверка (03-verify.mjs)
// расшифровывает их и доказывает, что новое ядро даёт ТЕ ЖЕ значения похожести.
const relations = await db.collection('relations').get();
console.log(`Связи: не мигрируются (${relations.size} документов 1.x остаются нетронутыми) — их пересчитает сервер синхронизации`);

// ── 4. Заявки: автор по email → uid ─────────────────────────────────────────
const suggestions = await db.collection('suggestions').get();
let suggestionsMigrated = 0;
const suggestionsForHuman = [];

for (const doc of suggestions.docs) {
  const result = migrateSuggestion(doc.data(), emailToUid, now);
  if (!result.ok) {
    suggestionsForHuman.push(doc.id);
    continue;
  }
  writer.set(`suggestions/${doc.id}`, result.doc);
  suggestionsMigrated += 1;
}
console.log(`Заявки: ${suggestionsMigrated} (человеку на разбор: ${suggestionsForHuman.length})`);

// ── Запись ───────────────────────────────────────────────────────────────────
console.log('\nПишу документы 2.0 (старые коллекции не трогаю)…');
const written = await writer.flush();

console.log('\n── Итог ──');
console.log(`  документов 2.0 записано: ${written}`);
console.log(`  людей: ${users.size} · точек: ${pointsMigrated} · оценок: ${ratingsMigrated}`);
console.log(`  заявок: ${suggestionsMigrated} · связи: пересчитает сервер синхронизации`);
if (skippedPoints.length > 0) console.log(`  ⚠️ ndimids без owner_uid: ${skippedPoints.join(', ')}`);
if (suggestionsForHuman.length > 0) console.log(`  ⚠️ заявки без автора: ${suggestionsForHuman.join(', ')}`);
console.log('\n═══ Готово. Коллекции 1.x не изменены. ═══\n');

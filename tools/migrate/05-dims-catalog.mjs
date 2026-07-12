// Перенос КАТАЛОГА ИЗМЕРЕНИЙ 1.x → 2.0. Горячая починка боевого выката 2026-07-12.
//
// ── ЧТО СЛОМАЛОСЬ ────────────────────────────────────────────────────────────────────────────
// Сразу после выката экран «Профиль» упал У ВСЕХ живых людей:
//   Cannot read properties of undefined (reading 'ru')   ← src/lib/data/profile.ts, сортировка
// Причина: `02-run.mjs` перенёс людей, точки (оценки) и заявки — но КАТАЛОГ ИЗМЕРЕНИЙ не трогал
// вовсе. В боевой базе все 5112 документов `dims/` лежат в форме 1.x, где название измерения
// хранится в поле `name`, а экран 2.0 читает `title` (schema.ts → DimDoc).
//
// Почему каталог забыли: `researches/02` описывал `dims/{dimId}` одной строкой — «плюс тексты
// названия/описания оси (ru/en) — в правилах не описаны». Модель НЕ ЗНАЛА имён этих полей, и
// шаг миграции для них никто не написал. Это ровно урок EXP-0038: исследование модели — гипотеза.
//
// ── ЧТО ЗДЕСЬ ПРОИСХОДИТ ─────────────────────────────────────────────────────────────────────
//   1.x: name{ru,en} · type{ru,en} · author{ru,en} · description{ru,en} · year · tags · time{…}
//   2.0: title{ru,en} · description{ru,en} · stars · rates · rating          (schema.ts → DimDoc)
//
// Переносим ТОЛЬКО недостающее:
//   · title      ← name        (description уже нужной формы и нужного имени — не трогаем)
//   · stars/rates/rating — в боевом каталоге их НЕТ (в 1.x их насчитывал adminFunctions.
//     calculateRatings, и в базу они не попали). Считаем из настоящих оценок людей:
//     stars = сумма оценок · rates = сколько людей оценили · rating = stars/rates, до 0.1
//
// СТАРОЕ НЕ ТРОГАЕМ: пишем ДОБАВЛЕНИЕМ (merge). Поля 1.x остаются на месте, документ лишь
// обретает `title` и рейтинги. Откат — удалить добавленные поля; не потеряно ничего.
//
// В каталоге есть ОДИН служебный документ (поле `dims_list`) — это не измерение. Его пропускаем:
// у него нет `name`. Экран, со своей стороны, теперь тоже не падает на таком документе, а
// пропускает его (profile.ts) — один битый документ не имеет права ронять весь экран.
//
// Запуск:
//   node tools/migrate/05-dims-catalog.mjs --production            # СУХОЙ ПРОГОН (не пишет)
//   node tools/migrate/05-dims-catalog.mjs --production --apply    # записать

import { readFileSync } from 'node:fs';

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'ndim-space';
const SANDBOX_DB = 'sandbox2';
const KEY_PATH = 'calculator/secrets/sa.json';
const BATCH_LIMIT = 400;

const production = process.argv.includes('--production');
const apply = process.argv.includes('--apply');
const databaseId = production ? '(default)' : SANDBOX_DB;

initializeApp({
  credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))),
  projectId: PROJECT_ID,
});
const db = getFirestore(databaseId);

console.log(`\n═══ КАТАЛОГ ИЗМЕРЕНИЙ 1.x → 2.0 ═══`);
console.log(`База: ${databaseId}${production ? '  ⚠️  БОЕВАЯ' : '  (песочница)'}`);
console.log(apply ? 'Режим: ЗАПИСЬ\n' : 'Режим: сухой прогон (ничего не пишется)\n');

// ── 1. Оценки людей: считаем звёзды и число оценивших по каждому измерению ───
//
// collectionGroup('dims') захватывает И корневой каталог `dims/`, И оценки `points/{uid}/dims/`.
// Отличаем по родителю: у документа каталога родительского документа нет.
const everyDims = await db.collectionGroup('dims').get();

const stars = new Map(); // dimId → сумма оценок
const rates = new Map(); // dimId → сколько людей оценили

for (const doc of everyDims.docs) {
  if (doc.ref.parent.parent === null) continue; // это документ КАТАЛОГА, а не оценка
  const value = doc.data().value;
  if (typeof value !== 'number') continue;
  stars.set(doc.id, (stars.get(doc.id) ?? 0) + value);
  rates.set(doc.id, (rates.get(doc.id) ?? 0) + 1);
}
console.log(`Оценок людей учтено: ${[...rates.values()].reduce((a, b) => a + b, 0)}`);
console.log(`Измерений, по которым есть хоть одна оценка: ${rates.size}`);

// ── 2. Каталог: name → title + рейтинги ──────────────────────────────────────
const catalog = await db.collection('dims').get();

const operations = [];
const service = []; // служебные документы без `name` (не измерения)
let rated = 0;

for (const doc of catalog.docs) {
  const legacy = doc.data();

  if (!legacy.name || typeof legacy.name !== 'object') {
    service.push(doc.id);
    continue;
  }

  const sum = stars.get(doc.id) ?? 0;
  const count = rates.get(doc.id) ?? 0;
  if (count > 0) rated += 1;

  operations.push({
    path: `dims/${doc.id}`,
    data: {
      title: legacy.name, // уже {ru, en} — переносим как есть
      stars: sum,
      rates: count,
      // «средняя оценка измерения», округлённая до 0.1 — как в 1.x. Никто не оценил → 0.
      rating: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
    },
  });
}

console.log(`\nВ каталоге документов: ${catalog.size}`);
console.log(`  измерений к переносу:        ${operations.length}`);
console.log(`  из них с оценками людей:     ${rated}`);
console.log(`  служебных (пропускаем):      ${service.length}${service.length ? ` — ${service.join(', ')}` : ''}`);

// Оценки, под которые в каталоге НЕТ измерения (владелец знает: 15 измерений удалили из каталога).
const orphanRatings = [...rates.keys()].filter((dimId) => !catalog.docs.some((d) => d.id === dimId));
if (orphanRatings.length > 0) {
  console.log(`  ⚠️ оценки без карточки в каталоге: ${orphanRatings.length} измерений — труд людей на месте, но показать нечего (решение владельца)`);
}

if (!apply) {
  const sample = operations.slice(0, 3);
  console.log('\nПример того, что будет дописано (первые 3):');
  for (const op of sample) {
    console.log(`  ${op.path}: title=${JSON.stringify(op.data.title)} rating=${op.data.rating} (${op.data.rates} оценок)`);
  }
  console.log('\nСухой прогон. Чтобы записать: добавь --apply\n');
  process.exit(0);
}

// ── 3. Запись (только добавление полей: merge) ───────────────────────────────
console.log('\nДописываю поля 2.0 (merge — поля 1.x остаются на месте)…');
let written = 0;
while (operations.length > 0) {
  const chunk = operations.splice(0, BATCH_LIMIT);
  const batch = db.batch();
  for (const { path, data } of chunk) batch.set(db.doc(path), data, { merge: true });
  await batch.commit();
  written += chunk.length;
  process.stdout.write(`\r  обновлено измерений: ${written}   `);
}
console.log('\n\n═══ Готово. Поля 1.x не изменены. ═══\n');

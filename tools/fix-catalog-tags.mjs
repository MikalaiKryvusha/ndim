/**
 * ДОСТАВЛЯЕТ ОБЯЗАТЕЛЬНЫЕ ТЕГИ ЗАПИСЯМ КАТАЛОГА — по соглашению, выведенному замером (`bugs/144`).
 *
 * Повод: агент оформил десять кандидатов без обязательных тегов вида, владелец их одобрил, и
 * записи ушли в каталог с неполными тегами. Замечание владельца: «*ВО ВСЕХ фильмах у меня
 * обязательные теги есть: кино, фильм, movie, film… это КЛАСС*».
 *
 * 🔴 ЧТО ПРИБОР ДЕЛАЕТ И ЧЕГО НЕ ДЕЛАЕТ:
 *   · ДОБАВЛЯЕТ недостающие обязательные теги вида. Ни одного существующего тега не удаляет и не
 *     переписывает: теги ставил владелец, и его выбор — не предмет правки прибором;
 *   · НЕ создаёт измерений. Инвариант В3 = А цел: прибор работает только по СУЩЕСТВУЮЩИМ записям;
 *   · НЕ трогает ничего, кроме поля `tags`.
 *
 * ⚠️ СУХОЙ ПРОГОН ПО УМОЛЧАНИЮ, как у всех пишущих приборов проекта.
 *
 * Запуск:
 *   node tools/fix-catalog-tags.mjs --contour prod --batch candidates/batches/01_2026_films.json
 *   node tools/fix-catalog-tags.mjs --contour prod --batch <файл> --apply
 *   node tools/fix-catalog-tags.mjs --contour prod --all            # ВЕСЬ каталог, только сухо
 *
 * 🔑 Область правки задаётся ЯВНО. `--batch` чинит только записи, рождённые из этой партии (адрес
 * берётся из `approvedDimId` кандидата) — то есть ровно свой ущерб. `--all` обходит каталог
 * целиком и по умолчанию ТОЛЬКО ПОКАЗЫВАЕТ: массовая правка чужих записей — решение владельца,
 * а не побочный эффект починки агентской ошибки.
 */
import { readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { missingMandatoryTags } from './lib/tag-conventions.mjs';

const argOf = (name, def = null) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const CONTOUR = argOf('--contour', 'stand');
const BATCH = argOf('--batch', null);
const ALL = process.argv.includes('--all');
const APPLY = process.argv.includes('--apply');

if (!BATCH && !ALL) {
  console.error('Задай область: --batch <файл партии> либо --all');
  process.exit(2);
}
if (ALL && APPLY) {
  console.error('🔴 `--all --apply` запрещено этим прибором.');
  console.error('   Массовая правка тегов чужих записей — решение владельца, а не починка агентом');
  console.error('   собственной ошибки. Покажи ему числа сухим прогоном и спроси.');
  process.exit(2);
}

let db;
if (CONTOUR === 'stand') {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8181';
  initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-ndim-dev' });
  db = getFirestore();
} else {
  const { serviceAccount } = await import('./lib/credentials.mjs');
  const { CONTOURS } = await import('./lib/contours.mjs');
  const contour = CONTOURS[CONTOUR];
  if (contour === undefined) {
    console.error(`Неизвестный контур «${CONTOUR}». Возможные: stand · stage · prod`);
    process.exit(2);
  }
  initializeApp({ credential: cert(serviceAccount(CONTOUR)), projectId: contour.project });
  db = getFirestore(contour.database);
}

/** Адреса измерений, рождённых из партии: их знает сам кандидат — поле `approvedDimId`. */
async function idsFromBatch(file) {
  const batch = JSON.parse(readFileSync(file, 'utf8'));
  const out = [];
  for (const item of batch.candidates ?? []) {
    const snap = await db.collection('dim_candidates').doc(`wikidata-${item.wikidata}`).get();
    const dimId = snap.exists ? snap.data()?.approvedDimId : undefined;
    if (dimId) out.push({ dimId, title: item.title?.ru, tags: item.tags ?? [] });
    else console.log(`  ⏭ ${item.title?.ru} — не одобрен, измерения ещё нет`);
  }
  return out;
}

console.log('\n═══ ОБЯЗАТЕЛЬНЫЕ ТЕГИ КАТАЛОГА ═══');
console.log(`  контур: ${CONTOUR}${APPLY ? '' : '  (СУХОЙ ПРОГОН — ничего не пишется)'}`);
console.log(`  область: ${BATCH ? `партия ${BATCH}` : 'ВЕСЬ каталог'}\n`);

const targets = [];
if (BATCH) {
  for (const { dimId, title, tags } of await idsFromBatch(BATCH)) {
    const snap = await db.collection('dims').doc(dimId).get();
    if (snap.exists) targets.push({ id: dimId, data: snap.data(), title, fromBatch: tags });
  }
} else {
  const all = await db.collection('dims').get();
  for (const doc of all.docs) {
    if (doc.id === 'dims_list') continue;
    targets.push({ id: doc.id, data: doc.data(), title: doc.data()?.title?.ru });
  }
}

let touched = 0;
let clean = 0;
for (const t of targets) {
  const missing = missingMandatoryTags(t.data);
  // В режиме партии правка нужна и тогда, когда обязательные теги на месте: набор мог разойтись
  // с источником по остальным тегам (имена собственные, отсутствие английской половины пары).
  const sameAsBatch = t.fromBatch
    && t.fromBatch.length === (t.data.tags ?? []).length
    && t.fromBatch.every((x, i) => String((t.data.tags ?? [])[i]).toLowerCase() === x.toLowerCase());
  if (missing.length === 0 && (!t.fromBatch || sameAsBatch)) {
    clean += 1;
    continue;
  }
  touched += 1;
  const kept = Array.isArray(t.data.tags) ? t.data.tags : [];

  /*
   * ДВА РАЗНЫХ СЛУЧАЯ, И ПУТАТЬ ИХ НЕЛЬЗЯ.
   *
   * · `--batch`: запись РОЖДЕНА из этой партии, то есть теги ей ставил АГЕНТ. Источник истины —
   *   файл партии, он же проехал ворота обязательных тегов. Поэтому набор берётся оттуда целиком,
   *   а всё, что уходит, печатается поимённо: молчаливое удаление тега — это правка за владельца.
   * · `--all`: теги ставил ВЛАДЕЛЕЦ. Его выбор прибором не переписывается никогда — только
   *   дополняется недостающим обязательным.
   */
  const next = t.fromBatch ? [...t.fromBatch] : [...missing, ...kept];
  const dropped = kept.filter((tag) => !next.some((n) => n.toLowerCase() === String(tag).toLowerCase()));
  const added = next.filter((tag) => !kept.some((k) => String(k).toLowerCase() === tag.toLowerCase()));

  console.log(`  ${APPLY ? '✅' : '·'} ${t.title ?? t.id}`);
  if (added.length) console.log(`       + ${added.join(', ')}`);
  if (dropped.length) console.log(`       − ${dropped.join(', ')}   ← уходит, названо явно`);
  if (APPLY) await db.collection('dims').doc(t.id).update({ tags: next });
}

console.log('\n──────────────────────────────────────────────────────────────');
console.log(`записей осмотрено: ${targets.length} · уже по соглашению: ${clean} · требуют правки: ${touched}`);
if (!APPLY) console.log('СУХОЙ ПРОГОН. Записать: добавь --apply');
console.log('⛔ Прибор НЕ СОЗДАЁТ измерений: инвариант В3 = А цел, он работает только по существующим.');
console.log(BATCH
  ? '⚠️ Режим партии ЗАМЕНЯЕТ набор тегов на источник — всё уходящее напечатано выше поимённо.'
  : '⛔ Режим `--all` только ДОПОЛНЯЕТ: ни одного тега владельца не удаляется.');

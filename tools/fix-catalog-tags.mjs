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
import { readFileSync, writeFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { missingMandatoryTags, looksLikeProperName, mandatoryTagsFor } from './lib/tag-conventions.mjs';

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
/*
 * 🔴 ЗАМОК МАССОВОЙ ПРАВКИ. Теги каталога ставил ВЛАДЕЛЕЦ, и трогать их пачкой — не починка
 * агентом своей ошибки, а правка чужой работы. Снимается только его ДОСЛОВНЫМИ словами, и они
 * уезжают в файл отката вместе со снимком «до»: через месяц никто не вспомнит, по чьему слову
 * изменились 85 записей.
 */
const AUTH = argOf('--auth-owner', null);
if (ALL && APPLY && !AUTH) {
  console.error('🔴 `--all --apply` требует слова владельца.');
  console.error('   Массовая правка тегов, которые ставил он, — его решение, а не побочный эффект');
  console.error('   починки агентской ошибки. Покажи числа сухим прогоном и спроси.');
  console.error('   Снять замок: --auth-owner "<его дословные слова>"');
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

/*
 * ── ПОЛНАЯ КАРТИНА НЕПОРЯДКА (только `--all`) ───────────────────────────────────────────────
 *
 * Прибор чинит ОДНУ вещь — недостающие обязательные теги. Но молчать о соседних видах непорядка
 * он не имеет права: «зелёный отчёт» о том, что прибор умеет, читается как «в каталоге порядок».
 * Поэтому остальное НАЗЫВАЕТСЯ числом и оставляется владельцу.
 */
if (ALL) {
  const noTags = targets.filter((t) => !Array.isArray(t.data.tags) || t.data.tags.length === 0);
  const withProper = targets.filter((t) => (t.data.tags ?? []).some(looksLikeProperName));
  const noKind = targets.filter((t) => String(t.data?.type?.ru ?? '').trim() === '');
  const unknownKind = targets.filter(
    (t) => String(t.data?.type?.ru ?? '').trim() !== '' && mandatoryTagsFor(t.data?.type?.ru).length === 0,
  );
  console.log('📋 КАРТИНА КАТАЛОГА (чиню только первую строку, остальное — Вам числом):');
  console.log(`   · нет обязательных тегов вида ......... ${targets.filter((t) => missingMandatoryTags(t.data).length > 0).length}   ← ЭТО ЧИНЮ`);
  console.log(`   · тегов нет вовсе ..................... ${noTags.length}`);
  console.log(`   · есть тег с заглавной буквы ......... ${withProper.length}   (прокси имени собственного; аббревиатуры жанров сюда не считаются)`);
  console.log(`   · вид не назван вовсе ................ ${noKind.length}`);
  console.log(`   · вид вне соглашения (редкий) ........ ${unknownKind.length}\n`);
}

let touched = 0;
let clean = 0;
const rollback = [];
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
  // Снимок «до» пишется ВСЕГДА, даже в сухом прогоне: файл отката, появившийся только вместе с
  // записью, бесполезен ровно в тот момент, когда он нужен, — когда запись уже прошла.
  rollback.push({ id: t.id, title: t.title ?? null, before: kept, after: next });
  if (APPLY) await db.collection('dims').doc(t.id).update({ tags: next });
}

/*
 * ФАЙЛ ОТКАТА — рядом с приборами, как у переписчика описаний (`tools/rewrites-*--rollback.json`).
 * Несёт снимок «до», снимок «после» и ДОСЛОВНЫЕ слова владельца, которыми снят замок: через месяц
 * никто не вспомнит, по чьему слову изменились 85 записей, а файл ответит.
 */
if (rollback.length > 0) {
  const name = `tools/tags-${BATCH ? 'batch' : 'all'}--rollback.json`;
  writeFileSync(name, `${JSON.stringify({
    contour: CONTOUR,
    applied: APPLY,
    auth: AUTH,
    records: rollback,
  }, null, 2)}\n`, 'utf8');
  console.log(`\n📄 Откат: ${name} (${rollback.length} записей, снимок «до» и «после»)`);
}

console.log('\n──────────────────────────────────────────────────────────────');
console.log(`записей осмотрено: ${targets.length} · уже по соглашению: ${clean} · требуют правки: ${touched}`);
if (!APPLY) console.log('СУХОЙ ПРОГОН. Записать: добавь --apply');
console.log('⛔ Прибор НЕ СОЗДАЁТ измерений: инвариант В3 = А цел, он работает только по существующим.');
console.log(BATCH
  ? '⚠️ Режим партии ЗАМЕНЯЕТ набор тегов на источник — всё уходящее напечатано выше поимённо.'
  : '⛔ Режим `--all` только ДОПОЛНЯЕТ: ни одного тега владельца не удаляется.');

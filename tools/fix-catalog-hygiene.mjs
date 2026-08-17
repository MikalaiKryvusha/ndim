/**
 * ГИГИЕНА ЗАПИСЕЙ КАТАЛОГА — невидимые символы, провёрнутые поля вида, теги-имена собственные.
 *
 * AUTH владельца 2026-08-17: «*вычищай*» (теги-имена) и «*Movie (3 записи)… 1998 (1 запись)…
 * невидимый символ нулевой ширины — почини это, пожалуйста*».
 *
 * 🔴 ТРИ РАЗНЫХ ДЕФЕКТА, И ПОЧИНКА У КАЖДОГО СВОЯ:
 *
 * 1. **НУЛЕВАЯ ШИРИНА.** `U+200B`, `U+200C`, `U+200D`, `U+FEFF` — символы без изображения и без
 *    смысла. Они ломают ровно то, ради чего поля существуют: поиск по названию не находит
 *    «Секретное досье», потому что в базе оно «Секретное досье<ZWSP>»; тег `fantasy<ZWSP>` не
 *    совпадает с `fantasy` и не собирается в облако; вид `TV Series<ZWSP>` выпадает из соглашения
 *    о тегах. Вычищаются ВЕЗДЕ: названия, вид, год, теги, описания.
 *    ⛔ **Неразрывный пробел (`U+00A0`) НЕ ТРОГАЕМ.** Он невидим, но осмыслен: в «Reality
 *    Transurfing. Step III» он держит номер ступени при переносе. Это типографика владельца,
 *    а не мусор, и стричь её под одну гребёнку с нулевой шириной было бы правкой смысла.
 *
 * 2. **ПРОВЁРНУТЫЕ ПОЛЯ ВИДА.** У четырёх записей значения вида и года переставлены местами:
 *    `type.ru = «Movie»`, `type.en = «1993»`, `year = «Фильм»`. Чинится ПЕРЕСБОРКОЙ из тех же
 *    трёх значений, а не выдумыванием: год — то из них, что состоит из цифр; вид — «Фильм»/«Movie».
 *    🔑 Прибор отказывается трогать запись, если тройка НЕ раскладывается на «год + Фильм + Movie»:
 *    догадка о чужом значении дороже пропущенной записи.
 *
 * 3. **ТЕГИ-ИМЕНА СОБСТВЕННЫЕ** из списка `tools/tags-drop-proper-names.json` — по правилу
 *    владельца «*тегами описывать не имена собственные, а суть*». Список ЗАКРЫТЫЙ и назван им
 *    поимённо; лор видеоигр в него намеренно не входит (разбор — в шапке того файла).
 *
 * ⚠️ СУХОЙ ПРОГОН ПО УМОЛЧАНИЮ. Запись требует `--apply` и `--auth-owner "<дословные слова>"`.
 * Файл отката со снимками «до» и «после» пишется ВСЕГДА, включая сухой прогон.
 *
 * Запуск:
 *   node tools/fix-catalog-hygiene.mjs --contour prod
 *   node tools/fix-catalog-hygiene.mjs --contour prod --apply --auth-owner "вычищай"
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const argOf = (name, def = null) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const CONTOUR = argOf('--contour', 'stand');
const APPLY = process.argv.includes('--apply');
const AUTH = argOf('--auth-owner', null);
const OUT = 'tools/hygiene--rollback.json';

if (APPLY && !AUTH) {
  console.error('🔴 Запись требует слова владельца: --auth-owner "<его дословные слова>"');
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
  if (!contour) { console.error(`Неизвестный контур «${CONTOUR}»`); process.exit(2); }
  initializeApp({ credential: cert(serviceAccount(CONTOUR)), projectId: contour.project });
  db = getFirestore(contour.database);
}

/** Только НУЛЕВАЯ ШИРИНА. Неразрывного пробела здесь намеренно нет — см. шапку. */
const ZERO_WIDTH = /[​‌‍﻿]/g;
const strip = (s) => (typeof s === 'string' ? s.replace(ZERO_WIDTH, '') : s);

const DROP = new Set(
  (JSON.parse(readFileSync('tools/tags-drop-proper-names.json', 'utf8')).drop ?? [])
    .map((t) => t.toLowerCase()),
);

const isYear = (v) => /^\d{4}(\s*[–—-]\s*\d{4})?$/.test(String(v ?? '').trim());

const all = await db.collection('dims').get();
console.log('\n═══ ГИГИЕНА КАТАЛОГА ═══');
console.log(`  контур: ${CONTOUR}${APPLY ? '' : '  (СУХОЙ ПРОГОН — ничего не пишется)'}`);
console.log(`  записей в каталоге: ${all.size - 1}\n`);

const rollback = [];
let zw = 0;
let kinds = 0;
let dropped = 0;
const skippedKinds = [];

for (const doc of all.docs) {
  if (doc.id === 'dims_list') continue;
  const data = doc.data();
  const patch = {};
  const notes = [];

  // ── 1. Нулевая ширина во всех текстовых полях ────────────────────────────────────────────
  for (const field of ['title', 'type', 'description', 'author']) {
    const v = data[field];
    if (v && typeof v === 'object') {
      const next = {};
      let changed = false;
      for (const [k, s] of Object.entries(v)) {
        next[k] = strip(s);
        if (next[k] !== s) changed = true;
      }
      if (changed) { patch[field] = next; notes.push(`нулевая ширина в ${field}`); }
    }
  }
  if (typeof data.year === 'string' && strip(data.year) !== data.year) {
    patch.year = strip(data.year);
    notes.push('нулевая ширина в year');
  }

  // ── 3. Теги: снять нулевую ширину И вычистить имена собственные ──────────────────────────
  if (Array.isArray(data.tags)) {
    const cleaned = data.tags.map(strip);
    const kept = cleaned.filter((t) => !DROP.has(String(t).trim().toLowerCase()));
    const removed = cleaned.filter((t) => DROP.has(String(t).trim().toLowerCase()));
    const zwInTags = cleaned.some((t, i) => t !== data.tags[i]);
    if (removed.length > 0 || zwInTags) {
      patch.tags = kept;
      if (zwInTags) notes.push('нулевая ширина в тегах');
      if (removed.length > 0) notes.push(`имена собственные: ${removed.join(', ')}`);
      dropped += removed.length;
    }
  }

  // ── 2. Провёрнутые поля вида ─────────────────────────────────────────────────────────────
  const ru = String((patch.type ?? data.type)?.ru ?? '').trim();
  const en = String((patch.type ?? data.type)?.en ?? '').trim();
  const yr = String(patch.year ?? data.year ?? '').trim();
  const trio = [ru, en, yr];
  const looksRotated = ru !== 'Фильм' && trio.some(isYear) && trio.some((v) => v === 'Фильм' || v === 'Movie');
  if (looksRotated) {
    const year = trio.find(isYear);
    const hasRu = trio.includes('Фильм');
    const hasEn = trio.includes('Movie');
    // Раскладывается ли тройка ровно на «год + Фильм + Movie»? Если нет — не гадаем.
    if (year && (hasRu || hasEn)) {
      patch.type = { ...(patch.type ?? data.type), ru: 'Фильм', en: 'Movie' };
      patch.year = year;
      notes.push(`вид пересобран: [${trio.join(' | ')}] → Фильм | Movie | ${year}`);
      kinds += 1;
    } else {
      skippedKinds.push(`${data.title?.ru}: [${trio.join(' | ')}]`);
    }
  }

  if (Object.keys(patch).length === 0) continue;
  if (notes.some((n) => n.startsWith('нулевая ширина'))) zw += 1;

  rollback.push({
    id: doc.id,
    title: strip(data.title?.ru) ?? null,
    before: { title: data.title, type: data.type, year: data.year, tags: data.tags, author: data.author, description: data.description },
    after: patch,
    notes,
  });
  if (APPLY) await doc.ref.update(patch);
}

writeFileSync(OUT, `${JSON.stringify({ contour: CONTOUR, applied: APPLY, auth: AUTH, records: rollback }, null, 2)}\n`, 'utf8');

console.log(`  записей затронуто ................. ${rollback.length}`);
console.log(`   · с нулевой шириной .............. ${zw}`);
console.log(`   · вид пересобран ................. ${kinds}`);
console.log(`   · тегов-имён снято ............... ${dropped}`);
if (skippedKinds.length) {
  console.log(`\n⏭ ВИД НЕ ТРОНУТ (тройка не раскладывается — гадать не стал): ${skippedKinds.length}`);
  for (const s of skippedKinds) console.log(`   · ${s}`);
}
for (const r of rollback.filter((r) => r.notes.some((n) => !n.startsWith('нулевая ширина'))).slice(0, 30)) {
  console.log(`  ${APPLY ? '✅' : '·'} ${r.title}: ${r.notes.join(' · ')}`);
}
console.log(`\n📄 Откат: ${OUT} (${rollback.length} записей)`);
if (!APPLY) console.log('СУХОЙ ПРОГОН. Записать: --apply --auth-owner "<слова владельца>"');
console.log('⛔ Неразрывный пробел не тронут: он невидим, но осмыслен (типографика владельца).');

#!/usr/bin/env node
/**
 * ДОСТАВЛЯЕТ ПАРЫ СИНОНИМОВ В ТЕГИ ЖИВОГО КАТАЛОГА — слово владельца 2026-09-05.
 *
 * Интервью №061 В7 = В: «*нужно писать role-playing game и RPG одновременно, во все такие игры*»,
 * и уточнение в чате: «*ролевая игра и РПГ — ничего не ломает*». Группа «ролевая игра» несёт ДВЕ
 * пары — «ролевая игра» ↔ «role-playing game» и «РПГ» ↔ «RPG»; каждая «такая игра» получает обе.
 * Логика доставки — чистая функция `completePairs` (`lib/tag-pairs.mjs`, юниты рядом).
 *
 * 🔴 ЧТО ПРИБОР ДЕЛАЕТ И ЧЕГО НЕ ДЕЛАЕТ:
 *   · ДОБАВЛЯЕТ недостающие слова группы и ставит их блоком на место первого из них — так пары
 *     «i-й кириллический ↔ i-й латинский» сходятся и до блока, и после;
 *   · единственное переписывание — строчное «rpg» уходит в канон «RPG» (называется в журнале);
 *   · ни одного тега вне группы не удаляет и не переставляет; ничего, кроме поля `tags`, не трогает;
 *   · записи без слов группы не трогает вовсе.
 *
 * ⚠️ СУХОЙ ПРОГОН ПО УМОЛЧАНИЮ, как у всех пишущих приборов проекта. Массовая правка тегов
 * владельца снимается только его дословными словами (`--auth-owner`), и они уезжают в файл отката
 * вместе со снимком «до»: замок тот же, что у `fix-catalog-tags.mjs --all --apply`.
 *
 * Запуск:
 *   node tools/fix-catalog-tag-pairs.mjs --contour prod --group rpg                    # сухо
 *   node tools/fix-catalog-tag-pairs.mjs --contour prod --group rpg --apply --auth-owner "<слова>"
 *   node tools/fix-catalog-tag-pairs.mjs --selftest
 *
 * После `--apply` на бою: `node tools/fetch-dims-slice.mjs --all` — иначе сборка и публичные
 * страницы каталога живут старым снимком `dims-build.json`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { completePairs, ГРУППЫ } from './lib/tag-pairs.mjs';

const ЗАПУЩЕН_НАПРЯМУЮ = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

const argOf = (name, def = null) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

/** Самопроверка: чистая логика на трёх живых раскладках — без базы и без сети. */
export function selftest() {
  const fails = [];
  const ok = (name, cond) => { if (!cond) fails.push(name); };
  const G = ГРУППЫ.rpg;
  const a = completePairs(['видеоигра', 'video game', 'ролевая игра', 'RPG', 'детектив', 'detective'], G);
  ok('пара ролевая игра ↔ RPG достраивается до двух пар', a.tags.join('|') === 'видеоигра|video game|ролевая игра|role-playing game|РПГ|RPG|детектив|detective');
  const b = completePairs(['видеоигра', 'video game', 'rpg', 'ролевая игра'], G);
  ok('строчное rpg уходит в канон', b.tags.includes('RPG') && !b.tags.includes('rpg') && b.normalized.length === 1);
  const c = completePairs(['фильм', 'movie'], G);
  ok('чужая запись не трогается', c.touched === false);
  return fails;
}

async function main() {
  if (process.argv.includes('--selftest')) {
    const fails = selftest();
    console.log(fails.length ? '🔴 ПРОВАЛЫ:\n  ' + fails.join('\n  ') : '✅ самотест доставки пар чист');
    return fails.length ? 1 : 0;
  }

  const CONTOUR = argOf('--contour', 'stand');
  const GROUP = argOf('--group', 'rpg');
  const APPLY = process.argv.includes('--apply');
  const AUTH = argOf('--auth-owner', null);
  const group = ГРУППЫ[GROUP];
  if (!group) {
    console.error(`Неизвестная группа «${GROUP}». Есть: ${Object.keys(ГРУППЫ).join(', ')}`);
    return 2;
  }
  if (APPLY && !AUTH) {
    console.error('🔴 `--apply` требует слова владельца: --auth-owner "<его слова дословно>". Теги каталога ставил он.');
    return 2;
  }

  const { cert, initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
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
      return 2;
    }
    initializeApp({ credential: cert(serviceAccount(CONTOUR)), projectId: contour.project });
    db = getFirestore(contour.database);
  }

  console.log(`\n═══ ПАРЫ СИНОНИМОВ «${group.имя}» → ${group.пары.map((p) => p.join(' ↔ ')).join(' · ')} ═══`);
  console.log(`  контур: ${CONTOUR}${APPLY ? '' : '  (СУХОЙ ПРОГОН — ничего не пишется)'}\n`);

  const all = await db.collection('dims').get();
  const changes = [];
  const виды = new Map();
  for (const doc of all.docs) {
    if (doc.id === 'dims_list') continue;
    const data = doc.data();
    const r = completePairs(data.tags ?? [], group);
    if (!r.touched) continue;
    const вид = String(data?.type?.ru ?? '—');
    виды.set(вид, (виды.get(вид) ?? 0) + 1);
    changes.push({ id: doc.id, title: data?.title?.ru ?? doc.id, before: data.tags ?? [], after: r.tags, added: r.added, normalized: r.normalized });
  }

  console.log(`  записей каталога: ${all.size - 1} · «таких игр» с неполными парами: ${changes.length}`);
  console.log('  по видам: ' + [...виды].map(([k, n]) => `${k} ${n}`).join(' · '));
  const поДобавке = new Map();
  for (const c of changes) {
    const k = c.added.join(' + ') || 'только регистр';
    поДобавке.set(k, (поДобавке.get(k) ?? 0) + 1);
  }
  console.log('  что добавляется:');
  for (const [k, n] of [...поДобавке].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(4)} × ${k}`);
  const norm = changes.filter((c) => c.normalized.length);
  if (norm.length) console.log(`  регистр приводится: ${norm.map((c) => `${c.title} (${c.normalized.join(', ')})`).join('; ')}`);
  console.log('\n  примеры (до → после):');
  for (const c of changes.slice(0, 5)) {
    console.log(`   · ${c.title}`);
    console.log(`       до:    ${JSON.stringify(c.before)}`);
    console.log(`       после: ${JSON.stringify(c.after)}`);
  }

  if (!APPLY) {
    console.log('\n  Сухой прогон завершён. Применить: --apply --auth-owner "<слова владельца>".');
    return 0;
  }

  const name = `tools/tag-pairs-${GROUP}--rollback.json`;
  writeFileSync(
    name,
    JSON.stringify({ at: new Date().toISOString(), contour: CONTOUR, group: GROUP, authOwner: AUTH, records: changes }, null, 2) + '\n',
    'utf8',
  );
  console.log(`\n📄 Откат: ${name} (${changes.length} записей, снимок «до» и «после»)`);

  let written = 0;
  for (let i = 0; i < changes.length; i += 400) {
    const batch = db.batch();
    for (const c of changes.slice(i, i + 400)) batch.update(db.collection('dims').doc(c.id), { tags: c.after });
    await batch.commit();
    written += Math.min(400, changes.length - i);
    console.log(`  записано ${written} из ${changes.length}`);
  }
  console.log(`\n✅ ПАРЫ ДОСТАВЛЕНЫ: ${written} записей на контуре ${CONTOUR}.`);
  console.log('   Дальше: node tools/fetch-dims-slice.mjs --all — обновить снимок каталога для сборки.');
  return 0;
}

if (ЗАПУЩЕН_НАПРЯМУЮ) {
  const code = await main();
  process.exit(code);
}

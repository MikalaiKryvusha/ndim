/**
 * СНИМАЕТ КАНДИДАТА С ВЫЧИТКИ — для объекта, который ЕЩЁ НЕ ВЫШЕЛ.
 *
 * Слово владельца 2026-08-22, дословно: «*Если назначен, то какого хуя ты завёл его и даёшь мне
 * на вычитку как то, чем якобы люди будут формировать свой профиль NDim ID? Как ты себе это
 * представляешь, если люди ещё не видели этот фильм?*» — класс 1 в
 * `candidates/owner-critical-notes-2026-08-22.md`.
 *
 * 🔴 ПОЧЕМУ УДАЛЕНИЕ, А НЕ СТАТУС. Отклонение (`rejected`) — РЕШЕНИЕ ВЛАДЕЛЬЦА, агент его за
 * него не выносит. Возврат в `pending` кладёт карточку ему же на глаза — ровно то, на что он
 * пожаловался. Своего статуса «отложено» в продукте нет, и заводить его ради двух карточек
 * значит менять модель данных под разовый случай (бритва Оккама). Поэтому документ снимается
 * из очереди целиком, а карточка остаётся жить в файле партии и приедет заново, когда объект
 * выйдет: `seed-dim-candidates.mjs` выводит идентификатор документа из QID и перезапишет тот же.
 *
 * ⚠️ ПЕРЕД УДАЛЕНИЕМ ПРИБОР СОХРАНЯЕТ ДОКУМЕНТ ЦЕЛИКОМ в файл отката — вместе с замечанием
 * владельца. Замечание, стёртое без следа, равносильно ненаписанному (тот же довод, что в
 * `read-returned-candidates.mjs`).
 *
 * Запуск:
 *   node tools/withdraw-candidate.mjs --contour prod wikidata-Q1 wikidata-Q2      # СУХОЙ прогон
 *   node tools/withdraw-candidate.mjs --contour prod wikidata-Q1 --apply          # запись
 *
 * 🔴 Боевой контур — только Менеджер (манифест команды, «Ресурсы машины»).
 */
import { writeFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};

const CONTOUR = arg('--contour', 'stand');
const APPLY = argv.includes('--apply');
const ids = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--contour');

if (ids.length === 0) {
  console.error('Не назван ни один документ. Пример: node tools/withdraw-candidate.mjs --contour prod wikidata-Q130590402');
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

console.log(`\n═══ СНЯТИЕ С ВЫЧИТКИ ═══\n  контур: ${CONTOUR} · документов: ${ids.length} · режим: ${APPLY ? 'ЗАПИСЬ' : 'сухой прогон'}\n`);

const backup = [];
let missing = 0;

for (const id of ids) {
  const ref = db.collection('dim_candidates').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`  ⚠️ ${id} — документа нет, пропускаю`);
    missing += 1;
    continue;
  }
  const data = snap.data();
  backup.push({ id, data });
  console.log(`  ── ${data.title?.ru ?? '(без названия)'} · статус «${data.status}»`);
  if (data.ownerNote) console.log(`     замечание владельца сохраняется в откат: ${data.ownerNote}`);
  if (APPLY) {
    await ref.delete();
    console.log(`     🔴 снят из очереди`);
  } else {
    console.log(`     (сухой прогон — не тронут)`);
  }
}

if (backup.length > 0) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = `homeworks/withdrawn-candidates--${stamp}.json`;
  writeFileSync(file, JSON.stringify(backup, null, 2), 'utf8');
  console.log(`\n  💾 откат: ${file}`);
}

console.log(`\n  Итог: снято ${APPLY ? backup.length : 0} · найдено ${backup.length} · не найдено ${missing}\n`);
if (!APPLY) console.log('  Это был СУХОЙ прогон. Повтори с --apply, чтобы снять.\n');

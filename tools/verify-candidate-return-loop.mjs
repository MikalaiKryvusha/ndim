/**
 * СТРАЖ КРУГА ВОЗВРАТА НА ДОРАБОТКУ — `bugs/142`, обратное плечо контура вычитки.
 *
 * ЧТО СТЕРЕЖЁТ И ПОЧЕМУ ИМЕННО ЭТО. Экранную половину контура судит `verify-admin-dims`
 * (п.9м…п.9у): кнопка, поле комментария, статус и то, что возврат не заводит измерение. Но
 * контур замыкается НЕ на экране: владелец написал замечание — агент обязан его прочитать,
 * поправить текст и вернуть карточку в очередь. Эта половина живёт в двух приборах
 * (`seed-dim-candidates.mjs` и `read-returned-candidates.mjs`), экрана не касается вовсе, и ни
 * один существующий страж её не видел.
 *
 * 🔴 КЛАСС ДЕФЕКТА, РАДИ КОТОРОГО СТРАЖ И ЗАВЕДЁН. Прибор выгрузки считал «уже разобранным» всё,
 * что не `pending` (`status !== 'pending'`). С появлением четвёртого статуса это замкнуло бы
 * контур в ТУПИК: возвращённая владельцем карточка не вернулась бы к нему никогда, а прибор
 * честно печатал бы «не тронут». Тот же класс, что `bugs/129` и `bugs/140` — условие «всё, что
 * не X, — это Y» живёт ровно до появления Z. Дефект найден чтением кода в день появления
 * четвёртого статуса и закрыт вместе со стражем.
 *
 * 🧹 Пишет ТОЛЬКО в свой документ и убирает за собой; уборка ПРОВЕРЯЕТСЯ (правило класса
 * `bugs/103`). Идентификатор заведомо не встречается в реестре: `Q999999999`.
 *
 * Запуск (свой проект эмулятора — чтобы не зависеть от данных стенда и не мешать им):
 *   npx firebase emulators:exec --only firestore --project demo-ndim-loop \
 *     "node tools/verify-candidate-return-loop.mjs"
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

if (process.env.FIRESTORE_EMULATOR_HOST === undefined) {
  console.error('❌ Нужен эмулятор. Запускай через `firebase emulators:exec --only firestore …`');
  console.error('   Боевого контура у этого стража нет и быть не должно: он ПИШЕТ.');
  process.exit(2);
}

initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-ndim-loop' });
const db = getFirestore();

const WORK = 'test-results/candidate-return-loop';
const BATCH = `${WORK}/batch.json`;
const QID = 'Q999999999';
const DOC = `wikidata-${QID}`;
mkdirSync(WORK, { recursive: true });

let pass = 0;
const fails = [];
function check(ok, what, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  ✅ ${what}`);
  } else {
    fails.push(`${what}${detail ? ' — ' + detail : ''}`);
    console.log(`  ❌ ${what}${detail ? ' — ' + detail : ''}`);
  }
}

/** Партия кандидатов ровно той формы, что пишет мастерская `candidates/batches/`. */
const batch = {
  candidates: [{
    wikidata: QID,
    title: { ru: 'Проба круга возврата', en: 'Return loop probe' },
    description: { ru: 'Первая редакция.', en: 'First take.' },
    type: { ru: 'Фильм', en: 'Film' },
    author: { ru: 'Никто', en: 'Nobody' },
    year: '2026',
    tags: ['проба'],
    sitelinks: 3,
    agentNote: 'Комментарий агента владельцу.',
  }],
};
const writeBatch = () => writeFileSync(BATCH, JSON.stringify(batch), 'utf8');
const seed = () => execFileSync('node', ['tools/seed-dim-candidates.mjs', BATCH, '--apply'], { encoding: 'utf8' });
const read = (status) => execFileSync(
  'node',
  ['tools/read-returned-candidates.mjs', ...(status ? ['--status', status] : [])],
  { encoding: 'utf8' },
);

const ref = db.collection('dim_candidates').doc(DOC);

try {
  console.log('\nКруг возврата на доработку:');

  // ── 1. Агент выгрузил кандидата ───────────────────────────────────────────────────────────
  writeBatch();
  seed();
  check((await ref.get()).data()?.status === 'pending', '1: кандидат лёг в очередь как «pending»');

  // ── 2. Владелец вернул с замечанием — тем же следом, что оставляет экран ──────────────────
  const NOTE = 'Описание короткое. Перепиши вики-подобно.';
  await ref.set({ ...(await ref.get()).data(), status: 'returned', ownerNote: NOTE });

  // ── 3. Агент поправил текст и выгрузил снова ──────────────────────────────────────────────
  batch.candidates[0].description.ru = 'Вторая редакция, подробнее.';
  writeBatch();
  const log = seed();
  check(/был возвращён владельцем/.test(log),
    '2: 🔴 прибор ОПОЗНАЛ возврат как задание, а не как принятое решение');
  check(log.includes(NOTE), '3: замечание владельца напечатано агенту при выгрузке');

  const after = (await ref.get()).data();
  check(after?.status === 'pending', '4: 🔑 исправленное ВЕРНУЛОСЬ в очередь — круг замкнут',
    String(after?.status));
  check(after?.description?.ru === 'Вторая редакция, подробнее.', '5: текст обновился');
  check(after?.ownerNote === NOTE,
    '6: 🔑 замечание владельца УЦЕЛЕЛО — единственный след того, почему карточка менялась',
    String(after?.ownerNote));

  // ── 4. Решённое повторный прогон НЕ трогает ───────────────────────────────────────────────
  await ref.set({ ...after, status: 'approved' });
  const log2 = seed();
  check(/решение владельца принято/.test(log2),
    '7: 🔒 одобренного повторный прогон в очередь НЕ вернул — его решение не стирается');
  check((await ref.get()).data()?.status === 'approved', '8: статус решения уцелел');

  // ── 5. Читатель — то, чем агент вообще узнаёт о замечании ─────────────────────────────────
  await ref.set({ ...after, status: 'returned', ownerNote: NOTE });
  const shown = read();
  check(shown.includes('Проба круга возврата') && shown.includes(NOTE),
    '9: 🔑 читатель показал карточку И замечание — без него контур разомкнут');
  check(/Пусто/.test(read('rejected')),
    '10: контроль прибора — по статусу без карточек читатель честно говорит «пусто»',
    'иначе проверка 9 была бы зелена от того, что печатается всё подряд');
} finally {
  console.log('\nУборка:');
  await ref.delete();
  rmSync(WORK, { recursive: true, force: true });
  check((await ref.get()).exists === false, '🧹 след прогона убран — пробного кандидата в базе нет');
}

console.log('\n──────────────────────────────────────────────────────────────');
if (fails.length === 0) {
  console.log(`✅ ЧИСТО: проверок ${pass} · провалов 0`);
  process.exit(0);
}
console.log(`❌ ПРОВАЛОВ ${fails.length} при ${pass} пройденных:`);
for (const f of fails) console.log(`   · ${f}`);
process.exit(1);

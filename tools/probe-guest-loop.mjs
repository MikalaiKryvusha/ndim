/**
 * ПРИБОР ЗАМЕРА (не страж) — ПОЛНЫЙ ПРОХОД АНОНИМА: датовая половина.
 * `plans/23` фаза 1 («Замер петли прибором, а не рассуждением») + `plans/22` фаза 1
 * (цена гостя в записях). Один прогон на оба эпика — так велела сшивка (`plans/26` §1).
 *
 * Якорь (№009 В3): «*и тут же сервер синхронизации выполнит поиски для анонима*».
 *
 * ЧТО МЕРЯЕТ:
 *   1. Через сколько ЦИКЛОВ после первых оценок у гостя появляется relations/{uid} — и что
 *      в топе: сколько людей, какие проценты похожести (Ф3: «однозначные проценты»).
 *   2. Ту же кривую для 10, 20, 40 оценок — где она перестаёт быть унизительной.
 *   3. Цену гостя в записях СЕГОДНЯ: сколько топов переписывает его появление и его смерть.
 *
 * ЧЕГО НЕ МЕРЯЕТ (экранная половина — живым браузером, отдельно): заморозку кэша Ф2
 * («Связи» через 5/15/60 с в ТОЙ ЖЕ сессии) и вид карточек у гостя. Ворота фазы 1 закрывает
 * только ПАРА половин.
 *
 * ── ЧЕСТНОСТЬ ФОРМЫ ПРОСТРАНСТВА ─────────────────────────────────────────────────────────
 * Пространство — СИНТЕТИКА ПО БОЕВЫМ АГРЕГАТАМ (перепись 2026-08-18: жителей 94, оценок
 * ≈4089 на 5121 измерении), а не бой: оценки жителей разложены равномерно случайно.
 * Почему это честно для ЭТОГО вопроса: лента «Все» отдаёт гостю измерения равномерно
 * случайно (Фишер—Йейтс, `feed.ts`), поэтому ОЖИДАНИЕ пересечения гостя с жителем равно
 * K·|оценок жителя|/5121 независимо от того, как кластеризованы вкусы жителя. Кластеризация
 * меняет дисперсию, не среднее. Каталог dims/ не сеется вовсе: математика связей читает
 * только оценки точек; пустые точки боя (246) не сеются — в математике они не участвуют.
 *
 * Запуск:
 *   npx firebase emulators:exec --only firestore,auth --project demo-ndim-guestloop \
 *     "node tools/probe-guest-loop.mjs"
 */

process.env.FIREBASE_PROJECT_ID = 'demo-ndim-guestloop';
process.env.SYNC_QUIET_SECONDS = '0'; // как на стенде: человек не должен ждать
delete process.env.SYNC_FULL_EVERY_CYCLE;

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST не задан — запускай через emulators:exec (шапка).');
}

// Сервер синхронизации — СВОЯ копия firebase-admin (sync-server/node_modules), инициализирует
// своё приложение по FIREBASE_PROJECT_ID выше. Для сида берём КОРНЕВУЮ копию admin — два
// независимых клиента одного эмулятора.
const { runCycle } = await import('../sync-server/index.mjs');
const { initializeApp: initAdmin } = await import('firebase-admin/app');
const { getFirestore: adminFirestore } = await import('firebase-admin/firestore');
const seedApp = initAdmin({ projectId: 'demo-ndim-guestloop' }, 'probe-seed');
const adb = adminFirestore(seedApp);

// Клиентская половина — гость входит и оценивает ЧЕРЕЗ ПРАВИЛА, как настоящий браузер.
const { initializeApp: initClient } = await import('firebase/app');
const { connectAuthEmulator, getAuth, signInAnonymously } = await import('firebase/auth');
const { connectFirestoreEmulator, doc, getFirestore, setDoc, getDoc } = await import(
  'firebase/firestore'
);

const DIMS_TOTAL = 5121; // боевой каталог на день замера
const RESIDENTS = 94; // жителей (перепись)
/** Размеры NDim ID жителей: смесь, дающая ≈3900 оценок на 94 человека (бой: ≈4089). */
const SIZE_MIX = [
  [20, 5],
  [16, 10],
  [18, 20],
  [16, 40],
  [14, 80],
  [10, 150],
];

/** Детерминированный генератор — прогоны сравнимы между собой (Date.now запрещать незачем: прибор разовый). */
let seedState = 20260821;
function rand() {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
}
const dimId = (n) => `d${String(n).padStart(4, '0')}`;
function randomDims(count, taken = new Set()) {
  const picked = [];
  while (picked.length < count) {
    const candidate = dimId(1 + Math.floor(rand() * DIMS_TOTAL));
    if (taken.has(candidate)) continue;
    taken.add(candidate);
    picked.push(candidate);
  }
  return picked;
}

// ── 1. Сид жителей (админом, пачками — правила тут ни при чём) ─────────────────────────────
console.log(`сид: жителей ${RESIDENTS}, форма NDim ID — смесь ${SIZE_MIX.map(([n, s]) => `${n}×${s}`).join(', ')}`);
let ratingsTotal = 0;
{
  let batch = adb.batch();
  let inBatch = 0;
  const flush = async () => {
    await batch.commit();
    batch = adb.batch();
    inBatch = 0;
  };
  let person = 0;
  for (const [count, size] of SIZE_MIX) {
    for (let i = 0; i < count; i += 1) {
      const uid = `resident-${String(person).padStart(3, '0')}`;
      person += 1;
      batch.set(adb.doc(`points/${uid}`), {
        dirty: true,
        updated: 1,
        lastSync: 1,
        firstSeen: 1,
      });
      inBatch += 1;
      for (const dim of randomDims(size, new Set())) {
        batch.set(adb.doc(`points/${uid}/dims/${dim}`), { value: Math.floor(rand() * 11) });
        ratingsTotal += 1;
        inBatch += 1;
        if (inBatch >= 400) await flush();
      }
      if (inBatch >= 400) await flush();
    }
  }
  if (inBatch > 0) await flush();
}
console.log(`сид готов: оценок ${ratingsTotal} (бой ≈4089)`);

// Прогрев: первый цикл процесса — полный проход, жители получают свои топы.
const warmupWrites = await runCycle();
console.log(`прогрев: записано топов ${warmupWrites} (ожидалось ${RESIDENTS})`);

// ── 2. Гость: настоящий анонимный вход и оценки через правила ─────────────────────────────
const clientApp = initClient({ projectId: 'demo-ndim-guestloop', apiKey: 'demo-api-key' });
const auth = getAuth(clientApp);
connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'}`, {
  disableWarnings: true,
});
const cdb = getFirestore(clientApp);
const [fsHost, fsPort] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
connectFirestoreEmulator(cdb, fsHost, Number(fsPort));

const guest = (await signInAnonymously(auth)).user;
console.log(`гость вошёл анонимно: uid ${guest.uid}`);

const guestTaken = new Set();
/** Гость ставит порцию оценок КАК КЛИЕНТ: свои dims + точка из белого списка (`bugs/153`). */
async function guestRates(count) {
  for (const dim of randomDims(count, guestTaken)) {
    await setDoc(doc(cdb, 'points', guest.uid, 'dims', dim), { value: Math.floor(rand() * 11) });
  }
  await setDoc(
    doc(cdb, 'points', guest.uid),
    { dirty: true, updated: Date.now(), lastSync: null, guest: true },
    { merge: true },
  );
}

/** Топ гостя — глазами самого гостя (правила разрешают своё). */
async function guestTop() {
  const snap = await getDoc(doc(cdb, 'relations', guest.uid));
  if (!snap.exists()) return null;
  return snap.data();
}

const STEPS = [5, 5, 10, 20]; // накопительно: 5 → 10 → 20 → 40
const report = [];
let ratingsSoFar = 0;
for (const add of STEPS) {
  await guestRates(add);
  ratingsSoFar += add;
  let cycles = 0;
  let top = null;
  let written = 0;
  do {
    written = await runCycle();
    cycles += 1;
    top = await guestTop();
  } while (top === null && cycles < 3);
  const entries = top?.top ?? [];
  const similarities = entries.map((entry) => entry.similarity);
  const commons = entries.map((entry) => entry.commonSpaceSize);
  report.push({
    ratings: ratingsSoFar,
    cycles,
    written,
    people: entries.length,
    simTop: similarities.slice(0, 5),
    simMax: similarities.length > 0 ? Math.max(...similarities) : null,
    commonMax: commons.length > 0 ? Math.max(...commons) : null,
  });
}

// ── 3. Цена смерти гостя СЕГОДНЯ: его следы стирает уборщик, чужих топов это не трогает ───
await adb.recursiveDelete(adb.doc(`points/${guest.uid}`));
await adb.doc(`relations/${guest.uid}`).delete();
const afterDeathWrites = await runCycle();

// ── Отчёт ─────────────────────────────────────────────────────────────────────────────────
console.log('\n════ КРИВАЯ НОВИЧКА (Пространство: синтетика по боевым агрегатам) ════');
console.log('оценок | циклов до топа | людей в топе | похожесть топ-5, % | общих макс.');
for (const row of report) {
  console.log(
    `${String(row.ratings).padStart(6)} | ${String(row.cycles).padStart(14)} | ${String(row.people).padStart(12)} | ${
      row.simTop.length > 0 ? row.simTop.join(', ') : '— топ пуст'
    } | ${row.commonMax ?? '—'}`,
  );
}
console.log('\n════ ЦЕНА ГОСТЯ В ЗАПИСЯХ, СЕГОДНЯШНИЙ МИР (гость невидим в чужих топах) ════');
console.log(`появление (первые оценки): топов записано ${report[0].written} — только его собственный`);
console.log(`смерть (данные стёрты): следующий цикл записал топов ${afterDeathWrites} — чужие топы не переписывались`);
console.log('⚠️ цена ПОСЛЕ снятия фильтра анонимов (фаза 7 `plans/22`) этим прогоном НЕ измерена —');
console.log('   она остаётся предсказанием Второго эффекта №6 до самой фазы 7.');
console.log('\n⚠️ Пределы: экранная половина (заморозка Ф2, вид карточек) — живым браузером, отдельно.');
process.exit(0);

/**
 * КЛАДЁТ КАНДИДАТОВ В ОЧЕРЕДЬ ВЫЧИТКИ — `dim_candidates/{id}`.
 *
 * Заказ владельца 2026-08-17: «*чтобы ИИ агент мог новые кандидаты измерений создавать Николаю под
 * вычитку, и чтобы николай быстрее их одобрял*» и «*10 из них оформишь кандидатами, я вычитаю и
 * попробую одобрить. Протестируем контур целиком*».
 *
 * 🔴🔴 ЧТО ЭТОТ ПРИБОР НЕ ДЕЛАЕТ И НЕ БУДЕТ ДЕЛАТЬ: он НЕ пишет в каталог `dims/`. Ни одной
 * записи, ни при каком флаге. Это инвариант эпика В3 = А («агент НИКОГДА не заводит измерение без
 * вычитки»), и он держится не дисциплиной этого файла, а правилами Firestore: у агента нет клейма
 * админа, а второго пути записи в каталог не существует. Измерение рождается ТОЛЬКО нажатием
 * владельца в комнате.
 *
 * ⚠️ СУХОЙ ПРОГОН ПО УМОЛЧАНИЮ. Пишет только с `--apply`, как все пишущие приборы проекта.
 *
 * Запуск:
 *   node tools/seed-dim-candidates.mjs tools/candidates-2026-batch-01.json                 # сухо, стенд
 *   node tools/seed-dim-candidates.mjs tools/candidates-2026-batch-01.json --apply
 *   node tools/seed-dim-candidates.mjs <файл> --contour prod --apply                       # в бой
 *
 * Контур стенда работает БЕЗ ключа: Admin SDK слушает `FIRESTORE_EMULATOR_HOST`, и путь к базе
 * один на все контуры — второй путь записи разъехался бы с первым (класс `bugs/132`).
 */
import { readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};

const FILE = process.argv[2];
if (!FILE || FILE.startsWith('--')) {
  console.error('Укажи файл партии: node tools/seed-dim-candidates.mjs tools/candidates-2026-batch-01.json');
  process.exit(2);
}
const CONTOUR = arg('--contour', 'stand');
const APPLY = process.argv.includes('--apply');

// ── Подключение по контуру ──────────────────────────────────────────────────────────────────
let db;
if (CONTOUR === 'stand') {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8181';
  /*
   * Проект берётся из окружения, если его выставил `firebase emulators:exec --project …`, и
   * только иначе — проектом стенда. Так прибор попадает В ТУ ЖЕ базу, из которой его читает
   * вызвавший, а не в соседнюю: константа здесь молча уводила запись в `demo-ndim-dev`, и
   * страж круга (`verify-candidate-return-loop.mjs`) видел пустоту при исправном приборе.
   */
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

const batch = JSON.parse(readFileSync(FILE, 'utf8'));
const items = batch.candidates ?? [];
console.log(`\n═══ КАНДИДАТЫ В ОЧЕРЕДЬ ВЫЧИТКИ ═══`);
console.log(`  файл партии: ${FILE}`);
console.log(`  контур: ${CONTOUR}${APPLY ? '' : '  (СУХОЙ ПРОГОН — ничего не пишется)'}`);
console.log(`  записей в партии: ${items.length}\n`);

/**
 * Идентификатор кандидата выводится ИЗ QID реестра, а не случайный. Так повторный прогон той же
 * партии не плодит дублей: он перезаписывает те же документы. Случайный идентификатор при второй
 * попытке дал бы владельцу очередь из двадцати карточек вместо десяти.
 */
const idOf = (item) => `wikidata-${item.wikidata}`;

let written = 0;
let skipped = 0;
for (const item of items) {
  const id = idOf(item);
  const ref = db.collection('dim_candidates').doc(id);
  const existing = await ref.get();

  /*
   * 🔑 РАЗОБРАННОГО НЕ ТРОГАЕМ. Кандидат, которого владелец одобрил или отклонил, повторным
   * прогоном не возвращается в очередь: это стёрло бы его решение и заставило судить дважды.
   *
   * 🔴 НО «ВОЗВРАЩЁН НА ДОРАБОТКУ» — НЕ РЕШЕНИЕ, А ЗАДАНИЕ АГЕНТУ (`bugs/142`). Карточка со
   * статусом `returned` обязана приниматься обратно: в этом и состоит обратное плечо контура —
   * агент правит по комментарию владельца и кладёт исправленное в очередь.
   * ⚠️ Прежняя редакция условия — `status !== 'pending'` — читала «разобран» как «всё, что не
   * ожидает», и с появлением четвёртого статуса замкнула бы контур в тупик: возвращённая
   * карточка не вернулась бы к владельцу НИКОГДА. Это тот же класс, что `bugs/129` и `bugs/140`:
   * условие «всё, что не X, — это Y» живёт ровно до появления Z. Поэтому список назван
   * ПОИМЁННО, а не отрицанием.
   */
  const DECIDED = ['approved', 'rejected'];
  const previous = existing.exists ? existing.data()?.status : null;
  if (DECIDED.includes(previous)) {
    console.log(`  ⏭ ${item.title.ru} — решение владельца принято (${previous}), не тронут`);
    skipped += 1;
    continue;
  }
  if (previous === 'returned') {
    const note = existing.data()?.ownerNote ?? '';
    console.log(`  ↩ ${item.title.ru} — был возвращён владельцем, кладём исправленное обратно`);
    if (note !== '') console.log(`     его замечание: ${note}`);
  }

  /*
   * Замечание владельца ПЕРЕЖИВАЕТ повторную выгрузку: он написал его один раз, и стереть его
   * записью исправленного значило бы потерять единственный след того, почему карточка менялась.
   * Читать его дальше умеет `tools/read-returned-candidates.mjs`.
   */
  const keptOwnerNote = existing.exists ? existing.data()?.ownerNote : undefined;

  const payload = {
    ...(keptOwnerNote === undefined ? {} : { ownerNote: keptOwnerNote }),
    title: item.title,
    description: item.description,
    type: item.type,
    author: item.author,
    year: item.year,
    tags: item.tags ?? [],
    status: 'pending',
    source: { registry: 'wikidata', id: item.wikidata, sitelinks: item.sitelinks ?? 0 },
    agentNote: item.agentNote ?? '',
    time: { created: FieldValue.serverTimestamp() },
  };

  if (APPLY) {
    await ref.set(payload);
    written += 1;
    console.log(`  ✅ ${item.title.ru}  (${item.wikidata}, ${item.sitelinks} языковых разделов)`);
  } else {
    console.log(`  · ${item.title.ru}  (${item.wikidata}, ${item.sitelinks} языковых разделов) → ${id}`);
  }
}

console.log(`\n──────────────────────────────────────────────────────────────`);
if (APPLY) {
  console.log(`✅ положено в очередь: ${written} · не тронуто разобранных: ${skipped}`);
  console.log(`   Владелец увидит их в панели: /admin/dims → вкладка «Кандидаты».`);
} else {
  console.log(`СУХОЙ ПРОГОН. Записать: добавь --apply`);
}
console.log('⛔ В каталог dims/ этот прибор не писал и не пишет: измерение рождается только');
console.log('   нажатием владельца (инвариант В3 = А).');

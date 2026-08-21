/**
 * ЧИТАЕТ ВОЗВРАЩЁННЫХ ВЛАДЕЛЬЦЕМ КАНДИДАТОВ — обратное плечо контура вычитки (`bugs/142`).
 *
 * Заказ владельца 2026-08-17, дословно: «*Я хотел написать комментарий в кандидате и нажать
 * кнопку [Вернуть на доработку]*». Кнопка построена; этот прибор — вторая половина того же
 * контура: то, чем агент УЗНАЁТ о его замечании.
 *
 * 🔴 БЕЗ ЭТОГО ПРИБОРА КОНТУР РАЗОМКНУТ. Владелец пишет замечание в базу, а агент — сессия с
 * пустым контекстом, которая в базу сама не заглядывает. Замечание, которое некому прочитать,
 * равносильно ненаписанному: владелец потратил внимание, и оно осело в поле, куда никто не
 * ходит. Поэтому прибор заведён В ТОТ ЖЕ ЗАХОД, что и кнопка, а не «потом».
 *
 * ⚠️ ТОЛЬКО ЧИТАЕТ. Ни одной записи, ни при каком флаге: правит карточку агент в файле партии
 * (`candidates/batches/*.json`), а кладёт исправленное обратно — `seed-dim-candidates.mjs`.
 * Второй путь записи в очередь разъехался бы с первым (класс `bugs/132`).
 *
 * Запуск:
 *   node tools/read-returned-candidates.mjs                      # стенд
 *   node tools/read-returned-candidates.mjs --contour prod       # бой
 *   node tools/read-returned-candidates.mjs --status rejected    # посмотреть отклонённых
 *
 * Порядок работы агента, замыкающий контур:
 *   1. этот прибор — прочитать, что владелец просил поправить;
 *   2. правка текста в файле партии `candidates/batches/*.json`;
 *   3. `node tools/seed-dim-candidates.mjs <файл> --contour prod --apply` — исправленное
 *      возвращается в очередь со статусом `pending`, замечание владельца при этом сохраняется.
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};

const CONTOUR = arg('--contour', 'stand');
const STATUS = arg('--status', 'returned');

// ── Подключение по контуру: тот же путь, что у выгрузки, — второго не заводим ────────────────
let db;
if (CONTOUR === 'stand') {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8181';
  // Проект — из окружения `emulators:exec`, иначе проект стенда: читать надо ТУ ЖЕ базу, в
  // которую писал вызвавший (та же поправка, что в `seed-dim-candidates.mjs`).
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

const found = await db.collection('dim_candidates').where('status', '==', STATUS).get();

console.log(`\n═══ КАНДИДАТЫ СО СТАТУСОМ «${STATUS}» ═══`);
console.log(`  контур: ${CONTOUR} · найдено: ${found.size}\n`);

if (found.empty) {
  console.log('  Пусто. Владелец ничего не возвращал — правок по его замечаниям сейчас нет.');
  console.log('\n  ⚠️ «Пусто» — это ответ, а не отказ: очередь возвратов законно бывает пустой.');
  process.exit(0);
}

for (const doc of found.docs) {
  const c = doc.data();
  console.log(`── ${c.title?.ru ?? '(без названия)'} · ${c.title?.en ?? ''}`);
  console.log(`   документ: ${doc.id}${c.source?.id ? `  ·  ${c.source.registry} ${c.source.id}` : ''}`);
  /*
   * Замечание владельца печатается ЦЕЛИКОМ и без обрезки. Обрезанное замечание — это ровно тот
   * случай, когда агент правит не то, что просили: цена символов здесь нулевая, цена
   * недопонимания — повторная вычитка владельца.
   */
  console.log(`   🔴 ЕГО ЗАМЕЧАНИЕ: ${c.ownerNote ?? '(пусто — но кнопка возврата пустого не пропускает)'}`);
  if (c.agentNote) console.log(`   мой прежний комментарий ему: ${c.agentNote}`);
  console.log(`   описание (ru): ${c.description?.ru ?? ''}`);
  console.log(`   описание (en): ${c.description?.en ?? ''}`);
  console.log('');
}

/*
 * ФУТЕР-СВИДЕТЕЛЬ ПОЛНОТЫ (EXP-0177). Большой вывод режет СРЕДА ЧТЕНИЯ агента, а не прибор:
 * шапка «найдено: N» доезжает всегда, хвост — нет, и усечённый вывод выглядит внутренне
 * согласованным (в этом эпизоде две сессии независимо приняли 17 блоков за 20 и чуть не
 * завели баг на исправный инструмент). Футер печатается ПОСЛЕДНИМ и повторяет счёт:
 * вывод без этой строки — усечён по построению, сколько бы блоков в нём ни виднелось.
 */
console.log(`итого блоков напечатано: ${found.size} — вывод без этой строки УСЕЧЁН, перечитай через файл`);
console.log('──────────────────────────────────────────────────────────────');
console.log('Дальше: правь текст в файле партии `candidates/batches/*.json`, затем');
console.log('`node tools/seed-dim-candidates.mjs <файл> --contour <контур> --apply` —');
console.log('исправленное вернётся в очередь со статусом `pending`, замечание владельца уцелеет.');
console.log('⛔ Этот прибор в базу не писал и не пишет.');

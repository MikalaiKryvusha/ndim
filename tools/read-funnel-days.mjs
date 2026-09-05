/**
 * ЧТЕНИЕ СЧЁТЧИКОВ ВОРОНКИ ПО ДНЯМ — `space/funnel/days/{дата}` (`plans/74` Ф1, `plans/75` Ш4).
 *
 * ЗАЧЕМ. Приёмка двери карточки названа планом числами: «чтение `door_click`/`guest_start` через
 * неделю — ворота приёмки — числа, не декларация». Экран воронки живёт в панели администратора
 * и требует клейма админа; у агента его нет, а читать бой ему нужно. Этот прибор ТОЛЬКО читает —
 * тем же путём подключения, что `read-returned-candidates.mjs` (второго пути не заводим).
 *
 * Запуск:  node tools/read-funnel-days.mjs --contour prod [--days 14]
 * ВЫХОД:   таблица по дням (все шаги воронки) + сумма за окно. Ничего не пишет.
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i === -1 ? fallback : process.argv[i + 1]; };
const CONTOUR = arg('--contour', 'stand');
const DAYS = Number(arg('--days', '14'));

let db;
if (CONTOUR === 'stand') {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8181';
  initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-ndim-dev' });
  db = getFirestore();
} else {
  const { serviceAccount } = await import('./lib/credentials.mjs');
  const { CONTOURS } = await import('./lib/contours.mjs');
  const contour = CONTOURS[CONTOUR];
  if (contour === undefined) { console.error(`Неизвестный контур «${CONTOUR}». Возможные: stand · stage · prod`); process.exit(2); }
  initializeApp({ credential: cert(serviceAccount(CONTOUR)), projectId: contour.project });
  db = getFirestore(contour.database);
}

const snap = await db.collection('space').doc('funnel').collection('days').get();
const rows = snap.docs.map((d) => ({ day: d.id, ...d.data() })).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, DAYS);
const steps = [...new Set(rows.flatMap((r) => Object.keys(r).filter((k) => k !== 'day')))].sort();
console.log(`контур: ${CONTOUR} · дней в базе: ${snap.size} · показано последних: ${rows.length}`);
console.log(['день', ...steps].join('\t'));
const sum = Object.fromEntries(steps.map((s) => [s, 0]));
for (const r of rows) {
  console.log([r.day, ...steps.map((s) => { const v = Number(r[s] ?? 0); sum[s] += v; return v; })].join('\t'));
}
console.log(['СУММА', ...steps.map((s) => sum[s])].join('\t'));

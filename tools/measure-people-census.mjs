/**
 * ПЕРЕПИСЬ НАСЕЛЕНИЯ ПРОСТРАНСТВА — откуда берётся каждое число о людях и почему они разные.
 *
 * Повод — вопрос владельца 2026-08-18: «*душ в NDim сильно меньше, чем 331 — не понимаю, откуда
 * цифра 331. Я думал человек 94 в пространстве, и то часть из них — мои тестовые фейковые
 * аккаунты. Нужно разобраться, откуда цифра 331. Может они зарегистрированы но НИ ОДНО измерение
 * не оценили*».
 *
 * 🔑 ВОПРОС ЗАКОННЫЙ, И ОТВЕТ НА НЕГО — НЕ ОДНО ЧИСЛО, А ЛЕСТНИЦА. «Человек» в продукте значит
 * РАЗНОЕ в разных местах, и каждое место право по-своему:
 *   · карточка профиля — след регистрации (в том числе в 1.x, годы назад);
 *   · точка — заведённое пространство;
 *   · ЖИТЕЛЬ — тот, у кого есть хоть одна оценка и кто не гость. Именно его показывает витрина
 *     (`computeSpaceStats`: `!point.anonymous && point.ratings > 0`).
 * Разница между ступенями — не расхождение, а сам ответ: сколько людей пришло и НЕ осталось.
 *
 * ── ПДн ────────────────────────────────────────────────────────────────────────────────────
 * Печатаются только ЧИСЛА. Ни имён, ни почт, ни uid — на этот вопрос они не нужны вовсе.
 *
 * Запуск:  node tools/measure-people-census.mjs --contour prod
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const CONTOUR = arg('--contour', 'stand');

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

const users = await db.collection('users').get();
const profiles = (await db.collectionGroup('profile').get()).docs.filter((d) => d.id === 'everyone');
const points = await db.collection('points').get();

/*
 * Оценки считаем агрегатом по каждой точке: `points/{uid}/dims` — по документу на оценку.
 * Агрегат биллится как одно чтение на каждую 1000 совпавших записей индекса, то есть перепись
 * стоит примерно столько же чтений, сколько в Пространстве точек, — сотни, а не тысячи.
 */
let withRatings = 0;
let zeroRatings = 0;
let anonymous = 0;
let totalRatings = 0;
const buckets = { '0': 0, '1–4': 0, '5–19': 0, '20–99': 0, '100+': 0 };

for (const point of points.docs) {
  const data = point.data();
  const count = (await db.collection(`points/${point.id}/dims`).count().get()).data().count;
  totalRatings += count;
  if (data.anonymous === true) anonymous += 1;
  if (count === 0) {
    zeroRatings += 1;
    buckets['0'] += 1;
    continue;
  }
  withRatings += 1;
  if (count < 5) buckets['1–4'] += 1;
  else if (count < 20) buckets['5–19'] += 1;
  else if (count < 100) buckets['20–99'] += 1;
  else buckets['100+'] += 1;
}

const stats = (await db.doc('space/stats').get()).data() ?? {};
const metrics = (await db.doc('space/public_metrics').get()).data() ?? {};

console.log(`\n═══ ПЕРЕПИСЬ НАСЕЛЕНИЯ · контур ${CONTOUR} ═══\n`);
console.log('Ступени — каждая считает СВОЁ, и все они правы:\n');
console.log(`  1. Корневых документов людей (users/)        ${users.size}`);
console.log(`  2. Публичных карточек профиля (наш «331»)    ${profiles.length}`);
console.log(`  3. Точек — заведённых пространств (points/)  ${points.size}`);
console.log(`     ↳ из них гостевых (анонимных)             ${anonymous}`);
console.log(`     ↳ 🔴 БЕЗ ЕДИНОЙ ОЦЕНКИ                     ${zeroRatings}`);
console.log(`  4. С хотя бы одной оценкой                   ${withRatings}`);
console.log(`  5. ЖИТЕЛЬ витрины (space/stats.people)       ${stats.people ?? '—'}`);
console.log(`     Лендинг (space/public_metrics.people)     ${metrics.people ?? '—'}`);
/*
 * СВЕЖЕСТЬ ВИТРИНЫ — без неё ступень 5 нечитаема. `space/stats` пересчитывается только в цикле с
 * обновлённым NDim ID (`bugs/146`), поэтому расхождение со ступенью 4 может означать не ошибку счёта,
 * а ПРОСРОЧЕННУЮ витрину. Число без своей даты тут врёт молча.
 */
const server = (await db.doc('space/server').get()).data() ?? {};
const when = (ms) => (typeof ms === 'number' ? new Date(ms).toISOString().replace('T', ' ').slice(0, 16) : '—');
console.log(`\n  Витрина посчитана:      ${when(stats.computedAt)} UTC`);
console.log(`  Последний цикл сервера: ${when(server.lastSuccessAt)} UTC`);
if (typeof stats.people === 'number' && stats.people !== withRatings) {
  console.log(
    `  ⚠️ ступень 4 (${withRatings}) ≠ ступень 5 (${stats.people}): разница ${withRatings - stats.people}. ` +
      'Причин ровно две —\n     витрина просрочена ЛИБО у этих людей все оценки «мёртвые» ' +
      '(измерение удалено, `bugs/111`).',
  );
}

console.log(`\nВсего оценок в Пространстве: ${totalRatings}`);
console.log('\nСколько у людей оценок:');
for (const [range, count] of Object.entries(buckets)) {
  console.log(`  ${range.padEnd(6)} ${String(count).padStart(4)}`);
}
console.log(
  `\nРазница «карточек ${profiles.length}» и «жителей ${stats.people ?? '?'}» — это люди, ` +
    `зарегистрированные\nв 1.x и не оценившие НИЧЕГО. Витрина их не показывает намеренно: ` +
    'человека без\nоценок в Пространстве не найти, и обещать его было бы враньём.',
);

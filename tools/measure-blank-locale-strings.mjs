/**
 * ПРИБОР ЗАМЕРА «МЁРТВЫХ ДУШ» — сколько публичных карточек людей отдают ПУСТОЕ, а не отсутствующее
 * имя, то есть рождают в «Связях» карточку без имени и с пустым кружком вместо лица.
 *
 * Повод — `bugs/150`, слово владельца 2026-08-18 по кадру раскрытой связи: «*что это за „мёртвая
 * душа“? выглядит отвратительно. Баг*».
 *
 * 🔑 ЗАЧЕМ ПРИБОР, ЕСЛИ ДЕФЕКТ УЖЕ НАЙДЕН ЧТЕНИЕМ КОДА. Владелец называет ОДИН случай, а замер
 * находит КЛАСС (правило сессии 22–23, `STATUS.md`). Здесь у класса три разных размера, и лечение
 * у них разное: пустая строка в имени · имя есть, а лица нет · карточка не читается вовсе.
 *
 * ── ПДн: ЧТО ПРИБОР ПЕЧАТАЕТ И ЧЕГО НЕ ПЕЧАТАЕТ ────────────────────────────────────────────
 * 🔴 Имён, «о себе», дат рождения прибор НЕ печатает НИКОГДА — ни целиком, ни обрезком. Наружу
 * идут только: числа, ФОРМА значения (`""` · `null` · `нет поля` · `есть текст`) и УСЕЧЁННЫЙ до
 * шести знаков uid — его хватает, чтобы найти запись руками, и мало, чтобы кого-то опознать.
 * Причина строгости — `npm run kaif:check`: ПДн в git на этом проекте однажды уже случались.
 *
 * Запуск:  node tools/measure-nameless-profiles.mjs --contour prod
 *          node tools/measure-nameless-profiles.mjs               # стенд (эмулятор)
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

/**
 * ФОРМА значения — то, что можно печатать. Именно она отвечает на вопрос «почему запасной вариант
 * не сработал»: `??` в коде экрана ловит только `null`/`undefined`, а пустая строка проходит мимо
 * него и печатается как имя.
 */
const shape = (value) => {
  if (value === undefined) return 'нет поля';
  if (value === null) return 'null';
  if (typeof value !== 'string') return `не строка (${typeof value})`;
  if (value === '') return '""';
  if (value.trim() === '') return '" " (пробелы)';
  return 'есть текст';
};

/** Пустое по смыслу человека: отсутствует ИЛИ есть, но состоит из ничего. */
const blank = (value) => typeof value !== 'string' || value.trim() === '';

const docs = await db.collectionGroup('profile').get();
const cards = docs.docs.filter((d) => d.id === 'everyone');

let namedOk = 0;
const nameless = [];
const shapes = new Map();

for (const card of cards) {
  const data = card.data();
  const first = data.name?.first;
  const nick = data.name?.nick;
  // Экран берёт язык зрителя, а при его отсутствии — русский, потом английский. Повторяем
  // ТУ ЖЕ лестницу, иначе замер померяет не то, что видит человек.
  const firstShown = first?.ru ?? first?.en;
  const nickShown = nick?.ru ?? nick?.en;

  if (!blank(firstShown) || !blank(nickShown)) {
    namedOk += 1;
    continue;
  }
  const uid = card.ref.parent.parent.id;
  const key = `first.ru=${shape(first?.ru)} · first.en=${shape(first?.en)} · nick.ru=${shape(nick?.ru)} · nick.en=${shape(nick?.en)}`;
  shapes.set(key, (shapes.get(key) ?? 0) + 1);
  nameless.push({
    uid: uid.slice(0, 6),
    key,
    avatar: data.avatar === true,
    about: blank(data.about?.ru ?? data.about?.en) ? 'нет' : 'есть',
  });
}

console.log(`\nКонтур: ${CONTOUR} · публичных карточек: ${cards.length}`);
console.log(`С именем или прозвищем: ${namedOk}`);
console.log(`🔴 БЕЗ ИМЕНИ ВОВСЕ (карточка связи выйдет пустым кружком): ${nameless.length}\n`);

if (nameless.length > 0) {
  console.log('Формы значений — почему запасной вариант «Без имени» не сработал:');
  for (const [key, count] of [...shapes].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)} × ${key}`);
  }
  /*
   * 🔴 РАЗДЕЛЯЕМ ДВА РАЗНЫХ ДЕФЕКТА, а не сваливаем в одно число — лечение у них разное:
   *   · всё `null` — человек имени не вводил вовсе, продукт обязан сказать «Без имени»;
   *   · есть пустая строка — она ЗАПИРАЕТ лестницу языков, и человек не видит НИЧЕГО,
   *     даже когда имя лежит рядом на другом языке.
   */
  const allNull = nameless.filter((r) => !r.key.includes('""') && !r.key.includes('пробелы'));
  const blocked = nameless.filter((r) => r.key.includes('""') || r.key.includes('пробелы'));

  console.log(`\n① Имени нет вовсе (запасное «Без имени» работает): ${allNull.length}`);
  console.log(`② 🔴 ПУСТАЯ СТРОКА ЗАПИРАЕТ ЛЕСТНИЦУ (виден пустой кружок): ${blocked.length}`);
  for (const row of blocked) {
    console.log(`   ${row.uid}… · лицо: ${row.avatar ? 'есть' : 'нет'} · «о себе»: ${row.about}`);
    console.log(`     ${row.key}`);
  }
}

/*
 * Отдельный счёт: имя ЕСТЬ, но пустая строка стоит в языке зрителя, — такие карточки лечатся тем
 * же кодом, но в другую сторону (показать перевод, а не «Без имени»).
 */
const halfBlank = cards.filter((c) => {
  const first = c.data().name?.first;
  if (first === undefined || first === null) return false;
  const ru = blank(first.ru);
  const en = blank(first.en);
  return ru !== en;
}).length;
console.log(`\nИмя заполнено только на ОДНОМ языке: ${halfBlank}`);

/*
 * ── КАТАЛОГ: ТА ЖЕ ЛЕСТНИЦА, ТЕ ЖЕ ГРАБЛИ ────────────────────────────────────────────────────
 * Копия `loc()` живёт и на экране «Измерения» (`src/routes/dims/+page.svelte`). Значит запертая
 * лестница даёт там БЕЗЫМЯННУЮ СТРОКУ КАТАЛОГА — дефект того же класса, но на 5121 записи.
 * Меряем, а не предполагаем: класс без числа — это мнение.
 */
const dims = await db.collection('dims').get();
let dimBlocked = 0;
let dimBlank = 0;
for (const d of dims.docs) {
  if (d.id === 'dims_list') continue; // служебный индекс, не измерение
  const title = d.data().title;
  if (title === undefined || title === null) continue;
  const ru = blank(title.ru);
  const en = blank(title.en);
  // Заперто: язык зрителя пуст СТРОКОЙ (не null), а на другом языке текст есть.
  if (typeof title.ru === 'string' && title.ru.trim() === '' && !en) dimBlocked += 1;
  if (ru && en) dimBlank += 1;
}
console.log(`\nКаталог: измерений ${dims.size - 1}`);
console.log(`  🔴 название заперто пустой строкой (виден пустой ряд): ${dimBlocked}`);
console.log(`  названия нет ни на одном языке: ${dimBlank}`);

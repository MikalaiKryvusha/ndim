/**
 * ЗОНД (не страж): можно ли НАЙТИ ЗАПРОСОМ документы, у которых поля статуса НЕТ?
 *
 * Повод — решение владельца 2026-08-02: «все измерения должны получить поле статуса. у старых их
 * нет… все старые будут null по этому полю — их нужно будет так пометить, чтобы ИИ агент это
 * видел». Отсюда вопрос, на который нельзя отвечать по памяти: отличает ли Firestore
 * ОТСУТСТВУЮЩЕЕ поле от поля со значением `null`, и находит ли их запрос.
 *
 * Если не находит — «пометить» придётся ЯВНОЙ ЗАПИСЬЮ в 5111 боевых документов, и это надо знать
 * до проектирования, а не после.
 *
 * Запуск: npx firebase emulators:exec --only firestore --project demo-ndim-probe \
 *           "node sync-server/probe-status-query.mjs"
 */
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('нужен эмулятор Firestore');
process.env.FIREBASE_PROJECT_ID = 'demo-ndim-probe-status';

const { getFirestore } = await import('firebase-admin/firestore');
await import('./index.mjs'); // ради initializeApp
const db = getFirestore();

for (const doc of (await db.collection('dims').get()).docs) await doc.ref.delete();

// Три состояния, которые встретятся в бою после введения поля статуса.
await db.doc('dims/absent').set({ title: { ru: 'Поля статуса нет вовсе', en: '' } });
await db.doc('dims/null').set({ title: { ru: 'Поле есть, значение null', en: '' }, status: null });
await db.doc('dims/legacy').set({ title: { ru: 'Явная пометка', en: '' }, status: 'legacy' });
await db.doc('dims/approved').set({ title: { ru: 'Утверждено', en: '' }, status: 'approved' });

const show = async (label, q) => {
	const ids = (await q.get()).docs.map((d) => d.id).sort();
	console.log(`  ${label.padEnd(46)} → [${ids.join(', ') || '—'}]`);
};

console.log('\nВ каталоге четыре документа: absent · null · legacy · approved\n');
await show("where('status', '==', null)", db.collection('dims').where('status', '==', null));
await show("where('status', '!=', 'approved')", db.collection('dims').where('status', '!=', 'approved'));
await show("where('status', '==', 'legacy')", db.collection('dims').where('status', '==', 'legacy'));
await show("orderBy('status')", db.collection('dims').orderBy('status'));

console.log(`
ЧТО ЭТО ЗНАЧИТ ДЛЯ РЕШЕНИЯ ВЛАДЕЛЬЦА:
  документ, у которого поля НЕТ, ни один запрос по этому полю не возвращает — ни '== null',
  ни '!=', ни orderBy. Значит «пометить старые» нельзя рассуждением: пометка обязана быть
  ЗАПИСАНА в каждый документ. Иначе агент их просто не найдёт.
`);

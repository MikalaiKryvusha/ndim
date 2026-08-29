/**
 * ЗАЯВКИ НА ИЗМЕРЕНИЯ ИЗ БОЯ — читающий прибор коллекции `suggestions/`.
 *
 * Заявка живёт в `suggestions/{id}` и читается ТОЛЬКО админом (`firestore.rules` → «suggestions»),
 * поэтому веб-ключом её не достать: нужен ключ сервисного аккаунта боевого контура
 * (`tools/lib/credentials.mjs`, переменная `NDIM_PROD_SA_B64`).
 *
 * 🔴 ПРИБОР ТОЛЬКО ЧИТАЕТ. У боевого подключения вызывается один `get()` — ни `set`, ни `update`,
 * ни `delete` в файле нет и быть не должно: модерация заявок — отдельная работа с отдельной
 * дверью, а «читатель, который иногда пишет» это тот же класс беды, что сухой прогон с записью.
 *
 * Запуск:  node tools/probe-prod-suggestions.mjs
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { CONTOURS } from './lib/contours.mjs';
import { PROJECT_OF, serviceAccount } from './lib/credentials.mjs';

const app = initializeApp(
	{ credential: cert(serviceAccount('prod')), projectId: PROJECT_OF.prod },
	'prod-suggestions',
);
// База контура названа явно: у боя это `ndim-db-prod`, а не `(default)` — молчаливый
// `(default)` даёт NOT_FOUND вместо данных.
const db = getFirestore(app, CONTOURS.prod.database);

const snap = await db.collection('suggestions').get();
console.log(`заявок в бою: ${snap.size}`);

/** Дата приходит `Timestamp`ом; печатаем читаемо, а не объектом. */
const human = (value) =>
	value && typeof value.toDate === 'function' ? value.toDate().toISOString() : JSON.stringify(value);

const rows = snap.docs
	.map((doc) => ({ id: doc.id, ...doc.data() }))
	.sort((a, b) => String(human(a.created)).localeCompare(String(human(b.created))));

for (const row of rows) {
	console.log('-'.repeat(72));
	console.log(`id: ${row.id}`);
	for (const [key, value] of Object.entries(row)) {
		if (key === 'id') continue;
		console.log(`    ${key} = ${human(value)}`);
	}
}

process.exit(0);

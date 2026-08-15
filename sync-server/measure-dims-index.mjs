/**
 * ПРИБОР ЗАМЕРА (не страж) — сколько стоит обслуживание индекса каталога измерений.
 *
 * Шаг 0 фазы 1 эпика `ideas/29` (`plans/31`).
 *
 * ⚠️ ЖИВЁТ В `sync-server/`, А НЕ В `tools/` — и это не вкусовщина: у сервера синхронизации СВОЙ
 * `node_modules` с собственной копией `firebase-admin`. Скрипт из `tools/` получает ДРУГОЙ
 * экземпляр библиотеки, и `getFirestore()` падает с «The default Firebase app does not exist»,
 * хотя `initializeApp()` в `index.mjs` уже отработал. Поймано этим прибором на первом же
 * запуске. Поэтому все инструменты, импортирующие сервер синхронизации, лежат рядом с ним — как его тесты. Отвечает на три вопроса, на которые
 * нельзя отвечать чтением кода:
 *
 *   1. Сколько раз пересобирается индекс в НОРМАЛЬНОМ каталоге за два цикла подряд?
 *      (ожидание по коду: один раз, потом ни разу — сторож свежести должен сойтись)
 *   2. 🔴 Что делает документ каталога БЕЗ поля `title` (`bugs/108`)?
 *      (гипотеза: сторож не сходится НИКОГДА, пересборка на каждом цикле)
 *   3. Сколько стоит добавление ОДНОГО измерения сегодня?
 *      (гипотеза: полное перечитывание каталога — N документов ради одной записи)
 *
 * И попутно четвёртый (`bugs/109`): находит ли сервер синхронизации НОВЫЕ измерения, если они
 * записаны в БОЕВОЙ форме `time.created`, а не в стендовой плоской `created`.
 *
 * ⚠️ ЭТО ПРИБОР, А НЕ СТРАЖ. Он ничего не утверждает и ничего не заваливает — он ПЕЧАТАЕТ
 * числа. Страж (`tools/verify-dims-index.mjs`) пишется следующим шагом, и он обязан
 * покраснеть на сегодняшнем коде именно на тех числах, которые напечатает этот прибор.
 *
 * Запуск (лёгкий, без тяжёлого стенда — сироты-сервера синхронизации не остаётся):
 *   npx firebase emulators:exec --only firestore --project demo-ndim-measure "node sync-server/measure-dims-index.mjs"
 */

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	throw new Error(
		'FIRESTORE_EMULATOR_HOST не задан. Запускай через:\n' +
			'  npx firebase emulators:exec --only firestore --project demo-ndim-measure "node sync-server/measure-dims-index.mjs"',
	);
}

// СВОЙ проект в эмуляторе: прибор сеет каталог и точки, и мешать чужим замерам он не должен.
process.env.FIREBASE_PROJECT_ID = 'demo-ndim-measure-dims';

const { runCycle } = await import('./index.mjs');
const { getFirestore, Timestamp } = await import('firebase-admin/firestore');

const db = getFirestore();

/** Сколько «настоящих» измерений сеем. Мало — чтобы прибор был быстрым; цена читается в ДОКУМЕНТАХ. */
const CATALOG_SIZE = 12;

/** Метка, по которой узнаём пересборку индекса: её печатает сам сервер синхронизации. */
const REBUILD_MARK = 'индекс каталога пересобран';

/**
 * Считает пересборки индекса за один цикл сервера синхронизации.
 *
 * Наблюдаем ЛОГ, а не внутренности: `ensureDimsIndex` не экспортируется, и лезть в модуль
 * ради замера значило бы мерить прибор, а не продукт. Строка лога — публичное поведение
 * сервера синхронизации, и она же видна владельцу в контейнере.
 */
async function cycleWithRebuildCount(label) {
	const written = [];
	const original = process.stdout.write.bind(process.stdout);
	process.stdout.write = (chunk, ...rest) => {
		written.push(String(chunk));
		return original(chunk, ...rest);
	};
	try {
		await runCycle();
	} finally {
		process.stdout.write = original;
	}
	const rebuilds = written.filter((line) => line.includes(REBUILD_MARK)).length;
	const detail = written.find((line) => line.includes(REBUILD_MARK))?.trim() ?? '';
	return { label, rebuilds, detail };
}

/** Полностью очищает базу замера — прибор обязан начинать с известного состояния. */
async function wipe() {
	for (const path of ['dims', 'points', 'relations', 'users', 'space']) {
		const snapshot = await db.collection(path).get();
		await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
	}
	// Подколлекции снимков дней и оценок — отдельно: рекурсивного удаления в Admin SDK нет.
	for (const sub of ['space/stats/daily']) {
		const snapshot = await db.collection(sub).get();
		await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
	}
}

/** Сеет каталог из `n` НОРМАЛЬНЫХ измерений (с `title`) и служебный документ-индекс. */
async function seedCatalog(n, { indexed = true } = {}) {
	const index = {};
	for (let i = 0; i < n; i++) {
		const id = `dim-${String(i).padStart(3, '0')}`;
		await db.doc(`dims/${id}`).set({
			title: { ru: `Измерение ${i}`, en: `Dimension ${i}` },
			description: { ru: '', en: '' },
			year: '',
			stars: 0,
			rates: 0,
			rating: 0,
			// БОЕВАЯ форма отметки создания — Timestamp внутри `time` (bugs/109).
			time: { created: Timestamp.fromMillis(Date.now() - 10 * 24 * 60 * 60 * 1000) },
		});
		index[id] = { ru: `Измерение ${i}`, en: `Dimension ${i}`, year: '' };
	}
	if (indexed) {
		await db.doc('dims/dims_list').set({ dims_list: JSON.stringify(index) });
	}
	return Object.keys(index).length;
}

/**
 * Сеет две точки с оценками, одна грязная.
 *
 * Без работы цикл выходит РАНЬШЕ, чем доходит до индекса (`index.mjs:642` — холостой цикл
 * возвращается сразу). Значит замер без грязной точки мерил бы пустоту.
 */
async function seedWork() {
	const ratings = { 'dim-000': 8, 'dim-001': 3 };
	for (const [uid, dirty] of [
		['alice', true],
		['bob', false],
	]) {
		await db.doc(`points/${uid}`).set({ dirty, updated: 1, lastSync: null, firstSeen: 1 });
		for (const [dimId, value] of Object.entries(ratings)) {
			await db.doc(`points/${uid}/dims/${dimId}`).set({ value });
		}
	}
}

/** Читает, сколько записей сейчас в индексе. */
async function indexedCount() {
	const snapshot = await db.doc('dims/dims_list').get();
	try {
		return Object.keys(JSON.parse(snapshot.data()?.dims_list ?? '{}')).length;
	} catch {
		return -1;
	}
}

function head(title) {
	console.log(`\n${'═'.repeat(78)}\n  ${title}\n${'═'.repeat(78)}`);
}

// ── ОПЫТ 1. Нормальный каталог: сходится ли сторож свежести ────────────────────
head('ОПЫТ 1 — НОРМАЛЬНЫЙ КАТАЛОГ (все измерения с `title`)');

await wipe();
const seeded = await seedCatalog(CATALOG_SIZE);
await seedWork();
console.log(`посеяно измерений: ${seeded} · документов в коллекции dims: ${seeded + 1} (плюс dims_list)`);

const normal = [];
for (let i = 1; i <= 2; i++) normal.push(await cycleWithRebuildCount(`цикл ${i}`));
for (const r of normal) console.log(`  ${r.label}: пересборок — ${r.rebuilds}${r.detail ? ` · ${r.detail}` : ''}`);
console.log(`  записей в индексе: ${await indexedCount()}`);

// ── ОПЫТ 2. Цена добавления ОДНОГО измерения ──────────────────────────────────
head('ОПЫТ 2 — ЦЕНА ДОБАВЛЕНИЯ ОДНОГО ИЗМЕРЕНИЯ');

await db.doc('dims/dim-new').set({
	title: { ru: 'Совсем новое', en: 'Brand new' },
	description: { ru: '', en: '' },
	year: '',
	stars: 0,
	rates: 0,
	rating: 0,
	time: { created: Timestamp.now() },
});
await db.doc('points/alice').update({ dirty: true });

const afterAdd = await cycleWithRebuildCount('цикл после добавления');
console.log(`  ${afterAdd.label}: пересборок — ${afterAdd.rebuilds}${afterAdd.detail ? ` · ${afterAdd.detail}` : ''}`);
console.log(`  записей в индексе: ${await indexedCount()}`);
console.log(
	`  👉 ЦЕНА: одна пересборка = чтение ВСЕЙ коллекции dims = ${seeded + 2} документов ради ОДНОЙ новой записи.`,
);
console.log(`     В бою это ${5111 + 1} документов (боевой каталог 5111 + служебный dims_list).`);

// ── ОПЫТ 3. 🔴 МИНА bugs/108: документ без `title` ────────────────────────────
head('ОПЫТ 3 — МИНА bugs/108: документ каталога БЕЗ поля `title`');

await db.doc('dims/dim-legacy').set({
	// Форма 1.x: название в поле `name`, поля `title` нет вовсе.
	name: { ru: 'Наследие 1.x', en: 'Legacy 1.x' },
	description: { ru: '', en: '' },
	year: '',
	time: { created: Timestamp.now() },
});
console.log('положен документ с `name` и БЕЗ `title` (ровно то, что писала форма создания 1.x)');

const mined = [];
for (let i = 1; i <= 3; i++) {
	await db.doc('points/alice').update({ dirty: true });
	mined.push(await cycleWithRebuildCount(`цикл ${i}`));
}
for (const r of mined) console.log(`  ${r.label}: пересборок — ${r.rebuilds}${r.detail ? ` · ${r.detail}` : ''}`);
console.log(`  записей в индексе: ${await indexedCount()}`);

const minedTotal = mined.reduce((sum, r) => sum + r.rebuilds, 0);
console.log(
	minedTotal === mined.length
		? `\n  🔴 МИНА ВОСПРОИЗВЕДЕНА: пересборка в КАЖДОМ из ${mined.length} циклов. Гипотеза bugs/108 подтверждена.`
		: `\n  ⚪ Мина НЕ воспроизведена (пересборок ${minedTotal} из ${mined.length}). Гипотезу bugs/108 надо переписать, а не «чинить на всякий случай».`,
);

// ── ОПЫТ 4. bugs/109: видит ли сервер синхронизации новые измерения в БОЕВОЙ форме ─────
head('ОПЫТ 4 — bugs/109: НОВЫЕ ИЗМЕРЕНИЯ В БОЕВОЙ ФОРМЕ `time.created`');

const stats = (await db.doc('space/stats').get()).data() ?? {};
const newDims = stats.newDims ?? [];
console.log(`  space/stats.newDims: ${JSON.stringify(newDims)}`);
console.log(`  space/stats.dims:    ${stats.dims}`);
console.log(
	newDims.length === 0
		? '\n  🔴 ПОДТВЕРЖДЕНО: только что созданные измерения (боевая форма `time.created`) НЕ найдены —\n' +
				'     запрос ищет плоское поле `created`, которого у боевых документов нет. Гипотеза bugs/109 верна.'
		: '\n  ⚪ Измерения найдены — гипотезу bugs/109 надо переписать.',
);

// ── ОПЫТ 5. bugs/106: что показывается человеку как «число измерений» ─────────
head('ОПЫТ 5 — bugs/106: РАСХОЖДЕНИЕ «СКОЛЬКО ИЗМЕРЕНИЙ»');

const inIndex = await indexedCount();
console.log(`  space/stats.dims (что видит человек на «Пространстве»): ${stats.dims}`);
console.log(`  записей в индексе (что видит человек на «Измерениях»):  ${inIndex}`);
console.log(
	stats.dims === inIndex
		? '  ⚪ Числа сходятся.'
		: `  🔴 РАСХОЖДЕНИЕ ${stats.dims - inIndex}: служебные документы каталога посчитаны измерениями (bugs/106).`,
);

console.log('\nЗамер окончен. Прибор ничего не чинит и ничего не утверждает — он печатает числа.\n');

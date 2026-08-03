// Тесты СВОДКИ ОЦЕНОК КАТАЛОГА — `bugs/111` (она же шаг 0 эпика `ideas/28`).
//
// ЧТО ЗДЕСЬ СТЕРЕЖЁТСЯ. Поля `stars` / `rates` / `rating` документа `dims/{dimId}` — наследие 1.x,
// где их кто-то поддерживал. В 2.0 их не писал НИКТО: поиск по всему дереву давал только чтение,
// и числа замерли на эпохе 1.x. Публичные страницы каталога (10 222 штуки, в бою с 2026-08-03)
// показывают именно их — то есть это была не погрешность, а недостающий механизм, и расхождение
// росло бы вечно (на день диагноза — 31 оценка).
//
// 🔑 ГЛАВНАЯ ПРОВЕРКА ФАЙЛА — СХОДИМОСТЬ, КОТОРУЮ НЕЛЬЗЯ ПОДДЕЛАТЬ: сумма `rates` по всему
// каталогу обязана равняться `space/stats.ratings`. Эти два числа считаются РАЗНЫМИ путями
// (одно — сворачиванием по измерениям, другое — сворачиванием по людям в `model/stats.ts`), и
// совпасть по случайности они не могут. Именно её расхождение и завело `bugs/111`.
//
// Запуск: npm run test:calc  (поднимает эмулятор Firestore, Java обязательна)

import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	throw new Error('FIRESTORE_EMULATOR_HOST не задан. Запускай через `npm run test:calc`.');
}

// СВОЙ проект = своя база: `node --test` гоняет файлы параллельно, а мы считаем оценки каталога.
process.env.FIREBASE_PROJECT_ID = 'demo-ndim-calc-dim-ratings';

const { runCycle } = await import('./index.mjs');
const { getFirestore, Timestamp } = await import('firebase-admin/firestore');

const db = getFirestore();

/** Ловит строки лога вычислителя за один цикл: обновление сводки объявляется именно там. */
async function cycleLog() {
	const lines = [];
	const original = process.stdout.write.bind(process.stdout);
	process.stdout.write = (chunk, ...rest) => {
		lines.push(String(chunk));
		return original(chunk, ...rest);
	};
	try {
		await runCycle();
	} finally {
		process.stdout.write = original;
	}
	return lines.join('');
}

async function wipe() {
	for (const path of ['dims', 'points', 'relations', 'space']) {
		const snapshot = await db.collection(path).get();
		await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
	}
}

/** Сеет каталог с ЗАВЕДОМО НЕВЕРНЫМИ счётчиками — ровно как боевой, пришедший из 1.x. */
async function seedCatalog(ids) {
	const index = {};
	for (const id of ids) {
		await db.doc(`dims/${id}`).set({
			title: { ru: `Измерение ${id}`, en: `Dimension ${id}` },
			description: { ru: '', en: '' },
			year: '',
			// 🔴 Мусор намеренный: тест обязан доказать, что цикл ПРИВОДИТ поля к правде, а не
			// что они «и так были нулями». Нули красились бы зелёным на неработающем коде.
			stars: 999,
			rates: 999,
			rating: 9.9,
			time: { created: Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000) },
		});
		index[id] = { ru: `Измерение ${id}`, en: `Dimension ${id}`, year: '' };
	}
	await db.doc('dims/dims_list').set({ dims_list: JSON.stringify(index) });
}

/** Заводит человека с оценками. `anonymous` — анонимный гость (plans/03). */
async function seedPerson(uid, ratings, { anonymous = false } = {}) {
	await db.doc(`points/${uid}`).set({
		dirty: true,
		updated: 1,
		lastSync: null,
		firstSeen: 1,
		...(anonymous ? { guest: true } : {}),
	});
	for (const [dimId, value] of Object.entries(ratings)) {
		await db.doc(`points/${uid}/dims/${dimId}`).set({ value });
	}
}

const dimDoc = async (id) => (await db.doc(`dims/${id}`).get()).data();
const stats = async () => (await db.doc('space/stats').get()).data();

/** Сумма `rates` по всему каталогу — левая половина проверки сходимости. */
async function ratesSum() {
	const snapshot = await db.collection('dims').get();
	let sum = 0;
	for (const doc of snapshot.docs) {
		if (doc.id === 'dims_list') continue;
		sum += Number(doc.data().rates) || 0;
	}
	return sum;
}

describe('сводка оценок каталога', () => {
	before(async () => {
		await wipe();
		await seedCatalog(['dim-a', 'dim-b', 'dim-c', 'dim-empty']);
		// Двое ЖИТЕЛЕЙ Пространства и один анонимный гость.
		await seedPerson('alice', { 'dim-a': 8, 'dim-b': 3 });
		await seedPerson('bob', { 'dim-a': 10, 'dim-c': 5 });
		await seedPerson('ghost', { 'dim-a': 1, 'dim-b': 1 }, { anonymous: true });
		await runCycle();
	});

	test('🔑 СХОДИМОСТЬ: сумма rates по каталогу равна space/stats.ratings', async () => {
		// Два числа, посчитанные разными путями. Совпасть по случайности они не могут — именно
		// их расхождение (4058 против 4089) и завело `bugs/111`.
		assert.equal(await ratesSum(), (await stats()).ratings);
	});

	test('stars — СУММА оценок, rates — сколько людей, rating — среднее до 0,1', async () => {
		// dim-a: alice 8 + bob 10 = 18 у двоих ⇒ 9,0 (аноним не в счёте, см. ниже)
		assert.deepEqual(
			(({ stars, rates, rating }) => ({ stars, rates, rating }))(await dimDoc('dim-a')),
			{ stars: 18, rates: 2, rating: 9 },
		);
		// dim-b: только alice, 3 ⇒ 3,0
		assert.deepEqual(
			(({ stars, rates, rating }) => ({ stars, rates, rating }))(await dimDoc('dim-b')),
			{ stars: 3, rates: 1, rating: 3 },
		);
	});

	test('среднее округляется до 0,1, как в 1.x', async () => {
		// 8 и 3 у одного измерения дали бы 5,5 — проверяем дробную половину отдельно, потому что
		// целые средние прошли бы и на коде, который округляет до целого.
		await seedPerson('carol', { 'dim-b': 8 });
		await runCycle();
		const b = await dimDoc('dim-b');
		assert.deepEqual({ stars: b.stars, rates: b.rates, rating: b.rating }, { stars: 11, rates: 2, rating: 5.5 });
	});

	test('🔴 АНОНИМНЫЙ ГОСТЬ в публичный счётчик НЕ входит', async () => {
		// Популяция здесь обязана совпадать с `space/stats.ratings` (`model/stats.ts` → inhabitants).
		// И дело не в цифре: гость живёт 7 дней и исчезает — считай мы его, публичный счётчик
		// измерения УМЕНЬШАЛСЯ бы сам собой, и человек из поиска видел бы, как оценки пропадают.
		const a = await dimDoc('dim-a');
		assert.equal(a.rates, 2, 'у dim-a оценки двоих жителей, гость третьим не считается');
		assert.equal(a.stars, 18, 'единица гостя не приехала в сумму');
	});

	test('измерение без единой оценки получает честные НУЛИ, а не мусор 1.x', async () => {
		assert.deepEqual(
			(({ stars, rates, rating }) => ({ stars, rates, rating }))(await dimDoc('dim-empty')),
			{ stars: 0, rates: 0, rating: 0 },
		);
	});

	test('снятая последняя оценка ОБНУЛЯЕТ счётчик, а не замораживает его', async () => {
		// Тот же класс, что опустевшая точка в `bugs/92`: измерение исчезает из сводки, но
		// в каталоге остаётся — и обнулить его больше некому, если обходить только сводку.
		await db.doc('points/bob/dims/dim-c').delete();
		await db.doc('points/bob').update({ dirty: true });
		await runCycle();
		assert.deepEqual(
			(({ stars, rates, rating }) => ({ stars, rates, rating }))(await dimDoc('dim-c')),
			{ stars: 0, rates: 0, rating: 0 },
		);
		assert.equal(await ratesSum(), (await stats()).ratings, 'сходимость держится и после снятия');
	});

	test('оценка на измерении ВНЕ каталога не роняет цикл и объявляется в логе', async () => {
		// Гипотеза 1 самого `bugs/111` («сироты»). `batch.update` несуществующего документа
		// отвечает NOT_FOUND и уронил бы ВЕСЬ батч — вместе со статистикой и топами.
		await seedPerson('dave', { 'dim-a': 4, 'dim-deleted': 7 });
		const log = await cycleLog();
		assert.match(log, /оценки на измерениях вне каталога — 1/);
		assert.equal((await dimDoc('dim-a')).rates, 3, 'живое измерение посчитано, несмотря на сироту');
		// Сирота не в каталоге, поэтому в сумму `rates` он не попал — а в `stats.ratings` попал.
		// Это ЕДИНСТВЕННЫЙ честный источник расхождения, и он назван вслух.
		assert.equal(await ratesSum() + 1, (await stats()).ratings);
	});

	test('повторный цикл без изменений НЕ переписывает каталог заново', async () => {
		// Канон экономии (слово владельца: «ЭКОНОМИТЬ ЗАПРОСЫ К БАЗЕ!!!»). Одинаковая запись
		// каждую минуту — ровно то расточительство, против которого заведена идея 14.
		await db.doc('points/alice').update({ dirty: true });
		const log = await cycleLog();
		assert.doesNotMatch(log, /сводка оценок каталога обновлена/);
	});
});

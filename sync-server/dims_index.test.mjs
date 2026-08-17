// Тесты ОБСЛУЖИВАНИЯ ИНДЕКСА КАТАЛОГА — фаза 1 эпика `ideas/29` (`plans/31`).
//
// ЧТО ЗДЕСЬ СТЕРЕЖЁТСЯ. Индекс `dims/dims_list` — один документ вместо 5111 чтений, наследие 1.x
// и опора экрана «Измерения». Но его ОБСЛУЖИВАНИЕ до 2026-08-02 стоило как весь каталог: любое
// расхождение вызывало полную пересборку, а сторож свежести опирался на магическую единицу и
// потому в некоторых состояниях не сходился НИКОГДА.
//
// Три дефекта, воспроизведённые прибором `sync-server/measure-dims-index.mjs` ДО этих тестов:
//   · `bugs/108` — документ каталога без `title` считается в `dimsCount`, но не попадает в индекс
//     ⇒ пересборка на КАЖДОМ цикле, 5111 чтений в бою при дневной квоте 50 000;
//   · `bugs/106` — «сколько измерений» человеку показывается по числу ДОКУМЕНТОВ коллекции,
//     а не по числу записей индекса ⇒ 5112 против 5111 и диаметр 715 вместо канона 714,9;
//   · `bugs/109` — «новые измерения» ищутся по ПЛОСКОМУ полю `created`, которого у боевых
//     документов нет вовсе (там `time.created`) ⇒ виджет «Сегодня» молчит навсегда.
//
// Запуск: npm run test:sync  (поднимает эмулятор Firestore, Java обязательна)

import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	throw new Error('FIRESTORE_EMULATOR_HOST не задан. Запускай через `npm run test:sync`.');
}

// СВОЙ проект = своя база: `node --test` гоняет файлы параллельно, а мы считаем документы каталога.
process.env.FIREBASE_PROJECT_ID = 'demo-ndim-calc-dims-index';

const { runCycle } = await import('./index.mjs');
const { getFirestore, Timestamp } = await import('firebase-admin/firestore');

const db = getFirestore();

/** Ловит строки лога сервера синхронизации за один цикл: пересборка индекса объявляется именно там. */
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

const REBUILT = 'индекс каталога пересобран';
const rebuilds = (log) => log.split(REBUILT).length - 1;

async function wipe() {
	for (const path of ['dims', 'points', 'relations', 'space']) {
		const snapshot = await db.collection(path).get();
		await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
	}
}

/** Сеет каталог: `n` нормальных измерений в БОЕВОЙ форме возраста + служебный индекс. */
async function seedCatalog(n, { ageMs = 30 * 24 * 60 * 60 * 1000 } = {}) {
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
			time: { created: Timestamp.fromMillis(Date.now() - ageMs) },
		});
		index[id] = { ru: `Измерение ${i}`, en: `Dimension ${i}`, year: '' };
	}
	await db.doc('dims/dims_list').set({ dims_list: JSON.stringify(index) });
}

/** Две точки с общими оценками; первая грязная, иначе цикл выйдет ДО обслуживания индекса. */
async function seedWork() {
	for (const [uid, dirty] of [['alice', true], ['bob', false]]) {
		await db.doc(`points/${uid}`).set({ dirty, updated: 1, lastSync: null, firstSeen: 1 });
		for (const [dimId, value] of [['dim-000', 8], ['dim-001', 3]]) {
			await db.doc(`points/${uid}/dims/${dimId}`).set({ value });
		}
	}
}

const dirty = () => db.doc('points/alice').update({ dirty: true });
const indexEntries = async () => {
	const snapshot = await db.doc('dims/dims_list').get();
	return JSON.parse(snapshot.data()?.dims_list ?? '{}');
};

describe('обслуживание индекса каталога', () => {
	before(async () => {
		await wipe();
		await seedCatalog(8);
		await seedWork();
	});

	test('спокойный каталог не пересобирает индекс', async () => {
		await cycleLog();
		await dirty();
		const log = await cycleLog();
		assert.equal(rebuilds(log), 0, 'сторож свежести обязан сойтись и не трогать индекс');
	});

	test('bugs/108: документ без `title` не вводит в вечную пересборку', async () => {
		// Ровно то, что писала форма создания 1.x: название в `name`, поля `title` нет.
		await db.doc('dims/legacy-no-title').set({
			name: { ru: 'Наследие 1.x', en: 'Legacy 1.x' },
			time: { created: Timestamp.now() },
		});

		await dirty();
		await cycleLog(); // первый цикл вправе пересобрать: каталог действительно изменился

		await dirty();
		const second = await cycleLog();
		await dirty();
		const third = await cycleLog();

		assert.equal(
			rebuilds(second) + rebuilds(third),
			0,
			'после того как индекс пересобран, документ без `title` не должен вызывать пересборку СНОВА',
		);
	});

	test('добавление измерения не перечитывает весь каталог', async () => {
		await db.doc('dims/dim-fresh').set({
			title: { ru: 'Свежее', en: 'Fresh' },
			description: { ru: '', en: '' },
			year: '',
			stars: 0,
			rates: 0,
			rating: 0,
			time: { created: Timestamp.now() },
		});
		await dirty();
		const log = await cycleLog();

		const index = await indexEntries();
		assert.ok(index['dim-fresh'], 'новое измерение обязано появиться в индексе');
		assert.match(
			log,
			/индекс каталога дополнен/u,
			'индекс обязан ДОПОЛНЯТЬСЯ по одной записи, а не пересобираться целиком',
		);
	});

	test('пересборка сохраняет поля записи, которых не знает', async () => {
		// Требование соседнего эпика `ideas/28`: в записи индекса поселится счётчик оценок.
		// Пересборка, стирающая незнакомые поля, убьёт все 5111 счётчиков молча.
		const index = await indexEntries();
		index['dim-000'] = { ...index['dim-000'], r: 42 };
		await db.doc('dims/dims_list').set({ dims_list: JSON.stringify(index) });

		// Ломаем индекс так, чтобы пересборка стала неизбежной: удаляем одну запись.
		const broken = await indexEntries();
		delete broken['dim-001'];
		await db.doc('dims/dims_list').set({ dims_list: JSON.stringify(broken) });

		await dirty();
		await cycleLog();

		const after = await indexEntries();
		assert.ok(after['dim-001'], 'потерянная запись обязана вернуться');
		assert.equal(after['dim-000'].r, 42, 'чужое поле записи обязано пережить пересборку');
	});

	test('bugs/106: число измерений считается по индексу, а не по документам коллекции', async () => {
		await dirty();
		await cycleLog();

		const stats = (await db.doc('space/stats').get()).data() ?? {};
		const index = await indexEntries();
		assert.equal(
			stats.dims,
			Object.keys(index).length,
			'«сколько измерений» на «Пространстве» и на «Измерениях» — одно число по построению',
		);
	});

	test('bugs/109: новые измерения находятся в БОЕВОЙ форме `time.created`', async () => {
		await db.doc('dims/dim-today').set({
			title: { ru: 'Сегодняшнее', en: 'Today' },
			description: { ru: '', en: '' },
			year: '',
			stars: 0,
			rates: 0,
			rating: 0,
			time: { created: Timestamp.now() },
		});
		await dirty();
		await cycleLog();

		const stats = (await db.doc('space/stats').get()).data() ?? {};
		const names = (stats.newDims ?? []).map((d) => d.id);
		assert.ok(
			names.includes('dim-today'),
			'измерение, созданное только что, обязано попасть в «Сегодня» — форма возраста боевая',
		);
	});

	/*
	 * 🔴🔴 plans/44 (фаза 4): ПОЧЕМУ ПАНЕЛЬ ИЗМЕРЕНИЙ НЕ ПИШЕТ СТРОКУ ИНДЕКСА.
	 *
	 * Шаг 4 того плана требовал «инкрементальную запись в индекс тем же батчем, что пишет
	 * `dims/{id}»`. Этот тест показывает, что исполнить требование значит сломать критерий 3
	 * той же фазы («полной пересборки не было»), и держит запрет механически, а не памятью.
	 *
	 * Механизм: дельта принимается, только если прирост записей индекса СОШЁЛСЯ с числом
	 * прибывших документов (`grew === dimsCount - built.docs`). Строка, вписанная панелью
	 * заранее, уже сидит в индексе — прирост равен нулю при разнице в единицу, условие не
	 * сходится, и сервер честно уходит в полную пересборку всего каталога.
	 *
	 * ПАРА к этому тесту — «добавление измерения не перечитывает весь каталог» выше: там
	 * панель пишет ТОЛЬКО документ, и дельта проходит. Один тест без другого доказывает
	 * половину: вместе они говорят «пиши истину, зеркало ведёт его писатель».
	 */
	test('plans/44: строка индекса, вписанная панелью заранее, роняет дельту в полную пересборку', async () => {
		// Приводим индекс к свежему состоянию, чтобы мерить ровно этот эффект, а не долги соседей.
		await dirty();
		await cycleLog();
		const fresh = await cycleLog();
		assert.equal(rebuilds(fresh), 0, 'контроль опыта: перед замером индекс обязан быть свежим');

		const id = 'dim-written-by-panel';
		const entry = { ru: 'Панельное', en: 'By panel', year: '' };
		await db.doc(`dims/${id}`).set({
			title: { ru: entry.ru, en: entry.en },
			description: { ru: '', en: '' },
			year: '',
			stars: 0,
			rates: 0,
			rating: 0,
			time: { created: Timestamp.now() },
		});
		// …и то самое, чего делать НЕЛЬЗЯ: панель дописывает свою строку в зеркало.
		// `merge: true` — как это сделал бы батч панели: отметка `built` остаётся на месте.
		const index = await indexEntries();
		index[id] = entry;
		await db.doc('dims/dims_list').set({ dims_list: JSON.stringify(index) }, { merge: true });

		await dirty();
		const log = await cycleLog();

		assert.equal(
			rebuilds(log),
			1,
			'предзаписанная панелью строка обязана уронить дельту в ПОЛНУЮ пересборку — ' +
				'именно поэтому панель индекс не пишет',
		);
		assert.doesNotMatch(
			log,
			/индекс каталога дополнен/u,
			'дельта в этом случае пройти НЕ может: прирост нулевой при разнице в единицу',
		);
	});
});

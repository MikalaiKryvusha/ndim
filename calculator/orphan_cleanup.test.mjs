// Тесты ЧИСТКИ МЁРТВЫХ ОЦЕНОК — `bugs/111`, слово владельца 2026-08-03:
// «*почистить юзерам профили от мёртвых измерений*».
//
// ЧТО ЗДЕСЬ СТЕРЕЖЁТСЯ. Оценка на измерении, которого в каталоге больше нет, мешала не только
// цифре на витрине:
//   · она УЧАСТВОВАЛА В МАТЕМАТИКЕ СВЯЗЕЙ — `computeRelation` берёт все оценки человека, и двое,
//     оценившие удалённое измерение, получали общую ось, которой в продукте нет; а знаменатель
//     Дайса `(|мои| + |его|)` рос у носителя, то есть похожесть занижалась именно ему и молча;
//   · её НЕ МОГ УБРАТЬ ЧЕЛОВЕК — экран «Измерения» рисуется из каталога и сироту не показывает.
// Замер боя 2026-08-03: 15 измерений, 25 оценок.
//
// 🔴 ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ, А НЕ СТРОКИ В `dim_ratings.test.mjs`. Чистка идёт ТОЛЬКО в полном
// проходе, а внутри цикла — РАНЬШЕ доклада о сиротах. Включи мы здесь `CALC_FULL_SYNC_EVERY_CYCLE`
// в том файле, сироты не доживали бы до строки лога, и проверка доклада сломалась бы. Два разных
// предположения о режиме цикла — два файла, у каждого свой проект эмулятора.
//
// Запуск: npm run test:calc  (поднимает эмулятор Firestore, Java обязательна)

import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	throw new Error('FIRESTORE_EMULATOR_HOST не задан. Запускай через `npm run test:calc`.');
}

// СВОЙ проект = своя база. Обе переменные читаются при загрузке модуля — ставим ДО импорта.
process.env.FIREBASE_PROJECT_ID = 'demo-ndim-calc-orphans';
// Каждый цикл — полный: иначе чистку пришлось бы ждать до полуночи.
process.env.CALC_FULL_SYNC_EVERY_CYCLE = '1';

const { runCycle } = await import('./index.mjs');
const { getFirestore, Timestamp } = await import('firebase-admin/firestore');

const db = getFirestore();

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

/**
 * Каталог из `n` измерений. Больше сотни — иначе сработает предохранитель «каталог подозрительно
 * мал», и все проверки чистки стали бы зелёными по неверной причине.
 */
async function seedCatalog(n) {
	const index = {};
	const batchIds = [];
	for (let i = 0; i < n; i++) batchIds.push(`dim-${String(i).padStart(3, '0')}`);
	await Promise.all(
		batchIds.map(async (id, i) => {
			await db.doc(`dims/${id}`).set({
				title: { ru: `Измерение ${i}`, en: `Dimension ${i}` },
				description: { ru: '', en: '' },
				year: '',
				stars: 0,
				rates: 0,
				rating: 0,
				time: { created: Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000) },
			});
			index[id] = { ru: `Измерение ${i}`, en: `Dimension ${i}`, year: '' };
		}),
	);
	await db.doc('dims/dims_list').set({ dims_list: JSON.stringify(index) });
}

async function seedPerson(uid, ratings) {
	await db.doc(`points/${uid}`).set({ dirty: true, updated: 777, lastSync: null, firstSeen: 1 });
	for (const [dimId, value] of Object.entries(ratings)) {
		await db.doc(`points/${uid}/dims/${dimId}`).set({ value });
	}
}

const exists = async (path) => (await db.doc(path).get()).exists;

describe('чистка мёртвых оценок', () => {
	before(async () => {
		await wipe();
		await seedCatalog(120);
		// У обоих есть живые оценки И оценки на измерениях, которых в каталоге нет.
		await seedPerson('alice', { 'dim-000': 8, 'dim-001': 3, 'dim-ghost': 5 });
		await seedPerson('bob', { 'dim-000': 10, 'dim-ghost': 7, 'dim-vanished': 2 });
	});

	test('🧹 мёртвые оценки удалены, живые НЕ тронуты', async () => {
		// Контроль прибора (EXP-0082) ПЕРВЫМ: удалять было что. Без этого проверка «удалено»
		// красилась бы зелёным и на коде, который не чистит вовсе.
		assert.equal(await exists('points/alice/dims/dim-ghost'), true, 'мёртвая оценка есть ДО');
		assert.equal(await exists('points/bob/dims/dim-vanished'), true, 'и вторая тоже');

		const log = await cycleLog();

		assert.equal(await exists('points/alice/dims/dim-ghost'), false);
		assert.equal(await exists('points/bob/dims/dim-ghost'), false);
		assert.equal(await exists('points/bob/dims/dim-vanished'), false);
		// 🔒 Обратное плечо: без него зелёным прошёл бы код, стирающий у человека ВСЁ подряд.
		assert.equal(await exists('points/alice/dims/dim-000'), true, '🔒 живая оценка на месте');
		assert.equal(await exists('points/alice/dims/dim-001'), true, '🔒 и вторая живая тоже');
		assert.equal(await exists('points/bob/dims/dim-000'), true, '🔒 и у второго человека');

		assert.match(log, /чистка мёртвых оценок: удалено 3 у людей — 2/);
	});

	test('после чистки сиротам неоткуда взяться — доклада о них больше нет', async () => {
		await db.doc('points/alice').update({ dirty: true });
		const log = await cycleLog();
		assert.doesNotMatch(log, /сироты:/);
		assert.doesNotMatch(log, /чистка мёртвых оценок/, 'чистить нечего — проход бесплатен');
	});

	test('🔴 отметка «активен» НЕ поднимается: уборка не делает человека активным', async () => {
		// `points/{uid}.updated` — «когда человек последний раз менял свои оценки»; на ней
		// держится «активных за 7 дней». Подняв её, сервер соврал бы на витрине ради удобства
		// уборки. Сеяли 777 — столько и должно остаться.
		assert.equal((await db.doc('points/alice').get()).data().updated, 777);
	});

	test('🔒 ПРЕДОХРАНИТЕЛЬ: пустой каталог не делает мёртвыми ВСЕ оценки разом', async () => {
		/*
		 * Сценарий, ради которого предохранитель и существует: каталог прочитался частично или
		 * пусто — и «мёртвым» становится всё. Ошибка необратима, это данные людей.
		 * 🔴 Прогон РАЗРУШИТЕЛЕН для каталога, поэтому стоит последним в файле.
		 */
		const snapshot = await db.collection('dims').get();
		await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
		await db.doc('points/alice').update({ dirty: true });

		const log = await cycleLog();

		assert.match(log, /каталог подозрительно мал/);
		assert.equal(await exists('points/alice/dims/dim-000'), true,
			'🔒 оценки людей НЕ вычищены вслед за каталогом');
		assert.equal(await exists('points/bob/dims/dim-000'), true, '🔒 и у второго человека');
	});
});

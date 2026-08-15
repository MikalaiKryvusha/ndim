/**
 * СТРАЖ ПРИБОРА ОТПЕЧАТКА — `tools/migrate/db-fingerprint.mjs` (`bugs/130`).
 *
 * Зачем. Отпечаток — это прибор, которым судится критерий П1 эпика `plans/53` («ни один документ
 * людей не потерян»). Слово владельца: «*права на ошибку у нас нет, это данные наших
 * пользователей*». Прибор, которым мерят такое, обязан сам быть измерен — иначе миграция
 * сверяется с числом, которому никто не задавал вопросов. Ровно это и случилось: сводка отпечатка
 * завышала каталог вдвое, и завышенное число уехало в план как ОЖИДАНИЕ для П1.
 *
 * 🔑 ЧТО ИМЕННО СТЕРЕЖЁТСЯ — конфигурация имён, а не абстрактный «подсчёт».
 * `collectionGroup(name)` в Firestore матчит КАЖДУЮ коллекцию с этим именем, включая КОРНЕВУЮ.
 * В нашей модели имя `dims` носят две разные вещи:
 *   · `dims/{dimId}`              — корневой каталог измерений;
 *   · `points/{uid}/dims/{dimId}` — оценки человека (ось = документ).
 * Поэтому фикстура ОБЯЗАНА содержать обе, и числа их обязаны РАЗЛИЧАТЬСЯ — иначе задвоение одной
 * неотличимо от правильного счёта другой, и страж был бы зелёным на сломанном коде.
 *
 * Стенд не нужен: поднимается СВОЙ эмулятор Firestore на своём проекте, чтобы прогон не зависел
 * от состояния базы стенда (правило класса, `bugs/103`).
 *
 * Запуск:
 *   npx firebase emulators:exec --only firestore --project demo-ndim-fp "node tools/migrate/verify-fingerprint.mjs"
 *
 * Выход: 0 — все проверки зелёные; 1 — есть провал.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('ОТКАЗ: нет FIRESTORE_EMULATOR_HOST — страж запускается только под эмулятором.');
	console.error('Запуск: npx firebase emulators:exec --only firestore --project demo-ndim-fp \\');
	console.error('          "node tools/migrate/verify-fingerprint.mjs"');
	process.exit(1);
}

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'demo-ndim-fp';

/*
 * Числа фикстуры РАЗНЫЕ и НЕ кратные друг другу нарочно: при 10 и 10 задвоение каталога дало бы
 * 20 и осталось бы «похоже на правду», а при 7 и 10 всякое смешение видно сразу.
 */
const ROOT_DIMS = 7; //  dims/{dimId}                — корневой каталог
const RATED_DIMS = 10; // points/{uid}/dims/{dimId}  — оценки, СУММАРНО по всем точкам
const POINTS = 2; //     points/{uid}
const USERS = 3; //      users/{uid}
const PROFILES = 3; //   users/{uid}/profile/{bucket}

const app = initializeApp(
	{ credential: cert(JSON.parse(readFileSync('calculator/secrets/sa.json', 'utf8'))), projectId: PROJECT_ID },
	'fingerprint-guard',
);
const db = getFirestore(app);

let failures = 0;
const check = (ok, label) => {
	console.log(`${ok ? '  ✅' : '  ❌'} ${label}`);
	if (!ok) failures += 1;
};

/** Фикстура: та самая коллизия имён `dims`, ради которой страж существует. */
async function seed() {
	const batch = db.batch();
	for (let i = 0; i < ROOT_DIMS; i += 1) {
		batch.set(db.doc(`dims/dim${i}`), { title: `dim ${i}`, kind: 'movie' });
	}
	let rated = 0;
	for (let p = 0; p < POINTS; p += 1) {
		batch.set(db.doc(`points/user${p}`), { dirty: false });
		// Оценки раскладываются по точкам НЕРАВНОМЕРНО (6 и 4): равные доли позволили бы спутать
		// «сумма по группе» с «столько у каждого».
		const share = p === 0 ? 6 : RATED_DIMS - 6;
		for (let d = 0; d < share; d += 1) {
			batch.set(db.doc(`points/user${p}/dims/dim${d}`), { value: d });
			rated += 1;
		}
	}
	for (let u = 0; u < USERS; u += 1) {
		batch.set(db.doc(`users/user${u}`), { name: `person ${u}` });
		if (u < PROFILES) batch.set(db.doc(`users/user${u}/profile/everyone`), { name: `person ${u}` });
	}
	await batch.commit();
	if (rated !== RATED_DIMS) throw new Error(`фикстура собрана неверно: оценок ${rated}, ждали ${RATED_DIMS}`);
}

const out = join(mkdtempSync(join(tmpdir(), 'ndim-fp-')), 'fingerprint.json');

try {
	console.log('\n═══ СТРАЖ ПРИБОРА ОТПЕЧАТКА (bugs/130) ═══\n');
	await seed();
	console.log(
		`фикстура: dims/{id} ${ROOT_DIMS} · points/{uid} ${POINTS} · points/*/dims/* ${RATED_DIMS} · ` +
			`users/{uid} ${USERS} · users/*/profile/* ${PROFILES}\n`,
	);

	execFileSync(
		process.execPath,
		['tools/migrate/db-fingerprint.mjs', '--project', PROJECT_ID, '--database', '(default)', '--out', out],
		{ stdio: 'inherit' },
	);

	const fp = JSON.parse(readFileSync(out, 'utf8'));
	const expectedDocs = ROOT_DIMS + POINTS + RATED_DIMS + USERS + PROFILES;

	console.log('\n─── ПРОВЕРКИ ───');

	// 1. Сердце дефекта: корневой каталог посчитан ОДИН раз, а не дважды.
	check(
		fp.counts['dims/*'] === ROOT_DIMS,
		`counts['dims/*'] = ${fp.counts['dims/*']}, ждали ${ROOT_DIMS} (корневой каталог не задвоен)`,
	);

	// 2. Оценки не смешались с каталогом, хотя коллекции ОДНОИМЁННЫЕ.
	check(
		fp.counts['points/*/dims/*'] === RATED_DIMS,
		`counts['points/*/dims/*'] = ${fp.counts['points/*/dims/*']}, ждали ${RATED_DIMS}`,
	);

	// 3. Заголовочное число (оно и было верным до фикса — стережём, чтобы не сломать спасая).
	check(fp.documents === expectedDocs, `documents = ${fp.documents}, ждали ${expectedDocs}`);

	// 4. Сводка сходится с заголовком. ИМЕННО ЭТО расходилось в бою: сумма строк давала 16 378
	//    при подписанном итоге 11 266.
	const sum = Object.values(fp.counts).reduce((a, b) => a + b, 0);
	check(sum === fp.documents, `сумма counts = ${sum}, documents = ${fp.documents} — сводка сходится`);

	// 5. Ни один документ не прочитан дважды. Это половина про ЦЕНУ: в бою лишние 5112 чтений
	//    были 10 % суточной бесплатной квоты.
	check(fp.reads === fp.documents, `reads = ${fp.reads}, documents = ${fp.documents} — лишних чтений нет`);

	// 6. Контроль прибора (`EXP-0082`): страж обязан УМЕТЬ увидеть каталог. Без этой проверки
	//    пустая фикстура красила бы всё зелёным — «0 === 0» четырежды.
	check(ROOT_DIMS > 0 && fp.documents > 0, `контроль прибора: фикстура непуста (${fp.documents} документов)`);

	console.log(`\n─── ИТОГ ───\nпроверок 6 · провалов ${failures}\n`);
} finally {
	rmSync(out, { force: true });
}

process.exit(failures === 0 ? 0 : 1);

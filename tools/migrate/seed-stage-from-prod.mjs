/**
 * НАПОЛНЕНИЕ СТЕЙДЖА ОБЕЗЛИЧЕННЫМ СЛЕПКОМ БОЯ — фаза 1 эпика `plans/53`.
 *
 * Заказ владельца: «*для ndim-stage базы данных можно тоже текущий прод слепок базы сделать и
 * загрузить, чтобы для stage окружения были хоть какие-то данные, с которыми можно работать при
 * разработке и тестировании*» + «*доделать разделение адекватное стейдж и прод, чтобы мы могли
 * спокойно тестировать и фиксить на стейдже, который повторяет прод*».
 * Форма наполнения — интервью №033, В1 = **А**: обезличенный слепок.
 *
 * ═══ ЧТО ЭТОТ ПРИБОР ДЕЛАЕТ И ЧЕГО НЕ ДЕЛАЕТ ═══
 *
 * ЧИТАЕТ боевой проект `ndim-space` (база `(default)`) и ПИШЕТ в `ndim-stage / ndim-db-stage`.
 * Бой он не меняет НИ ОДНИМ байтом: у боевого подключения вызываются только `get()`.
 *
 * 🔴 ЭТО НЕ РЕПЕТИЦИЯ Р2, И ПУТАТЬ НЕЛЬЗЯ. Зарубка `plans/53` называла наполнение стейджа
 * «он же репетиция Р2, та же машинерия» — машинерия похожа, но Р2 определена иначе: копия
 * боевых данных ВНУТРИ боевого проекта и сверка 100 % документов (П1). Здесь данные
 * ОБЕЗЛИЧИВАЮТСЯ, то есть их хеши заведомо не совпадут с боевыми, и сверить «ни один документ не
 * потерян» этим прогоном невозможно по построению. Засчитать его за репетицию значило бы получить
 * две репетиции вместо трёх, которых потребовал владелец словами «права на ошибку у нас нет».
 * Р2 остаётся отдельной работой.
 *
 * ═══ ПРАВИЛА ПЕРЕНОСА ═══
 *
 * ⚠️ Пути записаны в нотации `{uid}`, а НЕ звёздочками: `points/[звезда]/dims` внутри блочного
 * комментария несёт последовательность, закрывающую сам комментарий. Поймано первым же запуском.
 *
 * | Коллекция                     | Как едет                                       | Почему                     |
 * |-------------------------------|------------------------------------------------|----------------------------|
 * | `dims/{id}` (5112)            | как есть                                       | каталог — не ПДн           |
 * | `points/{uid}` (342)          | ключ → новый uid                               | нужна математика           |
 * | `points/{uid}/dims/{id}`(4066)| как есть                                       | оценки — сердце продукта   |
 * | `relations/{uid}` (341)       | ключ и `top[].uid` → новые uid                 | экраны заполнены сразу     |
 * | `space/{id}`, daily, days     | как есть                                       | живые числа витрин         |
 * | `users/{uid}` (362)           | ключ → новый uid; `visibility` как есть        | видимость надо проверять   |
 * | `users/{uid}/profile/{bucket}`| имя, «о себе», фото заменяются; день рождения огрубляется | это и есть слой личности |
 * | `suggestions/{id}` (5)        | `authorUid` → новый uid                        | материал для админ-панели  |
 * | `admins/{uid}` (1)            | ключ → новый uid                               | права нужны и на стейдже   |
 * | 🔴 `users/{uid}/privat/{id}`  | **НЕ переносится**                             | 331 живой `user_secret_key` (`bugs/127`) |
 * | 🔴 `ndimids/{id}` (330)       | **НЕ переносится**                             | наследие 1.x, 2.0 не читает |
 *
 * ═══ UID: НОВЫЕ, А НЕ СОХРАНЁННЫЕ ═══
 *
 * Владелец выбрал вариант А **как он описан**, а описан он был со словами «UID → новый». Зарубка
 * предыдущей сессии предлагала UID сохранить ради ссылочной целостности `friendships`, `audience`
 * и `testPairs` — 🔑 **замер этого не подтвердил: все три коллекции в бою ПУСТЫ** (0 документов).
 * Ссылки на uid живут ровно в двух местах: ключи документов и `relations.top[].uid`, и обе
 * переписываются картой ниже. То есть цена сохранения была бы реальной (join боевых оценок с
 * личностью), а выгода — воображаемой.
 *
 * Новый uid = `stage-` + 20 знаков SHA-256 от боевого. Детерминированно (повторный прогон даёт ту
 * же карту — это нужно и для импорта учёток в Auth), без утечки порядка. Остаточная цена названа
 * честно: тот, у кого УЖЕ есть боевая база, может пересчитать соответствие — но у него и так есть
 * оригинал, поэтому защита строится от того, кто получил ТОЛЬКО стейдж.
 *
 * Запуск:
 *   node tools/migrate/seed-stage-from-prod.mjs              # СУХОЙ прогон: читает, считает, не пишет
 *   node tools/migrate/seed-stage-from-prod.mjs --apply       # пишет в стейдж
 *   node tools/migrate/seed-stage-from-prod.mjs --apply --wipe  # сначала чистит базу стейджа
 *
 * ⚠️ ЦЕНА: ~10 600 чтений боя (квота 50 000/сут) и ~10 600 записей в стейдж (квота 20 000/сут).
 *
 * Доступ: ключи ОБОИХ контуров берутся из `.env` (`NDIM_PROD_SA_B64` · `NDIM_STAGE_SA_B64`).
 * Ключей в файлах и в коде проект не держит — правило владельца 2026-08-15. Образец `.env.example`.
 * Выход: 0 — успех; 1 — прибор не смог гарантировать результат.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { serviceAccount } from '../lib/credentials.mjs';
import { CONTOURS } from '../lib/contours.mjs';

const arg = (name, fallback) => {
	const i = process.argv.indexOf(name);
	return i === -1 ? fallback : process.argv[i + 1];
};
const has = (name) => process.argv.includes(name);

const APPLY = has('--apply');
const WIPE = has('--wipe');
/*
 * 🔑 Умолчания — из РЕЕСТРА КОНТУРОВ (`bugs/132`). Здесь стояло `--prod-database '(default)'`, и
 * после переезда фазы 3 прибор читал бы базу, которой нет: `STATUS.md` зовёт запускать его как
 * есть, то есть первая же сессия получила бы пустой слепок вместо данных.
 */
const PROD_PROJECT = arg('--prod-project', CONTOURS.prod.project);
const PROD_DATABASE = arg('--prod-database', CONTOURS.prod.database);
const STAGE_PROJECT = arg('--stage-project', CONTOURS.stage.project);
const STAGE_DATABASE = arg('--stage-database', CONTOURS.stage.database);
const REPORT = arg('--out', 'test-results/stage-seed/report.json');

/**
 * Корневые коллекции, которые переносим целиком без изменения содержимого.
 *
 * 🔴 `dims` ЗДЕСЬ НЕТ НАМЕРЕННО — и это тот же капкан, что `bugs/130`. Групповой запрос по `dims`
 * (шаг 3) возвращает и КОРНЕВОЙ каталог, и оценки `points/{uid}/dims`. Первая редакция этого
 * прибора читала каталог ещё и здесь: результат был верным, а цена — 15 717 чтений вместо 10 605.
 * Ловушка повторилась в приборе, написанном через час после починки первой, — значит она в ИМЕНАХ
 * модели, а не во внимательности сессии.
 */
const VERBATIM_ROOTS = ['space'];
/** Корневые коллекции, которые НЕ переносим вовсе (с причиной — она печатается в отчёт). */
const SKIPPED_ROOTS = {
	ndimids: 'наследие 1.x; код 2.0 его не читает (только transform.ts как ИСТОЧНИК миграции)',
};
/** Подколлекции, которые читаем групповыми запросами. `privat` в списке НЕТ намеренно. */
const SUBCOLLECTIONS = ['profile', 'dims', 'daily', 'days'];

const prodApp = initializeApp({ credential: cert(serviceAccount('prod')), projectId: PROD_PROJECT }, 'prod');
const stageApp = initializeApp(
	{ credential: cert(serviceAccount('stage')), projectId: STAGE_PROJECT },
	'stage',
);
const prod = getFirestore(prodApp, PROD_DATABASE);
const stage = getFirestore(stageApp, STAGE_DATABASE);

/*
 * 🔴 ПРЕДОХРАНИТЕЛЬ: писать разрешено ТОЛЬКО в стейдж-контур.
 * Оба ключа лежат на одном диске, а перепутать аргументы — дело одной опечатки. Проверка стоит
 * ничего и закрывает единственный сценарий, у которого цена невосстановима: запись слепка поверх
 * боевой базы. Класс тот же, что стоп-правило сервера синхронизации «боевой ключ + чужая база = отказ».
 */
if (STAGE_PROJECT !== 'ndim-stage' || STAGE_DATABASE === '(default)') {
	console.error(`ОТКАЗ: цель записи «${STAGE_PROJECT}/${STAGE_DATABASE}» не является стейдж-контуром.`);
	process.exit(1);
}
if (PROD_PROJECT === STAGE_PROJECT) {
	console.error('ОТКАЗ: источник и цель — один проект.');
	process.exit(1);
}

// ── Карта личностей ──────────────────────────────────────────────────────────

const uidMap = new Map();
/** Новый uid: детерминированный, непрозрачный, без утечки порядка исходных. */
function stageUid(prodUid) {
	let mapped = uidMap.get(prodUid);
	if (!mapped) {
		mapped = `stage-${createHash('sha256').update(prodUid).digest('hex').slice(0, 20)}`;
		uidMap.set(prodUid, mapped);
	}
	return mapped;
}

/** Порядковый номер человека — только для синтетических имени и почты. */
const personNumber = new Map();
const numberOf = (prodUid) => {
	if (!personNumber.has(prodUid)) personNumber.set(prodUid, personNumber.size + 1);
	return String(personNumber.get(prodUid)).padStart(3, '0');
};

const localized = (ru, en) => ({ ru, en });

/**
 * Обезличивание бакета профиля — здесь и только здесь живёт слой личности.
 *
 * Что заменяется и почему:
 *   · `name`   — прямой идентификатор;
 *   · `about`  — свободный текст о себе: чаще всего именно там имена, города и контакты;
 *   · `avatar` — признак «фото есть»; на стейдже файлов нет, и `true` рисовал бы вечный лоадер;
 *   · `born.day` — точная дата рождения идентифицирует. Год и месяц остаются: возраст в продукте
 *     считается по ним, а отсутствующий день — ЗАКОННОЕ значение схемы («человек вправе указать
 *     только год»), то есть продукт этого случая не боится.
 * Что НЕ трогается: `gender` (не идентифицирует в отрыве от имени, а экраны его показывают).
 */
function anonymizeProfile(data, prodUid) {
	const n = numberOf(prodUid);
	const out = { ...data };
	if ('name' in out) {
		out.name = {
			first: localized(`Человек ${n}`, `Person ${n}`),
			middle: localized(null, null),
			last: localized(null, null),
			nick: localized(`user${n}`, `user${n}`),
		};
	}
	if ('about' in out) out.about = localized(null, null);
	if ('avatar' in out) out.avatar = false;
	if (out.born && typeof out.born === 'object') out.born = { ...out.born, day: null };
	return out;
}

// ── Чтение боя ───────────────────────────────────────────────────────────────

let reads = 0;
/** Плоский список «путь → данные» будущей записи. */
const planned = [];
const stats = new Map();
const bump = (template, by = 1) => stats.set(template, (stats.get(template) ?? 0) + by);

async function readRoot(name) {
	const snapshot = await prod.collection(name).get();
	reads += snapshot.size;
	return snapshot.docs;
}

console.log('\n═══ НАПОЛНЕНИЕ СТЕЙДЖА ОБЕЗЛИЧЕННЫМ СЛЕПКОМ БОЯ ═══');
console.log(`источник  ${PROD_PROJECT} / ${PROD_DATABASE}   (только чтение)`);
console.log(`цель      ${STAGE_PROJECT} / ${STAGE_DATABASE}`);
console.log(`режим     ${APPLY ? 'ЗАПИСЬ' : 'СУХОЙ ПРОГОН (пишет только отчёт)'}\n`);

// 1. Каталог и агрегаты — дословно.
for (const name of VERBATIM_ROOTS) {
	for (const doc of await readRoot(name)) {
		planned.push({ path: doc.ref.path, data: doc.data() });
		bump(`${name}/*`);
	}
	console.log(`дословно  ${name.padEnd(16, '.')} ${stats.get(`${name}/*`) ?? 0}`);
}

// 2. Люди: users, points, relations — ключи переписываются.
for (const doc of await readRoot('users')) {
	planned.push({ path: `users/${stageUid(doc.id)}`, data: doc.data() });
	bump('users/*');
}
for (const doc of await readRoot('points')) {
	planned.push({ path: `points/${stageUid(doc.id)}`, data: doc.data() });
	bump('points/*');
}
for (const doc of await readRoot('relations')) {
	const data = doc.data();
	// Строки топа ссылаются на чужие uid — карта обязана дойти и до них, иначе связи на стейдже
	// будут указывать на людей, которых там нет.
	const top = Array.isArray(data.top)
		? data.top.map((row) => (row && typeof row.uid === 'string' ? { ...row, uid: stageUid(row.uid) } : row))
		: data.top;
	planned.push({ path: `relations/${stageUid(doc.id)}`, data: { ...data, top } });
	bump('relations/*');
}
for (const doc of await readRoot('suggestions')) {
	const data = doc.data();
	planned.push({
		path: `suggestions/${doc.id}`,
		data: typeof data.authorUid === 'string' ? { ...data, authorUid: stageUid(data.authorUid) } : data,
	});
	bump('suggestions/*');
}
for (const doc of await readRoot('admins')) {
	planned.push({ path: `admins/${stageUid(doc.id)}`, data: doc.data() });
	bump('admins/*');
}
for (const [name, why] of Object.entries(SKIPPED_ROOTS)) {
	console.log(`ПРОПУСК   ${name.padEnd(16, '.')} — ${why}`);
}
console.log(
	`люди      users ${stats.get('users/*') ?? 0} · points ${stats.get('points/*') ?? 0} · ` +
		`relations ${stats.get('relations/*') ?? 0} · suggestions ${stats.get('suggestions/*') ?? 0} · ` +
		`admins ${stats.get('admins/*') ?? 0}`,
);

// 3. Подколлекции — групповыми запросами. `privat` не запрашивается вовсе: его не переносим,
//    и читать 331 документ с живыми секретами ради того, чтобы их выбросить, незачем.
for (const name of SUBCOLLECTIONS) {
	const snapshot = await prod.collectionGroup(name).get();
	reads += snapshot.size;
	for (const doc of snapshot.docs) {
		const segments = doc.ref.path.split('/');
		// Групповой запрос по `dims` приносит и КОРНЕВОЙ каталог (`bugs/130`) — берём его ЗДЕСЬ,
		// дословно, вместо отдельного чтения: те же документы, вдвое меньше чтений.
		if (segments.length === 2) {
			if (segments[0] === 'dims') {
				planned.push({ path: doc.ref.path, data: doc.data() });
				bump('dims/*');
			}
			continue;
		}
		const [root, ownerUid, sub, id] = segments;
		if (root === 'users' && sub === 'profile') {
			planned.push({
				path: `users/${stageUid(ownerUid)}/profile/${id}`,
				data: anonymizeProfile(doc.data(), ownerUid),
			});
			bump('users/*/profile/*');
		} else if (root === 'points' && sub === 'dims') {
			planned.push({ path: `points/${stageUid(ownerUid)}/dims/${id}`, data: doc.data() });
			bump('points/*/dims/*');
		} else if (root === 'space') {
			planned.push({ path: doc.ref.path, data: doc.data() });
			bump(`space/*/${sub}/*`);
		}
	}
	console.log(`группа    ${name.padEnd(16, '.')} ${snapshot.size}`);
}

// ── Предполётная проверка значений ───────────────────────────────────────────
//
// 🔴 ССЫЛКА НА ДОКУМЕНТ ПРИВЯЗАНА К СВОЕМУ ЭКЗЕМПЛЯРУ FIRESTORE. Если в боевых данных найдётся
// поле-`DocumentReference`, запись его в стейдж либо упадёт на середине пакета, либо сохранит
// путь, указывающий в БОЙ, — и стейдж перестанет быть замкнутым контуром (риск, названный в
// `plans/53`: «прогон на стейдже утёк в бой через данные»). Дешевле проверить заранее, чем
// разбирать наполовину записанную базу.
const exotic = new Map();
function scan(value, path, depth = 0) {
	if (value === null || value === undefined || depth > 8) return;
	if (Array.isArray(value)) {
		for (const item of value) scan(item, path, depth + 1);
		return;
	}
	if (typeof value !== 'object') return;
	const kind =
		typeof value.path === 'string' && value.firestore
			? 'DocumentReference'
			: value instanceof Buffer
				? 'Bytes'
				: typeof value.latitude === 'number' && typeof value.longitude === 'number'
					? 'GeoPoint'
					: null;
	if (kind) {
		if (!exotic.has(kind)) exotic.set(kind, { count: 0, example: path });
		exotic.get(kind).count += 1;
		return;
	}
	if (typeof value.toMillis === 'function') return; // Timestamp — переносится штатно
	for (const key of Object.keys(value)) scan(value[key], `${path}.${key}`, depth + 1);
}
for (const item of planned) scan(item.data, item.path);

if (exotic.size > 0) {
	console.log('\n⚠️ НАЙДЕНЫ ОСОБЫЕ ТИПЫ ЗНАЧЕНИЙ:');
	for (const [kind, info] of exotic) console.log(`   ${kind}: ${info.count} (например ${info.example})`);
}
if (exotic.has('DocumentReference')) {
	console.error(
		'\nОТКАЗ: в данных есть ссылки на документы боевого экземпляра. Записать их в стейдж нельзя —\n' +
			'они утащили бы стейдж обратно в бой. Нужен разбор и правило переноса для этих полей.',
	);
	process.exit(1);
}
console.log(`\nпредполётная проверка значений: особых типов ${exotic.size === 0 ? 'нет' : exotic.size}`);

// ── Запись в стейдж ──────────────────────────────────────────────────────────

/** Удаляет всё из базы стейджа. Только для стейджа — предохранитель выше это уже доказал. */
async function wipe() {
	console.log('\nОЧИСТКА базы стейджа…');
	let removed = 0;
	const roots = await stage.listCollections();
	for (const collection of roots) {
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const snapshot = await collection.limit(300).get();
			if (snapshot.empty) break;
			const batch = stage.batch();
			for (const doc of snapshot.docs) batch.delete(doc.ref);
			await batch.commit();
			removed += snapshot.size;
		}
	}
	// Подколлекции — теми же группами, что читаем в бою.
	for (const name of [...SUBCOLLECTIONS, 'privat']) {
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const snapshot = await stage.collectionGroup(name).limit(300).get();
			if (snapshot.empty) break;
			const batch = stage.batch();
			for (const doc of snapshot.docs) batch.delete(doc.ref);
			await batch.commit();
			removed += snapshot.size;
		}
	}
	console.log(`удалено документов: ${removed}`);
}

let written = 0;
if (APPLY) {
	if (WIPE) await wipe();
	console.log('\nЗАПИСЬ в стейдж…');
	const BATCH = 400; // потолок Firestore — 500; берём с запасом
	for (let i = 0; i < planned.length; i += BATCH) {
		const batch = stage.batch();
		for (const item of planned.slice(i, i + BATCH)) batch.set(stage.doc(item.path), item.data);
		await batch.commit();
		written += Math.min(BATCH, planned.length - i);
		process.stdout.write(`\r  записано ${written} / ${planned.length}`);
	}
	console.log('');
}

// ── Отчёт ────────────────────────────────────────────────────────────────────

const report = {
	takenAt: new Date().toISOString(),
	mode: APPLY ? 'apply' : 'dry-run',
	source: { project: PROD_PROJECT, database: PROD_DATABASE },
	target: { project: STAGE_PROJECT, database: STAGE_DATABASE },
	reads,
	planned: planned.length,
	written,
	people: uidMap.size,
	counts: Object.fromEntries([...stats.entries()].sort()),
	skipped: SKIPPED_ROOTS,
	// 🔴 Карта uid В ОТЧЁТ НЕ КЛАДЁТСЯ. Она и есть тот самый join боевых оценок с личностью,
	// ради устранения которого uid меняются; файл отчёта лежит в `test-results/` вне git, но
	// «вне git» — не то же самое, что «не существует».
	uidMapIncluded: false,
};
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, JSON.stringify(report, null, '\t'), 'utf8');

console.log('\n─── СВОДКА ───');
for (const [key, value] of [...stats.entries()].sort()) {
	console.log(`  ${key.padEnd(28, '.')} ${value}`);
}
console.log(`\nлюдей в карте ....... ${uidMap.size}`);
console.log(`документов к записи . ${planned.length}`);
console.log(`прочитано из боя .... ${reads}`);
console.log(`записано в стейдж ... ${APPLY ? written : '— (сухой прогон)'}`);
console.log(`отчёт ............... ${REPORT}`);
if (!APPLY) console.log('\nЭто СУХОЙ прогон. Чтобы записать: добавьте --apply');

process.exit(0);

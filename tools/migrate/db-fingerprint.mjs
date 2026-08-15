/**
 * ОТПЕЧАТОК БАЗЫ FIRESTORE — прибор фазы 0 эпика `plans/53` (STAGE-окружение и переезд баз).
 *
 * Зачем. Владелец поставил порог: «Перед миграцией ТРИ теста… **права на ошибку у нас нет, это
 * данные наших пользователей**». Судить миграцию «на глаз» нечем: 12 тысяч документов глазами не
 * сверяются. Отпечаток превращает базу в файл, который сравнивается с другим файлом побайтово.
 *
 * ЧТО ЭТО ТАКОЕ. Для каждого документа берётся ПУТЬ и SHA-256 от его данных, приведённых к
 * КАНОНИЧЕСКОМУ виду (ключи отсортированы, типы Firestore развёрнуты в устойчивое представление).
 * Отпечаток = карта «путь → хеш» + счётчики по коллекциям. Две базы идентичны тогда и только
 * тогда, когда их карты совпадают.
 *
 * 🔴 ПОЧЕМУ ХЕШИ, А НЕ ЗНАЧЕНИЯ. Репозиторий публичный, а в базе живут ПДн 94 человек. Хеш
 * доказывает совпадение и не раскрывает содержимого. Утечка ПДн здесь уже случалась (`bugs/01`),
 * второй раз она не должна пройти через прибор, написанный ради безопасности.
 *
 * ⚠️ ЦЕНА ПРОГОНА — ЧТЕНИЯ. Прибор читает КАЖДЫЙ документ базы (в бою это ~12 000). Бесплатная
 * квота — 50 000 чтений в сутки на проект, то есть четыре прогона в день безопасны, а десять —
 * уже нет. Прибор печатает счёт прочитанного, чтобы это было видно, а не подразумевалось.
 *
 * ⚠️ ЧЕГО ПРИБОР НЕ ВИДИТ. Firestore не отдаёт список подколлекций иначе как обходом документов,
 * поэтому подколлекции берутся ЗАПРОСАМИ ПО ГРУППЕ (`collectionGroup`) из списка известных имён —
 * а затем ОТДЕЛЬНАЯ ПРОВЕРКА обходит все корневые документы и требует, чтобы у них не нашлось ни
 * одной подколлекции вне этого списка. Без второй половины прибор молча пропускал бы данные,
 * о которых не знает, — ровно тот класс, что дал `bugs/108`/`109` («1.x знал о поле, 2.0 его не
 * узнал»).
 *
 * Запуск:
 *   node tools/migrate/db-fingerprint.mjs [--project ndim-space] [--database "(default)"] [--out ПУТЬ]
 *
 * Доступ: ключ сервисного аккаунта из `.env` (`NDIM_PROD_SA_B64` / `NDIM_STAGE_SA_B64`) —
 * контур выбирается по `--project`. Ключей в файлах и в коде проект не держит (`.env.example`).
 * Выход: 0 — отпечаток снят; 1 — прибор не смог гарантировать полноту.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { serviceAccount } from '../lib/credentials.mjs';

const arg = (name, fallback) => {
	const i = process.argv.indexOf(name);
	return i === -1 ? fallback : process.argv[i + 1];
};

const PROJECT_ID = arg('--project', 'ndim-space');
const DATABASE_ID = arg('--database', '(default)');
/** Контур выводится из проекта: ключи лежат в `.env` под именами контуров (`tools/lib/credentials.mjs`). */
const CONTOUR = PROJECT_ID === 'ndim-stage' ? 'stage' : 'prod';

/**
 * Известные подколлекции модели 2.0 — по одному имени на строку и с адресом канона.
 * Список ОБЯЗАН совпадать с реальностью: расхождение ловит проверка полноты ниже.
 */
const KNOWN_SUBCOLLECTIONS = [
	'profile', // users/{uid}/profile/{bucketId}      — бакеты видимости (firestore.rules:116)
	'groups', // users/{uid}/groups/{groupId}         — круги владельца (rules:150)
	'members', // users/{uid}/groups/{gid}/members/{uid}
	'audience', // users/{uid}/audience/{viewerUid}    — кто что видит (rules:166)
	'dims', // points/{uid}/dims/{dimId}              — ОЦЕНКИ, ось = документ (rules:233)
	'daily', // space/stats/daily/{date}              — снимки дней (rules:293)
	'days', // space/funnel/days/{date}               — воронка (rules:315)
	// 🔴 НАСЛЕДИЕ 1.x, найденное ЭТИМ ЖЕ прибором на первом прогоне 2026-08-15.
	// `users/{uid}/privat/{uid}` — 331 документ, поля `uid` · `privat_data` · `user_secret_key`.
	// `researches/02` звал подколлекцию «мёртвой заглушкой» (вывод из чтения кода 1.x); замер
	// уточнил: `privat_data` пуст у ВСЕХ 331, а `user_secret_key` — непустая строка в 30 знаков
	// у всех. Заглушка мёртвая, а секреты живые. Правила 2.0 о ней не знают вовсе — её закрывает
	// только финальный запрет `match /{document=**}`: клиент не прочтёт, Admin SDK прочтёт.
	// В отпечаток входит обязательно: МИГРАЦИЯ НИЧЕГО НЕ ЧИСТИТ (иначе сверка П1 не даст 100 %).
	'privat',
];

/*
 * Под ЭМУЛЯТОРОМ ключ не нужен и не запрашивается: эмулятор не проверяет учётные данные, а
 * требовать боевой секрет ради прогона стража (`verify-fingerprint.mjs`) значило бы привязать
 * тест к содержимому `.env`. Так же устроен и сервер синхронизации (`sync-server/index.mjs`).
 */
initializeApp(
	process.env.FIRESTORE_EMULATOR_HOST
		? { projectId: PROJECT_ID }
		: { credential: cert(serviceAccount(CONTOUR)), projectId: PROJECT_ID },
);

const db = getFirestore(DATABASE_ID);

let reads = 0;

/**
 * Канонический вид значения Firestore.
 *
 * Хеш обязан совпасть у ОДИНАКОВЫХ данных, приехавших разными путями (выгрузка/загрузка меняет
 * порядок ключей и представление типов). Поэтому: ключи сортируются, а особые типы —
 * отметка времени, ссылка, географическая точка, буфер байтов — разворачиваются в помеченную
 * строку. Без разворачивания `JSON.stringify` отдал бы `{}` и хеш совпал бы у РАЗНЫХ значений.
 */
function canonical(value) {
	if (value === null || value === undefined) return null;
	if (Array.isArray(value)) return value.map(canonical);
	if (typeof value === 'object') {
		// Отметка времени Firestore
		if (typeof value.toMillis === 'function') return `\u0000ts:${value.toMillis()}`;
		// Ссылка на документ
		if (typeof value.path === 'string' && value.firestore) return `\u0000ref:${value.path}`;
		// Географическая точка
		if (typeof value.latitude === 'number' && typeof value.longitude === 'number')
			return `\u0000geo:${value.latitude},${value.longitude}`;
		// Буфер байтов
		if (value instanceof Buffer) return `\u0000bytes:${value.toString('base64')}`;
		const out = {};
		for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
		return out;
	}
	if (typeof value === 'number' && !Number.isFinite(value)) return `\u0000num:${String(value)}`;
	return value;
}

const hashOf = (data) =>
	createHash('sha256').update(JSON.stringify(canonical(data))).digest('hex').slice(0, 16);

/** Карта «путь документа → хеш данных» и счётчики по коллекциям. */
const docs = new Map();
const counts = new Map();

function record(path, data) {
	// 🔴 СЧЁТЧИК ИДЕМПОТЕНТЕН ПО ПУТИ (`bugs/130`). Прежняя редакция инкрементировала его на
	// КАЖДЫЙ вызов, а карта `docs` при этом дедуплицировала, — и один документ, прочитанный
	// дважды, давал верное заголовочное число при вдвое завышенной разбивке. Класс дефекта:
	// два представления одних данных, из которых дедуплицирует только одно. Проверка ДО записи
	// в карту — иначе `docs.set` уже стёр бы признак «видели раньше».
	const seen = docs.has(path);
	docs.set(path, hashOf(data));
	if (seen) return;
	// Ключ счётчика — ШАБЛОН пути (идентификаторы заменены на `*`), иначе счётчиков было бы
	// столько же, сколько документов, и сводка перестала бы быть сводкой.
	const template = path
		.split('/')
		.map((part, i) => (i % 2 === 0 ? part : '*'))
		.join('/');
	counts.set(template, (counts.get(template) ?? 0) + 1);
}

console.log(`\n═══ ОТПЕЧАТОК БАЗЫ ═══`);
console.log(`проект   ${PROJECT_ID}`);
console.log(`база     ${DATABASE_ID}\n`);

// ── 1. Корневые коллекции целиком ────────────────────────────────────────────
const roots = await db.listCollections();
if (roots.length === 0) {
	console.log('база ПУСТА — корневых коллекций нет');
}
for (const collection of roots) {
	// 🔴 КОРНЕВУЮ КОЛЛЕКЦИЮ, ЧЬЁ ИМЯ ЕСТЬ В СПИСКЕ ПОДКОЛЛЕКЦИЙ, ЗДЕСЬ НЕ ЧИТАЕМ (`bugs/130`).
	// `collectionGroup(name)` матчит КАЖДУЮ коллекцию с этим именем, включая корневую, — то есть
	// шаг 2 вернёт её сам. У нас такое имя ровно одно и оно неизбежно: `dims` носят и корневой
	// каталог измерений, и подколлекция оценок `points/{uid}/dims`. Прежняя редакция читала
	// каталог дважды: 5112 лишних чтений на прогон — 10 % суточной бесплатной квоты.
	// Пропуск НЕ теряет данные: доказано замером (сводка давала 10 224 = 2 × 5112, что достижимо,
	// только если групповой запрос вернул все 5112 корневых документов).
	if (KNOWN_SUBCOLLECTIONS.includes(collection.id)) {
		console.log(`корневая ${collection.id.padEnd(20, '.')} → читает шаг 2 (одноимённая группа)`);
		continue;
	}
	const snapshot = await collection.get();
	reads += snapshot.size;
	for (const doc of snapshot.docs) record(doc.ref.path, doc.data());
	console.log(`корневая ${collection.id.padEnd(20, '.')} ${snapshot.size}`);
}

// ── 2. Подколлекции — запросами по группе ────────────────────────────────────
for (const name of KNOWN_SUBCOLLECTIONS) {
	const snapshot = await db.collectionGroup(name).get();
	reads += snapshot.size;
	for (const doc of snapshot.docs) record(doc.ref.path, doc.data());
	console.log(`группа   ${name.padEnd(20, '.')} ${snapshot.size}`);
}

// ── 3. ПРОВЕРКА ПОЛНОТЫ: нет ли подколлекции, о которой прибор не знает ───────
//
// Обходятся ВСЕ документы, у которых подколлекции вообще могут быть (корневые и те, что уже
// найдены группами). Без этой проверки отпечаток был бы зелёным при потерянных данных.
// 🔴 ЦЕНА ЭТОЙ ПРОВЕРКИ — ВРЕМЯ, и первая редакция её недооценила: `listCollections` это отдельный
// поход в сеть НА КАЖДЫЙ документ, и обход всех 4800 документов людей шёл больше тринадцати минут,
// пока его не остановили. Поэтому обход устроен по слоям модели, а не по всей базе подряд:
//   · документы КОРНЕВЫХ коллекций — там, где модель 2.0 и вешает подколлекции, — целиком
//     (пока коллекция мельче потолка) либо выборкой;
//   · документы уже найденных ПОДколлекций — только выборкой: по модели детей у них нет,
//     и проверка ищет здесь опровержение, а не пересчитывает известное.
// Граница названа вслух и уезжает в отчёт: честная выборка лучше молчаливого «обошли всё».
const FULL_PROBE_LIMIT = 200; // корневая коллекция мельче этого обходится целиком
const SAMPLE_SIZE = 25; // из остальных берётся столько документов

console.log('\nпроверка полноты: ищу подколлекции вне списка известных…');
const byCollection = new Map();
for (const path of docs.keys()) {
	const collection = path.split('/').slice(0, -1).join('/');
	if (!byCollection.has(collection)) byCollection.set(collection, []);
	byCollection.get(collection).push(path);
}

const unknown = new Map();
const probePlan = [];
let probed = 0;
for (const [collection, paths] of byCollection) {
	// Корневая коллекция — один сегмент пути (`users`), вложенная — три и больше
	// (`users/{uid}/profile`).
	const isRoot = collection.split('/').length === 1;
	const full = isRoot && paths.length <= FULL_PROBE_LIMIT;
	const chosen = full ? paths : paths.slice(0, SAMPLE_SIZE);
	probePlan.push({ collection, total: paths.length, probed: chosen.length, full });
	for (const path of chosen) {
		const found = await db.doc(path).listCollections();
		probed += 1;
		for (const sub of found) {
			if (KNOWN_SUBCOLLECTIONS.includes(sub.id)) continue;
			unknown.set(sub.id, (unknown.get(sub.id) ?? 0) + 1);
		}
	}
}
for (const p of probePlan) {
	console.log(
		`  ${p.collection.padEnd(34, '.')} ${p.probed}/${p.total} ${p.full ? '(целиком)' : '(ВЫБОРКА)'}`,
	);
}
console.log(`обойдено документов: ${probed}`);

// ── 4. Итог ──────────────────────────────────────────────────────────────────
const fingerprint = {
	project: PROJECT_ID,
	database: DATABASE_ID,
	takenAt: new Date().toISOString(),
	documents: docs.size,
	reads,
	counts: Object.fromEntries([...counts.entries()].sort()),
	// Граница проверки полноты записывается В ОТПЕЧАТОК: будущая сессия обязана видеть, что
	// обошлось целиком, а что выборкой, — иначе «полнота подтверждена» читается сильнее, чем есть.
	completenessProbe: probePlan,
	// Карта отсортирована: файл отпечатка обязан быть устойчивым между прогонами, иначе
	// его нельзя сравнить обычным diff.
	docs: Object.fromEntries([...docs.entries()].sort()),
};

const safeDb = DATABASE_ID.replace(/[()]/g, '');
const out = arg('--out', `test-results/db-fingerprint/${PROJECT_ID}--${safeDb}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(fingerprint, null, '\t'), 'utf8');

console.log('\n─── СВОДКА ───');
for (const [template, n] of Object.entries(fingerprint.counts)) {
	console.log(`  ${template.padEnd(38, '.')} ${n}`);
}
console.log(`\nдокументов ВСЕГО ....................... ${docs.size}`);
console.log(`чтений израсходовано ................... ${reads} (бесплатная квота 50 000/сут)`);
console.log(`отпечаток ............................. ${out}`);

if (unknown.size > 0) {
	console.error('\n🔴 НАЙДЕНЫ НЕИЗВЕСТНЫЕ ПОДКОЛЛЕКЦИИ — отпечаток НЕПОЛОН:');
	for (const [id, n] of unknown) console.error(`   «${id}» у ${n} документов`);
	console.error('   Лечение: внести имя в KNOWN_SUBCOLLECTIONS и снять отпечаток заново.');
	process.exit(1);
}
console.log('\n✅ полнота подтверждена: подколлекций вне списка известных нет');

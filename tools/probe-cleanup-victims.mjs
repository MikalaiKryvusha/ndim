/**
 * ПРИБОР СЧЁТА БУДУЩИХ ЖЕРТВ УБОРКИ (не страж) — «скольких коснётся, если выкатить `plans/63`».
 *
 * 🔴 ЗАЧЕМ, И ЭТО НЕ ЛЮБОПЫТСТВО. Порция 2 выката сервера синхронизации (`plans/85`) привозит в
 * бой уборку гостей — код, который **УДАЛЯЕТ АККАУНТЫ**. Он ни минуты не работал в бою, а в бою
 * лежат данные живых людей, накопленные месяцами. Выкатывать удаление, не зная числа, — это
 * «наверное, немного» вместо замера, и `PHILOSOPHY.md` такое запрещает прямо.
 *
 * Прибор отвечает ОДНИМ числом на один вопрос: **сколько документов снесёт первый же полный
 * проход после выката** — и называет их поимённо, чтобы решение владельца было информированным.
 *
 * ⛔ ПРИБОР ТОЛЬКО ЧИТАЕТ. Ни одной записи, ни одного удаления. Читает `points`, `pairs` и
 * список учёток Auth; сверяет с `GUEST_TTL_DAYS` продукта, а не со своим представлением о сроке.
 *
 * 🔑 ПОЧЕМУ СРОК БЕРЁТСЯ ИЗ `schema.ts`, А НЕ КОНСТАНТОЙ ЗДЕСЬ: пара «прибор ↔ продукт» иначе
 * разъедется молча, и прибор начнёт успокаивать числом, которого продукт не знает (`DRY`).
 *
 * Запуск:
 *   node tools/probe-cleanup-victims.mjs --contour prod
 *   node tools/probe-cleanup-victims.mjs --contour stage
 *
 * Код возврата: 0 — посчитано · 1 — доступа нет либо контур не назван.
 */
import { pathToFileURL } from 'node:url';

import { CONTOURS } from './lib/contours.mjs';
import { serviceAccount } from './lib/credentials.mjs';
import { loadEnv } from './lib/env.mjs';
import { GUEST_TTL_DAYS } from '../src/lib/model/schema.ts';

const довод = (имя, умолчание = null) => {
	const i = process.argv.indexOf(имя);
	return i === -1 ? умолчание : process.argv[i + 1];
};

const СУТКИ = 24 * 60 * 60 * 1000;

/** Возраст в сутках с точностью до десятой — для человека, а не для машины. */
const суток = (мс) => (мс / СУТКИ).toFixed(1);

async function главная() {
	const контур = довод('--contour');
	if (!контур || !CONTOURS[контур]) {
		console.error(`🔴 контур не назван либо неизвестен; известные: ${Object.keys(CONTOURS).join(', ')}`);
		return 1;
	}

	loadEnv();
	const ключ = serviceAccount(контур);
	const { initializeApp, cert } = await import('firebase-admin/app');
	const { getFirestore } = await import('firebase-admin/firestore');
	const { getAuth } = await import('firebase-admin/auth');

	const app = initializeApp({ credential: cert(ключ), projectId: CONTOURS[контур].project }, `victims-${Date.now()}`);
	const db = getFirestore(app, CONTOURS[контур].database);
	const auth = getAuth(app);

	const сейчас = Date.now();
	const порог = GUEST_TTL_DAYS * СУТКИ;

	console.log(`СКОЛЬКИХ КОСНЁТСЯ УБОРКА · контур ${CONTOURS[контур].title} · база ${CONTOURS[контур].database}`);
	console.log(`  срок жизни гостя из продукта (schema.ts): ${GUEST_TTL_DAYS} дн.`);
	console.log(`  «сейчас»: ${new Date(сейчас).toISOString()}\n`);

	// ── ТОЧКИ ────────────────────────────────────────────────────────────────────────────
	const точки = await db.collection('points').get();
	const гости = [];
	let жителей = 0;
	for (const док of точки.docs) {
		const д = док.data();
		// 🔴 Поле именно `guest` — так ищет сам сервер (`index.mjs:923`). Первая редакция
		// спрашивала `isGuest`/`anonymous` и давала «гостей 0» при любом их числе.
		const гость = д.guest === true;
		if (!гость) { жителей += 1; continue; }
		const рождён = д.bornAt?.toMillis?.() ?? d_ms(д.bornAt) ?? d_ms(д.createdAt);
		гости.push({ id: док.id, рождён, возраст: рождён ? сейчас - рождён : null });
	}
	const истёкшие = гости.filter((г) => г.возраст !== null && г.возраст > порог);
	const безДаты = гости.filter((г) => г.возраст === null);

	console.log(`ТОЧКИ: всего ${точки.size} · жителей ${жителей} · гостей ${гости.length}`);
	console.log(`  🔴 ГОСТЕЙ ПОД СНОС (старше ${GUEST_TTL_DAYS} дн.): ${истёкшие.length}`);
	for (const г of истёкшие.slice(0, 20)) console.log(`     · ${г.id} — возраст ${суток(г.возраст)} дн.`);
	if (истёкшие.length > 20) console.log(`     … и ещё ${истёкшие.length - 20}`);
	if (безДаты.length) {
		console.log(`  ⚠️ гостей БЕЗ даты рождения: ${безДаты.length} — их судьбу решает сам код уборки, прибор не гадает`);
		for (const г of безДаты.slice(0, 10)) console.log(`     · ${г.id}`);
	}

	// ── ПАРЫ ─────────────────────────────────────────────────────────────────────────────
	const живые = new Set(точки.docs.map((д) => д.id));
	const пары = await db.collection('pairs').get();
	const осиротевшие = [];
	for (const док of пары.docs) {
		const д = док.data();
		const участники = д.members ?? d_members(д);
		if (!Array.isArray(участники) || участники.length === 0) { осиротевшие.push({ id: док.id, почему: 'нет участников в документе' }); continue; }
		if (!участники.some((uid) => живые.has(uid))) осиротевшие.push({ id: док.id, почему: 'ни один участник не жив' });
	}
	console.log(`\nПАРЫ: всего ${пары.size}`);
	console.log(`  🔴 ПАР ПОД СНОС/ОБЕЗЛИЧИВАНИЕ: ${осиротевшие.length}`);
	for (const п of осиротевшие.slice(0, 20)) console.log(`     · ${п.id} — ${п.почему}`);

	// ── УЧЁТКИ AUTH ──────────────────────────────────────────────────────────────────────
	// 🔑 Уборка `plans/63` берёт кандидатов ИЗ AUTH (шаг 2, решение №010 Р3), поэтому число
	// анонимных учёток без точки — это тоже будущие жертвы, и их в Firestore не видно.
	let анонимов = 0;
	let анонимовБезТочки = 0;
	const истёкшиеAuth = [];
	let страница = await auth.listUsers(1000);
	for (;;) {
		for (const у of страница.users) {
			const аноним = у.providerData.length === 0;
			if (!аноним) continue;
			анонимов += 1;
			if (!живые.has(у.uid)) анонимовБезТочки += 1;
			// Кандидатов уборка берёт ИЗ AUTH по `creationTime` (№0010 Р3) — судим тем же законом.
			const рождёнAuth = Date.parse(у.metadata.creationTime);
			if (Number.isFinite(рождёнAuth) && сейчас - рождёнAuth > порог) истёкшиеAuth.push({ uid: у.uid, возраст: сейчас - рождёнAuth });
		}
		if (!страница.pageToken) break;
		страница = await auth.listUsers(1000, страница.pageToken);
	}
	console.log(`\nУЧЁТКИ AUTH: анонимных ${анонимов} · из них БЕЗ точки в базе ${анонимовБезТочки}`);

	console.log(`\n📌 ИТОГ ОДНОЙ СТРОКОЙ: первый полный проход после выката тронет`);
	console.log(`   учёток из Auth ${истёкшиеAuth.length} · гостевых точек без учётки ${истёкшие.length} · пар ${осиротевшие.length}.`);
	console.log(`⛔ Прибор ничего не удалял и не писал — это ЗАМЕР, а не уборка.`);
	return 0;
}

/** Дата из чего угодно: Timestamp, число, строка. Не выдумывает — не понял, вернул null. */
function d_ms(значение) {
	if (значение == null) return null;
	if (typeof значение === 'number') return значение;
	if (typeof значение?.toMillis === 'function') return значение.toMillis();
	const разобрано = Date.parse(String(значение));
	return Number.isNaN(разобрано) ? null : разобрано;
}

/** Участники пары — поля у разных поколений документов назывались по-разному. */
function d_members(данные) {
	if (Array.isArray(данные.uids)) return данные.uids;
	if (данные.a && данные.b) return [данные.a, данные.b];
	return [];
}

// Входной предохранитель: импорт не должен ходить в боевую базу (`plans/79`).
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	process.exit(await главная());
}

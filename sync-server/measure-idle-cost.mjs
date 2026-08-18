/**
 * ПРИБОР ЗАМЕРА (не страж) — сколько стоит ОДИН ТАКТ сервера синхронизации: чтений и записей.
 *
 * Фаза 1 эпика 60 (`plans/61`, метаплан `plans/60`, разведка `researches/43`). Ворота всего
 * эпика: пока прибора нет, «стало дешевле» остаётся моим утверждением, а не показанием.
 *
 * ⚠️ ЖИВЁТ В `sync-server/`, А НЕ В `tools/` — у сервера синхронизации СВОЙ `node_modules` с
 * собственной копией `firebase-admin`. Скрипт из `tools/` получил бы ДРУГОЙ экземпляр
 * библиотеки: его обёртки легли бы на чужие прототипы и не увидели бы ни одного обращения.
 * Грабли оплачены соседним прибором (`measure-dims-index.mjs`, его шапка).
 *
 * ⚠️ ЭТО ПРИБОР, А НЕ СТРАЖ. Он печатает числа и ничего не заваливает. Страж придёт в фазе 3,
 * когда будет что стеречь, и обязан покраснеть на числах, напечатанных здесь.
 *
 * Запуск (СВОЙ проект эмулятора — чтобы не мешать чужим замерам):
 *   npx firebase emulators:exec --only firestore --project demo-ndim-idle "node sync-server/measure-idle-cost.mjs"
 *
 * ── ГДЕ ПОСТАВЛЕНЫ СЧЁТЧИКИ, И ПОЧЕМУ ИМЕННО ТАМ ────────────────────────────────────────────
 *
 * Наивная обёртка «посчитать `DocumentReference.set` и заодно `WriteBatch.commit`» ДВОИТ числа,
 * и это не догадка, а чтение библиотеки (`@google-cloud/firestore`):
 *
 *   · `DocumentReference.set/update/delete/create` внутри создаёт `WriteBatch`, кладёт в него
 *     одну операцию и коммитит (`reference/document-reference.js:341`);
 *   · `DocumentReference.get` внутри зовёт `Firestore.getAll(this)`
 *     (`reference/document-reference.js:180`);
 *   · `Transaction` держит собственный `WriteBatch` и коммитит его ПРИВАТНЫМ `_commit`, мимо
 *     публичного `commit` (`transaction.js:329`).
 *
 * Поэтому счётчики стоят на УЗКИХ МЕСТАХ, через которые проходит всё, и каждое обращение
 * считается РОВНО ОДИН РАЗ:
 *
 *   ЧТЕНИЯ  — `Query.prototype.get` (запросы; `CollectionReference` и `CollectionGroup`
 *             наследуют его и своего `get` не имеют), `Firestore.prototype.getAll` (чтение по
 *             ссылке — сюда стекается и `DocumentReference.get`), `AggregateQuery.get`
 *             (перехватывается лениво через `Query.count`/`Query.aggregate`),
 *             `CollectionReference.listDocuments`.
 *   ЗАПИСИ  — `WriteBatch.prototype._commit`, единственное место, через которое проходят и
 *             одиночная запись, и батч, и транзакция.
 *
 * 🔴 `_commit` — приватный метод библиотеки, и это осознанный риск: смена версии может его
 * переименовать. Гашение — КОНТРОЛЬНЫЙ СЛУЧАЙ ниже: он меряет заведомо известное, и если
 * узкое место уедет, прибор скажет об этом первой же строкой, а не соврёт молча.
 *
 * ── ПРАВИЛА БИЛЛИНГА ЗАШИТЫ В ПРИБОР, А НЕ В ГОЛОВУ ─────────────────────────────────────────
 *
 *   1. Запрос, вернувший НОЛЬ документов, всё равно стоит ОДНО чтение → `Math.max(1, size)`.
 *      Без этого прибор показал бы «0 чтений» там, где Google берёт 1, и вся фаза 3 была бы
 *      измерена неверно: холостой такт — это ровно такой запрос.
 *   2. Агрегат (`count()`) — одно чтение на каждую 1000 совпавших записей индекса, минимум 1.
 *      Для боевого каталога 5121 это 6 — то самое число из `bugs/146`.
 *   3. Батч стоит столько записей, сколько в нём операций, а не одну.
 *
 * ── ЧТО ПРИБОР ПОКАЗАЛ 2026-08-18, И ЧЕМ ДОКАЗАНО, ЧТО СТРЕЛКА ЖИВАЯ ────────────────────────
 *
 * Контрольный случай сошёлся с первого запуска: чтений 2, записей 4 — как и ждал `plans/61`.
 *
 *   · ПРОГРЕВ (такт 1, пустое Пространство): 15 чтений + 5 записей. В цену простоя не идёт.
 *   · ХОЛОСТОЙ ТАКТ (такты 2–4): **1 чтение + 1 запись**, одинаково во всех трёх. Чтение — это
 *     `запрос points (вернулось 0)`, запись — `space/server` (сердцебиение). Совпало с
 *     расчётом разведки `researches/43` — но теперь это ПОКАЗАНИЕ, а не вывод из чтения кода.
 *   · В СУТКИ при такте 60 с: 1440 чтений (2,9 % квоты) + 1440 записей (7,2 %). При часовом
 *     такте — 24 и 24 (0,0 % и 0,1 %).
 *
 * 🔬 МУТАЦИЯ (шаг 3 плана), потому что прибор, всегда печатающий одно и то же, неотличим от
 * прибора, который ничего не меряет. В холостую ветку `runCycle` временно вписан один лишний
 * `db.doc('space/server').get()`:
 *
 *   до мутации  — чтений 1, записей 1
 *   с мутацией  — чтений 2, записей 1   ← ровно +1, и прибор НАЗВАЛ виновника отдельной
 *                                          строкой `документ space/server — чтений 1`
 *   после отката — чтений 1, записей 1
 *
 * ⚠️ ЧЕСТНО О ДОПУЩЕНИИ: `listDocuments` считается как `Math.max(1, вернулось)`. По правилам
 * биллинга это чтение имён документов, и подтверждения первоисточником у меня НЕТ. Строка
 * помечена в выводе звёздочкой, чтобы допущение не выдавало себя за замер. В холостом такте
 * `listDocuments` не участвует вовсе — он живёт в суточной уборке.
 */

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	throw new Error(
		'FIRESTORE_EMULATOR_HOST не задан. Запускай через:\n' +
			'  npx firebase emulators:exec --only firestore --project demo-ndim-idle "node sync-server/measure-idle-cost.mjs"',
	);
}

// СВОЙ проект в эмуляторе: прибор сеет и чистит базу, мешать чужим замерам он не должен.
process.env.FIREBASE_PROJECT_ID = 'demo-ndim-idle-cost';
// Тихий период не должен прятать работу от прибора — на стенде его и так снимают в ноль.
process.env.SYNC_QUIET_SECONDS = '0';

// ── СЧЁТЧИКИ. Ставим ДО импорта index.mjs — сервер синхронизации должен родиться уже под ними ──

const firestore = await import('firebase-admin/firestore');

/** Текущее окно замера. `null` — не меряем (сев, уборка, подготовка контрольного случая). */
let window = null;

function tally(kind, amount, what) {
	if (window === null) return;
	window[kind] += amount;
	const row = window.rows.get(what) ?? { reads: 0, writes: 0, calls: 0 };
	row[kind] += amount;
	row.calls += 1;
	window.rows.set(what, row);
}

/** Открывает окно замера и возвращает функцию закрытия со снимком. */
function measure() {
	window = { reads: 0, writes: 0, rows: new Map() };
	return () => {
		const snapshot = window;
		window = null;
		return snapshot;
	};
}

/** Одно чтение на каждую 1000 совпавших записей индекса, минимум 1 (правило 2). */
const aggregateReads = (matched) => Math.max(1, Math.ceil(matched / 1000));

function wrap(owner, name, make) {
	const original = owner?.[name];
	if (typeof original !== 'function') return false;
	owner[name] = make(original);
	return true;
}

const { Query, Firestore, WriteBatch, CollectionReference } = firestore;

// ЧТЕНИЯ — запрос. `Math.max(1, size)`: пустой запрос тоже стоит чтение (правило 1).
wrap(Query.prototype, 'get', (original) =>
	async function (...args) {
		const snapshot = await original.apply(this, args);
		const path = this._queryOptions?.collectionId ?? 'запрос';
		tally('reads', Math.max(1, snapshot.size), `запрос ${path} (вернулось ${snapshot.size})`);
		return snapshot;
	},
);

// ЧТЕНИЯ — по ссылке. Сюда стекается и `DocumentReference.get`, и `Transaction.getAll`.
wrap(Firestore.prototype, 'getAll', (original) =>
	async function (...args) {
		const refs = args.filter((a) => a && typeof a === 'object' && typeof a.path === 'string');
		const results = await original.apply(this, args);
		const what =
			refs.length === 1 ? `документ ${refs[0].path}` : `документов по ссылке — ${refs.length}`;
		tally('reads', Math.max(1, refs.length), what);
		return results;
	},
);

// ЧТЕНИЯ — агрегат. Класс AggregateQuery библиотека наружу НЕ экспортирует, поэтому его
// прототип берём лениво — у первого же объекта, который вернёт `count()`/`aggregate()`.
let aggregatePatched = false;
function patchAggregate(aggregateQuery) {
	if (aggregatePatched || !aggregateQuery) return aggregateQuery;
	const proto = Object.getPrototypeOf(aggregateQuery);
	aggregatePatched = wrap(proto, 'get', (original) =>
		async function (...args) {
			const snapshot = await original.apply(this, args);
			const matched = Number(snapshot.data()?.count ?? 0);
			tally('reads', aggregateReads(matched), `агрегат count() (совпало ${matched})`);
			return snapshot;
		},
	);
	return aggregateQuery;
}
for (const name of ['count', 'aggregate']) {
	wrap(Query.prototype, name, (original) =>
		function (...args) {
			return patchAggregate(original.apply(this, args));
		},
	);
}

// ЧТЕНИЯ — перечисление документов. Допущение, помечено звёздочкой (см. шапку).
wrap(CollectionReference.prototype, 'listDocuments', (original) =>
	async function (...args) {
		const refs = await original.apply(this, args);
		tally('reads', Math.max(1, refs.length), `listDocuments ${this.path} (${refs.length}) *`);
		return refs;
	},
);

// ЗАПИСИ — единственное узкое место. Операции копим на самом батче, считаем на коммите.
const OPS = Symbol('операции батча');
for (const name of ['set', 'update', 'delete', 'create']) {
	wrap(WriteBatch.prototype, name, (original) =>
		function (documentRef, ...rest) {
			(this[OPS] ??= []).push(documentRef?.path ?? '?');
			return original.call(this, documentRef, ...rest);
		},
	);
}
const commitHook = wrap(WriteBatch.prototype, '_commit', (original) =>
	async function (...args) {
		const ops = this[OPS] ?? [];
		const result = await original.apply(this, args);
		for (const path of ops) tally('writes', 1, `запись ${path}`);
		this[OPS] = [];
		return result;
	},
);

// ── Импорт сервера синхронизации — уже под счётчиками ────────────────────────────────────────

const { runCycle } = await import('./index.mjs');
const { getFirestore } = await import('firebase-admin/firestore');
const db = getFirestore();

function head(title) {
	console.log(`\n${'═'.repeat(78)}\n  ${title}\n${'═'.repeat(78)}`);
}

function printRows(snapshot) {
	const rows = [...snapshot.rows.entries()].sort(
		(a, b) => b[1].reads + b[1].writes - (a[1].reads + a[1].writes),
	);
	for (const [what, row] of rows) {
		const parts = [];
		if (row.reads) parts.push(`чтений ${row.reads}`);
		if (row.writes) parts.push(`записей ${row.writes}`);
		console.log(`      · ${what} — ${parts.join(', ')}`);
	}
}

/** Полностью очищает базу замера — прибор обязан начинать с известного состояния. */
async function wipe() {
	for (const path of [
		'dims',
		'points',
		'relations',
		'users',
		'space',
		'space/stats/daily',
		'control',
		'control_write',
		'control_batch',
	]) {
		const snapshot = await db.collection(path).get();
		await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
	}
}

// ── КОНТРОЛЬНЫЙ СЛУЧАЙ. Прибор сначала меряет ЗАВЕДОМО ИЗВЕСТНОЕ ────────────────────────────
// Прибор, не проверенный на известном, меряет себя, а не продукт.

head('КОНТРОЛЬНЫЙ СЛУЧАЙ — прибор меряет заведомо известное');

if (!commitHook) {
	console.log('  🔴 СЧЁТЧИК ЗАПИСЕЙ НЕ ВСТАЛ: `WriteBatch.prototype._commit` не найден.');
	console.log('     Библиотека переименовала узкое место — правь прибор, числам ниже не верь.');
}

await wipe();

// Сев — ВНЕ окна замера: двенадцать записей ради агрегата не должны попасть в контрольные числа.
{
	const batch = db.batch();
	for (let i = 0; i < 12; i++) batch.set(db.doc(`control/doc-${i}`), { i });
	await batch.commit();
}

const closeControl = measure();
await db.collection('control_empty').where('i', '==', 999).get(); // пустой запрос → 1 чтение
await db.doc('control_write/one').set({ ok: true }); //                             → 1 запись
{
	const batch = db.batch(); //                                                      → 3 записи
	for (let i = 0; i < 3; i++) batch.set(db.doc(`control_batch/doc-${i}`), { i });
	await batch.commit();
}
await db.collection('control').count().get(); //         агрегат по 12 документам → 1 чтение
const control = closeControl();

console.log('  ожидание плана: чтений 2, записей 4');
console.log(`  прибор:         чтений ${control.reads}, записей ${control.writes}`);
printRows(control);
const controlOk = control.reads === 2 && control.writes === 4;
console.log(
	controlOk
		? '\n  ✅ КОНТРОЛЬ СОШЁЛСЯ. Числам ниже можно верить.'
		: '\n  🔴 КОНТРОЛЬ НЕ СОШЁЛСЯ — чиним ПРИБОР, а не продукт. Числам ниже не верить.',
);

// ── ЗАМЕР ХОЛОСТОГО ТАКТА ────────────────────────────────────────────────────────────────────

head('ЗАМЕР — ХОЛОСТОЙ ТАКТ НА ПУСТОМ ПРОСТРАНСТВЕ (обновлённых NDim ID нет)');

await wipe();

/** Сколько тактов гоняем. Первый — прогрев, остальные — простой; три, чтобы постоянство было ВИДНО. */
const TICKS = 4;

const ticks = [];
for (let i = 1; i <= TICKS; i++) {
	const close = measure();
	await runCycle();
	ticks.push({ i, ...close() });
}

console.log('\n  такт │ чтений │ записей │ из чего сложилось');
console.log('  ─────┼────────┼─────────┼───────────────────');
for (const tick of ticks) {
	const label = tick.i === 1 ? '1 🔥' : String(tick.i);
	console.log(
		`  ${label.padEnd(4)} │ ${String(tick.reads).padStart(6)} │ ${String(tick.writes).padStart(7)} │`,
	);
	printRows(tick);
}
console.log('\n  🔥 такт 1 — ПРОГРЕВ КЭША (`pointsCache === null` → полный проход). В цену простоя');
console.log('     он не идёт: прогрев неизбежен при старте процесса и случается раз за жизнь.');

const idle = ticks.slice(1);
const same = idle.every((t) => t.reads === idle[0].reads && t.writes === idle[0].writes);
const reads = idle[0]?.reads ?? 0;
const writes = idle[0]?.writes ?? 0;

console.log(
	same
		? `\n  👉 ХОЛОСТОЙ ТАКТ СТОИТ: чтений ${reads}, записей ${writes} — одинаково во всех ${idle.length} тактах.`
		: '\n  ⚠️ ТАКТЫ РАЗНЫЕ — простой не постоянен. Это находка, а не помеха: разбирать до фазы 3.',
);
console.log(
	reads === 1 && writes === 1
		? '     Совпало с ожиданием разведки (`researches/43`): 1 чтение + 1 запись.'
		: '     🔴 РАЗОШЛОСЬ С РАЗВЕДКОЙ (ждали 1 чтение + 1 запись). Прав ПРИБОР — правим разведку.',
);

// ── ПЕРЕСЧЁТ В СУТКИ ─────────────────────────────────────────────────────────────────────────

head('ЦЕНА ПРОСТОЯ В СУТКИ — сегодняшний такт против часового');

/** Суточные квоты бесплатного плана Firestore (`researches/43`). */
const QUOTA = { reads: 50_000, writes: 20_000 };

const perDay = (seconds) => Math.round((24 * 60 * 60) / seconds);
const share = (n, of) => `${((n / of) * 100).toFixed(1)} %`;

console.log('\n  такт      │ тактов в сутки │ чтений в сутки │ записей в сутки │ доля квоты');
console.log('  ──────────┼────────────────┼────────────────┼─────────────────┼────────────');
for (const [label, seconds] of [
	['60 с', 60],
	['1 час', 3600],
]) {
	const ticksPerDay = perDay(seconds);
	const r = ticksPerDay * reads;
	const w = ticksPerDay * writes;
	console.log(
		`  ${label.padEnd(9)} │ ${String(ticksPerDay).padStart(14)} │ ${String(r).padStart(14)} │ ` +
			`${String(w).padStart(15)} │ чт ${share(r, QUOTA.reads)}, зп ${share(w, QUOTA.writes)}`,
	);
}

console.log('\n  ⚠️ Это цена ПРОСТОЯ — такта, в котором считать было нечего. Она не описывает');
console.log(
	'     Пространство, где люди оценивают: там такт делает работу и стоит своих денег.',
);
console.log('\nЗамер окончен. Прибор ничего не чинит и ничего не утверждает — он печатает числа.\n');

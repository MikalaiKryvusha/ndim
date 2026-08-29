/**
 * СТРАЖ: В СТЕЙДЖЕ НЕТ ПЕРСОНАЛЬНЫХ ДАННЫХ ЖИВЫХ ЛЮДЕЙ — критерий П7 эпика `plans/53`.
 *
 * Шкала критерия названа планом дословно: «число документов людей, пришедших из боя» → **0**.
 * Ключевое слово — ПРИШЕДШИХ. Стейдж наполняется слепком боя, и вопрос не в том, есть ли там
 * данные (они там есть и должны быть), а в том, остался ли в них человек.
 *
 * ═══ ЧЕМ ЭТО МЕРИТСЯ, И ПОЧЕМУ ИМЕННО ТАК ═══
 *
 * 🔑 ГЛАВНАЯ МЕРА — ПЕРЕСЕЧЕНИЕ КЛЮЧЕЙ С БОЕМ. Обезличиватель переписывает uid
 * (`stage-<хеш>`), поэтому документ, приехавший «как есть», выдаёт себя ключом: он совпадёт с
 * боевым. Это прямое прочтение шкалы критерия, а не косвенный признак.
 *
 * ⚠️ Почему НЕ проверяется «все ключи начинаются на `stage-`», хотя это было бы бесплатно: на
 * стейдже законно живут НАСТОЯЩИЕ учётные записи — владелец там входит и тестирует. У них
 * обычные uid Firebase, и такая проверка краснела бы на исправном контуре, то есть учила бы себя
 * игнорировать. Страж, мешающий работе и ничего не защищающий, — худший вид стража.
 *
 * Дальше — слой личности, который обезличиватель обязан был стереть:
 *   · `privat` (331 живой `user_secret_key`, `bugs/127`) не перенесён ВОВСЕ;
 *   · `ndimids` (наследие 1.x) не перенесён;
 *   · в бакетах профиля нет ни одного непустого «о себе» и ни одного `avatar: true`;
 *   · точная дата рождения (`born.day`) стёрта, год и месяц оставлены намеренно.
 *
 * 🔑 КОНТРОЛЬ ПРИБОРА ИДЁТ ПЕРВЫМ (`EXP-0070`, `EXP-0082`): сперва доказываем, что мерить БЫЛО
 * ЧЕМ — у стейджа есть люди, у боя есть люди, у стейджа есть бакеты профиля. Без этого пустая
 * база давала бы «пересечений 0» и красила бы страж зелёным ровно в том случае, когда он не
 * работает вовсе.
 *
 * 🔴 ПДн НЕ ПЕЧАТАЮТСЯ. Только числа и шаблоны путей: репозиторий публичный, а утечка здесь уже
 * случалась (`bugs/01`).
 *
 * ЦЕНА ПРОГОНА: ~360 чтений боя (только ключи `users`) и ~1 400 чтений стейджа.
 *
 * ═══ ЧЕМ ДОКАЗАН САМ СТРАЖ ═══
 *
 * Зелёный прогон ничего не значит, пока не показано, что страж УМЕЕТ краснеть (`AGENT_GUIDE.md` →
 * «Зелёные тесты сами по себе ничего не доказывают»). Доказательство здесь двухчастное, и обе
 * части нужны:
 *   1. **`--selftest`** — вердикт вынесен в чистые функции `judge*`, и самопроверка прогоняет их
 *      на синтетических случаях: утёкший боевой ключ, живое имя, «о себе», фотография, точная
 *      дата рождения. Правило и его доказательство живут в одном файле и не могут разъехаться.
 *   2. **Контроль прибора в живом прогоне** — блок 0 и две проверки в блоке 3 доказывают, что
 *      данные действительно прочитаны (у боя есть люди, у стейджа есть люди и бакеты с именами).
 * Первая часть отвечает «правило способно осудить», вторая — «читать мы умеем». Порознь каждая
 * оставляет дыру: чистая логика без чтения судит пустоту, а чтение без осуждающего правила молчит.
 *
 * Запуск: node tools/verify-stage-clean.mjs [--selftest]
 * Выход:  0 — чисто; 1 — есть провалы.
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { serviceAccount } from './lib/credentials.mjs';
import { CONTOURS } from './lib/contours.mjs';
import { pathToFileURL } from 'node:url';

/** Ключи стейджа, совпавшие с боевыми, — это и есть «документы людей, пришедших из боя». */
export function judgeKeys(stageKeys, prodKeys) {
	return stageKeys.filter((id) => prodKeys.has(id));
}

/**
 * Слой личности одного бакета профиля: что в нём осталось от живого человека.
 *
 * Синтетическое имя обезличивателя — «Человек NNN» / «Person NNN». Всё остальное непустое имя
 * считается настоящим: обезличиватель других форм не производит, а значит любая другая форма
 * приехала из боя.
 */
export function judgeBucket(data) {
	const first = data?.name?.first;
	const named = Boolean(first && (first.ru || first.en));
	return {
		named,
		realName: named && !/^(Человек|Person) \d{3}$/.test(String(first.ru ?? first.en)),
		about: Boolean(data?.about && (data.about.ru || data.about.en)),
		avatar: data?.avatar === true,
		birthDay: Boolean(data?.born && data.born.day !== null && data.born.day !== undefined),
	};
}

/**
 * 🔴 ПРЕДОХРАНИТЕЛЬ «ЗАПУЩЕН ИЛИ ПОДКЛЮЧЁН» (`ideas/43`; страж класса — `verify-import-safety.mjs`).
 *
 * ⛔ ЗДЕСЬ ОН ДОРОЖЕ, ЧЕМ ГДЕ-ЛИБО ЕЩЁ В tools/, и это надо назвать вслух: ниже стояли
 * `initializeApp(cert(serviceAccount('prod')))` и `serviceAccount('stage')` НА ВЕРХНЕМ УРОВНЕ.
 * Импорт этого файла ради двух чистых функций (`judgeKeys`, `judgeBucket`) поднимал соединения
 * к БОЕВОЙ и стейдж-базам и требовал ключей, которых рабочей копии роли иметь не положено
 * (`verify-role-env-scope.mjs`). Теперь импорт не делает ничего.
 */
const ЗАПУЩЕН_НАПРЯМУЮ = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

async function выполнить() {
	if (process.argv.includes('--selftest')) {
		const cases = [
			['ключ стейджа среди боевых — УТЕЧКА', judgeKeys(['stage-a1', 'Xk92prodUid'], new Set(['Xk92prodUid'])).length === 1],
			['ключи не пересекаются — чисто', judgeKeys(['stage-a1', 'stage-b2'], new Set(['Xk92prodUid'])).length === 0],
			['обезличенное имя — чисто', judgeBucket({ name: { first: { ru: 'Человек 007' } } }).realName === false],
			['живое имя — УТЕЧКА', judgeBucket({ name: { first: { ru: 'Николай' } } }).realName === true],
			['имени нет вовсе — не считается живым', judgeBucket({}).realName === false],
			['«о себе» заполнено — УТЕЧКА', judgeBucket({ about: { ru: 'живой текст' } }).about === true],
			['«о себе» пусто — чисто', judgeBucket({ about: { ru: null, en: null } }).about === false],
			['признак фотографии — УТЕЧКА', judgeBucket({ avatar: true }).avatar === true],
			['точная дата рождения — УТЕЧКА', judgeBucket({ born: { year: 1990, month: 5, day: 17 } }).birthDay === true],
			['год и месяц без дня — чисто (законное значение схемы)', judgeBucket({ born: { year: 1990, month: 5, day: null } }).birthDay === false],
		];
		let bad = 0;
		for (const [label, ok] of cases) {
			if (!ok) bad += 1;
			console.log(`  ${ok ? '✅' : '❌'} ${label}`);
		}
		console.log(`\nпроверок ${cases.length} · провалов ${bad}`);
		process.exit(bad === 0 ? 0 : 1);
	}

	const prodApp = initializeApp(
		{ credential: cert(serviceAccount('prod')), projectId: CONTOURS.prod.project },
		'prod',
	);
	const stageApp = initializeApp(
		{ credential: cert(serviceAccount('stage')), projectId: CONTOURS.stage.project },
		'stage',
	);
	const prod = getFirestore(prodApp, CONTOURS.prod.database);
	const stage = getFirestore(stageApp, CONTOURS.stage.database);

	let passed = 0;
	const fails = [];
	const check = (ok, name, detail = '') => {
		if (ok) {
			passed += 1;
			console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
		} else {
			fails.push(`${name}${detail ? ` — ${detail}` : ''}`);
			console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
		}
	};

	console.log('\n═══ В СТЕЙДЖЕ НЕТ ПДн ЖИВЫХ ЛЮДЕЙ (П7) ═══');
	console.log(`бой    ${CONTOURS.prod.project} / ${CONTOURS.prod.database}   (только чтение ключей)`);
	console.log(`стейдж ${CONTOURS.stage.project} / ${CONTOURS.stage.database}\n`);

	/** Ключи коллекции. Читаются ТОЛЬКО идентификаторы; значения не запрашиваются и не печатаются. */
	async function keysOf(db, name) {
		const snapshot = await db.collection(name).select().get();
		return snapshot.docs.map((doc) => doc.id);
	}

	// ── 0 · КОНТРОЛЬ ПРИБОРА: мерить есть чем ────────────────────────────────────
	console.log('0. Контроль прибора (без него любой зелёный ничего не значит):');
	const prodUsers = new Set(await keysOf(prod, 'users'));
	const stageUsers = await keysOf(stage, 'users');
	check(prodUsers.size > 0, 'бой отдал ключи людей', `${prodUsers.size}`);
	check(stageUsers.length > 0, 'в стейдже есть люди', `${stageUsers.length}`);

	// ── 1 · ГЛАВНАЯ МЕРА: ни один документ человека не приехал из боя ключом ──────
	console.log('\n1. Пересечение ключей с боем (шкала критерия П7):');
	let leaked = 0;
	for (const collection of ['users', 'points', 'relations']) {
		const keys = collection === 'users' ? stageUsers : await keysOf(stage, collection);
		const common = judgeKeys(keys, prodUsers); // ← та же функция, что судит самопроверка
		leaked += common.length;
		check(common.length === 0, `${collection}/* — боевых ключей нет`, `совпало ${common.length} из ${keys.length}`);
	}
	check(leaked === 0, '🔑 ИТОГО документов людей, пришедших из боя', `${leaked} (цель 0)`);

	// ── 2 · Коллекции, которые не переносятся вовсе ──────────────────────────────
	console.log('\n2. Что не переносится вовсе:');
	const privat = await stage.collectionGroup('privat').select().get();
	check(privat.size === 0, '🔴 privat/* — секретов 1.x в стейдже нет (bugs/127)', `${privat.size}`);
	const ndimids = await keysOf(stage, 'ndimids');
	check(ndimids.length === 0, 'ndimids/* — наследие 1.x не перенесено', `${ndimids.length}`);

	// ── 3 · Слой личности стёрт ──────────────────────────────────────────────────
	console.log('\n3. Слой личности в бакетах профиля:');
	const buckets = await stage.collectionGroup('profile').get();
	let withName = 0;
	let realName = 0;
	let withAbout = 0;
	let withAvatar = 0;
	let withBirthDay = 0;
	for (const doc of buckets.docs) {
		const verdict = judgeBucket(doc.data()); // ← та же функция, что судит самопроверка
		if (verdict.named) withName += 1;
		if (verdict.realName) realName += 1;
		if (verdict.about) withAbout += 1;
		if (verdict.avatar) withAvatar += 1;
		if (verdict.birthDay) withBirthDay += 1;
	}
	check(buckets.size > 0, 'контроль прибора: бакеты профиля прочитаны', `${buckets.size}`);
	check(withName > 0, 'контроль прибора: имена в бакетах есть (иначе проверка ниже пуста)', `${withName}`);
	check(realName === 0, '🔑 несинтетических имён нет', `${realName} из ${withName}`);
	check(withAbout === 0, '«о себе» нигде не заполнено', `${withAbout}`);
	check(withAvatar === 0, 'признак фотографии нигде не выставлен', `${withAvatar}`);
	check(withBirthDay === 0, 'точная дата рождения стёрта (год и месяц оставлены намеренно)', `${withBirthDay}`);

	console.log(`\n${'─'.repeat(56)}`);
	console.log(`${fails.length === 0 ? '✅ ЧИСТО' : '🔴 ПРОВАЛЫ'}: проверок ${passed + fails.length} · провалов ${fails.length}`);
	for (const f of fails) console.log(`  ❌ ${f}`);
	process.exit(fails.length === 0 ? 0 : 1);
}

if (ЗАПУЩЕН_НАПРЯМУЮ) await выполнить();

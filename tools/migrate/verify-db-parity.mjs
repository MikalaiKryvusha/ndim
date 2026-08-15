/**
 * СВЕРКА ДВУХ БАЗ ПО ОТПЕЧАТКАМ — прибор критерия **П1** эпика `plans/53`
 * («ни один документ людей не потерян при переезде»).
 *
 * Слово владельца, ради которого он существует: «*Перед миграцией ТРИ теста… **права на ошибку у
 * нас нет, это данные наших пользователей***». Прибор превращает это требование в ЧИСЛО: две базы
 * идентичны тогда и только тогда, когда совпали множества путей И хеши данных по каждому пути.
 *
 * ЧТО ОН СРАВНИВАЕТ (и почему именно так):
 *   · **множество путей** — ловит потерянные и лишние документы;
 *   · **хеш данных документа** — ловит документ, доехавший ИСКАЖЁННЫМ. Сравнение по одним лишь
 *     счётчикам этого не видит вовсе: «11 266 там и 11 266 здесь» — зелёное при полностью
 *     подменённом содержимом.
 * Хеши берутся из отпечатков (`db-fingerprint.mjs`), поэтому сама сверка не стоит НИ ОДНОГО
 * чтения базы и её можно гонять сколько угодно.
 *
 * ⚠️ ОБЪЯВЛЕННЫЕ ПРОПУСКИ. Иногда часть коллекций переносится намеренно не целиком (наполнение
 * стейджа не берёт `privat` и `ndimids`). Такие шаблоны объявляются флагом `--skip` и попадают
 * в отчёт ОТДЕЛЬНОЙ строкой: пропуск, о котором знают, — решение; пропуск, о котором молчат, —
 * потеря данных. Для боевой миграции список пропусков ПУСТ: миграция ничего не чистит.
 *
 * Запуск (шаблоны — со звёздочкой вместо идентификатора, как в сводке отпечатка):
 *   node tools/migrate/verify-db-parity.mjs ЭТАЛОН.json КОПИЯ.json
 *   node tools/migrate/verify-db-parity.mjs A.json B.json --skip "users/[звезда]/privat/[звезда]"
 *
 * ⚠️ В ЭТОМ КОММЕНТАРИИ звёздочки написаны словом НАРОЧНО: шаблон `users/[звезда]/privat/`
 * несёт последовательность, закрывающую блочный комментарий. Капкан ловил уже трижды за одну
 * сессию — он в самих ИМЕНАХ нашей модели, а не во внимательности.
 *
 * Выход: 0 — расхождений нет; 1 — есть (и они перечислены).
 */
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
const skipArg = (() => {
	const i = args.indexOf('--skip');
	return i === -1 ? '' : (args[i + 1] ?? '');
})();

if (files.length < 2) {
	console.error('Нужны два файла отпечатка: ЭТАЛОН.json КОПИЯ.json');
	process.exit(1);
}

const [referencePath, copyPath] = files;
const reference = JSON.parse(readFileSync(referencePath, 'utf8'));
const copy = JSON.parse(readFileSync(copyPath, 'utf8'));

/** Шаблон пути документа: идентификаторы заменены на `*` — тот же ключ, что в сводке отпечатка. */
const templateOf = (path) =>
	path
		.split('/')
		.map((part, i) => (i % 2 === 0 ? part : '*'))
		.join('/');

const skipped = new Set(
	skipArg
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean),
);

console.log('\n═══ СВЕРКА БАЗ ПО ОТПЕЧАТКАМ (критерий П1) ═══');
console.log(`эталон  ${reference.project} / ${reference.database}  — ${reference.documents} документов`);
console.log(`копия   ${copy.project} / ${copy.database}  — ${copy.documents} документов`);
if (skipped.size) console.log(`объявленные пропуски: ${[...skipped].join(' · ')}`);

const lost = []; // есть в эталоне, нет в копии
const extra = []; // есть в копии, нет в эталоне
const changed = []; // есть в обеих, но данные разные
const skippedCount = new Map();

for (const [path, hash] of Object.entries(reference.docs)) {
	const template = templateOf(path);
	if (skipped.has(template)) {
		skippedCount.set(template, (skippedCount.get(template) ?? 0) + 1);
		continue;
	}
	const other = copy.docs[path];
	if (other === undefined) lost.push(path);
	else if (other !== hash) changed.push(path);
}
for (const path of Object.keys(copy.docs)) {
	if (skipped.has(templateOf(path))) continue;
	if (reference.docs[path] === undefined) extra.push(path);
}

const show = (label, list) => {
	if (list.length === 0) return;
	console.log(`\n❌ ${label}: ${list.length}`);
	// Печатаем ПУТИ, а не значения: в базе ПДн, а репозиторий публичный (та же причина,
	// по которой отпечаток хранит хеши).
	for (const path of list.slice(0, 15)) console.log(`   ${path}`);
	if (list.length > 15) console.log(`   … и ещё ${list.length - 15}`);
};

show('ПОТЕРЯНО (есть в эталоне, нет в копии)', lost);
show('ЛИШНЕЕ (есть в копии, нет в эталоне)', extra);
show('ИСКАЖЕНО (путь тот же, данные другие)', changed);

if (skippedCount.size) {
	console.log('\n— объявленные пропуски —');
	for (const [template, count] of [...skippedCount.entries()].sort()) {
		console.log(`   ${template.padEnd(28, '.')} ${count}`);
	}
}

const total = lost.length + extra.length + changed.length;
const compared = Object.keys(reference.docs).length - [...skippedCount.values()].reduce((a, b) => a + b, 0);

console.log('\n─── ИТОГ ───');
console.log(`сверено документов : ${compared}`);
console.log(`потеряно           : ${lost.length}`);
console.log(`лишних             : ${extra.length}`);
console.log(`искажено           : ${changed.length}`);
console.log(`РАСХОЖДЕНИЙ ВСЕГО  : ${total}`);

// 🔑 КОНТРОЛЬ ПРИБОРА (`EXP-0082`): сверка ПУСТЫХ отпечатков дала бы «0 расхождений» и выглядела
// бы успехом. Ноль сравнённых документов — это не победа, а неисправность опыта.
if (compared === 0) {
	console.log('\n🔴 КОНТРОЛЬ ПРИБОРА: сравнивать было НЕЧЕГО — отпечаток пуст или всё пропущено.');
	process.exit(1);
}

console.log(total === 0 ? '\n✅ П1 ВЫПОЛНЕН: базы идентичны документ в документ' : '\n🔴 П1 НЕ ВЫПОЛНЕН');
process.exit(total === 0 ? 0 : 1);

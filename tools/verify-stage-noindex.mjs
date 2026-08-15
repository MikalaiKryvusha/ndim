/**
 * СТРАЖ: СТЕЙДЖ НЕВИДИМ ПОИСКОВИКАМ — критерий П6 эпика `plans/53`.
 *
 * Требование владельца дословно (2026-08-15): «*stage не должен индексироваться гуглом, закрыт от
 * кравлеров и роботов, не привязываем к прод домену, а располагается только на дефолтном
 * техническом firebase адресе*».
 *
 * Цена нарушения не абстрактна: весь этап фазы 7 мастер-плана — про находимость. Стейдж, попавший
 * в выдачу, конкурирует с боем его же текстами, то есть отнимает ровно то, ради чего идёт работа.
 *
 * ЧТО ПРОВЕРЯЕТСЯ
 *   1. Каждый проверяемый адрес стейджа отвечает и несёт `X-Robots-Tag` с `noindex`.
 *   2. 🔑 КОНТРОЛЬ ПРИБОРА: те же адреса в БОЮ этого заголовка НЕ несут. Без контроля страж был бы
 *      зелёным и в том случае, если бы он вообще не умел читать заголовки (`EXP-0082` — прибор,
 *      красивший всё зелёным, здесь уже случался).
 *   3. Заголовок стоит и на СЛУЖЕБНЫХ адресах — `sitemap.xml`, `robots.txt`, картинке. Мета-тег в
 *      HTML их закрыть не может по устройству, и это причина, по которой контур закрыт заголовком.
 *
 * Запуск: node tools/verify-stage-noindex.mjs
 * Выход:  0 — чисто; 1 — есть провалы.
 */
const STAGE = 'https://ndim-stage.web.app';
const PROD = 'https://ndimspace.app';

/** Адреса выбраны так, чтобы покрыть РАЗНЫЕ типы ответа, а не три копии одного. */
const PATHS = [
	'/', // корень-распознаватель языка
	'/ru', // лендинг
	'/en', // лендинг на втором языке
	'/ru/menu/manual', // документ
	'/ru/test/love', // страница семейства ТЕСТ
	'/sitemap.xml', // 🔑 служебный: мета-тегом не закрывается
	'/robots.txt', // 🔑 служебный
	'/favicon.svg', // 🔑 картинка: мета-тега в ней не бывает
];

const fails = [];
const ok = (what) => console.log(`  ✅ ${what}`);
const bad = (what) => {
	console.log(`  🔴 ${what}`);
	fails.push(what);
};

async function head(url) {
	// GET, а не HEAD: хостинг вправе отвечать на HEAD иначе, а робот ходит именно GET.
	const response = await fetch(url, { redirect: 'manual' });
	return { status: response.status, robots: response.headers.get('x-robots-tag') };
}

console.log(`\n═══ СТЕЙДЖ НЕВИДИМ ПОИСКОВИКАМ (П6) ═══\n`);
console.log(`стейдж ${STAGE}\nбой    ${PROD}\n`);

console.log('1. Стейдж закрыт заголовком:');
for (const path of PATHS) {
	const { status, robots } = await head(STAGE + path);
	if (status >= 500) {
		bad(`${path} — стейдж ответил ${status}`);
		continue;
	}
	if (!robots) bad(`${path} — заголовка X-Robots-Tag НЕТ (ответ ${status})`);
	else if (!/noindex/i.test(robots)) bad(`${path} — заголовок есть, но без noindex: «${robots}»`);
	else ok(`${path} — ${status}, X-Robots-Tag: ${robots}`);
}

console.log('\n2. КОНТРОЛЬ ПРИБОРА — в бою того же заголовка быть не должно:');
let controlSeen = 0;
for (const path of ['/', '/ru', '/sitemap.xml']) {
	const { status, robots } = await head(PROD + path);
	if (robots && /noindex/i.test(robots)) {
		bad(`БОЙ ${path} несёт noindex — это либо авария боя, либо страж читает не то`);
	} else {
		controlSeen += 1;
		ok(`бой ${path} — ${status}, X-Robots-Tag: ${robots ?? 'нет (верно)'}`);
	}
}
if (controlSeen === 0) {
	bad('контроль прибора не дал ни одного ответа — доверять первому блоку нельзя');
}

console.log(`\n${'─'.repeat(52)}`);
if (fails.length === 0) {
	console.log(`✅ ЧИСТО: проверок ${PATHS.length + 3}, провалов 0`);
	process.exit(0);
}
console.log(`🔴 ПРОВАЛОВ: ${fails.length}`);
process.exit(1);

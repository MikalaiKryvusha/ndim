/**
 * СТРАЖ РАЗДЕЛЕНИЯ КОНТУРОВ — критерий П8 эпика `plans/53`.
 *
 * Самое опасное свойство двухконтурной схемы: приложение стейджа, ушедшее в БОЕВУЮ базу. Оно
 * выглядело бы исправным — экраны те же, данные настоящие, — и мы бы ломали данные живых людей,
 * будучи уверенными, что ломаем песочницу.
 *
 * Доказать это чтением кода нельзя: выбор контура происходит В БРАУЗЕРЕ, по имени хоста. Поэтому
 * страж смотрит НА СЕТЬ — куда реально уходят запросы открытой страницы.
 *
 * ЧТО ПРОВЕРЯЕТСЯ
 *   1. Страница стейджа открылась (h1 есть, а не белый экран).
 *   2. Все запросы к Firestore и к входу идут в проект `ndim-stage`.
 *   3. 🔴 Ни одного запроса в `ndim-space` — это и есть предмет охраны.
 *   4. 🔑 КОНТРОЛЬ ПРИБОРА: та же проверка на БОЮ обязана увидеть ровно обратное. Без него страж
 *      был бы зелёным и в случае, если бы он вовсе не умел ловить запросы (`EXP-0082`).
 *   5. Консоль чиста.
 *
 * Запуск: node tools/probe-stage-contour.mjs
 * Выход:  0 — чисто; 1 — есть провалы.
 */
import { chromium } from 'playwright';
import { CONTOURS } from './lib/contours.mjs';

// Адреса и проекты — из реестра контуров: он один и сверяет себя с приложением.
const STAGE = { name: CONTOURS.stage.title, base: CONTOURS.stage.site, own: CONTOURS.stage.project, alien: CONTOURS.prod.project };
const PROD = { name: CONTOURS.prod.title, base: CONTOURS.prod.site, own: CONTOURS.prod.project, alien: CONTOURS.stage.project };

const fails = [];
const ok = (what) => console.log(`  ✅ ${what}`);
const bad = (what) => {
	console.log(`  🔴 ${what}`);
	fails.push(what);
};

/** Хосты Firebase, по которым видно, в какой ПРОЕКТ ушёл запрос. */
const WATCHED = /firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|firebaseio|firebasestorage/;

async function inspect(contour, browser) {
	console.log(`\n── ${contour.name} · ${contour.base} ──`);
	const page = await browser.newPage();
	const seen = [];
	const errors = [];

	page.on('request', (request) => {
		const url = request.url();
		if (WATCHED.test(url)) seen.push(url);
	});
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});

	// `/ru` — лендинг: он поднимает Firebase, потому что показывает живые числа витрины.
	//
	// ⚠️ Ждать `networkidle` здесь НЕЛЬЗЯ, и это проверено: Firestore держит долгое соединение
	// (WebChannel) открытым, сеть не затихает никогда, и ожидание упирается в таймаут — прибор
	// падал бы всегда, независимо от продукта. Ждём загрузку документа и даём запросам улететь.
	await page.goto(`${contour.base}/ru`, { waitUntil: 'domcontentloaded', timeout: 60000 });
	await page.waitForTimeout(7000);

	const heading = await page.locator('h1').first().textContent().catch(() => null);
	if (heading && heading.trim().length > 0) ok(`страница открылась: «${heading.trim().slice(0, 48)}…»`);
	else bad('страницы нет — пустой экран вместо заголовка');

	const own = seen.filter((u) => u.includes(contour.own));
	const alien = seen.filter((u) => u.includes(contour.alien));

	if (seen.length === 0) {
		bad('НИ ОДНОГО запроса к Firebase не поймано — прибор не видит сеть, доверять ему нельзя');
	} else {
		ok(`запросов к Firebase поймано: ${seen.length}`);
	}
	if (own.length > 0) ok(`в свой проект (${contour.own}): ${own.length}`);
	else bad(`в свой проект (${contour.own}) НЕ ушло ни одного запроса`);

	if (alien.length === 0) ok(`в чужой проект (${contour.alien}): 0 — контуры не смешаны`);
	else {
		bad(`🔴 В ЧУЖОЙ ПРОЕКТ (${contour.alien}) ушло ${alien.length} запросов`);
		for (const u of alien.slice(0, 3)) console.log(`      ${u.slice(0, 120)}`);
	}

	if (errors.length === 0) ok('консоль чиста');
	else {
		bad(`ошибок в консоли: ${errors.length}`);
		for (const e of errors.slice(0, 3)) console.log(`      ${e.slice(0, 140)}`);
	}

	await page.close();
}

console.log('\n═══ РАЗДЕЛЕНИЕ КОНТУРОВ (П8) ═══');
const browser = await chromium.launch();
try {
	await inspect(STAGE, browser);
	await inspect(PROD, browser); // контроль прибора: зеркальная проверка
} finally {
	await browser.close();
}

console.log(`\n${'─'.repeat(52)}`);
if (fails.length === 0) {
	console.log('✅ ЧИСТО: контуры разделены, прибор доказал, что видит сеть');
	process.exit(0);
}
console.log(`🔴 ПРОВАЛОВ: ${fails.length}`);
process.exit(1);

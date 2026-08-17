/**
 * ПРИБОР МАКЕТОВ ТЕКСТА БЛОКА-ДВЕРИ — проверяет, что страница ОТРИСОВАЛАСЬ, и снимает кадры.
 *
 * 🔴 Зачем это вообще нужно. Владельцу уезжает ссылка на макет, и если страница не отрисовалась,
 * он открывает ПУСТУЮ ВКЛАДКУ и тратит своё время на мой промах. Урок оплачен на макетах места в
 * каталоге; здесь тот же приём: перед показом прибор ходит по странице браузером и утверждает
 * не «файл существует», а «текст виден».
 *
 * Что судится:
 *   · все пять карточек на месте (текущий текст + четыре варианта);
 *   · у каждого варианта, кроме V4, абзац НЕПУСТ — иначе владелец увидит заголовок с кнопкой и
 *     решит, что так и задумано;
 *   · у V4 абзаца НЕТ намеренно — это его отличие, и оно проверяется отдельно;
 *   · переключатели РАБОТАЮТ: смена состояния и языка меняет текст (иначе четыре варианта
 *     показывались бы в одном состоянии, и выбор был бы сделан по неполной картине);
 *   · обе темы: кадр светлой и тёмной.
 *
 * Запуск: node tools/shoot-door-copy.mjs
 * Кадры:  test-results/door-copy/
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const OUT = 'test-results/door-copy';
mkdirSync(OUT, { recursive: true });

let checks = 0;
let fails = 0;
const ok = (condition, label) => {
	checks += 1;
	if (condition) console.log(`  ✅ ${label}`);
	else {
		fails += 1;
		console.log(`  ❌ ${label}`);
	}
};

const page = await (await chromium.launch()).newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(pathToFileURL(resolve('design/door-copy-mockups.html')).href);
await page.waitForSelector('.variant');

console.log('\n═══ МАКЕТЫ ТЕКСТА БЛОКА-ДВЕРИ ═══\n');

/** Тексты абзацев всех карточек в текущем состоянии страницы. */
const paragraphs = () => page.$$eval('.variant', (cards) =>
	cards.map((c) => ({
		name: c.querySelector('h2')?.textContent?.trim() ?? '',
		text: c.querySelector('.door p')?.textContent?.trim() ?? '',
		hasButton: Boolean(c.querySelector('.cta')?.textContent?.trim()),
		hasHead: Boolean(c.querySelector('.door h3')?.textContent?.trim()),
	})),
);

for (const [langId, langName] of [['lang-ru', 'русский'], ['lang-en', 'English']]) {
	await page.click(`#${langId}`);
	for (const [stId, stName] of [['st-voted', 'оценки есть'], ['st-bare', 'оценок нет']]) {
		await page.click(`#${stId}`);
		const cards = await paragraphs();
		console.log(`— ${langName} · ${stName} —`);
		ok(cards.length === 5, `карточек пять (получено ${cards.length})`);
		ok(
			cards.every((c) => c.hasHead && c.hasButton),
			'у каждой карточки на месте заголовок и кнопка (оба — слова владельца)',
		);
		const withText = cards.slice(0, 4);
		ok(
			withText.every((c) => c.text.length > 0),
			'у текущего текста и вариантов V1–V3 абзац непуст',
		);
		ok(cards[4].text === '', 'у V4 абзаца нет — это его отличие, а не сбой отрисовки');
		ok(
			new Set(withText.map((c) => c.text)).size === withText.length,
			'варианты РАЗНЫЕ (одинаковый текст в двух карточках сделал бы выбор бессмысленным)',
		);
	}
}

// Переключатели обязаны РАБОТАТЬ: без этого владелец сравнивал бы четыре варианта в одном
// состоянии и выбирал бы по неполной картине.
await page.click('#lang-ru');
await page.click('#st-voted');
const votedRu = (await paragraphs())[1].text;
await page.click('#st-bare');
const bareRu = (await paragraphs())[1].text;
await page.click('#lang-en');
const bareEn = (await paragraphs())[1].text;
console.log('— переключатели —');
ok(votedRu !== bareRu, 'смена состояния меняет текст');
ok(bareRu !== bareEn, 'смена языка меняет текст');

await page.click('#lang-ru');
await page.click('#st-voted');
for (const theme of ['light', 'dark']) {
	if (theme === 'dark') await page.click('#theme');
	await page.screenshot({ path: `${OUT}/door-copy-${theme}.png`, fullPage: true });
	console.log(`  📸 кадр ${theme} — ${OUT}/door-copy-${theme}.png`);
}

console.log('— консоль —');
ok(errors.length === 0, `ошибок в консоли нет${errors.length ? `: ${errors[0]}` : ''}`);

console.log(`\n${fails ? '🔴' : '✅'} проверок ${checks} · провалов ${fails}`);
process.exit(fails ? 1 : 0);

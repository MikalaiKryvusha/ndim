/**
 * ДИАГНОСТИКА ВХОДА НА СТЕЙДЖЕ — почему «Не удалось создать аккаунт».
 *
 * Продукт показывает человеку ОБЩУЮ корзину ошибок («unknown»), и это правильно для человека, но
 * бесполезно для починки. Прибор воспроизводит тот же шаг и печатает то, что продукт прячет:
 * настоящий код ошибки Firebase и тело неудачного HTTP-ответа.
 *
 * ⚠️ Ничего не создаёт: письмо со ссылкой запрашивается на несуществующий адрес в домене
 * `stage.local`, аккаунт по такому запросу не рождается — рождается он только при переходе по
 * ссылке из письма.
 *
 * Запуск: node tools/probe-stage-signin.mjs [--base https://ndim-stage.web.app] [--email адрес]
 */
import { chromium } from 'playwright';
import { markProbePage } from './lib/probe-mark.mjs';

const arg = (name, fallback) => {
	const i = process.argv.indexOf(name);
	return i === -1 ? fallback : process.argv[i + 1];
};

const BASE = arg('--base', 'https://ndim-stage.web.app');
const EMAIL = arg('--email', 'probe-stage@stage.local');

const browser = await chromium.launch();
const page = await browser.newPage();
await markProbePage(page);

const errors = [];
const failed = [];

page.on('console', (m) => {
	if (m.type() === 'error') errors.push(m.text());
});
page.on('response', async (response) => {
	const url = response.url();
	if (!/googleapis\.com/.test(url)) return;
	if (response.status() < 400) return;
	let body = '';
	try {
		body = (await response.text()).slice(0, 400);
	} catch {
		body = '(тело не прочиталось)';
	}
	failed.push({ status: response.status(), url, body });
});

console.log(`\n═══ ДИАГНОСТИКА ВХОДА · ${BASE} ═══\n`);
await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4000);

// Прежде чем что-то нажимать — ПОКАЗАТЬ, что прибор вообще видит. Первая редакция падала по
// таймауту на поиске поля, и из её вывода нельзя было понять, чего именно нет: поля, страницы или
// самого приложения. Кадр и текст экрана снимают этот вопрос за один прогон.
await page.screenshot({ path: 'test-results/stage-signin.png', fullPage: true });
const visible = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
console.log(`на экране: «${visible.slice(0, 220)}»`);
console.log(`полей ввода на странице: ${await page.locator('input').count()}`);

// Поле почты появляется ВТОРЫМ шагом: сперва экран предлагает Google, и лишь по нажатию
// «по ссылке на почту» раскрывается ввод. Первая редакция прибора искала поле сразу и падала —
// причём падала на исправном продукте, то есть врала о нём.
const reveal = page.getByRole('button', { name: /почт|ссылк|email/i }).first();
if (await reveal.count()) {
	await reveal.click();
	await page.waitForTimeout(1500);
	console.log('раскрыт ввод почты');
}

const field = page.locator('input[type="email"], input[inputmode="email"]').first();
await field.fill(EMAIL, { timeout: 15000 });
console.log(`адрес введён: ${EMAIL}`);

const button = page.getByRole('button', { name: /ссылк|link/i }).first();
await button.click();
await page.waitForTimeout(7000);

const shown = await page
	.locator('text=/Не удалось|could not|Ссылка отправлена|link sent|Проверьте почту/i')
	.first()
	.textContent()
	.catch(() => null);
console.log(`продукт показал: ${shown ?? '(ничего)'}`);

console.log(`\n── НЕУДАЧНЫЕ ЗАПРОСЫ К FIREBASE (${failed.length}) ──`);
for (const f of failed) {
	console.log(`\n  ${f.status}  ${f.url.split('?')[0]}`);
	console.log(`  ${f.body.replace(/\s+/g, ' ').slice(0, 300)}`);
}

console.log(`\n── ОШИБКИ КОНСОЛИ (${errors.length}) ──`);
for (const e of errors.slice(0, 6)) console.log(`  ${e.slice(0, 220)}`);

await browser.close();

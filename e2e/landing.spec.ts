import { test, expect, type Page } from '@playwright/test';

// Новая V1 главной — `/`, `/ru`, `/en` (`plans/106`; эпик `plans/104`, фаза 2). Макет —
// `design/new-landing-v1.html`, структура утверждена владельцем (№096 В5), заголовок — вариант А (№096 В15),
// 12 вопросов и ответов (№096 В16). Здесь — страница целиком без теста на совместимость; тест — `demo.spec.ts`.
// Кейсы набора — `qa/suites/new-landing-v1.md` (НЛ-01…НЛ-07).
//
// 🔄 2026-09-25: спека переписана тем же коммитом, что страница. Прежняя судила лендинг «Колонна»
// («Добро пожаловать в Пространство NDim», три фичи, кнопки «Создать Аккаунт»/«Войти в Аккаунт») —
// его больше нет. Могли ли старые проверки теперь проходить по неверной причине? Нет: они искали
// тексты и классы, которых в новой разметке нет, и краснели бы; каждая проверка ниже стережёт то, что
// заявляет, на новой разметке.

const RU_H1 = 'Знакомства по интересам в Пространстве NDim Space';
const EN_H1 = 'Meet people who share your interests in NDim Space';

// Фон <body> — объективный маркер применённой темы (переменная --bg в +layout.svelte)
const LIGHT_BG = 'rgb(246, 248, 251)';
const DARK_BG = 'rgb(6, 11, 20)';

/**
 * Консоль без ошибок — кроме ОДНОЙ, честной: `track()` пишет счётчик воронки в Firestore, и на localhost
 * без эмуляторов (e2e гоняется при погашенном стенде, EXP-0027) браузер печатает «соединение отказано».
 * Это деградация стенда, а не дефект страницы; любая другая ошибка роняет тест.
 */
function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('console', (msg) => {
		if (msg.type() === 'error' && !msg.text().includes('ERR_CONNECTION_REFUSED')) errors.push(msg.text());
	});
	page.on('pageerror', (err) => errors.push(String(err)));
	return errors;
}

test('пререндер /ru: заголовок, тест на 10 объектов, 12 вопросов и скрипт темы — в сыром HTML', async ({ request }) => {
	const res = await request.get('/ru');
	expect(res.status()).toBe(200);
	const html = (await res.text()).replace(/ |&nbsp;/g, ' ');
	expect(html).toContain('Знакомства по интересам в');
	expect(html).toContain('Знакомства нового измерения');
	expect(html).toContain('Пройти тест на совместимость');
	// Объекты теста — настоящие измерения каталога: их id стоят в разметке (звезда уедет под этим id).
	const { DEMO_ITEMS } = await import('../src/lib/content/landing-demo.ts');
	for (const d of DEMO_ITEMS) expect(html, `нет строки «${d.title.ru}»`).toContain(`data-dim="${d.id}"`);
	expect((html.match(/<summary[^>]*>/g) ?? []).length).toBe(12);
	// Инлайн-скрипт app.html применяет тему до отрисовки; ранний тап ловится до гидратации (`plans/106` Д6).
	expect(html).toContain('ndim-theme');
	expect(html).toContain('__ndimDemoQ');
	// Слово владельца к герою V3: «не пишем, что они вымышленные».
	expect(html.toLowerCase()).not.toContain('вымышлен');
});

test('пререндер: числа Пространства стоят в HTML и равны снимку боя', async ({ request }) => {
	// `bugs/81` (число в сыром HTML, не «на горячую») и `bugs/07` (число не выдумано): РАВЕНСТВО снимку.
	const { PUBLIC_PEOPLE_SNAPSHOT } = await import('../src/lib/content/landing-metric.ts');
	const html = (await (await request.get('/ru')).text()).replace(/ |&nbsp;/g, ' ');
	const band = [
		['объектов человеческой культуры', PUBLIC_PEOPLE_SNAPSHOT.dims],
		['оценок поставлено', PUBLIC_PEOPLE_SNAPSHOT.ratings],
		['человек в Пространстве', PUBLIC_PEOPLE_SNAPSHOT.people],
		['связей рассчитано', PUBLIC_PEOPLE_SNAPSHOT.relations],
	] as const;
	for (const [label, expected] of band) {
		const shown = new RegExp(`<b[^>]*>\\s*([\\d\\s]+?)\\s*</b>\\s*<span[^>]*>${label}`).exec(html);
		expect(shown, `числа «${label}» нет в пререндеренном HTML (bugs/81)`).not.toBeNull();
		expect(Number(shown![1]!.replace(/\s/g, '')), `«${label}» расходится со снимком боя (bugs/07)`).toBe(expected);
	}
});

test('дефолт /ru: светлая тема, русский язык, заголовок А', async ({ page }) => {
	await page.goto('/ru');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(RU_H1);
	await expect(page.locator('body')).toHaveCSS('background-color', LIGHT_BG);
	await expect(page.locator('.port img')).toHaveCount(3);
});

test('тема: переключение в тёмную и сохранение после перезагрузки', async ({ page }, testInfo) => {
	await page.goto('/ru');
	await page.getByRole('button', { name: 'Тёмная тема' }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await expect(page.locator('body')).toHaveCSS('background-color', DARK_BG);
	await page.screenshot({ path: testInfo.outputPath('landing-dark.png'), fullPage: true });
	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('язык: EN — ссылкой на /en, RU — обратно на /ru', async ({ page }) => {
	await page.goto('/ru');
	await page.getByRole('link', { name: 'EN', exact: true }).click();
	await expect(page).toHaveURL(/\/en$/);
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(EN_H1);
	await page.getByRole('link', { name: 'RU', exact: true }).click();
	await expect(page).toHaveURL(/\/ru$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(RU_H1);
});

test.describe('главная /: та же страница на русском, язык НЕ угадывается', () => {
	test.use({ locale: 'en-US' });

	test('англоязычный браузер с «en» в памяти видит на / русскую страницу и ссылку EN', async ({ page }) => {
		// №096 В6 = Б: «язык выбирается переключателем вверху»; №058 В1 = А — «молчаливое угадывание языка» не берём.
		await page.addInitScript(() => {
			try {
				localStorage.setItem('ndim-lang', 'en');
			} catch {}
		});
		await page.goto('/');
		await expect(page).toHaveURL(/\/$/);
		await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(RU_H1);
		await expect(page.getByRole('link', { name: 'EN', exact: true })).toHaveAttribute('href', '/en');
	});

	test('контроль прибора: тот же человек на /en видит английский', async ({ page }) => {
		await page.goto('/en');
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(EN_H1);
	});
});

test('главная /: canonical — сама главная, hreflang на оба языка, x-default — английский', async ({ request }) => {
	const html = await (await request.get('/')).text();
	expect(html).toMatch(/<link rel="canonical" href="https:\/\/ndimspace\.app\/"/);
	expect(html).toMatch(/hreflang="ru" href="https:\/\/ndimspace\.app\/ru"/);
	expect(html).toMatch(/hreflang="en" href="https:\/\/ndimspace\.app\/en"/);
	expect(html).toMatch(/hreflang="x-default" href="https:\/\/ndimspace\.app\/en"/);
	expect(html).not.toMatch(/name="robots"[^>]*noindex/);
});

test('«Войти» ведёт на экран входа; подвал ведёт на тесты словами запросов; консоль чистая', async ({ page }) => {
	const errors = collectErrors(page);
	await page.goto('/ru');
	await expect(page.getByRole('link', { name: 'Войти', exact: true })).toHaveAttribute('href', '/profile');
	await expect(page.getByRole('link', { name: 'Тест на совместимость', exact: true })).toHaveAttribute('href', '/ru/test/compatibility');
	await expect(page.getByRole('link', { name: 'Калькулятор любви', exact: true })).toHaveAttribute('href', '/ru/test/love');
	await page.getByRole('button', { name: 'Тёмная тема' }).click();
	await page.waitForTimeout(500);
	expect(errors).toEqual([]);
});

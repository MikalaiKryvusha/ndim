import { test, expect } from '@playwright/test';

// Первый e2e-сценарий NDim Space: лендинг (src/routes/+page.svelte).
// Проверяет четыре обещания лендинга:
//   1) пререндер — тексты владельца лежат в самом HTML, до всякого JS (SEO, GOAL.md);
//   2) дефолт — светлая тема «Бумага» и русский язык (решение владельца 2026-07-11);
//   3) переключатели темы и языка работают и переживают перезагрузку;
//   4) кнопки ведут в живое приложение 1.x, консоль без ошибок.
// Каждый тест получает чистый браузерный контекст — localStorage между тестами не течёт.

const RU_TITLE = 'Добро пожаловать в Пространство NDim';
const EN_TITLE = 'Welcome to the NDim Space';
const APP_URL = 'https://ndim-space.web.app';

// Фон <body> — объективный маркер применённой темы (переменная --bg в +layout.svelte)
const LIGHT_BG = 'rgb(246, 248, 251)'; // #f6f8fb — светлая «Бумага»
const DARK_BG = 'rgb(6, 11, 20)'; // #060b14 — тёмный киберпанк

test('пререндер: русские тексты и скрипт темы лежат в сыром HTML', async ({ request }) => {
	const res = await request.get('/');
	expect(res.status()).toBe(200);
	// В текстах лендинга есть неразрывные пробелы (U+00A0, «Пространство NDim» не рвётся
	// при переносе). Браузерные матчеры Playwright нормализуют их сами, сырой HTML — нормализуем мы.
	const html = (await res.text()).replace(/\u00a0|&nbsp;/g, ' ');
	// Тексты владельца обязаны быть в статическом HTML — иначе индексация сломана
	expect(html).toContain(RU_TITLE);
	expect(html).toContain('Знакомства нового измерения');
	// Инлайн-скрипт из app.html применяет тему/язык ДО отрисовки (без мигания)
	expect(html).toContain('ndim-theme');
	expect(html).toContain('ndim-lang');
});

test('дефолт: светлая тема «Бумага», русский язык, три фичи', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(RU_TITLE);
	await expect(page.locator('body')).toHaveCSS('background-color', LIGHT_BG);
	await expect(page.locator('.feat')).toHaveCount(3);
});

test('тема: переключение в тёмную и сохранение после перезагрузки', async ({ page }, testInfo) => {
	await page.goto('/');
	await page.screenshot({ path: testInfo.outputPath('landing-light.png'), fullPage: true });
	// Кнопка подписана тем, КУДА переключит нажатие (aria-label)
	await page.getByRole('button', { name: 'Тёмная тема' }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await expect(page.locator('body')).toHaveCSS('background-color', DARK_BG);
	await page.screenshot({ path: testInfo.outputPath('landing-dark.png'), fullPage: true });
	// Выбор переживает перезагрузку: инлайн-скрипт app.html читает localStorage до отрисовки
	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await expect(page.locator('body')).toHaveCSS('background-color', DARK_BG);
});

test('язык: EN переключается, переживает перезагрузку, RU возвращается', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'EN' }).click();
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(EN_TITLE);
	// Перезагрузка: атрибут ставит инлайн-скрипт, тексты подхватывает onMount
	await page.reload();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(EN_TITLE);
	await page.getByRole('button', { name: 'RU' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(RU_TITLE);
});

test('кнопки ведут в живое приложение 1.x; консоль чистая', async ({ page }) => {
	// Собираем ошибки консоли и необработанные исключения за всю сессию теста
	const errors: string[] = [];
	page.on('console', (msg) => {
		if (msg.type() === 'error') errors.push(msg.text());
	});
	page.on('pageerror', (err) => errors.push(String(err)));

	await page.goto('/');
	await expect(page.getByRole('link', { name: 'Создать Аккаунт' })).toHaveAttribute('href', APP_URL);
	await expect(page.getByRole('link', { name: 'Войти в Аккаунт' })).toHaveAttribute('href', APP_URL);
	// Переключатели не должны сыпать ошибками
	await page.getByRole('button', { name: 'Тёмная тема' }).click();
	await page.getByRole('button', { name: 'EN' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(EN_TITLE);
	expect(errors).toEqual([]);
});

import { test, expect } from '@playwright/test';

// SEO-обвязка живого домена (researches/08 §4): sitemap.xml пререндерится в статический
// файл build/sitemap.xml, robots.txt указывает на него абсолютным URL.
// Тесты работают на продакшен-артефакте — как и весь e2e-стенд.

test('sitemap.xml: отдаётся и содержит только то, что обязано находиться', async ({ request }) => {
	const res = await request.get('/sitemap.xml');
	expect(res.status()).toBe(200);
	const xml = await res.text();
	expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
	// Абсолютный URL на боевой домен — единая константа src/lib/site.ts
	expect(xml).toContain('<loc>https://ndimspace.app/</loc>');
	// Страница удаления аккаунта — ЕДИНСТВЕННЫЙ экран аккаунта, который обязан находиться:
	// Google Play требует «readily discoverable option to initiate account deletion».
	// Закрыть её от поиска значило бы выполнить букву требования и убить его смысл.
	expect(xml).toContain('<loc>https://ndimspace.app/delete-account</loc>');
	// Приватные экраны под noindex — им нечего делать в карте сайта
	expect(xml).not.toContain('/profile');
	expect(xml).not.toContain('/relations');
	expect(xml).not.toContain('/account<');
});

test('удаление аккаунта: публичная дверь открыта без входа и НЕ закрыта от поиска', async ({
	request,
	page,
}) => {
	const res = await request.get('/delete-account');
	expect(res.status()).toBe(200);
	const html = await res.text();
	// Единственный приватный по смыслу экран без noindex — и это осознанно.
	expect(html).not.toContain('noindex');
	// Это ДВЕРЬ, а не инструкция (поправка владельца 2026-08-01): имя без слова «Как».
	expect(html).toContain('Удалить аккаунт');
	expect(html).not.toContain('Как удалить');

	/*
	 * ⚠️ ЗДЕСЬ ОЖИДАЕТСЯ ЧЕСТНЫЙ СБОЙ, а не «Сначала войдите», и это не оплошность —
	 * ту же ловушку уже описывает смоук «Профиля» и `/account`. Прогон идёт по адресу
	 * localhost, а для продукта localhost — это СТЕНД: он пытается войти пользователем
	 * стенда, эмулятора рядом нет, и экран честно сообщает о сбое.
	 *
	 * Ветку «не вошёл → вход прямо здесь» проверяет живой стенд дверью `?as=none`
	 * (страж фазы 8; на момент написания ещё не покрыта — записано в `plans/20`).
	 */
	await page.goto('/delete-account');
	await expect(page.getByText('Не удалось прочитать', { exact: false })).toBeVisible({ timeout: 20000 });
	// Чего на этой странице быть не должно НИ В КАКОМ состоянии: отсылки «пойди поищи».
	await expect(page.getByText('перейдите в Профиль', { exact: false })).toHaveCount(0);
	await expect(page.getByText('Управление аккаунтом', { exact: false })).toHaveCount(0);
});

test('robots.txt: обход разрешён, sitemap указан абсолютным URL', async ({ request }) => {
	const res = await request.get('/robots.txt');
	expect(res.status()).toBe(200);
	const text = await res.text();
	expect(text).toContain('User-agent: *');
	expect(text).toContain('Sitemap: https://ndimspace.app/sitemap.xml');
});

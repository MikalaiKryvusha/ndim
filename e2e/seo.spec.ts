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
	// Приватные экраны под noindex — им нечего делать в карте сайта.
	// 🔴 Сверяем ПОЛНЫЙ адрес, а не подстроку. Голая подстрока `/profile` сломалась на живых
	// данных: в каталоге есть измерение «Profile», и его публичный адрес
	// `/ru/dimension/profile-qgg1lfbk` содержит те же знаки. Проверка краснела бы на исправном
	// продукте и выглядела как «личный экран утёк в поиск» — худший вид ложной тревоги
	// (`plans/36`, шаг 4; фаза 5 эпика ideas/30 добавила 10 222 адреса каталога).
	expect(xml).not.toContain('<loc>https://ndimspace.app/profile</loc>');
	expect(xml).not.toContain('<loc>https://ndimspace.app/relations</loc>');
	expect(xml).not.toContain('<loc>https://ndimspace.app/account</loc>');
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

/*
 * 🔓 ДОКУМЕНТЫ ОТКРЫТЫ ПОИСКУ — слово владельца «Открываем всё!» (интервью №009, В11).
 *
 * 🔴 ЭТОТ СТРАЖ ПЕРЕВЁРНУТ НАМЕРЕННО, и в этом весь смысл. Он требует, чтобы `noindex` на
 * документах НЕ БЫЛО. Причина — урок `EXP-0107`: когда работа состоит в УДАЛЕНИИ чего-то,
 * обычный тест её не стережёт, и следующая сессия «восстановит» удалённое, не встретив ни
 * одного возражения. Одна строка в `DocShell.svelte` закрывала девять страниц; вернуть её
 * так же дёшево, как убрать.
 *
 * Замер до правки: поиску были открыты 2 страницы из 19 (3 692 знака против 53 385 закрытых).
 * После: 11 страниц, ≈49 700 знаков — рост в 13.5 раза.
 */
const PUBLIC_DOCS = [
	'/menu/manual',
	'/menu/terms',
	'/menu/privacy',
	'/menu/disclaimer',
	'/menu/about',
	'/menu/author',
	'/menu/support',
	'/menu/donate',
	'/menu/share',
];

/** Личные экраны. Их закрытость — тоже работа стража: граница обязана держаться с ОБЕИХ сторон. */
const PRIVATE_SCREENS = ['/profile', '/relations', '/dims', '/space', '/account', '/menu'];

test('документы продукта ОТКРЫТЫ поиску и попали в карту сайта', async ({ request }) => {
	const xml = await (await request.get('/sitemap.xml')).text();

	for (const path of PUBLIC_DOCS) {
		const res = await request.get(path);
		expect(res.status(), `${path} обязан отдаваться`).toBe(200);

		const html = await res.text();
		expect(html, `${path} закрыт noindex — это регрессия решения владельца В11`).not.toContain(
			'noindex',
		);
		// Без canonical открытая страница плодит дубли по трём хостам — это её половина работы.
		expect(html, `${path} без canonical`).toContain(`<link rel="canonical" href="https://ndimspace.app${path}"`);
		expect(xml, `${path} открыт, но поисковику о нём не сказали`).toContain(
			`<loc>https://ndimspace.app${path}</loc>`,
		);
	}
});

test('личные экраны ЗАКРЫТЫ от поиска — граница держится с обеих сторон', async ({ request }) => {
	const xml = await (await request.get('/sitemap.xml')).text();

	for (const path of PRIVATE_SCREENS) {
		const html = await (await request.get(path)).text();
		expect(html, `${path} потерял noindex — это утечка личного экрана в поиск`).toContain('noindex');
		expect(xml, `${path} попал в карту сайта, а не должен`).not.toContain(
			`<loc>https://ndimspace.app${path}</loc>`,
		);
	}
});

test('robots.txt: обход разрешён, sitemap указан абсолютным URL', async ({ request }) => {
	const res = await request.get('/robots.txt');
	expect(res.status()).toBe(200);
	const text = await res.text();
	expect(text).toContain('User-agent: *');
	expect(text).toContain('Sitemap: https://ndimspace.app/sitemap.xml');
});

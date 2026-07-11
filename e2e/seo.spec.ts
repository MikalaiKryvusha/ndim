import { test, expect } from '@playwright/test';

// SEO-обвязка живого домена (researches/08 §4): sitemap.xml пререндерится в статический
// файл build/sitemap.xml, robots.txt указывает на него абсолютным URL.
// Тесты работают на продакшен-артефакте — как и весь e2e-стенд.

test('sitemap.xml: отдаётся и содержит только публичную главную', async ({ request }) => {
	const res = await request.get('/sitemap.xml');
	expect(res.status()).toBe(200);
	const xml = await res.text();
	expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
	// Абсолютный URL на боевой домен — единая константа src/lib/site.ts
	expect(xml).toContain('<loc>https://ndimspace.app/</loc>');
	// Приватные экраны под noindex — им нечего делать в карте сайта
	expect(xml).not.toContain('/profile');
	expect(xml).not.toContain('/relations');
});

test('robots.txt: обход разрешён, sitemap указан абсолютным URL', async ({ request }) => {
	const res = await request.get('/robots.txt');
	expect(res.status()).toBe(200);
	const text = await res.text();
	expect(text).toContain('User-agent: *');
	expect(text).toContain('Sitemap: https://ndimspace.app/sitemap.xml');
});

import { test, expect } from '@playwright/test';

// Демо похожести на лендинге (src/lib/ui/SimilarityDemo.svelte, макет V5 «Синтез»).
// Проверяет три обещания демо:
//   1) пререндер — блок и посчитанные ядром числа лежат в сыром HTML (SEO + честность);
//   2) живой пересчёт — движение звёзд меняет похожесть ровно так, как считает ядро;
//   3) двуязычность — EN переименовывает персонажей (Алиса → Emma).
// Эталонные числа сверены с настоящим ядром (node + src/lib/similarity):
//   дефолт: Алиса 80/80/100, Макс 41/54/75, Настя 42/42/100;
//   после «Спорт: 10»: Алиса 54, Настя 47, Макс 46.

test('пререндер: демо и числа ядра лежат в сыром HTML', async ({ request }) => {
	const res = await request.get('/');
	expect(res.status()).toBe(200);
	const html = (await res.text()).replace(/ |&nbsp;/g, ' ');
	expect(html).toContain('Попробуйте прямо здесь');
	expect(html).toContain('Алиса');
	// Похожесть с Алисой при стартовых оценках — 80%: посчитано ядром при пререндере
	expect(html).toContain('80%');
	expect(html).toContain('Персонажи вымышленные');
});

test('живой пересчёт: «Спорт: 10» меняет похожесть с 80% на 54%', async ({ page }) => {
	await page.goto('/');
	const demo = page.getByRole('region', { name: 'Попробуйте прямо здесь' });
	// Дефолт: Алиса ближе всех с 80%
	await expect(demo.getByText('Алиса · ближе всех')).toBeVisible();
	await expect(demo.getByText('80%').first()).toBeVisible();
	// Двигаем звезду: Спорт → 10. Ядро даёт Алисе 54% (см. эталон в шапке файла)
	await page.getByRole('button', { name: 'Спорт: 10' }).click();
	await expect(demo.getByText('54%').first()).toBeVisible();
	// Алиса остаётся ближе всех (54 > 47 > 46), порядок не рвётся
	await expect(demo.getByText('Алиса · ближе всех')).toBeVisible();
});

test('язык: EN переименовывает персонажей и тексты демо', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'EN' }).click();
	const demo = page.getByRole('region', { name: 'Try it right here' });
	await expect(demo.getByText('Emma · closest')).toBeVisible();
	await expect(demo.getByText('The characters are fictional', { exact: false })).toBeVisible();
});

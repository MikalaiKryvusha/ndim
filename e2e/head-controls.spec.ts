/**
 * ОБЩАЯ ПАРА «ТЕМА + ЯЗЫК» (`HeadControls`) НА СТРАНИЦЕ БЕЗ КЛИЕНТСКОГО JS — каталог объявлен `csr = false`.
 *
 * Слово владельца 2026-09-25: «какого хуя в разных местах переключатель темы и языка разный?» — пара теперь одна
 * на все шапки. Здесь стережём половину, которую держит инлайн-скрипт `app.html`: касание темы переключает ровно
 * один раз, выпадашка языка ведёт на тот же материал на другом языке и закрывается касанием мимо и Esc (находка
 * суда 2026-09-25: на страницах без JS закрыть её было нечем).
 */
import { expect, test } from '@playwright/test';

test('каталог без JS: тема — одно переключение за касание; язык — ссылка на другой язык; выпадашка закрывается', async ({ page }) => {
	await page.goto('/ru/catalog');
	const html = page.locator('html');
	await expect(html).toHaveAttribute('data-theme', 'light');
	await page.evaluate(() => {
		const w = window as unknown as { __flips: number };
		w.__flips = 0;
		new MutationObserver(() => (w.__flips += 1)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
	});
	await page.locator('.hc button.theme').click();
	await expect(html).toHaveAttribute('data-theme', 'dark');
	expect(await page.evaluate(() => (window as unknown as { __flips: number }).__flips)).toBe(1);

	const wrap = page.locator('details.lang-wrap');
	await page.locator('summary.lang').click();
	await expect(wrap).toHaveAttribute('open', '');
	await expect(page.locator('.dd a[hreflang="en"]')).toHaveAttribute('href', '/en/catalog');
	// Касание мимо выпадашки закрывает её. Точка — у левого края: на узком экране открытая выпадашка накрывает
	// центр заголовка, и касание «в заголовок» попало бы в её пункт.
	await page.mouse.click(8, 320);
	await expect(wrap).not.toHaveAttribute('open', /.*/);
	// Esc — тоже.
	await page.locator('summary.lang').click();
	await expect(wrap).toHaveAttribute('open', '');
	await page.keyboard.press('Escape');
	await expect(wrap).not.toHaveAttribute('open', /.*/);
});

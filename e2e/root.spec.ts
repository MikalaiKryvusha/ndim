import { test, expect } from '@playwright/test';

// Корень `/` — главная с содержанием (макет V5, `plans/81`), живёт БЕЗ гидратации (`csr = false`).
// До 2026-09-05 корень был распознавателем языка, и все e2e ходили на `/ru`; у главной не было ни
// одного теста — и первый боевой выкат V5 дал регрессию, которую увидел владелец: у всякого, у кого
// в браузере лежит маркер сессии `ndim-session`, инлайн-скрипт `app.html` поднимает загрузочный щит
// (`data-booting`), а опускать его на новом корне было некому — вечная «Загрузка»
// (`bugs/NEW_root_boot_shield_never_drops`). Свежий браузер без маркера этого не показывает —
// поэтому смоуки и были зелёными.

test('корень: главная отдаётся с содержанием, открыта поиску, щит без маркера не поднимается', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('NDim Space');
	await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
	await expect(page.locator('html')).not.toHaveAttribute('data-booting', '');
	await expect(page.locator('#boot')).toBeHidden();
});

test('корень: маркер сессии уводит внутрь, а не держит вечный щит', async ({ page }) => {
	// Маркер лежит у каждого, кто хоть раз входил (гостем тоже). На корне без гидратации проверить
	// живую сессию нечем, поэтому решение — тем же признаком, что и щит: маркер → внутрь (`/profile`),
	// как уводил вошедшего лендинг (bugs/08.1). Щит держится до ухода — кадра главной человек не видит.
	await page.addInitScript(() => {
		try {
			localStorage.setItem('ndim-session', '1');
		} catch {}
	});
	await page.goto('/');
	await page.waitForURL(/\/profile(\?|$)/, { timeout: 10000 });
	expect(new URL(page.url()).pathname).toBe('/profile');
});

test('корень: ссылка из письма уходит в профиль с нетронутым query — раньше всего остального', async ({ page }) => {
	await page.addInitScript(() => {
		try {
			localStorage.setItem('ndim-session', '1');
		} catch {}
	});
	await page.goto('/?mode=signIn&oobCode=abc123&apiKey=demo');
	await page.waitForURL(/\/profile\?mode=signIn&oobCode=abc123&apiKey=demo/, { timeout: 10000 });
});

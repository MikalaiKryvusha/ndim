import { test, expect } from '@playwright/test';

// Тест на совместимость новой V1 главной (`plans/106` Д3, Д5, Д6; кейсы НЛ-08…НЛ-14 набора
// `qa/suites/new-landing-v1.md`). Объекты — настоящие измерения каталога (`landing-demo.ts`), похожесть
// считает ядро; стартует пустым — горит только поставленное человеком (№096 В8 = А).
//
// 🔄 2026-09-25: спека переписана тем же коммитом, что демо. Прежняя судила демо V5 на выдуманных качествах
// («Спорт», «Люблю тишину», стартовые оценки 80 % у Алисы) — его больше нет. Старые проверки не могли бы
// пройти по неверной причине: они искали имена кнопок («Спорт: 10») и классы (`.axis`), которых в новой
// разметке нет. Проверка «Назад после моста не возвращает на лендинг» перенесена без изменения смысла.

const rows = '#compat-rows [data-dim]';

test('старт пустой: ни одной горящей звезды, похожести нет, поп-апа нет', async ({ page }) => {
	await page.goto('/ru');
	await expect(page.locator(rows)).toHaveCount(10);
	await expect(page.locator(`${rows} [data-star].on`)).toHaveCount(0);
	await expect(page.locator('.who3 .sim')).toHaveText(['—', '—', '—']);
	await expect(page.locator('.popup')).toHaveCount(0);
});

test('звезда пересчитывает карту, карточки и карточку для сторис — ядром, а не литералом', async ({ page }) => {
	await page.goto('/ru');
	const matrix = page.locator(rows).filter({ hasText: 'Матрица' });
	// Касание до гидратации ловит инлайн-очередь (отдельный тест ниже); здесь ждём живого Svelte.
	await page.waitForFunction(() => (window as unknown as { __ndimDemoLive?: boolean }).__ndimDemoLive === true);
	await matrix.getByRole('button', { name: 'Матрица: 9' }).click();
	await expect(matrix.locator('.val')).toHaveText('9');
	await expect(matrix.locator('[data-star].on')).toHaveCount(9);
	// Одна оценка «Матрице»: Макс оценил 5 из 10 объектов — его Общность выше, он первый (юнит `compat-demo.test.ts`).
	await expect(page.locator('.popup')).toContainText('Макс — Ваша самая сильная связь:');
	const sims = await page.locator('.who3 .sim').allTextContents();
	expect(sims.every((s) => /^\d+ %$/.test(s)), `проценты карточек: ${sims.join(' | ')}`).toBe(true);
	await expect(page.locator('.story .s2')).toContainText('Моя самая сильная связь — Макс');
	// Повторное касание той же звезды снимает оценку — похожести снова нет.
	await matrix.getByRole('button', { name: 'Матрица: 9' }).click();
	await expect(matrix.locator('.val')).toHaveText('');
	await expect(page.locator('.who3 .sim')).toHaveText(['—', '—', '—']);
});

test('ранний тап: касание ДО гидратации горит сразу и доезжает до расчёта', async ({ page }) => {
	// Придерживаем код приложения: страница стоит пререндеренной, Svelte не ожил (риск «а» `plans/104`).
	let release!: () => void;
	const gate = new Promise<void>((r) => (release = r));
	await page.route('**/_app/immutable/**/*.js', async (route) => {
		await gate;
		await route.continue();
	});
	await page.goto('/ru', { waitUntil: 'domcontentloaded' });
	const titanic = page.locator(rows).filter({ hasText: 'Титаник' });
	await titanic.locator('[data-star="7"]').click();
	// Горит сразу — красит инлайн-скрипт, а не Svelte.
	await expect(titanic.locator('[data-star].on')).toHaveCount(7);
	expect(await page.evaluate(() => (window as unknown as { __ndimDemoLive?: boolean }).__ndimDemoLive)).toBeFalsy();
	release();
	// После гидратации очередь проиграна: оценка в расчёте, поп-ап назвал самого похожего.
	await expect(page.locator('.popup')).toContainText('Ваша самая сильная связь', { timeout: 15000 });
	await expect(titanic.locator('.val')).toHaveText('7');
	await expect(titanic.locator('[data-star].on')).toHaveCount(7);
});

test('кнопка темы: касание ДО гидратации переключает ровно один раз, после гидратации — тоже один', async ({ page }) => {
	// Находка dev-1 2026-09-25 (ВС-17): до оживления у кнопки общей пары не было обработчика, касание терялось.
	// Теперь касание ловит делегированный слушатель `app.html`; оживлённую кнопку (`data-live`) он пропускает.
	let release!: () => void;
	const gate = new Promise<void>((r) => (release = r));
	await page.route('**/_app/immutable/**/*.js', async (route) => {
		await gate;
		await route.continue();
	});
	await page.goto('/ru', { waitUntil: 'domcontentloaded' });
	const html = page.locator('html');
	const btn = page.locator('.hc button.theme');
	await expect(html).toHaveAttribute('data-theme', 'light');
	await expect(btn).not.toHaveAttribute('data-live', /.*/);
	await btn.click();
	await expect(html).toHaveAttribute('data-theme', 'dark');
	release();
	await expect(btn).toHaveAttribute('data-live', '');
	await page.evaluate(() => {
		const w = window as unknown as { __flips: number };
		w.__flips = 0;
		new MutationObserver(() => (w.__flips += 1)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
	});
	await btn.click();
	await expect(html).toHaveAttribute('data-theme', 'light');
	expect(await page.evaluate(() => (window as unknown as { __flips: number }).__flips)).toBe(1);
});

test('мост: ссылка на гостя с местом входа, «Назад» с первого экрана продукта не возвращает на лендинг', async ({ page }) => {
	await page.goto('/ru');
	const bridge = page.getByRole('link', { name: 'Смотреть больше' });
	// Ш1 `plans/67`: гостевая дверь, а не стена входа; Н4: разметка остаётся ССЫЛКОЙ (средний клик, новая вкладка).
	// `plans/105` Б2: слово двери — место входа гостя для аналитики.
	await expect(bridge).toHaveAttribute('href', '/profile?guest=landing');
	await page.waitForFunction(() => (window as unknown as { __ndimDemoLive?: boolean }).__ndimDemoLive === true);
	await bridge.click();
	await page.waitForURL('**/profile*');
	await page.goBack().catch(() => null);
	const landed = new URL(page.url()).pathname;
	expect(landed).not.toBe('/ru');
	expect(landed).not.toBe('/en');
});

test('мост главной ведёт гостя со словом двери root', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('link', { name: 'Смотреть больше' })).toHaveAttribute('href', '/profile?guest=root');
});

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
	// Лендинг — на языковых адресах (`plans/39` шаг 2); goto('/') в живых тестах ниже оставлен
	// нарочно: он заодно проверяет распознаватель корня.
	const res = await request.get('/ru');
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
	// ОБОСНОВАНИЕ ПРАВКИ (`plans/67` Ш3): с появлением итог-панели то же число живёт в демо
	// ДВАЖДЫ — в карточке персонажа и в строке панели. Прежний `.first()` по всему блоку
	// сегодня попадает в карточку и завтра попадёт куда угодно: он стал зависеть от порядка
	// разметки, а не от того, что проверяет. Сужено до карточек — тест стережёт заявленное.
	const cards = demo.locator('.personas');
	// Дефолт: Алиса ближе всех с 80%
	await expect(demo.getByText('Алиса · ближе всех')).toBeVisible();
	await expect(cards.getByText('80%').first()).toBeVisible();
	// Двигаем звезду: Спорт → 10. Ядро даёт Алисе 54% (см. эталон в шапке файла)
	await page.getByRole('button', { name: 'Спорт: 10' }).click();
	await expect(cards.getByText('54%').first()).toBeVisible();
	// Алиса остаётся ближе всех (54 > 47 > 46), порядок не рвётся
	await expect(demo.getByText('Алиса · ближе всех')).toBeVisible();
});

test('аватарки: кроп лица в карточке, тап открывает полный портрет, Esc закрывает', async ({ page }) => {
	await page.goto('/');
	const demo = page.getByRole('region', { name: 'Попробуйте прямо здесь' });
	// В карточке — кроп лица (alice_face.png), картинка реально отдаётся
	const face = demo.locator('img[src="/img/personas/alice_face.png"]');
	await expect(face).toBeVisible();
	const faceRes = await page.request.get('/img/personas/alice_face.png');
	expect(faceRes.status()).toBe(200);
	// Тап по аватару — оверлей с ПОЛНОЙ иллюстрацией
	await demo.getByRole('button', { name: 'Алиса — увеличить портрет' }).first().click();
	const overlay = page.getByRole('button', { name: 'Закрыть портрет' });
	await expect(overlay.locator('img[src="/img/personas/alice.png"]')).toBeVisible();
	// Esc закрывает
	await page.keyboard.press('Escape');
	await expect(overlay).not.toBeVisible();
});

test('язык: EN переименовывает персонажей и тексты демо', async ({ page }) => {
	await page.goto('/');
	// Переключатель — ссылка на /en (`plans/39` шаг 2)
	await page.getByRole('link', { name: 'EN' }).click();
	const demo = page.getByRole('region', { name: 'Try it right here' });
	await expect(demo.getByText('Emma · closest')).toBeVisible();
	await expect(demo.getByText('The characters are fictional', { exact: false })).toBeVisible();
});

test('мост в гостя: кнопка приходит после звёзд, ведёт в гостя и не оставляет записи истории', async ({ page }) => {
	// ОБОСНОВАНИЕ ПРАВКИ ЭТОГО ТЕСТА (`plans/67`, фаза 5 эпика 23). Прежняя редакция стерегла
	// прямо противоположное поведение: «на localhost мост переключается в гостевой режим» —
	// то есть ДОЛГ, из-за которого публичный посетитель упирался в стену входа (Ш1). Долг снят,
	// и тест теперь стережёт три обещания моста вместо одного.
	await page.goto('/');
	const demo = page.getByRole('region', { name: 'Попробуйте прямо здесь' });
	const bridge = demo.getByRole('link', { name: 'Смотреть больше' });

	// Ш4: двери нет, пока человек не потрогал демо. Композиция владельца (А2/А4: «кнопка
	// появляется после звёзд») и решение №009 В3: человека вносит внутрь его же действие.
	await expect(bridge).toHaveCount(0);

	await page.getByRole('button', { name: 'Спорт: 10' }).click();
	await expect(bridge).toBeVisible();

	// Ш1: адрес один для всех хостов — гостевая дверь, а не стена входа.
	// Н4: разметка обязана остаться ССЫЛКОЙ, иначе умрут средний клик и «открыть в новой вкладке».
	await expect(bridge).toHaveAttribute('href', '/profile?guest=1');

	// Ш5 и ворота фазы: «Назад» с первого экрана продукта НЕ возвращает на лендинг. Иначе
	// лендинг молча вытолкнул бы гостя обратно внутрь (bugs/08.1 — и это его работа), то есть
	// человек получил бы отскок. Дверь выбрана та, что не оставляет записи истории.
	await bridge.click();
	await page.waitForURL('**/profile*');
	await page.goBack().catch(() => null);
	// Сравниваем ПУТЬ, а не строку адреса: регулярка по адресу здесь читалась бы хуже, чем
	// то, что она проверяет, — а проверять надо ровно одно: это не лендинг.
	const landed = new URL(page.url()).pathname;
	expect(landed).not.toBe('/ru');
	expect(landed).not.toBe('/en');
});

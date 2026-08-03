import { expect, test } from '@playwright/test';

/*
 * ПЕРЕЕЗД «ДОКУМЕНТОВ» В ВЕРХ ПРАВОЙ КОЛОННЫ — `ideas/25`, слово владельца 2026-08-01.
 *
 * Судит СОБРАННЫЙ сайт: «Меню» работает и без данных (документы и манифест от базы не зависят),
 * поэтому стенд здесь не нужен вовсе — а значит проверка дешёвая и её не жалко держать.
 *
 * 🔴 Проверяется КООРДИНАТАМИ, а не порядком в разметке. Порядок узлов ничего не доказывает:
 * колонны — это два `<section>`, и карточка может лежать в правой секции, но визуально
 * оказаться где угодно, если сетка сложилась иначе. Спрашиваем то, что видит человек.
 */

/** Заголовок карточки документов и заголовок карточки проекта — по ним и ищем колонны. */
const DOCS = 'Документы';
const PROJECT = 'О проекте';

test('десктоп: «Документы» стоят в ПРАВОЙ колонне и ПЕРВЫМИ в ней', async ({ page }) => {
	const size = page.viewportSize();
	// Переезд виден только с 1024px: ниже колонны идут одна за другой и вопроса не существует.
	test.skip(size === null || size.width < 1024, 'раскладка в две колонны — от 1024px');

	await page.goto('/menu');

	const docs = page.getByRole('heading', { name: DOCS });
	await expect(docs).toBeVisible();

	// Слева — карточка «Вид» (тема и язык), первая в левой колонне; она никуда не переезжала.
	// Подписи прочих ссылок здесь СОЗНАТЕЛЬНО не упоминаются: проверка о РАСКЛАДКЕ, и завязка
	// на текст сделала бы её хрупкой к правкам словаря (первая редакция на этом и споткнулась).
	const view = page.getByRole('heading', { name: 'Вид' });
	await expect(view).toBeVisible();

	const docsBox = (await docs.boundingBox())!;
	const viewBox = (await view.boundingBox())!;

	// 1. Документы ПРАВЕЕ левой колонны — то есть переехали.
	expect(docsBox.x).toBeGreaterThan(viewBox.x + viewBox.width);

	// 2. Документы ПЕРВЫЕ в своей колонне: верх карточки стоит на одной линии с верхом левой
	//    колонны. Будь над ними ещё карточка — они уехали бы вниз на её высоту.
	expect(Math.abs(docsBox.y - viewBox.y)).toBeLessThan(24);
});

test('телефон: порядок НЕ изменился — «Документы» после «Поделиться»', async ({ page }) => {
	const size = page.viewportSize();
	test.skip(size !== null && size.width >= 1024, 'проверка про одноколоночную раскладку');

	await page.goto('/menu');

	// Обещание правки: на телефоне колонны идут одна за другой, и последовательность прежняя.
	// Без этой проверки переезд мог бы молча переставить разделы и на телефоне.
	const share = page.getByRole('heading', { name: 'Поделиться' });
	const docs = page.getByRole('heading', { name: DOCS });
	await expect(share).toBeVisible();
	await expect(docs).toBeVisible();

	const shareBox = (await share.boundingBox())!;
	const docsBox = (await docs.boundingBox())!;
	expect(docsBox.y).toBeGreaterThan(shareBox.y);
});

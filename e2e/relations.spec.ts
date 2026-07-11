/**
 * Смоук экрана «Связи» (/relations) на продакшен-сборке БЕЗ эмуляторов.
 * Полный сценарий с данными (топ от вычислителя, раскрытие карточки, «яркость связи»)
 * гоняется на живом стенде (`npm run stand`). Здесь — то, что обязано работать всегда.
 */
import { expect, test } from '@playwright/test';

test('связи: шелл пререндерен — заголовок, водмарк и noindex в сыром HTML', async ({ request }) => {
  const response = await request.get('/relations');
  expect(response.ok()).toBeTruthy();
  const html = (await response.text()).replace(/ |&nbsp;/g, ' ');

  for (const text of ['Пространство NDim', 'Связи', 'noindex']) {
    expect(html).toContain(text);
  }
});

test('связи: без эмуляторов — честное состояние «стенд не поднят»', async ({ page }) => {
  await page.goto('/relations');
  await expect(page.getByText('Стенд не поднят', { exact: false })).toBeVisible({ timeout: 20000 });
  // Нижняя навигация жива и ведёт в профиль
  await expect(page.getByRole('link', { name: 'Профиль' })).toBeVisible();
});

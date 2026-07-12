/**
 * Смоук экрана «Профиль» (/profile) на продакшен-сборке БЕЗ эмуляторов.
 *
 * Полный сценарий с данными (загрузка профиля, постановка оценки звездой,
 * персистентность после перезагрузки) гоняется на живом стенде: `npm run stand`
 * + scratchpad-скрипт агента — он требует Java и эмуляторов, поэтому в общий
 * прогон не входит. Здесь проверяется то, что обязано работать всегда:
 *   1) шелл экрана пререндерен: вкладки и водмарк лежат в сыром HTML;
 *   2) без данных экран честно говорит об этом человеческим языком, а не виснет
 *      на «Подключаюсь…» и не показывает пустоту.
 */
import { expect, test } from '@playwright/test';

test('профиль: шелл пререндерен — вкладки и водмарк в сыром HTML', async ({ request }) => {
  const response = await request.get('/profile');
  expect(response.ok()).toBeTruthy();
  const html = (await response.text()).replace(/ |&nbsp;/g, ' ');

  for (const text of ['Пространство NDim', 'Личное', 'Измерения', 'Видимость']) {
    expect(html).toContain(text);
  }
  // Приватный экран не должен индексироваться (researches/08, чеклист п. 14)
  expect(html).toContain('noindex');
});

test('профиль: без данных — честная ошибка человеческим языком, без жаргона', async ({ page }) => {
  await page.goto('/profile');
  await expect(page.getByText('Не удалось загрузить', { exact: false })).toBeVisible({ timeout: 20000 });
  // На лице приложения не должно быть наших внутренних команд: тот же экран работает в бою.
  await expect(page.getByText('npm run stand')).toHaveCount(0);
  // Вкладки при этом живы — шелл не сломан
  await expect(page.getByRole('button', { name: 'Видимость' })).toBeVisible();
});

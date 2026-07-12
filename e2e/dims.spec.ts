/**
 * Экран «Измерения» — отдельный раздел продукта (V1 «Дань уважения», утверждён 2026-07-12).
 *
 * Проверяется на ПРОДАКШЕН-СБОРКЕ и БЕЗ эмуляторов: значит данных нет, и экран обязан честно
 * это признать — человеческим языком, без жаргона и без выдуманных цифр.
 *
 * Почему этот файл существует. Раньше «Измерения» были суб-вкладкой профиля, и владелец на
 * боевом проде сказал: «Очень плохо, что нет вкладки Измерения… В старом NDim была отдельная
 * вкладка». Раздел вернули — и теперь его существование охраняет машина, а не память.
 */
import { expect, test } from '@playwright/test';

test('измерения: раздел открыт в навигации — и на телефоне, и на десктопе', async ({ page }) => {
  await page.goto('/dims');

  const desktop = (page.viewportSize()?.width ?? 0) >= 1024;
  const nav = page.locator(desktop ? 'nav.rail' : 'nav.bnav');

  await expect(nav.locator('a[href="/dims"]')).toBeVisible();
  await expect(nav.locator('a[href="/dims"]')).toHaveClass(/on/);
});

test('измерения: шелл пререндерен — заголовок и noindex лежат в сыром HTML', async ({ page }) => {
  // Экран приватный: он не должен попадать в поисковую выдачу.
  const response = await page.goto('/dims');
  const html = (await response?.text()) ?? '';

  expect(html).toContain('noindex');
  expect(html).toMatch(/Измерения|Dimensions/);
});

test('измерения: без данных — честная фраза человеку, а не отладочный вывод', async ({ page }) => {
  await page.goto('/dims');

  // Эмуляторов нет → войти не удаётся → экран предлагает войти. Никаких команд и стектрейсов.
  const body = (await page.locator('main.body').textContent()) ?? '';

  expect(body).not.toMatch(/npm run|node calculator|--once|вычислител/i);
  expect(body.length).toBeGreaterThan(0);
});

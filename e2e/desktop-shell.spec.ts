/**
 * Десктопная оболочка продукта — макет V2 «Рабочий стол» (утверждён владельцем
 * 2026-07-11, design/desktop-layout-mockups.html).
 *
 * Суть решения: на широком экране навигация — постоянный рельс СЛЕВА, нижняя
 * панель прячется; на телефоне всё наоборот, и мобильная раскладка не меняется.
 * Порог — 1024px, объявлен в SideRail.svelte и BottomNav.svelte.
 *
 * Проекты Playwright дают ровно эти две ширины: mobile 430 и desktop 1440,
 * поэтому один сценарий проверяет обе стороны решения.
 *
 * Инварианты, которые легко сломать невнимательной правкой CSS:
 *   · навигация ровно одна — рельс и нижняя панель никогда не видны разом
 *     (иначе у человека два меню и двоящийся бренд);
 *   · на десктопе контент реально широкий, а не колонка 430px по центру —
 *     это и была правка владельца («узко в центре, хотелось бы шире»).
 */
import { expect, test } from '@playwright/test';

const DESKTOP_MIN_WIDTH = 1024;
const NARROW_COLUMN = 430; // прежняя ширина приложения на любом экране

for (const route of ['/profile', '/relations']) {
  test(`оболочка ${route}: десктоп — рельс слева, телефон — нижняя панель, и никогда обе разом`, async ({
    page,
  }) => {
    await page.goto(route);

    const rail = page.locator('nav.rail');
    const bottomNav = page.locator('nav.bnav');
    const desktop = (page.viewportSize()?.width ?? 0) >= DESKTOP_MIN_WIDTH;

    if (desktop) {
      await expect(rail).toBeVisible();
      await expect(bottomNav).toBeHidden();

      // Рельс прижат к левому краю и тянется во всю высоту, а не полоской сверху
      const railBox = await rail.boundingBox();
      expect(railBox!.x).toBeLessThan(10);
      expect(railBox!.height).toBeGreaterThan(400);

      // Контент занимает ширину, а не жмётся в прежнюю колонку (правка владельца)
      const bodyBox = await page.locator('main.body').boundingBox();
      expect(bodyBox!.width).toBeGreaterThan(NARROW_COLUMN * 1.6);
    } else {
      await expect(bottomNav).toBeVisible();
      await expect(rail).toBeHidden();

      // Мобильная раскладка не изменилась: контент по-прежнему узкая колонка
      const bodyBox = await page.locator('main.body').boundingBox();
      expect(bodyBox!.width).toBeLessThanOrEqual(NARROW_COLUMN);
    }
  });
}

test('десктоп: бренд не двоится — знак и водмарк живут только в рельсе', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH, 'проверка только для десктопа');

  await page.goto('/profile');
  // Водмарк есть в разметке и рельса, и шапки; на десктопе видимым остаётся один
  await expect(page.getByText('Пространство NDim')).toHaveCount(2);
  await expect(page.locator('nav.rail').getByText('Пространство NDim')).toBeVisible();
  await expect(page.locator('header.bar').getByText('Пространство NDim')).toBeHidden();
});

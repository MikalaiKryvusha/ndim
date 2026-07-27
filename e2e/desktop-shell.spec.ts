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
 *
 * 2026-07-27, макет V3-А (ideas/17, утверждён владельцем): шапка тянется ВО ВСЮ ШИРИНУ
 * поверх рельса, знак и «Пространство NDim» переехали из рельса в неё, рельс начинается
 * ПОД шапкой. Стражи ниже перенацелены на новую геометрию — предмет проверки тот же:
 * бренд не двоится, рельс прибит и не теряет пункты, две навигации не видны разом.
 */
import { expect, test } from '@playwright/test';

const DESKTOP_MIN_WIDTH = 1024;
const NARROW_COLUMN = 430; // прежняя ширина приложения на любом экране

// «/dims» добавлен после bugs/06: экран «Измерения» вышел без десктопной сетки .screen,
// и рельс лёг СВЕРХУ во всю ширину. Геометрия рельса — ровно тот инвариант, который это ловит.
for (const route of ['/profile', '/relations', '/space', '/dims']) {
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

      // Шапка — ВО ВСЮ ШИРИНУ окна и поверх рельса (V3-А): она первая строка сетки на
      // все колонки. Если правка вернёт её в колонку контента, шапка начнётся на 232px.
      // Сравниваем с шириной РАСКЛАДКИ, а не вьюпорта: `scrollbar-gutter: stable`
      // (bugs/59) забирает ~15px, и сравнение с viewport краснело бы на верном коде.
      const layoutWidth = await page.evaluate(() => document.body.getBoundingClientRect().width);
      const barBox = await page.locator('header.bar').boundingBox();
      expect(barBox!.x).toBe(0);
      expect(Math.round(barBox!.width)).toBe(Math.round(layoutWidth));

      // Рельс прижат к левому краю, начинается ПОД шапкой и тянется вниз, а не полоской сверху
      const railBox = await rail.boundingBox();
      expect(railBox!.x).toBeLessThan(10);
      expect(railBox!.y).toBeCloseTo(barBox!.height, 0);
      expect(railBox!.height).toBeGreaterThan(400);

      // Контент занимает ширину, а не жмётся в прежнюю колонку (правка владельца)
      const bodyBox = await page.locator('main.body').boundingBox();
      expect(bodyBox!.width).toBeGreaterThan(NARROW_COLUMN * 1.6);

      // Шапка и рельс ПРИБИТЫ (bugs/34, bugs/49): скролл в самый низ не увозит их с экрана.
      // Рельс липнет к нижнему краю шапки (--bar-h), а не к нулю, — иначе он заехал бы
      // под шапку, а его последний пункт вылез бы за низ вьюпорта.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const barAfterScroll = await page.locator('header.bar').boundingBox();
      expect(barAfterScroll!.y).toBe(0);
      const railAfterScroll = await rail.boundingBox();
      expect(railAfterScroll!.y).toBeCloseTo(barAfterScroll!.height, 0);
      await expect(rail.getByText(/Меню|Menu/)).toBeInViewport();
    } else {
      await expect(bottomNav).toBeVisible();
      await expect(rail).toBeHidden();

      // Мобильная раскладка не изменилась: контент по-прежнему узкая колонка
      const bodyBox = await page.locator('main.body').boundingBox();
      expect(bodyBox!.width).toBeLessThanOrEqual(NARROW_COLUMN);
    }
  });
}

/**
 * В рельсе нет мёртвых пунктов.
 *
 * Поймано на БОЕВОМ выкате 2026-07-12: экран «Меню» был реализован ещё накануне, но в рельсе
 * у пункта так и остался `href: null` со времён заглушки «скоро» — человек жал «Меню», и не
 * происходило ничего. Существующий e2e меню это пропустил: он берёт ссылку через `.first()`,
 * а первой в разметке идёт МОБИЛЬНАЯ нижняя панель, где ссылка была настоящая.
 * Поэтому здесь проверяем именно рельс и именно каждый пункт.
 */
test('десктоп: в рельсе нет мёртвых пунктов — каждый раздел ведёт на свой экран', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH, 'проверка только для десктопа');

  await page.goto('/profile');
  const rail = page.locator('nav.rail');

  // С V3-А рельс — чистая навигация: знак продукта уехал в шапку, и уточнение
  // `:not(.brand)` больше не нужно. Страж стережёт ровно то же, что и раньше: каждый
  // ПУНКТ рельса ведёт на свой экран и ни один не мёртв.
  for (const href of ['/profile', '/relations', '/space', '/dims', '/menu']) {
    await expect(rail.locator(`a[href="${href}"]`)).toBeVisible();
  }
  // Ровно пять пунктов и ни одного лишнего: если бренд когда-нибудь вернётся в рельс
  // вторым знаком, страж это заметит.
  await expect(rail.locator('a')).toHaveCount(5);
});

test('десктоп: бренд не двоится — знак и водмарк живут только в шапке', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH, 'проверка только для десктопа');

  await page.goto('/profile');
  // С V3-А водмарк есть РОВНО в одном месте ОБОЛОЧКИ — в шапке во всю ширину. Прежде их было
  // два (рельс + шапка), и на десктопе шапку приходилось прятать. Считаем именно по оболочке:
  // в «Меню» и документах название продукта законно стоит ещё и в тексте страницы.
  await expect(page.locator('header.bar, nav.rail').getByText('Пространство NDim')).toHaveCount(1);
  await expect(page.locator('header.bar').getByText('Пространство NDim')).toBeVisible();
  await expect(page.locator('nav.rail').getByText('Пространство NDim')).toHaveCount(0);
  // Знак кликабелен и ведёт в продукт, а не на лендинг (bugs/61) — ссылка переехала
  // вместе с брендом.
  await expect(page.locator('header.bar a.brand')).toHaveAttribute('href', '/profile');
});

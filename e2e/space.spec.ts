/**
 * Смоук экрана «Пространство» (/space) на продакшен-сборке БЕЗ эмуляторов.
 *
 * Полная картина с данными (плитки, тренды, «Сегодня», сервер синхронизации) живёт на
 * стенде: `npm run stand` → http://localhost:5173/space. Здесь — то, что обязано работать
 * всегда: экран пререндерится, не индексируется и честно деградирует без стенда.
 *
 * ⚠️ Стража «версия вшита в сборку» здесь БОЛЬШЕ НЕТ — он не удалён, а ПЕРЕЕХАЛ в
 * `menu.spec.ts` вместе с самим виджетом версий (bugs/66, слово владельца: «со страницы
 * Пространство убрать виджет Версии»). Стеречь версию на экране, где её нет, — значит
 * стеречь пустоту.
 *
 * ⚠️ Прогон требует, чтобы эмуляторы были ПОГАШЕНЫ: проверка «данные не загрузились» ждёт их
 * отсутствия и при живом стенде даст ложное падение (EXP-0027).
 */
import { expect, test } from '@playwright/test';

test('пространство: шелл пререндерен — заголовок, лид и noindex в сыром HTML', async ({ request }) => {
  const response = await request.get('/space');
  expect(response.ok()).toBeTruthy();
  const html = (await response.text()).replace(/ |&nbsp;/g, ' ');

  for (const text of ['Пространство NDim', 'Пространство', 'метрики и статистика', 'noindex']) {
    expect(html).toContain(text);
  }
});

test('пространство: без данных — честная ошибка, и ни одной выдуманной цифры', async ({ page }) => {
  await page.goto('/space');
  await expect(page.getByText('Не удалось загрузить', { exact: false })).toBeVisible({ timeout: 20000 });
  // Цифр не выдумываем: ни одной метрики на экране быть не должно.
  await expect(page.getByText('человек в Пространстве')).toHaveCount(0);
  // Навигация жива в любом обличье: на телефоне — нижняя панель, на десктопе — рельс.
  // Ищем ссылку внутри НАВИГАЦИИ: знак продукта тоже ведёт на «Профиль» (bugs/61), но он
  // живёт в шапке (V3-А), а не в навигации. Проверяется ровно прежнее: ПУНКТ навигации
  // ровно один и он видим, а не «сколько всего ссылок на /profile на экране».
  await expect(page.locator('nav a[href="/profile"]:visible')).toHaveCount(1);
});

test('пространство: раздел открыт в навигации — и на телефоне, и на десктопе', async ({ page }) => {
  // Ищем по адресу, а не по имени: в доступное имя ссылки входит иконка («✳ Пространство»),
  // а в рельсе то же слово несёт бренд «Пространство NDim» — по имени вышла бы двусмысленность.
  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto('/profile');
  await expect(page.locator('nav.bnav a[href="/space"]')).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/relations');
  await expect(page.locator('nav.rail a[href="/space"]')).toBeVisible();
  // На десктопе нижняя панель прячется — иначе навигации было бы две разом (макет V2).
  await expect(page.locator('nav.bnav')).toBeHidden();
});

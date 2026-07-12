/**
 * Смоук экрана «Пространство» (/space) на продакшен-сборке БЕЗ эмуляторов.
 *
 * Полная картина с данными (плитки, тренды, «Сегодня», сервер синхронизации) живёт на
 * стенде: `npm run stand` → http://localhost:5173/space. Здесь — то, что обязано работать
 * всегда: экран пререндерится, не индексируется, честно деградирует без стенда, а версия
 * приложения действительно вшита в сборку.
 *
 * ⚠️ Прогон требует, чтобы эмуляторы были ПОГАШЕНЫ: проверка «данные не загрузились» ждёт их
 * отсутствия и при живом стенде даст ложное падение (EXP-0027).
 */
import { expect, test } from '@playwright/test';

// JSON-модуль отдаёт только default-экспорт: именованного `version` у него нет.
import pkg from '../package.json' with { type: 'json' };

const APP_VERSION: string = pkg.version;

test('пространство: шелл пререндерен — заголовок, лид и noindex в сыром HTML', async ({ request }) => {
  const response = await request.get('/space');
  expect(response.ok()).toBeTruthy();
  const html = (await response.text()).replace(/ |&nbsp;/g, ' ');

  for (const text of ['Пространство NDim', 'Пространство', 'метрики и статистика', 'noindex']) {
    expect(html).toContain(text);
  }
});

test('пространство: версия приложения вшита в сборку, а не выдумана в браузере', async ({ request }) => {
  // Источник версии один — package.json, и подставляет её сборка (vite define). Если define
  // отвалится, виджет «Версии» покажет пустоту — а строка обязана лежать в самом артефакте.
  const html = await (await request.get('/space')).text();
  const chunks = [...new Set([...html.matchAll(/\/_app\/immutable\/[^"']+\.js/g)].map((m) => m[0]))];
  expect(chunks.length).toBeGreaterThan(0);

  const sources = await Promise.all(chunks.map(async (url) => (await request.get(url)).text()));
  expect(sources.some((source) => source.includes(APP_VERSION))).toBeTruthy();
});

test('пространство: без данных — честная ошибка, и ни одной выдуманной цифры', async ({ page }) => {
  await page.goto('/space');
  await expect(page.getByText('Не удалось загрузить', { exact: false })).toBeVisible({ timeout: 20000 });
  // Цифр не выдумываем: ни одной метрики на экране быть не должно.
  await expect(page.getByText('человек в Пространстве')).toHaveCount(0);
  // Навигация жива в любом обличье: на телефоне — нижняя панель, на десктопе — рельс.
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

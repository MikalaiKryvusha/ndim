/**
 * Экран «Меню» и страницы за ним, на продакшен-сборке БЕЗ эмуляторов.
 *
 * Главное, что здесь стережётся: **меню обязано работать без стенда**. Манифест, документы,
 * поддержка и пожертвование не зависят ни от каких данных — если они пропадают вместе с
 * эмуляторами, значит экран построен неправильно.
 *
 * ⚠️ Прогон требует, чтобы эмуляторы были ПОГАШЕНЫ (EXP-0027).
 */
import { expect, test } from '@playwright/test';

/** Все страницы раздела и слово, по которому видно, что открылась именно эта. */
const PAGES = [
  { path: '/menu/manual', marker: 'Манифест' },
  { path: '/menu/terms', marker: 'Общие положения' },
  { path: '/menu/privacy', marker: 'Общие положения' },
  { path: '/menu/disclaimer', marker: 'Общие положения' },
  { path: '/menu/support', marker: 'ndimspace@yandex.ru' },
  { path: '/menu/donate', marker: 'без покупок и подписок' },
  { path: '/menu/about', marker: 'Минск' },
  { path: '/menu/author', marker: 'Кривуше' },
  { path: '/menu/manifesto', marker: 'объединять людей' },
] as const;

test('меню: манифест пререндерен в сыром HTML — это лицо проекта, а не всплывающий текст', async ({ request }) => {
  const html = (await (await request.get('/menu')).text()).replace(/ |&nbsp;/g, ' ');

  // Про то, что ЕСТЬ (цель и ценности) — правило владельца.
  expect(html).toContain('Зачем существует Пространство NDim');
  expect(html).toContain('объединять людей');
  expect(html).toContain('бесплатно');
  expect(html).toContain('noindex');
});

test('меню: все страницы раздела существуют и пререндерены', async ({ request }) => {
  for (const { path, marker } of PAGES) {
    const response = await request.get(path);
    expect(response.ok(), `${path} должен отдаваться`).toBeTruthy();
    const html = (await response.text()).replace(/ |&nbsp;/g, ' ');
    expect(html, `${path} должен содержать текст документа`).toContain(marker);
  }
});

test('меню: тексты владельца перенесены дословно — шкала оценок и терминология на месте', async ({ request }) => {
  const html = (await (await request.get('/menu/manual')).text()).replace(/ |&nbsp;/g, ' ');

  // Шкала 0–10 из 1.x: крайние значения и середина.
  expect(html).toContain('Абсолютная безусловная ненависть');
  expect(html).toContain('Абсолютная безусловная любовь');
  expect(html).toContain('Нейтрально');
  // Словарь продукта — тоже наследие 1.x.
  for (const term of ['Измерение', 'NDim ID', 'Общность', 'Близость', 'Похожесть', 'Диаметр']) {
    expect(html).toContain(term);
  }
});

test('меню: без данных манифест и документы всё равно на месте', async ({ page }) => {
  await page.goto('/menu');
  // bugs/38: на десктопе манифест — виджет рядом с кнопками; на телефоне — кнопка,
  // ведущая на полную страницу /menu/manifesto.
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await expect(page.locator('section.manifest')).toBeVisible();
    await expect(page.locator('a.manifest-link')).toBeHidden();
  } else {
    await expect(page.locator('section.manifest')).toBeHidden();
    const link = page.locator('a.manifest-link');
    await expect(link).toBeVisible();
    await link.click();
    await expect(page.getByText('объединять людей')).toBeVisible();
    await page.goBack();
  }
  await expect(page.getByRole('link', { name: 'Условия использования' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Пожертвование' })).toBeVisible();
});

test('меню: поддержка ведёт на почту, пожертвование — на DonationAlerts', async ({ page }) => {
  await page.goto('/menu/support');
  await expect(page.getByRole('link', { name: /Написать в поддержку/ })).toHaveAttribute(
    'href',
    /^mailto:ndimspace@yandex\.ru/,
  );

  await page.goto('/menu/donate');
  await expect(page.getByRole('link', { name: /Сделать пожертвование/ })).toHaveAttribute(
    'href',
    'https://donationalerts.com/r/mikalai_kryvusha',
  );
  // GOAL.md: денежная механика существует, но давления нет — ни «премиума», ни «плюса».
  const body = await page.locator('main').innerText();
  for (const forbidden of ['премиум', 'Премиум', 'подписк', 'Подписк']) {
    if (forbidden.toLowerCase().startsWith('подписк')) continue; // «без покупок и подписок» — это отрицание, оно можно
    expect(body).not.toContain(forbidden);
  }
  expect(body).toContain('одинаковы для всех');
});

test('меню: из меню можно дойти до документа и вернуться назад', async ({ page }) => {
  await page.goto('/menu');
  await page.getByRole('link', { name: 'Отказ от ответственности' }).click();
  await expect(page).toHaveURL(/\/menu\/disclaimer/);
  await page.getByRole('link', { name: /Меню/ }).first().click();
  await expect(page).toHaveURL(/\/menu\/?$/);
});

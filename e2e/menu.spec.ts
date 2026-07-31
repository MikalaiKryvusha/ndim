/**
 * Экран «Меню» и страницы за ним, на продакшен-сборке БЕЗ эмуляторов.
 *
 * Главное, что здесь стережётся: **меню обязано работать без стенда**. Документы,
 * поддержка и пожертвование не зависят ни от каких данных — если они пропадают вместе с
 * эмуляторами, значит экран построен неправильно.
 *
 * ⚠️ Прогон требует, чтобы эмуляторы были ПОГАШЕНЫ (EXP-0027).
 */
import { expect, test } from '@playwright/test';

// JSON-модуль отдаёт только default-экспорт: именованного `version` у него нет.
import pkg from '../package.json' with { type: 'json' };

const APP_VERSION: string = pkg.version;

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
] as const;

/**
 * ПЕРЕЕХАВШИЙ СТРАЖ (был в space.spec.ts до bugs/66, когда виджет версий стоял на
 * «Пространстве»). Стережёт ровно то же самое и по той же причине: источник версии один —
 * package.json, подставляет её сборка (vite define). Отвалится define — виджет покажет
 * пустоту, поэтому строку ищем в самом АРТЕФАКТЕ, а не на отрисованной странице.
 * Адрес другой, смысл прежний — это перенос, а не ослабление.
 */
test('меню: версия приложения вшита в сборку, а не выдумана в браузере', async ({ request }) => {
  const html = await (await request.get('/menu')).text();
  const chunks = [...new Set([...html.matchAll(/\/_app\/immutable\/[^"']+\.js/g)].map((m) => m[0]))];
  expect(chunks.length).toBeGreaterThan(0);

  const sources = await Promise.all(chunks.map(async (url) => (await request.get(url)).text()));
  expect(sources.some((source) => source.includes(APP_VERSION))).toBeTruthy();
});

/*
 * ⚠️ ПРОВЕРКА «манифест пререндерен в сыром HTML» УДАЛЕНА 2026-07-31 — вместе с самим
 * манифестом, а не «чтобы стало зелёно».
 *
 * Слово владельца: «и виджет и страницу удаляем - это была отсебятина ИИ, я этого не делал в
 * оригинальном НДим». Виджет «Меню», страница `/menu/manifesto` и модуль
 * `src/lib/content/manifest.ts` удалены. Проверять пререндер удалённого блока нечего.
 *
 * Что при этом НЕ потеряно и остаётся под охраной: сам текст манифеста живёт разделом
 * «1. Манифест» РУКОВОДСТВА пользователя, и его стережёт строка `{ path: '/menu/manual',
 * marker: 'Манифест' }` в PAGES ниже — она была здесь и раньше и не менялась.
 * Пререндер `/menu` продолжает проверяться тестом «все страницы раздела существуют».
 */

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
  // Блок про манифест (bugs/38) убран вместе с манифестом — см. пояснение выше.
  // 🔴 Взамен стережём ОБРАТНОЕ утверждение: удалённая сущность не должна вернуться
  // незаметно. Без этой строки следующая сессия могла бы «восстановить» виджет, и ни одна
  // проверка не возразила бы.
  await expect(page.locator('section.manifest')).toHaveCount(0);
  await expect(page.locator('a.manifest-link')).toHaveCount(0);
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

/**
 * ПРОБА ГОДА-ПРОЧЕРКА В РАСКРЫТОЙ КАРТОЧКЕ — `ideas/26` п.2 (ПРИБОР-наблюдение, не страж).
 *
 * Боевые данные несут year: '-' у 170 записей («года нет», а не год). Правило «прочерк = нет
 * значения» живёт в `dimCardTitle` (`src/lib/model/feed.ts`, юниты стерегут его); раскрытая
 * карточка `/dims` переведена на то же правило. Проба смотрит ЖИВЫМ браузером:
 *   · «Йога» (сид, year '-') — строки «Год» НЕТ;
 *   · контроль прибора (`EXP-0082`): «Таксист» (1976) — строка «Год» ЕСТЬ,
 *     иначе зелёное означало бы лишь то, что проба не нашла ни одной строки года вовсе.
 *
 * Запуск: `npm run stand` → `node tools/probe-ideas26-year.mjs`
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';

const browser = await chromium.launch();
let fail = false;
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 860 }, locale: 'ru-RU' });

  /** Раскрывает карточку по имени и возвращает текст её раскрытой части. */
  async function deepText(query, name) {
    await page.goto(`${BASE}/dims`, { waitUntil: 'domcontentloaded' });
    await page.locator('article').first().waitFor({ timeout: 20000 }); // лента поднялась
    // Путь человека: тулбар → кнопка «Поиск измерения» разворачивает панель → ввод → «Искать».
    await page.getByRole('button', { name: 'Поиск измерения' }).click();
    const search = page.getByPlaceholder('Введите искомое название');
    await search.waitFor({ timeout: 10000 });
    await search.fill(query);
    await page.getByRole('button', { name: 'Искать', exact: true }).click();
    await page.waitForTimeout(1200);
    const card = page.locator('article', { hasText: name }).first();
    await card.getByText(name, { exact: false }).first().click();
    await page.waitForTimeout(600);
    return card.locator('.deep').innerText();
  }

  // ⚠️ innerText отдаёт заголовки КАПСОМ (text-transform на h4) и с двойными переносами —
  // регистрозависимый регэксп тут слеп на исправном И на сломанном продукте (EXP-0086).
  const yoga = await deepText('Йога', 'Йога');
  const hasYearYoga = /(^|\n)год(\s|$)/i.test(yoga);
  console.log(`«Йога» (year '-'): строка «Год» ${hasYearYoga ? '❌ ЕСТЬ (дефект)' : '✅ отсутствует'}`);
  if (hasYearYoga) fail = true;

  const taxi = await deepText('Таксист', 'Таксист');
  const hasYearTaxi = /(^|\n)год\s*\n+\s*1976/i.test(taxi);
  console.log(`«Таксист» (1976): строка «Год 1976» ${hasYearTaxi ? '✅ на месте (контроль прибора)' : '❌ НЕ найдена — проба слепа'}`);
  if (!hasYearTaxi) fail = true;
} finally {
  await browser.close();
}
process.exit(fail ? 1 : 0);

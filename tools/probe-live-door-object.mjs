#!/usr/bin/env node
/**
 * ПРИБОР — ВИДИТ ЛИ ВОШЕДШИЙ ИЗ КАРТОЧКИ СВОЙ ОБЪЕКТ (`plans/75`, повтор замера Ш2).
 *
 * ЗАЧЕМ. Замер Ш2 от 2026-08-28 упёрся в честную границу СТЕНДА и записал её вслух: «виден ли
 * объект на экране „Измерения“, на стенде выяснить НЕЛЬЗЯ — в засеянном каталоге стенда 49
 * измерений, и того, что оценила дверь, среди них нет (REST эмулятора: 404). Это артефакт
 * стенда, а не факт продукта; замер повторить на стейдже». Этот прибор его и повторяет — на
 * живом контуре, где каталог настоящий.
 *
 * 🔴 ПОЧЕМУ НЕ `tools/probe-catalog-door.mjs`. Тот прибор НАМЕРЕННО не метит свои сессии
 * меткой `ndim-probe` (одна из его проверок — «касание двери СОСЧИТАНО воронкой», под меткой
 * она не смогла бы позеленеть никогда) и потому так же намеренно ОТКАЗЫВАЕТСЯ работать вне
 * localhost. Здесь вопрос другой — «виден ли объект», — счётчики не проверяются вовсе, и
 * метка ставится ОБЯЗАТЕЛЬНО: прогон идёт по живому контуру, а прибор, неотличимый от
 * человека, — это ровно болезнь `bugs/202`, за которую уже заплачено 77 гостями из 25 дней.
 *
 * ⚠️ ЧТО ЭТОТ ПРОГОН ПИШЕТ В БАЗУ КОНТУРА: одного гостя (живёт 7 дней и удаляется целиком) и
 * одну его оценку. Это цена вопроса, и она названа до прогона: без настоящего входа дверью
 * ответить на вопрос нечем — экран «Измерения» существует только у вошедшего.
 *
 * Запуск:  node tools/probe-live-door-object.mjs [--base https://ndim-stage.web.app] [--headed]
 * Ворота:  нет — и это ЗАПРЕТ, а не пропуск. Прибор ходит по ЖИВОМУ контуру и ПИШЕТ В БАЗУ —
 *          одного гостя и одну оценку за прогон (цена названа выше). Ворота гоняют все и часто;
 *          такой прибор в них засеял бы контур мусором. Зовётся руками, бой — только по --prod.
 * ВЫХОД:   кадры + вердикт в test-results/live-door-object/.
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { markProbeContext } from './lib/probe-mark.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'test-results/live-door-object');

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : fallback;
};
const BASE = opt('--base', 'https://ndim-stage.web.app').replace(/\/$/, '');

/**
 * ⛔ ГРАНИЦА КОНТУРА. Прибор пускается только на стейдж и бой — и на бой лишь по явному
 * флагу. Опечатка в адресе не имеет права увести прогон в чужой продукт.
 */
const KNOWN = ['https://ndim-stage.web.app', 'https://ndim-space.web.app'];
if (!KNOWN.includes(BASE)) {
  console.error(`Незнакомый контур: ${BASE}. Разрешены: ${KNOWN.join(' · ')}`);
  process.exit(2);
}
if (BASE.includes('ndim-space') && !argv.includes('--prod')) {
  console.error('Бой требует явного --prod: прогон заводит гостя и пишет оценку.');
  process.exit(2);
}

const шаги = [];
const шаг = (что, ок, деталь = '') => {
  шаги.push({ что, ок, деталь });
  console.log(`  ${ок ? '✅' : '❌'} ${что}${деталь ? ` — ${деталь}` : ''}`);
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: !argv.includes('--headed') });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  // 🔴 Метка ДО первой навигации — иначе первый шаг воронки уже сосчитан (см. шапку probe-mark).
  await markProbeContext(context);
  const page = await context.newPage();

  const отчёт = { at: new Date().toISOString(), base: BASE, slug: null, title: null, шаги };

  try {
    // ── 1. Найти живую карточку каталога ──────────────────────────────────────────────
    await page.goto(`${BASE}/ru/catalog`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const href = await page.locator('a[href*="/ru/dimension/"]').first().getAttribute('href');
    шаг('каталог контура отдал ссылку на карточку', href !== null, href ?? 'ссылок нет');
    if (href === null) throw new Error('в каталоге не нашлось ни одной карточки');
    const slug = href.split('/ru/dimension/')[1];
    отчёт.slug = slug;

    // ── 2. Карточка: запомнить, КАК называется объект ────────────────────────────────
    await page.goto(`${BASE}/ru/dimension/${slug}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const title = (await page.locator('h1').first().innerText().catch(() => '')).trim();
    отчёт.title = title;
    шаг('карточка открылась и назвала объект', title.length > 0, title || 'h1 пуст');
    await page.screenshot({ path: resolve(OUT, '1-card.png') });

    // ── 3. Дверь: коснуться звезды ───────────────────────────────────────────────────
    // Остров вешает обработчики инлайн-скриптом; признак готовности — ответ разметки на клик.
    // Селектор снят С ЖИВОЙ РАЗМЕТКИ контура (curl), а не придуман: первая версия искала
    // `[data-door-star]`, которого не существует, и прибор объявил бы «выката нет» на живой двери.
    const звезда = page.locator('section[data-door] button[data-star][aria-label="8"]').first();
    const естьЗвезда = (await звезда.count()) > 0;
    шаг('дверь на карточке присутствует', естьЗвезда);
    if (!естьЗвезда) throw new Error('на карточке нет двери — выкат до контура не доехал?');
    await звезда.click({ timeout: 15_000 });

    // Панель после касания либо сразу переход — ждём любого из двух.
    await page.waitForTimeout(2500);
    await page.screenshot({ path: resolve(OUT, '2-after-touch.png') });

    const кнопкаВхода = page.getByRole('link', { name: /Войти в Пространство/i }).first();
    if ((await кнопкаВхода.count()) > 0) {
      await кнопкаВхода.click({ timeout: 15_000 });
    }
    await page.waitForURL(/\/profile/, { timeout: 45_000 }).catch(() => {});
    const наПрофиле = /\/profile/.test(page.url());
    шаг('дверь привела в Пространство (экран «Профиль»)', наПрофиле, page.url());
    await page.waitForTimeout(3000);
    await page.screenshot({ path: resolve(OUT, '3-first-screen.png'), fullPage: true });

    // ── 4. ГЛАВНЫЙ ВОПРОС ЗАМЕРА: виден ли объект на первом экране ──────────────────
    const первыйЭкран = await page.evaluate(() => document.body?.innerText ?? '');
    const наПервомЭкране = title.length > 0 && первыйЭкран.includes(title);
    шаг('объект виден на ПЕРВОМ экране (профиль гостя)', наПервомЭкране, наПервомЭкране ? title : 'нет');

    // ── 5. Экран «Измерения»: вкладки «Все» и «Мои» ────────────────────────────────
    await page.goto(`${BASE}/dims`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(4000);
    const всеТекст = await page.evaluate(() => document.body?.innerText ?? '');
    шаг('экран «Измерения» открылся', всеТекст.length > 200, `${всеТекст.length} знаков`);
    шаг(
      'объект виден на вкладке «Все» (очередь НЕ оценённого)',
      всеТекст.includes(title),
      всеТекст.includes(title) ? 'да' : 'нет — по построению ленты оценённое из неё уходит',
    );
    await page.screenshot({ path: resolve(OUT, '4-dims-all.png'), fullPage: true });

    const мои = page.getByRole('button', { name: /Мой NDim ID/i }).first();
    if ((await мои.count()) > 0) {
      await мои.click({ timeout: 15_000 });
      await page.waitForTimeout(3000);
      const моиТекст = await page.evaluate(() => document.body?.innerText ?? '');
      шаг('🔑 объект виден на вкладке «Мой NDim ID»', моиТекст.includes(title), moiДеталь(моиТекст, title));
      await page.screenshot({ path: resolve(OUT, '5-dims-mine.png'), fullPage: true });
    } else {
      шаг('вкладка «Мой NDim ID» найдена', false, 'кнопки нет — разметка изменилась?');
    }
  } catch (error) {
    шаг('прогон дошёл до конца', false, String(error).split('\n')[0].slice(0, 160));
    await page.screenshot({ path: resolve(OUT, 'x-failure.png'), fullPage: true }).catch(() => {});
  } finally {
    await context.close();
    await browser.close();
  }

  writeFileSync(resolve(OUT, 'verdict.json'), JSON.stringify(отчёт, null, 2), 'utf8');
  const провалов = шаги.filter((s) => !s.ок).length;
  console.log(`\n${провалов === 0 ? '✅' : '🔴'} шагов ${шаги.length}, не сошлось ${провалов}`);
  console.log(`📄 ${OUT}`);
  process.exit(провалов === 0 ? 0 : 1);
}

/** Деталь для вкладки «Мои»: показать, что там вообще есть, если объекта нет. */
function moiДеталь(текст, title) {
  if (текст.includes(title)) return `«${title}»`;
  return `нет «${title}»; на экране: ${текст.slice(0, 120).replace(/\s+/g, ' ')}…`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

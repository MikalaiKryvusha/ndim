/**
 * Страж окна «Как меня видят» — `bugs/76` (волна `ideas/21`, пункт 3).
 *
 * Слово владельца:
 *   «с "Как меня видят" навигация работает некорректно, закрыло приложение, словно родительский
 *    Профиль не был в стеке навигации».
 *
 * Так и было: окно ВЫГЛЯДЕЛО дочерней страницей (полный экран, заголовок, стрелка «Назад»), но
 * записи в истории у него не было — системная «Назад» обращалась к истории браузера и уводила
 * человека из приложения. Спецификация при этом лежала прямо в комментарии кода («„Назад“
 * возвращает в профиль») и была реализована только ЭКРАННОЙ кнопкой.
 *
 * Лечение — штатное неглубокое маршрутирование SvelteKit (`pushState` + `page.state`). Поэтому
 * страж проверяет не «закрылось ли окно», а ТРИ вещи разом: запись в истории появилась, адрес
 * НЕ изменился, и системная «Назад» возвращает в профиль, а не из приложения.
 *
 * ⚠️ Отдельно стережём то, чем легко заменить дефект: блокировку прокрутки подложки. Если
 * закрытие через историю не снимет `body.overflow`, человек получит намертво замерший экран —
 * дефект хуже исходного.
 *
 * ⚠️ И то, что легко сломать накоплением: закрытие ЭКРАННОЙ стрелкой обязано снимать запись из
 * истории, а не добавлять ещё одну. Иначе после пяти открытий человеку придётся жать «Назад»
 * пять раз, чтобы уйти со страницы.
 *
 * Запуск: `npm run stand`, затем `node tools/verify-bug76.mjs` (+`--quick`).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const OUT = 'test-results/bug76';
const QUICK = process.argv.includes('--quick');
mkdirSync(OUT, { recursive: true });

const COMBOS = QUICK ? [['light', 390]] : [['light', 390], ['light', 1440], ['dark', 390], ['dark', 1440]];

let pass = 0;
const fails = [];
function check(ok, what, detail = '') {
  if (ok) pass++;
  else {
    fails.push(`${what}${detail ? ' — ' + detail : ''}`);
    console.log(`  ❌ ${what}${detail ? ' — ' + detail : ''}`);
  }
}

const browser = await chromium.launch();
try {
  for (const [theme, width] of COMBOS) {
    const tag = `${theme}-${width}`;
    console.log(`\n«Как меня видят» и стек навигации (${theme}, ${width}):`);
    const ctx = await browser.newContext({ viewport: { width, height: 850 }, locale: 'ru-RU' });
    await ctx.addInitScript((v) => localStorage.setItem('ndim-theme', v), theme);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    const look = () =>
      page.evaluate(() => ({
        open: !!document.querySelector('.seeme'),
        overflow: document.body.style.overflow,
        path: location.pathname,
        len: history.length,
      }));

    // Приходим на «Профиль» ПО ССЫЛКЕ с другого экрана — так у нас есть куда возвращаться,
    // и «уход из приложения» отличим от «возврата в профиль».
    await page.goto(`${BASE}/space`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.locator('a:visible', { hasText: /^Профиль$/ }).first().click();
    await page.waitForTimeout(3200);

    const start = await look();
    check(start.path === '/profile', 'мы на «Профиле»', start.path);
    check(start.open === false, 'окно закрыто в исходном состоянии');

    // 1 · открытие
    await page.locator('button', { hasText: /Как меня видят/ }).first().click();
    await page.waitForTimeout(1300);
    const opened = await look();
    await page.screenshot({ path: `${OUT}/open-${tag}.png` });
    check(opened.open === true, 'окно открылось');
    check(opened.len === start.len + 1, '🔑 открытие ДОБАВИЛО запись в историю', `${start.len} → ${opened.len}`);
    check(opened.path === '/profile', 'адрес не изменился (окно осталось окном)', opened.path);
    check(opened.overflow === 'hidden', 'прокрутка подложки заблокирована');

    // 2 · СИСТЕМНАЯ «Назад» — то, на чём владелец вылетел из приложения
    await page.goBack();
    await page.waitForTimeout(1400);
    const back = await look();
    await page.screenshot({ path: `${OUT}/after-back-${tag}.png` });
    check(back.open === false, '🔑 системная «Назад» ЗАКРЫВАЕТ окно');
    check(back.path === '/profile', '🔑 системная «Назад» оставляет нас в «Профиле», а не уносит из приложения', back.path);
    check(back.overflow !== 'hidden', 'блокировка прокрутки снята', `overflow="${back.overflow}"`);

    // 3 и 4 · экранная стрелка и Escape закрывают ТЕМ ЖЕ путём, что и системная «Назад».
    //
    // ⚠️ Мерить это через `history.length` НЕЛЬЗЯ — при возврате оно НЕ убывает (запись
    // остаётся впереди, «вперёд» ведь работает). Первая редакция стража на этом соврала и
    // красила исправный продукт. Меряем ПОЛОЖЕНИЕМ В СТЕКЕ: если закрытие сняло запись,
    // один «Назад» уводит туда, откуда пришли; если добавило — мы застрянем на «Профиле».
    for (const [name, close] of [
      ['экранная стрелка', async () => page.locator('.back-btn').first().click()],
      ['Escape', async () => page.keyboard.press('Escape')],
    ]) {
      // На сломанном коде предыдущий круг мог унести нас с «Профиля» — возвращаемся, чтобы
      // страж досчитал до конца и напечатал ВСЕ покраснения, а не упал стеком на первом.
      if ((await look()).path !== '/profile') {
        await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
      }
      await page.locator('button', { hasText: /Как меня видят/ }).first().click();
      await page.waitForTimeout(1200);
      check((await look()).open === true, `${name}: окно открылось для проверки`);
      await close();
      await page.waitForTimeout(1400);
      check((await look()).open === false, `${name} закрывает окно`);

      await page.goBack();
      await page.waitForTimeout(1600);
      const where = await look();
      check(
        where.path === '/space',
        `🔑 ${name}: запись СНЯТА — один «Назад» уводит на «Пространство», а не оставляет в «Профиле»`,
        where.path,
      );
      // возвращаемся на «Профиль» для следующего круга
      await page.locator('a:visible', { hasText: /^Профиль$/ }).first().click();
      await page.waitForTimeout(2600);
    }

    check(errors.length === 0, 'консоль чиста', errors.join(' | ').slice(0, 160));
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(`\nИтог: ${pass} зелёных, ${fails.length} провалов`);
if (fails.length) fails.forEach((f) => console.log('  ❌ ' + f));
process.exit(fails.length ? 1 : 0);

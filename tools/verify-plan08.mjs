/**
 * Страж памяти вида экранов — `plans/08` (волна `ideas/21`, п. 9; ответ владельца В11=А).
 *
 * Слово владельца дословно:
 *   «при навигации, страницы открываются вверху, не сохраняются позиции скрола по каждой из
 *    страниц. Должны сохраняться. Страницы должны открываться в том состоянии, в каком их
 *    оставили при навигации С ЭТИХ страниц.»
 *
 * Ответ В11=А задаёт СРОК жизни памяти: «живая вкладка; перезагрузка обнуляет». Поэтому здесь
 * два вида проверок, и второй так же обязателен, как первый:
 *   1) уход и возврат по нав-панели ВОЗВРАЩАЮТ позицию и вид;
 *   2) перезагрузка страницы (F5) её ОБНУЛЯЕТ. Без второй проверки страж молча одобрил бы
 *      `sessionStorage`, то есть решение, которое владелец отверг.
 *
 * ⚠️ Между экранами ходим КЛИКАМИ по нав-панели, а не `goto`: переход по адресу пересоздаёт
 * приложение и стирает ровно ту память, которую мы меряем (EXP-0072). `goto` был бы зелёным
 * на сломанном продукте.
 *
 * ⚠️ У каждой проверки памяти стоит ПАРНАЯ проверка «экран вообще прокручивается» (EXP-0070,
 * EXP-0082). Экран короче окна прокрутки не имеет, `left === 0`, и «вернулся на 0» выглядело
 * бы успехом на любом коде. Такие случаи печатаются словом «нечем мерить» и в зелёные не идут.
 *
 * ⚠️ Кликаем только ПОСЛЕ гидратации: все экраны пререндерены, нав-панель лежит в готовом HTML
 * и находится селектором раньше, чем Svelte навесил обработчики (урок сессии 30.07). Признак
 * гидратации — появление данных экрана (карточки, виджеты), а не наличие разметки.
 *
 * Запуск: `npm run stand`, затем `node tools/verify-plan08.mjs` (+`--quick` — одна тема × 390).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const OUT = 'test-results/plan08';
const QUICK = process.argv.includes('--quick');
mkdirSync(OUT, { recursive: true });

const COMBOS = QUICK
  ? [['light', 390]]
  : [['light', 390], ['light', 1440], ['dark', 390], ['dark', 1440]];

/** Насколько глубоко листаем, если экран это позволяет. */
const DEEP = 900;
/** Ниже этой глубины мерить память нечем: экран короче окна. */
const MIN_MEASURABLE = 8;
/** Допуск возврата — ровно как в приёмке `plans/08`: ±2px. */
const TOLERANCE = 2;

let pass = 0;
const fails = [];
const skips = [];

function check(ok, what, detail = '') {
  if (ok) pass++;
  else {
    fails.push(`${what}${detail ? ' — ' + detail : ''}`);
    console.log(`  ❌ ${what}${detail ? ' — ' + detail : ''}`);
  }
}
function skip(what, why) {
  skips.push(`${what} — ${why}`);
  console.log(`  ⚪ нечем мерить: ${what} — ${why}`);
}

/** Пять разделов нав-панели: подпись ссылки → путь → чем доказывается готовность экрана. */
const SCREENS = [
  { nav: 'Измерения', path: '/dims', ready: 'article.card.dim' },
  { nav: 'Связи', path: '/relations', ready: '.card:has(.trio)' },
  { nav: 'Пространство', path: '/space', ready: '.card' },
  { nav: 'Профиль', path: '/profile', ready: '.card' },
  { nav: 'Меню', path: '/menu', ready: '.card' },
];

const browser = await chromium.launch();
try {
  for (const [theme, width] of COMBOS) {
    const tag = `${theme}-${width}`;
    console.log(`\n╔══ Память вида (${theme}, ${width}) ══╗`);
    const ctx = await browser.newContext({ viewport: { width, height: 820 }, locale: 'ru-RU' });
    await ctx.addInitScript((v) => localStorage.setItem('ndim-theme', v), theme);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    const scrollY = () => page.evaluate(() => Math.round(window.scrollY));
    const maxScroll = () =>
      page.evaluate(() => Math.max(0, Math.round(document.documentElement.scrollHeight - innerHeight)));
    const count = (sel) => page.locator(sel).count();

    /** Уйти на экран КЛИКОМ по нав-панели и дождаться его данных. */
    const go = async (screen) => {
      await page.locator('a:visible', { hasText: new RegExp('^' + screen.nav + '$') }).first().click();
      await page.waitForURL(new RegExp(screen.path.replace('/', '\\/') + '$'), { timeout: 8000 });
      await page.locator(screen.ready).first().waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);
    };

    // Заход в приложение. Ждём ГИДРАТАЦИИ — до неё клик по нав-панели ничего не делает.
    await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
    await page.locator('.card').first().waitFor({ state: 'attached', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3200);

    // ─────────────────────────────────────────────────────────────────────────
    // 1 · Пять экранов помнят, где их оставили
    // ─────────────────────────────────────────────────────────────────────────
    for (const screen of SCREENS) {
      const away = screen.nav === 'Пространство' ? SCREENS[3] : SCREENS[2]; // куда уходим
      await go(screen);

      const room = await maxScroll();
      const target = Math.min(DEEP, room);
      await page.evaluate((y) => window.scrollTo(0, y), target);
      await page.waitForTimeout(700);
      const left = await scrollY();
      const cardsBefore = await count(screen.ready);

      if (left < MIN_MEASURABLE) {
        skip(`«${screen.nav}» помнит позицию`, `экран короче окна (запас прокрутки ${room}px)`);
        continue;
      }

      await go(away);
      await go(screen);
      const back = await scrollY();
      const cardsAfter = await count(screen.ready);

      check(
        Math.abs(back - left) <= TOLERANCE,
        `«${screen.nav}» открылась там, где её оставили`,
        `ушёл с ${left}, вернулся на ${back}`,
      );
      // Позиция без содержимого — обман: вернуться на 900px можно и в ДРУГОЙ, короткий список.
      check(
        cardsAfter >= cardsBefore,
        `«${screen.nav}»: содержимого после возврата не меньше`,
        `было ${cardsBefore}, стало ${cardsAfter}`,
      );
      await page.screenshot({ path: `${OUT}/back-${screen.path.slice(1)}-${tag}.png` });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2 · «Измерения»: вкладка и своя позиция у каждой вкладки
    // Вкладку помнить — рекомендация агента к вопросу Б `plans/08`: человек ушёл со своего
    // NDim ID и вернуться обязан туда же, а не в «Все».
    // ─────────────────────────────────────────────────────────────────────────
    const dims = SCREENS[0];
    await go(dims);
    const tabName = () =>
      page.evaluate(() => {
        const on = [...document.querySelectorAll('.toolbar button')].find((b) =>
          b.classList.contains('on') || b.getAttribute('aria-pressed') === 'true',
        );
        return on ? (on.innerText || '').trim() : null;
      });
    /** Видима ли панель «Все / Мой NDim ID» В ОКНЕ — по самой кнопке (образец `verify-bug75`). */
    const barInView = () =>
      page.evaluate(() => {
        const all = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === 'Все');
        if (!all) return null;
        const r = all.getBoundingClientRect();
        return r.bottom > 0 && r.top < innerHeight;
      });

    // Глубоко листаем «Все», уходим на «Мой NDim ID» и обратно — позиции у вкладок РАЗНЫЕ.
    await page.evaluate((y) => window.scrollTo(0, y), Math.min(DEEP, await maxScroll()));
    await page.waitForTimeout(600);
    const allDeep = await scrollY();
    await page.locator('button:visible', { hasText: /^Мой NDim ID$/ }).first().click();
    await page.waitForTimeout(1600);
    const mineY = await scrollY();
    if (allDeep >= MIN_MEASURABLE) {
      check(mineY < allDeep, 'у «Мой NDim ID» СВОЯ позиция, а не глубина «Все»', `все=${allDeep}, мои=${mineY}`);
    } else {
      skip('своя позиция у каждой вкладки', `«Все» не прокручивается (${allDeep}px)`);
    }
    check((await barInView()) === true, 'панель «Все / Мой NDim ID» видна после смены вкладки');

    // Уходим с «Измерений» СО ВКЛАДКИ «Мой NDim ID» и возвращаемся: вкладка обязана выжить.
    await go(SCREENS[2]);
    await go(dims);
    check((await tabName()) === 'Мой NDim ID', 'вкладка «Мой NDim ID» пережила уход и возврат', `открыта: ${await tabName()}`);
    check((await barInView()) === true, 'панель «Все / Мой NDim ID» видна после возврата на экран');
    await page.screenshot({ path: `${OUT}/dims-tab-${tag}.png` });

    // Возврат на «Все» обязан отдать прежнюю глубину — это же и страж `bugs/75`.
    await page.locator('button:visible', { hasText: /^Все$/ }).first().click();
    await page.waitForTimeout(1800);
    const allBack = await scrollY();
    if (allDeep >= MIN_MEASURABLE) {
      check(
        Math.abs(allBack - allDeep) <= TOLERANCE,
        'глубина вкладки «Все» пережила уход с экрана',
        `было ${allDeep}, стало ${allBack}`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3 · В11=А: перезагрузка ОБНУЛЯЕТ память (иначе мы сделали не то, что решил владелец)
    // ─────────────────────────────────────────────────────────────────────────
    await page.evaluate((y) => window.scrollTo(0, y), Math.min(DEEP, await maxScroll()));
    await page.waitForTimeout(600);
    const beforeReload = await scrollY();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator(dims.ready).first().waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const afterReload = await scrollY();
    if (beforeReload >= MIN_MEASURABLE) {
      check(
        afterReload <= TOLERANCE,
        'В11=А: перезагрузка страницы обнуляет память (не sessionStorage)',
        `до F5 ${beforeReload}, после F5 ${afterReload}`,
      );
    } else {
      skip('перезагрузка обнуляет память', `экран не прокручивается (${beforeReload}px)`);
    }

    check(errors.length === 0, 'консоль чиста', errors.join(' | ').slice(0, 200));
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(`\nИтог: ${pass} зелёных, ${fails.length} провалов, ${skips.length} нечем мерить`);
if (fails.length) fails.forEach((f) => console.log('  ❌ ' + f));
if (skips.length) skips.forEach((s) => console.log('  ⚪ ' + s));
process.exit(fails.length ? 1 : 0);

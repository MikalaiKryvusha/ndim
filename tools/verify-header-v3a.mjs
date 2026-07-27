/**
 * QA-прогон макета V3-А живым браузером: десктопная шапка тянется ВО ВСЮ ШИРИНУ поверх рельса,
 * знак и «Пространство NDim» живут в ней (в рельсе их больше нет), имени раздела в шапке НЕТ,
 * рельс начинается под шапкой и остаётся прибитым.
 *
 * Решение владельца 2026-07-27 (ideas/17): «Делаем V3 - A, без хлебной крошки текущей открытой
 * стриницы, типа "/ Профиль"». Канон процесса — plans/06: ворота сдачи — живой Chrome, обе темы,
 * несколько ширин, скриншоты смотрены глазами, консоль прочитана.
 *
 * Требует `npm run stand`. Скриншоты — test-results/header-v3a/.
 * Запуск: node tools/verify-header-v3a.mjs
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const SHOTS = 'test-results/header-v3a';

/**
 * `--quick` — сокращённый прогон (одна тема × 1440 × два экрана) для ПРОВЕРКИ СТРАЖЕЙ
 * МУТАЦИЯМИ: полный прогон длится минуты, а сломанную версию надо прогнать трижды.
 * Сдача идёт полным прогоном, без флага.
 */
const QUICK = process.argv.includes('--quick');

/** Все шесть оболочек продукта: пять экранов + страница «Меню» через DocShell. */
const ROUTES = QUICK ? ['/profile', '/dims'] : ['/profile', '/relations', '/space', '/dims', '/menu', '/menu/manual'];
const THEMES = QUICK ? ['light'] : ['light', 'dark'];

/** Рельс появляется от 1024px — проверяем и ровно на пороге, и на широком экране. */
const DESKTOP_WIDTHS = QUICK ? [1440] : [1024, 1440];
const MOBILE_WIDTH = 390;

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Полностью непрозрачный фон: под прибитой шапкой едет контент (bugs/22). */
function isOpaque(color) {
  const m = /rgba?\(([^)]+)\)/.exec(color ?? '');
  if (m === null) return false;
  const parts = m[1].split(',').map((v) => Number.parseFloat(v.trim()));
  return parts.length < 4 || parts[3] === 1;
}

const browser = await chromium.launch();
await mkdir(SHOTS, { recursive: true });

async function openPage(theme, width) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, locale: 'ru-RU' });
  await context.addInitScript((value) => localStorage.setItem('ndim-theme', value), theme);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return { context, page, errors };
}

/**
 * Ширина РАСКЛАДКИ, а не вьюпорта: `scrollbar-gutter: stable` (bugs/59) забирает 15px, поэтому
 * «во всю ширину» — это ширина `body`, а не число из viewport. Сравнение с viewport давало
 * ложные провалы (375 против 390): это была ошибка проверки, а не вёрстки.
 */
async function layoutWidth(page) {
  return page.evaluate(() => document.body.getBoundingClientRect().width);
}

/**
 * Дождаться ГИДРАТАЦИИ. Пререндер отдаёт готовый HTML, поэтому элемент виден задолго до того,
 * как у него появятся обработчики: первый клик Playwright проваливался в пустоту (в
 * `verify-batch4.mjs` для этого стоит повторный клик). Признак живого клиента — CSS-переменная
 * `--bar-h`, которую шапка публикует уже после монтирования. Человек так быстро не кликает.
 */
async function waitHydrated(page) {
  await page.waitForFunction(
    () => getComputedStyle(document.documentElement).getPropertyValue('--bar-h').trim() !== '',
    undefined,
    { timeout: 20000 },
  );
}

try {
  // ── 1. Десктоп: геометрия новой оболочки на каждом экране, в обеих темах ──
  for (const theme of THEMES) {
    for (const width of DESKTOP_WIDTHS) {
      for (const route of ROUTES) {
        console.log(`\nV3-А · ${route} (${theme}, ${width}):`);
        const { context, page, errors } = await openPage(theme, width);
        await page.goto(`${BASE}${route}`);

        const bar = page.locator('header.bar');
        await bar.waitFor({ timeout: 20000 });
        const rail = page.locator('nav.rail');
        await rail.waitFor({ timeout: 20000 });

        await waitHydrated(page);
        const layout = await layoutWidth(page);
        const barBox = await bar.boundingBox();
        check('шапка начинается у левого края окна', Math.round(barBox.x) === 0, `x=${barBox.x}`);
        check(
          'шапка во всю ширину раскладки (поверх рельса)',
          Math.round(barBox.width) === Math.round(layout),
          `шапка=${Math.round(barBox.width)}, раскладка=${Math.round(layout)}`,
        );
        check('шапка прибита к верху', Math.round(barBox.y) === 0, `y=${barBox.y}`);

        const barBg = await bar.evaluate((el) => getComputedStyle(el).backgroundColor);
        check('фон шапки непрозрачный (bugs/22)', isOpaque(barBg), barBg);

        // Бренд — в шапке, ровно один, и ведёт в продукт, а не на лендинг (bugs/61)
        const brand = bar.locator('a.brand');
        check('знак и водмарк — в шапке', await brand.isVisible());
        check('знак ведёт на /profile (bugs/61)', (await brand.getAttribute('href')) === '/profile');
        // Считаем водмарк В ОБОЛОЧКЕ (шапка + рельс), а не на всей странице: в «Меню» и
        // «Руководстве» название продукта законно стоит в ТЕКСТЕ (манифест, документы).
        // Первая версия этой проверки считала по странице и краснела на них — ошибка стража.
        const shellWatermarks = await page.locator('header.bar, nav.rail').getByText('Пространство NDim').count();
        check('водмарк в оболочке ровно один', shellWatermarks === 1, `найдено ${shellWatermarks}`);
        check('в рельсе бренда нет', (await rail.getByText('Пространство NDim').count()) === 0);

        // Знак шапки стоит над иконками рельса по одной вертикали (левое поле 24px)
        const markBox = await brand.locator('svg').first().boundingBox();
        const firstIcon = await rail.locator('a .ico').first().boundingBox();
        check(
          'знак стоит над иконками рельса по одной вертикали',
          Math.abs(Math.round(markBox.x) - Math.round(firstIcon.x)) <= 2,
          `знак x=${Math.round(markBox.x)}, иконка x=${Math.round(firstIcon.x)}`,
        );

        // Имени раздела в шапке НЕТ — прямая правка владельца к V3
        const barText = (await bar.innerText()).replace(/\s+/g, ' ').trim();
        const sections = ['Профиль', 'Связи', 'Пространство NDim', 'Измерения', 'Меню'];
        const strayNames = sections.filter((s) => s !== 'Пространство NDim' && barText.includes(s));
        check('имени раздела в шапке нет', strayNames.length === 0, `текст шапки: «${barText}»`);

        // Рельс: под шапкой, прибит, не вылезает за низ вьюпорта
        const railBox = await rail.boundingBox();
        const barBottom = Math.round(barBox.y + barBox.height);
        check(
          'рельс начинается ПОД шапкой',
          Math.abs(Math.round(railBox.y) - barBottom) <= 1,
          `рельс y=${Math.round(railBox.y)}, низ шапки=${barBottom}`,
        );
        check(
          'рельс не вылезает за низ вьюпорта',
          Math.round(railBox.y + railBox.height) <= 801,
          `низ рельса=${Math.round(railBox.y + railBox.height)}`,
        );
        check('все пять пунктов навигации на месте', (await rail.locator('a').count()) === 5);

        // Контент не заехал под шапку и не оставил дыру
        const body = page.locator('main.body');
        if ((await body.count()) > 0) {
          const bodyBox = await body.boundingBox();
          check(
            'контент начинается ниже шапки (без наезда)',
            Math.round(bodyBox.y) >= barBottom - 1,
            `контент y=${Math.round(bodyBox.y)}, низ шапки=${barBottom}`,
          );
        }

        // Прокрутка: обе прибитые полосы держатся, пункты рельса остаются достижимы
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(350);
        const barAfter = await bar.boundingBox();
        const railAfter = await rail.boundingBox();
        check('после прокрутки шапка у верха', Math.round(barAfter.y) === 0, `y=${barAfter.y}`);
        check(
          'после прокрутки рельс под шапкой',
          Math.abs(Math.round(railAfter.y) - Math.round(barAfter.y + barAfter.height)) <= 1,
          `рельс y=${Math.round(railAfter.y)}`,
        );
        check('пункт «Меню» виден после прокрутки', await rail.getByText(/Меню|Menu/).isVisible());

        // Горизонтального переполнения полноширинная шапка вводить не должна (bugs/59)
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        check('горизонтального переполнения нет', overflow <= 0, `перелив=${overflow}px`);

        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(200);
        await page.screenshot({
          path: `${SHOTS}/${route.replace(/\//g, '_') || 'root'}-${theme}-${width}.png`,
        });
        check('ошибок консоли нет', errors.length === 0, errors.slice(0, 2).join(' | '));
        await context.close();
      }
    }
  }

  // ── 2. «Измерения»: панель-ящик по-прежнему прилипает ВПЛОТНУЮ под шапку (bugs/51, 52) ──
  for (const theme of THEMES) {
    for (const width of QUICK ? [1440] : [MOBILE_WIDTH, 1024, 1440]) {
      console.log(`\nПанель «Измерений» под шапкой (${theme}, ${width}):`);
      const { context, page, errors } = await openPage(theme, width);
      await page.goto(`${BASE}/dims`);
      await page.locator('.toolbar').waitFor({ timeout: 20000 });
      await waitHydrated(page);

      const bar = await page.locator('header.bar').boundingBox();
      const toolbar = await page.locator('.toolbar').boundingBox();
      const gap = toolbar.y - (bar.y + bar.height);
      check('панель стоит вплотную под шапкой', Math.abs(gap) <= 1, `зазор ${gap.toFixed(1)}px (шапка ${bar.height.toFixed(1)}px)`);
      // Правый край панели совпадает с правым краем шапки: на десктопе панель занимает
      // колонку контента целиком (слово владельца bugs/52 — «её можно тянуть на всю
      // ширину хедера»), на телефоне — весь экран.
      check(
        'правый край панели совпадает с правым краем шапки',
        Math.abs(Math.round(toolbar.x + toolbar.width) - Math.round(bar.x + bar.width)) <= 1,
        `панель до ${Math.round(toolbar.x + toolbar.width)}, шапка до ${Math.round(bar.x + bar.width)}`,
      );
      check(
        'левый край панели: колонка контента на десктопе, весь экран на телефоне',
        Math.round(toolbar.x) === (width >= 1024 ? 232 : 0),
        `x=${Math.round(toolbar.x)}`,
      );

      await page.screenshot({ path: `${SHOTS}/dims-toolbar-${theme}-${width}.png` });
      check('ошибок консоли нет', errors.length === 0, errors.slice(0, 2).join(' | '));
      await context.close();
    }
  }

  // ── 3. Телефон: раскладка НЕ изменилась (условие решения владельца) ──
  for (const theme of THEMES) {
    console.log(`\nТелефон ${MOBILE_WIDTH}px — раскладка не изменилась (${theme}):`);
    const { context, page, errors } = await openPage(theme, MOBILE_WIDTH);
    await page.goto(`${BASE}/profile`);
    const bar = page.locator('header.bar');
    await bar.waitFor({ timeout: 20000 });

    await waitHydrated(page);
    const layout = await layoutWidth(page);
    const barBox = await bar.boundingBox();
    check('шапка во всю ширину раскладки', Math.round(barBox.width) === Math.round(layout),
      `шапка=${Math.round(barBox.width)}, раскладка=${Math.round(layout)}`);
    // 61px — ЗАМЕР базы до правки (git stash, тот же стенд, та же ширина), а не память:
    // прежний комментарий в коде обещал 57px и успел устареть после bugs/63.
    check('высота шапки не изменилась (база 61px)', Math.abs(Math.round(barBox.height) - 61) <= 1,
      `${Math.round(barBox.height)}px`);
    check('знак и водмарк в шапке', await bar.locator('a.brand').isVisible());
    check('рельса на телефоне нет', (await page.locator('nav.rail').isVisible()) === false);
    check('нижняя панель видна', await page.locator('nav.bnav').isVisible());
    const bnav = await page.locator('nav.bnav').boundingBox();
    check('высота нижней панели — инвариант 60px', Math.round(bnav.height) === 60, `${Math.round(bnav.height)}px`);
    const bodyBox = await page.locator('main.body').boundingBox();
    check('контент — узкая колонка', Math.round(bodyBox.width) <= MOBILE_WIDTH, `${Math.round(bodyBox.width)}px`);

    await page.screenshot({ path: `${SHOTS}/mobile-profile-${theme}.png` });
    check('ошибок консоли нет', errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }

  // ── 4. Смена языка не ломает геометрию: шапка мерится заново (EN-строка короче RU) ──
  console.log('\nСмена языка RU→EN — рельс остаётся под шапкой:');
  {
    const { context, page, errors } = await openPage('light', 1440);
    await page.goto(`${BASE}/profile`);
    await waitHydrated(page);
    await page.locator('header.bar .lang').click();
    await page.locator('header.bar .dd button', { hasText: 'English' }).click();
    await page.waitForTimeout(400);
    const bar = await page.locator('header.bar').boundingBox();
    const rail = await page.locator('nav.rail').boundingBox();
    check('водмарк переключился на английский', (await page.locator('header.bar').innerText()).includes('NDim Space'));
    check(
      'рельс по-прежнему под шапкой',
      Math.abs(Math.round(rail.y) - Math.round(bar.y + bar.height)) <= 1,
      `рельс y=${Math.round(rail.y)}, низ шапки=${Math.round(bar.y + bar.height)}`,
    );
    await page.screenshot({ path: `${SHOTS}/profile-en-1440.png` });
    check('ошибок консоли нет', errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }

  // ── 5. Гостевой бейдж выживает в новой раскладке шапки (макет V1 «Тихий бейдж», plans/03) ──
  // Стенд входит dev-пользователем САМ, поэтому гостевой сеанс на нём недостижим: проверяем
  // ВЁРСТКУ — вставляем пилюлю в шапку с подлинным scoped-классом Svelte (хеш берём с самой
  // шапки, иначе стили не применятся и проверка будет мерить неоформленную кнопку) и с
  // настоящим текстом продукта («гость», profile/+page.svelte → t.guest.pill).
  for (const width of QUICK ? [1440] : [MOBILE_WIDTH, 1440]) {
    console.log(`\nГостевой бейдж в шапке (${width}):`);
    const { context, page, errors } = await openPage('light', width);
    await page.goto(`${BASE}/profile`);
    await page.locator('header.bar').waitFor({ timeout: 20000 });
    await waitHydrated(page);
    const before = Math.round((await page.locator('header.bar').boundingBox()).height);

    const style = await page.evaluate(() => {
      const bar = document.querySelector('header.bar');
      const hash = [...bar.classList].find((c) => c.startsWith('svelte-'));
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = hash ? `badge ${hash}` : 'badge';
      btn.textContent = '◌ гость';
      bar.insertBefore(btn, bar.querySelector('button'));
      const computed = getComputedStyle(btn);
      return { border: computed.borderStyle, radius: computed.borderRadius };
    });
    await page.waitForTimeout(150);

    check('пилюля пунктирная и круглая (макет V1)', style.border === 'dashed' && style.radius === '999px',
      `${style.border}, ${style.radius}`);
    const after = Math.round((await page.locator('header.bar').boundingBox()).height);
    check('шапка не стала двухстрочной от бейджа', after <= before + 1, `${before} → ${after}px`);
    const badge = await page.locator('header.bar .badge').boundingBox();
    const lang = await page.locator('header.bar .lang').boundingBox();
    const brand = await page.locator('header.bar a.brand').boundingBox();
    check(
      'порядок: бренд · бейдж · кнопки',
      brand.x + brand.width <= badge.x && badge.x + badge.width <= lang.x + 1,
      `бренд до ${Math.round(brand.x + brand.width)}, бейдж ${Math.round(badge.x)}..${Math.round(badge.x + badge.width)}, язык ${Math.round(lang.x)}`,
    );
    await page.screenshot({ path: `${SHOTS}/guest-badge-${width}.png` });
    check('ошибок консоли нет', errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }

  // ── 6. Клик по знаку ведёт в «Профиль», а не на лендинг (bugs/61 не вернулся) ──
  console.log('\nКлик по знаку из «Измерений»:');
  {
    const { context, page, errors } = await openPage('light', 1440);
    await page.goto(`${BASE}/dims`);
    await waitHydrated(page);
    await page.locator('header.bar a.brand').click();
    await page.waitForURL(/\/profile/, { timeout: 10000 });
    check('знак привёл на /profile', new URL(page.url()).pathname === '/profile', page.url());
    check('ошибок консоли нет', errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nВсе проверки V3-А зелёные.' : `\n❌ Провалов: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

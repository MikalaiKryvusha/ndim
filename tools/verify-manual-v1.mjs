/**
 * QA-прогон руководства V1 «Как было» (bugs/55, выбор владельца 2026-07-27) живым браузером.
 *
 * Канон: разведка researches/12 → «Вёрстка страниц документов 1.x» + слово владельца:
 * V1 сплошным документом · floating пагинатор глав справа · звёзды/кнопки — текущей
 * реализацией 2.0 · в тёмной теме картинки на светлой карточке с лёгким бирюзовым оттенком.
 *
 * Гоняется по СОБРАННОМУ сайту (страница пререндерится): `npm run build` +
 * `npx vite preview --port 4173`, затем `node tools/verify-manual-v1.mjs`.
 * Скриншоты — test-results/manual-v1/. Канон процесса — plans/06 (обе темы × 390/1440).
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:4173';
const SHOTS = 'test-results/manual-v1';

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Размеры шкалы по каждому сочетанию: адаптивность видна только в СРАВНЕНИИ ширин. */
const scaleByWidth = new Map();

/** Звезда карточки «Измерений» (`dims/+page.svelte`) — потолок для звезды руководства. */
const PRODUCT_STAR_PX = 27;

const browser = await chromium.launch();
await mkdir(SHOTS, { recursive: true });

try {
  for (const [theme, width] of [['light', 390], ['light', 1440], ['dark', 390], ['dark', 1440]]) {
    console.log(`руководство V1 (${theme}, ${width}):`);
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU' });
    await context.addInitScript((value) => localStorage.setItem('ndim-theme', value), theme);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (event) => errors.push(String(event)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto(`${BASE}/menu/manual`);
    await page.waitForSelector('.doc h2', { timeout: 20000 });
    await page.waitForTimeout(600);

    // Иллюстрации грузятся лениво (loading="lazy") — прокатываемся до низа, чтобы браузер
    // их запросил, и только потом меряем пиксели. Без этого страж мерил бы незапрошенное.
    await page.evaluate(async () => {
      const step = window.innerHeight * 0.8;
      for (let y = 0; y <= document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(700);

    // ── Иллюстрации 1.x вернулись и реально отрисованы (пиксели, не DOM — bugs/14) ──
    const images = await page.$$eval('.doc .art img', (nodes) =>
      nodes.map((img) => ({ src: img.getAttribute('src'), drawn: img.complete && img.naturalWidth > 0 })),
    );
    const bySrc = (name) => images.find((img) => img.src?.includes(name));
    check('логотип 1.x в шапке отрисован', bySrc('logo-1x')?.drawn === true);
    for (const name of ['island', 'airplane', 'hospital']) {
      check(`иллюстрация «${name}» отрисована`, bySrc(name)?.drawn === true);
    }
    check('финальная сеть отрисована', bySrc('network')?.drawn === true);
    // Мысленные эксперименты: картинка стоит ВНУТРИ пункта списка, как в 1.x.
    const insideLi = await page.$$eval('.doc li .art img', (nodes) => nodes.length);
    check('картинки экспериментов внутри пунктов списка', insideLi === 3, `внутри li: ${insideLi}`);

    /*
     * ── ФИНАЛЬНАЯ КАРТИНКА «НАПУТСТВИЯ» — МАЛЕНЬКАЯ, КАК В 1.x ──
     * Канон: researches/12:323 — `.in_page_image.small_image.last_image → network.webp`,
     * то есть тот же размерный класс, что у знака в шапке (потолок 100px), а не общий
     * потолок иллюстраций (300px). В 2.0 она рисовалась обычной иллюстрацией; слово
     * владельца 2026-07-30: «а это слишком огромное. в оригинале было маленькое»
     * (замер на десктопе: 298×300px против 100px у знака в шапке).
     */
    const artSizes = await page.$$eval('.doc .art img', (nodes) =>
      nodes.map((img) => ({ src: img.getAttribute('src'), h: Math.round(img.getBoundingClientRect().height) })),
    );
    const heightOf = (name) => artSizes.find((a) => a.src?.includes(name))?.h ?? 0;
    check(
      'финальная сеть — МАЛЕНЬКАЯ, как знак в шапке (класс small_image 1.x)',
      heightOf('network') > 0 && heightOf('network') === heightOf('logo-1x'),
      `сеть ${heightOf('network')}px · знак в шапке ${heightOf('logo-1x')}px`,
    );
    check(
      'финальная сеть ЗАМЕТНО меньше иллюстраций-экспериментов',
      heightOf('network') > 0 && heightOf('network') * 1.5 < heightOf('island'),
      `сеть ${heightOf('network')}px · остров ${heightOf('island')}px`,
    );

    /*
     * ── ФОН У ИЛЛЮСТРАЦИЙ УДАЛЁН ПОЛНОСТЬЮ ──
     * Слово владельца 2026-07-30: «И белый не весь удалён, в кружках остался».
     * Замер файла подтвердил: в `network.webp` было 4398 НЕПРОЗРАЧНЫХ белых пикселей —
     * ровно площадь четырёх колец знака (удаление фона шло снаружи и внутрь замкнутых
     * областей не добралось), а в `island.webp` — белая полоса во всю ширину.
     *
     * Сторожатся ДВЕ вещи, и обе — по наблюдаемому дефекту, а не по выдуманному бюджету:
     *   · у знака сети непрозрачного белого не может быть НИ ОДНОГО (он чёрный на прозрачном);
     *   · ни у одной картинки не должно быть белой строки во всю ширину — это и есть
     *     недоудалённая подложка, а законные белые детали (пена, облака) такой строки не дают.
     * Пиксели читаются с УЖЕ ЗАГРУЖЕННОЙ картинки через canvas — это то, что реально уехало
     * в бой, а не то, что лежит в репозитории.
     */
    const whiteness = await page.$$eval('.doc .art img', (nodes) =>
      nodes.map((img) => {
        const canvas = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const { data, width, height } = ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
        let opaqueWhite = 0;
        let widestRun = 0;
        for (let y = 0; y < height; y += 1) {
          let run = 0;
          for (let x = 0; x < width; x += 1) {
            const i = (y * width + x) * 4;
            const isWhite =
              data[i + 3] >= 250 && data[i] >= 245 && data[i + 1] >= 245 && data[i + 2] >= 245;
            if (!isWhite) { run = 0; continue; }
            opaqueWhite += 1;
            run += 1;
            if (run > widestRun) widestRun = run;
          }
        }
        return { src: img.getAttribute('src'), opaqueWhite, runShare: widestRun / width };
      }),
    );
    const net = whiteness.find((w) => w.src?.includes('network'));
    check(
      'у знака сети не осталось НИ ОДНОГО непрозрачного белого пикселя',
      net !== undefined && net.opaqueWhite === 0,
      `${net?.opaqueWhite ?? '—'} px (было 4398 — кружки)`,
    );
    const banded = whiteness.filter((w) => w.runShare > 0.5);
    check(
      'ни у одной иллюстрации нет белой полосы во всю ширину (недоудалённый фон)',
      banded.length === 0,
      banded.map((w) => `${w.src?.split('/').pop()} ${Math.round(w.runShare * 100)}%`).join(' · '),
    );

    // ── Тёмная тема: светлая карточка с бирюзовым оттенком (слово владельца) ──
    const bg = await page.$eval('.doc .art img', (img) => getComputedStyle(img).backgroundColor);
    if (theme === 'dark') {
      // color-mix Chromium отдаёт как `color(srgb r g b)` с долями 0…1 — парсим оба формата.
      const parts = bg.match(/[\d.]+/g)?.map(Number) ?? [];
      const rgb = bg.startsWith('color(') ? parts.map((part) => part * 255) : parts;
      const lightCard = rgb.length >= 3 && rgb[0] > 220 && rgb[1] > 230 && rgb[2] > 230;
      const tinted = rgb.length >= 3 && rgb[2] > rgb[0] && rgb[1] >= rgb[0];
      check('картинка на светлой карточке', lightCard, bg);
      check('оттенок карточки — в бирюзовую синеву (b > r)', tinted, bg);
    } else {
      check('в светлой теме подложки нет (как в 1.x)', bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent', bg);
    }

    // ── Шкала оценок: 11 строк, звезда + цифра + цветной смайлик (канон 1.x) ──
    const marks = await page.$$eval('.doc table.grades .mark', (nodes) =>
      nodes.map((mark) => ({
        star: mark.querySelector('i')?.textContent,
        digit: mark.querySelector('b')?.textContent,
        starColor: getComputedStyle(mark.querySelector('i')).color,
        fill: mark.querySelector('svg path')?.getAttribute('fill'),
        rects: mark.querySelectorAll('svg rect').length,
      })),
    );
    check('в шкале 11 оценок', marks.length === 11, String(marks.length));
    check('каждая строка несёт звезду ★ и цифру', marks.every((mark, grade) => mark.star === '★' && mark.digit === String(grade)));
    check('смайлик нуля — гневный красный #d50000', marks[0]?.fill === '#d50000', marks[0]?.fill ?? '—');
    check('«десятка» — многоцветный смайлик 1.x (сердечки)', marks[10]?.rects === 1);
    check('звезда нуля погашена, остальные — токеном --star', marks[0]?.starColor !== marks[5]?.starColor,
      `0: ${marks[0]?.starColor} · 5: ${marks[5]?.starColor}`);

    // Размеры шкалы копятся по ширинам — сравнить их можно только ПОСЛЕ обхода (см. хвост).
    scaleByWidth.set(`${theme}-${width}`, await page.$eval('.doc table.grades .mark', (mark) => ({
      star: Number.parseFloat(getComputedStyle(mark.querySelector('i')).fontSize),
      digit: Number.parseFloat(getComputedStyle(mark.querySelector('b')).fontSize),
      face: Math.round(mark.querySelector('svg').getBoundingClientRect().width),
    })));

    // ── Ряд из 11 смайликов (подраздел «Шкала смайликов») ──
    const rowFaces = await page.$$eval('.doc .sample.row .cell', (nodes) => nodes.length);
    check('ряд смайликов — 11 лиц с подписями', rowFaces === 11, String(rowFaces));

    // ── Кнопки-образцы: форма ibtn 2.0, но КРУПНО, как в 1.x (80×80, слово владельца) ──
    const samples = await page.$$eval('.doc .sample .ibtn', (nodes) =>
      nodes.map((node) => ({
        gold: node.classList.contains('gold'),
        svg: node.querySelectorAll('svg').length,
        size: Math.round(node.getBoundingClientRect().width),
      })),
    );
    check('две кнопки-образца с иконками набора', samples.length === 2 && samples.every((sample) => sample.svg === 1));
    check('кнопки КРУПНЫЕ, как в 1.x (80px)', samples.every((sample) => sample.size === 80), JSON.stringify(samples.map((sample) => sample.size)));
    check('лампочка — золотая, поиск — нет', samples[0]?.gold === true && samples[1]?.gold === false);

    // ── Таблица выглядит ТАБЛИЦЕЙ, как в 1.x: границы у ячеек и зебра строк ──
    const tableLook = await page.$eval('.doc table.grades', (table) => {
      const cell = table.querySelector('tbody td');
      const odd = table.querySelector('tbody tr:nth-child(1)');
      const even = table.querySelector('tbody tr:nth-child(2)');
      return {
        border: cell ? getComputedStyle(cell).borderTopWidth : '0',
        zebra: odd && even ? getComputedStyle(odd).backgroundColor !== getComputedStyle(even).backgroundColor : false,
      };
    });
    check('у ячеек шкалы видимые границы (1px, канон 1.x)', tableLook.border === '1px', tableLook.border);
    check('зебра нечётных строк (канон 1.x)', tableLook.zebra === true);

    // ── Адаптированные фразы стоят, фраз 1.x о «внизу справа» нет ──
    const text = await page.locator('.doc').innerText();
    check('фраза о кнопке адаптирована к 2.0', text.includes('в верхней панели есть кнопка предложения нового измерения'));
    check('устаревшее «внизу справа» исчезло', !text.includes('внизу справа'));
    check('«Напутствие» с текстом владельца на месте', text.includes('Приятного поиска!'));

    // ── Плавающий пагинатор глав (слово владельца) ──
    const dots = await page.$$eval('.pager .dot', (nodes) => nodes.length);
    check('свёрнутая капсула: по точке на главу (5)', dots === 5, String(dots));
    await page.screenshot({ path: `${SHOTS}/top-${theme}-${width}.png` });

    await page.click('.pager');
    await page.waitForTimeout(350);
    const items = await page.$$eval('.panel .item', (nodes) => ({
      total: nodes.length,
      subs: nodes.filter((node) => node.classList.contains('h3')).length,
    }));
    check('развёрнутый: все главы и подглавы', items.total === 12 && items.subs === 7, JSON.stringify(items));
    await page.screenshot({ path: `${SHOTS}/toc-${theme}-${width}.png` });

    // Переход к «Напутствию»: документ уезжает вниз, финальная сеть оказывается видимой.
    // Прокрутка ПЛАВНАЯ и длинная (~1.6 с с медленным хвостом) — ждём её ОКОНЧАНИЯ:
    // scrollY стабилен два замера подряд. Замер на ходу врёт (класс EXP-0048); промис-предикат
    // в waitForFunction не годится — Promise-объект truthy, и ожидание выходит мгновенно.
    await page.locator('.panel .item', { hasText: 'Напутствие' }).click();
    let scrolled = 0;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const before = await page.evaluate(() => window.scrollY);
      await page.waitForTimeout(300);
      scrolled = await page.evaluate(() => window.scrollY);
      if (scrolled === before && scrolled > 0) break;
    }
    check('тап по главе везёт к ней', scrolled > 2000, `scrollY: ${scrolled}`);
    const networkVisible = await page.$eval('img[src*="network"]', (img) => {
      const rect = img.getBoundingClientRect();
      return rect.top < window.innerHeight && rect.bottom > 0;
    });
    check('финальная сеть во вьюпорте после перехода', networkVisible);
    check('после перехода панель свёрнута', (await page.locator('.panel').count()) === 0);

    // Активная глава выводится из прокрутки: внизу документа активна последняя точка.
    const lastActive = await page.$$eval('.pager .dot', (nodes) => nodes[nodes.length - 1]?.classList.contains('on'));
    check('внизу документа активна последняя глава', lastActive === true);
    await page.screenshot({ path: `${SHOTS}/end-${theme}-${width}.png` });

    // Тап мимо закрывает панель; Esc — тоже.
    await page.click('.pager');
    await page.waitForTimeout(250);
    await page.mouse.click(30, 300);
    await page.waitForTimeout(250);
    check('тап мимо сворачивает панель', (await page.locator('.panel').count()) === 0);
    await page.click('.pager');
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    check('Esc сворачивает панель', (await page.locator('.panel').count()) === 0);

    check('консоль чиста', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }
  /*
   * ── ШКАЛА АДАПТИВНА: НА ДЕСКТОПЕ ОНА КРУПНЕЕ, ЧЕМ НА ТЕЛЕФОНЕ ──
   *
   * Слово владельца 2026-07-30: «на десктопе малые элементы в таблице в руководстве».
   * Замер боя объяснил, почему: колонка документа растёт с 347 до 768px (в 2.21 раза), а
   * звезда, цифра и смайлик были КОНСТАНТАМИ 17/13/18px на обеих ширинах — рос
   * контейнер, а не содержимое.
   *
   * Проверка живёт ЗДЕСЬ, а не внутри обхода: адаптивности не существует «на одной
   * ширине», её видно только в сравнении двух. Проверка внутри цикла могла бы лишь
   * прочитать число и сверить его с зашитым — то есть сторожила бы константу вместо
   * поведения и зеленела бы на любом наборе цифр.
   */
  console.log('\nАдаптивность шкалы (сравнение ширин):');
  for (const theme of ['light', 'dark']) {
    const small = scaleByWidth.get(`${theme}-390`);
    const big = scaleByWidth.get(`${theme}-1440`);
    if (!small || !big) {
      check(`${theme}: размеры шкалы сняты на обеих ширинах`, false);
      continue;
    }
    check(
      `${theme}: шкала РАСТЁТ с шириной (звезда, цифра и смайлик)`,
      big.star > small.star && big.digit > small.digit && big.face > small.face,
      `звезда ${small.star}→${big.star} · цифра ${small.digit}→${big.digit} · смайлик ${small.face}→${big.face}`,
    );
    check(
      `${theme}: телефон НЕ изменился (жалоба была про десктоп)`,
      small.star === 17 && small.digit === 13 && small.face === 18,
      `${small.star}/${small.digit}/${small.face}`,
    );
    check(
      `${theme}: на десктопе шкала догоняет продукт, но не перерастает его (${PRODUCT_STAR_PX}px)`,
      big.star <= PRODUCT_STAR_PX && big.star >= PRODUCT_STAR_PX - 3,
      `звезда руководства ${big.star}px против ${PRODUCT_STAR_PX}px в карточке «Измерений»`,
    );
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nИтог: все проверки зелёные.' : `\nИтог: ❌ провалов — ${failures}`);
process.exit(failures === 0 ? 0 : 1);

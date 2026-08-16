#!/usr/bin/env node
/**
 * ПРИБОР ЗАМЕРА (не страж) — как ПЕРЕНОСЯТСЯ длинные названия в панели «Ваша анкета».
 *
 * Повод: условие владельца при приёмке фазы 5 (интервью №034, В2 = Б, 2026-08-16):
 * «*убедись, что длинные названия корректно, красиво переносятся на 2+ строки. Если все ок -
 * закрываем*». Это НЕ то же, что «не обрезаны»: `probe-test-guest-live` уже стережёт обрезку,
 * но зелен и в том случае, когда строка не обрезана, а просто уродлива — наехала на оценку,
 * вылезла за карточку или встала в одну нечитаемую простыню.
 *
 * 🔑 Меряем ДВА разных предмета:
 *   1. РЕАЛЬНЫЕ строки — то, что человек видит в наборе сегодня (подписи медианой 31 знак);
 *   2. ПРЕДЕЛ каталога — самые длинные подписи, которые вообще существуют: RU 113 знаков
 *      («Происхождение видов…»), EN 160 («The China Study…»). Они в набор попадают редко, и
 *      именно поэтому их надо принести самому: дефект вёрстки, который ждёт редкой строки,
 *      найдёт владелец, а не прибор. Текст подставляется в УЖЕ отрисованную строку — проверяется
 *      та же вёрстка и тот же CSS, продукт не трогается.
 *
 * Запуск (нужен поднятый стенд `npm run stand`):
 *   node tools/measure-bug120-wrap.mjs [--base http://localhost:5173] [--slug love]
 *
 * Печатает числа и кладёт кадры в `test-results/bug120-wrap/`. Вердикта не выносит — судит
 * человек глазами, для того кадры и снимаются (`EXP-0082`: контрольный кадр обязателен).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const BASE = arg('--base', 'http://localhost:5173');
const SLUG = arg('--slug', 'love');
const OUT = 'test-results/bug120-wrap';
mkdirSync(OUT, { recursive: true });

/** Предельные подписи каталога — сняты замером по `dims-build.json` 2026-08-16. */
const EXTREME = {
  ru: 'Происхождение видов путём естественного отбора (или Сохранение благоприятных рас в борьбе за жизнь) · Книга, 1859',
  en: 'The China Study: The Most Comprehensive Study of Nutrition Ever Conducted and the Startling Implications for Diet, Weight Loss and Long‑Term Health · Book, 2005',
};

/*
 * Дверь гостя — только стендовая (`?as=guest`). Хост берётся у BASE намеренно: продукт строит
 * личные ссылки из БОЕВОГО canonical, и прогон, пошедший по ним буквально, уводит гостя в бой
 * (цена уже уплачена — три настоящих гостя в проде, шапка `probe-test-guest-live`).
 */
const door = (url) => {
  const u = new URL(url);
  const here = new URL(BASE);
  u.protocol = here.protocol;
  u.host = here.host;
  u.searchParams.set('as', 'guest');
  return u.toString();
};

if (!/localhost|127\.0\.0\.1/.test(BASE)) {
  console.error('🔴 Прибор ПИШЕТ оценки. Гонять только по стенду — в бою он двигал бы NDSR живых объектов.');
  process.exit(1);
}

const browser = await chromium.launch();
const rows = [];

/** Замер одной раскладки: ширина × тема. */
async function measure(width, theme) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 500 ? 844 : 900 },
    locale: 'ru-RU',
  });
  await ctx.addInitScript(([t]) => {
    try { localStorage.setItem('ndim-theme', t); } catch { /**/ }
  }, [theme]);
  const page = await ctx.newPage();
  await page.goto(door(`${BASE}/ru/test/${SLUG}`), { waitUntil: 'networkidle', timeout: 60000 });

  // Набираем строки в панель тем же жестом, что и человек: звезда → «Сохранить сейчас».
  let done = 0;
  for (let i = 0; i < 8 && done < 5; i++) {
    const stars = page.locator('.qcard .starsrow .st');
    if ((await stars.count()) === 0) break;
    await stars.nth(8).click();
    const now = page.locator('.qcard .countdown .now');
    await now.waitFor({ state: 'visible', timeout: 20000 });
    await now.click();
    await page
      .waitForFunction((n) => document.querySelectorAll('.mirror .rows li').length >= n, done + 1, { timeout: 40000 })
      .catch(() => {});
    done = await page.locator('.mirror .rows li').count();
  }

  /** Снимает геометрию всех строк панели. Одно место — оба замера (реальный и предельный). */
  const geometry = () =>
    page.locator('.mirror .rows li').evaluateAll((lis) =>
      lis.map((li) => {
        const name = li.querySelector('.rname');
        const val = li.querySelector('.rval');
        const s = getComputedStyle(name);
        const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.35;
        const box = name.getBoundingClientRect();
        const liBox = li.getBoundingClientRect();
        const panel = li.closest('.mirror');
        const frame = panel.getBoundingClientRect();
        return {
          text: name.textContent.trim(),
          знаков: name.textContent.trim().length,
          строк: Math.max(1, Math.round(box.height / lh)),
          высотаСтроки: Math.round(lh),
          высотаИмени: Math.round(box.height),
          высотаПункта: Math.round(liBox.height),
          // Обрезка: собственная (ellipsis/clamp/переполнение) или предком.
          обрезано:
            s.textOverflow === 'ellipsis' ||
            (s.webkitLineClamp !== 'none' && s.webkitLineClamp !== '') ||
            name.scrollWidth > name.clientWidth + 1 ||
            name.scrollHeight > name.clientHeight + 1 ||
            (getComputedStyle(panel).overflow !== 'visible' &&
              (box.bottom > frame.bottom + 1 || box.right > frame.right + 1)),
          многоточие: name.textContent.includes('…'),
          // Вылез ли текст за карточку по горизонтали — панель шире окна быть не может.
          вылезВправо: Math.round(box.right - frame.right),
          // Оценка обязана стоять по ВЕРХУ строки, а не по центру выросшего имени (`bugs/120`).
          сдвигОценки: val === null ? null : Math.round(val.getBoundingClientRect().top - box.top),
          // Наезд имени на оценку: правый край имени не должен заходить на левый край оценки.
          наездНаОценку: val === null ? null : Math.round(box.right - val.getBoundingClientRect().left),
        };
      }),
    );

  const real = await geometry();
  await page.locator('.mirror').screenshot({ path: `${OUT}/${width}-${theme}-реальные.png` }).catch(() => {});

  // ── ПРЕДЕЛ: подставляем самые длинные подписи каталога в уже отрисованные строки ──
  await page.locator('.mirror .rows .rname').evaluateAll((els, ex) => {
    if (els[0]) els[0].textContent = ex.ru;
    if (els[1]) els[1].textContent = ex.en;
  }, EXTREME);
  await page.waitForTimeout(120);
  const extreme = (await geometry()).slice(0, 2);
  await page.locator('.mirror').screenshot({ path: `${OUT}/${width}-${theme}-предельные.png` }).catch(() => {});

  // Горизонтальной прокрутки у документа быть не должно ни при какой длине имени.
  const overflowX = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );

  await ctx.close();
  return { width, theme, real, extreme, overflowX };
}

for (const width of [390, 1440]) {
  for (const theme of ['light', 'dark']) {
    const r = await measure(width, theme);
    rows.push(r);
    console.log(`\n═══ ${width}px · тема ${theme} ═══`);
    console.log(`  строк в панели: ${r.real.length} · горизонтальный перелив документа: ${r.overflowX}px`);
    const show = (label, list) => {
      for (const x of list) {
        console.log(
          `  ${label} ${x.строк} стр · ${x.знаков} зн · имя ${x.высотаИмени}px в пункте ${x.высотаПункта}px · ` +
            `обрезано: ${x.обрезано ? 'ДА' : 'нет'} · многоточие: ${x.многоточие ? 'ДА' : 'нет'} · ` +
            `вылез вправо: ${x.вылезВправо}px · оценка сдвинута на ${x.сдвигОценки}px · наезд ${x.наездНаОценку}px`,
        );
        console.log(`      «${x.text.slice(0, 70)}${x.text.length > 70 ? '…' : ''}»`);
      }
    };
    show('реальная:', r.real.slice(0, 3));
    show('ПРЕДЕЛ:  ', r.extreme);
  }
}

await browser.close();
console.log(`\nКадры: ${OUT}/ — смотреть ГЛАЗАМИ, вердикт выносит человек.`);

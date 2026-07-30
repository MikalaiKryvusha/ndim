/**
 * ПРИБОР ЗАМЕРА (не страж) для bugs/80 — жалоба владельца «тёмное вокруг смайлика при
 * выборе звезды», третий заход.
 *
 * Слово владельца дословно (2026-07-30, после второго выката):
 *   «И тёмное вокруг смайлика при выборе звезды осталось»
 *   «для меня это выглядит как ореол вокруг смайлика, или как тень»
 * Снято им на камеру с экрана: ДЕСКТОП, СВЕТЛАЯ тема (video5431525967346573958.mp4).
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ ПРИБОР. Два прошлых захода правили ореол «по смыслу кода» и промахнулись:
 * первый перекрасил ореол с `--faint` на `--star`, второй поднял базу непрозрачности ряда.
 * Оба раза проверка шла ЧТЕНИЕМ КОДА и кадром в ТЁМНОЙ теме — то есть не мерила то, на что
 * смотрит владелец. Здесь меряются ПИКСЕЛИ, и вопрос ставится ровно один:
 *
 *   светлее или ТЕМНЕЕ фона карточки то кольцо, что рисует `drop-shadow` вокруг лица?
 *
 * Метод: вокруг каждого из 11 лиц снимается кольцо пикселей (радиус от края глифа +2 до +9,
 * 96 углов) и считается его средняя относительная светлота (WCAG). Рядом снимается светлота
 * САМОГО ФОНА карточки — в серединах промежутков между лицами, далеко от любого свечения.
 * Дефект = у ВЫБРАННОГО лица кольцо темнее фона, тогда как у соседей оно с фоном совпадает.
 * Соседи здесь и есть контроль прибора: если «темнее фона» окажется у всех, значит меряется
 * не ореол, а что-то общее (тень карточки, виньетка), и вывод был бы ложным.
 *
 * ⚠️ Замер идёт в ОБЕИХ темах намеренно. Ожидание: в тёмной теме то же кольцо ярче фона —
 * и именно поэтому прошлый заход, проверенный только там, выглядел успешным.
 *
 * Побочно снимается второй подозреваемый, видимый на видео владельца: после клика МЫШЬЮ
 * по звезде вокруг неё стоит тёмно-синяя рамка. Печатается, совпадает ли кнопка с
 * `:focus-visible` и что за обводку она вычислила.
 *
 * Прибор ПИШЕТ ВИДЕО (`recordVideo`) — прямое требование владельца 2026-07-30:
 * «В следующий раз ТЫ САМ записываешь экран!».
 *
 * Требует поднятый `npm run stand`.
 * Запуск: node tools/measure-bug80-halo.mjs [--theme light|dark]
 * Выход: test-results/bug80-halo/ (крупные кропы, видео, report.txt)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const STAND = 'http://localhost:5173';
const AUTH = 'http://127.0.0.1:9099';
const PROJECT = 'demo-ndim-dev';
const OUT = 'test-results/bug80-halo';

/** Оценка, которую выбираем: ровно та, что владелец выбрал на видео. */
const PICK = 3;
/** Ширина владельца — десктоп. 390 снимается тоже, чтобы знать про телефон. */
const COMBOS = [
  ['light', 1440],
  ['dark', 1440],
  ['light', 390],
];
/** Множитель пикселей: кольцо шириной 7px на 1x — это 7 отсчётов, мало для средней. */
const DPR = 4;

const lines = [];
function say(text = '') {
  console.log(text);
  lines.push(text);
}

/** Вход почтовой ссылкой через oob-код эмулятора Auth (приём EXP-0045). */
async function signIn(page) {
  const email = 'dev@ndim.space';
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=demo-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestType: 'EMAIL_SIGNIN', email, continueUrl: `${STAND}/profile` }),
  });
  const res = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes = [] } = await res.json();
  const last = oobCodes.filter((c) => c.email === email && c.requestType === 'EMAIL_SIGNIN').at(-1);
  if (!last) return false;
  await page.goto(`${STAND}/profile?mode=signIn&oobCode=${last.oobCode}&apiKey=demo-api-key`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(2200);
  return true;
}

/**
 * Дождаться КОНЦА перехода `slide` у ряда: он приезжает высотой, и кадр, снятый посреди
 * перехода, показывает лица срезанными (ожог, записанный в verify-bug80.mjs).
 */
async function settled(page, selector) {
  let last = -1;
  for (let i = 0; i < 40; i += 1) {
    const height = await page.locator(selector).evaluate((el) => el.getBoundingClientRect().height);
    if (height === last && height > 0) return height;
    last = height;
    await page.waitForTimeout(50);
  }
  return last;
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

try {
  for (const [theme, width] of COMBOS) {
    say(`\n═══ ${theme} · ${width}px ═══`);

    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: DPR,
      locale: 'ru-RU',
      recordVideo: { dir: `${OUT}/video`, size: { width, height: 900 } },
    });
    await context.addInitScript((value) => localStorage.setItem('ndim-theme', value), theme);
    const page = await context.newPage();

    if (!(await signIn(page))) {
      say('❌ не удалось войти — поднят ли `npm run stand`?');
      await context.close();
      continue;
    }

    await page.goto(`${STAND}/dims`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('article.dim[data-dim]', { timeout: 30000 });

    const dimId = await page.locator('article.dim[data-dim]').first().getAttribute('data-dim');
    const card = `article.dim[data-dim="${dimId}"]`;
    await page.locator(card).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    // ── Клик МЫШЬЮ по звезде — ровно тот жест, что на видео владельца ──
    await page.locator(`${card} .stars .st[aria-label="${PICK}"]`).click();
    await settled(page, `${card} .faces`);
    await page.waitForTimeout(600); // переходы лица (240 мс) успевают закончиться

    /*
     * ⚠️ КУРСОР УВОДИТСЯ, И ЭТО НЕ КОСМЕТИКА — БЕЗ ЭТОГО ПРИБОР ВРЁТ.
     *
     * После `click()` мышь остаётся НА звезде, то есть под ней горит плашка
     * `.st:hover { background: var(--edge-soft) }`. Первая редакция замера намерила из-за
     * неё «кольцо вокруг выбранной звезды 0.901 при фоне 1.000» и объявила близнеца
     * непочиненным — а 0.901 это просто светлота `--edge-soft` (#eef4fa ≈ 0.897), то есть
     * штатная подсветка наведения, а не свечение. Класс ожога — EXP-0082.
     *
     * Свечение и наведение — РАЗНЫЕ вещи, и мерить их надо порознь: здесь снимается
     * свечение, поэтому наведения быть не должно.
     */
    await page.mouse.move(5, 5);
    await page.waitForTimeout(300); // переход фона плашки — .15s

    // ── Подозреваемый №2: рамка вокруг звезды после клика мышью ──
    const star = await page.locator(`${card} .stars .st[aria-label="${PICK}"]`).evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        focusVisible: el.matches(':focus-visible'),
        focused: el === document.activeElement,
        outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
        offset: s.outlineOffset,
      };
    });
    say(`звезда после клика мышью: focus=${star.focused} · :focus-visible=${star.focusVisible}`);
    say(`  обводка: ${star.outline}, offset ${star.offset}`);

    // ── Подозреваемый №1: КОЛЬЦО ПИКСЕЛЕЙ вокруг каждого лица ──
    const picked = await page.locator(`${card} .faces .fc.picked`).evaluate((el) => getComputedStyle(el).filter);
    say(`фильтр выбранного лица: ${picked}`);

    // Геометрия: прямоугольники глифов в CSS-пикселях + рамка съёмки с запасом.
    // Меряются ОБА ряда: лица и сами звёзды. Звезда — БЛИЗНЕЦ того же дефекта
    // (`.st.peak i` светится жёстко зашитым золотом) и стоит прямо над лицом, поэтому
    // «тёмное вокруг смайлика» может приходить и оттуда.
    const geo = await page.locator(card).evaluate((el) => {
      const boxes = (sel) =>
        [...el.querySelectorAll(sel)].map((n) => {
          const r = n.getBoundingClientRect();
          return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, half: r.width / 2 };
        });
      const row = el.querySelector('.faces').getBoundingClientRect();
      const stars = el.querySelector('.stars').getBoundingClientRect();
      return {
        rects: boxes('.faces .fc svg'),
        stars: boxes('.stars .st i'),
        row: { x: row.x, y: row.y, w: row.width, h: row.height },
        starsRow: { x: stars.x, y: stars.y, w: stars.width, h: stars.height },
      };
    });

    // Съёмка захватывает ОБА ряда разом — от верха звёзд до низа лиц, с запасом на свечение.
    const top = Math.max(0, geo.starsRow.y - 16);
    const clip = {
      x: Math.max(0, geo.row.x - 4),
      y: top,
      width: Math.min(width - Math.max(0, geo.row.x - 4), geo.row.w + 8),
      height: geo.row.y + geo.row.h + 24 - top,
    };
    const shot = await page.screenshot({ clip });
    await writeFile(`${OUT}/${theme}-${width}-faces.png`, shot);

    const stats = await page.evaluate(
      async ({ b64, dpr, clip, rects, stars, pick }) => {
        const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
        const bmp = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        const { data, width: W, height: H } = ctx.getImageData(0, 0, bmp.width, bmp.height);

        /** Относительная светлота WCAG — та же шкала, по которой судят контраст. */
        const chan = (v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        /** Светлота в точке, заданной В CSS-ПИКСЕЛЯХ вьюпорта. */
        const lumAt = (cssX, cssY) => {
          const px = Math.round((cssX - clip.x) * dpr);
          const py = Math.round((cssY - clip.y) * dpr);
          if (px < 0 || py < 0 || px >= W || py >= H) return null;
          const i = (py * W + px) * 4;
          return 0.2126 * chan(data[i]) + 0.7152 * chan(data[i + 1]) + 0.0722 * chan(data[i + 2]);
        };

        // Кольцо вокруг лица: от края глифа +2px до +9px, 96 углов на каждом радиусе.
        const ringOf = (r) => {
          const vals = [];
          for (let d = 2; d <= 9; d += 1) {
            const rad = r.half + d;
            for (let a = 0; a < 96; a += 1) {
              const t = (a / 96) * Math.PI * 2;
              const v = lumAt(r.cx + rad * Math.cos(t), r.cy + rad * Math.sin(t));
              if (v !== null) vals.push(v);
            }
          }
          return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
        };

        // Фон карточки: середины промежутков между глифами, но НЕ рядом с выбранным —
        // иначе в «фон» попало бы само измеряемое свечение.
        const bg = [];
        for (let i = 0; i < rects.length - 1; i += 1) {
          if (i === pick || i + 1 === pick) continue;
          const x = (rects[i].cx + rects[i + 1].cx) / 2;
          const v = lumAt(x, rects[i].cy);
          if (v !== null) bg.push(v);
        }
        const bgMean = bg.length ? bg.reduce((s, v) => s + v, 0) / bg.length : null;

        return { rings: rects.map(ringOf), stars: stars.map(ringOf), bg: bgMean };
      },
      { b64: shot.toString('base64'), dpr: DPR, clip, rects: geo.rects, stars: geo.stars, pick: PICK },
    );

    const fmt = (v) => (v === null ? '  —  ' : v.toFixed(3));
    const table = (title, values) => {
      say(title);
      values.forEach((v, i) => {
        const delta = v !== null && stats.bg !== null ? v - stats.bg : null;
        const mark = i === PICK ? ' ← ВЫБРАННОЕ' : '';
        const verdict =
          delta === null ? '' : delta < -0.02 ? '  ТЕМНЕЕ фона' : delta > 0.02 ? '  светлее фона' : '  как фон';
        say(
          `  ${String(i).padStart(2)}: ${fmt(v)}   Δ ${
            delta === null ? '  —  ' : (delta >= 0 ? '+' : '') + delta.toFixed(3)
          }${verdict}${mark}`,
        );
      });
    };
    say(`фон карточки (между лицами): ${fmt(stats.bg)}`);
    table('кольцо вокруг каждого ЛИЦА (светлота) и разница с фоном:', stats.rings);
    table('кольцо вокруг каждой ЗВЕЗДЫ (близнец того же дефекта):', stats.stars);

    // Крупные кропы ровно вокруг выбранного лица — их и показываем владельцу.
    // Снимается ПАРА: как сейчас и как было бы с прежним ореолом. Пара нужна потому, что
    // «тёмного нет» на одиночном кадре недоказуемо — глазу не с чем сравнивать.
    const r = geo.rects[PICK];
    const pad = 26;
    const zoom = {
      x: r.cx - r.half - pad,
      y: r.cy - r.half - pad,
      width: (r.half + pad) * 2,
      height: (r.half + pad) * 2,
    };
    await page.screenshot({ clip: zoom, path: `${OUT}/${theme}-${width}-after.png` });

    // Прежнее поведение возвращается ТОЛЬКО в этой вкладке и только ради кадра сравнения:
    // токен переопределяется стилем, файлы продукта не трогаются.
    await page.addStyleTag({ content: ':root { --glow: var(--star) !important; }' });
    await page.waitForTimeout(400);
    await page.screenshot({ clip: zoom, path: `${OUT}/${theme}-${width}-before.png` });

    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(`${OUT}/report.txt`, lines.join('\n'), 'utf8');
  console.log(`\nотчёт: ${OUT}/report.txt`);
}

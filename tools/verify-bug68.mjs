/**
 * QA-прогон bugs/68 живым браузером на стенде: РАСКРЫВАШКИ ОТКРЫВАЮТСЯ И ЗАКРЫВАЮТСЯ ПЛАВНО.
 *
 * Слово владельца (волна 13): «при сворачивании и разворачивании этих карточек с описанием
 * версий есть мини подёргивания в начале пути анимации и в конце пути анимации».
 *
 * Метод (EXP-0060: мерцания ловит только покадровая трасса): rAF-семплер пишет высоту
 * раскрывашки НА КАЖДОМ КАДРЕ. Плавная анимация — монотонная последовательность высот с
 * плавно меняющимся шагом; подёргивание — кадр, где высота скакнула заметно больше соседей
 * (например, отступ, который меняется мгновенно, пока высота ещё едет).
 *
 * Стережём:
 *   1) ход монотонный (открытие только растёт, закрытие только убывает — без отскоков);
 *   2) ни один кадр не съедает больше допустимой доли пути (скачок = подёргивание);
 *   3) анимация вообще играет (не мгновенная подмена — иначе «плавно» было бы зелёным от
 *      того, что анимации нет);
 *   4) консоль чиста.
 *
 * Флаг `--trace` печатает сырые покадровые высоты — так снимался замер ДО кода.
 *
 * Требует поднятый `npm run stand`. Скриншоты — test-results/bug68/.
 * Запуск: node tools/verify-bug68.mjs [--trace] [--quick]
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const SHOTS = 'test-results/bug68';
const TRACE = process.argv.includes('--trace');
const QUICK = process.argv.includes('--quick');

/** Длительность анимации продукта (--motion-base) плюс запас на хвост кадров. */
const ANIMATION_MS = 240;
const TAIL_MS = 260;

/**
 * Признак подёргивания — НЕ доля пути (мерить ею бесполезно: на разгоне кривой один кадр
 * честно съедает пятую часть хода). Рывок виден в сравнении с СОСЕДНИМИ кадрами:
 *   • хвост: анимация замедляется, поэтому шаг после пика не может внезапно вырасти;
 *   • голова: до пика шаги нарастают плавно, а не «крошка, затем сразу всё».
 * Множители — с запасом на пропущенные браузером кадры, плюс абсолютный порог: колебание
 * меньше 3px человек не увидит, и гонять из-за него стража не нужно.
 */
const TAIL_GROWTH_LIMIT = 1.5;
const HEAD_JUMP_LIMIT = 5;
const NOISE_PX = 3;

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Ставит покадровый семплер высоты на указанный элемент (селектор + порядковый номер). */
const START_TRACE = (selector, index) => {
  const node = document.querySelectorAll(selector)[index];
  window.__heights = [];
  window.__stop = false;
  const sample = () => {
    window.__heights.push(Math.round(node.getBoundingClientRect().height * 10) / 10);
    if (!window.__stop) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
};

/**
 * Разбор трассы. Шаги — ненулевые изменения высоты между кадрами; их последовательность у
 * плавной кривой одногорбая: разгон до пика, затем затухание. Ищем два вида рывка.
 */
function analyse(heights) {
  const first = heights[0];
  const last = heights[heights.length - 1];
  const direction = Math.sign(last - first);
  const steps = [];
  let backsteps = 0;
  for (let i = 1; i < heights.length; i += 1) {
    const step = Math.round((heights[i] - heights[i - 1]) * 10) / 10;
    if (step === 0) continue;
    if (Math.sign(step) !== direction) backsteps += 1;
    steps.push(Math.abs(step));
  }
  const peak = steps.indexOf(Math.max(...steps, 0));

  // Хвост: после пика анимация обязана затухать — вырос шаг, значит дёрнулось.
  const tail = [];
  for (let i = peak + 1; i < steps.length; i += 1) {
    const grew = steps[i] > steps[i - 1] * TAIL_GROWTH_LIMIT && steps[i] - steps[i - 1] >= NOISE_PX;
    if (grew) tail.push(`кадр ${i + 1}: ${steps[i - 1]}px → ${steps[i]}px`);
  }
  // Голова: до пика шаги нарастают плавно. «Крошка, затем сразу всё» — мгновенный скачок
  // чего-то, что не участвует в анимации (так себя показал отступ `[open]`).
  const head = [];
  for (let i = 1; i <= peak; i += 1) {
    const leapt = steps[i] > steps[i - 1] * HEAD_JUMP_LIMIT && steps[i] - steps[i - 1] >= NOISE_PX;
    if (leapt) head.push(`кадр ${i + 1}: ${steps[i - 1]}px → ${steps[i]}px`);
  }

  return {
    first, last, steps, backsteps, tail, head,
    distance: Math.abs(last - first),
    moving: steps.length,
  };
}

/** Один прогон: клик по summary, покадровая трасса высоты раскрывашки. */
async function traceToggle(page, selector, index) {
  await page.evaluate(([sel, idx]) => window.__startTrace(sel, idx), [selector, index]);
  await page.evaluate(([sel, idx]) => {
    document.querySelectorAll(`${sel} > summary`)[idx].click();
  }, [selector, index]);
  await page.waitForTimeout(ANIMATION_MS + TAIL_MS);
  await page.evaluate(() => (window.__stop = true));
  return page.evaluate(() => window.__heights);
}

const browser = await chromium.launch();
await mkdir(SHOTS, { recursive: true });

const COMBOS = QUICK ? [['light', 1440]] : [['light', 390], ['light', 1440], ['dark', 390], ['dark', 1440]];
/* Проверяем обе раскрывашки: внешнюю карточку «История версий» и вложенную запись версии
   (именно её показал владелец на скриншоте). */
const TARGETS = [
  { selector: '.history', index: 0, name: 'карточка «История версий»' },
  // ⚠️ Селектор именно `details.ver`: класс `.ver` носят ещё и строки виджета «Версии»
  // (`Versions.svelte`), они не раскрывашки. Голый `.ver` сдвигал нумерацию, и трасса
  // молча меряла неподвижный элемент — проверка была бы зелёной от того, что ничего не
  // происходит. Индекс 3 — запись с крупным содержимым: короткий путь нечем мерить.
  { selector: 'details.ver', index: 3, name: 'запись версии (вложенная)' },
];

try {
  for (const [theme, width] of COMBOS) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU' });
    await context.addInitScript((value) => localStorage.setItem('ndim-theme', value), theme);
    await context.addInitScript((code) => {
      window.__startTrace = new Function('selector', 'index', `(${code})(selector, index)`);
    }, START_TRACE.toString());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (event) => errors.push(String(event)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto(`${BASE}/menu/about`);
    await page.waitForSelector('.history', { timeout: 20000 });
    // Раскроем внешнюю карточку заранее там, где меряем вложенную запись.
    for (const target of TARGETS) {
      for (const action of ['раскрытие', 'сворачивание']) {
        console.log(`${target.name} · ${action} (${theme}, ${width}):`);
        if (target.selector === 'details.ver') {
          const opened = await page.evaluate(() => document.querySelector('.history').open);
          if (!opened) {
            await page.click('.history > summary');
            await page.waitForTimeout(ANIMATION_MS + TAIL_MS);
          }
        }
        const heights = await traceToggle(page, target.selector, target.index);
        const report = analyse(heights);
        if (TRACE) console.log(`     трасса: ${heights.join(' ')}`);

        check(
          'ход монотонный (без отскоков)',
          report.backsteps === 0,
          `кадров назад: ${report.backsteps}, путь ${report.first}→${report.last}px`,
        );
        check(
          'нет рывка в КОНЦЕ пути (анимация затухает)',
          report.tail.length === 0,
          report.tail.join('; ') || `шаги: ${report.steps.join(' ')}`,
        );
        check(
          'нет рывка в НАЧАЛЕ пути (разгон плавный)',
          report.head.length === 0,
          report.head.join('; '),
        );
        check(
          'анимация играет (не мгновенная подмена)',
          report.moving >= 4,
          `двигавшихся кадров: ${report.moving}, путь ${report.distance}px`,
        );
      }
    }

    await page.screenshot({ path: `${SHOTS}/about-${theme}-${width}.png`, fullPage: true });
    check('консоль чиста', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nИтог: все проверки зелёные.' : `\nИтог: ❌ провалов — ${failures}`);
process.exit(failures === 0 ? 0 : 1);

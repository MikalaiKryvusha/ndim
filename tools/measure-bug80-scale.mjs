/**
 * ПРИБОР ЗАМЕРА (не страж) для bugs/80, подпункт «в» — АДАПТИВНЫЙ РАЗМЕР шкалы 0–10
 * в руководстве пользователя.
 *
 * Слово владельца:
 *   2026-07-29: «в таблице „Шкала оценок 0–10“ … старые звёздочки и смайлики. И они маленькие.
 *                В таблице сделать размер масштабируемым адаптивно.»
 *   2026-07-30: «на десктопе малые элементы в таблице в руководстве» (прислал кроп десктопа).
 *
 * ЗАЧЕМ ЭТОТ ЗАМЕР. Документ бага прямо требует шага 0: «без этого „они маленькие“ остаётся
 * впечатлением, и не с чем будет сравнивать „после“». Образец — bugs/17, где ровно такая же
 * жалоба («иконки маленькие») была доказана числом, а не обсуждена. До сегодня шаг 0 не
 * снимался: прибор волны `probe-ideas21.mjs` страницу руководства не открывал вовсе.
 *
 * ЧТО МЕРИТСЯ. Вычисленные браузером размеры звезды, цифры, смайлика и текста описаний на
 * ДВУХ ширинах. Ключевая величина — не сам размер, а РАЗНИЦА между 390 и 1440: если она
 * нулевая, значит адаптива нет вовсе (сейчас все размеры — константы), и жалоба «на десктопе
 * мелко» объясняется тем, что колонка выросла с 458 до 820px, а элементы — нет.
 *
 * Рядом печатается опорная величина: звезда в карточке «Измерений» — 27px (`dims/+page.svelte`).
 * Она и есть кандидат в потолок: руководство не должно показывать шкалу мельче, чем продукт.
 *
 * По умолчанию меряет БОЙ — то, на что смотрит владелец. Локально: PROBE_BASE=http://localhost:4173
 * Запуск: node tools/measure-bug80-scale.mjs
 * Выход: test-results/bug80-scale/ (скриншоты таблицы, report.txt)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { markProbeContext } from './lib/probe-mark.mjs';

const BASE = process.env.PROBE_BASE ?? 'https://ndimspace.app';
const PAGE = '/ru/menu/manual';
const OUT = 'test-results/bug80-scale';

/** Звезда карточки «Измерений» — то, что человек видит в самом продукте. */
const PRODUCT_STAR_PX = 27;

const lines = [];
function say(text = '') {
  console.log(text);
  lines.push(text);
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

/** Собранные размеры по ширинам — чтобы в конце сравнить 390 с 1440. */
const byWidth = new Map();

try {
  for (const theme of ['light', 'dark']) {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        deviceScaleFactor: 2,
        locale: 'ru-RU',
      });
      await markProbeContext(context);
      await context.addInitScript((v) => localStorage.setItem('ndim-theme', v), theme);
      const page = await context.newPage();
      await page.goto(`${BASE}${PAGE}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('table.grades', { timeout: 30000 });

      /*
       * ⚠️ ПРОКРУТКА ДО НИЗА ОБЯЗАТЕЛЬНА. Иллюстрации помечены `loading="lazy"` и проявляются
       * действием `use:ready` только когда картинка ГОТОВА (глобальное правило владельца о
       * готовности графики). Первая редакция мерила их без прокрутки и получила `0×0` и
       * `24×24` — то есть печатала размеры незагруженных картинок как факт о вёрстке.
       */
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 400) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForFunction(
        () => [...document.querySelectorAll('.art img')].every((i) => i.naturalWidth > 0),
        undefined,
        { timeout: 20000 },
      );
      await page.waitForTimeout(400);

      const seen = await page.evaluate(() => {
        const px = (el, prop) => (el ? Number.parseFloat(getComputedStyle(el)[prop]) : null);
        const table = document.querySelector('table.grades');
        const mark = table?.querySelector('.mark');
        const svg = mark?.querySelector('svg');
        const desc = table?.querySelector('td:not(.mark)');
        const col = document.querySelector('.doc') ?? document.body;
        return {
          star: px(mark?.querySelector('i'), 'fontSize'),
          digit: px(mark?.querySelector('b'), 'fontSize'),
          // У смайлика размер задают атрибуты width/height, поэтому берём РЕАЛЬНЫЙ прямоугольник.
          face: svg ? Math.round(svg.getBoundingClientRect().width * 10) / 10 : null,
          desc: px(desc, 'fontSize'),
          base: px(col, 'fontSize'),
          column: Math.round(col.getBoundingClientRect().width),
          // Иллюстрации: владелец отдельно сказал, что финальный знак «Напутствия» ОГРОМЕН,
          // «в оригинале было маленькое». Меряем каждую картинку и её долю от колонки.
          arts: [...document.querySelectorAll('.art img')].map((img) => {
            const r = img.getBoundingClientRect();
            return {
              src: img.getAttribute('src').split('/').pop(),
              w: Math.round(r.width),
              h: Math.round(r.height),
              logo: img.closest('.art').classList.contains('logo'),
            };
          }),
        };
      });

      byWidth.set(`${theme}-${width}`, seen);
      say(`── ${theme} · ${width}px ──`);
      say(`  колонка документа : ${seen.column}px`);
      say(`  звезда            : ${seen.star}px`);
      say(`  цифра             : ${seen.digit}px`);
      say(`  смайлик           : ${seen.face}px`);
      say(`  текст описаний    : ${seen.desc}px   (базовый кегль ${seen.base}px)`);
      for (const a of seen.arts) {
        const share = Math.round((a.w / seen.column) * 100);
        say(`  иллюстрация ${a.src.padEnd(14)} ${a.w}×${a.h}px — ${share}% ширины колонки${a.logo ? '  (класс logo)' : ''}`);
      }

      await page.locator('table.grades').screenshot({ path: `${OUT}/${theme}-${width}-scale.png` });
      await context.close();
    }
  }

  // ── Главный вывод: РАЗНИЦА между телефоном и десктопом ──
  say('');
  say('◆ АДАПТИВНОСТЬ (разница 390 → 1440, светлая тема):');
  const a = byWidth.get('light-390');
  const b = byWidth.get('light-1440');
  const rows = [
    ['колонка документа', a.column, b.column],
    ['звезда', a.star, b.star],
    ['цифра', a.digit, b.digit],
    ['смайлик', a.face, b.face],
    ['текст описаний', a.desc, b.desc],
  ];
  for (const [name, small, big] of rows) {
    const grew = big !== small;
    say(`  ${name.padEnd(18)} ${String(small).padStart(6)} → ${String(big).padStart(6)}   ${grew ? `×${(big / small).toFixed(2)}` : 'НЕ МЕНЯЕТСЯ'}`);
  }

  say('');
  say(`◆ ОПОРА: звезда карточки «Измерений» — ${PRODUCT_STAR_PX}px (сам продукт).`);
  say(`  звезда руководства на десктопе — ${b.star}px, это ${Math.round((b.star / PRODUCT_STAR_PX) * 100)}% от продукта.`);
  /* Вывод считается ПО ЗАМЕРУ, а не печатается заранее: первая редакция утверждала «элементы
     не растут» безусловно и после починки продолжала бы это утверждать. */
  const scales = b.star !== a.star && b.face !== a.face;
  const widened = b.column / a.column;
  say(`  колонка выросла в ${widened.toFixed(2)} раза, шкала — в ${(b.star / a.star).toFixed(2)}.`);
  say(
    scales
      ? '  ⇒ шкала растёт вместе с колонкой: на десктопе она догоняет размер самого продукта.'
      : '  ⇒ растёт поле, а не содержимое — ровно поэтому на десктопе шкала читается мелкой.',
  );
} finally {
  await browser.close();
  await writeFile(`${OUT}/report.txt`, lines.join('\n'), 'utf8');
  console.log(`\nотчёт: ${OUT}/report.txt · скриншоты: ${OUT}/`);
}

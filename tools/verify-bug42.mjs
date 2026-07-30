/**
 * QA-прогон bugs/42 на стенде живым браузером: виджет «Сервер синхронизации» экрана
 * «Пространство» показывает три честных блока (Статус · Полная · Частичная), как в 1.x.
 * Канон процесса — plans/06. Требует `npm run stand`. Скриншоты — test-results/bug42/.
 *
 * ── РЕВИЗИЯ 2026-07-30: страж защищал ОТМЕНЁННЫЕ владельцем подписи ────────────────────────
 * Он не гонялся с тех пор, как виджет переделали `bugs/85` / `bugs/86` и ответы владельца
 * В5=А и В6, и потому был красным и падал исключением:
 *
 *   · требовал строку **«Следующий цикл»** — её больше нет: время следующего цикла уехало в
 *     блок «Частичная синхронизация» как «Запланированная» (`bugs/86`);
 *   · требовал **«Из них обновлено»** и **«Связей рассчитано»** — владелец переименовал их в
 *     **«Записано изменений»** и **«Связей в Пространстве»** (В5=А). Зелёный страж на старых
 *     подписях охранял бы отменённое решение — это хуже, чем никакого стража;
 *   · искал «Запланированная» по всему виджету, а она теперь в ДВУХ блоках, и строгий
 *     локатор Playwright падал на двух совпадениях.
 *
 * Теперь проверки **привязаны к блоку**: одна и та же подпись в «Полной» и «Частичной» — это
 * разные строки, и путать их нельзя.
 *
 * Запуск: node tools/verify-bug42.mjs
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const SHOTS = 'test-results/bug42';

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function person(browser, { theme, width = 390 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU' });
  if (theme) await context.addInitScript((value) => localStorage.setItem('ndim-theme', value), theme);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return { context, page, errors };
}

const browser = await chromium.launch();
await mkdir(SHOTS, { recursive: true });

try {
  for (const theme of ['light', 'dark']) {
    for (const width of [390, 1440]) {
      console.log(`bugs/42 · виджет сервера (${theme}, ширина ${width}):`);
      const { context, page, errors } = await person(browser, { theme, width });
      await page.goto(`${BASE}/space`);
      const widget = page.locator('.card.w-server');
      await widget.waitFor({ timeout: 20000 });

      // Вычислитель стенда (цикл 15 с) мог ещё не отчитаться блоками — дождаться полной.
      await page
        .locator('.card.w-server .sub-h', { hasText: 'Полная синхронизация' })
        .waitFor({ timeout: 30000 });

      const subHeads = await widget.locator('.sub-h').allInnerTexts();
      check(
        'три блока в порядке 1.x',
        JSON.stringify(subHeads) ===
          JSON.stringify(['Статус', 'Полная синхронизация', 'Частичная синхронизация']),
        subHeads.join(' · '),
      );

      /*
       * Строки читаем ПО БЛОКАМ: подписи «Последняя успешная», «Выполнена за» и
       * «Запланированная» живут и в «Полной», и в «Частичной» — это РАЗНЫЕ строки, и
       * проверять их «по всему виджету» значит не проверять ничего.
       */
      const sections = await widget.evaluate((card) => {
        const out = {};
        let current = null;
        for (const node of card.children) {
          if (node.classList.contains('sub-h')) {
            current = node.innerText.trim();
            out[current] = [];
          } else if (node.classList.contains('kv') && current !== null) {
            out[current].push([
              node.querySelector('.k')?.innerText.trim() ?? '',
              node.querySelector('.v')?.innerText.trim() ?? '',
            ]);
          }
        }
        return out;
      });
      const rowsOf = (section) => sections[section] ?? [];
      const keysOf = (section) => rowsOf(section).map(([k]) => k);
      const valueOf = (section, key) => rowsOf(section).find(([k]) => k === key)?.[1] ?? null;

      const canon = {
        'Статус': ['Текущее состояние', 'Последний запуск'],
        'Полная синхронизация': [
          'Последняя успешная',
          'Выполнена за',
          'Пользователей проверено',
          // Подписи — слово владельца (В5=А). Агент не вправе их переписать.
          'Записано изменений',
          'Связей в Пространстве',
          'Запланированная',
        ],
        'Частичная синхронизация': ['Последняя успешная', 'Выполнена за', 'Пользователей обновлено', 'Запланированная'],
      };
      for (const [section, expected] of Object.entries(canon)) {
        for (const key of expected) {
          check(`«${section}» → строка «${key}» на месте`, keysOf(section).includes(key), keysOf(section).join(' · '));
        }
      }

      // Отменённые владельцем подписи не имеют права вернуться (В5=А) — иначе тихий откат
      // его решения пройдёт незамеченным.
      const allKeys = Object.values(sections).flat().map(([k]) => k);
      for (const gone of ['Из них обновлено', 'Связей рассчитано', 'Пользователей синхронизировано', 'Следующий цикл']) {
        check(`отменённой подписи «${gone}» больше нет`, !allKeys.includes(gone));
      }

      /*
       * Главная ложь, которую лечил bugs/42: в «Запланированной» ПОЛНОЙ стоял следующий
       * минутный цикл. Теперь полная — ночная (00:00 UTC, ответ владельца В6), а минутный
       * цикл живёт в «Частичной». Значит два этих времени обязаны РАЗЛИЧАТЬСЯ, а ночное —
       * приходиться на ночной час.
       */
      const fullPlanned = valueOf('Полная синхронизация', 'Запланированная');
      const partialPlanned = valueOf('Частичная синхронизация', 'Запланированная');
      check(
        'полная «Запланированная» ≠ частичная «Запланированная»',
        fullPlanned !== null && partialPlanned !== null && fullPlanned !== partialPlanned,
        `полная ${fullPlanned} vs частичная ${partialPlanned}`,
      );
      /*
       * 00:00 UTC — это 02:00…04:00 по местному времени машины владельца (UTC+2/+3), а минуты
       * ровно нулевые: час прохода задан часом, а не «когда подняли контейнер».
       *
       * ⚠️ Час выковыриваем разбором, а не `\b`-регуляркой по фразе: в JS `\b` считает границу
       * по `[A-Za-z0-9_]`, поэтому вокруг кириллического «в» она ведёт себя не так, как ждёшь,
       * и проверка краснела на исправном значении «31 июля 2026 г. в 03:00».
       */
      const clock = /(\d{1,2}):(\d{2})\s*$/.exec(fullPlanned ?? '');
      const hour = clock === null ? null : Number(clock[1]);
      check(
        'полная запланирована на НОЧНОЙ час (00:00 UTC, ответ владельца В6)',
        hour !== null && hour <= 4 && clock[2] === '00',
        String(fullPlanned),
      );

      await page.screenshot({ path: `${SHOTS}/space-server-${theme}-${width}.png`, fullPage: false });
      check('консоль чиста', errors.length === 0, errors.join(' | ').slice(0, 200));
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nИтог: все проверки зелёные.' : `\nИтог: ПРОВАЛОВ — ${failures}.`);
process.exit(failures === 0 ? 0 : 1);

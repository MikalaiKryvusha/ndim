/**
 * СТРАЖ ШАПКИ ЭКРАНОВ ПРИЛОЖЕНИЯ — заголовок и плашка-подсказка одной формы на всех экранах,
 * и во время загрузки тоже (стенд).
 *
 * Слово владельца 2026-09-19, дословно: «на разных страницах верх страницы оформлен по разному.
 * В Пространстве подпись "Ниже представлены текущие метрики и статистика Пространства NDim."
 * оформлена не как хелп карточка, как на других страницах. На профиле нет заголовка "Профиль".
 * Пока страницы грузятся, где-то есть заголовок+хелп карточка, где-то нет — везде должна быть,
 * пока контент грузится.»
 *
 * Канон — 1.x (`design/reference-1x/app-01…03`, `app-08`): заголовок экрана и под ним серая
 * плашка-подсказка; у «Меню» только заголовок.
 *
 * ЧТО УТВЕРЖДАЕТСЯ (по каждому экрану × тема × ширина, критерии объявлены ДО прогона):
 *   Ш1 · заголовок экрана виден и равен подписи вкладки нижней панели («Профиль», «Связи»…);
 *   Ш2 · плашка-подсказка видна под заголовком и оформлена карточкой (свой фон, поля ≥ 8px) —
 *        у всех экранов, кроме «Меню», где её нет и в 1.x;
 *   Ш3 · то же самое ПОКА ЭКРАН ГРУЗИТСЯ: карточка «Загрузка» на экране, а шапка — над ней;
 *   Ш4 · шапка ОДНОЙ ФОРМЫ на всех экранах: у заголовков и у плашек одинаковы кегль, насыщенность,
 *        цвет, фон, поля и скругление (жалоба владельца — именно на разнобой).
 *
 * Контроль прибора ПЕРВЫМ: фаза «грузится» засчитывается, только если карточка «Загрузка»
 * действительно на экране (база придерживается роутом) — иначе «шапка видна при загрузке»
 * было бы зелено на экране, который загрузки не показывал вовсе. У «Меню» загрузки нет.
 *
 * Только читает. Требует поднятый `npm run stand` (на голом адресе стенд входит `dev@`).
 * Запуск: node tools/verify-screen-heads.mjs [--quick]   (--quick — одна тема × 390)
 * Кадры верха экранов: test-results/screen-heads/
 *
 * [TESTED: 2026-09-19 · стенд: на старом коде 9 провалов (ровно жалоба владельца), после починки 117/0 на
 *  390/1440 × light/dark; мутант «кегль плашки на одном экране» красный; кадры прочитаны глазами; отчёт
 *  qa/reports/2026-09-19_dims-flight-and-screen-heads.md]
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const OUT = 'test-results/screen-heads';
const FIRESTORE_DELAY_MS = 2500;
const QUICK = process.argv.includes('--quick');

/** Экраны, их заголовок (= подпись вкладки нижней панели) и есть ли у них плашка в 1.x. */
const SCREENS = [
  { path: '/profile', title: 'Профиль', help: true, loads: true },
  { path: '/relations', title: 'Связи', help: true, loads: true },
  { path: '/space', title: 'Пространство', help: true, loads: true },
  { path: '/dims', title: 'Измерения', help: true, loads: true },
  { path: '/menu', title: 'Меню', help: false, loads: false },
];

let failures = 0;
function check(ok, text) {
  console.log(`  ${ok ? '✅' : '❌'} ${text}`);
  if (!ok) failures += 1;
}

/** Снимок шапки со страницы: заголовок, плашка, карточка загрузки и их вид. */
const READ_HEAD = () => {
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.5;
  };
  const main = document.querySelector('main');
  const h1 = main ? [...main.querySelectorAll('h1')].find(visible) ?? null : null;
  const intro = main ? [...main.querySelectorAll('.intro')].find(visible) ?? null : null;
  const load = document.querySelector('.load-card');
  const pick = (el, keys) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return Object.fromEntries(keys.map((k) => [k, cs[k]]));
  };
  return {
    title: h1 ? h1.textContent.trim() : null,
    // Верх заголовка — от верха рабочей области `main` (шапка продукта у экранов своя по высоте).
    titleTop: h1 && main ? Math.round(h1.getBoundingClientRect().top - main.getBoundingClientRect().top) : null,
    titleBottom: h1 ? Math.round(h1.getBoundingClientRect().bottom) : null,
    titleStyle: pick(h1, ['fontSize', 'fontWeight', 'color']),
    help: intro ? intro.textContent.trim() : null,
    helpTop: intro ? Math.round(intro.getBoundingClientRect().top) : null,
    helpBottom: intro ? Math.round(intro.getBoundingClientRect().bottom) : null,
    helpStyle: pick(intro, ['fontSize', 'color', 'backgroundColor', 'paddingTop', 'paddingLeft', 'borderTopLeftRadius']),
    loading: visible(load),
    loadTop: visible(load) ? Math.round(load.getBoundingClientRect().top) : null,
  };
};

function judge(screen, head, phase) {
  const where = `${screen.path} · ${phase}`;
  check(head.title === screen.title, `Ш1 ${where}: заголовок «${head.title ?? 'НЕТ'}» (ожидали «${screen.title}»)`);
  if (screen.help) {
    const card =
      head.helpStyle !== null &&
      head.helpStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
      parseFloat(head.helpStyle.paddingTop) >= 8 &&
      parseFloat(head.helpStyle.paddingLeft) >= 8;
    const below = head.helpTop !== null && head.titleBottom !== null && head.helpTop >= head.titleBottom;
    check(
      head.help !== null && head.help.length > 0 && card && below,
      `Ш2 ${where}: плашка-подсказка ${head.help === null ? 'НЕ НАЙДЕНА' : card ? (below ? 'карточкой под заголовком' : 'НЕ под заголовком') : 'БЕЗ вида карточки'}`,
    );
  } else {
    check(head.help === null, `Ш2 ${where}: плашки нет, как в 1.x`);
  }
}

const combos = QUICK ? [['light', 390]] : [['light', 390], ['light', 1440], ['dark', 390], ['dark', 1440]];
const browser = await chromium.launch();

try {
  for (const [theme, width] of combos) {
    const dir = `${OUT}/${theme}-${width}`;
    await mkdir(dir, { recursive: true });
    console.log(`\n═══ тема ${theme} · ширина ${width} ═══`);
    const signature = [];

    for (const screen of SCREENS) {
      // ── Фаза «грузится»: база придержана, карточка «Загрузка» обязана быть на экране ──
      if (screen.loads) {
        const context = await browser.newContext({ viewport: { width, height: 860 }, locale: 'ru-RU' });
        await context.addInitScript((value) => localStorage.setItem('ndim-theme', value), theme);
        const page = await context.newPage();
        await page.route(/:8181\//, async (route) => {
          await new Promise((resolve) => setTimeout(resolve, FIRESTORE_DELAY_MS));
          await route.continue().catch(() => {});
        });
        await page.goto(`${BASE}${screen.path}`);
        const seen = await page
          .waitForSelector('.load-card', { state: 'visible', timeout: 15000 })
          .then(() => true)
          .catch(() => false);
        const head = await page.evaluate(READ_HEAD);
        check(seen && head.loading, `контроль прибора ${screen.path}: карточка «Загрузка» на экране`);
        if (seen && head.loading) {
          judge(screen, head, 'грузится');
          const above = head.loadTop !== null && (head.helpBottom ?? head.titleBottom ?? Infinity) <= head.loadTop;
          check(above, `Ш3 ${screen.path} · грузится: шапка стоит НАД карточкой «Загрузка»`);
        }
        await page.screenshot({ path: `${dir}${screen.path}-loading.png`, clip: { x: 0, y: 0, width, height: 520 } });
        await context.close();
      }

      // ── Фаза «готово» ──
      const context = await browser.newContext({ viewport: { width, height: 860 }, locale: 'ru-RU' });
      await context.addInitScript((value) => localStorage.setItem('ndim-theme', value), theme);
      const page = await context.newPage();
      await page.goto(`${BASE}${screen.path}`);
      await page.waitForSelector('main h1, main .intro', { timeout: 20000 }).catch(() => {});
      await page.waitForFunction(() => !document.querySelector('.load-card'), null, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(600);
      const head = await page.evaluate(READ_HEAD);
      judge(screen, head, 'готово');
      signature.push({ path: screen.path, title: head.titleStyle, help: screen.help ? head.helpStyle : undefined, top: head.titleTop });
      await page.screenshot({ path: `${dir}${screen.path}-ready.png`, clip: { x: 0, y: 0, width, height: 520 } });
      await context.close();
    }

    // ── Ш4: одна форма на всех экранах ──
    const same = (list, field) => {
      const seen = list.filter((s) => s[field]).map((s) => JSON.stringify(s[field]));
      return { ok: seen.length > 0 && new Set(seen).size === 1, distinct: [...new Set(seen)] };
    };
    const titles = same(signature, 'title');
    check(titles.ok, `Ш4 заголовки одной формы на всех экранах${titles.ok ? '' : `: ${titles.distinct.join(' ≠ ')}`}`);
    const helps = same(signature.filter((s) => s.help !== undefined), 'help');
    check(helps.ok, `Ш4 плашки одной формы на всех экранах${helps.ok ? '' : `: вариантов ${helps.distinct.length}`}`);
    const tops = signature.map((s) => s.top);
    const spread = Math.max(...tops) - Math.min(...tops);
    check(
      spread <= 1,
      `Ш4 заголовок стоит на одной высоте от верха рабочей области: ${signature.map((s) => `${s.path} ${s.top}`).join(' · ')}`,
    );
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\n✅ ЗЕЛЁНЫЙ' : `\n❌ КРАСНЫЙ — провалов ${failures}`);
console.log(`кадры: ${OUT}/`);
process.exitCode = failures === 0 ? 0 : 1;

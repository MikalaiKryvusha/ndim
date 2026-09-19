/**
 * ШАПКА ЭКРАНОВ ПРИЛОЖЕНИЯ: чтение, суд и обход пяти экранов — одни на стенд и на живой контур.
 *
 * Зовут `tools/verify-screen-heads.mjs` (стенд, входит `dev@`) и `tools/verify-live-dims-rating.mjs`
 * (стейдж и бой, гостем). Слово владельца 2026-09-19: «*на разных страницах верх страницы оформлен
 * по разному… На профиле нет заголовка "Профиль". Пока страницы грузятся… везде должна быть*».
 * Канон — 1.x (`design/reference-1x/app-01…03`, `app-08`): заголовок и серая плашка-подсказка; у
 * «Меню» только заголовок.
 *
 *   Ш1 · заголовок экрана = подпись вкладки нижней панели;
 *   Ш2 · плашка-подсказка карточкой под заголовком (у «Меню» её нет);
 *   Ш3 · то же, ПОКА ЭКРАН ГРУЗИТСЯ: «Загрузка» на экране, шапка над ней;
 *   Ш4 · одна форма и одна высота заголовка на всех экранах.
 * Контроль прибора: фаза «грузится» засчитывается, только если «Загрузка» действительно на экране.
 *
 * Модуль ничего не делает при подключении — только экспортирует.
 *
 * [TESTED: 2026-09-19 · стенд: `verify-screen-heads` через модуль 117/0 на 390/1440 × обе темы;
 *  отчёт qa/reports/2026-09-19_dims-flight-and-screen-heads.md]
 */

import { mkdir } from 'node:fs/promises';

/** Экраны, их заголовок (= подпись вкладки нижней панели) и есть ли у них плашка в 1.x. */
export const SCREEN_HEADS = [
  { path: '/profile', title: 'Профиль', help: true, loads: true },
  { path: '/relations', title: 'Связи', help: true, loads: true },
  { path: '/space', title: 'Пространство', help: true, loads: true },
  { path: '/dims', title: 'Измерения', help: true, loads: true },
  { path: '/menu', title: 'Меню', help: false, loads: false },
];

/** Снимок шапки со страницы (исполняется в браузере): заголовок, плашка, карточка загрузки. */
export const READ_HEAD = () => {
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

/** Ш1 и Ш2 для одного экрана в одной фазе. */
export function judgeHead(screen, head, phase, check) {
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

/**
 * Обходит пять экранов в фазах «грузится» и «готово» и судит Ш1–Ш4.
 * `openPage()` отдаёт страницу контекста, где человек уже есть (стенд — `dev@`, контур — гость);
 * `hold` — образец адреса базы, который придерживается, чтобы «Загрузка» была измерима;
 * `dir` — куда класть кадры верха экранов.
 */
export async function checkScreenHeads({ openPage, base, hold, width, dir, check, delayMs = 2500 }) {
  await mkdir(dir, { recursive: true });
  const signature = [];
  for (const screen of SCREEN_HEADS) {
    // ── Фаза «грузится»: база придержана, карточка «Загрузка» обязана быть на экране ──
    if (screen.loads) {
      const page = await openPage();
      await page.route(hold, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        await route.continue().catch(() => {});
      });
      await page.goto(`${base}${screen.path}`);
      const seen = await page
        .waitForSelector('.load-card', { state: 'visible', timeout: 15000 })
        .then(() => true)
        .catch(() => false);
      const head = await page.evaluate(READ_HEAD);
      check(seen && head.loading, `контроль прибора ${screen.path}: карточка «Загрузка» на экране`);
      if (seen && head.loading) {
        judgeHead(screen, head, 'грузится', check);
        const above = head.loadTop !== null && (head.helpBottom ?? head.titleBottom ?? Infinity) <= head.loadTop;
        check(above, `Ш3 ${screen.path} · грузится: шапка стоит НАД карточкой «Загрузка»`);
      }
      await page.screenshot({ path: `${dir}${screen.path}-loading.png`, clip: { x: 0, y: 0, width, height: 520 } });
      await page.close();
    }

    // ── Фаза «готово» ──
    const page = await openPage();
    await page.goto(`${base}${screen.path}`);
    await page.waitForSelector('main h1, main .intro', { timeout: 20000 }).catch(() => {});
    await page.waitForFunction(() => !document.querySelector('.load-card'), null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(600);
    const head = await page.evaluate(READ_HEAD);
    judgeHead(screen, head, 'готово', check);
    signature.push({ path: screen.path, title: head.titleStyle, help: screen.help ? head.helpStyle : undefined, top: head.titleTop });
    await page.screenshot({ path: `${dir}${screen.path}-ready.png`, clip: { x: 0, y: 0, width, height: 520 } });
    await page.close();
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

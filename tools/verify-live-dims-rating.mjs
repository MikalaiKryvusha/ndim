/**
 * СМОУК ПОЛЬЗОВАТЕЛЬСКИХ СЦЕНАРИЕВ «ИЗМЕРЕНИЙ» И ШАПКИ ЭКРАНОВ НА ЖИВОМ КОНТУРЕ (стейдж · бой).
 *
 * Слово владельца 2026-09-19, дословно: «*дальше кати в прод, и тестируй в проде смоук проверками
 * юзерских сценариев*». Сценарии — три бага того же вечера и его ответ «А (советую)»:
 *   `bugs/NEW_dims_card_flight_jumps_to_feed_top.md` · `bugs/NEW_rating_countdown_one_per_screen.md` ·
 *   `bugs/NEW_screen_heads_differ_between_screens.md`; набор `qa/suites/dims-rating-and-screen-heads.md`.
 *
 * Прибор ходит ЧЕЛОВЕКОМ: входит кнопкой «гостем без регистрации», оценивает, уходит с экрана,
 * смотрит «Мой NDim ID», убирает оценки пунктом «Убрать мою оценку» — всё органами продукта.
 *   ВХОД   · гость вошёл, «Профиль» показывает его содержимое;
 *   ШАПКИ  · Ш1–Ш4 на пяти экранах, в загрузке (база придержана) и после (`tools/lib/screen-head.mjs`);
 *   ОДНА   · четвёртая карточка, «Сохранить сейчас» — К1/К2 (`tools/lib/dims-flight.mjs`);
 *   СЕРИЯ  · звёзды трём карточкам подряд — К3 (у каждой свой отсчёт), затем К1/К2 их улёта;
 *   УХОД   · звёзды двум карточкам и сразу «Профиль» при идущих отсчётах (контроль: отсчёты идут);
 *   ИТОГ   · после перезагрузки в «Мой NDim ID» все шесть карточек со своими звёздами (К4/К5);
 *   УБОРКА · «Убрать мою оценку» у каждой; после перезагрузки «Мой NDim ID» пуст; анонимная
 *            учётка удалена своим `idToken`. Уборка ПРОВЕРЯЕТСЯ (правило класса `bugs/103`).
 *
 * ⚠️ Пишет в базу контура: шесть оценок гостя на минуты, пока идёт прогон, — сервер синхронизации
 * успевает учесть их в NDSR этих объектов; после уборки ближайший цикл пересчитывает сводку заново.
 * Остаётся документ `points/{uid}` удалённого гостя (флаг пересчёта) — его вычищает уборка гостей
 * сервера. Гость в счётчики Пространства не входит; метка прибора глушит воронку и аналитику.
 * AUTH: слово владельца выше; анонимный вход в бой — интервью №013, В2 = Б.
 *
 * Запуск: node tools/verify-live-dims-rating.mjs [--stage | --contour prod] [--width 390] [--theme light]
 * Кадры: test-results/live-dims-rating/<контур>-<ширина>-<тема>/
 *
 * [NOT-TESTED]
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { contourFromArgv } from './lib/contours.mjs';
import { grantAppCheckDebug } from './lib/app-check-debug.mjs';
import { markProbeContext } from './lib/probe-mark.mjs';
import { startTrace, readTrace, judgeTrace } from './lib/dims-flight.mjs';
import { checkScreenHeads } from './lib/screen-head.mjs';

const CONTOUR = contourFromArgv();
const BASE = CONTOUR.site;
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const WIDTH = Number(arg('--width', '390'));
const THEME = arg('--theme', 'light');
const OUT = `test-results/live-dims-rating/${CONTOUR.name}-${WIDTH}-${THEME}`;
const PROFILE_MARK = /Личная информация|Мой NDim ID|Personal information/i;

const lines = [];
function say(text = '') {
  console.log(text);
  lines.push(text);
}
let failures = 0;
function check(ok, text) {
  say(`${ok ? '  ✅' : '  ❌'} ${text}`);
  if (!ok) failures += 1;
}

/** Звезда, горящая пиком на карточке (`null` — не оценена). */
const peakOf = (page, id) =>
  page.locator(`article.dim[data-dim="${id}"] .stars .st.peak`).first().getAttribute('aria-label', { timeout: 3000 }).catch(() => null);

/** Открыть «Измерения» свежей страницей и дождаться ленты. Возвращает страницу и первые id. */
async function openDims(ctx, count = 8) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dims`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('article.dim[data-dim]', { timeout: 30000 });
  await page.waitForTimeout(900);
  const ids = await page.locator('article.dim[data-dim]').evaluateAll((els, n) =>
    els.slice(0, n).map((el) => el.getAttribute('data-dim')), count);
  return { page, ids };
}

/** Перейти на «Мой NDim ID» свежей страницей (перезагрузка = память приложения сброшена). */
async function openMine(ctx) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dims`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.segs button', { timeout: 30000 });
  await page.locator('.segs button', { hasText: /Мой NDim ID|My NDim ID/ }).first().click();
  await page.waitForTimeout(2500);
  return page;
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const tokens = new Set();
const rated = new Map();
const pageErrors = [];

try {
  say(`контур ${CONTOUR.title} ${BASE} · ширина ${WIDTH} · тема ${THEME}`);
  const ctx = await browser.newContext({
    viewport: { width: WIDTH, height: 860 },
    locale: 'ru-RU',
    hasTouch: WIDTH < 1024,
    isMobile: WIDTH < 1024,
  });
  await markProbeContext(ctx);
  await ctx.addInitScript((theme) => {
    try { localStorage.setItem('ndim-theme', theme); } catch { /* приватный режим */ }
  }, THEME);
  await grantAppCheckDebug(ctx, { required: CONTOUR.name === 'prod' });
  // Токен гостя — из ответа самого Firebase: им и убираем учётку в конце.
  ctx.on('response', async (r) => {
    if (!/identitytoolkit.*accounts:(signUp|signInWithCustomToken)/.test(r.url())) return;
    try {
      const body = await r.json();
      if (typeof body.idToken === 'string') tokens.add(body.idToken);
    } catch { /* не JSON */ }
  });
  ctx.on('weberror', (e) => pageErrors.push(String(e.error())));

  // ── ВХОД гостем — настоящей кнопкой ──────────────────────────────────────────────────────
  say('');
  say('ВХОД — кнопкой «гостем без регистрации»');
  {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
    const byHook = page.locator('[data-door="guest"]');
    await byHook.first().waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
    const door = (await byHook.count()) > 0 ? byHook : page.getByRole('button', { name: /гостем без регистрации|as a guest/i });
    await door.first().click();
    await page
      .waitForFunction((src) => new RegExp(src, 'i').test(document.body?.innerText || ''), PROFILE_MARK.source, { timeout: 25000 })
      .catch(() => {});
    const text = await page.evaluate(() => document.body?.innerText ?? '');
    check(PROFILE_MARK.test(text), 'вошли гостем: «Профиль» показывает содержимое человека');
    check(tokens.size > 0, `токен гостя перехвачен для уборки (${tokens.size})`);
    await page.close();
  }

  // ── ШАПКИ пяти экранов ───────────────────────────────────────────────────────────────────
  say('');
  say('ШАПКИ — пять экранов, в загрузке и после');
  await checkScreenHeads({
    openPage: () => ctx.newPage(),
    base: BASE,
    hold: /firestore\.googleapis\.com/,
    width: WIDTH,
    dir: `${OUT}/heads`,
    check,
  });

  // ── ОДНА: четвёртая карточка, «Сохранить сейчас» ────────────────────────────────────────
  {
    const { page, ids } = await openDims(ctx);
    const target = ids[3];
    say('');
    say(`ОДНА — четвёртая карточка ленты: ${target}`);
    const card = `article.dim[data-dim="${target}"]`;
    await page.locator(card).evaluate((el) => {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 260, behavior: 'instant' });
    });
    await page.waitForTimeout(500);
    await page.locator(`${card} .stars .st[aria-label="6"]`).click();
    await page.waitForTimeout(700);
    const preTop = await page.locator(card).evaluate((el) => Math.round(el.getBoundingClientRect().top));
    await startTrace(page, ids);
    await page.screenshot({ path: `${OUT}/one-0-before.png` });
    await page.locator(`${card} .countdown .now`).click();
    rated.set(target, 6);
    await page.waitForTimeout(330);
    await page.screenshot({ path: `${OUT}/one-1-flight.png` });
    await page.waitForTimeout(2600);
    judgeTrace(await readTrace(page), [target], ids, { [target]: preTop }, { check, say });
    await page.close();
  }

  // ── СЕРИЯ: три карточки подряд, у каждой свой отсчёт ────────────────────────────────────
  {
    const { page, ids } = await openDims(ctx);
    const series = [
      { id: ids[1], value: 7 },
      { id: ids[2], value: 5 },
      { id: ids[3], value: 3 },
    ];
    say('');
    say(`СЕРИЯ — ${series.map((s) => `${s.id}=${s.value}`).join(' · ')}`);
    await page.locator(`article.dim[data-dim="${ids[1]}"]`).evaluate((el) => {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 120, behavior: 'instant' });
    });
    await page.waitForTimeout(500);
    const preTop = {};
    for (const s of series) {
      preTop[s.id] = await page.locator(`article.dim[data-dim="${s.id}"]`).evaluate((el) => Math.round(el.getBoundingClientRect().top));
    }
    await startTrace(page, ids);
    for (const s of series) {
      await page.locator(`article.dim[data-dim="${s.id}"] .stars .st[aria-label="${s.value}"]`).click();
      rated.set(s.id, s.value);
      await page.waitForTimeout(350);
    }
    for (const s of series) {
      const state = await page.locator(`article.dim[data-dim="${s.id}"]`).evaluate((el) => ({
        countdown: el.querySelector('.countdown') !== null,
        peak: el.querySelector('.stars .st.peak')?.getAttribute('aria-label') ?? null,
      }));
      check(
        state.countdown && state.peak === String(s.value),
        `К3 · ${s.id}: звезда ${state.peak ?? 'не горит'} (ожидали ${s.value}), отсчёт ${state.countdown ? 'идёт' : 'НЕТ'}`,
      );
    }
    await page.screenshot({ path: `${OUT}/series-0-three-countdowns.png` });
    /*
     * ⚠️ ЖДЁМ УХОДА ВСЕХ ТРЁХ, А НЕ СЕКУНДОМЕРА. Первая редакция ждала 8,5 с — на стенде хватало, а
     * на стейдже запись идёт по сети, записи одного клиента уходят по очереди, и третья карточка
     * трогалась позже: трасса обрывалась на её пятом пикселе («уехала на 5px»). Потолок 25 с.
     */
    await page
      .waitForFunction((list) => list.every((id) => !document.querySelector(`article.dim[data-dim="${id}"]`)),
        series.map((s) => s.id), { timeout: 25000 })
      .catch(() => {});
    await page.waitForTimeout(800);
    const stuck = await page.evaluate((list) => list.filter((id) => document.querySelector(`article.dim[data-dim="${id}"]`)),
      series.map((s) => s.id));
    check(stuck.length === 0, `К6 · улетевшие карточки ушли с экрана, ни одна не вернулась в ленту${stuck.length ? ` — висят: ${stuck.join(', ')}` : ''}`);
    const rows = await readTrace(page);
    judgeTrace(rows, series.map((s) => s.id), ids, preTop, { check, say });
    if (process.argv.includes('--trace')) {
      const tracked = ids.slice(0, 6);
      say('    трасса [мс : ' + tracked.map((id) => id.slice(0, 6)).join(' : ') + ']  (top/x/out)');
      let last = '';
      for (const r of rows) {
        const line = tracked.map((id) => (r.cards[id] ? `${r.cards[id].top}/${r.cards[id].x}/${r.cards[id].out ? 'A' : '-'}` : '—')).join(' : ');
        if (line === last) continue;
        last = line;
        say(`    ${String(r.t).padStart(5)} : ${line}`);
      }
    }
    await page.close();
  }

  // ── УХОД: две звезды и сразу «Профиль» ───────────────────────────────────────────────────
  {
    const { page, ids } = await openDims(ctx, 4);
    const leave = [
      { id: ids[1], value: 4 },
      { id: ids[2], value: 2 },
    ];
    say('');
    say(`УХОД — ${leave.map((s) => `${s.id}=${s.value}`).join(' · ')} и сразу «Профиль»`);
    for (const s of leave) {
      await page.locator(`article.dim[data-dim="${s.id}"] .stars .st[aria-label="${s.value}"]`).click();
      rated.set(s.id, s.value);
      await page.waitForTimeout(250);
    }
    const ticking = await page.locator('article.dim .countdown').count();
    check(ticking === leave.length, `контроль прибора: в миг ухода идёт отсчётов ${ticking} (ожидали ${leave.length})`);
    await page.locator('a[href="/profile"]:visible').first().click();
    await page.waitForURL(/\/profile/, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3500);
    await page.close();
  }

  // ── ИТОГ: всё оценённое — в «Мой NDim ID» после перезагрузки ─────────────────────────────
  {
    say('');
    say(`ИТОГ — «Мой NDim ID» после перезагрузки, ожидаем ${rated.size} карточек`);
    const page = await openMine(ctx);
    for (const [id, value] of rated) {
      const peak = await peakOf(page, id);
      check(peak === String(value), `К4/К5 · ${id}: в «Мой NDim ID» звезда ${peak ?? 'НЕТ карточки'} (ожидали ${value})`);
    }
    await page.screenshot({ path: `${OUT}/mine-after.png` });
    await page.close();
  }
} finally {
  // ── УБОРКА органами продукта, затем учётка ───────────────────────────────────────────────
  if (rated.size > 0) {
    say('');
    say('УБОРКА — «Убрать мою оценку» у каждой карточки');
    try {
      const ctx = browser.contexts()[0];
      const page = await openMine(ctx);
      for (const id of rated.keys()) {
        const card = page.locator(`article.dim[data-dim="${id}"]`);
        if ((await card.count()) === 0) continue;
        await card.locator('.dots').first().click();
        await page.locator(`article.dim[data-dim="${id}"] .drop button`, { hasText: /Убрать мою оценку|Remove my rating/ }).first().click();
        await page.waitForTimeout(1200);
      }
      await page.close();
      const again = await openMine(ctx);
      let left = 0;
      for (const id of rated.keys()) if ((await peakOf(again, id)) !== null) left += 1;
      check(left === 0, `след убран: оценок прогона в «Мой NDim ID» осталось ${left} из ${rated.size}`);
      await again.close();
    } catch (error) {
      check(false, `уборка оценок упала: ${String(error).slice(0, 160)}`);
    }
  }
  check(pageErrors.length === 0, `ошибок страницы за прогон: ${pageErrors.length}${pageErrors.length ? ' — ' + pageErrors.slice(0, 2).join(' | ') : ''}`);
  await browser.close();

  let removed = 0;
  for (const idToken of tokens) {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${CONTOUR.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (r.ok) removed += 1;
  }
  check(removed === tokens.size, `анонимных учёток заведено ${tokens.size}, удалено ${removed}`);

  say('');
  say(failures === 0 ? '✅ ЗЕЛЁНЫЙ' : `❌ КРАСНЫЙ — провалов ${failures}`);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(`${OUT}/report.txt`, lines.join('\n'), 'utf8');
  console.log(`кадры и отчёт: ${OUT}/`);
  process.exitCode = failures === 0 ? 0 : 1;
}

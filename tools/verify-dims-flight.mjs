/**
 * СТРАЖ УЛЁТА ОЦЕНЁННОЙ КАРТОЧКИ И НЕЗАВИСИМЫХ ОТСЧЁТОВ на экране «Измерения» (стенд).
 *
 * Слово владельца 2026-09-19, дословно:
 *   1) «анимация уезда карточки. Я в мобилке выставлял оценки измерениям, которые не в топе
 *      списка, а где-то ниже — анимация прыгает куда-то вверх, а не выполняется на том месте,
 *      где находится карточка в списке.»
 *   2) «Если я поставил звёзды одному измерению и ставлю звезды другому измерению — это не
 *      должно снимать звезды с того первого измерения, а оно просто должно запускать в
 *      очередном измерении очередной таймер сохранения — можно очень быстро сколько угодно
 *      много измерений оценивать, просто запуская им таймеры выставкой звёзд.»
 *
 * 🔑 ПОЧЕМУ ПРЕЖНИЕ ПРИБОРЫ ЭТОГО НЕ ВИДЕЛИ. `measure-bug80-flight` и `verify-bug172` оценивают
 * ПЕРВУЮ карточку ленты. У неё место в потоке совпадает с началом ленты, и прыжок «в начало
 * ленты» по построению равен нулю. Здесь оценивается карточка НИЖЕ по списку — там, где
 * владелец дефект и увидел.
 *
 * ДВА СЦЕНАРИЯ, каждый со своим критерием, объявленным ДО прогона:
 *
 *   ОДНА — четвёртая карточка ленты, «Сохранить сейчас».
 *     К1: пока карточка летит (сдвиг вправо > 2px), её ЭКРАННЫЙ `top` не отходит от места,
 *         где она стояла до улёта, больше чем на 3px — карточка уезжает вправо со своего места.
 *     К2: ни одна карточка на экране не дёргается — ни один кадр не переносит её ИЗ ПОКОЯ В
 *         ПОКОЙ больше чем на 3px (подтягивание соседей — плавное; рывок и дрожь — дефект).
 *
 *   СЕРИЯ — вторая, третья и четвёртая карточки, звёзды подряд с шагом ~350 мс, без «Сохранить».
 *     К3: сразу после третьего тапа ВСЕ ТРИ карточки держат свои звёзды и свой отсчёт.
 *     К4: все три оценки легли в базу со своими значениями (истина — база, а не экран, EXP-0115).
 *     К1 и К2 — для каждой из трёх, по всей трассе.
 *
 * Контроль прибора ПЕРВЫМ (EXP-0082): улетающая обязана реально уехать вправо (> 100px) —
 * иначе «прыжка нет» зелено на трассе, где полёта не было вовсе.
 *
 * Пишет настоящие оценки dev-пользователю стенда и УБИРАЕТ за собой; уборка ПРОВЕРЯЕТСЯ
 * (правило класса `bugs/103`).
 *
 * Требует поднятый `npm run stand`.
 * Запуск: node tools/verify-dims-flight.mjs [--width 390|1440] [--theme light|dark]
 *                                            [--only one|series] [--trace]
 * Выход: test-results/dims-flight/<ширина>-<тема>/ (видео + report.txt)
 *
 * [TESTED: 2026-09-19 · стенд, 390/1440 × light/dark: на старом коде красный (К3/К4 ❌, прыжок 552px), после
 *  починки зелёный; кадры `--shots` прочитаны глазами. На ЭТОЙ редакции (сдвиг жеста из `translate`)
 *  судья воспроизвёл мутант «жест обратно в `transform`» → контроль прибора ❌ (сдвиг 0px) + К2 рывок
 *  260 → −292, адресаты названы до прогона; мутанты автора шли на прежней редакции. Отчёт
 *  qa/reports/2026-09-19_dims-flight-and-screen-heads.md]
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const STAND = 'http://localhost:5173';
const AUTH = 'http://127.0.0.1:9099';
const FS = 'http://127.0.0.1:8181';
const PROJECT = 'demo-ndim-dev';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const WIDTH = Number(arg('--width', '390'));
const THEME = arg('--theme', 'light');
const ONLY = arg('--only', 'all');
const TRACE = process.argv.includes('--trace');
/**
 * `--shots` — снимки экрана до и во время полёта, для глаз (ручная приёмка: владелец судит
 * движение, прибор — числа). Режим раздельный: снимок отнимает кадры у трассы.
 */
const SHOTS = process.argv.includes('--shots');
const OUT = `test-results/dims-flight/${WIDTH}-${THEME}`;

/** Допуски, объявленные до прогона (см. шапку). */
const HOLD_PX = 3;
const MIN_FLIGHT_PX = 100;

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

async function standUid() {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'dev@ndim.space', password: 'ndim-dev-stand', returnSecureToken: true }),
  });
  if (!res.ok) return null;
  const { localId } = await res.json();
  return localId ?? null;
}

/** Оценка в базе: число либо null (документа нет). Эмулятор отдаёт REST через правила — ключ владельца. */
async function ratingInDb(uid, dimId) {
  const res = await fetch(`${FS}/v1/projects/${PROJECT}/databases/(default)/documents/points/${uid}/dims/${dimId}`, {
    headers: { Authorization: 'Bearer owner' },
  });
  if (res.status === 404) return null;
  const doc = await res.json();
  // Документ оценки — `{ value }` (`saveRating`, src/lib/data/profile.ts).
  const raw = doc.fields?.value;
  return raw ? Number(raw.integerValue ?? raw.doubleValue) : 'есть, без поля value';
}

async function dropRating(uid, dimId) {
  await fetch(`${FS}/v1/projects/${PROJECT}/databases/(default)/documents/points/${uid}/dims/${dimId}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer owner' },
  });
}

/** Покадровая трасса экранного `top` и сдвига X для набора карточек. Пишется со страницы. */
async function startTrace(page, ids) {
  await page.evaluate((tracked) => {
    window.__fl = { rows: [] };
    const t0 = performance.now();
    /*
     * Сдвиг ЖЕСТА — свойство `translate` (`flyAway`). В `transform` у улетающей карточки стоит
     * неподвижная поправка места (Svelte / `holdInPlace`): сложенная со сдвигом, она печатала
     * «уехала на 1056px» у карточки второй колонки на 1440. Жест, вернувшийся в `transform`,
     * даст здесь 0 и уронит контроль прибора — громко, а не молча.
     */
    const shiftX = (el) => {
      const tl = getComputedStyle(el).translate;
      if (!tl || tl === 'none') return 0;
      return parseFloat(tl) || 0;
    };
    const step = () => {
      const now = Math.round(performance.now() - t0);
      const frame = { t: now, cards: {} };
      for (const id of tracked) {
        const el = document.querySelector(`article.dim[data-dim="${id}"]`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        frame.cards[id] = {
          top: Math.round(r.top),
          h: Math.round(r.height),
          x: Math.round(shiftX(el)),
          // Вышла ли карточка из потока — от этого кадра она обязана стоять на месте.
          out: getComputedStyle(el).position === 'absolute',
          // Для разбора (`--debug`): inline-стиль и итоговый transform/translate кадра.
          css: el.style.cssText,
          ct: getComputedStyle(el).transform,
          tl: getComputedStyle(el).translate,
          an: el.getAnimations().length,
        };
      }
      window.__fl.rows.push(frame);
      if (now < 12000) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, ids);
}

/**
 * Судит трассу по К1 и К2. `leavers` — карточки, которые должны улететь; `all` — все, за кем следим.
 * Возвращает число провалов (печатает сам).
 */
function judgeTrace(rows, leavers, all, preTop) {
  for (const id of leavers) {
    const own = rows.map((r) => ({ t: r.t, c: r.cards[id] })).filter((r) => r.c);
    const flightIdx = own.findIndex((r) => r.c.x > 2);
    const peak = Math.max(0, ...own.map((r) => r.c.x));
    check(peak > MIN_FLIGHT_PX, `контроль прибора: карточка ${id} уехала вправо на ${peak}px (> ${MIN_FLIGHT_PX})`);
    if (flightIdx === -1) continue;
    /*
     * ⚠️ ТОЧКА ОТСЧЁТА — ПОСЛЕДНИЙ КАДР ДО ВЫХОДА ИЗ ПОТОКА, а не «кадр перед сдвигом X».
     * Первая редакция брала кадр перед сдвигом — а прыжок случается В ТОМ ЖЕ кадре, где
     * карточка выходит из потока, при сдвиге ещё 0. Точка отсчёта оказывалась уже ПОСЛЕ
     * прыжка, и К1 печатал «0px» на воспроизведённом дефекте (поймал К2). В серии соседи
     * могли подтянуть карточку выше до её собственного улёта — поэтому берётся именно кадр,
     * а не место до первого тапа.
     */
    const outIdx = own.findIndex((r) => r.c.out);
    const startIdx = outIdx === -1 ? flightIdx : Math.min(outIdx, flightIdx);
    const before = startIdx > 0 ? own[startIdx - 1].c.top : preTop[id];
    if (outIdx === -1) say(`  ⚠️ ${id}: из потока в полёте не выходила — соседи дёрнутся, когда её удалят`);
    const during = own.slice(startIdx);
    const worst = during.reduce((m, r) => Math.max(m, Math.abs(r.c.top - before)), 0);
    const at = during.find((r) => Math.abs(r.c.top - before) === worst);
    check(
      worst <= HOLD_PX,
      `К1 · ${id} улетает со своего места: отход по вертикали ${worst}px (допуск ${HOLD_PX})` +
        (worst > HOLD_PX ? ` — стояла на ${before}px, в полёте оказалась на ${at?.c.top}px` : ''),
    );
  }
  /*
   * ⚠️ РЫВОК ОПРЕДЕЛЯЕТСЯ ФОРМОЙ ДВИЖЕНИЯ, А НЕ ВЕЛИЧИНОЙ ШАГА.
   * Первая редакция краснела на любом шаге > 60px за кадр — и покраснела на ЗДОРОВОМ
   * подтягивании: после серии из трёх оценок соседи едут вверх разом на 748px, `cubicOut`
   * стартует быстро (99px за 16 мс), а трасса ещё и потеряла кадр (68 мс → 111px). И была
   * слепа к мелкой дрожи: соседи вздрагивали на 4 → 6 → 17px в миг каждой записи серии
   * (`flip` Svelte, см. `settle` на экране). Рывок у всех этих случаев ОДНОЙ формы: карточка
   * стояла, за один кадр перескочила и снова стоит (прыжок в начало ленты 260 → −292 и дальше
   * −292; рывок соседа в миг удаления невынутой карточки; шаг дрожи 885 → 876 и стоп).
   * Анимация так не выглядит никогда: до и после своего шага она движется.
   */
  const REST_PX = 1;
  const jerks = [];
  for (const id of all) {
    const own = rows.map((r) => ({ t: r.t, c: r.cards[id] })).filter((r) => r.c);
    for (let i = 2; i + 1 < own.length; i += 1) {
      const before = Math.abs(own[i - 1].c.top - own[i - 2].c.top);
      const jump = Math.abs(own[i].c.top - own[i - 1].c.top);
      const after = Math.abs(own[i + 1].c.top - own[i].c.top);
      if (before <= REST_PX && jump > HOLD_PX && after <= REST_PX) {
        jerks.push(`${id} на ${own[i].t} мс: ${own[i - 1].c.top} → ${own[i].c.top}`);
      }
    }
  }
  check(jerks.length === 0, `К2 · рывков (из покоя в покой больше ${HOLD_PX}px за кадр): ${jerks.length}` +
    (jerks.length > 0 ? ` — ${jerks.slice(0, 4).join(' · ')}` : ''));
}

function printTrace(rows, ids) {
  if (!TRACE) return;
  say('    трасса [мс : ' + ids.map((id) => `${id.slice(0, 6)} top/x`).join(' : ') + ']');
  let last = '';
  for (const r of rows) {
    const line = ids.map((id) => (r.cards[id] ? `${r.cards[id].top}/${r.cards[id].x}` : '—')).join(' : ');
    if (line === last) continue; // одинаковые кадры не печатаем
    last = line;
    say(`    ${String(r.t).padStart(5)} : ${line}`);
  }
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const written = new Set();
let uid = null;

try {
  uid = await standUid();
  if (uid === null) {
    say('❌ не найден пользователь стенда — поднят ли `npm run stand`?');
    process.exit(1);
  }

  const context = await browser.newContext({
    viewport: { width: WIDTH, height: 860 },
    locale: 'ru-RU',
    hasTouch: WIDTH < 1024,
    isMobile: WIDTH < 1024,
    recordVideo: { dir: `${OUT}/video`, size: { width: WIDTH, height: 860 } },
  });
  await context.addInitScript((theme) => localStorage.setItem('ndim-theme', theme), THEME);
  const page = await context.newPage();
  if (!(await signIn(page))) {
    say('❌ не удалось войти');
    process.exit(1);
  }

  say(`ширина ${WIDTH} · тема ${THEME}`);

  // ── ОДНА: четвёртая карточка ─────────────────────────────────────────────────────────────
  if (ONLY === 'all' || ONLY === 'one') {
    await page.goto(`${STAND}/dims`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('article.dim[data-dim]', { timeout: 30000 });
    await page.waitForTimeout(800);
    const ids = await page.locator('article.dim[data-dim]').evaluateAll((els) =>
      els.slice(0, 8).map((el) => el.getAttribute('data-dim')),
    );
    const target = ids[3];
    say('');
    say(`ОДНА — оцениваем четвёртую карточку ленты: ${target}`);
    const card = `article.dim[data-dim="${target}"]`;
    // Карточка целиком в окне, НИЖЕ начала ленты — место владельца.
    await page.locator(card).evaluate((el) => {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 260, behavior: 'instant' });
    });
    await page.waitForTimeout(500);
    await page.locator(`${card} .stars .st[aria-label="6"]`).click();
    await page.waitForTimeout(700);
    const preTop = await page.locator(card).evaluate((el) => Math.round(el.getBoundingClientRect().top));
    await startTrace(page, ids);
    if (SHOTS) {
      await mkdir(`${OUT}/shots`, { recursive: true });
      await page.screenshot({ path: `${OUT}/shots/one-0-before.png` });
    }
    await page.locator(`${card} .countdown .now`).click();
    written.add(target);
    if (SHOTS) {
      for (let i = 1; i <= 6; i += 1) {
        await page.waitForTimeout(110);
        await page.screenshot({ path: `${OUT}/shots/one-${i}.png` });
      }
    }
    await page.waitForTimeout(2600);
    const rows = await page.evaluate(() => window.__fl.rows);
    judgeTrace(rows, [target], ids, { [target]: preTop });
    printTrace(rows, ids.slice(2, 6));
    if (process.argv.includes('--debug')) {
      const own = rows.map((r) => ({ t: r.t, c: r.cards[target] })).filter((r) => r.c);
      const i = own.findIndex((r) => r.c.out);
      for (const r of own.slice(Math.max(0, i - 2), i + 4)) {
        say(`    ${r.t} мс · top ${r.c.top} · out ${r.c.out} · anim ${r.c.an} · transform ${r.c.ct} · translate ${r.c.tl}`);
        say(`      style: ${r.c.css}`);
      }
    }
    const inDb = await ratingInDb(uid, target);
    check(inDb === 6, `оценка легла в базу: ${inDb} (ожидали 6)`);
  }

  // ── СЕРИЯ: три карточки подряд, каждая со своим отсчётом ───────────────────────────────────
  if (ONLY === 'all' || ONLY === 'series') {
    await page.goto(`${STAND}/dims`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('article.dim[data-dim]', { timeout: 30000 });
    await page.waitForTimeout(800);
    const ids = await page.locator('article.dim[data-dim]').evaluateAll((els) =>
      els.slice(0, 8).map((el) => el.getAttribute('data-dim')),
    );
    const series = [
      { id: ids[1], value: 7 },
      { id: ids[2], value: 5 },
      { id: ids[3], value: 3 },
    ];
    say('');
    say(`СЕРИЯ — звёзды подряд: ${series.map((s) => `${s.id}=${s.value}`).join(' · ')}`);
    await page.locator(`article.dim[data-dim="${ids[1]}"]`).evaluate((el) => {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 120, behavior: 'instant' });
    });
    await page.waitForTimeout(500);
    const preTop = {};
    for (const s of series) {
      preTop[s.id] = await page
        .locator(`article.dim[data-dim="${s.id}"]`)
        .evaluate((el) => Math.round(el.getBoundingClientRect().top));
    }
    await startTrace(page, ids);
    for (const s of series) {
      await page.locator(`article.dim[data-dim="${s.id}"] .stars .st[aria-label="${s.value}"]`).click();
      written.add(s.id);
      await page.waitForTimeout(350);
    }
    // К3: у всех трёх свои звёзды и свой отсчёт — сразу после третьего тапа.
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
    if (SHOTS) await page.screenshot({ path: `${OUT}/shots/series-0-three-countdowns.png` });
    // Все три отсчёта доходят до нуля сами и улетают.
    if (SHOTS) {
      await page.waitForTimeout(4300);
      for (let i = 1; i <= 8; i += 1) {
        await page.screenshot({ path: `${OUT}/shots/series-${i}.png` });
        await page.waitForTimeout(250);
      }
      await page.waitForTimeout(1500);
    } else {
      await page.waitForTimeout(8000);
    }
    const rows = await page.evaluate(() => window.__fl.rows);
    judgeTrace(rows, series.map((s) => s.id), ids, preTop);
    printTrace(rows, ids.slice(1, 8));
    if (process.argv.includes('--debug')) {
      for (const s of series) {
        const own = rows.map((r) => ({ t: r.t, c: r.cards[s.id] })).filter((r) => r.c);
        const i = own.findIndex((r) => r.c.out);
        say(`  ${s.id}: кадры вокруг выхода из потока`);
        for (const r of own.slice(Math.max(0, i - 8), i + 2)) {
          say(`    ${r.t} мс · top ${r.c.top} · h ${r.c.h} · out ${r.c.out} · style: ${r.c.css}`);
        }
      }
    }
    for (const s of series) {
      const inDb = await ratingInDb(uid, s.id);
      check(inDb === s.value, `К4 · ${s.id} в базе: ${inDb} (ожидали ${s.value})`);
    }
  }

  await context.close();
} finally {
  // Уборка за собой — и её проверка.
  if (uid !== null && written.size > 0) {
    for (const id of written) await dropRating(uid, id);
    let left = 0;
    for (const id of written) if ((await ratingInDb(uid, id)) !== null) left += 1;
    say('');
    check(left === 0, `след убран: оценок прогона в базе осталось ${left} из ${written.size}`);
  }
  await browser.close();
  say('');
  say(failures === 0 ? '✅ ЗЕЛЁНЫЙ' : `❌ КРАСНЫЙ — провалов ${failures}`);
  await writeFile(`${OUT}/report.txt`, lines.join('\n'), 'utf8');
  console.log(`\nотчёт: ${OUT}/report.txt · видео: ${OUT}/video/`);
  process.exitCode = failures === 0 ? 0 : 1;
}

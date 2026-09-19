/**
 * ТРАССА И СУД УЛЁТА КАРТОЧКИ «ИЗМЕРЕНИЙ» — одни на стенд и на живой контур.
 *
 * Зовут `tools/verify-dims-flight.mjs` (стенд, база эмулятора) и `tools/verify-live-dims-rating.mjs`
 * (стейдж и бой, гостем через продукт). Судит то, что видит человек: экранный `top` каждой
 * карточки по кадрам — слово владельца 2026-09-19: «*анимация прыгает куда-то вверх, а не
 * выполняется на том месте, где находится карточка в списке*».
 *
 *   К1 · улетающая карточка от кадра выхода из потока до исчезновения стоит на своём месте
 *        (отход по вертикали ≤ HOLD_PX);
 *   К2 · ни одна карточка не дёргается: ни один кадр не переносит её ИЗ ПОКОЯ В ПОКОЙ больше
 *        чем на HOLD_PX (подтягивание соседей — плавное);
 *   контроль прибора · улетающая реально уехала вправо (> MIN_FLIGHT_PX), иначе «прыжка нет»
 *        зелено на трассе, где полёта не было.
 *
 * Модуль ничего не делает при подключении — только экспортирует.
 *
 * [TESTED: 2026-09-19 · стенд: `verify-dims-flight` через модуль зелёный на 390 light и 1440 dark,
 *  мутант «уход без сохранения» краснеет ровно К5 ×2; отчёт qa/reports/2026-09-19_dims-flight-and-screen-heads.md]
 */

/** Допуски, объявленные до первого прогона стража. */
export const HOLD_PX = 3;
export const MIN_FLIGHT_PX = 100;

/** Запускает на странице покадровую трассу экранного `top` и сдвига жеста для набора карточек. */
export async function startTrace(page, ids) {
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
      // Потолок трассы с запасом на живой контур: там запись в базу идёт по сети, и последняя
      // карточка серии улетает на секунды позже, чем на стенде (замер стейджа 2026-09-19).
      if (now < 30000) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, ids);
}

/** Снимает накопленную трассу со страницы. */
export async function readTrace(page) {
  return page.evaluate(() => window.__fl?.rows ?? []);
}

/**
 * Судит трассу по К1 и К2. `leavers` — карточки, которые должны улететь; `all` — все, за кем
 * следим; `preTop` — место каждой улетающей до жеста; `report` — `{ check, say }` прибора.
 */
export function judgeTrace(rows, leavers, all, preTop, { check, say }) {
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

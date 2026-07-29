/**
 * Зонд bugs/67 — проверяет предсказание версии «врущее запасное значение + sticky».
 *
 * Версия утверждает: рельс стоит на 56px (запасные `var(--bar-h, 56px)`), пока шапка не
 * опубликовала настоящую высоту при гидратации; настоящая шапка на 1440 — 55.x, и `sticky`
 * прижимает рельс ВНИЗ до порога даже при нулевой прокрутке.
 *
 * ПРЕДСКАЗАНИЕ (фальсифицируемое): в кадрах, где `--bar-h` ещё ПУСТА, `railY − barH ≈ 1`;
 * как только `--bar-h` заполнена — расхождение исчезает. Заполненная `--bar-h` при
 * расхождении 1px версию ОПРОВЕРГАЕТ.
 *
 * Не через `npm run e2e` намеренно: тот прогон выжигает `test-results/` целиком (EXP-0062),
 * а там лежат кадры выката. Зонд ходит по уже собранному build/ через vite preview.
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:4173';
const ROUTES = ['/profile', '/relations', '/space', '/dims'];
const REPEATS = 3;

const browser = await chromium.launch();
const rows = [];
const scrolled = [];

for (let round = 1; round <= REPEATS; round++) {
  for (const route of ROUTES) {
    // Свежий контекст на каждый заход: гидратация должна происходить заново, иначе
    // мы мерили бы уже прогретую страницу и окна до публикации не увидели бы вовсе.
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE + route, { waitUntil: 'commit' });

    /*
     * Снимаем ПОКАДРОВО, начиная как можно раньше: интересующее окно живёт от первой
     * отрисовки до гидратации, и одиночный замер в него почти никогда не попадает —
     * ровно поэтому баг «мигал» (метод покадровой трассы — EXP-0060).
     */
    const trace = await page.evaluate(async () => {
      const out = [];
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const bar = document.querySelector('header.bar');
        const rail = document.querySelector('nav.rail');
        if (!bar || !rail) continue;
        const varRaw = getComputedStyle(document.documentElement)
          .getPropertyValue('--bar-h')
          .trim();
        out.push({
          i,
          barVar: varRaw, // пусто => шапка ещё не опубликовала высоту
          barH: +bar.getBoundingClientRect().height.toFixed(2),
          railY: +rail.getBoundingClientRect().y.toFixed(2),
          fonts: document.fonts.status,
        });
      }
      return out;
    });

    for (const f of trace) {
      rows.push({ route, round, ...f, diff: +(f.railY - f.barH).toFixed(2) });
    }

    /*
     * Контрольная проверка ПРОТИВОПОЛОЖНОГО риска (bugs/49, слово владельца капсом «ДОЛЖНО БЫТЬ
     * ЗАФИКСИРОВАНО»): запасное значение 0 не должно позволить рельсу заехать ПОД шапку при
     * прокрутке. После гидратации `--bar-h` заполнена, и рельс обязан липнуть к низу шапки.
     */
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(120);
    const pinned = await page.evaluate(() => {
      const bar = document.querySelector('header.bar').getBoundingClientRect();
      const rail = document.querySelector('nav.rail').getBoundingClientRect();
      const items = document.querySelectorAll('nav.rail a');
      const last = items[items.length - 1].getBoundingClientRect();
      return {
        barY: +bar.y.toFixed(2),
        railY: +rail.y.toFixed(2),
        barH: +bar.height.toFixed(2),
        lastBottom: +last.bottom.toFixed(2),
        vh: window.innerHeight,
      };
    });
    scrolled.push({ route, round, ...pinned });

    await ctx.close();
  }
}
await browser.close();

const published = rows.filter((r) => r.barVar !== '');
const unpublished = rows.filter((r) => r.barVar === '');
const bad = rows.filter((r) => Math.abs(r.diff) >= 0.5); // порог теста: toBeCloseTo(…, 0)

const share = (list) => {
  const n = list.filter((r) => Math.abs(r.diff) >= 0.5).length;
  return `${n}/${list.length}`;
};

console.log(`\nвсего кадров: ${rows.length}`);
console.log(`  --bar-h ПУСТА    : кадров ${unpublished.length}, из них расхождение ≥0.5px: ${share(unpublished)}`);
console.log(`  --bar-h ЗАПОЛНЕНА: кадров ${published.length}, из них расхождение ≥0.5px: ${share(published)}`);

if (bad.length) {
  console.log(`\nпримеры кадров с расхождением (то, на чём падает тест):`);
  for (const r of bad.slice(0, 8)) {
    console.log(
      `  ${r.route} r${r.round} кадр${r.i}: --bar-h="${r.barVar}" barH=${r.barH} railY=${r.railY} diff=${r.diff} fonts=${r.fonts}`,
    );
  }
}

// Инвариант bugs/49: шапка прибита к нулю, рельс липнет к её низу, последний пункт виден.
const railSlipped = scrolled.filter((s) => Math.abs(s.railY - s.barH) >= 0.5 || s.barY !== 0);
const itemLost = scrolled.filter((s) => s.lastBottom > s.vh + 0.5);
console.log(`\nПОСЛЕ ПРОКРУТКИ (инвариант bugs/49), заходов: ${scrolled.length}`);
console.log(`  рельс отлип от низа шапки: ${railSlipped.length}`);
console.log(`  последний пункт уехал за низ вьюпорта: ${itemLost.length}`);
if (railSlipped.length) {
  const s = railSlipped[0];
  console.log(`    пример: ${s.route} barY=${s.barY} barH=${s.barH} railY=${s.railY}`);
}

const falsified = published.filter((r) => Math.abs(r.diff) >= 0.5);
console.log('\nВЕРДИКТ:');
const shellOk = railSlipped.length === 0 && itemLost.length === 0;
if (bad.length === 0) {
  console.log(
    shellOk
      ? '  ✅ ФИКС ДЕРЖИТ: ни одного кадра с расхождением, инвариант bugs/49 цел.\n' +
          '     (на сломанном коде этот же зонд печатал 41/41 при пустой --bar-h — страж доказан)'
      : '  ⚠️ расхождения нет, но инвариант bugs/49 нарушен — см. блок «ПОСЛЕ ПРОКРУТКИ»',
  );
} else if (falsified.length === 0) {
  console.log('  ✅ ПРЕДСКАЗАНИЕ ПОДТВЕРЖДЕНО: расхождение живёт ТОЛЬКО там, где --bar-h пуста.');
} else {
  console.log(`  ❌ ПРЕДСКАЗАНИЕ ОПРОВЕРГНУТО: ${falsified.length} кадров расходятся при ЗАПОЛНЕННОЙ --bar-h.`);
  const s = falsified[0];
  console.log(`     пример: ${s.route} кадр${s.i} --bar-h="${s.barVar}" barH=${s.barH} railY=${s.railY}`);
}

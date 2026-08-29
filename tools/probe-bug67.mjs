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
 * ✅ СЛАБОСТЬ ЗАКРЫТА 2026-07-30 — зонд ходит и в ПЕРЕСЕЧЕНИЕ состояний.
 * Раньше он мерил два состояния ПО ОТДЕЛЬНОСТИ: «до гидратации, без прокрутки» (трасса кадров) и
 * «после гидратации, с прокруткой». Их угол — «до гидратации И с прокруткой» — не посещался, и
 * 2026-07-29 именно там пряталась цена запасного нуля: зонд напечатал 0/42 («фикс держит»), а
 * `desktop-shell.spec.ts:70` тут же дал `Expected: 55, Received: 0` — рельс заезжал ПОД шапку.
 * Теперь третий блок трассы прокручивает страницу СРАЗУ, на первом же кадре, и снимает рельс
 * покадрово ДО публикации `--bar-h`: запасное значение, при котором рельс уезжает под шапку,
 * краснеет здесь, а не в e2e через сутки. `npm run e2e` всё равно прогоняй — но теперь зонд
 * умнее прибора, который однажды его обманул.
 *
 * Не через `npm run e2e` намеренно: тот прогон выжигает `test-results/` целиком (EXP-0062),
 * а там лежат кадры выката. Зонд ходит по уже собранному build/ через vite preview.
 *
 * Запуск: node tools/probe-bug67.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:4173';
const ROUTES = ['/profile', '/relations', '/space', '/dims'];
const REPEATS = 3;

const browser = await chromium.launch();
const rows = [];
const scrolled = [];
/** Пересечение: кадры «до гидратации И с прокруткой» — прежнее слепое пятно зонда. */
const earlyScrolled = [];

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

/*
 * 🔴 ПЕРЕСЕЧЕНИЕ СОСТОЯНИЙ — «до гидратации И с прокруткой». Ровно здесь пряталась цена
 * запасного нуля (попытка фикса №1, 2026-07-29), и ровно сюда прежний зонд не заходил.
 *
 * ⚠️ Маршруты здесь ДРУГИЕ, и это главное в блоке. На `/profile` и соседях пререндеренный
 * шелл КОРОЧЕ окна (данных ещё нет), прокрутка физически невозможна, и блок был бы вакуумным —
 * он и оказался таким в первой редакции: 36 кадров, из них реально прокрученных 0. Берём
 * страницы, чей пререндер длинный САМ ПО СЕБЕ: список «Меню» и руководство (≈14 000px).
 */
const EARLY_ROUTES = ['/menu', '/ru/menu/manual'];
{
  const browser2 = await chromium.launch();
  for (let round = 1; round <= REPEATS; round++) {
    for (const route of EARLY_ROUTES) {
      const ctx = await browser2.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(BASE + route, { waitUntil: 'commit' });
      const early = await page.evaluate(async () => {
        const out = [];
        window.scrollTo(0, 3000); // прокручиваем ДО всякой гидратации
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => requestAnimationFrame(r));
          const bar = document.querySelector('header.bar');
          const rail = document.querySelector('nav.rail');
          if (!bar || !rail) continue;
          window.scrollTo(0, 3000); // держим прокрутку: документ мог дорасти
          out.push({
            i,
            barVar: getComputedStyle(document.documentElement).getPropertyValue('--bar-h').trim(),
            barBottom: +bar.getBoundingClientRect().bottom.toFixed(2),
            railY: +rail.getBoundingClientRect().y.toFixed(2),
            y: Math.round(window.scrollY),
          });
        }
        return out;
      });
      for (const f of early) {
        // Рельс НЕ ИМЕЕТ ПРАВА оказаться выше низа шапки — это и есть «заехал под шапку».
        earlyScrolled.push({ route, round, ...f, under: +(f.barBottom - f.railY).toFixed(2) });
      }
      await ctx.close();
    }
  }
  await browser2.close();
}


/*
 * БЛОК «ЗАПАСНОЕ ЗНАЧЕНИЕ ПРОТИВ ЗАМЕРА» (bugs/67, фикс 2026-07-30).
 *
 * Запасная высота шапки живёт переменной `--bar-h-fallback` с медиазапросом по 1024px. Числа в
 * ней — снятые замером (61px на узких, 55px от 1024px), и именно поэтому `sticky`-рельс больше
 * не съезжает на 1px до гидратации. Но числа могут устареть от любого редизайна шапки, и тогда
 * флейк вернётся ТИХО. Здесь он перестаёт быть тихим: сверяем запасное значение с фактической
 * высотой на каждой ширине.
 */
const fallbackRows = [];
{
  const browser3 = await chromium.launch();
  for (const width of [390, 800, 1024, 1440]) {
    const ctx = await browser3.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE + '/ru/menu/manual', { waitUntil: 'commit' });
    const measured = await page.evaluate(async () => {
      // Первый кадр, где шапка уже есть, но `--bar-h` ещё не опубликована.
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const bar = document.querySelector('header.bar');
        if (!bar) continue;
        const style = getComputedStyle(document.documentElement);
        if (style.getPropertyValue('--bar-h').trim() !== '') continue;
        return {
          fallback: style.getPropertyValue('--bar-h-fallback').trim(),
          height: +bar.getBoundingClientRect().height.toFixed(2),
        };
      }
      return null;
    });
    fallbackRows.push({ width, ...(measured ?? { fallback: null, height: null }) });
    await ctx.close();
  }
  await browser3.close();
}
console.log('\nЗАПАСНОЕ ЗНАЧЕНИЕ ПРОТИВ ЗАМЕРА (до публикации --bar-h):');
let fallbackBad = 0;
for (const r of fallbackRows) {
  if (r.fallback === null) {
    console.log(`  ${r.width}px: окно до публикации не поймано — проверить нечем`);
    continue;
  }
  const ok = Math.abs(parseFloat(r.fallback) - r.height) < 0.5;
  if (!ok) fallbackBad += 1;
  console.log(`  ${ok ? '✅' : '❌'} ${r.width}px: запасное ${r.fallback}, замер ${r.height}px`);
}

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
const earlyUnder = earlyScrolled.filter((s) => s.barVar === '' && s.under >= 0.5);
const earlyUnpub = earlyScrolled.filter((s) => s.barVar === '');
console.log(
  `
ПЕРЕСЕЧЕНИЕ «до гидратации И с прокруткой»: кадров ${earlyUnpub.length}, ` +
    `из них рельс УШЁЛ ПОД шапку: ${earlyUnder.length}`,
);
// ПАРНАЯ проверка самого блока (EXP-0070): «0 кадров под шапкой» имеет смысл только если
// кадры действительно были И до гидратации, И с ненулевой прокруткой.
const earlyReal = earlyScrolled.filter((s) => s.barVar === '' && s.y > 0);
console.log(
  `    из них РЕАЛЬНО прокручено (y > 0): ${earlyReal.length}` +
    (earlyReal.length === 0 ? '  ⚠️ БЛОК ВАКУУМЕН — мерить нечем' : ''),
);
if (earlyUnder.length) {
  const s = earlyUnder[0];
  console.log(`    пример: ${s.route} кадр${s.i} низ шапки=${s.barBottom} railY=${s.railY} под шапкой на ${s.under}px`);
}

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
const shellOk =
  railSlipped.length === 0 && itemLost.length === 0 && earlyUnder.length === 0 && fallbackBad === 0;
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

/**
 * Страж `bugs/117` — «возврат из „Как меня видят“ не дёргает контент „Профиля“».
 *
 * Стережёт РЕЗУЛЬТАТ починки, а не её реализацию, и стережёт его с трёх сторон сразу — потому
 * что у этого дефекта три разных способа «почина», из которых два делают продукт хуже:
 *
 *   1. **Контент не сдвигается.** Верх «Профиля» при возврате обязан стоять там же, где в покое,
 *      в КАЖДОМ кадре. До починки было 15 кадров подряд со сдвигом +453px (390) и +439px (1440).
 *   2. **Анимация ухода ЖИВА и это движение.** Самый дешёвый способ убрать скачок — снять
 *      анимацию вовсе; страж, стерегущий один пункт 1, покрасил бы это зелёным, а планка
 *      качества проекта требует обратного (боль владельца `bugs/05–07`). Поэтому страж требует
 *      кадров с живым уходящим блоком И реального смещения этого блока вправо.
 *   3. **Прозрачность НЕ анимируется.** Кроссфейд (`transition:fade`) скачок тоже убирает, но
 *      платит просвечиванием: на середине перехода два текста видны друг сквозь друга. Это
 *      снято кадрами и признано некрасивым; `opacity` уходящего слоя обязана оставаться 1.
 *   4. **Горизонтальной полосы нет.** Слой уезжает ВПРАВО — и не имеет права расширить область
 *      прокрутки документа.
 *
 * 🔑 Контроль прибора первым (`EXP-0070`, `EXP-0082`): прежде чем судить о сдвиге, страж
 * доказывает, что толкать БЫЛО ЧЕМ — при открытом предпросмотре ветка профиля не смонтирована,
 * а сам предпросмотр выше 300px. Без этой пары «сдвига нет» красилось бы зелёным на экране,
 * который просто не открылся.
 *
 * ⚠️ Требует поднятого стенда: `npm run stand`.
 * Запуск: `node tools/verify-bug117.mjs [--quick]`   (`--quick` — одна конфигурация, для мутаций)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const OUT = 'test-results/bug117-guard';
mkdirSync(OUT, { recursive: true });

const quick = process.argv.includes('--quick');
const CONFIGS = (
  quick
    ? [{ width: 390, height: 844, theme: 'light' }]
    : [
        { width: 390, height: 844, theme: 'light' },
        { width: 390, height: 844, theme: 'dark' },
        { width: 1440, height: 900, theme: 'light' },
        { width: 1440, height: 900, theme: 'dark' },
      ]
);

/** Кадров трассы: 60 ≈ 1 с, вдвое дольше анимации ухода (`MOTION.base` = 240 мс). */
const FRAMES = 60;
/** Допуск сдвига. Дефект измерялся сотнями пикселей — порог не обязан быть тонким. */
const TOLERANCE_PX = 4;

let pass = 0;
const fails = [];

function check(ok, name, detail) {
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fails.push(`${name} — ${detail}`);
    console.log(`  ❌ ${name} — ${detail}`);
  }
}

const browser = await chromium.launch();

for (const cfg of CONFIGS) {
  const tag = `${cfg.width}-${cfg.theme}`;
  console.log(`\n▶ ${cfg.theme} ${cfg.width}×${cfg.height}`);

  const ctx = await browser.newContext({ viewport: { width: cfg.width, height: cfg.height } });
  // Тему ставим ключом ДО загрузки: системный `colorScheme` тему продукта не меняет.
  await ctx.addInitScript((theme) => {
    try { localStorage.setItem('ndim-theme', theme); } catch { /* приватный режим */ }
  }, cfg.theme);

  const page = await ctx.newPage();
  await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.length > 200, null, { timeout: 30000 });
  const openBtn = page.getByRole('button', { name: /Как меня видят|How others see me/ });
  await openBtn.waitFor({ state: 'visible', timeout: 30000 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(400);

  await openBtn.click();
  await page.locator('.seeme').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(600);

  // ── КОНТРОЛЬ ПРИБОРА: толкать было чем ────────────────────────────────────────────────────
  const opened = await page.evaluate(shot);
  check(
    opened.profTop === null,
    `[${tag}] предпросмотр открыт: ветки профиля в разметке нет`,
    `первым ребёнком оказался «${opened.profCls}» — экран не в том состоянии, замер бессмысленен`,
  );
  check(
    opened.seemeH > 300,
    `[${tag}] предпросмотру ЕСТЬ чем толкать (высота > 300px)`,
    `высота ${opened.seemeH}px`,
  );

  // ── ТРАССА ВОЗВРАТА ───────────────────────────────────────────────────────────────────────
  await page.evaluate(
    ([frames, src]) => {
      const shotFn = new Function(`return (${src})`)();
      const trace = [];
      let n = 0;
      const t0 = performance.now();
      const step = () => {
        trace.push({ ms: Math.round(performance.now() - t0), ...shotFn() });
        if (++n < frames) requestAnimationFrame(step);
      };
      window.__b117guard = trace;
      requestAnimationFrame(step);
    },
    [FRAMES, shot.toString()],
  );

  await page.goBack();
  await page.waitForTimeout(FRAMES * 17 + 300);
  const trace = await page.evaluate(() => window.__b117guard);
  await page.waitForTimeout(200);
  const settled = await page.evaluate(shot);
  await page.screenshot({ path: `${OUT}/${tag}-покой.png` });

  const rest = settled.profTop;
  const drawn = trace.filter((f) => f.profTop !== null);
  const jumpy = drawn.filter((f) => Math.abs(f.profTop - rest) > TOLERANCE_PX);
  const alive = trace.filter((f) => f.seeme);
  const lefts = alive.map((f) => f.seemeLeft);
  const travel = lefts.length === 0 ? 0 : Math.max(...lefts) - Math.min(...lefts);
  const seeThrough = alive.filter((f) => f.opacity < 0.99);
  const hscroll = trace.filter((f) => f.hscroll);

  // 1. Главное: контент стоит на месте.
  check(
    jumpy.length === 0,
    `[${tag}] контент «Профиля» не сдвигается ни в одном кадре возврата`,
    `${jumpy.length} кадров из ${drawn.length} сдвинуты, крайний ${
      jumpy.length === 0 ? 0 : Math.max(...jumpy.map((f) => Math.abs(f.profTop - rest)))
    }px (покой ${rest}px)`,
  );

  // 2. Анимация ухода жива — и это ДВИЖЕНИЕ, а не исчезновение.
  check(
    alive.length >= 5,
    `[${tag}] анимация ухода существует (кадров с живым слоем ≥ 5)`,
    `кадров ${alive.length} — похоже, анимацию сняли вместо починки`,
  );
  check(
    travel > 100,
    `[${tag}] уходящий слой реально уезжает вправо (> 100px)`,
    `смещение ${Math.round(travel)}px`,
  );

  // 3. Прозрачность не анимируется — иначе вернётся просвечивание двух текстов.
  check(
    seeThrough.length === 0,
    `[${tag}] уходящий слой ПЛОТНЫЙ (opacity не анимируется)`,
    `${seeThrough.length} кадров с прозрачностью, минимум ${
      seeThrough.length === 0 ? 1 : Math.min(...seeThrough.map((f) => f.opacity)).toFixed(2)
    }`,
  );

  // 4. Новый дефект вместо старого заводить нельзя.
  check(
    hscroll.length === 0,
    `[${tag}] горизонтальная полоса прокрутки не появляется`,
    `${hscroll.length} кадров с полосой`,
  );

  await ctx.close();
}

await browser.close();

console.log('\n──────────────────────────────────────────────────────────────────────');
console.log(`Проверок пройдено: ${pass}   Провалов: ${fails.length}`);
for (const f of fails) console.log(`  ❌ ${f}`);
console.log(`Скриншоты: ${OUT}/`);
process.exit(fails.length === 0 ? 0 : 1);

/**
 * Снимок кадра. Живёт ОДНОЙ функцией и уезжает в страницу исходником — чтобы трасса и разовые
 * замеры мерили ровно одно и то же, а не две похожие вещи.
 */
function shot() {
  const main = document.querySelector('main.body');
  const kids = main === null ? [] : [...main.children];
  const seeme = kids.find((k) => k.classList.contains('seeme')) ?? null;
  const prof = kids.find((k) => !k.classList.contains('seeme')) ?? null;
  const r = prof === null ? null : prof.getBoundingClientRect();
  const s = seeme === null ? null : seeme.getBoundingClientRect();
  return {
    seeme: seeme !== null,
    opacity: seeme === null ? 1 : Number(getComputedStyle(seeme).opacity),
    seemeH: s === null ? 0 : Math.round(s.height),
    seemeLeft: s === null ? 0 : Math.round(s.left),
    profCls: prof === null ? null : prof.className,
    profTop: r === null ? null : Math.round(r.top),
    scrollY: Math.round(window.scrollY),
    hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
}

/**
 * Страж `bugs/117` — «возврат из „Как меня видят“ не дёргает контент „Профиля“».
 *
 * Стережёт РЕЗУЛЬТАТ починки, а не её реализацию, и стережёт его с четырёх сторон сразу — потому
 * что у этого дефекта несколько «починок», и почти каждая делает продукт хуже по-своему:
 *
 *   1. **Контент не сдвигается.** Верх «Профиля» при возврате обязан стоять там же, где в покое,
 *      в КАЖДОМ кадре. До починки было 15 кадров подряд со сдвигом +453px (390) и +439px (1440).
 *   2. **Уход предпросмотра МГНОВЕННЫЙ.** Любая анимация ухода держит блок в потоке — и он снова
 *      толкает контент вниз. Именно так и родился дефект (`transition:fade` на ветке).
 *   3. **Плавность жива, но живёт в ПОЯВЛЕНИИ.** Снять всякую анимацию — самый дешёвый способ
 *      убрать скачок, и страж, стерегущий только пункт 1, покрасил бы его зелёным. Владелец
 *      забраковал и это, и уезд слоя вбок: «неужели нельзя мягким фейдом… как уже есть в других
 *      местах появление контента?» Поэтому страж требует кадров с неполной прозрачностью
 *      рабочей области И достаточной глубины фейда (иначе анимация есть, а глазу незаметна).
 *   4. **Горизонтальной полосы нет** — общий запрет на «новый дефект вместо старого».
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
  const fading = trace.filter((f) => f.bodyOpacity < 0.99);
  const dimmest = fading.length === 0 ? 1 : Math.min(...fading.map((f) => f.bodyOpacity));
  const hscroll = trace.filter((f) => f.hscroll);

  // 1. Главное: контент стоит на месте.
  check(
    jumpy.length === 0,
    `[${tag}] контент «Профиля» не сдвигается ни в одном кадре возврата`,
    `${jumpy.length} кадров из ${drawn.length} сдвинуты, крайний ${
      jumpy.length === 0 ? 0 : Math.max(...jumpy.map((f) => Math.abs(f.profTop - rest)))
    }px (покой ${rest}px)`,
  );

  // 2. Уход предпросмотра МГНОВЕННЫЙ — иначе он снова окажется в потоке и толкнёт контент.
  check(
    alive.length <= 1,
    `[${tag}] предпросмотр снимается мгновенно (кадров с живым слоем ≤ 1)`,
    `кадров ${alive.length} — уходу вернули анимацию, и он снова занимает место`,
  );

  // 3. Плавность НЕ пропала, она переехала в ПОЯВЛЕНИЕ рабочей области.
  /*
   * Слово владельца о первой редакции: «переход назад выглядит как полное дерьмо. Неужели
   * нельзя мягким фейдом было сделать? как уже есть в других местах появление контента?»
   * Без этой пары проверок «починка» удалением всякой анимации осталась бы зелёной, а планка
   * качества проекта требует обратного (`bugs/05–07`).
   */
  check(
    fading.length >= 3,
    `[${tag}] появление контента ПЛАВНОЕ (кадров с неполной прозрачностью ≥ 3)`,
    `кадров ${fading.length} — фейд появления пропал, контент возникает рывком`,
  );
  check(
    dimmest <= 0.6,
    `[${tag}] фейд начинается с малого (минимум прозрачности ≤ 0.6)`,
    `самый бледный кадр ${dimmest.toFixed(2)} — анимация есть, но глазу незаметна`,
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
    // Прозрачность САМОЙ рабочей области — носитель мягкого появления контента.
    bodyOpacity: main === null ? 1 : Number(getComputedStyle(main).opacity),
    scrollY: Math.round(window.scrollY),
    hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
}

/**
 * Прибор замера для `bugs/117` — «скачок контента „Профиля“ при возврате из „Как меня видят“».
 *
 * НЕ страж и НЕ фикс. Он отвечает числами и кадрами на вопрос, который баг ставит первым и на
 * который до сих пор никто не отвечал НАБЛЮДЕНИЕМ: воспроизводится ли скачок, и ЧТО именно
 * сдвинуто — вся страница (значит прокрутка) или содержимое рабочей области (значит порядок
 * размонтирования предпросмотра).
 *
 * Слово владельца дословно (`bugs/117`): «контент в профиле на мгновение сдвинут вниз, словно
 * отступая место под содержимое „Как меня видят“, а затем быстро перемещается вверх».
 *
 * ── МЕТОД ────────────────────────────────────────────────────────────────────────────────────
 * Скачок длится доли секунды и одиночным замером неизмерим — нужна покадровая трасса (EXP-0060).
 * Трасса живёт ВНУТРИ страницы (в отличие от `measure-bug40.mjs`, где её приходилось держать со
 * стороны Node): закрытие предпросмотра — это `history.back()` при НЕГЛУБОКОМ маршрутировании
 * (`bugs/76`), контекст исполнения переживает его целиком.
 *
 * Что пишется каждый кадр:
 *   · `seeme`     — жив ли ещё блок предпросмотра и какой у него `opacity` (идёт ли outro);
 *   · `seemeH`    — сколько места он занимает В ПОТОКЕ (именно это и толкает контент вниз);
 *   · `profTop`   — верх первого НЕ-предпросмотрового ребёнка `main.body` относительно ВЬЮПОРТА:
 *                   это ровно та величина, о которой говорит владелец («контент сдвинут вниз»);
 *   · `scrollY` и `docH` — чтобы отличить сдвиг СТРАНИЦЫ от сдвига СОДЕРЖИМОГО. Гипотеза
 *                   `plans/49` (восстановление прокрутки) и гипотеза «блок ещё в потоке» дают
 *                   РАЗНЫЕ подписи: первая двигает `scrollY`, вторая — только `profTop`.
 *
 * Вердикта прибор не выносит: он печатает подпись кадров и кладёт кропы верхней части экрана,
 * которые показываются владельцу («это оно?») ДО всякой правки — порядок из самого баг-дока.
 *
 * ⚠️ Требует поднятого стенда: `npm run stand`.
 * Запуск: `node tools/measure-bug117.mjs [--only 390|1440]`
 */
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg === -1 ? null : Number(process.argv[onlyArg + 1]);
const labelArg = process.argv.indexOf('--label');
/*
 * Метка прогона — своя подпапка кадрам. Без неё второй прогон затирает первый, и пары
 * «до/после» не существует: ровно это здесь и случилось при первом замере. Снимок «до»
 * берётся на отложенной правке (`git stash`) — так сравнивается одно с одним
 * (приём `measure-ideas18.mjs`).
 */
const label = labelArg === -1 ? 'текущий' : process.argv[labelArg + 1];
const OUT = `test-results/bug117/${label}`;

// Чистим ТОЛЬКО при полном прогоне: `--only 1440` не должен уносить кадры `--only 390`.
if (only === null) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

/** Сколько кадров трассы снимаем после «Назад». 60 кадров ≈ 1 с — вдвое дольше outro (240 мс). */
const FRAMES = 60;

const CONFIGS = [
  { width: 390, height: 844, theme: 'light' },
  { width: 390, height: 844, theme: 'dark' },
  { width: 1440, height: 900, theme: 'light' },
  { width: 1440, height: 900, theme: 'dark' },
].filter((c) => only === null || c.width === only);

const browser = await chromium.launch();
const report = [];

for (const cfg of CONFIGS) {
  const tag = `${cfg.width}-${cfg.theme}`;
  const ctx = await browser.newContext({
    viewport: { width: cfg.width, height: cfg.height },
    // Кадры перехода — канон визуальных жалоб (`bugs/80`): слова уводят не туда.
    recordVideo: { dir: `${OUT}/video-${tag}`, size: { width: cfg.width, height: cfg.height } },
  });
  // Тему ставим КЛЮЧОМ ДО загрузки: системный `colorScheme` тему продукта не меняет
  // (капкан `verify-icons`), и «обе темы» проверялись бы формально.
  await ctx.addInitScript((theme) => {
    try { localStorage.setItem('ndim-theme', theme); } catch { /* приватный режим */ }
  }, cfg.theme);

  const page = await ctx.newPage();
  await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.length > 200, null, { timeout: 30000 });
  // Ждём именно кнопку, а не таймаут: она рисуется, когда данные профиля уже на месте.
  const openBtn = page.getByRole('button', { name: /Как меня видят|How others see me/ });
  await openBtn.waitFor({ state: 'visible', timeout: 30000 });

  /*
   * Замер идёт из ВЕРХА страницы. Это не упрощение, а выбор: владелец описывает переход,
   * который делает каждый раз, а память вида (`plans/08`) на этом пути не участвует вовсе —
   * `afterNavigate` отсекает возврат с ТОГО ЖЕ пути (`view-memory.ts:119`). Если скачок
   * воспроизведётся при `scrollY = 0`, гипотеза «виновата прокрутка» умирает от одного числа.
   */
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(400);

  const before = await page.evaluate(measureShot);

  await openBtn.click();
  await page.locator('.seeme').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(600); // предпросмотр отрисован и дожил до покоя

  const opened = await page.evaluate(measureShot);

  // ── ПРОХОД 1: покадровая трасса чисел ──────────────────────────────────────────────────────
  await page.evaluate((frames) => {
    const shot = () => {
      const main = document.querySelector('main.body');
      const kids = main === null ? [] : [...main.children];
      const seeme = kids.find((k) => k.classList.contains('seeme')) ?? null;
      const prof = kids.find((k) => !k.classList.contains('seeme')) ?? null;
      const r = prof === null ? null : prof.getBoundingClientRect();
      return {
        seeme: seeme !== null,
        opacity: seeme === null ? null : Number(getComputedStyle(seeme).opacity).toFixed(2),
        seemeH: seeme === null ? 0 : Math.round(seeme.getBoundingClientRect().height),
        profCls: prof === null ? null : prof.className,
        profTop: r === null ? null : Math.round(r.top),
        // Прозрачность САМОЙ рабочей области: в ней теперь живёт мягкое появление контента
        // (`bugs/117`, слово владельца — «мягким фейдом, как в других местах»).
        bodyOpacity: main === null ? 1 : Number(getComputedStyle(main).opacity),
        scrollY: Math.round(window.scrollY),
        docH: Math.round(document.documentElement.scrollHeight),
        // Уходящий слой уезжает ВПРАВО (`bugs/117`, часть 2) — он не имеет права расширить
        // область прокрутки и родить горизонтальную полосу. Это новый дефект вместо старого,
        // и ловится он только тем, что спрошен в те же кадры.
        hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    };
    const trace = [];
    let n = 0;
    const t0 = performance.now();
    const step = () => {
      trace.push({ ms: Math.round(performance.now() - t0), ...shot() });
      if (++n < frames) requestAnimationFrame(step);
    };
    window.__b117 = trace;
    requestAnimationFrame(step);
  }, FRAMES);

  await page.goBack();
  await page.waitForTimeout(FRAMES * 17 + 300);
  const trace = await page.evaluate(() => window.__b117);
  const settled = await page.evaluate(measureShot);

  // ── ПРОХОД 2: кропы верхней части экрана в те же миллисекунды ──────────────────────────────
  await openBtn.waitFor({ state: 'visible', timeout: 10000 });
  await openBtn.click();
  await page.locator('.seeme').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(600);
  /*
   * Кадр — ВЕСЬ вьюпорт, а не «верхняя часть». Сдвиг доходит до +453px, и кроп в 520px
   * показывал бы только угасающий предпросмотр, а вытолкнутый вниз профиль — предмет жалобы —
   * оставался бы за краем кадра. Владельцу показывают то, что он видит, целиком.
   */
  const clip = { x: 0, y: 0, width: cfg.width, height: cfg.height };
  await page.screenshot({ path: `${OUT}/${tag}-0-открыт.png`, clip });
  const t0 = Date.now();
  const shots = [];
  await page.goBack();
  for (let i = 0; i < 8; i++) {
    const at = Date.now() - t0;
    await page.screenshot({ path: `${OUT}/${tag}-1-возврат-${String(at).padStart(4, '0')}ms.png`, clip });
    shots.push(at);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${tag}-2-покой.png`, clip });

  // ── ЧТО ПОКАЗАЛИ КАДРЫ ─────────────────────────────────────────────────────────────────────
  const tops = trace.filter((f) => f.profTop !== null).map((f) => f.profTop);
  const restTop = settled.profTop;
  const worst = tops.reduce((a, b) => (Math.abs(b - restTop) > Math.abs(a - restTop) ? b : a), restTop);
  const jumpy = trace.filter((f) => f.profTop !== null && Math.abs(f.profTop - restTop) > 4);
  const withSeeme = jumpy.filter((f) => f.seeme).length;
  const scrolls = new Set(trace.map((f) => f.scrollY));

  console.log(`\n══ ${cfg.width}px · тема ${cfg.theme} ══`);
  console.log(`  до открытия : верх контента ${before.profTop}px (${before.profCls})`);
  // При открытом предпросмотре ветки профиля в разметке НЕТ вовсе — это не сбой замера, а
  // устройство экрана (`{#if seeMeOpen}` … `{:else if data}`), и печатать это надо словами.
  console.log(`  открыт      : профиль ${opened.profTop === null ? 'НЕ СМОНТИРОВАН (ветка предпросмотра)' : 'верх ' + opened.profTop + 'px'}, высота предпросмотра ${opened.seemeH}px`);
  console.log(`  после покоя : верх контента ${restTop}px (${settled.profCls})`);
  console.log(`  ── возврат, ${trace.length} кадров ──`);
  console.log(`  кадров со СДВИНУТЫМ контентом (>4px от покоя): ${jumpy.length}`);
  console.log(`  из них кадров, где предпросмотр ЕЩЁ В ПОТОКЕ : ${withSeeme}`);
  console.log(`  крайнее положение верха контента            : ${worst}px (покой ${restTop}px, сдвиг ${worst - restTop >= 0 ? '+' : ''}${worst - restTop}px)`);
  console.log(`  прокрутка окна за все кадры                 : ${[...scrolls].join(', ')}  ← одно значение = страница НЕ ездила`);
  console.log(`  кадров с ГОРИЗОНТАЛЬНОЙ полосой             : ${trace.filter((f) => f.hscroll).length}  ← уезжающий слой не имеет права её родить`);
  console.log(`  первые кадры:`);
  for (const f of trace.slice(0, 12)) {
    console.log(`    ${String(f.ms).padStart(4)}мс  seeme=${f.seeme ? 'да' : 'НЕТ'} opacity=${f.opacity ?? '—'} высота=${String(f.seemeH).padStart(4)}  верх контента=${String(f.profTop).padStart(5)}  scrollY=${f.scrollY}`);
  }

  report.push({ tag, jumpFrames: jumpy.length, withSeeme, worst, restTop, scrolls: [...scrolls], seemeH: opened.seemeH });

  await ctx.close();
}

await browser.close();

console.log('\n══════ СВОДКА ══════');
for (const r of report) {
  console.log(
    `  ${r.tag.padEnd(11)} сдвинутых кадров ${String(r.jumpFrames).padStart(2)} · из них с живым предпросмотром ${String(r.withSeeme).padStart(2)} · крайний сдвиг ${r.worst - r.restTop >= 0 ? '+' : ''}${r.worst - r.restTop}px · прокрутка ${r.scrolls.join('/')}`,
  );
}
console.log(`\nкадры и видео: ${OUT}`);

/** Снимок геометрии рабочей области — тот же код, что в трассе, но разово. */
function measureShot() {
  const main = document.querySelector('main.body');
  const kids = main === null ? [] : [...main.children];
  const seeme = kids.find((k) => k.classList.contains('seeme')) ?? null;
  const prof = kids.find((k) => !k.classList.contains('seeme')) ?? null;
  const r = prof === null ? null : prof.getBoundingClientRect();
  return {
    seeme: seeme !== null,
    seemeH: seeme === null ? 0 : Math.round(seeme.getBoundingClientRect().height),
    profCls: prof === null ? null : prof.className,
    profTop: r === null ? null : Math.round(r.top),
    scrollY: Math.round(window.scrollY),
    docH: Math.round(document.documentElement.scrollHeight),
  };
}

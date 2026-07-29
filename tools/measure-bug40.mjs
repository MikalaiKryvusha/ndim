/**
 * Прибор замера для bugs/40 — «лендинг мелькает у вошедшего, boot-экрана нет».
 *
 * НЕ страж и НЕ фикс: он только отвечает числами на вопрос, который баг ставит первым, —
 * происходит ли редирект вошедшего с `/` на `/profile`, и СКОЛЬКО КАДРОВ человек видит
 * лендинг до перехода. Замер до кода — канон проекта (`plans/06`).
 *
 * Метод — покадровая rAF-трасса (EXP-0060): «дёрганость» одиночным замером неизмерима,
 * её видно только по кадрам.
 *
 * Что считается кадром лендинга: на странице виден заголовок приветствия лендинга.
 * Что считается кадром приложения: адрес уже /profile.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const OUT = 'test-results/bug40';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

for (const round of [1, 2]) {
  // Раунд 1 — холодный контекст (первое открытие). Раунд 2 — тот же контекст повторно,
  // чтобы отделить «первый заход» от «возврата по базовой ссылке».
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Сначала заходим внутрь, чтобы стенд успел войти пользователем и сессия существовала.
  await page.goto(BASE + '/profile', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.length > 200, null, { timeout: 30000 });
  await page.waitForTimeout(1500);

  // Теперь — открытие ПО БАЗОВОЙ ССЫЛКЕ, ровно как делает владелец.
  await page.goto(BASE + '/', { waitUntil: 'commit' });

  /*
   * ⚠️ Опрашиваем СО СТОРОНЫ NODE, а не внутри страницы: редирект уничтожает контекст
   * исполнения, и трасса, живущая в странице, погибает вместе с ним ровно в тот момент,
   * который мы и пришли измерять.
   */
  const trace = [];
  for (let i = 0; i < 120; i++) {
    let frame;
    try {
      frame = await page.evaluate(() => ({
        path: location.pathname,
        // Приветствие лендинга — надёжный признак, что человек видит именно его.
        landing: /Добро пожаловать|Welcome to/.test(document.body.innerText || ''),
        // Кольцо загрузки 1.x (Loading.svelte) — то, чего в этом месте пока нет.
        ring: !!document.querySelector('.loading, .loader, [data-loading]'),
      }));
    } catch {
      continue; // контекст снесён навигацией — это сам переход, пропускаем кадр
    }
    trace.push({ i, ...frame });
    if (frame.path === '/profile') break;
    await page.waitForTimeout(16); // ~кадр
  }

  const landingFrames = trace.filter((f) => f.landing).length;
  const ringFrames = trace.filter((f) => f.ring).length;
  const redirected = trace.some((f) => f.path === '/profile');
  const firstRedirect = trace.findIndex((f) => f.path === '/profile');

  console.log(`\n── раунд ${round} (${round === 1 ? 'холодный контекст' : 'повторное открытие'}) ──`);
  console.log(`  кадров всего снято            : ${trace.length}`);
  console.log(`  редирект вошедшего произошёл  : ${redirected ? 'ДА, на кадре ' + firstRedirect : 'НЕТ'}`);
  console.log(`  кадров, где человек видит ЛЕНДИНГ: ${landingFrames}  ← это и есть «мелькание»`);
  console.log(`  кадров с кольцом загрузки     : ${ringFrames}  ← boot-экрана пока нет, ожидаем 0`);

  await page.screenshot({ path: `${OUT}/round${round}-final.png` });
  await ctx.close();
}

await browser.close();
console.log(`\nскриншоты: ${OUT}`);

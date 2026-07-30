/**
 * Сверка боя после выката В4 (интервью №005) — живым браузером, гостем.
 *
 * Что проверяет (гостю доступно ровно это):
 *  · страницы РИСУЮТСЯ пикселями, а не «отдают 200» — проверяется высотой контента;
 *  · боевой чанк несёт новый контракт свежести {mine:1/0,server:1/0,pulse:6e4};
 *  · консоль чиста (отказы правил Firestore гостю — ожидаемы и отфильтрованы);
 *  · обе темы × 390/1440.
 *
 * Чего гость проверить НЕ МОЖЕТ: сам эффект кэша (нужен логин владельца).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'https://ndimspace.app';
const OUT = 'test-results/prod-b4';
const SCREENS = [
  { path: '/', name: 'landing' },
  { path: '/menu', name: 'menu' },
  { path: '/space', name: 'space' },
  { path: '/relations', name: 'relations' },
  { path: '/dims', name: 'dims' },
];
const SIZES = [
  { w: 390, h: 844, tag: 'mobile' },
  { w: 1440, h: 900, tag: 'desktop' },
];
const THEMES = ['light', 'dark'];

/**
 * Отказы правил гостю — ожидаемое поведение, а не дефект. Фильтр УЗКИЙ, как у сестёр
 * verify-bug84/87 (bugs/97): прежний прощал весь класс FirebaseError и любой код auth/…,
 * то есть выкат с битым Firebase-конфигом прошёл бы смоук зелёным. Любая НЕ-правовая
 * ошибка Firebase (unavailable, invalid-api-key…) обязана краснить прогон.
 */
const EXPECTED = /permission|insufficient|Missing or insufficient/i;

mkdirSync(OUT, { recursive: true });

let pass = 0;
const fails = [];
const ok = (cond, label) => (cond ? pass++ : fails.push(label));

const browser = await chromium.launch();

for (const theme of THEMES) {
  for (const size of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h } });
    // Тему продукта задаёт ключ ndim-theme ДО загрузки — системный colorScheme её не меняет.
    await ctx.addInitScript((t) => localStorage.setItem('ndim-theme', t), theme);
    const page = await ctx.newPage();

    for (const screen of SCREENS) {
      const noise = [];
      page.removeAllListeners('console');
      page.on('console', (m) => {
        if (m.type() === 'error' && !EXPECTED.test(m.text())) noise.push(m.text());
      });

      /*
       * ⚠️ Ждём ОТРИСОВКИ, а не тишины сети: приложение держит открытым канал WebChannel
       * Firestore, поэтому `networkidle` здесь не наступает никогда (родственно EXP-0073).
       */
      await page.goto(BASE + screen.path, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => document.body.innerText.trim().length > 50, null, {
        timeout: 30000,
      });
      await page.waitForTimeout(1200);

      const tag = `${screen.name}-${theme}-${size.tag}`;

      // Страница реально отрисована: у body есть заметная высота и видимый текст.
      const height = await page.evaluate(() => document.body.scrollHeight);
      ok(height > 300, `${tag}: контент отрисован (высота ${height})`);

      const text = (await page.evaluate(() => document.body.innerText)).trim();
      ok(text.length > 50, `${tag}: на странице есть текст (${text.length} симв.)`);

      /*
       * Фон соответствует теме — доказывает, что тема реально применилась. Сначала
       * ПРИМЕНЁННОСТЬ, потом светлота (bugs/98): непримененный CSS оставляет у body
       * прозрачный 'rgba(0, 0, 0, 0)', и старый разбор превращал его в [0,0,0] —
       * «тёмная тема применена» зеленела ровно на том дефекте, который сторожила.
       * Прозрачный или неразобранный фон — провал ВСЕГДА, в обеих темах.
       */
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const parsed = bg.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
      const alpha = parsed ? (parsed[4] === undefined ? 1 : Number(parsed[4])) : 0;
      const lum = parsed ? (Number(parsed[1]) + Number(parsed[2]) + Number(parsed[3])) / 3 : NaN;
      ok(
        parsed !== null && alpha === 1 && (theme === 'light' ? lum > 140 : lum < 120),
        `${tag}: тема ${theme} применена непрозрачным фоном (${bg})`,
      );

      ok(noise.length === 0, `${tag}: консоль чиста${noise.length ? ' — ' + noise.join(' | ') : ''}`);

      await page.screenshot({ path: `${OUT}/${tag}.png`, fullPage: false });
    }
    await ctx.close();
  }
}

// Контракт свежести — в боевом чанке, скачанном браузером.
const ctx = await browser.newContext();
const page = await ctx.newPage();
let contract = null;
page.on('response', async (r) => {
  if (!r.url().includes('/_app/immutable/') || !r.url().endsWith('.js')) return;
  try {
    const body = await r.text();
    const m = body.match(/\{mine:1\/0[^}]*\}/);
    if (m) contract = m[0];
  } catch {}
});
await page.goto(BASE + '/space', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);
ok(contract === '{mine:1/0,server:1/0,pulse:6e4}', `контракт свежести в бою: ${contract}`);
await ctx.close();

await browser.close();

console.log(`\nПРОЙДЕНО: ${pass}`);
if (fails.length) {
  console.log(`ПРОВАЛЕНО: ${fails.length}`);
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('Все проверки зелёные. Скриншоты: ' + OUT);

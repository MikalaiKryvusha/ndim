/**
 * ТАКТ Г, фаза 1 — ВИЗУАЛЬНАЯ ПРИЁМКА БОЯ семейства «ТЕСТ» (plans/42, критерий 3).
 *
 * Прибор ЧИТАЮЩИЙ: ни одной записи в боевую базу. Путь гостя с фиксацией оценки — фаза 2,
 * отдельным прогоном (оценка в бою двигает NDSR, поэтому она ставится один раз и убирается
 * органами самого продукта).
 *
 * Что судит на каждой странице × тема × ширина:
 *   · страница СТАРТОВАЛА (h1 отрисован, а не белый экран);
 *   · консоль чиста от ошибок рантайма (класс bugs/124);
 *   · СТЕНЫ НЕТ до ценности: ни одного поля ввода почты/пароля, у обёрток звёзды доступны сразу;
 *   · закон владельца 2026-08-14: НАЗВАНИЕ НЕ ОБРЕЗАЕТСЯ (ни ellipsis, ни line-clamp, ни
 *     срезанная высота) — тот самый bugs/120, вскрытый в бою в день произнесения закона;
 *   · тема реально применена (иначе «обе темы» проверялись бы формально, урок verify-icons).
 *
 * Запуск: node probe-tact-g-1-visual.mjs [--base https://ndimspace.app]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const baseArg = process.argv.indexOf('--base');
const BASE = baseArg === -1 ? 'https://ndimspace.app' : process.argv[baseArg + 1];
const OUT = 'test-results/test-tact-g';
mkdirSync(OUT, { recursive: true });

const CONFIGS = [
  { width: 390, height: 844, theme: 'light' },
  { width: 390, height: 844, theme: 'dark' },
  { width: 1440, height: 900, theme: 'light' },
  { width: 1440, height: 900, theme: 'dark' },
];

/** Восемь боевых страниц семейства. `hub` — без движка, у него звёзд быть не должно. */
const PAGES = [
  { path: '/ru/tests', kind: 'hub', mark: /тест/i },
  { path: '/en/tests', kind: 'hub', mark: /test/i },
  { path: '/ru/test/compatibility', kind: 'wrap', mark: /совместим/i },
  { path: '/ru/test/personality', kind: 'wrap', mark: /личност/i },
  { path: '/ru/test/love', kind: 'wrap', mark: /любв|любов/i },
  { path: '/en/test/compatibility', kind: 'wrap', mark: /compatib/i },
  { path: '/en/test/personality', kind: 'wrap', mark: /personalit/i },
  { path: '/en/test/love', kind: 'wrap', mark: /love/i },
];

let pass = 0;
const fails = [];
function check(ok, name, detail = '') {
  if (ok) { pass++; } else { fails.push(`${name}${detail ? ' — ' + detail : ''}`); }
  console.log(`  ${ok ? '✅' : '❌'} ${name}${!ok && detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch();

for (const cfg of CONFIGS) {
  const tag = `${cfg.width}-${cfg.theme}`;
  console.log(`\n▶ ${BASE} · ${cfg.theme} ${cfg.width}×${cfg.height}`);

  const ctx = await browser.newContext({
    viewport: { width: cfg.width, height: cfg.height },
    locale: 'ru-RU',
  });
  // Тему кладём ДО загрузки: системный colorScheme тему продукта не меняет (урок verify-icons).
  await ctx.addInitScript((theme) => {
    try { localStorage.setItem('ndim-theme', theme); } catch { /* приватный режим */ }
  }, cfg.theme);

  for (const p of PAGES) {
    const errors = [];
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(BASE + p.path, { waitUntil: 'networkidle', timeout: 45000 });
    const label = `${p.path} · ${tag}`;

    // 1. Страница стартовала
    const h1 = await page.locator('h1').first().innerText().catch(() => '');
    check(h1.trim().length > 0, `${label} · h1 отрисован`, `h1="${h1.slice(0, 40)}"`);
    check(p.mark.test(h1), `${label} · h1 по теме страницы`, `h1="${h1.slice(0, 60)}"`);

    // 2. Тема реально применена
    const themeNow = await page.evaluate(() => document.documentElement.dataset.theme ?? '(нет)');
    check(themeNow === cfg.theme, `${label} · тема применена`, `data-theme=${themeNow}`);

    // 3. Стены нет: ни одного поля почты/пароля
    const walls = await page.locator('input[type=email], input[type=password]').count();
    check(walls === 0, `${label} · формы входа нет`, `полей=${walls}`);

    // 4. У обёрток движок доступен сразу
    if (p.kind === 'wrap') {
      const stars = await page.locator('.starsrow .st').count();
      check(stars === 11, `${label} · звёзды 0…10 сразу`, `звёзд=${stars}`);
      const nameTxt = await page.locator('.qcard .name').first().innerText().catch(() => '');
      check(nameTxt.trim().length > 0, `${label} · карточка объекта заполнена`, `name="${nameTxt}"`);

      // 5. ЗАКОН: название не обрезается (bugs/120)
      const clip = await page.locator('.qcard .name').first().evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          ellipsis: s.textOverflow === 'ellipsis',
          clamp: s.webkitLineClamp !== 'none' && s.webkitLineClamp !== '',
          nowrap: s.whiteSpace === 'nowrap',
          cut: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
        };
      });
      check(!clip.ellipsis && !clip.clamp && !clip.nowrap && !clip.cut,
        `${label} · название НЕ обрезано`, JSON.stringify(clip));
    } else {
      const stars = await page.locator('.starsrow .st').count();
      check(stars === 0, `${label} · хаб без движка`, `звёзд=${stars}`);
    }

    // 6. Консоль
    check(errors.length === 0, `${label} · консоль чиста`, errors.slice(0, 2).join(' | '));

    const shot = `${OUT}/${p.path.slice(1).replaceAll('/', '_')}__${tag}.png`;
    await page.screenshot({ path: shot, fullPage: false });
    await page.close();
  }
  await ctx.close();
}

await browser.close();
console.log(`\n${'═'.repeat(64)}\nПРОЙДЕНО: ${pass} · ПРОВАЛОВ: ${fails.length}`);
if (fails.length) { console.log('\nПРОВАЛЫ:'); fails.forEach((f) => console.log('  · ' + f)); }
console.log(`Кадры: ${OUT}/`);
process.exit(fails.length ? 1 : 0);

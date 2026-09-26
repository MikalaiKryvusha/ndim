#!/usr/bin/env node
/**
 * Драйвер ручного прогона внедрения строк интервью №102 и №103 (отчёт `2026-09-26_test-pages-negations-impl.md`).
 *
 * Запуск: `npm run build`, затем `npx vite preview --port 4203 --strictPort` (слот dev-1), затем
 *   node qa/reports/2026-09-26_test-pages-negations-impl.driver.mjs [--base http://localhost:4203] [--out <папка кадров>]
 *
 * Восемь страниц × 390/1440 × светлая/тёмная: новые строки стоят (текст берётся из `test-copy.ts` и подвалов — тем же
 * источником, что страница), прежних строк нет, описание для поиска — новое, горизонтального переполнения нет, ошибок в
 * консоли нет; все частые вопросы раскрыты перед кадром. Кадры — целая страница, вне git (`test-results/`).
 * Выход: 0 — провалов нет; 1 — есть.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const BASE = arg('--base', 'http://localhost:4203');
const OUT = arg('--out', 'test-results/negations-impl');
mkdirSync(OUT, { recursive: true });

const { TESTS, TEST_FOOT, HUB } = await import(pathToFileURL(resolve('src/lib/content/test-copy.ts')).href);
const { CATALOG_COPY } = await import(pathToFileURL(resolve('src/lib/content/catalog-copy.ts')).href);

const OLD = [
  'честный поиск', 'honest search', 'без рекламы', 'no ads', 'Это не разовый тест', 'This is not a one-time test',
  'Оценки приватны', 'Ratings are private', 'Готовые типы', 'Ready-made types', 'Счёт честный', 'The count is honest',
  'Twenty One Pilots', 'Worms', 'Warcraft III', 'Пацаны', 'The Boys', 'Без выдуманных процентов', 'No made-up percentages',
  'с середины', 'halfway done', 'те же 7', 'the same 7', 'не выдуманные', 'not made up', 'в поиске её нет',
  'never appears in search', 'по-настоящему', 'truly match',
];

const testWant = (slug, lang) => {
  const c = TESTS[slug][lang];
  const want = [c.sub, c.keepTitle, c.keepBody, c.resultCaption, c.resultFoot, ...c.resultRows.map((r) => r.text),
    ...c.faq.map((f) => f.a), TEST_FOOT[lang], ...c.steps.map((s) => s.rest)];
  if (c.resultCount) want.push(c.resultCount.sub, `${c.resultCount.n} ${c.resultCount.label}`);
  if (slug === 'love') want.push(c.inviteNote);
  return { want, meta: c.metaDesc };
};
const DIM_FOOT = { ru: CATALOG_COPY.ru.foot, en: CATALOG_COPY.en.foot };

const PAGES = [];
for (const lang of ['ru', 'en']) {
  for (const slug of ['personality', 'love']) PAGES.push({ path: `/${lang}/test/${slug}`, name: `${slug}-${lang}`, live: true, ...testWant(slug, lang) });
  PAGES.push({
    path: `/${lang}/tests`, name: `tests-${lang}`, live: false, meta: HUB[lang].metaDesc,
    want: [HUB[lang].sub, HUB[lang].honesty, TESTS.personality[lang].hubLine, TESTS.love[lang].hubLine, TEST_FOOT[lang]],
  });
  PAGES.push({ path: `/${lang}/dimension/the-shawshank-redemption-bqz7orsq`, name: `dimension-${lang}`, live: false, meta: null, want: [DIM_FOOT[lang]] });
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();
let fail = 0, pass = 0;
const check = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  if (!ok) console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
for (const p of PAGES) {
  for (const width of [390, 1440]) {
    for (const theme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: theme });
      await ctx.addInitScript((t) => { try { localStorage.setItem('ndim-theme', t); } catch {} }, theme);
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(String(e)));
      const tag = `${p.name} ${width} ${theme}`;
      await page.goto(BASE + p.path, { waitUntil: 'load' });
      if (p.live) await page.waitForSelector('.qcard[data-live]', { timeout: 15000 }).catch(() => errors.push('нет .qcard[data-live]'));
      await page.waitForTimeout(400);
      // Только частые вопросы: выпадашка языка в шапке — тоже `<details>`, и раскрытая она заслоняет кадр.
      await page.evaluate(() => document.querySelectorAll('.faq details').forEach((d) => { d.open = true; }));
      const facts = await page.evaluate(() => ({
        text: document.body.innerText,
        meta: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null,
        themeAttr: document.documentElement.getAttribute('data-theme'),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      }));
      const text = norm(facts.text);
      for (const w of p.want) check(`${tag}: стоит «${w.slice(0, 50)}…»`, text.includes(norm(w)));
      for (const o of OLD) check(`${tag}: нет «${o}»`, !text.toLowerCase().includes(o.toLowerCase()), 'прежняя строка на странице');
      if (p.meta) check(`${tag}: описание для поиска`, facts.meta === p.meta, facts.meta ?? 'нет');
      check(`${tag}: тема`, facts.themeAttr === theme, String(facts.themeAttr));
      check(`${tag}: без переполнения`, facts.overflow <= 0, `${facts.overflow}px`);
      check(`${tag}: консоль без ошибок`, errors.length === 0, errors.join(' | ').slice(0, 300));
      await page.screenshot({ path: `${OUT}/${p.name}-${width}-${theme}.png`, fullPage: true });
      await ctx.close();
    }
  }
}
await browser.close();
console.log(`\nстраниц ${PAGES.length} × 2 ширины × 2 темы; проверок пройдено ${pass}, провалов ${fail}; кадры — ${OUT}/`);
process.exit(fail ? 1 : 0);

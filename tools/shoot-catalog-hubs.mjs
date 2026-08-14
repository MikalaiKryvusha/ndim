/**
 * ПРИЁМКА ХАБОВ КАТАЛОГА ЖИВЫМ БРАУЗЕРОМ — `plans/48` шаг 3 (фаза 2 эпика 40).
 *
 * Канон проекта (вердикт владельца 2026-07-16, `plans/06`): «тесты зелёные» ≠ готово. Путь
 * человека прогоняется настоящим браузером, в ОБЕИХ темах и на ДВУХ ширинах, со скриншотами.
 * Ничего не утверждает — это ПРИБОР; проверки живут в стражах.
 *
 * Снимаются места, где форма V3 «Рейтинг» может сломаться, а не «страница вообще»:
 *   · индекс каталога — семь разделов и хвост из 25 объектов;
 *   · первая страница «Фильмов» — голова топа, звёзды и «оценено N людьми»;
 *   · ГРАНИЦА ГОЛОСОВ — страница, на которой оценённые кончаются и начинается «ещё без голосов»
 *     (её владелец назвал ценой выбора V3, и увидеть её надо глазами, а не в тексте плана);
 *   · последняя страница «Фильмов» — хвост списка и полная пагинация;
 *   · «Книги» — самый маленький хаб, две страницы: пагинация не должна выглядеть нелепо;
 *   · САМОЕ ДЛИННОЕ НАЗВАНИЕ каталога — прямая проверка закона владельца «названия не
 *     обрезаются НИКОГДА»: карточка обязана вырасти по высоте, а номер и оценка — остаться
 *     на первой строке имени.
 *
 * Запуск (сначала подними собранный сайт):
 *   npx vite preview --port 4173 --strictPort   # в отдельном окне
 *   node tools/shoot-catalog-hubs.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { groupByKind, pageCount, PER_PAGE } from '../src/lib/content/catalog-hub.ts';

const BASE = process.env.NDIM_BASE ?? 'http://localhost:4173';
const OUT = resolve('test-results', 'catalog-hubs');

const src = existsSync('src/lib/content/dims-build.json')
  ? 'src/lib/content/dims-build.json'
  : 'src/lib/content/dims-slice.json';
const DIMS = JSON.parse(readFileSync(src, 'utf8'));
const { hubs } = groupByKind(DIMS);

const movies = hubs.get('movie') ?? [];
const moviePages = pageCount(movies.length);
/** Первая страница, на которой встречается карточка без голосов, — та самая названная цена. */
const firstUnrated = movies.findIndex((d) => (d.rates ?? 0) < 1);
const edgePage = firstUnrated >= 0 ? Math.floor(firstUnrated / PER_PAGE) + 1 : moviePages;

/** Хаб и страница, где живёт самое длинное название каталога, — закон о названиях в упор. */
const longest = DIMS.reduce((a, b) => (b.title.ru.length > a.title.ru.length ? b : a), DIMS[0]);
const longestIn = [...hubs.entries()].find(([, list]) => list.some((d) => d.slug === longest.slug));
const longestCase = longestIn
  ? {
      path: (() => {
        const idx = longestIn[1].findIndex((d) => d.slug === longest.slug);
        const p = Math.floor(idx / PER_PAGE) + 1;
        return p === 1 ? `catalog/${longestIn[0]}` : `catalog/${longestIn[0]}/${p}`;
      })(),
      label: `самое длинное название (${longest.title.ru.length} знаков): «${longest.title.ru}»`,
    }
  : null;

const CASES = [
  { path: 'catalog', label: 'индекс каталога: 7 разделов + хвост' },
  { path: 'catalog/movie', label: `Фильмы, страница 1 из ${moviePages} — голова топа` },
  { path: `catalog/movie/${edgePage}`, label: `Фильмы, страница ${edgePage} — ГРАНИЦА: голоса кончаются` },
  { path: `catalog/movie/${moviePages}`, label: `Фильмы, страница ${moviePages} — хвост и полная пагинация` },
  { path: 'catalog/book', label: 'Книги — самый маленький хаб (2 страницы)' },
  ...(longestCase ? [longestCase] : []),
];

/**
 * 🔴 ПРЕДПОЛЁТНАЯ ПРОВЕРКА: сервер отдаёт ИМЕННО ЭТУ сборку, а не пережившую гашение старую.
 * Полевой случай 2026-08-03: кадры снялись со СТАРОГО preview, страницы вышли без стилей, и
 * агент пошёл искать дефект в коде, которого не было (`EXP-0136`-сосед, `plans/36` шаг 6).
 */
{
  const file = resolve('build', 'ru', 'catalog', 'movie.html');
  if (!existsSync(file)) {
    console.error(`❌ нет ${file} — сначала \`npm run build\``);
    process.exit(1);
  }
  const css = readFileSync(file, 'utf8').match(/_app\/immutable\/assets\/[^"']+\.css/)?.[0];
  if (css) {
    const res = await fetch(`${BASE}/${css}`).catch(() => null);
    if (!res || !res.ok) {
      console.error(`❌ сервер на ${BASE} НЕ отдаёт таблицу стилей этой сборки (${res?.status ?? 'нет ответа'}).`);
      console.error('   Это переживший гашение preview со СТАРОЙ сборкой. Гаси процессом, а не pkill:');
      console.error("   Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ? { $_.CommandLine -match 'vite' } | % { Stop-Process -Id $_.ProcessId -Force }");
      process.exit(1);
    }
  }
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
let shots = 0;
const problems = [];

for (const width of [390, 1440]) {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, deviceScaleFactor: 2 });
    // Тема ставится ДО загрузки: скрипт `app.html` читает её первым кадром, и подмена после
    // загрузки дала бы кадр «светлая мигнула тёмной» вместо честного состояния.
    await page.addInitScript((t) => localStorage.setItem('ndim-theme', t), theme);
    // Консоль публичной страницы обязана молчать: молчаливая ошибка тут — тоже дефект.
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`консоль ${width}/${theme}: ${m.text()}`);
    });

    for (const lang of ['ru', 'en']) {
      for (const c of CASES) {
        const url = `${BASE}/${lang}/${c.path}`;
        const res = await page.goto(url, { waitUntil: 'networkidle' });
        if (!res || res.status() !== 200) problems.push(`${url} → HTTP ${res?.status()}`);
        const name = `${lang}-${width}-${theme}-${c.path.replace(/\//g, '_')}.png`;
        await page.screenshot({ path: resolve(OUT, name), fullPage: true });
        shots += 1;
      }
    }
    await page.close();
  }
}

await browser.close();
console.log(`Снято ${shots} кадров → ${OUT}`);
for (const c of CASES) console.log(`  · /${'{lang}'}/${c.path} — ${c.label}`);
if (problems.length) {
  console.log('\n❌ ПРОБЛЕМЫ:');
  for (const p of problems) console.log(`   ${p}`);
  process.exit(1);
}
console.log('✅ все страницы отдались с кодом 200, консоль чиста');

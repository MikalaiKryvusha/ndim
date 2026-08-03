/**
 * ПРИЁМКА ФАЗЫ 5 ЖИВЫМ БРАУЗЕРОМ — шаг 6 `plans/36`.
 *
 * Канон проекта (вердикт владельца 2026-07-16, `plans/06`): «тесты зелёные» ≠ готово. Путь
 * человека прогоняется настоящим браузером, в ОБЕИХ темах и на ДВУХ ширинах, со скриншотами.
 *
 * Снимает три ГРАНИЧНЫХ случая правила показа оценок плюс случайные страницы обоих языков.
 * Ничего не проверяет утверждениями — это ПРИБОР; проверки живут в `verify-dimension-pages.mjs`.
 *
 * Запуск (сначала подними собранный сайт):
 *   npx vite preview --port 4173 --strictPort   # в отдельном окне
 *   node tools/shoot-dimension-pages.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir, rm } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.NDIM_BASE ?? 'http://localhost:4173';
const OUT = resolve('test-results', 'dimension-pages');

const src = existsSync('src/lib/content/dims-build.json')
  ? 'src/lib/content/dims-build.json'
  : 'src/lib/content/dims-slice.json';
const DIMS = JSON.parse(readFileSync(src, 'utf8'));

/** Три границы правила оценок — ровно то, что план требует показать глазами. */
const pick = (test, label) => {
  const d = DIMS.find(test);
  return d ? { slug: d.slug, label: `${label} · ${d.title.ru}` } : null;
};
const CASES = [
  pick((d) => d.rates === 0, '0 голосов'),
  pick((d) => d.rates === 1, '1 голос'),
  pick((d) => d.rates >= 3, '≥3 голосов'),
  pick((d) => d.year === '-' && d.rates > 0, 'без года и автора'),
].filter(Boolean);

/**
 * 🔴 ПРЕДПОЛЁТНАЯ ПРОВЕРКА: сервер отдаёт ИМЕННО ЭТУ сборку, а не пережившую гашение старую.
 *
 * Полевой случай 2026-08-03: `pkill -f "vite preview"` на Windows не убил процесс, новый
 * `--strictPort` не поднялся, и кадры снялись со СТАРОГО сервера — страницы вышли БЕЗ СТИЛЕЙ
 * (таблица стилей отдавала 404). Кадр выглядел как сломанная вёрстка, и я полез искать дефект
 * в коде, которого там не было. Тот же класс уже стоил проекту 21 ложного падения e2e.
 *
 * Проверка ловит ЛЮБОЙ рассинхрон сервера и сборки: берём таблицу стилей, на которую ссылается
 * свежесобранная страница, и требуем от сервера 200. Не 200 — значит снимать нечего.
 */
{
  const probe = CASES[0];
  const file = resolve('build', 'ru', 'dimension', `${probe.slug}.html`);
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
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
    // Тема ставится ДО загрузки: скрипт в app.html читает её первым кадром, и подмена после
    // загрузки дала бы кадр «светлая мигнула тёмной» вместо честного состояния.
    await page.addInitScript((t) => localStorage.setItem('ndim-theme', t), theme);

    for (const lang of ['ru', 'en']) {
      for (const c of CASES) {
        const url = `${BASE}/${lang}/dimension/${c.slug}`;
        const res = await page.goto(url, { waitUntil: 'networkidle' });
        if (!res || res.status() !== 200) problems.push(`${url} → HTTP ${res?.status()}`);
        // Консоль браузера — часть приёмки: молчаливая ошибка на публичной странице недопустима.
        const name = `${lang}-${width}-${theme}-${c.slug}.png`;
        await page.screenshot({ path: resolve(OUT, name), fullPage: true });
        shots += 1;
      }
    }
    await page.close();
  }
}

await browser.close();
console.log(`Снято ${shots} кадров → ${OUT}`);
console.log(`Случаи: ${CASES.map((c) => c.label).join(' · ')}`);
if (problems.length) {
  console.log('\n❌ ПРОБЛЕМЫ:');
  for (const p of problems) console.log(`   ${p}`);
  process.exit(1);
}
console.log('✅ все страницы отдались с кодом 200');

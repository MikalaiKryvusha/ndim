/**
 * КАДРЫ «ДО/ПОСЛЕ» ДЛЯ ПРАВИЛА ЗВЁЗД ВЛАДЕЛЬЦА (интервью №044, В3).
 *
 * Его слово дословно: «*должна рисоваться одна серая звезда, как в шкале оценок. Если оценка
 * выше нуля, единица - то одна золотая звезда, и дальше по мере роста оценки растёт количество
 * отображаемых золотых звезд. Ничего никому объяснять не нужно про ноль звёзд - это просто
 * частный случай пространства*».
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ ПРИБОР, А НЕ ПРАВКА `shoot-dimension-pages.mjs`. Тот съёмщик выбирает
 * случаи по ЧИСЛУ ГОЛОСОВ (0 · 1 · ≥3) — это правило ПОКАЗА оценок. Здесь нужны случаи по САМОЙ
 * ОЦЕНКЕ (ноль при живых голосах · единица · восьмёрка), и это другая ось. Смешать их в одном
 * приборе значило бы получить набор, который не отвечает ни на один вопрос целиком.
 *
 * 🔑 И ГЛАВНОЕ: он снимает В ДВЕ ПАПКИ — `before` и `after`. Правку витрины принимает владелец
 * глазами, а сравнить он может только пару. Кадр «после» без кадра «до» показывает, ЧТО стало,
 * и молчит о том, ЧТО ИЗМЕНИЛОСЬ.
 *
 * Случаи выбираются УСЛОВИЕМ, а не слагом: контроль, привязанный к записи, умирает вместе с ней
 * (`EXP-0163`). Поставят «Квадробике» пятёрку — прибор возьмёт другой объект того же состояния.
 *
 * Запуск (сначала подними собранный сайт на своём порту):
 *   npx vite preview --port 4173 --strictPort
 *   node tools/shoot-rating-stars.mjs before
 *   node tools/shoot-rating-stars.mjs after
 *
 * Запуск: node tools/shoot-rating-stars.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir, rm } from 'node:fs/promises';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Рецепт гашения стенда — ОДИН на все приборы (`EXP-0181`): маска по командной строке в
// командном режиме бьёт по preview соседней роли, признак «моё» — держатель ПОРТА.
import { killPortRecipe, STAND_PORTS, whoHoldsPortRecipe } from './lib/stand-cleanup.mjs';

const SIDE = process.argv[2];
if (SIDE !== 'before' && SIDE !== 'after') {
  console.error('❌ первым аргументом — `before` или `after` (кадры принимает владелец ПАРОЙ)');
  process.exit(1);
}

const BASE = process.env.NDIM_BASE ?? 'http://localhost:4173';
const PORT = Number(new URL(BASE).port) || STAND_PORTS.preview;
const OUT = resolve('test-results', 'rating-stars', SIDE);

const src = existsSync('src/lib/content/dims-build.json')
  ? 'src/lib/content/dims-build.json'
  : 'src/lib/content/dims-slice.json';
const DIMS = JSON.parse(readFileSync(src, 'utf8'));

const num = (v) => (Number.isFinite(+v) ? +v : 0);

/** Три случая ПРАВИЛА ЗВЁЗД — ровно те, о которых говорил владелец. */
const pick = (test, label) => {
  const d = DIMS.find(test);
  return d ? { slug: d.slug, label: `${label} · ${d.title.ru} · оценка ${d.rating}, голосов ${d.rates}` } : null;
};
const CASES = [
  pick((d) => num(d.rates) >= 1 && num(d.rating) < 1, 'ниже единицы — тяжёлая серая'),
  pick((d) => num(d.rates) >= 1 && Math.round(num(d.rating)) === 1, 'оценка 1'),
  pick((d) => num(d.rates) >= 1 && Math.round(num(d.rating)) === 8, 'оценка 8'),
].filter(Boolean);

/*
 * ЧЕТВЁРТЫЙ КАДР — ХАБ, И ОН ПРО ПАРИТЕТ. Правило звёзд накрывает три поверхности; владелец
 * судит его глазами, а «на хабе так же» словами не доказывается. Берём ту страницу хаба, где
 * реально стоит объект с тяжёлой серой звездой, — тогда одна картинка показывает и хаб, и
 * согласие хаба с карточкой.
 *
 * Адрес НЕ вычисляется формулой пагинации: он ИЩЕТСЯ в собранном сайте по слагу. Формула —
 * второй источник истины, и она разъедется с продуктом при первой правке порядка.
 */
const hubPageFor = (slug) => {
  const root = resolve('build', 'ru', 'catalog');
  if (!existsSync(root)) return null;
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(resolve(dir, e.name)) : e.name.endsWith('.html') ? [resolve(dir, e.name)] : [],
    );
  for (const file of walk(root)) {
    if (!readFileSync(file, 'utf8').includes(`/ru/dimension/${slug}"`)) continue;
    const rel = file.slice(resolve('build').length + 1).replace(/\\/g, '/').replace(/\.html$/, '');
    return `/${rel}`;
  }
  return null;
};

if (CASES.length < 3) {
  console.error(`❌ в каталоге нашлось только ${CASES.length} случая из трёх — снимать пару неполной нельзя`);
  console.error('   Источник: ' + src + (src.endsWith('slice.json') ? ' (запасной срез — нужен полный каталог)' : ''));
  process.exit(1);
}

/*
 * 🔴 ПРЕДПОЛЁТНАЯ ПРОВЕРКА: сервер отдаёт ИМЕННО ЭТУ сборку, а не пережившую гашение старую.
 * Осиротевший preview со старой сборкой даёт кадры, которые врут (`EXP-0091`), а в командном
 * режиме он может быть ещё и ЧУЖИМ — сборкой соседней роли.
 */
{
  const file = resolve('build', 'ru', 'dimension', `${CASES[0].slug}.html`);
  if (!existsSync(file)) {
    console.error(`❌ нет ${file} — сначала \`npm run build\``);
    process.exit(1);
  }
  const css = readFileSync(file, 'utf8').match(/_app\/immutable\/assets\/[^"']+\.css/)?.[0];
  if (css) {
    const res = await fetch(`${BASE}/${css}`).catch(() => null);
    if (!res || !res.ok) {
      console.error(`❌ сервер на ${BASE} НЕ отдаёт таблицу стилей этой сборки (${res?.status ?? 'нет ответа'}).`);
      console.error('   Это переживший гашение (возможно, ЧУЖОЙ) preview. Гаси держателя порта по PID:');
      console.error(`   ${whoHoldsPortRecipe(PORT)}`);
      console.error(`   ${killPortRecipe(PORT)}`);
      process.exit(1);
    }
  }
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
let shots = 0;
const problems = [];
/** Что реально нарисовано — печатается рядом с кадром, чтобы отчёт не пересказывал картинку. */
const seen = [];

for (const width of [390, 1440]) {
  for (const theme of ['light', 'dark']) {
    // Тема ставится ДО загрузки: скрипт `app.html` читает её первым кадром.
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
    await page.addInitScript((t) => localStorage.setItem('ndim-theme', t), theme);

    /** Что снимаем: три карточки правила + страница хаба для паритета. */
    const targets = CASES.map((c) => ({ ...c, path: `/ru/dimension/${c.slug}`, row: null }));
    // Кадр паритета: страница хаба, где стоит объект с тяжёлой серой звездой.
    const hubPath = hubPageFor(CASES[0].slug);
    if (hubPath) {
      targets.push({
        slug: 'hub-' + hubPath.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, ''),
        label: `ПАРИТЕТ: хаб ${hubPath} со строкой «${CASES[0].slug}»`,
        path: hubPath,
        // На хабе десятки строк; мерить цвета «по всей странице» бессмысленно — меряем РОВНО ту
        // строку, ради которой кадр и снят.
        row: `a.row[href="/ru/dimension/${CASES[0].slug}"] .stars i`,
      });
    }

    for (const c of targets) {
      const url = `${BASE}${c.path}`;
      const res = await page.goto(url, { waitUntil: 'networkidle' });
      if (!res || res.status() !== 200) problems.push(`${url} → HTTP ${res?.status()}`);
      // Кадр — весь блок оценки целиком, а не только звёзды: владелец судит СТРОКУ.
      await page.screenshot({ path: resolve(OUT, `${width}-${theme}-${c.slug}.png`), fullPage: true });
      shots += 1;
      if (width === 390 && theme === 'light') {
        const stars = await page.locator(c.row ?? '.stars i').all();
        const colors = [];
        for (const s of stars) colors.push(await s.evaluate((el) => getComputedStyle(el).color));
        seen.push(`${c.label} → звёзд ${stars.length}, цвета: ${[...new Set(colors)].join(' | ') || '—'}`);
      }
    }
    await page.close();
  }
}

await browser.close();
console.log(`Снято ${shots} кадров → ${OUT}`);
for (const s of seen) console.log(`  ℹ ${s}`);
if (problems.length) {
  console.log('\n❌ ПРОБЛЕМЫ:');
  for (const p of problems) console.log(`   ${p}`);
  process.exit(1);
}
console.log('✅ все страницы отдались с кодом 200');

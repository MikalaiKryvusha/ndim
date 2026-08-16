#!/usr/bin/env node
/**
 * СТРАЖ ХАБОВ КАТАЛОГА — `plans/48` шаг 6 (фаза 2 эпика 40 «Архитектура веса»).
 *
 * Что охраняет и почему это не роскошь: **180 хабов уже в бою** (замер сегодня: sitemap несёт
 * 10 432 адреса, из них 180 хабовых) и до этого прибора не стереглись ничем. Именно хабы держат
 * главное число фазы — «недостижимых страниц каталога 0» и «карточка в 3 клика»: сломается
 * пагинация или пропадёт хаб — и 10 222 карточки снова станут недостижимыми, молча.
 *
 * Судит СОБРАННЫЙ САЙТ (`build/`), сервера не поднимает.
 * Запуск:  npm run build ; node tools/verify-catalog-hubs.mjs
 *
 * 🔴 Инварианты, которые здесь нельзя ослаблять (интервью №025 В7, №022):
 *   · блок соседства разрешён ТОЛЬКО по классификации — ни числа похожести, ни «Рядом в
 *     Пространстве» (это про людей и про математику, наружу не выходит);
 *   · на публичной странице нет данных человека;
 *   · пагинация полная и БЕЗ ДЫР — страница, на которую ведёт ссылка, обязана существовать.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BUILD = 'build';
const LANGS = ['ru', 'en'];
/** Порог хаба по замыслу фазы: вид с меньшим числом объектов уезжает в индекс каталога. */
const MIN_CARDS = 20;

let failed = 0;
let passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (!existsSync(BUILD)) {
  console.error('❌ нет каталога build/ — сначала `npm run build`');
  process.exit(1);
}

const visible = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Что запрещено на публичной странице каталога — по решениям владельца, а не по вкусу. */
const FORBIDDEN = [
  [/\d+\s*%/, 'число процента (метрика похожести наружу не выходит)'],
  [/похожест/i, 'слово «похожесть»'],
  [/similarity/i, 'слово similarity'],
  [/Рядом в Пространстве|Near in the Space/i, 'запрещённая формулировка «Рядом в Пространстве»'],
];
const LEAKS = [
  [/[\w.+-]+@[\w-]+\.[a-z]{2,}/i, 'адрес почты'],
  [/"uid"\s*:/, 'поле uid'],
  [/\/points\//, 'путь к приватным оценкам'],
];

for (const lang of LANGS) {
  console.log(`\n═══ ${lang.toUpperCase()} ═══`);

  // ── Индекс каталога: он и есть корень достижимости ─────────────────────────
  const indexFile = join(BUILD, lang, 'catalog.html');
  if (!existsSync(indexFile)) {
    check(`индекс каталога /${lang}/catalog собран`, false, indexFile);
    continue;
  }
  const indexHtml = readFileSync(indexFile, 'utf8');
  const hubKinds = [
    ...new Set(
      [...indexHtml.matchAll(new RegExp(`href="/${lang}/catalog/([a-z0-9-]+)"`, 'g'))].map((m) => m[1]),
    ),
  ];
  check(`индекс каталога /${lang}/catalog собран`, true, `${indexHtml.length} байт`);
  check('индекс ведёт хотя бы в 5 хабов', hubKinds.length >= 5, `хабов: ${hubKinds.length} (${hubKinds.join(', ')})`);

  for (const kind of hubKinds) {
    const first = join(BUILD, lang, 'catalog', `${kind}.html`);
    if (!existsSync(first)) {
      check(`хаб ${kind}: страница 1 собрана`, false, first);
      continue;
    }
    const html = readFileSync(first, 'utf8');
    const text = visible(html);

    // Карточек на странице — считаем по ССЫЛКАМ В КАРТОЧКИ, а не по вёрстке: класс строки
    // может смениться при правке макета, а ссылка на карточку — это сам смысл хаба.
    const cards = (html.match(new RegExp(`href="/${lang}/dimension/`, 'g')) ?? []).length;
    check(`хаб ${kind}: карточек не меньше ${MIN_CARDS}`, cards >= MIN_CARDS, `их ${cards}`);

    // hreflang с самоссылкой — без неё разметка игнорируется поиском целиком.
    const missing = LANGS.filter(
      (l) => !html.includes(`hreflang="${l}" href="https://ndimspace.app/${l}/catalog/${kind}"`),
    );
    check(`хаб ${kind}: hreflang двусторонний с самоссылкой`, missing.length === 0,
      missing.length ? `нет: ${missing.join(', ')}` : '');

    const bad = FORBIDDEN.filter(([re]) => re.test(text)).map(([, what]) => what);
    check(`хаб ${kind}: ни одного числа похожести и запретной формулировки`, bad.length === 0, bad.join(' · '));

    const leaks = LEAKS.filter(([re]) => re.test(html)).map(([, what]) => what);
    check(`хаб ${kind}: нет данных человека`, leaks.length === 0, leaks.join(' · '));

    /*
     * ПАГИНАЦИЯ БЕЗ ДЫР. Берём номера страниц, НА КОТОРЫЕ ВЕДЁТ САМА СТРАНИЦА, и требуем, чтобы
     * каждый существовал файлом. Это ловит настоящий симптом: ссылка есть — страницы нет, то есть
     * человек и робот упираются в 404 посреди обхода, а карточки за этой дырой становятся
     * недостижимыми (главное число фазы — «недостижимых 0»).
     */
    const pages = [
      ...new Set(
        [...html.matchAll(new RegExp(`href="/${lang}/catalog/${kind}/(\\d+)"`, 'g'))].map((m) => Number(m[1])),
      ),
    ].sort((a, b) => a - b);
    if (pages.length > 0) {
      const dead = pages.filter((n) => !existsSync(join(BUILD, lang, 'catalog', kind, `${n}.html`)));
      check(`хаб ${kind}: все ${pages.length} страниц пагинации существуют`, dead.length === 0,
        dead.length ? `нет файлов для страниц: ${dead.join(', ')}` : `до страницы ${pages[pages.length - 1]}`);
      // Дыра в НУМЕРАЦИИ: 1,2,4 — это потерянная третья, а не «просто меньше ссылок».
      const expected = Array.from({ length: pages[pages.length - 1] - 1 }, (_, i) => i + 2);
      const gaps = expected.filter((n) => !pages.includes(n));
      check(`хаб ${kind}: в нумерации страниц нет дыр`, gaps.length === 0, gaps.length ? `пропущены: ${gaps.join(', ')}` : '');
    }
  }
}

// ── Вес клиентского бандла: каталог не должен уехать в браузер (`EXP-0136`) ──
console.log('\n— каталог НЕ уехал в браузер —');
{
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
    );
  const appDir = join(BUILD, '_app');
  const mb = existsSync(appDir) ? walk(appDir).reduce((s, f) => s + statSync(f).size, 0) / 1048576 : 0;
  check('клиентский бандл меньше 3 МБ', mb < 3, `${mb.toFixed(1)} МБ`);
}

console.log(`\n${failed ? '🔴' : '✅'} ИТОГ: ${passed} прошло, ${failed} провалов\n`);
process.exit(failed ? 1 : 0);

#!/usr/bin/env node
/**
 * СТРАЖ ЯЗЫКОВЫХ АДРЕСОВ — ворота шага 2–4 плана `plans/39` (фазы 6–7 эпика `plans/24`).
 *
 * Судит СОБРАННЫЙ сайт (`build/`) и `firebase.json` — то, что реально уедет на хостинг.
 * Исходники здесь ни при чём: пара `/ru/… ↔ /en/…` и 301 существуют только в артефакте.
 *
 * Что охраняется:
 *   1. У КАЖДОЙ публичной страницы есть двойник на другом языке (build/ru/** ↔ build/en/**).
 *   2. На каждой публичной паре — двусторонний hreflang С САМОССЫЛКОЙ и `x-default`
 *      («Each language version must list itself» — Google; без самоссылки разметка
 *      игнорируется ЦЕЛИКОМ, researches/26 §4.1), и canonical на СВОЙ адрес.
 *   3. Личные экраны языковых адресов НЕ получили и остались под `noindex` —
 *      иначе языковой переезд открыл бы поиску то, что закрыто по приватности.
 *   4. Корень — распознаватель: `noindex`, уводит скриптом, контента лендинга НЕ несёт,
 *      в карте сайта НЕ числится (интервью №010, Р5 = В).
 *   5. Карта сайта: ровно 22 языковых адреса статики + каталог, ни одного старого голого.
 *   6. `firebase.json`: 301 на каждый из 10 старых адресов, ПОИМЁННО; маски `/menu/:rest*`
 *      на цели landing НЕТ (она задела бы личный экран `/menu` — `plans/39`, шаг 3).
 *   7. Старых плоских страниц в build/ не осталось (файл перекрыл бы смысл переезда дублем).
 *
 * ⚠️ КОНТРОЛЬ ПРИБОРА (EXP-0082) стоит первым: почти все проверки ниже — «чего-то нет»,
 * а отрицательная проверка зеленеет от чего угодно (не та папка, опечатка в пути).
 *
 * Запуск:  node tools/verify-lang-addresses.mjs        (нужен свежий `npm run build`)
 * Выход:   0 — чисто; 1 — есть провалы.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BUILD = 'build';
const SITE = 'https://ndimspace.app';

/** Хвосты публичных адресов (без языка): '' — сам лендинг. Тот же список, что в sitemap. */
const STATIC_TAILS = [
  '',
  '/delete-account',
  '/menu/manual',
  '/menu/terms',
  '/menu/privacy',
  '/menu/disclaimer',
  '/menu/about',
  '/menu/author',
  '/menu/support',
  '/menu/donate',
  '/menu/share',
];
const LANGS = ['ru', 'en'];
const X_DEFAULT = 'en';

/** Личные экраны: остаются на голых адресах под noindex, языковых двойников НЕ имеют. */
const PRIVATE_SCREENS = ['profile', 'relations', 'dims', 'space', 'account', 'menu', 'admin'];

let failed = 0;
let passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Файл страницы в build: '' → ru.html, '/menu/terms' → ru/menu/terms.html. */
const pageFile = (lang, tail) => join(BUILD, ...(tail === '' ? [`${lang}.html`] : [lang, ...tail.slice(1).split('/').slice(0, -1), `${tail.split('/').at(-1)}.html`]));

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);

// ── КОНТРОЛЬ ПРИБОРА ─────────────────────────────────────────────────────────
console.log('\n— контроль прибора —');
check('build/ существует (сначала npm run build)', existsSync(BUILD));
const sitemap = read(join(BUILD, 'sitemap.xml')) ?? '';
check('карта сайта прочитана', sitemap.includes('<urlset'), join(BUILD, 'sitemap.xml'));
const fb = read('firebase.json');
check('firebase.json прочитан', fb !== null);
const ruLanding = read(pageFile('ru', ''));
check('русский лендинг собран и НЕ пуст', ruLanding !== null && ruLanding.length > 10_000, pageFile('ru', ''));
const enLanding = read(pageFile('en', ''));
check('английский лендинг собран и НЕ пуст', enLanding !== null && enLanding.length > 10_000);
check('охраняемый маркер жив: hreflang в принципе встречается в сборке',
  (ruLanding ?? '').includes('hreflang'));

// ── 1–2. Пары и hreflang/canonical на каждой ─────────────────────────────────
console.log('\n— каждая публичная страница: пара, hreflang с самоссылкой, canonical —');
for (const tail of STATIC_TAILS) {
  const missing = LANGS.filter((l) => !existsSync(pageFile(l, tail)));
  check(`«${tail || '/'}» собран на всех языках`, missing.length === 0,
    missing.length === 0 ? LANGS.map((l) => `/${l}${tail}`).join(' · ') : `нет: ${missing.join(', ')}`);
  if (missing.length > 0) continue;

  for (const l of LANGS) {
    const html = read(pageFile(l, tail)) ?? '';
    const self = `${SITE}/${l}${tail}`;
    const problems = [];
    if (!html.includes(`<link rel="canonical" href="${self}"`)) problems.push('canonical не на свой адрес');
    for (const other of LANGS) {
      if (!new RegExp(`hreflang="${other}"[^>]*href="${SITE}/${other}${tail.replaceAll('/', '\\/')}"`).test(html) &&
          !new RegExp(`href="${SITE}/${other}${tail.replaceAll('/', '\\/')}"[^>]*hreflang="${other}"`).test(html)) {
        problems.push(`нет hreflang=${other}`);
      }
    }
    if (!html.includes('hreflang="x-default"')) problems.push('нет x-default');
    if (!new RegExp(`hreflang="x-default"[^>]*href="${SITE}/${X_DEFAULT}${tail.replaceAll('/', '\\/')}"`).test(html) &&
        !new RegExp(`href="${SITE}/${X_DEFAULT}${tail.replaceAll('/', '\\/')}"[^>]*hreflang="x-default"`).test(html)) {
      problems.push('x-default не на английский');
    }
    check(`  /${l}${tail || ''}: canonical + hreflang полные`, problems.length === 0, problems.join(' · '));
  }
}

// ── 3. Личные экраны не переехали и закрыты ──────────────────────────────────
console.log('\n— личные экраны: без языковых адресов, под noindex —');
for (const screen of PRIVATE_SCREENS) {
  const leaked = LANGS.filter((l) => existsSync(join(BUILD, l, `${screen}.html`)));
  check(`/${screen} НЕ получил языковых адресов`, leaked.length === 0,
    leaked.length ? `утёк: ${leaked.map((l) => `/${l}/${screen}`).join(', ')}` : '');
  const html = read(join(BUILD, `${screen}.html`));
  check(`/${screen} на месте и под noindex`, html !== null && html.includes('noindex'));
}

// ── 4. Корень — распознаватель ───────────────────────────────────────────────
console.log('\n— корень: распознаватель, а не страница —');
{
  const root = read(join(BUILD, 'index.html')) ?? '';
  check('корень под noindex', root.includes('name="robots"') && root.includes('noindex'));
  check('корень уводит скриптом (location.replace)', root.includes('location.replace'));
  check('корень разбирает письмо входа (oobCode → /profile)',
    root.includes('oobCode') && root.includes("'/profile'"));
  // Лендинг узнаём по заголовку — обе языковые версии не должны быть запечены в корне.
  check('контента лендинга в корне НЕТ',
    !root.includes('Добро пожаловать в') && !root.includes('Welcome to the'));
  check('корня нет в карте сайта', !sitemap.includes(`<loc>${SITE}/</loc>`));
}

// ── 5. Карта сайта ───────────────────────────────────────────────────────────
console.log('\n— карта сайта —');
{
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const expected = LANGS.flatMap((l) => STATIC_TAILS.map((t) => `${SITE}/${l}${t}`));
  const missing = expected.filter((u) => !locs.includes(u));
  check(`все ${expected.length} языковых адреса статики в карте`, missing.length === 0,
    missing.length ? `нет: ${missing.slice(0, 3).join(', ')}…` : `${expected.length} из ${expected.length}`);
  const bare = STATIC_TAILS.filter((t) => t !== '' && locs.includes(`${SITE}${t}`));
  check('старых голых адресов в карте нет', bare.length === 0, bare.join(', '));
  check('карта не похудела против каталога', locs.length >= 10_000, `${locs.length} адресов`);
}

// ── 6. firebase.json: 301 поимённо, маски нет ────────────────────────────────
console.log('\n— firebase.json: 301 поимённо —');
{
  const conf = JSON.parse(fb ?? '{}');
  const landing = (conf.hosting ?? []).find((h) => h.target === 'landing') ?? {};
  const redirects = landing.redirects ?? [];
  const oldPaths = STATIC_TAILS.filter((t) => t !== '');
  for (const tail of oldPaths) {
    const rule = redirects.find((r) => r.source === tail);
    check(`301: ${tail} → /ru${tail}`,
      rule !== undefined && rule.destination === `/ru${tail}` && rule.type === 301,
      rule ? `${rule.destination} (${rule.type})` : 'правила нет');
  }
  check('⛔ маски /menu/:rest* на цели landing НЕТ (задела бы личный /menu)',
    !redirects.some((r) => String(r.source).includes(':rest')));
  check('корень / НЕ переадресуется (он распознаватель)',
    !redirects.some((r) => r.source === '/'));
}

// ── 7. Старых плоских страниц в build не осталось ────────────────────────────
console.log('\n— старых плоских страниц в build нет —');
{
  const leftovers = STATIC_TAILS.filter((t) => t !== '')
    .map((t) => join(BUILD, ...t.slice(1).split('/').slice(0, -1), `${t.split('/').at(-1)}.html`))
    .filter((p) => existsSync(p));
  check('плоские дубли не собираются', leftovers.length === 0, leftovers.join(' · '));
}

// ── Итог ─────────────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'} проверок ${passed + failed} · провалов ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);

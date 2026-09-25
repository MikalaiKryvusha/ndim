/**
 * ПРАВДИВЫЙ `<lastmod>` КАРТЫ САЙТА — реестр отпечатков значимого содержания собранной страницы
 * (`plans/NEW_sitemap_truthful_lastmod.md`, FORK Б — решение Менеджера 2026-09-25).
 *
 * Google: «*uses the `<lastmod>` value if it's consistently and verifiably … accurate*» и «*should reflect the date and
 * time of the last significant update to the page*»; значимо — «*the main content, the structured data, or links*»,
 * а «*copyright date*» — нет. sitemaps.org: «*the date the linked page was last modified, not when the sitemap is
 * generated*». Источники дат в данных (поле записи `time.updated`, `updateTime` документа, коммит общего файла текста)
 * замером 2026-09-25 оказались лживыми или шумными; правда видна только на СОБРАННОЙ странице.
 *
 * КАК РАБОТАЕТ. У каждого адреса карты — отпечаток значимого содержания его HTML из `build/`. Реестр
 * `{ rules, pages: { адрес: { fp, lastmod } } }` кладётся рядом с картой (`build/sitemap-lastmod.json`) и уезжает на
 * контур. Следующий выкат читает реестр ТОГО контура, куда катит:
 *   · отпечаток прежний — дата прежняя (в том числе «нет даты»);
 *   · отпечаток другой или адрес новый — дата = момент выката;
 *   · реестр не прочитался (404, сеть, чужая форма, другие правила отпечатка) — карта БЕЗ `lastmod` целиком, реестр
 *     только отпечатками. Никогда «всем сегодня».
 * Первый выкат — без засева (решение Менеджера): дат нет ни у кого, они появляются у страниц, чьё содержание менялось.
 *
 * ЧТО ВХОДИТ В ОТПЕЧАТОК: `<title>` · `<meta name="description">` · `<link rel="canonical|alternate">` (адрес и
 * hreflang) · содержимое каждого `application/ld+json` · видимый текст `<body>` · адреса всех `<a href>`.
 *
 * ЧТО ИСКЛЮЧЕНО КАК СЛУЖЕБНОЕ — меняется без смысла, и пересборка без правок обязана дать тот же отпечаток:
 *   1. все прочие `<script>` — там `__sveltekit_<хеш>` сборки и адреса чанков;
 *   2. `<style>` и все атрибуты разметки — классы Svelte (`svelte-<хеш>`) меняются от правки стилей;
 *   3. `<link>` кроме canonical/alternate — чанки `_app/immutable/*` с хешами, иконки, манифест;
 *   4. HTML-комментарии — маркеры гидратации `<!--[-->`, `<!---->`;
 *   5. живые числа Пространства — `<ul class="nums …">`: витрина главной (`LandingV1.svelte`, снимок
 *      `landing-metric.ts`) и блок «Друзья по интересам» «Теста на совместимость» (`test/[slug]/+page.svelte`, снимок
 *      `PUBLIC_PEOPLE_SNAPSHOT`, V4). Меняются на каждом боевом выкате без правки страницы;
 *   6. виджет версий — `<div class="vers …">` (`src/lib/ui/Versions.svelte` на `/menu/about`: номер и время сборки
 *      «Приложение 2.2 (2195) Собрано … в 22:44», версия сервера синхронизации). Меняется на КАЖДОЙ сборке — найдено
 *      прогоном 2026-09-25 22:41–22:45 (`qa/reports/2026-09-25_sitemap-lastmod.driver.mjs`, ЛМ-02: две сборки без правок
 *      дали разный отпечаток ровно у `/ru/menu/about` и `/en/menu/about`);
 *   7. год копирайта `© 2026` — Google прямо называет его незначимым (на страницах карты его сегодня нет — правило на
 *      будущее);
 *   8. пробелы — схлопываются; сущности `&nbsp;` · `&amp;` и числовые — раскрываются.
 * Элементы 5 и 6 вырезаются по классу со счётом вложенности одноимённых тегов (внутри `.vers` — вложенные `<div>`).
 *
 * ⚠️ `RULES` — версия этих правил. Правка правил меняет отпечатки ВСЕХ страниц без правки содержания; реестр другой версии
 * поэтому читается как «не прочитался» (дат нет в этот выкат), а не как «всё изменилось» (всем сегодня).
 * История версий: v1 → v2 (2026-09-26) — атрибут читается до парной кавычки (`attr`), у страниц с апострофом в описании
 * отпечаток сменился. Цена смены в этот момент — ноль дат: замер 2026-09-26 00:32:29 — реестры боя и стейджа (`v1`) по
 * 10 517 страниц, с датой 0.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const RULES = 'sitemap-lastmod/v2';
export const LEDGER_FILE = 'sitemap-lastmod.json';

const LD_RE = /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const COPYRIGHT_RE = /©\s*\d{4}(?:\s*[–-]\s*\d{4})?/g;
/**
 * Служебные элементы — `[тег, класс, компоненты]` (пункты 5 и 6 шапки). Компоненты названы, потому что пара «класс в
 * компоненте ↔ класс здесь» стережётся юнитом по НАСТОЯЩЕМУ исходнику каждого из них: переименованный класс иначе молча
 * вернёт элемент в отпечаток, и `<lastmod>` сдвинется на каждом выкате.
 */
export const SERVICE = [
  ['ul', 'nums', ['src/lib/ui/landing/LandingV1.svelte', 'src/routes/[lang=lang]/test/[slug]/+page.svelte']],
  ['div', 'vers', ['src/lib/ui/Versions.svelte']],
];

/** Вырезает каждый элемент `<tag class="… token …">` вместе с содержимым, считая вложенные одноимённые теги. */
export function stripByClass(html, tag, token) {
  const open = new RegExp(`<${tag}\\b[^>]*\\bclass\\s*=\\s*["'](?:[^"']*\\s)?${token}(?:\\s[^"']*)?["'][^>]*>`, 'gi');
  const any = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  let out = '';
  let from = 0;
  let m;
  while ((m = open.exec(html)) !== null) {
    any.lastIndex = m.index;
    let depth = 0;
    let end = -1;
    let t;
    while ((t = any.exec(html)) !== null) {
      depth += t[1] ? -1 : 1;
      if (depth === 0) { end = any.lastIndex; break; }
    }
    if (end < 0) break; // незакрытый элемент — не трогаем остаток
    out += `${html.slice(from, m.index)} `;
    from = end;
    open.lastIndex = end;
  }
  return out + html.slice(from);
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
function decode(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z#0-9]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

const squash = (text) => decode(text).replace(/\s+/g, ' ').trim();

/**
 * Значение атрибута ДО ПАРНОЙ кавычки: апостроф внутри двойных кавычек — часть значения (`content="Parkland's …"`).
 * Прежняя форма обрывала значение на первой кавычке любого вида, и правка описания после апострофа не меняла отпечаток
 * (9 из 147 страниц выборки, `/en/dimension/parkland-04jpdbpx`). Имя атрибута — с границей: `data-href` не `href`.
 */
function attr(tag, name) {
  const m = tag.match(new RegExp(`(?<![\\w-])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[1] ?? m[2]) : null;
}

/** Значимое содержание страницы по Google — частями, чтобы юнит и разбор видели, что именно сравнивается. */
export function significantParts(html) {
  const ld = [...html.matchAll(LD_RE)].map((m) => {
    try { return JSON.stringify(JSON.parse(m[1])); } catch { return m[1].trim(); }
  });
  let clean = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, '');
  for (const [tag, token] of SERVICE) clean = stripByClass(clean, tag, token);
  const title = squash(clean.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  const metaTag = [...clean.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]).find((t) => (attr(t, 'name') ?? '').toLowerCase() === 'description');
  const description = metaTag ? squash(attr(metaTag, 'content') ?? '') : '';
  const heads = [...clean.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((t) => /^(canonical|alternate)$/i.test(attr(t, 'rel') ?? ''))
    .map((t) => `${attr(t, 'rel')}|${attr(t, 'hreflang') ?? ''}|${attr(t, 'href') ?? ''}`);
  const body = clean.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? clean;
  const links = [...body.matchAll(/<a\b[^>]*>/gi)].map((m) => attr(m[0], 'href')).filter((h) => h !== null);
  const text = squash(body.replace(/<[^>]+>/g, ' ')).replace(COPYRIGHT_RE, '©');
  return { title, description, heads, ld, links, text };
}

/** Отпечаток значимого содержания: первые 16 знаков sha256 (64 бита — на 10 тыс. страниц совпадений не бывает). */
export function pageFingerprint(html) {
  return createHash('sha256').update(JSON.stringify(significantParts(html))).digest('hex').slice(0, 16);
}

/** Адрес карты → файл пререндера adapter-static: `/` → `index.html`, `/ru` → `ru.html`, `/ru/a/b` → `ru/a/b.html`. */
export function buildFileOf(path) {
  return path === '/' ? 'index.html' : `${path.replace(/^\//, '').replace(/\/$/, '')}.html`;
}

/** Адреса `<loc>` карты — пути без происхождения сайта. */
export function sitemapPaths(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
}

/** Реестр из текста ответа контура — или `null`, если он не наш: чужая форма, другие правила, не JSON. */
export function parseLedger(text) {
  try {
    const j = JSON.parse(text);
    if (j?.rules !== RULES || typeof j.pages !== 'object' || j.pages === null) return null;
    return j;
  } catch {
    return null;
  }
}

/** Момент выката в W3C Datetime с поясом машины: `2026-09-25T22:40:00+03:00`. */
export function w3cNow(date = new Date()) {
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const pad = (n) => String(Math.abs(n)).padStart(2, '0');
  const local = new Date(date.getTime() + off * 60000).toISOString().slice(0, 19);
  return `${local}${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
}

/**
 * Штамп: карта с `<lastmod>` и новый реестр. Чистая функция — вся развилка «прежний / другой / новый / реестра нет»
 * судится юнитом. Прежние `<lastmod>` в карте снимаются: повторный штамп той же сборки даёт тот же результат.
 */
export function stampLastmod({ xml, prev, prints, now }) {
  const pages = {};
  const stats = { pages: 0, dated: 0, kept: 0, changed: 0, added: 0, undated: 0, ledger: prev ? 'прочитан' : 'нет' };
  for (const [path, fp] of Object.entries(prints)) {
    stats.pages += 1;
    let lastmod = null;
    if (prev) {
      const was = prev.pages[path];
      if (!was) { lastmod = now; stats.added += 1; }
      else if (was.fp === fp) { lastmod = was.lastmod ?? null; stats.kept += 1; }
      else { lastmod = now; stats.changed += 1; }
    }
    if (lastmod) stats.dated += 1; else stats.undated += 1;
    pages[path] = { fp, lastmod };
  }
  const bare = xml.replace(/<lastmod>[^<]*<\/lastmod>/g, '');
  const stamped = bare.replace(/<url><loc>([^<]+)<\/loc><\/url>/g, (whole, loc) => {
    const date = pages[new URL(loc).pathname]?.lastmod;
    return date ? `<url><loc>${loc}</loc><lastmod>${date}</lastmod></url>` : whole;
  });
  return { xml: stamped, ledger: { rules: RULES, at: now, pages }, stats };
}

/**
 * Страж штампа: каждая дата в карте не позже момента выката и совпадает с реестром; у страницы с прежним отпечатком
 * дата не сдвинулась. Возвращает список нарушений (пустой — чисто).
 */
export function lastmodViolations({ xml, ledger, prev, now }) {
  const bad = [];
  const nowMs = Date.parse(now);
  for (const m of xml.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/g)) {
    const path = new URL(m[1]).pathname;
    const inMap = m[2] ?? null;
    const entry = ledger.pages[path];
    if (!entry) { bad.push(`${path}: в реестре нет`); continue; }
    if (inMap !== (entry.lastmod ?? null)) bad.push(`${path}: в карте ${inMap}, в реестре ${entry.lastmod}`);
    if (inMap && Date.parse(inMap) > nowMs) bad.push(`${path}: дата ${inMap} позже выката ${now}`);
    const was = prev?.pages[path];
    if (was && was.fp === entry.fp && (was.lastmod ?? null) !== (entry.lastmod ?? null)) bad.push(`${path}: отпечаток прежний, а дата сдвинулась`);
  }
  return bad;
}

/** Реестр контура по сети: `{ ledger, why }`. Любой отказ — `ledger: null` и причина словами. */
export async function readLedger(site, fetchImpl = fetch) {
  try {
    const r = await fetchImpl(`${site}/${LEDGER_FILE}`, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { ledger: null, why: `HTTP ${r.status}` };
    const ledger = parseLedger(await r.text());
    return ledger ? { ledger, why: 'прочитан' } : { ledger: null, why: 'не наш реестр (форма или правила отпечатка другие)' };
  } catch (error) {
    return { ledger: null, why: `сеть: ${error?.message ?? error}` };
  }
}

/**
 * Шаг двери выката: отпечатки собранных страниц карты → реестр контура → штамп `build/sitemap.xml` и новый реестр
 * рядом. Бросает, если страницы карты нет в сборке или страж штампа нашёл нарушение: такую карту не катят.
 * [TESTED: 2026-09-26 00:45 · правила v2 · настоящая сборка, 10461 страница карты, реестр подан локально — драйвер
 *  ЛМ-01…04 9/9 (dev-1): без реестра — без lastmod; пересборка без правок — 0 сменившихся отпечатков; правка одной фразы
 *  — lastmod ровно у /ru/menu/privacy; повторный штамп тот же. Живой контур — прогон Менеджера его дверью 2026-09-25,
 *  на правилах v1: стейдж шаг 1 (реестра нет → карта без lastmod) и шаг 2 (реестр хостинга прочитан, изменилось 0), бой
 *  шаг 1 (реестр создан, дат 0). Стейдж шаг 3 — правка одной страницы → дата ровно у неё на живом контуре — не пройден:
 *  стейдж заперт квотой хостинга. qa/reports/2026-09-25_sitemap-lastmod.md]
 */
export async function stampBuild({ buildDir = 'build', site, now = w3cNow(), fetchImpl = fetch }) {
  const mapFile = join(buildDir, 'sitemap.xml');
  const xml = readFileSync(mapFile, 'utf8');
  const prints = {};
  const missing = [];
  for (const path of sitemapPaths(xml)) {
    const file = join(buildDir, buildFileOf(path));
    if (!existsSync(file)) { missing.push(path); continue; }
    prints[path] = pageFingerprint(readFileSync(file, 'utf8'));
  }
  if (missing.length) throw new Error(`страниц карты нет в сборке: ${missing.length} (${missing.slice(0, 3).join(', ')})`);
  const { ledger: prev, why } = await readLedger(site, fetchImpl);
  const out = stampLastmod({ xml, prev, prints, now });
  const bad = lastmodViolations({ xml: out.xml, ledger: out.ledger, prev, now });
  if (bad.length) throw new Error(`страж штампа: ${bad.length} нарушений — ${bad.slice(0, 3).join(' · ')}`);
  writeFileSync(mapFile, out.xml);
  writeFileSync(join(buildDir, LEDGER_FILE), JSON.stringify(out.ledger));
  return { ...out.stats, why, now };
}

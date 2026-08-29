/**
 * ПРИБОР КАРТЫ ВНУТРЕННИХ ССЫЛОК ПО СОБРАННОМУ САЙТУ — `plans/41`, шаг 1 (эпик `plans/40`, фаза 1).
 *
 * ПРИБОР, НЕ СТРАЖ: он ИЗМЕРЯЕТ граф и записывает базовую линию, а не судит «хорошо/плохо».
 * Вердикты о судьбе каталога — фаза 8 эпика, по критериям, записанным в `plans/41` ЗАРАНЕЕ.
 *
 * Что делает: парсит все `build/**\/*.html`, извлекает внутренние `<a href>`, строит
 * ориентированный граф страниц и печатает + пишет в `researches/34_linkgraph_<дата>.json`:
 *   · число страниц и число сирот (0 входящих) по сегментам (лендинг/каталог/хабы/документы/приложение);
 *   · распределение входящих ссылок;
 *   · глубину от `/` (BFS; недостижимые считаются отдельно — в JSON нет ∞);
 *   · 🆕 глубину от ЯЗЫКОВЫХ ГЛАВНЫХ `/ru` и `/en` — метрика критериев 1 и 3 фазы 2
 *     (`plans/48`). Корень `/` — распознаватель под `noindex`, он в поиске не участвует, и
 *     считать «клики от корня» значит приписывать каждой странице лишний шаг через страницу,
 *     которой в выдаче нет.
 *
 * 🔴 КОНТРОЛЬ ПРИБОРА (`EXP-0082`: пустой граф = ошибка ПРИБОРА, а не «0 ссылок»):
 *   · лендинг `/` обязан показать ≥1 исходящую внутреннюю ссылку;
 *   · первая по алфавиту RU-страница каталога обязана показать известную ФОРМУ набора якорей:
 *     `/` ×1 · `/profile` ×2 · языковой двойник ×1 · ссылка вверх в хаб ×1 · соседи по каталогу ×8.
 *     Форма снята с живой сборки 2026-08-14 (после `plans/48` шага 4); изменится продукт — прибор
 *     упадёт громко, и контроль обновляется осознанно, вместе с причиной. Один раз это уже
 *     случилось и сработало как задумано.
 *   Провал любого контроля — немедленное падение с ненулевым кодом, никаких «частичных» отчётов.
 *
 * Детерминизм: полная сортировка всех списков и ключей; повторный прогон в тот же день даёт
 * байт-в-байт тот же JSON (дата входит в имя файла и в тело).
 *
 * Запуск:  npm run build && node tools/measure-link-graph.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const BUILD = 'build';
const ORIGIN = 'https://ndimspace.app'; // src/lib/site.ts — единая константа боевого домена

if (!existsSync(BUILD)) {
  console.error(`ОШИБКА ПРИБОРА: нет директории ${BUILD}/ — сначала npm run build`);
  process.exit(1);
}

/** Рекурсивный обход build/ за html-файлами (без node_modules-подобных исключений: _app пропускаем). */
function walkHtml(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (relative(BUILD, full) === '_app') continue; // ассеты, не страницы
      out.push(...walkHtml(full));
    } else if (name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

/** Путь файла сборки → канонический адрес страницы. */
function fileToUrl(file) {
  let rel = relative(BUILD, file).replace(/\\/g, '/');
  if (rel === 'index.html') return '/';
  rel = rel.replace(/\.html$/, '');
  if (rel.endsWith('/index')) rel = rel.slice(0, -'/index'.length);
  return '/' + rel;
}

/** Нормализация href со страницы → внутренний адрес или null (внешняя/не-страница). */
function normalizeHref(href, pageUrl) {
  if (!href) return null;
  if (/^(mailto:|tel:|javascript:|data:|#)/i.test(href)) return null;
  let u;
  try {
    u = new URL(href, ORIGIN + pageUrl);
  } catch {
    return null;
  }
  if (u.origin !== ORIGIN) return null; // внешняя
  let p = u.pathname;
  if (p !== '/' && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

/** Сегмент страницы — по адресу. Порядок проверок от частного к общему. */
function segmentOf(url) {
  /*
   * 🔴 ЛЕНДИНГ — ЭТО `/ru` И `/en`, А НЕ КОРЕНЬ (правка 2026-08-22, находка QA).
   * Корень с `plans/39` — распознаватель языка под `noindex`: он ничего не показывает и
   * уводит `location.replace` в первом же кадре. Подписывать его лендингом значило врать в
   * анализе достижимости: узел с нулевым содержимым учитывался как витрина продукта.
   */
  if (/^\/(ru|en)$/.test(url)) return 'лендинг';
  if (url === '/') return 'распознаватель языка';
  if (/^\/(ru|en)\/dimension\//.test(url)) return 'каталог';
  // 🆕 Хабы каталога (`plans/48` шаг 3). Сегмент ДОБАВЛЕН, а не переименован из существующих:
  // прежние ярлыки остаются сравнимыми с базовой линией фазы 1, снятой тем же прибором.
  if (/^\/(ru|en)\/catalog(\/|$)/.test(url)) return 'хабы';
  if (url.startsWith('/menu/')) return 'документы';
  if (url === '/404') return 'служебное';
  return 'приложение';
}

// ── Сбор графа ────────────────────────────────────────────────────────────────────────────────
const files = walkHtml(BUILD);
const pages = files.map(fileToUrl).sort();
const pageSet = new Set(pages);

const HREF_RE = /<a\s[^>]*?href=(?:"([^"]*)"|'([^']*)')/gis;

let anchorsTotal = 0;
const outEdges = new Map(); // страница → Set целей (уникальные, без self)
const brokenTargets = new Map(); // цель вне сборки → число ссылающихся страниц
for (const file of files) {
  const url = fileToUrl(file);
  const html = readFileSync(file, 'utf8');
  const targets = new Set();
  for (const m of html.matchAll(HREF_RE)) {
    anchorsTotal += 1;
    const t = normalizeHref(m[1] ?? m[2], url);
    if (t === null || t === url) continue;
    targets.add(t);
  }
  outEdges.set(url, targets);
  for (const t of targets) {
    if (!pageSet.has(t)) brokenTargets.set(t, (brokenTargets.get(t) ?? 0) + 1);
  }
}

// Входящие: уникальные страницы-источники на цель.
const inDegree = new Map(pages.map((p) => [p, 0]));
for (const [, targets] of outEdges) {
  for (const t of targets) if (inDegree.has(t)) inDegree.set(t, inDegree.get(t) + 1);
}

// ── Контроль прибора (EXP-0082) — прежде любого отчёта ───────────────────────────────────────
const landingOut = outEdges.get('/') ?? new Set();
if (landingOut.size < 1) {
  console.error('ОШИБКА ПРИБОРА: лендинг `/` показал 0 исходящих внутренних ссылок. ' +
    'На живой сборке 2026-08-14 их ≥1 (/profile). Пустой результат = прибор не видит якоря.');
  process.exit(1);
}
const controlPage = pages.find((p) => p.startsWith('/ru/dimension/'));
if (!controlPage) {
  console.error('ОШИБКА ПРИБОРА: в сборке не найдено ни одной страницы /ru/dimension/* — ' +
    'каталог не собран или прибор не так строит адреса.');
  process.exit(1);
}
{
  /*
   * Контроль считает ЯКОРЯ (не уникальные цели) и проверяет ФОРМУ набора, а не поимённый список.
   *
   * 🔄 ОБНОВЛЁН 2026-08-14 ОСОЗНАННО — ровно так, как предписывала шапка этого файла. Прежний
   * контроль пинал поимённый набор из четырёх адресов (`/` · двойник · `/profile` ×2) и упал,
   * когда фаза 2 добавила карточке ссылку вверх на хаб и восемь соседей по классификации
   * (`plans/48` шаг 4). Падение было ПРАВИЛЬНЫМ: продукт изменился, и прибор не дал поверить
   * числам, не разобравшись.
   *
   * Форма вместо списка — потому что поимённый список ломался бы и от смены слага соседа, то есть
   * от изменения ДАННЫХ, а не продукта. Число соседей проверяется, число дверей — тоже.
   */
  const html = readFileSync(join(BUILD, controlPage.slice(1) + '.html'), 'utf8');
  const anchors = [...html.matchAll(HREF_RE)]
    .map((m) => normalizeHref(m[1] ?? m[2], controlPage))
    .filter((t) => t !== null);
  const twin = controlPage.replace('/ru/', '/en/');
  const shape = {
    'корень `/`': anchors.filter((a) => a === '/').length,
    'дверь `/profile`': anchors.filter((a) => a === '/profile').length,
    'языковой двойник': anchors.filter((a) => a === twin).length,
    'вверх, в хаб': anchors.filter((a) => /^\/ru\/catalog\//.test(a)).length,
    'соседи по каталогу': anchors.filter((a) => /^\/ru\/dimension\//.test(a) && a !== controlPage).length,
  };
  /*
   * Соседей проверяем ДИАПАЗОНОМ, а не точкой: отбор даёт восемь, а проход «возврата потерянных»
   * дописывает часть карточек до 9–11 (замер по боевому каталогу: 8 у 4461 · 9 у 560 · 10 у 66 ·
   * 11 у 24). Точное число здесь означало бы, что прибор краснеет от нормальной работы продукта.
   * Ноль соседей — по-прежнему падение: именно этого класса дефект проход и лечит.
   */
  const want = {
    'корень `/`': [1, 1],
    'дверь `/profile`': [2, 2],
    'языковой двойник': [1, 1],
    'вверх, в хаб': [1, 1],
    'соседи по каталогу': [8, 11],
  };
  const bad = Object.keys(want).filter((k) => shape[k] < want[k][0] || shape[k] > want[k][1]);
  if (bad.length) {
    console.error('ОШИБКА ПРИБОРА (или продукт изменился): контрольная страница каталога ' +
      `${controlPage} — расходится ${bad.map((k) => `${k}: ${shape[k]}, ожидалось ${want[k][0]}…${want[k][1]}`).join(' · ')}. ` +
      'Разберись, ЧТО изменилось, прежде чем верить числам.');
    process.exit(1);
  }
}

// ── Метрики ──────────────────────────────────────────────────────────────────────────────────
const segments = {};
for (const p of pages) {
  const s = segmentOf(p);
  segments[s] ??= { страниц: 0, сирот: 0, сироты_примеры: [] };
  segments[s].страниц += 1;
  if (inDegree.get(p) === 0) {
    segments[s].сирот += 1;
    if (segments[s].сироты_примеры.length < 5) segments[s].сироты_примеры.push(p);
  }
}

/*
 * 🆕 МИНИМУМ ВХОДЯЩИХ ПО СЕГМЕНТАМ — метрика критерия 2 фазы 2 (`plans/48`): «≥3 внутренних
 * входящих у КАЖДОЙ страницы каталога». Среднее и распределение на этот вопрос не отвечают:
 * обещание, выполненное «в среднем», не выполнено ни для кого конкретно.
 */
const minIncoming = {};
for (const p of pages) {
  const s = segmentOf(p);
  const n = inDegree.get(p);
  if (!minIncoming[s] || n < minIncoming[s].входящих) minIncoming[s] = { входящих: n, пример: p };
}

const inDistribution = {};
const bucketOf = (n) => (n <= 2 ? String(n) : n <= 5 ? '3–5' : n <= 10 ? '6–10' : n <= 100 ? '11–100' : '>100');
for (const p of pages) {
  const b = bucketOf(inDegree.get(p));
  inDistribution[b] = (inDistribution[b] ?? 0) + 1;
}

/** BFS по внутренним ссылкам от заданного набора корней (у всех корней глубина 0). */
function bfs(roots) {
  const seen = new Map(roots.filter((r) => pageSet.has(r)).map((r) => [r, 0]));
  let frontier = [...seen.keys()];
  while (frontier.length) {
    const next = [];
    for (const p of frontier) {
      for (const t of [...(outEdges.get(p) ?? [])].sort()) {
        if (pageSet.has(t) && !seen.has(t)) {
          seen.set(t, seen.get(p) + 1);
          next.push(t);
        }
      }
    }
    frontier = next;
  }
  return seen;
}

const histOf = (depths) => {
  const hist = {};
  for (const p of pages) {
    const d = depths.has(p) ? String(depths.get(p)) : 'недостижимо';
    hist[d] = (hist[d] ?? 0) + 1;
  }
  return hist;
};

// Глубина от корня `/` — метрика базовой линии фазы 1, сохраняется ради сравнимости прогонов.
const depth = bfs(['/']);
const depthHist = histOf(depth);

/*
 * 🆕 ГЛУБИНА ОТ ЯЗЫКОВЫХ ГЛАВНЫХ — метрика критериев приёмки фазы 2 (`plans/48`, критерии 1 и 3:
 * «недостижимых от `/{lang}` — 0» и «до самой дальней карточки ≤3 кликов»).
 *
 * 🔑 Почему отдельно от корня, а не вместо. Корень `/` — распознаватель языка под `noindex`, он
 * в поиске не участвует (интервью №010, Р5 = В). Считать «клики от корня» — значит приписывать
 * каждой странице лишний шаг через страницу, которой в выдаче нет. Обещание фазы сформулировано
 * от языковой главной, и мерить его надо оттуда же.
 */
const LANG_ROOTS = ['/ru', '/en'];
const depthLang = bfs(LANG_ROOTS);
const depthLangHist = histOf(depthLang);
const unreachableFromLang = pages.filter((p) => !depthLang.has(p));

const topIncoming = pages
  .map((p) => ({ страница: p, входящих: inDegree.get(p) }))
  .sort((a, b) => b.входящих - a.входящих || (a.страница < b.страница ? -1 : 1))
  .slice(0, 10);

const orphansTotal = pages.filter((p) => inDegree.get(p) === 0).length;

const report = {
  прибор: 'tools/measure-link-graph.mjs',
  дата: new Date().toISOString().slice(0, 10),
  сборка: { html_файлов: files.length, страниц: pages.length },
  якорей_всего: anchorsTotal,
  рёбер_уникальных: [...outEdges.values()].reduce((n, s) => n + s.size, 0),
  сирот_всего: orphansTotal,
  сегменты: Object.fromEntries(Object.entries(segments).sort(([a], [b]) => (a < b ? -1 : 1))),
  распределение_входящих: Object.fromEntries(
    Object.entries(inDistribution).sort(([a], [b]) => {
      const order = ['0', '1', '2', '3–5', '6–10', '11–100', '>100'];
      return order.indexOf(a) - order.indexOf(b);
    })
  ),
  глубина_от_корня: Object.fromEntries(
    Object.entries(depthHist).sort(([a], [b]) => {
      if (a === 'недостижимо') return 1;
      if (b === 'недостижимо') return -1;
      return Number(a) - Number(b);
    })
  ),
  глубина_от_языковых_главных: {
    корни: LANG_ROOTS,
    по_кликам: Object.fromEntries(
      Object.entries(depthLangHist).sort(([a], [b]) => {
        if (a === 'недостижимо') return 1;
        if (b === 'недостижимо') return -1;
        return Number(a) - Number(b);
      })
    ),
    недостижимо_всего: unreachableFromLang.length,
    // Список, а не «примеры»: недостижимых должно быть мало, и каждую надо назвать поимённо —
    // усечённый список прячет ровно то, ради чего прибор запускают. Потолок 60 — предохранитель
    // от простыни на случай, если что-то отвалится целым сегментом.
    недостижимо_список: unreachableFromLang.slice(0, 60),
    недостижимо_каталога: unreachableFromLang.filter((p) => segmentOf(p) === 'каталог').length,
  },
  минимум_входящих_по_сегментам: Object.fromEntries(
    Object.entries(minIncoming).sort(([a], [b]) => (a < b ? -1 : 1)),
  ),
  топ_входящих: topIncoming,
  битые_внутренние_цели: {
    всего: brokenTargets.size,
    примеры: [...brokenTargets.keys()].sort().slice(0, 20),
  },
  контроль_прибора: {
    'лендинг ≥1 исходящей': true,
    'каталожная страница — известный набор якорей': true,
    контрольная_страница: controlPage,
  },
  чего_эти_числа_НЕ_доказывают: [
    'Граф статической сборки ≠ то, что видит человек: клиентская навигация и данные после гидратации сюда не входят.',
    'Сирота по внутренним ссылкам ≠ невидимость для робота: sitemap.xml подаёт адреса напрямую (и это сегодня единственная дверь каталога).',
    'Число входящих ≠ вес страницы: прибор считает рёбра, а не PageRank; якорные тексты и позиция ссылки не учитываются.',
    'Один замер — точка, не тренд: сравнивать можно только со следующими прогонами того же прибора.',
  ],
};

const outFile = `researches/34_linkgraph_${report.дата}.json`;
writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(`Страниц: ${report.сборка.страниц} · якорей: ${report.якорей_всего} · сирот: ${report.сирот_всего}`);
for (const [name, s] of Object.entries(report.сегменты)) {
  console.log(`  ${name}: страниц ${s.страниц}, сирот ${s.сирот}`);
}
for (const [name, m] of Object.entries(report.минимум_входящих_по_сегментам)) {
  console.log(`  минимум входящих · ${name}: ${m.входящих} (${m.пример})`);
}
console.log(`Глубина от корня: ${JSON.stringify(report.глубина_от_корня)}`);
const L = report.глубина_от_языковых_главных;
console.log(`Глубина от /ru и /en: ${JSON.stringify(L.по_кликам)}`);
console.log(`Недостижимо от языковых главных: ${L.недостижимо_всего} (из них каталога: ${L.недостижимо_каталога})`);
if (L.недостижимо_всего > 0) {
  console.log(`  ${L.недостижимо_список.join('\n  ')}`);
}
console.log(`Записано: ${outFile}`);

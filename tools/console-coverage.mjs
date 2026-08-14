/**
 * ПРИБОР ПОКРЫТИЯ КОНСОЛЕЙ ПОИСКОВИКОВ — `plans/41`, шаг 2 (эпик `plans/40`, фаза 1).
 *
 * ── AUTH ───────────────────────────────────────────────────────────────────────────────────
 * Работает в УЖЕ АВТОРИЗОВАННОЙ сессии владельца (профиль chrome-debug, CDP 9222) — та же
 * механика и то же разрешение, что `tools/wordstat-harvest.mjs` (слово владельца 2026-08-02:
 * «можно машинерию написать… через хром дебаг? я авторизую»; сегодня: «Браузер твой… работай»).
 *
 * ── ТОЛЬКО ЧТЕНИЕ (капканы чужого аккаунта, `homeworks/09`) ────────────────────────────────
 *   · НИЧЕГО не подаёт и не отправляет; логинов не знает; настроек не меняет;
 *   · ЕДИНСТВЕННЫЙ разрешённый клик — пагинация таблицы запросов GSC, и только под двойным
 *     фильтром: кандидат РОВНО ОДИН и подпись совпадает ТОЧНО («Следующая страница»).
 *     Не нашёлся или нашлось два — клика нет, берём меньше строк и говорим об этом вслух;
 *   · извлечение — из отрендеренного текста отчётов (числа лежат в DOM; слепки разведки —
 *     test-results/console-coverage/). Не скриншоты.
 *
 * ── ЧЕСТНОСТЬ ЧИСЕЛ ────────────────────────────────────────────────────────────────────────
 * Не снялось обязательное поле (консоль перерисовала отчёт) — прибор ПАДАЕТ ГРОМКО с именем
 * поля и подсказкой снять вручную; он никогда не выдумывает и не пишет частичный JSON.
 * Сходимость: сумма причин не-индексации GSC обязана сойтись с её итогом (допуск — округление
 * консоли, 1 %).
 *
 * Выход: `researches/34_coverage_<дата>.json` (+ печать сводки). Раздел-приложение в
 * `researches/34` пишет агент по этому JSON.
 *
 * Запуск:  Chrome с CDP 9222 (профиль chrome-debug, логины консолей живы) →
 *          node tools/console-coverage.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

/** При провале поля прибор сбрасывает текст страницы сюда — по нему чинится пиннинг. */
const DUMP = 'test-results/console-coverage';
mkdirSync(DUMP, { recursive: true });
let lastText = '';
let dumpN = 0;

const CDP = 'http://127.0.0.1:9222';
const RES = 'sc-domain:ndimspace.app';
const SITE = 'https://ndimspace.app';

/** «9,24 тыс.» → 9240 · «10.2K» → 10200 · «9 237» → 9237 · «994» → 994. */
function parseNum(s) {
  if (s == null) return null;
  const t = String(s).replace(/[\s\u00A0\u202F\u2009]/gu, '').replace(/[,;]+$/, '');
  let m = t.match(/^([\d.,]+)тыс\.?$/i);
  if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 1000);
  m = t.match(/^([\d.,]+)K$/i);
  if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 1000);
  m = t.match(/^([\d.,]+)млн$/i);
  if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 1e6);
  if (/^\d+$/.test(t)) return Number(t);
  if (/^[\d,]+$/.test(t) && /,\d{3}(,|$)/.test(t)) return Number(t.replace(/,/g, ''));
  return null;
}

const fails = [];
const need = (name, value) => {
  if (value == null || (Array.isArray(value) && value.length === 0)) {
    fails.push(name);
    dumpN += 1;
    writeFileSync(`${DUMP}/fail-${dumpN}-${name.replace(/[^\wа-яё-]+/gi, '_')}.txt`, lastText, 'utf8');
  }
  return value;
};

const browser = await chromium.connectOverCDP(CDP);
const ctx = browser.contexts()[0];
const page = await ctx.newPage();

async function openAndText(url, waitMs = 12000) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(waitMs);
  lastText = await page.evaluate(() => document.body.innerText);
  return lastText;
}

// ── Google Search Console: индексирование страниц ────────────────────────────────────────────
const gsc = { консоль: 'Google Search Console', ресурс: RES };
{
  const text = await openAndText(
    `https://search.google.com/search-console/index?resource_id=${encodeURIComponent(RES)}`
  );
  gsc.последнее_обновление = need('GSC: дата обновления',
    text.match(/Последнее обновление:\s*([\d.]+)/)?.[1] ?? null);
  gsc.проиндексировано = need('GSC: проиндексировано',
    parseNum(text.match(/Проиндексированные\s*\n\s*([\d\s.,]+(?:тыс\.?|млн)?)/)?.[1]));
  gsc.не_проиндексировано_округлённо = need('GSC: не проиндексировано',
    parseNum(text.match(/Не проиндексировано\s*\n\s*([\d\s.,]+(?:тыс\.?|млн)?)/)?.[1]));
  // Таблица причин: строка «Причина \t Источник … Страницы», затем тройки.
  const reasons = [];
  const reasonRe = /^(.+?)\t(?:Сайт|Системы Google)\t?\s*\n\s*\n?(?:Ошибка|Начато|Н\/Д|—)?\s*\n?\s*(\d[\d\s ]*)$/gm;
  for (const m of text.matchAll(reasonRe)) {
    reasons.push({ причина: m[1].trim(), страниц: parseNum(m[2]) });
  }
  if (reasons.length === 0) {
    // Запасной пиннинг: известные имена причин + ближайшее число строкой ниже.
    for (const name of ['Страница с переадресацией', 'Обнаружена, не проиндексирована',
      'Страница просканирована, но пока не проиндексирована', 'Просканирована, но пока не проиндексирована']) {
      const m = text.match(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + String.raw`[^\d]{0,80}?(\d[\d\s ]*)\s*$`, 'm'));
      if (m) reasons.push({ причина: name, страниц: parseNum(m[1]) });
    }
  }
  gsc.причины_не_индексации = need('GSC: причины', reasons);
  const sum = reasons.reduce((n, r) => n + (r.страниц ?? 0), 0);
  gsc.сумма_причин = sum;
  if (gsc.не_проиндексировано_округлённо != null && sum > 0) {
    const diff = Math.abs(sum - gsc.не_проиндексировано_округлённо) / gsc.не_проиндексировано_округлённо;
    if (diff > 0.01) fails.push(`GSC: сумма причин ${sum} не сходится с итогом ${gsc.не_проиндексировано_округлённо}`);
    gsc.сходимость_суммы = 'в пределах округления консоли';
  }
}

// ── GSC: эффективность (3 месяца) ────────────────────────────────────────────────────────────
{
  const text = await openAndText(
    `https://search.google.com/search-console/performance/search-analytics?resource_id=${encodeURIComponent(RES)}&num_of_months=3`
  );
  gsc.эффективность_3_мес = {
    кликов: need('GSC: клики', parseNum(text.match(/Всего кликов\s*\n\s*([\d\s.,]+(?:тыс\.?)?)/)?.[1])),
    показов: need('GSC: показы', parseNum(text.match(/Всего показов\s*\n\s*([\d\s.,]+(?:тыс\.?)?)/)?.[1])),
    средний_CTR: need('GSC: CTR', text.match(/Средний CTR\s*\n\s*([\d.,]+\s?%)/)?.[1] ?? null),
    средняя_позиция: need('GSC: позиция', text.match(/Средняя позиция\s*\n\s*([\d.,]+)/)?.[1] ?? null),
    запросов_всего: parseNum(text.match(/1–\d+ из ([\d\s]+)/)?.[1]),
  };
  const parseQueryRows = (t) => [...t.matchAll(/^([^\t\n]{2,100})\t(\d+)\t(\d+)$/gm)]
    .map((m) => ({ запрос: m[1].trim(), кликов: Number(m[2]), показов: Number(m[3]) }))
    .filter((r) => !/^(Kлики|Клики|Показы|Дата|Причина)/.test(r.запрос));
  let rows = parseQueryRows(text);
  // Вторая десятка — единственный разрешённый клик, под двойным фильтром.
  try {
    const next = page.getByRole('button', { name: 'Следующая страница', exact: true });
    if ((await next.count()) === 1) {
      await next.click();
      await page.waitForTimeout(5000);
      const text2 = await page.evaluate(() => document.body.innerText);
      const more = parseQueryRows(text2).filter((r) => !rows.some((x) => x.запрос === r.запрос));
      rows = rows.concat(more);
      gsc.эффективность_3_мес.пагинация = 'вторая страница снята (клик «Следующая страница», кандидат один, подпись точная)';
    } else {
      gsc.эффективность_3_мес.пагинация = 'кнопка не одна или не найдена — взята только первая страница';
    }
  } catch {
    gsc.эффективность_3_мес.пагинация = 'клик не удался — взята только первая страница';
  }
  gsc.эффективность_3_мес.топ_запросов = need('GSC: запросы', rows.slice(0, 20));
}

// ── Bing Webmaster ───────────────────────────────────────────────────────────────────────────
const bing = { консоль: 'Bing Webmaster Tools', ресурс: SITE + '/' };
{
  const text = await openAndText(
    `https://www.bing.com/webmasters/sitemaps?siteUrl=${encodeURIComponent(SITE + '/')}`, 10000);
  const row = text.match(/sitemap\.xml[\s\S]{0,200}?Success\s*\n\s*([\d.,]+K?)/);
  bing.обнаружено_в_sitemap = need('Bing: URLs discovered', parseNum(row?.[1]));
  bing.дата_последнего_обхода_sitemap = text.match(/Submitted\s*\n\s*([\d/]+)/) ? null : undefined;
  const crawl = text.match(/Last crawl[\s\S]{0,400}?(\d{1,2}\/\d{1,2}\/\d{4})/);
  bing.последний_обход_sitemap = crawl?.[1] ?? null;
}
{
  const text = await openAndText(
    `https://www.bing.com/webmasters/siteexplorer?siteUrl=${encodeURIComponent(SITE + '/')}`, 10000);
  bing.проиндексировано = need('Bing: indexed',
    parseNum(text.match(/Indexed:\s*(\d[\d\s.,]*)/)?.[1]));
  bing.ошибок = parseNum(text.match(/Error:\s*(\d[\d\s.,]*)/)?.[1]);
  bing.исключено = parseNum(text.match(/Excluded:\s*(\d[\d\s.,]*)/)?.[1]);
}
{
  const text = await openAndText(
    `https://www.bing.com/webmasters/home?siteUrl=${encodeURIComponent(SITE + '/')}`, 10000);
  // Между подписью карточки и числом Bing рисует символ иконочного шрифта из Private Use Area
  // (U+E946) — он НЕ whitespace, `\s*` через него не проходит. Разделитель: пробелы + PUA.
  const SEP = '[\\s\\uE000-\\uF8FF]*?';
  bing.клики_30_дней = need('Bing: клики', parseNum(text.match(new RegExp(`Total Clicks${SEP}(\\d[\\d\\s.,]*)`, 'u'))?.[1]));
  bing.показы_30_дней = need('Bing: показы', parseNum(text.match(new RegExp(`Total Impressions${SEP}(\\d[\\d\\s.,]*)`, 'u'))?.[1]));
}

// ── Яндекс.Вебмастер ─────────────────────────────────────────────────────────────────────────
const ya = { консоль: 'Яндекс.Вебмастер', ресурс: SITE };
{
  const text = await openAndText('https://webmaster.yandex.ru/site/https:ndimspace.app:443/indexing/searchable/', 10000);
  ya.последнее_обновление_поиска = text.match(/(\d{2}\.\d{2}\.\d{4})\s+\d{2}:\d{2}/)?.[1] ?? null;
  ya.добавлено_в_поиск = need('Яндекс: добавлено', parseNum(text.match(/(\d[\d\s]*)\s*\n\s*Добавлено/)?.[1]));
  ya.удалено_из_поиска = need('Яндекс: удалено', parseNum(text.match(/(\d[\d\s]*)\s*\n\s*Удалено/)?.[1]));
  const reasons = {};
  for (const m of text.matchAll(/^(Малоценная или маловостребованная страница|Дубль|Ошибка HTTP|Запрещена в robots\.txt|Редирект|Неканоническая)/gm)) {
    reasons[m[1]] = (reasons[m[1]] ?? 0) + 1;
  }
  ya.причины_удаления_на_видимой_странице = reasons;
  const removedSample = [...text.matchAll(/^\/(?:en|ru)\/dimension\/[a-z0-9-]+$/gm)].map((m) => m[0]);
  ya.примеры_удалённых = removedSample.slice(0, 10);
}
{
  const text = await openAndText('https://webmaster.yandex.ru/site/https:ndimspace.app:443/dashboard/', 10000);
  ya.диагностика = text.match(/Ошибок нет|Есть ошибки|Критичные ошибки/)?.[0] ?? null;
  // Захват не должен переползать перенос строки: выше стоит «…2026\n11 – HTTP-коды 2XX»,
  // и жадный [\d\s] склеивал «2026»+«11» в 202611. Число живёт в НАЧАЛЕ своей строки.
  ya.обход_за_неделю_2xx = parseNum(text.match(/^(\d[\d ]*)\s*–\s*HTTP-коды 2XX/m)?.[1]);
  ya.первая_страница_выдачи = text.match(/([\d.,]+\s?%)\s*\n\s*Показы на первой странице/)?.[1] ?? null;
}

await page.close();
await browser.close();

if (fails.length) {
  console.error('ПРИБОР НЕ СНЯЛ ОБЯЗАТЕЛЬНЫЕ ПОЛЯ (консоль изменила отчёт?):');
  for (const f of fails) console.error('  · ' + f);
  console.error('Числа НЕ выдумываются. Сними вручную по слепкам test-results/console-coverage/ ' +
    'или почини пиннинг и перезапусти.');
  process.exit(1);
}

const date = new Date().toISOString().slice(0, 10);
const report = {
  прибор: 'tools/console-coverage.mjs',
  дата_съёма: date,
  режим: 'только чтение; сессия владельца (chrome-debug, CDP 9222)',
  google: gsc,
  bing,
  яндекс: ya,
  чего_эти_числа_НЕ_доказывают: [
    'Покрытие ≠ трафик: проиндексированная страница может не иметь ни показа.',
    'Причины Google («Обнаружена, не проиндексирована») — самоотчёт чёрного ящика, а не диагноз; они меняются без изменений на сайте.',
    'Один замер — точка, не тренд: сравнивать можно только со следующими съёмами того же прибора.',
    'Числа консолей обновляются с лагом (GSC печатает дату своего среза — она не сегодня).',
    'Яндекс и Bing меряют разными линейками; их числа не складываются с Google.',
  ],
};

const outFile = `researches/34_coverage_${date}.json`;
writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(`GSC: в индексе ${gsc.проиндексировано}, вне ${gsc.не_проиндексировано_округлённо} ` +
  `(сумма причин ${gsc.сумма_причин}) · клики/показы 3 мес: ${gsc.эффективность_3_мес.кликов}/${gsc.эффективность_3_мес.показов}`);
console.log(`Bing: обнаружено ${bing.обнаружено_в_sitemap}, в индексе ${bing.проиндексировано} · клики/показы 30 дн: ${bing.клики_30_дней}/${bing.показы_30_дней}`);
console.log(`Яндекс: добавлено ${ya.добавлено_в_поиск}, удалено ${ya.удалено_из_поиска} · диагностика: ${ya.диагностика}`);
console.log(`Записано: ${outFile}`);

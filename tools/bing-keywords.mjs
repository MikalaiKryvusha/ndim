/**
 * ЗАМЕР АНГЛИЙСКОГО СПРОСА через Bing Webmaster Tools — точные числа, без рекламного аккаунта.
 *
 * ── ПОЧЕМУ BING, А НЕ GOOGLE ───────────────────────────────────────────────────────────────
 * Google Keyword Planner без рекламных трат отдаёт ВИЛКИ («1K–10K»), а Bing Webmaster —
 * точные числа и бесплатно; сайт владельца там подтверждён с 2026-07-11 (`homeworks/04`).
 * Оговорка, которую нельзя замолчать: это доля Bing, а не Google, и она в разы меньше. Нам
 * нужен ПОРЯДОК величин между группами, а не абсолют, — для этого точное число лучше вилки.
 *
 * ── AUTH ───────────────────────────────────────────────────────────────────────────────────
 * Работает в УЖЕ ОТКРЫТОЙ авторизованной сессии владельца (Chrome с портом отладки 9222).
 * Не логинится, паролей не знает.
 *
 * ── КАК УСТРОЕНО (разведка `tools/cdp-discover.mjs` нашла контракт) ─────────────────────────
 * У страницы три полезных эндпоинта:
 *   · POST `keywordresearch/statswithglobalbreakdown` — показы по СТРАНАМ (точные и широкие);
 *   · POST `keywordresearch/relatedkeywords` — родственные запросы с их показами;
 *   · GET  `keywordresearch/topsearchurls` — 🔑 КТО РЕАЛЬНО РАНЖИРУЕТСЯ по запросу.
 * Третий отвечает на вопрос, которого у нас раньше не было вовсе: не «есть ли спрос», а
 * «достижим ли он». Для «find friends» первыми стоят Meetup и Facebook — и это честнее любых
 * рассуждений о конкуренции.
 *
 * POST-ы требуют заголовок `x-csrf-token`. Гадать, где он лежит, не надо: инструмент делает
 * ОДИН поиск через интерфейс, перехватывает токен из живого запроса и дальше зовёт API прямо.
 *
 * Запуск:  node tools/bing-keywords.mjs              # все английские запросы
 *          node tools/bing-keywords.mjs --group A,H  # только выбранные группы
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { chromium } from '@playwright/test';

const SITE = 'https://ndimspace.app/';
const OUT = 'researches/30_demand_en.json';
const argv = process.argv.slice(2);
const GROUPS = argv.includes('--group') ? argv[argv.indexOf('--group') + 1].split(',').map((s) => s.trim()) : null;
/*
 * 🔴 ПАУЗА КАЛИБРУЕТСЯ ПО ЧИСЛУ ОБРАЩЕНИЙ, А НЕ ПО ОЩУЩЕНИЮ «это же API, можно быстрее».
 * Первая редакция стояла на 900 мс — но на КАЖДЫЙ запрос идут ТРИ вызова, вышло ~3 обращения
 * в секунду, и Bing ответил «too many requests». На Вордстате я честно поставил 3,5 с, а здесь
 * позволил себе спешку, потому что вызывал API напрямую. Цена ошибки — шестнадцать испорченных
 * записей и потерянное время.
 */
const PAUSE_MS = Number(argv.includes('--pause') ? argv[argv.indexOf('--pause') + 1] : 4000);
/** По умолчанию берём ТОЛЬКО показы: один вызов вместо трёх. Родственные запросы и выдачу — по флагу. */
const RICH = argv.includes('--rich');

function buildQueries() {
  // `--only "запрос"` — разовая проверка одного запроса (обычно вместе с `--rich`, чтобы увидеть,
  // КТО по нему ранжируется). Список при этом не читается вовсе.
  if (argv.includes('--only')) return [{ group: 'ручной', query: argv[argv.indexOf('--only') + 1] }];
  const src = JSON.parse(readFileSync('tools/search-queries.json', 'utf8'));
  const out = [];
  for (const [group, list] of Object.entries(src.en)) {
    if (GROUPS && !GROUPS.includes(group)) continue;
    for (const q of list) out.push({ group, query: q });
  }
  return out;
}

/**
 * Уже собранное. 🔴 Записи С ОШИБКОЙ считаются НЕ собранными и перезапрашиваются: иначе один
 * период ограничения частоты навсегда оставил бы в данных дыры, замаскированные под результат.
 */
const loadCollected = () => {
  if (!existsSync(OUT)) return {};
  try {
    const all = JSON.parse(readFileSync(OUT, 'utf8')).результаты ?? {};
    for (const [k, v] of Object.entries(all)) if (v?.показов === null || v?.ошибка) delete all[k];
    return all;
  } catch {
    return {};
  }
};
const save = (c) =>
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        _: 'Замер английского спроса через Bing Webmaster Tools (точные числа, доля Bing). Собрано машинерией в авторизованной сессии владельца. «показов» — точные показы, «широких» — с учётом расширений.',
        собрано: Object.keys(c).length,
        результаты: c,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222').catch(() => null);
if (!browser) {
  console.error('❌ Chrome с портом отладки 9222 не найден.');
  process.exit(1);
}
const page = await browser.contexts()[0].newPage();

let csrf = null;
page.on('request', (r) => {
  const t = r.headers()['x-csrf-token'];
  if (t && !csrf) csrf = t;
});

try {
  console.log('🔑 беру токен: один поиск через интерфейс…');
  await page.goto(`https://www.bing.com/webmasters/keywordresearch?siteUrl=${encodeURIComponent(SITE)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForTimeout(7000);
  const box = page.locator('input[placeholder="Enter keyword phrases"]').first();
  if (!(await box.count())) {
    console.error('❌ Поле ввода не найдено. Вошли ли Вы в Bing Webmaster тем аккаунтом, где есть сайт?');
    process.exit(2);
  }
  await box.click();
  await box.fill('find friends');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(8000);

  if (!csrf) {
    console.error('❌ Токен не перехвачен — страница не выполнила POST. Повторите запуск.');
    process.exit(2);
  }
  console.log(`   токен получен.\n`);

  // Период — как у самой страницы: последние ~3 месяца.
  const end = await page.evaluate(() => new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const start = await page.evaluate(() => new Date(Date.now() - 92 * 86400000).toISOString().slice(0, 10) + 'T00:00:00.000Z');

  const queries = buildQueries();
  const collected = loadCollected();
  // `--only` — всегда перезапрашивает: его зовут именно чтобы ПЕРЕСНЯТЬ (обычно с `--rich`).
  const todo = argv.includes('--only') ? queries : queries.filter((q) => !(q.query in collected));
  console.log(`📋 запросов: ${queries.length} · собрано: ${Object.keys(collected).length} · осталось: ${todo.length}\n`);

  for (const { group, query } of todo) {
    const data = await page.evaluate(
      async ({ query, site, csrf, start, end, rich }) => {
        const post = async (path, extra = {}) => {
          const r = await fetch(`https://www.bing.com/webmasters/api/keywordresearch/${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json;charset=UTF-8', 'x-csrf-token': csrf, accept: 'application/json' },
            body: JSON.stringify({ keyword: query, siteUrl: site, StartDate: start, EndDate: end, Country: '', Language: '', Vertical: '', ...extra }),
          });
          return r.ok ? r.json() : { _error: r.status };
        };
        const stats = await post('statswithglobalbreakdown');
        if (!rich) return { stats, related: null, urls: null };
        const related = await post('relatedkeywords', { Pagination: { pageSize: 20, pageNum: 1 } });
        const urlsRes = await fetch(
          `https://www.bing.com/webmasters/api/keywordresearch/topsearchurls?keyword=${encodeURIComponent(query)}&resultCount=10&siteUrl=${encodeURIComponent(site)}`,
          { headers: { accept: 'application/json' } },
        );
        const urls = urlsRes.ok ? await urlsRes.json() : { _error: urlsRes.status };
        return { stats, related, urls };
      },
      { query, site: SITE, csrf, start, end, rich: RICH },
    );

    /*
     * 🔴 РАЗЛИЧАЕМ «СПРОСА НЕТ» И «ЗАПРОС НЕ УДАЛСЯ». Первая редакция этого не делала: при ошибке
     * API поле `GlobalBreakDownData` отсутствует, пустой список складывался в ноль — и сбой молча
     * записывался как «0 показов». Шестнадцать запросов успели уехать в файл нулями, пока Bing
     * отвечал «too many requests». Ноль — это ВЫВОД, и он обязан приходить от сервиса, а не от
     * нашей обработки ошибки.
     */
    const rows = data.stats?.GlobalBreakDownData;
    if (!Array.isArray(rows)) {
      const code = data.stats?._error ?? 'нет данных';
      collected[query] = { группа: group, показов: null, ошибка: String(code) };
      save(collected);
      console.log(`   [${group}] ${query} → ❌ ОШИБКА ${code}`);
      if (String(code) === '429' || String(code).startsWith('4')) {
        console.error(`\n🔴 ОСТАНОВКА: сервис ограничил частоту. Собрано: ${Object.keys(collected).length}.`);
        console.error(`   Подождите и запустите снова — записи с ошибкой будут перезапрошены.`);
        break;
      }
      await page.waitForTimeout(PAUSE_MS);
      continue;
    }
    const exact = rows.reduce((s, r) => s + (Number(r.Impressions) || 0), 0);
    const broad = rows.reduce((s, r) => s + (Number(r.BroadImpressions) || 0), 0);
    const byCountry = rows
      .filter((r) => Number(r.Impressions) > 0)
      .sort((a, b) => b.Impressions - a.Impressions)
      .slice(0, 6)
      .map((r) => ({ страна: r.Country, показов: r.Impressions }));

    collected[query] = {
      группа: group,
      показов: exact,
      широких: broad,
      по_странам: byCountry,
      родственные: (data.related?.KeywordStats ?? [])
        .map((k) => ({ запрос: k.Query ?? k.Keyword ?? null, показов: Number(k.ImpressionCount ?? k.Impressions) || 0 }))
        .filter((k) => k.запрос),
      // Кто уже стоит на этом запросе — честный ответ про достижимость.
      кто_ранжируется: (data.urls?.TopUrls ?? []).slice(0, 5).map((u) => u.Url),
    };
    save(collected);
    console.log(`   [${group}] ${query} → ${exact.toLocaleString('ru-RU')} (широких ${broad.toLocaleString('ru-RU')})`);
    await page.waitForTimeout(PAUSE_MS);
  }

  console.log(`\n✅ собрано: ${Object.keys(collected).length}. Результат: ${OUT}`);
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
}

/**
 * ЗАМЕР СПРОСА ЧЕРЕЗ ЯНДЕКС.ВОРДСТАТ — машинерия вместо ручного ввода (`homeworks/08`, шаг 1).
 *
 * ── AUTH ───────────────────────────────────────────────────────────────────────────────────
 * Прямое слово владельца 2026-08-02: «можно машинерию написать, чтобы она это сделала, через
 * хром дебаг? я авторизую». Инструмент НЕ логинится сам и паролей не знает: он подключается к
 * УЖЕ ОТКРЫТОМУ браузеру владельца по протоколу отладки и работает в его авторизованной сессии.
 *
 * ── ЧЕГО ЭТОТ ИНСТРУМЕНТ НЕ ДЕЛАЕТ ─────────────────────────────────────────────────────────
 *   · не вводит и не хранит учётные данные;
 *   · не жмёт ничего, кроме перехода по адресу поиска;
 *   · не «долбит» сервис: между запросами пауза, как у человека;
 *   · увидев капчу — ОСТАНАВЛИВАЕТСЯ и зовёт человека, а не пытается её обойти.
 *
 * ── ПОЧЕМУ КОДОМ, А НЕ ГЛАЗАМИ АГЕНТА ──────────────────────────────────────────────────────
 * Слово владельца: «это хтмл, можно кодом». Он прав: числа лежат в разметке и в ответах сети.
 * Читать их скриншотами значило бы делать медленно и ненадёжно то, что делается селектором.
 *
 * ЗАПУСК — ДВА РЕЖИМА:
 *
 *   1) РАЗВЕДКА (первым делом, один раз):
 *        node tools/wordstat-harvest.mjs --discover "найти единомышленников"
 *      Открывает один запрос и складывает в scratch ВСЁ, что отдала страница: JSON-ответы сети,
 *      HTML, найденные числа. По этому слепку пиннится извлечение — гадать не приходится.
 *
 *   2) СБОР (после разведки):
 *        node tools/wordstat-harvest.mjs                 # все русские запросы
 *        node tools/wordstat-harvest.mjs --group A,C     # только выбранные группы
 *        node tools/wordstat-harvest.mjs --dims 10       # + шаблоны группы D по каталогу
 *      Результат — `researches/30_demand_ru.json`, ДОПИСЫВАЕТСЯ: уже собранное не перезапрашивается,
 *      прогон можно прервать и продолжить.
 *
 * ПЕРЕД ЗАПУСКОМ владелец открывает Chrome с портом отладки (см. `homeworks/08`).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { readDemandList, groupOf } from './demand-lists.mjs';

const CDP = 'http://127.0.0.1:9222';
const SCRATCH = 'test-results/wordstat';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => argv[argv.indexOf(f) + 1];

/** `--file tools/demand-t3….txt --out researches/34_demand_t3_ru.json` — добор по txt-списку
 *  (plans/41 шаги 0/3); без флагов — прежнее поведение по search-queries.json. */
const FILE = has('--file') ? val('--file') : null;
const OUT = has('--out') ? val('--out') : 'researches/30_demand_ru.json';
const DISCOVER = has('--discover') ? val('--discover') : null;
const GROUPS = has('--group') ? val('--group').split(',').map((s) => s.trim()) : null;
const DIMS = has('--dims') ? Number(val('--dims')) : 0;
/** Пауза между запросами. Человеческий темп — не вежливость, а условие того, что нас не примут за робота. */
const PAUSE_MS = Number(has('--pause') ? val('--pause') : 3500);

const wordstatUrl = (q) =>
  `https://wordstat.yandex.ru/?region=all&view=table&words=${encodeURIComponent(q)}`;

/** Строит список запросов: группы из search-queries.json + шаблоны D по самым оцениваемым измерениям. */
function buildQueries() {
  if (FILE) {
    const group = groupOf(FILE);
    return readDemandList(FILE, 'ru').map((q) => ({ group, query: q }));
  }
  const src = JSON.parse(readFileSync('tools/search-queries.json', 'utf8'));
  const out = [];
  for (const [group, list] of Object.entries(src.ru)) {
    if (GROUPS && !GROUPS.includes(group)) continue;
    for (const q of list) out.push({ group, query: q });
  }
  if (DIMS > 0 && existsSync('src/lib/content/dims-slice.json')) {
    const dims = JSON.parse(readFileSync('src/lib/content/dims-slice.json', 'utf8'));
    const top = [...dims].sort((a, b) => b.rates - a.rates).slice(0, DIMS);
    for (const d of top) {
      const t = d.title.ru || d.title.en;
      for (const tpl of src['d_шаблоны'].ru) out.push({ group: 'D', query: tpl.replace('{t}', t) });
    }
  }
  return out;
}

function loadCollected() {
  if (!existsSync(OUT)) return {};
  try {
    return JSON.parse(readFileSync(OUT, 'utf8')).результаты ?? {};
  } catch {
    return {};
  }
}

function save(collected) {
  const body = {
    _: 'Замер спроса через Яндекс.Вордстат. Собрано машинерией в авторизованной сессии владельца (его разрешение 2026-08-02). Регион — все. Число = показов в месяц по запросу и его уточнениям.',
    собрано: Object.keys(collected).length,
    результаты: collected,
  };
  writeFileSync(OUT, JSON.stringify(body, null, 2) + '\n', 'utf8');
}

/**
 * Различает ТРИ состояния страницы, и различает их точно.
 *
 * 🔴 Первая редакция считала капчей любое вхождение слова «captcha» в HTML — и немедленно соврала:
 * страница ВХОДА Яндекса тянет скрипты капчи как часть своей обычной сборки, слово встретилось
 * 19 раз, инструмент отчитался «сервис просит подтвердить, что Вы не робот», а на деле человек
 * просто не был залогинен. Признак обязан быть узким: адрес и заголовок, а не наличие слова.
 */
function pageState(url, html) {
  const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '').trim();
  if (/passport\.yandex|\/auth\b/i.test(url) || /^Авторизация$|^Authorization$/i.test(title)) {
    return 'нужен вход';
  }
  if (/showcaptcha|checkcaptcha/i.test(url) || /подтвердите, что вы не робот/i.test(html)) {
    return 'капча';
  }
  return 'ок';
}

// ── подключение к УЖЕ ОТКРЫТОМУ браузеру владельца ────────────────────────────────────────
let browser;
try {
  browser = await chromium.connectOverCDP(CDP);
} catch {
  console.error(`❌ Не удалось подключиться к Chrome на ${CDP}.

Владелец, откройте Chrome с портом отладки — одной командой:

  & "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\\Users\\krinik\\chrome-debug"

Затем войдите в Яндекс и откройте wordstat.yandex.ru — дальше всё сделает код.`);
  process.exit(1);
}

const context = browser.contexts()[0] ?? (await browser.newContext());
const page = await context.newPage();

try {
  // ── РЕЖИМ 1: РАЗВЕДКА ───────────────────────────────────────────────────────────────────
  if (DISCOVER) {
    mkdirSync(SCRATCH, { recursive: true });
    const captured = [];
    page.on('response', async (res) => {
      const url = res.url();
      if (!/wordstat|api/i.test(url)) return;
      const ct = res.headers()['content-type'] ?? '';
      if (!ct.includes('json')) return;
      try {
        captured.push({ url, body: await res.json() });
      } catch {
        /* не JSON — не наш случай */
      }
    });

    console.log(`🔎 разведка по запросу «${DISCOVER}» …`);
    // 🔴 НЕ `networkidle`: Вордстат держит соединения открытыми (аналитика, длинные опросы), и
    // ожидание тишины в сети не наступает никогда — первый прогон разведки упал по таймауту
    // ровно на этом. Ждём разметку, потом даём время дорисоваться.
    await page.goto(wordstatUrl(DISCOVER), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6000);

    const html = await page.content();
    writeFileSync(`${SCRATCH}/discover.html`, html, 'utf8');
    writeFileSync(`${SCRATCH}/discover-network.json`, JSON.stringify(captured, null, 2), 'utf8');

    const state = pageState(page.url(), html);
    if (state !== 'ок') {
      console.error(
        state === 'нужен вход'
          ? '🔴 Вордстат требует ВХОДА. Войдите в Яндекс в открытом окне Chrome и повторите — это одно действие, дальше всё сделает код.'
          : '🔴 Сервис просит подтвердить, что Вы не робот. Пройдите проверку в браузере и повторите.',
      );
      console.error(`   (снимок страницы сохранён: ${SCRATCH}/discover.html)`);
      process.exit(2);
    }

    // Числа в разметке: ищем крупные целые с пробелами-разделителями рядом с текстом запроса.
    const numbers = await page.evaluate(() =>
      Array.from(document.querySelectorAll('body *'))
        .filter((el) => el.children.length === 0)
        .map((el) => ({ text: el.textContent.trim(), cls: el.className?.toString().slice(0, 60) }))
        .filter((x) => /^\d[\d\s\u00a0]{2,}$/.test(x.text))
        .slice(0, 40),
    );

    console.log(`\n📄 HTML сохранён: ${SCRATCH}/discover.html (${(html.length / 1024).toFixed(0)} КБ)`);
    console.log(`🌐 JSON-ответов сети поймано: ${captured.length} → ${SCRATCH}/discover-network.json`);
    for (const c of captured) console.log(`   ${c.url.slice(0, 110)}`);
    console.log(`\n🔢 числа, найденные в разметке (первые ${numbers.length}):`);
    for (const n of numbers.slice(0, 15)) console.log(`   «${n.text}»   класс: ${n.cls}`);
    console.log('\nДальше агент пиннит извлечение по этому слепку — гадать не нужно.');
    process.exit(0);
  }

  // ── РЕЖИМ 2: СБОР ───────────────────────────────────────────────────────────────────────
  const queries = buildQueries();
  const collected = loadCollected();
  const todo = queries.filter((q) => !(q.query in collected));

  console.log(`📋 запросов всего: ${queries.length} · уже собрано: ${Object.keys(collected).length} · осталось: ${todo.length}`);
  if (todo.length === 0) {
    console.log('✅ всё уже собрано.');
    process.exit(0);
  }

  let done = 0;
  for (const { group, query } of todo) {
    /*
     * Читаем СОБСТВЕННЫЙ API Вордстата, а не разметку.
     *
     * Разведка нашла эндпоинт `wordstat/api/getTable`, и он отдаёт ровно то, что нужно:
     *   · `totalValue` — показов в месяц по запросу (1181 у «найти единомышленников»);
     *   · `tableData.popular` — 20 НАСТОЯЩИХ запросов людей с их частотностями.
     * Второе — бесплатный подарок: это спрос, снятый с живых людей, а не придуманный агентом.
     *
     * Почему так, а не селектором: разметка меняется при любом редизайне и молча, а контракт
     * API меняется реже и ломается ГРОМКО. Плюс из разметки числа приходят строками с
     * неразрывными пробелами — лишний повод ошибиться.
     */
    const waitTable = page
      .waitForResponse((r) => r.url().includes('/wordstat/api/getTable'), { timeout: 30000 })
      .catch(() => null);

    await page.goto(wordstatUrl(query), { waitUntil: 'domcontentloaded', timeout: 60000 });
    const tableRes = await waitTable;
    await page.waitForTimeout(800);
    const html = await page.content();

    const state = pageState(page.url(), html);
    if (state !== 'ок') {
      console.error(
        state === 'нужен вход'
          ? `\n🔴 ОСТАНОВКА: сессия перестала быть авторизованной. Войдите в Яндекс в окне Chrome.`
          : `\n🔴 ОСТАНОВКА: сервис просит подтвердить, что Вы не робот.`,
      );
      console.error(`   Собрано до остановки: ${done}. Разберитесь в браузере и запустите снова —`);
      console.error(`   инструмент продолжит с того же места (${OUT} дописывается после каждого запроса).`);
      break;
    }

    /*
     * ИЗВЛЕЧЕНИЕ ИЗ API, а не из разметки. Разведка нашла контракт:
     *   · `totalValue` — показов в месяц по запросу (1181 у «найти единомышленников»);
     *   · `table.tableData.popular` — 20 НАСТОЯЩИХ запросов людей с их частотностями.
     * Второе — подарок разведки: это спрос, снятый с живых людей, а не придуманный агентом.
     * Разметка меняется при редизайне молча, контракт API ломается громко — и в разметке
     * числа приходят строками с неразрывными пробелами, то есть лишним поводом ошибиться.
     */
    let apiValue = null;
    let popular = [];
    let invalid = false;
    if (tableRes) {
      try {
        const body = await tableRes.json();
        apiValue = Number(body.totalValue ?? 0) || 0;
        invalid = Boolean(body.table?.isQueryInvalid);
        popular = (body.table?.tableData?.popular ?? [])
          .map((p) => ({ запрос: p.text, показов: Number(p.value) || 0 }))
          .filter((p) => p.запрос);
      } catch {
        /* ответ не разобрался — падаем на разметку, но НЕ выдумываем число */
      }
    }

    // Запасной путь: если API не ответил, читаем разметку. Он хуже и потому второй.
    const domValue = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('body *')).filter((el) => el.children.length === 0);
      const nums = cells
        .map((el) => el.textContent.trim())
        .filter((t) => /^\d[\d\s\u00a0]*$/.test(t))
        .map((t) => Number(t.replace(/[\s\u00a0]/g, '')))
        .filter((n) => Number.isFinite(n));
      return nums.length ? Math.max(...nums) : null;
    });

    const value = apiValue ?? domValue;
    collected[query] = {
      группа: group,
      показов: value,
      источник: apiValue !== null ? 'api' : domValue !== null ? 'разметка' : 'нет',
      ...(invalid ? { некорректный: true } : {}),
      ...(popular.length ? { люди_ищут: popular } : {}),
    };
    save(collected);
    done++;
    const mark = value === null ? 'НЕ РАЗОБРАН' : value.toLocaleString('ru-RU');
    process.stdout.write(`   [${group}] ${query} → ${mark}\n`);
    await page.waitForTimeout(PAUSE_MS);
  }

  console.log(`\n✅ собрано за прогон: ${done}. Всего в файле: ${Object.keys(collected).length}.`);
  console.log(`   Результат: ${OUT}`);
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
}

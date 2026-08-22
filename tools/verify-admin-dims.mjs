/**
 * СТРАЖ КОМНАТЫ «ИЗМЕРЕНИЯ» — `plans/44`, шаг 5 (эпик `ideas/29`, фаза 4).
 *
 * Комната закрывает регресс против 1.x: до неё завести измерение в 2.0 было НЕЛЬЗЯ ВОВСЕ.
 * Заказ владельца 2026-08-17: «*чтобы мы новые хайповые объекты культуры быстро заливали в
 * пространство*».
 *
 * ЧТО СТЕРЕЖЁТ (и почему именно это):
 *   1. граница доступа — не-админ и гость в комнату не попадают (право стоит на трёх ярусах:
 *      правила, дом панели, комната; страж судит крайний — тот, что видит человек);
 *   2. каталог виден и читается ОДНИМ чтением индекса: список непуст и сходится с числом
 *      измерений стенда;
 *   3. создание: документ лёг в базу с названием на оба языка, серверной меткой `time.created`,
 *      нулевой сводкой оценок и БЕЗ легаси-поля `name` (решение владельца В4 = В);
 *   4. 🔴🔴 ГЛАВНОЕ: правка НЕ ОБНУЛЯЕТ сводку оценок. Этот класс не ловят ни правила (ноль
 *      лежит внутри границ шкалы), ни функциональная проверка экрана (звёзды рисуются из тех же
 *      данных, что записали) — его видит только чтение БАЗЫ после правки. Тот же приём, что у
 *      набора Smoke: «вердикт записи снимается с базы И с экрана»;
 *   5. форма отвергает пустое название и НИЧЕГО при этом не пишет — измерение без названия
 *      сервер синхронизации в индекс не берёт, то есть оно стало бы невидимым навсегда;
 *   5б. 🆕 С ЧЕГО КОМНАТА ОТКРЫВАЕТСЯ и что при этом не рисуется (п.10, `bugs/141` и `bugs/140`,
 *      оба нашёл ВЛАДЕЛЕЦ вычиткой в бою): активна вкладка «Очередь», и формы создания на ней
 *      нет ни одного узла. Мимо обоих прошли все проверки этого стража — он ходил по вкладкам
 *      сам и ни разу не спросил, ЧТО человек видит, ничего не нажав;
 *   6. статика собранного раздела: `noindex`, отсутствие в `sitemap.xml`, НИ БАЙТА данных в
 *      пререндеренном HTML и отсутствие модуля комнаты в чанках публичных страниц (`EXP-0136` —
 *      универсальный загрузчик однажды вшил весь каталог, 16,86 МБ, в клиентский бандл, и все
 *      функциональные проверки были при этом ЗЕЛЁНЫМИ).
 *
 * 🧹 УБИРАЕТ ЗА СОБОЙ и уборку ПРОВЕРЯЕТ (правило класса `bugs/103`): база стенда общая для всех
 * стражей, и оставленное измерение сдвинуло бы ожидания соседних прогонов.
 *
 * Запуск: `npm run stand` (эмуляторы + vite dev) → `node tools/verify-admin-dims.mjs`
 *         Статическая часть требует свежего `npm run build`; без него она честно ОБЪЯВЛЯЕТСЯ
 *         пропущенной и НЕ засчитывается зелёной.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
/*
 * Адреса эмуляторов берутся у окружения, литералы остаются умолчанием.
 *
 * 🔴 ПОЧЕМУ ЭТО СДЕЛАНО ЗДЕСЬ И СЕЙЧАС, а не в общем хвосте приборов (`plans/69` фаза 3, где
 * этой правке и место). Живой прогон в браузере — ворота сдачи по канону, а прибор с литеральным
 * 8181 умеет прогоняться ТОЛЬКО на общем стенде слота 0. Слот 0 в этот час держала другая роль
 * по критикал-пас дефекту, и выбор был из трёх: отнять у неё стенд, сдать починку без живого
 * прогона — или научить прибор читать переменную, как уже умеет `PROBE_BASE` строкой выше.
 * Третье честнее двух первых и стоит двух строк. Умолчания прежние: на слоте 0 поведение
 * прибора не изменилось ничем.
 */
const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'}`;
const FS = `http://${process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8181'}`;
const PROJECT = 'demo-ndim-dev';
const DEV_USER = { email: 'dev@ndim.space', password: 'ndim-dev-stand' };
const OUT = 'test-results/admin-dims';

/** Название-метка прогона: по нему страж находит своё измерение и по нему же убирает. */
const MARK = 'Проба стража комнаты';
const MARK_EN = 'Dims room guard probe';

mkdirSync(OUT, { recursive: true });

let pass = 0;
const fails = [];
const skipped = [];
function check(ok, what, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ✅ ${what}`);
  } else {
    fails.push(`${what}${detail ? ' — ' + detail : ''}`);
    console.log(`  ❌ ${what}${detail ? ' — ' + detail : ''}`);
  }
}
function skip(what, why) {
  skipped.push(`${what} — ${why}`);
  console.log(`  ⏭ ПРОПУЩЕНО: ${what} — ${why}`);
}

// ── Работа с базой стенда напрямую (REST эмулятора) ─────────────────────────────────────────
// ⚠️ Эмулятор отдаёт REST ЧЕРЕЗ ПРАВИЛА, поэтому читаем с `Authorization: Bearer owner` —
// иначе 403 читался бы как «документа нет» (капкан, названный в реестре стенда).
const docsUrl = `${FS}/v1/projects/${PROJECT}/databases/(default)/documents`;
const owner = { Authorization: 'Bearer owner' };

async function listDims() {
  const out = [];
  let pageToken = '';
  for (;;) {
    const url = `${docsUrl}/dims?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const body = await fetch(url, { headers: owner }).then((r) => r.json());
    for (const d of body.documents ?? []) out.push(d);
    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }
  return out;
}

/** Находит документ пробы по русскому названию. Возвращает `{ id, fields }` или null. */
async function findProbe() {
  for (const d of await listDims()) {
    const ru = d.fields?.title?.mapValue?.fields?.ru?.stringValue;
    if (ru === MARK || ru === `${MARK} (правлено)`) {
      return { id: d.name.split('/').pop(), fields: d.fields };
    }
  }
  return null;
}

async function deleteDim(id) {
  await fetch(`${docsUrl}/dims/${id}`, { method: 'DELETE', headers: owner });
}

/** Ищет измерение каталога по русскому названию — так проверяется рождение из кандидата. */
async function findDimByTitle(ru) {
  for (const d of await listDims()) {
    if (d.fields?.title?.mapValue?.fields?.ru?.stringValue === ru) {
      return { id: d.name.split('/').pop(), fields: d.fields };
    }
  }
  return null;
}

// ── Очередь кандидатов: свои записи прогона ─────────────────────────────────────────────────
const CAND_ID = 'guard-probe-candidate';
const MARK_CAND = 'Проба очереди стража';
const MARK_CAND_EN = 'Guard queue probe';
let approvedDimId = null;
/** Измерение, рождённое одобрением карточки-похвалы (`bugs/173`). Тоже след прогона. */
let praiseDimId = null;

/** Кладёт кандидата REST'ом эмулятора — так же, как это делает прибор агента через Admin SDK. */
async function putCandidate(id, fields) {
  await fetch(`${docsUrl}/dim_candidates/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...owner },
    body: JSON.stringify({ fields }),
  });
}

async function getCandidate(id) {
  const r = await fetch(`${docsUrl}/dim_candidates/${id}`, { headers: owner });
  return r.ok ? r.json() : null;
}

async function deleteCandidate(id) {
  await fetch(`${docsUrl}/dim_candidates/${id}`, { method: 'DELETE', headers: owner });
}

/** Клейм админа dev-пользователю — идемпотентно, как это делает сид и страж дома. */
async function grantAdmin() {
  const call = (path, body, headers = {}) =>
    fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/${path}?key=demo-api-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }).then((r) => r.json());
  const { localId } = await call('accounts:signInWithPassword', { ...DEV_USER, returnSecureToken: true });
  if (!localId) throw new Error('dev-пользователь не найден — стенд засеян?');
  await call('accounts:update', { localId, customAttributes: JSON.stringify({ admin: true }) }, owner);
}

// ── Статика собранного раздела ──────────────────────────────────────────────────────────────
console.log('Статика (build/):');
{
  const roomHtml = 'build/admin/dims.html';
  if (!existsSync(roomHtml)) {
    skip('п.6: статика раздела', 'нет свежего build/ — прогони `npm run build`');
  } else {
    const html = readFileSync(roomHtml, 'utf8');
    check(/<meta name="robots" content="noindex"/.test(html), 'п.6а: комната несёт noindex');

    const sitemap = readFileSync('build/sitemap.xml', 'utf8');
    check(!/\/admin/.test(sitemap), 'п.6б: раздела /admin нет в sitemap.xml');

    /*
     * Пререндер комнаты обязан быть ПУСТ ПО ДАННЫМ: оболочка публикуется статическим HTML на
     * публичном хосте (принятая цена решения В1 = Б). Слова взяты из данных стенда и боя.
     */
    const forbidden = ['Кошки', 'Таксист', 'kotkrinik', '@ndim.space', '@gmail', 'dims_list', 'Матрица'];
    const leaked = forbidden.filter((w) => html.includes(w));
    check(leaked.length === 0, 'п.6в: в пререндеренном HTML комнаты нет данных', leaked.join(', '));

    /*
     * 🔑 КЛАСС `EXP-0136`: код комнаты не имеет права уехать в чанки публичных страниц — их
     * качают все, а писать в каталог может один человек. Меряем так: находим чанки, несущие
     * маркер комнаты, и убеждаемся, что публичные страницы на них не ссылаются.
     */
    const chunkDir = 'build/_app/immutable';
    const marker = 'Менеджер измерений';
    const carriers = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith('.js') && readFileSync(path, 'utf8').includes(marker)) {
          carriers.push(entry.name);
        }
      }
    };
    if (existsSync(chunkDir)) walk(chunkDir);
    check(carriers.length > 0, 'контроль прибора: маркер комнаты вообще нашёлся в чанках',
      'иначе проверка ниже зелена бессодержательно');

    const publicPages = ['build/ru.html', 'build/en.html'];
    /*
     * ⚠️ Берём именно .html: рядом с каждой страницей каталога лежит ОДНОИМЁННАЯ ПАПКА с
     * `__data.json`, и первая запись каталога — как раз она. Прежняя редакция читала папку как
     * файл и роняла страж ИСКЛЮЧЕНИЕМ вместо провала проверки — класс `EXP-0156`, из-за которого
     * страж однажды молчал две недели.
     */
    if (existsSync('build/ru/dimension')) {
      const page = readdirSync('build/ru/dimension').find((name) => name.endsWith('.html'));
      if (page !== undefined) publicPages.push(`build/ru/dimension/${page}`);
    }
    const guilty = [];
    for (const page of publicPages) {
      if (!existsSync(page)) continue;
      const text = readFileSync(page, 'utf8');
      for (const carrier of carriers) if (text.includes(carrier)) guilty.push(`${page} → ${carrier}`);
    }
    check(guilty.length === 0, 'п.6г: публичные страницы не тянут чанк комнаты (EXP-0136)',
      guilty.join(', '));
  }
}

// ── Живой стенд ─────────────────────────────────────────────────────────────────────────────
const authAlive = await fetch(`${AUTH}/`).then((r) => r.ok).catch(() => false);
const siteAlive = await fetch(BASE).then((r) => r.ok).catch(() => false);
if (!authAlive || !siteAlive) {
  // Адреса печатаются НАСТОЯЩИЕ, а не литералы: сообщение с чужим портом отправляет читателя
  // искать не там, и на слотовом стенде это стоило бы целого захода.
  console.error(`\n❌ Стенд не отвечает (Auth ${AUTH} — ${authAlive ? 'жив' : 'молчит'} · сайт ${BASE} — ${siteAlive ? 'жив' : 'молчит'}). Подними: npm run stand`);
  process.exit(1);
}
await grantAdmin();

const browser = await chromium.launch();
let createdId = null;

/**
 * Ждёт, пока карточка кандидата УЙДЁТ из очереди, и отвечает, дождалась ли.
 *
 * 🔑 Почему ожидание, а не мгновенный счёт. Экран печатает ответ («одобрено», «возвращено») ДО
 * того, как перечитает очередь: `saved` ставится перед `await refresh()`. Проверка сразу после
 * появления ответа — гонка, и она даёт стража-лотерею: зелёного от везения планировщика.
 * Поймано на себе прогоном 2026-08-17 (п.9у покраснела на исправном продукте).
 * Потолок ожидания обязателен: без него «карточка не ушла» превратилось бы в вечное ожидание
 * вместо честного провала.
 */
async function waitGone(page, cardText, timeout = 8000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if ((await page.locator('.cand', { hasText: cardText }).count()) === 0) return true;
    if (Date.now() > deadline) return false;
    await page.waitForTimeout(150);
  }
}

/** Цепочка навигаций главного фрейма — событийно, а не опросом (капкан стража дома). */
function recordNav(page) {
  const chain = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) chain.push(new URL(frame.url()).pathname);
  });
  return chain;
}

try {
  // ── п.1 · граница доступа ────────────────────────────────────────────────────────────────
  console.log('\nГраница доступа (п.1):');
  for (const [label, prepare] of [
    ['без сессии', async (page) => page.goto(`${BASE}/profile?as=none`, { waitUntil: 'domcontentloaded' })],
    ['гость', async (page) => {
      await page.goto(`${BASE}/profile?as=guest`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3500);
    }],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
    const page = await ctx.newPage();
    await prepare(page);
    const nav = recordNav(page);
    await page.goto(`${BASE}/admin/dims`, { waitUntil: 'domcontentloaded' });
    const deadline = Date.now() + 8000;
    let left = null;
    while (Date.now() < deadline && left === null) {
      const path = new URL(page.url()).pathname;
      if (path !== '/admin/dims') left = path;
      else await page.waitForTimeout(100);
    }
    check(left !== null && nav.includes('/'), `п.1 (${label}): в комнату не попадает`,
      `цепочка: ${nav.join(' → ')}`);
    await ctx.close();
  }

  // ── Админская сессия: остальные пункты в одном контексте ─────────────────────────────────
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await page.goto(`${BASE}/admin/dims`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tabs button', { timeout: 15000 });

  /*
   * ── п.10 · С ЧЕГО КОМНАТА ОТКРЫВАЕТСЯ (`bugs/141`) и что при этом НЕ рисуется (`bugs/140`) ──
   *
   * Оба дефекта нашёл ВЛАДЕЛЕЦ первой же вычиткой в бою, мимо них прошли все проверки этого
   * стража — потому что он ходил по вкладкам сам и ни разу не спросил, ЧТО человек видит, ничего
   * не нажав. Проверки стоят ПЕРВЫМИ и до единого клика: любой клик ниже стёр бы предмет спора.
   */
  console.log('\nС чего открывается комната (п.10):');
  {
    const activeTab = (await page.locator('.tabs button.on').innerText().catch(() => '')).trim();
    check(activeTab.startsWith('Очередь'), 'п.10а: 🔴 комната открыта на вкладке «Очередь» (bugs/141)',
      `активна «${activeTab}»`);

    // Очередь показана по существу: либо карточки, либо честный текст «разбирать нечего».
    await page.waitForSelector('.cand, .card .warn', { timeout: 10000 }).catch(() => null);
    const cands = await page.locator('.cand').count();
    const emptySaid = await page.locator('.card .warn').first().innerText().catch(() => '');
    check(cands > 0 || /Очередь пуста/u.test(emptySaid),
      'п.10б: очередь показана по существу — карточки либо честное «пусто»',
      `карточек ${cands} · текст «${emptySaid.trim().slice(0, 40)}»`);

    /*
     * 🔴 Форма создания на вкладке очереди — НОЛЬ УЗЛОВ (`bugs/140`). Отдельная проверка, а не
     * побочный эффект соседней: форма пряталась не тем, что её не рисовали, а тем, что она
     * стояла в ветке `{:else}` пары «каталог / иначе форма», то есть означала «всё, что не
     * каталог». Мерим счётом узлов, а не видимостью: форма высыпалась НИЖЕ списка и честно была
     * `visible`, просто владельцу приходилось до неё доскроллить.
     */
    const formNodes = await page.locator('.form').count();
    check(formNodes === 0, 'п.10в: 🔴 формы создания на вкладке «Очередь» НЕТ ни одного узла (bugs/140)',
      `узлов ${formNodes}`);
  }

  await page.locator('.tabs button', { hasText: 'Каталог' }).click();
  await page.waitForSelector('.rows li', { timeout: 15000 }).catch(() => null);

  console.log('\nКаталог виден (п.2):');
  {
    check(new URL(page.url()).pathname === '/admin/dims', 'п.2а: админ остался в комнате');
    const rows = await page.locator('.rows li').count();
    const headline = await page.locator('.h').first().innerText();
    // Каталог стенда — 49 измерений (сид). Число берём ИЗ ЗАГОЛОВКА, а не константой: страж не
    // должен падать от того, что сид вырос.
    const stated = Number(headline.match(/(\d+)\s+измерений/)?.[1] ?? 0);
    check(rows > 0, 'п.2б: список каталога непуст', `строк ${rows}`);
    check(stated > 0 && stated >= rows, 'п.2в: заголовок называет число измерений', headline.trim());
    await page.screenshot({ path: `${OUT}/catalog.png`, fullPage: false });
  }

  console.log('\nПоиск отбирает по уже прочитанному списку (п.2г):');
  {
    const before = await page.locator('.rows li').count();
    const firstName = await page.locator('.rows li .rn').first().innerText();
    await page.locator('input[type="search"]').fill(firstName.slice(0, 4));
    await page.waitForTimeout(300);
    const after = await page.locator('.rows li').count();
    check(after > 0 && after <= before, 'п.2г: поиск сузил список и нашёл искомое',
      `${before} → ${after} по «${firstName.slice(0, 4)}»`);
    await page.locator('input[type="search"]').fill('');
    await page.waitForTimeout(200);
  }

  // ── п.5 · форма отвергает пустое название и НИЧЕГО не пишет ──────────────────────────────
  console.log('\nФорма отвергает пустое название (п.5):');
  {
    const dimsBefore = (await listDims()).length;
    await page.locator('.tabs button', { hasText: 'Создать' }).click();
    await page.waitForSelector('.form', { timeout: 5000 });
    await page.locator('.acts button.ok').click();
    await page.waitForTimeout(500);
    const problems = await page.locator('.problems li').count();
    check(problems === 2, 'п.5а: названы ДВЕ проблемы — по обеим половинам названия', `их ${problems}`);
    const dimsAfter = (await listDims()).length;
    check(dimsAfter === dimsBefore, 'п.5б: 🔑 в базу при этом НЕ записано ничего',
      `${dimsBefore} → ${dimsAfter}`);
  }

  // ── п.3 · создание ───────────────────────────────────────────────────────────────────────
  console.log('\nСоздание измерения (п.3):');
  {
    await page.locator('label', { hasText: 'Название (ru)' }).locator('input').fill(MARK);
    await page.locator('label', { hasText: 'Title (en)' }).locator('input').fill(MARK_EN);
    await page.locator('label', { hasText: 'Тип (ru)' }).locator('input').fill('Проба');
    await page.locator('label', { hasText: 'Type (en)' }).locator('input').fill('Probe');
    await page.locator('label', { hasText: 'Год' }).locator('input').fill('1966–1969');
    await page.locator('label', { hasText: 'Теги' }).locator('input').fill('проба, проба, страж');
    await page.locator('.acts button.ok').click();
    await page.waitForSelector('.result', { timeout: 10000 });
    const said = await page.locator('.result').innerText();
    check(!said.includes('Не записано'), 'п.3а: экран доложил об успехе', said.trim().slice(0, 90));

    const probe = await findProbe();
    createdId = probe?.id ?? null;
    check(probe !== null, 'п.3б: 🔑 документ ЛЁГ В БАЗУ (вердикт снимается с базы, не с экрана)');

    if (probe !== null) {
      const f = probe.fields;
      check(f.title?.mapValue?.fields?.ru?.stringValue === MARK
            && f.title?.mapValue?.fields?.en?.stringValue === MARK_EN,
        'п.3в: название записано на оба языка');
      check(f.year?.stringValue === '1966–1969',
        'п.3г: год записан СТРОКОЙ, диапазон не искажён', String(f.year?.stringValue));
      const tags = (f.tags?.arrayValue?.values ?? []).map((t) => t.stringValue);
      check(tags.length === 2 && tags[0] === 'проба' && tags[1] === 'страж',
        'п.3д: теги разобраны по запятой, повтор схлопнут', JSON.stringify(tags));
      check(Number(f.stars?.integerValue ?? f.stars?.doubleValue ?? -1) === 0
            && Number(f.rates?.integerValue ?? f.rates?.doubleValue ?? -1) === 0
            && Number(f.rating?.integerValue ?? f.rating?.doubleValue ?? -1) === 0,
        'п.3е: сводка оценок нулевая');
      check(f.time?.mapValue?.fields?.created?.timestampValue !== undefined,
        'п.3ж: 🔑 метка создания стоит СЕРВЕРНЫМ временем (на ней бейдж «Новое» и дельта индекса)');
      check(f.name === undefined,
        'п.3з: 🔴 легаси-поля `name` в новой записи НЕТ (решение владельца В4 = В)');
      const queueFields = ['status', 'wikidata', 'candidate'].filter((k) => f[k] !== undefined);
      check(queueFields.length === 0, 'п.3и: полей очереди вычитки в записи нет', queueFields.join(', '));
    }
  }

  // ── п.4 · ГЛАВНОЕ: правка не обнуляет сводку оценок ──────────────────────────────────────
  console.log('\nПравка не обнуляет труд людей (п.4):');
  if (createdId === null) {
    check(false, 'п.4: нечем мерить — документ не создался');
  } else {
    /*
     * Ставим пробе НЕНУЛЕВУЮ сводку прямо в базу — как её посчитал бы сервер синхронизации
     * после того, как двенадцать человек поставили звёзды. Контроль прибора (`EXP-0070`):
     * сначала убеждаемся, что обнулять БЫЛО ЧТО, — иначе «сводка цела» зелено бессодержательно.
     */
    await fetch(
      `${docsUrl}/dims/${createdId}?updateMask.fieldPaths=stars&updateMask.fieldPaths=rates&updateMask.fieldPaths=rating`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...owner },
        body: JSON.stringify({
          fields: {
            stars: { integerValue: '84' },
            rates: { integerValue: '12' },
            rating: { doubleValue: 7 },
          },
        }),
      },
    );
    const seeded = await findProbe();
    const seededRates = Number(seeded?.fields?.rates?.integerValue ?? 0);
    check(seededRates === 12, 'контроль прибора: сводка перед правкой НЕнулевая', `rates ${seededRates}`);

    /*
     * Правим через ЭКРАН, а не через базу: предмет проверки — путь человека.
     *
     * ⚠️ БЕЗ ПЕРЕЗАГРУЗКИ, и это не удобство. Указание владельца 2026-08-17 — список грузится
     * ОДНИМ запросом `dims_list`, — значит только что созданная запись видна из памяти вкладки,
     * пока сервер синхронизации не внёс её в индекс. Перезагрузка эту память стирает, и страж
     * мерил бы не продукт, а скорость цикла синхронизации.
     */
    await page.locator('.tabs button', { hasText: 'Каталог' }).click();
    await page.waitForSelector('.rows li', { timeout: 8000 });
    await page.locator('input[type="search"]').fill(MARK.slice(0, 10));
    await page.waitForTimeout(300);
    const foundFresh = await page.locator('.rows li').count();
    check(foundFresh === 1, 'п.4а0: 🔑 созданное видно в списке СРАЗУ и без второго запроса к базе',
      `строк ${foundFresh}`);
    await page.locator('.rows li .rowbtn').first().click();
    await page.waitForSelector('.form', { timeout: 8000 });
    const notice = await page.locator('.warn').first().innerText().catch(() => '');
    check(/12/.test(notice), 'п.4а: экран честно называет число оценок правимого измерения',
      notice.trim().slice(0, 80));

    await page.locator('label', { hasText: 'Название (ru)' }).locator('input').fill(`${MARK} (правлено)`);
    await page.locator('.acts button.ok').click();
    await page.waitForSelector('.result', { timeout: 10000 });

    const after = await findProbe();
    const f = after?.fields ?? {};
    check(after !== null && f.title?.mapValue?.fields?.ru?.stringValue === `${MARK} (правлено)`,
      'п.4б: правка названия записана');
    check(Number(f.stars?.integerValue ?? -1) === 84
          && Number(f.rates?.integerValue ?? -1) === 12
          && Number(f.rating?.doubleValue ?? f.rating?.integerValue ?? -1) === 7,
      'п.4в: 🔴🔴 СВОДКА ОЦЕНОК ЦЕЛА — правка не обнулила труд людей',
      `stars ${f.stars?.integerValue} · rates ${f.rates?.integerValue} · rating ${f.rating?.doubleValue ?? f.rating?.integerValue}`);
    check(f.time?.mapValue?.fields?.created?.timestampValue !== undefined,
      'п.4г: метка создания пережила правку — запись не стала «новой» заново');
    await page.screenshot({ path: `${OUT}/edited.png`, fullPage: false });
  }

  // ── п.8 · удаление: текст владельца дословно, и одного нажатия не хватает ────────────────
  console.log('\nУдаление — текст владельца, вариант B интервью №038 (п.8):');
  if (createdId === null) {
    check(false, 'п.8: нечем мерить — документ не создался');
  } else {
    // Карточка уже открыта на правку после п.4, у неё rates = 12.
    const before = (await listDims()).length;
    await page.locator('.acts button.danger').first().click();
    await page.waitForSelector('.confirm', { timeout: 5000 });

    const head = await page.locator('.confirm-head').innerText();
    const body = await page.locator('.confirm-body').innerText();
    check(/^Удалить измерение «.+»\?$/u.test(head.trim()),
      'п.8а: заголовок подтверждения — формулировка владельца', head.trim());
    check(body.includes('перестанут работать') && body.includes('Действие необратимо.'),
      'п.8б: 🔴 текст варианта B стоит ДОСЛОВНО', body.trim());
    check(/Оценки 12 человек/u.test(body),
      'п.8в: число людей названо и склонено верно', body.trim().slice(0, 60));
    check(!/навсегда/iu.test(body), 'п.8г: запрещённого слова «навсегда» в тексте нет');

    const midway = (await listDims()).length;
    check(midway === before, 'п.8д: 🔑 открытие подтверждения НИЧЕГО не удалило',
      `${before} → ${midway}`);
    /*
     * 🔴 ПОДТВЕРЖДЕНИЕ ОБЯЗАНО ПОПАСТЬ В ЭКРАН, а не только в разметку.
     *
     * Эту проверку добавил КАДР, а не рассуждение: форма из десяти полей длиннее экрана, и
     * подтверждение вставало ЗА нижней кромкой. Все проверки текста выше были при этом
     * зелёными — они судят DOM. Человек же не видел ответа на своё нажатие.
     * Мера — пересечение прямоугольника узла с вьюпортом, а не `isVisible()`: тот про
     * разметку и стили, и про положение относительно экрана не говорит ничего.
     */
    const inView = await page.locator('.confirm').evaluate((node) => {
      const r = node.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0 && r.height > 0;
    });
    check(inView, 'п.8д2: 🔑 подтверждение ПОПАЛО В ЭКРАН, а не осталось за кромкой');
    // Кадр — контрольный (`EXP-0082`): текст владельца обязан читаться глазами.
    await page.screenshot({ path: `${OUT}/confirm-delete.png`, fullPage: false });

    // Отмена обязана вернуть всё как было — иначе «Отменить» декоративна.
    await page.locator('.confirm .acts button', { hasText: 'Отменить' }).click();
    await page.waitForTimeout(400);
    const afterCancel = (await listDims()).length;
    check(afterCancel === before && (await findProbe()) !== null,
      'п.8е: «Отменить» действительно отменяет — измерение на месте', `${afterCancel}`);

    /*
     * 🔑 СТАВИМ ПРЕДУСЛОВИЕ, А НЕ ЖДЁМ УДАЧИ (`bugs/147`). В бою между удалением и ближайшей
     * пересборкой индекса запись в индексе ЛЕЖИТ — на этом дефект и держался. На стенде сервер
     * синхронизации ходит циклом в 15 с и уносит её сам, поэтому проверка «нет в списке» была
     * зелена по ЧУЖОЙ причине и не покраснела на мутации.
     *
     * Поэтому строка индекса вписывается ЯВНО перед удалением: прогон воспроизводит боевое
     * состояние, а не надеется в него попасть. Это фикстура опыта, а не подделка поведения —
     * продукт по-прежнему судится по тому, что он показывает человеку.
     * ⚠️ Сервер синхронизации стенда следующим циклом честно пересоберёт индекс; на боевой
     * механизм это не влияет никак — прогон живёт только на эмуляторе.
     */
    const idxUrl = `${docsUrl}/dims/dims_list`;
    const idxNow = await fetch(idxUrl, { headers: owner }).then((r) => r.json());
    const idxMap = JSON.parse(idxNow?.fields?.dims_list?.stringValue ?? '{}');
    idxMap[createdId] = { ru: `${MARK} (правлено)`, en: MARK_EN, year: '1966–1969' };
    await fetch(`${idxUrl}?updateMask.fieldPaths=dims_list`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...owner },
      body: JSON.stringify({ fields: { dims_list: { stringValue: JSON.stringify(idxMap) } } }),
    });

    // И только теперь удаляем по-настоящему.
    await page.locator('.acts button.danger').first().click();
    await page.waitForSelector('.confirm', { timeout: 5000 });
    await page.locator('.confirm .acts button.danger').click();
    await page.waitForTimeout(1500);
    const deletedId = createdId;
    const gone = await findProbe();
    check(gone === null, 'п.8ж: 🔑 после подтверждения измерения в БАЗЕ нет');
    if (gone === null) createdId = null;
    await page.screenshot({ path: `${OUT}/deleted.png`, fullPage: false });

    /*
     * 🔴 п.8з — ВЕРДИКТ СНИМАЕТСЯ И С ЭКРАНА (`bugs/147`, нашёл владелец первой же пробой).
     *
     * Прежде удаление судилось ТОЛЬКО по базе, и «в базе нет» я принял за «на экране нет». А
     * список комнаты читается из ИНДЕКСА каталога, который ведёт сервер синхронизации своим
     * циклом: сразу после удаления индекс о записи ещё помнит и честно её показывает. Человек
     * нажимает «Удалить», возвращается к списку — и видит запись на месте.
     *
     * 🔑 Проверка идёт ПО ЭКРАНУ, а не по памяти модуля: предмет спора — что видит человек.
     */
    /*
     * 🔑 КОНТРОЛЬ ПРИБОРА ПЕРВЫМ, и он здесь обязателен (`EXP-0070`, `EXP-0082`).
     *
     * Проверка «удалённого нет в списке» доказывает ПАМЯТЬ ПРОДУКТА только пока индекс каталога
     * ещё помнит запись. Сервер синхронизации стенда ходит циклом в 15 с и уносит её сам — и
     * тогда список чист по чужой причине, а проверка зелена на сломанном коде. Поймано на себе:
     * первая редакция этой проверки НЕ покраснела на мутации.
     *
     * Поэтому сначала спрашиваем индекс. Запись в нём — предмет спора существует, вердикт
     * законен. Записи нет — прогон честно ОБЪЯВЛЯЕТ проверку пропущенной вместо зелёной.
     */
    const indexDoc = await fetch(`${docsUrl}/dims/dims_list`, { headers: owner }).then((r) => r.json());
    const indexRaw = indexDoc?.fields?.dims_list?.stringValue ?? '{}';
    const indexStillHas = deletedId !== null && Object.hasOwn(JSON.parse(indexRaw), deletedId);

    await page.locator('.tabs button', { hasText: 'Каталог' }).click();
    await page.waitForSelector('.rows li, .warn', { timeout: 8000 }).catch(() => null);
    await page.locator('input[type="search"]').fill(MARK.slice(0, 10));
    await page.waitForTimeout(400);
    const ghosts = await page.locator('.rows li').count();

    if (indexStillHas) {
      check(ghosts === 0, 'п.8з: 🔴 удалённого НЕТ В СПИСКЕ, хотя индекс о нём ещё помнит (bugs/147)',
        `строк с этим названием ${ghosts}`);
    } else {
      skip('п.8з: удалённого нет в списке',
        'индекс уже пересобран сервером синхронизации — вердикт был бы зелёным по чужой причине');
    }
  }

  // ── п.9 · ОЧЕРЕДЬ КАНДИДАТОВ: агент предлагает, владелец судит ────────────────────────────
  console.log('\nОчередь кандидатов (п.9):');
  {
    /*
     * Страж заводит СВОЕГО кандидата, а не судит настоящих: разобранный кандидат из очереди не
     * возвращается (и не должен — это стёрло бы решение владельца), поэтому прогон, судивший
     * живую запись, был бы одноразовым. Свой кандидат делает страж повторяемым.
     */
    await putCandidate(CAND_ID, {
      title: { mapValue: { fields: { ru: { stringValue: MARK_CAND }, en: { stringValue: MARK_CAND_EN } } } },
      description: { mapValue: { fields: { ru: { stringValue: 'Проба очереди.' }, en: { stringValue: 'Queue probe.' } } } },
      type: { mapValue: { fields: { ru: { stringValue: 'Проба' }, en: { stringValue: 'Probe' } } } },
      year: { stringValue: '2026' },
      status: { stringValue: 'pending' },
      source: { mapValue: { fields: {
        registry: { stringValue: 'wikidata' },
        id: { stringValue: 'Q131547207' },
        sitelinks: { integerValue: '61' },
      } } },
      agentNote: { stringValue: '' },
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.tabs button', { timeout: 15000 });
    await page.locator('.tabs button', { hasText: 'Очередь' }).click();
    await page.waitForSelector('.cand', { timeout: 10000 });

    const cards = await page.locator('.cand').count();
    check(cards > 0, 'п.9а: очередь показывает кандидатов', `карточек ${cards}`);

    const probeCard = page.locator('.cand', { hasText: MARK_CAND }).first();
    const text = await probeCard.innerText();
    // 🔴 Требование метаплана: карточка обязана показывать, ЧТО проверить. Иначе пачка
    // правдоподобных карточек превращает владельца в штамп «Одобрить» — названный отраслью
    // главный риск таких очередей.
    check(text.includes('Q131547207'), 'п.9б: 🔑 источник назван разрешимым идентификатором');
    check(/61 языковых разделов/u.test(text), 'п.9в: известность названа числом');
    check(text.includes('Проба очереди.') && text.includes('Queue probe.'),
      'п.9г: описание видно на ОБА языка — вычитывать есть что');
    await page.screenshot({ path: `${OUT}/queue.png`, fullPage: false });

    // ── Одобрение рождает измерение ТЕМ ЖЕ путём, что ручная форма ───────────────────────
    const dimsBefore = (await listDims()).length;
    await probeCard.locator('.acts button.ok').click();
    await page.waitForSelector('.result', { timeout: 15000 });

    const born = await findDimByTitle(MARK_CAND);
    check(born !== null, 'п.9д: 🔑 одобрение ЗАВЕЛО измерение в каталоге (вердикт снят с базы)');
    if (born !== null) approvedDimId = born.id;
    check((await listDims()).length === dimsBefore + 1,
      'п.9е: в каталоге стало ровно на одно измерение больше');

    const judged = await getCandidate(CAND_ID);
    check(judged?.fields?.status?.stringValue === 'approved',
      'п.9ж: кандидат помечен «approved», а не остался в очереди',
      String(judged?.fields?.status?.stringValue));
    check(judged?.fields?.approvedDimId?.stringValue === approvedDimId,
      'п.9з: 🔑 кандидат несёт ссылку на РОЖДЁННОЕ измерение — решение владельца прослеживается');

    check(await waitGone(page, MARK_CAND), 'п.9и: одобренный ушёл из очереди');

    // ── Отклонение НЕ пишет в каталог ────────────────────────────────────────────────────
    await putCandidate(`${CAND_ID}-rej`, {
      title: { mapValue: { fields: { ru: { stringValue: `${MARK_CAND} отказ` }, en: { stringValue: 'Queue probe reject' } } } },
      description: { mapValue: { fields: { ru: { stringValue: 'Проба отказа.' }, en: { stringValue: 'Reject probe.' } } } },
      status: { stringValue: 'pending' },
      agentNote: { stringValue: '' },
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.tabs button', { timeout: 15000 });
    await page.locator('.tabs button', { hasText: 'Очередь' }).click();
    await page.waitForSelector('.cand', { timeout: 10000 });

    const beforeReject = (await listDims()).length;
    await page.locator('.cand', { hasText: `${MARK_CAND} отказ` }).first()
      .locator('.acts button.danger').click();
    await page.waitForSelector('.result', { timeout: 15000 });

    const rejected = await getCandidate(`${CAND_ID}-rej`);
    check(rejected?.fields?.status?.stringValue === 'rejected',
      'п.9к: отклонённый помечен «rejected»', String(rejected?.fields?.status?.stringValue));
    check((await listDims()).length === beforeReject,
      'п.9л: 🔑 отклонение НЕ записало в каталог ничего', `${beforeReject}`);

    /*
     * ── ВОЗВРАТ НА ДОРАБОТКУ (`bugs/142`) ──────────────────────────────────────────────────
     *
     * Четвёртое действие владельца, которого агент не построил: метаплан `plans/30` фаза 6
     * называл ЧЕТЫРЕ («одобрить · отредактировать · отклонить · вернуть с комментарием»), в
     * комнате их было три. Нашёл владелец первым же прогоном контура.
     *
     * Кандидат заводится С НЕПУСТЫМ `agentNote` намеренно: главный риск правки — затереть одну
     * сторону диалога другой, и проверить это можно только на карточке, где есть обе.
     */
    await putCandidate(`${CAND_ID}-back`, {
      title: { mapValue: { fields: { ru: { stringValue: `${MARK_CAND} возврат` }, en: { stringValue: 'Queue probe return' } } } },
      description: { mapValue: { fields: { ru: { stringValue: 'Проба возврата.' }, en: { stringValue: 'Return probe.' } } } },
      status: { stringValue: 'pending' },
      agentNote: { stringValue: 'Год в источниках расходится, поставил первое издание.' },
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.cand', { timeout: 15000 });

    const backCard = page.locator('.cand', { hasText: `${MARK_CAND} возврат` }).first();
    const backBtn = backCard.locator('.acts button.back');

    check(await backBtn.count() === 1, 'п.9м: 🔴 у карточки есть кнопка «Вернуть на доработку»');
    check(await backBtn.isDisabled(),
      'п.9н: 🔑 при ПУСТОМ комментарии кнопка неактивна — возврат без объяснения агенту ничего не даёт');

    const NOTE = 'Описание короткое. Перепиши вики-подобно, 900…1400 знаков.';
    await backCard.locator('.cand-say textarea').fill(NOTE);
    await page.waitForTimeout(200);
    check(!(await backBtn.isDisabled()), 'п.9о: с непустым комментарием кнопка ожила');

    const beforeBack = (await listDims()).length;
    await backBtn.click();
    await page.waitForSelector('.result', { timeout: 15000 });

    const sentBack = await getCandidate(`${CAND_ID}-back`);
    check(sentBack?.fields?.status?.stringValue === 'returned',
      'п.9п: кандидат помечен «returned»', String(sentBack?.fields?.status?.stringValue));
    check(sentBack?.fields?.ownerNote?.stringValue === NOTE,
      'п.9р: 🔑 комментарий ВЛАДЕЛЬЦА записан в своё поле `ownerNote`',
      String(sentBack?.fields?.ownerNote?.stringValue).slice(0, 50));
    check(sentBack?.fields?.agentNote?.stringValue === 'Год в источниках расходится, поставил первое издание.',
      'п.9с: 🔴 комментарий АГЕНТА НЕ ЗАТЁРТ — поля разные, диалог двусторонний',
      String(sentBack?.fields?.agentNote?.stringValue).slice(0, 50));
    check((await listDims()).length === beforeBack,
      'п.9т: 🔑 возврат НЕ завёл измерение (вердикт снят с базы)', `${beforeBack}`);
    check(await waitGone(page, `${MARK_CAND} возврат`),
      'п.9у: возвращённый ушёл из очереди — владельцу он больше не показывается');

    /*
     * ── СЛОВО ВЛАДЕЛЬЦА ПРИ ОДОБРЕНИИ (`bugs/173`) ─────────────────────────────────────────
     *
     * Дефект: кнопка [Одобрить] читала форму мимо поля комментария и молча его выбрасывала.
     * Владелец написал похвалу, нажал одобрить — и текст не записался никуда; нашёл он это сам,
     * проверяя, дошли ли его слова до агента.
     *
     * 🔑 ПОЧЕМУ КАРТОЧКА ЗАВОДИТСЯ С УЖЕ ЛЕЖАЩИМ `ownerNote`. Главный риск этой правки —
     * затереть похвалой историю прошлого возврата: события разные, и владелец сказал это прямо
     * («*"реестр" — это старый комментарий… а сейчас я написал похвалу*»). Проверить затирание
     * можно ТОЛЬКО на карточке, где лежит и то и другое.
     */
    await putCandidate(`${CAND_ID}-praise`, {
      title: { mapValue: { fields: { ru: { stringValue: `${MARK_CAND} похвала` }, en: { stringValue: 'Queue probe praise' } } } },
      description: { mapValue: { fields: { ru: { stringValue: 'Проба похвалы.' }, en: { stringValue: 'Praise probe.' } } } },
      status: { stringValue: 'pending' },
      agentNote: { stringValue: 'Мой прежний комментарий владельцу.' },
      ownerNote: { stringValue: 'Реестр.' },
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.cand', { timeout: 15000 });

    const praiseCard = page.locator('.cand', { hasText: `${MARK_CAND} похвала` }).first();
    const okBtn = praiseCard.locator('.acts button.ok');
    const PRAISE = 'Принятие и реакция сообщества — я сам такое писал, и такое одобряю.';
    await praiseCard.locator('.cand-say textarea').fill(PRAISE);
    await page.waitForTimeout(200);
    check(!(await okBtn.isDisabled()),
      'п.9ф: 🔑 кнопка одобрения при НЕПУСТОМ комментарии активна — молчание не обязательно');
    await okBtn.click();
    await page.waitForSelector('.result', { timeout: 15000 });

    const praised = await getCandidate(`${CAND_ID}-praise`);
    praiseDimId = praised?.fields?.approvedDimId?.stringValue ?? null;
    check(praised?.fields?.status?.stringValue === 'approved',
      'п.9х: кандидат помечен «approved»', String(praised?.fields?.status?.stringValue));
    check(praised?.fields?.ownerApprovalNote?.stringValue === PRAISE,
      'п.9ц: 🔴 СЛОВО ВЛАДЕЛЬЦА ПРИ ОДОБРЕНИИ СОХРАНЕНО (bugs/173) — раньше оно терялось молча',
      String(praised?.fields?.ownerApprovalNote?.stringValue).slice(0, 50));
    check(praised?.fields?.ownerNote?.stringValue === 'Реестр.',
      'п.9ч: 🔴 след прошлого возврата НЕ ЗАТЁРТ похвалой — события разные, история цела',
      String(praised?.fields?.ownerNote?.stringValue).slice(0, 50));
    check(praised?.fields?.agentNote?.stringValue === 'Мой прежний комментарий владельцу.',
      'п.9ш: комментарий агента тоже цел — три поля, три голоса');
  }

  console.log('\nКонсоль (п.7):');
  check(consoleErrors.length === 0, 'п.7: консоль чиста за весь проход',
    consoleErrors.slice(0, 2).join(' | '));

  await ctx.close();
} finally {
  // ── 🧹 Уборка и ПРОВЕРКА уборки (правило класса bugs/103) ────────────────────────────────
  console.log('\nУборка:');
  /*
   * 🔑 УБИРАЕМ ВСЕ ПРОБЫ, А НЕ ПЕРВУЮ. `findProbe` возвращает первое совпадение, и этого хватало,
   * пока прогон всегда доходил до конца. Прогон, упавший в середине (или мутационный, где
   * удаление намеренно сломано), оставляет измерение пробы в базе — и следующий заход убирает
   * ОДНО, а видит несколько. Числа поехали именно так: «строк 4» вместо одной, причём краснел
   * при этом ИСПРАВНЫЙ продукт.
   */
  for (const doc of await listDims()) {
    const ru = doc.fields?.title?.mapValue?.fields?.ru?.stringValue ?? '';
    if (ru.startsWith(MARK)) await deleteDim(doc.name.split('/').pop());
  }
  if (createdId !== null) await deleteDim(createdId);
  // Измерение, рождённое из кандидата, и сами пробные кандидаты — тоже след прогона.
  if (approvedDimId !== null) await deleteDim(approvedDimId);
  const bornLeft = await findDimByTitle(MARK_CAND);
  if (bornLeft !== null) await deleteDim(bornLeft.id);
  await deleteCandidate(CAND_ID);
  await deleteCandidate(`${CAND_ID}-rej`);
  await deleteCandidate(`${CAND_ID}-back`);
  // Проба слова при одобрении (`bugs/173`): рождённое ею измерение и сама карточка.
  if (praiseDimId !== null) await deleteDim(praiseDimId);
  const praiseBorn = await findDimByTitle(`${MARK_CAND} похвала`);
  if (praiseBorn !== null) await deleteDim(praiseBorn.id);
  await deleteCandidate(`${CAND_ID}-praise`);

  /*
   * 🧹 СЛЕД В ИНДЕКСЕ — тоже след (правило класса `bugs/103`: база стенда общая, и страж,
   * ПИШУЩИЙ в неё, обязан вернуть её в исходное состояние).
   *
   * Проверка п.8з вписывает строку пробы в `dims_list`, чтобы поставить боевое предусловие.
   * Не убрав её, прогон оставляет ПРИЗРАКА: следующий заход видит запись, которой в базе нет,
   * и краснеет на исправном продукте. Поймано на себе в тот же вечер — «строк 4» вместо одной.
   */
  const idxDoc = await fetch(`${docsUrl}/dims/dims_list`, { headers: owner }).then((r) => r.json());
  const idxMap = JSON.parse(idxDoc?.fields?.dims_list?.stringValue ?? '{}');
  const ghosts = Object.entries(idxMap).filter(([, v]) => String(v?.ru ?? '').startsWith(MARK));
  if (ghosts.length > 0) {
    for (const [id] of ghosts) delete idxMap[id];
    await fetch(`${docsUrl}/dims/dims_list?updateMask.fieldPaths=dims_list`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...owner },
      body: JSON.stringify({ fields: { dims_list: { stringValue: JSON.stringify(idxMap) } } }),
    });
  }
  const idxAfter = JSON.parse(
    (await fetch(`${docsUrl}/dims/dims_list`, { headers: owner }).then((r) => r.json()))
      ?.fields?.dims_list?.stringValue ?? '{}',
  );
  check(!Object.values(idxAfter).some((v) => String(v?.ru ?? '').startsWith(MARK)),
    '🧹 след пробы убран И ИЗ ИНДЕКСА — иначе следующий прогон краснеет на исправном продукте');

  const leftover = await findProbe();
  const candLeft = await getCandidate(CAND_ID);
  check(leftover === null && (await findDimByTitle(MARK_CAND)) === null && candLeft === null,
    '🧹 след прогона убран — ни измерений пробы, ни пробных кандидатов в базе нет');
  await browser.close();
}

console.log('\n──────────────────────────────────────────────────────────────');
if (skipped.length > 0) {
  console.log(`⏭ пропущено проверок: ${skipped.length}`);
  for (const s of skipped) console.log(`   · ${s}`);
}
if (fails.length === 0) {
  console.log(`✅ ЧИСТО: проверок ${pass} · провалов 0`);
  console.log(`Кадры: ${OUT}/`);
  process.exit(0);
}
console.log(`❌ ПРОВАЛОВ ${fails.length} при ${pass} пройденных:`);
for (const f of fails) console.log(`   · ${f}`);
process.exit(1);

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
const AUTH = 'http://127.0.0.1:9099';
const FS = 'http://127.0.0.1:8181';
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
    const dimPage = existsSync('build/ru/dimension')
      ? `build/ru/dimension/${readdirSync('build/ru/dimension')[0]}`
      : null;
    if (dimPage !== null) publicPages.push(dimPage);
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
  console.error('\n❌ Стенд не отвечает (Auth 9099 / сайт 5173). Подними: npm run stand');
  process.exit(1);
}
await grantAdmin();

const browser = await chromium.launch();
let createdId = null;

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

    // И только теперь удаляем по-настоящему.
    await page.locator('.acts button.danger').first().click();
    await page.waitForSelector('.confirm', { timeout: 5000 });
    await page.locator('.confirm .acts button.danger').click();
    await page.waitForTimeout(1500);
    const gone = await findProbe();
    check(gone === null, 'п.8ж: 🔑 после подтверждения измерения в БАЗЕ нет');
    if (gone === null) createdId = null;
    await page.screenshot({ path: `${OUT}/deleted.png`, fullPage: false });
  }

  console.log('\nКонсоль (п.7):');
  check(consoleErrors.length === 0, 'п.7: консоль чиста за весь проход',
    consoleErrors.slice(0, 2).join(' | '));

  await ctx.close();
} finally {
  // ── 🧹 Уборка и ПРОВЕРКА уборки (правило класса bugs/103) ────────────────────────────────
  console.log('\nУборка:');
  const probe = await findProbe();
  if (probe !== null) await deleteDim(probe.id);
  if (createdId !== null) await deleteDim(createdId);
  const leftover = await findProbe();
  check(leftover === null, '🧹 след прогона убран — измерения пробы в базе нет');
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

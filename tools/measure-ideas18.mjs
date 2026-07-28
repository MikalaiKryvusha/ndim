/**
 * ЗАМЕР ДО КОДА для `ideas/18` — «кэш данных экранов на сессию».
 *
 * Слово владельца (2026-07-27): «всякий раз, когда открываешь Профиль, Связи, Измерения,
 * Пространство, Настройки — выглядит так, словно страница с нуля загружает данные, даже если
 * эту страницу в текущей сессии открывали». Прежде чем чинить — измеряем, а не верим на слово
 * (канон `plans/06`; урок EXP-0066: метрика обязана быть признаком САМОГО дефекта).
 *
 * ЧТО МЕРЯЕТСЯ, две величины на каждый заход на экран:
 *   1. **обращения к базе** — запросы браузера к эмулятору Firestore (127.0.0.1:8181);
 *   2. **карточки «Загрузка»** — сколько раз за заход в DOM появлялся `.load-card`.
 * Первая — это деньги (канон `AGENT_GUIDE` → «Модель данных»), вторая — это ровно та боль,
 * которую видит владелец глазами.
 *
 * ⚠️ ХОДИМ КЛИКАМИ ПО НАВИГАЦИИ, А НЕ `page.goto`. Перезагрузка страницы стирает память
 * приложения — и замер мерил бы холодный старт вместо навигации, то есть НЕ ту величину,
 * о которой говорит владелец. Кэш сессии живёт ровно между SPA-переходами.
 *
 * ⚠️ Круг проходим ТРИЖДЫ (EXP-0070: у проверки «ничего не произошло» обязан быть холодный
 * и тёплый прогон): круг 1 — холодная память, круги 2–3 — та самая ситуация владельца
 * «эту страницу в текущей сессии уже открывали».
 *
 * ⚠️ БАЗУ ПРИДЕРЖИВАЕМ (`--slow`, по умолчанию 400 мс на запрос). На голом localhost эмулятор
 * отвечает быстрее, чем успевает отрисоваться состояние загрузки, и «карточек «Загрузка»: 0»
 * означало бы не «лоадеров нет», а «стенд слишком быстр» (тот же класс, что в `bugs/70`).
 * У владельца сеть настоящая — мерить надо в его условиях.
 *
 * ⚠️ У счётчика лоадеров есть САМОПРОВЕРКА (EXP-0065): если зонд не установился или разметка
 * карточки сменилась, замер обязан упасть, а не показать успокаивающий ноль.
 *
 * Требует поднятый `npm run stand`.
 * Запуск: node tools/measure-ideas18.mjs [--rounds N] [--width 390|1440] [--slow МС]
 */

import { chromium } from '@playwright/test';

const STAND = 'http://localhost:5173';
const AUTH = 'http://127.0.0.1:9099';
const PROJECT = 'demo-ndim-dev';
const DB_HOST = '127.0.0.1:8181';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const ROUNDS = Number(arg('--rounds', 3));
const WIDTH = Number(arg('--width', 1440));
/** Придержка каждого запроса к базе — приводим localhost к латентности живой сети. */
const SLOW_MS = Number(arg('--slow', 400));

/** Экраны круга — в порядке нижней панели (BottomNav.svelte). */
const SCREENS = [
  { key: 'profile', href: '/profile', title: 'Профиль' },
  { key: 'relations', href: '/relations', title: 'Связи' },
  { key: 'space', href: '/space', title: 'Пространство' },
  { key: 'dims', href: '/dims', title: 'Измерения' },
  { key: 'menu', href: '/menu', title: 'Меню' },
];

/** Вход почтовой ссылкой через oob-код эмулятора Auth (приём EXP-0045). */
async function signIn(page) {
  const email = 'dev@ndim.space';
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=demo-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestType: 'EMAIL_SIGNIN', email, continueUrl: `${STAND}/profile` }),
  });
  const res = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes = [] } = await res.json();
  const last = oobCodes.filter((c) => c.email === email && c.requestType === 'EMAIL_SIGNIN').at(-1);
  if (!last) return false;
  await page.goto(`${STAND}/profile?mode=signIn&oobCode=${last.oobCode}&apiKey=demo-api-key`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(2500);
  return true;
}

/**
 * Счётчик карточек «Загрузка» ВНУТРИ страницы.
 *
 * Считать опросом нельзя: карточка может мигнуть между двумя опросами и остаться незамеченной
 * (класс EXP-0060 — мерцания видит только наблюдение за каждым изменением, а не выборка).
 * Ставим `MutationObserver` один раз на документ; SPA-переходы документ не меняют, поэтому
 * наблюдатель переживает всю навигацию.
 */
const LOADER_PROBE = () => {
  const w = /** @type {any} */ (window);
  w.__loaders = 0; // карточки ЭКРАНА — «страница грузится с нуля», это и есть боль владельца
  w.__feedLoaders = 0; // маркер хвоста ленты — «ниже есть ещё», канон 1.x, дефектом НЕ является
  w.__probeArmed = false; // ← отдельный флаг: «наблюдатель реально стоит», а не «переменная есть»
  const count = (node) => {
    if (!(node instanceof Element)) return;
    const card = node.matches?.('.load-card') ? node : node.querySelector?.('.load-card');
    if (!card) return;
    /*
     * ⚠️ Две РАЗНЫЕ вещи носят одну разметку, и мерить их одним числом — значит мерить не то
     * (EXP-0066: метрика обязана быть признаком САМОГО дефекта). Кольцо внутри `.loader` —
     * это якорь бесконечной прокрутки «Измерений»: он стоит в хвосте ленты всегда, пока она
     * не исчерпана, и был в 1.x (`allDimsLoader`). Кольцо в `.state` — это «экран ещё не
     * показал данные», то самое «словно страница с нуля загружается».
     */
    if (card.closest('.loader')) w.__feedLoaders += 1;
    else w.__loaders += 1;
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) count(node);
  });
  // Наблюдаем сам ДОКУМЕНТ, а не `documentElement`: скрипт стартует до разбора разметки,
  // и корневого элемента в этот момент может ещё не существовать — `observe(null)` бросает,
  // и зонд молча оставался бы нулём (ровно тот успокаивающий ноль, который ловит EXP-0065).
  observer.observe(document, { childList: true, subtree: true });
  w.__probeArmed = true;
  if (document.querySelector('.load-card')) w.__loaders += 1;
};

/**
 * Барьер «экран догрузился»: обращения к базе перестали идти И карточки «Загрузка» на экране
 * больше нет. Ждём НАБЛЮДАЕМОГО покоя, а не фиксированной паузы: фиксированная пауза
 * превратила бы замер в лотерею на медленной машине.
 */
async function settle(page, counter, { quietMs = 1200, capMs = 25000 } = {}) {
  const started = Date.now();
  let lastSeen = counter.value;
  let quietSince = Date.now();
  for (;;) {
    await page.waitForTimeout(100);
    if (counter.value !== lastSeen) {
      lastSeen = counter.value;
      quietSince = Date.now();
    }
    const busy = (await page.locator('.load-card').count()) > 0;
    if (busy) quietSince = Date.now();
    if (!busy && Date.now() - quietSince >= quietMs) return;
    if (Date.now() - started > capMs) return; // не зависаем: неполный заход честнее вечного ожидания
  }
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: WIDTH, height: 900 }, locale: 'ru-RU' });
  await context.addInitScript(() => localStorage.setItem('ndim-theme', 'light'));
  await context.addInitScript(LOADER_PROBE);
  const page = await context.newPage();

  /*
   * СЧИТАЕМ ЧТЕНИЯ ДОКУМЕНТОВ, А НЕ HTTP-ЗАПРОСЫ.
   *
   * ⚠️ Первая версия замера считала все запросы к эмулятору — и врала: Firestore ходит по
   * WebChannel, где большинство запросов служебные (закрытие канала, переоткрытие,
   * подтверждения), и их число зависит от простоя вкладки, а не от того, что читает экран.
   * Наблюдением поймано 5 → 1 → 0 запросов на трёх ОДИНАКОВЫХ заходах.
   *
   * Пути документов WebChannel передаёт в теле открытым текстом — по ним и считаем. Это и
   * есть та величина, за которую Firestore берёт деньги.
   */
  const counter = { value: 0, docs: [] };
  page.on('request', (request) => {
    if (!request.url().includes(DB_HOST)) return;
    const body = request.postData() ?? '';
    const paths = [...body.matchAll(/documents(?:%2F|\/)([A-Za-z0-9_\-]+(?:(?:%2F|\/)[A-Za-z0-9_\-]+)*)/g)];
    if (paths.length === 0) return;
    counter.value += paths.length;
    for (const match of paths) counter.docs.push(decodeURIComponent(match[1]));
  });

  // Придерживаем базу: без этого состояние загрузки на localhost не успевает существовать.
  if (SLOW_MS > 0) {
    await context.route(`**://${DB_HOST}/**`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, SLOW_MS));
      await route.continue();
    });
  }

  if (!(await signIn(page))) {
    console.error('❌ вход на стенд не удался — поднят ли `npm run stand`?');
    await browser.close();
    process.exit(1);
  }

  // Точка отсчёта: вход уже что-то прочитал, нас интересует только навигация после него.
  await settle(page, counter);

  /*
   * САМОПРОВЕРКА ЗОНДА (EXP-0065). Ноль лоадеров — самое лёгкое зелёное в мире: его даёт и
   * исправный кэш, и не установившийся наблюдатель, и переименованный класс карточки. Поэтому
   * прежде чем мерить, убеждаемся, что зонд жив И что он УЖЕ хоть раз что-то поймал на входе
   * (вход в аккаунт заведомо рисует карточку загрузки на «Профиле»).
   */
  const armed = await page.evaluate(() => /** @type {any} */ (window).__probeArmed === true);
  const probe = await page.evaluate(() => /** @type {any} */ (window).__loaders);
  if (!armed || typeof probe !== 'number') {
    console.error('❌ наблюдатель лоадеров не встал (__probeArmed !== true) — замер недостоверен');
    await browser.close();
    process.exit(1);
  }
  if (probe === 0) {
    console.error(
      '❌ зонд не поймал НИ ОДНОЙ карточки «Загрузка» даже на входе в аккаунт.\n' +
        '   Либо разметка карточки сменилась (ждём `.load-card`), либо база отвечает быстрее\n' +
        '   первой отрисовки — увеличьте --slow. Ноль в такой ситуации ничего не доказывает.',
    );
    await browser.close();
    process.exit(1);
  }
  console.log(`\n(зонд лоадеров жив: на входе поймано ${probe} карточек «Загрузка»)`);

  console.log(`\nЗАМЕР ideas/18 — навигация по кругу, ширина ${WIDTH}px, кругов: ${ROUNDS}`);
  console.log('(клики по навигации, БЕЗ перезагрузки страницы — память приложения жива)\n');

  /** @type {Record<string, {db: number[], loaders: number[]}>} */
  const table = {};
  for (const screen of SCREENS) table[screen.key] = { db: [], loaders: [] };

  const startedAt = Date.now();
  for (let round = 1; round <= ROUNDS; round += 1) {
    // Время от начала замера печатаем не для красоты: свежесть данных сервера — 60 секунд,
    // и без часов невозможно отличить «кэш не сработал» от «окно свежести честно истекло».
    const at = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `— круг ${round} (t+${at} с) ${round === 1 ? '— память холодная' : '— экраны уже открывали в этой сессии'}`,
    );
    for (const screen of SCREENS) {
      const dbBefore = counter.value;
      const loadersBefore = await page.evaluate(() => /** @type {any} */ (window).__loaders ?? 0);
      const feedBefore = await page.evaluate(() => /** @type {any} */ (window).__feedLoaders ?? 0);

      // Клик по ссылке навигации: и рельс (десктоп), и нижняя панель (телефон) дают один href.
      await page.locator(`nav a[href="${screen.href}"]`).first().click();
      await page.waitForFunction((href) => location.pathname === href, screen.href, { timeout: 15000 });
      await settle(page, counter);

      const db = counter.value - dbBefore;
      const loaders = (await page.evaluate(() => /** @type {any} */ (window).__loaders ?? 0)) - loadersBefore;
      const feed = (await page.evaluate(() => /** @type {any} */ (window).__feedLoaders ?? 0)) - feedBefore;
      table[screen.key].db.push(db);
      table[screen.key].loaders.push(loaders);
      console.log(
        `   ${screen.title.padEnd(14)} чтений документов: ${String(db).padStart(3)} · «Загрузка» экрана: ${loaders}` +
          (feed > 0 ? ` (+${feed} якорь ленты — так и должно быть)` : ''),
      );
    }
  }

  console.log('\nИТОГ (обращения к базе / карточки «Загрузка» по кругам):');
  let warmDb = 0;
  let warmLoaders = 0;
  for (const screen of SCREENS) {
    const { db, loaders } = table[screen.key];
    console.log(
      `  ${screen.title.padEnd(14)} база ${db.join(' → ').padEnd(16)} лоадеры ${loaders.join(' → ')}`,
    );
    warmDb += db.slice(1).reduce((a, b) => a + b, 0);
    warmLoaders += loaders.slice(1).reduce((a, b) => a + b, 0);
  }
  console.log(
    `\n  ЦЕНА ПОВТОРНЫХ ЗАХОДОВ (круги 2…${ROUNDS}): чтений документов ${warmDb} · «Загрузка» экрана ${warmLoaders}`,
  );
  console.log('  Цель ideas/18: «Загрузка» экрана — НОЛЬ (данные уже в памяти приложения).');
  console.log(
    `  ⚠️ Обращения к базе честно обнуляются только ВНУТРИ окна свежести (60 с для данных\n` +
      `     сервера синхронизации): за окном топ и статистика ТИХО освежаются — это замысел,\n` +
      `     а не дефект (stale-while-revalidate). Круг с --slow ${SLOW_MS} длится дольше окна,\n` +
      `     поэтому для чистого счёта чтений гоняйте отдельно: --slow 0.\n`,
  );

  await browser.close();
}

await main();

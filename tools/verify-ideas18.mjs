/**
 * QA-прогон `ideas/18` живым браузером на стенде: НАВИГАЦИЯ НЕ ГРУЗИТ ЗАНОВО ТО, ЧТО УЖЕ В ПАМЯТИ.
 *
 * Слово владельца (2026-07-27): «всякий раз, когда открываешь Профиль, Связи, Измерения,
 * Пространство, Настройки — выглядит так, словно страница с нуля загружает данные, даже если
 * эту страницу в текущей сессии открывали… это точно нужно где-то локально кешировать в рамках
 * сессии, а не перезагружать при каждой навигации».
 *
 * Модель решения взята у индустрии, а не придумана: stale-while-revalidate (RFC 5861) —
 * первоисточники и разбор в `researches/17`; реализация — `src/lib/data/cache.ts`.
 *
 * ЧТО СТЕРЕЖЁТ ЭТОТ СТРАЖ (по убыванию важности):
 *   1. **Повторный заход не рисует «Загрузку» экрана.** Это ровно то, что видит владелец глазами.
 *   2. **Повторный заход не стоит НИ ОДНОГО обращения к базе.** Это деньги (канон `AGENT_GUIDE`
 *      → «Модель данных»). С решения владельца (интервью №005, В4) окна свежести у цифр больше
 *      нет вовсе — они живут всю сессию; минутным остался лишь пульс сервера.
 *   3. **ПАРНАЯ ПРОВЕРКА (EXP-0070): первый заход обязан и читать, и показывать лоадер.** Без неё
 *      обе проверки выше были бы зелёными на приложении, которое вообще не ходит в базу, — ноль
 *      событий даёт и исправный код, и полностью сломанный.
 *   4. **Моя оценка гасит кэш.** Иначе «кэш на сессию» превратился бы в показ устаревшей правды.
 *
 * ⚠️ Ходим КЛИКАМИ по навигации, а не `page.goto`: перезагрузка стирает память приложения, и
 * страж проверял бы холодный старт вместо навигации — то есть не то, о чём говорит владелец.
 *
 * ⚠️ Базу придерживаем роутом: на голом localhost состояние загрузки не успевает отрисоваться,
 * и «лоадеров нет» означало бы «стенд слишком быстр» (тот же класс, что в `bugs/70`).
 *
 * Требует поднятый `npm run stand`. Скриншоты — test-results/ideas18/.
 * Запуск: node tools/verify-ideas18.mjs [--quick]
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const STAND = 'http://localhost:5173';
const AUTH = 'http://127.0.0.1:9099';
const PROJECT = 'demo-ndim-dev';
const DB_HOST = '127.0.0.1:8181';
const SHOTS = 'test-results/ideas18';
const QUICK = process.argv.includes('--quick');

/** Придержка запроса к базе — приводим localhost к латентности живой сети. */
const SLOW_MS = 350;
/** Отсчёт автосохранения оценки — 5 с (`bugs/54`). Ждём заведомо дольше. */
const COUNTDOWN_MS = 8000;

const SCREENS = [
  { key: 'profile', href: '/profile', title: 'Профиль' },
  { key: 'relations', href: '/relations', title: 'Связи' },
  { key: 'space', href: '/space', title: 'Пространство' },
  { key: 'dims', href: '/dims', title: 'Измерения' },
  { key: 'menu', href: '/menu', title: 'Меню' },
];

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/**
 * Зонд карточек «Загрузка» с РАЗДЕЛЕНИЕМ двух разных вещей под одной разметкой.
 *
 * Кольцо внутри `.loader` — якорь бесконечной прокрутки «Измерений»: он стоит в хвосте ленты
 * всегда, пока она не исчерпана, и так было в 1.x (`allDimsLoader`). Дефектом он не является.
 * Кольцо в `.state` — это «экран ещё не показал данные», и вот оно — предмет `ideas/18`.
 * Считать их одним числом значило бы мерить не дефект (EXP-0066).
 */
const LOADER_PROBE = () => {
  const w = /** @type {any} */ (window);
  w.__loaders = 0;
  w.__feedLoaders = 0;
  w.__probeArmed = false;
  const count = (node) => {
    if (!(node instanceof Element)) return;
    const card = node.matches?.('.load-card') ? node : node.querySelector?.('.load-card');
    if (!card) return;
    if (card.closest('.loader')) w.__feedLoaders += 1;
    else w.__loaders += 1;
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) count(node);
  });
  // Наблюдаем ДОКУМЕНТ: скрипт стартует до разбора разметки, корневого элемента может ещё не
  // быть, и `observe(null)` бросил бы — зонд молча остался бы нулём (успокаивающий ноль).
  observer.observe(document, { childList: true, subtree: true });
  w.__probeArmed = true;
  if (document.querySelector('.load-card')) w.__loaders += 1;
};

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

/** Барьер «экран догрузился»: база умолкла И карточки «Загрузка» на экране нет. */
async function settle(page, counter, { quietMs = 700, capMs = 20000 } = {}) {
  const started = Date.now();
  let lastSeen = counter.value;
  let quietSince = Date.now();
  for (;;) {
    await page.waitForTimeout(100);
    if (counter.value !== lastSeen) {
      lastSeen = counter.value;
      quietSince = Date.now();
    }
    const busy = (await page.locator('.state .load-card').count()) > 0;
    if (busy) quietSince = Date.now();
    if (!busy && Date.now() - quietSince >= quietMs) return;
    if (Date.now() - started > capMs) return;
  }
}

const probeLoaders = (page) => page.evaluate(() => /** @type {any} */ (window).__loaders ?? 0);

/**
 * Переход на экран кликом по навигации + замер его цены.
 *
 * ⚠️ Ссылку берём ТОЛЬКО видимую. В разметке навигаций две — десктопный рельс и нижняя панель, —
 * и на телефоне рельс остаётся в DOM, просто скрыт. `.first()` без этого фильтра выбирал
 * невидимую ссылку и страж падал таймаутом вместо проверки.
 */
async function visit(page, counter, screen) {
  const dbBefore = counter.value;
  const docsBefore = counter.docs.length;
  const loadersBefore = await probeLoaders(page);
  await page.locator(`nav a[href="${screen.href}"]:visible`).first().click();
  await page.waitForFunction((href) => location.pathname === href, screen.href, { timeout: 15000 });
  await settle(page, counter);
  return {
    db: counter.value - dbBefore,
    docs: counter.docs.slice(docsBefore),
    loaders: (await probeLoaders(page)) - loadersBefore,
  };
}

async function run(browser, { theme, width }) {
  console.log(`\n── тема ${theme}, ширина ${width}px ──`);
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU' });
  await context.addInitScript((value) => localStorage.setItem('ndim-theme', value), theme);
  await context.addInitScript(LOADER_PROBE);
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', (event) => errors.push(String(event)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  /*
   * СЧЁТЧИК ЧТЕНИЙ, А НЕ ЗАПРОСОВ.
   *
   * ⚠️ Первая версия считала все HTTP-запросы к эмулятору — и врала. Firestore ходит по
   * WebChannel, и большинство запросов там служебные: закрытие канала (`TYPE=terminate`),
   * его переоткрытие, подтверждения. Их число зависит от простоя вкладки, а не от того, что
   * читает экран: наблюдением поймано 5 → 1 → 0 запросов на трёх ОДИНАКОВЫХ заходах.
   * Страж на такой метрике был бы лотереей.
   *
   * Считаем то, за что берут деньги: запросы, в теле которых есть ПУТИ ДОКУМЕНТОВ. Их
   * WebChannel передаёт открытым текстом (`documents/relations/{uid}`), и это ровно операции
   * чтения. Пути ещё и запоминаем — по ним видно, КТО именно сходил в базу.
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
  await context.route(`**://${DB_HOST}/**`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, SLOW_MS));
    await route.continue();
  });

  if (!(await signIn(page))) {
    check('вход на стенд', false, 'поднят ли `npm run stand`?');
    await context.close();
    return;
  }
  await settle(page, counter);

  if (!(await page.evaluate(() => /** @type {any} */ (window).__probeArmed === true))) {
    check('наблюдатель карточек «Загрузка» встал', false, 'замер недостоверен, проверки пропущены');
    await context.close();
    return;
  }

  /*
   * ЗАМЕР ТРОЙКАМИ: «холодный заход → соседний экран → тот же экран снова».
   *
   * ⚠️ Так сделано НЕ для красоты. Круг из пяти экранов длится десятки секунд, и пока данные
   * сервера синхронизации были свежи 60 секунд, «0 чтений» на втором круге зависело бы от того,
   * успел ли прогон уложиться в окно. Страж, зелёный или красный по секундомеру, — это лотерея,
   * а не страж. В тройке между заходами проходят секунды, и проверка меряет КЭШ, а не часы.
   *
   * С решения владельца (интервью №005, В4) цифры живут всю сессию, и от часов не зависит уже
   * ничего, — но тройки оставлены: они же дают парную проверку ниже, и они переживут любое
   * будущее изменение контракта свежести. Минутным остался только ПУЛЬС сервера (`FRESH.pulse`),
   * и «Пространство» его честно перечитает, если прогон растянется дольше минуты, — поэтому
   * проверка «возврат не стоит чтений» и меряется тройкой, а не кругом.
   *
   * Холодный заход в каждой тройке — обязательная парная проверка (EXP-0070): если первый заход
   * не читает базу и не рисует лоадер, ноль второго не доказывает ничего, потому что отсутствие
   * события даёт и исправный код, и полностью сломанный.
   */
  let coldDbTotal = 0;
  let coldLoadersTotal = 0;

  for (const screen of SCREENS) {
    // Сосед, через которого уходим и возвращаемся: экран обязан быть РАЗМОНТИРОВАН, иначе
    // проверялась бы не навигация, а то, что клик по текущей вкладке ничего не делает.
    const pivot = screen.key === 'menu' ? SCREENS[0] : SCREENS[4];

    /*
     * ⚠️ Уходим на соседа ПЕРЕД холодным заходом. Без этого шага для экрана, на котором мы уже
     * стоим, «холодный заход» был бы кликом по своей же вкладке — навигации нет, компонент не
     * пересоздаётся, ноль чтений. И тогда «тёплым» оказывался бы ПЕРВЫЙ настоящий заход, а
     * страж падал бы, обвиняя кэш в том, чего тот не делал (поймано наблюдением).
     */
    await visit(page, counter, pivot);
    const cold = await visit(page, counter, screen);
    await visit(page, counter, pivot);
    const warm = await visit(page, counter, screen);

    coldDbTotal += cold.db;
    coldLoadersTotal += cold.loaders;

    check(`${screen.title}: возврат БЕЗ карточки «Загрузка»`, warm.loaders === 0, `карточек: ${warm.loaders}`);
    check(
      `${screen.title}: возврат не стоит ни одного чтения`,
      warm.db === 0,
      warm.db === 0 ? '' : `прочитано: ${warm.docs.join(' · ')}`,
    );
  }

  check('ПАРНАЯ: холодные заходы РЕАЛЬНО читали базу', coldDbTotal > 0, `обращений: ${coldDbTotal}`);
  check(
    'ПАРНАЯ: холодные заходы РЕАЛЬНО рисовали «Загрузку»',
    coldLoadersTotal > 0,
    `карточек: ${coldLoadersTotal}`,
  );

  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/warm-${theme}-${width}.png`, fullPage: false });

  /*
   * ИНВАЛИДАЦИЯ. Кэш, который нельзя погасить, — это не кэш, а замороженная правда. Ставим
   * оценку, дожидаемся автосохранения и возвращаемся: экран ОБЯЗАН сходить в базу заново.
   */
  if (!QUICK) {
    await page.locator(`nav a[href="/dims"]:visible`).first().click();
    await page.waitForFunction(() => location.pathname === '/dims', { timeout: 15000 });
    await settle(page, counter);

    const card = page.locator('article.dim').first();
    const star = card.locator('.stars .st[aria-label="7"]');
    if ((await star.count()) > 0) {
      const ratedDim = await card.getAttribute('data-dim');
      await star.click();
      await page.waitForTimeout(COUNTDOWN_MS); // ждём дольше отсчёта: до записи гасить нечего

      const after = await visit(page, counter, SCREENS[0]); // на «Профиль»
      check('после МОЕЙ оценки профиль перечитывается', after.db > 0, `обращений: ${after.db}`);

      const backToDims = await visit(page, counter, SCREENS[3]);
      check('после МОЕЙ оценки «Измерения» перечитываются', backToDims.db > 0, `обращений: ${backToDims.db}`);

      /*
       * УБОРКА СЛЕДА (bugs/103). Оценка ставилась ради замера инвалидации, и оставить её —
       * значит изменить общую базу стенда для всех последующих стражей: verify-bug64 считает
       * длину ленты «Все» от числа оценённых, и два прогона этого файла (две конфигурации)
       * укорачивали её на две карточки — свип красил bug64 «42 из 44» на исправном продукте.
       * Убираем тем же путём, каким чистит `removeRating`: документ оценки удаляется, точка
       * помечается dirty (сервер синхронизации стенда пересчитает честно).
       */
      if (ratedDim) {
        const base = `http://${DB_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
        const who = await fetch(
          `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: 'dev@ndim.space', password: 'ndim-dev-stand', returnSecureToken: true }),
          },
        ).then((r) => r.json());
        await fetch(`${base}/points/${who.localId}/dims/${ratedDim}`, {
          method: 'DELETE',
          headers: { Authorization: 'Bearer owner' },
        });
        await fetch(
          `${base}/points/${who.localId}?updateMask.fieldPaths=dirty&updateMask.fieldPaths=updated`,
          {
            method: 'PATCH',
            headers: { Authorization: 'Bearer owner', 'content-type': 'application/json' },
            body: JSON.stringify({
              fields: { dirty: { booleanValue: true }, updated: { integerValue: String(Date.now()) } },
            }),
          },
        );
        const gone = await fetch(`${base}/points/${who.localId}/dims/${ratedDim}`, {
          headers: { Authorization: 'Bearer owner' },
        });
        check('след оценки убран: база стенда возвращена в исходное', gone.status === 404, `статус ${gone.status}`);
      } else {
        check('след оценки убран: база стенда возвращена в исходное', false, 'data-dim не прочитан');
      }
    } else {
      check('нашлась карточка измерения для оценки', false, 'сид стенда изменился?');
    }
  }

  check('консоль чиста', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

async function main() {
  const browser = await chromium.launch();
  // Канон сдачи (`plans/06`): обе темы и обе ширины. Комбинации подобраны так, чтобы каждая
  // тема и каждая ширина были покрыты, а прогон оставался коротким.
  const combos = QUICK
    ? [{ theme: 'light', width: 1440 }]
    : [
        { theme: 'light', width: 1440 },
        { theme: 'dark', width: 390 },
      ];
  for (const combo of combos) await run(browser, combo);
  await browser.close();

  console.log(failures === 0 ? '\n✅ ideas/18: все проверки зелёные' : `\n❌ провалов: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();

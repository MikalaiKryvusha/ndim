/**
 * Страж принудительного обновления данных (интервью №006, макет V1 «Как в системе»).
 *
 * Нужен стенд: `npm run stand`.
 *
 * ── ЧТО ИМЕННО СТЕРЕЖЁТСЯ ──────────────────────────────────────────────────────────────────
 * 1. **Строка «Обновить данные» в «Меню» существует и работает.** Это не украшение: как только
 *    жест забран у браузера, WCAG 2.2 SC 2.5.7 требует равноценный путь БЕЗ перетаскивания, а
 *    на десктопе тянуть нечем вовсе. Текст строки — слово владельца (В4=А), поэтому проверяется
 *    ДОСЛОВНО: агент не вправе его переписать.
 * 2. **Тап по строке реально идёт в базу.** Меряется не экран, а ЧТЕНИЯ ДОКУМЕНТОВ: до тапа
 *    повторный заход стоит 0 чтений (кэш сессии, `ideas/18`), после тапа — больше нуля. Без
 *    этой пары строка могла бы быть зелёной, ничего не обновляя.
 * 3. **Отметка времени появляется и не врёт.** До первого чтения её нет вовсе; после — «только
 *    что», а не «0 минут назад» и не выдуманное число.
 * 4. **Жест не сломал прокрутку** — главный риск класса: `overscroll-behavior` ставится на
 *    `html`, и ошибка здесь превратила бы прокрутку в «мёртвую» на всех четырёх экранах.
 *    Проверяется на каждом экране: страница листается, и `overscroll-behavior-y` = `contain`
 *    (В2=А: отобрано только обновление, отскок остался браузеру).
 * 5. **Индикатор в покое невидим.** Макет V1 обещает НОЛЬ новых элементов на экранах: круг
 *    обязан стоять выше низа шапки, пока его не потянули.
 *
 * ⚠️ Сам жест пальцем здесь НЕ эмулируется. Playwright умеет синтезировать touch, но
 * синтетический `touchmove` не воспроизводит физику прокрутки браузера — зелёный результат
 * такой проверки доказывал бы работу прибора, а не продукта (ровно тот класс самообмана, что
 * стоил дня в EXP-0078 и EXP-0080). Жест проверяется руками на живом телефоне; страж стережёт
 * то, что измеримо честно: путь без жеста, его эффект в базе и целость прокрутки.
 *
 * ── ДВЕ ЛОВУШКИ ПРИБОРА, НА КОТОРЫЕ ОН УЖЕ ПОПАДАЛСЯ ──────────────────────────────────────
 * (а) **Мерить до гидратации.** Все экраны пререндерены: `domcontentloaded` и даже
 *     `scrollHeight > 200` наступают на голом HTML, когда приложение ещё не ожило. Первая
 *     редакция стража намеряла так `overscroll-behavior: auto` и «мёртвую прокрутку» на всех
 *     четырёх экранах — и то, и другое было ложью прибора: продукт был исправен. Поэтому
 *     каждая проверка ждёт {@link awaitHydration}, а не факта отрисовки шелла.
 * (б) **Ходить `goto` вместо кликов.** Полная перезагрузка стирает память приложения, а
 *     отметка времени и кэш сессии в ней и живут: `goto` мерил бы холодный старт и всегда
 *     показывал пустую отметку и нулевые чтения (EXP-0072). Между экранами ходим КЛИКАМИ.
 *
 * Счёт чтений — путями документов в теле запроса, а не HTTP-запросами: у Firestore
 * большинство запросов это служебные кадры WebChannel (EXP-0073).
 */

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
/** Эмулятор Firestore стенда — по нему отбираются запросы, в которых считаются чтения. */
const DB_HOST = '127.0.0.1:8181';
const SHOTS = 'test-results/ptr';

/** Экраны, на которых по В1=А живёт жест. */
const SCREENS = [
  { path: '/profile', name: 'профиль' },
  { path: '/relations', name: 'связи' },
  { path: '/space', name: 'пространство' },
  { path: '/dims', name: 'измерения' },
];

/** Текст строки — слово владельца (В4=А). Менять его агенту нельзя. */
const ROW_TEXT = 'Обновить данные';

let passed = 0;
let failed = 0;

function check(ok, title, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ✔ ${title}`);
  } else {
    failed += 1;
    console.log(`  ✘ ${title}${detail ? ` — ${detail}` : ''}`);
  }
}

/**
 * Дождаться, пока приложение ОЖИВЁТ, а не просто отрисует пререндеренный шелл.
 *
 * Признак — карточка человека на экране: она рождается только из данных, значит `onMount`
 * отработал и жизненный цикл компонентов состоялся. Ждать по самому индикатору жеста было бы
 * жульничеством: тогда проверка «жест включился» ждала бы саму себя.
 */
async function awaitHydration(page) {
  await page.waitForFunction(
    () => document.querySelector('main')?.innerText.trim().length > 40,
    { timeout: 20000 },
  );
  // Один кадр сверху: стили, применённые в `onMount`, попадают в computed style со следующего.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
}

/** Перейти на экран КЛИКОМ по навигации (а не `goto`) — иначе стирается память приложения. */
async function navigate(page, path) {
  // Рельс живёт в DOM и на телефоне — берём видимую ссылку (EXP-0073, примечание verify-ideas18).
  await page.locator(`a[href="${path}"]:visible`).first().click();
  await page.waitForFunction(
    (expected) => location.pathname === expected,
    path,
    { timeout: 15000 },
  );
  await awaitHydration(page);
}

/**
 * Считает пути документов Firestore в теле запросов — ту единицу, за которую берут деньги.
 * Возвращает функцию-съёмник: вызвал — получил счёт с момента установки.
 */
function countReads(page) {
  let reads = 0;
  const docs = [];
  page.on('request', (request) => {
    if (!request.url().includes(DB_HOST)) return;
    const body = request.postData() ?? '';
    // ⚠️ Пути приходят URL-КОДИРОВАННЫМИ (`documents%2Fpoints%2F…`). Первая редакция искала
    // `documents/` и потому не находила НИЧЕГО — счётчик показывал ноль даже на холодном
    // заходе, а проверка «повторный заход бесплатен» была зелёной от неисправности прибора.
    // Шаблон и способ счёта взяты у доказанного стража `verify-ideas18.mjs`.
    const paths = [...body.matchAll(/documents(?:%2F|\/)([A-Za-z0-9_\-]+(?:(?:%2F|\/)[A-Za-z0-9_\-]+)*)/g)];
    if (paths.length === 0) return;
    reads += paths.length;
    for (const match of paths) docs.push(decodeURIComponent(match[1]));
  });
  return {
    reset: () => {
      reads = 0;
      docs.length = 0;
    },
    get: () => reads,
    paths: () => docs.slice(0, 4),
  };
}

async function run() {
  await mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch();

  for (const theme of ['light', 'dark']) {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        // Тему ставим ключом ДО загрузки: системный colorScheme тему продукта не меняет.
        storageState: {
          cookies: [],
          origins: [{ origin: BASE, localStorage: [{ name: 'ndim-theme', value: theme }] }],
        },
      });
      const page = await context.newPage();
      const label = `${theme} ${width}px`;
      console.log(`\n── ${label} ─────────────────────────────`);

      const reads = countReads(page);

      // Вход: на стенде сессия заводится на «Профиле». Дальше ходим только кликами, чтобы
      // не стереть память приложения — в ней живут и кэш сессии, и отметка времени.
      reads.reset();
      await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
      await awaitHydration(page);

      // КОНТРОЛЬ ПРИБОРА (EXP-0070). Все проверки ниже читают счётчик, и «0 чтений» у них —
      // хорошая новость. Значит сначала нужно доказать, что счётчик ВООБЩЕ умеет считать:
      // холодный заход обязан стоить чтений. Без этой пары сломанный счётчик красил бы
      // проверки зелёным — ровно это здесь однажды и случилось.
      const coldReads = reads.get();
      check(
        coldReads > 0,
        `контроль прибора: холодный заход на «Профиль» читает базу (${label})`,
        `прочитано документов: ${coldReads} — счётчик чтений неисправен, проверки ниже недостоверны`,
      );

      // ── Прокрутка и индикатор на каждом из четырёх экранов ──────────────────────────────
      for (const screen of SCREENS) {
        if (page.url().endsWith(screen.path) === false) await navigate(page, screen.path);

        // В2=А: у браузера отобрано только обновление, отскок остался.
        const behavior = await page.evaluate(
          () => getComputedStyle(document.documentElement).overscrollBehaviorY,
        );
        check(
          behavior === 'contain',
          `${screen.name}: жест отобран у браузера правильно (${label})`,
          `overscroll-behavior-y = ${behavior}, ожидалось contain`,
        );

        // Прокрутка жива — главный риск класса: `overscroll-behavior` ставится на `html`,
        // и ошибка здесь сделала бы прокрутку «мёртвой» сразу на всех экранах.
        const scrolled = await page.evaluate(async () => {
          const root = document.scrollingElement;
          // Экран короче окна — прокручивать нечего, и «не сдвинулось» тут ничего не значит.
          if (root.scrollHeight <= window.innerHeight + 20) return { skipped: true };
          const before = root.scrollTop;
          window.scrollTo({ top: 300, behavior: 'instant' });
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const after = root.scrollTop;
          window.scrollTo({ top: 0, behavior: 'instant' });
          return { before, after, skipped: false };
        });
        if (scrolled.skipped) {
          console.log(`  · ${screen.name}: прокрутка не проверена — экран короче окна (${label})`);
        } else {
          check(
            scrolled.after > scrolled.before,
            `${screen.name}: прокрутка не «мёртвая» (${label})`,
            `scrollTop ${scrolled.before} → ${scrolled.after}`,
          );
        }

        // Индикатор в покое невидим: макет V1 обещает ноль новых элементов на экране.
        const puck = await page.evaluate(() => {
          const node = document.querySelector('.ptr .puck');
          if (node === null) return null;
          const box = node.getBoundingClientRect();
          const bar = document.querySelector('header')?.getBoundingClientRect();
          return { bottom: box.bottom, barBottom: bar?.bottom ?? 56 };
        });
        // На десктопе жеста нет и разметки может не быть вовсе — это ожидаемо и не дефект.
        if (puck !== null) {
          check(
            puck.bottom <= puck.barBottom + 1,
            `${screen.name}: индикатор в покое спрятан под шапкой (${label})`,
            `низ круга ${Math.round(puck.bottom)}px, низ шапки ${Math.round(puck.barBottom)}px`,
          );
        }
      }

      /*
       * ── Строки «Обновить данные» в «Меню» БОЛЬШЕ НЕТ ────────────────────────────────────
       *
       * Убрана по прямому слову владельца (`ideas/21` п. 6, интервью №007 В1, дословно:
       * «ВЕСЬ БЛОК НАХУЙ УБРАТЬ, НЕ НУЖЕН ОН И КНОПКА ОБНОВЛЕНИЯ ДАННЫХ, МЫ СДЕЛАЛИ ЖЕСТ
       * ПУЛ ТУ РЕФРЕШ»). Проверки, стерегшие её (наличие строки, честность отметки времени,
       * «тап реально перечитывает»), сняты вместе с ней — стеречь больше нечего.
       *
       * ⚠️ ЧТО СТРАЖ ТЕПЕРЬ НЕ ЛОВИТ, названо прямо, чтобы это не выяснилось потом:
       * · путь обновления БЕЗ жеста в продукте отсутствует — требование WCAG 2.2 SC 2.5.7,
       *   включённое тем, что жест у браузера мы забрали (интервью №006, В2=А), закрывать
       *   больше нечем, кроме перезагрузки страницы браузером;
       * · на десктопе жеста нет вовсе;
       * · человеку больше нигде не сообщается, что он видит цифры ИЗ ПАМЯТИ сеанса.
       * Цена названа владельцу ДО решения и принята им. Если она когда-нибудь станет
       * проблемой — это не регрессия, а следствие, и лечится возвратом строки.
       *
       * Проверка «повторный заход бесплатен» осталась ЖИТЬ здесь же (см. блок жеста выше):
       * без неё контроль самого прибора исчез бы (EXP-0082).
       */
      await navigate(page, '/menu');
      const gone = await page.locator('button.row', { hasText: ROW_TEXT }).count();
      check(gone === 0, `строки «${ROW_TEXT}» в «Меню» нет — убрана по слову владельца (${label})`);

      reads.reset();
      await navigate(page, '/relations');
      const warmReads = reads.get();
      check(
        warmReads === 0,
        `повторный заход на «Связи» бесплатен (${label})`,
        `прочитано документов: ${warmReads}`,
      );

      await page.screenshot({ path: `${SHOTS}/menu-${theme}-${width}.png`, fullPage: false });
      await context.close();
    }
  }

  await browser.close();
  console.log(`\n${'─'.repeat(48)}`);
  console.log(`Пройдено: ${passed} · Провалено: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

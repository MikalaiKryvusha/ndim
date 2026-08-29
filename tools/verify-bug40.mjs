/**
 * Страж загрузочного щита (bugs/40, пункт 2) — на стенде (`npm run stand`).
 *
 * Что стережём. Владелец: «В оригинальном NDim был загрузочный экран, который не показывал
 * приложение, пока оно определяло состояние пользователя, а затем красиво открывало нужный
 * экран, без дёрганых переходов». Канон 1.x снят в `researches/12` → «Boot-экран: механика
 * целиком»; замер до кода — `tools/measure-bug40.mjs` (было 4–5 кадров лендинга, 0 кольца).
 *
 * ⚠️ ГЛАВНЫЙ РИСК КЛАССА — щит у ГОСТЯ. Корень это единственная индексируемая страница
 * продукта; накрыть её щитом значило бы обменять дефект на несравнимо худший. Поэтому
 * проверка «гость видит лендинг сразу» стоит здесь первой и падает громче остальных.
 *
 * ⚠️ КОНТРОЛЬ САМОГО ПРИБОРА (EXP-0082). Половина здешних утверждений — «щита НЕТ» и «кадров
 * лендинга НОЛЬ», то есть ноль как хорошая новость. Такое зелёное надо уметь отличать от
 * сломанного счётчика, поэтому каждая пара проверок замкнута: там, где щита быть не должно,
 * лендинг ОБЯЗАН быть виден, а там, где щит обязан быть, — обязано быть видно его кольцо.
 * Прибор, разучившийся видеть лендинг, покраснеет на своей же парной проверке.
 *
 * Видимость меряем не селектором, а вопросом к браузеру `elementFromPoint`: щит и лендинг
 * лежат в разметке ОБА и ВСЕГДА (лендинг пререндерен, щит прячется стилем) — существование
 * узла здесь не значит ничего.
 *
 * ⚠️⚠️ ПРАВИШЬ `src/app.html` — ПЕРЕЗАПУСТИ СТЕНД (EXP-0083). `vite dev` читает шаблон
 * оболочки при старте и НЕ перечитывает при изменении: HMR обновляет `.svelte` и `.ts`, а
 * `app.html` остаётся прежним. Прогон после правки шаблона без перезапуска меряет предыдущую
 * версию продукта — здесь это дало подряд два ложных вывода. Дешёвая страховка перед тем, как
 * верить числам: `curl -s http://localhost:5173/ | grep <уникальный маркер правки>` (и маркер
 * должен быть уникален — слова из комментария рядом греп находит тоже, EXP-0084).
 *
 * Запуск: node tools/verify-bug40.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const OUT = 'test-results/bug40';
mkdirSync(OUT, { recursive: true });

const THEMES = ['light', 'dark'];
const SIZES = [
  { w: 390, h: 780, name: '390' },
  { w: 1440, h: 900, name: '1440' },
];

let pass = 0;
const fails = [];

function check(ok, what) {
  if (ok) pass++;
  else fails.push(what);
}

/**
 * Что человек РЕАЛЬНО видит в этот кадр — плюс состав щита тем же движением.
 *
 * ⚠️ Состав снимается ЗДЕСЬ, а не отдельным вызовом до трассы, и это не мелочь: щит на
 * стенде живёт ~60 мс (Auth отвечает мгновенно), а каждый вызов в страницу стоит кадр.
 * Отдельный «сначала состав, потом трасса» опаздывал — трасса заставала уже /profile и
 * сообщала, что щита не было вовсе, на исправном продукте.
 */
const LOOK = () => {
  const top = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
  const shield = !!(top && top.closest && top.closest('#boot'));
  const boot = document.getElementById('boot');
  const ring = document.getElementById('boot-ring');
  const long = document.getElementById('boot-long');
  const box = boot ? boot.getBoundingClientRect() : null;
  return {
    shield,
    landing: !shield && /Добро пожаловать|Welcome to/.test(document.body.innerText || ''),
    path: location.pathname,
    covers: !!box && box.width >= innerWidth - 1 && box.height >= innerHeight - 1,
    sign: !!boot && !!boot.querySelector('svg circle'),
    // Строка ровно одна: обе языковые версии лежат в разметке (приём 1.x), лишнюю обязан
    // прятать язык документа. `includes` здесь мало — он зелен и на «Пространство NDimNDim
    // Space», то есть ровно на том дефекте, который тут и стерегут.
    name: (document.getElementById('boot-name')?.innerText || '').trim() === 'Пространство NDim',
    ringSpins: !!ring && getComputedStyle(ring).animationName !== 'none',
    // ⚠️ Спрашиваем ВИДИМОСТЬ, а не атрибут `hidden`: правило `#boot-long { display: flex }`
    // перебивает браузерное `[hidden] { display: none }` по специфичности, и совет о долгой
    // загрузке показывался сразу — при честном `hidden === true`. Проверка по атрибуту была
    // зелёной на дефекте, который видно на скриншоте невооружённым глазом.
    longHidden: !!long && getComputedStyle(long).display === 'none',
    bg: boot ? getComputedStyle(boot).backgroundColor : '',
    scrollLocked: getComputedStyle(document.documentElement).overflow === 'hidden',
  };
};

/**
 * Покадровая трасса со стороны Node: редирект уничтожает контекст исполнения страницы.
 *
 * 🔴 ОСТАНОВ — ПО ПРИБЫТИЮ, А НЕ ПО УХОДУ С КОРНЯ, и это правка дефекта самого стража
 * (2026-08-22). Прежняя строка была `if (path !== '/') break;` — трасса обрывалась ровно
 * в тот миг, когда путь переставал быть корнем. А после переезда лендинга на `/ru`
 * (`plans/39`) это и есть миг ПОЯВЛЕНИЯ ЛЕНДИНГА: страж закрывал глаза за кадр до того, что
 * обязан был судить, и три недели показывал 71 зелёную проверку на живом дефекте, который
 * владелец видел своими глазами. Класс — «страж смотрит на мир, которого больше нет».
 *
 * Теперь трасса идёт, ПОКА ЧЕЛОВЕК НЕ ПРИШЁЛ ДОМОЙ (`/profile`), либо пока не кончились кадры.
 * Путь между входом и домом — это ровно то, ради чего страж существует.
 */
async function trace(page, frames = 40) {
  const out = [];
  for (let i = 0; i < frames; i++) {
    try {
      out.push(await page.evaluate(LOOK));
    } catch {
      continue; // контекст снесён навигацией — это сам переход
    }
    if (out[out.length - 1].path.startsWith('/profile')) break;
    await page.waitForTimeout(16);
  }
  return out;
}

const browser = await chromium.launch();

for (const theme of THEMES) {
  for (const size of SIZES) {
    const tag = `${theme}/${size.name}`;

    // ── 1. ГОСТЬ. Маркера нет → щита нет, лендинг виден с первого кадра ──────────────
    {
      const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h } });
      await ctx.addInitScript(`localStorage.setItem('ndim-theme', '${theme}')`);
      const page = await ctx.newPage();
      /*
       * Консоль стережём на ошибки ПРОДУКТА, а не на служебный шум транспорта.
       * Эмулятор Firestore изредка отвечает 400 на служебные каналы WebChannel
       * (`Listen/channel`, `Write/channel`) — это разрыв долгоживущего соединения, а не ответ
       * на запрос продукта. Приходит он и в сценариях, где загрузочного щита нет вовсе
       * (вход → меню → выход), а подписок Firestore наш код не создаёт ни одной
       * (`onSnapshot` — 0 вхождений в `src/`): канал держит сам SDK.
       * Оставленный без фильтра, этот шум делал стража лотереей — он падал то на dark/1440,
       * то на light/390, ничего не сообщая о щите.
       * ⚠️ Отказы ПРАВИЛ так не глушатся: они приходят исключением и сообщением
       * `permission-denied`, и их ловят ветки `pageerror` и `console` ниже.
       * Сообщение в консоли адреса не содержит, поэтому отличать приходится по ответу.
       */
      const noise = [];
      page.on('pageerror', (e) => noise.push(`исключение: ${e}`));
      page.on('response', (r) => {
        if (r.status() >= 400 && !/\/(Listen|Write)\/channel/.test(r.url())) {
          noise.push(`${r.status()} ${r.url().slice(0, 100)}`);
        }
      });
      page.on('console', (m) => {
        // «Failed to load resource» дублирует ответ, который уже разобран выше.
        if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) noise.push(m.text());
      });

      await page.goto(BASE + '/', { waitUntil: 'commit' });
      const frames = await trace(page, 30);

      check(
        frames.every((f) => !f.shield),
        `${tag}: гость увидел загрузочный щит на лендинге (${frames.filter((f) => f.shield).length} кадров) — накрыта единственная индексируемая страница`,
      );
      // Парная проверка: без неё «щита нет» было бы зелёным и на пустой странице.
      check(
        frames.some((f) => f.landing),
        `${tag}: гость не увидел лендинг ни в одном кадре — прибор слеп либо лендинг не отрисовался`,
      );
      check(!noise.length, `${tag}: консоль гостя на лендинге не чиста: ${noise[0]}`);

      await page.screenshot({ path: `${OUT}/guest-${theme}-${size.name}.png` });
      await ctx.close();
    }

    // ── 2. ВОШЕДШИЙ. Щит накрывает лендинг до самого ухода внутрь ───────────────────
    {
      const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h } });
      await ctx.addInitScript(`localStorage.setItem('ndim-theme', '${theme}')`);
      const page = await ctx.newPage();

      // Входим по-настоящему (стенд логинит dev-пользователя), а не подделываем маркер:
      // проверяем продукт, а не собственную заготовку.
      await page.goto(BASE + '/profile', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.body.innerText.length > 200, null, { timeout: 30000 });
      await page.waitForTimeout(1500);

      check(
        (await page.evaluate(() => localStorage.getItem('ndim-session'))) === '1',
        `${tag}: после входа не появился признак сессии — щит не поднимется ни у кого`,
      );

      // Открытие ПО БАЗОВОЙ ССЫЛКЕ — ровно то, что делает владелец.
      await page.goto(BASE + '/', { waitUntil: 'commit' });

      // Трасса и состав щита — одним движением: первый её кадр и есть щит на экране.
      const frames = await trace(page, 40);
      const look = frames[0] ?? {};

      check(look.shield, `${tag}: вошедший на корне НЕ увидел щит — лендинг снова мелькает`);
      check(look.sign, `${tag}: на щите нет знака N-сети`);
      check(look.name, `${tag}: на щите нет строки «Пространство NDim»`);
      check(look.ringSpins, `${tag}: кольцо на щите не вращается`);
      check(look.longHidden, `${tag}: совет «загрузка идёт долго» показан сразу, а не после ожидания`);
      check(look.scrollLocked, `${tag}: под поднятым щитом страница прокручивается`);
      // Щит обязан быть непрозрачным и в цвет темы — сквозь него не должно просвечивать.
      const dark = theme === 'dark';
      check(
        look.bg === (dark ? 'rgb(6, 11, 20)' : 'rgb(246, 248, 251)'),
        `${tag}: фон щита не в цвет темы: ${look.bg}`,
      );

      check(
        frames.every((f) => !f.landing),
        `${tag}: вошедший увидел лендинг в ${frames.filter((f) => f.landing).length} кадрах — это и есть дефект bugs/40`,
      );
      // Парная: щит не просто «был», он держался до самого перехода внутрь.
      check(
        frames.some((f) => f.shield),
        `${tag}: щит не продержался ни одного кадра трассы`,
      );
      check(
        frames.some((f) => f.path === '/profile'),
        `${tag}: редирект вошедшего внутрь не состоялся`,
      );

      // ── 2б. 🔴 ВХОД С ЯЗЫКОВОГО ЛЕНДИНГА — настоящий вход человека после `plans/39` ────
      // Корень — лишь распознаватель языка, он уводит отсюда в первом же кадре. Сам лендинг
      // живёт на `/ru` и `/en`, и туда ведут закладка, поисковая выдача и возврат по истории.
      // Пока страж судил ОДИН вход, дефект на втором прожил три недели при 71 зелёной
      // проверке (2026-08-22, третья жалоба владельца). Судим оба.
      await page.goto(`${BASE}/ru`, { waitUntil: 'commit' });
      const fromLanding = await trace(page, 40);
      check(
        fromLanding.every((f) => !f.landing),
        `${tag}: вошедший увидел лендинг на /ru в ${fromLanding.filter((f) => f.landing).length} кадрах — щит не поднялся на настоящем входе`,
      );
      check(
        fromLanding.some((f) => f.shield),
        `${tag}: на /ru щит не продержался ни одного кадра`,
      );
      check(
        fromLanding.some((f) => f.path.startsWith('/profile')),
        `${tag}: с /ru редирект вошедшего внутрь не состоялся`,
      );

      // ── 3. ВЫХОД. Маркер обязан погаснуть сам, иначе вышедшего встретит щит ────────
      // «Выйти» живёт в виджете «Аккаунт» на «Профиле» (ideas/19, переезд из «Меню»).
      await page.goto(BASE + '/profile', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.body.innerText.length > 200, null, { timeout: 30000 });
      // Виджет аккаунта появляется после загрузки данных — кнопку ЖДЁМ, а не спрашиваем
      // мгновенно: мгновенная проверка врала «кнопки нет» на исправном экране.
      const leave = page.getByRole('button', { name: /Выйти|Sign out/ }).first();
      const leaveReady = await leave
        .waitFor({ state: 'visible', timeout: 20000 })
        .then(() => true)
        .catch(() => false);
      if (leaveReady) {
        await leave.click();
        await page.waitForURL(BASE + '/', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(300);
        const after = await page.evaluate(() => ({
          mark: localStorage.getItem('ndim-session'),
          ...((el) => ({ shield: !!(el && el.closest && el.closest('#boot')) }))(
            document.elementFromPoint(innerWidth / 2, innerHeight / 2),
          ),
        }));
        check(after.mark === null, `${tag}: после выхода признак сессии остался — вышедшего встретит щит`);
        check(!after.shield, `${tag}: после выхода корень всё ещё под щитом`);
      } else {
        fails.push(`${tag}: не найдена кнопка «Выйти» — проверка выхода не выполнена`);
      }

      await ctx.close();
    }

    // ── 4. ПОРТРЕТ ЩИТА для глаз владельца ──────────────────────────────────────────
    // Отдельным заходом: на стенде Auth отвечает мгновенно, щит живёт ~60 мс и в кадр не
    // попадает. Придерживаем всё, кроме документа, — щит остаётся на экране и позирует.
    // Это только съёмка; ни одна проверка выше на неё не опирается.
    {
      const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h } });
      await ctx.addInitScript(
        `localStorage.setItem('ndim-theme', '${theme}'); localStorage.setItem('ndim-session', '1')`,
      );
      const page = await ctx.newPage();
      await page.route('**/*', (route) =>
        route.request().resourceType() === 'document' ? route.continue() : route.abort(),
      );
      await page.goto(BASE + '/ru', { waitUntil: 'commit' });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/boot-${theme}-${size.name}.png` });
      await ctx.close();
    }
  }
}

// ── 4. ПОТОЛОК ОЖИДАНИЯ (канон 1.x, 15 с) — один раз, он от темы не зависит ─────────
// Модель случая «решение так и не пришло»: браузер получил ДОКУМЕНТ, а всё остальное —
// нет (сеть легла на полпути). Инлайн-скрипт щит поднял, приложение не ожило и опустить
// его некому. Без потолка это вечный экран без единого выхода.
//
// ⚠️ Глушить `**/_app/**` для этого нельзя, хотя имя и выглядит подходящим: на `vite dev`
// модули приложения раздаются по другим адресам (`/@fs/`, `/src/…`), под шаблон не попадают,
// и приложение прекрасно оживало — проверка молча мерила не то, что называла.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(`localStorage.setItem('ndim-session', '1')`);
  const page = await ctx.newPage();
  await page.route('**/*', (route) =>
    route.request().resourceType() === 'document' ? route.continue() : route.abort(),
  );
  await page.goto(BASE + '/ru', { waitUntil: 'commit' });

  // Контроль самого прибора (EXP-0082): если щит тут не поднялся, все проверки ниже
  // были бы зелёными от того, что мерить нечего.
  const raised = await page.evaluate(() => document.documentElement.hasAttribute('data-booting'));
  check(raised, 'потолок: щит не поднялся — сценарий не воспроизведён, проверки ниже ничего не значат');

  const before = await page.evaluate(() => {
    const long = document.getElementById('boot-long');
    return !!long && getComputedStyle(long).display === 'none';
  });
  check(before, 'потолок: совет о долгой загрузке показан сразу, не дожидаясь срока');

  /*
   * Геометрия щита меряется ИМЕННО ЗДЕСЬ, где он держится долго, — и это не вопрос удобства.
   * На быстром пути щит живёт ~60 мс и успевает показаться раньше, чем применится
   * `scrollbar-gutter: stable` (bugs/59): в тот момент раскладка и окно совпадают, и
   * непокрытой полосы не существует ни при каком CSS. Мутация «100vw → 100%» на быстром
   * пути проходила незамеченной — 74/74 зелёных на щите шириной 1425 против окна 1440.
   * Полоса открывается ровно тогда, когда человеку и придётся смотреть на щит подольше.
   */
  const geom = await page.evaluate(() => {
    const box = document.getElementById('boot').getBoundingClientRect();
    return { w: Math.round(box.width), h: Math.round(box.height), inner: innerWidth, innerH: innerHeight };
  });
  check(
    geom.w >= geom.inner - 1 && geom.h >= geom.innerH - 1,
    `потолок: щит не накрывает окно целиком — ${geom.w}×${geom.h} против ${geom.inner}×${geom.innerH} (сквозь полосу виден лендинг, дефект класса bugs/65)`,
  );

  await page.waitForTimeout(16000);
  const after = await page.evaluate(() => {
    const long = document.getElementById('boot-long');
    const btn = document.getElementById('boot-reload');
    return {
      shown: !!long && getComputedStyle(long).display !== 'none',
      text: (long?.innerText || '').includes('необычно долго'),
      button: !!btn && btn.offsetParent !== null,
    };
  });
  check(after.shown, 'потолок: после 15 секунд щит молчит — вечный экран без выхода');
  check(after.text, 'потолок: нет текста «Загрузка выполняется необычно долго»');
  check(after.button, 'потолок: нет кнопки «Перезагрузить»');

  // Кадр снимаем ДО клика: клик перезагружает страницу, и щит возвращается в исходное
  // состояние — снятый после, этот кадр показывал щит без совета, то есть не то, что назван.
  await page.screenshot({ path: `${OUT}/too-long.png` });

  // Кнопка обязана РАБОТАТЬ, а не просто существовать.
  if (after.button) {
    const reloaded = page.waitForNavigation({ timeout: 10000 }).catch(() => null);
    await page.click('#boot-reload');
    check((await reloaded) !== null, 'потолок: кнопка «Перезагрузить» ничего не перезагружает');
  }

  await ctx.close();
}

await browser.close();

console.log(`\n── страж bugs/40 (загрузочный щит) ──`);
console.log(`  пройдено: ${pass}`);
console.log(`  провалов: ${fails.length}`);
for (const f of fails) console.log(`   ✗ ${f}`);
console.log(`\nскриншоты: ${OUT}`);
process.exit(fails.length ? 1 : 0);

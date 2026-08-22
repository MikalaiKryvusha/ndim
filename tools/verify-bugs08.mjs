/**
 * Живая проверка пачки 1 бага 08 (bugs/08_krinik_tests.md) на стенде.
 *
 * Мандат владельца: «тестируем агентом: ходит, снимает скриншоты, тыкает, смотрит».
 * Скрипт ходит по стенду настоящим браузером и проверяет объективно (rect'ы, URL,
 * наличие/отсутствие текста), а скриншоты складывает в test-results/bugs08/ (вне git).
 *
 *   08.1 — вошедшего (и гостя) лендинг уводит в /profile; без сессии лендинг остаётся.
 *   08.2 — вход существующего человека по почтовой ссылке БЕЗ поздравления;
 *          апгрейд гостя — С поздравлением (виджет «Профиль сохранён»).
 *   08.3 — шапка и нижняя панель во всю ширину; панель прибита к низу вьюпорта
 *          и не выталкивается длинным контентом; контент — колонной по центру.
 *
 * Почтовая ссылка добывается у эмулятора Auth по REST (`/emulator/v1/.../oobCodes`) —
 * письмо не нужно. Требует работающего стенда: `npm run stand`.
 *
 * ── РЕВИЗИЯ 2026-07-30: тут жила РОДНЯ ВАКУУМНОЙ ПРОВЕРКИ (EXP-0087) ───────────────────────
 * Эстафета прошлой сессии просила поискать её здесь, и она нашлась в трёх видах:
 *
 *   1. **`check(имя, true)`** — три проверки были зелёными ПО НАПИСАНИЮ. Они стояли после
 *      `waitForURL`/`waitFor`, то есть «доказывались» тем, что ожидание не бросило исключение.
 *      Цена: сломайся продукт — прогон падает НЕОБРАБОТАННЫМ исключением, а не красной
 *      строкой, и итог «провалов: N» не печатается вовсе. Заменены на настоящие сравнения.
 *   2. **Вакуумная проверка личности.** «Человек в своём профиле» судила по одному `pathname`,
 *      а стенд входил `dev@ndim.space` САМ на любом голом адресе — покраснеть она не могла ни
 *      при каком исходе почтового входа. Хуже: вход НОВИЧКА по ссылке стенд молча подменял
 *      dev-аккаунтом. Корень вылечен в продукте (`data/profile.ts` → `currentSession`:
 *      автовход больше НЕ подменяет живую сессию настоящего аккаунта), и теперь личность
 *      новичка проверяется его собственной почтой в «Меню» — эта проверка УМЕЕТ краснеть.
 *   3. **Устаревший селектор.** Кнопка гостевой карточки называется «Сохранить мои
 *      результаты» с `bugs/84` (В4=А, две двери), а страж искал «Сохранить результаты» и
 *      падал исключением на середине.
 *
 * Запуск: node tools/verify-bugs08.mjs
 */

import { mkdir } from 'node:fs/promises';
import { basename } from 'node:path';
import { chromium } from '@playwright/test';

import { portsFor, slotOf } from './lib/stand-slot.mjs';

/*
 * 🅿 Адрес стенда — из слота рабочего места (тестовый парк): литерал 5173 вёл страж роли на
 * dev-сервер СОСЕДА. Правка попутная и минимальная — прибор понадобился для проверки правки
 * 08.1 ниже; общий хвост литеральных адресов остаётся работой фазы 3 парка.
 */
const BASE =
  process.env.PROBE_BASE ?? `http://localhost:${portsFor(slotOf(basename(process.cwd())).slot).dev}`;
const AUTH = 'http://127.0.0.1:9099';
const PROJECT = 'demo-ndim-dev';
const SHOTS = 'test-results/bugs08';

/** Заголовок поздравления — он же критерий 08.2 (текст из profile/+page.svelte). */
const CONGRATS = 'Добро пожаловать в Пространство NDim';

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Свежая почтовая ссылка эмулятора для адреса: как из письма, только без письма. */
async function latestSignInLink(email) {
  const res = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes = [] } = await res.json();
  const mine = oobCodes.filter((c) => c.email === email && c.requestType === 'EMAIL_SIGNIN');
  const last = mine.at(-1);
  if (!last) throw new Error(`нет oobCode для ${email}`);
  return `${BASE}/profile?mode=signIn&oobCode=${last.oobCode}&apiKey=demo-api-key`;
}

/** Просит эмулятор выпустить почтовую ссылку (аналог sendSignInLinkToEmail). */
async function requestSignInLink(email) {
  const res = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=demo-api-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestType: 'EMAIL_SIGNIN', email, continueUrl: `${BASE}/profile` }),
    },
  );
  if (!res.ok) throw new Error(`sendOobCode: ${res.status} ${await res.text()}`);
  return latestSignInLink(email);
}

/** Прямоугольник элемента в координатах вьюпорта (объективнее разглядывания). */
const rect = (page, selector) =>
  page.$eval(selector, (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom };
  });

/** Новый чистый контекст: отдельный человек с пустым браузером. */
async function person(browser, viewport) {
  const context = await browser.newContext({ viewport, locale: 'ru-RU' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return { context, page, errors };
}

await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch();

try {
  // ── 08.3 — мобильная оболочка: ширина и прибитая панель ──
  console.log('08.3 · мобильная оболочка (390×740):');
  {
    const { context, page, errors } = await person(browser, { width: 390, height: 740 });
    await page.goto(`${BASE}/dims`);
    await page.waitForSelector('nav.bnav');
    // дождаться ленты, чтобы экран стал длинным
    await page.waitForSelector('main', { timeout: 15000 });
    await page.waitForTimeout(2500);

    // Ширина РАСКЛАДКИ, а не вьюпорта: `scrollbar-gutter: stable` (bugs/59) резервирует жёлоб,
    // и «во всю ширину» на 390px вьюпорта означает 375px. См. тот же разбор ниже, на 800px.
    const layoutM = await page.evaluate(() => document.body.clientWidth);
    const bar = await rect(page, 'header.bar');
    check('шапка во всю ширину раскладки', Math.round(bar.w) === layoutM, `ширина ${bar.w}, раскладка ${layoutM}`);

    const nav0 = await rect(page, 'nav.bnav');
    check('панель во всю ширину раскладки', Math.round(nav0.w) === layoutM, `ширина ${nav0.w}, раскладка ${layoutM}`);
    check('панель видна без скролла', nav0.bottom <= 740 + 1 && nav0.y > 740 - 90, `y ${nav0.y}, низ ${nav0.bottom}`);

    const scrollable = await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 50);
    check('контент длиннее экрана (сценарий выталкивания реален)', scrollable);
    await page.evaluate(() => window.scrollTo(0, Math.floor(document.documentElement.scrollHeight / 2)));
    await page.waitForTimeout(300);
    const nav1 = await rect(page, 'nav.bnav');
    check('панель прибита при скролле', nav1.bottom <= 740 + 1 && nav1.y > 740 - 90, `y ${nav1.y}, низ ${nav1.bottom}`);
    await page.screenshot({ path: `${SHOTS}/dims-mobile-scrolled.png` });

    check('консоль чиста (dims)', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }

  console.log('08.3 · планшетная ширина (800×900) — шапка тянется, контент колонной:');
  {
    const { context, page, errors } = await person(browser, { width: 800, height: 900 });
    await page.goto(`${BASE}/profile`);
    await page.waitForSelector('.head-card', { timeout: 20000 });
    /*
     * ⚠️ Сравниваем с шириной РАСКЛАДКИ, а не вьюпорта. `scrollbar-gutter: stable` (bugs/59,
     * решение владельца) резервирует жёлоб под полосу прокрутки ~15px, поэтому «во всю ширину»
     * это 785 при вьюпорте 800 — и это ПРАВИЛЬНО. Страж требовал ровно 800 и краснел на
     * исправном продукте: он был написан до bugs/59 и с тех пор мерил не то.
     */
    const layout = await page.evaluate(() => document.body.clientWidth);
    const bar = await rect(page, 'header.bar');
    check('шапка во всю ширину раскладки', Math.round(bar.w) === layout, `ширина ${bar.w}, раскладка ${layout}`);
    const nav = await rect(page, 'nav.bnav');
    check('панель во всю ширину раскладки', Math.round(nav.w) === layout, `ширина ${nav.w}, раскладка ${layout}`);
    const body = await rect(page, 'main.body');
    check('контент — колонной по центру', body.w <= 458 && body.x > 100, `ширина ${body.w}, x ${body.x}`);
    await page.screenshot({ path: `${SHOTS}/profile-tablet.png` });
    check('консоль чиста (profile)', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }

  // ── 08.1 — лендинг и сессия ──
  console.log('08.1 · лендинг: без сессии остаёмся, с сессией уводит внутрь:');
  {
    const { context, page } = await person(browser, { width: 390, height: 740 });
    /*
     * 🔴 ПРОВЕРКА УТВЕРЖДАЛА ОБРАТНОЕ ТОМУ, ЧТО ДЕЛАЕТ ПРОДУКТ (правка 2026-08-22, находка QA).
     *
     * Было: `pathname === '/'` после `waitForTimeout(2000)` с подписью «окно, в котором редирект
     * успел бы случиться». Но корень перестал быть лендингом: с `plans/39` он распознаватель
     * языка и делает `location.replace('/' + lang)` БЕЗУСЛОВНО, у всех. То есть проверка ждала
     * две секунды, чтобы убедиться в том, чего продукт не делает ни при каких условиях.
     *
     * Смысл пункта 08.1 при этом НЕ изменился и не ослаблен: «без сессии человек остаётся
     * СНАРУЖИ, с сессией его уводит ВНУТРЬ». Просто «снаружи» теперь называется `/ru` или `/en`,
     * а не `/`. Судим по этому, и ждём АДРЕСА, а не секунд: ожидание по таймеру — лотерея,
     * которая на медленной машине красит зелёным пустоту.
     */
    await page.goto(`${BASE}/`);
    await page.waitForURL(/\/(ru|en)$/, { timeout: 10000 }).catch(() => {});
    const outside = new URL(page.url()).pathname;
    check('без сессии человек остаётся СНАРУЖИ — на языковом лендинге', /^\/(ru|en)$/.test(outside), page.url());
    check('и это НЕ корень: корень стал распознавателем языка (plans/39)', outside !== '/', page.url());

    await page.goto(`${BASE}/profile`); // стенд входит сам (dev@ndim.space)
    await page.waitForSelector('.head-card', { timeout: 20000 });
    await page.goto(`${BASE}/`);
    // Ждём ОЖИДАЕМОГО адреса, но судим сравнением: провалившееся ожидание обязано дать
    // красную строку, а не необработанное исключение на середине прогона.
    await page.waitForURL('**/profile', { timeout: 10000 }).catch(() => {});
    check(
      'с сессией / уводит в /profile',
      new URL(page.url()).pathname === '/profile',
      page.url(),
    );
    await page.screenshot({ path: `${SHOTS}/landing-redirect.png` });
    await context.close();
  }

  // ── 08.2 — вход существующего: БЕЗ поздравления ──
  console.log('08.2 · существующий человек по почтовой ссылке — без поздравления:');
  {
    const { context, page, errors } = await person(browser, { width: 390, height: 740 });
    // почту «запоминаем» так же, как это делает sendLoginLink
    await page.goto(`${BASE}/`);
    await page.evaluate(() => localStorage.setItem('ndim-pending-email', 'dev@ndim.space'));
    const link = await requestSignInLink('dev@ndim.space');
    await page.goto(link);
    await page.waitForSelector('.head-card', { timeout: 20000 });
    const congrats = await page.getByText(CONGRATS).count();
    check('поздравления НЕТ', congrats === 0, `вхождений: ${congrats}`);
    check('человек в своём профиле', new URL(page.url()).pathname === '/profile', page.url());
    /*
     * ⚠️ ЧЕСТНАЯ ГРАНИЦА: для СУЩЕСТВУЮЩЕГО `dev@ndim.space` доказать личность на стенде
     * нечем. Даже если вход по ссылке провалится, голый адрес войдёт тем же dev-пользователем
     * (автовход стенда) — и любая проверка почты здесь останется зелёной по построению.
     * Поэтому здесь проверяется то, что ПРОВЕРЯЕМО (нет поздравления, мы на /profile, консоль
     * чиста), а личность доказывается ниже, на НОВИЧКЕ: у него автовход подменить сессию не
     * может, и та проверка умеет краснеть.
     */
    await page.screenshot({ path: `${SHOTS}/email-signin-existing.png` });
    check('консоль чиста (вход)', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }

  // ── 08.2 — апгрейд гостя: поздравление ОСТАЁТСЯ ──
  console.log('08.2 · гость создаёт аккаунт — поздравление на месте:');
  {
    const { context, page, errors } = await person(browser, { width: 390, height: 740 });
    const email = `newbie-${Date.now()}@test.dev`;
    await page.goto(`${BASE}/profile?guest=1`);
    // Кнопка гостевой карточки — «Сохранить мои результаты» (bugs/84, В4=А: две двери).
    await page.getByRole('button', { name: 'Сохранить мои результаты' }).click();
    await page.getByPlaceholder('Ваш адрес электронной почты').fill(email);
    await page.getByRole('button', { name: 'Получить ссылку для входа' }).click();
    await page.getByText('Мы отправили Вам письмо').waitFor({ timeout: 15000 });
    const link = await latestSignInLink(email); // ссылку отправило само приложение
    await page.goto(link);
    await page
      .getByText(CONGRATS)
      .waitFor({ timeout: 20000 })
      .catch(() => {});
    const congratsCount = await page.getByText(CONGRATS).count();
    check('поздравление показано новичку', congratsCount > 0, `вхождений: ${congratsCount}`);
    await page.screenshot({ path: `${SHOTS}/email-link-new-account.png` });

    /*
     * 🔑 ЛИЧНОСТЬ — единственная проверка этого стража, которая УМЕЕТ краснеть.
     *
     * Смотрим почту в «Меню» (карточка «Аккаунт»). Здесь автовход стенда сессию не подменяет
     * (`currentSession`: живой НАСТОЯЩИЙ аккаунт уважается), поэтому провалившийся вход дал бы
     * `dev@ndim.space` вместо адреса новичка — и проверка покраснела бы. До правки продукта
     * 30.07 подмена происходила молча, и доказать личность на стенде было нечем.
     */
    await page.goto(`${BASE}/menu`);
    /*
     * Ждём ИМЕННО почту, а не карточку: `.card` есть в пререндеренном «Манифесте» и находится
     * раньше, чем данные аккаунта приехали. Первая редакция этой проверки читала текст сразу
     * после `.card` и получала пустоту — то есть краснела на исправном продукте.
     */
    await page
      .waitForFunction(() => /[\w.+-]+@[\w.-]+/.test(document.body.innerText || ''), null, {
        timeout: 20000,
      })
      .catch(() => {});
    const shownEmail = await page.evaluate(() => {
      const match = (document.body.innerText || '').match(/[\w.+-]+@[\w.-]+/);
      return match ? match[0] : null;
    });
    check(
      'в «Меню» показана почта НОВИЧКА, а не dev-пользователя стенда',
      shownEmail === email,
      `показано: ${shownEmail ?? '—'}, ожидалось: ${email}`,
    );

    // и гость-теперь-человек с лендинга тоже уводится внутрь (08.1)
    await page.goto(`${BASE}/`);
    await page.waitForURL('**/profile', { timeout: 10000 }).catch(() => {});
    check(
      'свежий аккаунт: / уводит в /profile',
      new URL(page.url()).pathname === '/profile',
      page.url(),
    );
    check('консоль чиста (апгрейд)', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\nПРОВАЛОВ: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

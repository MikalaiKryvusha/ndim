#!/usr/bin/env node
/**
 * ПРИБОР ЗАМЕРА (не страж) — МОСТ С ЛЕНДИНГА ВНУТРЬ ПРОДУКТА, Ш8 плана 67 (фаза 5 эпика 23).
 *
 * ЗАЧЕМ. Ворота фазы названы поведением человека, а не строками кода: «попадает в анонимную
 * сессию одним нажатием и без слова „гость“» · «вошедший не разглядывает лендинг» · «поведение
 * „Назад“ СОВПАДАЕТ с наблюдением в живом Chrome» · «воронка guest_start не сломана». Юниты на
 * это не отвечают по построению: они не знают ни истории вкладки, ни того, что видит глаз.
 *
 * 🔴 ЧТО ЭТОТ ПРИБОР МЕРЯЕТ ПИКСЕЛЯМИ, А НЕ ГАБАРИТАМИ. Требование Ш2 — поп-ап «не перекрывает
 * лицо». Урок проекта (EXP-0155, EXP-0082): у ВИДИМОГО дефекта приёмка пиксельная, габарит спора
 * не решает. Поэтому здесь считается ПЕРЕСЕЧЕНИЕ прямоугольника подсказки с каждым лицом карты,
 * а не «подсказка вроде бы в углу».
 *
 * КАПКАНЫ СТЕНДА, УЧТЁННЫЕ ЗДЕСЬ:
 *   · EXP-0174 — на стенде анонимная сессия живёт только за дверью `?as=guest`, и дверь обязана
 *     стоять В КАЖДОЙ навигации: голый переход молча подменяет гостя dev-пользователем.
 *   · тема продукта — атрибут `data-theme` на <html> (ставится до отрисовки), а НЕ media-query:
 *     `emulateMedia` её не переключает. А `prefers-reduced-motion` — как раз media-query, и
 *     волны гасятся именно им.
 *   · воронка считает ОДИН шаг за визит (ключ в sessionStorage), поэтому свежий контекст на
 *     каждый заход обязателен — иначе прирост `guest_start` не наступит и прибор соврёт.
 *
 * Стенд обязан быть поднят (`npm run stand`), замок доски — взят.
 *   node tools/probe-bridge.mjs [--base http://localhost:5173] [--headed]
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const BASE = opt('--base', 'http://localhost:5173').replace(/\/$/, '');
const HEADED = argv.includes('--headed');
const FIRESTORE = 'http://127.0.0.1:8181';
const PROJECT = 'demo-ndim-dev';
const OUT = 'test-results/probe-bridge';
mkdirSync(OUT, { recursive: true });

if (!/localhost|127\.0\.0\.1/.test(BASE)) {
  console.error('Только стенд: прибор заводит гостей и двигает воронку — в бою это портило бы числа.');
  process.exit(1);
}

let pass = 0;
let fail = 0;
const check = (ok, name, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? '  OK  ' : '  FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};
const note = (text) => console.log(`   ·   ${text}`);
const section = (title) => console.log(`\n${title}`);

/** Счётчики воронки за сегодня — REST эмулятора: правила читателю их не отдают. */
const today = () => new Date().toISOString().slice(0, 10);
async function funnelToday() {
  const url = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/space/funnel/days/${today()}`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer owner' } });
  if (!res.ok) return { guest_start: 0, demo_touch: 0, landing_view: 0 };
  const f = (await res.json()).fields ?? {};
  const num = (k) => Number(f[k]?.integerValue ?? f[k]?.doubleValue ?? 0);
  return {
    guest_start: num('guest_start'),
    demo_touch: num('demo_touch'),
    landing_view: num('landing_view'),
  };
}

/** Пересекаются ли два прямоугольника хотя бы одним пикселем. */
const overlap = (a, b) =>
  Boolean(a) &&
  Boolean(b) &&
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

async function freshPage(browser, { width = 390 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return { context, page, errors };
}

/** Сессия — из IndexedDB, где её и держит Firebase: то, что записал SDK, а не следы. */
const sessionOf = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('firebaseLocalStorageDb');
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          try {
            const all = req.result
              .transaction('firebaseLocalStorage', 'readonly')
              .objectStore('firebaseLocalStorage')
              .getAll();
            all.onerror = () => resolve(null);
            all.onsuccess = () => {
              const rec = all.result.find((r) =>
                String(r.fbase_key).startsWith('firebase:authUser:'),
              );
              resolve(
                rec?.value ? { uid: rec.value.uid, anonymous: Boolean(rec.value.isAnonymous) } : null,
              );
            };
          } catch {
            resolve(null);
          }
        };
      }),
  );

/** Довести демо до состояния «человек потрогал» — одной звездой, как это делает человек. */
async function touchDemo(page) {
  await page.locator('.demo .axis').first().locator('.stars button').nth(8).click();
  await page.waitForTimeout(400);
}

const run = async () => {
  const browser = await chromium.launch({ headless: !HEADED });
  const before = await funnelToday();
  note(`воронка ДО прогона: guest_start=${before.guest_start} · demo_touch=${before.demo_touch}`);

  /* ═══ 1. Лендинг до касания ═══ */
  section('1. Лендинг до касания');
  for (const lang of ['ru', 'en']) {
    const { context, page } = await freshPage(browser);
    await page.goto(`${BASE}/${lang}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const text = await page.innerText('body');
    const word = lang === 'ru' ? /гост(ь|я|ем|ю|евой)/i : /\bguests?\b/i;
    const hit = text.match(word);
    check(!hit, `Ш8-01 /${lang}: слова «гость» на лендинге нет`, hit ? `найдено «${hit[0]}»` : `знаков ${text.length}`);
    const doorBefore = await page.locator('.demo a[href*="/profile"]').count();
    check(doorBefore === 0, `Ш8-02 /${lang}: до касания двери в демо нет`, `ссылок ${doorBefore}`);
    await context.close();
  }

  /* ═══ 2. Демо после касания ═══ */
  section('2. Демо после касания звёзд');
  {
    const { context, page } = await freshPage(browser);
    await page.goto(`${BASE}/ru`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await touchDemo(page);

    const door = page.locator('.demo a.gobtn');
    const href = await door.getAttribute('href');
    const tag = await door.evaluate((el) => el.tagName);
    const label = (await door.innerText()).trim();
    check(await door.isVisible(), 'Ш8-03а кнопка моста появилась после звёзд');
    check(tag === 'A', 'Ш8-03б это ССЫЛКА (средний клик и «в новой вкладке» живы)', `<${tag.toLowerCase()}>`);
    check(href === '/profile?guest=1', 'Ш8-03в ведёт в гостевую дверь на ЛЮБОМ хосте', String(href));
    check(!/гост/i.test(label), 'Ш8-03г на самой кнопке слова «гость» нет', `«${label}»`);

    const pop = page.locator('.demo .pop');
    check(await pop.isVisible(), 'Ш8-04а поп-ап появился после действия человека');
    const popText = (await pop.innerText()).trim();
    const popBox = await pop.boundingBox();
    const faces = await page.locator('.demo svg .node').all();
    const boxes = [];
    for (const f of faces) boxes.push(await f.boundingBox());
    const hits = boxes.filter((b) => overlap(popBox, b)).length;
    check(hits === 0, 'Ш8-04б поп-ап НЕ перекрывает ни одно лицо (пиксельно)', `лиц ${boxes.length}, пересечений ${hits}`);
    note(`поп-ап говорит: «${popText}»`);

    const topCard = page.locator('.demo .personas .persona').first();
    const topName = (await topCard.locator('.who').innerText()).split('·')[0].trim();
    const topPct = (await topCard.locator('.big').innerText()).trim();
    check(
      popText.includes(topName) && popText.includes(topPct),
      'Ш8-04в поп-ап называет то же, что РАСЧЁТ в карточке',
      `${topName} · ${topPct}`,
    );

    const rows = await page.locator('.demo .summary .row').count();
    const firstRowPct = (await page.locator('.demo .summary .row').first().locator('.val').innerText()).trim();
    check(rows === 3, 'Ш8-06а итог-панель показывает всех троих', `строк ${rows}`);
    check(firstRowPct === topPct, 'Ш8-06б верхняя строка панели = верхняя карточка', `${firstRowPct} / ${topPct}`);

    const waves = await door.evaluate((el) => getComputedStyle(el, '::before').animationName);
    // 🔴 Имя keyframes СКОУПИТСЯ Svelte: в живом браузере это «svelte-<хеш>-bridge-wave», а не
    // «bridge-wave». Первая редакция сверяла имя целиком и покрасила красным ИСПРАВНЫЙ продукт.
    // Сверяем хвост — но проверка не ослаблена: «none» хвосту не удовлетворяет.
    check(waves.endsWith('bridge-wave'), 'Ш8-05а волны идут', `animation-name: ${waves}`);
    await context.close();
  }

  /* ═══ 3. Уважение к «не анимировать» ═══ */
  section('3. Уважение к «не анимировать»');
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 900 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/ru`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await touchDemo(page);
    const waves = await page
      .locator('.demo a.gobtn')
      .evaluate((el) => getComputedStyle(el, '::before').animationName);
    check(waves === 'none', 'Ш8-05б при prefers-reduced-motion волны погашены', `animation-name: ${waves}`);
    await context.close();
  }

  /* ═══ 4. Переход по мосту и «Назад» ═══ */
  section('4. Переход по мосту и «Назад»');
  let guestUid = null;
  {
    const { context, page, errors } = await freshPage(browser);
    await page.goto(`${BASE}/ru`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await touchDemo(page);

    // Прямая улика Н4: длина истории ДО и ПОСЛЕ. `replace` записи не добавляет, значит число
    // обязано остаться тем же. Это сильнее, чем «goBack увёл не на лендинг».
    const histBefore = await page.evaluate(() => history.length);
    await page.locator('.demo a.gobtn').click();
    await page.waitForURL(/\/profile/, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000); // сессия и ensureSpaceExists асинхронны
    const histAfter = await page.evaluate(() => history.length);
    check(new URL(page.url()).pathname === '/profile', 'Ш8-07а одно нажатие — и человек внутри', page.url());
    check(
      histAfter === histBefore,
      'Ш8-08а мост НЕ оставил записи в истории вкладки',
      `history.length ${histBefore} → ${histAfter}`,
    );

    const fields = await page.locator('input[type="email"], input[type="password"]').count();
    check(fields === 0, 'Ш8-07б ни одной формы на пути', `полей ввода ${fields}`);

    const me = await sessionOf(page);
    guestUid = me?.uid ?? null;
    check(
      me?.anonymous === true,
      'Ш8-07в сессия АНОНИМНАЯ, а не подменённая dev-пользователем',
      me ? `uid ${me.uid}, anonymous=${me.anonymous}` : 'сессии нет',
    );

    // Главное наблюдение Н4: истории лендинга в этой вкладке не осталось.
    await page.goBack().catch(() => null);
    await page.waitForTimeout(1500);
    const backPath = new URL(page.url()).pathname;
    check(
      backPath !== '/ru' && backPath !== '/en',
      'Ш8-08б «Назад» с первого экрана продукта НЕ возвращает на лендинг',
      `оказались на ${backPath}`,
    );

    // bugs/08.1: вошедший лендинг не разглядывает.
    await page.goto(`${BASE}/ru`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const afterLanding = new URL(page.url()).pathname;
    check(
      afterLanding.startsWith('/profile'),
      'Ш8-11 bugs/08.1 не регрессировал: вошедшего лендинг уводит внутрь',
      `оказались на ${afterLanding}`,
    );

    check(errors.length === 0, 'Ш8-12 консоль чиста на всём пути', errors.length ? errors[0].slice(0, 140) : 'ошибок 0');
    await context.close();
  }

  /* ═══ 5. Воронка ═══ */
  section('5. Воронка');
  {
    const after = await funnelToday();
    check(
      after.guest_start > before.guest_start,
      'Ш8-09а guest_start вырос — воронка не сломана',
      `${before.guest_start} → ${after.guest_start}`,
    );
    check(
      after.demo_touch > before.demo_touch,
      'Ш8-09б demo_touch вырос',
      `${before.demo_touch} → ${after.demo_touch}`,
    );
  }

  /* ═══ 6. Карточка-мостик на «Связях» ═══ */
  section('6. Карточка-мостик на «Связях»');
  {
    const { context, page } = await freshPage(browser);
    await page.goto(`${BASE}/ru`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await touchDemo(page);
    await page.locator('.demo a.gobtn').click();
    await page.waitForURL(/\/profile/, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // 🔴 EXP-0174: дверь `?as=guest` обязана стоять в КАЖДОЙ навигации стенда.
    await page.goto(`${BASE}/relations?as=guest`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const bridge = page.locator('.bridge');
    const seen = await bridge.count();
    check(seen === 1, 'Ш8-10а карточка-мостик показана пришедшему мостом', `карточек ${seen}`);
    // 🔴 Пропуск объявляется ВСЛУХ (капкан от QA, оплачен его прогонами): молчаливо
    // пропущенная проверка читается как «нечего проверять» — то есть как зелёная.
    if (seen !== 1) {
      note('Ш8-10б…д ПРОПУЩЕНЫ: карточки на экране нет, проверять её содержимое не на чем');
    }
    if (seen === 1) {
      const text = (await bridge.innerText()).trim();
      const draft = await bridge.getAttribute('data-draft');
      note(`мостик говорит: «${text}»`);
      check(/Это была демонстрация/.test(text), 'Ш8-10б фраза владельца на месте');
      check(!/Алиса|Макс|Настя/.test(text), 'Ш8-10в синтетиков, которых нет в базе, мостик не поминает');
      check(draft === 'true' || draft === 'false', 'Ш8-10г пометка вычитки живёт атрибутом', `data-draft=${draft}`);
      check(!/вычитк/i.test(text), 'Ш8-10д внутреннего жаргона на экране нет');
      await page.locator('.body').screenshot({ path: `${OUT}/relations-bridge.png` }).catch(() => {});
    }

    // КОНТРОЛЬ ПРИБОРА: человеку, пришедшему своим ходом, мостика быть не должно.
    const clean = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const cleanPage = await clean.newPage();
    await cleanPage.goto(`${BASE}/relations?as=guest`, { waitUntil: 'domcontentloaded' });
    await cleanPage.waitForTimeout(3000);
    const stray = await cleanPage.locator('.bridge').count();
    check(stray === 0, 'Ш8-10е КОНТРОЛЬ: пришедшему своим ходом мостика нет', `карточек ${stray}`);
    await clean.close();
    await context.close();
  }

  /* ═══ 7. Кадры: обе темы × 390/1024/1440 ═══ */
  section('7. Кадры (обе темы × 390/1024/1440)');
  for (const theme of ['light', 'dark']) {
    for (const width of [390, 1024, 1440]) {
      const { context, page } = await freshPage(browser, { width });
      await page.goto(`${BASE}/ru`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(700);
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await touchDemo(page);
      await page.waitForTimeout(700);
      const themeNow = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      const shot = `${OUT}/demo-${theme}-${width}.png`;
      await page.locator('.demo').screenshot({ path: shot });
      check(themeNow === theme, `Ш8-13 кадр ${theme} · ${width}px снят`, shot);
      await context.close();
    }
  }

  await browser.close();
  console.log(`\nИТОГ: пройдено ${pass} · провалено ${fail}`);
  if (guestUid) console.log(`Заведён гость ${guestUid} — стендовая база, уборка рестартом стенда.`);
  process.exit(fail === 0 ? 0 : 1);
};

run().catch((e) => {
  console.error('\nприбор упал:', e?.stack ?? e);
  process.exit(2);
});

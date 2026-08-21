#!/usr/bin/env node
/**
 * ПРИБОР ЗАМЕРА (не страж) — ПОЛНЫЙ ПРОХОД АНОНИМА: ЭКРАННАЯ половина.
 * `plans/23` фаза 1 (Ф2: «что видит ЭКРАН через 5/15/60 с после последней оценки») +
 * `plans/22` фаза 1 (последний чекбокс: «цепочка гость → оценки → Связи живым браузером»).
 * Датовая половина — `tools/probe-guest-loop.mjs`; ворота фазы 1 закрывает только ПАРА половин.
 *
 * Якорь (№009 В3): «*мягким туториалом можно вновь завести пользователя на связи — где он
 * непосредственно сейчас увидит результат своих действий*».
 *
 * ЧТО МЕРЯЕТ:
 *   1. Ф2 живым браузером: гость ставит оценки, возвращается на «Связи» через ~2, 5, 15, 60 с
 *      SPA-НАВИГАЦИЕЙ (тапами по нижней навигации) — и в каждый момент снимается ПАРА
 *      «что в базе ↔ что на экране». Заморозка доказана, когда база уже несёт топ, а экран
 *      всё ещё показывает то, что закэшировал первым визитом.
 *      🔴 `page.goto`/перезагрузка ЗАПРЕЩЕНЫ между визитами: новая загрузка пересоздаёт кэш
 *      сессии и прячет ровно тот дефект, который меряется (капкан записан в `plans/23`).
 *   2. Контроль прибора: стендовая дверь `window.__ndimRefresh()` (тот же путь, что жест
 *      pull-to-refresh) обязана показать топ, если он в базе, — иначе «пусто» на экране было бы
 *      не заморозкой, а отсутствием данных.
 *   3. Вид карточек гостя: кадры того, что гость реально видит в своём топе (имена/безымянность,
 *      метрики) — предсказание `plans/22` §2 «карточки безымянные» переводится в наблюдение.
 *   4. Попутное наблюдение для `bugs/158`: уезжает ли оценённая карточка с экрана «Измерения»
 *      (вкладка «Все», поиск пуст) после естественного отсчёта. Наблюдение, не вердикт.
 *
 * ЧЕСТНОСТЬ ТАКТА: на стенде цикл сервера синхронизации — 15 с и тихий период 0 (tools/stand.mjs);
 * в бою — 60 с и тихий период 120 с. Окно, в котором человек успевает поймать пустоту, В БОЮ ШИРЕ,
 * чем здесь, поэтому «на стенде заморозка поймана» ⇒ «в бою тем более», но численно окна разные.
 * Гонка «первый визит против первого цикла» на стенде может выпасть в любую сторону — прибор
 * повторяет заход с новым гостем (до 3 попыток), пока первый визит не опередит цикл, и честно
 * печатает число попыток.
 *
 * Запуск: стенд обязан быть поднят (`npm run stand`).
 *   node tools/probe-guest-screen.mjs [--base http://localhost:5173] [--headed]
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const BASE = opt('--base', 'http://localhost:5173').replace(/\/$/, '');
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8181';
const PROJECT = 'demo-ndim-dev';
const OUT = 'test-results/probe-guest-screen';
mkdirSync(OUT, { recursive: true });

if (!/localhost|127\.0\.0\.1/.test(BASE)) {
  console.error('Только стенд: прибор заводит гостей и ставит оценки — в бою это двигало бы NDSR.');
  process.exit(1);
}

/* ── База: REST эмулятора, `Bearer owner` обходит правила (уборка и снимки истины) ── */

async function restDoc(path) {
  const res = await fetch(`${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, {
    headers: { Authorization: 'Bearer owner' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore ${res.status} на ${path}`);
  return res.json();
}

async function restList(collectionPath) {
  const res = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${collectionPath}?pageSize=300`,
    { headers: { Authorization: 'Bearer owner' } },
  );
  if (!res.ok) return [];
  const { documents = [] } = await res.json();
  return documents.map((d) => d.name.split('/documents/')[1]);
}

async function restDelete(path) {
  await fetch(`${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer owner' },
  }).catch(() => {});
}

/** Истина о топе гостя — прямо из базы, мимо всякого кэша. */
async function topInDb(uid) {
  const snap = await restDoc(`relations/${uid}`);
  if (snap === null) return { exists: false, people: 0 };
  const top = snap.fields?.top?.arrayValue?.values ?? [];
  return { exists: true, people: top.length };
}

/* ── Экран: классификация того, что видит человек на «Связях» ── */

async function screenState(page) {
  const cards = await page.locator('.card .who').count();
  const text = await page.innerText('body');
  if (cards > 0) return { kind: 'cards', people: cards };
  if (/Связей пока нет/i.test(text)) return { kind: 'empty', people: 0 };
  if (/Не удалось загрузить/i.test(text)) return { kind: 'down', people: 0 };
  return { kind: 'other', people: 0 };
}

/** Сессия гостя — из IndexedDB, где её держит Firebase (приём tools/smoke.mjs). */
function sessionOf(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('firebaseLocalStorageDb');
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          try {
            const store = req.result
              .transaction('firebaseLocalStorage', 'readonly')
              .objectStore('firebaseLocalStorage');
            const all = store.getAll();
            all.onerror = () => resolve(null);
            all.onsuccess = () => {
              const rec = all.result.find((r) => String(r.fbase_key).startsWith('firebase:authUser:'));
              const u = rec?.value;
              resolve(u ? { uid: u.uid, token: u.stsTokenManager?.accessToken ?? null } : null);
            };
          } catch {
            resolve(null);
          }
        };
      }),
  );
}

/**
 * SPA-переход тапом по нижней навигации — НИКОГДА не goto (капкан Ф2).
 *
 * 🔴 СТЕНДОВАЯ ОСОБЕННОСТЬ, стоившая двух пустых заходов: на голом адресе стенд ПОДМЕНЯЕТ
 * анонимную сессию dev-пользователем (`profile.ts` → `currentSession`, EXP-0087: «анонимная
 * сессия сознательно НЕ считается настоящим аккаунтом»). Гость, тапнувший по навигации без
 * двери, молча становится dev@ — и весь замер меряет не того человека. Поэтому тап здесь идёт
 * по ТОЙ ЖЕ ссылке навигации, но с открытой стендовой дверью `?as=guest` в href: переход
 * остаётся клиентским (кэш сессии живёт — ровно он и меряется), а дверь удерживает гостя гостем.
 * В бою двери нет и подмены нет — это лечение стендового ограничения, не поведения продукта.
 */
async function tapNav(page, href) {
  await page.locator(`nav.bnav a[href="${href}"]`).evaluate((a, target) => {
    a.setAttribute('href', `${target}?as=guest`);
    a.click(); // клик по ссылке перехватывает клиентский роутер — переход остаётся SPA
    a.setAttribute('href', target);
  }, href);
  await page.waitForTimeout(1200); // экраны грузятся асинхронно после перехода
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── Отказы правил гостю — штатные (фильтр консоли из tools/smoke.mjs) ── */
const EXPECTED =
  /permission|insufficient permissions|Missing or insufficient|Could not reach Cloud Firestore backend|Connection failed \d+ times/i;

/* ── Один заход: рождение гостя → оценки → визиты → контроль → уборка ── */

async function attempt(browser, n) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !EXPECTED.test(m.text())) consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  const shot = (name) => page.screenshot({ path: `${OUT}/a${n}-${name}.png`, fullPage: false });

  const cleanup = async (uid, token) => {
    if (uid) {
      for (const p of await restList(`points/${uid}/dims`)) await restDelete(p);
      for (const p of await restList(`users/${uid}/profile`)) await restDelete(p);
      await restDelete(`points/${uid}`);
      await restDelete(`relations/${uid}`);
      await restDelete(`users/${uid}`);
    }
    if (token) {
      await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:delete?key=demo-api-key`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      }).catch(() => {});
    }
    // Проверка уборки — «убрал» без проверки не считается (канон smoke).
    const traces = [];
    if (uid) {
      if ((await restDoc(`points/${uid}`)) !== null) traces.push(`points/${uid}`);
      if ((await restDoc(`relations/${uid}`)) !== null) traces.push(`relations/${uid}`);
      if ((await restDoc(`users/${uid}`)) !== null) traces.push(`users/${uid}`);
    }
    return traces;
  };

  let uid = null;
  let token = null;
  try {
    // 1. Рождение гостя — настоящая дверь продукта, единственный goto захода.
    await page.goto(`${BASE}/profile?guest=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500); // сессия и ensureSpaceExists асинхронны
    const me = await sessionOf(page);
    uid = me?.uid ?? null;
    token = me?.token ?? null;
    if (!uid) throw new Error('гостевая сессия не завелась');
    await shot('1-guest-born');

    // 2. SPA-тапом на «Измерения», пять оценок. Первая — ЕСТЕСТВЕННЫМ отсчётом 5 с
    //    (наблюдение для bugs/158), остальные — кнопкой «сейчас» (экономия окна замера).
    //
    //    🔑 Гость целится в измерения, которые УЖЕ оценили жители стенда, — НАМЕРЕННО.
    //    Пространство стенда крошечное (3 жителя × 4–5 оценок из 49), и случайные пять оценок
    //    дают гостю ПУСТОЙ топ (снято заходом: «топ есть, людей 0») — экрану тогда нечем
    //    меняться и заморозка неизмерима. Кривую новичка на боевой форме меряет ДАТОВАЯ
    //    половина; здесь меряется механика ЭКРАНА, и ей нужен топ, которому есть куда приехать.
    const residentPoints = (await restList('points')).filter((p) => !p.endsWith(`/${uid}`));
    const target = new Set();
    for (const p of residentPoints) {
      for (const d of await restList(`${p}/dims`)) target.add(d.split('/').pop());
    }
    if (target.size < 5) throw new Error(`у жителей стенда всего ${target.size} измерений — сид изменился?`);

    await tapNav(page, '/dims');
    await page.locator('article.dim').first().waitFor({ timeout: 20000 });
    /** Ищет в ленте «Все» ближайшую карточку целевого измерения, листая вниз по необходимости. */
    const nextTargetCard = async (rated) => {
      for (let scroll = 0; scroll < 40; scroll += 1) {
        const ids = await page
          .locator('article.dim')
          .evaluateAll((els) => els.map((el) => el.getAttribute('data-dim')));
        const hit = ids.find((id) => target.has(id) && !rated.includes(id));
        if (hit) return hit;
        await page.mouse.wheel(0, 1400);
        await page.waitForTimeout(600);
      }
      throw new Error('в ленте не нашлось целевых измерений — вся лента пролистана');
    };
    let flyObservation = null;
    const ratedDims = [];
    for (let i = 0; i < 5; i += 1) {
      // Улёт предыдущей карточки и подтяжка соседей (`animate:flip`) обязаны ЗАКОНЧИТЬСЯ,
      // прежде чем целиться в звезду, — клик по движущейся ленте промахивался (заход 1).
      const dimId = await nextTargetCard(ratedDims);
      const card = page.locator(`article.dim[data-dim="${dimId}"]`);
      await card.scrollIntoViewIfNeeded();
      await card.locator('.stars button[aria-label="7"]').click();
      if (i === 0) {
        // Естественный отсчёт: ждём автосохранения и смотрим, ушла ли карточка (bugs/158).
        await page.waitForTimeout(7500); // 5 с отсчёта + запись + жест улёта (MOTION.gesture 900 мс)
        const still = await page.locator(`article.dim[data-dim="${dimId}"]`).count();
        flyObservation = { dimId, still: still > 0 };
        await shot('2-after-first-rating');
      } else {
        await card.locator('.countdown .now').click({ timeout: 5000 });
      }
      // Каждая оценка подтверждается БАЗОЙ до следующего клика — t0 честен по построению.
      let confirmed = false;
      for (let k = 0; k < 27 && !confirmed; k += 1) {
        confirmed = (await restDoc(`points/${uid}/dims/${dimId}`)) !== null;
        if (!confirmed) await sleep(300);
      }
      if (!confirmed) throw new Error(`оценка ${i + 1} (${dimId}) не долетела до базы за 8 с`);
      // Дожидаемся, пока оценённая карточка покинет DOM (улёт), — и даём соседям ДОЕХАТЬ:
      // подтяжка animate:flip длится MOTION.gesture (900 мс) ПОСЛЕ улёта, клик в движущуюся
      // ленту промахивается мимо звезды (судейский повтор 2026-08-21 поймал ровно это).
      await page
        .locator(`article.dim[data-dim="${dimId}"]`)
        .waitFor({ state: 'detached', timeout: 4000 })
        .catch(() => {}); // не уехала (bugs/158?) — идём дальше, наблюдение уже снято
      await page.waitForTimeout(1200);
      ratedDims.push(dimId);
    }
    const t0 = Date.now();

    // 3. Визиты на «Связи» SPA-тапами: ~2 с (первый, он и кладёт кэш), затем 5/15/60 с.
    const visits = [];
    const visitAt = async (label, atMs, name) => {
      const wait = t0 + atMs - Date.now();
      if (wait > 0) await sleep(wait);
      await tapNav(page, '/relations');
      const [db, screen] = [await topInDb(uid), await screenState(page)];
      visits.push({ label, sinceT0: ((Date.now() - t0) / 1000).toFixed(1), db, screen });
      await shot(name);
      await tapNav(page, '/dims'); // уходим тапом же — сессия и кэш живут дальше
    };
    await visitAt('~2 с', 2000, '3-visit-2s');
    await visitAt('5 с', 5000, '4-visit-5s');
    await visitAt('15 с', 15000, '5-visit-15s');
    await visitAt('60 с', 60000, '6-visit-60s');

    // Гонка: первый визит уже увидел карточки → заморозку этим заходом не поймать.
    const firstSawCards = visits[0].screen.kind === 'cards';

    // 4. Контроль прибора: жест обновления (стендовая дверь того же пути) на самих «Связях».
    await tapNav(page, '/relations');
    await page.evaluate(() => window.__ndimRefresh?.());
    await page.waitForTimeout(2000);
    const afterRefresh = { db: await topInDb(uid), screen: await screenState(page) };
    await shot('7-after-refresh');

    // 5. Вид карточек гостя — что он реально видит (если топ есть).
    let guestCards = null;
    if (afterRefresh.screen.kind === 'cards') {
      guestCards = await page
        .locator('.card .who')
        .allInnerTexts()
        .then((names) => names.map((s) => s.replace(/\s+/g, ' ').trim().slice(0, 60)));
      await shot('8-guest-cards');
    }

    const traces = await cleanup(uid, token);
    await context.close();
    return { uid, visits, firstSawCards, afterRefresh, guestCards, flyObservation, consoleErrors, traces };
  } catch (error) {
    const traces = await cleanup(uid, token).catch(() => ['уборка упала']);
    await context.close();
    throw Object.assign(error, { traces });
  }
}

/* ── Прогон ── */

// Стенд жив? Спрашиваем порты, а не память о них.
for (const [url, what] of [
  [BASE, 'dev-сервер приложения'],
  [`${FIRESTORE}/`, 'эмулятор Firestore'],
  [`${AUTH}/`, 'эмулятор Auth'],
]) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(3000) });
  } catch {
    console.error(`Стенд не поднят: ${what} (${url}) не отвечает. Подними \`npm run stand\`.`);
    process.exit(1);
  }
}

const browser = await chromium.launch({ headless: !argv.includes('--headed') });
let result = null;
let attempts = 0;
try {
  for (attempts = 1; attempts <= 3; attempts += 1) {
    console.log(`\n── Заход ${attempts} ──`);
    result = await attempt(browser, attempts);
    if (!result.firstSawCards) break; // гонку выиграл визит — «пустая» заморозка измерима
    // Первый визит застал карточки — но и такой заход измерим: если база уехала дальше
    // экрана (людей стало больше), отставание видно по таблице. Новый гость берётся лишь
    // ради более чистой формы «пусто → топ»; после третьего захода живём с тем, что есть.
    console.log('первый визит уже увидел карточки (цикл стенда успел раньше) — новый гость');
    if (attempts === 3) break;
  }
} finally {
  await browser.close();
}

/* ── Отчёт ── */

console.log('\n════ Ф2 ЖИВЫМ БРАУЗЕРОМ: база ↔ экран (SPA-навигация, одна сессия) ════');
console.log(`заходов: ${Math.min(attempts, 3)} (гонка «визит против такта 15 с» — см. шапку) · гость ${result.uid}`);
console.log('визит | с от последней оценки | В БАЗЕ (людей в топе) | НА ЭКРАНЕ');
for (const v of result.visits) {
  const db = v.db.exists ? `топ есть, людей ${v.db.people}` : 'топа нет';
  const scr =
    v.screen.kind === 'cards'
      ? `карточки, ${v.screen.people}`
      : v.screen.kind === 'empty'
        ? '«Связей пока нет»'
        : v.screen.kind;
  console.log(`${v.label.padStart(5)} | ${v.sinceT0.padStart(21)} | ${db.padEnd(21)} | ${scr}`);
}

// Заморозка — это ОТСТАВАНИЕ экрана от базы: пустой экран при непустом топе ИЛИ карточек меньше,
// чем людей в базе (первый визит поймал промежуточный топ, дальше база уехала, экран остался).
const frozen = result.visits.some((v) => v.db.exists && v.db.people > v.screen.people);
const ctrl = result.afterRefresh;
console.log(
  `\nконтроль (жест обновления): база ${ctrl.db.exists ? `топ ${ctrl.db.people}` : 'топа нет'} → экран ${
    ctrl.screen.kind === 'cards' ? `карточки, ${ctrl.screen.people}` : ctrl.screen.kind
  }`,
);
if (frozen && ctrl.screen.kind === 'cards') {
  console.log(
    '🔴 Ф2 ПОДТВЕРЖДЁН: экран заморозил снимок первого визита и не увидел, как база уехала дальше;',
  );
  console.log('   жест обновления показал состояние базы — данные были, не показывались.');
} else if (frozen) {
  console.log('🔴 Экран отстал от базы, но контроль жестом не показал данных — прибор под вопросом, не продукт.');
} else {
  console.log('⚠️ Заморозка НЕ ПОЙМАНА этим прогоном (гонка с тактом 15 с) — «не измерена», а не «опровергнута».');
}

if (result.guestCards) {
  console.log(`\nвид карточек гостя (${result.guestCards.length}): ${result.guestCards.join(' · ')}`);
} else {
  console.log('\nвид карточек гостя: топ не показался и после жеста — кадров карточек нет');
}

if (result.flyObservation) {
  const f = result.flyObservation;
  console.log(
    `\nнаблюдение для bugs/158 (вкладка «Все», поиск пуст, естественный отсчёт): карточка ${f.dimId} ` +
      (f.still ? '🔴 ОСТАЛАСЬ на экране' : '✅ уехала'),
  );
}

console.log(
  `\nконсоль (мимо штатных отказов правил): ${result.consoleErrors.length === 0 ? 'чистая' : result.consoleErrors.slice(0, 3).join(' | ')}`,
);
console.log(`уборка: ${result.traces.length === 0 ? 'следов гостя не осталось (проверено базой)' : `🔴 остались: ${result.traces.join(', ')}`}`);
console.log(`кадры — ${OUT}/`);
process.exitCode = 0;

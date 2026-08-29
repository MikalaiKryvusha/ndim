#!/usr/bin/env node
// @covers NDIM-PUBLIC-001, NDIM-PUBLIC-003, NDIM-PUBLIC-004, NDIM-AUTH-003, NDIM-AUTH-004,
// @covers NDIM-AUTH-005, NDIM-AUTH-006, NDIM-SHELL-003, NDIM-MENU-011, NDIM-PROFILE-001,
// @covers NDIM-PROFILE-002, NDIM-DIMS-001, NDIM-DIMS-002, NDIM-DIMS-003, NDIM-REL-001,
// @covers NDIM-REL-003, NDIM-SYSTEM-001
//
// Запуск: node tools/smoke.mjs
/**
 * НАБОР SMOKE — «сборка жива и продукт делает своё дело» (`qa/suites/smoke.md`, фаза 2 `plans/54`).
 *
 * ═══ ЧЕЙ ЭТО СКОУП ═══
 *
 * Продиктован владельцем (профессиональный QA) 2026-08-16, дословно: «можно залогиниться · есть
 * данные · видны связи · видны измерения · можно добавить измерение · можно удалить · пересчет
 * связей для юзера работает · можно редактировать данные пользователя · ОБ флоу корректный для
 * анонима · регистрация · логин в уже существующий · логаут · анонимный аккаунт · полноценный
 * аккаунт · чтобы все экраны открывались — минимальный смоук проверки открытия экранов в Меню» —
 * и рамка: «САМАЯ БАЗОВАЯ БАЗА».
 *
 * 🔑 **Это не «экраны открылись».** Первая редакция карты путей ставила в Smoke именно открытие
 * экранов — то есть мерила, что продукт ЗАПУСКАЕТСЯ. Владелец переопределил: Smoke меряет, что
 * продукт РАБОТАЕТ. Отсюда здесь запись в базу, ожидание цикла синхронизации и удаление.
 *
 * ═══ ЧЕТЫРЕ УСТРОЙСТВА, КОТОРЫЕ ЗДЕСЬ ВАЖНЕЕ КОДА ═══
 *
 * 1. **Падение шага не уносит прогон.** Каждый кейс исполняется в оболочке `step()`: исключение
 *    становится ЕГО провалом, остальные идут дальше. Первая редакция этого не имела — таймаут в
 *    правке профиля молча оборвал набор, и отчёт показал шесть зелёных вместо семнадцати кейсов.
 *    Смоук, замолкающий на первом падении, отвечает не на тот вопрос: он обязан сказать, что ЕЩЁ
 *    сломано.
 * 2. **Сессия читается из IndexedDB — там, где её держит Firebase.** `localStorage` про неё не
 *    знает вовсе, и первая редакция получала «сессии нет» на исправном продукте.
 * 3. **Ссылку из письма заказывает САМ ПРОДУКТ, а не прибор по REST.** Firebase обязан сверить
 *    почту, поэтому приложение кладёт её в хранилище В МОМЕНТ ЗАКАЗА. Заказ мимо приложения
 *    оставляет хранилище пустым, сверять нечем, и вход честно не случается: прибор ставил опыт,
 *    которого у человека не бывает — письмо приходит тому, кто его запросил.
 * 4. **Вердикт записи снимается С БАЗЫ И С ЭКРАНА.** Экран показывает оптимистичное состояние
 *    раньше, чем база о нём узнаёт; база без экрана человеку не видна. Поэтому оба.
 *
 * ═══ УБОРКА ═══
 *
 * База стенда общая для всех стражей (правило класса, `bugs/103`). Прогон возвращает её в исходное
 * состояние: снятая оценка (она же кейс NDIM-DIMS-003), восстановленное свойство профиля,
 * удалённые учётные записи прогона. Уборка живёт в `finally` и ПРОВЕРЯЕТСЯ отдельным шагом.
 *
 * Запуск: node tools/smoke.mjs [--base http://localhost:5173] [--keep] [--headed]
 *
 * ⚠️ Живой контур — [NOT-TESTED] на 2026-08-16: прибор написан с `--base`, но прогонялся только по
 * стенду. Пишущие шаги в БОЮ не запускать: они двигают NDim Space Rating живых объектов.
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { markProbeContext } from './lib/probe-mark.mjs';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(name);

const BASE = opt('--base', 'http://localhost:5173').replace(/\/$/, '');
const IS_STAND = /localhost|127\.0\.0\.1/.test(BASE);
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8181';
const PROJECT = 'demo-ndim-dev';
const DEV_EMAIL = 'dev@ndim.space';
const OUT = 'test-results/smoke';
mkdirSync(OUT, { recursive: true });

const started = Date.now();
const results = [];
const created = []; // idToken учёток, заведённых прогоном

/* ─────────────────────────── Исходы ─────────────────────────── */

function record(state, ids, name, detail = '') {
  results.push({ ids, name, state, detail });
  const mark = state === 'pass' ? '✅' : state === 'fail' ? '❌' : '⏭️ ';
  console.log(`  ${mark} ${name}   [${ids}]`);
  if (detail && state !== 'pass') console.log(`       ${state === 'skip' ? 'не выполнялся: ' : ''}${detail}`);
}

/**
 * Оболочка кейса. `fn` возвращает `{ ok, detail }` либо `{ skip, detail }`; исключение — провал
 * ЭТОГО кейса, а не конец прогона.
 */
async function step(ids, name, fn) {
  try {
    const r = await fn();
    if (r?.skip) record('skip', ids, name, r.detail);
    else record(r?.ok ? 'pass' : 'fail', ids, name, r?.detail ?? '');
  } catch (e) {
    // Падение окружения не выдаётся за дефект продукта (`bugs/134`), но и не прощается: прогон
    // остаётся красным, потому что «не смогли проверить» ≠ «проверили, всё хорошо».
    if (e?.environment || /ERR_CONNECTION|fetch failed|net::ERR/i.test(String(e.message ?? e))) {
      record('fail', ids, name, `🔌 ${String(e.message ?? e).split('\n')[0].slice(0, 200)}`);
      return;
    }
    record('fail', ids, name, `упал: ${String(e.message ?? e).split('\n')[0].slice(0, 200)}`);
  }
}

const section = (title) => console.log(`\n── ${title} ──`);

/* ─────────────────────────── База и почта эмулятора ─────────────────────────── */

/**
 * 🔴 ОКРУЖЕНИЕ ≠ ПРОДУКТ (`bugs/134`).
 *
 * Стенд умеет умирать посреди прогона (нехватка памяти), и тогда исправный продукт выдаёт четыре
 * «провала»: «оценки в базе нет», «кнопки „Выйти" нет», консоль в `ERR_CONNECTION_RESET`. Сессия,
 * поверившая такому отчёту, идёт чинить целое — это тот самый ложный диагноз, которым проект уже
 * платил. Поэтому падение окружения носит СВОЁ ИМЯ и не выдаёт себя за дефект.
 *
 * Прогон при этом остаётся КРАСНЫМ: ворота обязаны закрыться, когда проверить не удалось. Молчать
 * здесь нельзя — «не смогли проверить» и «проверили, всё хорошо» это разные вещи.
 */
class EnvironmentDown extends Error {
  constructor(what) {
    super(`ОКРУЖЕНИЕ УПАЛО: ${what}. Это не дефект продукта — стенд не отвечает (bugs/134).`);
    this.environment = true;
  }
}

/** Документ Firestore эмулятора. `Bearer owner` обязателен: REST идёт ЧЕРЕЗ ПРАВИЛА. */
async function doc(path) {
  let res;
  try {
    res = await fetch(`${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, {
      headers: { Authorization: 'Bearer owner' },
    });
  } catch (e) {
    throw new EnvironmentDown(`эмулятор Firestore (${FIRESTORE}) не отвечает`);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore ${res.status} на ${path}`);
  return res.json();
}

/** Живо ли окружение прямо сейчас — спрашивается у самих портов, а не у памяти о них. */
async function environmentAlive() {
  for (const url of [FIRESTORE, AUTH]) {
    try {
      await fetch(`${url}/`, { signal: AbortSignal.timeout(2000) });
    } catch {
      return false;
    }
  }
  return true;
}

/** Адрес из «письма»: код берётся у эмулятора Auth (`EXP-0045`), но заказывает его сам продукт. */
async function latestLink(email) {
  const res = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes = [] } = await res.json();
  const last = oobCodes.filter((c) => c.email === email && c.requestType === 'EMAIL_SIGNIN').at(-1);
  if (!last) throw new Error(`нет oobCode для ${email}`);
  return `${BASE}/profile?mode=signIn&oobCode=${last.oobCode}&apiKey=demo-api-key`;
}

/** Просит ссылку ФОРМОЙ ПРОДУКТА и возвращает адрес из «письма». */
async function askLinkThroughUi(page, email) {
  const field = page.locator('input[type="email"]:visible').first();
  await field.waitFor({ timeout: 15000 });
  await field.fill(email);
  await page.getByRole('button', { name: 'Получить ссылку для входа' }).first().click();
  await page.waitForTimeout(1500);
  return latestLink(email);
}

/** Сессия — из IndexedDB, где её и держит Firebase: ровно то, что записал SDK, а не следы. */
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
              resolve(
                u
                  ? {
                      uid: u.uid,
                      email: u.email ?? null,
                      anonymous: Boolean(u.isAnonymous),
                      token: u.stsTokenManager?.accessToken ?? null,
                    }
                  : null,
              );
            };
          } catch {
            resolve(null);
          }
        };
      }),
  );
}

/* ─────────────────────────── Браузер ─────────────────────────── */

/**
 * Что НЕ считается дефектом в консоли. Фильтр узкий намеренно: широкий спрятал бы `TypeError`,
 * которым падала склейка версий (`bugs/124`), — а это единственный класс, ради которого смоук под
 * сессией вообще появился.
 *
 * 1. **Отказы правил гостю** — штатное поведение продукта: правила честно не пускают его в чужое.
 * 2. **`Could not reach Cloud Firestore backend` / `Connection failed N times`** — сообщение
 *    ТРАНСПОРТА о переподключении, а не ошибка приложения. Всплывает на собранном артефакте, где
 *    старт быстрее, чем готовность эмулятора. 🔑 Глушить его безопасно ровно потому, что настоящую
 *    недоступность базы ловит не консоль, а вердикты кейсов: без базы падают и оценка, и пересчёт,
 *    и вход. То есть у этого класса есть свой прибор, и он не консоль.
 */
const EXPECTED =
  /permission|insufficient permissions|Missing or insufficient|Could not reach Cloud Firestore backend|Connection failed \d+ times/i;

async function person(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
  await markProbeContext(context);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !EXPECTED.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return { context, page, errors };
}

const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});

/** Ждёт, пока экран ОТРИСОВАН: текст, а не «200 OK». */
async function rendered(page, minChars = 200) {
  await page.waitForLoadState('domcontentloaded');
  await page
    .waitForFunction((min) => (document.body?.innerText ?? '').trim().length > min, minChars, { timeout: 20000 })
    .catch(() => {});
}

/* ─────────────────────────── Прогон ─────────────────────────── */

const browser = await chromium.launch({ headless: !flag('--headed') });
let devUid = null;
let ratedDim = null;
let profileRestore = null;

try {
  console.log(`НАБОР SMOKE · контур ${BASE}${IS_STAND ? ' (стенд)' : ''}`);

  // Контроль прибора ПЕРЕД прогоном (`EXP-0082`): на мёртвом окружении набор судить не может, и
  // сказать об этом надо ДО того, как он выдаст семнадцать «провалов» исправного продукта.
  if (IS_STAND && !(await environmentAlive())) {
    record('fail', '—', 'Окружение живо (контроль прибора)', '🔌 эмуляторы 8181/9099 не отвечают — поднимите `npm run stand` (bugs/134)');
    throw new EnvironmentDown('эмуляторы не отвечают на старте прогона');
  }

  /* ═══ Новый человек ═══ */
  section('Новый человек');
  {
    const { context, page, errors } = await person(browser);

    await step('NDIM-PUBLIC-001', 'Лендинг жив на обоих языках', async () => {
      const bad = [];
      for (const lang of ['ru', 'en']) {
        await page.goto(`${BASE}/${lang}`, { waitUntil: 'domcontentloaded' });
        await rendered(page, 400);
        const text = (await page.innerText('body')).trim();
        const h1 = await page.locator('h1').first().count();
        if (text.length < 400 || h1 === 0) bad.push(`/${lang}: ${text.length} знаков, h1 ${h1}`);
      }
      await shot(page, '01-landing');
      if (errors.length > 0) bad.push(`консоль: ${errors[0].slice(0, 120)}`);
      return { ok: bad.length === 0, detail: bad.join(' · ') };
    });

    await step('NDIM-PUBLIC-003', 'Продающий интерактив отвечает на жест', async () => {
      await page.goto(`${BASE}/ru`, { waitUntil: 'domcontentloaded' });
      await rendered(page, 400);
      const axis = page.locator('.demo .axis').first();
      if ((await axis.count()) === 0) return { ok: false, detail: 'блока демо с измерениями на лендинге нет' };
      const before = Number(await axis.locator('.val').innerText());
      // Жать надо звезду, КОТОРАЯ НЕ ГОРИТ: нажатие на уже выбранную ничего не меняет, и первая
      // редакция прибора красила исправное демо красным именно этим.
      const target = before > 5 ? 2 : 9;
      await axis.locator(`.stars button >> nth=${target - 1}`).click();
      await page.waitForTimeout(500);
      const after = Number(await axis.locator('.val').innerText());
      await shot(page, '02-demo');
      return {
        ok: after === target && after !== before,
        detail: `оценка была ${before}, жали ${target}, стало ${after}`,
      };
    });

    await step('NDIM-PUBLIC-004', 'С лендинга внутрь без единой формы', async () => {
      const door = page.locator('.demo a[href*="/profile"]').first();
      if ((await door.count()) === 0) return { skip: true, detail: 'тропинки внутрь в демо-блоке нет (эпик plans/23)' };
      const href = await door.getAttribute('href');
      await door.click();
      await page.waitForURL(/\/profile/, { timeout: 20000 }).catch(() => {});
      await rendered(page, 100);
      const fields = await page.locator('input[type="email"], input[type="password"]').count();
      await shot(page, '03-inside');
      const guestDoor = (href ?? '').includes('guest=1');
      return {
        ok: guestDoor && fields === 0,
        detail: guestDoor ? `полей ввода на пути: ${fields}` : `дверь ведёт в стену входа: ${href}`,
      };
    });

    await context.close();
  }

  /* ═══ Анонимный аккаунт → регистрация ═══ */
  section('Анонимный аккаунт и регистрация');
  {
    const { context, page, errors } = await person(browser);
    let guestUid = null;
    let guestRated = null;

    await step('NDIM-AUTH-004', 'Анонимный аккаунт заведён, Пространство родилось', async () => {
      await page.goto(`${BASE}/profile?guest=1`, { waitUntil: 'domcontentloaded' });
      await rendered(page, 100);
      await page.waitForTimeout(2000); // сессия и `ensureSpaceExists` асинхронны
      const me = await sessionOf(page);
      guestUid = me?.uid ?? null;
      if (me?.token) created.push(me.token);
      const root = guestUid ? await doc(`users/${guestUid}`) : null;
      await shot(page, '04-guest');
      return {
        ok: Boolean(guestUid) && me?.anonymous === true && root !== null && errors.length === 0,
        detail:
          `uid ${guestUid ?? 'НЕТ'} · аноним ${me?.anonymous} · документ users/{uid} ${root ? 'есть' : 'НЕТ'}` +
          (errors.length ? ` · консоль: ${errors[0].slice(0, 100)}` : ''),
      };
    });

    await step('NDIM-DIMS-002 (роль: гость)', 'Гость может оценить измерение', async () => {
      if (!guestUid) return { skip: true, detail: 'гостевая сессия не завелась' };
      await page.goto(`${BASE}/dims?as=guest`, { waitUntil: 'domcontentloaded' });
      await rendered(page, 100);
      const card = page.locator('article.dim').first();
      await card.waitFor({ timeout: 20000 });
      guestRated = await card.getAttribute('data-dim');
      await card.locator('.stars button[aria-label="7"]').click();
      await card.locator('.countdown .now').click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const saved = guestRated ? await doc(`points/${guestUid}/dims/${guestRated}`) : null;
      return { ok: saved !== null, detail: `оценка гостя в базе: ${saved ? 'есть' : 'НЕТ'}` };
    });

    await step('NDIM-AUTH-005', 'Регистрация: аккаунт создан, UID сохранён, труд при человеке', async () => {
      if (!IS_STAND) return { skip: true, detail: 'почтовые коды берутся у эмулятора Auth — только стенд' };
      if (!guestUid) return { skip: true, detail: 'гостевая сессия не завелась' };
      const email = `smoke-${Date.now()}@ndim.space`;
      // Путь человека целиком: гость просит сохранить себя, продукт шлёт письмо, он идёт по ссылке.
      await page.goto(`${BASE}/profile?as=guest`, { waitUntil: 'domcontentloaded' });
      await rendered(page, 100);
      await page.getByRole('button', { name: 'Сохранить мои результаты' }).first().click({ timeout: 15000 });
      const link = await askLinkThroughUi(page, email);
      await page.goto(link, { waitUntil: 'domcontentloaded' });
      await rendered(page, 100);
      await page.waitForTimeout(3000);
      const me = await sessionOf(page);
      if (me?.token) created.push(me.token);
      const keptWork = guestRated ? Boolean(await doc(`points/${guestUid}/dims/${guestRated}`)) : null;
      await shot(page, '05-registered');
      return {
        ok: me?.uid === guestUid && me?.email === email && me?.anonymous === false && keptWork !== false,
        detail: `uid до ${guestUid} · после ${me?.uid} · почта ${me?.email} · аноним ${me?.anonymous} · труд гостя: ${keptWork}`,
      };
    });

    await context.close();
  }

  /* ═══ Полноценный аккаунт ═══ */
  section('Полноценный аккаунт');
  {
    const { context, page, errors } = await person(browser);

    await step('NDIM-AUTH-003', 'Логин в уже существующий аккаунт по ссылке из письма', async () => {
      if (!IS_STAND) {
        await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
        await rendered(page, 100);
        return { skip: true, detail: 'почтовые коды берутся у эмулятора Auth — только стенд' };
      }
      // Состояние «аккаунт есть, сессии нет» — то самое, в котором приходит человек из 1.x.
      await page.goto(`${BASE}/profile?as=none`, { waitUntil: 'domcontentloaded' });
      await rendered(page, 100);
      await page.getByRole('button', { name: 'Войти по ссылке на почту' }).first().click({ timeout: 15000 });
      const link = await askLinkThroughUi(page, DEV_EMAIL);
      await page.goto(link, { waitUntil: 'domcontentloaded' });
      await rendered(page, 100);
      await page.waitForTimeout(3000);
      const me = await sessionOf(page);
      devUid = me?.uid ?? null;
      await shot(page, '06-signed-in');
      return { ok: me?.email === DEV_EMAIL && Boolean(devUid), detail: `почта сессии: ${me?.email ?? 'не поймана'}` };
    });

    await step('NDIM-SHELL-003', 'Все пять экранов открываются и рисуют содержимое', async () => {
      const SCREENS = [
        ['/profile', /Личная информация|Мой NDim ID/i],
        ['/dims', /измерен/i],
        ['/relations', /связ/i],
        ['/space', /пространств/i],
        ['/menu', /меню|о системе|поддерж/i],
      ];
      const bad = [];
      for (const [path, mark] of SCREENS) {
        await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
        await rendered(page, 100);
        const text = await page.innerText('body');
        if (!mark.test(text) || text.trim().length < 100) bad.push(path);
      }
      return { ok: bad.length === 0, detail: `молчат: ${bad.join(' ')}` };
    });

    await step('NDIM-MENU-011', 'Все двери «Меню» открывают свой экран', async () => {
      const DOORS = [
        '/ru/menu/manual',
        '/ru/menu/terms',
        '/ru/menu/privacy',
        '/ru/menu/disclaimer',
        '/ru/menu/support',
        '/ru/menu/donate',
        '/ru/menu/about',
        '/ru/menu/author',
        '/ru/menu/share',
        '/account',
      ];
      const bad = [];
      for (const path of DOORS) {
        await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
        await rendered(page, 100);
        const text = (await page.innerText('body')).trim();
        if (text.length < 100) bad.push(`${path} (${text.length} знаков)`);
      }
      return { ok: bad.length === 0, detail: `пусты: ${bad.join(' · ')}` };
    });

    await step('NDIM-PROFILE-001', 'В профиле есть данные человека', async () => {
      await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
      await rendered(page, 100);
      const text = await page.innerText('body');
      const empty = /Профиль не найден|Вы не вошли/i.test(text);
      return {
        ok: !empty && text.length > 300,
        detail: empty ? 'экран говорит, что данных нет' : `текста ${text.length}`,
      };
    });

    await step('NDIM-PROFILE-002', 'Данные редактируются и переживают возврат', async () => {
      const edit = page.getByRole('button', { name: 'Редактировать' }).first();
      if ((await edit.count()) === 0) return { ok: false, detail: 'кнопки «Редактировать» на экране нет' };
      await edit.click();
      const field = page.locator('input.inp').first();
      await field.waitFor({ timeout: 10000 });
      profileRestore = await field.inputValue();
      const probe = `${profileRestore}·smoke`;
      await field.fill(probe);
      await page.getByRole('button', { name: 'Сохранить' }).first().click();
      await page.waitForTimeout(1500);
      await page.goto(`${BASE}/relations`, { waitUntil: 'domcontentloaded' });
      await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
      await rendered(page, 100);
      const survived = (await page.innerText('body')).includes(probe);
      await shot(page, '07-profile-edited');
      return { ok: survived, detail: 'после возврата новое значение не показано' };
    });

    /* ── Измерения, оценки и связи ── */
    section('Измерения, оценки и связи');

    let topBefore = null;
    if (devUid) topBefore = JSON.stringify((await doc(`relations/${devUid}`))?.fields ?? null);

    await step('NDIM-DIMS-001', 'Измерения видны: лента каталога и вкладки', async () => {
      await page.goto(`${BASE}/dims`, { waitUntil: 'domcontentloaded' });
      await rendered(page, 100);
      await page.locator('article.dim').first().waitFor({ timeout: 20000 }).catch(() => {});
      const cards = await page.locator('article.dim').count();
      const tabs = await page.getByRole('button', { name: 'Мой NDim ID' }).count();
      return { ok: cards > 0 && tabs > 0, detail: `карточек ${cards}, вкладка «Мой NDim ID» ${tabs}` };
    });

    await step('NDIM-DIMS-002', 'Можно добавить измерение: оценка в базе, точка помечена', async () => {
      if (!devUid) return { skip: true, detail: 'неизвестен uid человека' };
      const cards = page.locator('article.dim');
      const total = await cards.count();
      let target = null;
      for (let i = 0; i < Math.min(total, 12); i++) {
        const id = await cards.nth(i).getAttribute('data-dim');
        if (id && (await doc(`points/${devUid}/dims/${id}`)) === null) {
          target = id;
          break;
        }
      }
      if (!target) return { skip: true, detail: 'все видимые измерения уже оценены — нечего добавлять' };
      const card = page.locator(`article.dim[data-dim="${target}"]`);
      await card.scrollIntoViewIfNeeded().catch(() => {});
      await card.locator('.stars button[aria-label="8"]').click();
      await card.locator('.countdown .now').click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const saved = await doc(`points/${devUid}/dims/${target}`);
      const value = saved?.fields?.value?.integerValue ?? saved?.fields?.value?.doubleValue ?? null;
      if (saved) ratedDim = target;
      /*
       * 🔑 ФЛАГ `dirty` ЗДЕСЬ НЕ СУДИТСЯ, и это не упрощение, а лечение ЛОТЕРЕИ.
       *
       * Первая редакция требовала `dirty === true` через полторы секунды после оценки. Цикл
       * сервера синхронизации на стенде — 15 с, и когда он попадал в это окно, флаг успевал
       * СНЯТЬСЯ: страж краснел на исправном продукте примерно раз в десять прогонов. Страж-лотерея
       * приучает игнорировать красное — это дороже, чем всё, что он стережёт.
       *
       * Смысл флага при этом не потерян: его НАБЛЮДАЕМОЕ следствие — пересчёт связей, и его
       * судит следующий кейс (`NDIM-REL-003`), который ЖДЁТ результата, а не ловит мгновение.
       * Мутация «оценка не помечает NDim ID обновлённым» проверена: она краснит именно тот кейс.
       */
      /*
       * Экран обязан показать то же самое, но ИМЕННО ТАМ, КУДА ПРОДУКТ КЛАДЁТ ОЦЕНЁННОЕ.
       * Оценённая карточка УЛЕТАЕТ из ленты «Все» во вкладку «Мой NDim ID» (это и есть смысл
       * слов владельца «добавить измерение» — оно добавляется в его NDim ID). Первая редакция
       * искала зажжённые звёзды на прежнем месте, находила ноль и краснела на исправном
       * продукте: мерила не тот экран.
       */
      await page.getByRole('button', { name: 'Мой NDim ID' }).first().click();
      const mine = page.locator(`article.dim[data-dim="${target}"]`);
      await mine.waitFor({ timeout: 15000 }).catch(() => {});
      const lit = await mine.locator('.stars button.fill').count();
      await shot(page, '08-rated');
      return {
        ok: Number(value) === 8 && lit === 9,
        detail: `база value=${value}, во вкладке «Мой NDim ID» зажжено звёзд ${lit} (ждали 9: это 0…8)`,
      };
    });

    await step('NDIM-REL-003, NDIM-SYSTEM-001', 'Пересчёт связей для человека работает', async () => {
      if (!ratedDim || !devUid) return { skip: true, detail: 'оценка не была поставлена — нечему пересчитываться' };
      const deadline = Date.now() + 120000;
      let recomputed = false;
      let heartbeat = null;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 5000));
        const dirty = (await doc(`points/${devUid}`))?.fields?.dirty?.booleanValue === true;
        const top = JSON.stringify((await doc(`relations/${devUid}`))?.fields ?? null);
        heartbeat = (await doc('space/server'))?.fields ?? null;
        if (!dirty && top !== topBefore) {
          recomputed = true;
          break;
        }
      }
      return {
        ok: recomputed && heartbeat !== null,
        detail: recomputed ? 'сердцебиение сервера не прочиталось' : 'за 120 с флаг dirty не снят и топ не переписан',
      };
    });

    await step('NDIM-REL-001', 'Связи видны', async () => {
      await page.goto(`${BASE}/relations`, { waitUntil: 'domcontentloaded' });
      await rendered(page, 100);
      const cards = await page.locator('button.who').count();
      const text = await page.innerText('body');
      return { ok: cards > 0 || /пока нет|ещё нет/i.test(text), detail: `карточек связей ${cards}` };
    });

    await step('NDIM-DIMS-003', 'Можно удалить измерение: оценки в базе больше нет', async () => {
      if (!ratedDim) return { skip: true, detail: 'добавления не было' };
      await page.goto(`${BASE}/dims`, { waitUntil: 'domcontentloaded' });
      await rendered(page, 100);
      // Оценённое живёт во вкладке «Мой NDim ID» — там его человек и убирает.
      await page.getByRole('button', { name: 'Мой NDim ID' }).first().click();
      const card = page.locator(`article.dim[data-dim="${ratedDim}"]`);
      await card.waitFor({ timeout: 20000 });
      await card.scrollIntoViewIfNeeded().catch(() => {});
      await card.locator('.dots').click();
      await page.getByRole('button', { name: 'Убрать мою оценку' }).first().click();
      await page.waitForTimeout(2000);
      const gone = (await doc(`points/${devUid}/dims/${ratedDim}`)) === null;
      if (gone) ratedDim = null;
      await shot(page, '09-unrated');
      return { ok: gone, detail: 'документ оценки остался в базе' };
    });

    /* ── Логаут ── */
    section('Логаут');

    await step('NDIM-AUTH-006', 'Логаут: сессии нет, экран зовёт войти', async () => {
      await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
      await rendered(page, 100);
      const leave = page.getByRole('button', { name: 'Выйти' }).first();
      if ((await leave.count()) === 0) return { ok: false, detail: 'кнопки «Выйти» на экране нет' };
      await leave.click();
      await page.waitForTimeout(600);
      await page.getByRole('button', { name: 'Выйти' }).last().click().catch(() => {});
      await page.waitForTimeout(2500);
      const left = await sessionOf(page);
      await page.goto(`${BASE}/profile?as=none`, { waitUntil: 'domcontentloaded' });
      await rendered(page, 100);
      const text = await page.innerText('body');
      await shot(page, '10-signed-out');
      return {
        ok: left === null && /Войдите в Пространство|Войти/i.test(text),
        detail: `сессия после выхода: ${left ? left.uid : 'нет'}`,
      };
    });

    await step('NDIM-SHELL-003 (консоль)', 'Консоль полноценного человека чиста', async () => ({
      ok: errors.length === 0,
      detail: errors.slice(0, 3).join(' | ').slice(0, 300),
    }));

    await context.close();
  }
} catch (e) {
  record('fail', '—', 'Прогон целиком', `упал вне кейса: ${String(e.message ?? e).slice(0, 300)}`);
} finally {
  /* ═══ Уборка — база стенда общая для всех стражей (bugs/103) ═══ */
  section('Уборка');
  const leftovers = [];

  if (ratedDim) leftovers.push(`оценка ${ratedDim} осталась в базе`);

  if (profileRestore !== null && !flag('--keep')) {
    const { context, page } = await person(browser);
    try {
      await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
      await rendered(page, 100);
      const edit = page.getByRole('button', { name: 'Редактировать' }).first();
      if ((await edit.count()) > 0) {
        await edit.click();
        const field = page.locator('input.inp').first();
        await field.waitFor({ timeout: 10000 });
        await field.fill(profileRestore);
        await page.getByRole('button', { name: 'Сохранить' }).first().click();
        await page.waitForTimeout(1500);
        await page.reload();
        await rendered(page, 100);
        if ((await page.innerText('body')).includes('·smoke')) {
          leftovers.push('свойство профиля не вернулось к прежнему');
        }
      } else {
        leftovers.push('уборка профиля: кнопки «Редактировать» нет');
      }
    } catch (e) {
      leftovers.push(`уборка профиля упала: ${String(e.message).split('\n')[0]}`);
    }
    await context.close();
  }

  // Учётки прогона удаляются своим же токеном. Токен гостя после апгрейда протухает — это не
  // мусор, а та же учётка, которую удалит следующий токен, поэтому осечкой считаем лишь случай,
  // когда не сработал НИ ОДИН.
  let deleted = 0;
  for (const token of created) {
    const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:delete?key=demo-api-key`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    }).catch(() => null);
    if (res && res.ok) deleted++;
  }
  if (created.length > 0 && deleted === 0) leftovers.push('учётные записи прогона не удалены');

  record(leftovers.length === 0 ? 'pass' : 'fail', 'NDIM-DIMS-003', 'След прогона убран', leftovers.join(' · '));
  await browser.close();

  /* ═══ Отчёт ═══ */
  const minutes = ((Date.now() - started) / 60000).toFixed(1);
  const passed = results.filter((r) => r.state === 'pass').length;
  const failed = results.filter((r) => r.state === 'fail');
  const skipped = results.filter((r) => r.state === 'skip');

  console.log(`\n═══ SMOKE: ${passed} прошло · ${failed.length} не прошло · ${skipped.length} пропущено ═══`);
  console.log(`Окно: ${minutes} мин из 10 (критерий К3 эпика plans/54)`);
  if (failed.length > 0) {
    console.log('\nНЕ ПРОШЛИ:');
    for (const f of failed) console.log(`  ❌ ${f.name} [${f.ids}] — ${f.detail}`);
  }
  if (skipped.length > 0) {
    console.log('\nПРОПУЩЕНЫ (причина названа):');
    for (const s of skipped) console.log(`  ⏭️  ${s.name} [${s.ids}] — ${s.detail}`);
  }
  writeFileSync(`${OUT}/report.json`, JSON.stringify({ base: BASE, minutes: Number(minutes), results }, null, 2));
  console.log(`\nКадры и отчёт — ${OUT}/`);

  // Код возврата — через `exitCode`, а не `process.exit`: принудительный выход при живом браузере
  // роняет libuv ассертом, и падение прибора читается как падение продукта.
  process.exitCode = failed.length > 0 ? 1 : 0;
}

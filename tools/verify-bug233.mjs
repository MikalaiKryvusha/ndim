/**
 * Живая проверка бага 233 — КРОСС-БРАУЗЕРНЫЙ ВХОД ПО ССЫЛКЕ ИЗ ПИСЬМА.
 *
 * Находка ВЛАДЕЛЬЦА, живой прогон в бою 2026-09-12: «начал логиниться внутри одного браузера.
 * Письмо открыл в другом браузере, где уже был залогинен — получил ошибку: ссылка больше не
 * действует, и одновременно вижу свои данные». Его требование: «нужно, чтобы кросс браузерный
 * логин работал и был индемпотентен».
 *
 * ── ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ И ПОЧЕМУ ИМЕННО ТАК ───────────────────────────────────────────────
 *
 * Механизм дефекта снят чтением кода (`src/lib/data/account.ts:360`): почта, без которой
 * Firebase не завершит вход, лежит в `localStorage` ТОГО браузера, где вход НАЧАЛИ. В другом
 * браузере ключа нет — и продукт возвращает `expired-link`, то есть ставит диагноз «ссылка
 * протухла» там, где ссылка жива и Firebase о ней даже не спрашивали.
 *
 * 🔑 ОТДЕЛЬНЫЙ КОНТЕКСТ Playwright — ЭТО И ЕСТЬ «ДРУГОЙ БРАУЗЕР» ДЛЯ ЭТОГО ДЕФЕКТА.
 * Дефект целиком про отсутствие ключа в `localStorage`, а контексты Playwright изолированы по
 * хранилищу полностью. Граница названа честно: это НЕ доказывает поведение двух разных
 * браузерных движков — доказывает ровно то, чем дефект вызван.
 *
 * ── ТРИ СЛУЧАЯ (нумерация — критерии приёмки из `bugs/233`) ─────────────────────────────────
 *
 *   К1 · браузер Б ЧИСТЫЙ, сессии нет → вход обязан СОСТОЯТЬСЯ (сегодня: ошибка + новый гость);
 *   К2 · браузер Б УЖЕ ВОШЁЛ тем же человеком → «Вы уже вошли»: ни ошибки, ни гостевой карточки
 *        поверх своих же данных (сегодня: ровно то, что видел владелец);
 *   К5 · ссылка ДЕЙСТВИТЕЛЬНО негодная → честный отказ обязан ОСТАТЬСЯ красным. Это контроль
 *        прибора (`TESTING_FRAMEWORK.md`, ворота 5): без него лечение К1/К2 могло бы просто
 *        перестать отказывать кому бы то ни было, и прибор этого не заметил бы.
 *
 * ⚠️ СЕГОДНЯ ПРИБОР ОБЯЗАН БЫТЬ КРАСНЫМ по К1 и К2 и ЗЕЛЁНЫМ по К5. Это воспроизведение, а не
 * страж: зелёный К1/К2 до починки означал бы, что проверка не умеет краснеть.
 *
 * Требует поднятого стенда: `npm run stand`.
 * Запуск: node tools/verify-bug233.mjs
 *
 * [NOT-TESTED]
 */

import { mkdir } from 'node:fs/promises';
import { basename } from 'node:path';
import { chromium } from '@playwright/test';

import { portsFor, slotOf } from './lib/stand-slot.mjs';

const BASE =
  process.env.PROBE_BASE ?? `http://localhost:${portsFor(slotOf(basename(process.cwd())).slot).dev}`;
const AUTH = 'http://127.0.0.1:9099';
const PROJECT = 'demo-ndim-dev';
const SHOTS = 'test-results/bug233';

/** Текст, которым продукт сегодня объявляет живую ссылку мёртвой (`profile/+page.svelte:966`). */
const DEAD_LINK = 'Ссылка больше не действует';

/** Заголовок гостевой карточки — её появление поверх данных вошедшего и есть вторая половина К2. */
const GUEST_CARD = 'Сейчас Вы гость';

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Просит эмулятор выпустить почтовую ссылку — это и есть «письмо», только без почтового ящика. */
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

  const codes = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`).then((r) => r.json());
  const mine = (codes.oobCodes ?? []).filter(
    (c) => c.email === email && c.requestType === 'EMAIL_SIGNIN',
  );
  const last = mine.at(-1);
  if (!last) throw new Error(`эмулятор не выпустил oobCode для ${email}`);
  return `${BASE}/profile?mode=signIn&oobCode=${last.oobCode}&apiKey=demo-api-key`;
}

/** Новый изолированный контекст = отдельный браузер: своё хранилище, своя сессия. */
async function browserOf(browser, label) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${label}: ${e}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${label}: ${m.text()}`);
  });
  return { context, page, errors };
}

/**
 * Кто сейчас за экраном по мнению самого Firebase.
 *
 * 🔴 ЧИТАЕТСЯ INDEXEDDB, А НЕ `localStorage` — и первая редакция этого прибора ошиблась именно
 * здесь. Firebase JS SDK с девятой версии хранит сессию в IndexedDB
 * (`firebaseLocalStorageDb` → `firebaseLocalStorage`), а на `localStorage` откатывается лишь
 * там, где IndexedDB недоступен. Прибор, смотревший только в `localStorage`, возвращал
 * «сессии нет» ВСЕГДА — то есть печатал правдоподобное ложное число и красил зелёным контроль
 * К5, который не мог покраснеть ни при каком исходе (`AGENT_GUIDE.md` → лестница трёх вопросов,
 * вопрос 3: промах АДРЕСАЦИИ даёт ровно тот же ответ, что настоящее отсутствие).
 *
 * Оба хранилища опрашиваются, потому что ответ «где лежит сессия» принадлежит браузеру, а не нам.
 */
async function whoAmI(page) {
  return page.evaluate(async () => {
    /** Записи Firebase из IndexedDB: {fbase_key, value}. */
    const fromIndexedDb = () =>
      new Promise((resolve) => {
        let open;
        try {
          open = indexedDB.open('firebaseLocalStorageDb');
        } catch {
          resolve([]);
          return;
        }
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
            resolve([]);
            return;
          }
          const request = db.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
          request.onerror = () => resolve([]);
          request.onsuccess = () => resolve(request.result ?? []);
        };
      });

    const records = (await fromIndexedDb())
      .filter((r) => String(r.fbase_key ?? '').startsWith('firebase:authUser:'))
      .map((r) => r.value);

    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith('firebase:authUser:')) continue;
      try {
        records.push(JSON.parse(localStorage.getItem(key)));
      } catch {
        /* битая запись — не сессия */
      }
    }

    const user = records.find((u) => u && typeof u === 'object');
    if (!user) return { signedIn: false, email: null, anonymous: null, where: 'нигде' };
    return {
      signedIn: true,
      email: user.email ?? null,
      anonymous: user.isAnonymous === true,
      where: 'indexeddb|localstorage',
    };
  });
}

/** Виден ли текст на экране — ПО ВИДИМОСТИ, а не по наличию в разметке (канон `bugs/40`). */
async function visibleText(page, needle) {
  return page.evaluate((text) => document.body.innerText.includes(text), needle);
}

await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch();

/*
 * Почта случайная на каждый прогон: иначе второй прогон входил бы в аккаунт, рождённый первым,
 * и случай «новый человек» перестал бы быть новым — класс «материал не даёт проверке упасть»
 * (`AGENT_GUIDE.md` → лестница трёх вопросов, вопрос 3).
 */
const EMAIL = `bug233-${Date.now()}@ndim.space`;

try {
  // ═══ К0 · КОНТРОЛЬ САМОГО ПРИБОРА — ДО любых выводов о продукте ═══════════════════════════
  //
  // `EXP-0082` и лестница трёх вопросов: прежде чем поверить ответу «сессии нет», предъяви
  // случай, где сессия ЕСТЬ ГАРАНТИРОВАННО, и убедись, что прибор её видит. Стенд на голом
  // адресе входит сам как `dev@ndim.space` (`profile.ts` → `currentSession`) — это и есть
  // бесплатный положительный контроль. Не увидели его — все числа ниже недействительны.
  console.log('К0 · контроль прибора: видит ли он ЗАВЕДОМО живую сессию:');
  {
    const { context, page } = await browserOf(browser, 'К0');
    await page.goto(`${BASE}/profile`);
    await page.waitForTimeout(4000);
    const me = await whoAmI(page);

    check('прибор читает живую сессию стенда (dev@ndim.space)', me.email === 'dev@ndim.space',
      `увидел: ${me.signedIn ? `${me.email ?? 'без почты'}${me.anonymous ? ' (аноним)' : ''}` : 'ничего'} · где: ${me.where}`);
    await context.close();

    if (failures > 0) {
      console.log('\n⛔ КОНТРОЛЬ ПРИБОРА КРАСНЫЙ — прогон остановлен.');
      console.log('   Прибор не умеет видеть сессию, значит любой его ответ «сессии нет» ничего');
      console.log('   не означает. Сначала чинится прибор, потом судится продукт.');
      process.exit(2);
    }
  }

  // ═══ К1 · браузер Б ЧИСТЫЙ: сессии нет, ключа почты нет ═══════════════════════════════════
  console.log(`К1 · ссылка открыта в ЧИСТОМ втором браузере (почта ${EMAIL}):`);
  {
    // Браузер А начинает вход — кладёт почту в СВОЁ хранилище. Мы его даже не открываем:
    // важно ровно то, что второй браузер о нём ничего не знает.
    const link = await requestSignInLink(EMAIL);

    const { context, page, errors } = await browserOf(browser, 'К1');
    await page.goto(link);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${SHOTS}/k1-clean-browser.png`, fullPage: true });

    const dead = await visibleText(page, DEAD_LINK);
    const me = await whoAmI(page);

    check('вход состоялся — продукт НЕ объявил живую ссылку мёртвой', !dead,
      dead ? `на экране «${DEAD_LINK}»` : '');
    check('человек вошёл своей почтой, а не стал гостем', me.email === EMAIL,
      `сессия: ${me.signedIn ? (me.anonymous ? 'АНОНИМНЫЙ ГОСТЬ' : me.email) : 'нет'}`);
    check('консоль чиста', errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }

  // ═══ К2 · браузер Б УЖЕ ВОШЁЛ тем же человеком — случай владельца ═════════════════════════
  console.log('\nК2 · ссылка открыта в браузере, где ТОТ ЖЕ человек уже вошёл:');
  {
    const { context, page, errors } = await browserOf(browser, 'К2');

    // Сначала честно входим первой ссылкой — это и создаёт «браузер, где я уже залогинен».
    const first = await requestSignInLink(EMAIL);
    await page.goto(first);
    await page.waitForTimeout(1500);
    // Ключ почты продукт кладёт только в браузере ОТПРАВКИ; здесь его нет, поэтому первый
    // вход доводим тем же путём, каким его довёл бы сам продукт, — кладём почту и перезаходим.
    await page.evaluate((e) => localStorage.setItem('ndim-pending-email', e), EMAIL);
    await page.goto(await requestSignInLink(EMAIL));
    await page.waitForTimeout(4000);

    const before = await whoAmI(page);
    check('подготовка: человек действительно вошёл своей почтой', before.email === EMAIL,
      `сессия: ${before.signedIn ? (before.anonymous ? 'гость' : before.email) : 'нет'}`);

    /*
     * 🔑 КАДР «ДО» — И ОН ЖЕ РАЗВОДИТ ДВА ОБЪЯСНЕНИЯ ОДНОГО НАБЛЮДЕНИЯ.
     *
     * Кадры трёх случаев вышли побайтово одинаковыми, а у такого совпадения есть две причины,
     * и лечения у них разные: либо продукт ДЕЙСТВИТЕЛЬНО рисует всем один экран, либо зонд
     * снял одну и ту же страницу трижды. Этот кадр обязан ОТЛИЧАТЬСЯ от кадра «после»: на нём
     * человек вошёл, ошибки нет, гостевой карточки нет. Совпал с «после» — виноват зонд, и
     * ни одно число прогона не действительно.
     */
    await page.screenshot({ path: `${SHOTS}/k2-before-opening-link.png`, fullPage: true });
    const beforeDead = await visibleText(page, DEAD_LINK);
    const beforeGuestCard = await visibleText(page, GUEST_CARD);
    check('подготовка: ДО открытия ссылки экран чист — ни ошибки, ни гостевой карточки',
      !beforeDead && !beforeGuestCard,
      `ошибка: ${beforeDead ? 'есть' : 'нет'} · гостевая карточка: ${beforeGuestCard ? 'есть' : 'нет'}`);

    // Теперь — то, что сделал владелец: открыть НОВУЮ ссылку из письма в этом же браузере.
    await page.goto(await requestSignInLink(EMAIL));
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${SHOTS}/k2-already-signed-in.png`, fullPage: true });

    const dead = await visibleText(page, DEAD_LINK);
    const guestCard = await visibleText(page, GUEST_CARD);
    const after = await whoAmI(page);

    check('ошибки о мёртвой ссылке НЕТ — человек просто уже вошёл', !dead,
      dead ? `на экране «${DEAD_LINK}»` : '');
    check('гостевая карточка НЕ накрывает данные вошедшего', !guestCard,
      guestCard ? `на экране «${GUEST_CARD}»` : '');
    check('человек остался собой', after.email === EMAIL,
      `сессия: ${after.signedIn ? (after.anonymous ? 'АНОНИМНЫЙ ГОСТЬ' : after.email) : 'нет'}`);
    check('консоль чиста', errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }

  // ═══ К5 · КОНТРОЛЬ ПРИБОРА: негодная ссылка обязана остаться негодной ═════════════════════
  console.log('\nК5 · контроль — ссылка с испорченным кодом (обязана честно отказать):');
  {
    const { context, page } = await browserOf(browser, 'К5');
    const broken = `${BASE}/profile?mode=signIn&oobCode=NOT-A-REAL-CODE-233&apiKey=demo-api-key`;
    await page.evaluate; // (no-op: контекст свежий, ключей нет — как у человека из письма)
    await page.goto(broken);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${SHOTS}/k5-truly-broken-link.png`, fullPage: true });

    const me = await whoAmI(page);
    check('негодная ссылка НЕ впускает никого под чужой почтой', me.email === null || me.anonymous === true,
      `сессия: ${me.signedIn ? (me.anonymous ? 'гость' : me.email) : 'нет'}`);
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`\nПРОВАЛОВ: ${failures}`);
console.log(`Кадры: ${SHOTS}/`);
process.exit(failures === 0 ? 0 : 1);

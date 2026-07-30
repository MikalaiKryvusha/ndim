/**
 * Страж входа в СВОЙ аккаунт из-под гостя — `bugs/84` (волна `ideas/21`, пункт 13).
 *
 * Слово владельца:
 *   «мой основной аккаунт kotkrinik@yandex.ru — не пустило. Одновременно пишет "Сейчас Вы
 *    гость — Ваши результаты не сохранены" и "Этот способ входа уже связан с другим профилем
 *    NDim…" Две проблемы: а) не могу авторизоваться; б) неконсистентное состояние…»
 *
 * Что стережём — ВЕСЬ путь человека, а не отдельную кнопку:
 *   гость → «Меню» → «Выйти» → карточка входа → ссылка на почту → ОН В СВОЁМ аккаунте.
 * Каждое звено этой цепи до починки было заперто, и заперты они были ДРУГ ДРУГОМ, поэтому
 * проверять их порознь бессмысленно.
 *
 * ⚠️ ПОЧЕМУ ЭТОГО НЕ БЫЛО РАНЬШЕ: на стенде существовало РОВНО ОДНО состояние человека —
 * вошедший `dev@ndim.space`. Гостя и «не вошёл» стенд не умел показывать вовсе, поэтому
 * гостевые ветки и карточка входа не проверялись никогда — ни автоматикой, ни глазами.
 * Для этого заведены стендовые двери `?as=guest` и `?as=none` (`src/lib/data/profile.ts`).
 *
 * ⚠️ Почтовая ссылка берётся у эмулятора Auth по REST (`/emulator/v1/.../oobCodes`) — письма
 * никто не отправляет и не читает (приём из `verify-bugs08.mjs`, EXP-0045).
 *
 * Запуск: `npm run stand`, затем `node tools/verify-bug84.mjs`.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const AUTH = 'http://127.0.0.1:9099';
const PROJECT = 'demo-ndim-dev';
const EXISTING = 'dev@ndim.space'; // аккаунт, который у нас УЖЕ есть — роль «основного» владельца
const OUT = 'test-results/bug84';
mkdirSync(OUT, { recursive: true });

let pass = 0;
const fails = [];
function check(ok, what, detail = '') {
  if (ok) pass++;
  else {
    fails.push(`${what}${detail ? ' — ' + detail : ''}`);
    console.log(`  ❌ ${what}${detail ? ' — ' + detail : ''}`);
  }
}

/** Свежая почтовая ссылка входа прямо из эмулятора — вместо письма. */
async function loginLink(email) {
  const res = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes = [] } = await res.json();
  const mine = oobCodes.filter((c) => c.email === email && c.requestType === 'EMAIL_SIGNIN');
  const last = mine[mine.length - 1];
  if (!last) throw new Error(`нет oobCode для ${email}`);
  return `${BASE}/profile?mode=signIn&oobCode=${last.oobCode}&apiKey=demo-api-key`;
}

const browser = await chromium.launch();
try {
  for (const [theme, width] of [['light', 390], ['dark', 1440]]) {
    const tag = `${theme}-${width}`;
    console.log(`\nВход в свой аккаунт из-под гостя (${theme}, ${width}):`);
    const ctx = await browser.newContext({ viewport: { width, height: 860 }, locale: 'ru-RU' });
    await ctx.addInitScript((v) => localStorage.setItem('ndim-theme', v), theme);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const text = () => page.evaluate(() => document.body.innerText || '');

    // ── 1 · становимся гостем (с документом — как настоящий человек, что-то оценивший)
    await page.goto(`${BASE}/profile?guest=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4500);
    check(/гость/i.test(await text()), 'гостевая сессия заведена');
    // ⚠️ Сессию Firebase держит в IndexedDB, а НЕ в localStorage — первая редакция стража
    // искала её в localStorage и получала null на исправном продукте. Спрашиваем признак
    // сессии самого продукта (`ndim-session`, `src/lib/data/session.ts`) и видимое состояние
    // экранов: так же это видит владелец.
    const mark = () => page.evaluate(() => localStorage.getItem('ndim-session'));
    check((await mark()) !== null, 'признак сессии ndim-session поднят у гостя', String(await mark()));

    // ── 2 · КЛЮЧЕВОЕ: у гостя в «Меню» есть «Выйти». До починки замок стоял здесь.
    await page.goto(`${BASE}/menu?as=guest`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4500);
    const menu = await text();
    check(/◌ гость/.test(menu), '«Меню» показывает гостевое состояние');
    check(/Выйти/.test(menu), '🔑 у ГОСТЯ есть «Выйти» — замок снят (п. 13)');
    await page.screenshot({ path: `${OUT}/guest-menu-${tag}.png` });

    // ── 3 · выходим и убеждаемся, что сессии больше нет
    //
    // ⚠️ ВЫХОД ГОСТЯ ТЕПЕРЬ ДВУХСТУПЕНЧАТЫЙ (интервью №007, В3=А): первый тап разворачивает
    // врезку «Выйти? Ваши оценки исчезнут», выходит ВТОРОЙ. Этот страж поймал изменение сам —
    // «признак сессии снят» покраснел ровно на том, что сессия и не должна была сниматься с
    // одного тапа. Проверяем обе ступени: врезка обязана появиться, и только потом выход.
    await page.locator('button.row', { hasText: /Выйти/ }).first().click();
    await page.waitForTimeout(600);
    check(/Выйти\? Ваши оценки исчезнут/.test(await text()),
      '🔑 первый тап по «Выйти» разворачивает врезку подтверждения (В3=А)');
    check((await mark()) !== null, 'до подтверждения человек НЕ вышел — труд гостя цел');
    await page.screenshot({ path: `${OUT}/guest-leave-confirm-${tag}.png` });

    await page.locator('.warn-cta button', { hasText: /^Выйти$/ }).first().click();
    await page.waitForTimeout(2500);
    check((await mark()) === null, 'после подтверждения признак сессии снят');

    // ── 4 · карточка входа доступна (в бою это состояние наступает само; на стенде — дверь)
    await page.goto(`${BASE}/profile?as=none`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const signin = await text();
    check(/Войдите в Пространство/.test(signin), 'карточка входа показана');
    check(/Войти по ссылке на почту/.test(signin), 'предложен вход по ссылке на почту');
    await page.screenshot({ path: `${OUT}/signin-${tag}.png` });

    // ── 5 · просим ссылку на почту СУЩЕСТВУЮЩЕГО аккаунта
    await page.locator('button', { hasText: /Войти по ссылке на почту/ }).first().click();
    await page.waitForTimeout(900);
    await page.locator('input.acc-email').first().fill(EXISTING);
    await page.waitForTimeout(300);
    // Кнопка запроса ссылки — обычная `type="button"` с обработчиком, а не сабмит формы.
    await page.locator('button', { hasText: /Получить ссылку для входа/ }).first().click();
    await page.waitForTimeout(2500);
    check(/письмо|Письмо|почт/i.test(await text()), 'письмо со ссылкой заказано');
    await page.screenshot({ path: `${OUT}/link-sent-${tag}.png` });

    // ── 6 · проходим по ссылке — и это ГЛАВНОЕ: человек обязан оказаться в СВОЁМ аккаунте,
    //        а не увидеть «этот способ входа уже связан с другим профилем».
    const link = await loginLink(EXISTING);
    await page.goto(link, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const after = await text();
    await page.screenshot({ path: `${OUT}/signed-in-${tag}.png` });

    check(!/уже связан с другим профилем/.test(after), '🔑 НЕТ ошибки «уже связан с другим профилем» (п. 13)');
    check(!/Сейчас Вы гость/.test(after), 'экран больше не считает человека гостем');

    check((await mark()) !== null, 'сессия есть — признак поднят');
    // Чья это сессия — спрашиваем ЭКРАН, а не внутренности SDK: «Меню» печатает почту
    // вошедшего. Так же это видит владелец.
    await page.goto(`${BASE}/menu`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const menuAfter = await text();
    await page.screenshot({ path: `${OUT}/menu-after-${tag}.png` });
    const acc = menuAfter.slice(menuAfter.indexOf('АККАУНТ'), menuAfter.indexOf('АККАУНТ') + 120).replace(/\n/g, ' | ');
    check(menuAfter.includes(EXISTING), `🔑 вошли ИМЕННО в свой аккаунт (${EXISTING})`, `в «Меню»: ${acc}`);
    check(!/◌ гость/.test(menuAfter), 'сессия не гостевая');

    // Отказы правил Firestore гостю ожидаемы и в консоли встречаются — отсекаем их,
    // остальное обязано быть чисто.
    // Отсекаем и служебный сокет `vite dev` (HMR): к продукту он отношения не имеет, но
    // при переходах по внешней ссылке успевает отвалиться и красит прогон.
    const real = errors.filter(
      (e) => !/permission|insufficient|Missing or insufficient/i.test(e) && !/WebSocket connection to 'ws:\/\/localhost:5173/.test(e),
    );
    check(real.length === 0, 'консоль чиста (кроме ожидаемых отказов правил)', real.join(' | ').slice(0, 200));
    await ctx.close();

    /*
     * ══ ВТОРОЙ СЦЕНАРИЙ: ДВЕ ДВЕРИ И НАМЕРЕНИЕ (интервью №007, В4=А; bugs/84 половина «б») ══
     *
     * Первый сценарий выше проходит путь, который у человека РАБОТАЛ только после ручного
     * выхода. Здесь проверяется то, чего в продукте не было вовсе: гость нажимает «У меня уже
     * есть аккаунт» и попадает домой БЕЗ ручного выхода, потому что путь входа выбирает его
     * НАМЕРЕНИЕ, а не сессия (`account.ts` → PENDING_INTENT_KEY).
     *
     * Контекст новый: в прежнем уже сидит вошедший `dev@ndim.space`, и гостя там не завести.
     */
    const ctx2 = await browser.newContext({ viewport: { width, height: 860 }, locale: 'ru-RU' });
    await ctx2.addInitScript((v) => localStorage.setItem('ndim-theme', v), theme);
    const p2 = await ctx2.newPage();
    const err2 = [];
    p2.on('pageerror', (e) => err2.push(String(e)));
    p2.on('console', (m) => m.type() === 'error' && err2.push(m.text()));
    const text2 = () => p2.evaluate(() => document.body.innerText || '');
    const mark2 = () => p2.evaluate(() => localStorage.getItem('ndim-session'));

    await p2.goto(`${BASE}/profile?guest=1`, { waitUntil: 'domcontentloaded' });
    await p2.waitForTimeout(4500);

    // ── 7 · в карточке гостя ДВЕ двери, а не одна
    const card = await text2();
    check(/Сохранить мои результаты/.test(card), 'дверь 1 «Сохранить мои результаты» на месте');
    check(/У меня уже есть аккаунт/.test(card), '🔑 дверь 2 «У меня уже есть аккаунт» появилась (В4=А)');
    await p2.screenshot({ path: `${OUT}/two-doors-${tag}.png` });

    // ── 8 · врезка подтверждения ДО письма, а не ошибка после него
    await p2.locator('button', { hasText: /У меня уже есть аккаунт/ }).first().click();
    await p2.waitForTimeout(700);
    const warn = await text2();
    // ⚠️ Регистр НЕ учитываем намеренно: `innerText` в Chromium отдаёт текст УЖЕ применённым
    // `text-transform`, и первая редакция этой проверки краснела на исправном продукте только
    // потому, что `h3` в карточке рисуется прописными. Стережём слова, а не начертание.
    check(/Войти в свой аккаунт\? Ваши оценки исчезнут/i.test(warn),
      '🔑 врезка предупреждает о судьбе труда гостя ДО письма (В3=А)');
    check(!/Сейчас Вы гость/.test(warn),
      '🔑 гостевой заголовок НЕ соседствует с врезкой — состояния разведены (половина «б»)');
    check((await mark2()) !== null, 'до подтверждения гость никуда не вышел');
    await p2.screenshot({ path: `${OUT}/signin-warn-${tag}.png` });

    // ── 9 · подтверждает → форма почты двери входа
    await p2.locator('button', { hasText: /^Войти в свой аккаунт$/ }).first().click();
    await p2.waitForTimeout(700);
    check(/Вход в Ваш аккаунт/i.test(await text2()), 'открылась форма входа со своим заголовком');

    // ── 10 · просит ссылку на почту, которая ПРИНАДЛЕЖИТ ДРУГОМУ аккаунту
    await p2.locator('input.acc-email').first().fill(EXISTING);
    await p2.waitForTimeout(300);
    await p2.locator('button', { hasText: /Получить ссылку для входа/ }).first().click();
    await p2.waitForTimeout(2500);
    check(/письмо|Письмо|почт/i.test(await text2()), 'письмо со ссылкой заказано из двери входа');

    // ── 11 · ГЛАВНОЕ: проходит по ссылке ИЗ ГОСТЕВОЙ СЕССИИ и оказывается в СВОЁМ аккаунте.
    //         До этой работы здесь была ошибка «уже связан с другим профилем» (слово владельца).
    await p2.goto(await loginLink(EXISTING), { waitUntil: 'domcontentloaded' });
    await p2.waitForTimeout(6500);
    const done2 = await text2();
    await p2.screenshot({ path: `${OUT}/door2-signed-in-${tag}.png` });
    check(!/уже связан с другим профилем/.test(done2),
      '🔑 намерение сработало: НЕТ ошибки «уже связан с другим профилем»');
    check(!/Сейчас Вы гость/.test(done2), 'экран больше не считает человека гостем');
    /*
     * ⚠️ ГЛАВНАЯ ПРОВЕРКА СЦЕНАРИЯ, И ОНА ЗДЕСЬ, А НЕ НА «МЕНЮ».
     *
     * Мутация («выбрасываем намерение») вскрыла дыру в самом страже: проверка «в „Меню“ стоит
     * почта своего аккаунта» на стенде НЕ МОЖЕТ покраснеть — голый `/menu` без двери `?as=`
     * входит `dev@ndim.space` САМ (`currentSession()` → `signInDev()`), то есть печатает нужную
     * почту независимо от того, чем кончился вход. Она осталась ниже как смоук, но доказывает
     * не путь, а работу стенда.
     *
     * Судим по пилюле гостя в шапке (`AppBar.svelte:91`, `.badge`) на ТОЙ ЖЕ странице, куда
     * привела ссылка: там автовхода стенда нет (сработал `isLoginLink()`), и пилюля видна
     * ровно тогда, когда сессия осталась гостевой. Мутант обязан покраснеть именно здесь.
     */
    check((await p2.locator('.badge').count()) === 0,
      '🔑 пилюля «гость» в шапке ПОГАСЛА — сессия больше не гостевая',
      `пилюль: ${await p2.locator('.badge').count()}`);

    await p2.goto(`${BASE}/menu`, { waitUntil: 'domcontentloaded' });
    await p2.waitForTimeout(4000);
    const menu2 = await text2();
    await p2.screenshot({ path: `${OUT}/door2-menu-${tag}.png` });
    check(menu2.includes(EXISTING), `🔑 через ВТОРУЮ ДВЕРЬ вошли в свой аккаунт (${EXISTING})`,
      `в «Меню»: ${menu2.slice(menu2.indexOf('АККАУНТ'), menu2.indexOf('АККАУНТ') + 110).replace(/\n/g, ' | ')}`);
    check(!/◌ гость/.test(menu2), 'сессия не гостевая');

    const real2 = err2.filter(
      (e) => !/permission|insufficient|Missing or insufficient/i.test(e) && !/WebSocket connection to 'ws:\/\/localhost:5173/.test(e),
    );
    check(real2.length === 0, 'консоль чиста во втором сценарии', real2.join(' | ').slice(0, 200));
    await ctx2.close();
  }
} finally {
  await browser.close();
}

console.log(`\nИтог: ${pass} зелёных, ${fails.length} провалов`);
if (fails.length) fails.forEach((f) => console.log('  ❌ ' + f));
process.exit(fails.length ? 1 : 0);

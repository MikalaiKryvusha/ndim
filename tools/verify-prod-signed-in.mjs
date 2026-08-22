/**
 * 🔴 ОБЯЗАТЕЛЬНЫЙ СМОУК БОЯ ПОД СЕССИЕЙ — гоняется ПОСЛЕ КАЖДОГО ДЕПЛОЯ, без исключений.
 *
 * Правило владельца, дословно (2026-08-15, после того как он получил в бою неработающее
 * приложение): «**после каждого деплоя ты должен залогиниться в свой тестовый аккаунт и пройти
 * смоук тестирование**… деплой без тестирования это пердёж в лужу, а не работа».
 *
 * ═══ ПОЧЕМУ ЭТОГО НЕ ЛОВИЛ НИ ОДИН ПРИБОР ═══
 *
 * Все боевые смоуки проекта (`verify-prod-b4`, `verify-prod-dimension-pages`,
 * `verify-prod-lang-redirects`) ходят ГОСТЕМ, то есть по публичным страницам. Приложение под
 * сессией — «Профиль», «Связи», «Измерения», «Пространство», «Меню» — не проверял в бою НИКТО,
 * и когда после выката оно перестало стартовать вовсе (`bugs/124`: старый HTML + новые чанки),
 * все приборы были зелёными. Дефект нашёл владелец. Это тот же класс, что `EXP-0114`.
 *
 * ═══ ЧТО ДЕЛАЕТ ═══
 *
 * Входит в бой НАСТОЯЩИМ путём человека — кнопкой «Продолжить как гость» на самом экране (не
 * подкладывая сессию снаружи), проходит все пять экранов приложения и судит:
 *   · приложение СТАРТОВАЛО (есть отрисованный контент, а не белый экран);
 *   · консоль чиста от ошибок рантайма — в первую очередь от `TypeError`, которым падает
 *     склейка версий (`Cannot read properties of undefined (reading 'data')`);
 *   · переход «Профиль» → «Как меня видят» → «Назад» не дёргает контент (`bugs/117`) — то самое
 *     место, которое чинилось трижды и в бою не проверялось ни разу;
 *   · навигация работает: каждый экран отвечает своим содержимым.
 *
 * 🧹 **Убирает за собой:** анонимная учётная запись, заведённая прогоном, удаляется своим же
 * `idToken` (тот же приём, что в `probe-prod-stats.mjs`). Токен перехватывается из ответа
 * `accounts:signUp` — снаружи его иначе не достать, SDK держит сессию в IndexedDB.
 *
 * **AUTH на анонимный вход в бой:** интервью №013, В2 = Б — слово владельца «не испортит…
 * Тестирование боем — залог качества». Документа `points/{uid}` анонимный вход не создаёт,
 * поэтому цифры витрины прогон не двигает.
 *
 * Запуск: `node tools/verify-prod-signed-in.mjs [--base https://ndimspace.app]`
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { contourFromArgv } from './lib/contours.mjs';
import { watchHttpFailures } from './lib/http-failures.mjs';

/*
 * 🔑 КОНТУР ВЫБИРАЕТСЯ ОДИН РАЗ И ЦЕЛИКОМ (`plans/53` фаза 4).
 *
 * Прежняя редакция брала адрес из `--base`, а ключ для уборки — БОЕВОЙ константой. Прогон по
 * стейджу заводил стейджевую учётку и пытался удалить её боевым ключом: удаление молча не
 * проходило, а прибор печатал предупреждение мелким шрифтом. То есть «убирает за собой» держалось
 * на том, что прибор никогда не запускали в другом контуре, — ровно до дня, когда контуров стало
 * два. Теперь адрес, ключ и база приезжают ОДНИМ объектом (`tools/lib/contours.mjs`), и взять их
 * из разных контуров нечем.
 */
const CONTOUR = contourFromArgv();
const BASE = CONTOUR.site;
const OUT = `test-results/prod-signed-in${CONTOUR.name === 'prod' ? '' : '-' + CONTOUR.name}`;
mkdirSync(OUT, { recursive: true });

const CONFIGS = [
  { width: 390, height: 844, theme: 'light' },
  { width: 1440, height: 900, theme: 'dark' },
];

/** Экраны приложения и слово, по которому видно, что экран действительно отрисовался. */
const SCREENS = [
  { path: '/profile', name: 'Профиль', mark: /Личная информация|Мой NDim ID|Personal information/i },
  { path: '/relations', name: 'Связи', mark: /связ/i },
  { path: '/space', name: 'Пространство', mark: /пространств/i },
  { path: '/dims', name: 'Измерения', mark: /измерен/i },
  { path: '/menu', name: 'Меню', mark: /меню|о системе|поддерж/i },
];

let pass = 0;
const fails = [];
function check(ok, name, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fails.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

const browser = await chromium.launch();
const tokens = new Set();

for (const cfg of CONFIGS) {
  const tag = `${cfg.width}-${cfg.theme}`;
  console.log(`\n▶ ${CONTOUR.title} ${BASE} · ${cfg.theme} ${cfg.width}×${cfg.height}`);

  const ctx = await browser.newContext({ viewport: { width: cfg.width, height: cfg.height }, locale: 'ru-RU' });
  await ctx.addInitScript((theme) => {
    try { localStorage.setItem('ndim-theme', theme); } catch { /* приватный режим */ }
  }, cfg.theme);

  const page = await ctx.newPage();
  const errors = [];
  /*
   * 🔑 УШИ ПРИБОРА (`bugs/169`, второй дефект). Браузер не кладёт адрес в текст консольной
   * ошибки о загрузке ресурса: всё, что дверь печатала ночью, — голое «status 403», и виновника
   * (`exchangeRecaptchaV3Token`) пришлось искать отдельным зондом. Слушатель называет адрес,
   * код, тип ресурса и метод для каждого ответа ≥ 400.
   * ⚠️ Он НИЧЕГО НЕ СУДИТ: числа проверок и код выхода прибора не меняются. Судят прежние
   * проверки, а эта строка даёт им адрес — иначе чужой 4xx (шрифт, аналитика) останавливал бы
   * выкат. Границы и обрезка строки запроса — в шапке `tools/lib/http-failures.mjs`.
   */
  const net = watchHttpFailures(page, { label: `[${tag}] ` });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // Отказы правил гостю ожидаемы и не являются дефектом; всё остальное — провал.
    if (/permission|insufficient|Missing or insufficient/i.test(m.text())) return;
    /*
     * Качели сети — тоже не дефект продукта: Firestore честно сообщает о переподключении и
     * работает офлайн, пока связь не вернётся. Такое сообщение ПЕЧАТАЕТСЯ (чтобы не потерялось),
     * но провалом не считается — иначе прибор краснеет от чужого Wi-Fi, а не от нашей работы.
     * ⚠️ Это не смягчение: «экран отрисовался» и «нет TypeError» проверяются отдельно и строго,
     * и если разрыв связи реально сломал экран, они покраснеют.
     */
    if (/Could not reach Cloud Firestore backend|client will operate in offline mode|code=unavailable/i.test(m.text())) {
      console.log('  ⚪ сетевые качели (не провал): Firestore переподключается');
      return;
    }
    errors.push(m.text());
  });
  // Токен сессии — из ответа самого Firebase: снаружи его иначе не достать.
  page.on('response', async (r) => {
    if (!/identitytoolkit.*accounts:(signUp|signInWithCustomToken)/.test(r.url())) return;
    try {
      const body = await r.json();
      if (typeof body.idToken === 'string') tokens.add(body.idToken);
    } catch { /* не JSON — не наш ответ */ }
  });

  // ── 1 · старт приложения ────────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const bootText = await page.evaluate(() => document.body.innerText || '');
  check(bootText.length > 100, `[${tag}] приложение стартовало (страница не пуста)`, `символов ${bootText.length}`);
  check(
    !errors.some((e) => /TypeError/i.test(e)),
    `[${tag}] 🔴 в консоли нет TypeError (склейка версий, bugs/124)`,
    errors.filter((e) => /TypeError/i.test(e)).slice(0, 2).join(' | '),
  );

  // ── 2 · вход НАСТОЯЩИМ путём человека ───────────────────────────────────────────────────
  const guestBtn = page.getByRole('button', { name: /Осмотреться гостем|Look around as a guest/i });
  const needsLogin = await guestBtn.count() > 0;
  if (needsLogin) {
    await guestBtn.first().click();
    await page.waitForTimeout(7000);
  }
  const afterLogin = await page.evaluate(() => document.body.innerText || '');
  check(
    /Личная информация|Мой NDim ID|Personal information/i.test(afterLogin),
    `[${tag}] 🔑 вошли: «Профиль» показывает содержимое человека`,
    afterLogin.slice(0, 160),
  );
  await page.screenshot({ path: `${OUT}/${tag}-profile.png` });

  // ── 3 · переход, который чинился трижды и в бою не проверялся (`bugs/117`) ──────────────
  const seeMe = page.getByRole('button', { name: /Как меня видят|How others see me/i });
  if (await seeMe.count() > 0) {
    await seeMe.first().click();
    await page.waitForTimeout(1500);
    check(
      /Так Вас видит|audience|аудитория/i.test(await page.evaluate(() => document.body.innerText || '')),
      `[${tag}] «Как меня видят» открывается`,
    );
    await page.screenshot({ path: `${OUT}/${tag}-seeme.png` });

    // Возврат: замеряем верх контента по кадрам — контент не имеет права прыгать.
    await page.evaluate(() => {
      const trace = [];
      const shot = () => {
        const main = document.querySelector('main.body');
        const kid = main === null ? null : [...main.children].find((k) => !k.classList.contains('seeme'));
        const r = kid?.getBoundingClientRect();
        trace.push(r === undefined ? null : Math.round(r.top));
      };
      let n = 0;
      const step = () => { shot(); if (++n < 40) requestAnimationFrame(step); };
      window.__prodBack = trace;
      requestAnimationFrame(step);
    });
    await page.goBack();
    await page.waitForTimeout(1200);
    const trace = (await page.evaluate(() => window.__prodBack)).filter((v) => v !== null);
    const rest = trace.length === 0 ? null : trace[trace.length - 1];
    const jumpy = rest === null ? [] : trace.filter((v) => Math.abs(v - rest) > 4);
    /*
     * 🔑 ПАРНАЯ проверка, и порядок её обязателен (`EXP-0070`): сначала доказываем, что мерить
     * БЫЛО ЧЕМ. Первая редакция этого прибора при пустой трассе красила «контент не прыгает»
     * ЗЕЛЁНЫМ — потому что пустой массив ничем не сдвинут. Так страж врёт в самую опасную
     * сторону: он бы молчал ровно тогда, когда возврат не работает вовсе.
     */
    check(
      rest !== null,
      `[${tag}] 🔑 возврат закрыл предпросмотр и отрисовал «Профиль» (есть что мерить)`,
      'ни в одном кадре не нашлось содержимого профиля — предпросмотр не закрылся (bugs/125)',
    );
    if (rest !== null) {
      check(
        jumpy.length === 0,
        `[${tag}] 🔑 контент «Профиля» при возврате НЕ прыгает (bugs/117)`,
        `${jumpy.length} кадров сдвинуты, крайний ${jumpy.length === 0 ? 0 : Math.max(...jumpy.map((v) => Math.abs(v - rest)))}px`,
      );
    } else {
      console.log(`  ⚪ [${tag}] «контент не прыгает» — НЕЧЕМ МЕРИТЬ, проверка не засчитана`);
    }
    await page.screenshot({ path: `${OUT}/${tag}-back.png` });
  } else {
    check(false, `[${tag}] кнопка «Как меня видят» найдена`, 'её нет — экран не тот, что ожидался');
  }

  // ── 4 · все экраны приложения отвечают ──────────────────────────────────────────────────
  for (const screen of SCREENS) {
    await page.goto(BASE + screen.path, { waitUntil: 'domcontentloaded' });
    /*
     * Ждём СОСТОЯНИЯ, а не секундомера. Первая редакция ждала фиксированные 4 с и краснела на
     * 390 при живом продукте («символов 73» — экран ещё показывал загрузку): бой отвечает
     * медленнее стенда, и таймаут превращает прибор в лотерею. Условие ждёт до 25 с, но
     * возвращается сразу, как только экран наполнился.
     */
    await page
      .waitForFunction(() => (document.body.innerText || '').length > 150, null, { timeout: 25000 })
      .catch(() => { /* не наполнился — ниже это станет честным провалом с числом */ });
    const text = await page.evaluate(() => document.body.innerText || '');
    check(text.length > 80 && screen.mark.test(text), `[${tag}] «${screen.name}» отрисован`, `символов ${text.length}`);
    await page.screenshot({ path: `${OUT}/${tag}-${screen.name}.png` });
  }

  // ── 5 · консоль за весь проход ──────────────────────────────────────────────────────────
  /*
   * Отказы сети печатаются ВСЕГДА — и зелёным проходом тоже («ни одного»): молчание прибора
   * читается одинаково при «не было отказов» и при «уши отвалились», и различить это можно
   * только напечатанным числом наблюдений (правило судьи, `qa/team-verdicts.md`).
   */
  net.report();
  /*
   * И та же картина уезжает В ДЕТАЛЬ упавшей проверки: дверь печатает список провалов в самом
   * конце, и именно эту строку читает человек. Ночью она говорила «status 403» и молчала о том,
   * ЧТО отказало. Теперь красная строка называет адрес сама.
   */
  check(
    errors.length === 0,
    `[${tag}] консоль чиста за весь проход`,
    [errors.slice(0, 3).join(' | '), net.oneLine()].filter(Boolean).join(' · '),
  );

  await ctx.close();
}

await browser.close();

// ── 🧹 УБОРКА: анонимные учётки, заведённые прогоном ──────────────────────────────────────
// Публичный веб-ключ ТОГО КОНТУРА, в который ходили. Не секрет по устройству: он лежит в бандле у
// каждого посетителя, а первоисточник — `src/lib/firebase.ts`, с которым реестр сверяется сам.
const API_KEY = CONTOUR.apiKey;
let removed = 0;
for (const idToken of tokens) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (r.ok) removed += 1;
}
console.log(`\n🧹 анонимных учёток заведено ${tokens.size}, удалено ${removed}` +
  (removed === tokens.size ? ' — следа в бою не осталось.' : ' ⚠️ остаток проживёт 30 дней (чистка сервера).'));

console.log('\n──────────────────────────────────────────────────────────────────────');
console.log(`Проверок пройдено: ${pass}   Провалов: ${fails.length}`);
for (const f of fails) console.log(`  ❌ ${f}`);
console.log(`Кадры: ${OUT}/`);
process.exit(fails.length === 0 ? 0 : 1);

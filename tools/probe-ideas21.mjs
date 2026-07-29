/**
 * Прибор замера волны владельца `ideas/21` (ручной проход 29.07.2026) — НЕ страж.
 *
 * Зачем отдельный инструмент. Волна принесла 16 пунктов, из них девять измеримы браузером.
 * Мерить их по одному руками — тот самый «тык наугад», от которого владелец отказался прямо
 * («нужны инструменты для тестирования… а не для мучений и тыканий наугад», 2026-07-29).
 * Один прогон даёт снимок «до» по всей волне и тот же снимок «после» каждого фикса.
 *
 * Что это НЕ делает: не выносит вердиктов о готовности. Стражи пишутся отдельно, под каждый
 * фикс, и доказываются мутацией (`BUG_FIXING_FRAMEWORK.md` → «Стражи»). Здесь только факты
 * и пометка, совпадает ли факт с ожиданием владельца, — чтобы вывод читался глазами.
 *
 * Запуск: `npm run stand`, затем `node tools/probe-ideas21.mjs`.
 * Против боя: `PROBE_BASE=https://ndimspace.app node tools/probe-ideas21.mjs` (гостем —
 * часть замеров молча выпадет, это ожидаемо и печатается словом «гостю недоступно»).
 *
 * ⚠️ Между экранами ходим КЛИКАМИ, а не `goto`: переход по адресу стирает память приложения,
 * где живут и кэш сессии (`ideas/18`), и всё, что мы здесь меряем. `goto` мерил бы холодный
 * старт и был бы зелёным на сломанном продукте (EXP-0072).
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const OUT = 'test-results/ideas21';
mkdirSync(OUT, { recursive: true });

const PROD = !BASE.includes('localhost');
const report = [];

function say(line) {
  console.log(line);
  report.push(line);
}
/** Факт против ожидания владельца. Прибор не решает, готово ли, — он показывает расхождение. */
function fact(name, got, want, ok) {
  say(`  ${ok ? '✅' : '❌'} ${name}\n       факт: ${got}\n       ждём: ${want}`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 160)));
await page.addInitScript(() => localStorage.setItem('ndim-theme', 'light'));

const scrollY = () => page.evaluate(() => Math.round(window.scrollY));
const tap = async (name) => {
  await page.locator('a:visible', { hasText: new RegExp('^' + name + '$') }).first().click();
  await page.waitForTimeout(1400);
};
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

say(`\n╔══ ЗАМЕР ВОЛНЫ ideas/21 · ${BASE} ══╗\n`);

// ─────────────────────────────────────────────────────────────────────────────
// П. 10 · счётчик людей на лендинге доезжает «на горячую»
// Покадровая rAF-трасса (метод EXP-0060): нас интересует не «есть ли число», а
// МЕНЯЕТСЯ ли оно после того, как человек уже видит лендинг.
// ─────────────────────────────────────────────────────────────────────────────
say('П. 10 · счётчик людей на лендинге');
await page.goto(BASE + '/', { waitUntil: 'commit' });
const counterTrace = await page.evaluate(
  () =>
    new Promise((done) => {
      const seen = [];
      let frames = 0;
      const tick = () => {
        const m = (document.body.innerText || '').match(/С нами уже\s+([\d\s ]+)\s+челов|We are already\s+([\d\s ]+)/);
        const val = m ? (m[1] || m[2] || '').replace(/[\s ]/g, '') : null;
        if (!seen.length || seen[seen.length - 1].v !== val) seen.push({ f: frames, v: val });
        if (++frames < 240) requestAnimationFrame(tick);
        else done(seen);
      };
      requestAnimationFrame(tick);
    }),
);
say('       трасса значений по кадрам: ' + JSON.stringify(counterTrace));
// ⚠️ Переход null → «4» — ЭТО И ЕСТЬ доезд «на горячую»: строки не было, человек уже
// смотрит на лендинг, строка появилась. Первая редакция прибора считала такой переход
// за «одно значение» и красила дефект зелёным — правило EXP-0082 в чистом виде:
// у проверки, где «ничего не менялось» = хорошая новость, ноль обязан быть настоящим.
const first = counterTrace[0];
const settled = counterTrace[counterTrace.length - 1];
fact(
  'счётчик готов до показа, а не доезжает',
  `кадр 0: ${JSON.stringify(first.v)} · итог: ${JSON.stringify(settled.v)} на кадре ${settled.f}`,
  'на кадре 0 уже итоговое значение (появление строки после первого кадра = доезд на горячую)',
  counterTrace.length === 1 && first.v !== null,
);

// ─────────────────────────────────────────────────────────────────────────────
// П. 11 · персонажи Настя / Макс / Алиса в треугольник-карте
// ─────────────────────────────────────────────────────────────────────────────
say('\nП. 11 · персонажи на интерактивной карте лендинга');
await page.waitForTimeout(2500);
await shot('10-11-landing');
const personas = await page.evaluate(() =>
  [...document.querySelectorAll('image, img')]
    .filter((e) => /personas?\//.test(e.getAttribute('href') || e.getAttribute('src') || ''))
    .map((e) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return {
        tag: e.tagName,
        who: (e.getAttribute('href') || e.getAttribute('src') || '').split('/').pop(),
        w: Math.round(r.width),
        opacity: cs.opacity,
        visibility: cs.visibility,
        // для SVG <image> naturalWidth не существует — пиксели проверяем иначе
        natural: e.naturalWidth ?? null,
      };
    }),
);
for (const p of personas) say('       ' + JSON.stringify(p));
const svgFaces = personas.filter((p) => p.tag === 'image');
const invisible = svgFaces.filter((p) => Number(p.opacity) === 0);
fact(
  'лица персонажей на карте видны',
  svgFaces.length ? `SVG-лиц ${svgFaces.length}, из них с opacity 0: ${invisible.length} (${invisible.map((p) => p.who).join(', ') || '—'})` : 'SVG-лиц на карте не найдено',
  'все лица с ненулевой непрозрачностью',
  svgFaces.length > 0 && invisible.length === 0,
);

// ─────────────────────────────────────────────────────────────────────────────
// ПП. 1 и 9 · память прокрутки по каждому экрану
// ─────────────────────────────────────────────────────────────────────────────
say('\nПП. 1 и 9 · память прокрутки при навигации');
await page.goto(BASE + '/profile', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(PROD ? 5000 : 3500);
const guest = await page.evaluate(() => /Войти|Sign in|Вы гость/.test(document.body.innerText || ''));
if (PROD && guest) {
  say('       гостю недоступно — нужен вход');
} else {
  for (const screen of ['Измерения', 'Связи', 'Пространство']) {
    await tap(screen);
    await page.waitForTimeout(1600);
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForTimeout(700);
    const left = await scrollY();
    await tap('Профиль');
    await page.waitForTimeout(1200);
    await tap(screen);
    await page.waitForTimeout(1600);
    const back = await scrollY();
    fact(`«${screen}» помнит, где её оставили`, `ушёл с ${left}, вернулся на ${back}`, `вернуться на ${left}`, back === left);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// П. 2 · панель «Все / Мой NDim ID» при смене вкладки
// Меряем ВИДИМОСТЬ панели в окне, а не наличие узла: узел есть всегда.
// ─────────────────────────────────────────────────────────────────────────────
say('\nП. 2 · панель «Все / Мой NDim ID» при смене вкладки');
await tap('Измерения');
await page.waitForTimeout(2000);
const bar = () =>
  page.evaluate(() => {
    const all = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === 'Все');
    if (!all) return null;
    const el = all.closest('.segs') || all.parentElement;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), inView: r.bottom > 0 && r.top < innerHeight, scrollY: Math.round(window.scrollY) };
  });
if (!(await bar())) {
  say('       панели не нашёл (гость?)');
} else {
  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(800);
  const scrolled = await bar();
  say('       после прокрутки «Все» вниз: ' + JSON.stringify(scrolled));
  // ⚠️ Прятание панели при прокрутке ВНИЗ — это КАНОН 1.x, а не дефект: там
  // `top_sticky_toolbar` уезжал `translateY(-200%)` вниз и возвращался вверх. Первая
  // редакция прибора ждала «видна всегда» и объявила бы дефектом задуманное поведение.
  // Дефект владельца — в другом: панель пропадает при СМЕНЕ ВКЛАДКИ, где он не листал.
  say(`       (прокрутка вниз прячет панель НАМЕРЕННО — канон 1.x; сейчас видна=${scrolled.inView})`);

  await page.locator('button:visible', { hasText: /^Мой NDim ID$/ }).first().click();
  await page.waitForTimeout(1300);
  const mine = await bar();
  await shot('02-bar-mine');
  await page.locator('button:visible', { hasText: /^Все$/ }).first().click();
  await page.waitForTimeout(1300);
  const back = await bar();
  await shot('02-bar-all');
  say('       на «Мой NDim ID»: ' + JSON.stringify(mine));
  say('       обратно на «Все»: ' + JSON.stringify(back));
  fact('панель видна после смены вкладки туда-обратно', `«Мой NDim ID» видна=${mine.inView}, «Все» видна=${back.inView}`, 'видна в обоих состояниях', mine.inView && back.inView);
}

// ─────────────────────────────────────────────────────────────────────────────
// ПП. 4 и 5 · крестик очистки и фокус после отправки поиска
//
// Крестик — НЕ наша кнопка, а нативный `::-webkit-search-cancel-button` у
// `input[type=search]`. Поэтому меряем псевдоэлемент, а не разметку: искать его
// среди <button> бессмысленно, там его нет и не будет.
// Фокус после отправки — это и есть механика п. 5: Android закрывает клавиатуру,
// когда поле теряет фокус. Настоящую клавиатуру десктопный Chrome не покажет,
// поэтому честно меряем ПРИЧИНУ, а не следствие (иначе прибор доказывал бы себя).
// ─────────────────────────────────────────────────────────────────────────────
say('\nПП. 4 и 5 · поиск: крестик очистки и фокус после отправки');
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(600);
const openBtn = page.locator('button[aria-label="Поиск измерения"]').first();
if (!(await openBtn.count())) {
  say('       ящика поиска нет (гость?)');
} else {
  await openBtn.click();
  await page.waitForTimeout(800);
  const probeSearch = async (how) => {
    const input = page.locator('input.search').first();
    await input.fill('');
    await input.fill('кино');
    await page.waitForTimeout(500);
    // ⚠️ Геометрию `::-webkit-search-cancel-button` через getComputedStyle снять НЕЛЬЗЯ:
    // браузер отдаёт ширину САМОГО поля (249px), а не крестика, — первая редакция прибора
    // на этом соврала «крестик на месте». Меряем ПИКСЕЛЯМИ: снимок правой полосы поля до и
    // после отправки. Байты одинаковые — картинка не изменилась; разные — крестик пропал
    // (или появился). Это же единственный способ, работающий для нативного псевдоэлемента.
    const strip = async (name) => {
      const box = await page.locator('input.search').first().boundingBox();
      if (!box) return null;
      const buf = await page.screenshot({
        clip: { x: box.x + box.width - 34, y: box.y, width: 32, height: box.height },
        path: `${OUT}/${name}.png`,
      });
      return buf.toString('base64');
    };
    const readCancel = () =>
      page.evaluate(() => {
        const el = document.querySelector('input.search');
        if (!el) return null;
        const own = document.querySelector('button.clear');
        return {
          value: el.value,
          focused: document.activeElement === el,
          // Своя кнопка очистки появилась при починке bugs/77. Пока её не было, крестик был
          // нативный, и спросить о нём было не у кого — отсюда пиксельная полоса ниже.
          ownClear: !!own && own.getBoundingClientRect().width > 1,
        };
      });
    const before = await readCancel();
    const stripBefore = await strip(`04-strip-${how}-before`);
    if (how === 'click') await page.locator('button.go').first().click();
    else await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);
    const after = await readCancel();
    const stripAfter = await strip(`04-strip-${how}-after`);
    say(`       отправка «${how}»`);
    say(`         до : ${JSON.stringify(before)}`);
    say(`         пос: ${JSON.stringify(after)}`);
    say(`         правая полоса поля изменилась: ${stripBefore !== stripAfter}`);
    return { before, after, stripChanged: stripBefore !== stripAfter };
  };
  const byClick = await probeSearch('click');
  await shot('04-search-after-click');
  // ⚠️ ИСПРАВЛЕНО ПОСЛЕ ПОЧИНКИ bugs/77, и прежнее толкование было НЕВЕРНЫМ.
  // Первая редакция считала «полоса изменилась» доказательством пропавшего крестика. На самом
  // деле встроенный Chromium `::-webkit-search-cancel-button` НЕ РИСУЕТ ВООБЩЕ (проверено
  // кадром: в настоящем Chrome крестик есть, в Chromium полоса пуста), а менялся цвет РАМКИ:
  // снятие фокуса возвращает `--edge` вместо `--primary`. Наблюдение владельца верно, но
  // подтверждено оно его устройством, а не этим прибором.
  // Теперь спрашиваем прямо о СВОЕЙ кнопке очистки — она узел разметки, и врать тут нечему.
  fact(
    'крестик очистки не пропадает при отправке кнопкой',
    `поле="${byClick.after.value}", своя кнопка очистки видна=${byClick.after.ownClear}`,
    'кнопка очистки на месте, пока поле непустое',
    byClick.after.value !== '' && byClick.after.ownClear === true,
  );
  fact(
    'после отправки поле теряет фокус (Android закроет клавиатуру)',
    `фокус на поле=${byClick.after.focused}`,
    'фокус снят с поля',
    byClick.after.focused === false,
  );
  const byEnter = await probeSearch('enter');
  fact(
    'после Enter поле теряет фокус (та же механика п. 5)',
    `фокус на поле=${byEnter.after.focused}`,
    'фокус снят с поля',
    byEnter.after.focused === false,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// П. 7 · кнопки залипают в нажатом (тёмном) состоянии
// ─────────────────────────────────────────────────────────────────────────────
say('\nП. 7 · кнопка «Скопировать ссылку» после нажатия');
await tap('Меню');
await page.waitForTimeout(2000);
const copy = page.locator('button', { hasText: /Скопировать ссылку/ }).first();
if (!(await copy.count())) {
  say('       кнопки не нашёл');
} else {
  await copy.scrollIntoViewIfNeeded();
  const read = () =>
    copy.evaluate((e) => ({
      bg: getComputedStyle(e).backgroundColor,
      color: getComputedStyle(e).color,
      focused: document.activeElement === e,
      focusVisible: e.matches(':focus-visible'),
    }));
  const before = await read();
  await shot('07-copy-before');
  await copy.click();
  await page.waitForTimeout(1500);
  // Уводим указатель, чтобы :hover не путался с «залипанием»
  await page.mouse.move(5, 5);
  await page.waitForTimeout(600);
  const after = await read();
  await shot('07-copy-after');
  say('       до нажатия : ' + JSON.stringify(before));
  say('       после      : ' + JSON.stringify(after));
  fact('кнопка отщёлкивается обратно', `фон ${before.bg} → ${after.bg}, фокус=${after.focused}`, 'фон возвращается к исходному', before.bg === after.bg);
}

// ─────────────────────────────────────────────────────────────────────────────
// П. 6 · раздел «Данные» на экране «Меню»
// ─────────────────────────────────────────────────────────────────────────────
say('\nП. 6 · раздел «Данные» на экране «Меню»');
const dataSection = await page.evaluate(() => {
  const t = document.body.innerText || '';
  const i = t.indexOf('ДАННЫЕ');
  return i < 0 ? null : t.slice(i, i + 120).split('\n').slice(0, 4);
});
say('       ' + (dataSection ? JSON.stringify(dataSection) : 'раздела «ДАННЫЕ» нет'));

// ─────────────────────────────────────────────────────────────────────────────
// П. 16 · «В Пространстве с …» в профиле
// ─────────────────────────────────────────────────────────────────────────────
say('\nП. 16 · «В Пространстве с …» в профиле');
await tap('Профиль');
await page.waitForTimeout(2500);
const since = await page.evaluate(() => {
  const m = (document.body.innerText || '').match(/В Пространстве с[^\n]*/g);
  return m || [];
});
say('       вхождений: ' + JSON.stringify(since));
await shot('16-profile');

// ─────────────────────────────────────────────────────────────────────────────
// ПП. 14 и 15 · виджет «Сервер синхронизации»
// ─────────────────────────────────────────────────────────────────────────────
say('\nПП. 14 и 15 · виджет «Сервер синхронизации»');
await tap('Пространство');
await page.waitForTimeout(3500);
const widget = await page.evaluate(() => {
  const t = document.body.innerText || '';
  const i = t.indexOf('СЕРВЕР СИНХРОНИЗАЦИИ');
  return i < 0 ? null : t.slice(i, i + 900);
});
say(widget ? widget.split('\n').map((s) => '       | ' + s).join('\n') : '       виджета нет');
await shot('14-15-space');

// ─────────────────────────────────────────────────────────────────────────────
// П. 7, второй заход · ТЁМНАЯ тема и НАСТОЯЩИЙ тап пальцем
//
// Владелец тестирует телефоном. Мышиный клик и тап — разные истории: после тапа
// фокус остаётся на кнопке, и правило `:focus` (в отличие от `:focus-visible`)
// красит её как нажатую. Светлая тема мышью этого не показала — значит мерить
// надо там, где живёт человек, иначе прибор зелен, а продукт нет (EXP-0078).
// ─────────────────────────────────────────────────────────────────────────────
say('\nП. 7 (второй заход) · тёмная тема + тап пальцем');
const touchCtx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
const tp = await touchCtx.newPage();
await tp.addInitScript(() => localStorage.setItem('ndim-theme', 'dark'));
await tp.goto(BASE + '/menu', { waitUntil: 'domcontentloaded' });
await tp.waitForTimeout(3000);
const readBg = (loc) =>
  loc.evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, focused: document.activeElement === e, fv: e.matches(':focus-visible') }));

// ⚠️ Мерим только кнопки ДЕЙСТВИЯ. «Пригласить друзей» — строка навигации: тап уводит на
// другой экран, и читать её стиль «после» уже не у чего.
for (const label of ['Скопировать ссылку']) {
  const b = tp.locator('button:visible, a:visible', { hasText: new RegExp(label) }).first();
  if (!(await b.count().catch(() => 0))) {
    say(`       «${label}» — не нашёл`);
    continue;
  }
  await b.scrollIntoViewIfNeeded().catch(() => {});
  const was = await readBg(b).catch(() => null);
  if (!was) {
    say(`       «${label}» — не смог прочитать стиль`);
    continue;
  }
  await b.tap();
  await tp.waitForTimeout(1500);
  const now = await readBg(b);
  await tp.screenshot({ path: `${OUT}/07-dark-tap-${label.slice(0, 10)}.png` });
  say(`       «${label}»: ${was.bg} → ${now.bg} · фокус=${now.focused} · focus-visible=${now.fv}`);
  fact(`«${label}» отщёлкивается после тапа (тёмная тема)`, `${was.bg} → ${now.bg}`, 'фон возвращается к исходному', was.bg === now.bg);
}

// ⚠️ Вторая кандидатка, названная разведкой: «Искать» на «Измерениях» — ЕДИНСТВЕННАЯ кнопка
// проекта, которая по ховеру буквально ТЕМНЕЕТ (`color-mix(… var(--primary) 88%, #000)`).
// Слово владельца «цвет кнопки остаётся тёмным» ложится на неё точнее, чем на «Скопировать
// ссылку», и в этом же проходе он много раз тыкал именно в неё (пп. 4 и 5 той же волны).
await tp.goto(BASE + '/dims', { waitUntil: 'domcontentloaded' });
await tp.waitForTimeout(3000);
const openSearchT = tp.locator('button[aria-label="Поиск измерения"]').first();
if (await openSearchT.count()) {
  await openSearchT.tap();
  await tp.waitForTimeout(700);
  await tp.locator('input.search').first().fill('кино');
  await tp.waitForTimeout(500);
  const go = tp.locator('button.go').first();
  const was = await readBg(go);
  await go.tap();
  await tp.waitForTimeout(1500);
  const now = await readBg(go);
  await tp.screenshot({ path: `${OUT}/07-dark-tap-go.png` });
  say(`       «Искать»: ${was.bg} → ${now.bg} · фокус=${now.focused}`);
  fact('«Искать» не остаётся затемнённой после тапа', `${was.bg} → ${now.bg}`, 'фон возвращается к исходному', was.bg === now.bg);
} else {
  say('       «Искать» — ящика поиска нет');
}
await touchCtx.close();

say('\nКонсоль: ' + (consoleErrors.length ? consoleErrors.map((e) => '\n  ! ' + e).join('') : 'чисто'));
say('\nКадры: ' + OUT);
writeFileSync(`${OUT}/report.txt`, report.join('\n'), 'utf8');
await browser.close();

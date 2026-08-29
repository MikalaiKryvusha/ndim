/**
 * СТРАЖ `bugs/105` — «Как меня видят» живёт В РАБОЧЕЙ ОБЛАСТИ приложения, а не отдельным окном.
 *
 * Слово владельца дословно: «превью как меня видят открытается в каком-то отдельном окне, а не в
 * обычной рабочей области приложения - нужно внутри приложения открывать». Форму владелец назвал
 * сам — интервью №013, В1 = **вариант А**: «Предпросмотр рисуется там же, где содержимое Профиля;
 * шапка, нижняя панель и рельс остаются на своих местах и работают. Вторая шапка исчезает,
 * остаётся строка возврата».
 *
 * ── ЧЕМ МЕРИМ И ПОЧЕМУ ИМЕННО ТАК ──────────────────────────────────────────────────────────
 * 🔑 Видимость оболочки меряется `elementFromPoint`, а НЕ селектором и не `isVisible()`.
 * Дефект здесь в том и состоит, что слой `position: fixed; inset: 0; z-index: 70` ЗАКРАШИВАЕТ
 * шапку — при этом сама шапка остаётся в разметке, видимой и с честными координатами. Проверка
 * селектором была бы зелёной на сломанном коде (тот же капкан, что в `verify-bug40`: щит и
 * лендинг лежат в разметке ОБА и всегда).
 *
 * Поэтому вопрос ставится так, как его задаёт палец человека: «если ткнуть в середину шапки —
 * попаду я в шапку или в накрывший её слой?»
 *
 * ── КОНТРОЛЬ САМОГО ПРИБОРА (EXP-0082) ─────────────────────────────────────────────────────
 * Прогон сначала доказывает, что мерить БЫЛО ЧЕМ: до открытия предпросмотра оболочка обязана
 * быть достижимой, а после нажатия кнопки предпросмотр обязан реально открыться (карточка
 * «Каким Вас видят» на экране). Без этой пары «оболочка достижима» красилось бы зелёным на
 * экране, где предпросмотр просто не открылся.
 *
 * ── ЧТО ЕЩЁ СТЕРЕЖЁТСЯ, КРОМЕ ФОРМЫ ────────────────────────────────────────────────────────
 * Инвариант `bugs/76` (оплачен прошлой правкой владельца, ронять нельзя): у предпросмотра есть
 * СВОЯ запись в истории браузера, и системная «Назад» возвращает в профиль, а не выкидывает из
 * приложения. Ровно поэтому здесь проверяется и `history.back()`, а не только экранная кнопка.
 *
 * Запуск (нужен `npm run stand`):  node tools/verify-bug105.mjs [--quick]
 *   --quick — одна тема × 1440, для проверки стража мутациями.
 *
 * Запуск: node tools/verify-bug105.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const QUICK = process.argv.includes('--quick');
const SHOTS = 'test-results/bug105';

const THEMES = QUICK ? ['light'] : ['light', 'dark'];
const WIDTHS = QUICK ? [{ w: 1440, h: 900 }] : [{ w: 430, h: 932 }, { w: 1440, h: 900 }];

mkdirSync(SHOTS, { recursive: true });

let passed = 0;
const failures = [];

function check(ok, label, detail = '') {
  if (ok) {
    passed++;
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`   ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/**
 * Достижим ли элемент пальцем: берём середину его прямоугольника и спрашиваем браузер, кто
 * лежит в этой точке. Считаем достижимым, если найденный узел — сам элемент или его потомок.
 */
async function reachable(page, selector) {
  return page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return { exists: false, hit: null, reachable: false };
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return { exists: true, hit: null, reachable: false };
    const x = Math.min(Math.max(box.left + box.width / 2, 1), window.innerWidth - 1);
    const y = Math.min(Math.max(box.top + box.height / 2, 1), window.innerHeight - 1);
    const hit = document.elementFromPoint(x, y);
    return {
      exists: true,
      hit: hit ? `${hit.tagName.toLowerCase()}.${hit.className}`.slice(0, 60) : null,
      reachable: !!hit && element.contains(hit),
      rect: { top: Math.round(box.top), height: Math.round(box.height) },
    };
  }, selector);
}

const browser = await chromium.launch();

for (const theme of THEMES) {
  for (const { w, h } of WIDTHS) {
    const label = `${theme} ${w}×${h}`;
    console.log(`\n▶ ${label}`);

    const context = await browser.newContext({ viewport: { width: w, height: h } });
    // Тему продукта задаёт ключ `ndim-theme` ДО загрузки: системный colorScheme её не меняет,
    // и без этого «обе темы» проверялись бы формально (урок verify-icons).
    await context.addInitScript((value) => {
      localStorage.setItem('ndim-theme', value);
    }, theme);

    const page = await context.newPage();
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.body .card', { timeout: 20000 });

    /*
     * ⚠️ Какая навигация СЧИТАЕТСЯ оболочкой — зависит от ширины, и требовать обе разом нельзя.
     * Канон десктопной оболочки V2 (`ideas/17`, страж `e2e/desktop-shell.spec.ts`): от 1024px
     * нижнюю панель заменяет рельс слева, и «две навигации не видны разом». Первая редакция
     * этого стража требовала `nav.bnav` на 1440 и печатала «нет узла» — то есть врала о
     * продукте ровно там, где продукт исправен. Поймано контролем прибора ДО правки кода.
     */
    const rail = w >= 1024;
    const shell = rail
      ? [['header.bar', 'шапка'], ['nav.rail', 'десктопный рельс']]
      : [['header.bar', 'шапка'], ['nav.bnav', 'нижняя панель']];

    // ── Контроль прибора, часть 1: оболочка достижима ДО открытия предпросмотра ──────────
    for (const [selector, name] of shell) {
      const before = await reachable(page, selector);
      check(before.reachable, `[${label}] контроль прибора: ${name} достижима ДО открытия`, before.hit ?? 'нет узла');
    }

    // ── Открываем предпросмотр ───────────────────────────────────────────────────────────
    const opener = page.locator('button', { hasText: /Как меня видят|How others see me/ }).first();
    await opener.scrollIntoViewIfNeeded();
    await opener.click();
    await page.waitForSelector('.seeme', { timeout: 5000 });
    await page.waitForTimeout(400); // дать доиграть fade

    // ── Контроль прибора, часть 2: предпросмотр действительно открыт ─────────────────────
    const previewShown = await page.locator('.seeme .card h3').first().isVisible();
    check(previewShown, `[${label}] контроль прибора: предпросмотр реально открылся`);

    // ── ГЛАВНОЕ: оболочка на месте и достижима ПРИ ОТКРЫТОМ предпросмотре ────────────────
    for (const [selector, name] of shell) {
      const open = await reachable(page, selector);
      check(open.reachable, `[${label}] ${name} НЕ закрашена предпросмотром`, `в этой точке лежит: ${open.hit}`);
    }

    // ── Форма: предпросмотр — секция в потоке, а не полноэкранный слой ───────────────────
    const form = await page.evaluate(() => {
      const seeme = document.querySelector('.seeme');
      if (!seeme) return null;
      const style = getComputedStyle(seeme);
      return {
        position: style.position,
        zIndex: style.zIndex,
        inMain: !!seeme.closest('main.body'),
        bodyOverflow: document.body.style.overflow,
        secondHead: !!seeme.querySelector('.seeme-head h2'),
      };
    });
    check(form?.position !== 'fixed', `[${label}] предпросмотр не полноэкранный слой`, `position: ${form?.position}`);
    check(form?.inMain === true, `[${label}] предпросмотр лежит ВНУТРИ рабочей области main.body`);
    check(form?.secondHead === false, `[${label}] второй шапки с заголовком нет (вариант А)`);
    check(
      form?.bodyOverflow !== 'hidden',
      `[${label}] страница под предпросмотром не заблокирована скролл-локом`,
      `body.overflow: «${form?.bodyOverflow}»`,
    );

    // ── Оболочка не просто видима, а РАБОТАЕТ: ссылка навигации ловит палец ─────────────
    // Видимость и кликабельность — разные вещи: слой может пропускать пиксели, но перехватывать
    // события. Спрашиваем ту навигацию, которая на этой ширине и есть навигация.
    const navHref = await page.evaluate((selector) => {
      const link = document.querySelector(`${selector} a[href="/space"], ${selector} a[href="/relations"]`);
      if (!link) return null;
      const box = link.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit && link.contains(hit) ? link.getAttribute('href') : null;
    }, rail ? 'nav.rail' : 'nav.bnav');
    check(!!navHref, `[${label}] ссылка навигации кликабельна при открытом предпросмотре`);

    await page.screenshot({ path: `${SHOTS}/seeme-open-${theme}-${w}.png` });

    // ── Инвариант bugs/76: системная «Назад» закрывает предпросмотр, а не приложение ────
    await page.goBack();
    await page.waitForTimeout(400);
    const closed = (await page.locator('.seeme').count()) === 0;
    const stillProfile = new URL(page.url()).pathname === '/profile';
    const profileAlive = await page.locator('.body .card').first().isVisible();
    check(closed, `[${label}] «Назад» закрыла предпросмотр (bugs/76)`);
    check(stillProfile, `[${label}] «Назад» осталась в «Профиле», а не вышла из приложения`, page.url());
    check(profileAlive, `[${label}] содержимое «Профиля» вернулось на место`);

    check(errors.length === 0, `[${label}] консоль чиста`, errors.slice(0, 2).join(' | '));

    await context.close();
  }
}

await browser.close();

console.log(`\n${'─'.repeat(70)}`);
console.log(`Проверок пройдено: ${passed}   Провалов: ${failures.length}`);
if (failures.length) {
  console.log('\nПРОВАЛЫ:');
  for (const failure of failures) console.log(`  · ${failure}`);
}
console.log(`Скриншоты: ${SHOTS}/`);
process.exit(failures.length ? 1 : 0);

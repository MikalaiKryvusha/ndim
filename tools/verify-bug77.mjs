/**
 * Страж поиска на «Измерениях» — `bugs/77` (волна `ideas/21`, пункты 4 и 5).
 *
 * Что стережём — слово владельца дословно:
 *   п. 4: «Когда выполняешь поиск по кнопке "Искать" — в поле ввода исчезает кнопка крестик.
 *          Должна оставаться, пока в поле что-либо введено.»
 *   п. 5: «Когда нажимаешь кнопку поиска в клавиатуре Android — клавиатура остаётся открытой.
 *          Нужно закрывать.»
 *
 * ⚠️ ГЛАВНОЕ, ЧТО НАДО ЗНАТЬ ПРО ЭТУ ПАРУ: до фикса она была ВНУТРЕННЕ ПРОТИВОРЕЧИВОЙ.
 * Крестик был нативный (`::-webkit-search-cancel-button`), а Chrome показывает его только
 * пока поле в фокусе. Клавиатуру же Android закрывает ровно снятием фокуса. То есть выполнить
 * оба пункта под нативным контролом невозможно в принципе — доказано замером
 * (`tools/probe-ideas21.mjs`): отправка кликом уводила фокус и правая полоса поля менялась,
 * отправка Enter фокус оставляла и полоса не менялась. Поэтому крестик теперь СВОЙ.
 *
 * ⚠️ ПОЧЕМУ ЗДЕСЬ НЕ МЕРЯЮТ ПИКСЕЛЯМИ, хотя замер «до» мерил именно так. После фикса правая
 * полоса поля меняется ЗАКОННО: снятие фокуса возвращает рамке цвет `--edge` вместо
 * `--primary`. Пиксельная проверка красила бы исправный продукт красным. Свой крестик — узел
 * разметки, и о нём можно спросить прямо; пикселями меряют только то, о чём спросить нельзя.
 *
 * ⚠️ Настоящую Android-клавиатуру десктопный Chrome не покажет. Пункт 5 закрывается
 * доказательством ПРИЧИНЫ — фокус снят с поля. Проверка «клавиатура закрылась» была бы
 * доказательством работы прибора, а не продукта (класс EXP-0078/0080). Следствие может
 * подтвердить только телефон владельца.
 *
 * Запуск: `npm run stand`, затем `node tools/verify-bug77.mjs` (+`--quick` — одна комбинация).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const OUT = 'test-results/bug77';
const QUICK = process.argv.includes('--quick');
mkdirSync(OUT, { recursive: true });

const COMBOS = QUICK
  ? [['light', 390]]
  : [['light', 390], ['light', 1440], ['dark', 390], ['dark', 1440]];

let pass = 0;
const fails = [];
function check(ok, what, detail = '') {
  if (ok) {
    pass++;
  } else {
    fails.push(`${what}${detail ? ' — ' + detail : ''}`);
    console.log(`  ❌ ${what}${detail ? ' — ' + detail : ''}`);
  }
}

/**
 * ⚠️ Браузер здесь — НАСТОЯЩИЙ Chrome (`channel: 'chrome'`), а не встроенный Chromium, и это
 * не придирка: **встроенный Chromium не рисует `::-webkit-search-cancel-button` вообще**.
 * Проверено кадром: в Chrome (и в headless, и в окне) нативный крестик виден, в Chromium —
 * пустая полоса. На Chromium проверка «крестик ровно один» была бы зелёной ВСЕГДА, в том
 * числе на коде без `appearance: none`, — что и случилось при мутации 3.
 * Если Chrome не установлен, отступаем на Chromium, но громко говорим, что одна проверка
 * в этом прогоне ничего не доказывает.
 */
let nativeCrossMeaningful = true;
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome' });
} catch {
  nativeCrossMeaningful = false;
  browser = await chromium.launch();
  console.log('⚠️ Chrome не найден — прогон на встроенном Chromium.');
  console.log('   Проверка «нативный крестик погашен» в этом прогоне НЕ ДОКАЗЫВАЕТ НИЧЕГО:');
  console.log('   Chromium не рисует ::-webkit-search-cancel-button ни при каких условиях.');
}
try {
  for (const [theme, width] of COMBOS) {
    const tag = `${theme}-${width}`;
    console.log(`\nПоиск на «Измерениях» (${theme}, ${width}):`);
    const ctx = await browser.newContext({ viewport: { width, height: 820 }, locale: 'ru-RU' });
    await ctx.addInitScript((v) => localStorage.setItem('ndim-theme', v), theme);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    await page.goto(`${BASE}/dims`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Ящик поиска схлопнут (`max-height: 0`), и Playwright считает поле «видимым» даже так —
    // открываем его ПО РАЗМЕТКЕ, кнопкой панели, как это делает человек (EXP-0071).
    const opener = page.locator('button[aria-label="Поиск измерения"]').first();
    check(await opener.count() > 0, 'кнопка «Поиск измерения» на панели есть');
    await opener.click();
    await page.waitForTimeout(700);

    const input = page.locator('input.search').first();
    const clear = page.locator('button.clear');
    const go = page.locator('button.go').first();

    const state = () =>
      page.evaluate(() => {
        const el = document.querySelector('input.search');
        const btn = document.querySelector('button.clear');
        const feed = document.body.innerText || '';
        return {
          value: el ? el.value : null,
          focused: document.activeElement === el,
          clearShown: !!btn && btn.getBoundingClientRect().width > 1,
          // Признак того, что на экране выдача поиска, а не лента.
          searching: /Найдено|Ничего не найдено|Found|Nothing found/.test(feed),
        };
      });

    // 1 · пустое поле — крестика нет
    check((await state()).clearShown === false, 'пустое поле: крестика нет');

    // 2 · набрали текст — крестик появился
    await input.fill('кино');
    await page.waitForTimeout(400);
    let s = await state();
    check(s.clearShown === true, 'есть текст: крестик виден');
    await page.screenshot({ path: `${OUT}/typed-${tag}.png` });

    // 2а · крестик на экране РОВНО ОДИН — нативный погашен.
    //
    // ⚠️ Спросить об этом `getComputedStyle(el, '::-webkit-search-cancel-button').appearance`
    // НЕЛЬЗЯ: он отвечает `auto` и при погашенном крестике — проверка была красной на
    // исправном продукте (и кадр это опроверг). Тот же класс лжи, что и попытка снять у этого
    // псевдоэлемента ширину — браузер отдавал ширину поля.
    //
    // Меряем наблюдением: прячем СВОЙ крестик и сравниваем правую полосу поля с текстом и без
    // текста. Нативный крестик появляется только при непустом поле — значит если полосы
    // совпали побайтно, его там нет.
    {
      const hideOurs = await page.addStyleTag({ content: 'button.clear { display: none !important; }' });
      await input.fill('кино');
      await input.focus();
      await page.waitForTimeout(400);
      // ⚠️ Полоса ШИРОКАЯ (60px): у поля стоит `padding-right: 40px` под свой крестик, а
      // нативный рисуется у правого края СОДЕРЖИМОГО, то есть левее padding'а. Узкая полоса
      // его не захватывала, и проверка была зелёной даже на мутации.
      const strip = async () => {
        const box = await input.boundingBox();
        return (
          await page.screenshot({
            clip: { x: box.x + box.width - 62, y: box.y + 3, width: 60, height: box.height - 6 },
          })
        ).toString('base64');
      };
      const asIs = await strip();
      // ⚠️ Сравниваем НЕ «пустое поле против заполненного» — так мерила первая редакция, и
      // разницу давал длинный ПЛЕЙСХОЛДЕР, заезжавший в полосу. Сравниваем одно и то же поле
      // с одним и тем же текстом: как есть — и с принудительно погашенным нативным крестиком.
      // Совпало побайтно, значит гасить было нечего: крестика там уже не было.
      const kill = await page.addStyleTag({
        content: 'input.search::-webkit-search-cancel-button { -webkit-appearance: none !important; appearance: none !important; }',
      });
      await page.waitForTimeout(300);
      const killed = await strip();
      check(
        asIs === killed,
        `нативный крестик погашен: крестик на экране ровно один${nativeCrossMeaningful ? '' : ' [НЕ ДОКАЗАНО: Chromium]'}`,
        asIs === killed ? '' : 'принудительное гашение изменило картинку — значит нативный крестик рисовался',
      );
      await kill.evaluate((n) => n.remove());
      await hideOurs.evaluate((n) => n.remove());
      await input.fill('кино');
      await page.waitForTimeout(300);
    }

    // 3 · отправка КНОПКОЙ — текст остался, крестик на месте, фокус снят
    await go.click();
    await page.waitForTimeout(1300);
    s = await state();
    check(s.value === 'кино', 'отправка кнопкой: текст в поле сохранён', `value=${s.value}`);
    check(s.clearShown === true, 'отправка кнопкой: крестик ОСТАЛСЯ (п. 4)');
    // ⚠️ ЧЕСТНО: эта проверка СЛАБАЯ и зелена даже без фикса — клик по кнопке сам уводит
    // фокус на неё, и `blur()` внутри обработчика уже ничего не делает. Проверено мутацией:
    // при снятом `searchInput?.blur()` покраснела только пара по Enter. Оставлена как запись
    // инварианта, а не как доказательство. Дефект владельца живёт на пути Enter — клавиша
    // «поиск» Android-клавиатуры отправляет форму, НЕ уводя фокус.
    check(s.focused === false, 'отправка кнопкой: фокус снят с поля (п. 5) [слабая: зелена и без фикса]');
    await page.screenshot({ path: `${OUT}/submit-click-${tag}.png` });

    // 4 · отправка Enter — то же самое
    await input.click();
    await input.fill('кошки');
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1300);
    s = await state();
    check(s.value === 'кошки', 'отправка Enter: текст в поле сохранён', `value=${s.value}`);
    check(s.clearShown === true, 'отправка Enter: крестик ОСТАЛСЯ (п. 4)');
    check(s.focused === false, 'отправка Enter: фокус снят с поля (п. 5)');
    await page.screenshot({ path: `${OUT}/submit-enter-${tag}.png` });

    // 5 · нажатие крестика — поле пусто, крестик исчез, фокус вернулся в поле,
    //     ящик остался открыт (его закрывает отдельная кнопка панели)
    await clear.first().click();
    await page.waitForTimeout(900);
    s = await state();
    check(s.value === '', 'крестик: поле очищено', `value=${s.value}`);
    check(s.clearShown === false, 'крестик: сам исчез вместе с текстом');
    check(s.focused === true, 'крестик: фокус вернулся в поле');
    check(await input.isVisible(), 'крестик: ящик поиска остался открыт');
    check(s.searching === false, 'крестик: экран вернулся к ленте');
    await page.screenshot({ path: `${OUT}/cleared-${tag}.png` });

    check(errors.length === 0, 'консоль чиста', errors.join(' | ').slice(0, 160));
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(`\nИтог: ${pass} зелёных, ${fails.length} провалов`);
if (fails.length) fails.forEach((f) => console.log('  ❌ ' + f));
process.exit(fails.length ? 1 : 0);

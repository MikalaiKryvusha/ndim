/**
 * Страж витрины лендинга — `bugs/81` (волна `ideas/21`, п. 10).
 *
 * Слово владельца дословно:
 *   «„С нами уже 94 человека — и каждый день приходят новые“ — открывается на горячую поверх
 *    уже отображаемого лендинга — неправильно.»
 *
 * ⚠️ Стенд поднимать НЕ обязательно: витрина больше не читает базу (в этом и смысл фикса), а
 * отказы эмуляторов от воронки страж прощает адресно — см. комментарий у слушателей событий.
 *
 * ⚠️ ГОНЯЕТСЯ ПО СОБРАННОМУ САЙТУ, а не по стенду:
 *   `npm run build`, затем `npx vite preview --port 4173 --strictPort`, затем этот страж.
 * Причина принципиальная: чинили мы именно ПРЕРЕНДЕР, и проверять надо тот артефакт, который
 * уезжает в бой. ⚠️ После пересборки `build/` preview надо ПЕРЕЗАПУСТИТЬ — он кеширует список
 * файлов при старте.
 *
 * ⚠️ **`--strictPort` обязателен, и это не придирка.** Без него `vite preview` при занятом
 * 4173 молча уезжает на 4174/4175, а на 4173 продолжает отвечать ПРЕЖНИЙ сервер со списком
 * файлов от старой сборки. Страж тогда краснеет «консоль чиста — 404 на _app/immutable/...»
 * и выглядит как дефект продукта: файлы в `build/` есть, HTML просит именно их, а 404 всё
 * равно. Это случилось 2026-07-30 и стоило разбора.
 *
 * Что стережём:
 *   1. Строка есть в СЫРОМ HTML — до всякого JavaScript. Это и есть «готово к первому кадру»
 *      в самой сильной форме: её видят и человек на медленной сети, и поисковик (боль
 *      индексации из `GOAL.md`).
 *   2. Покадровая rAF-трасса (метод EXP-0060): состояние строки на кадре 0 равно итоговому и
 *      НЕ меняется 240 кадров. До фикса трасса давала `[{f:0,v:null},{f:17,v:"4"}]`.
 *   3. Раскладка не прыгает: верхняя кромка блока `.feats` на кадре 0 и в конце совпадает.
 *   4. КОНТРОЛЬ САМОГО ПРИБОРА (обязателен по EXP-0082, иначе зелёное может быть от
 *      неисправности трассы): в отдельном заходе мы САМИ меняем текст строки через ~30 кадров
 *      и требуем, чтобы трасса это УВИДЕЛА. Не увидела — прибор слеп, и его зелёный ничего
 *      не значит.
 *   5. Число не ноль и не пустое: страж, которому «строки нет» сошло бы за успех, охранял бы
 *      потерю контента.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:4173';
const OUT = 'test-results/bug81';
const QUICK = process.argv.includes('--quick');
mkdirSync(OUT, { recursive: true });

const COMBOS = QUICK
  ? [['light', 390]]
  : [['light', 390], ['light', 1440], ['dark', 390], ['dark', 1440]];

/** Сколько кадров смотрим. 240 при 60 Гц ≈ 4 с — как в замере до кода. */
const FRAMES = 240;

let pass = 0;
const fails = [];
function check(ok, what, detail = '') {
  if (ok) pass++;
  else {
    fails.push(`${what}${detail ? ' — ' + detail : ''}`);
    console.log(`  ❌ ${what}${detail ? ' — ' + detail : ''}`);
  }
}

/**
 * Трасса строки витрины по кадрам. Возвращает список изменений `{f, v}` — только моменты, когда
 * значение стало ДРУГИМ. Одна запись = строка не менялась ни разу.
 *
 * ⚠️ Значение берём из первого `<b>` внутри `.stats`, а не из текста всей страницы: так `null`
 * означает «числа нет вовсе», и переход `null → «5 111»` виден как ИЗМЕНЕНИЕ. Первая
 * редакция прибора волны считала такой переход «одним значением» и красила дефект зелёным
 * (EXP-0082).
 *
 * 🔄 **ЧТО ИЗМЕНИЛОСЬ 2026-08-02.** Прежде страж смотрел в `.joined b` и искал в сыром HTML
 * подстроку «С нами уже <b>…</b> челов». Этой фразы больше нет: владелец потребовал, чтобы
 * витрина ХВАСТАЛАСЬ («она должна… нахваливать, выставлять в приятном заманчивом выгодном
 * свете»), и счёт людей — наше самое слабое число — перестал быть героем строки. Его место
 * заняла полоса `.stats` из четырёх настоящих чисел (измерения · оценки · связи · люди), а
 * `.joined` стала приглашением без цифр.
 * **Инвариант стража не изменился ни на йоту:** числа витрины обязаны стоять в СЫРОМ
 * пререндеренном HTML и не доезжать «на горячую». Изменилась только цель проверки — туда, где
 * эти числа теперь живут. Ослабления нет: полоса даёт стражу ЧЕТЫРЕ числа вместо одного.
 */
const traceScript = (frames, mutateAtFrame) => `
  new Promise((done) => {
    const seen = [];
    let f = 0;
    const value = () => {
      const b = document.querySelector('.stats b');
      return b === null ? null : (b.textContent || '').replace(/\\s+/g, ' ').trim();
    };
    const featsTop = () => {
      const el = document.querySelector('.feats');
      return el === null ? null : Math.round(el.getBoundingClientRect().top);
    };
    const tick = () => {
      const v = value();
      const last = seen[seen.length - 1];
      if (!last || last.v !== v) seen.push({ f, v, feats: featsTop() });
      if (${mutateAtFrame} > 0 && f === ${mutateAtFrame}) {
        const b = document.querySelector('.stats b');
        if (b) b.textContent = 'КОНТРОЛЬ ПРИБОРА';
      }
      if (++f < ${frames}) requestAnimationFrame(tick);
      else done({ seen, endFeats: featsTop() });
    };
    requestAnimationFrame(tick);
  })
`;

const browser = await chromium.launch();
try {
  for (const [theme, width] of COMBOS) {
    const tag = `${theme}-${width}`;
    console.log(`\n╔══ Витрина лендинга (${theme}, ${width}) ══╗`);
    const ctx = await browser.newContext({ viewport: { width, height: 820 }, locale: 'ru-RU' });
    await ctx.addInitScript((v) => localStorage.setItem('ndim-theme', v), theme);

    // 1 · СЫРОЙ HTML — до всякого JavaScript.
    const raw = await ctx.request.get(`${BASE}/`);
    const html = await raw.text();
    // Полоса чисел целиком обязана лежать в пререндере: ищем её по КЛАССУ, а не по фразе —
    // фраза меняется вместе с маркетингом, инвариант «числа в сыром HTML» не меняется никогда.
    const strip = /<ul[^>]*class="[^"]*stats[^"]*"[\s\S]*?<\/ul>/.exec(html);
    check(strip !== null, 'полоса чисел витрины есть в СЫРОМ HTML (пререндер, до JS)');
    const rawNumbers = strip
      ? [...strip[0].matchAll(/<b[^>]*>\s*([\d\s  ]+)\s*<\/b>/g)].map((m) => Number(m[1].replace(/[\s  ]/g, '')))
      : [];
    check(rawNumbers.length === 4, 'в пререндере ВСЕ ЧЕТЫРЕ числа, а не часть', `нашлось: ${rawNumbers.length}`);
    check(rawNumbers.every((v) => v > 0), 'каждое число настоящее, а не пустота', `«${rawNumbers.join(' · ')}»`);
    check(
      new Set(rawNumbers).size === rawNumbers.length,
      'числа РАЗНЫЕ — совпадение значило бы, что все четыре взяты из одного поля',
      `«${rawNumbers.join(' · ')}»`,
    );

    const page = await ctx.newPage();
    const errors = [];
    /*
     * ⚠️ ОТКАЗЫ ЭМУЛЯТОРА — ОЖИДАЕМОЕ СОСТОЯНИЕ, А НЕ ГРЯЗЬ (найдено судейским проходом
     * 2026-07-30, до push).
     *
     * Страж гоняется по СОБРАННОМУ сайту на localhost:4173, а `isStand()` смотрит на hostname —
     * значит приложение целится в эмуляторы. Витрина лендинга их больше не трогает (в этом и
     * смысл `bugs/81`), но ВОРОНКА (`track('landing_view')`) по-прежнему пишет в Firestore. При
     * погашенном стенде это `ERR_CONNECTION_REFUSED`, и первая редакция стража краснела на
     * исправном продукте — то есть числа «28/28» были верны только при поднятом стенде, о чём
     * шапка молчала.
     *
     * Поэтому: собираем УПАВШИЕ ЗАПРОСЫ и прощаем ровно те, что ушли на порты эмуляторов.
     * Любой другой упавший запрос (например, битая иконка с нашего же сервера) остаётся
     * провалом — прощение адресное, а не «выключим проверку консоли».
     */
    const failed = [];
    const EMULATOR = /127\.0\.0\.1:(8181|9099|9199)/;
    page.on('requestfailed', (request) => failed.push(request.url()));
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    // 2+3 · Трасса по кадрам с самого начала загрузки (`commit` — не ждём ничего лишнего).
    await page.goto(`${BASE}/`, { waitUntil: 'commit' });
    const { seen, endFeats } = await page.evaluate(traceScript(FRAMES, 0));
    console.log('       трасса: ' + JSON.stringify(seen));
    check(seen.length === 1, 'строка не менялась ни разу за 240 кадров', JSON.stringify(seen));
    check(seen[0]?.f === 0 && seen[0]?.v !== null, 'на кадре 0 строка уже на месте', JSON.stringify(seen[0]));
    check(
      seen[0]?.feats !== null && seen[0]?.feats === endFeats,
      'раскладка не прыгнула: кромка «фич» та же в начале и в конце',
      `кадр 0: ${seen[0]?.feats}, конец: ${endFeats}`,
    );
    await page.screenshot({ path: `${OUT}/landing-${tag}.png` });
    const foreignFailures = failed.filter((url) => !EMULATOR.test(url));
    /*
     * Прощаем ТОЛЬКО сетевой отказ (`net::ERR_…`) — он и есть эхо упавшего эмуляторного запроса.
     * ⚠️ Первая редакция фильтра выкидывала любое «Failed to load resource» — и вместе с ним
     * спрятала бы «responded with a status of 404», то есть НАШ битый файл. Это ровно тот
     * случай, когда починка стража делает его слепым; поймано при самопроверке фильтра.
     */
    const realErrors = errors.filter((text) => !/Failed to load resource: net::ERR_/.test(text));
    check(
      realErrors.length === 0 && foreignFailures.length === 0,
      'консоль чиста (отказы эмулятора при погашенном стенде не в счёт)',
      [...realErrors, ...foreignFailures].join(' | ').slice(0, 200),
    );
    await page.close();

    // 4 · КОНТРОЛЬ ПРИБОРА: трасса обязана УМЕТЬ увидеть изменение.
    const control = await ctx.newPage();
    await control.goto(`${BASE}/`, { waitUntil: 'commit' });
    const { seen: controlSeen } = await control.evaluate(traceScript(120, 30));
    check(
      controlSeen.length >= 2 && controlSeen.some((s) => s.v === 'КОНТРОЛЬ ПРИБОРА'),
      'КОНТРОЛЬ: трасса видит изменение строки, когда оно есть',
      JSON.stringify(controlSeen),
    );
    await control.close();
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(`\nИтог: ${pass} зелёных, ${fails.length} провалов`);
if (fails.length) fails.forEach((f) => console.log('  ❌ ' + f));
process.exit(fails.length ? 1 : 0);

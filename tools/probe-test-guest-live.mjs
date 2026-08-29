/**
 * ТАКТ Г, фаза 2 — ПУТЬ ГОСТЯ ДО РЕЗУЛЬТАТА В БОЮ (plans/42, критерии 3 и 5).
 *
 * Это то, чего не видит ни один читающий смоук: страница может честно отдавать HTML и быть
 * при этом мёртвой внутри — ровно класс `bugs/124`, где все приборы были зелёными, а
 * приложение не стартовало. Здесь прогон ДЕЛАЕТ то, что делает человек: ставит звёзды,
 * получает личную ссылку, приводит по ней второго и смотрит общий результат.
 *
 * 🔴 ПОЧЕМУ ОН ПИШЕТ В БОЕВУЮ БАЗУ И ЧЕМ ЗА ЭТО ПЛАТИТ.
 * Оценка гостя — настоящая оценка: она попадает в `points/{uid}/dims/{dimId}` и через цикл
 * сервера синхронизации двигает NDSR — фирменный рейтинг, который обязан оставаться
 * независимым. Поэтому прогон убирает за собой ОРГАНАМИ САМОГО ПРОДУКТА, в обратном порядке:
 *   1. «Удалить пару» (`.unlink`) — право участника забрать свои ответы (№002 В4);
 *   2. «✕» у каждой строки панели-зеркала — снятие оценки (`removeRating`);
 *   3. удаление анонимных учёток своим же `idToken` (приём `verify-prod-signed-in`).
 * Уборка ПРОВЕРЯЕТСЯ, а не декларируется: панель обязана опустеть, иначе прогон краснеет.
 *
 * **AUTH на анонимный вход в бой:** интервью №013, В2 = Б — «Тестирование боем — залог качества».
 *
 * Запуск: node tools/probe-test-guest-live.mjs [--base https://ndimspace.app] [--slug love]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { markProbeContext } from './lib/probe-mark.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const BASE = arg('--base', 'https://ndimspace.app');
const SLUG = arg('--slug', 'love');
const WIDTH = Number(arg('--width', '1440'));
const OUT = 'test-results/test-tact-g';
mkdirSync(OUT, { recursive: true });

/** Публичный веб-ключ боевого проекта — не секрет, он в бандле у каждого посетителя. */
const API_KEY = 'AIzaSyCZsGkY0Lw_OJ35QhRumcD5RzNJUFsAsww';
const PROJECT = 'ndim-space';
const ON_STAND = /localhost|127\.0\.0\.1/.test(BASE);

/**
 * 🔴 СТЕНДОВАЯ ДВЕРЬ ОБЯЗАТЕЛЬНА, И ВОТ ПОЧЕМУ (канон: «не проверять гостя без `?as=`»).
 *
 * На голом адресе стенда `currentSession()` делает АВТОВХОД `dev@ndim.space` — обе вкладки
 * оказываются ОДНИМ И ТЕМ ЖЕ человеком. Правило пары тогда честно отказывает
 * (`auth.uid != aUid` — сам с собой пары не бывает), и «второй не присоединился» читается как
 * дефект продукта, хотя дефект в постановке опыта. В бою параметр не читается вовсе, и
 * свежий контекст САМ является состоянием «аккаунта нет» — там дверь не нужна и не ставится.
 */
const door = (url) => {
  if (!ON_STAND) return url;
  const u = new URL(url);
  /*
   * 🔴 И ВТОРОЕ, ЧТО ЗДЕСЬ ОБЯЗАТЕЛЬНО — ПЕРЕНОС ССЫЛКИ НА АДРЕС СТЕНДА.
   *
   * Личная ссылка пары строится продуктом из `data.canonical`, а это БОЕВОЙ адрес
   * (`shareLink = ${data.canonical}?pair=…`) — для человека верно, иначе он разослал бы
   * ссылку на localhost. Но стендовый прогон, пойдя по ней буквально, уводит второго гостя
   * в БОЙ: он заводит там настоящую анонимную учётку и ставит настоящие оценки, а пара,
   * созданная в эмуляторе, там, разумеется, не находится — «ссылка не действует».
   * Цена уже уплачена: три обкаточных прогона завели в бою по гостю, прежде чем это нашлось.
   */
  const here = new URL(BASE);
  u.protocol = here.protocol;
  u.host = here.host;
  u.searchParams.set('as', 'guest');
  return u.toString();
};

let pass = 0;
const fails = [];
function check(ok, name, detail = '') {
  if (ok) { pass++; } else { fails.push(`${name}${detail ? ' — ' + detail : ''}`); }
  console.log(`  ${ok ? '✅' : '❌'} ${name}${!ok && detail ? ' — ' + detail : ''}`);
}

/**
 * Что запрещено в шеримом результате (критерий 5, №018 В4) — и почему список именно такой.
 *
 * 🔴 Первая редакция запрещала лексему «процент» — и покраснела на ИСПРАВНОМ продукте.
 * Правило проекта другое и записано в шапке `test-copy.ts:12`: «процент» — ТОЛЬКО В
 * ОТРИЦАНИЯХ. Тексты теста им и пользуются («не выдумываем процент», «no percentages»), то
 * есть слово здесь — это ОБЕЩАНИЕ не показывать число, ровно то, что мы стережём. Запрещать
 * его значило бы требовать от продукта молчать о собственной честности.
 *
 * Признак настоящей утечки — ЧИСЛО, а не слово. Поэтому ловим: числовой процент · лексемы
 * «похожесть»/`similarity` (они и по словарю продукта на лице запрещены) · число рядом со
 * словом «процент»/«совместимость». Счёт совпадений («12 совпадений») — не процент и не
 * похожесть: это факт, который человек может пересчитать сам.
 */
/*
 * ⚠️ КЛАССЫ БУКВ — ЧЕРЕЗ `\p{L}`, А НЕ ЧЕРЕЗ `\w`, И ФЛАГ `u` ОБЯЗАТЕЛЕН (правка 2026-08-22).
 * В JavaScript `\w` определён через ASCII: для кириллицы он не существует, поэтому
 * `совместимост\w*` брало НОЛЬ символов, и «совместимость: 80» этот список НЕ ловил вовсе.
 * Замер прогоном: «процент: 5» ловилось, «процентов: 5» — нет; «совместимост: 80» ловилось,
 * «совместимость: 80» — нет. То есть настоящая живая форма проезжала мимо, а искусственная
 * ловилась — прогон при этом выглядел исправным.
 * 🔴 Цена здесь выше обычной: список сторожит ИНВАРИАНТ ПРОДУКТА «цифр похожести наружу не
 * даём», и его молчание — ложный зелёный на боевом сайте.
 * Стережёт `node tools/verify-cyrillic-word-boundary.mjs`.
 */
const FORBIDDEN = [
  /\d+\s*%/,
  /похожест/i,
  /similarity/i,
  /\bmatch rate\b/i,
  /(процент[\p{L}]*|percentage)\s*[:—–-]?\s*\d/iu,
  /\d+\s*(процент[\p{L}]*|%|percent)/iu,
  /совместимост[\p{L}]*\s*[:—–-]?\s*\d/iu,
];

const browser = await chromium.launch();
const tokens = new Set();

/** Заводит вкладку гостя и вешает перехват токена — снаружи его иначе не достать. */
async function newGuest(label) {
  const ctx = await browser.newContext({
    viewport: { width: WIDTH, height: WIDTH < 500 ? 844 : 900 },
    locale: 'ru-RU',
  });
  await markProbeContext(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem('ndim-theme', 'light'); } catch { /**/ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/Could not reach Cloud Firestore backend|offline mode|code=unavailable/i.test(m.text())) return;
    errors.push(m.text());
  });
  page.on('response', async (r) => {
    if (!/identitytoolkit.*accounts:signUp/.test(r.url())) return;
    try {
      const body = await r.json();
      if (typeof body.idToken === 'string') tokens.add(body.idToken);
    } catch { /* не JSON */ }
  });
  return { label, ctx, page, errors };
}

/**
 * Проходит набор до конца: звезда → «Сохранить сейчас» → ждём РОСТА панели-зеркала.
 * Ждём состояния, а не секундомера: бой отвечает медленнее стенда, таймаут сделал бы
 * прибор лотереей (урок verify-prod-signed-in).
 */
async function fillSet(g, values) {
  /*
   * Цель берётся У СТРАНИЦЫ («Оценено N из M»), а не задаётся здесь константой: у обёрток она
   * разная (любовь 7, совместимость и личность по 12), и зашитое число сделало бы прибор
   * годным ровно для одной из трёх. Читается после первой оценки — до неё панели нет вовсе.
   */
  let done = 0;
  let target = null;
  for (let i = 0; i < 40; i++) {
    if (target !== null && done >= target) break;
    const card = g.page.locator('.qcard .starsrow .st');
    if (await card.count() === 0) break;                      // очередь исчерпана
    await card.nth(values[i % values.length]).click();
    const now = g.page.locator('.qcard .countdown .now');
    await now.waitFor({ state: 'visible', timeout: 15000 });
    await now.click();
    await g.page.waitForFunction(
      (n) => document.querySelectorAll('.mirror .rows li').length >= n,
      done + 1, { timeout: 30000 },
    );
    done = await g.page.locator('.mirror .rows li').count();
    if (target === null) {
      const m = (await g.page.locator('.mirror .progress').innerText().catch(() => '')).match(/(\d+)\D+(\d+)/);
      if (m !== null) target = Number(m[2]);
    }
  }
  return { done, target };
}

/*
 * 🔑 УБОРКА ЖИВЁТ В `finally`, И ЭТО НЕ ПЕДАНТИЗМ.
 * Прогон пишет в БОЕВУЮ базу. Падение посреди пути (упал селектор, моргнула сеть) при уборке
 * «в конце скрипта» оставило бы в бою чужие оценки и висячий документ пары — то есть прибор
 * сам стал бы источником мусора, который другой пункт этого же плана только собирается
 * вычищать. Всё, что заведено, снимается при ЛЮБОМ исходе.
 */
let a = null;
let b = null;
let shareLink = null;
try {

// ═══ ГОСТЬ А — приходит из поиска, аккаунта нет ══════════════════════════════════════════
console.log(`\n▶ ГОСТЬ А · ${BASE}/ru/test/${SLUG}`);
a = await newGuest('A');
await a.page.goto(door(`${BASE}/ru/test/${SLUG}`), { waitUntil: 'networkidle', timeout: 45000 });

check(await a.page.locator('.mirror .empty').count() === 1, 'А · панель-зеркало пуста до первой оценки');

const { done: doneA, target } = await fillSet(a, [8, 10, 6, 9, 7, 10, 5, 3, 9, 8, 10, 6]);
check(doneA >= 1, 'А · 🔑 ПЕРВАЯ ОЦЕНКА БЕЗ АККАУНТА прошла в бою (гость родился жестом)', `строк ${doneA}`);
check(target !== null && doneA >= target, 'А · набор дошёл до цели страницы', `${doneA} из ${target}`);
console.log(`  · панель набрала ${doneA} строк${target === null ? '' : ` из ${target}`}`);

/*
 * Даём анимациям ДОГОРЕТЬ, прежде чем мерить и снимать кадр. Строка панели приезжает
 * переходом `slide` (он анимирует ВЫСОТУ), и замер посреди него показал бы обрезанный текст
 * там, где через полсекунды всё на месте — ложный дефект, стоящий целого расследования.
 * Ждём СОСТОЯНИЯ (анимаций не осталось), а не секундомера.
 */
async function settle(page) {
  await page
    .waitForFunction(() => document.getAnimations().every((an) => an.playState !== 'running'), null, { timeout: 8000 })
    .catch(() => { /* не догорели за 8 с — мерим как есть, это само по себе разговор */ });
}
await settle(a.page);

/*
 * 🔑 ЗАКОН ВЛАДЕЛЬЦА НА СТРОКЕ ПАНЕЛИ (2026-08-14): «названия не должны обрезаться троеточием,
 * всегда полностью влазят — это закон». Строка выросла (`bugs/126`: к имени приехали вид и
 * год), и именно выросшая строка — первый кандидат на обрезку. Проверяем ПИКСЕЛЯМИ, а не
 * доверием к вёрстке: габаритная проверка здесь молчала бы (`EXP-0155`).
 *
 * Меряем ДВА разных способа спрятать имя, и второй важнее первого:
 *   1. сам элемент — `ellipsis` / `line-clamp` / собственное переполнение;
 *   2. 🔑 ПРЕДОК — строка целиком помещается, но карточка обрезает её снизу. Первая редакция
 *      этой проверки смотрела только на пункт 1 и была бы зелёной на подрезанной панели.
 */
const clipped = await a.page.locator('.mirror .rows .rname').evaluateAll((els) =>
  els
    .map((el) => {
      const s = getComputedStyle(el);
      const own =
        s.textOverflow === 'ellipsis' ||
        (s.webkitLineClamp !== 'none' && s.webkitLineClamp !== '') ||
        el.scrollWidth > el.clientWidth + 1 ||
        el.scrollHeight > el.clientHeight + 1;
      const box = el.getBoundingClientRect();
      const panel = el.closest('.mirror');
      const frame = panel === null ? null : panel.getBoundingClientRect();
      const cutByPanel =
        frame !== null &&
        getComputedStyle(panel).overflow !== 'visible' &&
        (box.bottom > frame.bottom + 1 || box.right > frame.right + 1);
      return own || cutByPanel ? `${el.textContent.trim().slice(0, 48)} [${own ? 'сам' : 'карточкой'}]` : null;
    })
    .filter(Boolean),
);
const rowCount = await a.page.locator('.mirror .rows .rname').count();
check(rowCount > 0, 'А · есть что мерить: строки панели отрисованы', `строк ${rowCount}`);
check(clipped.length === 0, `А · 🔑 названия в панели НЕ обрезаны (закон 2026-08-14, ширина ${WIDTH})`,
  clipped.join(' | '));

const finishedA = await a.page.locator('.invite .pairbtn').count() > 0;
check(finishedA, 'А · набор пройден — появилась кнопка личной ссылки', `строк ${doneA}, цель ${target}`);
await a.page.screenshot({ path: `${OUT}/guest-A-filled.png`, fullPage: true });

if (finishedA) {
  await a.page.locator('.invite .pairbtn').click();
  await a.page.locator('.invite .share code').waitFor({ state: 'visible', timeout: 30000 });
  shareLink = (await a.page.locator('.invite .share code').innerText()).trim();
  check(/\?pair=[0-9a-f]{16,}/i.test(shareLink), 'А · личная ссылка выдана и неугадываема', shareLink);
  await a.page.screenshot({ path: `${OUT}/guest-A-link.png`, fullPage: true });
}

// ═══ ГОСТЬ Б — приходит по личной ссылке ═════════════════════════════════════════════════
if (shareLink !== null) {
  console.log(`\n▶ ГОСТЬ Б · по личной ссылке`);
  b = await newGuest('B');
  await b.page.goto(door(shareLink), { waitUntil: 'networkidle', timeout: 45000 });
  check(
    await b.page.locator('.invite').innerText().then((t) => t.length > 0).catch(() => false),
    'Б · страница по ссылке открылась',
  );
  /*
   * Ответов первого второй НЕ видит, пока не прошёл сам (решение такта В, п. 6).
   *
   * 🔑 Живой результат отличается от блока-ПРИМЕРА кнопкой «удалить пару» (`.unlink`) — она
   * есть только у сложившейся пары. По классу `.facts` их не различить: пример носит тот же
   * класс, и первая редакция прибора краснела на исправном продукте, считая пример утечкой.
   */
  const liveResult = () => b.page.locator('.result .unlink').count();
  const seesA = await liveResult();
  check(seesA === 0, 'Б · 🔑 ответы первого НЕ показаны до собственного прохождения', `живых результатов ${seesA}`);

  const { done: doneB } = await fillSet(b, [8, 9, 6, 10, 7, 10, 4, 3, 10, 7, 9, 5]);
  check(doneB >= 1, 'Б · второй гость оценил без аккаунта', `строк ${doneB}`);

  /*
   * Состояние приглашения печатается ДО и ПОСЛЕ жеста: у секции пять разных ветвей (создатель ·
   * приглашённый · пара сложилась · ссылка занята · ссылка мертва), и по одному лишь «кнопки
   * нет» их не различить. Без этой печати диагноз пришлось бы угадывать.
   */
  console.log(`  · приглашение ДО: «${(await b.page.locator('.invite').innerText()).replaceAll('\n', ' | ').slice(0, 160)}»`);
  const cmp = b.page.locator('.invite .pairbtn');
  if (await cmp.count() > 0) {
    console.log(`  · кнопка: «${await cmp.innerText()}»`);
    await cmp.click();
    await b.page.locator('.result .unlink').waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
    console.log(`  · приглашение ПОСЛЕ: «${(await b.page.locator('.invite').innerText()).replaceAll('\n', ' | ').slice(0, 160)}»`);
  } else {
    console.log('  · кнопки сравнения нет вовсе');
  }
  /*
   * 🔑 ПАРНАЯ проверка, и порядок обязателен (`EXP-0070`): сначала доказываем, что результат
   * ЖИВОЙ. Иначе «в результате нет процентов» было бы зелёным на блоке-примере — то есть
   * прибор молчал бы ровно тогда, когда путь гостя сломан.
   */
  await settle(b.page);
  const live = await liveResult();
  check(live > 0, 'Б · 🔑 ГОСТЬ БЕЗ АККАУНТА ДОШЁЛ ДО ЖИВОГО РЕЗУЛЬТАТА',
    'живого результата нет — сравнение не сложилось');
  const resultText = await b.page.locator('.result').innerText();
  if (live > 0) {
    check(/совпад|Оба|десят|match/i.test(resultText), 'Б · результат несёт факты пары',
      resultText.slice(0, 120).replaceAll('\n', ' | '));
    const leaked = FORBIDDEN.filter((re) => re.test(resultText));
    check(leaked.length === 0, 'Б · 🔑 в результате НЕТ процентов и похожести (критерий 5)',
      leaked.map(String).join(' '));
  } else {
    console.log('  ⚪ проверки содержания результата НЕ засчитаны — мерить было нечего');
  }
  await b.page.screenshot({ path: `${OUT}/guest-B-result.png`, fullPage: true });
}

} catch (e) {
  check(false, '🔴 прогон упал посреди пути — уборка ниже всё равно исполняется', String(e).slice(0, 200));
} finally {

// ═══ УБОРКА — органами самого продукта, и она ПРОВЕРЯЕТСЯ ════════════════════════════════
console.log('\n🧹 уборка');
for (const g of [b, a].filter(Boolean)) {
  const unlink = g.page.locator('.result .unlink');
  if (await unlink.count() > 0) {
    await unlink.first().click();
    await g.page.waitForTimeout(2500);
    console.log(`  · ${g.label}: пара удалена кнопкой продукта`);
    break;                                    // документ пары один на двоих
  }
}
for (const g of [a, b].filter(Boolean)) {
  await g.page.reload({ waitUntil: 'networkidle' }).catch(() => {});
  for (let i = 0; i < 40; i++) {
    const rm = g.page.locator('.mirror .rows li .rm');
    if (await rm.count() === 0) break;
    await rm.first().click();
    await g.page.waitForTimeout(900);
  }
  const left = await g.page.locator('.mirror .rows li').count();
  check(left === 0, `${g.label} · 🧹 оценки сняты — след в NDSR не остался`, `строк осталось ${left}`);
  check(g.errors.length === 0, `${g.label} · консоль чиста за весь путь`, g.errors.slice(0, 2).join(' | '));
}

await browser.close();

/*
 * Учётки удаляются только в БОЮ: на стенде живёт эмулятор Auth, у него свой ключ, и его база
 * пересоздаётся сидом. Пускать боевой ключ по стендовому прогону — способ удалить не то.
 */
const ON_PROD = !/localhost|127\.0\.0\.1/.test(BASE);
if (ON_PROD) {
  let removed = 0;
  for (const idToken of tokens) {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }),
    });
    if (r.ok) removed += 1;
  }
  check(removed === tokens.size && tokens.size > 0,
    `🧹 анонимные учётки удалены (${removed} из ${tokens.size})`,
    'остаток проживёт 30 дней (чистка сервера)');
} else {
  console.log(`  ⚪ стенд: учётки эмулятора не трогаем (заведено ${tokens.size})`);
}

console.log(`\n${'═'.repeat(64)}\nПРОЙДЕНО: ${pass} · ПРОВАЛОВ: ${fails.length}`);
if (fails.length) { console.log('\nПРОВАЛЫ:'); fails.forEach((f) => console.log('  · ' + f)); }
console.log(`Кадры: ${OUT}/ · цель ${ON_PROD ? `бой ${PROJECT}` : BASE}`);
process.exit(fails.length ? 1 : 0);

}

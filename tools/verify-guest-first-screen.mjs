#!/usr/bin/env node
/**
 * НАБОР «ПЕРВЫЙ ЭКРАН ГОСТЯ» — исполнение кейсов ГЭ-01…ГЭ-05 (`qa/suites/guest-first-screen.md`).
 *
 * ЗАЧЕМ. Работу `plans/82` проверяли двумя прогонами прибора, который отвечает на ОДИН вопрос —
 * «виден ли объект». Ни негативных случаев, ни одноразовости следа, ни сверки с базой, ни закона
 * о необрезаемых названиях никто не проверял. Слово владельца 2026-09-09: «*из этой таблицы я
 * вижу, что ТЕСТИРОВАНИЯ НЕ БЫЛО*».
 *
 * 🔴 ЧЕТЫРЕ ИЗ ШЕСТИ КЕЙСОВ — НЕГАТИВНЫЕ, и это не педантизм. Блок «Вы оценили» опасен ровно
 * тем, что УТВЕРЖДАЕТ человеку его собственное действие: показанный не тому, не тогда или на
 * основании следа без записи в базе, он врёт про самое личное — про то, что человек только что
 * сделал. Позитивный кейс доказывает, что блок появляется; цену продукта держат негативные.
 *
 * ВЕРДИКТ СНИМАЕТСЯ С ЭКРАНА И С БАЗЫ (урок смоука `plans/54`): звёзды горят и при непрошедшей
 * записи. Оценка ищется в Firestore эмулятора отдельным чтением.
 *
 * Стенд обязан быть ПОДНЯТ (`npm run stand`) и собран (`npm run build` — прибор берёт карточку
 * из `build/`).
 * Запуск: node tools/verify-guest-first-screen.mjs [--base http://localhost:5173] [--headed]
 *
 * Ворота: нет — и это ЗАПРЕТ, а не пропуск: набор ПИШЕТ в базу стенда и требует эмуляторов.
 *         Зовётся руками и из чек-листа набора; в бой не пускается по построению (localhost).
 * ВЫХОД:  кадры и вердикт в test-results/guest-first-screen/.
 */
// @covers NDIM-AUTH-016, NDIM-AUTH-017, NDIM-AUTH-018, NDIM-AUTH-019, NDIM-AUTH-020, NDIM-AUTH-021, NDIM-AUTH-022, NDIM-AUTH-023
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { portsFor, slotOf } from './lib/stand-slot.mjs';
import { watchHttpFailures } from './lib/http-failures.mjs';
import { markProbeContext } from './lib/probe-mark.mjs';
import { grantAppCheckDebug } from './lib/app-check-debug.mjs';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const WORKPLACE = basename(dirname(dirname(fileURLToPath(import.meta.url))));
const PORTS = portsFor(slotOf(WORKPLACE).slot);
/*
 * Умолчание — порт `vite dev`, а НЕ превью: `npm run stand` поднимает именно dev-сервер
 * (`tools/stand.mjs`), и первый прогон этого набора упёрся в ERR_CONNECTION_REFUSED на 4173.
 * Превью живёт только под `npm run e2e` и под воротами Smoke двери выката — там свой прогон.
 */
const BASE = opt('--base', `http://localhost:${PORTS.dev}`).replace(/\/$/, '');
const HEADED = argv.includes('--headed');
const FIRESTORE = `http://127.0.0.1:${PORTS.firestore}`;
const PROJECT = 'demo-ndim-dev';
const OUT = 'test-results/guest-first-screen';
const TRACE_KEY = 'ndim-rated-just-now';
mkdirSync(OUT, { recursive: true });

/**
 * ⛔ ГРАНИЦА КОНТУРА. Набор ПИШЕТ: за прогон он заводит гостей и ставит оценки. Поэтому адреса
 * перечислены поимённо, а бой открывается только явным флагом — опечатка не имеет права увести
 * прогон в чужой продукт или засеять боевую базу.
 *
 * 🔴 НА ЖИВОМ КОНТУРЕ МЕТКА ПРИБОРА ОБЯЗАТЕЛЬНА. Прибор, неотличимый от человека, — это ровно
 * болезнь `bugs/202`, за которую уже заплачено 77 ложными гостями в ряду воронки. На стенде
 * метка не ставится: там одна из проверок смотрит на саму воронку.
 */
const KNOWN_LIVE = ['https://ndim-stage.web.app', 'https://ndimspace.app'];
const LIVE = !/localhost|127\.0\.0\.1/.test(BASE);
if (LIVE && !KNOWN_LIVE.includes(BASE)) {
  console.error(`Незнакомый контур: ${BASE}. Разрешены: стенд · ${KNOWN_LIVE.join(' · ')}`);
  process.exit(2);
}
if (BASE === 'https://ndimspace.app' && !argv.includes('--prod')) {
  console.error('Бой открывается только флагом --prod: набор заводит гостей и пишет оценки.');
  process.exit(2);
}
const CONTOUR = LIVE ? (BASE.includes('stage') ? 'stage' : 'prod') : 'stand';

const cases = [];
let pass = 0;
let fail = 0;
const check = (id, ok, name, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  cases.push({ id, name, ok, detail });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${id} ${name}${detail ? ' — ' + detail : ''}`);
};
const section = (t) => console.log(`\n${t}`);

const ears = [];
const listen = (page, tag) => ears.push(watchHttpFailures(page, { label: `[${tag}] ` }));

/**
 * Живая база контура — служебным ключом. Ленивая инициализация: на стенде ключ не нужен вовсе,
 * и требовать его там значило бы запереть стендовый прогон за секретом.
 */
let liveDb = null;
async function liveFirestore() {
  if (liveDb !== null) return liveDb;
  const { cert, initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const { serviceAccount } = await import('./lib/credentials.mjs');
  const { CONTOURS } = await import('./lib/contours.mjs');
  const c = CONTOURS[CONTOUR];
  initializeApp({ credential: cert(serviceAccount(CONTOUR)), projectId: c.project });
  liveDb = getFirestore(c.database);
  return liveDb;
}

/** Документы коллекции: на живом контуре — служебным ключом, на стенде — REST эмулятора. */
async function docs(path) {
  if (LIVE) {
    const db = await liveFirestore();
    const snap = await db.collection(path).get();
    return snap.docs.map((d) => ({ name: `${path}/${d.id}` }));
  }
  const res = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}?pageSize=300`,
    { headers: { Authorization: 'Bearer owner' } },
  );
  if (!res.ok) return [];
  return (await res.json()).documents ?? [];
}

/** Карточка для прогона — из собранного сайта, как это делает проба двери. */
function pickCard() {
  const dir = 'build/ru/dimension';
  if (!existsSync(dir)) {
    console.error(`нет собранного сайта (${dir}) — сначала npm run build`);
    process.exit(2);
  }
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(`${dir}/${file}`, 'utf8');
    const dim = html.match(/data-dim="([^"]+)"/)?.[1];
    const title = html.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1]?.trim();
    if (dim && title) return { slug: file.replace(/\.html$/, ''), dimId: dim, title };
  }
  console.error('ни одна карточка не несёт data-dim — дверь собрана без движка');
  process.exit(2);
}

/**
 * 🔴 ЭКРАН ГОТОВ — ОБЯЗАТЕЛЬНОЕ УСЛОВИЕ ЛЮБОГО СУЖДЕНИЯ ОБ ОТСУТСТВИИ.
 *
 * Найдено мутацией при доказательстве этого же набора: под мутацией «след не гасится» проверки
 * ГЭ-04б и ГЭ-04в остались ЗЕЛЁНЫМИ — блок обязан был вернуться, а прибор доложил «блока нет».
 * Причина не в продукте: экран ещё не догрузился, и «нет блока» означало «нет ничего». Это
 * третий вопрос лестницы зелёного прогона (`AGENT_GUIDE.md`): проверка обязана МОЧЬ покраснеть
 * на этом материале. Пока экран не предъявил хотя бы одну свою карточку, вердикт об отсутствии
 * бессодержателен.
 */
async function awaitScreen(page) {
  await page.waitForSelector('.card', { state: 'visible', timeout: 30000 });
}

/**
 * Один проход двери: свежий контекст, заданные тема, язык и ширина → человек внутри гостем.
 *
 * Вынесен в помощник ради матрицы ГЭ-07/ГЭ-08: копия этих двадцати строк на каждую клетку
 * разъехалась бы с оригиналом на первой же правке продукта.
 * ⚠️ Тема ставится ключом ДО загрузки (`ndim-theme`): системная тема продукт не переключает,
 * и без этого «обе темы» проверялись бы формально — урок `verify-icons`.
 */
/**
 * Свежий контекст с меткой прибора на живом контуре. Заведён потому, что два кейса создавали
 * контекст ВРУЧНУЮ и на контуре пошли бы неотличимыми от человека — та же болезнь bugs/202,
 * от которой помощник прохода двери уже защищён.
 */
async function freshContext(browser, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  if (LIVE) {
    await markProbeContext(context);
    await grantAppCheckDebug(context, { required: CONTOUR === 'prod', quiet: true });
  }
  return context;
}

async function doorPass(browser, { width, theme, lang, tag }) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  if (LIVE) {
    await markProbeContext(context);
    await grantAppCheckDebug(context, { required: CONTOUR === 'prod', quiet: true });
  }
  await context.addInitScript(
    ([t, l]) => {
      try {
        localStorage.setItem('ndim-theme', t);
        localStorage.setItem('ndim-lang', l);
      } catch {
        /* хранилище недоступно — прогон всё равно осмыслен */
      }
    },
    [theme, lang],
  );
  const page = await context.newPage();
  listen(page, tag);
  const prefix = lang === 'en' ? '/en' : '/ru';
  await page.goto(`${BASE}${prefix}/dimension/${CARD.slug}?as=none`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-star]').nth(8).click();
  await page.waitForTimeout(1500);
  await page.locator('[data-door-enter]').click();
  await page.waitForURL(/\/profile/, { timeout: 30000 }).catch(() => {});
  await awaitScreen(page);
  await page.waitForTimeout(2500);
  return { context, page };
}

/** Виден ли блок «Вы оценили» и что в нём написано. */
async function ratedBlock(page) {
  const name = page.locator('.rated-name');
  if ((await name.count()) === 0) return { shown: false };
  return {
    shown: await name.isVisible(),
    title: ((await name.textContent()) ?? '').trim(),
    kind: ((await page.locator('.rated-kind').textContent().catch(() => '')) ?? '').trim(),
    score: ((await page.locator('.rated-num').textContent().catch(() => '')) ?? '').trim(),
    stars: await page.locator('.rated-stars').count(),
  };
}

const CARD = pickCard();

const run = async () => {
  const card = CARD;
  console.log(`Набор «первый экран гостя» · кейсы ГЭ-01…ГЭ-05 (qa/suites/guest-first-screen.md)`);
  console.log(`Карточка: /ru/dimension/${card.slug} · измерение ${card.dimId} · «${card.title}»`);
  console.log(`Контур: ${CONTOUR} · ${BASE}${LIVE ? '' : ` · Firestore ${FIRESTORE}`}`);

  const startedAt = Date.now();
  const pointsBefore = (await docs('points')).map((d) => d.name);
  console.log(`слепок «до»: точек ${pointsBefore.length}`);

  const browser = await chromium.launch({ headless: !HEADED });

  /* ═══ ГЭ-01 · NDIM-AUTH-016 — объект виден на первом экране ═══ */
  section('ГЭ-01 · объект виден на ПЕРВОМ экране (CP, позитив)');
  let guestUid = '';
  {
    const context = await freshContext(browser, 390);
    const page = await context.newPage();
    listen(page, 'ГЭ-01');
    await page.goto(`${BASE}/ru/dimension/${card.slug}?as=none`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-star]').nth(8).click();
    await page.waitForTimeout(1500);
    await page.locator('[data-door-enter]').click();
    await page.waitForURL(/\/profile/, { timeout: 30000 }).catch(() => {});
    /*
     * Готовность экрана, а не фиксированная пауза. Прогон 2026-09-09 23:5x показал цену:
     * пока рядом шёл выкат на стейдж, стенд отвечал медленнее, пяти секунд не хватило — и
     * набор объявил ОТСУТСТВИЕ блока, то есть дефект продукта, которого не было. Тот же класс,
     * что вылечен в ГЭ-04: суждение выносится после того, как экран себя предъявил.
     */
    await awaitScreen(page);
    await page.waitForTimeout(3000);

    const block = await ratedBlock(page);
    check('ГЭ-01а', block.shown === true, 'блок «Вы оценили» показан');
    check('ГЭ-01б', (block.title ?? '').includes(card.title), 'в блоке ТОТ объект, что оценил человек', `«${block.title ?? '—'}»`);
    check('ГЭ-01в', /\b8\b/.test(block.score ?? ''), 'оценка в блоке совпадает с поставленной (8)', block.score ?? '—');
    check('ГЭ-01г', (block.stars ?? 0) > 0, 'оценка нарисована звёздами продукта, а не текстом');

    // Вердикт с БАЗЫ: экран бывает зелёным при непрошедшей записи.
    const points = (await docs('points')).map((d) => d.name);
    const fresh = points.filter((n) => !pointsBefore.includes(n));
    guestUid = fresh[0]?.split('/').pop() ?? '';
    const rating = guestUid ? await docs(`points/${guestUid}/dims`) : [];
    const hit = rating.find((d) => d.name.endsWith(`/${card.dimId}`));
    check('ГЭ-01д', hit !== undefined, 'оценка ЛЕЖИТ В БАЗЕ, а не только на экране', guestUid ? `гость ${guestUid.slice(0, 8)}…` : 'гость не родился');

    await page.screenshot({ path: `${OUT}/ГЭ-01-первый-экран-390.png`, fullPage: false }).catch(() => {});

    /* ═══ ГЭ-02 · NDIM-AUTH-017 — название читается целиком ═══ */
    section('ГЭ-02 · название не обрезано на телефоне (Ext, позитив)');
    const geom = await page.locator('.rated-name').evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        clipped: el.scrollWidth > el.clientWidth + 1,
        ellipsis: s.textOverflow === 'ellipsis',
        nowrap: s.whiteSpace === 'nowrap',
        clamp: s.webkitLineClamp !== 'none' && s.webkitLineClamp !== '',
        over: el.scrollWidth - el.clientWidth,
      };
    }).catch(() => null);
    check('ГЭ-02а', geom !== null && !geom.clipped, 'название помещается по ширине', geom ? `переполнение ${geom.over}px` : 'блока нет');
    check('ГЭ-02б', geom !== null && !geom.ellipsis && !geom.nowrap && !geom.clamp, 'ни ellipsis, ни nowrap, ни line-clamp (закон владельца 2026-08-14)');

    /* ═══ ГЭ-04 · NDIM-AUTH-019 — след одноразовый ═══ */
    section('ГЭ-04 · след двери одноразовый (Ext, негатив)');
    const traceAfter = await page.evaluate((k) => sessionStorage.getItem(k), TRACE_KEY);
    check('ГЭ-04а', traceAfter === null, 'след погашен сразу после показа', traceAfter ? 'след ещё в хранилище' : 'пусто');

    /*
     * 🔴 `?as=none` ОБЯЗАТЕЛЕН И НА ВОЗВРАТЕ. Без него стенд молча впускает `dev@ndim.space`
     * (`profile.ts` → `currentSession`), и проверки ниже судили бы ДРУГОГО человека: у жителя
     * оценки гостя нет, блок скрыт по верной причине, а вердикт читался бы как «след
     * одноразовый». Найдено мутацией «след не гасится»: под ней ГЭ-04б и ГЭ-04в остались
     * зелёными, то есть покраснеть не могли НИКОГДА.
     *
     * Уход — на ПУБЛИЧНУЮ страницу карточки (`?as=none`), возврат — дверью `?guest=1`, которая
     * ПЕРЕИСПОЛЬЗУЕТ живую анонимную сессию, а не заводит вторую. Голый `/profile?as=none`
     * пробовался и отвергнут замером: он снимает сессию вовсе, экран уходит на вход, и судить
     * становится нечего.
     */
    await page.goto(`${BASE}/ru/dimension/${card.slug}?as=none`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.goto(`${BASE}/profile?guest=1`, { waitUntil: 'domcontentloaded' });
    await awaitScreen(page);
    await page.waitForTimeout(2500);
    const second = await ratedBlock(page);
    check('ГЭ-04б', second.shown !== true, 'вернулся на Профиль — блока НЕТ');

    /*
     * Открываем Профиль ЗАНОВО той же дверью, а не `reload()`. Причина замерена: продукт
     * вычищает параметр `guest` из адреса после входа (одноразовость параметра), поэтому
     * `reload()` уходит на голый `/profile`, где стенд впускает `dev@ndim.space`, — и проверка
     * снова судила бы другого человека. Под мутацией «след не гасится» она оставалась зелёной.
     */
    await page.goto(`${BASE}/profile?guest=1`, { waitUntil: 'domcontentloaded' });
    await awaitScreen(page);
    await page.waitForTimeout(2500);
    const third = await ratedBlock(page);
    check('ГЭ-04в', third.shown !== true, 'перезагрузил страницу — блока НЕТ');

    /* ═══ ГЭ-05 · NDIM-AUTH-020 — след есть, оценки нет ═══ */
    section('ГЭ-05 · след есть, оценки в базе нет — продукт молчит (Ext, негатив)');
    await page.evaluate(
      ([k, v]) => sessionStorage.setItem(k, v),
      [TRACE_KEY, JSON.stringify({ id: 'ndim-nesushchestvuyushchee-izmerenie', title: 'Объект, которого человек не оценивал', year: 1999, kind: 'Фильм', value: 10, at: Date.now() })],
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await awaitScreen(page);
    await page.waitForTimeout(2500);
    const phantom = await ratedBlock(page);
    check('ГЭ-05а', phantom.shown !== true, 'блок НЕ показан: продукт не утверждает оценку, которой нет в базе', phantom.shown ? `показал «${phantom.title}»` : 'молчит');
    await page.screenshot({ path: `${OUT}/ГЭ-05-след-без-оценки-390.png` }).catch(() => {});

    /* ═══ ГЭ-06 · NDIM-AUTH-021 — отменённого правила на экране нет ═══ */
    section('ГЭ-06 · отменённое правило «гость невидим» на экране отсутствует (CP, негатив)');
    const body = (await page.locator('body').innerText().catch(() => '')) || '';
    check('ГЭ-06а', !/никто\s+не\s+вид|не\s+вид[\p{L}]*\s+никто|невидим/iu.test(body), 'на экране нет утверждения о невидимости гостя');
    check('ГЭ-06б', !/навсегда/i.test(body), 'слова «навсегда» на экране нет (правило владельца 2026-07-12)');

    await context.close();
  }

  /* ═══ ГЭ-03 · NDIM-AUTH-018 — гость без двери блока не видит ═══ */
  section('ГЭ-03 · гость, пришедший НЕ дверью карточки, блока не видит (CP, негатив)');
  {
    const context = await freshContext(browser, 390);
    const page = await context.newPage();
    listen(page, 'ГЭ-03');
    await page.goto(`${BASE}/profile?guest=1&as=none`, { waitUntil: 'domcontentloaded' });
    await awaitScreen(page);
    await page.waitForTimeout(3000);
    const block = await ratedBlock(page);
    check('ГЭ-03а', block.shown !== true, 'блока «Вы оценили» нет', block.shown ? `показан «${block.title}»` : 'нет');
    const guestPill = await page.locator('text=гость').count();
    check('ГЭ-03б', guestPill > 0, 'человек при этом ВНУТРИ гостем — экран рабочий, а не пустой', `меток «гость»: ${guestPill}`);
    await page.screenshot({ path: `${OUT}/ГЭ-03-гость-без-двери-390.png` }).catch(() => {});
    await context.close();
  }

  /* ═══ ГЭ-07 · NDIM-AUTH-022 — обе темы на двух ширинах ═══ */
  section('ГЭ-07 · блок читается в обеих темах и на двух ширинах (Ext, позитив)');
  for (const theme of ['light', 'dark']) {
    for (const width of [390, 1440]) {
      const { context, page } = await doorPass(browser, { width, theme, lang: 'ru', tag: `ГЭ-07 ${theme} ${width}` });
      const applied = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      const block = await ratedBlock(page);
      const geom = await page.locator('.rated-name').evaluate((el) => ({
        clipped: el.scrollWidth > el.clientWidth + 1,
        over: el.scrollWidth - el.clientWidth,
      })).catch(() => null);
      check(
        `ГЭ-07 ${theme}/${width}`,
        applied === theme && block.shown === true && geom !== null && !geom.clipped,
        'тема применена, блок показан, название не обрезано',
        `data-theme=${applied} · блок ${block.shown ? 'есть' : 'нет'} · переполнение ${geom ? geom.over : '—'}px`,
      );
      await page.locator('.rated-card').screenshot({ path: `${OUT}/ГЭ-07-${theme}-${width}.png` }).catch(() => {});
      await context.close();
    }
  }

  /* ═══ ГЭ-08 · NDIM-AUTH-023 — английская половина ═══ */
  section('ГЭ-08 · английская половина говорит то же и не несёт отменённого правила (Ext, позитив)');
  {
    const { context, page } = await doorPass(browser, { width: 390, theme: 'light', lang: 'en', tag: 'ГЭ-08 en' });
    const block = await ratedBlock(page);
    check('ГЭ-08а', block.shown === true, 'блок показан на английской половине', `«${block.title ?? '—'}»`);
    const body = (await page.locator('body').innerText().catch(() => '')) || '';
    check('ГЭ-08б', !/nobody sees you|you are invisible/i.test(body), 'отменённого правила нет и в английской половине');
    check('ГЭ-08в', !/(?<![\p{L}])forever(?![\p{L}])/iu.test(body), 'слова «forever» на экране нет');
    /*
     * ⛔ ЗДЕСЬ СТОЯЛА ПРОВЕРКА-ПУСТЫШКА и снята в тот же час: её условие оканчивалось на
     * `|| true`, то есть покраснеть она не могла НИ ПРИ КАКОМ состоянии продукта. Такая
     * строка добавляет единицу к числу «пройдено» и ничего не стережёт — ровно то, за что
     * этот набор и заведён. Язык НАЗВАНИЯ объекта задаёт каталог, а не интерфейс, поэтому
     * проверять его здесь нечем и не нужно; интерфейс судят ГЭ-08б и ГЭ-08в.
     */
    await page.locator('.rated-card').screenshot({ path: `${OUT}/ГЭ-08-en-390.png` }).catch(() => {});
    await context.close();
  }

  await browser.close();

  /* ═══ УБОРКА — база стенда общая (правило класса `bugs/103`) ═══ */
  section('Уборка следов прогона');
  const pointsAfter = (await docs('points')).map((d) => d.name);
  const born = pointsAfter.filter((n) => !pointsBefore.includes(n));
  for (const name of born) {
    const uid = name.split('/').pop();
    if (LIVE) {
      const db = await liveFirestore();
      const dims = await db.collection(`points/${uid}/dims`).get();
      for (const d of dims.docs) await d.ref.delete();
      await db.doc(`points/${uid}`).delete();
      // Учётка входа удаляется тем же ключом: гость, оставленный жить, семь дней считается
      // точкой Пространства и попадает в чужие связи.
      const { getAuth } = await import('firebase-admin/auth');
      await getAuth().deleteUser(uid).catch(() => {});
    } else {
      for (const dim of await docs(`points/${uid}/dims`)) {
        await fetch(`${FIRESTORE}/v1/${dim.name}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
      }
      await fetch(`${FIRESTORE}/v1/${name}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
    }
  }
  /*
   * 🔴 ВТОРАЯ ПОЛОВИНА УБОРКИ — УЧЁТКИ ВХОДА, А НЕ ТОЛЬКО ТОЧКИ БАЗЫ.
   *
   * Найдено независимой сверкой 2026-09-10: набор доложил «осталось 0», а на стейдже висели три
   * анонимные учётки этого же прогона. Причина — уборка шла по коллекции точек, а гость,
   * у которого проход двери оборвался до записи, точки не заводит вовсе и в список «рождённых»
   * не попадает. Живёт такая учётка семь дней и всё это время считается точкой Пространства.
   *
   * Поэтому на живом контуре подметаем ещё и по ВРЕМЕНИ: анонимные учётки, заведённые после
   * начала прогона. Признак «анонимный провайдер И возраст меньше длительности прогона» узкий
   * по построению — чужого человека он задеть не может.
   */
  let authSwept = 0;
  if (LIVE) {
    const { getAuth } = await import('firebase-admin/auth');
    await liveFirestore();
    const auth = getAuth();
    let token;
    const orphans = [];
    do {
      const page = await auth.listUsers(1000, token);
      for (const u of page.users) {
        const anonymous = (u.providerData ?? []).length === 0;
        const born = new Date(u.metadata.creationTime).getTime();
        if (anonymous && born >= startedAt - 60_000) orphans.push(u.uid);
      }
      token = page.pageToken;
    } while (token);
    for (const uid of orphans) {
      await auth.deleteUser(uid).catch(() => {});
      authSwept += 1;
    }
  }

  const pointsFinal = (await docs('points')).map((d) => d.name);
  const leftovers = pointsFinal.filter((n) => !pointsBefore.includes(n));
  check('УБ-01', leftovers.length === 0, 'след прогона убран, база вернулась в исходное', `заведено ${born.length}, осталось ${leftovers.length}`);
  if (LIVE) {
    const { getAuth } = await import('firebase-admin/auth');
    let token;
    let stillThere = 0;
    do {
      const page = await getAuth().listUsers(1000, token);
      for (const u of page.users) {
        const anonymous = (u.providerData ?? []).length === 0;
        if (anonymous && new Date(u.metadata.creationTime).getTime() >= startedAt - 60_000) stillThere += 1;
      }
      token = page.pageToken;
    } while (token);
    check('УБ-02', stillThere === 0, 'учётки входа, заведённые прогоном, удалены', `подметено ${authSwept}, осталось ${stillThere}`);
  }

  const ownHost = new URL(BASE).host;
  const failures = ears.flatMap((n) => n.entries()).filter((e) => e.address.startsWith(ownHost));
  check('КН-01', failures.length === 0, 'консоль и сеть чисты по своему адресу', failures.map((f) => `${f.code} ${f.address}`).join(' · ') || 'ноль отказов');

  const verdict = {
    at: new Date().toISOString(),
    base: BASE,
    набор: 'qa/suites/guest-first-screen.md',
    карточка: { slug: card.slug, dimId: card.dimId, title: card.title },
    гостей_заведено: born.length,
    пройдено: pass,
    провалено: fail,
    кейсы: cases,
  };
  writeFileSync(`${OUT}/verdict.json`, JSON.stringify(verdict, null, 2), 'utf8');

  console.log(`\n${fail === 0 ? '✅' : '🔴'} проверок ${pass + fail} · пройдено ${pass} · провалено ${fail}`);
  console.log(`📄 ${OUT}`);
  process.exit(fail === 0 ? 0 : 1);
};

run().catch((e) => {
  console.error('прогон оборвался:', e);
  process.exit(2);
});

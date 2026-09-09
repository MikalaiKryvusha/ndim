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
// @covers NDIM-AUTH-016, NDIM-AUTH-017, NDIM-AUTH-018, NDIM-AUTH-019, NDIM-AUTH-020, NDIM-AUTH-021
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { portsFor, slotOf } from './lib/stand-slot.mjs';
import { watchHttpFailures } from './lib/http-failures.mjs';

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

if (!/localhost|127\.0\.0\.1/.test(BASE)) {
  console.error('Только стенд: набор заводит гостей и пишет оценки — в бою это портило бы данные людей.');
  process.exit(1);
}

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

/** Документы коллекции эмулятора: правила читателю их не отдают, идём REST-ом от владельца. */
async function docs(path) {
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

const run = async () => {
  const card = pickCard();
  console.log(`Набор «первый экран гостя» · кейсы ГЭ-01…ГЭ-05 (qa/suites/guest-first-screen.md)`);
  console.log(`Карточка: /ru/dimension/${card.slug} · измерение ${card.dimId} · «${card.title}»`);
  console.log(`Стенд: ${BASE} · Firestore ${FIRESTORE}`);

  const pointsBefore = (await docs('points')).map((d) => d.name);
  console.log(`слепок «до»: точек ${pointsBefore.length}`);

  const browser = await chromium.launch({ headless: !HEADED });

  /* ═══ ГЭ-01 · NDIM-AUTH-016 — объект виден на первом экране ═══ */
  section('ГЭ-01 · объект виден на ПЕРВОМ экране (CP, позитив)');
  let guestUid = '';
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const page = await context.newPage();
    listen(page, 'ГЭ-01');
    await page.goto(`${BASE}/ru/dimension/${card.slug}?as=none`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-star]').nth(8).click();
    await page.waitForTimeout(1500);
    await page.locator('[data-door-enter]').click();
    await page.waitForURL(/\/profile/, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(5000);

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
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
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

  await browser.close();

  /* ═══ УБОРКА — база стенда общая (правило класса `bugs/103`) ═══ */
  section('Уборка следов прогона');
  const pointsAfter = (await docs('points')).map((d) => d.name);
  const born = pointsAfter.filter((n) => !pointsBefore.includes(n));
  for (const name of born) {
    const uid = name.split('/').pop();
    for (const dim of await docs(`points/${uid}/dims`)) {
      await fetch(`${FIRESTORE}/v1/${dim.name}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
    }
    await fetch(`${FIRESTORE}/v1/${name}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
  }
  const pointsFinal = (await docs('points')).map((d) => d.name);
  const leftovers = pointsFinal.filter((n) => !pointsBefore.includes(n));
  check('УБ-01', leftovers.length === 0, 'след прогона убран, база вернулась в исходное', `заведено ${born.length}, осталось ${leftovers.length}`);

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

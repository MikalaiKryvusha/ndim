#!/usr/bin/env node
/**
 * ПРИБОР — ДВЕРЬ КАРТОЧКИ КАТАЛОГА ВЕДЁТ В ГОСТЯ (`plans/75` Ш3, лечение `bugs/200`).
 *
 * ЗАЧЕМ. Критерии приёмки плана названы ПОВЕДЕНИЕМ человека, а не строками кода: «клик по двери
 * → человек внутри гостем, форм ноль» и «живая сессия уважается — вошедший попадает в свой
 * профиль, гостя ему не заводят». Юниты на это не отвечают по построению: они не знают ни
 * истории вкладки, ни того, что видит глаз, ни того, что легло в базу.
 *
 * 🔴 ВЕРДИКТ ЗАПИСИ СНИМАЕТСЯ С БАЗЫ И С ЭКРАНА — оба, и это не перестраховка. Урок смоука
 * (`plans/54`): мутация «оценка не помечает точку грязной» оставляет ЭКРАН ЗЕЛЁНЫМ — звёзды
 * горят, панель раскрылась, а записи нет. Поэтому каждая оценка здесь ищется в Firestore
 * эмулятора отдельным чтением.
 *
 * КАПКАНЫ СТЕНДА, УЧТЁННЫЕ ЗДЕСЬ:
 *   · **стенд автоматически впускает `dev@ndim.space`** (`profile.ts` → `currentSession`), и на
 *     голом адресе карточки оценка ушла бы В ЕГО точку. Незнакомца из поиска изображает дверь
 *     `?as=none` — «сессии нет вовсе». Это же и делает проверку способной покраснеть: без неё
 *     гость не родился бы НИКОГДА, и прибор радостно зеленел бы на дев-пользователе.
 *   · порты эмуляторов — СЛОТОВЫЕ (`plans/69`): у каждого рабочего места свои. Берём их из того
 *     же модуля, что и `vite.config.ts`, а не литералом — литерал увёл бы прибор в чужой стенд.
 *   · страница карточки объявлена `csr = false`: ждать «приложение ожило» здесь нечего и
 *     нельзя. Признак готовности — сам остров, то есть ответ разметки на клик.
 *
 * 🔴 ЭТОТ ПРИБОР НАМЕРЕННО НЕ МЕТИТ СВОИ СЕССИИ МЕТКОЙ `ndim-probe`, И ВОТ ПОЧЕМУ.
 * Метка существует, чтобы прогон прибора не попадал в воронку (`plans/74` Ф1 Ш3, лечение
 * `bugs/202`): под ней `track()` молчит. Но одна из проверок здесь — «касание двери СОСЧИТАНО
 * воронкой»; под меткой она не смогла бы стать зелёной НИКОГДА, то есть проверяла бы пустоту.
 * Загрязнения при этом нет по построению, и держится оно не дисциплиной, а отказом ниже:
 * прибор ОТКАЗЫВАЕТСЯ работать на любом адресе, кроме localhost, — до живой воронки ему не
 * дотянуться. Страж `tools/verify-probe-mark.mjs` этот файл не судит (у него нет ни адреса боя,
 * ни помощника метки — та самая слепая зона, названная в `EXP-0215`); сказано здесь вслух,
 * чтобы это было решением, а не случайностью.
 *
 * Стенд обязан быть поднят (`npm run stand`), замок доски — взят.
 *   node tools/probe-catalog-door.mjs [--base http://localhost:4203] [--headed]
 */

import { chromium } from 'playwright';
import { mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs';
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
const BASE = opt('--base', `http://localhost:${PORTS.preview}`).replace(/\/$/, '');
const HEADED = argv.includes('--headed');
const FIRESTORE = `http://127.0.0.1:${PORTS.firestore}`;
const PROJECT = 'demo-ndim-dev';
const OUT = 'test-results/probe-catalog-door';
mkdirSync(OUT, { recursive: true });

if (!/localhost|127\.0\.0\.1/.test(BASE)) {
  console.error('Только стенд: прибор заводит гостей и пишет оценки — в бою это портило бы данные.');
  process.exit(1);
}

/**
 * 🔴 УШИ ПРИБОРА — лечение слепоты, из-за которой `bugs/212` дожил до суда.
 *
 * Прибор был ЗЕЛЁНЫМ при четырёх ответах 404 на каждое касание звезды. И это не оплошность
 * автора, а свойство класса: все тридцать проверок здесь судят ПОВЕДЕНИЕ — панель раскрылась,
 * гость родился, оценка легла в базу, — а поведение было исправным. Мёртвая предзагрузка
 * поведения не меняет вовсе, она меняет только СКОРОСТЬ и содержимое консоли. Проверка
 * поведения такой дефект не видит по построению; видит его только тот, кто слушает ответы.
 * Ровно этот урок записан в `AGENT_GUIDE` («у каждого класса дефектов есть свой прибор»).
 *
 * Слушает общий модуль (`bugs/169`), СУДИТ прибор — и это разделение намеренное: модуль не
 * судит никогда, потому что 4xx с чужого домена в бою обычное дело. Здесь чужих доменов нет
 * по построению (прибор работает только на localhost), но граница всё равно проводится
 * явно — судим лишь то, что отдаёт НАШ адрес.
 */
const OWN_HOST = new URL(BASE).host;
/** @type {ReturnType<typeof watchHttpFailures>[]} */
const ears = [];
/** Подписывает страницу на неудачные ответы и включает её в общий итог прогона. */
const listen = (page, tag) => {
  ears.push(watchHttpFailures(page, { label: `[${tag}] ` }));
};
/**
 * Отказы СО СВОЕГО адреса — только они судятся.
 *
 * Схлопываем по «код + адрес» ЧЕРЕЗ страницы: модуль складывает повторы внутри одной страницы,
 * а один и тот же мёртвый чанк просят все семь контекстов прогона. Без склейки красная строка
 * повторяет пять адресов тридцать пять раз и перестаёт читаться — то есть перестаёт называть
 * виновника, ради чего уши и заведены (`bugs/169`).
 */
const ownFailures = () => {
  const merged = new Map();
  for (const e of ears.flatMap((net) => net.entries())) {
    if (!e.address.startsWith(OWN_HOST)) continue;
    const key = `${e.code} ${e.address}`;
    const known = merged.get(key);
    if (known) known.count += e.count;
    else merged.set(key, { ...e });
  }
  return [...merged.values()];
};

let pass = 0;
let fail = 0;
const check = (ok, name, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? '  OK  ' : '  FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};
const note = (text) => console.log(`   ·   ${text}`);
const section = (title) => console.log(`\n${title}`);

/** Документы коллекции эмулятора. Правила читателю их не отдают — идём REST-ом от владельца. */
async function docs(path) {
  const res = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}?pageSize=300`,
    { headers: { Authorization: 'Bearer owner' } },
  );
  if (!res.ok) return [];
  return (await res.json()).documents ?? [];
}

/**
 * Счётчики воронки за сегодня — REST эмулятора: правила читателю их не отдают.
 *
 * Нужен для шага `door_click` (контракт dev-2, фаза 1 `plans/74`). Считаем ПРИРОСТ, а не
 * абсолют: в базе стенда могли остаться числа прошлых прогонов, и «счётчик не ноль» доказывало
 * бы лишь то, что кто-то когда-то касался двери.
 */
/** Ключ дня воронки. Одно место правды: его же читает уборка, и разъехаться им нечем. */
const today = () => new Date().toISOString().slice(0, 10);

async function funnelToday() {
  const res = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/space/funnel/days/${today()}`,
    { headers: { Authorization: 'Bearer owner' } },
  );
  if (!res.ok) return {};
  const f = (await res.json()).fields ?? {};
  const num = (k) => Number(f[k]?.integerValue ?? f[k]?.doubleValue ?? 0);
  return { door_click: num('door_click'), guest_start: num('guest_start') };
}

/** Оценка конкретной точки по конкретному измерению, либо null. */
async function ratingOf(uid, dimId) {
  const res = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/points/${uid}/dims/${dimId}`,
    { headers: { Authorization: 'Bearer owner' } },
  );
  if (!res.ok) return null;
  const f = (await res.json()).fields ?? {};
  return Number(f.value?.integerValue ?? f.value?.doubleValue ?? NaN);
}

/* ═══ УБОРКА: письменные органы REST-а. Все — от владельца, правила писателю их не отдают ═══ */

/** Удаляет документ. Подколлекции Firestore при этом НЕ исчезают — их сносим отдельно. */
async function dropDoc(path) {
  await fetch(`${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer owner' },
  });
}

/** Возвращает оценке прежнее значение (или удаляет её, если прежде оценки не было). */
async function restoreRating(uid, dimId, value) {
  const path = `points/${uid}/dims/${dimId}`;
  if (value === null || Number.isNaN(value)) return dropDoc(path);
  await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}?updateMask.fieldPaths=value`,
    {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { value: { integerValue: String(value) } } }),
    },
  );
}

/** Возвращает счётчикам воронки их дособытийные значения. */
async function restoreFunnel(before) {
  const mask = 'updateMask.fieldPaths=door_click&updateMask.fieldPaths=guest_start';
  await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/space/funnel/days/${today()}?${mask}`,
    {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          door_click: { integerValue: String(before.door_click ?? 0) },
          guest_start: { integerValue: String(before.guest_start ?? 0) },
        },
      }),
    },
  );
}

/**
 * Слепок «до». Живёт в области модуля, а не прогона, намеренно: уборку зовёт и штатный хвост,
 * и обработчик падения — прибор, упавший на середине, оставляет за собой ровно тот же мусор.
 * @type {{points: string[], ratings: Map<string, number|null>, funnel: object, dimId: string,
 *         funnelExisted: boolean} | null}
 */
let snapshot = null;

/**
 * 🧹 УБОРКА СЛЕДА ПРОГОНА — и она ОБЯЗАНА быть проверяемой, а не заявленной.
 *
 * Возвращает список НЕубранного: пустой список и есть вердикт уборки. Порядок обратный
 * порядку записи: сначала оценки гостей, потом сами гости, потом счётчики.
 * @returns {Promise<string[]>}
 */
async function cleanupStand() {
  if (snapshot === null) return [];
  const known = new Set(snapshot.points);
  const leftovers = [];

  // 1. Точки, которых до прогона не было, — наши гости. Сносим вместе с их подколлекцией:
  //    удаление документа в Firestore подколлекции не трогает, и они остались бы сиротами.
  const born = (await docs('points')).map((d) => d.name).filter((n) => !known.has(n));
  for (const name of born) {
    const uid = name.split('/').pop();
    for (const dim of await docs(`points/${uid}/dims`)) {
      await dropDoc(`points/${uid}/dims/${dim.name.split('/').pop()}`);
    }
    await dropDoc(`points/${uid}`);
  }

  // 2. Точка ЖИТЕЛЯ стенда прогоном не рождена — её удалять нельзя, ей возвращают прежнее
  //    значение (раздел 3 ставит ему оценку 5 по этому измерению).
  for (const [uid, was] of snapshot.ratings) {
    const now = await ratingOf(uid, snapshot.dimId);
    const same = (was === null && now === null) || was === now;
    if (!same) await restoreRating(uid, snapshot.dimId, was);
  }

  // 3. Счётчики воронки: их двигают все шесть касаний прогона.
  if (snapshot.funnelExisted) await restoreFunnel(snapshot.funnel);
  else await dropDoc(`space/funnel/days/${today()}`);

  /* ── ПРОВЕРКА УБОРКИ. Без неё уборка — обещание, а обещание уже стоило базе 54 точек ── */
  const after = (await docs('points')).map((d) => d.name);
  const extra = after.filter((n) => !known.has(n));
  if (extra.length > 0) leftovers.push(`лишних точек ${extra.length}: ${extra.join(', ')}`);
  const gone = snapshot.points.filter((n) => !after.includes(n));
  if (gone.length > 0) leftovers.push(`уборка снесла ЧУЖОЕ — пропало точек ${gone.length}`);
  for (const [uid, was] of snapshot.ratings) {
    const now = await ratingOf(uid, snapshot.dimId);
    const same = (was === null && now === null) || was === now;
    if (!same) leftovers.push(`оценка точки ${uid} не вернулась: было ${was}, стало ${now}`);
  }
  const funnelNow = await funnelToday();
  for (const key of ['door_click', 'guest_start']) {
    const was = snapshot.funnelExisted ? (snapshot.funnel[key] ?? 0) : 0;
    const now = funnelNow[key] ?? 0;
    if (was !== now) leftovers.push(`счётчик ${key} не вернулся: было ${was}, стало ${now}`);
  }
  note(`убрано гостей ${born.length}`);
  return leftovers;
}

/**
 * Берём первую карточку каталога из собранного сайта: адрес и идентификатор измерения читаются
 * из САМОЙ страницы, а не собираются прибором. Своя копия правила сборки адреса разъехалась бы
 * с продуктом — это класс «истина ↔ зеркало».
 */
function pickCard() {
  const dir = 'build/ru/dimension';
  if (!existsSync(dir)) {
    console.error(`нет собранного сайта (${dir}) — сначала npm run build`);
    process.exit(2);
  }
  const file = readdirSync(dir).find((f) => f.endsWith('.html'));
  const html = readFileSync(`${dir}/${file}`, 'utf8');
  const dim = html.match(/data-dim="([^"]+)"/)?.[1] ?? '';
  return { slug: file.replace(/\.html$/, ''), dimId: dim };
}

const run = async () => {
  const card = pickCard();
  if (card.dimId === '') {
    console.error('на карточке нет `data-dim` — дверь собрана без движка, прибор судить не может');
    process.exit(2);
  }
  console.log(`Карточка: /ru/dimension/${card.slug} · измерение ${card.dimId}`);
  console.log(`Стенд: ${BASE} · Firestore ${FIRESTORE}`);

  /*
   * ═══ СЛЕПОК «ДО» — ради уборки (замечание З2 вердикта QA №5, класс `bugs/103`) ═══
   *
   * База стенда общая на все прогоны, и правило класса прямое: прибор, ПИШУЩИЙ в неё, обязан
   * вернуть её в исходное состояние и нести ВСТРОЕННУЮ проверку уборки. Прежняя редакция честно
   * говорила «уборка рестартом стенда» — и за один суд QA база набрала 54 лишние точки, потому
   * что стенд между прогонами никто не рестартовал. Обещание уборки, которое исполняет человек,
   * уборкой не является.
   *
   * Слепок снимается ДО первого касания и ровно по тем осям, которые прибор трогает:
   *   · какие точки существовали (всё лишнее после прогона — наше и подлежит удалению);
   *   · какая оценка стояла у каждой из них по ЭТОМУ измерению (раздел 3 пишет в точку
   *     жителя стенда — её нельзя удалять, её надо ВЕРНУТЬ);
   *   · счётчики воронки за сегодня (их двигают все шесть касаний прогона).
   */
  const startPoints = (await docs('points')).map((d) => d.name);
  const startRatings = new Map();
  for (const name of startPoints) {
    const uid = name.split('/').pop();
    startRatings.set(uid, await ratingOf(uid, card.dimId));
  }
  const startFunnel = await funnelToday();
  const funnelExisted = (await docs('space/funnel/days')).some((d) => d.name.endsWith(`/${today()}`));
  snapshot = {
    points: startPoints,
    ratings: startRatings,
    funnel: startFunnel,
    dimId: card.dimId,
    funnelExisted,
  };
  note(
    `слепок «до»: точек ${startPoints.length} · door_click ${startFunnel.door_click ?? 0} · ` +
      `guest_start ${startFunnel.guest_start ?? 0}`,
  );

  const browser = await chromium.launch({ headless: !HEADED });

  /* ═══ 1. Незнакомец из поиска: касание звезды рождает гостя и пишет НАСТОЯЩУЮ оценку ═══ */
  section('1. Незнакомец из поиска — первое касание и есть вход');
  let guestUid = null;
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const page = await context.newPage();
    listen(page, '1-незнакомец');
    /*
     * 🔴 ЗАПОМИНАЕМ ИМЕНА, А НЕ ЧИСЛО ТОЧЕК.
     *
     * Первая редакция брала «последнюю точку коллекции» и попадала в засеянного стендом
     * `stand-guest-viktor`: гость честно рождался, а прибор шёл искать оценку не у него и
     * объявлял провал. Признак проверки был неверен — второй вопрос лестницы к зелёному
     * прогону, и он же ловится только сверкой ИМЁН до и после.
     */
    const before = new Set((await docs('points')).map((d) => d.name));
    const funnelBefore = await funnelToday();

    // `?as=none` — «сессии нет вовсе»: так выглядит человек, пришедший из поиска. Без этой
    // двери стенд молча впустил бы dev-пользователя, и гость не родился бы никогда.
    await page.goto(`${BASE}/ru/dimension/${card.slug}?as=none`, { waitUntil: 'domcontentloaded' });

    const starsCount = await page.locator('[data-star]').count();
    check(starsCount === 11, '1а ряд оценки — 11 позиций 0…10 (канон шкалы)', `${starsCount}`);
    const panelHiddenBefore = await page.locator('[data-door-panel]').isHidden();
    check(panelHiddenBefore, '1б до касания панели нет — только звёзды (эталон Д3)');

    // Форм на карточке нет и быть не должно: вход замаскирован в интерактив (№009 В3).
    const inputs = await page.locator('input, form').count();
    check(inputs === 0, '1в форм на карточке ноль', `полей ${inputs}`);

    await page.locator('[data-star]').nth(8).click();
    await page.waitForTimeout(600);
    const panelShown = await page.locator('[data-door-panel]').isVisible();
    check(panelShown, '1г касание раскрыло панель-мостик');
    const hint = (await page.locator('[data-door-hint]').textContent())?.trim() ?? '';
    check(hint === 'Ваша оценка: 8 из 10', '1д подпись оценки — по эталону Д3', hint);
    const ack = (await page.locator('.ack').textContent())?.trim() ?? '';
    check(ack === 'Ваша оценка засчитана!', '1е слова владельца на панели — дословно', ack);

    // Ждём рождение гостя и запись: движок грузится динамически, это секунды.
    let born = null;
    for (let i = 0; i < 40 && born === null; i++) {
      await page.waitForTimeout(500);
      const points = await docs('points');
      born = points.find((d) => !before.has(d.name)) ?? null;
    }
    check(born !== null, '1ж гость РОЖДЁН касанием звезды', born ? 'точка появилась' : 'точки нет');
    if (born) {
      guestUid = born.name.split('/').pop();
      const value = await ratingOf(guestUid, card.dimId);
      // 🔴 Вердикт записи — С БАЗЫ, а не с экрана: экран зелен и при потерянной записи.
      check(value === 8, '1з оценка 8 ЛЕЖИТ В БАЗЕ у нового гостя', `значение ${value}`);
    }

    /*
     * Шаг воронки `door_click` — контракт dev-2 (фаза 1 `plans/74`). Считаем ПРИРОСТ: абсолютное
     * число ничего не доказывает, в базе стенда живут следы прошлых прогонов. Ждём с запасом —
     * счётчик уходит своей дорогой (`void`) и записи оценки не задерживает, значит он может
     * долететь ПОЗЖЕ неё.
     */
    let funnelAfter = await funnelToday();
    for (let i = 0; i < 20 && (funnelAfter.door_click ?? 0) <= (funnelBefore.door_click ?? 0); i++) {
      await page.waitForTimeout(500);
      funnelAfter = await funnelToday();
    }
    const grew = (funnelAfter.door_click ?? 0) - (funnelBefore.door_click ?? 0);
    check(
      grew >= 1,
      '1и касание двери СОСЧИТАНО воронкой (door_click +1)',
      `было ${funnelBefore.door_click ?? 0}, стало ${funnelAfter.door_click ?? 0}`,
    );

    await page.locator('.door').screenshot({ path: `${OUT}/door-touched-390.png` }).catch(() => {});
    await context.close();
  }

  /* ═══ 2. Дверь: клик уводит внутрь продукта, форм по дороге нет ═══ */
  section('2. Клик по двери — человек внутри, форм ноль');
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const page = await context.newPage();
    listen(page, '2-клик двери');
    await page.goto(`${BASE}/ru/dimension/${card.slug}?as=none`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-star]').nth(7).click();
    await page.waitForTimeout(400);

    const href = await page.locator('[data-door-enter]').getAttribute('href');
    check(href === '/profile?guest=1', '2а адрес двери стоит В ПРЕРЕНДЕРЕ и ведёт в гостя', String(href));

    await page.locator('[data-door-enter]').click();
    await page.waitForURL(/\/profile/, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(4000);

    const formsOnWay = await page.locator('form, input[type="email"]').count();
    check(formsOnWay === 0, '2б форм по дороге не было', `полей ${formsOnWay}`);
    const body = (await page.locator('body').innerText().catch(() => '')) || '';
    check(!/Войдите в Пространство/i.test(body), '2в человек НЕ упёрся в стену входа');
    const guestPill = await page.locator('text=гость').count();
    check(guestPill > 0, '2г человек внутри ГОСТЕМ', `меток «гость»: ${guestPill}`);
    await page.screenshot({ path: `${OUT}/after-door-390.png` }).catch(() => {});
    await context.close();
  }

  /* ═══ 3. Живая сессия уважается: жителю гостя не заводят (канон `bugs/95`) ═══ */
  section('3. Вошедший человек — своя сессия, гостя не заводят');
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const page = await context.newPage();
    listen(page, '3-житель');
    // Голый адрес стенда = вошедший dev@ndim.space. Это и есть «житель».
    await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const pointsBefore = (await docs('points')).length;

    await page.goto(`${BASE}/ru/dimension/${card.slug}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-star]').nth(5).click();
    await page.waitForTimeout(5000);
    await page.locator('[data-door-enter]').click();
    await page.waitForURL(/\/profile/, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(4000);

    const pointsAfter = (await docs('points')).length;
    check(
      pointsAfter === pointsBefore,
      '3а новой точки НЕ появилось — гостя жителю не завели',
      `точек было ${pointsBefore}, стало ${pointsAfter}`,
    );
    const body = (await page.locator('body').innerText().catch(() => '')) || '';
    check(!/Сейчас Вы гость/i.test(body), '3б житель не объявлен гостем');
    await context.close();
  }

  /* ═══ 4. Карточку не обеднили: все секции на месте (инвариант владельца) ═══ */
  section('4. Карточку не обеднять — секции на месте');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    listen(page, '4-секции');
    await page.goto(`${BASE}/ru/dimension/${card.slug}`, { waitUntil: 'domcontentloaded' });
    for (const [name, sel] of [
      ['шапка с языками и «Войти»', 'header a[href="/profile"], a[href="/profile"]'],
      ['ссылка в хаб вида', '.up a'],
      ['заголовок объекта', 'h1'],
      ['досье', '.dossier'],
      ['полное описание', '.desc'],
      ['тексты двери', '.door h2'],
      ['подвал', '.foot'],
    ]) {
      const n = await page.locator(sel).count();
      check(n > 0, `4 · ${name} на месте`, `${n}`);
    }
    const descLen = ((await page.locator('.desc').textContent()) ?? '').trim().length;
    check(descLen > 400, '4 · описание ПОЛНОЕ, а не обрезанное', `${descLen} знаков`);
    await context.close();
  }

  /* ═══ 5. Кадры: обе темы × 390/1440, панель раскрыта ═══ */
  section('5. Кадры (обе темы × 390/1440)');
  for (const theme of ['light', 'dark']) {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      const page = await context.newPage();
      listen(page, `5-${theme}-${width}`);
      await page.goto(`${BASE}/ru/dimension/${card.slug}?as=none`, { waitUntil: 'domcontentloaded' });
      // Тема — атрибут на <html>, а не media-query (её ставит инлайн-скрипт `app.html`).
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.locator('[data-star]').nth(8).click();
      await page.waitForTimeout(900);
      const themeNow = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      const shot = `${OUT}/door-${theme}-${width}.png`;
      await page.locator('.door').screenshot({ path: shot });
      check(themeNow === theme, `5 кадр ${theme} · ${width}px снят`, shot);
      await context.close();
    }
  }

  /* ═══ 6. Контроль прибора: без JS дверь всё равно есть ═══ */
  section('6. КОНТРОЛЬ — без JS дверь остаётся');
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 }, javaScriptEnabled: false });
    const page = await context.newPage();
    listen(page, '6-без JS');
    await page.goto(`${BASE}/ru/dimension/${card.slug}`, { waitUntil: 'domcontentloaded' });
    const plain = page.locator('[data-door-plain]');
    check(await plain.isVisible(), '6а с выключенным JS видна обычная дверь');
    const href = await plain.getAttribute('href');
    check(href === '/profile?guest=1', '6б и она ведёт в гостя, а не в стену входа', String(href));
    const panel = await page.locator('[data-door-panel]').isHidden();
    check(panel, '6в панель без JS не показывается');
    await context.close();
  }

  await browser.close();

  /* ═══ 7. УШИ: страница не должна отдавать отказов со своего адреса (`bugs/212`) ═══ */
  section('7. УШИ — ответы страницы, а не только её поведение');
  const bad = ownFailures();
  check(
    bad.length === 0,
    '7а ни одного ответа ≥ 400 со своего адреса',
    bad.length === 0
      ? `свой адрес ${OWN_HOST}, отказов ноль`
      : bad.map((e) => `${e.code} ${e.type} ${e.address}${e.count > 1 ? ` ×${e.count}` : ''}`).join(' ; '),
  );

  /* ═══ 8. УБОРКА и ЕЁ ПРОВЕРКА (`bugs/103`, замечание З2 вердикта №5) ═══ */
  section('8. След прогона убран — и это проверено, а не обещано');
  const leftovers = await cleanupStand();
  check(leftovers.length === 0, '8а база стенда вернулась в исходное состояние', leftovers.join(' · '));

  console.log(`\nИТОГ: пройдено ${pass} · провалено ${fail}`);
  if (guestUid) console.log(`Гость прогона ${guestUid} — заведён и убран.`);
  process.exit(fail === 0 ? 0 : 1);
};

run().catch(async (e) => {
  console.error('\nприбор упал:', e?.stack ?? e);
  /*
   * 🔑 УБОРКА ЖИВЁТ И НА ПУТИ ПАДЕНИЯ. Прибор, упавший на середине, оставляет за собой ровно
   * тот же мусор, что и дошедший до конца, — а падает он чаще. Уборка «только когда всё хорошо»
   * убирает ровно в том случае, когда убирать почти нечего.
   */
  const leftovers = await cleanupStand().catch((err) => [`уборка упала: ${err?.message ?? err}`]);
  if (leftovers.length > 0) console.error('след НЕ убран:', leftovers.join(' · '));
  process.exit(2);
});

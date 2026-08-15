/**
 * ПРИБОР: путь анонима от первой оценки до первых связей — `plans/23` фаза 1.
 *
 * ═══ ЗАЧЕМ ═══
 *
 * Владелец описал петлю (интервью №009, В3): человек попадает внутрь, мягкий туториал ведёт его
 * в «Измерения», он ставит НАСТОЯЩИЕ оценки, сервер синхронизации считает связи, и человек
 * возвращается на «Связи» — увидеть результат своих действий.
 *
 * 🔴 Вся петля держится на числах, которых НИКТО НЕ МЕРИЛ:
 *   · сколько СЕКУНД проходит от первой оценки до первого топа? Если минуты — кульминация
 *     наступает, когда человек уже ушёл, и вся красота перехода бессмысленна;
 *   · какие ПРОЦЕНТЫ похожести видит новичок при 5, 10, 20, 40 оценках? Общность считается
 *     коэффициентом Дайса и наказывает за узкое пересечение: у человека с 5 оценками против
 *     человека с 50 потолок похожести ≈ 18%. Если кульминация показывает единицы процентов —
 *     обещание лендинга придётся формулировать иначе, чем «нашли похожих»;
 *   · сколько ЗАПИСЕЙ стоит один гость? От этого зависит цена решения «гостю можно всё».
 *
 * От этих чисел зависят три ответа владельца, поэтому замер идёт ДО реализации, а не после.
 *
 * ═══ ВТОРАЯ РАБОТА ЭТОГО ЖЕ ПРОГОНА ═══
 *
 * 🔑 Живое доказательство починки «Связей» (`relations.ts`, 2026-08-01): до неё ОДИН отказ в
 * чтении чужой публичной карточки ронял ВЕСЬ экран, а гостю это чтение запрещено правилами
 * (`verified()`). То есть петля владельца приводила нового человека прямо в «Не удалось
 * загрузить связи». Прибор поднимает гостя с НЕПУСТЫМ топом — то есть ровно тот случай — и
 * требует, чтобы экран жил.
 *
 * Запуск: `npm run stand`, затем `node tools/probe-guest-journey.mjs`.
 * Прибор НИЧЕГО не ломает: заводит своего гостя и читает. Гость сам исчезнет по правилам чистки.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const FS = 'http://127.0.0.1:8181';
const PROJECT = 'demo-ndim-dev';
const OUT = 'test-results/guest-journey';
mkdirSync(OUT, { recursive: true });

const AUTH = 'http://127.0.0.1:9099';
const OWNER = { Authorization: 'Bearer owner' };
const docsUrl = (path) => `${FS}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`;

/*
 * 🔴 ДВЕРЬ `?as=guest` ОБЯЗАТЕЛЬНА НА КАЖДОЙ НАВИГАЦИИ, А НЕ ТОЛЬКО НА ВХОДЕ.
 *
 * Первая редакция прибора заходила гостем на `/profile?guest=1`, а дальше ходила по чистым
 * адресам — и намерила ноль оценок. Причина в стендовой ветке `currentSession()`
 * (`src/lib/data/profile.ts`): живой сессией она считает только НЕ-анонимную, а анонимную
 * пропускает и делает `signInDev()`. То есть на первом же чистом адресе гость молча
 * подменялся на `dev@ndim.space`, и все оценки уходили ЕМУ.
 *
 * Ровно тот же класс, что `EXP-0114`: удобство стенда — его слепое пятно. Прибор красил
 * пустоту зелёным и уже успел выдать ложный вывод «топ не приехал».
 */
const guestUrl = (path) => `${BASE}${path}${path.includes('?') ? '&' : '?'}as=guest`;

/**
 * Все анонимные uid, какие сейчас знает эмулятор Auth.
 *
 * 🔴 «Взять последнего в списке» — НЕЛЬЗЯ, и на этом прибор уже обжёгся. Порядок в ответе
 * `accounts:query` не есть порядок создания, а каждый прогон (и каждый отладочный заход)
 * оставляет в эмуляторе нового анонима. Прибор мерил ОДНОГО гостя, пока браузер работал
 * ДРУГИМ, и трижды подряд выдавал «оценок 0» — при том что оценки исправно ложились в базу.
 * Настоящий продукт при этом был здоров, а прибор говорил обратное.
 *
 * Опознаём по РАЗНИЦЕ: снимок до входа, снимок после — новый uid и есть наш гость.
 * Тот же класс, что `EXP-0111`: прибор, который «мерил не то», и его ложь выглядела находкой.
 */
async function anonUids() {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, {
    method: 'POST',
    headers: { ...OWNER, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (r.status !== 200) throw new Error(`Auth-эмулятор ответил ${r.status}`);
  return new Set(((await r.json()).userInfo ?? []).filter((u) => !u.email).map((u) => u.localId));
}

/**
 * Идентификаторы ВСЕХ документов коллекции.
 *
 * 🔴 ЧЕТВЁРТАЯ ЛОЖЬ ЭТОГО ПРИБОРА, И САМАЯ ТИХАЯ (класс EXP-0115). Прежняя редакция брала
 * `documents` из ОДНОГО ответа REST и считала это всей коллекцией. Firestore отдаёт коллекцию
 * СТРАНИЦАМИ и кладёт `nextPageToken`; прибор его игнорировал. При 40 оценках он честно
 * напечатал «долетело 30» и «общих с Анной 1», тогда как в базе лежали 40 оценок и общих было 4.
 *
 * Ложь была правдоподобной со всех сторон: 30 < 40 читалось как «часть оценок не сохранилась»
 * (правдоподобно — у продукта есть отсчёт и его отмена), а маленькое пересечение подтверждало
 * ожидаемый вывод. Поймано только сверкой с тем, что записал САМ сервер синхронизации
 * (`ownerSpaceSize: 40`, `commonSpaceSize: 4`) — то есть вторым независимым свидетелем.
 *
 * Урок класса: любой обход коллекции по REST обязан идти по страницам до конца, а вывод,
 * сошедшийся с ожиданием, — самый опасный из всех.
 */
async function docIds(path) {
  const ids = [];
  let token = null;
  do {
    const url = `${docsUrl(path)}?pageSize=300${token ? `&pageToken=${token}` : ''}`;
    const r = await fetch(url, { headers: OWNER });
    if (r.status === 403) throw new Error(`эмулятор ответил 403 на ${path} — прибор смотрит мимо`);
    if (r.status !== 200) return ids;
    const body = await r.json();
    ids.push(...(body.documents ?? []).map((d) => d.name.split('/').pop()));
    token = body.nextPageToken ?? null;
  } while (token);
  return ids;
}

/** Сколько документов в коллекции — по ПОЛНОМУ обходу страниц, а не по первой странице. */
const count = async (path) => (await docIds(path)).length;

async function readDoc(path) {
  const r = await fetch(docsUrl(path), { headers: OWNER });
  if (r.status === 403) throw new Error(`403 на ${path} — прибор смотрит мимо правил`);
  return r.status === 200 ? await r.json() : null;
}

const report = [];
const say = (line) => {
  console.log(line);
  report.push(line);
};

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ru-RU' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // ── Шаг 1. Заводим гостя ────────────────────────────────────────────────────────────────
  say('\n── Шаг 1: аноним заходит ──');
  const before = await anonUids();
  const bornAt = Date.now();
  await page.goto(`${BASE}/profile?guest=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const after = await anonUids();
  const fresh = [...after].filter((id) => !before.has(id));
  if (fresh.length !== 1) {
    throw new Error(
      `ожидался РОВНО один новый аноним, а появилось ${fresh.length}. Мерить нельзя: неизвестно, ` +
        'кто из них наш гость. Перезапусти стенд, чтобы начать с чистого эмулятора.',
    );
  }
  const uid = fresh[0];
  say(`  uid гостя: ${uid} (опознан по разнице снимков, а не «последним в списке»)`);

  /*
   * ПАРНАЯ ПРОВЕРКА (EXP-0070): прежде чем мерить «сколько ехал топ», убеждаемся, что оценки
   * вообще ДОЛЕТЕЛИ до базы. Без неё прибор честно ждёт 90 секунд топа, которого не может быть,
   * и выдаёт ложную находку — именно это и случилось в первом прогоне.
   */
  const ratedInDb = async () => count(`points/${uid}/dims`);

  /*
   * ══ ДВЕ ВЕТКИ ПОВЕДЕНИЯ НОВИЧКА — и разница между ними есть ГЛАВНЫЙ РЕЗУЛЬТАТ ЗАМЕРА ══
   *
   * `--random` (умолчание) — новичок оценивает то, что ему даёт лента «Все». Лента —
   *   равновероятное перемешивание ВСЕГО неоценённого каталога (`feed.ts:63`), в бою это
   *   5111 измерений. Так продукт ведёт себя СЕЙЧАС.
   *
   * `--popular` — новичок оценивает ПОПУЛЯРНОЕ: то, что уже оценили другие люди. Слово
   *   владельца 2026-08-01: «люди всегда оценивают популярные штуки, которые многие другие
   *   люди уже оценили — а не рандомные никому неизвестные».
   *
   * 🔑 Почему обе ветки обязаны быть в одном приборе. Похожесть = близость × общность, а
   * общность — коэффициент Дайса `2·|общие| / (|мои| + |его|)`. Пересечение решает ВСЁ:
   * у новичка с 10 оценками против человека с 50 одно общее измерение даёт потолок
   * похожести ≈ 3%, восемь общих — ≈ 27%. Мерить одну ветку и калибровать по ней обещание
   * лендинга — значит принять свойство ЛЕНТЫ за свойство математики.
   *
   * Популярность берётся ИЗ ЖИВЫХ ТОЧЕК (`points/{кто-то}/dims`), а не из поля `rates`
   * каталога: на стенде `rates` засеян декоративно и с реальными оценками не совпадает, а
   * пересечение считается именно по точкам. В бою эти два источника сходятся.
   */
  const POPULAR_MODE = process.argv.includes('--popular');
  say(`\n  режим: ${POPULAR_MODE ? '--popular (оцениваем то, что уже оценили другие)' : '--random (как даёт лента «Все» сегодня)'}`);

  /** Измерения по числу оценивших их людей — убыванием. Пусто = мерить пересечение не с чем. */
  async function popularDims() {
    const tally = new Map();
    for (const person of (await docIds('points')).filter((id) => id !== uid)) {
      for (const id of await docIds(`points/${person}/dims`)) tally.set(id, (tally.get(id) ?? 0) + 1);
    }
    return [...tally.entries()].sort((a, b) => b[1] - a[1]);
  }

  /** Русское имя измерения из каталога — им прибор ищет карточку глазами человека. */
  async function dimTitle(id) {
    const d = await readDoc(`dims/${id}`);
    return d?.fields?.title?.mapValue?.fields?.ru?.stringValue ?? null;
  }

  let popularQueue = [];
  if (POPULAR_MODE) {
    const ranked = await popularDims();
    say(`  популярное по живым точкам: ${ranked.map(([id, n]) => `${id}×${n}`).join(', ') || 'НИЧЕГО'}`);
    for (const [id] of ranked) {
      const title = await dimTitle(id);
      if (title) popularQueue.push({ id, title });
    }
  }

  /**
   * Оценить измерение ПОИСКОМ по имени — так же, как это сделал бы человек, который
   * пришёл за знакомой ему вещью. Ящик поиска схлопнут, и `click()` по полю спотыкается о
   * родителя (EXP-0071), поэтому ящик открывается кнопкой панели, а поле берётся `fill`.
   */
  async function rateBySearch(id, title) {
    const input = page.locator('input.search').first();
    if (!(await input.isVisible().catch(() => false))) {
      const toggles = page.locator('.toolbar button[aria-expanded]');
      for (let i = 0; i < (await toggles.count()); i += 1) {
        await toggles.nth(i).click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(500);
        if (await input.isVisible().catch(() => false)) break;
      }
    }
    if (!(await input.isVisible().catch(() => false))) return false;
    await input.fill(title);
    await page.locator('form.sform button.go').click({ timeout: 3000 }).catch(() => {});

    /*
     * 🔴 ФИКСИРОВАННОЙ ПАУЗЫ ЗДЕСЬ МАЛО — первая редакция ждала 1500 мс и получила
     * «поиск не показал карточку» по ВСЕМ шести популярным измерениям. Поиск не мгновенен:
     * он ищет по индексу и ДОГРУЖАЕТ найденные карточки из базы (≤20 документов), показывая
     * пока кольцо загрузки (`searchBusy`). Прибор успевал заглянуть раньше ответа и честно
     * сообщал «нет карточки» — а популярная ветка при этом молча не исполнялась вовсе, и
     * числа приходили из ленты. Ждём САМУ КАРТОЧКУ, а не часы.
     */
    return await page
      .locator(`article[data-dim="${id}"] .stars`)
      .first()
      .waitFor({ state: 'visible', timeout: 9000 })
      .then(() => true)
      .catch(() => false);
  }

  // ── Шаг 2. Оценки порциями, с замером после каждой ──────────────────────────────────────
  const MILESTONES = [5, 10, 20, 40];
  const measured = [];
  let rated = 0;
  let feedRestored = false;

  for (const target of MILESTONES) {
    say(`\n── Шаг 2.${target}: доводим до ${target} оценок ──`);
    await page.goto(guestUrl('/dims'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    /*
     * Звёзды продукта: `.stars button.st`, у каждой `aria-label` = её значение 0…10.
     * Ставим 8 — «нравится», но не край шкалы: край у всех подряд дал бы неестественно
     * одинаковую точку и завысил бы похожесть.
     */
    while (rated < target) {
      /*
       * Ветка «популярное»: пока очередь не исчерпана — идём поиском за конкретным
       * измерением и оцениваем ИМЕННО ЕГО, адресуясь по `data-dim`. Брать «первую карточку
       * выдачи» нельзя: поиск может вернуть несколько, и прибор молча оценил бы не то —
       * ровно тот класс лжи, на котором он уже горел трижды (EXP-0115).
       * Очередь кончилась — честно добираем лентой: популярного в Пространстве конечное
       * число, дальше человек и правда попадает в общий каталог.
       */
      let card = null;
      if (POPULAR_MODE && popularQueue.length > 0) {
        const next = popularQueue.shift();
        if (await rateBySearch(next.id, next.title)) {
          card = page.locator(`article[data-dim="${next.id}"] .stars`).first();
          say(`  ищем и оцениваем популярное: «${next.title}» (${next.id})`);
        } else {
          say(`  ⚠️ поиск «${next.title}» не дал карточку ${next.id} — пропущено`);
        }
        if (card === null) continue;
      }

      if (card === null) {
        // Очередь популярных только что кончилась, а экран остался в выдаче поиска —
        // возвращаемся в ленту, иначе «добор лентой» добирал бы из одного запроса.
        if (POPULAR_MODE && !feedRestored) {
          feedRestored = true;
          await page.goto(guestUrl('/dims'), { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2500);
        }
        const cards = page.locator('.stars');
        const n = await cards.count();
        if (n === 0) {
          say('  ⚠️ карточек со звёздами на экране нет — замер оборван честно');
          break;
        }
        card = cards.nth(rated % n);
      }

      const clicked = await card
        .locator('button.st[aria-label="8"]')
        .click({ timeout: 4000 })
        .then(() => true)
        .catch(() => false);
      if (!clicked) {
        await page.mouse.wheel(0, 1600);
        await page.waitForTimeout(600);
        continue;
      }

      /*
       * 🔴 БЕЗ ЭТОГО ЖМАКА ОЦЕНКА НЕ СОХРАНЯЕТСЯ — и первые две редакции прибора намерили ноль.
       *
       * Звезда не пишет в базу сразу: она запускает ОТСЧЁТ 5 СЕКУНД (`COUNTDOWN_SECONDS`),
       * и только по его истечении идёт запись. Хуже для прибора: оценка ДРУГОЙ карточки
       * отсчёт отменяет — «сохраняем только то, на что смотрят». То есть быстрые клики подряд
       * не сохраняют НИЧЕГО, а звёзды при этом честно красятся: интерфейс показывает выбор,
       * которого в базе нет.
       *
       * Продукт прав, прибор был неправ. Пользуемся штатной кнопкой «Сохранить сейчас» — она
       * зовёт тот же `commit()`, что и отсчёт.
       */
      const saved = await page
        .locator('button.now')
        .first()
        .click({ timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      if (!saved) await page.waitForTimeout(5600); // кнопки нет — честно ждём отсчёт

      rated += 1;
      await page.waitForTimeout(400);
      if (rated % 10 === 0) {
        await page.mouse.wheel(0, 2200); // лента порционная — подгружаем следующую порцию
        await page.waitForTimeout(900);
      }
    }

    const landed = await ratedInDb();
    say(`  кликов по звёздам: ${rated} · оценок ДОЛЕТЕЛО до базы: ${landed}`);
    if (landed === 0) {
      say('  🔴 оценки не долетели — дальше мерить нечего, это дефект прибора или продукта');
      break;
    }

    /*
     * Ждём топ и засекаем, СКОЛЬКО он ехал. Признак свежести менялся ТРИЖДЫ, и каждая
     * прежняя редакция врала по-своему — поэтому здесь записаны все три.
     *
     * 1. «Документ СУЩЕСТВУЕТ с непустым топом» — документ с прошлой вехи никуда не девается,
     *    и на вехах 10/20/40 условие выполнялось первым же чтением: «топ приехал за 0.0 с»
     *    означало «я смотрю на позавчерашний ответ». Свежий стенд это НЕ лечит: веха 5
     *    оставляет документ внутри того же прогона.
     *
     * 2. «Документ НАПИСАН ПОСЛЕ начала ожидания» (`updateTime >= waitStart`) — сломалось об
     *    экономию запросов (`ideas/14`): сервер пишет топ ТОЛЬКО при изменении (diff-запись).
     *    Если топ уже верен, новой записи не будет никогда, и прибор честно ждал 90 секунд,
     *    печатая «топ не приехал» о правильно посчитанном топе. Одну ложь сменил другой.
     *
     * 3. ✅ «Точка СИНХРОНИЗИРОВАНА ПОЗЖЕ, чем изменена» (`lastSync >= updated`) — признак
     *    самого сервера, а не наша догадка по времени записи. Он истинен ровно тогда, когда
     *    топ учитывает все мои оценки, и одинаково верен и при перезаписи, и при diff-пропуске.
     *
     * Урок класса: свежесть спрашивают у того, кто её ОБЪЯВЛЯЕТ, а не выводят из косвенных
     * отметок времени.
     */
    const waitStart = Date.now();
    let top = null;
    let staleTop = 0; // топ есть, но он ещё не учитывает последние оценки
    while (Date.now() - waitStart < 90_000) {
      const point = await readDoc(`points/${uid}`);
      const updated = Number(point?.fields?.updated?.integerValue ?? 0);
      const lastSync = Number(point?.fields?.lastSync?.integerValue ?? 0);
      const d = await readDoc(`relations/${uid}`);
      const values = d?.fields?.top?.arrayValue?.values ?? [];
      if (values.length && lastSync >= updated && updated > 0) {
        top = values;
        break;
      }
      if (values.length) staleTop = values.length;
      await new Promise((r) => setTimeout(r, 1000));
    }
    const waited = ((Date.now() - waitStart) / 1000).toFixed(1);
    if (staleTop && top === null) say(`  (топ из ${staleTop} связей в базе есть, но он СТАРШЕ моих оценок)`);

    if (top === null) {
      say(`  🔴 топ не приехал за 90 с (оценок ${rated})`);
      measured.push({ rated, seconds: null, best: null, size: 0 });
    } else {
      const percents = top
        .map((v) => Number(v.mapValue?.fields?.similarity?.doubleValue ?? v.mapValue?.fields?.similarity?.integerValue ?? 0))
        .sort((a, b) => b - a);
      say(`  ⏱ топ приехал за ${waited} с · связей ${top.length} · лучшая похожесть ${percents[0]?.toFixed?.(1) ?? percents[0]}%`);
      measured.push({ rated, seconds: Number(waited), best: percents[0] ?? null, size: top.length });
    }
  }

  // ── Шаг 3. 🔑 ЖИВОЕ ДОКАЗАТЕЛЬСТВО ПОЧИНКИ «СВЯЗЕЙ» ─────────────────────────────────────
  say('\n── Шаг 3: экран «Связи» у гостя с непустым топом ──');
  await page.goto(guestUrl('/relations'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const relText = await page.locator('main').innerText();
  await page.screenshot({ path: `${OUT}/relations-guest.png`, fullPage: true });

  const died = /не удалось загрузить|не удалось прочитать/i.test(relText);
  say(died ? '  🔴 ЭКРАН УПАЛ — починка не работает' : '  ✅ экран жив (починка relations.ts подтверждена живьём)');
  say(`  первые строки экрана: ${relText.slice(0, 160).replace(/\n/g, ' · ')}`);

  /*
   * ── Шаг 3.5. ПЕРЕСЕЧЕНИЕ — число, которое объясняет всё остальное ────────────────────────
   *
   * Пустой топ и однозначные проценты — не разные симптомы, а один: слишком узкое
   * пересечение. Без этой строки прибор оставлял бы читателя гадать, и первый прогон именно
   * так и был прочитан («топ не приехал за 90 с» звучало как проблема ВРЕМЕНИ, а было
   * отсутствием общих измерений вовсе).
   *
   * Печатаем и потолок похожести по Дайсу: `2·|общие| / (|мои| + |его|)` — выше него
   * similarity не поднимется ни при какой близости, потому что она множитель, а не слагаемое.
   */
  say('\n── Шаг 3.5: с кем и насколько гость пересёкся ──');
  const mine = new Set(await docIds(`points/${uid}/dims`));
  say(`  у гостя оценок: ${mine.size} (полным обходом страниц, а не первой страницей)`);
  for (const person of await docIds('points')) {
    if (person === uid) continue;
    const theirs = await docIds(`points/${person}/dims`);
    const common = theirs.filter((id) => mine.has(id));
    const ceiling = theirs.length + mine.size > 0 ? (200 * common.length) / (mine.size + theirs.length) : 0;
    say(
      `  ${person}: у него ${theirs.length} · общих ${common.length}` +
        ` · потолок похожести ${ceiling.toFixed(1)}%${common.length ? ' (' + common.join(', ') + ')' : ''}`,
    );
  }

  // ── Шаг 4. Цена одного гостя в записях ──────────────────────────────────────────────────
  say('\n── Шаг 4: во что обошёлся один гость ──');
  if (uid) {
    const dims = await count(`points/${uid}/dims`);
    const buckets = await count(`users/${uid}/profile`);
    say(`  оценок в базе: ${dims} · бакетов профиля: ${buckets} · возраст гостя: ${((Date.now() - bornAt) / 1000).toFixed(0)} с`);
  } else {
    say('  ⚠️ uid не прочитан — цену не считаем, чтобы не выдумывать');
  }

  say(`\n  ошибок в консоли: ${errors.length}${errors.length ? ' — ' + errors.slice(0, 2).join(' | ') : ''}`);

  /*
   * 🔴 БЕЗ ЭТОЙ СТРОКИ ЛЮБОЕ ЧИСЛО НИЖЕ БУДЕТ ПРОЧИТАНО НЕВЕРНО.
   *
   * В каталоге стенда ~48 измерений, в бою — 5111. Гость, поставивший 40 оценок, покрывает
   * на стенде 83 % каталога и пересекается со всеми поголовно; в бою те же 40 оценок — это
   * 0.8 % каталога, и пересечение почти нулевое. То есть проценты похожести, снятые на этом
   * стенде, — свойство ЕГО РАЗМЕРА, а не продукта, и переносить их в бой нельзя.
   * Время до первого топа переносится: оно определяется циклом сервера, а не каталогом.
   */
  const catalogSize = (await docIds('dims')).filter((id) => id !== 'dims_list').length;
  const mineNow = (await docIds(`points/${uid}/dims`)).length;
  say('\n══ ГРАНИЦА ПЕРЕНОСИМОСТИ ЗАМЕРА ══');
  say(`  каталог стенда: ${catalogSize} измерений · гость оценил ${mineNow} — это ${((100 * mineNow) / Math.max(1, catalogSize)).toFixed(0)} % каталога`);
  say(`  в бою те же ${mineNow} оценок — это ${((100 * mineNow) / 5111).toFixed(1)} % каталога (5111 измерений)`);
  say('  ⚠️ проценты похожести НЕ переносимы в бой. Переносимо только время до первого топа.');

  // ── Сводка для владельца ────────────────────────────────────────────────────────────────
  say('\n══ СВОДКА: что видит новичок ══');
  say('  оценок | топ приехал за | связей | лучшая похожесть');
  for (const m of measured) {
    say(
      `  ${String(m.rated).padStart(6)} | ${String(m.seconds ?? 'не приехал').padStart(14)} | ${String(m.size).padStart(6)} | ${m.best === null ? '—' : m.best.toFixed(1) + '%'}`,
    );
  }
} finally {
  await browser.close();
}

writeFileSync(`${OUT}/report.txt`, report.join('\n'), 'utf8');
console.log(`\nОтчёт: ${OUT}/report.txt`);

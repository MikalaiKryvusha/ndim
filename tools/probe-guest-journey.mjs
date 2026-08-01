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

/** Сколько документов в коллекции. 403 — прибор смотрит мимо правил, а не «пусто» (EXP-0111). */
async function count(path) {
  const r = await fetch(docsUrl(path), { headers: OWNER });
  if (r.status === 403) throw new Error(`эмулятор ответил 403 на ${path} — прибор смотрит мимо`);
  if (r.status !== 200) return 0;
  return ((await r.json()).documents ?? []).length;
}

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

  // ── Шаг 2. Оценки порциями, с замером после каждой ──────────────────────────────────────
  const MILESTONES = [5, 10, 20];
  const measured = [];
  let rated = 0;

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
      const cards = page.locator('.stars');
      const n = await cards.count();
      if (n === 0) {
        say('  ⚠️ карточек со звёздами на экране нет — замер оборван честно');
        break;
      }
      const card = cards.nth(rated % n);
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

    // Ждём топ и засекаем, СКОЛЬКО он ехал.
    const waitStart = Date.now();
    let top = null;
    while (Date.now() - waitStart < 90_000) {
      const d = await readDoc(`relations/${uid}`);
      if (d?.fields?.top?.arrayValue?.values?.length) {
        top = d.fields.top.arrayValue.values;
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    const waited = ((Date.now() - waitStart) / 1000).toFixed(1);

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

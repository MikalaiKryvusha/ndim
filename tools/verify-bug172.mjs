/**
 * СТРАЖ bugs/172 — карточка измерения НЕ меняет вид перед отъездом.
 *
 * Страж, а не прибор замера: выносит вердикт кодом выхода (0 — чисто, 1 — дефект) и несёт
 * контроль прибора. Числа он печатает заодно — они нужны, чтобы вердикт можно было прочитать,
 * а не принять на веру.
 *
 * Слово владельца дословно (2026-08-22, его рукой в bugs/172):
 *   «Выставленные звёзды исчезают, снимается выделение, исчезают смайлики, исчезает кнопка
 *    «Сохранить» — это заметно и это плохо: карточка резко меняет свой внешний вид перед тем,
 *    как начать анимацией уезжать.»
 *   Ожидание: «Карточка не меняет свой внешний вид. Только кнопка [Сохранить] может стать,
 *    например, зелёной, с текстом [Сохранено] — в остальном карточка остаётся в том же виде,
 *    с выставленными звёздами, и в этом виде анимацией уезжает.»
 *
 * И его же поручение о процессе, в том же документе:
 *   «Когда анимации разрабатываете: записывайте видео с тем, как они себя ведут, с частотой,
 *    например, 10 кадров в секунду… чтобы отсмотреть покадрово анимацию».
 * Поэтому прибор даёт ДВА артефакта: видео для глаза владельца и покадровую трассу для
 * машинного вердикта. Видео словами не судится (урок MOTION: «быстро/медленно» три захода
 * подряд означали разные вещи), трасса не смотрится глазами — нужны обе половины.
 *
 * ЧТО МЕРИТСЯ, кадр за кадром, ровно четыре вещи из жалобы владельца плюс две служебные:
 *   · lit    — сколько звёзд ГОРИТ (`.stars .st.fill`), то есть «выставленные звёзды»;
 *   · peak   — есть ли выделение выбранной звезды (`.st.peak` / `.st.zero`);
 *   · faces  — высота ряда смайликов (`.faces`), 0 = ряда нет;
 *   · save   — есть ли кнопка сохранения (`.countdown .now`) и какой на ней текст;
 *   · x, h   — сдвиг вправо и высота: ими опознаётся, КОГДА начался отъезд;
 *   · gone   — карточки в разметке больше нет.
 *
 * 🔴 КРИТЕРИЙ ДЕФЕКТА ОБЪЯВЛЕН ДО ЗАМЕРА (иначе вывод подгоняется под увиденное — дисциплина
 * прибора-родни `measure-bug80-flight.mjs`). Окно суда — ВСЯ трасса от выбранной звезды до
 * кадра `gone`; эталон — КОНТРОЛЬНЫЙ СНИМОК, снятый при живом отсчёте. Внутри окна:
 *   lit не убывает · peak не пропадает · faces не обнуляется · кнопка не исчезает.
 * Смена ТЕКСТА кнопки нарушением НЕ считается — владелец разрешил её явно.
 *
 * ⚠️ ЭТАЛОН БЕРЁТСЯ ИЗ КОНТРОЛЬНОГО СНИМКА, А НЕ ИЗ ТРАССЫ, И ЭТО ПРАВКА ПО ОЖОГУ.
 * Первая редакция искала «последний кадр, где строка отсчёта ещё жива», и брала его за эталон.
 * Прогон 2026-08-22 показал, чего это стоит: на том кадре строка отсчёта имела высоту 1px —
 * она УЖЕ уезжала переходом `slide`, — а звёзды на нём уже погасли. Эталон вышел нулевым, и
 * две проверки из четырёх («звёзды гаснут», «выделение снимается») сравнили ноль с нулём и
 * напечатали ✅ на воспроизведённом дефекте. Класс — `EXP-0070`: сравнение с базой, которая
 * сама уже сломана. Контрольный снимок берётся заведомо ДО нуля отсчёта, и он же служит
 * воротами «мерить есть что».
 *
 * ⚠️ ОТСЧЁТ ДОВОДИТСЯ ДО НУЛЯ ЕСТЕСТВЕННО, кнопкой «Сохранить сейчас» жест НЕ подменяется:
 * владелец описал именно автосохранение по нулю отсчёта, а у ручного пути другая точка входа
 * в `commit()` и он мог бы дать другую картинку. Пять секунд ожидания — цена честного опыта.
 *
 * ⚠️ КОНТРОЛЬ ПРИБОРА ПЕРВЫМ (EXP-0070/EXP-0082): до нуля отсчёта прибор ОБЯЗАН видеть
 * непустую картинку — горящие звёзды, ряд смайликов и кнопку. Не увидел — мерить было нечего,
 * и вердикт «нарушений нет» был бы ложным зелёным. Тогда прогон падает, не дойдя до суда.
 *
 * ДВА РЕЖИМА, И ОНИ РАЗДЕЛЕНЫ НАМЕРЕННО:
 *   (по умолчанию) — покадровая rAF-трасса и машинный вердикт. Скриншотов не делает;
 *   `--frames`     — очередь снимков ~10 к/с вокруг нуля отсчёта: те самые кадры, которые
 *                    владелец просил отсматривать. Вердикта не выносит.
 * Почему не одним прогоном: снимок стоит десятки миллисекунд и выедает кадры rAF-трассы —
 * тогда числа времени описывали бы прибор, а не продукт. Каждый режим меряет своё, чисто.
 *
 * ДОКАЗАН МУТАЦИЕЙ 2026-08-22, адресаты названы ДО прогона. Мутация — снятие самой починки
 * (`git stash` на `saved` и разметку карточки), то есть возврат продукта в состояние жалобы.
 * Все ЧЕТЫРЕ проверки покраснели адресно, во всех четырёх конфигурациях (свет/тьма × 390/1440):
 * звёзды 8 → 0 и выделение 1 → 0 на +0 мс от нуля отсчёта · ряд смайликов → 0px на +181…183 мс ·
 * кнопка исчезает на +247…250 мс. На починенном коде те же четыре проверки зелены.
 *
 * Требует поднятый `npm run stand`.
 * Запуск: node tools/verify-bug172.mjs [--theme light|dark] [--width 1440]
 *                                      [--label ДО-light-1440] [--trace] [--frames]
 * Выход:  test-results/bug172/<метка>/ (video/ + report.txt + кадры)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const STAND = 'http://localhost:5173';
const AUTH = 'http://127.0.0.1:9099';
const FS = 'http://127.0.0.1:8181';
const PROJECT = 'demo-ndim-dev';

const TRACE = process.argv.includes('--trace');
/** Режим покадровой съёмки ~10 к/с — поручение владельца из bugs/172. */
const FRAMES = process.argv.includes('--frames');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const THEME = arg('--theme', 'light');
const WIDTH = Number(arg('--width', '1440'));
/** Метка прогона: без неё второй прогон затирает кадры первого и пары «до/после» не существует
 *  (ожог `measure-bug117`, там это уже случилось). */
const LABEL = arg('--label', `${THEME}-${WIDTH}`);
const OUT = `test-results/bug172/${LABEL}`;

/** Звезда жеста. 7 выбрана не случайно: она не 0 и не 10, поэтому «горит ровно столько,
 *  сколько выбрано» — проверяемое утверждение, а не совпадение с краем шкалы. */
const STAR = 7;

const lines = [];
function say(text = '') {
  console.log(text);
  lines.push(text);
}

/** Вход почтовой ссылкой через oob-код эмулятора Auth (приём EXP-0045). */
async function signIn(page) {
  const email = 'dev@ndim.space';
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=demo-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestType: 'EMAIL_SIGNIN', email, continueUrl: `${STAND}/profile` }),
  });
  const res = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes = [] } = await res.json();
  const last = oobCodes.filter((c) => c.email === email && c.requestType === 'EMAIL_SIGNIN').at(-1);
  if (!last) return false;
  await page.goto(`${STAND}/profile?mode=signIn&oobCode=${last.oobCode}&apiKey=demo-api-key`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(2200);
  return true;
}

async function standUid() {
  const res = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'dev@ndim.space',
        password: 'ndim-dev-stand',
        returnSecureToken: true,
      }),
    },
  );
  if (!res.ok) return null;
  const { localId } = await res.json();
  return localId ?? null;
}

/** Уборка за собой: прибор ставит НАСТОЯЩУЮ оценку, и база стенда общая для всех стражей
 *  (правило класса bugs/103). Уборка проверяется ниже чтением. */
async function dropRating(uid, dimId) {
  await fetch(
    `${FS}/v1/projects/${PROJECT}/databases/(default)/documents/points/${uid}/dims/${dimId}`,
    { method: 'DELETE', headers: { Authorization: 'Bearer owner' } },
  );
}

async function ratingExists(uid, dimId) {
  const res = await fetch(
    `${FS}/v1/projects/${PROJECT}/databases/(default)/documents/points/${uid}/dims/${dimId}`,
    { headers: { Authorization: 'Bearer owner' } },
  );
  return res.ok;
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
let verdictFailed = false;

try {
  const uid = await standUid();
  if (uid === null) {
    say('❌ не найден пользователь стенда — поднят ли `npm run stand`?');
    process.exit(1);
  }

  const context = await browser.newContext({
    viewport: { width: WIDTH, height: 900 },
    locale: 'ru-RU',
    // ~10 к/с владелец назвал достаточной частотой; Playwright сам пишет плавнее, но кадры
    // мы всё равно судим трассой, а видео — для глаза.
    recordVideo: { dir: `${OUT}/video`, size: { width: WIDTH, height: 900 } },
  });
  // Тема ставится КЛЮЧОМ до загрузки: `emulateMedia` тему продукта не переключает — она
  // живёт в атрибуте `data-theme` (капкан, оплаченный `verify-icons` и приборами гостя).
  await context.addInitScript((theme) => localStorage.setItem('ndim-theme', theme), THEME);
  const page = await context.newPage();

  if (!(await signIn(page))) {
    say('❌ не удалось войти');
    process.exit(1);
  }
  await page.goto(`${STAND}/dims`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('article.dim[data-dim]', { timeout: 30000 });

  const appliedTheme = await page.evaluate(() => document.documentElement.dataset.theme ?? '(нет)');
  say(`тема: заказана «${THEME}», применена «${appliedTheme}» · ширина ${WIDTH}`);
  if (appliedTheme !== THEME) {
    say('❌ тема НЕ применилась — прогон мерил бы не то, что заявляет.');
    process.exit(1);
  }

  const dimId = await page
    .locator('article.dim[data-dim]')
    .first()
    .evaluate((el) => el.getAttribute('data-dim'));
  const card = `article.dim[data-dim="${dimId}"]`;
  say(`карточка жеста: ${dimId}`);

  // Карточка целиком в окне — иначе scroll anchoring подкручивает страницу при её удалении
  // и трасса описывает не только движение карточек (ожог родни, `measure-bug80-flight`).
  await page.locator(card).evaluate((el) => {
    window.scrollTo({ top: el.offsetTop - 220, behavior: 'instant' });
  });
  await page.waitForTimeout(400);

  // Жест: выбираем звезду — появляются ряд смайликов и строка отсчёта.
  await page.locator(`${card} .stars .st[aria-label="${STAR}"]`).click();
  await page.waitForTimeout(600);

  /* ── КОНТРОЛЬ ПРИБОРА: до нуля отсчёта картинка ОБЯЗАНА быть непустой ─────────────── */
  const before = await page.locator(card).evaluate((el) => ({
    lit: el.querySelectorAll('.stars .st.fill').length,
    peak: el.querySelectorAll('.stars .st.peak, .stars .st.zero').length,
    faces: Math.round(el.querySelector('.faces')?.getBoundingClientRect().height ?? 0),
    save: el.querySelector('.countdown .now')?.textContent?.trim() ?? null,
    h: Math.round(el.getBoundingClientRect().height),
  }));
  say('');
  say('контроль прибора (до нуля отсчёта):');
  say(
    `  горит звёзд ${before.lit} · выделение ${before.peak} · смайлики ${before.faces}px · ` +
      `кнопка «${before.save ?? '—'}» · высота ${before.h}px`,
  );
  if (before.lit === 0 || before.peak === 0 || before.faces === 0 || before.save === null) {
    say('❌ КОНТРОЛЬ ПРИБОРА НЕ ПРОЙДЕН: до отсчёта на карточке нет того, чему полагается');
    say('   исчезать. Вердикт «нарушений нет» был бы ложным зелёным — мерить нечего.');
    process.exit(1);
  }
  await page.screenshot({ path: `${OUT}/01-до-нуля-отсчёта.png` });

  /* ── РЕЖИМ КАДРОВ: ~10 к/с вокруг нуля отсчёта (поручение владельца) ───────────────── */
  if (FRAMES) {
    /*
     * Снимаем ОКРЕСТНОСТЬ стыка, а не все пять секунд ожидания: интересен переход
     * «отсчёт идёт» → «сохранено» → «уехала». Клик по звезде был ~600 мс назад, значит
     * ноль отсчёта наступит примерно через 4,4 с; начинаем за 800 мс до него и снимаем,
     * пока карточка не уйдёт с запасом.
     */
    const LEAD = 3600; // мс до начала съёмки
    const SHOTS = 26; // ~10 к/с × 2,6 с — накрывает ноль отсчёта и весь отъезд (700 мс)
    const STEP = 100;
    await page.waitForTimeout(LEAD);

    const clip = await page.locator(card).boundingBox().catch(() => null);
    // Кадрируем по карточке с полями: владелец судит карточку, а не рабочий стол.
    const box = clip
      ? {
          x: Math.max(0, clip.x - 24),
          y: Math.max(0, clip.y - 24),
          width: Math.min(WIDTH, clip.width + 48),
          height: clip.height + 48,
        }
      : null;

    say('');
    say(`покадровая съёмка: ${SHOTS} кадров с шагом ${STEP} мс (≈10 к/с), кадрирование по карточке`);
    const stamps = [];
    for (let i = 0; i < SHOTS; i += 1) {
      const t = Date.now();
      const name = `frame-${String(i).padStart(2, '0')}.png`;
      // `clip` фиксирован по исходному положению: карточка уезжает ВПРАВО и обязана быть
      // видна уезжающей, а не «выпасть из кадра» вместе с рамкой.
      await page.screenshot({ path: `${OUT}/${name}`, ...(box ? { clip: box } : {}) });
      /*
       * ⚠️ Читаем ГОЛЫМ `querySelector` внутри `page.evaluate`, а НЕ через `locator`.
       * Locator ждёт появления узла по 30 с, а карточка к концу съёмки уже улетела —
       * первая редакция вешала прогон на полминуты НА КАЖДЫЙ кадр после её ухода, и
       * «10 к/с» превращались в один кадр в полминуты. Ошибка прибора, не продукта.
       */
      const state = await page.evaluate((id) => {
        const el = document.querySelector(`article.dim[data-dim="${id}"]`);
        if (!el) return null;
        return {
          lit: el.querySelectorAll('.stars .st.fill').length,
          faces: Math.round(el.querySelector('.faces')?.getBoundingClientRect().height ?? 0),
          save: el.querySelector('.countdown .now')?.textContent?.trim() ?? null,
        };
      }, dimId);
      stamps.push(
        `  ${name} — ${state === null ? 'карточки в разметке НЕТ' : `звёзд ${state.lit} · смайлики ${state.faces}px · кнопка «${state.save ?? '—'}»`}`,
      );
      const spent = Date.now() - t;
      if (spent < STEP) await page.waitForTimeout(STEP - spent);
    }
    for (const line of stamps) say(line);
    await dropRating(uid, dimId);
    say('');
    say('режим кадров вердикта НЕ выносит — он для глаза владельца. Судит прогон без `--frames`.');
    // Закрываем и пишем отчёт ЗДЕСЬ: `process.exit()` не исполняет `finally`, и первая
    // редакция уходила молча — без отчёта и с недозакрытым Chromium.
    await context.close();
    await browser.close();
    await writeFile(`${OUT}/report.txt`, lines.join('\n'), 'utf8');
    console.log(`\nотчёт: ${OUT}/report.txt · кадры и видео: ${OUT}/`);
    process.exit(0);
  }

  /* ── ТРАССА: пишем КАЖДЫЙ кадр от «сейчас» до конца отъезда ───────────────────────── */
  await page.evaluate((id) => {
    window.__b172 = { rows: [] };
    const t0 = performance.now();
    const shiftX = (el) => {
      const tr = getComputedStyle(el).transform;
      if (!tr || tr === 'none') return 0;
      const nums = tr
        .slice(tr.indexOf('(') + 1, -1)
        .split(',')
        .map(Number);
      return nums.length === 6 ? nums[4] : (nums[12] ?? 0);
    };
    const step = () => {
      const el = document.querySelector(`article.dim[data-dim="${id}"]`);
      const t = Math.round(performance.now() - t0);
      if (!el) {
        window.__b172.rows.push({ t, gone: true });
        if (t < 9000) requestAnimationFrame(step);
        return;
      }
      const cd = el.querySelector('.countdown');
      window.__b172.rows.push({
        t,
        lit: el.querySelectorAll('.stars .st.fill').length,
        peak: el.querySelectorAll('.stars .st.peak, .stars .st.zero').length,
        faces: Math.round(el.querySelector('.faces')?.getBoundingClientRect().height ?? 0),
        save: el.querySelector('.countdown .now')?.textContent?.trim() ?? null,
        // Текст строки отсчёта нужен, чтобы найти границу окна: пока он есть, отсчёт идёт.
        cd: cd ? Math.round(cd.getBoundingClientRect().height) : 0,
        x: Math.round(shiftX(el)),
        h: Math.round(el.getBoundingClientRect().height),
      });
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, dimId);

  // Ждём естественный ноль отсчёта (5 с) + весь отъезд (700 мс) + запас на запись в базу.
  await page.waitForTimeout(5000 + 700 + 2500);

  const rows = await page.evaluate(() => window.__b172.rows);
  await page.screenshot({ path: `${OUT}/03-после-отъезда.png` });

  /* ── УБОРКА (база стенда общая, bugs/103) и ПРОВЕРКА уборки ───────────────────────── */
  await dropRating(uid, dimId);
  const leftBehind = await ratingExists(uid, dimId);
  say('');
  say(leftBehind ? '⚠️ след НЕ убран: оценка осталась в базе стенда' : 'след убран: оценки в базе нет');

  /* ── СУД: окно от последнего кадра с живым отсчётом до исчезновения карточки ───────── */
  if (rows.length === 0) {
    say('❌ трасса пуста — мерить нечем');
    verdictFailed = true;
  } else {
    const goneIdx = rows.findIndex((r) => r.gone);
    {
      const window_ = rows.slice(0, goneIdx === -1 ? rows.length : goneIdx + 1);
      // Эталон — КОНТРОЛЬНЫЙ СНИМОК при живом отсчёте, а не кадр трассы: см. врезку в шапке.
      const base = before;
      /*
       * НОЛЬ ОТСЧЁТА — первый кадр, на котором карточка хоть чем-то отошла от эталона:
       * погасла звезда, ушёл ряд, сменился текст кнопки или карточка тронулась с места.
       * По построению это и есть момент `commit()`.
       *
       * ⚠️ Прежняя редакция искала «последний кадр, где строка отсчёта ещё высокая», и на
       * ПОЧИНЕННОМ коде уползала в самый конец трассы: строка сохранения там больше не
       * уезжает, `cd` держится 40px до конца, и все смещения печатались отрицательными.
       * Метка, работающая только на сломанном коде, — не метка.
       */
      const departed = (r) =>
        r.gone ||
        r.lit !== base.lit ||
        r.peak !== base.peak ||
        r.faces === 0 ||
        r.save !== base.save ||
        r.x > 2;
      const zeroIdx = Math.max(0, rows.findIndex(departed));
      const zeroT = rows[zeroIdx].t;
      say('');
      say(
        `окно суда: вся трасса ${window_[0].t} → ${window_.at(-1).t} мс ` +
          `(${window_.length} кадров, отъезд ${goneIdx === -1 ? 'НЕ ЗАВЕРШЁН' : 'завершён'}); ` +
          `ноль отсчёта на ${zeroT} мс`,
      );
      say(
        `эталон (контрольный снимок при живом отсчёте): звёзд ${base.lit} · выделение ${base.peak} ` +
          `· смайлики ${base.faces}px · кнопка «${base.save}»`,
      );

      const bad = {
        lit: window_.filter((r) => !r.gone && r.lit < base.lit),
        peak: window_.filter((r) => !r.gone && r.peak < base.peak),
        faces: window_.filter((r) => !r.gone && r.faces === 0),
        save: window_.filter((r) => !r.gone && r.save === null),
      };
      const report = [
        ['выставленные звёзды гаснут', bad.lit, (r) => `${r.lit} вместо ${base.lit}`],
        ['выделение снимается', bad.peak, () => 'нет'],
        ['ряд смайликов исчезает', bad.faces, () => '0px'],
        ['кнопка сохранения исчезает', bad.save, () => 'нет'],
      ];

      say('');
      for (const [name, hits, show] of report) {
        if (hits.length === 0) {
          say(`  ✅ ${name} — ни на одном кадре`);
        } else {
          verdictFailed = true;
          const first = hits[0];
          const rel = first.t - zeroT;
          say(
            `  ❌ ${name} — на ${hits.length} кадрах из ${window_.length}; ` +
              `впервые на ${first.t} мс трассы (${rel >= 0 ? '+' : ''}${rel} мс от нуля отсчёта), ` +
              `стало: ${show(first)}`,
          );
        }
      }

      const textChange = window_.find((r) => !r.gone && r.save !== null && r.save !== base.save);
      if (textChange) {
        say(
          `  ℹ️ текст кнопки менялся: «${base.save}» → «${textChange.save}» ` +
            `на ${textChange.t - zeroT} мс от нуля отсчёта — владельцем РАЗРЕШЕНО, ` +
            'нарушением не считается',
        );
      }

      say('');
      say(
        verdictFailed
          ? '⇒ ДЕФЕКТ bugs/172 ВОСПРОИЗВЕДЁН: карточка меняет вид перед отъездом.'
          : '⇒ карточка вид не меняет: ожидание владельца выполнено.',
      );

      if (TRACE) {
        say('');
        say('трасса [мс от нуля отсчёта : звёзд : выдел : смайл : отсчёт : сдвиг : высота : кнопка]');
        // Печатаем окрестность нуля отсчёта, а не все пять секунд ожидания: интересен стык.
        for (const r of window_.filter((row) => row.t >= zeroT - 400)) {
          if (r.gone) {
            say(`  ${String(r.t - zeroT).padStart(5)} : УШЛА`);
            continue;
          }
          say(
            `  ${String(r.t - zeroT).padStart(5)} : ${String(r.lit).padStart(5)} : ` +
              `${String(r.peak).padStart(5)} : ${String(r.faces).padStart(5)} : ` +
              `${String(r.cd).padStart(5)} : ${String(r.x).padStart(5)} : ` +
              `${String(r.h).padStart(5)} : ${r.save ?? '—'}`,
          );
        }
      }
    }
  }

  await context.close();
} finally {
  await browser.close();
  await writeFile(`${OUT}/report.txt`, lines.join('\n'), 'utf8');
  console.log(`\nотчёт: ${OUT}/report.txt · видео: ${OUT}/video/`);
}

process.exit(verdictFailed ? 1 : 0);

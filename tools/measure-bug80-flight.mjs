/**
 * ПРИБОР ЗАМЕРА (не страж) для bugs/80 — жалоба владельца на УЕЗД оценённой карточки.
 *
 * Слово владельца дословно (2026-07-30):
 *   «Я понял в чём проблема с уездом карточки. Соседние слишком быстро занимают её место,
 *    не дожидаются, пока она уедет — баг. И стал уезд слишком медленным.»
 *
 * ЧТО МЕРИТСЯ. Одной трассой снимаются ОБА участника разом, кадр в кадр:
 *   · уезжающая карточка — сдвиг вправо, высота, непрозрачность;
 *   · СЛЕДУЮЩАЯ карточка ленты — её `top`, то есть «занимает ли она место».
 * Без второго ряда чисел жалоба непроверяема: прошлые замеры этого бага следили только за
 * уезжающей и потому не видели ровно того, на что жалуется владелец.
 *
 * КРИТЕРИЙ ДЕФЕКТА (объявлен ДО замера, чтобы не подгонять вывод под увиденное):
 * соседняя карточка не должна занимать освободившееся место раньше, чем уезжающая ушла.
 * Мерится долей пути: на каком проценте пути уезжающей сосед прошёл половину своего подъёма.
 *
 * Отдельно печатается ВЫСОТА уезжающей карточки по кадрам — главный подозреваемый по коду:
 * `commit()` гасит `pending` (ряд смайликов + строка отсчёта уходят переходом `slide`), и
 * карточка укорачивается, ещё стоя на месте. Тогда соседи едут вверх не «слишком быстро», а
 * вообще по другой причине, чем кажется.
 *
 * Требует поднятый `npm run stand`.
 * Запуск: node tools/measure-bug80-flight.mjs [--gesture 900] [--trace]
 *   --gesture N  переопределяет длительность улёта на лету (CSS-токен + окно ожидания),
 *                чтобы сравнить варианты, НЕ трогая файлы продукта.
 * Выход: test-results/bug80-flight/ (видео прогона + report.txt)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const STAND = 'http://localhost:5173';
const AUTH = 'http://127.0.0.1:9099';
const FS = 'http://127.0.0.1:8181';
const PROJECT = 'demo-ndim-dev';
const OUT = 'test-results/bug80-flight';
const TRACE = process.argv.includes('--trace');

const widthArg = process.argv.indexOf('--width');
/** Ширина окна: 1440 — десктоп владельца (лента в две колонки), 390 — телефон (одна). */
const WIDTH = widthArg === -1 ? 1440 : Number(process.argv[widthArg + 1]);

const gestureArg = process.argv.indexOf('--gesture');
/** null = как в продукте; число = переопределить токен для сравнения вариантов. */
const GESTURE = gestureArg === -1 ? null : Number(process.argv[gestureArg + 1]);

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
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'dev@ndim.space', password: 'ndim-dev-stand', returnSecureToken: true }),
  });
  if (!res.ok) return null;
  const { localId } = await res.json();
  return localId ?? null;
}

async function dropRating(uid, dimId) {
  await fetch(`${FS}/v1/projects/${PROJECT}/databases/(default)/documents/points/${uid}/dims/${dimId}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer owner' },
  });
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

try {
  const uid = await standUid();
  if (uid === null) {
    say('❌ не найден пользователь стенда — поднят ли `npm run stand`?');
    process.exit(1);
  }

  const context = await browser.newContext({
    viewport: { width: WIDTH, height: 900 },
    locale: 'ru-RU',
    recordVideo: { dir: `${OUT}/video`, size: { width: WIDTH, height: 900 } },
  });
  await context.addInitScript(() => localStorage.setItem('ndim-theme', 'light'));
  const page = await context.newPage();

  if (!(await signIn(page))) {
    say('❌ не удалось войти');
    process.exit(1);
  }
  await page.goto(`${STAND}/dims`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('article.dim[data-dim]', { timeout: 30000 });

  if (GESTURE !== null) {
    await page.addStyleTag({ content: `:root { --motion-gesture: ${GESTURE}ms !important; }` });
    say(`⚠️ длительность улёта переопределена на ${GESTURE} мс (только в этой вкладке)`);
  }

  const ids = await page.locator('article.dim[data-dim]').evaluateAll((els) =>
    els.slice(0, 2).map((el) => el.getAttribute('data-dim')),
  );
  const [leavingId, nextId] = ids;
  say(`уезжает: ${leavingId} · следом за ней: ${nextId}`);

  const card = `article.dim[data-dim="${leavingId}"]`;
  /*
   * ⚠️ КАРТОЧКА СТАВИТСЯ ЦЕЛИКОМ В ОКНО, И ЭТО НЕ КОСМЕТИКА.
   *
   * Первая редакция звала `scrollIntoViewIfNeeded()`, и карточка вставала верхом под шапку,
   * то есть частично ВЫШЕ окна. Тогда при её удалении срабатывает scroll anchoring: браузер
   * подкручивает страницу, чтобы видимое не прыгало, и `top` соседа не меняется ВООБЩЕ —
   * трасса напечатала «сосед поднялся на −0.19px за 1150 мс» и объявила, что мерить нечего.
   * Это была ложь прибора, а не поведение продукта: владелец смотрит на карточку, целиком
   * лежащую в окне. Поэтому позиция задаётся явно, а прокрутка пишется в трассу — чтобы
   * подмена «сосед не двигался» / «страница подкрутилась» больше не могла пройти незамеченной.
   */
  await page.locator(card).evaluate((el) => {
    window.scrollTo({ top: el.offsetTop - 220, behavior: 'instant' });
  });
  await page.waitForTimeout(400);

  // Выбираем звезду — появляются ряд смайликов и строка отсчёта.
  await page.locator(`${card} .stars .st[aria-label="6"]`).click();
  await page.waitForTimeout(700);

  /*
   * Трасса пишет ОБЕ карточки на КАЖДОМ кадре. Отсчёт стартует до клика по «Сохранить
   * сейчас», а нулём времени считается первый кадр, где уезжающая реально сдвинулась —
   * иначе в замер попадут клик и запись в Firestore (ожог EXP-0082, он уже стоил этому
   * багу одного ложного «1666 мс при заведомых 640»).
   */
  await page.evaluate(([leaving, next]) => {
    window.__ft = { rows: [] };
    const t0 = performance.now();
    const shiftX = (el) => {
      const tr = getComputedStyle(el).transform;
      if (!tr || tr === 'none') return 0;
      const nums = tr.slice(tr.indexOf('(') + 1, -1).split(',').map(Number);
      return nums.length === 6 ? nums[4] : (nums[12] ?? 0);
    };
    const step = () => {
      const a = document.querySelector(`article.dim[data-dim="${leaving}"]`);
      const b = document.querySelector(`article.dim[data-dim="${next}"]`);
      const now = Math.round(performance.now() - t0);
      const rb = b ? b.getBoundingClientRect() : null;
      if (!a) {
        if (rb) {
          window.__ft.rows.push({
            t: now, gone: true, y: Math.round(window.scrollY),
            nextTop: Math.round(rb.top + window.scrollY), nextLeft: Math.round(rb.left),
          });
        }
        if (now < 4000) requestAnimationFrame(step);
        return;
      }
      const ra = a.getBoundingClientRect();
      const inner = (sel) => {
        const n = a.querySelector(sel);
        return n ? Math.round(n.getBoundingClientRect().height) : 0;
      };
      window.__ft.rows.push({
        t: now,
        x: Math.round(shiftX(a)),
        h: Math.round(ra.height),
        o: Number(Number(getComputedStyle(a).opacity).toFixed(2)),
        faces: inner('.faces'),
        cd: inner('.countdown'),
        y: Math.round(window.scrollY),
        // В ДОКУМЕНТЕ, а не в окне: при удалении карточки браузер подкручивает страницу
        // (scroll anchoring), и оконная координата врёт в обе стороны.
        nextTop: rb ? Math.round(rb.top + window.scrollY) : null,
        nextLeft: rb ? Math.round(rb.left) : null,
      });
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [leavingId, nextId]);

  await page.locator(`${card} .countdown .now`).click();
  await page.waitForTimeout((GESTURE ?? 1200) + 1800);

  const rows = (await page.evaluate(() => window.__ft.rows)).filter((r) => r.nextTop !== null);
  await dropRating(uid, leavingId);

  if (rows.length === 0) {
    say('❌ трасса пуста — мерить нечем');
  } else {
    // Нуль времени — первый кадр, где карточка ПОШЛА (сдвиг > 2px).
    const startIdx = rows.findIndex((r) => (r.x ?? 0) > 2);
    const start = startIdx === -1 ? rows[0] : rows[startIdx];
    const goneRow = rows.find((r) => r.gone);
    const lastSeen = [...rows].reverse().find((r) => !r.gone && r.x !== undefined);
    const peak = Math.max(...rows.map((r) => r.x ?? 0));

    /*
     * ⚠️ ОСЬ ДВИЖЕНИЯ СОСЕДА ОПРЕДЕЛЯЕТСЯ ЗАМЕРОМ, А НЕ ДОПУЩЕНИЕМ.
     *
     * На 1440px лента идёт В ДВЕ КОЛОНКИ, и сосед занимает освободившееся место, уезжая
     * ВЛЕВО, а не вверх. Редакция, следившая только за `top`, напечатала «сосед поднялся на
     * 0px» и второй раз объявила, что мерить нечего, — при том что сосед двигался всё это
     * время. Поэтому берётся та ось, по которой смещение больше.
     */
    const move = (r) => ({ top: r.nextTop, left: r.nextLeft });
    const dTop = move(rows[0]).top - move(rows.at(-1)).top;
    const dLeft = move(rows[0]).left - move(rows.at(-1)).left;
    const axis = Math.abs(dTop) >= Math.abs(dLeft) ? 'nextTop' : 'nextLeft';
    const axisName = axis === 'nextTop' ? 'вверх' : 'влево';
    const first = rows[0][axis];
    const last = rows.at(-1)[axis];
    const rise = first - last;

    const scrolled = Math.abs((rows.at(-1).y ?? 0) - (rows[0].y ?? 0));
    say('');
    if (scrolled > 2) {
      say(`⚠️ страница подкрутилась на ${scrolled}px за трассу (scroll anchoring) — числа ниже`);
      say('   описывают не только движение карточек. Замер нужно переснять.');
    }
    say(`ряд смайликов: ${rows[0].faces}px → 0 · строка отсчёта: ${rows[0].cd}px → 0`);
    say(`высота уезжающей карточки: ${rows[0].h}px в начале → ${lastSeen?.h ?? '?'}px перед уходом`);
    say(`сосед занимает место, двигаясь ${axisName}: ${first} → ${last} (сместился на ${rise}px)`);
    say(`уезжающая: путь до ${peak}px, исчезла на ${goneRow ? goneRow.t - start.t : '?'} мс от старта движения`);

    if (rise > 20) {
      /*
       * ⚠️ ПОРОГ 10px, А НЕ 2px, И ЭТО НЕ ПРИДИРКА.
       *
       * При укорачивании карточки (ряд смайликов и строка отсчёта уходят) лента
       * переверстывается, и сосед дрожит на 2px, никуда не уезжая. Редакция с порогом 2px
       * приняла это дрожание за начало движения и печатала «сосед тронулся на 47 мс РАНЬШЕ
       * улёта» уже на ПОЧИНЕННОМ коде. Настоящий путь здесь — сотни пикселей, так что порог
       * заведомо выше дрожания и заведомо ниже пути.
       */
      const JITTER = 10;
      const at = (row) => (row ? row.t - start.t : null);
      const goneAt = at(goneRow);
      const startAt = at(rows.find((r) => Math.abs(r[axis] - first) > JITTER));
      const halfAt = at(rows.find((r) => r[axis] <= first - rise / 2));

      say('');
      say(`◆ уезжающая исчезла на ${goneAt ?? '?'} мс`);
      say(`  сосед тронулся на ${startAt ?? '?'} мс, половину пути прошёл на ${halfAt ?? '?'} мс`);

      /*
       * Судим по ВРЕМЕНИ, а не по доле пути уезжающей: когда карточка уже удалена, её сдвиг
       * равен нулю, и «0% пути» читалось бы как провал на исправном коде. Допуск в один кадр
       * (16 мс) — на то, что трасса дискретна.
       */
      const FRAME = 16;
      const ok = startAt !== null && goneAt !== null && startAt >= goneAt - FRAME;
      say(
        ok
          ? '  ⇒ соседи ДОЖИДАЮТСЯ ухода.'
          : '  ⇒ ДЕФЕКТ: соседи занимают место, не дожидаясь ухода.',
      );
      if (!ok && startAt !== null) {
        const atX = rows.find((r) => Math.abs(r[axis] - first) > JITTER)?.x ?? 0;
        say(`     в этот момент уезжающая прошла ${atX}px из ${peak} — ${Math.round((atX / peak) * 100)}% пути`);
      }
    } else {
      say('');
      say('◆ сосед за время трассы почти не двигался — мерить долю пути нечем.');
      say('  ⚠️ это подозрительно: проверь, что сосед вообще стоит на месте уезжающей.');
    }

    if (TRACE) {
      say('');
      say('трасса [мс : сдвиг X : высота : смайлы : отсчёт : непрозр : top соседа : left соседа]');
      for (const r of rows) {
        const blank = '    ';
        say(
          `  ${String(r.t - start.t).padStart(5)} : ${r.gone ? 'УШЛА' : String(r.x).padStart(4)}` +
            ` : ${r.gone ? blank : String(r.h).padStart(4)} : ${r.gone ? blank : String(r.faces).padStart(4)}` +
            ` : ${r.gone ? blank : String(r.cd).padStart(4)} : ${r.gone ? blank : String(r.o).padStart(4)}` +
            ` : ${String(r.nextTop).padStart(5)} : ${String(r.nextLeft).padStart(5)}`,
        );
      }
    }
  }

  await context.close();
} finally {
  await browser.close();
  await writeFile(`${OUT}/report.txt`, lines.join('\n'), 'utf8');
  console.log(`\nотчёт: ${OUT}/report.txt · видео: ${OUT}/video/`);
}

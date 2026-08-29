/**
 * СТРАЖ — КАРТОЧКА ТЕСТА НЕ МЕНЯЕТ ВИД, ПОКА СОХРАНЯЕТСЯ (близнец `bugs/172`).
 *
 * Родня и лекало: `tools/verify-bug172.mjs` (тот же класс на экране «Измерения»). Судит те же
 * ЧЕТЫРЕ вещи, названные владельцем, и тем же способом — покадровой rAF-трассой против
 * контрольного снимка. Общее с роднёй: адреса стенда (`lib/stand-addresses.mjs`) и дисциплина
 * «критерий объявлен до замера · контроль прибора первым · мутация с названными адресатами».
 *
 * 🔴 ЧЕМ ТЕРРИТОРИЯ ОТЛИЧАЕТСЯ ОТ РОДНИ — три вещи, и все три меняют устройство прибора:
 *   1. **Вход не нужен.** Первая оценка молча рождает гостя (`test-engine.ts` → `signInGuest`),
 *      поэтому прибор НЕ логинится: он приходит как человек из поиска, и это и есть путь,
 *      который проверяется.
 *   2. **Карточка не улетает.** Вместо отъезда `current` уходит к следующему объекту, и
 *      `{#key current.id}` подменяет узел. Значит окно суда кончается не исчезновением
 *      карточки, а СМЕНОЙ ИМЕНИ объекта — по нему и опознаём границу.
 *   3. **Убирать за собой нечем через продукт.** Оценку ставит ГОСТЬ, рождённый прогоном; его
 *      документы чистятся прямо в эмуляторе по uid, взятому у самой страницы.
 *
 * ЧТО МЕРИТСЯ, кадр за кадром (то же, что у родни):
 *   · lit   — сколько звёзд горит (`.qcard .starsrow .st.fill`);
 *   · peak  — есть ли выделение выбранной (`.st.peak` / `.st.zero`);
 *   · faces — высота ряда смайликов (`.qcard .faces`), 0 = ряда нет;
 *   · save  — есть ли кнопка сохранения (`.qcard .countdown .now`) и какой на ней текст;
 *   · name  — имя объекта: по его смене видно, что карточка сменилась.
 *
 * 🔴 КРИТЕРИЙ ДЕФЕКТА ОБЪЯВЛЕН ДО ЗАМЕРА. Окно суда — от выбранной звезды до кадра, где имя
 * объекта СМЕНИЛОСЬ; эталон — контрольный снимок при живом отсчёте. Внутри окна:
 *   lit не убывает · peak не пропадает · faces не обнуляется · кнопка не исчезает.
 * Смена ТЕКСТА кнопки нарушением не считается — владелец разрешил её явно.
 *
 * ⚠️ КОНТРОЛЬ ПРИБОРА ПЕРВЫМ (`EXP-0070`/`EXP-0082`): до нуля отсчёта на карточке ОБЯЗАНЫ быть
 * горящие звёзды, ряд смайликов и кнопка. Нет — мерить нечего, и «нарушений нет» было бы ложным
 * зелёным; прогон падает, не дойдя до суда. Ровно этот контроль поймал ложный эталон у родни.
 *
 * ⚠️ ОТСЧЁТ ДОВОДИТСЯ ДО НУЛЯ ЕСТЕСТВЕННО: кнопкой «Сохранить сейчас» жест не подменяется —
 * у ручного пути другая точка входа в `commit()`.
 *
 * ДОКАЗАН МУТАЦИЕЙ ДВАЖДЫ — снятием самой починки, адресаты названы ДО прогона:
 *   · 2026-08-22 (dev-1): покраснели ДВЕ проверки из четырёх в обеих конфигурациях —
 *     звёзды 8 → 0 и выделение 1 → 0 на +0 мс от нуля отсчёта (10 и 8 кадров);
 *   · 2026-08-29 (Дизайнер, слот 1): покраснели ТРИ — те же две плюс ряд смайликов 22px → 0
 *     на +182 мс (3 кадра). Разница не в починке, а в длине окна: 215 мс против ~100 мс.
 * 🔑 **Две другие не покраснели, и это свойство ТЕРРИТОРИИ, а не слабость починки:** ряд
 * смайликов и строка сохранения уезжают переходом `slide` за 240 мс, а объект сменяется
 * раньше — окно кончается первым. Прибор печатает длину окна и предупреждает об этом сам, чтобы
 * их зелёный никто не принял за доказанный. На «Измерениях», где карточка летит 700 мс, те же
 * четыре проверки краснеют все.
 *
 * Требует поднятый стенд своего слота (`npm run stand`). Адреса — из окружения, умолчания слот 0.
 * Запуск: node tools/verify-test-card-face.mjs [--theme light|dark] [--width 1440]
 *                                              [--slug love] [--label ДО-light-1440] [--trace]
 * Выход:  test-results/test-card-face/<метка>/ (video/ + report.txt + кадры) · код 0/1.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { standAddresses, addressesLine } from './lib/stand-addresses.mjs';

const АДРЕСА = standAddresses();
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const TRACE = process.argv.includes('--trace');
const THEME = arg('--theme', 'light');
const WIDTH = Number(arg('--width', '1440'));
const SLUG = arg('--slug', 'love');
const LABEL = arg('--label', `${THEME}-${WIDTH}`);
const OUT = `test-results/test-card-face/${LABEL}`;
const БАЗА = arg('--base', АДРЕСА.app);

/** Звезда жеста: не 0 и не 10 — «горит ровно столько, сколько выбрано» проверяемо. */
const STAR = 7;

const lines = [];
const say = (t = '') => {
  console.log(t);
  lines.push(t);
};

let verdictFailed = false;

/** Уборка: гость, рождённый прогоном, и его оценки удаляются прямо в эмуляторе. */
async function убратьГостя(uid) {
  if (!uid) return { removed: false, why: 'uid не получен' };
  const базаURL = `${АДРЕСА.firestore}/v1/projects/${АДРЕСА.project}/databases/(default)/documents`;
  // Оценки гостя: подколлекция `dims` его точки.
  const список = await fetch(`${базаURL}/points/${uid}/dims`, {
    headers: { Authorization: 'Bearer owner' },
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  for (const d of список?.documents ?? []) {
    // `d.name` — полный путь вида `projects/…/documents/points/UID/dims/DIMID`; берём хвост
    // после `/documents/` и приставляем к адресу базы.
    const хвост = String(d.name).split('/documents/')[1];
    if (!хвост) continue;
    await fetch(`${базаURL}/${хвост}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer owner' },
    }).catch(() => {});
  }
  for (const путь of [`points/${uid}`, `users/${uid}`]) {
    await fetch(`${базаURL}/${путь}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } })
      .catch(() => {});
  }
  const остались = await fetch(`${базаURL}/points/${uid}/dims`, {
    headers: { Authorization: 'Bearer owner' },
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return { removed: !(остались?.documents?.length > 0), why: '' };
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

try {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: 900 },
    locale: 'ru-RU',
    recordVideo: { dir: `${OUT}/video`, size: { width: WIDTH, height: 900 } },
  });
  await context.addInitScript((t) => localStorage.setItem('ndim-theme', t), THEME);
  const page = await context.newPage();

  say('═══ СТРАЖ ВИДА КАРТОЧКИ ТЕСТА (близнец bugs/172) ═══');
  say(addressesLine(АДРЕСА));
  say(`страница: ${БАЗА}/ru/test/${SLUG} · тема ${THEME} · ширина ${WIDTH}`);

  await page.goto(`${БАЗА}/ru/test/${SLUG}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.qcard .starsrow .st', { timeout: 30000 });

  const applied = await page.evaluate(() => document.documentElement.dataset.theme ?? '(нет)');
  say(`тема применена: «${applied}»`);
  if (applied !== THEME) {
    say('❌ тема НЕ применилась — прогон мерил бы не то, что заявляет.');
    process.exit(1);
  }

  const имяДо = await page.locator('.qcard .name').innerText();
  say(`объект в работе: «${имяДо.trim()}»`);

  await page.locator('.qcard').evaluate((el) => {
    window.scrollTo({ top: el.offsetTop - 160, behavior: 'instant' });
  });
  await page.waitForTimeout(300);

  /*
   * 🔴 ЖДЁМ ГИДРАТАЦИИ ПЕРЕД ЖЕСТОМ, И ЭТО ОПЛАЧЕНО ПЕРВЫМ ЖЕ ПРОГОНОМ.
   *
   * Звёзды приезжают в СЫРОМ HTML (страница пререндерена), поэтому `waitForSelector` по кнопке
   * проходит мгновенно — а обработчик на ней появляется только с гидратацией. Клик до неё
   * попадает по мёртвой кнопке и НЕ ДЕЛАЕТ НИЧЕГО: ни ошибки, ни следа. Первый прогон так и
   * прошёл — контроль прибора честно покраснел «мерить нечего», и это оказалось единственным
   * признаком; замер потом показал, что при ожидании 2 с тот же клик отрабатывает.
   *
   * Признак готовности взят у самого SvelteKit — `#svelte-announcer` он создаёт при старте
   * клиента (замер: появляется через ~187 мс). Ждать «подольше» вместо признака нельзя: это
   * лотерея, которая когда-нибудь проиграет на медленной машине.
   */
  await page.waitForSelector('#svelte-announcer', { timeout: 15000 });

  // Жест: ставим звезду — появляются ряд смайликов и строка отсчёта.
  await page.locator(`.qcard .starsrow .st[aria-label="${STAR}"]`).click();
  /*
   * Клик САМОПРОВЕРЯЕМ: строка отсчёта обязана появиться. Если её нет — это либо клик по
   * мёртвой кнопке, либо настоящий дефект жеста, и в обоих случаях молчать нельзя.
   * ⚠️ Повторный клик по той же звезде здесь запрещён: по канону 1.x он ОТМЕНЯЕТ отсчёт
   * (`bugs/54`), то есть «починил бы» опыт, уничтожив его предмет.
   */
  const отсчётПоявился = await page
    .waitForSelector('.qcard .countdown', { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!отсчётПоявился) {
    say('❌ после клика по звезде строка отсчёта не появилась за 5 с.');
    say('   Либо клик пришёлся по ещё не гидратированной кнопке, либо сломан сам жест.');
    process.exit(1);
  }
  await page.waitForTimeout(400);

  /* ── КОНТРОЛЬ ПРИБОРА: до нуля отсчёта картинка ОБЯЗАНА быть непустой ─────────────── */
  const before = await page.locator('.qcard').evaluate((el) => ({
    lit: el.querySelectorAll('.starsrow .st.fill').length,
    peak: el.querySelectorAll('.starsrow .st.peak, .starsrow .st.zero').length,
    faces: Math.round(el.querySelector('.faces')?.getBoundingClientRect().height ?? 0),
    save: el.querySelector('.countdown .now')?.textContent?.trim() ?? null,
  }));
  say('');
  say('контроль прибора (до нуля отсчёта):');
  say(`  горит звёзд ${before.lit} · выделение ${before.peak} · смайлики ${before.faces}px · кнопка «${before.save ?? '—'}»`);
  if (before.lit === 0 || before.peak === 0 || before.faces === 0 || before.save === null) {
    say('❌ КОНТРОЛЬ НЕ ПРОЙДЕН: до отсчёта на карточке нет того, чему полагается исчезать.');
    say('   Вердикт «нарушений нет» был бы ложным зелёным — мерить нечего.');
    process.exit(1);
  }
  await page.screenshot({ path: `${OUT}/01-до-нуля-отсчёта.png` });

  /* ── ТРАССА ───────────────────────────────────────────────────────────────────────── */
  await page.evaluate(() => {
    window.__tcf = { rows: [] };
    const t0 = performance.now();
    const step = () => {
      const el = document.querySelector('.qcard');
      const t = Math.round(performance.now() - t0);
      if (!el) {
        window.__tcf.rows.push({ t, gone: true });
        if (t < 9000) requestAnimationFrame(step);
        return;
      }
      const cd = el.querySelector('.countdown');
      window.__tcf.rows.push({
        t,
        lit: el.querySelectorAll('.starsrow .st.fill').length,
        peak: el.querySelectorAll('.starsrow .st.peak, .starsrow .st.zero').length,
        faces: Math.round(el.querySelector('.faces')?.getBoundingClientRect().height ?? 0),
        save: el.querySelector('.countdown .now')?.textContent?.trim() ?? null,
        cd: cd ? Math.round(cd.getBoundingClientRect().height) : 0,
        name: el.querySelector('.name')?.textContent?.trim() ?? '',
      });
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  // Ждём естественный ноль отсчёта (5 с) + смену объекта + запас.
  await page.waitForTimeout(5000 + 2500);
  const rows = await page.evaluate(() => window.__tcf.rows);
  await page.screenshot({ path: `${OUT}/03-после-смены-объекта.png` });

  /* ── УБОРКА и её проверка ──────────────────────────────────────────────────────────── */
  /*
   * 🔴 UID ГОСТЯ ЖИВЁТ В IndexedDB, А НЕ В `localStorage`, и это капкан, уже описанный в проекте
   * (`STATUS.md`, набор Smoke: «Сессия читается из IndexedDB — в `localStorage` её нет»).
   * Первая редакция искала ключ `firebase:authUser:` в `localStorage`, не находила и печатала
   * «убирать нечего» — то есть прибор оставлял в базе стенда живого гостя с настоящей оценкой,
   * сообщая об этом мягкой строкой. База стенда общая для всех стражей (правило класса
   * `bugs/103`), и такой след — чужие ложные регрессии завтра.
   */
  const uid = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('firebaseLocalStorageDb');
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('firebaseLocalStorage')) return resolve(null);
          const all = db.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
          all.onerror = () => resolve(null);
          all.onsuccess = () => {
            const запись = (all.result ?? []).find((e) => String(e?.fbase_key ?? '').startsWith('firebase:authUser:'));
            resolve(запись?.value?.uid ?? null);
          };
        };
        setTimeout(() => resolve(null), 3000);
      }),
  );
  const уборка = await убратьГостя(uid);
  say('');
  if (!uid) {
    /*
     * Не нашли uid — значит НЕ УБРАЛИ, а не «убирать нечего»: оценку прогон точно поставил
     * (это доказал контроль прибора). Мягкая формулировка здесь была бы враньём, поэтому
     * прогон краснеет: след в общей базе стенда дороже одного вердикта.
     */
    say('❌ uid гостя не найден — СЛЕД ОСТАЛСЯ В БАЗЕ СТЕНДА, убрать нечем.');
    say('   Оценка прогоном точно поставлена (контроль прибора это доказал), значит это не');
    say('   «убирать нечего», а несостоявшаяся уборка. База стенда общая (правило `bugs/103`).');
    verdictFailed = true;
  } else {
    say(`гость прогона: ${uid} · след ${уборка.removed ? 'убран' : '⚠️ НЕ убран'}`);
    if (!уборка.removed) verdictFailed = true;
  }

  /* ── СУД ───────────────────────────────────────────────────────────────────────────── */
  const живые = rows.filter((r) => !r.gone);
  if (живые.length === 0) {
    say('❌ трасса пуста — мерить нечем');
    verdictFailed = true;
  } else {
    const base = before;
    const сменаIdx = живые.findIndex((r) => r.name && r.name !== имяДо.trim());
    const окно = сменаIdx === -1 ? живые : живые.slice(0, сменаIdx + 1);
    const departed = (r) =>
      r.lit !== base.lit || r.peak !== base.peak || r.faces === 0 || r.save !== base.save;
    const нольIdx = Math.max(0, окно.findIndex(departed));
    const нольT = окно[нольIdx]?.t ?? 0;

    say('');
    say(
      `окно суда: ${окно[0].t} → ${окно.at(-1).t} мс (${окно.length} кадров); ` +
        (сменаIdx === -1
          ? '⚠️ объект за трассу НЕ сменился — окно оборвано концом трассы'
          : `объект сменился на «${окно.at(-1).name}»`),
    );
    say(`эталон (контрольный снимок): звёзд ${base.lit} · выделение ${base.peak} · смайлики ${base.faces}px · кнопка «${base.save}»`);

    const bad = {
      lit: окно.filter((r) => r.lit < base.lit && r.name === имяДо.trim()),
      peak: окно.filter((r) => r.peak < base.peak && r.name === имяДо.trim()),
      faces: окно.filter((r) => r.faces === 0 && r.name === имяДо.trim()),
      save: окно.filter((r) => r.save === null && r.name === имяДо.trim()),
    };
    const отчёт = [
      ['выставленные звёзды гаснут', bad.lit, (r) => `${r.lit} вместо ${base.lit}`],
      ['выделение снимается', bad.peak, () => 'нет'],
      ['ряд смайликов исчезает', bad.faces, () => '0px'],
      ['кнопка сохранения исчезает', bad.save, () => 'нет'],
    ];
    say('');
    for (const [имя, hits, показать] of отчёт) {
      if (hits.length === 0) {
        say(`  ✅ ${имя} — ни на одном кадре`);
      } else {
        verdictFailed = true;
        const f = hits[0];
        say(
          `  ❌ ${имя} — на ${hits.length} кадрах из ${окно.length}; впервые на ${f.t} мс ` +
            `(${f.t - нольT >= 0 ? '+' : ''}${f.t - нольT} мс от нуля отсчёта), стало: ${показать(f)}`,
        );
      }
    }
    const сменаТекста = окно.find((r) => r.save !== null && r.save !== base.save);
    if (сменаТекста) {
      say(`  ℹ️ текст кнопки менялся: «${base.save}» → «${сменаТекста.save}» — владельцем РАЗРЕШЕНО`);
    }

    /*
     * 🔴 ЧЕСТНОСТЬ ЗЕЛЁНОГО: НЕ ВСЕ ЧЕТЫРЕ ПРОВЕРКИ ЗДЕСЬ РАВНОСИЛЬНЫ, и это свойство территории,
     * а не прибора. Звёзды и выделение гаснут мгновенно, а ряд смайликов и строка сохранения
     * уезжают переходом `slide` за 240 мс — и объект успевает СМЕНИТЬСЯ раньше, чем они исчезнут.
     * То есть на сломанном коде две последние проверки не краснеют не потому, что там всё цело,
     * а потому, что окно кончается первым.
     *
     * 🔑 СКОЛЬКО ИМЕННО КРАСНЕЕТ — ЗАВИСИТ ОТ ОКНА, А НЕ ОТ КОДА, и это замерено дважды:
     *   · 2026-08-22 (dev-1, окно ~100 мс): покраснели ДВЕ — звёзды и выделение;
     *   · 2026-08-29 (Дизайнер, окно 215 мс): покраснели ТРИ — те же две плюс ряд смайликов
     *     (22px → 0 на +182 мс от нуля отсчёта, 3 кадра).
     * Поэтому число доказанных проверок печатается НЕ константой: строка ниже считает его от
     * длины окна ЭТОГО прогона. Константа «ДВЕ» была верна для своего замера и стала бы тихой
     * неправдой на первом же прогоне подлиннее.
     *
     * Печатаем длину окна после нуля отсчёта: пока она меньше длительности `slide`, зелёный этих
     * двух проверок доказывает только то, что карточку не обстригли МГНОВЕННО. Класс `EXP-0070`
     * — названо, а не замолчано.
     */
    const послеНуля = окно.filter((r) => r.t >= нольT && r.name === имяДо.trim());
    const хвостМс = послеНуля.length ? послеНуля.at(-1).t - нольT : 0;
    say('');
    say(
      `окно после нуля отсчёта: ${послеНуля.length} кадров (${хвостМс} мс) до смены объекта. ` +
        (хвостМс < 240
          ? '⚠️ Это КОРОЧЕ перехода `slide` (240 мс): проверки «ряд смайликов» и «кнопка» ' +
            'на этой территории покраснеть не успевают — их зелёный доказывает лишь отсутствие ' +
            'мгновенной обрезки. Мутацией доказаны ' +
            (хвостМс >= 182
              ? 'ТРИ проверки из четырёх (звёзды, выделение и ряд смайликов): окна этой длины ' +
                'хватило смайликам, чтобы уехать, — замер 2026-08-29.'
              : 'ДВЕ проверки из четырёх (звёзды и выделение).')
          : 'Этого хватает, чтобы все четыре проверки были содержательны.'),
    );
    say('');
    say(
      verdictFailed
        ? '⇒ ДЕФЕКТ ВОСПРОИЗВЕДЁН: карточка теста меняет вид, пока сохраняется.'
        : '⇒ карточка вид не меняет: ожидание владельца выполнено.',
    );

    if (TRACE) {
      say('');
      say('трасса [мс : звёзд : выдел : смайл : отсчёт : кнопка : объект]');
      for (const r of окно.filter((x) => x.t >= нольT - 400)) {
        say(
          `  ${String(r.t).padStart(5)} : ${String(r.lit).padStart(5)} : ${String(r.peak).padStart(5)} : ` +
            `${String(r.faces).padStart(5)} : ${String(r.cd).padStart(5)} : ${(r.save ?? '—').padEnd(18)} : ${r.name}`,
        );
      }
    }
  }

  await context.close();
} finally {
  await browser.close();
  await writeFile(`${OUT}/report.txt`, lines.join('\n'), 'utf8');
  console.log(`\nотчёт: ${OUT}/report.txt`);
}

process.exit(verdictFailed ? 1 : 0);

/**
 * Ручной функциональный прогон «Тест на совместимость» V4 + пул и случайная дюжина (№098) — набор
 * `qa/suites/compat-test-v4.md`. Не прибор проекта — машинерия прохода; кадры читаются глазами после.
 *
 * Запуск (из корня репозитория): node qa/reports/2026-09-26_compat-test-v4.driver.mjs
 *   --base <адрес: сборка под vite preview или https://ndim-stage.web.app> --out <каталог кадров>
 *   [--phase all|pair|dozens|prerender|shots]
 * ⚠️ Фаза `pair` пишет в базу контура: два анонимных гостя, их оценки и документ пары (не убираются).
 *
 * История: написан 2026-09-25 во временной папке сессии (прогон стенда 89/0,
 * `qa/reports/2026-09-26_compat-test-v4.md`); перенесён сюда 2026-09-26, чтобы проход был воспроизводим.
 * При переносе поправлены две проверки, отставшие от продукта: форма кода набора после метки пула
 * (`2869bbd`: `set=<метка>.<номера>`) и вид карточки без JS после «первая карточка видна» (`b777e09`).
 */
import { chromium } from '@playwright/test';
// Размер пула — из кода продукта, а не числом в сценарии: пул менялся (20 → 24, №100 В2).
import { POOL_SIZE as POOL } from '../../src/lib/content/test-set.ts';
import { mkdirSync, writeFileSync } from 'node:fs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const BASE = arg('--base', 'http://localhost:4195');
const OUT = arg('--out', 'test-results/compat-v4');
const PHASE = arg('--phase', 'all');
mkdirSync(OUT, { recursive: true });

let pass = 0;
const fails = [];
const log = [];
function check(ok, name, detail = '') {
  if (ok) pass++;
  else fails.push(`${name}${detail ? ' — ' + detail : ''}`);
  const line = `  ${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`;
  console.log(line);
  log.push(line);
}
const note = (s) => { console.log(s); log.push(s); };

const door = (url) => {
  const u = new URL(url);
  const here = new URL(BASE);
  u.protocol = here.protocol;
  u.host = here.host;
  u.searchParams.set('as', 'guest');
  return u.toString();
};

const browser = await chromium.launch();

async function newCtx(label, { width = 1440, theme = 'light', js = true } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 500 ? 844 : 900 },
    locale: 'ru-RU',
    javaScriptEnabled: js,
  });
  await ctx.addInitScript((t) => {
    try { sessionStorage.setItem('ndim-probe', '1'); } catch { /**/ }
    try { localStorage.setItem('ndim-theme', t); } catch { /**/ }
  }, theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/Could not reach Cloud Firestore backend|offline mode|code=unavailable/i.test(m.text())) return;
    errors.push(m.text());
  });
  return { label, ctx, page, errors };
}

const alive = (page) => page.locator('.qcard:not(.asleep) .name').first().waitFor({ state: 'visible', timeout: 20000 });
const cardName = async (page) => (await page.locator('.qcard .name').first().innerText()).trim();
const cardLabel = async (page) => {
  const name = (await page.locator('.qcard .name').first().innerText()).trim();
  const kind = (await page.locator('.qcard .kind').first().innerText()).trim();
  const meta = (await page.locator('.qcard .meta').first().innerText()).trim();
  return `${name} [${kind} ${meta.split('·')[0].trim()}]`;
};

async function settle(page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming?.().iterations === Infinity), null, { timeout: 8000 }).catch(() => {});
}

/** Ставит звёзды карточке за карточкой до цели; возвращает имена оценённых карточек (как на карточке). */
async function rateAll(g, values, max = 40) {
  const names = [];
  for (let i = 0; i < max; i++) {
    const stars = g.page.locator('.qcard .starsrow .st');
    if ((await stars.count()) === 0) break;
    const before = await g.page.locator('.mirror .rows li').count();
    const nm = await cardLabel(g.page);
    await stars.nth(values[i % values.length]).click();
    const now = g.page.locator('.qcard .countdown .now:not(.done)');
    await now.waitFor({ state: 'visible', timeout: 15000 });
    await now.click();
    await g.page.waitForFunction((n) => document.querySelectorAll('.mirror .rows li').length > n, before, { timeout: 30000 });
    names.push(nm);
    const prog = (await g.page.locator('.mirror .progress').innerText().catch(() => '')).match(/(\d+)\D+(\d+)/);
    if (prog && Number(prog[1]) >= Number(prog[2])) break;
  }
  return names;
}

/** Пропусками «Не знаю» читает очередь попытки целиком (ничего не пишет в базу). */
async function readQueueBySkipping(page, limit = 25) {
  const names = [];
  for (let i = 0; i < limit; i++) {
    if ((await page.locator('.qcard .name').count()) === 0) break;
    names.push(await cardLabel(page));
    await page.locator('.qcard .skip').click();
    await page.waitForTimeout(120);
  }
  return names;
}

const hp = (arr) => arr.filter((n) => /Гарри Поттер|Harry Potter/.test(n)).length;
const hasSex = (arr) => arr.some((n) => /^Секс\b|^Sex\b/.test(n));
// Вещи, которых может не знать типовой американец (№100 В2): прежние пять фильмов СССР и России пула.
const localOnly = (arr) => arr.filter((n) => /Мимино|Ирония судьбы|Брат 2|Операция «Ы»|Иван Васильевич|Mimino|Irony of Fate|Brother 2|Operation|Ivan Vasilievich/.test(n));

const overflowX = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

try {
  if (PHASE === 'all' || PHASE === 'pair') {
    // ═══ ПЕРВЫЙ ═══
    note(`\n▶ ПЕРВЫЙ (А) · ${BASE}/ru/test/compatibility · 1440 · светлая`);
    const a = await newCtx('A');
    await a.page.goto(door(`${BASE}/ru/test/compatibility`), { waitUntil: 'networkidle' });
    await alive(a.page);
    check(await a.page.locator('h1').innerText() === 'Тест на совместимость', 'А · H1 «Тест на совместимость»');
    const namesA = await rateAll(a, [8, 10, 6, 9, 7, 10, 5, 3, 9, 8, 10, 6]);
    note(`  · А оценил (${namesA.length}): ${namesA.join(' | ')}`);
    check(namesA.length === 12, 'А · дюжина оценена целиком', `${namesA.length}`);
    check(new Set(namesA).size === namesA.length, 'А · в дюжине 12 разных вещей');
    check(!hasSex(namesA), 'А · 🔑 в дюжине нет «Секса»');
    check(hp(namesA) <= 1, 'А · 🔑 в дюжине не больше одного «Гарри Поттера»', `${hp(namesA)}`);
    await settle(a.page);
    await a.page.screenshot({ path: `${OUT}/A-filled-1440.png`, fullPage: false });
    await a.page.locator('.invite .pairbtn').click();
    await a.page.locator('.invite .share code').waitFor({ state: 'visible', timeout: 30000 });
    const link = (await a.page.locator('.invite .share code').innerText()).trim();
    note(`  · личная ссылка: ${link}`);
    // Код набора: `<метка пула, 3 знака>.<номера вещей пула, по знаку на вещь>` (`poolMark`, `2869bbd`).
    check(/\?pair=[0-9a-f]{20,}&set=[0-9a-z]{3}\.[0-9a-z]{12}$/.test(link), 'А · ссылка несёт пару и код набора «метка.12 номеров»', link);
    await a.page.locator('.invite').screenshot({ path: `${OUT}/A-link.png` });
    const inviteText = await a.page.locator('.invite').innerText();
    check(inviteText.includes('Личная ссылка готова — отправьте её второму человеку:'), 'А · строка V4 «отправьте её второму человеку»');

    // ═══ ВТОРОЙ ═══
    note(`\n▶ ВТОРОЙ (Б) · по личной ссылке, без сессии`);
    const b = await newCtx('B', { width: 390 });
    await b.page.goto(door(link), { waitUntil: 'networkidle' });
    await alive(b.page);
    const firstB = await cardLabel(b.page);
    check(namesA.includes(firstB), 'Б · 🔑 ПЕРВАЯ карточка второго — из вещей первого (до чтения пары)', firstB);
    await b.page.screenshot({ path: `${OUT}/B-first-390.png` });
    const namesB = await rateAll(b, [8, 9, 6, 10, 7, 10, 4, 3, 10, 7, 9, 5]);
    note(`  · Б оценил (${namesB.length}): ${namesB.join(' | ')}`);
    const same = namesB.length === namesA.length && namesB.every((n) => namesA.includes(n));
    check(same, 'Б · 🔑 второй оценил РОВНО вещи первого', `Б ${namesB.length}, чужих ${namesB.filter((n) => !namesA.includes(n)).join(' | ')}`);
    check((await b.page.locator('.qcard .name').count()) === 0, 'Б · после 12 вещей первого очередь второго закончилась (своей дюжины нет)');
    const cmp = b.page.locator('.invite .pairbtn');
    check((await cmp.count()) > 0 && (await cmp.innerText()) === 'Сравнить ответы', 'Б · кнопка «Сравнить ответы»');
    await cmp.click();
    await b.page.locator('.result .unlink').waitFor({ state: 'visible', timeout: 30000 });
    await settle(b.page);
    const resB = await b.page.locator('.result').innerText();
    note(`  · результат Б: ${resB.replaceAll('\n', ' | ')}`);
    check(/Сравнили вещей: 12\.(?!\s*Никаких)/.test(resB), 'Б · «Сравнили вещей: 12.» без второй половины');
    check(!/процент|%|похож/i.test(resB), 'Б · в результате нет процентов и похожести');
    await b.page.locator('.result').screenshot({ path: `${OUT}/B-result-390.png` });

    // ═══ ПЕРВЫЙ — «Проверить» ═══
    await a.page.locator('.invite .checkbtn').click();
    await a.page.locator('.result .unlink').waitFor({ state: 'visible', timeout: 30000 });
    await settle(a.page);
    const resA = await a.page.locator('.result').innerText();
    note(`  · результат А: ${resA.replaceAll('\n', ' | ')}`);
    check(/Сравнили вещей: 12\./.test(resA), 'А · после «Проверить» видит результат пары');
    await a.page.locator('.result').screenshot({ path: `${OUT}/A-result-1440.png` });

    // ═══ Новый заход первого ═══
    // У вернувшегося с сессией живёт канал Firestore — «networkidle» не наступает; ждём загрузки и состояния.
    await a.page.goto(door(`${BASE}/ru/test/compatibility`), { waitUntil: 'load' });
    await alive(a.page).catch(() => {});
    await a.page.waitForFunction(() => document.querySelectorAll('.mirror .rows li').length >= 12, null, { timeout: 20000 }).catch(() => {});
    const rowsBack = await a.page.locator('.mirror .rows li').count();
    const cardBack = (await a.page.locator('.qcard .name').count()) > 0 ? await cardLabel(a.page) : '(очередь пуста)';
    note(`  · новый заход А: в анкете ${rowsBack} строк, карточка «${cardBack}»`);
    check(rowsBack === 12, 'А · новый заход: оценки попытки в анкете (12)');
    check(!namesA.includes(cardBack), 'А · новый заход: карточка — вещь пула, которую А ещё не оценивал', cardBack);
    for (const g of [a, b]) check(g.errors.length === 0, `${g.label} · консоль чиста за весь путь`, g.errors.slice(0, 3).join(' | '));
    await a.ctx.close();
    await b.ctx.close();
  }

  if (PHASE === 'all' || PHASE === 'dozens') {
    note('\n▶ ДЮЖИНЫ НОВЫХ ЗАХОДОВ (свежие контексты, только «Не знаю» — в базу ничего не пишется)');
    const dozens = [];
    for (let k = 0; k < 3; k++) {
      const g = await newCtx(`D${k}`);
      await g.page.goto(`${BASE}/ru/test/compatibility?as=none`, { waitUntil: 'networkidle' });
      await alive(g.page);
      const q = await readQueueBySkipping(g.page);
      note(`  · заход ${k + 1}: очередь ${q.length}; дюжина: ${q.slice(0, 12).join(' | ')}`);
      dozens.push(q);
      check(q.length === POOL, `заход ${k + 1} · очередь — весь пул (${POOL}), дюжина + запас ${POOL - 12}`, `${q.length}`);
      check(new Set(q).size === q.length, `заход ${k + 1} · вещи не повторяются`);
      check(!hasSex(q), `заход ${k + 1} · 🔑 в пуле нет «Секса»`);
      check(localOnly(q).length === 0, `заход ${k + 1} · 🔑 в пуле нет фильмов СССР и России (№100 В2)`, localOnly(q).join(' | '));
      check(hp(q) <= 1, `заход ${k + 1} · 🔑 не больше одного «Гарри Поттера» во всей очереди`, `${hp(q)}`);
      const drained = await g.page.locator('.qcard .drained').innerText().catch(() => '');
      check(drained.includes('Это всё'), `заход ${k + 1} · после запаса — «Это всё: очередь пройдена целиком»`);
      check(g.errors.length === 0, `заход ${k + 1} · консоль чиста`, g.errors.slice(0, 2).join(' | '));
      await g.ctx.close();
    }
    const keys = dozens.map((q) => q.slice(0, 12).sort().join(','));
    check(new Set(keys).size >= 2, '🔑 новый заход даёт другую дюжину', `${new Set(keys).size} разных из 3`);
    check(new Set(dozens.map((q) => q.slice().sort().join(','))).size === 1, 'пул один и тот же во всех заходах');
  }

  if (PHASE === 'all' || PHASE === 'prerender') {
    // С `b777e09` («первая карточка видна с первой отрисовки»): без JS видно ровно одно лицо — первая вещь
    // пула; прежнее ожидание «содержимое невидимо» описывало продукт до этой правки.
    note('\n▶ ПРЕРЕНДЕР БЕЗ JS — карточка держит место и показывает первую вещь пула');
    const g = await newCtx('noJS', { js: false });
    await g.page.goto(`${BASE}/ru/test/compatibility`, { waitUntil: 'load' });
    const faces = await g.page.$$eval('.qcard .pre', (els) =>
      els
        .filter((el) => el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== 'hidden')
        .map((el) => el.querySelector('.name')?.textContent?.trim() ?? ''),
    );
    const box = await g.page.locator('.qcard').boundingBox();
    check(faces.length === 1, 'без JS · видно ровно одно лицо карточки', `${faces.length}: ${faces.join(' | ')}`);
    check(faces[0] === 'Гарри Поттер и философский камень', 'без JS · это первая вещь пула', faces[0] ?? '');
    check((box?.height ?? 0) > 150, 'без JS · карточка держит место', `${box?.height}`);
    await g.page.screenshot({ path: `${OUT}/prerender-noJS-1440.png` });
    await g.ctx.close();
  }

  if (PHASE === 'all' || PHASE === 'shots') {
    note('\n▶ КАДРЫ 390/1440 × светлая/тёмная: первый экран · «Друзья по интересам» · вопросы (второй открыт)');
    for (const lang of ['ru', 'en']) {
      for (const width of [390, 1440]) {
        for (const theme of ['light', 'dark']) {
          if (lang === 'en' && theme === 'dark' && width === 1440) continue; // EN — по кадру на ширину и тему хватает трёх
          const g = await newCtx(`${lang}-${width}-${theme}`, { width, theme });
          await g.page.goto(`${BASE}/${lang}/test/compatibility?as=none`, { waitUntil: 'networkidle' });
          await alive(g.page);
          await settle(g.page);
          const tag = `${lang}-${width}-${theme}`;
          await g.page.screenshot({ path: `${OUT}/${tag}-1-first.png` });
          const after = g.page.locator('.keep.after');
          await after.scrollIntoViewIfNeeded();
          await settle(g.page);
          await after.screenshot({ path: `${OUT}/${tag}-2-friends.png` });
          const second = g.page.locator('.faq.v4 details').nth(1);
          await second.locator('summary').click();
          await g.page.waitForTimeout(600);
          const open = await g.page.locator('.faq.v4 details[open]').count();
          check(open >= 2, `${tag} · вопрос раскрылся (открыто ${open})`);
          await g.page.locator('.faq.v4').screenshot({ path: `${OUT}/${tag}-3-faq.png` });
          const ox = await overflowX(g.page);
          check(ox <= 0, `${tag} · нет горизонтального переполнения`, `${ox}px`);
          const faqCount = await g.page.locator('.faq.v4 details').count();
          check(faqCount === 9, `${tag} · девять частых вопросов`, `${faqCount}`);
          const rated = await g.page.locator('.keep.after .rated li').count();
          check(rated === POOL, `${tag} · «N человек» у ${POOL} вещей пула`, `${rated}`);
          const nums = await g.page.locator('.keep.after .nums li').allInnerTexts();
          note(`  · ${tag} числа: ${nums.map((t) => t.replaceAll('\n', ' ')).join(' · ')}`);
          const findHref = await g.page.locator('.keep.after .bridge').getAttribute('href');
          check(findHref === '/profile?guest=test', `${tag} · «Найти друзей» ведёт дверью гостя test`, findHref ?? '');
          const text = await g.page.locator('article.test').innerText();
          check(!/Никаких процентов|No percentages|Бесплатно, без рекламы и без подписок/.test(text.replace(/NDim Space — честный[^\n]*/g, '')) , `${tag} · запрещённых строк нет (кроме общей подписи TEST_FOOT)`);
          // Абзац о пуле снят словом владельца (№100 В1 = В) — ни на одном языке его нет.
          check(!/выбирает случайно из|picks the 12 things of the test at random/.test(text), `${tag} · абзаца о пуле нет (№100 В1)`);
          check(g.errors.length === 0, `${tag} · консоль чиста`, g.errors.slice(0, 2).join(' | '));
          await g.ctx.close();
        }
      }
    }
  }
} catch (e) {
  check(false, '🔴 прогон упал', String(e).slice(0, 400));
} finally {
  await browser.close();
  note(`\nПРОЙДЕНО: ${pass} · ПРОВАЛОВ: ${fails.length}`);
  if (fails.length) note('ПРОВАЛЫ:\n' + fails.map((f) => '  · ' + f).join('\n'));
  writeFileSync(`${OUT}/run-log-${PHASE}.txt`, log.join('\n'));
  process.exit(fails.length ? 1 : 0);
}

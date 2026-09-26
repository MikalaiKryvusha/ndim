#!/usr/bin/env node
/**
 * Драйвер ручного функционального прогона: ГОТОВАЯ СТРАНИЦА ВОПРОСОВ KAIF 2.8 на нашем дереве (`plans/100`, Ш5; отчёт —
 * `qa/reports/2026-09-26_shipped-review-page.md`). Проходит путь владельца живым браузером и печатает, что УВИДЕЛ.
 *
 * Проверочный документ — `test-results/contour/` (вне `interviews/`, вне git): очередь владельца его не видит. Страница
 * поднимается `--no-open --silent` — ни окна на экране владельца, ни звонка; окно владельца играет свой Chromium.
 * Путь «сервер умер → ответ сохранён на этом компьютере → агент забрал» идёт по НАСТОЯЩЕМУ профилю окна
 * `.kaif/contour-window/` настоящим Edge: именно его читает забор ответа генератора.
 *
 * Уборка — в `finally` и ПРОВЕРЯЕТСЯ: файлы решений, архив, замок, запись показа возвращаются к состоянию до прогона.
 *
 *   node qa/reports/2026-09-26_shipped-review-page.driver.mjs
 */
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseInterview, lintSelfContained } from '../../tools/lib/review-core.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DIR = join(ROOT, 'test-results', 'contour');
const SHOTS = join(DIR, 'shots');
const NAME = 'interview_990_contour_acceptance';
const DOC_REL = 'test-results/contour/' + NAME + '.md';
const BAD_REL = 'test-results/contour/interview_991_contour_outward.md';
const DOC = join(ROOT, DOC_REL);
const DECISIONS = join(ROOT, 'interviews', 'decisions');
const SHOWN = join(DECISIONS, 'shown.json');
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PROFILE = join(ROOT, '.kaif', 'contour-window');
const QUIET = ['--no-first-run', '--no-default-browser-check', '--disable-features=msImplicitSignin,msEdgeSyncConsent,msEdgeFirstSyncOnFirstRun'];

const results = [];
const check = (id, ok, seen) => { results.push({ id, ok: Boolean(ok), seen }); console.log((ok ? '✅ ' : '❌ ') + id + ' — ' + seen); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const na = '<!-- archaeology: n/a — проверочный документ ручного прогона, решения владельца не содержит -->';

const fixture = [
  '# Интервью №990 — Проверка готовой страницы вопросов', '',
  '> **Тема:** проверочный документ ручного прогона `plans/100`; строки перенесены по ширине, как во всех наших документах,',
  '> и **жирное выделение переходит\n> на следующую строку** — страница обязана показать его целиком.',
  '> **Создан:** 2026-09-26 · **Статус:** 🟡 ждёт ответа', '', '---', '',
  '### В1. Вариант списком, жирное через перенос', '', na, '',
  '- **А)** Первый путь: **выделение, которое переходит',
  '  на следующую строку**, и хвост варианта.',
  '- **Б)** Второй путь.', '',
  '**Ответ:**', '', '---', '',
  '### В2. Варианты таблицей', '', na, '',
  '| Вариант | Что будет | Цена |', '|---|---|---|',
  '| **А** | Первый исход таблицей | ноль |', '| **Б** | Второй исход таблицей | ноль |', '',
  '**Ответ:**', '', '---', '',
  '### В3. Ответ, который переживёт сервер', '', na, '',
  '- **А)** Записать на этом компьютере.', '- **Б)** Не записывать.', '',
  '**Ответ:**', '',
].join('\n');

function snapshotDecisions() {
  const files = existsSync(DECISIONS) ? readdirSync(DECISIONS).filter((f) => f.includes('interview_99')) : [];
  const archive = existsSync(join(DECISIONS, 'archive')) ? readdirSync(join(DECISIONS, 'archive')).filter((f) => f.includes('interview_99')) : [];
  return { files, archive, shown: existsSync(SHOWN) ? readFileSync(SHOWN, 'utf8') : null };
}

function contour(args, { wait = true } = {}) {
  if (wait) return spawnSync(process.execPath, ['tools/contour.mjs', ...args], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  const child = spawn(process.execPath, ['tools/contour.mjs', ...args], { cwd: ROOT });
  child.out = ''; child.stdout.on('data', (d) => { child.out += d; }); child.stderr.on('data', (d) => { child.out += d; });
  child.done = Promise.race([new Promise((r) => child.on('exit', (code) => r(code))), sleep(120000).then(() => 'не вышел за 120 с')]);
  return child;
}

async function pageUp(child) {
  for (let i = 0; i < 100; i++) { const m = child.out.match(/Page is up: (http:\/\/127\.0\.0\.1:\d+\/)/); if (m) return m[1]; await sleep(200); }
  throw new Error('страница не поднялась: ' + child.out);
}
const lockOf = () => { const p = join(DECISIONS, NAME + '.lock'); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; };
const decision = () => { const p = join(DECISIONS, NAME + '.decision.json'); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; };

async function inspect(page, label) {
  const m = await page.evaluate(() => {
    const fab = document.querySelector('.fab'); const cs = fab && getComputedStyle(fab);
    const labels = [...document.querySelectorAll('label.opt')].map((l) => l.textContent);
    return {
      groups: new Set([...document.querySelectorAll('input[type=radio]')].map((r) => r.name)).size,
      fab: cs ? cs.position + ' top=' + cs.top + ' right=' + cs.right : 'нет',
      header: getComputedStyle(document.querySelector('header') || document.body).position,
      rawStars: labels.filter((t) => t.includes('**')).length + [...document.querySelectorAll('.qbody, blockquote')].filter((e) => e.textContent.includes('**')).length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      zoom: getComputedStyle(document.documentElement).zoom,
      bg: getComputedStyle(document.body).backgroundColor,
    };
  });
  check('вид ' + label, m.groups === 3 && m.fab.startsWith('fixed') && m.header === 'static' && m.rawStars === 0 && m.overflow <= 0,
    'радиогрупп ' + m.groups + ' · кнопка ' + m.fab + ' · шапка ' + m.header + ' · сырых ** ' + m.rawStars + ' · вылет вбок ' + m.overflow + 'px · zoom ' + m.zoom + ' · фон ' + m.bg);
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const before = snapshotDecisions();
  writeFileSync(DOC, fixture, 'utf8');
  writeFileSync(join(ROOT, BAD_REL), fixture.replace('### В1. Вариант списком, жирное через перенос', '### В1. Вариант списком — формула см. выше'), 'utf8');
  let pageProc = null, waiter = null, browser = null, edge = null;
  try {
    // К1 — форма: генератор узнаёт три вопроса, отказа нет
    const c1 = contour([DOC_REL, '--check']);
    check('К1 проверка формы', c1.status === 0 && /блоков 3, узнано 3/.test(c1.stdout), 'код ' + c1.status + ' · ' + (c1.stdout.match(/блоков \d+, узнано \d+/) || ['?'])[0]);
    // К2 — показ вопроса со ссылкой наружу отказан ДО генератора: ни замка, ни записи показа
    const c2 = contour([BAD_REL, '--no-open', '--silent']);
    const shownAfterBad = existsSync(SHOWN) && readFileSync(SHOWN, 'utf8').includes('interview_991');
    check('К2 отказ «ссылка наружу» на показе', c2.status === 3 && !existsSync(join(DECISIONS, 'interview_991_contour_outward.lock')) && !shownAfterBad,
      'код ' + c2.status + ' · замок ' + existsSync(join(DECISIONS, 'interview_991_contour_outward.lock')) + ' · показ записан ' + shownAfterBad);

    // К3 — страница поднята, ожидатель стоит ДО неё (спецификация §5)
    waiter = contour(['--wait', DOC_REL], { wait: false });
    await sleep(800);
    pageProc = contour([DOC_REL, '--no-open', '--silent'], { wait: false });
    const url = await pageUp(pageProc);
    const shown = existsSync(SHOWN) && JSON.parse(readFileSync(SHOWN, 'utf8'))[DOC_REL];
    // Показ пишется, когда окно ОТКРЫЛОСЬ перед владельцем (I40); у `--no-open` окна нет — запись показа обязана молчать (контроль)
    check('К3 страница поднята; без окна показ не записан', Boolean(url) && !shown, url + ' · shown.json: ' + JSON.stringify(shown ?? null));

    // К4 — вид: две темы × две ширины, кадры
    browser = await chromium.launch();
    const errors = [];
    for (const theme of ['light', 'dark']) for (const width of [1440, 430]) {
      const ctx = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme });
      const p = await ctx.newPage();
      p.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
      await p.goto(url); await p.waitForSelector('#save');
      await inspect(p, theme + ' ' + width);
      await p.screenshot({ path: join(SHOTS, 'page-' + theme + '-' + width + '.png'), fullPage: true });
      await ctx.close();
    }
    check('К4 консоль чиста', errors.length === 0, errors.length ? errors.join(' | ') : 'ошибок 0');

    // К5 — ответ по одному: В1 кнопкой → страница остаётся, «осталось 2», ожидатель будит агента кодом 0
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    await page.goto(url); await page.waitForSelector('#save');
    await page.locator('input[type=radio][name$=":В1"]').first().check();
    await page.click('#save');
    await page.waitForFunction(() => /Осталось вопросов: 2/.test(document.body.innerText), null, { timeout: 15000 });
    const w1 = await waiter.done;
    const md1 = readFileSync(DOC, 'utf8');
    check('К5 В1 записан, страница живёт', w1 === 0 && /\*\*Ответ:\*\* \p{L}\)[^\n]*owner-review:/u.test(md1) && decision()?.answers?.['В1'],
      'ожидатель ' + w1 + ' · в md: ' + (md1.match(/\*\*Ответ:\*\* \p{L}\)[^\n]*/u) || ['нет'])[0].slice(0, 110));
    await page.screenshot({ path: join(SHOTS, 'after-q1.png'), fullPage: true });

    // К6 — В2 своим текстом и комментарием; решение СЛИВАЕТСЯ (В1 и В2 в одном decision.json)
    waiter = contour(['--wait', DOC_REL], { wait: false });
    await sleep(800);
    await page.locator('input[type=text][name$=":В2"]').fill('Свой вариант владельца');
    await page.locator('textarea[name^="comment:"][name$=":В2"]').fill('комментарий к В2');
    await page.click('#save');
    await page.waitForFunction(() => /Осталось вопросов: 1/.test(document.body.innerText), null, { timeout: 15000 });
    const w2 = await waiter.done;
    const d2 = decision();
    check('К6 В2 записан, решение слито', w2 === 0 && d2?.answers?.['В1'] && d2?.answers?.['В2'] && /Свой вариант владельца/.test(readFileSync(DOC, 'utf8')),
      'ожидатель ' + w2 + ' · в решении: ' + Object.keys(d2?.answers || {}).join(', '));
    await page.screenshot({ path: join(SHOTS, 'after-q2.png'), fullPage: true });
    await ctx.close();

    // К7 — окно владельца (Edge, профиль проекта, --app) → сервер умер → «сохранено на этом компьютере»
    edge = await chromium.launchPersistentContext(PROFILE, { executablePath: EDGE, headless: true, args: ['--app=' + url, ...QUIET], viewport: { width: 1100, height: 900 } });
    const win = edge.pages()[0] || await edge.newPage();
    if (!win.url().startsWith(url)) await win.goto(url);
    await win.waitForSelector('#save');
    const standalone = await win.evaluate(() => matchMedia('(display-mode: standalone)').matches);
    waiter = contour(['--wait', DOC_REL], { wait: false });
    await sleep(800);
    const lock = lockOf();
    process.kill(lock.pid); // сервер страницы умирает — как у владельца, когда закрылся чат
    await sleep(1500);
    await win.locator('input[type=radio][name$=":В3"]').first().check();
    await win.click('#save');
    await win.waitForFunction(() => /сохранён на этом компьютере/.test(document.body.innerText), null, { timeout: 15000 });
    const rescueShown = await win.evaluate(() => getComputedStyle(document.getElementById('rescue')).display !== 'none');
    await win.screenshot({ path: join(SHOTS, 'server-gone-saved-locally.png'), fullPage: true });
    check('К7 сервер умер → ответ на этом компьютере', standalone && !rescueShown, 'окно приложения ' + standalone + ' · кольцо спасения ' + rescueShown + ' · замок остался ' + Boolean(lockOf()));
    await edge.close(); edge = null;

    // К9 — очередь без браузера забирает ответ невидимым Edge на том же порту; решение с recovered: true
    const q = contour(['--queue', '--list']);
    // К8 — ожидатель смотрит на замок, а убитый сервер оставляет замок нарочно (порт для черновика): ожидатель просыпается,
    // когда ответ ЗАБРАН, — кодом 0. Про саму смерть сервера он не узнаёт (зазор назван в отчёте и в тикете истоку)
    const w3 = await waiter.done;
    check('К8 ожидатель разбужен забранным ответом', w3 === 0, 'код ' + w3);
    const d3 = decision();
    const md3 = readFileSync(DOC, 'utf8');
    check('К9 ответ забран агентом', Boolean(d3?.recovered) && d3?.answers?.['В3'] && /\*\*Ответ:\*\* \p{L}\)[^\n]*забран с компьютера владельца/u.test(md3.split('### В3')[1] || '') && !lockOf(),
      'recovered ' + d3?.recovered + ' · В3 ' + JSON.stringify(d3?.answers?.['В3']) + ' · замок ' + Boolean(lockOf()) + ' · код очереди ' + q.status);

    // К10 — наш страж вопросов читает ответы готовой страницы: все три отвечены, ссылок наружу нет
    const parsed = parseInterview(DOC, readFileSync(DOC, 'utf8'));
    const open = parsed.questions.filter((x) => !x.answered).map((x) => x.label);
    check('К10 наш разбор видит ответы', parsed.questions.length === 3 && open.length === 0 && lintSelfContained(parsed, readFileSync(DOC, 'utf8')).length === 0,
      'вопросов ' + parsed.questions.length + ' · без ответа: ' + (open.join(', ') || 'нет'));
  } finally {
    try { await browser?.close(); } catch {}
    try { await edge?.close(); } catch {}
    try { pageProc?.kill(); } catch {}
    try { waiter?.kill(); } catch {}
    // Уборка: свои файлы решений, архив, замки, запись показа — к состоянию до прогона
    for (const f of readdirSync(DECISIONS).filter((x) => x.startsWith('interview_99'))) rmSync(join(DECISIONS, f), { force: true });
    const arch = join(DECISIONS, 'archive');
    if (existsSync(arch)) for (const f of readdirSync(arch).filter((x) => x.startsWith('interview_99'))) rmSync(join(arch, f), { force: true });
    if (existsSync(SHOWN)) {
      const s = JSON.parse(readFileSync(SHOWN, 'utf8'));
      delete s[DOC_REL]; delete s[BAD_REL];
      if (before.shown === null && Object.keys(s).length === 0) rmSync(SHOWN, { force: true }); // файла до прогона не было
      else writeFileSync(SHOWN, JSON.stringify(s, null, 2) + '\n', 'utf8');
    }
    rmSync(DOC, { force: true }); rmSync(join(ROOT, BAD_REL), { force: true });
    const after = snapshotDecisions();
    check('След убран', after.files.length === 0 && after.archive.length === 0 && (after.shown ?? '').indexOf('interview_99') < 0,
      'файлов решений ' + after.files.length + ' · в архиве ' + after.archive.length + ' · показ ' + ((after.shown ?? '').includes('interview_99') ? 'остался' : 'убран'));
    const failed = results.filter((r) => !r.ok).length;
    console.log('\nИТОГ: проверок ' + results.length + ' · провалено ' + failed + ' · кадры ' + SHOTS);
    process.exitCode = failed ? 1 : 0;
  }
}

main();

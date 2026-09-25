// ДРАЙВЕР РУЧНОГО ПРОГОНА — набор `qa/suites/review-stale-tab.md` (РС-01…РС-10; РС-11 — `node tools/verify-bug110.mjs`).
// Контур вычитки автономен: стенд не нужен. Фикстура — `interviews/interview_998_stale_tab_fixture.md`, удаляется прогоном
// вместе с замком, решением и архивом (правило класса bugs/103). Страница поднимается БЕЗ `--port` — на постоянном порту
// документа, как у агента в жизни. Кадры: test-results/review-stale-tab/ — смотрятся глазами после прогона.
// Запуск из корня рабочего места: node qa/reports/2026-09-25_review-stale-tab.driver.mjs   (≈ 5 мин: РС-10 ждёт 180 с тишины)
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const REL = 'interviews/interview_998_stale_tab_fixture.md';
const FIXTURE = join(ROOT, REL);
const DECISIONS = join(ROOT, 'interviews', 'decisions');
const LOCK = join(DECISIONS, 'interview_998_stale_tab_fixture.lock');
const SHOTS = join(ROOT, 'test-results', 'review-stale-tab');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
let failed = 0;
const check = (id, ok, what, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`  ${ok ? '✅' : '❌'} ${id} · ${what}${detail ? ` — ${detail}` : ''}`);
};

const HEAD = `# Интервью №998 — фикстура «старая вкладка» (удаляется прогоном)

> **Статус:** 🔴 ЖДЁТ ОТВЕТОВ ВЛАДЕЛЬЦА (техническая фикстура драйвера qa/reports/2026-09-25_review-stale-tab.driver.mjs).
`;
const Q = (n, title, body, a, b) => `
### В${n}. ${title}

${body}

- **А) ${a}** — первый.
- **Б) ${b}** — второй.

**Ответ:**
`;
// Редакция 1 — как №097 до переписывания: три вопроса.
const V1 = HEAD + Q(1, 'Три практики рядом с «Сексом» — так оставить?', 'Практики в тесте на совместимость.', 'Оставить', 'Убрать')
  + Q(2, 'На каком языке открывается сайт?', 'Язык главной страницы.', 'Русский', 'Английский')
  + Q(3, 'Новые русские строки главной — принимаете?', 'Строки первой редакции.', 'Да', 'Нет');
// Редакция 2 — вопрос о практиках убран, вопрос о языке стал В1 (тот же текст), вопрос о строках переписан.
const V2 = HEAD + Q(1, 'На каком языке открывается сайт?', 'Язык главной страницы.', 'Русский', 'Английский')
  + Q(2, 'Новые русские строки главной — принимаете?', 'Строки ВТОРОЙ редакции, по ключевым запросам.', 'Да', 'Нет');

/** Поднять страницу фикстуры так, как это делает агент: без --port (или с `extra`). Отдаёт процесс, адрес и весь вывод. */
async function openPage(extra = []) {
  const child = spawn(process.execPath, ['tools/review.mjs', 'open', REL, '--no-open', '--no-signal', ...extra], { cwd: ROOT });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  const started = Date.now();
  while (Date.now() - started < 30000) {
    const m = /Страница поднята: (\S+)/.exec(out);
    if (m) return { child, url: m[1], out: () => out };
    if (child.exitCode !== null) return { child, url: null, out: () => out };
    await sleep(100);
  }
  return { child, url: null, out: () => out };
}

/** Дождаться строки в выводе процесса страницы (до `ms`). */
async function waitOut(p, re, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (re.test(p.out())) return true;
    await sleep(200);
  }
  return false;
}

/** Команда `review close` отдельным процессом — как её зовёт агент. */
function closeCmd(...extra) {
  const r = spawnSync(process.execPath, ['tools/review.mjs', 'close', REL, ...extra], { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

/** «Открыть новую редакцию» — кнопкой плашки; нет кнопки (мутант снял плашку) — обычной перезагрузкой, чтобы прогон дошёл до следующих кейсов. */
async function openNewRevision(page) {
  const ok = await page.locator('#gateReload').click({ timeout: 5000 }).then(() => true, () => false);
  if (!ok) await page.reload();
}

/** Сколько секунд до появления плашки нужного вида (или null). */
async function gateWithin(page, kind, ms) {
  const t0 = Date.now();
  const ok = await page.waitForSelector(`#gate[data-kind="${kind}"]`, { timeout: ms }).then(() => true, () => false);
  return ok ? (Date.now() - t0) / 1000 : null;
}

mkdirSync(SHOTS, { recursive: true });
writeFileSync(FIXTURE, V1, 'utf8');
rmSync(LOCK, { force: true });
const browser = await chromium.launch();
const kids = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // ═══ РС-01 · сервер убит → плашка и блок ввода ══════════════════════════════════════════════════════════
  console.log('\nРС-01 · сервер страницы убит, владелец в середине ответа:');
  let p1 = await openPage();
  kids.push(p1.child);
  check('РС-01', Boolean(p1.url), 'страница поднята на постоянном порту', p1.url || p1.out().slice(0, 200));
  await page.goto(p1.url);
  await page.locator('[data-q="В1"] input[value="Б"]').check();
  await page.locator('[data-q="В2"] input[value="А"]').check();
  await page.locator('[data-q="В2"] [data-text]').fill('русский, без угадывания');
  await page.locator('[data-q="В3"] input[value="Б"]').check();
  await page.locator('[data-q="В3"] [data-text]').fill('нужны сильные ключевые слова');
  await sleep(600);
  p1.child.kill('SIGKILL');
  const tDead = await gateWithin(page, 'dead', 15000);
  check('РС-01', tDead !== null, 'плашка «больше не принимает ответы» за ≤ 15 с', tDead !== null ? `${tDead.toFixed(1)} с` : 'не появилась');
  const gateText = tDead !== null ? await page.locator('#gate').innerText() : '';
  check('РС-01', gateText.includes('Сервер агента замолчал'), 'заголовок плашки называет причину');
  check('РС-01', (await page.locator('#gateText').inputValue().catch(() => '')).includes('ключевые слова'), 'на плашке ответы владельца текстом');
  await page.locator('[data-q="В2"] input[value="Б"]').click({ force: true, timeout: 1500 }).catch(() => {});
  check('РС-01', await page.locator('[data-q="В2"] input[value="А"]').isChecked(), 'ввод заблокирован: клик по варианту под плашкой выбор не меняет');
  await page.screenshot({ path: join(SHOTS, 'rs01-dead-1440.png') });

  // ═══ РС-03 · подъём заново — та же вкладка оживает ══════════════════════════════════════════════════════
  console.log('\nРС-03 · агент поднимает страницу заново (без --port):');
  let p3 = await openPage();
  kids.push(p3.child);
  check('РС-03', p3.url === p1.url, 'тот же адрес — постоянный порт документа', `${p1.url} → ${p3.url}` + (p3.url ? '' : ` · код ${p3.child.exitCode} · вывод: ${p3.out().replace(/\s+/g, ' ').slice(0, 300)}`));
  check('РС-03', /поднимаю на её же адресе/.test(p3.out()), 'вывод называет, что прежняя страница мертва и адрес тот же');
  // Одно окно на документ (суд p3, п. 3): вкладка ожила — `open` второго окна не открывает (драйвер с --no-open судит строку).
  check('РС-03', await waitOut(p3, /Прежняя вкладка ожила на этом адресе — новое окно браузера не открываю/, 9000), 'вывод: прежняя вкладка ожила — нового окна не открываю');
  const revived = await page.waitForSelector('#gate', { state: 'detached', timeout: 15000 }).then(() => true, () => false);
  check('РС-03', revived && (await page.locator('body').innerText()).includes('Связь восстановлена'), 'старая вкладка ожила сама: плашка снята, «Связь восстановлена»');
  check('РС-03', await page.locator('[data-q="В2"] input[value="А"]').isChecked() && (await page.locator('[data-q="В2"] [data-text]').inputValue()).includes('без угадывания'), 'отметки владельца на местах');

  // ═══ РС-04 · второй open при живой странице ══════════════════════════════════════════════════════════════
  console.log('\nРС-04 · второй open того же документа при живой странице:');
  const p4 = await openPage();
  await sleep(1500);
  check('РС-04', p4.url === null && /уже открыта/.test(p4.out()) && p4.child.exitCode === 0, 'второе окно не поднято: «уже открыта», код 0', p4.out().split('\n').find((l) => /уже открыта/.test(l)) || p4.out().slice(0, 160));

  // ═══ РС-02 · возврат на вкладку — проверка сразу ═════════════════════════════════════════════════════════
  console.log('\nРС-02 · сервер убит, владелец вернулся на вкладку:');
  p3.child.kill('SIGKILL');
  await sleep(200);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const tVis = await gateWithin(page, 'dead', 6000);
  check('РС-02', tVis !== null && tVis <= 3, 'плашка за ≤ 3 с после возврата на вкладку', tVis !== null ? `${tVis.toFixed(1)} с` : 'не появилась');
  const p2 = await openPage();
  kids.push(p2.child);
  await page.waitForSelector('#gate', { state: 'detached', timeout: 15000 }).catch(() => {});

  // ═══ РС-05 · документ переписан при живом сервере ════════════════════════════════════════════════════════
  console.log('\nРС-05 · агент переписал документ, пока страница жива:');
  writeFileSync(FIXTURE, V2, 'utf8');
  const tRew = await gateWithin(page, 'rewritten', 15000);
  check('РС-05', tRew !== null, 'плашка «Документ переписан» за ≤ 15 с', tRew !== null ? `${tRew.toFixed(1)} с` : 'не появилась');
  check('РС-05', await page.locator('#gateReload').isVisible().catch(() => false), 'на плашке кнопка «Открыть новую редакцию»');
  const stale = await page.evaluate(async () => {
    const r = await fetch('/decision', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ doc: document.body.dataset.doc, rev: document.body.dataset.rev, answers: { 'В1': { choice: 'Б', text: '', comment: '' } } }) });
    return { status: r.status, body: await r.json() };
  });
  check('РС-05', stale.status === 409 && stale.body.stale === true, 'ответ страницы старой редакции отвергнут 409 stale', `${stale.status} · ${stale.body.error || ''}`);
  await page.screenshot({ path: join(SHOTS, 'rs05-rewritten-1440.png') });

  // ═══ РС-06 · новая редакция: черновик переехал ═══════════════════════════════════════════════════════════
  console.log('\nРС-06 · «Открыть новую редакцию»:');
  await openNewRevision(page);
  await page.waitForLoadState('domcontentloaded');
  await sleep(800);
  check('РС-06', await page.locator('[data-q="В1"] input[value="А"]').isChecked() && (await page.locator('[data-q="В1"] [data-text]').inputValue()).includes('без угадывания'), 'вопрос о языке (был В2, стал В1) — ответ на месте');
  check('РС-06', !(await page.locator('[data-q="В2"] input[value="Б"]').isChecked()) && !(await page.locator('[data-q="В2"] [data-text]').inputValue()), 'ответ на ПЕРЕПИСАННЫЙ вопрос о строках не сел на новый В2');
  const orph = await page.locator('#orphansText').inputValue().catch(() => '');
  check('РС-06', orph.includes('ключевые слова') && orph.includes('практики'), 'ответы на убранный и переписанный вопросы — блоком «Черновик прошлой редакции» с текстом', orph.replace(/\n/g, ' ¦ ').slice(0, 160));
  await page.screenshot({ path: join(SHOTS, 'rs06-orphans-1440.png'), fullPage: true });

  // ═══ РС-07 · сценарий №097 целиком: убит → переписан → поднят заново ════════════════════════════════════
  console.log('\nРС-07 · сервер убит, документ переписан, страница поднята заново:');
  p2.child.kill('SIGKILL');
  await gateWithin(page, 'dead', 15000);
  writeFileSync(FIXTURE, V1, 'utf8');
  // Windows переиспользует PID (суд p3, п. 1): замок мёртвой страницы получает pid ЖИВОГО чужого процесса — самого драйвера.
  // Живой pid — ещё не живая страница: `open` обязан спросить сервер и подняться, а не ответить «уже открыта».
  writeFileSync(LOCK, JSON.stringify({ ...JSON.parse(readFileSync(LOCK, 'utf8')), pid: process.pid }, null, '\t'), 'utf8');
  const p7 = await openPage();
  kids.push(p7.child);
  check('РС-07', Boolean(p7.url) && /не работает/.test(p7.out()), 'замок с живым ЧУЖИМ pid (переиспользован) не принят за живую страницу — поднята заново', p7.url || p7.out().replace(/\s+/g, ' ').slice(0, 200));
  const t7 = await gateWithin(page, 'rewritten', 15000);
  check('РС-07', p7.url === p1.url && t7 !== null, 'старая вкладка на том же адресе НЕ принимает ответы молча — «Документ переписан»', t7 !== null ? `${t7.toFixed(1)} с после подъёма` : 'плашки нет');

  // ═══ РС-08 · РС-09 · close отказывает ═══════════════════════════════════════════════════════════════════
  console.log('\nРС-08 · РС-09 · команда close при живой странице:');
  await openNewRevision(page);
  await page.waitForLoadState('domcontentloaded');
  await page.locator('[data-q="В2"] [data-text]').fill('пишу прямо сейчас');
  await sleep(6000); // пульс донёс состояние ввода до замка
  const c8 = closeCmd();
  check('РС-08', c8.code === 4 && /НЕ ЗАКРЫТО/.test(c8.out) && /pid \d+/.test(c8.out), 'отказ кодом 4 с причиной, печать адреса и pid', c8.out.split('\n').filter((l) => /НЕ ЗАКРЫТО|Страница:/.test(l)).join(' ¦ '));
  // Причины называются все (суд p3, п. 7): владелец печатал 6 с назад — это слово обязано стоять в отказе рядом с возрастом.
  check('РС-08', /владелец печатал \d+ с назад/.test(c8.out), 'в отказе названо «владелец печатал N с назад»');
  // Закрытая страница уходит через 11 с после `close` (плашка успевает дойти до вкладки) — судить сразу значит судить на
  // материале, где упасть нечему (мутант «отказ снят» прошёл эту строку зелёным, заход Б 18:37).
  await sleep(12000);
  check('РС-08', p7.child.exitCode === null, 'страница жива через 12 с после отказа');
  const c9 = closeCmd('--force');
  check('РС-09', c9.code === 1 && /только со словом владельца/.test(c9.out), '--force без слова владельца — отказ кодом 1');

  // ═══ РС-10 · close при тишине — закрывает, вкладка гаснет ═══════════════════════════════════════════════
  // `--quick` (прогоны мутантов) пропускает кейс: ему нужны 185 с тишины, а мутанты стерегут РС-01…РС-09.
  if (!process.argv.includes('--quick')) {
  console.log('\nРС-10 · close на СТАРОЙ странице: печатал — отказ; после 180 с тишины при пустом черновике — закрывает:');
  console.log('  … жду 185 с: странице больше 180 с');
  await sleep(185000);
  // Суд p3, п. 7: отказ «печатал» на старой странице — один, без возраста страницы рядом (РС-08 видел его в паре).
  await page.locator('[data-q="В2"] [data-text]').fill('печатаю на старой странице');
  await sleep(6000); // пульс донёс ввод до замка
  const c10a = closeCmd();
  check('РС-10', c10a.code === 4 && /владелец печатал \d+ с назад/.test(c10a.out) && !/странице \d+ с/.test(c10a.out), 'на старой странице ввод сам по себе даёт отказ кодом 4 «печатал»', c10a.out.split('\n').find((l) => /НЕ ЗАКРЫТО|closed/.test(l)) || '');
  await page.evaluate(() => {
    for (const r of document.querySelectorAll('input[type=radio]')) r.checked = false;
    for (const t of document.querySelectorAll('textarea')) t.value = '';
  }); // без событий ввода: черновик пуст, а «последний ввод» остаётся тем, что был
  console.log('  … жду 185 с тишины после ввода');
  await sleep(185000);
  // Команда close сперва пробует сервер `/alive?ping=1` (п. 1); проба без `i` не «печатал только что» (п. 8) — иначе здесь отказ.
  const c10 = closeCmd();
  check('РС-10', c10.code === 0 && /closed interviews\/interview_998_stale_tab_fixture\.md/.test(c10.out), '«closed <док>», код 0', c10.out.split('\n').find((l) => /closed|НЕ ЗАКРЫТО/.test(l)) || '');
  const t10 = await gateWithin(page, 'closed', 15000);
  check('РС-10', t10 !== null, 'вкладка за ≤ 15 с показывает «Агент закрыл эту страницу»', t10 !== null ? `${t10.toFixed(1)} с` : 'плашки нет');
  await page.screenshot({ path: join(SHOTS, 'rs10-closed-1440.png') });
  const gone = await Promise.race([new Promise((r) => p7.child.on('exit', () => r(true))), sleep(20000).then(() => p7.child.exitCode !== null)]);
  check('РС-10', gone, 'процесс страницы ушёл сам');
  } else p7.child.kill('SIGKILL');

  await ctx.close(); // старые вкладки ушли: дальше каждый кейс знает, какие вкладки у него есть

  // ═══ РС-13 · подъём на порту ИЗ ЗАМКА; ожившая вкладка — без нового окна (суд p3, п. 2 и п. 3) · 390 тёмная ══════
  console.log('\nРС-13 · страница на явном порту убита → подъём без --port: порт из замка, прежняя вкладка оживает сама:');
  const P13 = Number(new URL(p1.url).port) + 7; // не постоянный порт документа — иначе п. 2 не отличить от прежнего поведения
  const dark = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const pd = await dark.newPage();
  const pp = await openPage(['--port', String(P13)]);
  kids.push(pp.child);
  if (pp.url) {
    await pd.goto(pp.url);
    await pd.locator('[data-q="В1"] input[value="А"]').check();
    pp.child.kill('SIGKILL');
    await gateWithin(pd, 'dead', 15000);
    await pd.screenshot({ path: join(SHOTS, 'rs01-dead-390-dark.png') });
    const pr = await openPage();
    kids.push(pr.child);
    check('РС-13', pr.url === pp.url, 'подъём без --port встал на порт из замка, а не на постоянный порт документа', `${pp.url} → ${pr.url}`);
    const revivedLine = await waitOut(pr, /Прежняя вкладка ожила на этом адресе — новое окно браузера не открываю/, 9000);
    check('РС-13', revivedLine && !/открываю окно/.test(pr.out()), 'прежняя вкладка ожила — нового окна нет');
    check('РС-13', await pd.waitForSelector('#gate', { state: 'detached', timeout: 10000 }).then(() => true, () => false), 'в самой вкладке плашка снята');
    pr.child.kill('SIGKILL');
  } else check('РС-13', false, 'страница на явном порту поднята', pp.out().replace(/\s+/g, ' ').slice(0, 200));
  await dark.close();
  await sleep(1000);

  // Контроль к п. 3: замок мёртвый, вкладки нет — пульса за 6 с не будет, и `open` говорит, что открыл бы окно.
  const pc = await openPage();
  kids.push(pc.child);
  check('РС-13', await waitOut(pc, /Прежняя вкладка за 6 с не отозвалась — окно не открываю: --no-open\./, 9000), 'контроль: вкладки нет — «не отозвалась», окно открылось бы');

  // ═══ РС-12 · ответ записан из другой вкладки — «ответ уже записан», а не «агент изменил» (суд p3, п. 4) ══════════
  console.log('\nРС-12 · две вкладки одного документа, ответ записан в первой:');
  const two = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const tabA = await two.newPage();
  const tabB = await two.newPage();
  await tabA.goto(pc.url);
  await tabB.goto(pc.url);
  await tabA.locator('[data-q="В1"] input[value="А"]').check();
  await tabA.locator('#save').click();
  await tabA.waitForFunction(() => document.body.innerText.includes('Записано'), null, { timeout: 10000 }).catch(() => {});
  // Сервер одного документа уходит через 2,5 с после записи — вкладка Б узнаёт правду сразу, возвратом на неё.
  await tabB.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const t12 = await gateWithin(tabB, 'answered', 4000);
  check('РС-12', t12 !== null, 'вторая вкладка: «Ответ по этому документу уже записан», а не «Документ переписан»', t12 !== null ? `${t12.toFixed(1)} с` : `плашка: ${await tabB.locator('#gate').getAttribute('data-kind').catch(() => 'нет')}`);
  await tabB.screenshot({ path: join(SHOTS, 'rs12-answered-1440.png') });
  await two.close();
} finally {
  for (const k of kids) { try { k.kill('SIGKILL'); } catch {} }
  await browser.close();
  rmSync(FIXTURE, { force: true });
  rmSync(LOCK, { force: true });
  rmSync(join(DECISIONS, 'interview_998_stale_tab_fixture.decision.json'), { force: true });
  const arch = join(DECISIONS, 'archive');
  if (existsSync(arch)) for (const n of readdirSync(arch)) if (n.startsWith('interview_998_stale_tab_fixture')) rmSync(join(arch, n));
}
check('след', !existsSync(FIXTURE) && !existsSync(LOCK), 'фикстура и замок убраны');
console.log(`\n${failed === 0 ? '✅' : '🔴'} ИТОГ: ${passed} прошло, ${failed} провалов · кадры: ${SHOTS}`);
process.exitCode = failed ? 1 : 0;

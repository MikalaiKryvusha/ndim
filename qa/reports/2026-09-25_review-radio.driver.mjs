// ДРАЙВЕР РУЧНОГО ПРОГОНА — «варианты без кнопок» (`bugs/NEW_review_page_options_without_radio.md`, S1).
// Фикстуры — КОПИИ живых №098 и №097 с пустыми полями ответа (`interviews/interview_997_radio_fixture.md`), удаляются
// прогоном вместе с замком, решением и архивом (правило класса bugs/103). Страница поднимается `--no-open --no-signal`:
// владельцу ничего не открывается. Кадры: test-results/review-radio/ — смотрятся глазами после прогона.
//   РК-01 · копия №098: кнопки у В1 (5) и В2 (4), подписи — тексты вариантов-абзацев;
//   РК-02 · копия №097: кнопки по короткому списку (3 у В1), без дублей букв от абзацев-описаний;
//   РК-03 · контроль: варианты без «**» (неузнанная форма) — `open` отказывает кодом 1 и называет вопрос и строку.
// Запуск из корня рабочего места: node qa/reports/2026-09-25_review-radio.driver.mjs
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const NAME = 'interview_997_radio_fixture';
const REL = `interviews/${NAME}.md`;
const FIXTURE = join(ROOT, REL);
const DECISIONS = join(ROOT, 'interviews', 'decisions');
const SHOTS = join(ROOT, 'test-results', 'review-radio');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
let failed = 0;
const check = (id, ok, what, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`  ${ok ? '✅' : '❌'} ${id} · ${what}${detail ? ` — ${detail}` : ''}`);
};

/** Копия живого интервью, в которой вопросы снова ждут ответа: статус 🔴, поля «Ответ» пустые, отметки сняты. */
function waitingCopy(rel) {
  const out = [];
  let skipping = false;
  for (const line of readFileSync(join(ROOT, rel), 'utf8').split(/\r?\n/)) {
    if (/\*\*Статус:\*\*/.test(line) && !out.some((l) => /\*\*Статус:\*\*/.test(l))) {
      out.push(`> **Статус:** 🔴 ЖДЁТ ОТВЕТОВ (фикстура драйвера qa/reports/2026-09-25_review-radio.driver.mjs, копия ${rel})`);
      continue;
    }
    if (/^\*\*Ответ/.test(line)) { out.push('**Ответ:**'); skipping = true; continue; }
    if (skipping) {
      if (!line.trim() || /^(---|#)/.test(line)) { skipping = false; out.push(line); }
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

async function openPage() {
  const child = spawn(process.execPath, ['tools/review.mjs', 'open', REL, '--no-open', '--no-signal'], { cwd: ROOT });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    const m = /Страница поднята: (\S+)/.exec(out);
    if (m) return { child, url: m[1], out: () => out };
    if (child.exitCode !== null) return { child, url: null, code: child.exitCode, out: () => out };
    await sleep(100);
  }
  return { child, url: null, out: () => out };
}

async function stop(p) {
  if (p?.child && p.child.exitCode === null) {
    p.child.kill();
    for (let i = 0; i < 50 && p.child.exitCode === null; i++) await sleep(100);
  }
}

function cleanup() {
  rmSync(FIXTURE, { force: true });
  rmSync(join(DECISIONS, `${NAME}.lock`), { force: true });
  rmSync(join(DECISIONS, `${NAME}.decision.json`), { force: true });
  const arch = join(DECISIONS, 'archive');
  if (existsSync(arch)) for (const n of readdirSync(arch)) if (n.startsWith(NAME)) rmSync(join(arch, n));
}

/** Кнопки выбора вопроса на странице: буквы и подписи. */
const radios = (page, label) =>
  page.$$eval(`input[type=radio][name="ch-${label}"]`, (els) =>
    els.map((e) => ({ v: e.value, text: e.closest('label')?.textContent?.replace(/\s+/g, ' ').trim() ?? '' })),
  );

mkdirSync(SHOTS, { recursive: true });
const head = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
const dirty = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).stdout.trim();
console.log(`Голова: ${head} · дерево ${dirty ? 'ГРЯЗНОЕ' : 'чистое'}`);
const browser = await chromium.launch();
let p;
try {
  console.log('\nРК-01 · копия №098 (варианты абзацами):');
  cleanup();
  writeFileSync(FIXTURE, waitingCopy('interviews/interview_098_compat_test_page_for_two.md'), 'utf8');
  p = await openPage();
  check('РК-01', Boolean(p.url), 'страница поднята (предполёт пропустил)', p.url ?? p.out().split('\n').filter(Boolean).slice(-3).join(' | '));
  if (p.url) {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      await page.goto(p.url);
      const b1 = await radios(page, 'В1');
      const b2 = await radios(page, 'В2');
      await page.locator('section[data-q="В1"] .opts').scrollIntoViewIfNeeded().catch(() => {});
      await page.screenshot({ path: join(SHOTS, `rk01-098-v1-${w}.png`) });
      check('РК-01', b1.length === 5 && b1.map((r) => r.v).join('') === 'АБВГД', `${w}: у В1 пять кнопок А–Д`, b1.map((r) => r.v).join(','));
      check('РК-01', b2.length === 4 && b2.map((r) => r.v).join('') === 'АБВГ', `${w}: у В2 четыре кнопки А–Г`, b2.map((r) => r.v).join(','));
      check('РК-01', b1[0]?.text.includes('V1') && b1[0]?.text.includes('Цена'), `${w}: подпись кнопки А — текст варианта с ценой`, (b1[0]?.text ?? '').slice(0, 90));
      await ctx.close();
    }
  }
  await stop(p);
  cleanup();

  console.log('\nРК-02 · копия №097 (абзацы-описания плюс список):');
  writeFileSync(FIXTURE, waitingCopy('interviews/interview_097_new_main_page_on_stage.md'), 'utf8');
  p = await openPage();
  check('РК-02', Boolean(p.url), 'страница поднята', p.url ?? p.out().split('\n').filter(Boolean).slice(-3).join(' | '));
  if (p.url) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(p.url);
    const b1 = await radios(page, 'В1');
    await page.locator('section[data-q="В1"] .opts').scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: join(SHOTS, 'rk02-097-v1-1440.png') });
    check('РК-02', b1.map((r) => r.v).join('') === 'АБВ', 'у В1 три кнопки А–В, без дублей', b1.map((r) => `${r.v}:${r.text.slice(3, 22)}`).join(' · '));
    await ctx.close();
  }
  await stop(p);
  cleanup();

  console.log('\nРК-03 · контроль: варианты без «**» — неузнанная форма:');
  const broken = waitingCopy('interviews/interview_098_compat_test_page_for_two.md').replace(/^\*\*([А-Д])\) ([^*]*)\*\*/gmu, '$1) $2');
  writeFileSync(FIXTURE, broken, 'utf8');
  p = await openPage();
  const refused = p.url === null && p.code === 1 && /СТРАНИЦА НЕ ПОДНЯТА: у вопроса есть варианты/.test(p.out());
  check('РК-03', refused, 'open отказал кодом 1 с причиной «у вопроса есть варианты»', `код ${p.code} · ${p.out().split('\n').find((l) => /В1 —/.test(l))?.trim() ?? ''}`);
  check('РК-03', /В1 — interviews[\\/]interview_997_radio_fixture\.md:\d+ · строк-вариантов 5, разобрано 0/.test(p.out()), 'названы вопрос, строка и счёт');
  await stop(p);
} finally {
  await stop(p);
  await browser.close();
  cleanup();
}
console.log(`\nИТОГ: ${passed} прошло, ${failed} провалов · фикстура и замок удалены: ${!existsSync(FIXTURE) && !existsSync(join(DECISIONS, `${NAME}.lock`))}`);
process.exitCode = failed ? 1 : 0;

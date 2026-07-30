/**
 * Страж ТРЁХ состояний человека — `bugs/87` (и весь класс, вскрытый в `bugs/84`).
 *
 * До 2026-07-29 на стенде существовало РОВНО ОДНО состояние: вошедший `dev@ndim.space`.
 * Ни гостевые ветки, ни карточка входа не проверялись никогда — ни автоматикой, ни глазами.
 * Этот страж существует, чтобы такого больше не случилось: он проходит все три состояния и
 * требует, чтобы каждое печатало СВОЙ текст.
 *
 * Что стережём (слово владельца, `ideas/21` п. 13):
 *   «это разные состояния, и должны быть разные поведения приложения, а не всё смешивать в кучу»
 *
 * Сам дефект `bugs/87`: у только что заведённого гостя ДОКУМЕНТА ЕЩЁ НЕТ (он появляется с
 * первой оценкой), `loadProfileScreen` честно бросал ошибку, экран валился в состояние `down`,
 * а ветки `down` и `signedout` печатали ОДНУ фразу — «Вы не вошли». То есть продукт врал
 * вошедшему гостю о его собственном состоянии, и врал неотличимо от честного ответа.
 *
 * ⚠️ Каждое состояние берётся В СВОЁМ контексте браузера: анонимная сессия живёт в IndexedDB и
 * протекала бы из прогона в прогон, а «свежий гость» — это ровно тот, у кого её ещё нет.
 *
 * Запуск: `npm run stand`, затем `node tools/verify-bug87.mjs` (+`--quick`).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const OUT = 'test-results/bug87';
const QUICK = process.argv.includes('--quick');
mkdirSync(OUT, { recursive: true });

const COMBOS = QUICK ? [['light', 390]] : [['light', 390], ['light', 1440], ['dark', 390], ['dark', 1440]];

/** Признаки, по которым состояния обязаны РАЗЛИЧАТЬСЯ на экране. */
const GUEST_MARK = /◌ гость/;
const SIGNED_OUT_MARK = /Вы не вошли/;
const DOWN_MARK = /Не удалось загрузить Ваши данные/;

let pass = 0;
const fails = [];
function check(ok, what, detail = '') {
  if (ok) pass++;
  else {
    fails.push(`${what}${detail ? ' — ' + detail : ''}`);
    console.log(`  ❌ ${what}${detail ? ' — ' + detail : ''}`);
  }
}

const browser = await chromium.launch();
try {
  for (const [theme, width] of COMBOS) {
    const tag = `${theme}-${width}`;
    console.log(`\nТри состояния человека (${theme}, ${width}):`);

    /** Свежий контекст на каждое состояние — иначе сессия протечёт между ними. */
    const open = async (path) => {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU' });
      await ctx.addInitScript((v) => localStorage.setItem('ndim-theme', v), theme);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5500);
      const text = await page.evaluate(() => document.body.innerText || '');
      return { ctx, page, text, errors };
    };

    // ── 1 · СВЕЖИЙ ГОСТЬ БЕЗ ДОКУМЕНТА — сам дефект bugs/87
    {
      const { ctx, page, text, errors } = await open('/menu?as=guest');
      await page.screenshot({ path: `${OUT}/guest-fresh-${tag}.png` });
      check(GUEST_MARK.test(text), '🔑 свежий гость БЕЗ документа видит гостевое состояние');
      check(!SIGNED_OUT_MARK.test(text), '🔑 свежий гость НЕ читает про себя «Вы не вошли» (bugs/87)');
      check(!DOWN_MARK.test(text), 'свежему гостю не показывают ошибку загрузки — пустота у него норма');
      check(/Сохранить результаты/.test(text), 'гостю предложено сохранить результаты');
      check(/Выйти/.test(text), 'гостю доступен выход (bugs/84)');
      const real = errors.filter((e) => !/permission|insufficient/i.test(e) && !/ws:\/\/localhost:5173/.test(e));
      check(real.length === 0, 'консоль чиста у гостя', real.join(' | ').slice(0, 140));
      await ctx.close();
    }

    // ── 2 · НЕ ВОШЁЛ — дверь 331 человека из 1.x
    {
      const { ctx, page, text } = await open('/menu?as=none');
      await page.screenshot({ path: `${OUT}/signed-out-${tag}.png` });
      check(SIGNED_OUT_MARK.test(text), 'не вошедший видит «Вы не вошли»');
      check(!GUEST_MARK.test(text), 'не вошедшего не выдают за гостя');
      check(!DOWN_MARK.test(text), 'не вошедшему не показывают ошибку загрузки');
      check(/Войти/.test(text), 'не вошедшему предложен вход');
      await ctx.close();
    }

    // ── 3 · ПОЛНОЦЕННЫЙ АККАУНТ — контроль прибора: если и здесь всё «гость», страж сломан
    {
      const { ctx, page, text } = await open('/menu');
      await page.screenshot({ path: `${OUT}/signed-in-${tag}.png` });
      check(/dev@ndim\.space/.test(text), 'вошедший видит свою почту');
      check(!GUEST_MARK.test(text), 'вошедшего не выдают за гостя');
      check(!SIGNED_OUT_MARK.test(text), 'вошедшему не говорят «Вы не вошли»');
      await ctx.close();
    }

    // ── 4 · ГОСТЬ С ДОКУМЕНТОМ — другая ветка того же состояния, тоже обязана быть гостевой
    {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU' });
      await ctx.addInitScript((v) => localStorage.setItem('ndim-theme', v), theme);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/profile?guest=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5500);
      await page.goto(`${BASE}/menu?as=guest`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      const text = await page.evaluate(() => document.body.innerText || '');
      await page.screenshot({ path: `${OUT}/guest-with-doc-${tag}.png` });
      check(GUEST_MARK.test(text), 'гость С документом тоже видит гостевое состояние');
      check(!SIGNED_OUT_MARK.test(text), 'гость С документом не читает «Вы не вошли»');
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}

console.log(`\nИтог: ${pass} зелёных, ${fails.length} провалов`);
if (fails.length) fails.forEach((f) => console.log('  ❌ ' + f));
process.exit(fails.length ? 1 : 0);

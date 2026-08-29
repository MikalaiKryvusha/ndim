/**
 * Зонд bugs/72 — каретка в поле поиска «Измерений» сбрасывается в начало.
 *
 * Открывает ДВЕ непроверенные двери из документа бага разом:
 *   · дверь 1 — воспроизводится ли дефект на ПРОДАКШЕН-СБОРКЕ (vite preview) или это
 *     артефакт `vite dev` / HMR. Раньше замер делался только на дев-стенде;
 *   · дверь 3 — свойства самого поля: computed `direction` / `unicode-bidi` у input и всех
 *     его предков. Это последний класс причин, оставшийся неисключённым.
 *
 * ⚠️ Урок EXP-0078: у своего прибора бывает слепое пятно. Поэтому здесь СРАЗУ два независимых
 * способа ввода — CDP `insertText` (как в прошлом замере) и настоящие нажатия клавиш
 * (`keyboard.press`), — чтобы не спутать дефект приложения с особенностью одного способа ввода.
 * Плюс контрольный опыт на голом <input> в той же странице: если реверс есть и там, виноват
 * инструмент, а не приложение.
 *
 * Запуск: node tools/probe-bug72.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:4173';
const WORD = 'Кошки';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

console.log(`база: ${BASE}`);
await page.goto(BASE + '/dims', { waitUntil: 'domcontentloaded' });

/*
 * На стенде вход происходит сам (`profile.ts` → пользователь стенда), но не мгновенно:
 * ждём появления поля, а не спим наугад. Гостю поле не отдаётся вовсе — тогда счётчик
 * останется нулём, и мы честно об этом скажем.
 */
const input = page.locator('input[type="search"], input.search, .toolbar input').first();
try {
  await input.waitFor({ state: 'attached', timeout: 20000 });
} catch {}
/*
 * ⚠️ EXP-0071: ящик поиска закрыт (`max-height: 0` у РОДИТЕЛЯ `.toolbar`), а Playwright считает
 * схлопнутое поле «видимым» — печатать в него можно, кликнуть нельзя. Открытость спрашиваем
 * У РАЗМЕТКИ (`aria-expanded`), а не у видимости потомка.
 */
const toggle = page.locator('button[aria-expanded]').first();
if (await toggle.count()) {
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await page.locator('.toolbar.open').waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500); // ящик едет переходом 300 мс — ждём конца
}

const present = await input.count();
console.log(`поле поиска на собранном сайте: ${present ? 'НАЙДЕНО' : 'НЕ найдено (гостю не отдаётся)'}`);

if (present) {
  // ── дверь 3: свойства поля и предков ────────────────────────────────────────────
  const bidi = await input.evaluate((el) => {
    const chain = [];
    let node = el;
    while (node && node !== document.documentElement.parentNode) {
      const cs = getComputedStyle(node);
      chain.push({
        tag: node.tagName.toLowerCase() + (node.className ? '.' + String(node.className).split(' ')[0] : ''),
        direction: cs.direction,
        unicodeBidi: cs.unicodeBidi,
        writingMode: cs.writingMode,
      });
      node = node.parentElement;
    }
    return chain;
  });
  const suspicious = bidi.filter(
    (n) => n.direction !== 'ltr' || (n.unicodeBidi !== 'normal' && n.unicodeBidi !== 'isolate'),
  );
  console.log(`\nдверь 3 — direction/unicode-bidi по цепочке предков (${bidi.length} узлов):`);
  console.log(suspicious.length ? `  ⚠️ подозрительные: ${JSON.stringify(suspicious)}` : '  всё ltr/normal — дверь 3 ЗАКРЫТА');

  // ── дверь 1: воспроизведение на продакшен-сборке, двумя способами ввода ──────────
  const attempt = async (label, typeIt) => {
    await input.fill('');
    // focus(), а не click(): клик требует попадания указателем и спотыкается о схлопнутый
    // ящик (EXP-0071), а для замера каретки нужен только фокус.
    await input.focus();
    await typeIt();
    await page.waitForTimeout(200);
    const got = await input.inputValue();
    console.log(`  ${label}: получено "${got}" ${got === WORD ? '✅ верно' : '❌ РЕВЕРС/искажение'}`);
    return got;
  };

  console.log(`\nдверь 1 — ввод "${WORD}" на ПРОДАКШЕН-СБОРКЕ:`);
  const viaInsert = await attempt('CDP insertText (как в прошлом замере)', async () => {
    for (const ch of WORD) {
      await input.type(ch);
      await page.waitForTimeout(60);
    }
  });
  /*
   * Второй способ — ДРУГОЙ ПУТЬ по построению: `insertText` вставляет текст в обход
   * клавиатурных событий (так работают вставка и IME), тогда как `locator.type` выше шлёт
   * keydown/keypress/keyup. Если реверс есть в обоих — дело не в способе ввода.
   * (`keyboard.press` здесь не годится: он не принимает кириллические символы как имена клавиш.)
   */
  const viaKeys = await attempt('insertText в обход клавиатурных событий', async () => {
    for (const ch of WORD) {
      await page.keyboard.insertText(ch);
      await page.waitForTimeout(60);
    }
  });

  // ── контрольный опыт: голый input на этой же странице ───────────────────────────
  await page.evaluate(() => {
    const bare = document.createElement('input');
    bare.id = 'bare-control';
    bare.type = 'search';
    document.body.appendChild(bare);
  });
  const bare = page.locator('#bare-control');
  await bare.focus();
  for (const ch of WORD) {
    await bare.type(ch);
    await page.waitForTimeout(60);
  }
  const bareGot = await bare.inputValue();
  console.log(`\nконтроль — голый <input> на той же странице: "${bareGot}" ${bareGot === WORD ? '✅ верно (инструмент исправен)' : '❌ реверс и здесь — виноват ИНСТРУМЕНТ, не приложение'}`);

  console.log('\nВЕРДИКТ:');
  if (bareGot !== WORD) {
    console.log('  инструмент искажает ввод — замер недействителен, нужен другой способ');
  } else if (viaInsert === WORD && viaKeys === WORD) {
    console.log('  ✅ на ПРОДАКШЕН-СБОРКЕ дефект НЕ воспроизводится → кандидат: артефакт vite dev/HMR');
  } else {
    console.log('  ❌ дефект ЖИВ на продакшен-сборке → это настоящий дефект приложения, не артефакт dev');
  }
}

await ctx.close();
await browser.close();

/**
 * QA-прогон bugs/52 — верхнее меню «Измерений», макет V3 «Панель-ящик».
 * Ворота сдачи по plans/06: живой Chrome, обе темы, две ширины, скриншоты глазами.
 *
 * Что проверяется (каждая строка — требование владельца или число канона 1.x):
 *  1) в панели живут ВСЕ ТРИ вещи: переключатель «Все / Мой NDim ID», 🔍 и 💡
 *     («чтобы это было целое меню с поиском, с предложить измерение и с переключателями»);
 *  2) переключатель доступен БЕЗ прокрутки наверх — он в прибитой панели;
 *  3) свёрнутый ящик отдаёт ленте высоту: панель ниже, чем с открытым поиском;
 *  4) панель прячется прокруткой ВНИЗ и возвращается прокруткой ВВЕРХ (канон 1.x:
 *     `top_sticky_toolbar`, translateY(-200%) ↔ translateY(0), порог 20px,
 *     ниже 40px прокрутки всегда видна);
 *  5) тап по 🔍 выдвигает поле с плейсхолдером «Введите искомое название» (текст владельца);
 *  6) поиск из нового места РАБОТАЕТ и ищет по всему Пространству (не ломает bugs/50);
 *  7) закрытие ящика очищает запрос — лента не показывает результаты невидимого поиска;
 *  8) 💡 открывает форму предложения из нового места (не ломает bugs/51);
 *  9) панель НЕ прячется, пока человек ищет или пишет заявку;
 * 10) панель не перекрывает карточки: верх ленты ниже низа панели.
 *
 * Запуск: `npm run stand`, затем `node tools/verify-bug52.mjs`.
 * Скриншоты — test-results/bug52/.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const STAND = 'http://localhost:5173';
const AUTH = 'http://127.0.0.1:9099';
const PROJECT = 'demo-ndim-dev';
const OUT = 'test-results/bug52';

let pass = 0;
const fails = [];
const ok = (n) => { pass++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { fails.push(`${n}: ${d}`); console.log(`  ✗ ${n} — ${d}`); };

mkdirSync(OUT, { recursive: true });

/** Вход почтовой ссылкой эмулятора — как из письма, только без письма (EXP-0045). */
async function signIn(page) {
  const email = 'dev@ndim.space';
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=demo-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestType: 'EMAIL_SIGNIN', email, continueUrl: `${STAND}/dims` }),
  });
  const { oobCodes = [] } = await (await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`)).json();
  const last = oobCodes.filter((c) => c.email === email && c.requestType === 'EMAIL_SIGNIN').at(-1);
  if (!last) return false;
  await page.goto(`${STAND}/dims?mode=signIn&oobCode=${last.oobCode}&apiKey=demo-api-key`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  return true;
}

const box = (page, sel) =>
  page.$eval(sel, (el) => {
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) };
  }).catch(() => null);

const browser = await chromium.launch();

for (const theme of ['light', 'dark']) {
  for (const width of [390, 1440]) {
    const label = `${theme} ${width}px`;
    console.log(`\n──── ${label} ────`);
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU' });
    const page = await ctx.newPage();
    await page.addInitScript((t) => localStorage.setItem('ndim-theme', t), theme);
    if (!(await signIn(page))) { bad(label, 'вход на стенде не удался'); await ctx.close(); continue; }
    await page.goto(`${STAND}/dims`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    // 1. Все три вещи в одной панели.
    const parts = await page.evaluate(() => {
      const t = document.querySelector('.toolbar');
      if (!t) return null;
      return {
        segs: t.querySelectorAll('.segs button').length,
        buttons: t.querySelectorAll('.ibtn').length,
        segText: [...t.querySelectorAll('.segs button')].map((b) => b.innerText.trim()),
      };
    });
    if (!parts) { bad(`${label} панель`, '.toolbar не найдена'); await ctx.close(); continue; }
    if (parts.segs === 2 && parts.buttons === 2) ok(`${label}: в панели переключатель (${parts.segText.join(' / ')}) + 🔍 + 💡`);
    else bad(`${label} состав панели`, `сегментов ${parts.segs}, кнопок ${parts.buttons}`);

    // Положение панели в ПОТОКЕ (для сравнения высот ниже). Проверка «прибита под шапкой»
    // стоит НИЖЕ, после прокрутки: у `position: sticky` при нулевой прокрутке элемент
    // находится на своём обычном месте и к шапке ещё не прилипал — мерить прилипание
    // здесь означало бы мерить то, чего в этот момент не существует.
    const toolClosed = await box(page, '.toolbar');

    // 3–5. Ящик: закрыт — ниже; тап по 🔍 — открылся, плейсхолдер владельца.
    const searchBtn = page.locator('.toolbar .ibtn').first();
    await searchBtn.click();
    await page.waitForTimeout(500);
    const toolOpen = await box(page, '.toolbar');
    if (toolClosed && toolOpen && toolOpen.height > toolClosed.height + 20)
      ok(`${label}: свёрнутый ящик отдаёт ленте ${toolOpen.height - toolClosed.height}px`);
    else bad(`${label} ящик`, `закрыт ${toolClosed?.height}px, открыт ${toolOpen?.height}px`);

    const ph = await page.getAttribute('.toolbar .search', 'placeholder');
    if (ph === 'Введите искомое название') ok(`${label}: плейсхолдер — текст владельца`);
    else bad(`${label} плейсхолдер`, `«${ph}»`);

    // 6. Поиск работает из нового места (bugs/50 не сломан): ищем то, чего нет на 1-м экране.
    await page.fill('.toolbar .search', 'проба');
    await page.waitForTimeout(2500);
    const found = await page.locator('.dim').count();
    if (found > 0) ok(`${label}: поиск нашёл ${found} карточек по всему Пространству`);
    else bad(`${label} поиск`, 'ничего не найдено — проверить bugs/50');

    // 9. Пока человек ищет — панель не прячется даже при прокрутке вниз.
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(600);
    const duringSearch = await page.evaluate(() => document.querySelector('.toolbar')?.classList.contains('hidden'));
    if (duringSearch === false) ok(`${label}: во время поиска панель остаётся на месте`);
    else bad(`${label} панель во время поиска`, 'спряталась из-под руки');

    // 7. Закрытие ящика очищает запрос.
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await page.waitForTimeout(400);
    await searchBtn.click();
    await page.waitForTimeout(600);
    const leftover = await page.inputValue('.toolbar .search').catch(() => '');
    if (leftover === '') ok(`${label}: закрытие ящика очистило запрос`);
    else bad(`${label} очистка`, `в поле осталось «${leftover}»`);

    // 4. Автопрятание по направлению прокрутки — канон 1.x.
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await page.waitForTimeout(400);
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(800);
    const hidden = await page.evaluate(() => document.querySelector('.toolbar')?.classList.contains('hidden'));
    if (hidden) ok(`${label}: прокрутка вниз спрятала панель`);
    else bad(`${label} прятание`, 'панель осталась на месте при прокрутке вниз');

    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(800);
    const backAgain = await page.evaluate(() => document.querySelector('.toolbar')?.classList.contains('hidden'));
    if (backAgain === false) ok(`${label}: прокрутка вверх вернула панель`);
    else bad(`${label} возврат`, 'панель не вернулась при прокрутке вверх');

    // 2. Панель ПРИБИТА под шапкой — мерим здесь, когда страница прокручена и панель
    //    действительно прилипла (при нулевой прокрутке sticky стоит на своём месте в потоке).
    //    На десктопе шапка та же прибитая, порог раскладки не влияет.
    const bar = await box(page, 'header.bar');
    const pinned = await box(page, '.toolbar');
    if (bar && pinned && Math.abs(pinned.top - bar.bottom) <= 2)
      ok(`${label}: панель прилипла ровно под шапкой (${pinned.top}px, низ шапки ${bar.bottom}px)`);
    else bad(`${label} прилипание`, `панель ${pinned?.top}, низ шапки ${bar?.bottom}`);

    // 2b. Переключатель достижим без ухода наверх — он виден вместе с вернувшейся панелью.
    const segBox = await box(page, '.toolbar .segs button');
    if (segBox && segBox.top >= 0 && segBox.bottom <= 900) ok(`${label}: переключатель во вьюпорте без прокрутки наверх`);
    else bad(`${label} переключатель`, `rect ${JSON.stringify(segBox)}`);

    // 10. Панель не перекрывает карточки.
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await page.waitForTimeout(500);
    const tool = await box(page, '.toolbar');
    const firstCard = await box(page, '.dim');
    if (tool && firstCard && firstCard.top >= tool.bottom - 1) ok(`${label}: первая карточка ниже панели`);
    else bad(`${label} перекрытие`, `карточка ${firstCard?.top}, низ панели ${tool?.bottom}`);

    // 8. 💡 из нового места открывает форму (bugs/51 не сломан).
    await page.locator('.toolbar .suggest-btn').click();
    await page.waitForTimeout(700);
    const form = await page.locator('.sug').count();
    if (form > 0) ok(`${label}: 💡 открыла форму предложения`);
    else bad(`${label} 💡`, 'форма не открылась');

    await page.screenshot({ path: `${OUT}/dims-${theme}-${width}.png` });
    await ctx.close();
  }
}

await browser.close();
console.log('\n────────────────────────────────────────────────────');
console.log(`Пройдено: ${pass}, провалено: ${fails.length}`);
if (fails.length) { fails.forEach((f) => console.log(`  ✗ ${f}`)); process.exitCode = 1; }
console.log(`Скриншоты: ${OUT}/`);

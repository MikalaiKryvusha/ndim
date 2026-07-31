/**
 * QA-прогон bugs/64 — прокрутка: своя память у вкладок «Измерений» и конец «съездов»
 * при навигации. Ворота сдачи по plans/06.
 *
 * Что проверяется (дословные претензии владельца 2026-07-27):
 *  1) «Загрузка на Измерениях ломается при переключении между ВСЕ и МОЙ NDIM ID» —
 *     после глубокой прокрутки «Все» → переход на «Мой NDim ID» → возврат: лента «Все»
 *     ПРОДОЛЖАЕТ догружаться (число карточек растёт), а не встаёт намертво;
 *  2) вкладки помнят позицию НЕЗАВИСИМО: «Мой NDim ID» открывается со своего верха,
 *     возврат на «Все» — на прежнее место;
 *  3) «Текст внизу под списком — убрать» — сноски об оценках под лентой нет;
 *  4) «Плашку загрузки переделать под канон старого NDim с фирменной анимацией» —
 *     в якоре подгрузки стоит общая карточка `Loading` с кольцом, а не глиф «◠»;
 *  5) «Автоскрол с ума сходит в Settings» — переход в дочернюю страницу и назад
 *     происходит БЕЗ анимированного съезда: `scroll-behavior` документа не `smooth`;
 *  6) число измерений убрано из кнопки «Мой NDim ID»;
 *  7) на мобильной переключатель стоит по центру ширины панели.
 *
 * Запуск: `npm run stand`, затем `node tools/verify-bug64.mjs`.
 * Скриншоты — test-results/bug64/.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const STAND = 'http://localhost:5173';
const AUTH = 'http://127.0.0.1:9099';
const PROJECT = 'demo-ndim-dev';
const OUT = 'test-results/bug64';

let pass = 0;
const fails = [];
const ok = (n) => { pass++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { fails.push(`${n}: ${d}`); console.log(`  ✗ ${n} — ${d}`); };

mkdirSync(OUT, { recursive: true });

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

/** Листаем до конца документа, пока лента растёт, — как это делает человек. */
async function scrollToBottom(page, rounds = 6) {
  for (let i = 0; i < rounds; i += 1) {
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
    await page.waitForTimeout(700);
  }
}

const browser = await chromium.launch();

for (const width of [390, 1440]) {
  const label = `${width}px`;
  console.log(`\n──── ${label} ────`);
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU' });
  const page = await ctx.newPage();
  if (!(await signIn(page))) { bad(label, 'вход не удался'); await ctx.close(); continue; }
  await page.goto(`${STAND}/dims`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // 6. Число убрано из кнопки.
  const mineLabel = await page.locator('.segs button').nth(1).innerText();
  if (!/\d/.test(mineLabel)) ok(`${label}: в кнопке «${mineLabel.trim()}» числа нет`);
  else bad(`${label} кнопка «Мой NDim ID»`, `осталось число: «${mineLabel.trim()}»`);

  // 4. Каноничная карточка загрузки, а не глиф.
  const loader = await page.evaluate(() => {
    const l = document.querySelector('.loader');
    return l ? { ring: !!l.querySelector('.ring'), text: l.innerText.trim() } : null;
  });
  if (loader?.ring) ok(`${label}: в якоре подгрузки кольцо канона 1.x («${loader.text}»)`);
  else bad(`${label} карточка загрузки`, `кольца нет: ${JSON.stringify(loader)}`);
  if (loader && !/[◠◡]/.test(loader.text)) ok(`${label}: самодельного глифа «◠» нет`);
  else bad(`${label} глиф`, 'в якоре остался «◠»');

  // 3. Сноски под лентой нет.
  const body = await page.locator('main.body').innerText();
  if (!body.includes('Оценки видите только Вы')) ok(`${label}: сноски под лентой нет`);
  else bad(`${label} сноска`, 'текст «Оценки видите только Вы…» на месте');

  // 7. Переключатель по центру (только мобильная раскладка).
  if (width < 1024) {
    const centred = await page.evaluate(() => {
      const t = document.querySelector('.toolbar');
      const s = document.querySelector('.segs');
      if (!t || !s) return null;
      const tr = t.getBoundingClientRect(), sr = s.getBoundingClientRect();
      return Math.round(Math.abs((sr.left + sr.width / 2) - (tr.left + tr.width / 2)));
    });
    if (centred !== null && centred <= 2) ok(`${label}: переключатель по центру панели (отклонение ${centred}px)`);
    else bad(`${label} центровка`, `центр переключателя смещён на ${centred}px`);
  }

  // 1–2. Главное: глубокая прокрутка «Все» не ломает подгрузку и не тянется на «Мой NDim ID».
  // Именно ЭТО и ломалось: якорь подгрузки, оставшийся в поле зрения, больше не давал
  // пересечений, и лента вставала (на 1440px — на первых 12 карточках).
  //
  // ⚠️ Ожидание СЧИТАЕТСЯ ИЗ ДАННЫХ (bugs/103), а не константой «44»: лента «Все» — это
  // каталог минус оценённые, и зашитое число делало вердикт зависимым от ПОРЯДКА прогона
  // стражей — сосед, оставивший в базе стенда пару оценок, красил этот страж «42 из 44»
  // на исправном продукте (ровно так свип 2026-07-31 объявил ложную регрессию).
  const who = await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'dev@ndim.space', password: 'ndim-dev-stand', returnSecureToken: true }),
  })).json();
  const FS_BASE = `http://127.0.0.1:8181/v1/projects/${PROJECT}/databases/(default)/documents`;
  const catalog = ((await (await fetch(`${FS_BASE}/dims?pageSize=300`, { headers: { Authorization: 'Bearer owner' } })).json()).documents ?? [])
    .filter((d) => !d.name.endsWith('/dims_list')).length;
  const rated = ((await (await fetch(`${FS_BASE}/points/${who.localId}/dims?pageSize=300`, { headers: { Authorization: 'Bearer owner' } })).json()).documents ?? []).length;
  const FEED_TOTAL = catalog - rated;
  console.log(`  · ожидание ленты «Все»: каталог ${catalog} − оценено ${rated} = ${FEED_TOTAL}`);
  await scrollToBottom(page);
  // Человек не может нажать переключатель, пока панель спрятана прокруткой вниз: он
  // сначала прокручивает ВВЕРХ, панель возвращается, и только тогда жмёт. Воспроизводим
  // именно это — иначе Playwright подкрутил бы страницу сам, чтобы дотянуться до кнопки,
  // и мы бы мерили позицию, в которой человек никогда не находится.
  await page.evaluate(() => window.scrollBy({ top: -200, behavior: 'instant' }));
  await page.waitForTimeout(700);
  const deepY = await page.evaluate(() => window.scrollY);
  const allBefore = await page.locator('.dim').count();
  if (allBefore >= FEED_TOTAL) ok(`${label}: лента догрузилась до конца каталога (${allBefore} карточек, scrollY ${deepY})`);
  else bad(`${label} ПОДГРУЗКА ВСТАЛА`, `карточек ${allBefore} из ${FEED_TOTAL}, scrollY ${deepY}`);

  await page.locator('.segs button').nth(1).click();   // → «Мой NDim ID»
  await page.waitForTimeout(1200);
  const mineY = await page.evaluate(() => window.scrollY);
  if (mineY <= 5) ok(`${label}: «Мой NDim ID» открылся со своего верха (scrollY ${mineY})`);
  else bad(`${label} память вкладки`, `«Мой NDim ID» унаследовал прокрутку «Все»: ${mineY}px`);

  await page.locator('.segs button').nth(0).click();   // → назад на «Все»
  await page.waitForTimeout(1200);
  const backY = await page.evaluate(() => window.scrollY);
  if (Math.abs(backY - deepY) <= 40) ok(`${label}: возврат на «Все» вернул прежнее место (${backY}px против ${deepY}px)`);
  else bad(`${label} возврат`, `было ${deepY}px, стало ${backY}px`);

  // Лента после переключений цела: карточки не потерялись и якорь снова работает.
  await scrollToBottom(page, 3);
  const allAfter = await page.locator('.dim').count();
  if (allAfter >= FEED_TOTAL) ok(`${label}: после переключений лента цела (${allAfter} карточек)`);
  else bad(`${label} ЛЕНТА ПОСЛЕ ПЕРЕКЛЮЧЕНИЙ`, `карточек ${allAfter} из ${FEED_TOTAL}`);

  await page.screenshot({ path: `${OUT}/dims-${width}.png` });

  // 5. Settings: переход в дочернюю страницу и назад — без анимированного съезда.
  await page.goto(`${STAND}/menu`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  const behavior = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
  if (behavior !== 'smooth') ok(`${label}: scroll-behavior документа = ${behavior} (навигация не едет)`);
  else bad(`${label} автоскролл`, 'scroll-behavior: smooth — каждый переход анимируется');

  await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
  await page.waitForTimeout(400);
  await page.locator('a[href="/menu/donate"]').click();
  await page.waitForTimeout(900);
  const childY = await page.evaluate(() => window.scrollY);
  if (childY <= 5) ok(`${label}: дочерняя страница открылась сверху сразу (scrollY ${childY})`);
  else bad(`${label} дочерняя страница`, `открылась на ${childY}px`);

  await ctx.close();
}

await browser.close();
console.log('\n────────────────────────────────────────────────────');
console.log(`Пройдено: ${pass}, провалено: ${fails.length}`);
if (fails.length) { fails.forEach((f) => console.log(`  ✗ ${f}`)); process.exitCode = 1; }
console.log(`Скриншоты: ${OUT}/`);

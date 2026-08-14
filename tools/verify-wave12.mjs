/**
 * QA-прогон волны 12 живым Chrome — ворота сдачи по plans/06.
 *
 * Каждая проверка = дословная претензия владельца из чата 2026-07-27:
 *
 *  1) «со страницы Пространство убрать виджет Версии» —
 *     на `/space` виджета «Версии» НЕТ ни в одной теме и ширине.
 *  2) «перенести его в Settings… номера версий, номера сборок и по серверу и по веб
 *     приложению, даты с временем сборок и по мобилке и по серверу» —
 *     в «Меню» и в «О системе» стоит ОДИН и тот же виджет, и в нём шесть значений:
 *     версия+сборка приложения · дата со временем его сборки · версия+сборка сервера ·
 *     дата со временем сборки сервера. Дата проверяется НА НАЛИЧИЕ ВРЕМЕНИ (часы:минуты),
 *     а не просто на непустоту — «дата без времени» и была претензией.
 *  3) «в Об Авторе вообще фото потерялось» —
 *     портрет РЕАЛЬНО загружен (`naturalWidth > 0`, а не только есть в DOM — урок bugs/14:
 *     DOM-проверка зелёная и на битой картинке), и рядом пять ссылок автора с их адресами.
 *  4) «во многих страницах были красивые иконки… сейчас всё скупое» —
 *     на страницах документов не осталось юникод-глифов (♡ ❤ ✉ ‹ ↗ ⧉), а на кнопках стоят
 *     настоящие `<svg>`. При этом ЦВЕТНОЙ эмодзи ❤️ (U+FE0F) остаться ОБЯЗАН: он был в 1.x,
 *     и владелец просил именно его — страж различает эти два случая.
 *  5) «нет центровок» —
 *     на коротких страницах-действиях абзацы центрированы (канон 1.x `.page_main_text p`),
 *     а в длинном документе — НЕТ (центрировать простыню нельзя).
 *  6) «в О системе нужно сделать версию 2.0… и список версий с анимацией» —
 *     первая запись истории версий — «Версия 2.0», и раскрытие АНИМИРУЕТСЯ: высота
 *     содержимого замеряется по кадрам, а не «на глаз» (промежуточное значение обязано
 *     существовать; без анимации высота прыгает 0 → полная за один кадр).
 *  7) иллюстрации 1.x вернулись на «Поддержку» и «Пожертвование» — и тоже по пикселям.
 *
 * Запуск: `npm run stand` (эмуляторы + сид + vite dev на :5173), затем
 *   node tools/verify-wave12.mjs
 * Скриншоты — test-results/wave12/ (вне git).
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const STAND = 'http://localhost:5173';
const OUT = 'test-results/wave12';
const AUTH = 'http://127.0.0.1:9099';
/** Проект СТЕНДА, а не боевой: эмулятор держит oobCode'ы под `demo-ndim-dev`. */
const PROJECT = 'demo-ndim-dev';

/** Юникод-глифы, которых на лице продукта быть не должно (bugs/17 → bugs/55). */
const BAD_GLYPHS = ['♡', '✉', '‹', '›', '↗', '⧉', '⧈'];
/** А ЭТОТ знак остаться обязан: цветной эмодзи из текста 1.x. */
const COLOR_HEART = '❤️';

let pass = 0;
const fails = [];
const ok = (name) => { pass++; console.log(`  ✓ ${name}`); };
const bad = (name, detail) => { fails.push(`${name}: ${detail}`); console.log(`  ✗ ${name} — ${detail}`); };

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

/**
 * Вход на стенде почтовой ссылкой — как из письма, только без письма (EXP-0045).
 * Нужен: `space/server` правила отдают только вошедшим, а без него версии сервера
 * на экране не будет — и проверка №2 проверяла бы пустоту.
 */
async function signIn(page) {
  const email = 'dev@ndim.space';
  const sent = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=demo-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestType: 'EMAIL_SIGNIN', email, continueUrl: `${STAND}/profile` }),
  });
  if (!sent.ok) return false;
  const res = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes = [] } = await res.json();
  const last = oobCodes.filter((c) => c.email === email && c.requestType === 'EMAIL_SIGNIN').at(-1);
  if (!last) return false;
  await page.goto(`${STAND}/profile?mode=signIn&oobCode=${last.oobCode}&apiKey=demo-api-key`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  return true;
}

/**
 * Тему ставим КЛЮЧОМ до загрузки страницы: системный `colorScheme` тему продукта не меняет,
 * и без этого «обе темы» проверялись бы формально (изъян, найденный в tools/verify-icons.mjs).
 */
async function newCtx(theme, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.addInitScript((t) => localStorage.setItem('ndim-theme', t), theme);
  return ctx;
}

/** Дата со ВРЕМЕНЕМ: «27 июля 2026 г. в 14:32» / «July 27, 2026 at 14:32». */
const hasClock = (text) => /\d{1,2}:\d{2}/.test(text);

for (const theme of ['light', 'dark']) {
  for (const width of [390, 1440]) {
    const tag = `${theme}-${width}`;
    console.log(`\n════ ${tag} ════`);
    const ctx = await newCtx(theme, width);
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    if (!(await signIn(page))) { bad(`вход ${tag}`, 'не удалось войти почтовой ссылкой'); continue; }

    // ── 1. На «Пространстве» виджета «Версии» больше нет ────────────────────
    await page.goto(`${STAND}/space`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    {
      const headings = await page.locator('main h3').allInnerTexts();
      const has = headings.some((h) => /^Версии$/i.test(h.trim()));
      has ? bad(`space без «Версий» ${tag}`, `нашёл заголовок среди ${JSON.stringify(headings)}`)
          : ok(`space без «Версий» ${tag}`);
      await page.screenshot({ path: `${OUT}/space-${tag}.png`, fullPage: true });
    }

    // ── 2. Виджет версий в «Меню» и в «О системе» — один и тот же, полный ────
    for (const [route, label] of [['/menu', 'Меню'], ['/ru/menu/about', 'О системе']]) {
      await page.goto(`${STAND}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1800);
      const box = page.locator('.vers');
      if ((await box.count()) === 0) { bad(`версии в «${label}» ${tag}`, 'виджета нет'); continue; }
      const text = (await box.first().innerText()).replace(/\s+/g, ' ');

      const app = /Приложение\s+(\S+)/.exec(text);
      const srv = /Сервер синхронизации\s+(\S+)/.exec(text);
      if (app && /^\d+\.\d+/.test(app[1])) ok(`версия приложения в «${label}» ${tag} → ${app[1]}`);
      else bad(`версия приложения в «${label}» ${tag}`, `не разобрал: «${text}»`);

      if (srv && /^\d+\.\d+/.test(srv[1])) ok(`версия сервера в «${label}» ${tag} → ${srv[1]}`);
      else bad(`версия сервера в «${label}» ${tag}`, `не разобрал: «${text}»`);

      const built = text.match(/Собран[оа]?\s[^А-Я]*?\d{1,2}:\d{2}/g) ?? [];
      built.length === 2
        ? ok(`две даты сборки со временем в «${label}» ${tag}`)
        : bad(`две даты сборки со временем в «${label}» ${tag}`, `нашёл ${built.length}: «${text}»`);
      if (!hasClock(text)) bad(`время в датах «${label}» ${tag}`, 'часов и минут нет вовсе');

      await page.screenshot({ path: `${OUT}/versions-${label}-${tag}.png`, fullPage: true });
    }

    // ── 3. Портрет автора и его ссылки ──────────────────────────────────────
    await page.goto(`${STAND}/ru/menu/author`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    {
      const shot = page.locator('img.ava');
      // ПИКСЕЛИ, а не DOM: битая картинка тоже есть в DOM (урок bugs/14).
      const real = await shot.evaluate((el) => el.complete && el.naturalWidth > 0).catch(() => false);
      real ? ok(`портрет автора загружен ${tag}`) : bad(`портрет автора ${tag}`, 'naturalWidth = 0');

      const hrefs = await page.locator('.links a').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
      const want = ['instagram.com/kotkrinik', 'linkedin.com/in/mikalai-kryvusha', 'youtube.com/user/TheKotKrinik', 'vk.com/krinik', 'mailto:kotkrinik@yandex.ru'];
      const missing = want.filter((w) => !hrefs.some((h) => (h ?? '').includes(w)));
      missing.length === 0 ? ok(`пять ссылок автора ${tag}`) : bad(`ссылки автора ${tag}`, `нет: ${missing.join(', ')}`);

      const marks = await page.locator('.links .tile svg').count();
      marks === 5 ? ok(`пять брендовых знаков ${tag}`) : bad(`брендовые знаки ${tag}`, `их ${marks}`);
      await page.screenshot({ path: `${OUT}/author-${tag}.png`, fullPage: true });
    }

    // ── 4. Глифы vs иконки, и цветной ❤️ на месте ───────────────────────────
    for (const route of ['/ru/menu/support', '/ru/menu/donate', '/ru/menu/author', '/ru/menu/share', '/ru/menu/about', '/ru/menu/manual']) {
      await page.goto(`${STAND}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
      const body = await page.locator('main').innerText();
      const found = BAD_GLYPHS.filter((g) => body.includes(g));
      found.length === 0
        ? ok(`без глифов ${route} ${tag}`)
        : bad(`глифы ${route} ${tag}`, `остались: ${found.join(' ')}`);
    }
    for (const route of ['/ru/menu/support', '/ru/menu/donate', '/ru/menu/about']) {
      await page.goto(`${STAND}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(700);
      const body = await page.locator('main').innerText();
      body.includes(COLOR_HEART)
        ? ok(`цветной ❤️ на месте ${route} ${tag}`)
        : bad(`цветной ❤️ ${route} ${tag}`, 'сердце потеряло цвет (нет U+FE0F)');
    }

    // ── 5. Центровка: короткие страницы да, длинный документ нет ────────────
    for (const [route, want] of [['/ru/menu/support', 'center'], ['/ru/menu/donate', 'center'], ['/ru/menu/manual', 'start']]) {
      await page.goto(`${STAND}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(700);
      const align = await page.locator('article.doc p').first().evaluate((el) => getComputedStyle(el).textAlign);
      const good = want === 'center' ? align === 'center' : align !== 'center';
      good ? ok(`выравнивание ${route} ${tag} → ${align}`) : bad(`выравнивание ${route} ${tag}`, `ожидал ${want}, вижу ${align}`);
    }

    // ── 6. История версий: 2.0 первой и раскрытие анимируется ───────────────
    await page.goto(`${STAND}/ru/menu/about`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    {
      // Внешняя раскрывашка закрыта — innerText скрытого узла пуст. Читаем textContent:
      // проверяем СОДЕРЖИМОЕ истории, а не её видимость (видимость меряется ниже).
      const first = (await page.locator('details.ver > summary').first().textContent() ?? '').trim();
      /^Верси[яi]?\s*2\.0|^Version 2\.0/i.test(first)
        ? ok(`история начинается с 2.0 ${tag} → «${first}»`)
        : bad(`история начинается с 2.0 ${tag}`, `первая запись: «${first}»`);

      const outer = page.locator('details.history');
      // Закрываем, чтобы мерить именно РАСКРЫТИЕ.
      await outer.evaluate((el) => { el.open = false; });
      await page.waitForTimeout(350);
      await outer.locator('> summary').click();
      // Замер по кадрам: без анимации высота идёт 0 → полная за один кадр, и промежуточных
      // значений НЕТ. С анимацией они обязаны появиться.
      const heights = [];
      for (let i = 0; i < 14; i++) {
        heights.push(await outer.evaluate((el) => el.getBoundingClientRect().height));
        await page.waitForTimeout(20);
      }
      const min = Math.min(...heights);
      const max = Math.max(...heights);
      const between = heights.filter((h) => h > min + 4 && h < max - 4).length;
      between > 0
        ? ok(`история версий анимируется ${tag} (${between} промежуточных кадров, ${Math.round(min)}→${Math.round(max)}px)`)
        : bad(`история версий анимируется ${tag}`, `высота прыгнула ${Math.round(min)}→${Math.round(max)} без промежуточных кадров`);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/history-${tag}.png`, fullPage: true });
    }

    // ── 7. Иллюстрации 1.x вернулись (по пикселям) ──────────────────────────
    for (const route of ['/ru/menu/support', '/ru/menu/donate', '/ru/menu/share']) {
      await page.goto(`${STAND}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      // У «Пригласить друзей» иллюстрации 1.x не было — там сетка соцсетей; снимок нужен, проверка нет.
      if (route !== '/ru/menu/share') {
        const real = await page.locator('img.art').evaluate((el) => el.complete && el.naturalWidth > 0).catch(() => false);
        real ? ok(`иллюстрация ${route} ${tag}`) : bad(`иллюстрация ${route} ${tag}`, 'не загрузилась (naturalWidth = 0)');
      }
      // Скриншот именно этих страниц: с `/menu/donate` и начался разговор владельца.
      await page.screenshot({ path: `${OUT}/${route.split('/').pop()}-${tag}.png`, fullPage: true });
    }

    const noisy = errors.filter((e) => !/favicon|ERR_ABORTED/i.test(e));
    noisy.length === 0 ? ok(`консоль чиста ${tag}`) : bad(`консоль ${tag}`, noisy.slice(0, 3).join(' | '));

    await ctx.close();
  }
}

await browser.close();

console.log(`\n${'═'.repeat(50)}`);
console.log(`Пройдено: ${pass} · Провалено: ${fails.length}`);
if (fails.length) {
  console.log('\nПровалы:');
  fails.forEach((f) => console.log(`  · ${f}`));
  process.exit(1);
}
console.log(`Скриншоты: ${OUT}/ — СМОТРЕТЬ ГЛАЗАМИ, «зелено» ≠ «красиво».`);

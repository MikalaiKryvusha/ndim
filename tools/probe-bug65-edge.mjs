/**
 * Решающее A/B по bugs/65 — ПИКСЕЛИ, а не габариты.
 *
 * Зачем отдельный прибор: `boundingBox` слоя, ставший равным ширине окна, НЕ доказывает, что
 * светлая щель справа закрашена. Ширина — это габарит, а спор идёт о том, что человек ВИДИТ.
 * Тот же урок в проекте уже оплачен: «смотри пиксели (`naturalWidth`), а не DOM».
 *
 * Опыт ставится в ОДНОМ прогоне на ОДНОЙ странице: снимаем правый край у продукта КАК ЕСТЬ,
 * затем снимаем покраску холста (возвращая дефект) и снимаем ещё раз. Отличается ровно она.
 * Кадры кладутся рядом и увеличены (deviceScaleFactor 4), потому что предмет спора — 15px.
 *
 * 🔴 ЧТО ЭТИМ ПРИБОРОМ УЖЕ ОПРОВЕРГНУТО. Гипотеза 1 документа бага — «`width: 100vw` вместо
 * `inset: 0` накроет и гуттер» — НЕВЕРНА: габарит слоя честно становится 1440 при окне 1440,
 * а пиксели полосы не меняются ни на бит (кадры были неотличимы). Оверфлоу фиксированного слоя
 * обрезается краем области прокрутки. В полосе видно не слой, а ХОЛСТ — его и красим.
 *
 * 🔴 ПОВЕРХНОСТЬ ВЫБРАНА НЕ СЛУЧАЙНО — «Связи», а не лендинг. Лайтбокс «Связей» вешает
 * `body { overflow: hidden }`, полоса прокрутки исчезает, а `scrollbar-gutter: stable`
 * продолжает резервировать 15px — и они остаются ПУСТЫМ фоном страницы. Это и есть светлая
 * щель, которую видел владелец. На лендинге тот же слой стоит при ЖИВОЙ полосе прокрутки:
 * там 15px занимает сама полоса, её не закрасить ничем, и опыт на ней ничего бы не доказал.
 * Первая редакция этого прибора мерила именно лендинг и дала два одинаковых кадра.
 *
 * Запуск: npm run stand → node tools/probe-bug65-edge.mjs
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const WIDTH = 1440;
const SHOTS = 'test-results/bug65-edge';

const browser = await chromium.launch();
await mkdir(SHOTS, { recursive: true });

for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: 860 },
    locale: 'ru-RU',
    deviceScaleFactor: 4, // предмет спора — 15px, их надо увидеть
  });
  await context.addInitScript((v) => localStorage.setItem('ndim-theme', v), theme);
  const page = await context.newPage();

  await page.goto(`${BASE}/relations`);
  await page.waitForSelector('.card .head', { timeout: 20000 });

  // Портрет живёт в РАСКРЫТОЙ карточке (bugs/104) — путь тот же, что у verify-bug104.
  const card = page.locator('.card').first();
  await card.locator('.who').click();
  await page.waitForTimeout(500);
  await card.locator('.head button.peek').click();
  await page.waitForSelector('.lightbox', { timeout: 5000 });
  await page.waitForTimeout(400);

  const locked = await page.evaluate(() => getComputedStyle(document.body).overflow);
  // Правая полоса в 60px: там и живёт спорная щель шириной ~15px.
  const clip = { x: WIDTH - 60, y: 240, width: 60, height: 220 };

  // ── Кадр 2: продукт КАК ЕСТЬ, то есть с покраской холста (вылеченное состояние) ──
  await page.screenshot({ path: `${SHOTS}/${theme}-2-vylecheno.png`, clip });
  const cured = await page.evaluate(
    () => getComputedStyle(document.documentElement).backgroundColor,
  );

  // ── Кадр 1: возвращаем ДЕФЕКТ прямо на этой же странице — снимаем покраску холста ──
  await page.evaluate(() => {
    document.documentElement.style.backgroundColor = '';
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/${theme}-1-defekt.png`, clip });

  // ── Кадр 3: контроль ПРИБОРА (EXP-0082). Опыт обязан УМЕТЬ показать разницу — иначе два
  // одинаковых кадра читались бы как «щели нет» на любом коде. Красим холст заведомо ярким:
  // не увидев разницы и здесь, прибор доказывал бы только собственную слепоту.
  await page.evaluate(() => {
    document.documentElement.style.backgroundColor = 'rgb(255, 0, 0)';
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/${theme}-3-kontrol.png`, clip });

  console.log(`  ${theme}: скролл-лок body=${locked} · холст вылеченного продукта ${cured}`);

  await context.close();
}

console.log(`\nкадры: ${SHOTS}/  (-1-defekt · -2-vylecheno · -3-kontrol)`);
await browser.close();

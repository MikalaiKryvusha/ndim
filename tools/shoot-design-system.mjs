#!/usr/bin/env node
/**
 * СЪЁМЩИК БИБЛИОТЕКИ — «Компоненты» и «Дизайн-схема» для развёртки.
 *
 * ПОВОД — вопрос владельца 2026-09-05: «*В нашем инструменте ты сделал раздел "Компоненты" и
 * раздел "Дизайн-схема" — по аналогии с Figma?*» и следом «*если не сделал — делай*». Не сделал.
 *
 * 🔑 ЧЕМ ЭТО ОТЛИЧАЕТСЯ ОТ ФИГМЫ, И ПОЧЕМУ ОТЛИЧИЕ В НАШУ ПОЛЬЗУ. В Фигме библиотека — ИСТОЧНИК,
 * из которого потом делают код, и она расходится с кодом молча, потому что связь между ними
 * держится человеком. Здесь наоборот: библиотека СНИМАЕТСЯ С ЖИВОГО ПРОДУКТА. Компонент — кроп
 * настоящего элемента на настоящем экране; токен — значение, прочитанное из вычисленных стилей
 * браузера, а не переписанное руками. Разойтись с кодом такая библиотека не может по построению:
 * пересняли — увидели правду.
 *
 * ⛔ ЧЕГО НЕ ДЕЛАЕТ. Не судит красоту, не предлагает править компоненты и не заменяет глаз
 * владельца. Снимает и показывает.
 *
 * Запуск:  node tools/shoot-design-system.mjs [--base http://127.0.0.1:5173]
 *          node tools/shoot-design-system.mjs --selftest
 * Кладёт:  test-results/design-system/<id>.png + design/flow-map/design-system.json
 * Коды:    0 — снято; 1 — список болен или ни один компонент не найден.
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ЗАПУЩЕН_НАПРЯМУЮ = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

const OUT = 'test-results/design-system';
const МАНИФЕСТ = 'design/flow-map/design-system.json';

/**
 * КОМПОНЕНТЫ. Каждый — реальный элемент на реальном экране: адрес, где он живёт, и селектор.
 * `ширина` даётся тем, кому нужен десктоп (рельс навигации живёт от 1024px).
 *
 * Компонент, которого прибор не нашёл, — НЕ тихая дырка: он попадает в отчёт отдельной строкой.
 * Библиотека, молча потерявшая половину, хуже отсутствующей: по ней делают выводы.
 */
/*
 * 🔄 СПИСОК ПЕРЕПИСАН 2026-09-05 ПО СЛОВУ ВЛАДЕЛЬЦА: «*Компоненты неверно сделаны в KUIPS — иди
 * читать в интернете, что такое компоненты — это библиотека переиспользуемых UI примитивов,
 * которые много где повторяются, а не скриншотов с макета, как сейчас сделано*».
 *
 * Первая редакция кропала РАЗДЕЛЫ страниц (витрина чисел, мультиязычная карточка, полоса
 * каталога) — то, что встречается на одном экране один раз. Это не компоненты, это куски макета.
 * Компонент — то, что ПОВТОРЯЕТСЯ по экранам и собирается из общих правил (Atomic Design,
 * Brad Frost; `researches/66`): АТОМЫ (кнопка, поле, бейдж, аватар, звёзды, знак) → МОЛЕКУЛЫ
 * (пункт навигации, ряд аккаунта, карточка объекта, сегмент-контрол) → ОРГАНИЗМЫ (шапка, нижняя
 * панель, рельс — они стоят на каждом экране приложения). Слои названы именно так.
 */
export const КОМПОНЕНТЫ = [
  // ── АТОМЫ — неделимые кирпичи, из них собрано всё остальное
  { id: 'brand', имя: 'Знак N-сети', слой: 'Атомы', адрес: '/profile', селектор: 'header.bar .brand' },
  { id: 'btn', имя: 'Кнопка', слой: 'Атомы', адрес: '/profile?guest=1', селектор: '.btn:not(.ghost):not(.primary):not(.warn)', пауза: 6000 },
  { id: 'btn-primary', имя: 'Кнопка основная', слой: 'Атомы', адрес: '/profile?as=none', селектор: '.signin-screen .d.primary' },
  { id: 'btn-ghost', имя: 'Кнопка призрачная', слой: 'Атомы', адрес: '/profile?as=none', селектор: '.signin-screen .d.ghost' },
  { id: 'input', имя: 'Поле ввода', слой: 'Атомы', адрес: '/profile?as=none', селектор: '.signin-screen .inp', шаги: [{ клик: '.signin-screen .d.ghost' }] },
  { id: 'badge', имя: 'Бейдж состояния', слой: 'Атомы', адрес: '/profile?as=guest', селектор: 'header.bar .badge' },
  { id: 'avatar', имя: 'Аватар', слой: 'Атомы', адрес: '/profile', селектор: '.ava' },
  { id: 'stars', имя: 'Звёзды оценки', слой: 'Атомы', адрес: '/ru/catalog/movie', селектор: '.stars' },
  { id: 'theme-toggle', имя: 'Переключатель темы', слой: 'Атомы', адрес: '/profile?as=none', селектор: '.signin-screen .ctl .th' },
  { id: 'lang-toggle', имя: 'Переключатель языка', слой: 'Атомы', адрес: '/profile?as=none', селектор: '.signin-screen .ctl .lang' },
  { id: 'separator', имя: 'Разделитель «или»', слой: 'Атомы', адрес: '/profile?as=none', селектор: '.signin-screen .sep' },
  { id: 'nav-icons', имя: 'Иконки навигации (набор)', слой: 'Атомы', адрес: '/profile', селектор: 'nav.bnav' },

  // ── МОЛЕКУЛЫ — несколько атомов с общей ролью, повторяются по экранам
  { id: 'nav-item', имя: 'Пункт нижней навигации', слой: 'Молекулы', адрес: '/profile', селектор: 'nav.bnav a' },
  { id: 'rail-item', имя: 'Пункт рельса', слой: 'Молекулы', адрес: '/profile', селектор: 'nav.rail a', ширина: 1440 },
  { id: 'account-row', имя: 'Ряд аккаунта (иконка · подпись · шеврон)', слой: 'Молекулы', адрес: '/profile', селектор: '.arow' },
  { id: 'segmented', имя: 'Сегмент-контрол', слой: 'Молекулы', адрес: '/profile', селектор: '.seg' },
  { id: 'catalog-item', имя: 'Карточка объекта (список)', слой: 'Молекулы', адрес: '/ru/catalog/movie', селектор: 'article.hub li' },
  { id: 'fact', имя: 'Факт (число · подпись)', слой: 'Молекулы', адрес: '/', селектор: 'main .fact' },
  { id: 'confirm', имя: 'Врезка подтверждения', слой: 'Молекулы', адрес: '/profile?as=guest', селектор: '.awarn', пауза: 5000, шаги: [{ клик: 'button.arow:has-text("Выйти")' }] },

  // ── ОРГАНИЗМЫ — цельные блоки каркаса, стоят на каждом экране приложения
  { id: 'appbar', имя: 'Шапка приложения', слой: 'Организмы', адрес: '/profile', селектор: 'header.bar' },
  { id: 'publicbar', имя: 'Шапка публичной страницы', слой: 'Организмы', адрес: '/ru/dimension/donnie-darko-1hqyrh7o', селектор: 'header.bar' },
  { id: 'bottomnav', имя: 'Нижняя панель', слой: 'Организмы', адрес: '/profile', селектор: 'nav.bnav' },
  { id: 'siderail', имя: 'Рельс навигации', слой: 'Организмы', адрес: '/profile', селектор: 'nav.rail', ширина: 1440 },
  { id: 'guest-card', имя: 'Карточка гостя', слой: 'Организмы', адрес: '/profile?guest=1', селектор: 'xpath=//ul[contains(@class,"guest-facts")]/..', пауза: 6000 },
];

/** Проверка списка: без неё пустой селектор дал бы «компонент не найден» вместо «список болен». */
export function судить(список) {
  const беды = [];
  const ids = new Set();
  for (const к of список) {
    if (!к.id || ids.has(к.id)) беды.push(`повтор или пустой id: ${к.id}`);
    ids.add(к.id);
    if (!к.селектор) беды.push(`${к.id}: нет селектора`);
    if (!к.адрес?.startsWith('/')) беды.push(`${к.id}: адрес не путь`);
    if (!к.слой) беды.push(`${к.id}: не назван слой — библиотека без слоёв это свалка`);
  }
  return беды;
}

/**
 * Снять ДИЗАЙН-СХЕМУ: значения токенов из вычисленных стилей корня, в обеих темах, плюс
 * типографика с живых заголовков. Ничего не переписывается руками — только читается.
 */
export const СНЯТЬ_СХЕМУ = () => {
  const cs = getComputedStyle(document.documentElement);
  const токены = {};
  for (const лист of document.styleSheets) {
    let правила;
    try { правила = лист.cssRules; } catch (e) { continue; } // чужой источник
    for (const п of правила) {
      if (!п.style) continue;
      for (const имя of п.style) {
        if (имя.startsWith('--')) токены[имя] = cs.getPropertyValue(имя).trim();
      }
    }
  }
  const проба = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const s = getComputedStyle(e);
    return { кегль: s.fontSize, вес: s.fontWeight, интерлиньяж: s.lineHeight, гарнитура: s.fontFamily.split(',')[0].replace(/["']/g, '') };
  };
  return {
    токены,
    типографика: { h1: проба('h1'), h2: проба('h2'), h3: проба('h3'), текст: проба('p'), мелкий: проба('.dim, .muted, small') },
  };
};

if (ЗАПУЩЕН_НАПРЯМУЮ && process.argv.includes('--selftest')) {
  const беды = судить(КОМПОНЕНТЫ);
  const порча = судить([{ id: 'a', адрес: 'ru', селектор: '', слой: '' }]);
  console.log(беды.length === 0 ? `  ✅ список из ${КОМПОНЕНТЫ.length} компонентов здоров` : `  ❌ ${беды.join(' · ')}`);
  console.log(порча.length >= 3 ? '  ✅ порченый компонент краснит все три пункта' : `  ❌ порча дала ${порча.length}`);
  process.exit(беды.length === 0 && порча.length >= 3 ? 0 : 1);
}

if (ЗАПУЩЕН_НАПРЯМУЮ) {
  const i = process.argv.indexOf('--base');
  const БАЗА = (i > -1 ? process.argv[i + 1] : 'http://127.0.0.1:5173').replace(/\/$/, '');
  mkdirSync(OUT, { recursive: true });

  const беды = судить(КОМПОНЕНТЫ);
  if (беды.length) { console.error('✖ список компонентов болен: ' + беды.join(' · ')); process.exit(1); }

  const браузер = await chromium.launch();
  const снято = [];
  const пропало = [];

  console.log(`Библиотека: ${КОМПОНЕНТЫ.length} компонентов с ${БАЗА}\n`);
  for (const к of КОМПОНЕНТЫ) {
    const ширина = к.ширина ?? 390;
    const ctx = await браузер.newContext({ viewport: { width: ширина, height: 900 }, deviceScaleFactor: 2, locale: 'ru-RU' });
    await ctx.addInitScript(() => {
      try { localStorage.setItem('ndim-lang', 'ru'); localStorage.setItem('ndim-theme', 'light'); } catch (e) { /* приватный режим */ }
    });
    const page = await ctx.newPage();
    try {
      await page.goto(БАЗА + к.адрес, { waitUntil: 'domcontentloaded', timeout: 40_000 });
      await page.waitForTimeout(к.пауза ?? 3000);
      for (const шаг of к.шаги ?? []) {
        if (шаг.клик) await page.locator(шаг.клик).first().click({ timeout: 15_000 });
        await page.waitForTimeout(1000);
      }
      const el = page.locator(к.селектор).first();
      await el.waitFor({ state: 'visible', timeout: 12_000 });
      await el.screenshot({ path: `${OUT}/${к.id}.png` });
      const мера = await el.evaluate((e) => {
        const r = e.getBoundingClientRect();
        const s = getComputedStyle(e);
        return { ширина: Math.round(r.width), высота: Math.round(r.height), радиус: s.borderRadius, фон: s.backgroundColor };
      });
      снято.push({ ...к, файл: `${OUT}/${к.id}.png`, мера });
      console.log(`  ✅ ${к.имя.padEnd(32)} ${мера.ширина}×${мера.высота}`);
    } catch (err) {
      пропало.push({ id: к.id, имя: к.имя, почему: String(err.message).split('\n')[0].slice(0, 90) });
      console.error(`  ⚠️  ${к.имя.padEnd(32)} не найден — ${String(err.message).split('\n')[0].slice(0, 70)}`);
    }
    await ctx.close();
  }

  // ── дизайн-схема: обе темы с одной и той же страницы
  const схема = {};
  for (const тема of ['light', 'dark']) {
    const ctx = await браузер.newContext({ viewport: { width: 390, height: 900 }, locale: 'ru-RU' });
    await ctx.addInitScript((v) => { try { localStorage.setItem('ndim-theme', v); localStorage.setItem('ndim-lang', 'ru'); } catch (e) { /* приватный режим */ } }, тема);
    const page = await ctx.newPage();
    await page.goto(`${БАЗА}/profile?as=none`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    схема[тема] = await page.evaluate(СНЯТЬ_СХЕМУ);
    await ctx.close();
  }

  await браузер.close();

  writeFileSync(МАНИФЕСТ, JSON.stringify({
    _комментарий: [
      'СГЕНЕРИРОВАНО node tools/shoot-design-system.mjs — руками не править.',
      'Библиотека снимается С ЖИВОГО ПРОДУКТА: компонент — кроп настоящего элемента, токен —',
      'значение из вычисленных стилей браузера. Разойтись с кодом по построению не может.',
    ],
    снято: new Date().toISOString().slice(0, 10),
    компоненты: снято,
    пропало,
    схема,
  }, null, 1) + '\n', 'utf8');

  const токенов = Object.keys(схема.light?.токены ?? {}).length;
  console.log(`\n✅ снято компонентов ${снято.length} из ${КОМПОНЕНТЫ.length}${пропало.length ? `, не найдено ${пропало.length}` : ''}`);
  console.log(`✅ дизайн-схема: токенов ${токенов} в двух темах → ${МАНИФЕСТ}`);
  process.exit(снято.length ? 0 : 1);
}

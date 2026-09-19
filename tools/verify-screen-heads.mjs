/**
 * СТРАЖ ШАПКИ ЭКРАНОВ ПРИЛОЖЕНИЯ — заголовок и плашка-подсказка одной формы на всех экранах,
 * и во время загрузки тоже (стенд).
 *
 * Слово владельца 2026-09-19, дословно: «на разных страницах верх страницы оформлен по разному.
 * В Пространстве подпись "Ниже представлены текущие метрики и статистика Пространства NDim."
 * оформлена не как хелп карточка, как на других страницах. На профиле нет заголовка "Профиль".
 * Пока страницы грузятся, где-то есть заголовок+хелп карточка, где-то нет — везде должна быть,
 * пока контент грузится.»
 *
 * Канон — 1.x (`design/reference-1x/app-01…03`, `app-08`): заголовок экрана и под ним серая
 * плашка-подсказка; у «Меню» только заголовок.
 *
 * ЧТО УТВЕРЖДАЕТСЯ (по каждому экрану × тема × ширина, критерии объявлены ДО прогона):
 *   Ш1 · заголовок экрана виден и равен подписи вкладки нижней панели («Профиль», «Связи»…);
 *   Ш2 · плашка-подсказка видна под заголовком и оформлена карточкой (свой фон, поля ≥ 8px) —
 *        у всех экранов, кроме «Меню», где её нет и в 1.x;
 *   Ш3 · то же самое ПОКА ЭКРАН ГРУЗИТСЯ: карточка «Загрузка» на экране, а шапка — над ней;
 *   Ш4 · шапка ОДНОЙ ФОРМЫ на всех экранах: у заголовков и у плашек одинаковы кегль, насыщенность,
 *        цвет, фон, поля и скругление (жалоба владельца — именно на разнобой).
 *
 * Контроль прибора ПЕРВЫМ: фаза «грузится» засчитывается, только если карточка «Загрузка»
 * действительно на экране (база придерживается роутом) — иначе «шапка видна при загрузке»
 * было бы зелено на экране, который загрузки не показывал вовсе. У «Меню» загрузки нет.
 *
 * Только читает. Требует поднятый `npm run stand` (на голом адресе стенд входит `dev@`).
 * Запуск: node tools/verify-screen-heads.mjs [--quick]   (--quick — одна тема × 390)
 * Кадры верха экранов: test-results/screen-heads/
 *
 * [TESTED: 2026-09-19 · стенд: на старом коде 9 провалов (ровно жалоба владельца), после починки 117/0 на
 *  390/1440 × light/dark; мутант «кегль плашки на одном экране» красный; кадры прочитаны глазами; отчёт
 *  qa/reports/2026-09-19_dims-flight-and-screen-heads.md]
 */

import { chromium } from '@playwright/test';
import { checkScreenHeads } from './lib/screen-head.mjs';

const BASE = 'http://localhost:5173';
const OUT = 'test-results/screen-heads';
const QUICK = process.argv.includes('--quick');

let failures = 0;
function check(ok, text) {
  console.log(`  ${ok ? '✅' : '❌'} ${text}`);
  if (!ok) failures += 1;
}

const combos = QUICK ? [['light', 390]] : [['light', 390], ['light', 1440], ['dark', 390], ['dark', 1440]];
const browser = await chromium.launch();
const contexts = [];

try {
  for (const [theme, width] of combos) {
    console.log(`\n═══ тема ${theme} · ширина ${width} ═══`);
    // Каждая фаза — в СВЕЖЕМ контексте: холодный старт экрана, как у человека, открывшего вкладку.
    const openPage = async () => {
      const context = await browser.newContext({ viewport: { width, height: 860 }, locale: 'ru-RU' });
      contexts.push(context);
      await context.addInitScript((value) => localStorage.setItem('ndim-theme', value), theme);
      return context.newPage();
    };
    await checkScreenHeads({ openPage, base: BASE, hold: /:8181\//, width, dir: `${OUT}/${theme}-${width}`, check });
  }
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser.close();
}

console.log(failures === 0 ? '\n✅ ЗЕЛЁНЫЙ' : `\n❌ КРАСНЫЙ — провалов ${failures}`);
console.log(`кадры: ${OUT}/`);
process.exitCode = failures === 0 ? 0 : 1;

/**
 * СВОД СЫРЬЯ СПРОСА В ПЛАНОВЫЕ ИМЕНА — `plans/41`, шаг 3.
 * Жнецы пишут по языкам (`34_demand_tN_ru.json` — Вордстат, `34_demand_tN_en.json` — Bing:
 * разные контракты, общий файл они бы затирали); план называет сырьё `34_demand_tN.json` —
 * этот скрипт склеивает пары в них. Повторный прогон = байт-в-байт тот же результат.
 *
 * Запуск: node tools/merge-demand.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

for (const g of ['t0', 't3', 't10']) {
  const ru = `researches/34_demand_${g}_ru.json`;
  const en = `researches/34_demand_${g}_en.json`;
  if (!existsSync(ru) || !existsSync(en)) {
    console.error(`ПРОПУСК ${g}: нет ${existsSync(ru) ? en : ru} — жатва не закончена`);
    process.exitCode = 1;
    continue;
  }
  const R = JSON.parse(readFileSync(ru, 'utf8'));
  const E = JSON.parse(readFileSync(en, 'utf8'));
  const out = {
    _: `Добор спроса группы ${g.toUpperCase()} (plans/41 шаг 3, замер 2026-08-14). ` +
      'ru — Яндекс.Вордстат (показы/мес с уточнениями, регион все); ' +
      'en — Bing Webmaster (точные показы доли Bing; Bing ≠ Google, порядок величин, не абсолют). ' +
      'Линейки РАЗНЫЕ — ru и en между собой не сравниваются.',
    ru: { собрано: R.собрано, результаты: R.результаты },
    en: { собрано: E.собрано, результаты: E.результаты },
  };
  const file = `researches/34_demand_${g}.json`;
  writeFileSync(file, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`${file}: ru ${R.собрано} + en ${E.собрано}`);
}

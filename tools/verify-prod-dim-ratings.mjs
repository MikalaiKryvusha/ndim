#!/usr/bin/env node
/**
 * ПРИБОР ПРОВЕРКИ БОЯ для `bugs/111` — сошлась ли сводка оценок каталога после выката.
 *
 * ТОЛЬКО ЧИТАЕТ. Ничего не пишет и не меняет; анонимную учётную запись удаляет за собой.
 * AUTH: интервью №013 В2 = Б (анонимный вход в бой ради чтения) + прямое разрешение владельца
 * читать каталог. Приватные оценки `points/{uid}/dims/*` прибор не трогает и не может.
 *
 * 🔑 ЧТО ИМЕННО ПРОВЕРЯЕТСЯ — СХОДИМОСТЬ, КОТОРУЮ НЕЛЬЗЯ ПОДДЕЛАТЬ.
 * Сумма `rates` по всему каталогу и `space/stats.ratings` считаются РАЗНЫМИ путями: первая —
 * сворачиванием по измерениям, вторая — сворачиванием по людям (`model/stats.ts`). Совпасть по
 * случайности они не могут; именно их расхождение (4058 против 4089) и завело `bugs/111`.
 *
 * ⚠️ ЧЕСТНАЯ ГРАНИЦА: полного нуля здесь ждать НЕЛЬЗЯ. Оценка может стоять на измерении,
 * которого в каталоге больше нет («сирота»): в `stats.ratings` она есть, а положить её в каталог
 * некуда. Такие оценки — ЕДИНСТВЕННЫЙ законный источник расхождения, и вычислитель объявляет
 * число сиротских измерений в своём логе. Поэтому прибор судит так: расхождение обязано быть
 * НЕОТРИЦАТЕЛЬНЫМ и небольшим, а НЕ нулевым.
 *
 * Запуск:  node tools/verify-prod-dim-ratings.mjs
 * Выход:   0 — сошлось; 1 — есть провалы.
 */
const API_KEY = 'AIzaSyCZsGkY0Lw_OJ35QhRumcD5RzNJUFsAsww';
const DOCS = 'https://firestore.googleapis.com/v1/projects/ndim-space/databases/(default)/documents';

let failed = 0;
let passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const num = (v) => Number(v?.integerValue ?? v?.doubleValue ?? 0);

const signUp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ returnSecureToken: true }),
});
if (!signUp.ok) {
  console.error(`❌ анонимный вход не удался: HTTP ${signUp.status}`);
  process.exit(1);
}
const session = await signUp.json();
const auth = { Authorization: `Bearer ${session.idToken}` };

try {
  // ── Каталог: сумма rates, и заодно целостность троицы stars/rates/rating ──
  console.log('\n— каталог: сводка оценок —');
  let pageToken = '';
  let dims = 0;
  let ratesSum = 0;
  let starsSum = 0;
  let withRates = 0;
  let ratingBroken = 0;
  let ratingOutOfRange = 0;
  let starsOutOfBounds = 0;
  let allZeroRaters = 0;
  do {
    const url = `${DOCS}/dims?pageSize=300` + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const res = await fetch(url, { headers: auth });
    if (!res.ok) {
      console.error(`❌ HTTP ${res.status}: ${await res.text()}`);
      process.exit(1);
    }
    const body = await res.json();
    for (const d of body.documents ?? []) {
      if (d.name.endsWith('/dims_list')) continue; // индекс — не измерение
      const f = d.fields ?? {};
      const rates = num(f.rates);
      const stars = num(f.stars);
      const rating = num(f.rating);
      dims += 1;
      ratesSum += rates;
      starsSum += stars;
      if (rates > 0) {
        withRates += 1;
        // `rating` = stars / rates, округлённое до 0,1 (`schema.ts:244-249`).
        if (Math.abs(Math.round((stars / rates) * 10) / 10 - rating) > 0.001) ratingBroken += 1;
        /*
         * ⚠️ ЗДЕСЬ ПЕРВАЯ РЕДАКЦИЯ ПРИБОРА СОВРАЛА, и урок стоит дороже самой строки.
         * Она требовала `stars > 0` при `rates > 0` — «оценили, значит сумма не ноль». Прибор
         * покраснел на двух измерениях, и я чуть не пошёл чинить продукт. Но шкала продукта —
         * **0…10**, и НОЛЬ — ЗАКОННАЯ ОЦЕНКА: измерение, которому все поставили 0, честно имеет
         * `stars = 0` при `rates = 2`. Те же две записи были и в дораскатном срезе, то есть
         * дефекта не было вовсе — было ложное допущение в новой проверке.
         * Настоящий инвариант шкалы — границы суммы, и вот он.
         */
        if (stars < 0 || stars > rates * 10) starsOutOfBounds += 1;
        if (stars === 0) allZeroRaters += 1;
      }
      if (rating < 0 || rating > 10) ratingOutOfRange += 1;
    }
    pageToken = body.nextPageToken ?? '';
  } while (pageToken);

  check('каталог прочитан целиком', dims > 5000, `измерений ${dims}`);
  check('измерений с оценками', withRates > 0, `${withRates}`);
  check('rating = stars / rates во ВСЕХ записях с оценками', ratingBroken === 0,
    ratingBroken === 0 ? 'расхождений нет' : `расходится у ${ratingBroken}`);
  check('rating нигде не вышел из 0…10', ratingOutOfRange === 0,
    ratingOutOfRange === 0 ? '' : `${ratingOutOfRange} записей`);
  check('сумма звёзд лежит в границах шкалы 0…10 × число оценивших', starsOutOfBounds === 0,
    starsOutOfBounds === 0 ? '' : `вне границ у ${starsOutOfBounds}`);
  // Не проверка, а наблюдение: ноль — законная оценка, и такие измерения существуют честно.
  console.log(`  ℹ измерений, которым ВСЕ поставили ноль: ${allZeroRaters}`);

  // ── Статистика Пространства: та же величина, посчитанная ДРУГИМ путём ──
  console.log('\n— сходимость с space/stats —');
  const statsRes = await fetch(`${DOCS}/space/stats`, { headers: auth });
  if (!statsRes.ok) {
    console.error(`❌ space/stats: HTTP ${statsRes.status}`);
    process.exit(1);
  }
  const statsRatings = num((await statsRes.json()).fields?.ratings);

  const gap = statsRatings - ratesSum;
  console.log(`  сумма rates по каталогу : ${ratesSum}`);
  console.log(`  space/stats.ratings     : ${statsRatings}`);
  console.log(`  сумма stars по каталогу : ${starsSum}`);
  console.log(`  расхождение             : ${gap}`);

  check('расхождение НЕОТРИЦАТЕЛЬНО (каталог не насчитал лишнего)', gap >= 0, `${gap}`);
  /*
   * 🎯 УСТАНОВИВШЕЕСЯ СОСТОЯНИЕ — РОВНО НОЛЬ, и допуска здесь больше нет.
   *
   * Пока сироты только считались, разрыв был законным (31, потом 25 — оценки на измерениях вне
   * каталога есть в `stats.ratings`, а положить их в каталог некуда). С появлением чистки
   * (`bugs/111`, слово владельца 2026-08-03) сирот не остаётся вовсе, и любой ненулевой разрыв
   * снова означает сломанный механизм.
   *
   * ⚠️ ЕДИНСТВЕННОЕ законное окно ненулевого разрыва: владелец удалил измерение, а ночной полный
   * проход ещё не прошёл — до суток. Если прибор покраснел, СНАЧАЛА посмотри в лог вычислителя
   * строку «сироты:»: есть она — это окно, и разрыв обязан равняться числу оценок из неё.
   * Нет её — механизм действительно сломан.
   */
  check('🎯 расхождение РОВНО НОЛЬ', gap === 0,
    gap === 0 ? 'счётчики сошлись точно' : `${gap} — проверь строку «сироты:» в логе вычислителя`);
} finally {
  await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: session.idToken }),
  });
  console.log('\n🧹 анонимная учётная запись удалена.');
}

console.log(`\n${failed === 0 ? '✅' : '❌'} проверок ${passed + failed} · провалов ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);

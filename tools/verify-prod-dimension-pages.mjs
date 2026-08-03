#!/usr/bin/env node
/**
 * ПРОВЕРКА ВЫКАТА ПО БОЮ — фаза 5 эпика `ideas/30`.
 *
 * Ходит на живой `ndimspace.app` и проверяет, что выкачено ровно то, что собиралось. Читает
 * только публичные адреса, ничего не пишет и никуда не входит.
 *
 * 🔴 Зачем отдельно от `verify-dimension-pages.mjs`: тот судит `build/` на диске. Между сборкой и
 * боем лежат хостинг, его правила переписывания и `cleanUrls` — и ровно там прячутся дефекты,
 * которых на диске не видно (адрес без `.html`, редиректы, кэш).
 *
 * Запуск: node tools/verify-prod-dimension-pages.mjs
 */
const ORIGIN = process.env.NDIM_ORIGIN ?? 'https://ndimspace.app';

let failed = 0;
let passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed += 1; else failed += 1;
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const get = async (path) => {
  const res = await fetch(`${ORIGIN}${path}`, { redirect: 'follow' });
  return { status: res.status, url: res.url, text: await res.text() };
};

// Три граничных случая правила оценок + случай без года и автора.
const CASES = [
  ['skiing-11mnoskt', '3 голоса, без года и автора'],
  ['perfect-stranger-00s8ckka', '0 голосов'],
  ['warcraft-iii-reign-of-chaos-2vvdn7dc', '4 голоса'],
];

console.log(`\nПРОВЕРКА БОЯ — ${ORIGIN}\n`);

console.log('— страницы каталога отдаются на обоих языках —');
for (const [slug, label] of CASES) {
  for (const lang of ['ru', 'en']) {
    const r = await get(`/${lang}/dimension/${slug}`);
    check(`/${lang}/dimension/${slug} (${label})`, r.status === 200, `HTTP ${r.status}`);
    if (r.status === 200) {
      check(`  · <html lang="${lang}">`, r.text.includes(`<html lang="${lang}"`));
      check('  · canonical на свой адрес', r.text.includes(`href="${ORIGIN}/${lang}/dimension/${slug}"`));
      check('  · hreflang обоих языков', r.text.includes('hreflang="ru"') && r.text.includes('hreflang="en"'));
      check('  · x-default объявлен', r.text.includes('hreflang="x-default"'));
    }
  }
}

console.log('\n— описание лежит в СЫРОМ HTML, а не подгружается —');
{
  const ru = await get('/ru/dimension/skiing-11mnoskt');
  const en = await get('/en/dimension/skiing-11mnoskt');
  check('русское описание в отданном HTML', /Практика передвижения по снегу/.test(ru.text));
  check('английское описание в отданном HTML', /The practice of moving across snow/.test(en.text));
}

console.log('\n— правило показа оценок —');
{
  const zero = await get('/ru/dimension/perfect-stranger-00s8ckka');
  check('без голосов — звёзд нет', !zero.text.includes('★'), '');
  check('без голосов — стоит «Ещё без голосов»', zero.text.includes('Ещё без голосов'));
  const many = await get('/ru/dimension/warcraft-iii-reign-of-chaos-2vvdn7dc');
  check('с голосами — звёзды есть', many.text.includes('★'));
  /*
   * 🔄 Правило и формулировка сменились 2026-08-03 (решения владельца): счётчик показывается при
   * ЛЮБОМ числе оценивших, а текст стал «оценено N людьми» вместо «оценили: N».
   * Здесь стерёгся прежний порог «≥3» прежними словами — и страж покраснел на ИСПРАВНОМ бою.
   * 🔑 Ловим форму «оценено <число>», а не фразу целиком: склонение зависит от числа.
   */
  check('счётчик показан там, где есть голоса', /оценено\s+\d+/.test(many.text));
  // 🏷 Бренд-имя рейтинга — на месте (слово владельца 2026-08-03).
  check('🏷 оценка названа «NDim Space Rating»', many.text.includes('NDim Space Rating'));
  // 🔴 Подпись второго названия больше не врёт про «оригинал» (`bugs/116`).
  check('второе название подписано ЯЗЫКОМ, а не «оригиналом»',
    !/В оригинале|Original title/.test(many.text));
}

console.log('\n— карта сайта и робот —');
{
  const map = await get('/sitemap.xml');
  const locs = (map.text.match(/<loc>/g) ?? []).length;
  const dims = (map.text.match(/\/dimension\//g) ?? []).length;
  check('sitemap.xml отдаётся', map.status === 200, `HTTP ${map.status}`);
  check('в карте есть страницы каталога', dims > 10000, `${dims} из ${locs} адресов`);
  const robots = await get('/robots.txt');
  check('robots.txt не запрещает обход', robots.status === 200 && /Disallow:\s*$/m.test(robots.text));
}

console.log('\n— старое не сломано —');
{
  const home = await get('/');
  check('лендинг отдаётся', home.status === 200, `HTTP ${home.status}`);
  check('лендинг остался русским', home.text.includes('<html lang="ru"'));
  const priv = await get('/profile');
  check('личный экран по-прежнему под noindex', priv.text.includes('noindex'));
}

console.log(`\n${failed ? '🔴' : '✅'} ИТОГ: ${passed} прошло, ${failed} провалов\n`);
process.exit(failed ? 1 : 0);

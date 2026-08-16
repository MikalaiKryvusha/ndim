#!/usr/bin/env node
/**
 * СТРАЖ СЕМЕЙСТВА СТРАНИЦ ТЕСТ — `plans/42` шаг 3 (план стража — `plans/47`).
 *
 * Судит СОБРАННЫЙ САЙТ (`build/`), а не исходники. Восемь публичных страниц семейства
 * (`/{ru,en}/tests` и три обёртки `/{ru,en}/test/{compatibility,personality,love}`) выкачены в
 * бой 2026-08-14 и до этого прибора не стереглись ничем: регрессия «уехал noindex», «пропала
 * самоссылка hreflang», «страница выпала из sitemap», «в HTML протёк адрес или uid» проходила
 * молча. Юнит здесь не годится по построению — все проверяемые свойства принадлежат ОТДАННОМУ
 * ФАЙЛУ, а не функции.
 *
 * Запуск:  npm run build ; node tools/verify-test-pages.mjs
 * Выход:   0 — чисто; 1 — есть провалы.
 *
 * ⚠️ Страж читает `build/`, а не `src/`. После любой правки исходников (в том числе мутационной
 * и её отката) сборка ОБЯЗАТЕЛЬНА — иначе прогон судит предыдущую версию (`EXP` про `build/` как
 * побочный продукт последнего прогона).
 *
 * 🔑 Проверки идут ПО СТРАНИЦАМ, а не сводными счётчиками: адресность и есть то, чем страж
 * доказывается. Мутация в хабе обязана уронить ровно две строки (два языка хаба), мутация в
 * обёртке — ровно шесть.
 */
import { readFileSync, existsSync } from 'node:fs';

const BUILD = 'build';
const LANGS = ['ru', 'en'];
const ORIGIN = 'https://ndimspace.app';

/* Состав семейства фиксирован интервью №028 — каталог не читаем, список объявлен константой. */
/*
 * 🔑 Порог видимого текста — АДРЕСНЫЙ, и это правка плана `plans/47` по замеру, а не поблажка.
 * План ожидал «самая короткая страница длиннее 1200» и предлагал один порог 900 на все восемь.
 * Замер собранного 2026-08-16: хабы — 945 и 949 знаков, обёртки — 1769…2196. То есть единый
 * порог 900 стоял бы в пяти процентах от правды у хаба (ложное падение от любой правки текста)
 * и был бы СЛЕПЫМ у обёртки: потеря половины содержания V5 оставила бы его зелёным.
 * Хаб — индексная страница по замыслу, обёртка несёт полный текст; поэтому и порога два.
 */
const PAGES = [
  { file: (l) => `${BUILD}/${l}/tests.html`, path: (l) => `/${l}/tests`, what: 'хаб «Тесты»', minText: 800 },
  { file: (l) => `${BUILD}/${l}/test/compatibility.html`, path: (l) => `/${l}/test/compatibility`, what: 'совместимость', minText: 1500 },
  { file: (l) => `${BUILD}/${l}/test/personality.html`, path: (l) => `/${l}/test/personality`, what: 'личность', minText: 1500 },
  { file: (l) => `${BUILD}/${l}/test/love.html`, path: (l) => `/${l}/test/love`, what: 'калькулятор любви', minText: 1500 },
];

let failed = 0;
let passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (!existsSync(BUILD)) {
  console.error('❌ нет каталога build/ — сначала `npm run build`');
  process.exit(1);
}

/** Видимый текст: выкидываем скрипты, стили, комментарии и теги. */
const visible = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/*
 * Приватность. Тот же блок, что у стража каталога: страницы теста публичны и человека на них
 * быть не может ни при каких обстоятельствах — результат живёт в браузере и в `testPairs`,
 * а не в отданном файле.
 */
const LEAKS = [
  [/[\w.+-]+@[\w-]+\.[a-z]{2,}/i, 'адрес почты'],
  [/"uid"\s*:/, 'поле uid'],
  [/\/points\//, 'путь к приватным оценкам'],
];

/*
 * Словарь продукта (`AGENT_GUIDE.md` → «Словарь продукта», «Правила текста»). Спрашивается по
 * ВИДИМОМУ тексту: запрет — на то, что читает человек. Пробелы в паттернах осей обязательны,
 * иначе «восьмую» и «оси» внутри слов дают ложные срабатывания.
 * 🟡 «Калькулятор любви» — утверждённое имя страницы (интервью №028), в запрет не входит.
 */
const BANNED_WORDS = [
  [/ ось/, 'жаргон «ось»'],
  [/ оси /, 'жаргон «оси»'],
  [/навсегда/, 'запрещённое слово «навсегда»'],
  [/forever /i, 'запрещённое слово «forever»'],
];

// ── Страницы: существование, содержание, разметка ────────────────────────────
for (const lang of LANGS) {
  for (const p of PAGES) {
    const file = p.file(lang);
    const path = p.path(lang);
    console.log(`\n— ${path} (${p.what}) —`);

    if (!existsSync(file)) {
      check('страница собрана', false, file);
      continue;
    }
    check('страница собрана', true, file);

    const html = readFileSync(file, 'utf8');
    const text = visible(html);

    // Содержание отдано ГОТОВЫМ, а не собирается скриптом: страница живёт для поиска.
    check('есть непустой <title>', /<title>[^<]{3,}<\/title>/.test(html));
    const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
    check('есть <meta name="description"> длиной ≥ 20', desc.length >= 20, `${desc.length} знаков`);
    check(`видимого текста больше ${p.minText} знаков`, text.length > p.minText, `${text.length}`);
    check('в разметке есть «NDim Space»', html.includes('NDim Space'));
    // 🔴 Тест открыт поиску ПО ЗАМЫСЛУ (`plans/42`) — в отличие от экранов приложения.
    check('нет noindex', !/noindex/i.test(html));

    // canonical: собранный HTML пишет `rel` перед `href` и закрывает тег слэшем — сравниваем
    // подстрокой до закрывающего символа, чтобы страж не зависел от формы самозакрытия.
    check('canonical — на свой языковой адрес',
      html.includes(`rel="canonical" href="${ORIGIN}${path}"`), `${ORIGIN}${path}`);

    // hreflang: три объявления и ОБЯЗАТЕЛЬНАЯ самоссылка — разметка без самоссылки
    // игнорируется поиском целиком (`researches/26` §4.1).
    const missing = [];
    for (const l of LANGS) {
      if (!html.includes(`hreflang="${l}" href="${ORIGIN}${p.path(l)}"`)) missing.push(l);
    }
    check('hreflang двусторонний и с самоссылкой', missing.length === 0,
      missing.length ? `нет объявления: ${missing.join(', ')}` : '');
    check('x-default объявлен', html.includes('hreflang="x-default"'));

    const leaks = LEAKS.filter(([re]) => re.test(html)).map(([, what]) => what);
    check('нет данных человека в HTML', leaks.length === 0, leaks.join(' · '));

    const banned = BANNED_WORDS.filter(([re]) => re.test(text)).map(([, what]) => what);
    check('нет запрещённой лексики в видимом тексте', banned.length === 0, banned.join(' · '));
  }
}

// ── Карта сайта ──────────────────────────────────────────────────────────────
console.log('\n— карта сайта —');
{
  const p = `${BUILD}/sitemap.xml`;
  if (!existsSync(p)) {
    check('sitemap.xml собран', false);
  } else {
    const xml = readFileSync(p, 'utf8');
    const hits = (xml.match(/\/(tests|test\/(?:compatibility|personality|love))<\/loc>/g) ?? []).length;
    check('sitemap несёт 8 адресов семейства ТЕСТ', hits === 8, `нашлось ${hits}`);
  }
}

console.log(`\n${failed ? '🔴' : '✅'} ИТОГ: ${passed} прошло, ${failed} провалов\n`);
process.exit(failed ? 1 : 0);

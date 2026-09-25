// Юниты правдивого `<lastmod>` (`tools/lib/sitemap-lastmod.mjs`, план `plans/NEW_sitemap_truthful_lastmod.md`, FORK Б).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { buildFileOf, lastmodViolations, pageFingerprint, parseLedger, RULES, SERVICE, significantParts, sitemapPaths, stampLastmod, stripByClass, w3cNow } from './sitemap-lastmod.mjs';

/** Страница по образцу собранной карточки каталога: служебное подставляется параметрами. */
function page({ hash = 'a1b2c3', css = 'svelte-d710dx', chunk = 'DrtlQxDa', nums = '95', text = 'Японская видеоигра 1998 года.', title = '1080° Snowboarding', ld = 'VideoGame', href = '/ru/catalog', year = '2026', build = '2195 · 22:44' } = {}) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8" />
<link href="../../_app/immutable/assets/0.${chunk}.css" rel="stylesheet">
<link rel="modulepreload" href="../../_app/immutable/entry/start.${chunk}.js">
<meta name="description" content="${text}" class="${css}"/>
<link rel="canonical" href="https://ndimspace.app/ru/dimension/x" class="${css}"/>
<link rel="alternate" hreflang="en" href="https://ndimspace.app/en/dimension/x" class="${css}"/>
<title>${title} — NDim Space</title>
<script type="application/ld+json">{"@type":"${ld}","name":"${title}"}</script>
</head><body data-sveltekit-preload-data="hover"><div style="display: contents"><!--[--><main class="${css}">
<h1 class="${css}">${title}</h1><p class="${css}">${text}&nbsp;Оценок: 3</p>
<ul class="nums ${css}"><!--[--><li class="${css}"><b class="${css}">${nums}</b><span>человек в Пространстве</span></li><!--]--></ul>
<section class="card ${css}"><div class="vers ${css}"><div class="ver ${css}"><span class="k">Приложение</span><span class="t">Собрано ${build}</span></div><div class="ver"><span>Сервер синхронизации</span></div></div><p>После версий</p></section>
<a href="${href}" class="${css}">Каталог</a><footer>© ${year} NDim Space</footer><!--]--></main></div>
<script>{ __sveltekit_${hash} = { base: new URL("../..", location).pathname.slice(0, -1) }; import("../../_app/immutable/entry/start.${chunk}.js"); }</script>
</body></html>`;
}

test('🔴 пересборка без правок — тот же отпечаток: хеш сборки, классы Svelte, чанки, числа витрины, год копирайта', () => {
  const a = pageFingerprint(page());
  const b = pageFingerprint(page({ hash: 'zz9y8x', css: 'svelte-1o4rq58', chunk: 'Qq77Xx00', nums: '96', year: '2027', build: '2196 · 23:10' }));
  assert.equal(a, b);
});

test('🔴 виджет версий (номер и время сборки) вырезан целиком, со вложенными <div>, — текст после него цел', () => {
  const p = significantParts(page());
  assert.ok(!p.text.includes('Собрано') && !p.text.includes('Сервер синхронизации'), 'виджет версий исключён');
  assert.ok(p.text.includes('После версий'), 'содержимое после виджета не съедено');
});

test('🔴 значимое меняет отпечаток: основной текст · JSON-LD · ссылка · заголовок', () => {
  const base = pageFingerprint(page());
  assert.notEqual(pageFingerprint(page({ text: 'Японская видеоигра 1999 года.' })), base, 'текст');
  assert.notEqual(pageFingerprint(page({ ld: 'Game' })), base, 'JSON-LD');
  assert.notEqual(pageFingerprint(page({ href: '/ru/catalog/games' })), base, 'ссылка');
  assert.notEqual(pageFingerprint(page({ title: '1080 Snowboarding' })), base, 'заголовок');
});

test('части отпечатка видны по отдельности: служебного в них нет', () => {
  const p = significantParts(page());
  assert.equal(p.title, '1080° Snowboarding — NDim Space');
  assert.deepEqual(p.heads, ['canonical||https://ndimspace.app/ru/dimension/x', 'alternate|en|https://ndimspace.app/en/dimension/x']);
  assert.deepEqual(p.links, ['/ru/catalog']);
  assert.ok(!p.text.includes('человек в Пространстве'), 'витрина главной исключена');
  assert.ok(!p.text.includes('__sveltekit'), 'скрипты сборки исключены');
  assert.ok(p.text.includes('Японская видеоигра 1998 года. Оценок: 3'), '&nbsp; раскрыт, пробелы схлопнуты');
});

test('🔴 апостроф в описании читается целиком: правка ПОСЛЕ апострофа меняет отпечаток (v2)', () => {
  // Тело страницы одинаково — меняется только описание, и только после апострофа (`/en/dimension/parkland-04jpdbpx`).
  const withDesc = (d) => page().replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${d}"`);
  assert.equal(significantParts(withDesc("Parkland's history")).description, "Parkland's history");
  assert.notEqual(pageFingerprint(withDesc("Parkland's history")), pageFingerprint(withDesc("Parkland's story")));
  const single = page().replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content='A "quoted" word'`);
  assert.equal(significantParts(single).description, 'A "quoted" word', 'в одинарных кавычках двойная — часть значения');
});

test('🔴 служебные классы стоят в НАСТОЯЩИХ компонентах: числа главной и «Теста на совместимость», виджет версий', () => {
  // Фикстура `page()` несёт классы, которые написал автор юнита; здесь — те, что стоят в компонентах сейчас.
  for (const [tag, token, files] of SERVICE) {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const cut = stripByClass(source, tag, token);
      assert.ok(cut.length < source.length, `${file}: <${tag} class="${token}"> не найден или не закрыт — исключение молчит`);
    }
  }
});

test('🔴 список компонентов служебного класса ЗАМКНУТ: новый компонент с тем же классом краснеет здесь', () => {
  // Суд lastmod3 (2026-09-26): юнит выше стережёт только перечисленные файлы. Новый `<ul class="nums">` в другом
  // компоненте молча вырезался бы из отпечатка, и его переименование никто бы не поймал (класс twins-missed, EXP-0333).
  const svelte = readdirSync('src', { recursive: true })
    .map((p) => `src/${String(p).replaceAll('\\', '/')}`)
    .filter((p) => p.endsWith('.svelte'));
  for (const [tag, token, files] of SERVICE) {
    const found = svelte.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return stripByClass(source, tag, token).length < source.length;
    });
    assert.deepEqual(found.sort(), [...files].sort(), `<${tag} class="${token}">: компоненты в src и список SERVICE разошлись`);
  }
});

test('имя атрибута с границей: data-href за href не читается', () => {
  const html = page().replace('<a href="/ru/catalog"', '<a data-href="/x" href="/ru/catalog"');
  assert.deepEqual(significantParts(html).links, ['/ru/catalog']);
});

test('адрес карты → файл сборки и пути из карты', () => {
  assert.equal(buildFileOf('/'), 'index.html');
  assert.equal(buildFileOf('/ru'), 'ru.html');
  assert.equal(buildFileOf('/ru/dimension/x'), 'ru/dimension/x.html');
  assert.deepEqual(sitemapPaths('<url><loc>https://ndimspace.app/</loc></url>\n<url><loc>https://ndimspace.app/ru/test/love</loc></url>'), ['/', '/ru/test/love']);
});

const NOW = '2026-09-25T23:00:00+03:00';
const XML = '<urlset>\n  <url><loc>https://ndimspace.app/a</loc></url>\n  <url><loc>https://ndimspace.app/b</loc></url>\n  <url><loc>https://ndimspace.app/c</loc></url>\n</urlset>';
const PREV = { rules: RULES, pages: { '/a': { fp: 'fa', lastmod: '2026-09-20T10:00:00+03:00' }, '/b': { fp: 'fb', lastmod: null } } };

test('🔴 реестра нет (первый выкат, 404, сеть) — lastmod ни у кого, реестр только отпечатками', () => {
  const out = stampLastmod({ xml: XML, prev: null, prints: { '/a': 'fa', '/b': 'fb', '/c': 'fc' }, now: NOW });
  assert.ok(!out.xml.includes('<lastmod>'));
  assert.deepEqual(out.ledger.pages['/a'], { fp: 'fa', lastmod: null });
  assert.equal(out.stats.dated, 0);
});

test('🔴 прежний отпечаток — дата прежняя; другой — дата выката; новый адрес — дата выката; «нет даты» не превращается в сегодня', () => {
  const out = stampLastmod({ xml: XML, prev: PREV, prints: { '/a': 'fa', '/b': 'fb', '/c': 'fc' }, now: NOW });
  assert.equal(out.ledger.pages['/a'].lastmod, '2026-09-20T10:00:00+03:00');
  assert.equal(out.ledger.pages['/b'].lastmod, null);
  assert.equal(out.ledger.pages['/c'].lastmod, NOW);
  const changed = stampLastmod({ xml: XML, prev: PREV, prints: { '/a': 'fa2', '/b': 'fb', '/c': 'fc' }, now: NOW });
  assert.equal(changed.ledger.pages['/a'].lastmod, NOW);
  assert.ok(changed.xml.includes('<url><loc>https://ndimspace.app/a</loc><lastmod>2026-09-25T23:00:00+03:00</lastmod></url>'));
  assert.ok(changed.xml.includes('<url><loc>https://ndimspace.app/b</loc></url>'), 'без даты — без тега');
});

test('повторный штамп той же сборки даёт тот же результат (прежние lastmod снимаются)', () => {
  const once = stampLastmod({ xml: XML, prev: PREV, prints: { '/a': 'fa2', '/b': 'fb', '/c': 'fc' }, now: NOW });
  const twice = stampLastmod({ xml: once.xml, prev: PREV, prints: { '/a': 'fa2', '/b': 'fb', '/c': 'fc' }, now: NOW });
  assert.equal(twice.xml, once.xml);
});

test('реестр чужой формы или другой версии правил — «не прочитался», а не «всё изменилось»', () => {
  assert.equal(parseLedger('<!doctype html>'), null);
  assert.equal(parseLedger(JSON.stringify({ rules: 'sitemap-lastmod/v0', pages: {} })), null);
  assert.ok(parseLedger(JSON.stringify({ rules: RULES, pages: {} })));
});

test('🔴 страж штампа: дата позже выката, расхождение карты с реестром и сдвиг при прежнем отпечатке — нарушения', () => {
  const out = stampLastmod({ xml: XML, prev: PREV, prints: { '/a': 'fa', '/b': 'fb', '/c': 'fc' }, now: NOW });
  assert.deepEqual(lastmodViolations({ xml: out.xml, ledger: out.ledger, prev: PREV, now: NOW }), []);
  const future = { ...out.ledger, pages: { ...out.ledger.pages, '/c': { fp: 'fc', lastmod: '2026-09-26T00:00:00+03:00' } } };
  const futureXml = out.xml.replace(NOW, '2026-09-26T00:00:00+03:00');
  assert.ok(lastmodViolations({ xml: futureXml, ledger: future, prev: PREV, now: NOW }).some((v) => v.includes('позже выката')));
  const shifted = { ...out.ledger, pages: { ...out.ledger.pages, '/a': { fp: 'fa', lastmod: NOW } } };
  assert.ok(lastmodViolations({ xml: out.xml, ledger: shifted, prev: PREV, now: NOW }).some((v) => v.includes('в карте')));
});

test('момент выката — W3C Datetime с поясом', () => {
  assert.match(w3cNow(new Date('2026-09-25T20:00:00Z')), /^2026-09-2\dT\d\d:00:00[+-]\d\d:\d\d$/);
});

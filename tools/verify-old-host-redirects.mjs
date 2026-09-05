/**
 * СТРАЖ — СТАРЫЙ ХОСТ `ndim-space.web.app` УВОДИТ НА ДОМЕН КАЖДЫЙ МАРШРУТ ДЕРЕВА 2.0.
 *
 * ПОВОД (`bugs/NEW_old_host_serves_site_without_redirect`, 2026-09-05). Цель `app` в `firebase.json`
 * переадресовывала на домен семь путей версии 1.x, а всё, что появилось в 2.0 (`/ru/**`, `/en/**`,
 * каталог, хабы, тесты, карта сайта), старый хост отдавал сам — вторая копия сайта, и дверь
 * карточки на нём теряла гостя при уводе `/profile` на домен. Слово владельца: «*чини блять,
 * звучит как вопиющий баг*».
 *
 * ПОЧЕМУ НЕ ГЛОБАЛЬНОЕ «**». Тот же сайт отвечает на `ndim-space.firebaseapp.com`, где в
 * зарезервированном `/__/auth/**` живёт обработчик входа Firebase; правило «всё на домен» рискует
 * его накрыть, а ломать вход всем ради старого адреса нельзя. Поэтому список — ЯВНЫЙ, но
 * ВЫВОДИТСЯ из дерева `src/routes` и списка языков `src/lib/content/langs.ts`, а не пишется
 * руками (класс `bugs/226`: список, ведомый руками, молчит о своей неполноте).
 *
 * Правило: каждый верхний маршрут дерева `R` даёт две строки — `/R` и `/R/:rest*`; `[lang=lang]`
 * раскрывается в каждый язык; `sitemap.xml` — одна строка; корень `/` — одна строка.
 * Назначение — `https://ndimspace.app` + тот же путь, тип 301.
 *
 * Запуск:  node tools/verify-old-host-redirects.mjs            # проверка, код 1 при нехватке
 *          node tools/verify-old-host-redirects.mjs --fix      # переписать список в firebase.json
 *          node tools/verify-old-host-redirects.mjs --selftest # мутация: список без строки — красный
 * Ворота:  `npm run guards` (реестр `tools/guards.mjs`).
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DOMAIN = 'https://ndimspace.app';

/** Языки — из единственного места, где они объявлены. */
export function langs(root = ROOT) {
  const src = readFileSync(resolve(root, 'src/lib/content/langs.ts'), 'utf8');
  const m = src.match(/LANGS\s*=\s*\[([^\]]*)\]/);
  if (!m) throw new Error('langs.ts: не нашёл LANGS = [...]');
  return [...m[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]);
}

/** Верхние маршруты дерева `src/routes` (каталоги; файлы `+…` — не маршруты). */
export function topRoutes(root = ROOT) {
  const dir = resolve(root, 'src/routes');
  return readdirSync(dir)
    .filter((n) => !n.startsWith('+') && statSync(resolve(dir, n)).isDirectory())
    .sort();
}

/** Ожидаемые переадресации старого хоста — детерминированный список. */
export function expectedRedirects(root = ROOT) {
  const out = [{ source: '/', destination: `${DOMAIN}/`, type: 301 }];
  for (const r of topRoutes(root)) {
    const names = r === '[lang=lang]' ? langs(root) : [r];
    for (const n of names) {
      if (n.includes('.')) { out.push({ source: `/${n}`, destination: `${DOMAIN}/${n}`, type: 301 }); continue; }
      out.push({ source: `/${n}`, destination: `${DOMAIN}/${n}`, type: 301 });
      out.push({ source: `/${n}/:rest*`, destination: `${DOMAIN}/${n}/:rest*`, type: 301 });
    }
  }
  return out;
}

/** Переадресации цели `app` из firebase.json. */
export function actualRedirects(root = ROOT) {
  const cfg = JSON.parse(readFileSync(resolve(root, 'firebase.json'), 'utf8'));
  const site = cfg.hosting.find((h) => h.target === 'app');
  if (!site) throw new Error('firebase.json: цели `app` нет');
  return site.redirects ?? [];
}

const key = (r) => `${r.source} → ${r.destination} (${r.type})`;

/** Чего не хватает в конфиге против ожидания. */
export function missing(expected, actual) {
  const have = new Set(actual.map(key));
  return expected.filter((r) => !have.has(key(r)));
}

/** Переписать список цели `app` на месте, не трогая остальной файл (комментарии, отступы). */
export function fix(root = ROOT) {
  const path = resolve(root, 'firebase.json');
  const text = readFileSync(path, 'utf8');
  const at = text.indexOf('"target": "app"');
  if (at < 0) throw new Error('firebase.json: цели `app` нет');
  const start = text.indexOf('"redirects": [', at);
  const end = text.indexOf(']', start) + 1;
  if (start < 0 || end <= start) throw new Error('firebase.json: не нашёл "redirects" у цели `app`');
  const body = expectedRedirects(root)
    .map((r) => `        { "source": "${r.source}", "destination": "${r.destination}", "type": ${r.type} }`)
    .join(',\n');
  writeFileSync(path, `${text.slice(0, start)}"redirects": [\n${body}\n      ]${text.slice(end)}`, 'utf8');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) {
    const expected = expectedRedirects();
    const ok1 = missing(expected, expected).length === 0;
    const ok2 = missing(expected, expected.slice(1)).length === 1;
    const ok3 = missing(expected, expected.filter((r) => !r.source.startsWith('/ru'))).length >= 2;
    console.log(`${ok1 ? '✅' : '❌'} полный список — чисто · ${ok2 ? '✅' : '❌'} без корня — одна нехватка · ${ok3 ? '✅' : '❌'} без /ru — красный`);
    process.exit(ok1 && ok2 && ok3 ? 0 : 1);
  }
  if (argv.includes('--fix')) { fix(); console.log('firebase.json: список цели `app` переписан из дерева маршрутов'); }
  const expected = expectedRedirects();
  const lack = missing(expected, actualRedirects());
  console.log(`маршрутов дерева: ${topRoutes().length} · языков: ${langs().join(', ')} · ожидаемых правил: ${expected.length} · в конфиге: ${actualRedirects().length}`);
  if (lack.length === 0) { console.log('✅ старый хост уводит на домен каждый маршрут дерева'); process.exit(0); }
  console.log(`❌ старый хост отдаёт сам ${lack.length} маршрут(ов):`);
  for (const r of lack) console.log(`   · ${r.source}`);
  console.log('   починка: node tools/verify-old-host-redirects.mjs --fix');
  process.exit(1);
}

// Предохранитель запуска: импорт из юнита не исполняет работу (класс EXP-0188).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

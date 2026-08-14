/**
 * Страж заголовков кеширования В БОЮ — `bugs/124`.
 *
 * Дефект, ради которого он существует: у человека, который УЖЕ был на сайте, после выката
 * встречались HTML одной сборки и чанк другой (`__sveltekit_<хеш>` не совпадали), и приложение
 * не стартовало вовсе — `Cannot read properties of undefined (reading 'data')`.
 *
 * 🔑 Почему это стережётся ОТДЕЛЬНЫМ прибором, а не браузерным смоуком: боевые смоуки
 * (`verify-prod-b4` и прочие) ходят СВЕЖИМ контекстом Playwright — без кеша и без ранее открытой
 * вкладки. Состояния, в котором живёт дефект, у них нет по построению, и они были зелёными всё
 * время, пока дефект был в бою (тот же класс, что `EXP-0114`).
 *
 * Что судится — пара, которая и делает выкат безопасным:
 *   · HTML НЕ кешируется (`no-cache` / `max-age=0`): браузер обязан спросить и получить 304,
 *     иначе он час живёт со старым документом, ссылающимся на исчезнувшие чанки;
 *   · `/_app/immutable/**` кешируется НАДОЛГО (≥ 1 год, `immutable`): имя файла содержит хеш
 *     содержимого, такой файл не меняется никогда.
 *
 * Прибор только ЧИТАЕТ (HEAD-запросы), ничего не меняет и учётных записей не заводит.
 *
 * Запуск: `node tools/verify-prod-cache.mjs [--base https://ndimspace.app]`
 */
import { readdirSync } from 'node:fs';

const baseArg = process.argv.indexOf('--base');
const BASE = baseArg === -1 ? 'https://ndimspace.app' : process.argv[baseArg + 1];
/** Год в секундах — та граница, ниже которой «надолго» перестаёт быть надолго. */
const YEAR = 31536000;

let pass = 0;
const fails = [];

function check(ok, name, detail) {
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fails.push(`${name} — ${detail}`);
    console.log(`  ❌ ${name} — ${detail}`);
  }
}

async function head(url) {
  const r = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  return { status: r.status, cache: r.headers.get('cache-control') ?? '', etag: r.headers.get('etag') ?? '' };
}

/** Секунды из `max-age=N`; `null`, если директивы нет. */
function maxAge(value) {
  const found = /max-age=(\d+)/i.exec(value);
  return found === null ? null : Number(found[1]);
}

/**
 * Имя живого immutable-чанка берём ИЗ СБОРКИ, а не константой: хеши меняются каждый выкат, и
 * зашитое имя превратило бы стража в проверку прошлого (`EXP-0058` — «файла у нас нет», пока
 * файл лежал на диске).
 */
function anyChunk() {
  const dir = 'build/_app/immutable/chunks';
  const found = readdirSync(dir).filter((f) => f.endsWith('.js'));
  if (found.length === 0) throw new Error(`в ${dir} нет чанков — сначала npm run build`);
  return `/_app/immutable/chunks/${found[0]}`;
}

console.log(`\n▶ бой: ${BASE}`);

// ── HTML: браузер обязан спрашивать ─────────────────────────────────────────────────────────
for (const path of ['/profile', '/', '/ru/tests']) {
  const r = await head(BASE + path);
  const age = maxAge(r.cache);
  const noStore = /no-cache|no-store|must-revalidate/i.test(r.cache);
  check(
    r.status === 200,
    `[HTML ${path}] отвечает 200`,
    `код ${r.status}`,
  );
  check(
    noStore || age === 0,
    `[HTML ${path}] НЕ кешируется браузером`,
    `Cache-Control: «${r.cache || '—'}» — старый документ переживёт выкат и склеится с новыми чанками (bugs/124)`,
  );
  check(
    r.etag !== '',
    `[HTML ${path}] отдаёт ETag (иначе перепроверка бессмысленна)`,
    'ETag отсутствует',
  );
}

// ── immutable-ассеты: кеш на год ────────────────────────────────────────────────────────────
const chunk = anyChunk();
const asset = await head(BASE + chunk);
check(asset.status === 200, `[ассет ${chunk}] отвечает 200`, `код ${asset.status}`);
const assetAge = maxAge(asset.cache);
check(
  assetAge !== null && assetAge >= YEAR,
  `[ассет] кешируется НАДОЛГО (≥ ${YEAR} с)`,
  `Cache-Control: «${asset.cache || '—'}»`,
);
check(
  /immutable/i.test(asset.cache),
  '[ассет] помечен immutable',
  `Cache-Control: «${asset.cache || '—'}»`,
);

console.log('\n──────────────────────────────────────────────────────────────────────');
console.log(`Проверок пройдено: ${pass}   Провалов: ${fails.length}`);
for (const f of fails) console.log(`  ❌ ${f}`);
process.exit(fails.length === 0 ? 0 : 1);

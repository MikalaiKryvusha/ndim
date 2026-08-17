/**
 * ГЛАЗА АГЕНТА — разведка новинок культуры, которых в нашем каталоге НЕТ.
 *
 * Заказ владельца 2026-08-17, дословно: «*проведи интернет разведку новинок популярных, которых у
 * нас нет. Собери их список названий, тип, год. Затем в следующем чате ты 10 из них оформишь
 * кандидатами, я вычитаю и попробую одобрить. Протестируем контур целиком*».
 *
 * ПОЧЕМУ ИМЕННО WIKIDATA, а не «список из головы модели»:
 *   · решение владельца В2 = А (интервью №015) — Wikidata единственный основной реестр;
 *   · 🔴 канон эпика: «у кандидата обязателен РАЗРЕШИМЫЙ идентификатор реестра», и основание
 *     этому — цифры, а не вкус: ссылки, которые модель приводит по памяти, галлюцинируют в
 *     14–95 % случаев (`researches/29` §3.4). Здесь каждый кандидат приезжает с `QID`, который
 *     разрешается запросом, и с ЧИСЛОМ известности — количеством языковых разделов Википедии
 *     (`wikibase:sitelinks`, принятая мера);
 *   · знание модели устарело бы: у неё есть предел даты, а новинки нужны СЕГОДНЯШНИЕ.
 *
 * 🔑 ДЕДУПЛИКАЦИЯ ЧИСЛОМ, А НЕ НА ГЛАЗ (требование фазы 5 метаплана `plans/30`). Сверка идёт по
 * НОРМАЛИЗОВАННОМУ названию тем же нормализатором, что у поиска в продукте
 * (`model/feed.ts` → `normalizeForSearch`): вторая копия правил нормализации разъехалась бы с
 * первой на первом же дефисе, римской цифре или «ё».
 *
 * ⛔ ЧЕГО ЭТОТ ПРИБОР НЕ ДЕЛАЕТ: он НИЧЕГО не пишет в каталог. Ни одной записи, ни черновика.
 * Инвариант эпика В3 = А: агент никогда не заводит измерение без вычитки владельцем. Прибор
 * только СМОТРИТ и печатает список.
 *
 * Запуск: node tools/scout-wikidata-candidates.mjs [--year 2026] [--min-sitelinks 12] [--limit 400]
 * Пишет: candidates/scouts/<год>_wikidata_new_releases.md — ТЕЗИСНЫЙ СПИСОК (+ JSON в
 *         test-results/, из него агент пишет развёрнутые объекты в candidates/batches/).
 *         Устройство мастерской и правила заполнения — candidates/README.md.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

import { normalizeForSearch } from '../src/lib/model/feed.ts';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};

const YEAR = Number(arg('--year', '2026'));
const MIN_SITELINKS = Number(arg('--min-sitelinks', '12'));
const LIMIT = Number(arg('--limit', '400'));
const SNAPSHOT = 'src/lib/content/dims-build.json';
const OUT_MD = `candidates/scouts/${arg('--out', `${YEAR}_wikidata_new_releases`)}.md`;
const OUT_JSON = `test-results/scout-candidates-${YEAR}.json`;

/**
 * Виды объектов, которые мы ищем. Список сознательно короткий: это те виды, которых в каталоге
 * NDim большинство (`dim-kind.ts`), а не «всё, что есть в Wikidata».
 */
const KINDS = [
  { qid: 'Q11424', ru: 'Фильм', en: 'Film' },
  { qid: 'Q5398426', ru: 'Сериал', en: 'TV series' },
  { qid: 'Q7889', ru: 'Видеоигра', en: 'Video game' },
  { qid: 'Q7725634', ru: 'Книга', en: 'Book' },
  { qid: 'Q482994', ru: 'Альбом', en: 'Album' },
];

const ENDPOINT = 'https://query.wikidata.org/sparql';
/** Wikidata просит называть себя. Без внятного User-Agent сервис отвечает 403. */
const UA = 'NDimSpace-catalog-scout/1.0 (https://ndimspace.app; agent of NDim Space 2.0)';

/**
 * Один запрос на ОДИН вид объекта, а не всё сразу: широкий запрос по пяти видам упирается в
 * 60-секундный потолок WDQS и отдаёт таймаут, из которого не следует ничего.
 */
function sparqlFor(kindQid) {
  return `
SELECT ?item ?sitelinks ?labelEn ?labelRu ?date WHERE {
  ?item wdt:P31 wd:${kindQid} ;
        wikibase:sitelinks ?sitelinks ;
        wdt:P577 ?date .
  FILTER(YEAR(?date) = ${YEAR})
  FILTER(?sitelinks >= ${MIN_SITELINKS})
  OPTIONAL { ?item rdfs:label ?labelEn . FILTER(LANG(?labelEn) = "en") }
  OPTIONAL { ?item rdfs:label ?labelRu . FILTER(LANG(?labelRu) = "ru") }
}
ORDER BY DESC(?sitelinks)
LIMIT ${LIMIT}`;
}

async function ask(kind) {
  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(sparqlFor(kind.qid))}`;
  const response = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
  if (!response.ok) {
    console.error(`  ⚠️ ${kind.ru}: HTTP ${response.status} — вид пропущен, и это НАЗВАНО, а не скрыто`);
    return [];
  }
  const body = await response.json();
  const seen = new Map();
  for (const row of body.results.bindings) {
    const qid = row.item.value.split('/').pop();
    // У объекта может быть несколько дат публикации (страны, платформы) — берём его один раз.
    if (seen.has(qid)) continue;
    seen.set(qid, {
      qid,
      kindRu: kind.ru,
      kindEn: kind.en,
      titleEn: row.labelEn?.value ?? '',
      titleRu: row.labelRu?.value ?? '',
      year: String(new Date(row.date.value).getUTCFullYear()),
      sitelinks: Number(row.sitelinks.value),
    });
  }
  return [...seen.values()];
}

// ── Наш каталог: против чего дедуплицируем ──────────────────────────────────────────────────
if (!existsSync(SNAPSHOT)) {
  console.error(`❌ нет снимка каталога ${SNAPSHOT} — прогони \`node tools/fetch-dims-slice.mjs --all\``);
  process.exit(1);
}
const raw = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
const ours = Array.isArray(raw) ? raw : Object.entries(raw).map(([id, v]) => ({ id, ...v }));

/** Нормализованные названия каталога — обе половины, потому что совпасть может любая. */
const ourNames = new Set();
for (const dim of ours) {
  for (const half of [dim.title?.ru, dim.title?.en]) {
    const key = normalizeForSearch(String(half ?? ''));
    if (key !== '') ourNames.add(key);
  }
}
console.log(`наш каталог: ${ours.length} измерений · нормализованных названий ${ourNames.size}`);

// ── Разведка ────────────────────────────────────────────────────────────────────────────────
console.log(`\nразведка Wikidata: год ${YEAR}, порог известности ${MIN_SITELINKS} языковых разделов\n`);
const found = [];
for (const kind of KINDS) {
  const rows = await ask(kind);
  console.log(`  ${kind.ru.padEnd(10)} найдено ${rows.length}`);
  found.push(...rows);
}

// ── Дедупликация ЧИСЛОМ ─────────────────────────────────────────────────────────────────────
const fresh = [];
const already = [];
for (const item of found) {
  const keys = [item.titleRu, item.titleEn].map(normalizeForSearch).filter((k) => k !== '');
  const hit = keys.find((k) => ourNames.has(k));
  if (hit === undefined) fresh.push(item);
  else already.push({ ...item, hit });
}

fresh.sort((a, b) => b.sitelinks - a.sitelinks || a.qid.localeCompare(b.qid));

console.log('\n════ ИТОГ РАЗВЕДКИ ════');
console.log(`  всего найдено новинок ${YEAR} года: ${found.length}`);
console.log(`  из них УЖЕ в нашем каталоге:        ${already.length}`);
console.log(`  🆕 НЕТ у нас:                        ${fresh.length}`);

writeFileSync(OUT_JSON, JSON.stringify({ year: YEAR, minSitelinks: MIN_SITELINKS, fresh, already }, null, 1), 'utf8');

// ── Документ разведки ───────────────────────────────────────────────────────────────────────
const rows = fresh
  .map((f, i) => `| ${i + 1} | ${f.titleRu || '—'} | ${f.titleEn || '—'} | ${f.kindRu} | ${f.year} | ${f.sitelinks} | [\`${f.qid}\`](https://www.wikidata.org/wiki/${f.qid}) |`)
  .join('\n');

const md = `# Разведка ${YEAR}: новинки культуры, которых в каталоге НЕТ

> **Создан:** 2026-08-17 · **Родитель:** заказ владельца в чате 2026-08-17 · **Статус:** разведка
> проведена машиной, список ниже · **Исходящее:** 10 записей уходят кандидатами на вычитку
> владельцу (его заказ: «протестируем контур целиком»).

## Что это и как получено

Заказ владельца дословно: «*проведи интернет разведку новинок популярных, которых у нас нет.
Собери их список названий, тип, год. Затем в следующем чате ты 10 из них оформишь кандидатами,
я вычитаю и попробую одобрить*».

**Источник — Wikidata**, решение владельца В2 = А (интервью №015). Прибор —
\`tools/scout-wikidata-candidates.mjs\`. Ни одна строка списка не взята из памяти модели: у каждой
записи есть \`QID\`, который разрешается по ссылке, и число известности — сколько языковых разделов
Википедии о ней написали (\`wikibase:sitelinks\`, принятая мера известности).

**Дедупликация — числом, а не на глаз** (требование фазы 5 \`plans/30\`): название нормализуется тем
же нормализатором, что у поиска в продукте (\`model/feed.ts\` → \`normalizeForSearch\`, он снимает
регистр, «ё», дефисы и римские цифры), и сверяется с обеими половинами названий всех
${ours.length} наших измерений.

## Числа этой разведки

| Что | Число |
|---|---|
| Найдено новинок ${YEAR} года с известностью ≥ ${MIN_SITELINKS} языковых разделов | **${found.length}** |
| Из них УЖЕ есть в нашем каталоге | ${already.length} |
| 🆕 **Которых у нас НЕТ** | **${fresh.length}** |

⚠️ **Честные границы этой разведки, чтобы её не переоценили:**
- мера известности — число языковых разделов Википедии, а не касса и не хайп. Свежий релиз может
  быть на вершине сборов и иметь мало разделов: Википедия догоняет медленно;
- порог ${MIN_SITELINKS} разделов отсекает малоизвестное, но вместе с ним отсекает и **очень
  свежее** — то, о чём ещё не написали;
- ищутся пять видов (фильм, сериал, видеоигра, книга, альбом). Каталог NDim шире: в нём живут
  «Кошки», «Тишина», «Бег» — понятия, у которых мера известности читается иначе;
- «нет у нас» означает «нет совпадения по нормализованному названию». Объект, лежащий у нас под
  другим названием (перевод, подзаголовок), в этот список попадёт ложно — и это ровно то, что
  ловит вычитка владельцем.

## 🆕 Новинки, которых у нас нет — по убыванию известности

| # | Название (ru) | Title (en) | Вид | Год | Языковых разделов | Wikidata |
|---|---|---|---|---|---|---|
${rows}

## Что дальше

Владелец возьмёт **10 записей** отсюда, агент оформит их кандидатами, владелец вычитает и попробует
одобрить — сквозная проверка контура «агент предлагает → владелец судит» (фаза 6 эпика \`ideas/29\`).
⛔ Прибор в каталог НЕ ПИШЕТ ничего: инвариант В3 = А — агент никогда не заводит измерение без
вычитки владельцем.
`;

writeFileSync(OUT_MD, md, 'utf8');
console.log(`\nдокумент разведки: ${OUT_MD}`);
console.log(`данные для следующего шага: ${OUT_JSON}`);

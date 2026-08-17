/**
 * ЗАМЕР СОГЛАШЕНИЙ О ТЕГАХ КАТАЛОГА — какие теги владелец ставит ОБЯЗАТЕЛЬНО, по видам объектов.
 *
 * Повод, слово владельца 2026-08-17 после вычитки первой партии кандидатов: «*Не так и не понял,
 * что ВО ВСЕХ фильмах у меня обязательные теги есть: кино, фильм, movie, film. Если бы ты был
 * внимательнее, ты бы заметил, что это КЛАСС*».
 *
 * 🔴 ЗАЧЕМ ПРИБОР, А НЕ СТРОЧКА В ДОКУМЕНТЕ. Соглашение живёт не в голове и не в правилах — оно
 * живёт В ДАННЫХ, 43 011 значений на 5111 записей. Записанное руками «у фильмов ставим кино и
 * фильм» устареет в день, когда владелец заведёт новый вид объектов, и разойдётся с каталогом
 * молча. Прибор ВЫВОДИТ соглашение из каталога заново при каждом прогоне, поэтому оно не может
 * устареть.
 *
 * 🔑 МЕРА — ДОЛЯ ЗАПИСЕЙ ВИДА, НЕСУЩИХ ТЕГ. Тег, стоящий у 99 % фильмов, — соглашение; тег у 3 % —
 * содержание конкретной записи. Порог обязательности взят 0,90: он отделяет «так заведено» от
 * «часто встречается» и терпит десяток записей, заведённых до соглашения.
 *
 * ⚠️ Прибор НИЧЕГО НЕ ПРАВИТ. Его выход — таблица и машиночитаемый список, который читает приёмка
 * кандидатов (`check-candidate-descriptions.mjs`). Находка и правка — разные ответственности.
 *
 * Запуск:
 *   node tools/measure-catalog-tags.mjs                    # по снимку каталога
 *   node tools/measure-catalog-tags.mjs --min-kind 20      # только виды от 20 записей
 *   node tools/measure-catalog-tags.mjs --json             # только машиночитаемый вывод
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SNAPSHOT = 'src/lib/content/dims-build.json';
/*
 * 🔴 ФАЙЛ ЛЕЖИТ В МАСТЕРСКОЙ, А НЕ В `src/lib/content/`, И ЭТО НЕ ВКУС. Всё, что живёт под `src/`,
 * может уехать в клиентский бандл: класс `EXP-0136` (универсальный загрузчик однажды вшил весь
 * каталог, 16,86 МБ, в бандл, и функциональные проверки были при этом зелёными). Соглашение о
 * тегах нужно ПРИБОРАМ агента и владельцу, а людям в браузере — никогда.
 */
const OUT_JSON = 'candidates/tag-conventions.json';

const argOf = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
/** Доля записей вида, при которой тег считается ОБЯЗАТЕЛЬНЫМ для этого вида. */
export const MANDATORY_SHARE = 0.9;
const MIN_KIND = Number(argOf('--min-kind', '15'));
const JSON_ONLY = process.argv.includes('--json');

const raw = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
const rows = Array.isArray(raw) ? raw : (raw.dims ?? Object.values(raw));

/*
 * Вид берётся из русского `type` — это то поле, по которому владелец различает объекты каталога.
 * Нормализуем регистр: «Фильм» и «фильм» — один вид, и различать их значило бы дробить замер.
 */
const byKind = new Map();
let withTags = 0;
let tagValues = 0;
for (const d of rows) {
  const kind = String(d?.type?.ru ?? '').trim().toLowerCase();
  if (kind === '') continue;
  const tags = Array.isArray(d?.tags) ? d.tags.map((t) => String(t).trim()).filter(Boolean) : [];
  if (tags.length > 0) withTags += 1;
  tagValues += tags.length;
  if (!byKind.has(kind)) byKind.set(kind, { count: 0, tags: new Map(), sample: d?.type?.en ?? '' });
  const bucket = byKind.get(kind);
  bucket.count += 1;
  // Один тег считается один раз на запись: повтор внутри записи не повышает его долю.
  for (const t of new Set(tags.map((t) => t.toLowerCase()))) {
    bucket.tags.set(t, (bucket.tags.get(t) ?? 0) + 1);
  }
}

const conventions = {};
const report = [];
for (const [kind, bucket] of [...byKind.entries()].sort((a, b) => b[1].count - a[1].count)) {
  if (bucket.count < MIN_KIND) continue;
  const mandatory = [...bucket.tags.entries()]
    .filter(([, n]) => n / bucket.count >= MANDATORY_SHARE)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, n]) => ({ tag, n, share: n / bucket.count }));
  report.push({ kind, typeEn: bucket.sample, count: bucket.count, mandatory });
  if (mandatory.length > 0) {
    conventions[kind] = mandatory.map((m) => m.tag);
  }
}

/*
 * Обратная сторона замера: сколько записей САМОГО каталога соглашение нарушают. Без этого числа
 * соглашение читалось бы как «так у всех», а «99,1 %» означает, что у кого-то — нет.
 */
const violations = [];
for (const d of rows) {
  const kind = String(d?.type?.ru ?? '').trim().toLowerCase();
  const need = conventions[kind];
  if (!need) continue;
  const have = new Set((Array.isArray(d?.tags) ? d.tags : []).map((t) => String(t).trim().toLowerCase()));
  const missing = need.filter((t) => !have.has(t));
  if (missing.length > 0) {
    violations.push({ id: d.id, slug: d.slug, kind, title: d?.title?.ru ?? '', missing });
  }
}

if (!JSON_ONLY) {
  console.log('\n═══ СОГЛАШЕНИЯ О ТЕГАХ КАТАЛОГА ═══');
  console.log(`  снимок: ${SNAPSHOT} · записей ${rows.length} · с тегами ${withTags} · значений ${tagValues}`);
  console.log(`  вид берётся в замер от ${MIN_KIND} записей · порог обязательности ${(MANDATORY_SHARE * 100).toFixed(0)} %\n`);
  for (const r of report) {
    const list = r.mandatory.length === 0
      ? '— обязательных нет'
      : r.mandatory.map((m) => `«${m.tag}» ${(m.share * 100).toFixed(1)} %`).join(' · ');
    console.log(`  ${r.kind} (${r.count})  →  ${list}`);
  }
  console.log('\n⚠️ «Обязательных нет» — это факт о виде, а не отсутствие соглашения у каталога:');
  console.log('   у редких видов записей мало, и доля 90 % на них ничего не означает.');

  console.log(`\n📉 ЗАПИСЕЙ САМОГО КАТАЛОГА, НАРУШАЮЩИХ СОГЛАШЕНИЕ: ${violations.length}`);
  console.log('   («99,1 %» значит, что у кого-то тега НЕТ, и это число обязано быть названо)');
  const byKind = new Map();
  for (const v of violations) byKind.set(v.kind, (byKind.get(v.kind) ?? 0) + 1);
  for (const [k, n] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   · ${k}: ${n}`);
  }
  for (const v of violations.slice(0, 8)) {
    console.log(`     — «${v.title}» не хватает: ${v.missing.join(', ')}`);
  }
  if (violations.length > 8) console.log(`     … и ещё ${violations.length - 8}`);
}

mkdirSync('src/lib/content', { recursive: true });
writeFileSync(OUT_JSON, `${JSON.stringify(conventions, null, 2)}\n`, 'utf8');
if (!JSON_ONLY) console.log(`\n📄 Машиночитаемое соглашение: ${OUT_JSON}`);

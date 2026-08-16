/**
 * СБОРКА СПИСКА ПРАВОК — что именно отдавать агенту, который будет переписывать описание.
 *
 * Ночной прогон 2026-08-17 показал, почему это отдельный прибор, а не три строки inline.
 * Первая версия отдавала агенту ОДНО предложение — то, в котором начинался дословный ряд. Скептик
 * фан-аута поймал беду и подтвердил её измерением: **ряд часто ПЕРЕСЕКАЕТ ГРАНИЦУ ПРЕДЛОЖЕНИЯ**.
 * У английского `corrective-measures` самый длинный ряд лежал вообще в другом предложении: правка
 * отработала чисто, а запись как была копией, так и осталась — 44 слова до и 44 после.
 *
 * 🔑 Отсюда правило сборки: агенту отдаётся НЕ предложение, а **все предложения, которые ряд
 * накрывает**, плюс полное описание для контекста и полная улика без обрезки. Иначе он чинит
 * половину и честно отчитывается об успехе.
 *
 * Запуск:
 *   node tools/build-rewrite-worklist.mjs --lang ru --min-run 10 --out test-results/ru-worklist.json
 *   node tools/build-rewrite-worklist.mjs --lang en --min-run 20 --chunk 5
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { words, longestCommonRun, isOwnTitle, looksLikeList } from './measure-wikipedia-overlap.mjs';

const arg = (n, d = null) => {
  const i = process.argv.indexOf(n);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const LANG = arg('--lang', 'ru');
const MIN_RUN = Number(arg('--min-run', '10'));
const CHUNK = Number(arg('--chunk', '5'));
const OUT = arg('--out', `test-results/${LANG}-worklist.json`);
const SRC = `test-results/wiki-overlap-${LANG}.json`;

const свод = JSON.parse(readFileSync(SRC, 'utf8'));
const dims = JSON.parse(readFileSync('src/lib/content/dims-build.json', 'utf8'));
const bySlug = new Map(dims.map((d) => [d.slug, d]));

/** Предложения, которые накрывает дословный ряд. Границы ищутся ПО СЛОВАМ, а не по символам. */
function накрытыеПредложения(описание, улика) {
  const предложения = описание.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const рядСлова = words(улика);
  if (!рядСлова.length) return [];
  const накрытые = [];
  for (const s of предложения) {
    const общий = longestCommonRun(words(s), рядСлова).length;
    // Предложение считается накрытым, если делит с рядом хотя бы четыре слова подряд: меньше —
    // случайное совпадение служебных слов, а не часть заимствования.
    if (общий >= 4) накрытые.push(s);
  }
  return накрытые;
}

const работа = [];
let пропущеноИмён = 0;
let пропущеноПеречней = 0;

for (const x of свод) {
  if (x.verdict !== 'copied') continue;
  if (x.run < MIN_RUN) continue;
  const d = bySlug.get(x.slug);
  if (!d) continue;
  if (isOwnTitle(x.улика, d)) {
    пропущеноИмён += 1;
    continue;
  }
  if (looksLikeList(x.улика)) {
    пропущеноПеречней += 1;
    continue;
  }
  const описание = d.description?.[LANG] ?? '';
  if (!описание) continue;
  const накрытые = накрытыеПредложения(описание, x.улика);
  if (!накрытые.length) continue;
  работа.push({
    slug: x.slug,
    название: d.title?.[LANG] ?? x.slug,
    ряд: x.run,
    улика: x.улика,
    предложения: накрытые,
    описание,
  });
}

работа.sort((a, b) => b.ряд - a.ряд);
writeFileSync(OUT, JSON.stringify(работа, null, 1), 'utf8');

const партии = [];
for (let i = 0; i < работа.length; i += CHUNK) партии.push(работа.slice(i, i + CHUNK));
writeFileSync(OUT.replace(/\.json$/, '-chunks.json'), JSON.stringify(партии), 'utf8');

console.log(`\n═══ СПИСОК ПРАВОК (${LANG}) ═══`);
console.log(`копий в своде с рядом ≥ ${MIN_RUN}: ${работа.length + пропущеноИмён + пропущеноПеречней}`);
console.log(`  отсеяно собственных названий: ${пропущеноИмён}`);
console.log(`  отсеяно перечней: ${пропущеноПеречней}`);
console.log(`  🔧 к правке: ${работа.length} · партий по ${CHUNK}: ${партии.length}`);
const многоПредложений = работа.filter((w) => w.предложения.length > 1).length;
console.log(`  ⚠️ записей, где ряд накрывает НЕСКОЛЬКО предложений: ${многоПредложений}`);
console.log(`\nзаписано: ${OUT} и ${OUT.replace(/\.json$/, '-chunks.json')}`);

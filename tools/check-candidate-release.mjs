/**
 * ОТБОР ПАРТИИ ПО КЛАССУ 1 — «не вышедший объект не подаётся на вычитку».
 *
 * Отдельная дверь, а не флаг приёмки описаний, потому что это РАЗНАЯ РАБОТА: приёмка судит
 * текст, а этот прибор судит СОСТАВ партии. Владелец сказал это своими словами: «*Это фильтр
 * ОТБОРА, а не правка текста*» (`candidates/owner-critical-notes-2026-08-22.md`, класс 1).
 * Дизайнеру он нужен ДО того, как написан хоть один знак описания, — иначе труд уходит в объект,
 * который снимут с вычитки.
 *
 * 🔑 ВТОРОЙ ПРАВДЫ ЗДЕСЬ НЕТ. Весь приговор живёт в `tools/lib/release-date.mjs`; этот файл
 * только спрашивает реестр и печатает. Ворота мастерской зовут ТУ ЖЕ функцию — значит отбор и
 * приёмка не могут разойтись в решении («истина ↔ зеркало», `AGENT_GUIDE.md`).
 *
 * Запуск:
 *   node tools/check-candidate-release.mjs candidates/batches/04_2026_films_and_games.json
 *   node tools/check-candidate-release.mjs <файл> --today 2026-08-22   # день прогона вручную
 *
 * Код выхода: 1, если в партии есть объект, который ещё не вышел, — то есть партию надо править.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { датыИзРеестра, приговорКласса1, СВОЙСТВО_ДАТЫ } from './lib/release-date.mjs';
import { создатьКорзину } from './lib/gate-notes.mjs';

const CACHE = 'test-results/wiki-cache';
const UA = 'NDimSpace-catalog-audit/1.0 (https://ndimspace.app; candidate release date check)';
const РАЗМЕР_ПАЧКИ = 25;                     // предел `wbgetentities` — 50; берём с запасом
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** День прогона в виде `YYYY-MM-DD`. Отдельной функцией, чтобы прогон можно было повторить. */
export const деньПрогона = (арг) => арг ?? new Date().toISOString().slice(0, 10);

/**
 * ЧТЕНИЕ ЗАПИСЕЙ РЕЕСТРА ПАЧКАМИ. Возвращает карту `qid → ответ API об одной записи`.
 * Пачками, потому что 60 карточек — это 60 запросов по одному и три минуты ожидания.
 * Кэш на диск — тот же, что у приёмки описаний: ключ — полный хеш адреса.
 */
export async function записиРеестра(qids, запрос) {
  const карта = new Map();
  const свои = [...new Set(qids.filter(Boolean))];
  for (let i = 0; i < свои.length; i += РАЗМЕР_ПАЧКИ) {
    const пачка = свои.slice(i, i + РАЗМЕР_ПАЧКИ);
    const ответ = await запрос({ action: 'wbgetentities', ids: пачка.join('|'), props: 'claims' });
    for (const qid of пачка) карта.set(qid, ответ?.entities?.[qid] ?? null);
  }
  return карта;
}

// ── ПРЕДОХРАНИТЕЛЬ: ЗАПУСТИЛИ ИЛИ ПОДКЛЮЧИЛИ ────────────────────────────────────────────────
// Класс оплачен четырьмя файлами проекта: файл, у которого есть и экспорт, и работа на верхнем
// уровне, обязан спрашивать, запустили его или подключили. Иначе чужой импорт умирает молча.
const ЗАПУЩЕН_НАПРЯМУЮ = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (ЗАПУЩЕН_НАПРЯМУЮ) {

const FILE = process.argv[2];
if (!FILE || FILE.startsWith('--')) {
  console.error('Укажи файл партии: node tools/check-candidate-release.mjs candidates/batches/04_2026_films_and_games.json');
  process.exit(2);
}
const argOf = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
};
const СЕГОДНЯ = деньПрогона(argOf('--today'));

mkdirSync(CACHE, { recursive: true });
const запрос = async (params) => {
  const url = `https://www.wikidata.org/w/api.php?${new URLSearchParams({ ...params, format: 'json' })}`;
  const key = join(CACHE, `wikidata-${createHash('sha256').update(url).digest('hex')}.json`);
  if (existsSync(key)) return JSON.parse(readFileSync(key, 'utf8'));
  await sleep(300);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  writeFileSync(key, JSON.stringify(data), 'utf8');
  return data;
};

const batch = JSON.parse(readFileSync(FILE, 'utf8'));
const items = batch.candidates ?? [];

console.log('\n═══ ОТБОР ПАРТИИ: ВЫШЕЛ ЛИ ОБЪЕКТ ═══');
console.log(`  файл: ${FILE} · записей: ${items.length} · день прогона: ${СЕГОДНЯ}`);
console.log(`  источник даты: реестр, свойство ${СВОЙСТВО_ДАТЫ}. Текст описания на этот вопрос не отвечает.`);
console.log('  отказ: объект не вышел НИ ПРИ КАКОМ прочтении записи реестра\n');

const карта = await записиРеестра(items.map((c) => c.wikidata), запрос).catch((e) => {
  console.error(`🔴 реестр спросить не удалось: ${e.message}`);
  return new Map();
});
/* Реестр уже прочитан пачкой — здесь только выдача из карты, сети больше нет. */
const изКарты = (qid) => async () => ({ entities: { [qid]: карта.get(qid) ?? { missing: '' } } });

/* Два списка, а не один: у половин класса 1 РАЗНОЕ лечение. Невышедший объект снимают с
 * вычитки целиком; вышедший со старым текстом — переписывают. Свалить их в одну кучу значило бы
 * послать Дизайнера снимать карточку, которую надо всего лишь обновить. */
const неВышли = [];
const старыйТекст = [];
const корзина = создатьКорзину();
let вышло = 0;

for (const c of items) {
  const имя = c.title?.ru ?? c.wikidata;
  const ответ = карта.has(c.wikidata) ? await датыИзРеестра(c.wikidata, изКарты(c.wikidata)) : null;
  const п = приговорКласса1(ответ, c.description?.ru ?? '', СЕГОДНЯ);
  for (const о of п.отказы) (о.startsWith('объект ещё не вышел') ? неВышли : старыйТекст).push(`${имя}: ${о}`);
  корзина.добавитьВсе('класс 1 — выход', имя, п.замечания);
  if (п.состояние.вид === 'вышел') вышло += 1;
  const знак = п.отказы.length ? '❌' : (п.замечания.length ? '🟡' : '✅');
  console.log(`  ${знак} ${имя} — ${п.состояние.вид}${п.состояние.дата ? ` (${п.состояние.дата})` : ''}`);
}

console.log('\n──────────────────────────────────────────────────────────────');
console.log(`вышло по реестру: ${вышло} из ${items.length}`);
корзина.напечатать();
if (неВышли.length === 0 && старыйТекст.length === 0) {
  console.log('\n✅ ПАРТИЯ ПО КЛАССУ 1 ЧИСТА: отказов 0');
  console.log('⚠️ И честная граница: прибор ответил только на вопрос «вышел ли объект».');
  console.log('   Верна ли дата В ТЕКСТЕ описания — он не проверял.');
  process.exit(0);
}
if (неВышли.length) {
  console.log(`\n❌ ЕЩЁ НЕ ВЫШЛИ — ${неВышли.length}. Лечение: СНЯТЬ С ВЫЧИТКИ до выхода объекта.`);
  for (const о of неВышли) console.log(`   · ${о}`);
}
if (старыйТекст.length) {
  console.log(`\n❌ ВЫШЛИ, А ТЕКСТ О БУДУЩЕМ — ${старыйТекст.length}. Лечение: ПЕРЕПИСАТЬ фразу о выходе.`);
  for (const о of старыйТекст) console.log(`   · ${о}`);
}
process.exit(1);

}

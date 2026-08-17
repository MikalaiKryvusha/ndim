/**
 * СОГЛАШЕНИЕ О ТЕГАХ КАТАЛОГА — общий модуль для приборов мастерской.
 *
 * Заказ владельца 2026-08-17, дословно: «*создай наборы обязательных тегов как класс правило для
 * разных измерений — они должны ИИ агентом с высокой гарантией попадать в написанные им кандидаты,
 * как правило*».
 *
 * 🔴 «С ВЫСОКОЙ ГАРАНТИЕЙ» — ЭТО МЕХАНИЗМ, А НЕ ПАМЯТЬ. Правило, записанное только словами в
 * README, держится на внимательности сессии; ровно на ней оно и сломалось (`bugs/144`: агент
 * поставил десяти фильмам теги «фэнтези · приключения · Нолан» и ни одного обязательного). Поэтому
 * соглашение читают ДВОЕ ворот, и оба fail-closed:
 *   · приёмка описаний (`check-candidate-descriptions.mjs`) — говорит, чего не хватает;
 *   · сама выгрузка (`seed-dim-candidates.mjs`) — ОТКАЗЫВАЕТСЯ класть такого кандидата в очередь.
 * Второе важнее первого: приёмку можно не запустить, а мимо выгрузки кандидат в очередь не попадёт.
 *
 * 🔑 ИСТОЧНИК СОГЛАШЕНИЯ — КАТАЛОГ, А НЕ ЭТОТ ФАЙЛ. `candidates/tag-conventions.json` ВЫВЕДЕН
 * замером 5111 боевых записей (`tools/measure-catalog-tags.mjs`, порог 90 % записей вида) и
 * перевыводится одной командой. Список, набранный руками, устарел бы в день, когда владелец заведёт
 * новый вид объектов, и разошёлся бы с каталогом молча — это пара «истина ↔ зеркало», и истина
 * здесь в данных.
 */
import { readFileSync, existsSync } from 'node:fs';

const FILE = 'candidates/tag-conventions.json';

let cache = null;

/** Всё соглашение: `{ "фильм": ["фильм","movie","кино","film"], … }`. Ключи — вид в нижнем регистре. */
export function tagConventions() {
  if (cache !== null) return cache;
  if (!existsSync(FILE)) {
    throw new Error(
      `Соглашение о тегах не найдено: ${FILE}. Перевыведи его замером: node tools/measure-catalog-tags.mjs`,
    );
  }
  cache = JSON.parse(readFileSync(FILE, 'utf8'));
  return cache;
}

/**
 * Обязательные теги для вида. Вид сверяется в нижнем регистре: «Фильм» и «фильм» — один вид.
 * Вид, которого нет в соглашении, обязательных тегов не имеет — и это ЧЕСТНЫЙ ответ, а не «ноль
 * по умолчанию»: у редких видов записей мало, и доля на них ничего не значит.
 */
export function mandatoryTagsFor(kindRu) {
  const kind = String(kindRu ?? '').trim().toLowerCase();
  return tagConventions()[kind] ?? [];
}

/**
 * Каких обязательных тегов не хватает записи. Сравнение регистронезависимое: «Кино» и «кино» —
 * один тег, и требовать второй копии было бы придиркой прибора.
 */
export function missingMandatoryTags(record) {
  const need = mandatoryTagsFor(record?.type?.ru);
  if (need.length === 0) return [];
  const have = new Set(
    (Array.isArray(record?.tags) ? record.tags : []).map((t) => String(t).trim().toLowerCase()),
  );
  return need.filter((t) => !have.has(t));
}

/**
 * ⛔ ИМЁН СОБСТВЕННЫХ В ТЕГАХ НЕТ — правило владельца, подтверждённое замером.
 *
 * Его слова: «*я тегами описывать старался не имена собственные, а суть, что есть данный объект
 * культуры*». Замер 5111 записей согласен с ним: значений тегов с заглавной буквы 681 из 43 011
 * (1,6 %), и это почти целиком аббревиатуры жанров и форматов — RPG, MMORPG, K-pop, TV series.
 * Имён людей в тегах каталога нет.
 *
 * 🔑 Прибор не судит «имя это или не имя» — задача неразрешима машиной без словаря. Он ловит
 * ровно ту форму, которой владелец не пользуется: тег, начинающийся с ЗАГЛАВНОЙ и не входящий в
 * список известных аббревиатур. Это подсказка агенту, а не приговор, и потому она отделена от
 * обязательных тегов: те — отказ, эта — предупреждение.
 */
export const KNOWN_UPPERCASE_TAGS = new Set(
  ['rpg', 'mmorpg', 'mmo', 'moba', 'fps', 'rts', 'jrpg', 'pvp', 'pve', 'vr', 'edm', 'k-pop',
    'r&b', 'pc game', 'tv series', 'tv show', 'latin pop', 'eurodisco', 'christmas',
    'dungeons & dragons', 'world war ii', 'вторая мировая война', 'средневековье', 'rpg elements'],
);

export function looksLikeProperName(tag) {
  const raw = String(tag ?? '').trim();
  if (raw === '') return false;
  if (KNOWN_UPPERCASE_TAGS.has(raw.toLowerCase())) return false;
  const first = raw[0];
  return first === first.toUpperCase() && first !== first.toLowerCase();
}

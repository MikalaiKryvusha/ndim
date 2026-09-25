/**
 * ПАРА ТЕСТА — чистая модель такта В (`plans/42`, шаг 3; решения — подсекция такта В).
 *
 * Документ `testPairs/{pairId}`: двое проходят один набор обёртки, их ответы ложатся в один
 * документ, результат — ФАКТЫ о совпадениях. В общий результат попадают ТОЛЬКО оценки из
 * набора теста, положенные явным действием (№002 В4); числа похожести и порядок близости не
 * появляются здесь ни в каком виде (№018 В4, №023) — за этим следит тест с закрытым набором
 * полей результата.
 *
 * Модуль чистый: ни Firestore, ни браузера — только данные. Запись/чтение — `data/test-engine.ts`.
 */

import type { TestSlug } from '$lib/content/test-copy';

/** Ответы одного человека в рамках теста: dimId → 0…10. */
export type PairAnswers = Readonly<Record<string, number>>;

/** Документ пары. `b*` — null, пока второй не присоединился. */
export interface PairDoc {
  readonly slug: TestSlug;
  readonly created: number;
  readonly aUid: string;
  readonly aAnswers: PairAnswers;
  readonly bUid: string | null;
  readonly bAnswers: PairAnswers | null;
}

/** Потолок ответов в документе — длина очереди обёртки с запасом (зеркало правила size() ≤ 40). */
export const MAX_PAIR_ANSWERS = 40;

/**
 * Ответы «в рамках теста»: пересечение своих оценок с набором обёртки.
 * Ровно это показывает панель-зеркало — то, что человек видит, то и уходит (№002 В4).
 */
export function answersFromRatings(
  ratings: ReadonlyMap<string, number>,
  queueIds: readonly string[],
): Record<string, number> {
  const answers: Record<string, number> = {};
  for (const id of queueIds) {
    const value = ratings.get(id);
    if (value !== undefined) answers[id] = value;
  }
  return answers;
}

/**
 * Защитный фильтр ЧУЖИХ ответов при чтении: документ пары — внешние данные, а не наши типы.
 * Правила стерегут форму (`values().hasOnly(0…10)`, `size() ≤ 40`), но читающий клиент всё
 * равно не доверяет: не-целое, вне 0…10 или вне набора страницы — строка молча выпадает.
 */
export function sanitizeAnswers(raw: unknown, allowedIds: ReadonlySet<string>): Map<string, number> {
  const clean = new Map<string, number>();
  if (raw === null || typeof raw !== 'object') return clean;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowedIds.has(id)) continue;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10) continue;
    clean.set(id, value);
  }
  return clean;
}

// ── Очередь второго: ТЕ ЖЕ вещи, что оценил первый (№098 В2, пул и случайная дюжина) ───────────

/**
 * ОЧЕРЕДЬ ВТОРОГО ЧЕЛОВЕКА ПАРЫ — вещи, которые оценил первый, В ПОРЯДКЕ ПУЛА.
 *
 * С пулом и случайной дюжиной (`content/test-set.ts`) у каждой попытки своя перетасовка, и очередь
 * «как у первого» больше не выводится из сборки. Выводится она из самого документа пары: ключи
 * `aAnswers` — это ровно то, что первый оценил в рамках теста (№002 В4). Схема документа и правила
 * `testPairs` не меняются. Порядок — порядок пула: детерминирован и одинаков у всех, кто открыл
 * одну ссылку. Вещи вне пула (пул сменился между выкатами) выпадают: карточки для них у страницы нет.
 * [TESTED: 2026-09-25 · стенд (слот 5, сборка + vite preview :4195) · второй по ссылке `?pair=…&set=…` без сессии
 * оценил ровно 12 вещей первого, первая карточка — из вещей первого, своей дюжины нет · qa/reports/2026-09-26_compat-test-v4.md]
 */
export function pairQueueIds(poolIds: readonly string[], firstRated: ReadonlySet<string>): string[] {
  return poolIds.filter((id) => firstRated.has(id));
}

/**
 * Имя параметра ссылки с набором первого: `?pair=<id>&set=<код>`.
 *
 * 🔑 ЗАЧЕМ ОН ВООБЩЕ. Документ пары читает только вошедший (`allow get: if signedIn()`), а незнакомцу
 * по ссылке сессию молча не заводят (канон `profile.ts`: «он мог просто открыть страницу»). Значит
 * второй человек без сессии видит свою ПЕРВУЮ карточку раньше, чем может прочитать пару, — и без
 * подсказки в ссылке первая карточка была бы не из вещей первого. Код в ссылке даёт очередь сразу;
 * после первой оценки пара читается, и её `aAnswers` становятся очередью (подсказка — только мост
 * до этого момента).
 */
export const PAIR_SET_PARAM = 'set';

/** Символ на вещь: номер вещи в пуле в 36-ричной записи. Пул длиннее 36 так не кодируется. */
const SET_DIGITS = 36;

/**
 * Код набора первого для ссылки: номера вещей пула, по символу на вещь, в порядке пула
 * (12 вещей из 20 — 12 символов). Вещи вне пула в код не попадают.
 */
export function encodePairSet(poolIds: readonly string[], rated: Iterable<string>): string {
  if (poolIds.length > SET_DIGITS) throw new Error(`пул ${poolIds.length} длиннее ${SET_DIGITS}: код набора не вместит`);
  const mine = new Set(rated);
  return poolIds
    .map((id, i) => (mine.has(id) ? i.toString(SET_DIGITS) : ''))
    .join('');
}

/**
 * Набор первого из кода ссылки. Код — внешние данные (адресная строка): чужой символ и номер вне
 * пула молча выпадают. Пустой или отсутствующий код — `null` («подсказки нет»), а не пустой набор.
 */
export function decodePairSet(poolIds: readonly string[], code: string | null): Set<string> | null {
  if (code === null) return null;
  const ids = new Set<string>();
  for (const ch of code.toLowerCase()) {
    const i = Number.parseInt(ch, SET_DIGITS);
    if (Number.isInteger(i) && i >= 0 && i < poolIds.length) ids.add(poolIds[i]);
  }
  return ids.size > 0 ? ids : null;
}

/** Одна строка результата: объект и две оценки. Никаких производных величин. */
export interface PairFactRow {
  readonly id: string;
  readonly a: number;
  readonly b: number;
}

/**
 * Результат пары — только факты, которые можно проверить.
 *
 * 🔴 ЗАКРЫТЫЙ НАБОР ПОЛЕЙ. Тест `test-pair.test.ts` фиксирует его ключи и типы: любое новое
 * поле результата обязано пройти через него — так сюда не просочится ни процент, ни
 * «похожесть», ни порядок близости (№018 В4; критерий 5 фазы).
 */
export interface PairFacts {
  /** Сколько вещей оценили оба — знаменатель честности («по 9 вещам из 12»). */
  readonly compared: number;
  /** Точные совпадения (a === b). */
  readonly exact: readonly PairFactRow[];
  /** Оба поставили 10 — «общие „десятки“» (форма счёта любви, №028 В3 = А). */
  readonly tens: readonly PairFactRow[];
  /** Рядом: |a − b| = 1 (точные сюда не входят). */
  readonly close: readonly PairFactRow[];
  /** По-разному: |a − b| ≥ 4 — «будет о чём поговорить». */
  readonly differ: readonly PairFactRow[];
}

/** Порог строки «по-разному». */
export const DIFFER_FROM = 4;

/** Считает факты пары по пересечению двух карт ответов. Порядок строк — порядок queueIds. */
export function pairFacts(
  mine: ReadonlyMap<string, number>,
  theirs: ReadonlyMap<string, number>,
  queueIds: readonly string[],
): PairFacts {
  const exact: PairFactRow[] = [];
  const tens: PairFactRow[] = [];
  const close: PairFactRow[] = [];
  const differ: PairFactRow[] = [];
  let compared = 0;

  for (const id of queueIds) {
    const a = mine.get(id);
    const b = theirs.get(id);
    if (a === undefined || b === undefined) continue;
    compared += 1;
    const row: PairFactRow = { id, a, b };
    if (a === b) {
      exact.push(row);
      if (a === 10) tens.push(row);
    } else if (Math.abs(a - b) === 1) {
      close.push(row);
    } else if (Math.abs(a - b) >= DIFFER_FROM) {
      differ.push(row);
    }
  }

  return { compared, exact, tens, close, differ };
}

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

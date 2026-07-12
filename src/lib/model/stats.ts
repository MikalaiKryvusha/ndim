/**
 * Агрегаты Пространства — то, из чего собран экран «Пространство» (ideas/06, макет V1
 * «Приборная панель», утверждён владельцем 2026-07-12).
 *
 * ЧИСТЫЙ МОДУЛЬ. Здесь нет ни Firestore, ни времени «сейчас» из воздуха: всё считается
 * из переданных данных, поэтому одни и те же функции работают и в сервере синхронизации
 * (`calculator/`, который эти документы ПИШЕТ), и в браузере (который их ЧИТАЕТ и строит
 * из них тренды). Тесты — `stats.test.ts`.
 *
 * ЧТО ЗДЕСЬ НЕТ И БЫТЬ НЕ МОЖЕТ — ничего персонального. Агрегат по определению не
 * указывает на человека: только счётчики Пространства целиком. Поэтому приватность
 * модели 2.0 (researches/04) этими документами не задевается.
 *
 * ТЕРМИНЫ — из версии 1.x (design/reference-1x/app-03-пространство.png), см. словарь
 * продукта в AGENT_GUIDE.md: «Сервер синхронизации», «Связей рассчитано»,
 * «Пользователей синхронизировано», «Диаметр Пространства NDim», состояние «Работает».
 */

import { roundedSpaceDiameter } from '../similarity/similarity.ts';
import type { DimId, Localized, Millis } from './schema.ts';

// ── Что читает агрегатор ────────────────────────────────────────────────────

/** Точка человека глазами агрегатора: сами оценки ему не нужны, нужно их число. */
export interface PointSummary {
  /** Сколько измерений человек себе оценил. Ноль — человека в Пространстве ещё нет. */
  readonly ratings: number;
  /** Анонимный гость (plans/03). Гость невидим другим — и в счётчики Пространства не входит. */
  readonly anonymous: boolean;
  /** Когда человек последний раз менял свои оценки (`points/{uid}.updated`). */
  readonly updated: Millis | null;
  /** Когда сервер синхронизации ВПЕРВЫЕ увидел эту точку (`points/{uid}.firstSeen`). */
  readonly firstSeen: Millis | null;
}

/** Измерение, появившееся в Пространстве недавно, — для события «Сегодня». */
export interface NewDim {
  readonly id: DimId;
  readonly title: Localized;
}

// ── Что агрегатор пишет ─────────────────────────────────────────────────────

/**
 * Распределение похожести по всем рассчитанным связям, в процентах от их числа.
 * Границы — как в утверждённом макете. Сумма может дать 99 или 101 из-за округления
 * каждой доли по отдельности; это честнее, чем подгонять последнюю корзину под 100.
 */
export interface SimilarityDistribution {
  /** 80–100 % */ readonly high: number;
  /** 60–79 % */ readonly upper: number;
  /** 40–59 % */ readonly middle: number;
  /** 0–39 % */ readonly low: number;
}

/** `space/stats` — текущее состояние Пространства. Пишет сервер синхронизации. */
export interface SpaceStatsDoc {
  readonly computedAt: Millis;
  /** Всего людей в Пространстве: непустая точка и не гость. */
  readonly people: number;
  readonly newIn30Days: number;
  readonly activeIn7Days: number;
  /** Количество измерений (каталог `dims/`). */
  readonly dims: number;
  /** Диаметр Пространства NDim — диагональ куба из всех измерений, в звёздах. Метрика 1.x. */
  readonly diameter: number;
  /** Оценок поставлено — всего по всем людям Пространства. */
  readonly ratings: number;
  /** Связей рассчитано — строк во всех топах последней синхронизации. */
  readonly relations: number;
  /** Средняя похожесть по всем рассчитанным связям, 0…100. */
  readonly avgSimilarity: number;
  readonly distribution: SimilarityDistribution;
  /** Измерения, появившиеся за последние сутки. Пусто — за сутки не появилось ни одного. */
  readonly newDims: readonly NewDim[];
}

/**
 * `space/stats/daily/{дата}` — снимок дня. Из снимков растут тренды: «что выросло,
 * что упало» — это разность двух снимков, а не отдельная сущность (ideas/06).
 * Документ дня перезаписывается на каждом расчёте, поэтому в нём — состояние на конец дня.
 */
export interface DailySnapshotDoc {
  /** `2026-07-12`, UTC. Он же — идентификатор документа. */
  readonly date: string;
  readonly people: number;
  readonly dims: number;
  readonly ratings: number;
  readonly relations: number;
  readonly avgSimilarity: number;
}

/**
 * `space/server` — сердцебиение и версия сервера синхронизации.
 *
 * Состояния «остановлен» здесь нет и быть не может: остановленный сервер не смог бы его
 * записать. Состояние ВЫВОДИТСЯ по свежести сердцебиения — {@link syncServerState}.
 */
export interface SyncServerDoc {
  readonly version: string;
  readonly build: string;
  readonly builtAt: string | null;
  /** Последний запуск цикла — сердцебиение. */
  readonly lastRunAt: Millis;
  /** Последняя успешная синхронизация (цикл, в котором действительно считались связи). */
  readonly lastSuccessAt: Millis | null;
  /** Выполнена за, мс. */
  readonly durationMs: number | null;
  readonly usersSynced: number;
  readonly relationsComputed: number;
  readonly intervalSeconds: number;
}

// ── Счёт ────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const NEW_WINDOW_DAYS = 30;
const ACTIVE_WINDOW_DAYS = 7;

/** Доля 0…1 → целые проценты. */
const percent = (part: number, whole: number): number => (whole === 0 ? 0 : Math.round((part / whole) * 100));

/** Ключ дня в UTC — `2026-07-12`. Один документ на сутки, как у воронки. */
export const dayKey = (millis: Millis): string => new Date(millis).toISOString().slice(0, 10);

/** Смещение ключа дня на `days` назад: `dayBefore('2026-07-12', 7)` → `'2026-07-05'`. */
export const dayBefore = (date: string, days: number): string => dayKey(Date.parse(date) - days * DAY_MS);

export function similarityDistribution(similarities: readonly number[]): SimilarityDistribution {
  let high = 0;
  let upper = 0;
  let middle = 0;
  let low = 0;
  for (const value of similarities) {
    if (value >= 80) high += 1;
    else if (value >= 60) upper += 1;
    else if (value >= 40) middle += 1;
    else low += 1;
  }
  const total = similarities.length;
  return {
    high: percent(high, total),
    upper: percent(upper, total),
    middle: percent(middle, total),
    low: percent(low, total),
  };
}

/**
 * Считает всё состояние Пространства за один проход.
 *
 * `similarities` — похожести ВСЕХ строк всех топов последней синхронизации (их число и есть
 * «Связей рассчитано»). Гости в них не попадают: сервер синхронизации не пускает гостя
 * в чужие топы (plans/03, В3), — поэтому и в среднюю похожесть они не вмешиваются.
 */
export function computeSpaceStats(
  input: {
    readonly points: readonly PointSummary[];
    readonly dimsCount: number;
    readonly newDims: readonly NewDim[];
    readonly similarities: readonly number[];
  },
  now: Millis,
): SpaceStatsDoc {
  // Человек в Пространстве — тот, у кого есть координаты. Гость невидим другим, поэтому
  // его нет и в счётчиках: иначе цифра на витрине обещала бы людей, которых не найти.
  const inhabitants = input.points.filter((point) => !point.anonymous && point.ratings > 0);

  const newSince = now - NEW_WINDOW_DAYS * DAY_MS;
  const activeSince = now - ACTIVE_WINDOW_DAYS * DAY_MS;

  let ratings = 0;
  let newIn30Days = 0;
  let activeIn7Days = 0;
  for (const point of inhabitants) {
    ratings += point.ratings;
    if (point.firstSeen !== null && point.firstSeen >= newSince) newIn30Days += 1;
    if (point.updated !== null && point.updated >= activeSince) activeIn7Days += 1;
  }

  const total = input.similarities.reduce((sum, value) => sum + value, 0);

  return {
    computedAt: now,
    people: inhabitants.length,
    newIn30Days,
    activeIn7Days,
    dims: input.dimsCount,
    diameter: roundedSpaceDiameter(input.dimsCount),
    ratings,
    relations: input.similarities.length,
    avgSimilarity: input.similarities.length === 0 ? 0 : Math.round(total / input.similarities.length),
    distribution: similarityDistribution(input.similarities),
    newDims: input.newDims,
  };
}

/** Снимок дня из текущего состояния. */
export function snapshotOf(stats: SpaceStatsDoc, date: string = dayKey(stats.computedAt)): DailySnapshotDoc {
  return {
    date,
    people: stats.people,
    dims: stats.dims,
    ratings: stats.ratings,
    relations: stats.relations,
    avgSimilarity: stats.avgSimilarity,
  };
}

// ── Тренды ──────────────────────────────────────────────────────────────────

/**
 * Самый свежий снимок НЕ ПОЗЖЕ указанного дня.
 *
 * Дня может не быть вовсе: снимок пишется только тогда, когда Пространство менялось.
 * Брать точное совпадение по дате — значит терять тренд в спокойную неделю; поэтому
 * ищем ближайший предыдущий. `null` — истории ещё нет, и тренд честно не показывается.
 */
export function snapshotOnOrBefore(
  snapshots: readonly DailySnapshotDoc[],
  date: string,
): DailySnapshotDoc | null {
  let best: DailySnapshotDoc | null = null;
  for (const snapshot of snapshots) {
    if (snapshot.date > date) continue;
    if (best === null || snapshot.date > best.date) best = snapshot;
  }
  return best;
}

/** Изменение метрик с момента снимка. `null` — сравнивать не с чем. */
export interface SpaceTrend {
  readonly people: number;
  readonly dims: number;
  readonly ratings: number;
  /** В процентных пунктах: похожесть сама измеряется в процентах. */
  readonly avgSimilarity: number;
}

export function trendSince(stats: SpaceStatsDoc, past: DailySnapshotDoc | null): SpaceTrend | null {
  if (past === null) return null;
  return {
    people: stats.people - past.people,
    dims: stats.dims - past.dims,
    ratings: stats.ratings - past.ratings,
    avgSimilarity: stats.avgSimilarity - past.avgSimilarity,
  };
}

// ── Виджет «Сегодня» ────────────────────────────────────────────────────────

/**
 * Событие суток. Модуль отдаёт ФАКТЫ (что и на сколько изменилось), а слова к ним
 * подбирает экран: тексты двуязычны и живут в интерфейсе, а не в модели.
 */
export type SpaceEvent =
  | { readonly kind: 'people'; readonly delta: number; readonly total: number }
  | { readonly kind: 'ratings'; readonly delta: number; readonly total: number }
  | { readonly kind: 'dims'; readonly delta: number; readonly total: number; readonly names: readonly NewDim[] }
  | { readonly kind: 'similarity'; readonly delta: number; readonly value: number }
  | { readonly kind: 'sync'; readonly relations: number; readonly at: Millis };

/**
 * Что случилось в Пространстве за сутки: разность с последним вчерашним снимком.
 *
 * Событий может не быть вовсе — и это нормальный, честный ответ («сегодня ничего не
 * изменилось»), а не пустой экран. Синхронизация в список не входит: она не событие
 * Пространства, а состояние сервера, и живёт в своём виджете.
 */
export function todayEvents(stats: SpaceStatsDoc, yesterday: DailySnapshotDoc | null): SpaceEvent[] {
  if (yesterday === null) return [];
  const events: SpaceEvent[] = [];

  const people = stats.people - yesterday.people;
  if (people !== 0) events.push({ kind: 'people', delta: people, total: stats.people });

  const ratings = stats.ratings - yesterday.ratings;
  if (ratings !== 0) events.push({ kind: 'ratings', delta: ratings, total: stats.ratings });

  const dims = stats.dims - yesterday.dims;
  if (dims !== 0) events.push({ kind: 'dims', delta: dims, total: stats.dims, names: stats.newDims });

  const similarity = stats.avgSimilarity - yesterday.avgSimilarity;
  if (similarity !== 0) events.push({ kind: 'similarity', delta: similarity, value: stats.avgSimilarity });

  return events;
}

// ── Состояние сервера синхронизации ─────────────────────────────────────────

/**
 * Сколько интервалов молчания мы прощаем, прежде чем перестать говорить «Работает».
 * Один пропущенный цикл — не повод пугать человека: сеть моргает, машина занята.
 */
export const HEARTBEAT_TOLERANCE = 3;

/**
 * `running` — сервер отчитался недавно, показываем «Работает» (термин 1.x).
 * `silent` — сердцебиения нет дольше {@link HEARTBEAT_TOLERANCE} интервалов. Мы НЕ знаем,
 * что он остановлен: мы знаем только, что он не отвечает, — так и говорим.
 */
export type SyncServerState = 'running' | 'silent';

export function syncServerState(server: SyncServerDoc | null, now: Millis): SyncServerState {
  if (server === null) return 'silent';
  const silenceLimit = HEARTBEAT_TOLERANCE * server.intervalSeconds * 1000;
  return now - server.lastRunAt <= silenceLimit ? 'running' : 'silent';
}

/** Когда сервер синхронизации выйдет на следующий цикл («Запланированная» в 1.x). */
export const nextRunAt = (server: SyncServerDoc): Millis =>
  server.lastRunAt + server.intervalSeconds * 1000;

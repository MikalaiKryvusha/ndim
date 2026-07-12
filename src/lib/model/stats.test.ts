/**
 * Тесты агрегатов Пространства.
 *
 * Здесь проверяется ЧЕСТНОСТЬ ЦИФР на витрине: экран «Пространство» — единственное место,
 * где продукт сам о себе рассказывает. Соврать тут — значит пообещать людей, которых нет,
 * или показать «Работает» у сервера, который молчит вторые сутки.
 *
 * Три вещи, которые эти тесты стерегут отдельно:
 *   · гость не входит в счётчики Пространства (он невидим другим — plans/03, В3);
 *   · тренд без истории НЕ выдумывается, а честно отсутствует;
 *   · «Работает» выводится из сердцебиения, а не из желания показать зелёную лампочку.
 *
 * Запуск: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  HEARTBEAT_TOLERANCE,
  computeSpaceStats,
  dayBefore,
  dayKey,
  nextRunAt,
  similarityDistribution,
  snapshotOf,
  snapshotOnOrBefore,
  syncServerState,
  todayEvents,
  trendSince,
  type DailySnapshotDoc,
  type PointSummary,
  type SyncServerDoc,
} from './stats.ts';

const NOW = Date.parse('2026-07-12T03:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

/** Обычный человек Пространства: оценил измерения, давно с нами, недавно заходил. */
const person = (over: Partial<PointSummary> = {}): PointSummary => ({
  ratings: 4,
  anonymous: false,
  updated: NOW - DAY,
  firstSeen: NOW - 100 * DAY,
  ...over,
});

const stats = (points: readonly PointSummary[], similarities: readonly number[] = [], dimsCount = 4) =>
  computeSpaceStats({ points, dimsCount, newDims: [], similarities }, NOW);

describe('Кто живёт в Пространстве', () => {
  test('человек с оценками считается; гость — нет', () => {
    const result = stats([person(), person(), person({ anonymous: true })]);
    assert.equal(result.people, 2, 'гость невидим другим — в счётчике Пространства его нет');
  });

  test('человек без единой оценки не в Пространстве: у него нет координат', () => {
    assert.equal(stats([person(), person({ ratings: 0 })]).people, 1);
  });

  test('оценки гостя не попадают в «оценок поставлено»', () => {
    const result = stats([person({ ratings: 4 }), person({ anonymous: true, ratings: 99 })]);
    assert.equal(result.ratings, 4);
  });

  test('новые за 30 дней и активные за 7 дней считаются по своим окнам', () => {
    const result = stats([
      person({ firstSeen: NOW - 5 * DAY, updated: NOW - 5 * DAY }), // и новый, и активный
      person({ firstSeen: NOW - 40 * DAY, updated: NOW - 2 * DAY }), // старожил, но активный
      person({ firstSeen: NOW - 40 * DAY, updated: NOW - 30 * DAY }), // ни то, ни другое
      person({ firstSeen: NOW - 29 * DAY, updated: NOW - 8 * DAY }), // новый, но затих
    ]);
    assert.equal(result.newIn30Days, 2);
    assert.equal(result.activeIn7Days, 2);
  });

  test('точка, которую сервер синхронизации ещё ни разу не видел, не считается новой', () => {
    // firstSeen ставит сервер синхронизации. null = ни одного цикла ещё не было:
    // додумывать за него дату (например, «сегодня») — значит врать в счётчике.
    assert.equal(stats([person({ firstSeen: null })]).newIn30Days, 0);
  });
});

describe('Измерения и диаметр Пространства NDim', () => {
  test('диаметр — диагональ куба из всех измерений (метрика 1.x)', () => {
    // 5111 измерений → 714.9 звезды: ровно то число, что стоит на живом экране 1.x.
    assert.equal(stats([], [], 5111).diameter, 714.9);
  });

  test('пустое Пространство: ноль измерений — ноль диаметра, и никаких NaN', () => {
    const result = stats([], [], 0);
    assert.equal(result.diameter, 0);
    assert.equal(result.avgSimilarity, 0);
    assert.equal(result.relations, 0);
  });
});

describe('Похожесть по всему Пространству', () => {
  test('средняя похожесть и число связей — по всем строкам всех топов', () => {
    const result = stats([person()], [80, 60, 40, 20]);
    assert.equal(result.relations, 4);
    assert.equal(result.avgSimilarity, 50);
  });

  test('распределение раскладывает связи по корзинам макета', () => {
    const d = similarityDistribution([100, 80, 79, 60, 59, 40, 39, 0]);
    assert.deepEqual(d, { high: 25, upper: 25, middle: 25, low: 25 });
  });

  test('границы корзин: 80 — «высокая», 79 — уже нет', () => {
    assert.deepEqual(similarityDistribution([80]), { high: 100, upper: 0, middle: 0, low: 0 });
    assert.deepEqual(similarityDistribution([79]), { high: 0, upper: 100, middle: 0, low: 0 });
  });

  test('связей нет — распределение нулевое, а не поделённое на ноль', () => {
    assert.deepEqual(similarityDistribution([]), { high: 0, upper: 0, middle: 0, low: 0 });
  });
});

describe('Тренды: разность двух снимков', () => {
  const today = stats([person(), person()], [60, 40], 4);

  test('снимок дня повторяет метрики, а не пересчитывает их заново', () => {
    const snapshot = snapshotOf(today);
    assert.equal(snapshot.date, '2026-07-12');
    assert.equal(snapshot.people, today.people);
    assert.equal(snapshot.ratings, today.ratings);
  });

  test('истории нет — тренда нет (не выдумываем нулевой рост)', () => {
    assert.equal(trendSince(today, null), null);
  });

  test('рост и падение считаются со знаком; похожесть — в пунктах', () => {
    const week: DailySnapshotDoc = {
      date: '2026-07-05', people: 1, dims: 3, ratings: 4, relations: 1, avgSimilarity: 60,
    };
    assert.deepEqual(trendSince(today, week), { people: 1, dims: 1, ratings: 4, avgSimilarity: -10 });
  });

  test('берётся ближайший снимок НЕ ПОЗЖЕ даты: в спокойный день снимка может не быть', () => {
    const history: DailySnapshotDoc[] = [
      { date: '2026-07-01', people: 1, dims: 1, ratings: 1, relations: 0, avgSimilarity: 10 },
      { date: '2026-07-04', people: 2, dims: 2, ratings: 2, relations: 0, avgSimilarity: 20 },
      { date: '2026-07-11', people: 9, dims: 9, ratings: 9, relations: 0, avgSimilarity: 90 },
    ];
    assert.equal(snapshotOnOrBefore(history, '2026-07-05')?.date, '2026-07-04');
    assert.equal(snapshotOnOrBefore(history, '2026-07-04')?.date, '2026-07-04');
    assert.equal(snapshotOnOrBefore(history, '2026-06-30'), null, 'до начала истории сравнивать не с чем');
  });

  test('ключ дня и сдвиг на неделю назад', () => {
    assert.equal(dayKey(NOW), '2026-07-12');
    assert.equal(dayBefore('2026-07-12', 7), '2026-07-05');
    assert.equal(dayBefore('2026-07-01', 1), '2026-06-30', 'через границу месяца');
  });
});

describe('Виджет «Сегодня»', () => {
  const yesterday: DailySnapshotDoc = {
    date: '2026-07-11', people: 1, dims: 3, ratings: 4, relations: 2, avgSimilarity: 60,
  };

  test('событие рождается только там, где что-то изменилось', () => {
    const today = computeSpaceStats(
      {
        points: [person(), person()],
        dimsCount: 4,
        newDims: [{ id: 'silence', title: { ru: 'Тишина', en: 'Silence' } }],
        similarities: [50, 50],
      },
      NOW,
    );
    const events = todayEvents(today, yesterday);
    assert.deepEqual(events.map((event) => event.kind), ['people', 'ratings', 'dims', 'similarity']);

    const dims = events.find((event) => event.kind === 'dims');
    assert.equal(dims?.delta, 1);
    assert.deepEqual(dims?.names.map((dim) => dim.id), ['silence'], 'у нового измерения есть имя');

    const similarity = events.find((event) => event.kind === 'similarity');
    assert.equal(similarity?.delta, -10, 'падение показывается со знаком минус');
  });

  test('спокойные сутки: событий нет — и это честный ответ, а не пустой экран', () => {
    const same = stats([person()], [60, 60], 3);
    const snapshot = snapshotOf(same, '2026-07-11');
    assert.deepEqual(todayEvents(same, snapshot), []);
  });

  test('первый день Пространства: вчерашнего снимка нет — событий нет', () => {
    assert.deepEqual(todayEvents(stats([person()]), null), []);
  });
});

describe('Состояние сервера синхронизации', () => {
  const server: SyncServerDoc = {
    version: '2.0.0', build: 'dev', builtAt: null,
    lastRunAt: NOW - 60_000, lastSuccessAt: NOW - 60_000, durationMs: 840,
    usersSynced: 4, relationsComputed: 12, intervalSeconds: 60,
  };

  test('отчитался только что — «Работает»', () => {
    assert.equal(syncServerState(server, NOW), 'running');
  });

  test('молчит дольше трёх интервалов — не отвечает', () => {
    const silenceLimit = HEARTBEAT_TOLERANCE * server.intervalSeconds * 1000;
    const border = { ...server, lastRunAt: NOW - silenceLimit };
    assert.equal(syncServerState(border, NOW), 'running', 'ровно на границе прощения — ещё работает');

    const late = { ...server, lastRunAt: NOW - silenceLimit - 1 };
    assert.equal(syncServerState(late, NOW), 'silent');
  });

  test('сервер ни разу не отчитывался — не отвечает (а не «Работает» по умолчанию)', () => {
    assert.equal(syncServerState(null, NOW), 'silent');
  });

  test('следующий цикл — через интервал после последнего', () => {
    assert.equal(nextRunAt(server), NOW - 60_000 + 60_000);
  });
});

/**
 * Слой данных экрана «Пространство» (ideas/06, макет V1 «Приборная панель»).
 *
 * Экран НИЧЕГО не считает: все цифры уже посчитал сервер синхронизации (`calculator/`)
 * и положил в `space/*`. Здесь — чтение трёх мест и сборка того, что из них следует:
 *   · `space/stats`             — состояние Пространства сейчас;
 *   · `space/stats/daily/{дата}`— снимки дней, из которых растут тренды;
 *   · `space/server`            — сердцебиение и версия сервера синхронизации.
 *
 * Клиенту запись сюда запрещена правилами: цифры на витрине не должен уметь подделать
 * никто. Тренды и состояние сервера выводит чистый `model/stats.ts` — тот же модуль,
 * которым сервер их и записывает.
 */

import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase.ts';
import {
  dayBefore,
  dayKey,
  snapshotOnOrBefore,
  syncServerState,
  todayEvents,
  trendSince,
  type DailySnapshotDoc,
  type SpaceEvent,
  type SpaceStatsDoc,
  type SpaceTrend,
  type SyncServerDoc,
  type SyncServerState,
} from '../model/stats.ts';

/** Глубина истории: две недели — этого хватает и на недельный тренд, и на линию динамики. */
export const HISTORY_DAYS = 14;

export interface SpaceScreenData {
  readonly stats: SpaceStatsDoc;
  readonly server: SyncServerDoc | null;
  readonly serverState: SyncServerState;
  /** Изменение за неделю. `null` — истории ещё нет, и тренд честно не показывается. */
  readonly week: SpaceTrend | null;
  /** Что случилось за сутки. Пусто — «сегодня ничего не изменилось», это честный ответ. */
  readonly events: readonly SpaceEvent[];
  /** Снимки последних дней по возрастанию даты — линии динамики на плитках. */
  readonly history: readonly DailySnapshotDoc[];
}

/**
 * Только сердцебиение и версия сервера синхронизации — для подвала «Меню».
 * `null` — сервер ещё ни разу не отчитывался; врать про его версию мы не будем.
 */
export async function loadSyncServer(): Promise<SyncServerDoc | null> {
  const snapshot = await getDoc(doc(db(), 'space', 'server'));
  return snapshot.exists() ? (snapshot.data() as SyncServerDoc) : null;
}

/**
 * Загружает всё, что показывает экран. `null` — сервер синхронизации ещё ни разу не считал:
 * показывать нули как «состояние Пространства» было бы враньём.
 */
export async function loadSpace(now: number = Date.now()): Promise<SpaceScreenData | null> {
  const store = db();

  const [statsSnap, serverSnap, historySnap] = await Promise.all([
    getDoc(doc(store, 'space', 'stats')),
    getDoc(doc(store, 'space', 'server')),
    getDocs(
      query(
        collection(store, 'space', 'stats', 'daily'),
        orderBy('date', 'desc'),
        limit(HISTORY_DAYS),
      ),
    ),
  ]);

  if (!statsSnap.exists()) return null;

  const stats = statsSnap.data() as SpaceStatsDoc;
  const server = serverSnap.exists() ? (serverSnap.data() as SyncServerDoc) : null;

  // Снимки приходят от свежих к старым (так их отдаёт индекс) — разворачиваем в хронологию.
  const history = historySnap.docs
    .map((snapshot) => snapshot.data() as DailySnapshotDoc)
    .reverse();

  const today = dayKey(stats.computedAt);

  return {
    stats,
    server,
    serverState: syncServerState(server, now),
    week: trendSince(stats, snapshotOnOrBefore(history, dayBefore(today, 7))),
    // Вчерашний снимок, а не «предпоследний в списке»: сегодняшний день в истории уже есть,
    // и сравнивать его с самим собой — значит всегда показывать «ничего не изменилось».
    events: todayEvents(stats, snapshotOnOrBefore(history, dayBefore(today, 1))),
    history,
  };
}

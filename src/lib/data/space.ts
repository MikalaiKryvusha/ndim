/**
 * Слой данных экрана «Пространство» (ideas/06, макет V1 «Приборная панель»).
 *
 * Экран НИЧЕГО не считает: все цифры уже посчитал сервер синхронизации (`sync-server/`)
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

import { FRESH, KEYS, cached, peek } from './cache.ts';
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
 * Цифры Пространства без пульса — то, что живёт в кэше ВСЮ сессию (интервью №005, В4).
 * Пульс сюда не входит намеренно: у него своя, минутная свежесть (`FRESH.pulse`).
 */
type SpaceFacts = Omit<SpaceScreenData, 'server' | 'serverState'>;

/**
 * Только сердцебиение и версия сервера синхронизации — для подвала «Меню» и для лампочки
 * «Пространства».
 *
 * `null` — сервер ещё ни разу не отчитывался; врать про его версию мы не будем.
 *
 * Одна запись кэша на весь продукт: «Меню», «О системе» и «Пространство» спрашивают пульс
 * ОДНИМ ключом, поэтому переход между ними не стоит лишнего чтения.
 */
export async function loadSyncServer(): Promise<SyncServerDoc | null> {
  return cached(KEYS.syncServer, FRESH.pulse, async () => {
    const snapshot = await getDoc(doc(db(), 'space', 'server'));
    return snapshot.exists() ? (snapshot.data() as SyncServerDoc) : null;
  });
}

/**
 * Загружает всё, что показывает экран. `null` — сервер синхронизации ещё ни разу не считал:
 * показывать нули как «состояние Пространства» было бы враньём.
 *
 * Двумя записями кэша, а не одной: цифры — на сессию, пульс — на минуту (см. {@link FRESH}).
 */
export async function loadSpace(now: number = Date.now()): Promise<SpaceScreenData | null> {
  const [facts, server] = await Promise.all([
    cached<SpaceFacts | null>(KEYS.space, FRESH.server, fetchSpaceFacts),
    loadSyncServer(),
  ]);
  if (facts === null) return null;

  /*
   * ⚠️ Состояние сервера выводим НА КАЖДЫЙ вызов, хотя цифры отдаём из кэша.
   * `syncServerState` считается из сердцебиения ОТНОСИТЕЛЬНО «сейчас» — заморозь его вместе с
   * цифрами, и умолкший сервер весь сеанс показывался бы как «Работает» (а живой, что хуже, —
   * как умерший). Лампочка обязана выводиться из наблюдения, а не из памяти (канон
   * `AGENT_GUIDE` → «Словарь продукта»).
   */
  return { ...facts, server, serverState: syncServerState(server, now) };
}

/** Что лежит в памяти прямо сейчас — для первого кадра «Пространства», без лоадера. */
export function peekSpace(now: number = Date.now()): SpaceScreenData | null | undefined {
  const facts = peek<SpaceFacts | null>(KEYS.space);
  if (facts === undefined || facts === null) return facts;
  // Пульс лежит своей записью; его нет в памяти — честно считаем сервер молчащим, а через
  // мгновение `loadSpace` перечитает его и лампочка встанет на место.
  const server = peek<SyncServerDoc | null>(KEYS.syncServer) ?? null;
  return { ...facts, server, serverState: syncServerState(server, now) };
}

async function fetchSpaceFacts(): Promise<SpaceFacts | null> {
  const store = db();

  const [statsSnap, historySnap] = await Promise.all([
    getDoc(doc(store, 'space', 'stats')),
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

  // Снимки приходят от свежих к старым (так их отдаёт индекс) — разворачиваем в хронологию.
  const history = historySnap.docs
    .map((snapshot) => snapshot.data() as DailySnapshotDoc)
    .reverse();

  const today = dayKey(stats.computedAt);

  return {
    stats,
    week: trendSince(stats, snapshotOnOrBefore(history, dayBefore(today, 7))),
    // Вчерашний снимок, а не «предпоследний в списке»: сегодняшний день в истории уже есть,
    // и сравнивать его с самим собой — значит всегда показывать «ничего не изменилось».
    events: todayEvents(stats, snapshotOnOrBefore(history, dayBefore(today, 1))),
    history,
  };
}

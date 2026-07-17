/**
 * Слой данных экрана «Измерения».
 *
 * ⚠️ ГЛАВНЫЙ ПРИНЦИП ЗДЕСЬ — ЭКОНОМИЯ ЗАПРОСОВ К БАЗЕ.
 *
 * Слово владельца (2026-07-12): «Я весь первый NDim писал так, чтобы ЭКОНОМИТЬ ЗАПРОСЫ К БАЗЕ!!!
 * Везде, где могу». Это не придирка, а архитектурное решение автора, и 2.0 обязан его уважать:
 * Firestore берёт деньги за КАЖДОЕ чтение документа, а каталог у нас — 5111 записей.
 *
 * Как экономим:
 *   1. **Индекс вместо каталога.** `dims/dims_list` — ОДИН документ, в нём JSON-строка
 *      `{ dimId: {ru, en, year} }` по всем измерениям. Этого хватает и на ленту, и на поиск.
 *      Один запрос вместо 5111. (До этой правки `loadProfileScreen` честно вычитывал все 5111
 *      документов при каждом открытии профиля — стыдно и дорого.)
 *   2. **Полные карточки — только те, что человек реально увидит**, порциями по мере прокрутки.
 *   3. **Кеш на сессию** (`cache`) — как `dims_cache_map` в 1.x. Пролистал назад, вернулся на
 *      вкладку, отменил оценку — повторного запроса нет.
 *
 * Порядок ленты и её математика живут в чистом `model/feed.ts` (он покрыт тестами).
 * Здесь — только чтение, запись и кеш.
 */
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';

import { db } from '../firebase.ts';
import { buildUnratedFeed, parseDimsIndex, sortMyDims, type DimsIndex } from '../model/feed.ts';
import { assertValidRating, DIMS_INDEX_ID, type DimDoc, type Uid } from '../model/schema.ts';

/** Измерение вместе с его идентификатором. */
export interface DimCard extends DimDoc {
  readonly id: string;
}

/** Сколько карточек добираем за один заход подгрузки. */
export const PAGE_SIZE = 12;

/**
 * Кеш прочитанных измерений — на всё время жизни вкладки.
 *
 * Каталог НЕИЗМЕНЯЕМ для человека (измерения заводит админ), поэтому перечитывать одно и то же
 * незачем: это чистые деньги на ветер. Ровно так делал 1.x (`dims_cache_map`).
 */
const cache = new Map<string, DimCard>();

/** Индекс каталога — тоже читаем один раз за сессию. */
let indexCache: DimsIndex | null = null;

/** Читает индекс каталога (один документ на все 5111 измерений). */
export async function loadDimsIndex(): Promise<DimsIndex> {
  if (indexCache !== null) return indexCache;

  const snapshot = await getDoc(doc(db(), 'dims', DIMS_INDEX_ID));
  indexCache = parseDimsIndex(snapshot.data()?.dims_list);
  return indexCache;
}

/**
 * Добирает полные карточки по списку идентификаторов — только те, которых ещё нет в кеше.
 *
 * Идём параллельно: это N запросов, но N — размер ПОРЦИИ (12), а не размер каталога (5111).
 */
export async function loadDimCards(ids: readonly string[]): Promise<DimCard[]> {
  const store = db();
  const missing = ids.filter((id) => !cache.has(id));

  await Promise.all(
    missing.map(async (id) => {
      const snapshot = await getDoc(doc(store, 'dims', id));
      if (!snapshot.exists()) return; // измерение удалили из каталога — не беда, просто не покажем
      cache.set(id, { id, ...(snapshot.data() as DimDoc) });
    }),
  );

  // Порядок возвращаем ТОТ ЖЕ, что просили: он случайный, и перемешивать его повторно нельзя.
  return ids.map((id) => cache.get(id)).filter((card): card is DimCard => card !== undefined);
}

/**
 * Мои оценки: `points/{uid}/dims` — одно чтение коллекции.
 *
 * Отдельно от тяжёлого `loadProfileScreen`: экрану «Измерения» профиль не нужен, а лишний
 * запрос — это лишние деньги.
 */
export async function loadMyRatings(uid: Uid): Promise<Map<string, number>> {
  const snapshot = await getDocs(collection(db(), 'points', uid, 'dims'));

  const ratings = new Map<string, number>();
  for (const rating of snapshot.docs) {
    ratings.set(rating.id, (rating.data() as { value: number }).value);
  }
  return ratings;
}

/** Всё, что нужно экрану «Измерения», кроме самих карточек (их берём порциями). */
export interface DimsScreenData {
  readonly index: DimsIndex;
  /** Мои оценки: dimId → 0…10. */
  readonly ratings: ReadonlyMap<string, number>;
  /** Очередь вкладки «Все»: неоценённое, в случайном порядке. */
  readonly feed: readonly string[];
  /** Очередь вкладки «Мой NDim ID»: своё, по убыванию своей оценки. */
  readonly mine: readonly string[];
}

/**
 * Собирает экран: индекс (1 запрос) + мои оценки (1 запрос коллекции) — и всё.
 * Каталог целиком не читается НИКОГДА.
 */
export async function loadDimsScreen(
  uid: Uid,
  ratings: ReadonlyMap<string, number>,
): Promise<DimsScreenData> {
  const index = await loadDimsIndex();
  const rated = new Set(ratings.keys());

  return {
    index,
    ratings,
    feed: buildUnratedFeed(index, rated),
    mine: sortMyDims(ratings),
  };
}

/**
 * Ставит оценку и помечает точку «грязной», чтобы сервер синхронизации пересчитал связи.
 * Оба документа — одним батчем: оценка без флага потерялась бы для пересчёта.
 *
 * Дубль логики `saveRating` из `data/profile.ts` здесь не заводим — переиспользуем её же.
 */
export { saveRating, removeRating } from './profile.ts';

/** Пересобирает очередь «Все» после отмены оценки: измерение возвращается в ленту (как в 1.x). */
export function feedWithRestored(feed: readonly string[], dimId: string): string[] {
  return feed.includes(dimId) ? [...feed] : [dimId, ...feed];
}

/** Проверка значения — чтобы в базу не уехала оценка вне 0…10. */
export { assertValidRating };

/**
 * СЛОЙ ДАННЫХ КОМНАТЫ «ИЗМЕРЕНИЯ» — панель администратора (`plans/44`, фаза 4 эпика `ideas/29`).
 *
 * 🔴 ПОЧЕМУ ЭТО ОТДЕЛЬНЫЙ МОДУЛЬ, А НЕ ПРАВКА `data/dims.ts`. Здесь живёт ЗАПИСЬ в каталог, и
 * ей нельзя оказаться в чанках публичных страниц: их качают все, а писать в каталог может один
 * человек. Сборщик режет чанки по маршрутам, поэтому модуль, который импортирует только раздел
 * `/admin`, туда и уедет (класс `EXP-0136`: универсальный загрузчик однажды вшил весь каталог,
 * 16,86 МБ, в клиентский бандл — и двадцать четыре функциональные проверки были при этом
 * ЗЕЛЁНЫМИ, потому что вес не проверял никто).
 *
 * ⚠️ КАНОН ЭКОНОМИИ ЗАПРОСОВ соблюдается по построению: список комнаты — это ОДНО чтение
 * индекса `dims/dims_list` на все 5111 измерений плюс один запрос за свежими документами
 * (обычно он приносит ноль). Полного обхода каталога здесь нет ни на одном пути.
 *
 * 🔴🔴 ПИСАТЕЛЬ ИНДЕКСА ОДИН — СЕРВЕР СИНХРОНИЗАЦИИ, и панель строку индекса НЕ пишет.
 * Это не упущение, а замер по коду (`plans/44` шаг 4): дельта-механизм сервера принимает
 * прирост, только если он сошёлся с числом прибывших документов
 * (`grew === dimsCount - built.docs`). Строка, вписанная панелью заранее, обнуляет прирост —
 * и сервер честно уходит в ПОЛНУЮ пересборку 5112 документов, то есть ломает критерий 3
 * фазы («полной пересборки не было»). Шаг 0 этого же плана назвал верную развязку словами
 * «панель может не знать про индекс вовсе».
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';

import { db } from '../firebase.ts';
import { parseDimsIndex } from '../model/feed.ts';
import { DIMS_INDEX_ID, type DimDoc } from '../model/schema.ts';
import { draftToDoc, type DimDraft, type PreservedFields } from '../model/dim-editor.ts';

/** Строка списка комнаты. Ровно то, что есть в индексе, — большего для списка не нужно. */
export interface AdminDimRow {
  readonly id: string;
  readonly ru: string;
  readonly en: string;
  readonly year: string;
  /** Измерение уже в каталоге, но сервер синхронизации ещё не внёс его в индекс. */
  readonly awaitingIndex: boolean;
}

/** Каталог глазами комнаты. */
export interface AdminCatalog {
  readonly rows: readonly AdminDimRow[];
  /** Сколько измерений ждут попадания в индекс. Ноль — обычное состояние. */
  readonly awaitingIndex: number;
}

/** Полная карточка для правки. */
export interface AdminDim extends DimDoc {
  readonly id: string;
}

/**
 * Список каталога для комнаты.
 *
 * ДВА источника, и второй нужен не «на всякий случай». Индекс обновляет сервер синхронизации
 * своим циклом (на стенде 15 с, в бою 60 с), поэтому измерение, только что заведённое из
 * панели, в индексе ещё не лежит. Без второго источника владелец, обновив страницу сразу после
 * создания, не нашёл бы свою запись — и завёл бы её второй раз.
 *
 * Второй запрос — та же дельта, что делает сервер: документы, созданные не раньше отметки
 * свежести индекса. Обычно он приносит НОЛЬ документов, поэтому цена его — один запрос, а не
 * обход каталога.
 */
export async function loadAdminCatalog(): Promise<AdminCatalog> {
  const store = db();
  const snapshot = await getDoc(doc(store, 'dims', DIMS_INDEX_ID));
  const index = parseDimsIndex(snapshot.data()?.dims_list);

  const rows = new Map<string, AdminDimRow>();
  for (const [id, entry] of index) {
    rows.set(id, {
      id,
      ru: entry.ru ?? '',
      en: entry.en ?? '',
      year: entry.year ?? '',
      awaitingIndex: false,
    });
  }

  // Отметка свежести индекса. Нет её — дельту не спрашиваем: без опоры запрос стал бы обходом
  // всего каталога, а это ровно то, чего канон экономии не разрешает.
  const builtAt: unknown = snapshot.data()?.built?.at;
  let awaiting = 0;
  if (typeof builtAt === 'number') {
    const fresh = await getDocs(
      query(collection(store, 'dims'), where('time.created', '>=', Timestamp.fromMillis(builtAt))),
    );
    for (const found of fresh.docs) {
      if (rows.has(found.id)) continue;
      const data = found.data() as Partial<DimDoc>;
      rows.set(found.id, {
        id: found.id,
        ru: data.title?.ru ?? '',
        en: data.title?.en ?? '',
        year: typeof data.year === 'string' ? data.year : '',
        awaitingIndex: true,
      });
      awaiting += 1;
    }
  }

  /*
   * Порядок — по русскому названию, и он ПОЛНЫЙ: тай-брейк по идентификатору. Без тай-брейка
   * список с одинаковыми названиями перетасовывался бы между заходами (канон стиля кода:
   * «канонический порядок у всего, что сравнивается или кэшируется»).
   */
  const sorted = [...rows.values()].sort((a, b) => {
    // `numeric: true` — чтобы «Проба 2» стояла раньше «Пробы 10», а не наоборот. Поймано
    // глазами на кадре стража: строковое сравнение читает «10» как «1», и список с номерами
    // в названии выглядит перетасованным.
    const byName = (a.ru || a.en).localeCompare(b.ru || b.en, 'ru', { numeric: true });
    return byName !== 0 ? byName : a.id.localeCompare(b.id);
  });

  return { rows: sorted, awaitingIndex: awaiting };
}

/** Точечное чтение карточки — только когда её открыли на правку. */
export async function loadDimForEdit(id: string): Promise<AdminDim | null> {
  const snapshot = await getDoc(doc(db(), 'dims', id));
  if (!snapshot.exists()) return null;
  return { id, ...(snapshot.data() as DimDoc) };
}

/**
 * Заводит измерение.
 *
 * Идентификатор — автоматический, той же формы, что у 5111 боевых записей (20 знаков). Слаг
 * публичной страницы из него выводит сборка (`dim-slug.ts`), поэтому придумывать «человеческий»
 * идентификатор незачем, а придуманный однажды разошёлся бы со слагом.
 *
 * `time.created` ставится СЕРВЕРНЫМ временем: на этой метке держатся бейдж «Новое» (14 дней) и
 * дельта-механизм индекса. Часы браузера здесь не годятся — сдвинутые часы либо спрячут запись
 * от дельты, либо навсегда оставят её «новой».
 */
export async function createDim(draft: DimDraft): Promise<string> {
  const store = db();
  const ref = doc(collection(store, 'dims'));
  await setDoc(ref, { ...draftToDoc(draft), time: { created: serverTimestamp() } });
  return ref.id;
}

/**
 * Правит измерение.
 *
 * 🔴 ТРИ ВЕЩИ ПЕРЕЖИВАЮТ ПРАВКУ, и каждая по своей причине:
 *   · **сводка оценок** (`stars`/`rates`/`rating`) — это труд людей, ставивших звёзды, и её
 *     считает сервер синхронизации. Правила её обнуления НЕ поймают: ноль лежит внутри границ
 *     шкалы (`dim-editor.test.ts` стережёт этот класс);
 *   · **`time`** — метка создания. Переписать её значит сделать старую запись «новой» и
 *     столкнуть дельту индекса;
 *   · **`name`** — легаси 1.x, лежащее у всех 5111 записей. Правила терпят его на правке
 *     намеренно: снести его молча здесь значило бы сделать прополку (шаг 7 `plans/44`) побочным
 *     эффектом правки названия, тогда как она ждёт отдельного слова владельца и бэкапа.
 *
 * Запись ПОЛНАЯ, а не слиянием: слияние не умеет убирать поле, и снятый человеком год остался бы
 * в документе. Поэтому переносим явно то, что обязано пережить, и пишем документ целиком.
 */
export async function updateDim(current: AdminDim, draft: DimDraft): Promise<void> {
  const preserved: PreservedFields = {
    stars: current.stars,
    rates: current.rates,
    rating: current.rating,
  };
  const legacyName = (current as { name?: unknown }).name;

  await setDoc(doc(db(), 'dims', current.id), {
    ...draftToDoc(draft, preserved),
    ...(current.time === undefined ? {} : { time: current.time }),
    ...(legacyName === undefined ? {} : { name: legacyName }),
  });
}

/**
 * Удаляет измерение.
 *
 * ⚠️ Честная цена, названная здесь, потому что её видно только отсюда: удаление УМЕНЬШАЕТ число
 * документов каталога, а свежесть индекса сервер судит по равенству чисел — значит следующий
 * цикл уйдёт в полную пересборку. Это свойство сервера, а не панели, и починка ему не здесь;
 * удаление измерения — событие редкое (каталог владелец ведёт, а не чистит пачками).
 */
export async function removeDim(id: string): Promise<void> {
  await deleteDoc(doc(db(), 'dims', id));
}

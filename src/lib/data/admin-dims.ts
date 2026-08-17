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
import { collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

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
 * Измерения, заведённые в ЭТОЙ вкладке и ещё не попавшие в индекс каталога.
 *
 * Живёт в памяти модуля намеренно: это замена лишнему запросу к базе, а не кеш. Индекс ведёт
 * сервер синхронизации своим циклом, и до конца цикла новая запись существует только у нас.
 * Перезагрузка вкладку обнуляет — и это честно: после перезагрузки правда о каталоге одна,
 * и она в индексе.
 */
const createdThisSession = new Map<string, AdminDimRow>();

/**
 * Список каталога для комнаты — **РОВНО ОДНО ЧТЕНИЕ** документа `dims/dims_list`.
 *
 * 🔴🔴 ОДИН ЗАПРОС — ПРЯМОЕ УКАЗАНИЕ ВЛАДЕЛЬЦА 2026-08-17, дословно: «*нужно убедиться, что
 * менеджер грузит весь список измерений только одним запросом димс лист*». Это применение его же
 * канона: «*я весь первый NDim писал так, чтобы ЭКОНОМИТЬ ЗАПРОСЫ К БАЗЕ!!! Везде, где могу*».
 * Замерено прибором `tools/measure-admin-dims-reads.mjs`: открытие комнаты стоит **1 чтение**.
 *
 * ⛔ **ЧЕГО ЗДЕСЬ БЫЛО И ПОЧЕМУ УБРАНО.** Первая редакция читала ВТОРОЙ источник — дельту
 * `dims where time.created >= built.at`, — чтобы только что заведённое измерение было видно до
 * того, как сервер синхронизации внесёт его в индекс. Заплатка стоила лишнего запроса на КАЖДОМ
 * открытии комнаты ради случая, который случается раз в день. Владелец эту цену не принял, и он
 * прав: то же самое покрывается БЕЗ обращения к базе — созданная строка добавляется в список
 * из памяти страницы (`rememberCreated` ниже).
 *
 * ⚠️ Честная граница, которая от этого осталась: если перезагрузить страницу в течение цикла
 * синхронизации после создания, новой записи в списке не будет — индекс её ещё не знает. Экран
 * говорит об этом словами прямо в ответе на создание, а не оставляет человека догадываться.
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

  /*
   * Созданное в этой сессии, чего индекс ещё не знает. Держится в памяти модуля, а не
   * дочитывается из базы: цена — ноль запросов.
   */
  let awaiting = 0;
  for (const row of createdThisSession.values()) {
    if (rows.has(row.id)) continue;
    rows.set(row.id, row);
    awaiting += 1;
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
  const payload = draftToDoc(draft);
  await setDoc(ref, { ...payload, time: { created: serverTimestamp() } });

  /*
   * Запоминаем строку В ПАМЯТИ — чтобы список показал её сразу и БЕЗ второго запроса к базе.
   * Это и есть замена убранной дельте (указание владельца «только одним запросом димс лист»).
   */
  createdThisSession.set(ref.id, {
    id: ref.id,
    ru: payload.title.ru ?? '',
    en: payload.title.en ?? '',
    year: typeof payload.year === 'string' ? payload.year : '',
    awaitingIndex: true,
  });
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
  // Если удалили то, что сами и завели в этой вкладке, — убрать из памяти, иначе список
  // показывал бы призрак записи, которой в базе больше нет.
  createdThisSession.delete(id);
}

/**
 * Правка изменила название? Значит и запомненная строка обязана обновиться, иначе список покажет
 * старое имя у записи, которую индекс ещё не знает. Пара «истина ↔ зеркало» внутри одной вкладки.
 */
export function rememberEdited(current: AdminDim, draft: DimDraft): void {
  if (!createdThisSession.has(current.id)) return;
  const payload = draftToDoc(draft, {
    stars: current.stars,
    rates: current.rates,
    rating: current.rating,
  });
  createdThisSession.set(current.id, {
    id: current.id,
    ru: payload.title.ru ?? '',
    en: payload.title.en ?? '',
    year: typeof payload.year === 'string' ? payload.year : '',
    awaitingIndex: true,
  });
}

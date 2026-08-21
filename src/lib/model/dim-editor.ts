/**
 * ЧИСТАЯ ЛОГИКА РЕДАКТОРА ИЗМЕРЕНИЯ — «Менеджер измерений» (`plans/44`, фаза 4 эпика `ideas/29`).
 *
 * Здесь нет ни Firestore, ни Svelte: разбор черновика формы, его проверка и сборка документа
 * каталога. Поэтому модуль достаёт `node --test` напрямую, без эмулятора и без браузера, — тем
 * же приёмом, что `content/catalog-hub.ts` (он тоже вынесен из-под импорта каталога ради тестов).
 *
 * ГРАНИЦА С ПРАВИЛАМИ. `firestore.rules` — последняя инстанция и она не обходится ничем; здесь
 * ЗЕРКАЛО тех же границ, нужное для одного: сказать человеку, ЧТО не так, вместо отказа
 * «PERMISSION_DENIED», из которого не следует ничего. Зеркало обязано быть не строже правил,
 * иначе форма запретит то, что база примет, и владелец не сможет завести законную запись.
 *
 * 🔴 ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ: строки индекса каталога. У индекса `dims/dims_list` ОДИН
 * писатель — сервер синхронизации. Разбор — `plans/44` шаг 4: запись, сделанная панелью
 * заранее, обнуляет прирост дельты, и сервер уходит в полную пересборку 5112 документов.
 */
import { TECH_TAG, type DimDoc, type Localized } from './schema.ts';

/**
 * Черновик формы — ровно десять полей формы 1.x (`researches/11` §3), как их набирает человек.
 * Всё строками: поле ввода отдаёт строку, и превращать её в другой тип раньше проверки значит
 * терять то, что человек напечатал.
 */
export interface DimDraft {
  readonly titleRu: string;
  readonly titleEn: string;
  readonly descriptionRu: string;
  readonly descriptionEn: string;
  readonly typeRu: string;
  readonly typeEn: string;
  readonly authorRu: string;
  readonly authorEn: string;
  /** Год СТРОКОЙ: у восьми боевых записей это диапазон («1966–1969»). Замер 2026-08-17. */
  readonly year: string;
  /** Теги одной строкой через запятую — так их набирают; разбор ниже. */
  readonly tags: string;
}

/** Пустой черновик — начальное состояние формы создания. */
export const EMPTY_DRAFT: DimDraft = {
  titleRu: '',
  titleEn: '',
  descriptionRu: '',
  descriptionEn: '',
  typeRu: '',
  typeEn: '',
  authorRu: '',
  authorEn: '',
  year: '',
  tags: '',
};

/** Какое поле не в порядке и что человеку сделать. Поле названо, чтобы форма подсветила именно его. */
export interface DraftProblem {
  readonly field: keyof DimDraft;
  readonly message: string;
}

/**
 * Разбор строки тегов. Разделитель — запятая: так теги набраны в самих данных 1.x.
 * Пустые куски отбрасываются, повторы схлопываются, порядок набора сохраняется — он осмысленный
 * (первый тег человек ставит главным).
 */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(',')) {
    const tag = piece.trim();
    if (tag === '' || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

/** Обратный ход: теги документа — в строку формы. */
export function joinTags(tags: readonly string[] | undefined): string {
  return (tags ?? []).join(', ');
}

/**
 * Проверка черновика — зеркало границ `firestore.rules` → `dims/{dimId}`.
 *
 * 🔴 ОБЯЗАТЕЛЬНО только название, и только оно. Замер боевого каталога 2026-08-17: `title`
 * заполнен на оба языка у всех 5111 записей, а `type` у одной живёт лишь по-русски, `author`
 * у одной лишь по-английски, тегов нет у трёх. Требовать эти поля значило бы запретить правку
 * ровно тех записей — то есть сделать форму строже базы.
 *
 * Почему название требуется на ОБА языка: сервер синхронизации отбраковывает документ без
 * `title` при сборке индекса каталога («без названия показывать нечего»), а измерение вне
 * индекса не видит НИ ОДИН человек. Это не вкус, а условие видимости.
 */
export function validateDraft(draft: DimDraft): DraftProblem[] {
  const problems: DraftProblem[] = [];

  if (draft.titleRu.trim() === '') {
    problems.push({ field: 'titleRu', message: 'Название по-русски обязательно' });
  }
  if (draft.titleEn.trim() === '') {
    problems.push({ field: 'titleEn', message: 'Название по-английски обязательно' });
  }

  return problems;
}

/**
 * Локализованная пара из двух полей формы.
 *
 * Обе половины присутствуют всегда, незаполненная — `null`: так объявлен `Localized` в
 * `schema.ts` («`null` означает „не заполнено“»), и так же читает поле сборщик страниц каталога
 * (`loc()` подставляет пустую строку). Пропускать ключ нельзя — сервер синхронизации спрашивает
 * `d.title.ru ?? null`, и запись, у которой ключа нет вовсе, читалась бы иначе, чем запись с
 * `null`, при одинаковом смысле.
 */
function localized(ru: string, en: string): Localized | null {
  const left = ru.trim();
  const right = en.trim();
  if (left === '' && right === '') return null;
  return { ru: left === '' ? null : left, en: right === '' ? null : right };
}

/** Что из уже существующего документа обязано пережить правку. */
export interface PreservedFields {
  readonly stars: number;
  readonly rates: number;
  readonly rating: number;
  /**
   * 🔴 Технические теги (`plans/58`). Их ставит РАЗМЕТКА, а не форма правки: человек в комнате
   * их не видит и не вводит. Значит документ, собранный из черновика, о них не знает — и полная
   * запись стёрла бы тег одобрения молча, без ошибки и следа.
   */
  readonly techTags?: readonly string[];
}

/**
 * ЧТО ПЕРЕЖИВАЕТ ПРАВКУ — собрано из существующего документа В ОДНОМ МЕСТЕ.
 *
 * Раньше этот набор жил россыпью в комнате измерений, и цена такого расположения уже известна:
 * поле, о котором забыли, исчезает при первой же правке молча. Здесь оно рядом со своим
 * объяснением и, главное, достаётся юнитом без базы и браузера.
 */
export function preservedFrom(dim: Partial<DimDoc>): PreservedFields {
  return {
    stars: dim.stars ?? 0,
    rates: dim.rates ?? 0,
    rating: dim.rating ?? 0,
    ...(dim.techTags === undefined ? {} : { techTags: dim.techTags }),
  };
}

/**
 * Собирает документ каталога из черновика.
 *
 * 🔴🔴 `previous` — НЕ УДОБСТВО, А ЗАЩИТА ТРУДА ЛЮДЕЙ. Сводка оценок (`stars`/`rates`/`rating`)
 * принадлежит не форме, а людям, которые ставили звёзды, и её считает сервер синхронизации.
 * Правка, собравшая документ «с нуля», выставила бы нули — и оценки исчезли бы у измерения,
 * которое просто переименовали.
 *
 * ⚠️ И этот класс НЕ ловится правилами: ноль лежит внутри законных границ шкалы, поэтому
 * валидация промолчит. Ловится он только здесь и стражем фазы — ровно тот случай, о котором
 * канон говорит «у каждого класса дефектов свой прибор».
 *
 * `time` тоже не трогается: метку создания ставит запись создания один раз, и правка не имеет
 * права её переписать — на ней держится бейдж «Новое» и дельта-механизм индекса.
 */
export function draftToDoc(
  draft: DimDraft,
  previous?: PreservedFields,
): Omit<DimDoc, 'time' | 'created'> {
  const title = localized(draft.titleRu, draft.titleEn);
  if (title === null || title.ru === null || title.en === null) {
    // Вызов без проверки — ошибка программиста, а не человека: форма обязана позвать
    // validateDraft раньше. Молча писать документ без названия нельзя: он станет невидимым.
    throw new Error('draftToDoc: название обязательно на оба языка — сначала validateDraft');
  }

  const description = localized(draft.descriptionRu, draft.descriptionEn);
  const type = localized(draft.typeRu, draft.typeEn);
  const author = localized(draft.authorRu, draft.authorEn);
  const tags = parseTags(draft.tags);
  const year = draft.year.trim();

  return {
    title,
    // `description` объявлено в схеме обязательным полем документа, поэтому незаполненное
    // пишем парой из `null`, а не пропуском ключа: страница каталога читает его всегда.
    description: description ?? { ru: null, en: null },
    ...(type === null ? {} : { type }),
    ...(author === null ? {} : { author }),
    ...(year === '' ? {} : { year }),
    ...(tags.length === 0 ? {} : { tags }),
    stars: previous?.stars ?? 0,
    rates: previous?.rates ?? 0,
    rating: previous?.rating ?? 0,
    // Технический тег переносится ТОЛЬКО если он есть: у новой записи его нет и быть не должно —
    // тег одобрения ставит разметка каталога, а не форма (`plans/58` шаг 1).
    ...(previous?.techTags === undefined ? {} : { techTags: previous.techTags }),
  };
}

/**
 * ДОКУМЕНТ НОВОРОЖДЁННОГО ИЗМЕРЕНИЯ — черновик плюс тег «одобрено владельцем».
 *
 * 🔴 Почему тег ставится ПРИ РОЖДЕНИИ, а не разметкой потом. Разовый прибор `plans/58` судит
 * каталог по своду сверки с Википедией, снятому 2026-08-17; всё, что заведено ПОСЛЕ, он судить
 * не может — и без штампа при рождении корзина «без источника суждения» росла бы вечно, на
 * совершенно законном поведении.
 *
 * 🔑 Почему здесь, а не в одобрении кандидата. В комнате ДВЕ двери к созданию: одобрение
 * вычитанного кандидата и ручная форма (`admin/dims/+page.svelte` зовёт `createDim` напрямую).
 * Обе — руки владельца, и тег на обеих правдив: измерение, которое он НАБРАЛ САМ, одобрено им
 * не меньше вычитанного. Штамп в одной двери из двух оставил бы вторую половину записей без
 * тега навсегда. Решение Менеджера от 2026-08-22 по слову владельца (интервью №044, В4 = A);
 * откатывается дёшево — тег переставляется.
 */
export function newDimDoc(draft: DimDraft): Omit<DimDoc, 'time' | 'created'> {
  return { ...draftToDoc(draft), techTags: [TECH_TAG.OWNER_APPROVED] };
}

/** Документ каталога — в черновик формы, для правки. */
export function docToDraft(dim: Partial<DimDoc>): DimDraft {
  const half = (pair: Localized | undefined, lang: 'ru' | 'en'): string => {
    const value = (pair as Record<string, unknown> | undefined)?.[lang];
    return typeof value === 'string' ? value : '';
  };

  return {
    titleRu: half(dim.title, 'ru'),
    titleEn: half(dim.title, 'en'),
    descriptionRu: half(dim.description, 'ru'),
    descriptionEn: half(dim.description, 'en'),
    typeRu: half(dim.type, 'ru'),
    typeEn: half(dim.type, 'en'),
    authorRu: half(dim.author, 'ru'),
    authorEn: half(dim.author, 'en'),
    year: typeof dim.year === 'string' ? dim.year : '',
    tags: joinTags(dim.tags),
  };
}

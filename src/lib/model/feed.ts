/**
 * Лента измерений — чистая логика, без Firestore и без браузера.
 *
 * ЧТО ЭТО ЗА ЛЕНТА (researches/11_dims_screen_1x.md). Вкладка «Все» — это НЕ каталог. Это лента
 * того, что человек ЕЩЁ НЕ ОЦЕНИЛ, в СЛУЧАЙНОМ порядке, с подгрузкой по мере прокрутки. Оценил —
 * измерение уходит из ленты. Убрал оценку — возвращается.
 *
 * ПОЧЕМУ НЕ АЛФАВИТ. В каталоге 5111 измерений. При любом фиксированном порядке человек навсегда
 * упирается в первые буквы и хвоста каталога не увидит НИКОГДА, а измерения с конца алфавита не
 * получат ни одной оценки. Случайность здесь — не украшение, а единственный способ показать
 * каталог целиком и дать каждому измерению равный шанс. Владелец 2026-07-12 об алфавитном списке:
 * «бред!!!».
 *
 * Случайность живёт НА СПИСКЕ ID, а не в запросе к базе: Firestore не умеет «дай случайный
 * документ», и 1.x именно поэтому держал список идентификаторов на клиенте.
 */
import type { DimIndexEntry } from './schema.ts';

/** Разобранный индекс каталога: dimId → короткая запись (имя, год). */
export type DimsIndex = ReadonlyMap<string, DimIndexEntry>;

/**
 * Разбирает индекс `dims/dims_list`.
 *
 * В базе он лежит JSON-СТРОКОЙ, а не картой (наследие 1.x — тот же почерк, что у топа связей).
 * Битый индекс — не повод падать: вернём пустую карту, экран честно скажет, что показывать нечего.
 */
export function parseDimsIndex(raw: unknown): DimsIndex {
  if (typeof raw !== 'string' || raw.length === 0) return new Map();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map();
    return new Map(Object.entries(parsed as Record<string, DimIndexEntry>));
  } catch {
    return new Map();
  }
}

/** Источник случайности. Вынесен параметром, чтобы тест мог сделать перемешивание предсказуемым. */
export type Random = () => number;

/**
 * Перемешивание Фишера — Йейтса: каждая перестановка равновероятна.
 *
 * Наивное `sort(() => Math.random() - 0.5)` НЕ является честным перемешиванием (сравнение
 * непоследовательно, распределение перекошено), и в продукте, где от порядка зависит, увидят ли
 * измерение вообще, это имеет значение.
 */
export function shuffle<T>(items: readonly T[], random: Random = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Очередь ленты «Все»: всё, что есть в каталоге и чего человек ещё не оценил, — в случайном порядке.
 *
 * Служебные документы каталога (индекс `dims_list`) сюда не попадают: их в индексе и нет.
 */
export function buildUnratedFeed(
  index: DimsIndex,
  rated: ReadonlySet<string>,
  random: Random = Math.random,
): string[] {
  const unrated = [...index.keys()].filter((dimId) => !rated.has(dimId));
  return shuffle(unrated, random);
}

/**
 * Порядок вкладки «Мой NDim ID» — по убыванию СОБСТВЕННОЙ оценки (10 → 0), как в 1.x.
 * При равных оценках — по id измерения: ключ стабилен и одинаков на обоих языках,
 * поэтому смена языка интерфейса НИКОГДА не переставляет карточки (bugs/37 — тай-брейк
 * по локализованному имени заставлял их «прыгать» при переключении RU↔EN).
 */
export function sortMyDims(rated: ReadonlyMap<string, number>): string[] {
  return [...rated.keys()].sort((a, b) => {
    const byValue = (rated.get(b) ?? 0) - (rated.get(a) ?? 0);
    return byValue !== 0 ? byValue : a < b ? -1 : a > b ? 1 : 0;
  });
}

/**
 * Сколько найденных измерений показываем за раз — канон 1.x (`doSearchDims`).
 *
 * Ограничение не косметическое: за каждой показанной карточкой идёт чтение документа из
 * Firestore. Двадцать чтений на запрос — цена, которую 1.x считал приемлемой; пятьсот —
 * нет. Больше двадцати совпадений → человеку честно предлагают уточнить запрос.
 */
export const SEARCH_RESULT_LIMIT = 20;

/** Римские цифры, которые 1.x приводил к арабским (I…XV — как в оригинале, не шире). */
const ROMAN_TO_ARABIC: Readonly<Record<string, number>> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8,
  IX: 9, X: 10, XI: 11, XII: 12, XIII: 13, XIV: 14, XV: 15,
};

/** Римские цифры отдельным словом. Регулярка — дословно из 1.x, вместе с её причудами. */
const ROMAN_WORD = /\b(?:X[IV]?|IX|IV|V?I{0,3})\b/gi;

/**
 * Нормализация строки для поиска — перенос `normalizeStringForSearch` из 1.x ДОСЛОВНО
 * (`ndim_old/public/scripts/app.js:9052`).
 *
 * Зачем: каталог набивали живые люди, и одно и то же название встречается в разных
 * обличьях — «Звёздные войны» и «Звездные войны», «Человек-паук» и «Человек паук»,
 * «„Алхимик“ (1988)», «Рокки IV». Без нормализации человек не находит измерение, которое
 * ЕСТЬ, — и уходит с мыслью, что поиск сломан (ровно жалоба владельца, bugs/50).
 *
 * Правила (обе стороны сравнения нормализуются одинаково):
 *   · римские цифры I…XV → арабские;
 *   · нижний регистр; «ё» → «е»;
 *   · дефис/тире МЕЖДУ символами → пробел, а с пробелами вокруг — удаляется совсем;
 *   · остаются только буквы (латиница/кириллица), цифры и пробелы — кавычки, точки,
 *     скобки, двоеточия отбрасываются;
 *   · несколько пробелов → один, края обрезаются.
 *
 * ⚠️ Причуда, унаследованная сознательно: правило римских цифр срабатывает и на отдельно
 * стоящих латинских буквах i/v/x («I Am Legend» → «1 am legend»). Она безвредна, потому
 * что применяется К ОБЕИМ сторонам сравнения, а канон здесь — поведение 1.x, а не наши
 * представления о правильном (`AGENT_GUIDE.md` → разведка до кода).
 */
export function normalizeForSearch(input: string): string {
  return input
    .replace(ROMAN_WORD, (match) => {
      const arabic = ROMAN_TO_ARABIC[match.toUpperCase()];
      return arabic === undefined ? match : String(arabic);
    })
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/(\S)[-–—‑](\S)/g, '$1 $2')
    .replace(/\s*[-–—‑]\s*/g, '')
    .replace(/[^a-zа-я0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Нормализованные имена индекса — считаются один раз на индекс.
 *
 * Индекс — 5111 записей, и нормализовать их на КАЖДОЕ нажатие клавиши значило бы делать
 * ту же работу заново десятки раз подряд. Кеш живёт в WeakMap: сменился индекс — старая
 * запись уходит с ним, ничего не протухает.
 */
interface NormalizedNames {
  readonly ru: string;
  readonly en: string;
  /** Длины ИСХОДНЫХ имён — по ним 1.x считал релевантность. */
  readonly ruLength: number;
  readonly enLength: number;
}

const normalizedCache = new WeakMap<object, Map<string, NormalizedNames>>();

function normalizedNames(index: DimsIndex): Map<string, NormalizedNames> {
  const cached = normalizedCache.get(index as object);
  if (cached !== undefined) return cached;

  const built = new Map<string, NormalizedNames>();
  for (const [dimId, entry] of index) {
    // Языки нормализуем и сравниваем ПО ОТДЕЛЬНОСТИ: склейка «ru en» давала ложные
    // совпадения на стыке языков (запрос, попавший на хвост русского и начало английского).
    const ru = entry.ru ?? '';
    const en = entry.en ?? '';
    built.set(dimId, {
      ru: normalizeForSearch(ru),
      en: normalizeForSearch(en),
      ruLength: ru.length,
      enLength: en.length,
    });
  }
  normalizedCache.set(index as object, built);
  return built;
}

/**
 * Поиск по индексу каталога — по имени на обоих языках сразу, по ВСЕМ измерениям.
 *
 * Возвращает ВСЕ совпадения (обрезать до `SEARCH_RESULT_LIMIT` — дело экрана: функция
 * обязана честно сказать, сколько нашлось, иначе экран не сможет предложить уточнить запрос).
 *
 * Порядок — по релевантности, как в 1.x (`searchInJson`): чем ближе длина найденного имени
 * к длине запроса, тем выше. «Такси» находит фильм «Такси» раньше, чем «Такси-блюз для
 * начинающих». При равной близости — по id: порядок обязан быть детерминированным, иначе
 * выдача «дрожит» между одинаковыми запросами (`AGENT_GUIDE.md` → «Стиль кода»).
 */
export function searchIndex(index: DimsIndex, query: string): string[] {
  const needle = normalizeForSearch(query);
  if (needle === '') return [];

  const names = normalizedNames(index);
  const found: { dimId: string; distance: number }[] = [];

  for (const [dimId, name] of names) {
    const hitRu = name.ru.includes(needle);
    const hitEn = name.en.includes(needle);
    if (!hitRu && !hitEn) continue;

    // Длину берём у того имени, которое совпало (при совпадении обоих — у английского,
    // как в 1.x: `enMatch ? obj.en.length : obj.ru.length`).
    const length = hitEn ? name.enLength : name.ruLength;
    found.push({ dimId, distance: Math.abs(length - needle.length) });
  }

  found.sort((a, b) =>
    a.distance !== b.distance
      ? a.distance - b.distance
      : a.dimId < b.dimId
        ? -1
        : a.dimId > b.dimId
          ? 1
          : 0,
  );
  return found.map((item) => item.dimId);
}

/** Измерение считается новым две недели — как в 1.x (бейдж «Новое 🔥»). */
export const NEW_DIM_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Когда измерение завели — в миллисекундах.
 *
 * Дата приходит в ТРЁХ обличьях, и все три настоящие:
 *   · бой, клиентский SDK — `time.created` как Timestamp с методом `toMillis()`;
 *   · бой, Admin SDK      — `time.created` как `{ seconds, nanoseconds }`;
 *   · стенд               — плоское число `created` (сид пишет миллисекунды).
 *
 * Непонятное считаем «давно»: **новизну выдумывать нельзя** — бейдж «Новое» либо правда, либо его нет.
 */
export function createdAt(dim: { time?: unknown; created?: unknown } | null | undefined): number | null {
  if (dim === null || dim === undefined) return null;

  if (typeof dim.created === 'number') return dim.created;

  const time = dim.time;
  if (time === null || typeof time !== 'object') return null;

  const created = (time as { created?: unknown }).created;
  if (typeof created === 'number') return created;
  if (created === null || typeof created !== 'object') return null;

  const asMillis = (created as { toMillis?: () => number }).toMillis;
  if (typeof asMillis === 'function') return asMillis.call(created);

  const seconds = (created as { seconds?: unknown }).seconds;
  return typeof seconds === 'number' ? seconds * 1000 : null;
}

/** Новое ли измерение — то есть заслуживает ли бейджа «Новое». */
export function isNewDim(dim: { time?: unknown; created?: unknown } | null | undefined, now: number): boolean {
  const created = createdAt(dim);
  return created !== null && now - created <= NEW_DIM_WINDOW_MS;
}

/**
 * Имя карточки без задвоения кавычек и года — грязь настоящих данных 1.x.
 *
 * Люди заводили измерения руками и часть названий пришла В УЖЕ ОФОРМЛЕННОМ виде:
 * `«Алхимик» (1988)` с отдельным полем `year: 1988`. Карточка декорирует имя сама
 * (`«…» (год)`), и без нормализации на экране выходило ««Алхимик» (1988)» (1988) —
 * видно на боевом проде. Правим ПОКАЗ, а не данные: труд людей не трогаем.
 *
 * Правила (только для однозначной грязи, ничего не выдумываем):
 *   · хвост `(ГГГГ)` срезается, если год совпадает с полем `year` — а если поля нет,
 *     вынутый из имени год начинает показываться как год карточки;
 *   · обрамляющие «…» / "…" срезаются, если охватывают ВСЁ имя (внутренние кавычки
 *     вроде `Сериал «Друзья»` не трогаются).
 */
export function dimCardTitle(
  raw: string,
  year: string | number | null | undefined,
): { name: string; year: string | null } {
  let name = raw.trim();
  /*
   * Год в схеме 2.0 — строка ('1976'), но стенд и часть данных пишут число. Терпим оба.
   *
   * 🔴 ПРОЧЕРК — ЭТО «ГОДА НЕТ», А НЕ ГОД (`ideas/26`, слово владельца 2026-08-01: «у измерений
   * без года не показывать элемент года»).
   *
   * Шаг 0 снят замером боевого каталога 2026-08-03, и он поправил постановку: измерений с
   * ПУСТЫМ годом — **ноль**, а вот с годом `"-"` — **170**. То есть код и правда выводил год
   * условно, но условие проверяло пустоту, а прочерк непуст и потому исправно печатался.
   * Прочерк приезжает ИЗ ДАННЫХ 1.x, чинить его правкой каталога дорого и незачем: правило
   * «прочерк = нет значения» дешевле и переживёт любые новые записи такого вида.
   *
   * Ловим любые тире (дефис, минус, en/em-dash) и пробелы вокруг них.
   */
  const rawYear = year === null || year === undefined ? '' : String(year).trim();
  const blank = rawYear === '' || /^[-–—−]+$/.test(rawYear);
  let shownYear = blank ? null : rawYear;

  const tail = name.match(/^(.*?)\s*\((\d{4})\)$/);
  if (tail) {
    const embedded = tail[2];
    if (shownYear === null || embedded === shownYear) {
      name = tail[1].trim();
      shownYear = shownYear ?? embedded;
    }
  }

  for (const [open, close] of [
    ['«', '»'],
    ['"', '"'],
    ['“', '”'],
  ] as const) {
    if (
      name.length > 1 &&
      name.startsWith(open) &&
      name.endsWith(close) &&
      // кавычка закрывается только в самом конце — иначе это внутренние кавычки
      name.indexOf(close, 1) === name.length - 1
    ) {
      name = name.slice(1, -1).trim();
      break;
    }
  }

  return { name, year: shownYear };
}

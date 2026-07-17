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

/** Поиск по индексу — по имени на обоих языках сразу (человек ищет как ему удобно). */
export function searchIndex(index: DimsIndex, query: string): string[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];

  const found: string[] = [];
  for (const [dimId, entry] of index) {
    const haystack = `${entry.ru ?? ''} ${entry.en ?? ''}`.toLowerCase();
    if (haystack.includes(needle)) found.push(dimId);
  }
  return found;
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
  // Год в схеме 2.0 — строка ('1976'), но стенд и часть данных пишут число. Терпим оба.
  let shownYear = year === null || year === undefined || year === '' ? null : String(year);

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

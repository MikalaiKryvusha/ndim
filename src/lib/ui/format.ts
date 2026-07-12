/**
 * Форматирование чисел, дат и единиц для экранов продукта.
 *
 * Живёт отдельно, потому что одни и те же формы («714,9 звезды», «8,4 секунды»,
 * «12 июля 2026 г. в 03:00») нужны разным экранам, а русская морфология — это ровно то
 * место, где каждый экран норовит завести свою маленькую неправильную копию.
 *
 * Формы взяты из живого 1.x (`design/reference-1x/`), а не придуманы.
 */

export type Lang = 'ru' | 'en';

/**
 * Русские формы множественного числа: [1 звезда, 2 звезды, 5 звёзд].
 * Дробное число требует родительного единственного — «714,9 звезды», как в 1.x.
 */
export function unitRu(value: number, forms: [string, string, string]): string {
  if (!Number.isInteger(value)) return forms[1];
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

const locale = (lang: Lang): string => (lang === 'ru' ? 'ru-RU' : 'en-US');

/** Число с разделителями разрядов: `1 284`. */
export const num = (value: number, lang: Lang): string => value.toLocaleString(locale(lang));

/** Число со знаком — для трендов: `+37`, `−2`. Минус типографский, не дефис. */
export const signed = (value: number, lang: Lang): string =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${num(Math.abs(value), lang)}`;

export const starsUnit = (value: number, lang: Lang): string =>
  lang === 'ru' ? unitRu(value, ['звезда', 'звезды', 'звёзд']) : value === 1 ? 'star' : 'stars';

export const dimsUnit = (value: number, lang: Lang): string =>
  lang === 'ru'
    ? unitRu(value, ['измерение', 'измерения', 'измерений'])
    : value === 1
      ? 'dimension'
      : 'dimensions';

/** «1 голос» · «4 голоса» · «11 голосов» — подпись под рейтингом измерения (форма 1.x). */
export const votesUnit = (value: number, lang: Lang): string =>
  lang === 'ru' ? unitRu(value, ['голос', 'голоса', 'голосов']) : value === 1 ? 'vote' : 'votes';

export const peopleUnit = (value: number, lang: Lang): string =>
  lang === 'ru' ? unitRu(value, ['человек', 'человека', 'человек']) : value === 1 ? 'person' : 'people';

export const ratingsUnit = (value: number, lang: Lang): string =>
  lang === 'ru' ? unitRu(value, ['оценка', 'оценки', 'оценок']) : value === 1 ? 'rating' : 'ratings';

/** «1 новое измерение», «2 новых измерения», «5 новых измерений». */
export const newDimsUnit = (value: number, lang: Lang): string =>
  lang === 'ru'
    ? unitRu(value, ['новое измерение', 'новых измерения', 'новых измерений'])
    : value === 1
      ? 'new dimension'
      : 'new dimensions';

/** Длительность цикла: «8,4 секунды» / «8.4 seconds». Форма 1.x — «Выполнена за». */
export function seconds(millis: number, lang: Lang): string {
  const value = Math.round(millis / 100) / 10;
  const shown = value.toLocaleString(locale(lang), { minimumFractionDigits: 1 });
  return lang === 'ru'
    ? `${shown} ${unitRu(value, ['секунда', 'секунды', 'секунд'])}`
    : `${shown} ${value === 1 ? 'second' : 'seconds'}`;
}

/**
 * Разметка внутри текстов документов: `**жирный**` и `*курсив*` → HTML.
 *
 * Тексты приходят ИЗ РЕПОЗИТОРИЯ (сгенерированы из исследований), а не от пользователей, —
 * но экранирование всё равно делаем: правило «не вставляй сырое в HTML» не должно иметь
 * исключений, о которых кто-то потом забудет.
 */
export function richText(text: string): string {
  const escaped = text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*]+?)\*/g, '$1<i>$2</i>');
}

/** «10 июля 2026 г.» / «July 10, 2026». */
export const dateOnly = (millis: number, lang: Lang): string =>
  new Date(millis).toLocaleDateString(locale(lang), { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Месяц и год ПОСЛЕ ПРЕДЛОГА «с»: «февраля 2025 г.» / «February 2025».
 *
 * Браузер этого не умеет. `toLocaleDateString({ month: 'long' })` возвращает ИМЕНИТЕЛЬНЫЙ падеж
 * («февраль»), потому что падеж зависит от фразы, а не от даты. В профиле из-за этого стояло
 * «В Пространстве с феврал**ь** 2025 г.» — поймано владельцем на боевом выкате 2026-07-12.
 *
 * В английском падежей нет — там достаточно локали.
 */
const MONTHS_GENITIVE_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
] as const;

export function monthYearSince(millis: number, lang: Lang): string {
  const date = new Date(millis);
  if (lang !== 'ru') {
    return date.toLocaleDateString(locale(lang), { month: 'long', year: 'numeric' });
  }
  return `${MONTHS_GENITIVE_RU[date.getMonth()]} ${date.getFullYear()} г.`;
}

/** «12 июля 2026 г. в 03:00» — форма из 1.x. */
export function dateTime(millis: number, lang: Lang): string {
  const time = new Date(millis).toLocaleTimeString(locale(lang), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${dateOnly(millis, lang)} ${lang === 'ru' ? 'в' : 'at'} ${time}`;
}

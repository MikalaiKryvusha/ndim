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
 * ЦЕПОЧКА СПУСКА ПО ЛОКАЛЯМ — порядок, в котором продукт ищет ближайшее наличествующее значение.
 *
 * Заказана владельцем прямо (2026-08-18), и это КАНОН 1.x, а не новое решение: «*в старом NDim
 * было так — если имя не указано на текущем языке, но есть имя на другом языке, то показывается
 * имя на другом языке. Нужно построить цепочку иерархий локалей, по которым идёт спуск для показа
 * имени из ближайшего наличествующего*».
 *
 * 🔑 Почему таблицей, а не выражением `value[lang] ?? value.ru ?? value.en`. Выражение — это
 * порядок, спрятанный в скобках: третий язык туда не добавить, не переписав каждое место, и
 * прочитать его как «иерархию» нельзя. Таблица называет иерархию вслух и остаётся ОДНИМ местом
 * правки, когда языков станет больше двух.
 *
 * ⚠️ Первым в каждой строке стоит сам язык зрителя — спуск начинается с него, а не с русского.
 */
const LOCALE_DESCENT: Record<Lang, readonly Lang[]> = {
  ru: ['ru', 'en'],
  en: ['en', 'ru'],
};

/**
 * ТЕКСТ ДВУЯЗЫЧНОГО ЗНАЧЕНИЯ — спуск по цепочке локалей до первого НЕПУСТОГО, иначе `null`.
 * Одна копия на продукт: до `bugs/150` их было ТРИ («Связи», «Профиль», «Измерения»), и все три
 * несли один и тот же дефект.
 *
 * 🔴 ПОЧЕМУ НЕ `value[lang] ?? value.ru ?? value.en`, КАК БЫЛО. `??` ловит ОТСУТСТВИЕ
 * (`null`/`undefined`), а не ПУСТОТУ. Пустая строка — значение, и лестница на ней
 * останавливается: `'' ?? 'Andrew'` даёт `''`. Для человека это одно и то же «не заполнено»,
 * для оператора — нет.
 *
 * Цена дефекта названа замером боя (`tools/measure-blank-locale-strings.mjs`, 2026-08-18):
 * у 331 публичной карточки нашлось **5** запертых, и у **трёх из них имя ЛЕЖИТ РЯДОМ на
 * английском** — продукт прятал существующее имя, а не сообщал об отсутствующем. Владелец
 * увидел одну такую карточку и назвал её «мёртвой душой»: пустой кружок без единой буквы.
 *
 * Поэтому пустое ПО СМЫСЛУ ЧЕЛОВЕКА (пустая строка, одни пробелы) здесь равно отсутствующему,
 * и лестница идёт дальше. Возвращается `trim()`-нутая строка: висячий пробел по краям имени —
 * мусор на экране. ⚠️ Края, и только края: неразрывный пробел ВНУТРИ текста — осмысленная
 * типографика владельца, и её тут никто не трогает.
 *
 * ⛔ Значение НЕ придумывается: нечего показать — возвращается `null`, и экран сам решает,
 * каким словом это назвать («Без имени» в «Связях», «не указано» в «Профиле»). Подставлять
 * текст здесь значило бы зашить язык одного экрана в общий инструмент.
 */
export function localizedText(
  value: { readonly ru: string | null; readonly en: string | null } | null | undefined,
  lang: Lang,
): string | null {
  if (!value) return null;
  for (const locale of LOCALE_DESCENT[lang]) {
    const candidate = value[locale];
    if (typeof candidate !== 'string') continue;
    const text = candidate.trim();
    if (text !== '') return text;
  }
  return null;
}

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

/**
 * Возраст в годах на момент `now`. `null` — возраст неизвестен.
 *
 * Считается ровно как в 1.x (`app.js:7064-7073`): разность годов минус поправка, если день
 * рождения в этом году ещё не наступил. Возраст — **не** «сколько ему лет примерно»: ошибка
 * на год в чужом профиле выглядит как враньё продукта.
 *
 * ⚠️ Требуется ПОЛНАЯ дата. В модели 2.0 человек вправе указать только год (`BirthDate`),
 * а 1.x такой случай не обрабатывал вовсе (`new Date(y, null-1, null)` даёт декабрь прошлого
 * года). Достраивать недостающие месяц и день нельзя: получится выдуманное число, а
 * выдуманное хуже отсутствующего (`PHILOSOPHY.md` → правило трёх дверей). Неполная дата →
 * `null`, и экран показывает дату без возраста.
 */
export function ageAt(
  born: { year: number | null; month: number | null; day: number | null },
  now: number,
): number | null {
  const { year, month, day } = born;
  if (year === null || month === null || day === null) return null;

  const today = new Date(now);
  let age = today.getFullYear() - year;
  const monthDiff = today.getMonth() - (month - 1);
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) age--;
  return age < 0 ? null : age;
}

/** «40 лет» · «21 год» · «2 года» · «40 years old» — формы 1.x (`getAgeWord`). */
export const yearsUnit = (value: number, lang: Lang): string =>
  lang === 'ru'
    ? unitRu(value, ['год', 'года', 'лет'])
    : value === 1
      ? 'year old'
      : 'years old';

/**
 * День рождения так, как его показывал 1.x: «13 мая 1986 г. (40 лет)».
 * Неполная дата показывается без возраста; пустая — `null` (строки на экране не будет).
 */
export function bornWithAge(
  born: { year: number | null; month: number | null; day: number | null },
  lang: Lang,
  now: number,
): string | null {
  if (born.year === null) return null;

  const age = ageAt(born, now);
  if (born.month === null || born.day === null) return String(born.year);

  // Дата строится в ЛОКАЛЬНОЙ зоне (как в 1.x): `Date.UTC` у зрителя западнее Гринвича
  // отрисовался бы предыдущим днём — чужой день рождения сдвинулся бы на сутки.
  const shown = dateOnly(new Date(born.year, born.month - 1, born.day).getTime(), lang);
  return age === null ? shown : `${shown} (${age} ${yearsUnit(age, lang)})`;
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

/**
 * Версия для показа человеку: «2.0 (123)» — версия плюс номер сборки в скобках.
 *
 * Правила владельца (2026-07-27):
 *  · патч-цифру не пишем, когда она нулевая: `2.0.0` → `2.0`, а `2.0.3` остаётся целиком;
 *  · номер сборки — в скобках, целым числом.
 *
 * Номера сборки нет (собрано вне git, сервер о нём не сообщил) → скобок нет вовсе.
 * Раньше в таком случае писалось «билд dev» — владелец попросил это убрать, и он прав:
 * `dev` в бою — это шум, а не информация (PHILOSOPHY: отсутствующее честнее выдуманного).
 */
export function versionLabel(version: string, build?: number | string | null): string {
  const trimmed = version.replace(/^(\d+\.\d+)\.0$/, '$1');
  const n = typeof build === 'string' ? Number(build) : build;
  return Number.isFinite(n) && (n as number) > 0 ? `${trimmed} (${n})` : trimmed;
}

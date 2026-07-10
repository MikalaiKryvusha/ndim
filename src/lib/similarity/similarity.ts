/**
 * Математическое ядро NDim Space — расчёт похожести двух людей.
 *
 * Это единственное, ради чего проект существует. Человек описывает себя набором ИЗМЕРЕНИЙ
 * (осей человеческих качеств), ставя себе по каждой оценку 0…10. Он становится точкой в
 * своём подпространстве измерений. Похожесть двух людей считается ТОЛЬКО по их общим осям.
 *
 *   близость   proximity   = 1 − (расстояние / диаметр общего пространства)^0.7
 *   общность   commonality = 2·|общие оси| / (|оси владельца| + |оси гостя|)   (коэффициент Дайса)
 *   ПОХОЖЕСТЬ  similarity  = близость × общность
 *
 * Почему именно так — см. PROJECT_ARCHITECTURE_INTERNAL_MAP.md → «Математическое ядро».
 * Исходник версии 1.x, из которого это перенесено, — researches/03_similarity_core_1x_source.md.
 *
 * ⚠️ ЧИСЛОВОЙ ПАРИТЕТ С ВЕРСИЕЙ 1.x.
 * Порядок операций и точки округления воспроизведены буквально, включая неочевидные места
 * (см. комментарии `паритет 1.x`). Это не педантизм: в боевом Firestore лежат уже посчитанные
 * связи, и при уважительной миграции новый расчёт обязан давать те же числа. Менять формулу
 * можно только осознанно и с пересчётом всех связей.
 */

/** Максимальная оценка по одной оси. Оценки — целые 0…10 (правила Firestore это гарантируют). */
export const MAX_RATING = 10;

/**
 * Показатель степени в формуле близости.
 *
 * При 1.0 близость линейна: `1 − d/D`. Показатель < 1 поднимает чувствительность в области
 * МАЛЫХ расстояний — система лучше различает «очень близко» от «просто близко», а именно там
 * живёт ответ, нужный пользователю. Значение подобрано автором эмпирически в версии 1.x.
 */
export const PROXIMITY_EXPONENT = 0.7;

/** Оси пользователя: идентификатор измерения → оценка 0…10. */
export type UserDims = Readonly<Record<string, number>>;

/** Посчитанная связь «владелец → гость». Все проценты — целые 0…100. */
export interface Relation {
  // ── главные величины ──
  /** Похожесть, 0…100. Произведение близости и общности. То, ради чего всё считается. */
  readonly similarity: number;
  /** Близость, 0…100. Насколько близко стоят точки внутри общего пространства. */
  readonly proximity: number;
  /** Общность, 0…100. Насколько широко пересекаются наборы осей (коэффициент Дайса). */
  readonly commonality: number;
  /** Евклидово расстояние между точками в общем пространстве, 2 знака после запятой. */
  readonly distance: number;

  // ── размерности пространств (число осей) ──
  /** Число общих осей, |K|. */
  readonly commonSpaceSize: number;
  /** Число осей, заполненных владельцем. */
  readonly ownerSpaceSize: number;
  /** Число осей, заполненных гостем. */
  readonly guestSpaceSize: number;
  /** Число осей в объединении: общие + уникальные владельца + уникальные гостя. */
  readonly combinedSpaceSize: number;

  // ── диаметры пространств (диагональ N-мерного куба со стороной 10), 1 знак ──
  readonly ownerSpaceDiameter: number;
  readonly guestSpaceDiameter: number;
  readonly commonSpaceDiameter: number;

  // ── производные отношения, 2 знака ──
  readonly guestSpaceSizeRateOfOwner: number;
  readonly guestSpaceDiameterRateOfOwner: number;
  readonly commonSpaceSizeRateOfOwner: number;
  readonly commonSpaceSizeRateOfGuest: number;
  readonly commonSpaceDiameterRateOfOwner: number;
  readonly commonSpaceDiameterRateOfGuest: number;
  /** Расстояние в процентах от диаметра общего пространства. Целое. */
  readonly distanceRateOfCommonSpaceDiameter: number;
}

/**
 * Округление до одного знака после запятой.
 * `Number.EPSILON` добавлен, чтобы 0.145 округлялось вверх, а не вниз из-за представления double.
 * Паритет 1.x.
 */
const round1 = (x: number): number => Math.round((x + Number.EPSILON) * 10) / 10;

/** Округление до двух знаков после запятой. Паритет 1.x. */
const round2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;

/** Доля 0…1 → целые проценты 0…100. Без EPSILON — паритет 1.x. */
const toPercent = (fraction: number): number => Math.round(fraction * 100);

/**
 * Диаметр пространства из `axesCount` осей — диагональ N-мерного куба со стороной {@link MAX_RATING}.
 *
 * Именно диаметром нормируется расстояние: иначе люди, заполнившие много общих осей,
 * автоматически считались бы дальше друг от друга, чем люди с одной общей осью.
 */
export const spaceDiameter = (axesCount: number): number => Math.sqrt(axesCount) * MAX_RATING;

/** Диаметр пространства, округлённый до одного знака — для показа и для производных отношений. */
export const roundedSpaceDiameter = (axesCount: number): number => round1(spaceDiameter(axesCount));

/**
 * Считает связь владельца с гостем.
 *
 * @returns `null`, если общих осей нет: сравнивать людей вне общего пространства нельзя.
 *          Никогда не додумывай отсутствующую координату — ни нулём, ни средним.
 *
 * Функция чистая и симметричная по `similarity`/`proximity`/`commonality`; асимметричны лишь
 * величины, явно нормированные «по владельцу» (`*RateOfOwner`).
 */
export function computeRelation(ownerDims: UserDims, guestDims: UserDims): Relation | null {
  const ownerAxes = Object.keys(ownerDims);
  const guestAxesSet = new Set(Object.keys(guestDims));

  const commonAxes = ownerAxes.filter((axis) => guestAxesSet.has(axis));

  // Нет общего пространства — нет связи. Это инвариант модели, а не крайний случай.
  if (commonAxes.length === 0) return null;

  const commonSpaceSize = commonAxes.length;
  const ownerSpaceSize = ownerAxes.length;
  const guestSpaceSize = guestAxesSet.size;
  const combinedSpaceSize = ownerSpaceSize + guestSpaceSize - commonSpaceSize;

  // Евклидово расстояние внутри общего пространства.
  let squaredDistance = 0;
  for (const axis of commonAxes) {
    const delta = ownerDims[axis] - guestDims[axis];
    squaredDistance += delta * delta;
  }
  const distance = Math.sqrt(squaredDistance);

  // Близость. Нормируем НЕокруглённым диаметром — паритет 1.x.
  const commonDiameterExact = spaceDiameter(commonSpaceSize);
  const proximityFraction = 1 - Math.pow(distance / commonDiameterExact, PROXIMITY_EXPONENT);

  // Общность по Дайсу: наказывает за узкое пересечение. Совпасть идеально по одной общей оси
  // из пятидесяти — не похожесть, а случайность.
  const commonalityFraction = (2 * commonSpaceSize) / (ownerSpaceSize + guestSpaceSize);

  // Похожесть — ПРОИЗВЕДЕНИЕ, а не среднее: ноль в любом множителе обнуляет результат.
  const similarityFraction = proximityFraction * commonalityFraction;

  // Диаметры, округлённые до одного знака. Производные отношения считаются ИМЕННО от округлённых
  // диаметров, а расстояние в них подставляется НЕокруглённое — паритет 1.x.
  const ownerSpaceDiameter = roundedSpaceDiameter(ownerSpaceSize);
  const guestSpaceDiameter = roundedSpaceDiameter(guestSpaceSize);
  const commonSpaceDiameter = roundedSpaceDiameter(commonSpaceSize);

  return {
    similarity: toPercent(similarityFraction),
    proximity: toPercent(proximityFraction),
    commonality: toPercent(commonalityFraction),
    distance: round2(distance),

    commonSpaceSize,
    ownerSpaceSize,
    guestSpaceSize,
    combinedSpaceSize,

    ownerSpaceDiameter,
    guestSpaceDiameter,
    commonSpaceDiameter,

    guestSpaceSizeRateOfOwner: round2(guestSpaceSize / ownerSpaceSize),
    guestSpaceDiameterRateOfOwner: round2(guestSpaceDiameter / ownerSpaceDiameter),
    commonSpaceSizeRateOfOwner: round2(commonSpaceSize / ownerSpaceSize),
    commonSpaceSizeRateOfGuest: round2(commonSpaceSize / guestSpaceSize),
    commonSpaceDiameterRateOfOwner: round2(commonSpaceDiameter / ownerSpaceDiameter),
    commonSpaceDiameterRateOfGuest: round2(commonSpaceDiameter / guestSpaceDiameter),
    distanceRateOfCommonSpaceDiameter: Math.round((distance / commonSpaceDiameter) * 100),
  };
}

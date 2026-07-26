/**
 * Статистика собственного NDim ID — то, что 1.x показывал человеку на «Доме» (кадр app-01).
 *
 * Модуль чистый: ни Firestore, ни DOM, ни текстов интерфейса. Он отвечает на два вопроса,
 * в которых легко соврать округлением или границей, — «много ли у меня измерений» и «сколько
 * связей в каждой полосе похожести», — а слова к ответам подставляет экран (тексты 1.x
 * двуязычны и живут рядом с разметкой).
 *
 * Источник поведения: `ndim_old/public/scripts/app.js:5660-5935` (снято дословно, bugs/43).
 */

/** Ступень эмоциональной шкалы «сколько у меня измерений». Порядок — от пустого к полному. */
export type DimsScaleStep =
  | 'veryLittle'
  | 'little'
  | 'medium'
  | 'aLot'
  | 'veryMuch'
  | 'great'
  | 'wow';

/**
 * Пороги шкалы 1.x. Границы ВКЛЮЧАЮТСЯ в верхнюю ступень: `< 10` — «очень мало», значит
 * ровно 10 измерений это уже «мало». Числа зафиксированы литералами намеренно: это контракт
 * с оригиналом, а не настройка (EXP-0013 — тест, параметризованный проверяемым значением, слеп).
 */
const SCALE: readonly (readonly [max: number, step: DimsScaleStep])[] = [
  [10, 'veryLittle'],
  [25, 'little'],
  [50, 'medium'],
  [100, 'aLot'],
  [200, 'veryMuch'],
  [400, 'great'],
];

/** Ступень шкалы для количества заполненных измерений. */
export function dimsScaleStep(count: number): DimsScaleStep {
  for (const [max, step] of SCALE) {
    if (count < max) return step;
  }
  return 'wow';
}

/**
 * Нужно ли показать инструкцию «как добавить измерения».
 *
 * В 1.x она всплывала ровно на нижней ступени (`showDimsInstruction()` при `< 10`): человек,
 * у которого нет измерений, не найдёт никого — и это единственное, что ему сейчас важно знать.
 */
export const needsDimsInstruction = (count: number): boolean => dimsScaleStep(count) === 'veryLittle';

/** Полосы похожести в топе связей — виджет «Мои связи» 1.x. */
export interface RelationBands {
  /** Всего установленных связей. */
  readonly total: number;
  /** Похожесть ≥ 90%. */
  readonly top90: number;
  /** 75…89%. */
  readonly band75: number;
  /** 50…74%. */
  readonly band50: number;
}

/**
 * Раскладывает похожести топа по полосам 1.x.
 *
 * Полосы НЕ перекрываются и НЕ покрывают всё: связи ниже 50% не попадают ни в одну — так было
 * в оригинале, и это честно (сумма полос меньше общего числа связей — не ошибка, а свойство
 * шкалы: слабые связи существуют, просто они не повод для строки в сводке).
 */
export function relationBands(similarities: readonly number[]): RelationBands {
  let top90 = 0;
  let band75 = 0;
  let band50 = 0;

  for (const value of similarities) {
    if (value >= 90) top90 += 1;
    else if (value >= 75) band75 += 1;
    else if (value >= 50) band50 += 1;
  }

  return { total: similarities.length, top90, band75, band50 };
}

/**
 * Канон движения продукта (bugs/05): спокойные переходы, планка — лендинг.
 *
 * Три длительности на всё приложение — чтобы движение всех экранов было одной семьёй:
 *   fast — микрореакции: выпадающие меню, строка отсчёта, мелкие исчезновения;
 *   base — появление и уход контента, раскрытия, тосты;
 *   slow — перестроение списков (FLIP) и большие жесты (карточка уезжает вправо).
 *
 * Используй ВМЕСТЕ со встроенными переходами Svelte (`transition:fade/slide/fly`,
 * `animate:flip`) — не изобретай хронометраж на setTimeout.
 *
 * Уважение к prefers-reduced-motion: человеку, попросившему систему не анимировать,
 * все длительности обнуляются — интерфейс работает мгновенно (так делает и лендинг).
 */
const reduced =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const MOTION = {
  fast: reduced ? 0 : 140,
  base: reduced ? 0 : 240,
  slow: reduced ? 0 : 320,
} as const;

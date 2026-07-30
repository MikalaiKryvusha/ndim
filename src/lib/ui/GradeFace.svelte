<script lang="ts">
  // Цветной смайлик оценки 0…10 — ОДИН на весь продукт (bugs/80, п. «б»).
  //
  // Разметка родилась в руководстве (bugs/55, сниппет `face` в `DocBlocks.svelte`). Когда
  // владелец попросил тот же ряд смайликов в карточке «Измерений» (интервью №007, В9),
  // копия разошлась бы с оригиналом при первой же правке — поэтому она переехала сюда,
  // как того и требовал документ бага.
  //
  // Формы и ЦВЕТА берутся из `emojiscale.ts`: цвета там замерены отрисовкой фильтров 1.x
  // браузером (EXP-0057), а не подобраны на глаз; «десятка» — авторский многоцветный файл
  // и рисуется отдельной разметкой.
  //
  // Размер задаёт вызывающая сторона атрибутами `width`/`height` — они же держат резерв
  // места, чтобы раскладка не прыгала (правило владельца о готовности графики).
  import { FACE_PATHS, GRADE_FACES, LOVE_FACE } from '$lib/ui/emojiscale';

  let { grade, size }: { grade: number; size: number } = $props();

  const entry = $derived(GRADE_FACES[grade]);
</script>

<svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
  {#if entry.face === 'love'}
    <rect {...LOVE_FACE.rect} />
    <path d={LOVE_FACE.path} fill={LOVE_FACE.pathFill} />
  {:else}
    <path d={FACE_PATHS[entry.face]} fill={entry.color} />
  {/if}
</svg>

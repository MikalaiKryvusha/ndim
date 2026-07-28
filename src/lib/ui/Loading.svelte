<script lang="ts">
  /**
   * Каноничная карточка загрузки (bugs/21) — по образцу 1.x (`researches/12`):
   * строка «Загрузка» + вращающееся кольцо-полукруг. В 1.x кольцо — это круг, у которого
   * закрашены только две противоположные дуги (`border-color: X transparent`), и он
   * доворачивается на пол-оборота каждые 1.5 секунды — визуально «( )» из кадра
   * design/reference-1x/app-02-связи.png. Адаптация 2.0: панельная карточка, цвета темы.
   *
   * Одна на все экраны: раньше каждый экран писал голый текст «Подключаюсь…», и владелец
   * справедливо назвал это скучным (волна 09, п. 3).
   */
  import type { Lang } from '$lib/ui/format';

  let { lang }: { lang: Lang } = $props();
</script>

<!-- Обёртка центрирует карточку и ЗАБИРАЕТ на себя растяжение раскладки: сама карточка
     остаётся по размеру содержимого, где бы ни стояла (bugs/70). -->
<div class="load-wrap">
  <div class="load-card" role="status">
    <span>{lang === 'ru' ? 'Загрузка' : 'Loading'}</span>
    <i class="ring" aria-hidden="true"></i>
  </div>
</div>

<style>
  /**
   * Карточка загрузки ВСЕГДА лаконичная и компактная (слово владельца, волна 13, bugs/70):
   * она растягивалась на всю рабочую область — блочный flex занимал всю ширину ячейки, а на
   * «Пространстве» ячейка ещё и `grid-column: 1 / -1` (1129px при рабочей области 1193px).
   * Лечение формой, в одном месте: обёртка тянется, карточка — нет. Экраны не правятся.
   */
  .load-wrap {
    display: flex;
    justify-content: center;
  }
  .load-card {
    display: flex;
    align-items: center;
    justify-content: center;
    /* Размер по содержимому: как бы широка ни была обёртка, карточка не растягивается. */
    width: max-content;
    max-width: 100%;
    gap: 11px;
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 14px;
    box-shadow: var(--card-shadow);
    padding: 16px;
    color: var(--dim);
    font-size: 14px;
  }
  .ring {
    width: 18px;
    aspect-ratio: 1;
    border-radius: 50%;
    border: 3px solid;
    /* Две дуги: видимая — цвет продукта, встречная — прозрачная (канон 1.x). */
    border-color: var(--primary) transparent;
    animation: half-turn 1.5s infinite;
  }
  @keyframes half-turn {
    to {
      transform: rotate(0.5turn);
    }
  }
</style>

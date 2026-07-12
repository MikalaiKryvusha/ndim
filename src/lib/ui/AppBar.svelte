<script lang="ts">
  // Шапка продукта: знак (Brand) + водмарк + переключатель языка.
  // Один на все экраны 2.0; цвета — только из переменных темы.
  // badge — опциональная пунктирная пилюля (гостевой режим, plans/03: макет V1 «Тихий бейдж»).
  //
  // На десктопе (от 1024px) слева стоит рельс SideRail и он тоже показывает знак и
  // водмарк — здесь мы их прячем, чтобы бренд не двоился (макет V2 «Рабочий стол»).
  import Brand from '$lib/ui/Brand.svelte';

  let {
    lang,
    onToggleLang,
    badge,
    onBadge,
  }: {
    lang: 'ru' | 'en';
    onToggleLang: () => void;
    // `| undefined` явно: у проекта exactOptionalPropertyTypes, а экраны передают
    // badge={guest ? ... : undefined}
    badge?: string | undefined;
    onBadge?: (() => void) | undefined;
  } = $props();
</script>

<header class="bar">
  <span class="mark"><Brand size={26} /></span>
  <span class="wm">{lang === 'ru' ? 'Пространство NDim' : 'NDim Space'}</span>
  {#if badge}
    <button type="button" class="badge" onclick={onBadge}>◌ {badge}</button>
  {/if}
  <button type="button" class="lang" onclick={onToggleLang}>{lang === 'ru' ? 'RU' : 'EN'}</button>
</header>

<style>
  .bar {
    display: flex; align-items: center; gap: 9px;
    padding: 14px 16px 12px; background: var(--panel); border-bottom: 1px solid var(--edge);
  }
  .wm { font-size: 15px; font-weight: 650; color: var(--heading); }
  .lang {
    margin-left: auto; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer;
    color: var(--dim); background: transparent; border: 1px solid var(--edge); border-radius: 8px; padding: 4px 9px;
    transition: color 0.15s ease, border-color 0.15s ease;
  }
  .lang:hover { color: var(--primary); border-color: var(--primary); }
  /* Гость = пунктир (не сохранён, невидим другим) — метафора утверждённого макета V1. */
  .badge {
    margin-left: auto; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
    color: var(--accent); background: transparent;
    border: 1px dashed var(--accent); border-radius: 999px; padding: 4px 11px;
  }
  .badge + .lang { margin-left: 0; }

  /* Десктоп: бренд живёт в рельсе слева — в шапке он лишний.
     Сама шапка остаётся: в ней гостевой бейдж и переключатель языка. */
  @media (min-width: 1024px) {
    .mark, .wm { display: none; }
    .bar { justify-content: flex-end; padding: 12px 26px; min-height: 52px; }
    .badge, .lang { margin-left: 0; }
  }
</style>

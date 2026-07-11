<script lang="ts">
  // Шапка продукта: утверждённый знак V3 «Диагональ» + водмарк + переключатель языка.
  // Один на все экраны 2.0; цвета — только из переменных темы.
  let { lang, onToggleLang }: { lang: 'ru' | 'en'; onToggleLang: () => void } = $props();
</script>

<header class="bar">
  <svg width="26" height="26" viewBox="0 0 96 96" aria-hidden="true">
    <defs>
      <linearGradient id="appbar-g" gradientUnits="userSpaceOnUse" x1="30" y1="26" x2="68" y2="70">
        <stop offset="0" stop-color="#4d9fff" /><stop offset="1" stop-color="#3fd9ff" />
      </linearGradient>
    </defs>
    <rect width="96" height="96" rx="22" fill="#060b14" />
    <g stroke="url(#appbar-g)" stroke-width="6.7" fill="none">
      <line x1="36.5" y1="29" x2="30" y2="66" /><line x1="36.5" y1="29" x2="59.5" y2="66" /><line x1="59.5" y1="66" x2="66" y2="29" />
    </g>
    <g fill="url(#appbar-g)">
      <circle cx="36.5" cy="29" r="9.3" /><circle cx="30" cy="66" r="9.3" /><circle cx="59.5" cy="66" r="9.3" /><circle cx="66" cy="29" r="9.3" />
    </g>
  </svg>
  <span class="wm">{lang === 'ru' ? 'Пространство NDim' : 'NDim Space'}</span>
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
  }
</style>

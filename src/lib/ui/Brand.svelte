<script lang="ts" module>
  // Уникальный id градиента на каждый экземпляр знака: на десктопе знак рисуется
  // дважды (шапка + боковой рельс), а два одинаковых id в одном документе —
  // невалидный HTML, и второй градиент может не примениться.
  let seq = 0;
</script>

<script lang="ts">
  // Знак NDim — утверждённое лого V3 «Диагональ» (2026-07-11): классическая
  // N-сеть 1.x, градиент синий→циан вдоль диагонали, тёмная плашка.
  // Форма канонична — освежать можно только цветом. Источник: design/logo-mockups.html.
  let { size = 26 }: { size?: number } = $props();
  const gradientId = `brand-g-${seq++}`;
</script>

<svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true">
  <defs>
    <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="30" y1="26" x2="68" y2="70">
      <stop offset="0" stop-color="#4d9fff" /><stop offset="1" stop-color="#3fd9ff" />
    </linearGradient>
  </defs>
  <rect width="96" height="96" rx="22" fill="#060b14" />
  <g stroke="url(#{gradientId})" stroke-width="6.7" fill="none">
    <line x1="36.5" y1="29" x2="30" y2="66" /><line x1="36.5" y1="29" x2="59.5" y2="66" /><line x1="59.5" y1="66" x2="66" y2="29" />
  </g>
  <g fill="url(#{gradientId})">
    <circle cx="36.5" cy="29" r="9.3" /><circle cx="30" cy="66" r="9.3" /><circle cx="59.5" cy="66" r="9.3" /><circle cx="66" cy="29" r="9.3" />
  </g>
</svg>

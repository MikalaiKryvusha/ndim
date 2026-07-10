<script lang="ts">
  // Корневой лейаут: глобальный сброс и цифровое пространство NDim.
  // Палитра утверждена владельцем: синий киберпанк, неон, лёгкие цифровые
  // технологии; без градиентных кнопок (см. design/landing-mockups.html, V1).
  let { children } = $props();
</script>

{@render children()}

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(:root) {
    /* Цифровая ночь: глубокий сине-чёрный фон и неоновые акценты */
    --bg: #060b14;
    --panel: rgba(10, 21, 38, 0.78);
    --edge: rgba(77, 159, 255, 0.22);
    --neon: #3fd9ff;
    --blue: #4d9fff;
    --text: #dce9f7;
    --dim: #8299b1;
    --mono: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }

  :global(html) {
    scroll-behavior: smooth;
  }

  :global(body) {
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
  }

  :global(::selection) {
    background: rgba(63, 217, 255, 0.28);
  }
</style>

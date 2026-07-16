<script lang="ts">
  // Корневой лейаут: глобальный сброс и токены двух тем NDim.
  //
  // Тема — это НАБОР CSS-переменных. Светлая («Бумага», дефолт) объявлена на :root;
  // тёмная (синий киберпанк, утверждённый ранее) — на :root[data-theme="dark"].
  // Атрибут data-theme выставляет инлайн-скрипт в app.html (до отрисовки, без мигания)
  // и переключатель темы на лендинге (src/routes/+page.svelte). Один код компонентов
  // работает в обеих темах — цвета берутся только из переменных.
  let { children } = $props();
</script>

{@render children()}

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  /* ── Светлая тема «Бумага» — ДЕФОЛТ. Белое с синим, читаемый синий-акцент
        вместо бирюзового неона (бирюза не держит контраст на белом). ── */
  :global(:root) {
    --bg: #f6f8fb;
    --panel: #ffffff;
    --panel-2: #ffffff;
    /* НЕПРОЗРАЧНАЯ панель — для слоёв, ПОД которыми едет контент: прибитая навигация,
       контекстные меню, тосты (bugs/22, 23). Обычный --panel в тёмной теме полупрозрачен
       по построению, и сквозь такие слои просвечивал текст. */
    --panel-solid: #ffffff;
    --edge: #e6eef7;
    --edge-soft: #eef4fa;
    --primary: #1467d6;
    --primary-ink: #ffffff;
    --accent: #1f7fc9;
    --star: #e8a516;
    --heading: #12263c;
    --text: #33506e;
    --dim: #6a819a;
    --faint: #90a4bb;
    --ghost-brd: rgba(20, 103, 214, 0.35);
    --ghost-ink: #1a63c4;
    --ghost-bg-hover: rgba(20, 103, 214, 0.06);
    /* Фоновое «пространство»: синева поднята на ~10% против первого эскиза (правка владельца) */
    --link-stroke: rgba(52, 130, 214, 0.24);
    --node-fill: rgba(52, 130, 214, 0.38);
    --accent-node: rgba(48, 150, 205, 0.5);
    --vig: rgba(150, 185, 220, 0.12);
    --panel-blur: 0px;
    --card-shadow: 0 16px 40px rgba(29, 50, 71, 0.08);
    --toggle-bg: rgba(255, 255, 255, 0.9);
    --toggle-brd: #dbe7f3;
    --mono: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    /* Рост и падение — тренды на экране «Пространство» и лампочка сервера синхронизации.
       Зелёный и красный здесь означают «выросло/упало», а не «хорошо/плохо»: падение
       средней похожести значит, что Пространство стало разнообразнее. */
    --up: #0ea578;
    --down: #d6544f;
  }

  /* ── Тёмная тема: цифровая ночь, синий киберпанк, бирюзовый неон (утверждена ранее) ── */
  :global(:root[data-theme='dark']) {
    --bg: #060b14;
    --panel: rgba(10, 21, 38, 0.78);
    --panel-2: rgba(9, 18, 33, 0.66);
    /* Композит --panel поверх --bg, без альфы (bugs/22, 23). */
    --panel-solid: #091322;
    --edge: rgba(77, 159, 255, 0.22);
    --edge-soft: rgba(77, 159, 255, 0.14);
    --primary: #1467d6;
    --primary-ink: #ffffff;
    --accent: #3fd9ff;
    --star: #ffc93d;
    --heading: #eef6ff;
    --text: #dce9f7;
    --dim: #8299b1;
    --faint: #6d84a0;
    --ghost-brd: rgba(63, 217, 255, 0.45);
    --ghost-ink: #a8e2ff;
    --ghost-bg-hover: rgba(63, 217, 255, 0.08);
    --link-stroke: rgba(77, 159, 255, 0.16);
    --node-fill: rgba(99, 176, 255, 0.4);
    --accent-node: rgba(63, 217, 255, 0.55);
    --vig: rgba(8, 28, 58, 0.55);
    --panel-blur: 10px;
    --card-shadow: 0 0 0 1px rgba(63, 217, 255, 0.06), 0 24px 60px rgba(2, 8, 20, 0.6);
    --toggle-bg: rgba(13, 26, 45, 0.8);
    --toggle-brd: rgba(63, 217, 255, 0.3);
    --up: #34d399;
    --down: #f87171;
  }

  :global(html) {
    scroll-behavior: smooth;
  }

  :global(body) {
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    transition: background 0.3s, color 0.3s;
  }

  :global(::selection) {
    background: color-mix(in srgb, var(--accent) 28%, transparent);
  }
</style>

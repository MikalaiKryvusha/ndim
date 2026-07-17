<script lang="ts">
  // Полный манифест отдельной страницей (bugs/38): мобильное «Меню» ведёт сюда кнопкой —
  // развесистый текст не съедает первый экран телефона. Текст — общий модуль
  // src/lib/content/manifest.ts (тот же, что в десктопном виджете меню).
  import DocShell from '$lib/ui/DocShell.svelte';
  import { MANIFEST } from '$lib/content/manifest';

  const title = MANIFEST.title;
</script>

<DocShell {title}>
  {#snippet children(lang)}
    {#each MANIFEST.paragraphs[lang] as paragraph, index (index)}
      <!-- Текст свой, статический (не пользовательский): <b> — часть авторской формулировки. -->
      <p>{@html paragraph}</p>
    {/each}
  {/snippet}
</DocShell>

<style>
  p { margin: 10px 0; }
  p :global(b) { color: var(--heading); }
</style>

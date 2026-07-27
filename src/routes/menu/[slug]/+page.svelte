<script lang="ts">
  // Страница документа: руководство пользователя, условия использования, политика
  // конфиденциальности, отказ от ответственности. Тексты — владельца, снятые дословно
  // из 1.x (researches/06, researches/07) и сгенерированные в src/lib/content/docs.ts.
  import ChapterNav from '$lib/ui/ChapterNav.svelte';
  import DocBlocks from '$lib/ui/DocBlocks.svelte';
  import DocShell from '$lib/ui/DocShell.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // Плашка «разделы обновляются под 2.0» УБРАНА по слову владельца (2026-07-27):
  // решение о непереносе разделов про экраны 1.x остаётся в силе, но объявлять об этом
  // на лице продукта владелец не хочет.

  // Главы для плавающего пагинатора (bugs/55, только руководство — остальные документы
  // короткие): якоря sec-<номер блока> ставит DocBlocks, индексы совпадают по построению.
  // $derived: при клиентском переходе между документами data меняется, главы обязаны тоже.
  const chapters = $derived(
    data.doc.blocks
      .map((block, index) => ({ block, index }))
      .filter(({ block }) => block.type === 'h2' || block.type === 'h3')
      .map(({ block, index }) => ({
        id: `sec-${index}`,
        title: (block as { text: { ru: string; en: string } }).text,
        level: block.type as 'h2' | 'h3',
      })),
  );
</script>

<svelte:head>
  {#if data.doc.slug === 'manual'}
    <!-- Логотип шапки греется ДО рендера (глобальное правило владельца: графика не
         «доезжает на горячую») — с пререндером он готов к первому кадру, как в 1.x,
         где preload-теги стояли на всю статику. -->
    <link rel="preload" as="image" href="/img/docs/logo-1x.webp" />
  {/if}
</svelte:head>

<DocShell title={data.doc.title}>
  {#snippet children(lang)}
    <DocBlocks blocks={data.doc.blocks} {lang} />
    {#if data.doc.slug === 'manual'}
      <ChapterNav {chapters} {lang} />
    {/if}
  {/snippet}
</DocShell>


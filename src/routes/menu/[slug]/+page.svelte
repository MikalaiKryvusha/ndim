<script lang="ts">
  // Страница документа: руководство пользователя, условия использования, политика
  // конфиденциальности, отказ от ответственности. Тексты — владельца, снятые дословно
  // из 1.x (researches/06, researches/07) и сгенерированные в src/lib/content/docs.ts.
  import ChapterNav from '$lib/ui/ChapterNav.svelte';
  import DocBlocks from '$lib/ui/DocBlocks.svelte';
  import DocShell from '$lib/ui/DocShell.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // Разделы руководства, описывающие ЭКРАНЫ версии 1.x, сюда не перенесены: в 2.0 такого
  // интерфейса нет, и дословный перенос был бы враньём о продукте. Говорим об этом честно,
  // а не делаем вид, что руководство полное.
  const manualNote = {
    ru: 'Разделы о работе с экранами и о синхронизации обновляются под NDim Space 2.0.',
    en: 'The sections about the screens and about synchronisation are being updated for NDim Space 2.0.',
  } as const;

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

<DocShell title={data.doc.title}>
  {#snippet children(lang)}
    <DocBlocks blocks={data.doc.blocks} {lang} />
    {#if data.doc.slug === 'manual'}
      <p class="note">{manualNote[lang]}</p>
      <ChapterNav {chapters} {lang} />
    {/if}
  {/snippet}
</DocShell>

<style>
  .note {
    margin-top: 26px; padding: 12px 14px; border-radius: 12px;
    background: var(--edge-soft); border: 1px solid var(--edge);
    font-size: 12.5px; color: var(--dim); line-height: 1.55;
  }
</style>

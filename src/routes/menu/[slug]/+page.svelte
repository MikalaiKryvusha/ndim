<script lang="ts">
  // Страница документа: руководство пользователя, условия использования, политика
  // конфиденциальности, отказ от ответственности. Тексты — владельца, снятые дословно
  // из 1.x (researches/06, researches/07) и сгенерированные в src/lib/content/docs.ts.
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
</script>

<DocShell title={data.doc.title}>
  {#snippet children(lang)}
    <DocBlocks blocks={data.doc.blocks} {lang} />
    {#if data.doc.slug === 'manual'}
      <p class="note">{manualNote[lang]}</p>
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

<script lang="ts">
  // Отрисовка блоков документа (`src/lib/content/docs.ts`): заголовки, абзацы, списки, таблицы.
  //
  // Тексты — владельца, снятые дословно из 1.x. Разметка внутри них (**жирный**) — часть его
  // формулировок, поэтому она переводится в HTML, а не выбрасывается. Источник статический,
  // из репозитория; экранирование всё равно делает richText().
  import { richText, type Lang } from '$lib/ui/format';
  import type { DocBlock } from '$lib/content/docs';

  let { blocks, lang }: { blocks: readonly DocBlock[]; lang: Lang } = $props();
</script>

{#each blocks as block, index (index)}
  {#if block.type === 'h2'}
    <h2>{block.text[lang]}</h2>
  {:else if block.type === 'h3'}
    <h3>{block.text[lang]}</h3>
  {:else if block.type === 'p'}
    <p>{@html richText(block.text[lang])}</p>
  {:else if block.type === 'ul'}
    <ul>
      {#each block.items[lang] as item, itemIndex (itemIndex)}
        <li>{@html richText(item)}</li>
      {/each}
    </ul>
  {:else if block.type === 'table'}
    <div class="scroll">
      <table>
        <thead>
          <tr>
            {#each block.head[lang] as cell, cellIndex (cellIndex)}<th>{cell}</th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each block.rows[lang] as row, rowIndex (rowIndex)}
            <tr>
              {#each row as cell, cellIndex (cellIndex)}<td>{@html richText(cell)}</td>{/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/each}

<style>
  h2 {
    font-size: 16px; font-weight: 700; color: var(--heading);
    margin: 22px 0 8px; padding-top: 12px; border-top: 1px solid var(--edge-soft);
  }
  h2:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
  h3 { font-size: 14.5px; font-weight: 700; color: var(--heading); margin: 16px 0 6px; }
  p { margin: 10px 0; }
  ul { margin: 10px 0 10px 18px; }
  li { margin: 8px 0; }
  p :global(b), li :global(b) { color: var(--heading); }

  /* Широкую таблицу (шкала оценок) прокручиваем внутри неё самой: страница не должна
     разъезжаться по горизонтали на телефоне. */
  .scroll { overflow-x: auto; margin: 12px 0; }
  table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
  th, td { text-align: left; vertical-align: top; padding: 9px 10px; border-bottom: 1px solid var(--edge-soft); }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--dim); }
  td:first-child { font-family: var(--mono); font-weight: 700; color: var(--primary); width: 44px; }
  td :global(b) { color: var(--heading); }
</style>

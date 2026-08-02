<!--
  ПУБЛИЧНАЯ СТРАНИЦА ИЗМЕРЕНИЯ — прототип шага 0 фазы 5 (`plans/36`).

  ⚠️ ЭТО ЗАМЕРОЧНЫЙ ПРОТОТИП, А НЕ УТВЕРЖДЁННЫЙ МАКЕТ. Его задача — дать честный вес страницы
  в `build/`. Оформление публичной страницы каталога — новый тип экрана, а значит подлежит
  правилу четырёх макетов (`AGENT_GUIDE.md` → «Дизайн»); здесь сознательно сделано просто.

  🔴 Языковую схему эта страница НЕ изобретает: языковые адреса — работа `plans/24` фаз 6–7.
  Пока их нет, страница отдаёт русский, как и остальной сайт, и переедет вместе со всеми.
-->
<script lang="ts">
  import type { DimPage } from './+page.ts';

  let { data }: { data: { dim: DimPage; showStars: boolean; showRaterCount: boolean } } = $props();

  const dim = $derived(data.dim);
  const title = $derived(dim.title.ru || dim.title.en);
  const description = $derived(dim.description.ru || dim.description.en);
  const kind = $derived(dim.type.ru || dim.type.en);
  const author = $derived(dim.author.ru || dim.author.en);

  /** Год «-» в каталоге означает «неизвестен» — тогда элемент не показывается вовсе (`ideas/26`). */
  const year = $derived(dim.year && dim.year !== '-' ? dim.year : '');
  const hasAuthor = $derived(Boolean(author) && author !== '-');

  /** Строка для описания страницы в выдаче: первое предложение, но не длиннее разумного. */
  const meta = $derived(description.slice(0, 155).replace(/\s+\S*$/, '') + '…');
</script>

<svelte:head>
  <title>{title} — Пространство NDim</title>
  <meta name="description" content={meta} />
</svelte:head>

<article class="dim">
  <header>
    <p class="kind">
      {#if kind}<span>{kind}</span>{/if}
      {#if year}<span>{year}</span>{/if}
    </p>
    <h1>{title}</h1>
    {#if hasAuthor}<p class="author">{author}</p>{/if}
  </header>

  <!--
    Блок оценок. Вся логика решена в `+page.ts` — здесь только показ, чтобы правило владельца
    жило в ОДНОМ месте и его можно было накрыть стражем.
  -->
  <p class="rating">
    {#if data.showStars}
      <span class="stars" aria-hidden="true">
        {#each Array(10) as _, i (i)}<i class:on={i < Math.round(dim.rating)}>★</i>{/each}
      </span>
      <span class="value">{dim.rating.toFixed(1).replace('.', ',')}</span>
      {#if data.showRaterCount}<span class="votes">оценили: {dim.rates}</span>{/if}
    {:else}
      <span class="novotes">Ещё без голосов</span>
    {/if}
  </p>

  <p class="description">{description}</p>

  {#if dim.tags.length}
    <ul class="tags">
      {#each dim.tags as tag (tag)}<li>{tag}</li>{/each}
    </ul>
  {/if}

  <p class="invite">
    <a href="/">Оценить это измерение в Пространстве NDim</a>
  </p>
</article>

<style>
  .dim {
    max-width: 42rem;
    margin: 0 auto;
    padding: 2rem 1rem 4rem;
  }
  .kind {
    display: flex;
    gap: 0.75rem;
    margin: 0 0 0.25rem;
    font-size: 0.85rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted, #6b7280);
  }
  h1 {
    margin: 0;
    font-size: clamp(1.6rem, 4vw, 2.2rem);
    line-height: 1.15;
  }
  .author {
    margin: 0.35rem 0 0;
    color: var(--muted, #6b7280);
  }
  .rating {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    /* Высоту строки держит min-height, а не звёзды: карточки без голосов иначе «прыгают» (bugs/15). */
    min-height: 26px;
    margin: 1.25rem 0;
  }
  .stars i {
    font-style: normal;
    color: var(--muted, #d1d5db);
  }
  .stars i.on {
    color: var(--accent, #f59e0b);
  }
  .value {
    font-weight: 600;
  }
  .votes,
  .novotes {
    font-size: 0.9rem;
    color: var(--muted, #6b7280);
  }
  .description {
    margin: 1.25rem 0;
    line-height: 1.65;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 1.5rem 0;
    padding: 0;
    list-style: none;
  }
  .tags li {
    padding: 0.2rem 0.6rem;
    border: 1px solid var(--line, #e5e7eb);
    border-radius: 999px;
    font-size: 0.85rem;
    color: var(--muted, #6b7280);
  }
  .invite {
    margin-top: 2rem;
  }
</style>

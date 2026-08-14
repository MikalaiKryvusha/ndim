<!--
  ХАБ «ТЕСТЫ» — обзор семейства обёрток (интервью №028, В4 = Б: делается сразу).

  Форма — по каркасу V5 (интервью №029, В2 = А): заголовок → строка «одна анкета на все
  тесты» → три карточки-двери → строка честности → подпись. Оболочка — шапка публичной
  страницы, рельса нет (как у страниц каталога и обёрток теста).
-->
<script lang="ts">
  import { LANGS } from '$lib/content/langs';
  // Шапка публичной страницы — одна на все публичные поверхности (`plans/48` шаг 3).
  import PublicBar from '$lib/ui/PublicBar.svelte';

  let { data } = $props();

  const other = $derived(LANGS.find((l) => l !== data.lang) ?? data.lang);
</script>

<svelte:head>
  <title>{data.hub.metaTitle}</title>
  <meta name="description" content={data.hub.metaDesc} />
  <link rel="canonical" href={data.canonical} />
  {#each data.alternates as alt (alt.hreflang)}
    <link rel="alternate" hreflang={alt.hreflang} href={alt.href} />
  {/each}
  <meta property="og:type" content="website" />
  <meta property="og:title" content={data.hub.metaTitle} />
  <meta property="og:description" content={data.hub.metaDesc} />
  <meta property="og:url" content={data.canonical} />
  <meta property="og:locale" content={data.lang === 'en' ? 'en_US' : 'ru_RU'} />
</svelte:head>

<PublicBar lang={data.lang} otherLang={other} otherHref="/{other}/tests" />

<article class="hub">
  <h1>{data.hub.h1}</h1>
  <p class="sub">{data.hub.sub}</p>
  <p class="one">{data.hub.oneLine}</p>

  <div class="cards">
    {#each data.cards as card (card.slug)}
      <a class="card" href="/{data.lang}/test/{card.slug}">
        <span class="badge">{card.badge}</span>
        <span class="name">{card.name}</span>
        <span class="line">{card.line}</span>
        <span class="go">{card.cta} →</span>
      </a>
    {/each}
  </div>

  <p class="honesty">{data.hub.honesty}</p>
  <p class="foot">{data.foot}</p>
</article>

<style>
  /* Стили шапки переехали в `PublicBar.svelte` вместе с самой шапкой (`plans/48` шаг 3). */
  .hub {
    max-width: 46rem;
    margin: 0 auto;
    padding: 1.5rem 1rem 3.5rem;
    color: var(--text);
  }
  h1 {
    margin: 0;
    font-size: clamp(1.5rem, 4.5vw, 2rem);
    line-height: 1.18;
    color: var(--heading);
  }
  .sub {
    margin: 0.5rem 0 0;
    font-size: 0.95rem;
    line-height: 1.55;
    color: var(--dim);
  }
  .one {
    margin: 0.9rem 0 0;
    padding: 0.6rem 0.8rem;
    background: var(--edge-soft);
    border-radius: 12px;
    font-size: 0.84rem;
    line-height: 1.5;
  }

  .cards {
    display: grid;
    gap: 0.7rem;
    margin: 1rem 0 0;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.95rem 1rem;
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 16px;
    box-shadow: var(--card-shadow);
    text-decoration: none;
    color: var(--text);
  }
  .badge {
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .name {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--heading);
  }
  .line {
    font-size: 0.84rem;
    line-height: 1.5;
  }
  .go {
    margin-top: 0.15rem;
    font-size: 0.84rem;
    font-weight: 600;
    color: var(--accent);
  }

  .honesty {
    margin: 1.1rem 0 0;
    padding: 0.6rem 0.8rem;
    background: var(--edge-soft);
    border-radius: 12px;
    font-size: 0.84rem;
    line-height: 1.5;
  }
  .foot {
    margin: 1.6rem 0 0;
    padding-top: 0.8rem;
    border-top: 1px solid var(--edge);
    font-size: 0.78rem;
    line-height: 1.55;
    color: var(--faint);
  }

  @media (min-width: 1024px) {
    .hub {
      max-width: 64rem;
      padding: 2rem 1.5rem 4rem;
    }
    .cards {
      grid-template-columns: 1fr 1fr 1fr;
    }
    .card .line {
      flex: 1;
    }
  }
</style>

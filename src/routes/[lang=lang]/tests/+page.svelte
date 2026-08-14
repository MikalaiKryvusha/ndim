<!--
  ХАБ «ТЕСТЫ» — обзор семейства обёрток (интервью №028, В4 = Б: делается сразу).

  Форма — по каркасу V5 (интервью №029, В2 = А): заголовок → строка «одна анкета на все
  тесты» → три карточки-двери → строка честности → подпись. Оболочка — шапка публичной
  страницы, рельса нет (как у страниц каталога и обёрток теста).
-->
<script lang="ts">
  import { LANGS, LANG_LABEL } from '$lib/content/langs';
  import Icon from '$lib/ui/Icon.svelte';
  import Brand from '$lib/ui/Brand.svelte';

  let { data } = $props();

  const other = $derived(LANGS.find((l) => l !== data.lang) ?? data.lang);
  const UI = {
    ru: { enter: 'Войти', theme: 'Тема' },
    en: { enter: 'Log in', theme: 'Theme' },
  } as const;
  const ui = $derived(UI[data.lang as 'ru' | 'en']);
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

<header class="bar">
  <a class="brand" href="/">
    <Brand size={26} />
    <span>NDim Space</span>
  </a>
  <a class="langsw" href="/{other}/tests" hreflang={other}>{LANG_LABEL[other]}</a>
  <button type="button" id="theme-toggle" class="theme" title={ui.theme} aria-label={ui.theme}>
    <span class="ic sun"><Icon name="sun" size={15} /></span>
    <span class="ic moon"><Icon name="moon" size={15} /></span>
  </button>
  <a class="enter" href="/profile">{ui.enter}</a>
</header>

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
  .bar {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 52px;
    padding: 0 1rem;
    background: var(--panel);
    border-bottom: 1px solid var(--edge);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 700;
    color: var(--heading);
    text-decoration: none;
  }
  .langsw {
    margin-left: auto;
    padding: 0.4rem 0.7rem;
    border-radius: 999px;
    border: 1px solid var(--edge);
    color: var(--dim);
    font-weight: 600;
    font-size: 0.85rem;
    text-decoration: none;
  }
  .theme {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    padding: 0;
    flex: none;
    border-radius: 10px;
    border: 1px solid var(--edge);
    background: transparent;
    color: var(--dim);
    cursor: pointer;
  }
  .theme .ic {
    display: inline-flex;
  }
  .theme .moon {
    display: none;
  }
  :global(html[data-theme='dark']) .theme .sun {
    display: none;
  }
  :global(html[data-theme='dark']) .theme .moon {
    display: inline-flex;
  }
  .enter {
    padding: 0.4rem 0.9rem;
    border-radius: 999px;
    background: var(--primary);
    color: var(--primary-ink);
    font-weight: 600;
    font-size: 0.85rem;
    text-decoration: none;
  }

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

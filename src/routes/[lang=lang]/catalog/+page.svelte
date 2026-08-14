<!--
  ИНДЕКС КАТАЛОГА — семь хабов и хвост (`plans/48` шаг 3).

  Форма — та же семья, что у хаба V3: шапка публичной страницы, заголовок, строка смысла, полоса
  чисел, карточки разделов. Отдельного набора макетов эта страница не потребовала: она собрана из
  уже утверждённых элементов хаба (полоса чисел, карточка-ссылка), а не вводит новую форму.

  🔴 ЗАКОН О НАЗВАНИЯХ действует и здесь: в хвосте стоят настоящие имена объектов, и ни одно из
  них не обрезается (`AGENT_GUIDE.md` → «Названия не обрезаются НИКОГДА»). Самое длинное в
  каталоге — «Концепция Общественной Безопасности (КОБ) — лекции Петрова К. П.».
-->
<script lang="ts">
  import PublicBar from '$lib/ui/PublicBar.svelte';
  import CatalogHead from '$lib/ui/CatalogHead.svelte';
  import { CATALOG_COPY } from '$lib/content/catalog-copy';
  import { num } from '$lib/ui/format';
  import type { CatalogIndexView } from '$lib/content/catalog-view';

  let { data }: { data: CatalogIndexView } = $props();

  const t = $derived(CATALOG_COPY[data.lang]);
</script>

<CatalogHead {data} ogType="website" />

<PublicBar lang={data.lang} otherLang={data.otherLang} otherHref={data.otherHref} />

<article class="cat">
  <h1>{t.indexH1}</h1>
  <p class="lede">{t.indexLede}</p>
  <p class="counts">
    <span><b>{num(data.total, data.lang)}</b> {t.ofTotal}</span>
    <span><b>{num(data.rated, data.lang)}</b> {t.ofRated}</span>
  </p>

  <div class="hubs">
    {#each data.hubs as hub (hub.key)}
      <a class="hub" href={hub.href}>
        <span class="name">{hub.title}</span>
        <span class="n">{num(hub.count, data.lang)}</span>
      </a>
    {/each}
  </div>

  <section class="tail">
    <h2>{t.tailH2}</h2>
    <p class="tail-lede">{t.tailLede}</p>
    <ul>
      {#each data.tail as item (item.slug)}
        <li><a href={item.href}>{item.title}</a></li>
      {/each}
    </ul>
  </section>

  <p class="foot">{t.foot}</p>
</article>

<style>
  .cat {
    max-width: 48rem;
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
  .lede {
    margin: 0.5rem 0 0;
    font-size: 0.95rem;
    line-height: 1.55;
    color: var(--dim);
  }
  .counts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 1.1rem;
    margin: 0.7rem 0 0;
    font-size: 0.85rem;
    color: var(--dim);
  }
  .counts b {
    color: var(--heading);
    font-weight: 700;
  }

  .hubs {
    display: grid;
    gap: 0.6rem;
    margin: 1.2rem 0 0;
  }
  /* Карточка раздела: имя слева, число справа. Выравнивание по верху — по общему закону о
     названиях: длинное имя вида растёт вниз, а число остаётся на первой строке. */
  .hub {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.85rem 1rem;
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 14px;
    box-shadow: var(--card-shadow);
    text-decoration: none;
    color: var(--text);
  }
  .hub .name {
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.3;
    color: var(--heading);
  }
  .hub .n {
    flex: 0 0 auto;
    font-size: 0.95rem;
    font-weight: 800;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }

  .tail {
    margin: 1.8rem 0 0;
  }
  .tail h2 {
    margin: 0;
    font-size: 1.05rem;
    color: var(--heading);
  }
  .tail-lede {
    margin: 0.3rem 0 0;
    font-size: 0.85rem;
    line-height: 1.5;
    color: var(--faint);
  }
  .tail ul {
    margin: 0.7rem 0 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.35rem;
  }
  .tail a {
    font-size: 0.88rem;
    line-height: 1.4;
    color: var(--accent);
    text-decoration: none;
    overflow-wrap: anywhere;
  }

  .foot {
    margin: 1.8rem 0 0;
    padding-top: 0.8rem;
    border-top: 1px solid var(--edge);
    font-size: 0.78rem;
    line-height: 1.55;
    color: var(--faint);
  }

  @media (min-width: 1024px) {
    .cat {
      max-width: 64rem;
      padding: 2rem 1.5rem 4rem;
    }
    .hubs {
      grid-template-columns: 1fr 1fr;
    }
    .tail ul {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>

<!--
  ГОЛОВА ПУБЛИЧНОЙ СТРАНИЦЫ КАТАЛОГА — заголовок, описание, canonical, `hreflang`, открытый граф.
  Одна на три маршрута (индекс каталога и обе разновидности хаба): три копии блока `hreflang`
  разошлись бы молча, а цена расхождения здесь — игнорирование разметки целиком.

  ⛔ JSON-LD здесь СОЗНАТЕЛЬНО НЕТ. Структурированная разметка объекта живёт на карточке
  (`dim-jsonld.ts`), а `CollectionPage`/`ItemList` на хабе не даёт ни одного rich result —
  это был бы код, поставленный по привычке, ровно как `SearchAction` внутри `WebSite`
  (`researches/26` §7.2, тот же разбор).
-->
<script lang="ts">
  import type { PublicPage } from '$lib/content/catalog-view';

  let { data, ogType = 'website' }: { data: PublicPage; ogType?: string } = $props();
</script>

<svelte:head>
  <title>{data.metaTitle}</title>
  <meta name="description" content={data.metaDesc} />
  <link rel="canonical" href={data.canonical} />
  <!--
    Двусторонний `hreflang` С САМОССЫЛКОЙ. У Google односторонняя разметка не «работает хуже» —
    она игнорируется ЦЕЛИКОМ («If two pages don't both point to each other, the tags will be
    ignored»), то есть выглядит как сделанная работа и не даёт ничего (`researches/26` §4.1).
  -->
  {#each data.alternates as alt (alt.hreflang)}
    <link rel="alternate" hreflang={alt.hreflang} href={alt.href} />
  {/each}
  <meta property="og:type" content={ogType} />
  <meta property="og:title" content={data.metaTitle} />
  <meta property="og:description" content={data.metaDesc} />
  <meta property="og:url" content={data.canonical} />
  <meta property="og:locale" content={data.lang === 'en' ? 'en_US' : 'ru_RU'} />
</svelte:head>

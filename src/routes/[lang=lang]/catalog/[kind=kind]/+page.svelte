<!--
  Первая страница хаба. Вся разметка — в общем компоненте: у маршрутов `…/{kind}` и
  `…/{kind}/{page}` разные адреса, но одна страница (`plans/48` шаг 3).
-->
<script lang="ts">
  import CatalogHub from '$lib/ui/CatalogHub.svelte';
  import CatalogHead from '$lib/ui/CatalogHead.svelte';
  import type { HubPageView } from '$lib/content/catalog-view';

  let { data }: { data: HubPageView } = $props();
</script>

<CatalogHead {data} ogType="website" />
<CatalogHub {data} />

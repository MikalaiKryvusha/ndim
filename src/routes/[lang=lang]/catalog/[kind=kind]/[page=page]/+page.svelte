<!--
  Вторая и дальнейшие страницы хаба. Разметка та же, что у первой: маршрута два только потому,
  что у первой страницы адрес без номера (`plans/48` шаг 3).
-->
<script lang="ts">
  import CatalogHub from '$lib/ui/CatalogHub.svelte';
  import CatalogHead from '$lib/ui/CatalogHead.svelte';
  import type { HubPageView } from '$lib/content/catalog-view';

  let { data }: { data: HubPageView } = $props();
</script>

<CatalogHead {data} ogType="website" />
<CatalogHub {data} />

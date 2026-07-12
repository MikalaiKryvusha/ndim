<script lang="ts">
  /**
   * Лицо человека: фотография, если она есть, иначе — первая буква имени.
   *
   * Один компонент на все экраны, потому что фото — это не украшение профиля, а то, ради чего
   * на «Связи» вообще смотрят: там ищут ЧЕЛОВЕКА. Раньше и профиль, и связи рисовали кружок с
   * буквой каждый по-своему, а фотографии из 1.x не показывали вовсе (см. `data/avatar.ts`).
   *
   * За картинкой ходим ТОЛЬКО когда флаг `has` говорит, что она есть. Иначе список связей на
   * 250 человек устроил бы 250 заведомо пустых запросов в Storage.
   */
  import { avatarUrl } from '$lib/data/avatar';
  import type { Uid } from '$lib/model/schema';

  let {
    uid,
    name,
    has = false,
    size = 54,
  }: { uid: Uid; name: string; has?: boolean; size?: number } = $props();

  let src = $state<string | null>(null);

  $effect(() => {
    if (!has) {
      src = null;
      return;
    }
    let cancelled = false;
    void avatarUrl(uid).then((url) => {
      if (!cancelled) src = url;
    });
    return () => {
      cancelled = true;
    };
  });
</script>

{#if src}
  <img class="ava" {src} alt={name} style="--size:{size}px" />
{:else}
  <span class="ava" style="--size:{size}px">{name.slice(0, 1)}</span>
{/if}

<style>
  .ava {
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    background: var(--edge-soft);
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    color: var(--primary);
    /* буква масштабируется вместе с кружком — один компонент на разные размеры */
    font-size: calc(var(--size) * 0.37);
  }
  img.ava {
    /* лицо не должно растягиваться: кадрируем по кругу */
    object-fit: cover;
  }
</style>

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
   *
   * Тап по фотографии открывает её ВО ВЕСЬ ЭКРАН (bugs/14): лайтбокс-оверлей, закрывается
   * тапом в любом месте или Esc. Кружок с буквой не интерактивен — разворачивать нечего.
   */
  import { fade } from 'svelte/transition';
  import { avatarUrl } from '$lib/data/avatar';
  import { MOTION } from '$lib/ui/motion';
  import type { Uid } from '$lib/model/schema';

  let {
    uid,
    name,
    has = false,
    size = 54,
  }: { uid: Uid; name: string; has?: boolean; size?: number } = $props();

  let src = $state<string | null>(null);
  let open = $state(false);

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

<svelte:window
  onkeydown={(event) => {
    if (open && event.key === 'Escape') open = false;
  }}
/>

{#if src}
  <button type="button" class="peek" style="--size:{size}px" title={name} onclick={() => (open = true)}>
    <img class="ava" {src} alt={name} style="--size:{size}px" />
  </button>
  {#if open}
    <!-- Лайтбокс — сам кнопка «закрыть»: тап в любом месте сворачивает фото (bugs/14). -->
    <button
      type="button"
      class="lightbox"
      aria-label={name}
      transition:fade={{ duration: MOTION.base }}
      onclick={() => (open = false)}
    >
      <img {src} alt={name} />
    </button>
  {/if}
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

  /* Фото-кнопка: внешне тот же кружок, но с намёком «можно развернуть». */
  .peek {
    background: none;
    border: 0;
    padding: 0;
    flex: none;
    display: block;
    border-radius: 50%;
    cursor: zoom-in;
  }
  .peek .ava {
    display: block;
  }

  /* Полноэкранный просмотр. position: fixed выводит слой из любой раскладки. */
  .lightbox {
    position: fixed;
    inset: 0;
    z-index: 80;
    width: 100%;
    border: 0;
    padding: 20px;
    background: rgba(3, 8, 16, 0.88);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: zoom-out;
  }
  .lightbox img {
    max-width: min(92vw, 720px);
    max-height: 86vh;
    border-radius: 14px;
    object-fit: contain;
    box-shadow: 0 30px 90px rgba(0, 0, 0, 0.55);
  }
</style>

<script lang="ts" module>
  /** Счётчик экземпляров: каждому кружку — свой id слоя истории (см. `lightboxId` ниже). */
  let instances = 0;
</script>

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
   * тапом в любом месте, Esc — и системной кнопкой «Назад» (близнец bugs/76, см. ниже).
   * Кружок с буквой не интерактивен — разворачивать нечего.
   */
  import { pushState } from '$app/navigation';
  import { page } from '$app/state';
  import { fade } from 'svelte/transition';
  import { avatarUrl, cachedAvatarUrl } from '$lib/data/avatar';
  import { MOTION } from '$lib/ui/motion';
  import type { Uid } from '$lib/model/schema';

  let {
    uid,
    name,
    has = false,
    size = 54,
  }: { uid: Uid; name: string; has?: boolean; size?: number } = $props();

  /**
   * Канон 1.x — карточка появляется СРАЗУ с лицом (bugs/57): экран предзагружает лица до
   * отрисовки (`preloadAvatars`), поэтому первый рендер берёт готовый blob-URL из кэша
   * СИНХРОННО. Буква — только пока фото реально нет: не успело за потолок предзагрузки
   * (доедет фоном и встанет одним кадром — blob локален) или его нет вовсе.
   *
   * Захват НАЧАЛЬНОГО значения пропсов тут намеренный (нужен именно первый кадр);
   * реактивный путь — $effect ниже, он же обслуживает смену uid/has.
   */
  // svelte-ignore state_referenced_locally
  let src = $state<string | null>(has ? cachedAvatarUrl(uid) : null);

  /*
   * «НАЗАД» ЗАКРЫВАЕТ ЛАЙТБОКС (интервью №007, В12б; слово владельца: «навигация должна быть
   * честной, фиксим»). Близнец `bugs/76`: полноэкранный слой без записи в истории уводит
   * человека ИЗ ПРИЛОЖЕНИЯ вместо того, чтобы закрыться.
   *
   * Приём — тот же штатный `pushState` + `page.state`, что и у окна «Как меня видят»
   * (`profile/+page.svelte:76`), а не свой перехват `popstate`: адрес не меняется, слой
   * остаётся слоем, историю обслуживает настоящий роутер.
   *
   * Ключ в состоянии — id ЭТОГО кружка, а не «открыт/закрыт»: на «Связях» лиц много, и от
   * общего признака развернулись бы все сразу. Счётчик модуля даёт каждому экземпляру свой
   * id; на uid опираться нельзя — одно лицо бывает на странице дважды (свой аватар в
   * «Профиле» и он же внутри окна «Как меня видят»).
   *
   * Точка закрытия ОДНА — `history.back()`; тап и Escape зовут её же, поэтому состояние не
   * может разъехаться с историей.
   */
  const lightboxId = `ava-${(instances += 1)}`;
  const open = $derived(page.state.photo === lightboxId);

  /**
   * Портал: выносит лайтбокс в document.body (bugs/36). Внутри карточки ему жить нельзя:
   * у карточек есть transform (hover «Связей»), а трансформированный предок делает
   * position: fixed относительным СЕБЯ — фото открывалось «в карточке», обрезалось,
   * и соседние карточки рисовались поверх (z-index заперт в их stacking context).
   */
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  // Пока фото развёрнуто — страница под ним не прокручивается (bugs/36, полировка).
  $effect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  });

  function openPhoto(): void {
    pushState('', { photo: lightboxId });
  }

  function closePhoto(): void {
    if (open) history.back();
  }

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
    if (open && event.key === 'Escape') closePhoto();
  }}
/>

{#if src}
  <button type="button" class="peek" style="--size:{size}px" title={name} onclick={openPhoto}>
    <img class="ava" {src} alt={name} style="--size:{size}px" />
  </button>
  {#if open}
    <!-- Лайтбокс — сам кнопка «закрыть»: тап в любом месте сворачивает фото (bugs/14). -->
    <button
      type="button"
      class="lightbox"
      aria-label={name}
      use:portal
      transition:fade={{ duration: MOTION.base }}
      onclick={closePhoto}
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

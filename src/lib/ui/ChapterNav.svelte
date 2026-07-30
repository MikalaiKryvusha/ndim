<script lang="ts">
  /**
   * Плавающий пагинатор глав длинного документа (bugs/55, слово владельца: «сбоку справа
   * floating пагинатор глав, который свёрнутый занимает немного места, а развёрнутый
   * позволяет видеть названия глав и быстро к ним перемещаться»).
   *
   * Свёрнутый — узкая капсула из точек (по точке на главу, текущая подсвечена), прижата к
   * правому краю по центру высоты. Тап разворачивает панель с названиями глав и подглав;
   * тап по названию плавно везёт к якорю (id ставит DocBlocks), тап мимо или Esc сворачивает.
   *
   * Текущая глава выводится ИЗ ПРОКРУТКИ (последний заголовок выше трети экрана), а не
   * запоминается по кликам: человек, листающий руками, видит честную позицию.
   *
   * РАЗВЁРНУТУЮ ПАНЕЛЬ ЗАКРЫВАЕТ И СИСТЕМНАЯ «НАЗАД» (интервью №007, В12б; слово владельца:
   * «навигация должна быть честной, фиксим»). Близнец `bugs/76`: панель накрывает документ
   * подложкой на всю страницу, человек читает её как слой — и жмёт «Назад», а без записи в
   * истории это уводило со страницы руководства. Приём тот же штатный, что у окна «Как меня
   * видят»: `pushState` + `page.state` (`profile/+page.svelte:76`), без своего `popstate`.
   */
  import { pushState } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { MOTION } from '$lib/ui/motion';
  import type { Lang } from '$lib/ui/format';

  export interface Chapter {
    readonly id: string;
    readonly title: { readonly ru: string; readonly en: string };
    readonly level: 'h2' | 'h3';
  }

  let { chapters, lang }: { chapters: readonly Chapter[]; lang: Lang } = $props();

  /** Точка закрытия ОДНА — `history.back()`; её же зовут Esc, тап мимо и переход к главе. */
  const open = $derived(page.state.chapters === true);
  let active = $state<string>('');

  const label = { ru: 'Главы', en: 'Chapters' } as const;

  /** Главные точки свёрнутой капсулы — только главы (h2); подглавы видны в развёрнутом. */
  const majors = $derived(chapters.filter((chapter) => chapter.level === 'h2'));

  /** Активная ГЛАВА для капсулы: сама глава или та, чьей подглавой является активный якорь. */
  const activeMajor = $derived.by(() => {
    let current = '';
    for (const chapter of chapters) {
      if (chapter.level === 'h2') current = chapter.id;
      if (chapter.id === active) return current;
    }
    return current;
  });

  // Текущая глава — из прокрутки: последний заголовок, поднявшийся выше трети экрана.
  onMount(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const line = window.innerHeight * 0.34;
      let current = chapters[0]?.id ?? '';
      for (const chapter of chapters) {
        const top = document.getElementById(chapter.id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= line) current = chapter.id;
      }
      // У дна документа активна ПОСЛЕДНЯЯ глава: короткий финал («Напутствие») не набирает
      // высоты, чтобы его заголовок поднялся выше трети экрана, — а человек его уже читает.
      const bottom = window.scrollY + window.innerHeight;
      if (bottom >= document.documentElement.scrollHeight - 2) {
        current = chapters[chapters.length - 1]?.id ?? current;
      }
      active = current;
    };
    const queue = () => {
      if (raf === 0) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    return () => {
      window.removeEventListener('scroll', queue);
      window.removeEventListener('resize', queue);
      if (raf) cancelAnimationFrame(raf);
    };
  });

  function openPanel(): void {
    pushState('', { chapters: true });
  }

  function closePanel(): void {
    if (open) history.back();
  }

  /**
   * К какой главе едем, как только запись истории панели будет снята (`bugs/90`).
   *
   * ⚠️ ПОРЯДОК ЗДЕСЬ — ЭТО И ЕСТЬ ФИКС. Панель живёт записью истории (В12б), и закрывается она
   * системным `history.back()`, то есть **popstate**. А SvelteKit на popstate ВОЗВРАЩАЕТ
   * прокрутку той записи — ту, что была в момент открытия панели, обычно 0. Пока переход к
   * главе стоял ДО закрытия, платформа тут же отменяла его: панель схлопывалась, а человек
   * оставался на месте. Поймано стражем `verify-manual-v1` (12 провалов, замер: документ
   * 13 956px, `scrollY` после тапа — 0).
   *
   * Поэтому едем ПОСЛЕ навигации, в `afterNavigate`: он вызывается, когда платформа со своей
   * прокруткой уже закончила, и наш переход остаётся последним. Своего слушателя `popstate`
   * не заводим — это запрещено каноном `bugs/76` (самодельный роутер поверх штатного).
   */
  let pendingChapter: string | null = null;

  /**
   * Едем к главе, КОГДА ПАНЕЛЬ УЖЕ ЗАКРЫЛАСЬ, а не до этого.
   *
   * Порядок здесь — и есть весь фикс. Признак закрытия — `open` стало ложным, то есть запись
   * истории панели снята и SvelteKit со своей прокруткой уже отработал. Два кадра ожидания —
   * не суеверие: восстановление позиции платформой прилетает следующим кадром после popstate,
   * и переход, начатый раньше, она отменяет (замер: `scrollY` оставался 0 при документе
   * 13 956px).
   *
   * ⚠️ `afterNavigate` здесь НЕ подходит, и это проверено живым замером: на НЕГЛУБОКОМ
   * маршрутировании (`pushState` + `history.back()`) он не вызывается вовсе — сработал ровно
   * один раз, при монтировании. Свой слушатель `popstate` заводить нельзя (канон `bugs/76`:
   * самодельный роутер поверх штатного), поэтому слушаем состояние, а не событие.
   */
  $effect(() => {
    if (open || pendingChapter === null) return;
    const id = pendingChapter;
    pendingChapter = null;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        // Плавность слушает канон движения: при reduced-motion едем мгновенно, как MOTION.
        document.getElementById(id)?.scrollIntoView({ behavior: MOTION.base ? 'smooth' : 'auto', block: 'start' });
      }),
    );
  });

  function go(id: string): void {
    if (!open) {
      document.getElementById(id)?.scrollIntoView({ behavior: MOTION.base ? 'smooth' : 'auto', block: 'start' });
      return;
    }
    pendingChapter = id;
    closePanel();
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (open && event.key === 'Escape') closePanel();
  }}
/>

{#if open}
  <!-- Тап мимо панели сворачивает её (тот же жест, что у контекстных меню, волна 11). -->
  <button type="button" class="backdrop" aria-label={label[lang]} onclick={closePanel}></button>
  <nav class="panel" aria-label={label[lang]} transition:fade={{ duration: MOTION.fast }}>
    {#each chapters as chapter (chapter.id)}
      <button
        type="button"
        class="item {chapter.level}"
        class:on={chapter.id === active}
        onclick={() => go(chapter.id)}
      >
        {chapter.title[lang]}
      </button>
    {/each}
  </nav>
{:else}
  <button
    type="button"
    class="pager"
    aria-label={label[lang]}
    title={label[lang]}
    transition:fade={{ duration: MOTION.fast }}
    onclick={openPanel}
  >
    {#each majors as chapter (chapter.id)}
      <span class="dot" class:on={chapter.id === activeMajor}></span>
    {/each}
  </button>
{/if}

<style>
  /* Свёрнутая капсула: у правого края, по центру высоты, занимает считаные пиксели. */
  .pager {
    position: fixed; right: 8px; top: 50%; transform: translateY(-50%); z-index: 40;
    display: flex; flex-direction: column; gap: 8px; padding: 10px 7px;
    background: var(--panel-solid); border: 1px solid var(--edge); border-radius: 999px;
    box-shadow: var(--card-shadow); cursor: pointer;
  }
  .dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: color-mix(in srgb, var(--faint) 55%, transparent);
    transition: background var(--motion-fast) var(--motion-ease), transform var(--motion-fast) var(--motion-ease);
  }
  .dot.on { background: var(--primary); transform: scale(1.35); }

  .backdrop {
    position: fixed; inset: 0; z-index: 40;
    background: none; border: 0; cursor: default;
  }

  /* Развёрнутая панель: названия глав, подглавы — с отступом. */
  .panel {
    position: fixed; right: 8px; top: 50%; transform: translateY(-50%); z-index: 41;
    display: flex; flex-direction: column; gap: 1px;
    width: min(248px, 74vw); max-height: 72vh; overflow-y: auto;
    padding: 8px; background: var(--panel-solid); border: 1px solid var(--edge);
    border-radius: 14px; box-shadow: var(--card-shadow);
  }
  .item {
    font: inherit; font-size: 13px; text-align: left; color: var(--text);
    background: none; border: 0; border-radius: 8px; padding: 7px 10px; cursor: pointer;
    transition: background var(--motion-fast) var(--motion-ease), color var(--motion-fast) var(--motion-ease);
  }
  .item.h3 { padding-left: 24px; font-size: 12.5px; color: var(--dim); }
  @media (hover: hover) {
    .item:hover { background: color-mix(in srgb, var(--primary) 7%, transparent); }
  }
  .item.on { color: var(--primary); font-weight: 600; background: color-mix(in srgb, var(--primary) 9%, transparent); }
</style>

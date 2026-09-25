<!--
  ПАРА «ТЕМА + ЯЗЫК» — ОДНА НА ВСЕ ШАПКИ ПРОДУКТА.

  ПОВОД — слово владельца 2026-09-25, дословно: «какого хуя в разных местах переключатель темы и языка
  разный? почему дизайн схема и элементы не переиспользуете. а нахуй изобретаете велосипед каждый
  раз???». До этого компонента пара жила ПЯТЬЮ копиями: шапка приложения (`AppBar`), шапка
  публичных страниц (`PublicBar`), своя копия на странице теста, группа «RU/EN» с текстовой кнопкой
  темы на экране входа и пилюли на главной — и каждая выглядела и вела себя по-своему (на главной
  значок темы показывал даже не текущую тему, а целевую).

  ВИД — канон шапки приложения, слово владельца 2026-07-27: «кнопки в хедере сделаем… квадратные и
  без стрелочки в кнопке языка». Обе кнопки 34×34, радиус 10; выпадашка языка — непрозрачный фон
  (`bugs/23`), галочка у текущего языка (`bugs/39`: «как было в оригинальном NDim»).

  🔴 РАБОТАЕТ ДО ОЖИВЛЕНИЯ СТРАНИЦЫ И БЕЗ КЛИЕНТСКОГО JS — часть экранов объявлена `csr = false`:
    · значок темы переключают СТИЛИ по `html[data-theme]`: оба значка лежат в разметке, лишний
      прячет CSS — значит, значок верен с первого кадра и без единого байта бандла;
    · касание кнопки темы ловит делегированный слушатель инлайн-скрипта `app.html` по атрибуту
      `data-theme-toggle` — с первой строки страницы. Кнопка, которую оживил Svelte, помечена
      `data-live`: её переключает общий `toggleTheme` (`theme.svelte.ts`, `bugs/53`), а инлайн-слушатель
      её пропускает — одно касание, одно переключение. Прежде live-кнопка до оживления была мёртвой, и
      касание первых секунд терялось (находка dev-1 2026-09-25, ВС-17);
    · выпадашка языка — родной `<details>`: браузер открывает её сам, закрывает касанием мимо и Esc тот же
      инлайн-слушатель `app.html` — одинаково на страницах с JS и без.

  `mode` решает только одно: ставить ли `id="theme-toggle"` — адрес кнопки для приборов страниц без JS
  (`tools/verify-dim-page-header.mjs`). На экране пара одна, id не повторяется.

  ЯЗЫК — ДВА СПОСОБА СМЕНЫ:
    · `hrefFor(code)` — публичный адрес: язык = АДРЕС (`bugs/114`), пункт — ссылка с `hreflang`,
      робот и человек видят одно и то же; текущий язык — не ссылка;
    · `onLang(code)` — экраны за стеной входа, где адрес языка не несёт: пункт — кнопка.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { toggleTheme } from '$lib/ui/theme.svelte';
  import { LANGS, LANG_LABEL, type Lang } from '$lib/content/langs';

  let {
    lang,
    mode = 'live',
    hrefFor,
    onLang,
  }: {
    /** Язык, на котором сейчас показан экран. */
    lang: Lang;
    mode?: 'live' | 'static';
    /** Адрес того же материала на языке `code`; `null` — у языка нет своего адреса. */
    hrefFor?: ((code: Lang) => string | null) | undefined;
    onLang?: ((code: Lang) => void) | undefined;
  } = $props();

  const T = {
    ru: { theme: 'Тема', lang: 'Язык' },
    en: { theme: 'Theme', lang: 'Language' },
  } as const;
  const t = $derived(T[lang]);

  /** Подпись кнопки языка — код с заглавной: «Ru», «En» (канон `AppBar`). */
  const short = (code: Lang) => code.charAt(0).toUpperCase() + code.slice(1);

  /*
   * Открыта ли выпадашка — знает САМ `<details>`, копии в состоянии нет. `bind:open` при гидратации
   * записал бы в элемент своё `false` и захлопнул бы выпадашку, которую человек успел открыть до
   * оживления страницы (на пререндере браузер открывает `<details>` сам).
   */
  let wrap: HTMLDetailsElement | null = $state(null);

  /** Кнопка оживлена Svelte — с этой минуты тему переключает `toggleTheme`, инлайн-слушатель `app.html` молчит. */
  let live = $state(false);
  onMount(() => {
    live = true;
  });

  function close() {
    if (wrap) wrap.open = false;
  }

  function pick(code: Lang) {
    close();
    onLang?.(code);
  }
</script>

<div class="hc">
  <!-- Значок показывает ТЕКУЩУЮ тему (солнце = светлая), как строка «Тема» в «Меню». -->
  <button
    type="button"
    class="theme"
    id={mode === 'static' ? 'theme-toggle' : undefined}
    data-theme-toggle=""
    data-live={live ? '' : undefined}
    onclick={toggleTheme}
    title={t.theme}
    aria-label={t.theme}
  >
    <span class="ic sun"><Icon name="sun" size={15} /></span>
    <span class="ic moon"><Icon name="moon" size={15} /></span>
  </button>

  <details class="lang-wrap" bind:this={wrap}>
    <summary class="lang" title={t.lang} aria-label={t.lang} aria-haspopup="menu">{short(lang)}</summary>
    <div class="dd" role="menu">
      {#each LANGS as code (code)}
        {@const href = code === lang || !hrefFor ? null : hrefFor(code)}
        {#if href}
          <a class="it" role="menuitem" {href} hreflang={code} lang={code} onclick={close}>
            <span class="tick"></span>{LANG_LABEL[code]}
          </a>
        {:else if hrefFor}
          <span class="it" class:on={code === lang} role="menuitem" aria-current={code === lang ? 'true' : undefined} lang={code}>
            <span class="tick">{code === lang ? '✓' : ''}</span>{LANG_LABEL[code]}
          </span>
        {:else}
          <button type="button" class="it" class:on={code === lang} role="menuitem" lang={code} onclick={() => pick(code)}>
            <span class="tick">{code === lang ? '✓' : ''}</span>{LANG_LABEL[code]}
          </button>
        {/if}
      {/each}
    </div>
  </details>
</div>

<style>
  .hc {
    display: flex;
    align-items: center;
    gap: 9px;
    flex: none;
  }

  /* Размер один на обе кнопки, содержимое центрируется флексом — не базовой линией текста.
     Фон — непрозрачная панель, а не прозрачный: в шапке приложения под кнопками и так панель, а на главной
     шапка лежит прямо на градиенте, и прозрачный квадрат с бледной рамкой там почти исчезал (кадр 2026-09-25).
     С общим фоном пара выглядит одинаково на любой подложке. */
  .theme,
  .lang {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    padding: 0;
    flex: none;
    font: inherit;
    line-height: 1;
    cursor: pointer;
    color: var(--dim);
    background: var(--panel-solid, var(--panel));
    border: 1px solid var(--edge);
    border-radius: 10px;
    transition:
      color 0.15s ease,
      border-color 0.15s ease;
  }
  .lang {
    font-size: 12px;
    font-weight: 700;
    user-select: none;
  }
  /* Без стрелки (слово владельца 2026-07-27): маркер раскрытия у `summary` прячем во всех движках. */
  .lang {
    list-style: none;
  }
  .lang::-webkit-details-marker {
    display: none;
  }
  @media (hover: hover) {
    .theme:hover,
    .lang:hover {
      color: var(--primary);
      border-color: var(--primary);
    }
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

  .lang-wrap {
    position: relative;
    flex: none;
  }

  /* Выпадашка — по канону контекстных меню продукта: непрозрачный фон (`bugs/23`). */
  .dd {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 30;
    min-width: 130px;
    display: flex;
    flex-direction: column;
    padding: 4px;
    background: var(--panel-solid, var(--panel));
    border: 1px solid var(--edge);
    border-radius: 12px;
    box-shadow: var(--card-shadow);
  }
  /* Появление выпадашки — анимацией (планка владельца «анимации обязательны везде», `bugs/05–07`):
     короткий сдвиг сверху и проявление, токены движения продукта — при «уменьшить движение» они 0. */
  .lang-wrap[open] > .dd {
    animation: hc-dd-in var(--motion-fast) var(--motion-ease);
  }
  @keyframes hc-dd-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  .it {
    display: flex;
    align-items: center;
    gap: 7px;
    font: inherit;
    font-size: 13px;
    line-height: normal;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    color: var(--text);
    background: transparent;
    border: 0;
    border-radius: 8px;
    padding: 8px 10px;
    transition: background 0.15s ease;
  }
  span.it {
    cursor: default;
  }
  @media (hover: hover) {
    a.it:hover,
    button.it:hover {
      background: var(--edge-soft);
    }
  }
  .it.on {
    color: var(--heading);
    font-weight: 650;
  }
  .tick {
    width: 14px;
    color: var(--primary);
  }
</style>

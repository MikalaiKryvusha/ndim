<script lang="ts">
  // Шапка продукта: знак (Brand) + водмарк + переключатель темы + выпадающее меню языка.
  // Один компонент на все экраны 2.0; цвета — только из переменных темы.
  // badge — опциональная пунктирная пилюля (гостевой режим, plans/03: макет V1 «Тихий бейдж»).
  //
  // Язык — ВЫПАДАЮЩИМ меню, тема — кнопкой рядом (bugs/39, слово владельца: «как было в
  // оригинальном NDim» — в 1.x в правом верхнем углу жила кнопка «Ru» с выпадашкой).
  // Persist языка и темы (html-атрибут + localStorage) шапка делает сама: экраны получают
  // только колбэк onLang и держат своё состояние — семь одинаковых toggleLang им не нужны.
  //
  // Шапка приклеена к верху (bugs/34); фон — только непрозрачный токен (bugs/22).
  // На десктопе (от 1024px) знак и водмарк живут в рельсе SideRail — здесь прячутся,
  // чтобы бренд не двоился (макет V2 «Рабочий стол»).
  import Brand from '$lib/ui/Brand.svelte';
  import type { Lang } from '$lib/ui/format';

  let {
    lang,
    onLang,
    badge,
    onBadge,
  }: {
    lang: Lang;
    /** Вызывается ПОСЛЕ того, как шапка сохранила выбор (атрибут + localStorage). */
    onLang: (next: Lang) => void;
    // `| undefined` явно: у проекта exactOptionalPropertyTypes, а экраны передают
    // badge={guest ? ... : undefined}
    badge?: string | undefined;
    onBadge?: (() => void) | undefined;
  } = $props();

  let open = $state(false);
  let theme = $state<'light' | 'dark'>('light');

  // Тема читается из документа на клиенте ($effect не исполняется в пререндере).
  $effect(() => {
    theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  });

  function pickLang(next: Lang) {
    open = false;
    document.documentElement.setAttribute('lang', next);
    localStorage.setItem('ndim-lang', next);
    onLang(next);
  }

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ndim-theme', theme);
  }

  const LANGS: readonly Lang[] = ['ru', 'en'];
  const LANG_NAMES: Record<Lang, string> = { ru: 'Русский', en: 'English' };
</script>

<!-- Тап МИМО выпадашки или Esc закрывает её — как у контекстных меню продукта.
     Именно pointerdown вне .lang-wrap, а не click на window: клик по самой кнопке
     делегируется Svelte и закрыл бы меню тем же событием, которым открыл (гонка
     open→close за один клик — поймано QA-прогоном bugs/39). -->
<svelte:window
  onpointerdown={(event) => {
    if (open && !(event.target instanceof Element && event.target.closest('.lang-wrap'))) open = false;
  }}
  onkeydown={(event) => {
    if (open && event.key === 'Escape') open = false;
  }}
/>

<header class="bar">
  <span class="mark"><Brand size={26} /></span>
  <span class="wm">{lang === 'ru' ? 'Пространство NDim' : 'NDim Space'}</span>
  {#if badge}
    <button type="button" class="badge" onclick={onBadge}>◌ {badge}</button>
  {/if}
  <button type="button" class="theme" onclick={toggleTheme} title={lang === 'ru' ? 'Тема' : 'Theme'} aria-label={lang === 'ru' ? 'Тема' : 'Theme'}>
    {theme === 'dark' ? '☀' : '☾'}
  </button>
  <span class="lang-wrap">
    <button
      type="button"
      class="lang"
      aria-haspopup="menu"
      aria-expanded={open}
      onclick={() => (open = !open)}
    >
      {lang === 'ru' ? 'Ru' : 'En'} <span class="caret">▾</span>
    </button>
    {#if open}
      <div class="dd" role="menu">
        {#each LANGS as code (code)}
          <button type="button" role="menuitem" class:on={lang === code} onclick={() => pickLang(code)}>
            <span class="tick">{lang === code ? '✓' : ''}</span>{LANG_NAMES[code]}
          </button>
        {/each}
      </div>
    {/if}
  </span>
</header>

<style>
  .bar {
    display: flex; align-items: center; gap: 9px;
    padding: 14px 16px 12px; border-bottom: 1px solid var(--edge);
    /* Шапка приклеена к верху вьюпорта — канон 1.x (bugs/34, симметрично прибитой
       нижней панели bugs/12). Под ней едет контент, поэтому фон — только непрозрачный
       токен (bugs/22): обычный --panel в тёмной теме полупрозрачен по построению. */
    position: sticky; top: 0; z-index: 10;
    background: var(--panel-solid, var(--panel));
  }
  .wm { font-size: 15px; font-weight: 650; color: var(--heading); }

  /* Пара контролов справа: тема + язык (bugs/39). */
  .theme {
    margin-left: auto; font: inherit; font-size: 13px; cursor: pointer; line-height: 1;
    color: var(--dim); background: transparent; border: 1px solid var(--edge); border-radius: 8px;
    padding: 4px 8px;
    transition: color 0.15s ease, border-color 0.15s ease;
  }
  .theme:hover { color: var(--primary); border-color: var(--primary); }

  .lang-wrap { position: relative; }
  .lang {
    font: inherit; font-size: 11.5px; font-weight: 700; cursor: pointer;
    color: var(--dim); background: transparent; border: 1px solid var(--edge); border-radius: 8px; padding: 4px 9px;
    transition: color 0.15s ease, border-color 0.15s ease;
  }
  .lang:hover { color: var(--primary); border-color: var(--primary); }
  .caret { font-size: 9px; color: var(--faint); }

  /* Выпадашка — по канону контекстных меню продукта: непрозрачный фон (bugs/23). */
  .dd {
    position: absolute; right: 0; top: calc(100% + 6px); z-index: 30; min-width: 130px;
    display: flex; flex-direction: column; padding: 4px;
    background: var(--panel-solid, var(--panel)); border: 1px solid var(--edge); border-radius: 12px;
    box-shadow: var(--card-shadow);
  }
  .dd button {
    display: flex; align-items: center; gap: 7px;
    font: inherit; font-size: 13px; text-align: left; cursor: pointer;
    color: var(--text); background: transparent; border: 0; border-radius: 8px; padding: 8px 10px;
    transition: background 0.15s ease;
  }
  .dd button:hover { background: var(--edge-soft); }
  .dd button.on { color: var(--heading); font-weight: 650; }
  .tick { width: 14px; color: var(--primary); }

  /* Гость = пунктир (не сохранён, невидим другим) — метафора утверждённого макета V1. */
  .badge {
    margin-left: auto; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
    color: var(--accent); background: transparent;
    border: 1px dashed var(--accent); border-radius: 999px; padding: 4px 11px;
  }
  .badge ~ .theme { margin-left: 0; }

  /* Десктоп: бренд живёт в рельсе слева — в шапке он лишний.
     Сама шапка остаётся: в ней гостевой бейдж, тема и язык. */
  @media (min-width: 1024px) {
    .mark, .wm { display: none; }
    .bar { justify-content: flex-end; padding: 12px 26px; min-height: 52px; }
    .badge, .theme { margin-left: 0; }
  }
</style>

<script lang="ts">
  // Шапка продукта: знак (Brand) + водмарк + переключатель темы + выпадающее меню языка.
  // Один компонент на все экраны 2.0; цвета — только из переменных темы.
  // badge — опциональная пунктирная пилюля (гостевой режим, plans/03: макет V1 «Тихий бейдж»).
  //
  // Язык — ВЫПАДАЮЩИМ меню, тема — кнопкой рядом (bugs/39, слово владельца: «как было в
  // оригинальном NDim» — в 1.x в правом верхнем углу жила кнопка «Ru» с выпадашкой).
  //
  // 🔴 Язык и тема живут в ОБЩИХ модулях и пропсами сюда не передаются (`plans/39` шаг 1).
  // Раньше шапка принимала `lang` и колбэк `onLang`, а каждый из семи экранов держал свою
  // копию состояния — ровно то устройство, за которое проект уже заплатил дефектом `bugs/53`
  // на теме: две копии расходятся молча и в ту сторону, где сборка зелёная. Список языков
  // тоже общий (`$lib/content/langs`), чтобы третий язык добавлялся в одном месте.
  //
  // Шапка приклеена к верху (bugs/34); фон — только непрозрачный токен (bugs/22).
  //
  // На десктопе (от 1024px) шапка — ПЕРВАЯ строка сетки экрана ВО ВСЮ ШИРИНУ, поверх рельса:
  // макет V3-А, утверждён владельцем 2026-07-27 («Делаем V3 - A, без хлебной крошки»),
  // документ решения — ideas/17. Знак и водмарк живут ЗДЕСЬ (в рельсе их больше нет — бренд
  // не двоится), имени раздела в шапке НЕТ: открытую вкладку показывает синяя плашка рельса.
  // Приборная строка с метриками (V4) — план на будущее, в шапку сейчас не входит.
  import { goto } from '$app/navigation';
  import Brand from '$lib/ui/Brand.svelte';
  import HeadControls from '$lib/ui/HeadControls.svelte';
  import { observeBar } from '$lib/ui/barheight.svelte';
  import { lang, setLang } from '$lib/ui/lang.svelte';
  import { type Lang, swapLangInPath } from '$lib/content/langs';

  let {
    badge,
    onBadge,
  }: {
    // `| undefined` явно: у проекта exactOptionalPropertyTypes, а экраны передают
    // badge={guest ? ... : undefined}
    badge?: string | undefined;
    onBadge?: (() => void) | undefined;
  } = $props();

  /**
   * Шапка публикует свою высоту (`--bar-h` + общее число): от неё отсчитывают себя рельс
   * (начинается под шапкой, bugs/49) и панель «Измерений» (прилипает под шапкой, bugs/51).
   * Наблюдение ведёт САМА шапка по своему элементу — без поиска по классу в документе.
   */
  let barEl: HTMLElement | null = $state(null);
  $effect(() => {
    if (barEl === null) return;
    return observeBar(barEl);
  });

  // Тема НЕ хранится здесь: она в общем источнике `theme.svelte.ts` (bugs/53).
  // Своя копия состояния означала, что переключение темы из «Меню» шапка проспит —
  // ровно это и увидел владелец: «переключаю тему через Settings, кнопка в хедере
  // не переключается соответственно».

  // Атрибут `lang` документа и сохранение выбора делает общий модуль, выпадашку закрывает
  // сама пара `HeadControls`.
  //
  // 🔴 На ПУБЛИЧНОМ адресе (`/ru/menu/terms`) смена языка — это смена АДРЕСА (`plans/39`
  // шаг 2): у каждого языка своя страница, и подмена текста под старым адресом заставила бы
  // canonical и hreflang врать. За стеной входа адрес языка не несёт — там, как и раньше,
  // хватает памяти.
  function pickLang(next: Lang) {
    setLang(next);
    const swapped = swapLangInPath(location.pathname, next);
    if (swapped && swapped !== location.pathname) void goto(swapped + location.search + location.hash);
  }
</script>

<header class="bar" bind:this={barEl}>
  <!-- Знак ведёт на «Профиль», а НЕ на «/» (bugs/61, слово владельца: «нажимаю на главное
       лого — на мгновение мерцает лендинг, это тупо, ведь я уже в приложении»). Раньше эта
       ссылка жила в рельсе; вместе с брендом она переехала сюда, и теперь знак кликабелен
       и на телефоне, где до сих пор был мёртвым <span>. -->
  <a class="brand" href="/profile">
    <Brand size={26} />
    <span class="wm">{lang() === 'ru' ? 'Пространство NDim' : 'NDim Space'}</span>
  </a>
  {#if badge}
    <button type="button" class="badge" onclick={onBadge}>◌ {badge}</button>
  {/if}
  <!-- Тема и язык — ОБЩАЯ пара продукта (`HeadControls`): вид, размеры и поведение живут в одном
       месте на все пять шапок (слово владельца 2026-09-25 о «велосипеде каждый раз»). -->
  <div class="ctrls">
    <HeadControls lang={lang()} onLang={pickLang} />
  </div>
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
  /* Бренд — ссылка, но выглядит как заголовок: подчёркивания нет, цвет заголовочный. */
  .brand {
    display: flex; align-items: center; gap: 9px; flex: none;
    text-decoration: none; color: var(--heading);
  }
  .wm { font-size: 15px; font-weight: 650; color: var(--heading); }

  /* Пара «тема + язык» справа (bugs/39); её вид — в `HeadControls.svelte`. Здесь только место:
     без бейджа гостя пару прижимает вправо она сама, с бейджем — бейдж. */
  .ctrls { margin-left: auto; flex: none; }

  /* Гость = пунктир (не сохранён, невидим другим) — метафора утверждённого макета V1. */
  .badge {
    margin-left: auto; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
    color: var(--accent); background: transparent;
    border: 1px dashed var(--accent); border-radius: 999px; padding: 4px 11px;
  }
  .badge ~ .ctrls { margin-left: 0; }

  /* ── Десктоп: шапка ВО ВСЮ ШИРИНУ поверх рельса (макет V3-А, ideas/17) ──
     Шапка сама занимает первую строку сетки экрана на все её колонки — поэтому шести
     оболочкам продукта (/profile, /relations, /space, /dims, /menu, DocShell) не нужно
     знать об этой правке ни одной строкой: их сетка `232px minmax(0,1fr)` остаётся
     прежней, а рельс со своей стороны переезжает во вторую строку.

     Левое поле 24px не случайно: рельс имеет padding 12px, его пункты — ещё 12px,
     значит иконки навигации начинаются на 24px от края окна. Знак в шапке встаёт
     ровно над ними, по одной вертикали. */
  @media (min-width: 1024px) {
    .bar {
      grid-column: 1 / -1;
      grid-row: 1;
      padding: 10px 26px 10px 24px;
      min-height: 52px;
    }
  }
</style>

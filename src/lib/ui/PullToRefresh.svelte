<script lang="ts">
  /**
   * Жест «потянуть вниз, чтобы обновить» — макет V1 «Как в системе», утверждён владельцем
   * 2026-07-29 (`design/pull-to-refresh-mockups.html`, интервью №006).
   *
   * Форма взята из макета, а не придумана: круглый индикатор 34px под шапкой, стрелка
   * разворачивается на 180° при переходе порога, после отпускания стрелка уступает место
   * крутящемуся кольцу. Ноль новых элементов на самом экране — в покое компонент невидим.
   *
   * ── ЧТО ЗДЕСЬ ОТБИРАЕТСЯ У БРАУЗЕРА, А ЧТО НЕТ (развилка В2=А) ────────────────────────────
   * `overscroll-behavior-y: contain` забирает у браузера ТОЛЬКО его собственное обновление
   * страницы. Пружинящий отскок в конце списка остаётся браузерным — человек продолжает
   * чувствовать привычную физику платформы, а мы перехватываем ровно то, что нам нужно.
   * `none` забрал бы и отскок — владелец этого не выбрал.
   *
   * ⚠️ Свойство вешается на `html`, а не на контейнер: жест у ВЕРХНЕЙ ГРАНИЦЫ слушает
   * прокручиваемый корень документа, а у нас прокручивается именно он (экраны — обычный поток,
   * без своего скролл-контейнера).
   *
   * ── ЧЕГО ЗДЕСЬ СОЗНАТЕЛЬНО НЕТ ───────────────────────────────────────────────────────────
   * **Полотно экрана не едет вниз.** Двигается только индикатор — ровно как в Android
   * (Material SwipeRefreshLayout: содержимое стоит, круг выезжает). Это и есть «как в системе»,
   * названное владельцем. На iOS содержимое всё равно пружинит — но пружинит САМ браузер,
   * своей физикой, которую мы по В2=А не трогаем. Свой перенос полотна потребовал бы
   * трансформировать раскладку каждого экрана (на десктопе это сетка с рельсом) ради эффекта,
   * который платформа уже даёт бесплатно.
   *
   * **Нет самодельной физики для Safari младше 16** (развилка В3=А): где `overscroll-behavior`
   * не поддержан, компонент не вешает слушателей вовсе и рисует пустоту. Путь без жеста —
   * строка «Обновить данные» в «Меню» — работает везде и у всех.
   */
  import { onMount } from 'svelte';
  import { gestureSupported, refreshNow, refreshing } from '$lib/data/refresh.svelte';

  interface Props {
    /** Как перечитать этот экран. Экран передаёт свой же загрузчик из `onMount`. */
    onRefresh: () => Promise<void>;
  }

  const { onRefresh }: Props = $props();

  /**
   * Порог срабатывания — из макета: полотно уезжало на 64px, и именно там стрелка
   * разворачивалась вверх. Ниже порога отпускание не обновляет ничего.
   */
  const THRESHOLD = 64;
  /** Дальше тянуть бессмысленно — индикатор всё равно стоит на месте (как в системе). */
  const MAX_PULL = 96;
  /**
   * Сопротивление: палец проходит вдвое больший путь, чем индикатор. Без него жест
   * ощущается «приклеенным» к пальцу и срабатывает от случайного касания при прокрутке вверх.
   */
  const RESISTANCE = 0.5;

  /** Насколько вытянут индикатор прямо сейчас, px. */
  let pull = $state(0);
  /** Ведём ли жест: касание началось на самом верху и пошло вниз. */
  let tracking = false;
  /** Y пальца в начале жеста. */
  let startY = 0;
  /** Включён ли жест вообще (В3): в Safari младше 16 — нет. */
  let enabled = $state(false);

  /** Порог пройден — отпускание обновит. Отсюда же разворот стрелки. */
  const armed = $derived(pull >= THRESHOLD);
  /** Индикатор виден, пока тянут или пока идёт обновление. */
  const visible = $derived(pull > 0 || refreshing());

  /** Docs: страница прокручена в самый верх — только оттуда жест имеет смысл. */
  function atTop(): boolean {
    return (document.scrollingElement?.scrollTop ?? window.scrollY) <= 0;
  }

  function onTouchStart(event: TouchEvent): void {
    // Обновление уже идёт — второй жест не заводит второй круг чтений.
    if (refreshing() || event.touches.length !== 1 || !atTop()) return;
    startY = event.touches[0]!.clientY;
    tracking = true;
  }

  function onTouchMove(event: TouchEvent): void {
    if (!tracking) return;
    const delta = event.touches[0]!.clientY - startY;
    // Ушли вверх или человек прокрутил экран — жест отменяется, а не «продолжается с нуля».
    if (delta <= 0 || !atTop()) {
      tracking = false;
      pull = 0;
      return;
    }
    pull = Math.min(delta * RESISTANCE, MAX_PULL);
  }

  async function onTouchEnd(): Promise<void> {
    if (!tracking) return;
    tracking = false;
    const fire = armed;
    pull = 0;
    if (fire) await refreshNow(onRefresh);
  }

  onMount(() => {
    // Развилка В3=А: где жест отобрать нельзя, его нет вовсе — ни слушателей, ни разметки.
    if (!gestureSupported()) return;
    enabled = true;

    // В2=А: отбираем только обновление, отскок оставляем браузеру.
    const root = document.documentElement;
    const previous = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = 'contain';

    // `passive: true` — мы НЕ отменяем прокрутку (иначе отняли бы и отскок, и плавность):
    // жест только наблюдается. Браузер за это не штрафует задержкой прокрутки.
    const options = { passive: true } as const;
    window.addEventListener('touchstart', onTouchStart, options);
    window.addEventListener('touchmove', onTouchMove, options);
    window.addEventListener('touchend', onTouchEnd, options);
    window.addEventListener('touchcancel', onTouchEnd, options);

    return () => {
      root.style.overscrollBehaviorY = previous;
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  });
</script>

{#if enabled}
  <!-- Индикатор — вне потока, поверх экрана и ПОД шапкой: `--bar-h` публикует её высоту
       (`barheight.svelte.ts`), запасное значение 56px — высота шапки телефона. -->
  <div
    class="ptr"
    class:show={visible}
    style="--pull: {refreshing() ? THRESHOLD : pull}px"
    aria-hidden="true"
  >
    <div class="puck" class:armed class:spin={refreshing()}>
      {#if refreshing()}
        <span class="ring"></span>
      {:else}
        <span class="arrow">↓</span>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Дорожка индикатора: от низа шапки вниз. Кликов не ловит — жест идёт по всей странице. */
  .ptr {
    position: fixed;
    top: var(--bar-h, 56px);
    left: 0;
    right: 0;
    height: 0;
    z-index: 4; /* под шапкой (у неё выше), над содержимым экрана */
    pointer-events: none;
    display: flex;
    justify-content: center;
    opacity: 0;
  }
  .ptr.show { opacity: 1; }

  /* Круг 34px — размер из макета V1. Пока не тянут, он спрятан выше низа шапки. */
  .puck {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--panel);
    border: 1px solid var(--edge);
    box-shadow: var(--card-shadow);
    display: grid;
    place-items: center;
    color: var(--faint);
    /* -44px = высота круга + зазор: при нулевом вытягивании круга не видно вовсе. */
    transform: translateY(calc(var(--pull) - 44px));
    transition: color 0.15s ease, border-color 0.15s ease;
  }
  /* Порог пройден — круг «зажигается» цветом акцента, как в макете. */
  .puck.armed { color: var(--primary); border-color: var(--primary); }

  /* Стрелка: до порога вниз, после — вверх. Разворот и есть сигнал «отпускай». */
  .arrow {
    font-size: 15px;
    line-height: 1;
    transition: transform 0.18s ease;
  }
  .puck.armed .arrow { transform: rotate(180deg); }

  /* Отпустили — стрелка уступает место кольцу, пока идёт обновление (макет V1). */
  .ring {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid var(--edge);
    border-top-color: var(--primary);
    animation: ptr-spin 0.7s linear infinite;
  }
  @keyframes ptr-spin {
    to { transform: rotate(360deg); }
  }

  /* Правило владельца о движении не отменяет уважения к системной настройке: кому анимации
     противопоказаны, кольцо не крутится — состояние «идёт обновление» остаётся видимым цветом. */
  @media (prefers-reduced-motion: reduce) {
    .ring { animation: none; }
    .arrow { transition: none; }
  }
</style>

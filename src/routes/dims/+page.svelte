<script lang="ts">
  /**
   * Экран «Измерения» — ОТДЕЛЬНЫЙ раздел продукта (как было в 1.x).
   *
   * Макет: design/dims-mockups.html, **V1 «Дань уважения»** — утверждён владельцем 2026-07-12
   * с тремя правками:
   *   · тип контента — цветным бейджем (из V4);
   *   · звёзды — крупные (из V2);
   *   · заливка 0…N: выбрал N — сама N насыщенно-золотая, все до неё обычным золотом;
   *     ноль — серый. Ровно как в оригинальном NDim.
   *
   * И одно ОСОЗНАННОЕ ОТЛИЧИЕ от 1.x (решение владельца): кнопки «Сохранить» нет вовсе.
   * Выбрал звезду → пошёл обратный отсчёт 5 секунд → оценка сохраняется сама. Можно не ждать
   * («Сохранить сейчас»). По сохранению карточка УЕЗЖАЕТ ВПРАВО (как в 1.x), а внизу всплывает
   * «Отменить оценку» — вернуть карточку прямо отсюда, никуда не уходя.
   *
   * ЛЕНТА (researches/11): вкладка «Все» — это НЕ каталог, а очередь ЕЩЁ НЕ ОЦЕНЁННОГО в
   * СЛУЧАЙНОМ порядке, с подгрузкой по прокрутке. Оценил — ушло. Отменил — вернулось.
   * Алфавитный список из 5111 записей означал бы, что хвост каталога не увидит никто и никогда.
   *
   * ЭКОНОМИЯ ЗАПРОСОВ (принцип владельца): каталог целиком не читается НИКОГДА. Один документ
   * `dims/dims_list` даёт индекс всех 5111 измерений; полные карточки берём порциями по 12 и
   * кешируем. См. `data/dims.ts`.
   *
   * ОБОЛОЧКА И ДВИЖЕНИЕ (bugs/05, bugs/06): десктоп — канон V2 «Рабочий стол» (сетка
   * «рельс 232px + контент», лента в 2 колонки от 1024px), карточки — панельные токены темы
   * (--panel/--card-shadow), движение — переходы Svelte по канону MOTION (`$lib/ui/motion`).
   */
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { fade, fly, slide } from 'svelte/transition';

  import AppBar from '$lib/ui/AppBar.svelte';
  import BottomNav from '$lib/ui/BottomNav.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import SideRail from '$lib/ui/SideRail.svelte';
  import { currentSession, submitSuggestion } from '$lib/data/profile';
  import {
    feedWithRestored,
    loadDimCards,
    loadDimsScreen,
    loadMyRatings,
    removeRating,
    saveRating,
    PAGE_SIZE,
    type DimCard,
    type DimsScreenData,
  } from '$lib/data/dims';
  import { dimCardTitle, isNewDim, searchIndex, sortMyDims } from '$lib/model/feed';
  import { technicalDetail } from '$lib/ui/errors';
  import { votesUnit, type Lang } from '$lib/ui/format';
  import { MOTION } from '$lib/ui/motion';
  import type { Localized } from '$lib/model/schema';

  /** Сколько секунд человек может передумать, прежде чем оценка уедет в базу. */
  const COUNTDOWN_SECONDS = 5;

  type Tab = 'all' | 'mine';

  let lang = $state<Lang>('ru');
  let stand = $state<'connecting' | 'ready' | 'down' | 'signedout'>('connecting');
  let standError = $state('');

  let uid = $state<string | null>(null);
  let data = $state<DimsScreenData | null>(null);
  let ratings = $state<Map<string, number>>(new Map());

  let tab = $state<Tab>('all');
  let search = $state('');

  /** Очередь ещё не показанных id (вкладка «Все»). Из неё карточки достаются порциями. */
  let queue = $state<string[]>([]);
  /** Карточки, уже отрисованные на экране. */
  let shown = $state<DimCard[]>([]);
  let loadingMore = $state(false);
  let exhausted = $state(false);

  /** «Мой NDim ID» (bugs/18): свой кеш карточек и сколько позиций своего порядка раскрыто. */
  let mineCards = $state<Map<string, DimCard>>(new Map());
  let mineCount = $state(0);
  let mineLoading = $state(false);

  let expanded = $state<string | null>(null);
  let menuOpen = $state<string | null>(null);

  /** Оценка выбрана, но ещё не сохранена: идёт обратный отсчёт. */
  let pending = $state<{ dimId: string; value: number; left: number } | null>(null);
  let ticker: ReturnType<typeof setInterval> | null = null;

  /**
   * Оценённая карточка уезжает ВПРАВО (жест 1.x). Метка отличает этот уход от обычного
   * исчезновения (фильтр, смена вкладки): out-переход по ней выбирает большой сдвиг вправо.
   */
  let leaving = $state<string | null>(null);

  /** Поп-ап отмены: живёт, пока человек может передумать. */
  let undo = $state<{ dimId: string; name: string } | null>(null);
  let undoTimer: ReturnType<typeof setTimeout> | null = null;

  let sentinel: HTMLElement | null = $state(null);

  onMount(() => {
    const saved = localStorage.getItem('ndim-lang');
    if (saved === 'en' || saved === 'ru') lang = saved;

    void (async () => {
      try {
        const session = await currentSession();
        if (session === null) {
          stand = 'signedout';
          return;
        }
        uid = session;
        ratings = await loadMyRatings(session);
        data = await loadDimsScreen(session, ratings, lang);
        queue = [...data.feed];
        stand = 'ready';
        await loadMore();
      } catch (error) {
        standError = technicalDetail(error);
        stand = 'down';
      }
    })();

    return () => {
      if (ticker !== null) clearInterval(ticker);
      if (undoTimer !== null) clearTimeout(undoTimer);
    };
  });

  /**
   * Бесконечная подгрузка: как только «Загрузка» видна в окне — добираем следующую порцию.
   * Ровно так работал 1.x (`IntersectionObserver` + `allDimsLoader`).
   */
  $effect(() => {
    if (sentinel === null || stand !== 'ready' || search.trim() !== '') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (tab === 'all') void loadMore();
        else void loadMoreMine();
      },
      // Якорь срабатывает за ~600px ДО края экрана: догрузка происходит вне видимости,
      // и человек её не замечает — ровно как в 1.x (bugs/13).
      { rootMargin: '600px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  });

  async function loadMore(): Promise<void> {
    if (loadingMore || queue.length === 0) {
      if (queue.length === 0) exhausted = true;
      return;
    }
    loadingMore = true;
    try {
      const batch = queue.slice(0, PAGE_SIZE);
      queue = queue.slice(PAGE_SIZE);
      shown = [...shown, ...(await loadDimCards(batch))];
      if (queue.length === 0) exhausted = true;
    } finally {
      loadingMore = false;
    }
  }

  /** Догрузка «Мой NDim ID»: следующая порция СВОЕГО порядка (bugs/18). Карточки кешируются. */
  async function loadMoreMine(): Promise<void> {
    if (mineLoading || data === null || mineCount >= mineOrder.length) return;
    mineLoading = true;
    try {
      const portion = mineOrder.slice(mineCount, mineCount + PAGE_SIZE);
      const cards = await loadDimCards(portion);
      const merged = new Map(mineCards);
      for (const card of cards) merged.set(card.id, card);
      mineCards = merged;
      mineCount = Math.min(mineCount + PAGE_SIZE, mineOrder.length);
    } finally {
      mineLoading = false;
    }
  }

  // ── Оценка: выбор → отсчёт → сохранение → карточка уезжает → можно отменить ──────────────

  function pick(dimId: string, value: number): void {
    if (uid === null) return;

    // Передумал на другой карточке — прежний отсчёт отменяем: сохраняем только то, на что смотрят.
    stopCountdown();
    pending = { dimId, value, left: COUNTDOWN_SECONDS };

    ticker = setInterval(() => {
      if (pending === null) return;
      const left = pending.left - 1;
      if (left <= 0) {
        void commit();
        return;
      }
      pending = { ...pending, left };
    }, 1000);
  }

  function stopCountdown(): void {
    if (ticker !== null) clearInterval(ticker);
    ticker = null;
  }

  /** Сохраняет выбранную оценку. Вызывается и по истечении отсчёта, и по «Сохранить сейчас». */
  async function commit(): Promise<void> {
    if (pending === null || uid === null) return;
    const { dimId, value } = pending;

    stopCountdown();
    pending = null;

    try {
      await saveRating(uid, dimId, value);
    } catch (error) {
      standError = technicalDetail(error);
      return;
    }

    ratings = new Map(ratings).set(dimId, value);

    const card = shown.find((item) => item.id === dimId) ?? mineCards.get(dimId);

    // Оценённая карточка теперь живёт и во вкладке «Мой NDim ID» — кладём её в кеш вкладки,
    // чтобы она появилась там сразу; своё место она займёт по сортировке (bugs/18).
    if (card && !mineCards.has(dimId)) {
      const merged = new Map(mineCards);
      merged.set(dimId, card);
      mineCards = merged;
    }

    if (tab === 'all') {
      // Карточка уезжает вправо (как в 1.x): её везёт out-переход, а соседей плавно
      // подтягивает animate:flip — руками ничего не хронометрируем.
      leaving = dimId;
      shown = shown.filter((item) => item.id !== dimId);
      showUndo(dimId, card ? dimCardTitle(loc(card.title), card.year).name : '');
    }
    // Во вкладке «Мой NDim ID» карточка ОСТАЁТСЯ и переезжает по сортировке. Раньше смена
    // оценки отсюда ВЫКИДЫВАЛА карточку из вкладки, хотя оценка стояла (bugs/18, п. 4).
  }

  function showUndo(dimId: string, name: string): void {
    if (undoTimer !== null) clearTimeout(undoTimer);
    undo = { dimId, name };
    undoTimer = setTimeout(() => (undo = null), 7000);
  }

  /** Отмена оценки: убираем её из базы и ВОЗВРАЩАЕМ карточку в ленту — как было в 1.x. */
  async function cancelRating(): Promise<void> {
    if (undo === null || uid === null) return;
    const { dimId } = undo;
    undo = null;
    if (undoTimer !== null) clearTimeout(undoTimer);

    try {
      await removeRating(uid, dimId);
    } catch (error) {
      standError = technicalDetail(error);
      return;
    }

    const next = new Map(ratings);
    next.delete(dimId);
    ratings = next;
    leaving = null; // вернувшаяся карточка впредь уходит как обычная, а не «вправо»

    // Возвращаем измерение в начало очереди и сразу показываем — человек должен УВИДЕТЬ результат.
    queue = feedWithRestored(queue, dimId);
    exhausted = false;
    const [card] = await loadDimCards([dimId]);
    if (card) {
      shown = [card, ...shown.filter((item) => item.id !== dimId)];
      queue = queue.filter((id) => id !== dimId);
    }
  }

  // ── Показ ────────────────────────────────────────────────────────────────────────────────

  const loc = (value: Localized | undefined | null): string =>
    value ? (value[lang] ?? value.ru ?? value.en ?? '') : '';

  /**
   * Цвет бейджа типа. Тип — свободный текст из 1.x, поэтому раскрашиваем по СМЫСЛУ,
   * а незнакомое оставляем нейтральным: выдумывать цвет для неизвестного вида нельзя.
   */
  function typeKind(card: DimCard): string {
    const raw = (card.type?.ru ?? card.type?.en ?? '').toLowerCase();
    if (/фильм|сериал|мультф|film|movie|series/.test(raw)) return 'film';
    if (/роман|книг|повест|novel|book|поэ/.test(raw)) return 'book';
    if (/игр|game/.test(raw)) return 'game';
    if (/музык|альбом|песн|music|album|song/.test(raw)) return 'music';
    return 'other';
  }

  /**
   * Живой порядок «Мой NDim ID» — по убыванию своей оценки (bugs/18): считается из ТЕКУЩИХ
   * оценок функцией sortMyDims, а не из случайного порядка ленты «Все». Поэтому он не
   * «дрожит» между открытиями, а смена оценки переставляет карточку, не выкидывая её.
   */
  const mineOrder = $derived(data === null ? [] : sortMyDims(ratings, data.index, lang));

  /** Раскрытая часть «Мой NDim ID»: первые mineCount позиций порядка, уже загруженные. */
  const mineVisible = $derived(
    mineOrder
      .slice(0, mineCount)
      .map((id) => mineCards.get(id))
      .filter((card): card is DimCard => card !== undefined),
  );

  /** Карточки текущей вкладки. Поиск идёт по индексу и перебивает вкладку. */
  const visible = $derived.by((): DimCard[] => {
    if (data === null) return [];

    if (search.trim() !== '') {
      // Ищем среди уже загруженных карточек (обеих вкладок) — каталог целиком не читаем.
      const ids = new Set(searchIndex(data.index, search));
      const pool = new Map<string, DimCard>();
      for (const card of shown) pool.set(card.id, card);
      for (const [id, card] of mineCards) pool.set(id, card);
      return [...pool.values()].filter((card) => ids.has(card.id));
    }
    if (tab === 'mine') return mineVisible;
    return shown;
  });

  /**
   * Ключ контейнера ленты: вкладки и поиск рендерятся РАЗДЕЛЬНЫМИ списками (bugs/18).
   * Иначе animate:flip тянул общие карточки через весь экран при переключении вкладок —
   * та самая «пляска». Пересоздание контейнера мгновенно и локальных переходов не запускает.
   */
  const feedKey = $derived(search.trim() !== '' ? 'search' : tab);

  /** Сколько измерений человек оценил — цифра на вкладке. */
  const myCount = $derived(ratings.size);

  /**
   * Какая звезда сейчас «горит» на карточке: выбранная (ещё не сохранённая) или уже сохранённая.
   * `null` — не оценено, все звёзды пусты.
   */
  function starValue(dimId: string): number | null {
    if (pending?.dimId === dimId) return pending.value;
    return ratings.get(dimId) ?? null;
  }

  function openMyTab(): void {
    tab = 'mine';
    search = '';
    // Первую порцию тянем сразу: не ждём срабатывания якоря под пустой лентой.
    if (mineCount === 0) void loadMoreMine();
  }

  function toggleLang(): void {
    lang = lang === 'ru' ? 'en' : 'ru';
    document.documentElement.setAttribute('lang', lang);
    localStorage.setItem('ndim-lang', lang);
  }

  // ── Заявка на новое измерение ───────────────────────────────────────────────
  // Её место — здесь, рядом с каталогом (в 1.x это была лампочка 💡 на этом же экране),
  // а не в профиле, где она жила по недоразумению. Так Пространство растёт снизу.
  let suggestOpen = $state(false);
  let suggestText = $state('');
  let suggestState = $state<'idle' | 'sending' | 'sent'>('idle');

  async function sendSuggestion(): Promise<void> {
    if (uid === null || suggestState === 'sending') return;
    suggestState = 'sending';
    try {
      await submitSuggestion(uid, suggestText);
      suggestState = 'sent';
      suggestText = '';
      suggestOpen = false;
    } catch (error) {
      standError = technicalDetail(error);
      suggestState = 'idle';
    }
  }

  function webSearch(card: DimCard): void {
    const title = dimCardTitle(loc(card.title), card.year);
    const query = `${loc(card.type)} ${title.name} ${title.year ?? ''}`.trim();
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank', 'noopener');
  }

  const t = {
    title: { ru: 'Измерения', en: 'Dimensions' },
    connecting: { ru: 'Подключаюсь…', en: 'Connecting…' },
    standDown: {
      ru: 'Не удалось загрузить измерения. Обновите страницу — если не поможет, напишите в поддержку.',
      en: 'Could not load the dimensions. Reload the page — if that does not help, write to support.',
    },
    signedOut: {
      ru: 'Войдите, чтобы оценивать измерения и находить похожих людей.',
      en: 'Sign in to rate dimensions and find people similar to you.',
    },
    signIn: { ru: 'Войти', en: 'Sign in' },
    tabAll: { ru: 'Все', en: 'All' },
    tabMine: { ru: 'Мой NDim ID', en: 'My NDim ID' },
    searchPlaceholder: { ru: 'Найти измерение…', en: 'Search a dimension…' },
    loading: { ru: 'Загрузка', en: 'Loading' },
    allDone: {
      ru: 'Вы оценили все измерения Пространства. Это по-настоящему редкое достижение.',
      en: 'You have rated every dimension in the Space. That is a genuinely rare feat.',
    },
    mineEmpty: {
      ru: 'Вы ещё не оценили ни одного измерения. Перейдите на «Все» — и поставьте первые звёзды.',
      en: 'You have not rated anything yet. Open “All” and give your first stars.',
    },
    nothingFound: { ru: 'Ничего не нашлось. Попробуйте другое слово.', en: 'Nothing found. Try another word.' },
    isNew: { ru: 'Новое', en: 'New' },
    noVotes: { ru: 'ещё без голосов', en: 'no votes yet' },
    saveNow: { ru: 'Сохранить сейчас', en: 'Save now' },
    savingIn: { ru: 'Сохраню через', en: 'Saving in' },
    sec: { ru: 'с', en: 's' },
    saved: { ru: 'Оценка сохранена', en: 'Rating saved' },
    cancelRating: { ru: 'Отменить оценку', en: 'Undo rating' },
    description: { ru: 'Описание', en: 'Description' },
    author: { ru: 'Автор', en: 'Author' },
    year: { ru: 'Год', en: 'Year' },
    tags: { ru: 'Теги', en: 'Tags' },
    searchWeb: { ru: 'Искать в Интернете', en: 'Search the web' },
    removeRating: { ru: 'Убрать мою оценку', en: 'Remove my rating' },
    hint: {
      ru: 'Оценки видите только Вы. Из них складывается Ваш NDim ID — и по нему находятся похожие люди.',
      en: 'Only you see your ratings. They form your NDim ID — and people similar to you are found by it.',
    },
    suggest: { ru: '💡 Предложить новое измерение', en: '💡 Suggest a new dimension' },
    suggestTitle: { ru: 'Предложить новое измерение', en: 'Suggest a new dimension' },
    suggestHint: {
      ru: 'Что это за измерение и почему оно важно? От 5 до 300 символов.',
      en: 'What is this dimension and why does it matter? From 5 to 300 characters.',
    },
    suggestSend: { ru: 'Отправить', en: 'Send' },
    suggestSent: {
      ru: 'Спасибо! Заявка отправлена — так Пространство растёт снизу.',
      en: 'Thank you! Suggestion sent — this is how the Space grows bottom-up.',
    },
    suggestMore: { ru: 'Предложить ещё', en: 'Suggest another' },
    cancel: { ru: 'Отмена', en: 'Cancel' },
  } as const;
</script>

<svelte:head>
  <title>NDim Space — {t.title[lang]}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="screen">
  <SideRail active="dims" {lang} />
  <AppBar {lang} onToggleLang={toggleLang} />

  <main class="body">
    <h1 class="screen-title">{t.title[lang]}</h1>

    {#if stand === 'connecting'}
      <!-- Каноничная карточка загрузки 1.x вместо голого текста (bugs/21) -->
      <div class="state"><Loading {lang} /></div>
    {:else if stand === 'signedout'}
      <div class="card pad">
        <p class="state">{t.signedOut[lang]}</p>
        <a class="btn" href="/profile">{t.signIn[lang]}</a>
      </div>
    {:else if stand === 'down'}
      <div class="card pad">
        <p class="state">{t.standDown[lang]}</p>
        {#if standError}<p class="hint mono">{standError}</p>{/if}
      </div>
    {:else}
      <input class="search" type="search" placeholder={t.searchPlaceholder[lang]} bind:value={search} />

      <div class="segs" role="group">
        <button type="button" class:on={tab === 'all' && search.trim() === ''} onclick={() => { tab = 'all'; search = ''; }}>
          {t.tabAll[lang]}
        </button>
        <button type="button" class:on={tab === 'mine' && search.trim() === ''} onclick={openMyTab}>
          {t.tabMine[lang]} · {myCount}
        </button>
      </div>

      {#if visible.length === 0 && search.trim() !== ''}
        <div class="card pad" in:fade={{ duration: MOTION.base }}><p class="state">{t.nothingFound[lang]}</p></div>
      {:else if tab === 'mine' && myCount === 0 && search.trim() === ''}
        <!-- Пусто ИМЕННО потому, что оценок нет. Пока грузится первая порция, молчим:
             мигающая «пустота» на долю секунды — это и есть мерцание (bugs/18). -->
        <div class="card pad" in:fade={{ duration: MOTION.base }}><p class="state">{t.mineEmpty[lang]}</p></div>
      {/if}

      <!-- Вкладки и поиск — РАЗДЕЛЬНЫЕ списки (bugs/18): flip не тянет карточки между ними -->
      {#key feedKey}
      <div class="feed">
        {#each visible as card (card.id)}
          {@const mine = starValue(card.id)}
          {@const kind = typeKind(card)}
          {@const title = dimCardTitle(loc(card.title), card.year)}
          <article
            class="card dim"
            in:fly={{ y: 14, duration: MOTION.base, easing: cubicOut }}
            out:fly={leaving === card.id
              ? { x: 480, duration: MOTION.slow, easing: cubicOut }
              : { y: 8, duration: MOTION.fast }}
            animate:flip={{ duration: MOTION.slow, easing: cubicOut }}
          >
            <div class="top">
              <div class="titles">
                {#if card.type}<span class="tbadge {kind}">{loc(card.type)}</span>{/if}
                {#if isNewDim(card, Date.now())}
                  <span class="new">{t.isNew[lang]} 🔥</span>
                {/if}
                <button type="button" class="name" onclick={() => (expanded = expanded === card.id ? null : card.id)}>
                  «{title.name}»{#if title.year}<span class="year"> ({title.year})</span>{/if}
                </button>
              </div>

              <div class="menu">
                <button type="button" class="dots" aria-label="⋮" onclick={() => (menuOpen = menuOpen === card.id ? null : card.id)}>⋮</button>
                {#if menuOpen === card.id}
                  <div class="drop" transition:fade={{ duration: MOTION.fast }}>
                    <button type="button" onclick={() => { webSearch(card); menuOpen = null; }}>{t.searchWeb[lang]}</button>
                    {#if ratings.has(card.id)}
                      <button type="button" onclick={() => { showUndo(card.id, loc(card.title)); void cancelRating(); menuOpen = null; }}>
                        {t.removeRating[lang]}
                      </button>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>

            <!-- Рейтинг сообщества. Строка есть ВСЕГДА — карточки одной высоты (bugs/15);
                 у неоценённых — пустые звёзды и честное «ещё без голосов». -->
            <div class="rating">
              {#if card.rates > 0}
                <span class="rval">{card.rating}</span>
                <span class="rstars" aria-hidden="true">
                  {#each Array(10) as _, i (i)}<i class:lit={i < Math.round(card.rating)}>★</i>{/each}
                </span>
                <span class="rvotes">({card.rates} {votesUnit(card.rates, lang)})</span>
              {:else}
                <span class="rstars" aria-hidden="true">
                  {#each Array(10) as _, i (i)}<i>★</i>{/each}
                </span>
                <span class="rvotes">{t.noVotes[lang]}</span>
              {/if}
            </div>

            <!-- Одиннадцать звёзд 0…10: видны СВЁРНУТЫМИ. Это и есть жест оценки. -->
            <div class="stars" role="group">
              {#each Array(11) as _, value (value)}
                <button
                  type="button"
                  class="st"
                  class:fill={mine !== null && value <= mine}
                  class:peak={mine === value}
                  class:zero={mine === 0 && value === 0}
                  aria-label={String(value)}
                  onclick={() => pick(card.id, value)}
                >
                  <i>{mine !== null && value <= mine ? '★' : '☆'}</i><b>{value}</b>
                </button>
              {/each}
            </div>

            {#if pending?.dimId === card.id}
              <div class="countdown" transition:slide={{ duration: MOTION.fast }}>
                <span>{t.savingIn[lang]} {pending.left} {t.sec[lang]}…</span>
                <button type="button" class="now" onclick={() => void commit()}>{t.saveNow[lang]}</button>
              </div>
            {/if}

            {#if expanded === card.id}
              <div class="deep" transition:slide={{ duration: MOTION.base }}>
                {#if loc(card.description)}
                  <h4>{t.description[lang]}</h4><p>{loc(card.description)}</p>
                {/if}
                {#if loc(card.author)}<h4>{t.author[lang]}</h4><p>{loc(card.author)}</p>{/if}
                {#if card.year}<h4>{t.year[lang]}</h4><p>{card.year}</p>{/if}
                {#if card.tags && card.tags.length > 0}
                  <h4>{t.tags[lang]}</h4>
                  <div class="tags">{#each card.tags as tag (tag)}<span class="tag2">{tag}</span>{/each}</div>
                {/if}
              </div>
            {/if}
          </article>
        {/each}
      </div>
      {/key}

      {#if search.trim() === ''}
        <div class="loader" bind:this={sentinel}>
          {#if tab === 'mine'}
            {#if mineCount < mineOrder.length}{t.loading[lang]} <span class="spin">◠</span>{/if}
          {:else if exhausted && shown.length > 0 && queue.length === 0 && ratings.size > 0 && visible.length === 0}
            {t.allDone[lang]}
          {:else if !exhausted}
            {t.loading[lang]} <span class="spin">◠</span>
          {:else if queue.length === 0 && shown.length === 0}
            {t.allDone[lang]}
          {/if}
        </div>
      {/if}

      <!-- Заявка на новое измерение: так Пространство растёт снизу (в 1.x — лампочка на этом экране). -->
      {#if suggestState === 'sent'}
        <div class="card pad sug" transition:slide={{ duration: MOTION.base }}>
          <p class="ok">{t.suggestSent[lang]}</p>
          <button type="button" class="ghost" onclick={() => { suggestState = 'idle'; suggestOpen = true; }}>
            {t.suggestMore[lang]}
          </button>
        </div>
      {:else if suggestOpen}
        <div class="card pad sug" transition:slide={{ duration: MOTION.base }}>
          <h3>{t.suggestTitle[lang]}</h3>
          <textarea class="ta" bind:value={suggestText} placeholder={t.suggestHint[lang]} maxlength="300"></textarea>
          <p class="hint">{suggestText.trim().length} / 300</p>
          <div class="duo">
            <button type="button" class="ghost" onclick={() => (suggestOpen = false)}>{t.cancel[lang]}</button>
            <button
              type="button"
              class="now"
              disabled={suggestState === 'sending' || suggestText.trim().length < 5}
              onclick={() => void sendSuggestion()}
            >{t.suggestSend[lang]}</button>
          </div>
        </div>
      {:else}
        <button type="button" class="ghost wide" onclick={() => (suggestOpen = true)}>{t.suggest[lang]}</button>
      {/if}

      <p class="hint">{t.hint[lang]}</p>
    {/if}
  </main>

  {#if undo}
    <div class="toast" role="status" transition:fly={{ y: 12, duration: MOTION.base }}>
      <span>{t.saved[lang]}{#if undo.name}: «{undo.name}»{/if}</span>
      <button type="button" onclick={() => void cancelRating()}>{t.cancelRating[lang]}</button>
    </div>
  {/if}

  <BottomNav active="dims" {lang} />
</div>

<style>
  /* Оболочка — канон всех вкладок (см. space/+page.svelte): мобильная колонна 430px,
     от 1024px — сетка «рельс 232px + контент» (V2 «Рабочий стол»). Именно этой сетки
     здесь не было — рельс ложился СВЕРХУ во всю ширину (bugs/06). */
  .screen {
    min-height: 100vh; min-height: 100dvh;
    display: flex; flex-direction: column; background: var(--bg);
  }
  /* Оболочка во всю ширину, колонной зажат только контент (bugs/08.3).
     Нижний отступ 24px: прежние 96px — страховка времён ДО прибитой панели,
     теперь они давали мёртвую пустую зону в конце ленты (bugs/20). */
  .body {
    flex: 1; padding: 12px 14px 24px;
    width: 100%; max-width: 458px; margin: 0 auto; /* 430px контента + поля */
  }

  .screen-title { font-size: 19px; font-weight: 700; color: var(--heading); margin: 6px 0 12px; }
  .state { color: var(--dim); text-align: center; padding: 18px 8px; margin: 0; }
  .hint { color: var(--faint); font-size: 12px; margin: 14px 2px 0; }
  .mono { font-family: var(--mono); font-size: 11px; }
  /* Панельные токены темы, как у всех вкладок: токена --card в теме НЕТ, из-за него
     карточки стояли прозрачными (bugs/06). */
  .card {
    background: var(--panel); border: 1px solid var(--edge); border-radius: 14px;
    box-shadow: var(--card-shadow);
  }
  .pad { padding: 16px; }
  .btn {
    display: block; text-align: center; padding: 12px; margin-top: 10px; border-radius: 12px;
    font-size: 14px; font-weight: 600; background: var(--primary); color: var(--primary-ink);
    text-decoration: none;
  }

  .search {
    width: 100%; padding: 11px 14px; border-radius: 12px; background: var(--panel);
    border: 1px solid var(--edge); color: var(--text); font: inherit; margin-bottom: 10px;
    transition: border-color 0.15s ease;
  }
  .search:focus { outline: none; border-color: var(--primary); }

  .segs { display: flex; gap: 7px; margin-bottom: 12px; }
  .segs button {
    font: inherit; font-size: 13px; color: var(--dim); background: none;
    border: 1px solid var(--edge); border-radius: 999px; padding: 6px 14px; cursor: pointer;
    transition: background .16s ease, color .16s ease, border-color .16s ease;
  }
  .segs button.on { background: var(--primary); color: var(--primary-ink); border-color: var(--primary); }

  .feed { display: flex; flex-direction: column; gap: 12px; }

  /* Карточка. Уезд вправо и подтягивание соседей — переходы Svelte (fly + flip). */
  .dim {
    padding: 14px;
    transition: border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
  }
  .dim:hover {
    border-color: color-mix(in srgb, var(--primary) 30%, var(--edge));
    transform: translateY(-1px);
  }

  .top { display: flex; align-items: flex-start; gap: 8px; }
  .titles { flex: 1; min-width: 0; }

  .tbadge {
    display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: .05em;
    text-transform: uppercase; border-radius: 6px; padding: 2px 7px; margin: 0 6px 6px 0;
  }
  /* Цвета бейджей выводятся из оттенка через color-mix: прежние литералы были сняты с
     ТЁМНОГО макета и в светлой «Бумаге» (тема по умолчанию!) выглядели чужеродно. */
  .tbadge.film { background: color-mix(in srgb, #3b82f6 14%, transparent); color: color-mix(in srgb, #3b82f6 70%, var(--heading)); }
  .tbadge.book { background: color-mix(in srgb, #8b5cf6 14%, transparent); color: color-mix(in srgb, #8b5cf6 70%, var(--heading)); }
  .tbadge.game { background: color-mix(in srgb, #10b981 14%, transparent); color: color-mix(in srgb, #10b981 70%, var(--heading)); }
  .tbadge.music { background: color-mix(in srgb, #ec4899 14%, transparent); color: color-mix(in srgb, #ec4899 70%, var(--heading)); }
  .tbadge.other { background: var(--edge-soft); color: var(--dim); }

  .new {
    display: inline-block; font-size: 10px; border-radius: 999px; padding: 2px 7px;
    background: color-mix(in srgb, #f59e0b 14%, transparent);
    color: color-mix(in srgb, #f59e0b 62%, var(--heading));
    border: 1px solid color-mix(in srgb, #f59e0b 35%, transparent); margin-bottom: 6px;
  }

  .name {
    display: block; width: 100%; text-align: left; background: none; border: 0; padding: 0;
    font: inherit; font-weight: 650; font-size: 16px; color: var(--heading); cursor: pointer;
  }
  .name:hover { color: var(--primary); }
  .year { color: var(--faint); font-weight: 400; margin-left: 5px; }

  .menu { position: relative; }
  .dots {
    background: none; border: 0; color: var(--faint); font-size: 18px; cursor: pointer;
    padding: 0 4px; line-height: 1;
  }
  .dots:hover { color: var(--text); }
  .drop {
    position: absolute; right: 0; top: 24px; z-index: 5; min-width: 190px;
    /* Непрозрачный фон (bugs/23): сквозь полупрозрачное меню читался текст карточки. */
    background: var(--panel-solid, var(--panel)); border: 1px solid var(--edge); border-radius: 12px;
    padding: 5px; display: flex; flex-direction: column; box-shadow: var(--card-shadow);
  }
  .drop button {
    background: none; border: 0; color: var(--text); font: inherit; font-size: 13px;
    text-align: left; padding: 8px 10px; border-radius: 8px; cursor: pointer;
  }
  .drop button:hover { background: var(--edge-soft); }

  /* min-height = высота строки С КРУПНОЙ ЦИФРОЙ (.rval, 21px/800): без неё вариант
     «ещё без голосов» был на 7px ниже, и карточки шли вразнобой (bugs/15). */
  .rating { display: flex; align-items: center; gap: 9px; margin-top: 8px; min-height: 26px; }
  /* line-height: 1 — иначе строка крупной цифры выше строки «ещё без голосов» (bugs/15). */
  .rval { font-size: 21px; font-weight: 800; color: var(--up, #22c55e); letter-spacing: -.5px; line-height: 1; }
  /* Пустые звёзды: --edge в светлой «Бумаге» почти белый — берём приглушённый общий тон. */
  .rstars i { font-style: normal; font-size: 12px; color: color-mix(in srgb, var(--faint) 45%, transparent); }
  .rstars i.lit { color: #f5a524; }
  .rvotes { color: var(--faint); font-size: 12px; }

  /* Крупные звёзды (правка владельца: «звёзды большие как в v2»). */
  .stars { display: flex; gap: 3px; margin-top: 12px; }
  .st {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 1px;
    background: none; border: 0; cursor: pointer; border-radius: 9px; padding: 4px 0;
    transition: background .15s ease, transform .12s ease;
  }
  .st:hover { background: var(--edge-soft); transform: translateY(-2px); }
  .st i {
    font-style: normal; font-size: 27px; line-height: 1;
    color: color-mix(in srgb, var(--faint) 55%, transparent);
    transition: color .15s ease, transform .15s ease, filter .15s ease;
  }
  .st b { font-size: 10px; font-weight: 600; color: var(--faint); transition: color .15s ease; }

  /* Заливка 0…N: выбранная и все до неё. Правка владельца, как в оригинальном NDim. */
  .st.fill i { color: #f5a524; }
  .st.fill b { color: #f5a524; }
  /* Сама выбранная — насыщенное золото и лёгкое свечение. */
  .st.peak i { color: #ffc247; filter: drop-shadow(0 0 6px rgba(255, 194, 71, .45)); transform: scale(1.12); }
  .st.peak b { color: #ffc247; }
  /* Ноль — это осознанная оценка «ноль», а не «золото». Он серый. */
  .st.zero i { color: var(--faint); filter: none; transform: scale(1.08); }
  .st.zero b { color: var(--faint); }

  .countdown {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--edge-soft);
    color: var(--dim); font-size: 13px;
  }
  .now {
    background: var(--primary); border: 0; color: var(--primary-ink); font: inherit; font-size: 13px;
    border-radius: 999px; padding: 6px 14px; cursor: pointer;
  }

  .deep {
    margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--edge-soft);
    color: var(--dim); font-size: 13px;
  }
  .deep h4 {
    margin: 0 0 3px; color: var(--text); font-size: 11px; text-transform: uppercase;
    letter-spacing: .06em;
  }
  .deep p { margin: 0 0 9px; }
  .tags { display: flex; flex-wrap: wrap; gap: 5px; }
  .tag2 {
    font-size: 11px; color: var(--dim); background: var(--edge-soft);
    border-radius: 999px; padding: 2px 8px;
  }

  /* Заявка на новое измерение */
  .sug { margin-top: 14px; }
  .sug h3 { margin: 0 0 8px; font-size: 14px; color: var(--heading); }
  .sug .ok { color: #22c55e; font-size: 13px; margin: 0 0 10px; }
  .ta {
    width: 100%; min-height: 72px; resize: vertical; padding: 10px 12px; border-radius: 12px;
    background: var(--bg); border: 1px solid var(--edge-soft); color: var(--text); font: inherit;
    font-size: 14px;
  }
  .ta:focus { outline: none; border-color: var(--primary); }
  .duo { display: flex; gap: 8px; margin-top: 8px; }
  .duo > * { flex: 1; }
  .ghost {
    background: transparent; border: 1px solid var(--edge); color: var(--dim); font: inherit;
    font-size: 13px; border-radius: 999px; padding: 9px 16px; cursor: pointer;
    transition: border-color .15s ease, color .15s ease;
  }
  .ghost:hover { border-color: var(--primary); color: var(--primary); }
  .ghost.wide { display: block; width: 100%; margin-top: 14px; }
  .now:disabled { opacity: .5; cursor: default; }

  .loader { text-align: center; color: var(--faint); font-size: 13px; padding: 20px 0; }
  .spin { display: inline-block; animation: spin 1.1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Поп-ап отмены — «чтобы можно было отменить оценивание и вернуть карточку» (владелец).
     Центрируется полями, а не transform: transform анимирует Svelte-переход fly. */
  .toast {
    position: fixed; left: 14px; right: 14px; bottom: 84px; margin: 0 auto; width: fit-content;
    z-index: 30; display: flex; align-items: center; gap: 14px; max-width: calc(100vw - 28px);
    /* Плавающий слой — непрозрачный, как меню и панель (bugs/22, 23). */
    background: var(--panel-solid, var(--panel)); border: 1px solid var(--edge); border-radius: 999px;
    padding: 9px 9px 9px 16px; color: var(--text); font-size: 13px;
    box-shadow: var(--card-shadow);
  }
  .toast button {
    background: none; border: 1px solid var(--primary); color: var(--primary); font: inherit;
    font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer; white-space: nowrap;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .toast button:hover { background: var(--primary); color: var(--primary-ink); }

  /* ── Десктоп: V2 «Рабочий стол», как у остальных вкладок. Медиа-блок стоит В КОНЦЕ
     таблицы стилей осознанно: при равной специфичности выигрывает последнее правило,
     и мобильные значения выше его бы перебили (EXP-0026). ── */
  @media (min-width: 1024px) {
    .screen {
      max-width: none;
      display: grid;
      grid-template-columns: 232px minmax(0, 1fr);
      grid-template-rows: auto 1fr;
    }
    .body {
      width: 100%;
      max-width: 1280px;
      margin: 0 auto;
      padding: 20px 26px 34px;
    }
    /* Лента — в две колонки: карточка остаётся карточкой, а не полосой во всю панель.
       align-items: start — раскрытая карточка не растягивает соседку по ряду. */
    .feed {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
    }
    .toast { bottom: 28px; }
  }
</style>

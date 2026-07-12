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
   */
  import { onMount } from 'svelte';

  import AppBar from '$lib/ui/AppBar.svelte';
  import BottomNav from '$lib/ui/BottomNav.svelte';
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
  import { isNewDim, searchIndex } from '$lib/model/feed';
  import { technicalDetail } from '$lib/ui/errors';
  import { votesUnit, type Lang } from '$lib/ui/format';
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

  let expanded = $state<string | null>(null);
  let menuOpen = $state<string | null>(null);

  /** Оценка выбрана, но ещё не сохранена: идёт обратный отсчёт. */
  let pending = $state<{ dimId: string; value: number; left: number } | null>(null);
  let ticker: ReturnType<typeof setInterval> | null = null;

  /** Карточка, уезжающая вправо после сохранения (её анимация не должна дёргать список). */
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
    if (sentinel === null || stand !== 'ready' || tab !== 'all' || search.trim() !== '') return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void loadMore();
    });
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

    // Карточка уезжает вправо (как в 1.x) — и только ПОСЛЕ анимации покидает список,
    // иначе соседние карточки прыгнули бы вверх на полпути.
    const card = shown.find((item) => item.id === dimId);
    leaving = dimId;
    setTimeout(() => {
      shown = shown.filter((item) => item.id !== dimId);
      leaving = null;
    }, 320);

    showUndo(dimId, card ? loc(card.title) : '');
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

  /** Карточки текущей вкладки. Поиск идёт по индексу и перебивает вкладку. */
  const visible = $derived.by((): DimCard[] => {
    if (data === null) return [];

    if (search.trim() !== '') {
      const ids = new Set(searchIndex(data.index, search));
      return shown.filter((card) => ids.has(card.id));
    }
    if (tab === 'mine') return shown.filter((card) => ratings.has(card.id));
    return shown;
  });

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

  async function openMyTab(): Promise<void> {
    tab = 'mine';
    if (data === null) return;
    // Свои карточки могли ещё не попасть в `shown` (их не показывали в ленте) — добираем.
    const missing = data.mine.filter((id) => !shown.some((card) => card.id === id));
    if (missing.length > 0) shown = [...shown, ...(await loadDimCards(missing.slice(0, 60)))];
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
    const query = `${loc(card.type)} ${loc(card.title)} ${card.year ?? ''}`.trim();
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
      <p class="state">{t.connecting[lang]}</p>
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
        <button type="button" class:on={tab === 'mine' && search.trim() === ''} onclick={() => void openMyTab()}>
          {t.tabMine[lang]} · {myCount}
        </button>
      </div>

      {#if visible.length === 0 && search.trim() !== ''}
        <div class="card pad"><p class="state">{t.nothingFound[lang]}</p></div>
      {:else if visible.length === 0 && tab === 'mine'}
        <div class="card pad"><p class="state">{t.mineEmpty[lang]}</p></div>
      {/if}

      <div class="feed">
        {#each visible as card (card.id)}
          {@const mine = starValue(card.id)}
          {@const kind = typeKind(card)}
          <article class="card dim" class:leaving={leaving === card.id}>
            <div class="top">
              <div class="titles">
                {#if card.type}<span class="tbadge {kind}">{loc(card.type)}</span>{/if}
                {#if isNewDim(card, Date.now())}
                  <span class="new">{t.isNew[lang]} 🔥</span>
                {/if}
                <button type="button" class="name" onclick={() => (expanded = expanded === card.id ? null : card.id)}>
                  «{loc(card.title)}»{#if card.year}<span class="year"> ({card.year})</span>{/if}
                </button>
              </div>

              <div class="menu">
                <button type="button" class="dots" aria-label="⋮" onclick={() => (menuOpen = menuOpen === card.id ? null : card.id)}>⋮</button>
                {#if menuOpen === card.id}
                  <div class="drop">
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

            <!-- Рейтинг сообщества. Голосов нет — строки нет вовсе (как в 1.x). -->
            {#if card.rates > 0}
              <div class="rating">
                <span class="rval">{card.rating}</span>
                <span class="rstars" aria-hidden="true">
                  {#each Array(10) as _, i (i)}<i class:lit={i < Math.round(card.rating)}>★</i>{/each}
                </span>
                <span class="rvotes">({card.rates} {votesUnit(card.rates, lang)})</span>
              </div>
            {/if}

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
              <div class="countdown">
                <span>{t.savingIn[lang]} {pending.left} {t.sec[lang]}…</span>
                <button type="button" class="now" onclick={() => void commit()}>{t.saveNow[lang]}</button>
              </div>
            {/if}

            {#if expanded === card.id}
              <div class="deep">
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

      {#if tab === 'all' && search.trim() === ''}
        <div class="loader" bind:this={sentinel}>
          {#if exhausted && shown.length > 0 && queue.length === 0 && ratings.size > 0 && visible.length === 0}
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
        <div class="card pad sug">
          <p class="ok">{t.suggestSent[lang]}</p>
          <button type="button" class="ghost" onclick={() => { suggestState = 'idle'; suggestOpen = true; }}>
            {t.suggestMore[lang]}
          </button>
        </div>
      {:else if suggestOpen}
        <div class="card pad sug">
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
    <div class="toast" role="status">
      <span>{t.saved[lang]}{#if undo.name}: «{undo.name}»{/if}</span>
      <button type="button" onclick={() => void cancelRating()}>{t.cancelRating[lang]}</button>
    </div>
  {/if}

  <BottomNav active="dims" {lang} />
</div>

<style>
  .screen { min-height: 100dvh; background: var(--bg); }
  .body { max-width: 760px; margin: 0 auto; padding: 12px 14px 96px; }
  @media (min-width: 1024px) { .body { max-width: 1100px; padding-left: 26px; } }

  .screen-title { font-size: 22px; color: var(--heading); margin: 6px 0 12px; }
  .state { color: var(--dim); text-align: center; padding: 18px 8px; margin: 0; }
  .hint { color: var(--faint); font-size: 12px; margin: 14px 2px 0; }
  .mono { font-family: ui-monospace, monospace; font-size: 11px; }
  .card { background: var(--card); border: 1px solid var(--edge-soft); border-radius: 16px; }
  .pad { padding: 16px; }
  .btn {
    display: block; text-align: center; padding: 10px; border-radius: 12px;
    border: 1px solid var(--primary); color: var(--primary); text-decoration: none;
  }

  .search {
    width: 100%; padding: 11px 14px; border-radius: 12px; background: var(--card);
    border: 1px solid var(--edge-soft); color: var(--text); font: inherit; margin-bottom: 10px;
  }
  .search:focus { outline: none; border-color: var(--primary); }

  .segs { display: flex; gap: 7px; margin-bottom: 12px; }
  .segs button {
    font: inherit; font-size: 13px; color: var(--dim); background: none;
    border: 1px solid var(--edge); border-radius: 999px; padding: 6px 14px; cursor: pointer;
    transition: background .16s ease, color .16s ease, border-color .16s ease;
  }
  .segs button.on { background: var(--primary); color: #fff; border-color: var(--primary); }

  .feed { display: flex; flex-direction: column; gap: 12px; }

  /* Карточка. Уезжает ВПРАВО после сохранения — как в оригинальном NDim. */
  .dim {
    padding: 14px;
    transition: transform .3s cubic-bezier(.4, 0, .2, 1), opacity .3s ease, border-color .18s ease;
  }
  .dim:hover { border-color: var(--edge); }
  .dim.leaving { transform: translateX(115%); opacity: 0; }

  .top { display: flex; align-items: flex-start; gap: 8px; }
  .titles { flex: 1; min-width: 0; }

  .tbadge {
    display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: .05em;
    text-transform: uppercase; border-radius: 6px; padding: 2px 7px; margin: 0 6px 6px 0;
  }
  .tbadge.film { background: #1d2f4d; color: #7db3ff; }
  .tbadge.book { background: #2b2440; color: #c4a6ff; }
  .tbadge.game { background: #143a33; color: #5fe3c0; }
  .tbadge.music { background: #3d2436; color: #ff9ecb; }
  .tbadge.other { background: var(--edge-soft); color: var(--dim); }

  .new {
    display: inline-block; font-size: 10px; border-radius: 999px; padding: 2px 7px;
    background: #3a2a12; color: #ffd7a1; border: 1px solid #5b4118; margin-bottom: 6px;
  }

  .name {
    display: block; width: 100%; text-align: left; background: none; border: 0; padding: 0;
    font: inherit; font-weight: 650; font-size: 16px; color: var(--heading); cursor: pointer;
  }
  .name:hover { color: var(--primary); }
  .year { color: var(--faint); font-weight: 400; }

  .menu { position: relative; }
  .dots {
    background: none; border: 0; color: var(--faint); font-size: 18px; cursor: pointer;
    padding: 0 4px; line-height: 1;
  }
  .dots:hover { color: var(--text); }
  .drop {
    position: absolute; right: 0; top: 24px; z-index: 5; min-width: 190px;
    background: var(--card2, var(--card)); border: 1px solid var(--edge); border-radius: 12px;
    padding: 5px; display: flex; flex-direction: column;
  }
  .drop button {
    background: none; border: 0; color: var(--text); font: inherit; font-size: 13px;
    text-align: left; padding: 8px 10px; border-radius: 8px; cursor: pointer;
  }
  .drop button:hover { background: var(--edge-soft); }

  .rating { display: flex; align-items: center; gap: 9px; margin-top: 8px; }
  .rval { font-size: 21px; font-weight: 800; color: var(--up, #22c55e); letter-spacing: -.5px; }
  .rstars i { font-style: normal; font-size: 12px; color: var(--edge); }
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
    font-style: normal; font-size: 27px; line-height: 1; color: var(--edge);
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
    background: var(--primary); border: 0; color: #fff; font: inherit; font-size: 13px;
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

  /* Поп-ап отмены — «чтобы можно было отменить оценивание и вернуть карточку» (владелец). */
  .toast {
    position: fixed; left: 50%; bottom: 84px; transform: translateX(-50%); z-index: 30;
    display: flex; align-items: center; gap: 14px; max-width: calc(100vw - 28px);
    background: var(--card); border: 1px solid var(--edge); border-radius: 999px;
    padding: 9px 9px 9px 16px; color: var(--text); font-size: 13px;
    box-shadow: 0 18px 40px -20px #000;
    animation: rise .22s cubic-bezier(.4, 0, .2, 1);
  }
  .toast button {
    background: none; border: 1px solid var(--primary); color: var(--primary); font: inherit;
    font-size: 13px; border-radius: 999px; padding: 6px 14px; cursor: pointer; white-space: nowrap;
  }
  .toast button:hover { background: var(--primary); color: #fff; }
  @keyframes rise { from { opacity: 0; transform: translate(-50%, 12px); } }
  @media (min-width: 1024px) { .toast { bottom: 28px; } }
</style>

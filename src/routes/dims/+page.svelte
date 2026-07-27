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
  import { onMount, tick } from 'svelte';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { fade, fly, slide } from 'svelte/transition';

  import AppBar from '$lib/ui/AppBar.svelte';
  import BottomNav from '$lib/ui/BottomNav.svelte';
  import Icon from '$lib/ui/Icon.svelte';
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
  import {
    dimCardTitle,
    isNewDim,
    searchIndex,
    SEARCH_RESULT_LIMIT,
    sortMyDims,
    type DimsIndex,
  } from '$lib/model/feed';
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

  /**
   * ПОИСК ПО ВСЕМУ ПРОСТРАНСТВУ (bugs/50).
   *
   * Ищем по индексу `dims_list` (все 5111 измерений) и ДОГРУЖАЕМ найденное из базы —
   * ровно как `doSearchDims` в 1.x. Раньше результат индекса использовался лишь как фильтр
   * по карточкам, уже лежащим на экране, и человек не находил измерение, которое ЕСТЬ:
   * «словно оно ищет только в том скоупе, который подгружен в браузере» (слово владельца).
   *
   * Экономия запросов при этом не нарушена: читаем не каталог, а ≤20 найденных документов,
   * и только когда человек действительно ищет. Прочитанное оседает в кеше `data/dims.ts`.
   */
  let searchCards = $state<DimCard[]>([]);
  /** Сколько всего совпадений в каталоге — чтобы честно сказать «показаны первые 20». */
  let searchTotal = $state(0);
  /**
   * Идёт ли поиск прямо сейчас. Он же отвечает на вопрос «поиск ЗАВЕРШЁН?»: пока `searchBusy`
   * истинен, экран показывает кольцо загрузки, и «Ничего не найдено» физически не может
   * появиться во время загрузки — а именно этим витрина и врала бы.
   */
  let searchBusy = $state(false);
  let searchError = $state('');

  /**
   * Таймер устранения дребезга и метка запроса — намеренно ОБЫЧНЫЕ переменные, не `$state`:
   * их читает эффект поиска, и реактивность здесь означала бы бесконечный цикл.
   */
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let searchToken = 0;

  /** Пауза перед запросом: человек печатает, а не ищет каждую букву (в 1.x искали по Enter). */
  const SEARCH_DEBOUNCE_MS = 250;

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

  /**
   * Высота прибитой шапки — чтобы строка поиска прилипала ПОД ней, а не пряталась ЗА неё
   * (bugs/51). Число именно меряется: живой замер даёт 57px на 390 и 52px на 1440, так что
   * любая зашитая константа была бы враньём на одной из ширин. `ResizeObserver` держит
   * значение верным и при повороте экрана, и при смене языка.
   */
  let barHeight = $state(56);

  onMount(() => {
    const bar = document.querySelector('.bar');
    if (!(bar instanceof HTMLElement)) return;

    const measure = () => (barHeight = Math.round(bar.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  });

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
        data = await loadDimsScreen(session, ratings);
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

    const anchor = sentinel;
    let pumping = false;

    /**
     * Догружать, ПОКА якорь остаётся в поле зрения, — а не один раз на пересечение.
     *
     * `IntersectionObserver` сообщает о ПЕРЕСЕЧЕНИИ границы. Если после подгрузки якорь
     * так и остался видимым (короткая лента, широкий экран в две колонки, порция меньше
     * высоты вьюпорта), нового пересечения не будет НИКОГДА — и лента встаёт намертво.
     * Ровно это владелец описал как «ломается триггер подгрузки новых измерений из БД»
     * (поймано QA-прогоном: на 1440px грузились 12 карточек и всё).
     *
     * Поэтому качаем циклом: подгрузили порцию — проверили, виден ли якорь ещё, и если
     * да, идём за следующей. Цикл сам останавливается, когда якорь уехал за экран или
     * когда грузить больше нечего (`loadMore`/`loadMoreMine` выходят сразу).
     */
    async function pump(): Promise<void> {
      if (pumping) return;
      pumping = true;
      try {
        for (let guard = 0; guard < 20; guard += 1) {
          const before = tab === 'all' ? shown.length : mineCount;
          if (tab === 'all') await loadMore();
          else await loadMoreMine();
          await tick();
          const after = tab === 'all' ? shown.length : mineCount;
          // Ничего не прибавилось — грузить нечего, дальше цикл только жёг бы запросы.
          if (after === before) return;
          const rect = anchor.getBoundingClientRect();
          const stillVisible = rect.top < window.innerHeight + 600 && rect.bottom > -600;
          if (!stillVisible) return;
        }
      } finally {
        pumping = false;
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        void pump();
      },
      // Якорь срабатывает за ~600px ДО края экрана: догрузка происходит вне видимости,
      // и человек её не замечает — ровно как в 1.x (bugs/13).
      { rootMargin: '600px 0px' },
    );
    observer.observe(anchor);
    return () => observer.disconnect();
  });

  /**
   * Поиск: запрос изменился → пауза → ищем по индексу → догружаем найденное (bugs/50).
   *
   * Эффект читает ТОЛЬКО `search` и `data` — записи в `searchCards`/`searchBusy` его не
   * перезапускают. Метка `searchToken` отбрасывает ответ на устаревший запрос: человек
   * печатает быстрее, чем отвечает сеть, и без неё результат «Тако» мог бы прилететь
   * поверх результата «Такси».
   */
  $effect(() => {
    const query = search.trim();
    const index = data?.index ?? null;

    if (searchTimer !== null) clearTimeout(searchTimer);

    if (query === '' || index === null) {
      searchToken += 1; // ответ на прошлый запрос уже никому не нужен
      searchCards = [];
      searchTotal = 0;
      searchBusy = false;
      searchError = '';
      return;
    }

    searchBusy = true;
    searchError = '';

    searchToken += 1;
    const token = searchToken;
    searchTimer = setTimeout(() => void runSearch(index, query, token), SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchTimer !== null) clearTimeout(searchTimer);
    };
  });

  /** Один заход поиска: индекс даёт id, база — карточки. Каталог целиком не читается. */
  async function runSearch(index: DimsIndex, query: string, token: number): Promise<void> {
    const ids = searchIndex(index, query);
    try {
      const cards = await loadDimCards(ids.slice(0, SEARCH_RESULT_LIMIT));
      if (token !== searchToken) return; // пришёл ответ на уже неактуальный запрос
      searchCards = cards;
      searchTotal = ids.length;
    } catch (error) {
      if (token !== searchToken) return;
      // Молчать нельзя: «Ничего не найдено» вместо ошибки сети — это витрина, которая врёт.
      searchError = technicalDetail(error);
      searchCards = [];
      searchTotal = 0;
    } finally {
      if (token === searchToken) {
        searchBusy = false;
      }
    }
  }

  /**
   * Порция ленты «Все».
   *
   * ⚠️ Повторный вызов во время уже идущей загрузки ЖДЁТ её, а не выходит пустым.
   * Раньше он выходил — и это была настоящая причина «загрузка ломается» (владелец,
   * 2026-07-27). Гонка: `stand = 'ready'` выставляется ДО того, как первая порция
   * приехала, поэтому якорь подгрузки успевает отрисоваться и `IntersectionObserver`
   * срабатывает СРАЗУ — на пустой ленте. Тот единственный вызов натыкался на
   * `loadingMore === true`, возвращался ни с чем, а нового ПЕРЕСЕЧЕНИЯ уже не
   * происходило: якорь так и оставался в поле зрения. Лента вставала на первой порции.
   * На узком экране беды не было видно — 12 карточек делают страницу длиннее вьюпорта,
   * и следующая прокрутка давала новое пересечение; на 1440px лента в две колонки
   * помещалась целиком, и всё замирало на 12 карточках (поймано QA-прогоном).
   */
  let feedInFlight: Promise<void> | null = null;

  function loadMore(): Promise<void> {
    if (feedInFlight !== null) return feedInFlight;
    if (queue.length === 0) {
      exhausted = true;
      return Promise.resolve();
    }
    loadingMore = true;
    feedInFlight = (async () => {
      try {
        const batch = queue.slice(0, PAGE_SIZE);
        queue = queue.slice(PAGE_SIZE);
        shown = [...shown, ...(await loadDimCards(batch))];
        if (queue.length === 0) exhausted = true;
      } finally {
        loadingMore = false;
        feedInFlight = null;
      }
    })();
    return feedInFlight;
  }

  /**
   * Догрузка «Мой NDim ID»: следующая порция СВОЕГО порядка (bugs/18). Карточки кешируются.
   * Как и у ленты «Все», повторный вызов во время идущей загрузки ЖДЁТ её (см. `loadMore`):
   * иначе единственное срабатывание якоря могло уйти в пустоту и вкладка вставала.
   */
  let mineInFlight: Promise<void> | null = null;

  function loadMoreMine(): Promise<void> {
    if (mineInFlight !== null) return mineInFlight;
    if (data === null || mineCount >= mineOrder.length) return Promise.resolve();
    mineLoading = true;
    mineInFlight = (async () => {
      try {
        const portion = mineOrder.slice(mineCount, mineCount + PAGE_SIZE);
        const cards = await loadDimCards(portion);
        const merged = new Map(mineCards);
        for (const card of cards) merged.set(card.id, card);
        mineCards = merged;
        mineCount = Math.min(mineCount + PAGE_SIZE, mineOrder.length);
      } finally {
        mineLoading = false;
        mineInFlight = null;
      }
    })();
    return mineInFlight;
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

    // Карточка может прийти из ленты, из «Мой NDim ID» ИЛИ из выдачи поиска (bugs/50):
    // измерение, найденное поиском, могло не побывать в ленте вовсе.
    const card =
      shown.find((item) => item.id === dimId) ??
      mineCards.get(dimId) ??
      searchCards.find((item) => item.id === dimId);

    // Оценённая карточка теперь живёт и во вкладке «Мой NDim ID» — кладём её в кеш вкладки,
    // чтобы она появилась там сразу; своё место она займёт по сортировке (bugs/18).
    if (card && !mineCards.has(dimId)) {
      const merged = new Map(mineCards);
      merged.set(dimId, card);
      mineCards = merged;
    }

    // Оценённое уходит из очереди «Все» в любом случае: даже если человек оценил его
    // из выдачи поиска и в ленте оно ещё ни разу не показывалось (bugs/50).
    queue = queue.filter((id) => id !== dimId);
    shown = shown.filter((item) => item.id !== dimId);

    if (search.trim() !== '') {
      // В ВЫДАЧЕ ПОИСКА карточка ОСТАЁТСЯ со своими звёздами. Человек искал именно её —
      // если она исчезнет в момент оценки, он решит, что что-то сломалось.
      showUndo(dimId, card ? dimCardTitle(loc(card.title), card.year).name : '');
    } else if (tab === 'all') {
      // Карточка уезжает вправо (как в 1.x): её везёт out-переход, а соседей плавно
      // подтягивает animate:flip — руками ничего не хронометрируем.
      leaving = dimId;
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
   * Язык сюда не входит (bugs/37): порядок один на RU и EN, смена языка карточки не трогает.
   */
  const mineOrder = $derived(data === null ? [] : sortMyDims(ratings));

  /** Раскрытая часть «Мой NDim ID»: первые mineCount позиций порядка, уже загруженные. */
  const mineVisible = $derived(
    mineOrder
      .slice(0, mineCount)
      .map((id) => mineCards.get(id))
      .filter((card): card is DimCard => card !== undefined),
  );

  /** Карточки текущей вкладки. Поиск перебивает вкладку и живёт своим списком (bugs/50). */
  const visible = $derived.by((): DimCard[] => {
    if (data === null) return [];

    if (search.trim() !== '') return searchCards;
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

  /**
   * СВОЯ ПАМЯТЬ ПРОКРУТКИ У КАЖДОЙ ВКЛАДКИ (слово владельца 2026-07-27).
   *
   * Дословно: «Загрузка на Измерениях ломается при переключении между ВСЕ и МОЙ NDIM ID…
   * Я на ВСЕ могу пролистать очень глубоко вниз — это не значит, что МОЙ NDIM ID так вниз
   * нужно листать, а оно, по всей видимости, пытается — и это ломает триггер подгрузки».
   *
   * Диагноз владельца верен. Вкладки делят ОДНО окно и одну прокрутку: уходя с «Все»
   * глубоко внизу, человек попадал на «Мой NDim ID» с тем же `scrollY`. Короткая лента
   * такой прокрутки не имеет — браузер прижимал страницу к её концу, якорь подгрузки
   * (`sentinel`) оказывался прямо во вьюпорте и оставался там, а `IntersectionObserver`
   * срабатывает на ПЕРЕСЕЧЕНИЕ: элемент, который уже виден и не двигается, новых событий
   * не даёт. Лента вставала.
   *
   * Лечение: у каждой вкладки своя запомненная позиция. Уходим — записали, вернулись —
   * восстановили; у вкладки, где ещё не были, позиция 0 (её верх).
   */
  const tabScroll: Record<Tab, number> = { all: 0, mine: 0 };

  function switchTab(next: Tab): void {
    if (tab !== next) tabScroll[tab] = window.scrollY;
    const target = tabScroll[next];
    tab = next;
    search = '';
    // Первую порцию «моих» тянем сразу: не ждём срабатывания якоря под пустой лентой.
    if (next === 'mine' && mineCount === 0) void loadMoreMine();
    void tick().then(() => restoreScroll(target));
  }

  /**
   * Вернуть прокрутку на запомненное место.
   *
   * Одного `scrollTo` мало: сразу после переключения документ ещё не набрал прежнюю
   * высоту (лента перерисовывается заново), и браузер ПРИЖИМАЕТ прокрутку к текущему
   * концу — человек оказывается не там, где был. Поймано QA-прогоном: просили 7658px,
   * получали 7191px. Поэтому повторяем по кадрам, пока не сядем ровно или пока не станет
   * ясно, что документ уже не растёт.
   *
   * `instant` обязателен: плавный переход здесь и был бы тем самым «съездом», от которого
   * мы уходим.
   */
  function restoreScroll(target: number): void {
    if (target <= 0) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    /*
     * Держимся ПО ВРЕМЕНИ, а не по числу кадров: лента перерисовывается не мгновенно, и
     * прежняя высота документа набирается постепенно. Отсчёт в кадрах (30 ≈ полсекунды)
     * сдавался раньше — QA-прогон ловил промах ровно на 469px, то есть прокрутка
     * оставалась прижатой к тогдашнему концу документа.
     *
     * И уважаем человека: если он за это время сам тронул прокрутку, мы немедленно
     * отступаем — бороться с рукой пользователя недопустимо.
     */
    const DEADLINE_MS = 1200;
    const until = performance.now() + DEADLINE_MS;
    let cancelled = false;
    const giveUp = () => { cancelled = true; };
    const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
    for (const type of events) window.addEventListener(type, giveUp, { once: true, passive: true });

    const stop = () => {
      for (const type of events) window.removeEventListener(type, giveUp);
    };

    const step = () => {
      if (cancelled) return stop();
      window.scrollTo({ top: target, behavior: 'instant' });
      if (Math.abs(window.scrollY - target) <= 2 || performance.now() > until) return stop();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function openMyTab(): void {
    switchTab('mine');
  }

  // Смену языка и её persist делает шапка (bugs/39) — экран лишь принимает новое значение.

  // ── Заявка на новое измерение ───────────────────────────────────────────────
  // Её место — здесь, рядом с каталогом (в 1.x это была лампочка 💡 на этом же экране),
  // а не в профиле, где она жила по недоразумению. Так Пространство растёт снизу.
  let suggestOpen = $state(false);
  let suggestText = $state('');
  let suggestState = $state<'idle' | 'sending' | 'sent'>('idle');

  /**
   * Кнопка 💡 в строке поиска открывает и закрывает форму (bugs/51, макет V3).
   *
   * Форма живёт сразу под прибитой строкой — то есть у ВЕРХА страницы. Если человек
   * пролистал ленту и нажал 💡, форма раскрылась бы ВЫШЕ экрана, и он увидел бы, что
   * «кнопка ничего не делает». Поэтому при открытии поднимаем страницу к форме.
   * (Поймано наблюдением на стенде: y формы был −752.)
   */
  function toggleSuggest(): void {
    suggestState = 'idle';
    suggestOpen = !suggestOpen;
    if (suggestOpen) {
      searchOpen = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // ── Верхнее меню «Измерений» — макет V3 «Панель-ящик» (bugs/52) ─────────────
  //
  // Слово владельца: «вверху должен быть переключатель всех измерений и моего NDim ID…
  // чтобы это было целое меню с поиском, с предложить измерение и с переключателями»,
  // и «может быть открывающимся и скрывающимся, как у меня открывались и скрывались
  // ВСЕ и МОЙ NDIM ID кнопки».
  //
  // РАЗВЕДКА 1.x (researches/12, снято по коду): панель `top_sticky_toolbar` была ПРИБИТА
  // под шапкой и пряталась ПО НАПРАВЛЕНИЮ ПРОКРУТКИ — вниз `translateY(-200%)`, вверх
  // `translateY(0)`, 300 мс; выше 40px прокрутки всегда показана; порог срабатывания 20px
  // (index.html:958-976, styles.css:551-565, app.js:2870-2947). Числа ниже — оттуда.

  /** Панель спрятана прокруткой вниз. Возвращается прокруткой вверх — канон 1.x. */
  let toolbarHidden = $state(false);
  /** Ящик поиска выдвинут (V3): поле занимает место только когда оно нужно. */
  let searchOpen = $state(false);
  let searchInput: HTMLInputElement | null = $state(null);

  /** Прокрутка, ниже которой панель показана ВСЕГДА (канон 1.x). */
  const TOOLBAR_ALWAYS_BELOW = 40;
  /** Насколько надо проскроллить, чтобы панель среагировала (канон 1.x). */
  const TOOLBAR_SCROLL_STEP = 20;

  onMount(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < TOOLBAR_ALWAYS_BELOW) {
        toolbarHidden = false;
        last = y;
        return;
      }
      if (Math.abs(y - last) < TOOLBAR_SCROLL_STEP) return;
      const down = y > last;
      last = y;
      if (!down) {
        toolbarHidden = false;
        return;
      }
      // Пока человек ищет или пишет заявку, панель не прячем: она в этот момент —
      // не украшение, а рабочий инструмент, и увести её из-под руки было бы грубо.
      if (searchOpen || search.trim() !== '' || suggestOpen) return;

      /*
       * ПРЯЧЕМ ТОЛЬКО ПРИЛИПШУЮ ПАНЕЛЬ — иначе остаётся ДЫРА (найдено владельцем в бою).
       *
       * `transform` уводит саму панель, но её место в потоке остаётся. Пока панель ещё
       * не прилипла (над ней на экране заголовок и подсказка), это место ВИДНО — и
       * человек получает пустой прямоугольник посреди страницы, а панель улетает поверх
       * подсказки. Как только панель прилипла к шапке, её место в потоке уже выше
       * вьюпорта, и уезд не оставляет за собой ничего.
       *
       * В 1.x проблемы не было по построению: там `top_sticky_toolbar` был ПЕРВЫМ
       * элементом экрана, и к моменту прятания его место всегда было за верхним краем.
       * У нас над панелью стоят заголовок и вводная подсказка — поэтому условие явное.
       */
      const el = document.querySelector('.toolbar');
      if (!(el instanceof HTMLElement)) return;
      const pinned = el.getBoundingClientRect().top <= barHeight + 1;
      if (!pinned) return;

      toolbarHidden = true;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  });

  /**
   * 🔍 выдвигает и убирает ящик поиска.
   *
   * Закрытие ОЧИЩАЕТ запрос: лента показывает результаты поиска, пока в поле что-то есть,
   * и спрятанное поле с текстом означало бы «лента врёт, а почему — не видно».
   */
  function toggleSearch(): void {
    searchOpen = !searchOpen;
    if (searchOpen) {
      suggestOpen = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // Фокус — после отрисовки ящика: раньше поля просто нет в DOM.
      queueMicrotask(() => searchInput?.focus());
    } else {
      search = '';
    }
  }

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

  /**
   * «Сообщить об ошибке» — пункт меню ⋮ из 1.x (bugs/27): письмо в поддержку с уже
   * подставленным измерением. Адрес — канон страницы «Поддержка» (researches/06).
   */
  function reportError(card: DimCard): void {
    const title = dimCardTitle(loc(card.title), card.year);
    const subject = lang === 'ru' ? `Ошибка в измерении «${title.name}» (${card.id})` : `Mistake in dimension “${title.name}” (${card.id})`;
    location.href = `mailto:ndimspace@yandex.ru?subject=${encodeURIComponent(subject)}`;
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
    // Вводная подсказка экрана — канон 1.x (кадр app-15; bugs/27). Формулировка чуть
    // адаптирована к 2.0: кнопки «Сохранить» больше нет — оценка сохраняется сама.
    intro: {
      ru: 'Чтобы пополнить Ваш NDim ID новыми измерениями, установите желаемое количество звёзд в любом измерении из списка — оценка сохранится сама. Управляйте измерениями Вашего профиля во вкладке «Мой NDim ID». Подробнее об измерении — нажмите на его название. Для быстрого поиска нажмите кнопку поиска в меню сверху, а рядом с ней — кнопка «Предложить измерение».',
      en: 'To grow your NDim ID with new dimensions, set the desired number of stars on any dimension in the list — the rating is saved by itself. Manage the dimensions of your profile on the “My NDim ID” tab. Tap a dimension’s name to learn more about it. Tap the search button in the top menu to find a dimension quickly; the button next to it suggests a new one.',
    },
    tabAll: { ru: 'Все', en: 'All' },
    tabMine: { ru: 'Мой NDim ID', en: 'My NDim ID' },
    // Текст задан владельцем дословно (2026-07-27, при утверждении макета V3).
    searchPlaceholder: { ru: 'Введите искомое название', en: 'Enter the name you are looking for' },
    searchTitle: { ru: 'Поиск измерения', en: 'Search a dimension' },
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
    // Текст 1.x дословно (`doSearchDims`), число подставляется из константы канона.
    tooMany: {
      ru: (limit: number) =>
        `По Вашему запросу найдено очень много измерений. Будут показаны только первые ${limit} совпадений. Пожалуйста, уточните Ваш запрос для более точного поиска.`,
      en: (limit: number) =>
        `Too many dimensions were found by your query. Only the first ${limit} matches will be shown. Please refine your query for more accurate results.`,
    },
    searchFailed: {
      ru: 'Не удалось выполнить поиск. Проверьте соединение и попробуйте ещё раз.',
      en: 'The search could not be completed. Check your connection and try again.',
    },
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
    reportError: { ru: 'Сообщить об ошибке', en: 'Report a mistake' },
    cardMenu: { ru: 'Действия с измерением', en: 'Dimension actions' },
    removeRating: { ru: 'Убрать мою оценку', en: 'Remove my rating' },
    // Сноска «Оценки видите только Вы…» убрана из-под ленты по слову владельца
    // 2026-07-27: «текст внизу под списком — убрать».
    suggestTitle: { ru: 'Предложить новое измерение', en: 'Suggest a new dimension' },
    suggestHint: {
      ru: 'Что это за измерение и почему оно важно? От 5 до 300 символов.',
      en: 'What is this dimension and why does it matter? From 5 to 300 characters.',
    },
    // Правила оформления заявки — дословно из 1.x (ndim_old/public/index.html,
    // #suggest_editor_form_hit_container). Без них заявки приходят вольным текстом, и админу
    // труднее завести измерение: правила УЧАТ формату на живом примере (bugs/48).
    // [TESTED: 2026-07-26 · сверено построчно с исходником 1.x; e2e stores the example line]
    suggestRulesTitle: { ru: 'Правила оформления', en: 'Description rules' },
    suggestRules: {
      ru: [
        'Напишите тип измерения, его название, год создания (если есть). Пример: Фильм "Пятый элемент", 1995 года.',
        'Можете добавить краткое описание для лучшего понимания, какой объект культуры имеется в виду.',
        'Можете добавить ссылку на Интернет-ресурс с описанием объекта культуры.',
        'Старайтесь описать кратко. Максимум 300 символов текста.',
      ],
      en: [
        'Write the type of dimension, its name, year of creation (if any). Example: Movie "The Fifth Element", 1995.',
        'You can add a short description for a better understanding of what cultural object is meant.',
        'You can add a link to an Internet resource with a description of the cultural object.',
        'Try to describe briefly. Maximum 300 characters of text.',
      ],
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

<!-- Тап или клик МИМО контекстного меню карточки закрывает его — канон 1.x, слово
     владельца 2026-07-27: «в старом NDim делал так, чтобы тап или клик вне контекстного
     меню закрывало его». Здесь меню закрывалось только повторным тапом по «⋮» или
     выбором пункта, и человек оставался с висящим меню.

     Именно `pointerdown` вне `.menu`, а не `click` на window: клик по самой кнопке «⋮»
     Svelte делегирует, и меню закрылось бы тем же событием, которым открылось (гонка
     open→close за один тап — уже ловилась на выпадашке языка, bugs/39). Точно тот же
     приём стоит в `AppBar` — это одна форма на оба меню продукта. -->
<svelte:window
  onpointerdown={(event) => {
    if (menuOpen && !(event.target instanceof Element && event.target.closest('.menu'))) menuOpen = null;
  }}
  onkeydown={(event) => {
    if (menuOpen && event.key === 'Escape') menuOpen = null;
  }}
/>

<div class="screen">
  <SideRail active="dims" {lang} />
  <AppBar {lang} onLang={(next) => (lang = next)} />

  <!--
    Верхнее меню живёт ВНЕ колонки контента, сразу под шапкой (слово владельца 2026-07-27:
    «не растягиваешь почему-то на всю ширину… Это приборная панель, её можно тянуть на всю
    ширину хедера»). Побочно это чинит и ДЫРУ, которую владелец поймал в бою: теперь панель —
    ПЕРВЫЙ элемент экрана, ровно как `top_sticky_toolbar` в 1.x, и к моменту уезда её место
    в потоке всегда уже за верхним краем.
  -->
  {#if stand === 'ready'}
  <div
    class="toolbar"
    class:hidden={toolbarHidden}
    class:open={searchOpen}
    style="top: {barHeight}px"
  >
    <div class="trow">
      <div class="segs" role="group">
        <button type="button" class:on={tab === 'all' && search.trim() === ''} onclick={() => switchTab('all')}>
          {t.tabAll[lang]}
        </button>
        <button type="button" class:on={tab === 'mine' && search.trim() === ''} onclick={openMyTab}>
          {t.tabMine[lang]}
        </button>
      </div>
      <div class="tools">
        <button
          type="button"
          class="ibtn"
          class:on={searchOpen}
          aria-label={t.searchTitle[lang]}
          aria-expanded={searchOpen}
          title={t.searchTitle[lang]}
          onclick={toggleSearch}
        ><Icon name="search" size={16} /></button>
        <button
          type="button"
          class="ibtn suggest-btn"
          class:on={suggestOpen}
          aria-label={t.suggestTitle[lang]}
          title={t.suggestTitle[lang]}
          onclick={toggleSuggest}
        ><Icon name="bulb" size={16} /></button>
      </div>
    </div>

    <!-- Ящик: поле поиска занимает высоту только когда человек его вызвал (макет V3). -->
    <div class="drawer">
      <input
        bind:this={searchInput}
        class="search"
        type="search"
        placeholder={t.searchPlaceholder[lang]}
        bind:value={search}
      />
    </div>
  </div>
  {/if}

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
      <!-- Вводная подсказка экрана — канон 1.x (bugs/27) -->
      <p class="intro">{t.intro[lang]}</p>

      <!--
        Строка поиска ПРИБИТА под шапкой, и в ней живёт вход в «Предложить измерение»
        (bugs/51, макет V3, утверждён владельцем 2026-07-26). Раньше эта дверь стояла ПОД
        бесконечной лентой: «там пользователь никогда не найдёт». Пара «поиск + 💡» — канон
        1.x, где 💡 и 🔍 были соседями (`extra_tools_container`).
        Смещение `top` — измеренная высота шапки: она разная на 390 и 1440, и любое
        зашитое число было бы враньём на одной из ширин.
      -->

      <!-- Форма открывается ЗДЕСЬ ЖЕ, под кнопкой: человек не должен искать, куда она уехала. -->
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
          <!-- Правила оформления (канон 1.x): человек видит формат ДО того, как начал писать. -->
          <div class="rules">
            <b>{t.suggestRulesTitle[lang]}</b>
            <ul>
              {#each t.suggestRules[lang] as rule}
                <li>{rule}</li>
              {/each}
            </ul>
          </div>
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
      {/if}

      {#if search.trim() !== ''}
        <!-- Поиск идёт по ВСЕМУ Пространству и догружает найденное (bugs/50). Пока карточки
             летят из базы — каноничное кольцо 1.x; «Ничего не найдено» говорим ТОЛЬКО когда
             поиск действительно закончен, иначе витрина врёт о каталоге. -->
        {#if searchBusy}
          <div class="state"><Loading {lang} /></div>
        {:else if searchError !== ''}
          <div class="card pad" in:fade={{ duration: MOTION.base }}>
            <p class="state">{t.searchFailed[lang]}</p>
            <p class="hint mono">{searchError}</p>
          </div>
        {:else if searchCards.length === 0}
          <div class="card pad" in:fade={{ duration: MOTION.base }}><p class="state">{t.nothingFound[lang]}</p></div>
        {:else if searchTotal > SEARCH_RESULT_LIMIT}
          <p class="intro" in:fade={{ duration: MOTION.base }}>{t.tooMany[lang](SEARCH_RESULT_LIMIT)}</p>
        {/if}
      {:else if tab === 'mine' && myCount === 0}
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
            data-dim={card.id}
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
                <!-- aria-label был знаком «⋮» — скринридер читал его как символ, а не действие. -->
                <button type="button" class="dots" aria-label={t.cardMenu[lang]} onclick={() => (menuOpen = menuOpen === card.id ? null : card.id)}><Icon name="dots" size={17} /></button>
                {#if menuOpen === card.id}
                  <div class="drop" transition:fade={{ duration: MOTION.fast }}>
                    <button type="button" onclick={() => { webSearch(card); menuOpen = null; }}>{t.searchWeb[lang]}</button>
                    <button type="button" onclick={() => { reportError(card); menuOpen = null; }}>{t.reportError[lang]}</button>
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
        <!--
          Догрузка ленты показывается ТОЙ ЖЕ каноничной карточкой 1.x, что и все загрузки
          продукта (`Loading.svelte`, bugs/21: кольцо «( )»). Здесь висел самодельный глиф
          «◠» — у него нет ни сетки, ни анимации кольца, и владелец справедливо попросил
          «переделать под вид канона старого NDim с фирменной анимацией — она уже
          переиспользована и адаптирована, найти и использовать её».
        -->
        <div class="loader" bind:this={sentinel}>
          {#if tab === 'mine'}
            {#if mineCount < mineOrder.length}<Loading {lang} />{/if}
          {:else if exhausted && shown.length > 0 && queue.length === 0 && ratings.size > 0 && visible.length === 0}
            {t.allDone[lang]}
          {:else if !exhausted}
            <Loading {lang} />
          {:else if queue.length === 0 && shown.length === 0}
            {t.allDone[lang]}
          {/if}
        </div>
      {/if}

      <!--
        Кнопки «Предложить измерение» ПОД лентой больше нет: она и была багом 51
        («запрятано вниз списка измерений — там пользователь никогда не найдёт»).
        Единственный вход — 💡 в прибитой строке поиска выше. Две двери в одну комнату
        только запутали бы, а нижняя всё равно недостижима: лента бесконечна.
      -->
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
  /* Вводная подсказка экрана (канон 1.x, bugs/27): спокойная плашка, а не карточка. */
  .intro {
    font-size: 12px; line-height: 1.55; color: var(--dim); margin: 0 0 12px;
    padding: 10px 12px; border-radius: 10px; background: var(--edge-soft);
  }
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

  /*
   * Строка поиска прибита под шапкой (bugs/51): вход в «Предложить измерение» обязан
   * оставаться на экране, сколько бы человек ни листал ленту. Фон — только НЕПРОЗРАЧНЫЙ
   * токен: под строкой едут карточки (bugs/22). z-index ниже шапки (10) — если что-то
   * и наложится, строка уедет ПОД шапку, а не поверх неё.
   */
  /*
   * Верхнее меню «Измерений» — макет V3 «Панель-ящик», утверждён владельцем 2026-07-27
   * (bugs/52). Одна компактная строка: переключатель «Все / Мой NDim ID» + 🔍 + 💡.
   *
   * Прибита под шапкой (`top` — ИЗМЕРЕННАЯ высота шапки: 57px на 390 и 52px на 1440,
   * зашитая константа врала бы на одной из ширин). Фон — только НЕПРОЗРАЧНЫЙ токен:
   * под панелью едут карточки (bugs/22). z-index ниже шапки (10): если что-то и
   * наложится, панель уедет ПОД шапку, а не поверх неё.
   *
   * Прячется прокруткой вниз и возвращается прокруткой вверх — канон 1.x, где ровно так
   * вёл себя `top_sticky_toolbar` (300 мс, translateY(-200%)). Это и есть «открывались и
   * скрывались» из слов владельца. Уезжает на 200% собственной высоты, чтобы вместе с ней
   * ушла и её тень, и раскрытый ящик.
   */
  .toolbar {
    position: sticky; z-index: 9;
    background: var(--panel-solid, var(--panel));
    border-bottom: 1px solid var(--edge);
    /* Во всю ширину, как шапка (слово владельца): панель — часть верхней оснастки экрана,
       а не элемент колонки контента. Поля совпадают с полями шапки, чтобы содержимое
       обеих стояло по одной вертикали. */
    padding: 8px 16px 10px;
    transition: transform 0.3s ease;
    will-change: transform;
  }
  .toolbar.hidden { transform: translateY(-200%); }

  /*
   * Мобильная раскладка: переключатель стоит РОВНО ПО ЦЕНТРУ ширины (слово владельца
   * «центрировать эти кнопки в мобильной вёрстке»; в 1.x радио-группа тоже центрировалась —
   * styles.css `.form_radio_group { justify-content: center }`).
   *
   * Сетка `1fr auto 1fr`, а не flex с `justify-content: center`: пара кнопок справа имеет
   * ширину, и при простом центрировании переключатель уехал бы влево ровно на неё.
   * Пустая первая колонка уравновешивает вторую — центр получается настоящий.
   */
  .trow {
    display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center;
  }
  .segs { grid-column: 2; }
  .tools { grid-column: 3; justify-self: end; display: flex; gap: 8px; }

  /* Ящик поиска: закрыт — нулевой высоты, то есть ленте отданы все его пиксели. */
  .drawer {
    max-height: 0; opacity: 0; overflow: hidden;
    transition: max-height 0.28s ease, opacity 0.2s ease;
  }
  .toolbar.open .drawer { max-height: 64px; opacity: 1; }

  .search {
    width: 100%; margin-top: 8px;
    padding: 11px 14px; border-radius: 12px; background: var(--panel);
    border: 1px solid var(--edge); color: var(--text); font: inherit;
    transition: border-color 0.15s ease;
  }
  .search:focus { outline: none; border-color: var(--primary); }

  /*
   * Пара кнопок панели: 🔍 и 💡 — соседи, как в 1.x (`extra_tools_container`).
   * Размер и вес — как в утверждённом макете: спокойная серая иконка в тонкой рамке.
   * Первая реализация была «уродская» (слово владельца): 38px, тёмная иконка и ЖИРНАЯ
   * синяя рамка в активном состоянии — кнопка кричала громче содержимого экрана.
   * Активность передаём мягко: цвет иконки и чуть подкрашенные рамка с фоном.
   */
  .ibtn {
    flex: none; width: 32px; height: 32px; border-radius: 9px; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--panel); border: 1px solid color-mix(in srgb, var(--primary) 28%, var(--edge));
    line-height: 1; color: var(--primary);
    transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease, color 0.15s ease;
  }
  .ibtn:hover { border-color: color-mix(in srgb, var(--primary) 55%, var(--edge)); background: color-mix(in srgb, var(--primary) 6%, var(--panel)); }
  .ibtn:active { transform: scale(0.94); }
  .ibtn.on {
    color: var(--primary);
    border-color: color-mix(in srgb, var(--primary) 45%, var(--edge));
    background: color-mix(in srgb, var(--primary) 8%, transparent);
  }

  /*
   * Лампочка — ТЁПЛОГО золота (тот же токен, что у звёзд оценки), поиск — фирменного синего.
   * Владелец просил «красивые цветные, как в макете»: в макете там стояли системные эмодзи
   * 🔍/💡, и цветными их делал шрифт вендора. Растрировать их нельзя — это чужая графика
   * (Segoe UI Emoji на Windows, Noto на Android), разная на разных системах и чужеродная
   * рядом с авторскими иконками нав-панели. Ту же цветность даёт вектор из нашего набора,
   * покрашенный токенами темы: он остаётся одноцветным (currentColor), значит обе темы и
   * Ч/Б-инвариант продолжают работать сами.
   */
  .suggest-btn {
    color: var(--star);
    border-color: color-mix(in srgb, var(--star) 32%, var(--edge));
  }
  .suggest-btn:hover {
    border-color: color-mix(in srgb, var(--star) 60%, var(--edge));
    background: color-mix(in srgb, var(--star) 8%, var(--panel));
  }
  .suggest-btn.on {
    color: var(--star);
    border-color: color-mix(in srgb, var(--star) 55%, var(--edge));
    background: color-mix(in srgb, var(--star) 12%, transparent);
  }

  .segs { display: flex; gap: 7px; min-width: 0; }
  .segs button {
    font: inherit; font-size: 13px; color: var(--dim); background: none;
    border: 1px solid var(--edge); border-radius: 999px; padding: 6px 14px; cursor: pointer;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
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
  /* Правила оформления заявки — тихая справка, а не второй заголовок формы (канон 1.x). */
  .sug .rules { margin: 0 0 10px; }
  .sug .rules b { display: block; font-size: 13px; color: var(--heading); margin-bottom: 4px; }
  .sug .rules ul { margin: 0; padding-left: 16px; list-style: disc; }
  .sug .rules li { color: var(--dim); font-size: 12px; line-height: 1.5; }
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

  /* Якорь бесконечной подгрузки. Внутри — общая карточка загрузки продукта; своей
     анимации у него больше нет (самодельный глиф «◠» и его @keyframes удалены). */
  .loader { display: flex; justify-content: center; color: var(--faint); font-size: 13px; padding: 20px 0; }

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
    /* Панель — в колонке контента сетки (справа от рельса), поля как у шапки.
       На десктопе переключатель прижат влево: центрировать его на широкой панели
       незачем — рядом нет краёв, относительно которых центр читался бы. */
    .toolbar { grid-column: 2; padding: 8px 26px 10px; }
    .trow { display: flex; }
    .segs { flex: 1; }
    .screen { grid-template-rows: auto auto 1fr; }
    .toast { bottom: 28px; }
  }
</style>

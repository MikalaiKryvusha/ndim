<!--
  СТРАНИЦА-ОБЁРТКА ТЕСТА — каркас **V5 «Зеркало + инструкция»**, утверждён владельцем
  (интервью №029, В2 = А; путь выбора: 4 макета → его слово «нравится v4, но чтобы была
  инструкция как в v2» → гибрид V5 → подтверждён). Макеты — `design/test-pages-mockups.html`.

  Блоки по каркасу: hero → компактная полоса трёх шагов → движок и панель «анкета растёт»
  рядом → «позовите второго» → «каким будет результат» → мост-паспорт → FAQ → подпись.
  Кнопки «Начать» нет сознательно: она была ценой V2 (церемония на странице без стены).

  ТАКТ Б (`plans/42` шаг 3): движок ЖИВОЙ. Очередь карточек детерминирована и собрана на
  сборке (`test-set.ts` — популярнейшие объекты каталога), жест звезды — канон экрана
  «Измерения» (11 звёзд 0…10, повторный тап отменяет отсчёт, 5 с + «Сохранить сейчас», ряд
  смайликов). Первая оценка = вход: без сессии молча рождается гость, и оценки пишутся в его
  настоящий NDim ID (`$lib/data/test-engine.ts`; Firebase — только динамическим импортом).

  🔴 Чего здесь НЕТ и что нельзя «дочинить»:
    · чисел похожести и порядка близости — не публикуются нигде (№018 В4, №023);
      результат — совпадения ФАКТАМИ, у «калькулятора любви» — СЧЁТ совпадений (№028 В3 = А);
    · формы до результата — путь гостя без стены (канон `ideas/09`);
    · рельса навигации — как у всех публичных страниц (незнакомца из поиска пять пунктов
      рельса ведут в пять тупиков за стеной входа);
    · личной ссылки пары и общего результата — это такт В, блок «Позовите второго» пока текст.
-->
<script lang="ts">
  import { slide, fly } from 'svelte/transition';
  import type { TestPageData } from './+page.server';
  import { LANGS, LANG_LABEL } from '$lib/content/langs';
  import { RATED_FACT_FROM } from '$lib/content/test-set';
  import Icon from '$lib/ui/Icon.svelte';
  // Знак бренда — тот же компонент, что в шапке приложения: витрина не рисует своих логотипов.
  import Brand from '$lib/ui/Brand.svelte';
  import { GRADE_FACES } from '$lib/ui/emojiscale';
  import GradeFace from '$lib/ui/GradeFace.svelte';
  import { MOTION } from '$lib/ui/motion';
  import { track } from '$lib/data/funnel';
  import {
    restoreMyRatings,
    saveTestRating,
    removeTestRating,
    currentUid,
    createPair,
    loadPair,
    joinPair,
    deletePair,
  } from '$lib/data/test-engine';
  import { SESSION_MARK } from '$lib/data/session';
  import { answersFromRatings, sanitizeAnswers, pairFacts, type PairDoc } from '$lib/model/test-pair';

  import { replaceUrl } from '$lib/ui/history';
  let { data }: { data: TestPageData } = $props();

  const c = $derived(data.copy);
  const other = $derived(LANGS.find((l) => l !== data.lang) ?? data.lang);

  /** Интерфейсные мелочи — те же слова, что на экране «Измерения» (жест один — язык один). */
  const UI = {
    ru: {
      enter: 'Войти',
      theme: 'Тема',
      saveNow: 'Сохранить сейчас',
      // Слово владельца (bugs/172): «кнопка [Сохранить] может стать, например, зелёной,
      // с текстом [Сохранено]». Та же формулировка, что на экране «Измерения».
      savedShort: 'Сохранено',
      savingIn: 'Сохраню через',
      sec: 'с',
      ratedBy: 'уже оценили:',
      progress: (n: number, m: number) => `Оценено ${n} из ${m}`,
      remove: 'Убрать оценку',
      finished: 'Набор пройден — анкета собрана и живёт в Вашем NDim ID.',
      exhausted: 'Это всё: очередь пройдена целиком.',
      saveError: 'Оценка не сохранилась. Проверьте сеть и попробуйте ещё раз.',
      // Пара (такт В) — черновик до вычитки, как и все тексты семейства.
      createLink: 'Создать личную ссылку',
      linkReady: 'Личная ссылка готова — отправьте её второму:',
      copyBtn: 'Скопировать',
      copied: 'Скопировано',
      waiting: 'Как только второй пройдёт тест, здесь появится результат.',
      checkBtn: 'Проверить',
      invited: 'Вас позвали сравниться. Оцените те же вещи — а потом нажмите «Сравнить ответы».',
      compare: 'Сравнить ответы',
      pairGone: 'Эта ссылка не действует: пары больше нет.',
      pairTaken: 'По этой ссылке уже сравнились двое.',
      resultTitle: 'Ваши совпадения',
      resultCap: 'Результат видите только вы двое — ссылка есть лишь у вас.',
      seeBelow: 'Результат готов — он ниже, в блоке совпадений.',
      matchesLabel: 'совпадений',
      tensLine: (m: number) => `Общих «десяток»: ${m}`,
      bothGave: (v: number, name: string) => `Вы оба поставили ${v} — ${name}`,
      closeRow: (name: string, a: number, b: number) => `Вы рядом в «${name}»: ${a} и ${b}`,
      differRow: (name: string, a: number, b: number) =>
        `«${name}» вы видите по-разному (${a} и ${b}) — будет о чём поговорить`,
      comparedLine: (n: number) => `Сравнили вещей: ${n}. Никаких процентов — только то, что можно проверить.`,
      noOverlap: 'Пока ни одной вещи, оценённой вами обоими, — оцените ещё.',
      deletePair: 'Удалить пару и ссылку',
    },
    en: {
      enter: 'Log in',
      theme: 'Theme',
      saveNow: 'Save now',
      savedShort: 'Saved',
      savingIn: 'Saving in',
      sec: 's',
      ratedBy: 'already rated by:',
      progress: (n: number, m: number) => `Rated ${n} of ${m}`,
      remove: 'Remove my rating',
      finished: 'Set complete — your profile is saved in your NDim ID.',
      exhausted: 'That’s all: you have been through the whole queue.',
      saveError: 'The rating was not saved. Check your connection and try again.',
      createLink: 'Create a personal link',
      linkReady: 'Your personal link is ready — send it to the second person:',
      copyBtn: 'Copy',
      copied: 'Copied',
      waiting: 'As soon as the second person finishes, the result will appear here.',
      checkBtn: 'Check',
      invited: 'You have been invited to compare. Rate the same things, then press “Compare answers”.',
      compare: 'Compare answers',
      pairGone: 'This link no longer works: the pair is gone.',
      pairTaken: 'Two people have already compared with this link.',
      resultTitle: 'Your matches',
      resultCap: 'Only the two of you can see this — the link belongs to you alone.',
      seeBelow: 'The result is ready — see the matches block below.',
      matchesLabel: 'matches',
      tensLine: (m: number) => `Shared “tens”: ${m}`,
      bothGave: (v: number, name: string) => `You both gave ${v} — ${name}`,
      closeRow: (name: string, a: number, b: number) => `You are close on “${name}”: ${a} and ${b}`,
      differRow: (name: string, a: number, b: number) =>
        `You see “${name}” differently (${a} and ${b}) — something to talk about`,
      comparedLine: (n: number) => `Things compared: ${n}. No percentages — only what you can check.`,
      noOverlap: 'No things rated by both of you yet — rate a few more.',
      deletePair: 'Delete the pair and the link',
    },
  } as const;
  const ui = $derived(UI[data.lang]);

  // ── Движок (такт Б): очередь → жест звезды → отсчёт → сохранение ─────────────────────────

  /** Канон экрана «Измерения»: выбор живёт 5 секунд и сохраняется сам. */
  const COUNTDOWN_SECONDS = 5;

  let ratings = $state<Map<string, number>>(new Map());
  let skipped = $state<Set<string>>(new Set());
  let pending = $state<{ dimId: string; value: number; left: number } | null>(null);
  let ticker: ReturnType<typeof setInterval> | null = null;
  let saveFailed = $state(false);
  let touched = false;

  const current = $derived(data.queue.find((e) => !ratings.has(e.id) && !skipped.has(e.id)) ?? null);
  const mineRows = $derived(data.queue.filter((e) => ratings.has(e.id)));
  const done = $derived(Math.min(mineRows.length, data.target));
  const finished = $derived(mineRows.length >= data.target);

  // Возврат гостя или вошедшего: свои оценки — в панель. Без маркера сессии в localStorage
  // restoreMyRatings в сеть не ходит вовсе — незнакомец из поиска не платит ни запросом.
  $effect(() => {
    void restoreMyRatings().then((mine) => {
      if (mine !== null && mine.size > 0) ratings = new Map(mine);
    });
  });

  /**
   * СОХРАНЁННАЯ КАРТОЧКА ДЕРЖИТ СВОЙ ВИД ДО СМЕНЫ ОБЪЕКТА (близнец `bugs/172`).
   *
   * Тот же дефект, что владелец нашёл на экране «Измерения» и назвал «критикал пас, core
   * функционал»: вид карточки собран из `pending` целиком — из него `starValue` берёт горящую
   * звезду, на нём же висят ряд смайликов и строка сохранения. `commit()` гасил `pending`
   * первым делом, ДО ответа базы, и на всё время записи карточка теряла звёзды, выделение,
   * смайлики и кнопку разом.
   *
   * ⚠️ ОТЛИЧИЕ ТЕРРИТОРИИ ОТ «ИЗМЕРЕНИЙ», и оно единственное: там карточка УЛЕТАЛА, и «сохранено»
   * гасилось по `outroend` её узла. Здесь карточка не улетает — `current` уходит к следующему
   * объекту сразу, как только оценка попадает в `ratings` (строка 143), и `{#key current.id}`
   * подменяет узел. Гасить по событию нечего и не нужно: у нового объекта другой `id`, поэтому
   * `held` для него пуст сам собой. Явно снимаем только там, где объект ВОЗВРАЩАЕТСЯ в очередь
   * (`unrate`) — иначе на нём висела бы зелёная кнопка от прошлой жизни.
   */
  let saved = $state<{ dimId: string; value: number } | null>(null);

  function starValue(dimId: string): number | null {
    if (pending?.dimId === dimId) return pending.value;
    // Сохранённая карточка светит своими звёздами, пока объект не сменился: между `pending = null`
    // и ответом Firestore оценки нет НИ ТАМ, НИ ТАМ, — ровно в этом окне звёзды и гасли.
    if (saved?.dimId === dimId) return saved.value;
    return ratings.get(dimId) ?? null;
  }

  function pick(dimId: string, value: number): void {
    if (!touched) {
      touched = true;
      void track('demo_touch'); // второй шаг воронки — человек потрогал живой движок
    }
    // Повторный тап по горящей звезде — отмена отсчёта (канон 1.x, bugs/54).
    // Сохранённую оценку жест звезды не удаляет — для этого «убрать» в панели-зеркале.
    if (starValue(dimId) === value) {
      if (pending?.dimId === dimId) {
        stopCountdown();
        pending = null;
      }
      return;
    }
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

  /** Сохраняет выбранное. Первая оценка без сессии молча рождает гостя (№009 В3). */
  async function commit(): Promise<void> {
    if (pending === null) return;
    const { dimId, value } = pending;
    /*
     * Вид передаётся ИЗ РУК В РУКИ, а не гаснет: `saved` встаёт ДО того, как гаснет `pending`,
     * поэтому нет ни одного кадра, в котором карточка не знала бы своей оценки (`bugs/172`).
     */
    saved = { dimId, value };
    stopCountdown();
    pending = null;
    saveFailed = false;
    try {
      myUid = await saveTestRating(data.lang, dimId, value);
    } catch {
      saveFailed = true;
      // Не сохранилось — «сохранено» снимаем: врать о карточке нельзя, и звёзды честно
      // возвращаются к тому, что лежит в `ratings`.
      saved = null;
      return;
    }
    ratings = new Map(ratings).set(dimId, value);
    // Пришёл по личной ссылке без сессии — теперь сессия есть, пару можно прочитать.
    if (pairId !== null && pair === null && !pairLost) void refreshPair();
  }

  /** «Убрать» в панели: оценка уходит из базы, карточка возвращается в очередь. */
  async function unrate(dimId: string): Promise<void> {
    saveFailed = false;
    try {
      await removeTestRating(dimId);
    } catch {
      saveFailed = true;
      return;
    }
    const next = new Map(ratings);
    next.delete(dimId);
    ratings = next;
    // Объект возвращается в очередь — снимаем с него «сохранено», иначе он всплыл бы с зелёной
    // кнопкой от прошлой жизни (`bugs/172`, ветка отмены).
    if (saved?.dimId === dimId) saved = null;
  }

  function skip(): void {
    if (current === null) return;
    if (pending?.dimId === current.id) {
      stopCountdown();
      pending = null;
    }
    skipped = new Set(skipped).add(current.id);
  }

  // ── Пара (такт В): личная ссылка → второй проходит те же вещи → результат фактами ────────

  let pairId = $state<string | null>(null); // из ?pair=… ИЛИ созданная в этой вкладке
  let pair = $state<PairDoc | null>(null);
  let pairLost = $state(false); // ссылка не действует (пары нет)
  let myUid = $state<string | null>(null);
  let copied = $state(false);
  let busyPair = $state(false);

  const queueIds = $derived(data.queue.map((e) => e.id));
  /*
   * В строки результата идёт ПОДПИСЬ (имя · вид, год), а не голое имя: результат читают двое,
   * и второй вещей не выбирал — «Вы оба поставили 8» и «Вы оба поставили 6» под одинаковым
   * именем были бы для него загадкой (`bugs/126`, интервью №032).
   */
  const nameOf = $derived(new Map(data.queue.map((e) => [e.id, e.label])));
  const iAmCreator = $derived(pair !== null && myUid !== null && pair.aUid === myUid);
  const pairReady = $derived(pair !== null && pair.bUid !== null);
  /** Пара сложилась без меня — ссылка «занята» (для незнакомца и для третьего). */
  const pairTaken = $derived(
    pair !== null && pair.bUid !== null && pair.aUid !== myUid && pair.bUid !== myUid,
  );
  const shareLink = $derived(pairId === null ? '' : `${data.canonical}?pair=${pairId}`);

  /** Результат: только для участника сложившейся пары. Чужие ответы — через защитный фильтр. */
  const liveFacts = $derived.by(() => {
    if (pair === null || pair.bUid === null || myUid === null) return null;
    if (pair.aUid !== myUid && pair.bUid !== myUid) return null;
    const allowed = new Set(queueIds);
    const mineIsA = pair.aUid === myUid;
    return pairFacts(
      sanitizeAnswers(mineIsA ? pair.aAnswers : pair.bAnswers, allowed),
      sanitizeAnswers(mineIsA ? pair.bAnswers : pair.aAnswers, allowed),
      queueIds,
    );
  });

  // ?pair из адреса — только на клиенте (страница пререндерена без query).
  $effect(() => {
    const fromUrl = new URLSearchParams(location.search).get('pair');
    if (fromUrl !== null && /^[a-z0-9-]{20,}$/i.test(fromUrl)) pairId = fromUrl;
  });

  // Пару читаем, когда сессия УЖЕ есть (маркер). Незнакомцу по ссылке сессию молча не заводим
  // (канон `profile.ts`) — его пара прочитается после первой оценки, вместе с рождением гостя.
  $effect(() => {
    if (pairId === null) return;
    try {
      if (localStorage.getItem(SESSION_MARK) === null) return;
    } catch {
      return;
    }
    void refreshPair();
  });

  async function refreshPair(): Promise<void> {
    if (pairId === null) return;
    try {
      myUid = await currentUid();
      const found = await loadPair(pairId);
      pair = found;
      pairLost = found === null;
    } catch {
      // сеть моргнула — не делаем выводов, кнопка «Проверить» остаётся
    }
  }

  /** «Создать личную ссылку» — кладёт МОЮ половину (пересечение оценок с набором, №002 В4). */
  async function makeLink(): Promise<void> {
    busyPair = true;
    saveFailed = false;
    try {
      const id = await createPair(data.slug, answersFromRatings(ratings, queueIds));
      if (id !== null) {
        pairId = id;
        await refreshPair();
      }
    } catch {
      saveFailed = true;
    } finally {
      busyPair = false;
    }
  }

  /** «Сравнить ответы» — половина второго. Гонку двух «вторых» решают правила, не мы. */
  async function compare(): Promise<void> {
    if (pairId === null) return;
    busyPair = true;
    saveFailed = false;
    try {
      if (pair === null) await refreshPair();
      if (pair === null || pair.bUid !== null) return; // занята или пропала — состояние уже честное
      await joinPair(pairId, pair, answersFromRatings(ratings, queueIds));
    } catch {
      // отказ правил (гонка) — перечитаем и покажем правду
    } finally {
      await refreshPair();
      busyPair = false;
    }
  }

  /** Право забрать свои ответы: пара удаляется целиком (№002 В4). */
  async function removePair(): Promise<void> {
    if (pairId === null) return;
    busyPair = true;
    try {
      await deletePair(pairId);
      pair = null;
      pairId = null;
      pairLost = false;
      replaceUrl(location.pathname);
    } catch {
      saveFailed = true;
    } finally {
      busyPair = false;
    }
  }

  function copyLink(): void {
    void navigator.clipboard?.writeText(shareLink).then(() => {
      copied = true;
      setTimeout(() => (copied = false), 2000);
    });
  }
</script>

<svelte:head>
  <title>{c.metaTitle}</title>
  {#if pairId !== null}
    <!-- Непубличная ссылка пары (№028): вариант с ?pair прямо просит робота не индексировать.
         Пререндер этого не несёт — мета появляется только у живой страницы с query. -->
    <meta name="robots" content="noindex" />
  {/if}
  <meta name="description" content={c.metaDesc} />
  <link rel="canonical" href={data.canonical} />
  {#each data.alternates as alt (alt.hreflang)}
    <link rel="alternate" hreflang={alt.hreflang} href={alt.href} />
  {/each}
  <meta property="og:type" content="website" />
  <meta property="og:title" content={c.metaTitle} />
  <meta property="og:description" content={c.metaDesc} />
  <meta property="og:url" content={data.canonical} />
  <meta property="og:locale" content={data.lang === 'en' ? 'en_US' : 'ru_RU'} />
</svelte:head>

<!-- Шапка публичной страницы — тот же состав, что у страниц каталога (`bugs/114`). -->
<header class="bar">
  <a class="brand" href="/">
    <Brand size={26} />
    <span>NDim Space</span>
  </a>
  <a class="langsw" href="/{other}/test/{data.slug}" hreflang={other}>{LANG_LABEL[other]}</a>
  <!-- Кнопка темы без клиентского JS: обработчик вешает инлайн-скрипт `app.html` по id,
       значок переключают стили по `data-theme`. -->
  <button type="button" id="theme-toggle" class="theme" title={ui.theme} aria-label={ui.theme}>
    <span class="ic sun"><Icon name="sun" size={15} /></span>
    <span class="ic moon"><Icon name="moon" size={15} /></span>
  </button>
  <a class="enter" href="/profile">{ui.enter}</a>
</header>

<article class="test">
  <header>
    <h1>{c.h1}</h1>
    <p class="sub">{c.sub}</p>
    <p class="lede">
      {#each c.facts as f (f)}<span><i>✓</i> {f}</span>{/each}
    </p>
  </header>

  <!-- Компактная полоса трёх шагов — «инструкция как в v2», ужатая до строки на шаг (V5). -->
  <ol class="steps">
    {#each c.steps as s, i (i)}
      <li><span class="n">{i + 1}</span><span class="tt"><b>{s.lead}</b> {s.rest}</span></li>
    {/each}
  </ol>

  <!-- Движок и растущая анкета рядом — «зеркало» (V4-половина каркаса). -->
  <div class="two">
    <section class="qcard" aria-label={c.h1}>
      {#if current !== null}
        <!--
          Состояние жеста этой карточки одним объектом (близнец bugs/172): либо идёт отсчёт
          (`pending`), либо оценка уже сохранена и объект вот-вот сменится (`saved`). Вид у двух
          состояний ОДИН И ТОТ ЖЕ — в этом вся суть починки; различается только содержимое
          строки сохранения.
          ⚠️ Объявление стоит ЗДЕСЬ, непосредственным ребёнком `{#if}`, а не рядом с местом
          применения: `{@const}` в Svelte законен только непосредственным ребёнком блока, а
          внутри `{#key}` → `<div>` он уже вложен в элемент. На экране «Измерения» тот же
          `held` живёт внутри `{#each}` и потому стоит рядом с разметкой — разница территории,
          не замысла.
        -->
        {@const held =
          pending?.dimId === current.id
            ? { value: pending.value, left: pending.left, done: false }
            : saved?.dimId === current.id
              ? { value: saved.value, left: 0, done: true }
              : null}
        {#key current.id}
          <div in:fly={{ x: 32, duration: MOTION.base }}>
            <p class="kind">{current.kind}</p>
            <p class="name">{current.name}</p>
            <p class="meta">
              {current.year}{#if current.rates >= RATED_FACT_FROM}<span class="rby">
                  {current.year === '' ? '' : ' · '}{ui.ratedBy} {current.rates}</span>{/if}
            </p>

            <!-- Одиннадцать звёзд 0…10 с цифрами — жест оценки, канон экрана «Измерения». -->
            <div class="starsrow" role="group">
              {#each Array(11) as _, value (value)}
                {@const mine = starValue(current.id)}
                <button
                  type="button"
                  class="st"
                  class:fill={mine !== null && value <= mine && mine !== 0}
                  class:peak={mine === value && mine !== 0}
                  class:zero={mine === 0 && value === 0}
                  aria-label={String(value)}
                  onclick={() => pick(current.id, value)}
                >
                  <i>{mine !== null && value <= mine ? '★' : '☆'}</i><b>{value}</b>
                </button>
              {/each}
            </div>
            <p class="scale"><span>{data.chrome.scale0}</span><span>{data.chrome.scale10}</span></p>

            {#if held}
              <!-- Ряд смайликов под звёздами + отсчёт — как на экране «Измерения» (bugs/80). -->
              <div class="faces" aria-hidden="true" transition:slide={{ duration: MOTION.base }}>
                {#each GRADE_FACES as _, grade (grade)}
                  <span class="fc" class:picked={held.value === grade}>
                    <GradeFace {grade} size={22} />
                  </span>
                {/each}
              </div>
              <!--
                🔑 Пустой `<span>` в сохранённом состоянии стоит НАМЕРЕННО: строка разложена
                `space-between`, и без левого узла кнопка прыгнула бы влево — то есть карточка
                снова «поменяла бы вид», уже нашими руками.
              -->
              <div class="countdown" transition:slide={{ duration: MOTION.base }}>
                {#if held.done}
                  <span></span>
                  <button type="button" class="now done" disabled>{ui.savedShort}</button>
                {:else}
                  <span>{ui.savingIn} {held.left} {ui.sec}…</span>
                  <button type="button" class="now" onclick={() => void commit()}>{ui.saveNow}</button>
                {/if}
              </div>
            {/if}

            <button type="button" class="skip" onclick={skip}>{data.chrome.skip}</button>
          </div>
        {/key}
      {:else}
        <p class="drained">{ui.exhausted}</p>
      {/if}
      {#if saveFailed}
        <p class="err" transition:slide={{ duration: MOTION.base }}>{ui.saveError}</p>
      {/if}
    </section>

    <aside class="mirror">
      <h2>{c.mirrorTitle}</h2>
      {#if mineRows.length === 0}
        <p class="empty">{c.mirrorEmpty}</p>
      {:else}
        <p class="progress" class:full={finished}>{ui.progress(done, data.target)}</p>
        <ul class="rows">
          {#each mineRows as row (row.id)}
            <li transition:slide={{ duration: MOTION.fast }}>
              <!-- Подпись с видом и годом, а не голое имя: в каталоге 148 имён носят по
                   несколько разных вещей, и две строки выглядели одной (`bugs/126`, №032 В1=В). -->
              <span class="rname">{row.label}</span>
              <span class="rval"><b>{ratings.get(row.id)}</b>/10</span>
              <button type="button" class="rm" title={ui.remove} aria-label={ui.remove} onclick={() => void unrate(row.id)}>✕</button>
            </li>
          {/each}
        </ul>
        {#if finished}
          <p class="fin" transition:slide={{ duration: MOTION.base }}>{ui.finished}</p>
        {/if}
      {/if}
    </aside>
  </div>

  <!-- Приглашение второго: личная ссылка (такт В). Состояния — по ролям пары. -->
  <section class="invite">
    <h2>{c.inviteTitle}</h2>
    {#if pairLost}
      <p class="warn">{ui.pairGone}</p>
    {:else if pairTaken}
      <p class="warn">{ui.pairTaken}</p>
    {:else if pairId !== null && pairReady}
      <p class="fine">{ui.seeBelow}</p>
    {:else if pairId !== null && iAmCreator}
      <p>{ui.linkReady}</p>
      <p class="share">
        <code>{shareLink}</code>
        <button type="button" class="copy" onclick={copyLink}>{copied ? ui.copied : ui.copyBtn}</button>
      </p>
      <p class="fine">
        {ui.waiting}
        <button type="button" class="checkbtn" onclick={() => void refreshPair()} disabled={busyPair}>{ui.checkBtn}</button>
      </p>
    {:else if pairId !== null}
      <p>{ui.invited}</p>
      {#if mineRows.length > 0}
        <button type="button" class="pairbtn" onclick={() => void compare()} disabled={busyPair}>{ui.compare}</button>
      {/if}
      <p class="fine">{c.inviteNote}</p>
    {:else if finished}
      <button type="button" class="pairbtn" onclick={() => void makeLink()} disabled={busyPair}>{ui.createLink}</button>
      <p class="fine">{c.inviteNote}</p>
    {:else}
      <p>{c.inviteBody}</p>
      <p class="fine">{c.inviteNote}</p>
    {/if}
  </section>

  <!-- Результат. Пока пары нет — пример формы (имена вымышлены, подпись говорит это прямо);
       у сложившейся пары — ЖИВЫЕ факты. Ни процентов, ни похожести — закрытый набор полей
       `pairFacts` стережёт тест (критерий 5 фазы). -->
  <section class="result">
    {#if liveFacts !== null}
      <h2>{ui.resultTitle}</h2>
      <div class="pair">
        <p class="cap">{ui.resultCap}</p>
        {#if data.slug === 'love'}
          <!-- Счёт совпадений-фактов — форма результата любви (№028, В3 = А). -->
          <p class="bigcount"><span class="n">{liveFacts.exact.length}</span> <span>{ui.matchesLabel}</span></p>
          <p class="subcount">{ui.tensLine(liveFacts.tens.length)}</p>
        {/if}
        {#if liveFacts.compared === 0}
          <p class="rfoot">{ui.noOverlap}</p>
        {:else}
          <ul class="facts">
            {#each liveFacts.exact as r (r.id)}
              <li><span class="ic">⭐</span><span>{ui.bothGave(r.a, nameOf.get(r.id) ?? '')}</span></li>
            {/each}
            {#each liveFacts.close as r (r.id)}
              <li><span class="ic">🤝</span><span>{ui.closeRow(nameOf.get(r.id) ?? '', r.a, r.b)}</span></li>
            {/each}
            {#each liveFacts.differ as r (r.id)}
              <li><span class="ic">💬</span><span>{ui.differRow(nameOf.get(r.id) ?? '', r.a, r.b)}</span></li>
            {/each}
          </ul>
          <p class="rfoot">{ui.comparedLine(liveFacts.compared)}</p>
        {/if}
        <button type="button" class="unlink" onclick={() => void removePair()} disabled={busyPair}>{ui.deletePair}</button>
      </div>
    {:else}
      <h2>{c.resultTitle}</h2>
      <div class="pair">
        <p class="cap">{c.resultCaption}</p>
        {#if c.resultCount}
          <p class="bigcount"><span class="n">{c.resultCount.n}</span> <span>{c.resultCount.label}</span></p>
          <p class="subcount">{c.resultCount.sub}</p>
        {/if}
        <ul class="facts">
          {#each c.resultRows as r (r.text)}
            <li><span class="ic">{r.icon}</span><span>{r.text}</span></li>
          {/each}
        </ul>
        <p class="rfoot">{c.resultFoot}</p>
      </div>
    {/if}
  </section>

  <!-- Мост-паспорт: кнопки появляются вместе с анкетой — сохранять пустоту было бы обманом. -->
  <section class="keep">
    <h2>{c.keepTitle}</h2>
    <p>{c.keepBody}</p>
    {#if mineRows.length > 0}
      <div class="keepacts" transition:slide={{ duration: MOTION.base }}>
        <a class="cta" href="/profile">{c.keepCta}</a>
        <a class="ghost" href="#top" onclick={(e) => { e.preventDefault(); document.querySelector('.qcard')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>{c.keepGhost}</a>
      </div>
    {/if}
  </section>

  <section class="faq" aria-label="FAQ">
    {#each c.faq as f, i (f.q)}
      <details open={i === 0}>
        <summary>{f.q}</summary>
        <p>{f.a}</p>
      </details>
    {/each}
  </section>

  <nav class="cross" aria-label="NDim Space">
    {#each c.crossLinks as l (l.slug)}
      <a href="/{data.lang}/test/{l.slug}">{l.text} →</a>
    {/each}
    <a href="/{data.lang}/tests">{data.lang === 'en' ? 'All tests' : 'Все тесты'} →</a>
  </nav>

  <p class="foot">{data.foot}</p>
</article>

<style>
  /* Шапка — копия шапки страниц каталога: две публичные шапки одного продукта не должны
     отличаться на глаз. */
  .bar {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 52px;
    padding: 0 1rem;
    background: var(--panel);
    border-bottom: 1px solid var(--edge);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 700;
    color: var(--heading);
    text-decoration: none;
  }
  .langsw {
    margin-left: auto;
    padding: 0.4rem 0.7rem;
    border-radius: 999px;
    border: 1px solid var(--edge);
    color: var(--dim);
    font-weight: 600;
    font-size: 0.85rem;
    text-decoration: none;
  }
  .theme {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    padding: 0;
    flex: none;
    border-radius: 10px;
    border: 1px solid var(--edge);
    background: transparent;
    color: var(--dim);
    cursor: pointer;
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
  .enter {
    padding: 0.4rem 0.9rem;
    border-radius: 999px;
    background: var(--primary);
    color: var(--primary-ink);
    font-weight: 600;
    font-size: 0.85rem;
    text-decoration: none;
  }

  .test {
    max-width: 46rem;
    margin: 0 auto;
    padding: 1.5rem 1rem 3.5rem;
    color: var(--text);
  }

  h1 {
    margin: 0;
    font-size: clamp(1.5rem, 4.5vw, 2rem);
    line-height: 1.18;
    color: var(--heading);
  }
  .sub {
    margin: 0.5rem 0 0;
    font-size: 0.95rem;
    line-height: 1.55;
    color: var(--dim);
  }
  .lede {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.8rem;
    margin: 0.6rem 0 0;
    font-size: 0.78rem;
    color: var(--faint);
  }
  .lede i {
    font-style: normal;
    color: var(--ok, #2e9e6b);
  }

  /* Компактная полоса шагов (V5): инструкция есть, движок не уезжает за сгиб. */
  .steps {
    display: grid;
    gap: 0.4rem;
    margin: 0.9rem 0 0.4rem;
    padding: 0;
    list-style: none;
  }
  .steps li {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0.75rem;
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 12px;
    font-size: 0.83rem;
    line-height: 1.4;
  }
  .steps .n {
    display: grid;
    place-items: center;
    flex: none;
    width: 20px;
    height: 20px;
    border-radius: 999px;
    background: var(--primary);
    color: var(--primary-ink);
    font-size: 0.7rem;
    font-weight: 700;
  }
  .steps b {
    color: var(--heading);
  }

  .two {
    display: grid;
    gap: 0.9rem;
    margin: 0.7rem 0 0;
  }

  .qcard {
    padding: 1rem;
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 16px;
    box-shadow: var(--card-shadow);
  }
  .qcard .kind {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .qcard .name {
    margin: 0.2rem 0 0;
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--heading);
  }
  .qcard .meta {
    margin: 0;
    font-size: 0.78rem;
    color: var(--faint);
  }
  .qcard .drained {
    margin: 0;
    font-size: 0.9rem;
    color: var(--dim);
  }
  .qcard .err {
    margin: 0.6rem 0 0;
    font-size: 0.8rem;
    color: var(--danger, #c0392b);
  }

  /* Жест звезды — раскладка и язык выделения экрана «Измерения» (один жест — один вид). */
  .starsrow {
    display: flex;
    gap: 2px;
    margin: 0.6rem 0 0;
  }
  .st {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    background: none;
    border: 0;
    cursor: pointer;
    border-radius: 9px;
    padding: 4px 0;
    transition: background 0.15s ease, transform 0.12s ease;
  }
  @media (hover: hover) {
    .st:hover {
      background: var(--edge-soft);
      transform: translateY(-2px);
    }
  }
  .st i {
    font-style: normal;
    font-size: 22px;
    line-height: 1;
    color: color-mix(in srgb, var(--faint) 55%, transparent);
    transition: color 0.15s ease, transform 0.15s ease, filter 0.15s ease;
  }
  .st b {
    font-size: 10px;
    font-weight: 600;
    color: var(--faint);
    transition: color 0.15s ease;
  }
  .st.fill i,
  .st.fill b {
    color: #f5a524;
  }
  .st.peak i {
    color: #ffc247;
    filter: drop-shadow(0 0 6px color-mix(in srgb, var(--glow) 45%, transparent));
    transform: scale(1.12);
  }
  .st.peak b {
    color: #ffc247;
  }
  /* Ноль — осознанная оценка «ноль», а не золото. Он серый. */
  .st.zero i {
    color: var(--faint);
    transform: scale(1.08);
  }
  .st.zero b {
    color: var(--faint);
  }

  .scale {
    display: flex;
    justify-content: space-between;
    margin: 0.15rem 0 0;
    font-size: 0.68rem;
    color: var(--faint);
  }

  /* Ряд смайликов — та же flex-раскладка, что у звёзд: лицо стоит точно под своей оценкой. */
  .faces {
    display: flex;
    gap: 2px;
    margin-top: 2px;
  }
  .fc {
    flex: 1;
    display: flex;
    justify-content: center;
    opacity: 0.8;
    transition:
      opacity var(--motion-base) var(--motion-ease),
      transform var(--motion-base) var(--motion-ease),
      filter var(--motion-base) var(--motion-ease);
  }
  /* Ореол — токеном --glow, не золотом: на белой «Бумаге» свечения не бывает (bugs/80). */
  .fc.picked {
    opacity: 1;
    transform: scale(1.15);
    filter: drop-shadow(0 0 7px color-mix(in srgb, var(--glow) 60%, transparent));
  }

  .countdown {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px dashed var(--edge-soft);
    color: var(--dim);
    font-size: 13px;
  }
  .now {
    background: var(--primary);
    border: 0;
    color: var(--primary-ink);
    font: inherit;
    font-size: 13px;
    border-radius: 999px;
    padding: 6px 14px;
    cursor: pointer;
  }
  /* Сохранено (близнец `bugs/172`). Геометрия та же — меняются только цвет и текст, иначе
     карточка «поменяла бы вид» ровно тем движением, которым мы это чиним.
     Цвет и текст ставим ЯВНО: браузер сам красит `disabled`-кнопку в серое.
     🔑 Селектор с `:disabled` — тот же, что на экране «Измерения», и не для симметрии: там
     ниже по файлу живёт `.now:disabled { opacity: .5 }` той же специфичности, и замер поймал,
     что зелёный владельца приезжал выцветшим вдвое. Здесь такого правила пока нет; селектор
     стоит на случай, когда оно появится, — чтобы дефект не вернулся молча. */
  .now.done,
  .now.done:disabled {
    background: var(--ok);
    color: var(--ok-ink);
    cursor: default;
    opacity: 1;
  }

  .skip {
    display: block;
    margin: 0.55rem 0 0;
    padding: 0;
    background: none;
    border: 0;
    font: inherit;
    font-size: 0.8rem;
    color: var(--dim);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }

  .mirror {
    padding: 0.9rem 1rem;
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 16px;
    box-shadow: var(--card-shadow);
  }
  .mirror h2,
  .invite h2,
  .result h2,
  .keep h2 {
    margin: 0 0 0.45rem;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .result h2,
  .keep h2 {
    font-size: 1.05rem;
    letter-spacing: 0;
    text-transform: none;
    color: var(--heading);
  }
  .mirror .empty {
    margin: 0;
    font-size: 0.85rem;
    line-height: 1.5;
    color: var(--dim);
  }
  .mirror .progress {
    margin: 0 0 0.4rem;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--dim);
  }
  .mirror .progress.full {
    color: var(--ok, #2e9e6b);
  }
  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .rows li {
    display: flex;
    /*
     * По ВЕРХУ, а не по центру (`bugs/120`): название переносится на несколько строк, и при
     * `center` оценка и «✕» уплыли бы на середину имени.
     */
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.32rem 0;
    font-size: 0.84rem;
    line-height: 1.35;
  }
  .rows li + li {
    border-top: 1px dashed var(--edge);
  }
  /*
   * 🔴 ЗАКОН ВЛАДЕЛЬЦА 2026-08-14: «названия не должны обрезаться троеточием, всегда полностью
   * влазят — ЭТО ЗАКОН. если длинное — карточка растет по высоте». Поэтому здесь НЕТ и не
   * может быть `white-space: nowrap`, `text-overflow: ellipsis`, `-webkit-line-clamp`
   * (`bugs/120`). Строка свободно переносится, панель растёт.
   * Стережёт `tools/probe-test-guest-live.mjs` — пиксельно, на 390 и 1440.
   */
  .rows .rname {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .rows .rval {
    flex: none;
    color: var(--faint);
    font-size: 0.78rem;
  }
  .rows .rval b {
    color: #f5a524;
    font-size: 0.9rem;
  }
  .rows .rm {
    flex: none;
    width: 22px;
    height: 22px;
    padding: 0;
    background: none;
    border: 0;
    border-radius: 6px;
    color: var(--faint);
    font-size: 0.75rem;
    cursor: pointer;
  }
  @media (hover: hover) {
    .rows .rm:hover {
      background: var(--edge-soft);
      color: var(--dim);
    }
  }
  .mirror .fin {
    margin: 0.5rem 0 0;
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--ok, #2e9e6b);
  }

  .invite {
    margin: 1.1rem 0 0;
    padding: 0.9rem 1rem;
    border: 1.5px dashed var(--accent);
    border-radius: 16px;
  }
  .invite h2 {
    font-size: 0.95rem;
    letter-spacing: 0;
    text-transform: none;
    color: var(--heading);
  }
  .invite p {
    margin: 0;
    font-size: 0.85rem;
    line-height: 1.5;
  }
  .invite .fine {
    margin-top: 0.4rem;
    font-size: 0.73rem;
    color: var(--faint);
  }
  .invite .warn {
    margin: 0;
    font-size: 0.85rem;
    color: var(--danger, #c0392b);
  }
  .pairbtn {
    margin-top: 0.35rem;
    padding: 0.45rem 1rem;
    border: 0;
    border-radius: 999px;
    background: var(--primary);
    color: var(--primary-ink);
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }
  .pairbtn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .share {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.4rem 0 0;
    min-width: 0;
  }
  .share code {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0.35rem 0.6rem;
    background: var(--edge-soft);
    border-radius: 8px;
    font-size: 0.72rem;
  }
  .share .copy,
  .checkbtn {
    flex: none;
    padding: 0.35rem 0.8rem;
    border: 1px solid var(--edge);
    border-radius: 999px;
    background: transparent;
    color: var(--dim);
    font: inherit;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
  }
  .unlink {
    display: block;
    margin: 0.7rem 0 0;
    padding: 0;
    background: none;
    border: 0;
    font: inherit;
    font-size: 0.75rem;
    color: var(--faint);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }

  .result {
    margin: 1.3rem 0 0;
  }
  .pair {
    padding: 0.95rem 1rem;
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 16px;
    box-shadow: var(--card-shadow);
  }
  .pair .cap {
    margin: 0 0 0.4rem;
    font-size: 0.78rem;
    color: var(--faint);
  }
  .bigcount {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin: 0;
  }
  .bigcount .n {
    font-size: 2.1rem;
    font-weight: 800;
    line-height: 1;
    color: var(--heading);
  }
  .subcount {
    margin: 0.15rem 0 0.4rem;
    font-size: 0.8rem;
    color: var(--dim);
  }
  .facts {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .facts li {
    display: flex;
    gap: 0.55rem;
    align-items: flex-start;
    padding: 0.4rem 0;
    font-size: 0.87rem;
    line-height: 1.45;
  }
  .facts li + li {
    border-top: 1px dashed var(--edge);
  }
  .facts .ic {
    flex: none;
    width: 1.3rem;
    text-align: center;
  }
  .rfoot {
    margin: 0.5rem 0 0;
    font-size: 0.8rem;
    color: var(--dim);
  }

  .keep {
    margin: 1.3rem 0 0;
    padding: 0.9rem 1rem;
    background: var(--edge-soft);
    border: 1px solid var(--edge);
    border-radius: 16px;
  }
  .keep p {
    margin: 0;
    font-size: 0.85rem;
    line-height: 1.55;
  }
  .keepacts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.7rem;
  }
  .keepacts .cta {
    padding: 0.45rem 1rem;
    border-radius: 999px;
    background: var(--primary);
    color: var(--primary-ink);
    font-weight: 600;
    font-size: 0.85rem;
    text-decoration: none;
  }
  .keepacts .ghost {
    padding: 0.45rem 1rem;
    border-radius: 999px;
    border: 1px solid var(--edge);
    color: var(--dim);
    font-weight: 600;
    font-size: 0.85rem;
    text-decoration: none;
  }

  .faq {
    margin: 1.3rem 0 0;
  }
  .faq details {
    padding: 0.55rem 0.15rem;
    border-top: 1px solid var(--edge);
  }
  .faq details:last-child {
    border-bottom: 1px solid var(--edge);
  }
  .faq summary {
    font-size: 0.87rem;
    font-weight: 600;
    color: var(--heading);
    cursor: pointer;
  }
  .faq p {
    margin: 0.45rem 0 0.1rem;
    font-size: 0.84rem;
    line-height: 1.55;
  }

  .cross {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin: 1.2rem 0 0;
  }
  .cross a {
    font-size: 0.87rem;
    font-weight: 600;
    color: var(--accent);
    text-decoration: none;
  }

  .foot {
    margin: 1.6rem 0 0;
    padding-top: 0.8rem;
    border-top: 1px solid var(--edge);
    font-size: 0.78rem;
    line-height: 1.55;
    color: var(--faint);
  }

  /* Десктоп: движок и анкета рядом (каркас V5), колонка шире читательской. */
  @media (min-width: 1024px) {
    .test {
      max-width: 64rem;
      padding: 2rem 1.5rem 4rem;
    }
    .steps {
      grid-template-columns: 1fr 1fr 1fr;
    }
    .two {
      grid-template-columns: 1.25fr 1fr;
      align-items: start;
    }
  }
</style>

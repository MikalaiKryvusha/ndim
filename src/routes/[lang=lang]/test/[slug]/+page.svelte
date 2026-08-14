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
  import { restoreMyRatings, saveTestRating, removeTestRating } from '$lib/data/test-engine';

  let { data }: { data: TestPageData } = $props();

  const c = $derived(data.copy);
  const other = $derived(LANGS.find((l) => l !== data.lang) ?? data.lang);

  /** Интерфейсные мелочи — те же слова, что на экране «Измерения» (жест один — язык один). */
  const UI = {
    ru: {
      enter: 'Войти',
      theme: 'Тема',
      saveNow: 'Сохранить сейчас',
      savingIn: 'Сохраню через',
      sec: 'с',
      ratedBy: 'уже оценили:',
      progress: (n: number, m: number) => `Оценено ${n} из ${m}`,
      remove: 'Убрать оценку',
      finished: 'Набор пройден — анкета собрана и живёт в Вашем NDim ID.',
      exhausted: 'Это всё: очередь пройдена целиком.',
      saveError: 'Оценка не сохранилась. Проверьте сеть и попробуйте ещё раз.',
    },
    en: {
      enter: 'Log in',
      theme: 'Theme',
      saveNow: 'Save now',
      savingIn: 'Saving in',
      sec: 's',
      ratedBy: 'already rated by:',
      progress: (n: number, m: number) => `Rated ${n} of ${m}`,
      remove: 'Remove my rating',
      finished: 'Set complete — your profile is saved in your NDim ID.',
      exhausted: 'That’s all: you have been through the whole queue.',
      saveError: 'The rating was not saved. Check your connection and try again.',
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

  function starValue(dimId: string): number | null {
    if (pending?.dimId === dimId) return pending.value;
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
    stopCountdown();
    pending = null;
    saveFailed = false;
    try {
      await saveTestRating(data.lang, dimId, value);
    } catch {
      saveFailed = true;
      return;
    }
    ratings = new Map(ratings).set(dimId, value);
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
  }

  function skip(): void {
    if (current === null) return;
    if (pending?.dimId === current.id) {
      stopCountdown();
      pending = null;
    }
    skipped = new Set(skipped).add(current.id);
  }
</script>

<svelte:head>
  <title>{c.metaTitle}</title>
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

            {#if pending?.dimId === current.id}
              <!-- Ряд смайликов под звёздами + отсчёт — как на экране «Измерения» (bugs/80). -->
              <div class="faces" aria-hidden="true" transition:slide={{ duration: MOTION.base }}>
                {#each GRADE_FACES as _, grade (grade)}
                  <span class="fc" class:picked={pending.value === grade}>
                    <GradeFace {grade} size={22} />
                  </span>
                {/each}
              </div>
              <div class="countdown" transition:slide={{ duration: MOTION.base }}>
                <span>{ui.savingIn} {pending.left} {ui.sec}…</span>
                <button type="button" class="now" onclick={() => void commit()}>{ui.saveNow}</button>
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
              <span class="rname">{row.name}</span>
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

  <!-- Приглашение второго: личная ссылка по механике рождается тактом В. -->
  <section class="invite">
    <h2>{c.inviteTitle}</h2>
    <p>{c.inviteBody}</p>
    <p class="fine">{c.inviteNote}</p>
  </section>

  <!-- Пример результата: имена вымышлены, числа — иллюстрация формы, подпись говорит это прямо. -->
  <section class="result">
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
    align-items: center;
    gap: 0.5rem;
    padding: 0.32rem 0;
    font-size: 0.84rem;
    line-height: 1.35;
  }
  .rows li + li {
    border-top: 1px dashed var(--edge);
  }
  .rows .rname {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

<script lang="ts">
  // Экран «Связи» — топ похожих людей. Макет S4 утверждён владельцем 2026-07-11
  // («Утверждено, работаем») с двумя его правками:
  //   · в СВЁРНУТОЙ карточке видны сразу все три метрики (как в 1.x);
  //   · сила метрики — «яркость связи»: слабая (<30) гаснет в серо-синий,
  //     средняя (30–59) — синий, сильная (≥60) — циан и светится.
  // Раскрытие добавляет «наше общее пространство» (математика на витрине, как в 1.x)
  // и кнопку «Написать» — задел под чаты (ideas/04), пока «скоро».
  //
  // Данные пишет вычислитель (calculator/), клиенту запись запрещена правилами.
  // «Был онлайн» гостя намеренно НЕ показывается: в модели 2.0 зрителю доступен
  // только публичный бакет профиля гостя (researches/04).
  import { onMount } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fly, slide } from 'svelte/transition';
  import AppBar from '$lib/ui/AppBar.svelte';
  import Avatar from '$lib/ui/Avatar.svelte';
  import BottomNav from '$lib/ui/BottomNav.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import SideRail from '$lib/ui/SideRail.svelte';
  import { currentSession } from '$lib/data/profile';
  import { loadRelations, strengthLevel, type RelationsScreenData } from '$lib/data/relations';
  import { technicalDetail } from '$lib/ui/errors';
  import { dateOnly, dimsUnit, starsUnit, type Lang } from '$lib/ui/format';
  import { MOTION } from '$lib/ui/motion';
  import type { Localized } from '$lib/model/schema';

  let lang = $state<Lang>('ru');
  // 'prod' — публичный домен: экраны 2.0 ещё не открыты, показываем заглушку со ссылкой на 1.x.
  let stand = $state<'connecting' | 'ready' | 'down' | 'signedout'>('connecting');
  let standError = $state('');
  let data = $state<RelationsScreenData | null>(null);
  let expanded = $state<string | null>(null);

  /**
   * Подсказки метрик (bugs/24) — как в 1.x: у каждой метрики иконка ⓘ, тап раскрывает
   * объяснение. Тексты — ДОСЛОВНО из 1.x (сняты в researches/12; те же определения — в
   * руководстве, researches/07 §3). Открыта одна подсказка за раз; повторный тап закрывает.
   */
  let hintFor = $state<{ uid: string; metric: (typeof TRIO)[number] } | null>(null);

  function toggleHint(uid: string, metric: (typeof TRIO)[number]): void {
    hintFor = hintFor?.uid === uid && hintFor.metric === metric ? null : { uid, metric };
  }

  /**
   * Прогрессивное раскрытие (bugs/13): топ приходит ОДНИМ документом (чтений больше не
   * становится), но рисовать все 250 карточек разом незачем — раскрываем порциями по мере
   * прокрутки, якорем за пределами вьюпорта, как в 1.x.
   */
  const REVEAL_PORTION = 24;
  let revealed = $state(REVEAL_PORTION);
  let sentinel: HTMLElement | null = $state(null);

  $effect(() => {
    if (sentinel === null || data === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && data !== null) {
          revealed = Math.min(revealed + REVEAL_PORTION, data.cards.length);
        }
      },
      // Якорь срабатывает за ~600px до края экрана — догрузка невидима (bugs/13).
      { rootMargin: '600px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  });

  onMount(async () => {
    const saved = localStorage.getItem('ndim-lang');
    if (saved === 'en' || saved === 'ru') lang = saved;
    try {
      // Связи — величина приватная: без входа их не существует, и показывать здесь нечего.
      const uid = await currentSession();
      if (uid === null) {
        stand = 'signedout';
        return;
      }
      data = await loadRelations(uid);
      stand = 'ready';
    } catch (error) {
      standError = technicalDetail(error);
      stand = 'down';
    }
  });

  function toggleLang() {
    lang = lang === 'ru' ? 'en' : 'ru';
    document.documentElement.setAttribute('lang', lang);
    localStorage.setItem('ndim-lang', lang);
  }

  const t = {
    title: { ru: 'Связи', en: 'Relations' },
    connecting: { ru: 'Подключаюсь…', en: 'Connecting…' },
    standDown: {
      ru: 'Не удалось загрузить связи. Обновите страницу — если не поможет, напишите в поддержку.',
      en: 'Could not load your relations. Reload the page — if that does not help, write to support.',
    },
    signedOut: {
      ru: 'Войдите, чтобы увидеть людей, похожих на Вас.',
      en: 'Sign in to see the people who are similar to you.',
    },
    signIn: { ru: 'Войти', en: 'Sign in' },
    // ⚠️ ТЕКСТ ДЛЯ ЧЕЛОВЕКА, А НЕ ДЛЯ РАЗРАБОТЧИКА. Здесь стояло «вычислитель ещё не считал.
    // На стенде: node calculator/index.mjs --once» — и это увидели живые люди на боевом проде
    // (2026-07-12). Два нарушения канона разом: слово «вычислитель» (в интерфейсе — только
    // «Сервер синхронизации») и команда разработчика на лице продукта.
    // Экран пустой — значит человеку надо сказать, ЧТО СДЕЛАТЬ, а не чем занят наш бэкенд.
    empty: {
      ru: 'Связей пока нет. Оцените несколько измерений — и здесь появятся люди, похожие на Вас.',
      en: 'No relations yet. Rate a few dimensions — and people similar to you will appear here.',
    },
    metrics: {
      similarity: { ru: 'Похожесть', en: 'Similarity' },
      proximity: { ru: 'Близость', en: 'Proximity' },
      commonality: { ru: 'Общность', en: 'Commonality' },
    },
    // Тексты подсказок — 1.x дословно (ndim-old/public/index.html, блок relation_card).
    hints: {
      similarity: {
        ru: 'Произведение Общность * Близость. Этот показатель тем больше, чем больше у Вас с другим человеком Общность и Близость. Является показателем того, насколько Вы похожи с другим человеком. Список Ваших Связей сортируется по убыванию этого показателя.',
        en: 'Product Commonality * Proximity. The more Commonality and Proximity you have with another person, the higher this indicator. It is an indicator of how another person are similar to you. The list of your Relations is sorted in descending order of this indicator.',
      },
      proximity: {
        ru: 'Близость показывает, насколько у Вас с другим человеком совпадают отношения к одним и тем же вещам. Этот показатель тем больше, чем более похоже Вы и другой человек оцениваете одни и те же измерения.',
        en: 'Proximity shows how much you and another person have similar attitudes towards the same things. The more similar you and the other person rates the same dimensions, the higher this indicator.',
      },
      commonality: {
        ru: 'Общность показывает, насколько Вы с другим человеком разделяете одни и те же интересы. Этот показатель тем больше, чем больше у Вас с другим человеком одинаковых измерений в ваших NDim ID.',
        en: 'Commonality shows how much you and another person share the same interests. The more similar dimensions you and another person have in your NDim IDs, the higher this indicator.',
      },
    },
    ourSpace: { ru: 'Наше общее пространство', en: 'Our common space' },
    dimsCount: { ru: 'Размерность', en: 'Dimensionality' },
    diameter: { ru: 'Диаметр', en: 'Diameter' },
    distance: { ru: 'Расстояние между вами', en: 'Distance between you' },
    youAnd: { ru: 'Вы ↔', en: 'You ↔' },
    computedAt: { ru: 'Связи посчитаны', en: 'Relations computed' },
    write: { ru: 'Написать', en: 'Message' },
    soon: { ru: 'скоро', en: 'soon' },
    collapse: { ru: 'Свернуть ▴', en: 'Collapse ▴' },
    noName: { ru: 'Без имени', en: 'No name' },
    privacyHint: {
      ru: 'Вы видите похожесть, но не оценки: из чего сложилась близость — приватно.',
      en: 'You see the similarity, but not the ratings: what closeness is made of stays private.',
    },
  } as const;

  const loc = (value: Localized | null): string | null =>
    value ? (value[lang] ?? value.ru ?? value.en) : null;

  function guestTitle(card: { guestName: Localized | null; guestNick: Localized | null }): string {
    return loc(card.guestName) ?? loc(card.guestNick) ?? t.noName[lang];
  }

  // Порядок метрик — КАНОН 1.x (bugs/25, слово владельца 2026-07-16: «нужно справа»;
  // кадр design/reference-1x/app-02-связи.png): слева множители, СПРАВА их произведение —
  // Общность · Близость · Похожесть.
  const TRIO = ['commonality', 'proximity', 'similarity'] as const;
</script>

<svelte:head>
  <title>NDim Space — {t.title[lang]}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="screen">
  <SideRail active="relations" {lang} />

  <AppBar {lang} onToggleLang={toggleLang} />

  <main class="body">
    <h1 class="screen-title">{t.title[lang]}</h1>

    {#if stand === 'connecting'}
      <!-- Каноничная карточка загрузки 1.x вместо голого текста (bugs/21) -->
      <div class="state"><Loading {lang} /></div>
    {:else if stand === 'signedout'}
      <div class="card">
        <p class="state">{t.signedOut[lang]}</p>
        <a class="btn" href="/profile">{t.signIn[lang]}</a>
      </div>
    {:else if stand === 'down'}
      <div class="card">
        <p class="state">{t.standDown[lang]}</p>
        {#if standError}<p class="hint mono">{standError}</p>{/if}
      </div>
    {:else if data === null || data.cards.length === 0}
      <div class="card"><p class="state">{t.empty[lang]}</p></div>
    {:else}
      {#each data.cards.slice(0, revealed) as card, index (card.entry.guestUid)}
        {@const entry = card.entry}
        <!-- Лёгкая лесенка появления: карточки приходят друг за другом, а не стеной. -->
        <div class="card" in:fly={{ y: 12, duration: MOTION.base, delay: Math.min(index, 8) * 40, easing: cubicOut }}>
          <!-- Фото и имя — РАЗНЫЕ кнопки (bugs/14): тап по фото открывает его во весь
               экран (лайтбокс внутри Avatar), тап по имени раскрывает карточку.
               Вложить одно в другое нельзя — вложенные интерактивы невалидны. -->
          <div class="head">
            <Avatar
              uid={entry.guestUid}
              name={guestTitle(card)}
              has={card.guestAvatar}
              size={46}
            />
            <button type="button" class="who" onclick={() => (expanded = expanded === entry.guestUid ? null : entry.guestUid)}>
              <b>{guestTitle(card)}</b>
            </button>
          </div>
          <!-- Тап по метрике раскрывает подсказку; ⓘ показывает, что она есть (канон 1.x, bugs/24) -->
          <div class="trio">
            {#each TRIO as metric (metric)}
              {@const value = entry[metric]}
              <button type="button" class="cell {strengthLevel(value)}" onclick={() => toggleHint(entry.guestUid, metric)}>
                <small>{t.metrics[metric][lang]} <span class="ihint" aria-hidden="true">ⓘ</span></small>
                <b>{value}%</b>
                <span class="mini"><i style="width:{value}%"></i></span>
              </button>
            {/each}
          </div>
          {#if hintFor?.uid === entry.guestUid}
            <p class="hintbox" transition:slide={{ duration: MOTION.base }}>
              {t.hints[hintFor.metric][lang]}
            </p>
          {/if}
          {#if expanded === entry.guestUid}
            <div class="deep" transition:slide={{ duration: MOTION.base }}>
              <h3>{t.ourSpace[lang]}</h3>
              <div class="kv"><span class="k3">{t.dimsCount[lang]}</span><span class="v3">{entry.commonSpaceSize} {dimsUnit(entry.commonSpaceSize, lang)}</span></div>
              <div class="kv"><span class="k3">{t.diameter[lang]}</span><span class="v3">{entry.commonSpaceDiameter} {starsUnit(entry.commonSpaceDiameter, lang)}</span></div>
              <div class="kv"><span class="k3">{t.distance[lang]}</span><span class="v3">{entry.distance} {starsUnit(entry.distance, lang)} · {entry.distanceRateOfCommonSpaceDiameter}%</span></div>
              <div class="mrow">
                <span class="k3">{t.youAnd[lang]} {guestTitle(card)}</span>
                <span class="mbar"><i style="width:{entry.distanceRateOfCommonSpaceDiameter}%"></i></span>
                <span class="v3">{entry.distanceRateOfCommonSpaceDiameter}%</span>
              </div>
              <p class="hint">{t.computedAt[lang]}: {dateOnly(data.computedAt, lang)}</p>
              <button type="button" class="btn" disabled title={t.soon[lang]}>{t.write[lang]} · {t.soon[lang]}</button>
              <button type="button" class="linkish" onclick={() => (expanded = null)}>{t.collapse[lang]}</button>
            </div>
          {/if}
        </div>
      {/each}
      {#if revealed < data.cards.length}
        <!-- Якорь прогрессивного раскрытия: пустой и невидимый, работает за кадром (bugs/13). -->
        <div class="reveal-anchor" bind:this={sentinel} aria-hidden="true"></div>
      {/if}
      <p class="hint">{t.privacyHint[lang]}</p>
    {/if}
  </main>

  <BottomNav active="relations" {lang} />
</div>

<style>
  /* Оболочка во всю ширину, колонной зажат только контент (bugs/08.3). */
  .screen {
    min-height: 100vh; min-height: 100dvh;
    display: flex; flex-direction: column; background: var(--bg);
  }
  .body {
    flex: 1; padding: 14px; display: flex; flex-direction: column; gap: 12px;
    width: 100%; max-width: 458px; margin: 0 auto; /* 430px контента + поля */
  }
  .screen-title { font-size: 19px; font-weight: 700; color: var(--heading); }

  /* ── Десктоп: макет V2 «Рабочий стол» (утверждён владельцем 2026-07-11) ──
     Рельс слева во всю высоту, справа шапка и контент. Связи — сетка карточек:
     две колонки, на широком мониторе три. Раскрытая карточка растёт на месте. */
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
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
      /* .body — строка 1fr в сетке экрана: без align-content лишняя высота
         растеклась бы по зазорам между рядами карточек. */
      align-content: start;
      gap: 14px;
    }
    .body > .screen-title,
    .body > .state,
    .body > .hint {
      grid-column: 1 / -1;
    }
  }
  @media (min-width: 1560px) {
    .body { max-width: 1560px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  .state { font-size: 14px; color: var(--dim); text-align: center; padding: 14px 6px; }
  .mono { font-family: var(--mono); font-size: 11px; word-break: break-word; }
  .hint { font-size: 11.5px; color: var(--dim); line-height: 1.45; }

  .card {
    background: var(--panel); border: 1px solid var(--edge); border-radius: 14px; padding: 14px;
    box-shadow: var(--card-shadow);
    transition: border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
  }
  .card:hover {
    border-color: color-mix(in srgb, var(--primary) 30%, var(--edge));
    transform: translateY(-1px);
  }
  .head { display: flex; align-items: center; gap: 12px; width: 100%; }
  /* кружок с лицом живёт в Avatar.svelte (там же лайтбокс, bugs/14);
     имя — своя кнопка раскрытия карточки */
  .who {
    flex: 1; min-width: 0; text-align: left;
    background: transparent; border: 0; padding: 0; font: inherit; cursor: pointer;
  }
  .who b { font-size: 16px; color: var(--heading); transition: color 0.15s ease; }
  .who:hover b { color: var(--primary); }
  .reveal-anchor { height: 1px; }

  /* тройка метрик — все три видны в свёрнутом состоянии (правка владельца, как в 1.x);
     каждая метрика — кнопка подсказки (bugs/24) */
  .trio { display: flex; gap: 8px; margin-top: 10px; }
  .cell {
    flex: 1; text-align: center;
    background: none; border: 0; padding: 0; font: inherit; cursor: pointer; color: inherit;
  }
  .ihint { font-size: 10px; color: var(--faint); }
  .cell:hover .ihint { color: var(--primary); }
  .hintbox {
    margin-top: 9px; padding: 9px 12px; border-radius: 10px;
    background: var(--edge-soft); color: var(--text); font-size: 12.5px; line-height: 1.5;
  }
  .cell small { display: block; font-size: 10.5px; color: var(--dim); margin-bottom: 2px; }
  .cell b { display: block; font-size: 16px; }
  .mini { display: block; height: 4px; border-radius: 2px; background: var(--edge-soft); position: relative; margin-top: 4px; }
  .mini i { position: absolute; inset: 0 auto 0 0; border-radius: 2px; transition: width 0.35s ease; }

  /* «яркость связи»: слабая гаснет, средняя синяя, сильная — циан и светится */
  .lv1 b { color: var(--faint); }
  .lv1 .mini i { background: color-mix(in srgb, var(--faint) 55%, transparent); }
  .lv2 b { color: var(--primary); }
  .lv2 .mini i { background: linear-gradient(90deg, var(--primary), #3f8fe0); }
  .lv3 b { color: #1298bd; text-shadow: 0 0 14px rgba(31, 168, 201, 0.45); }
  .lv3 .mini i {
    background: linear-gradient(90deg, var(--primary), #1fa8c9);
    box-shadow: 0 0 8px rgba(31, 168, 201, 0.55);
  }

  .deep { border-top: 1px solid var(--edge-soft); margin-top: 12px; padding-top: 10px; }
  .deep h3 {
    font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase;
    color: var(--dim); margin-bottom: 6px; font-weight: 600;
  }
  .kv { display: flex; justify-content: space-between; gap: 10px; padding: 5px 0; font-size: 12.5px; }
  .k3 { color: var(--dim); }
  .v3 { color: var(--heading); font-weight: 600; text-align: right; }
  .mrow { display: flex; align-items: center; gap: 10px; padding: 7px 0; }
  .mbar { flex: 1; height: 6px; border-radius: 3px; background: var(--edge-soft); position: relative; }
  .mbar i { position: absolute; inset: 0 auto 0 0; border-radius: 3px; background: linear-gradient(90deg, var(--primary), #1fa8c9); }

  .btn {
    display: block; width: 100%; text-align: center; padding: 12px; margin-top: 10px;
    border-radius: 12px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
    background: var(--primary); color: var(--primary-ink); border: 0; text-decoration: none;
    transition: filter 0.15s ease;
  }
  .btn:hover:not(:disabled) { filter: brightness(1.08); }
  .btn:disabled { opacity: 0.55; cursor: default; }
  .linkish {
    display: block; margin: 8px auto 0; font: inherit; font-size: 11px; color: var(--primary);
    background: transparent; border: 0; cursor: pointer;
  }
  .linkish:hover { text-decoration: underline; }
</style>

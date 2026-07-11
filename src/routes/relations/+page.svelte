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
  import AppBar from '$lib/ui/AppBar.svelte';
  import BottomNav from '$lib/ui/BottomNav.svelte';
  import SideRail from '$lib/ui/SideRail.svelte';
  import { signInDev } from '$lib/data/profile';
  import { loadRelations, strengthLevel, type RelationsScreenData } from '$lib/data/relations';
  import type { Localized } from '$lib/model/schema';

  type Lang = 'ru' | 'en';

  let lang = $state<Lang>('ru');
  // 'prod' — публичный домен: экраны 2.0 ещё не открыты, показываем заглушку со ссылкой на 1.x.
  let stand = $state<'connecting' | 'ready' | 'down' | 'prod'>('connecting');
  let standError = $state('');
  let data = $state<RelationsScreenData | null>(null);
  let expanded = $state<string | null>(null);
  const LIVE_APP_URL = 'https://ndim-space.web.app';

  onMount(async () => {
    const saved = localStorage.getItem('ndim-lang');
    if (saved === 'en' || saved === 'ru') lang = saved;
    if (!['localhost', '127.0.0.1'].includes(location.hostname)) {
      stand = 'prod';
      return;
    }
    try {
      const uid = await signInDev();
      data = await loadRelations(uid);
      stand = 'ready';
    } catch (error) {
      standError = error instanceof Error ? error.message : String(error);
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
    connecting: { ru: 'Подключаюсь к стенду…', en: 'Connecting to the stand…' },
    standDown: {
      ru: 'Стенд не поднят. Запусти: npm run stand (эмуляторы + сид + dev-сервер).',
      en: 'The stand is not running. Start it: npm run stand (emulators + seed + dev server).',
    },
    prodStub: {
      ru: 'Экраны NDim Space 2.0 ещё строятся. Живое приложение работает по кнопке ниже — там настоящие люди и связи.',
      en: 'The NDim Space 2.0 screens are still under construction. The live app works via the button below — with real people and relations.',
    },
    openLive: { ru: 'Открыть NDim Space (текущая версия)', en: 'Open NDim Space (current version)' },
    empty: {
      ru: 'Связей пока нет: вычислитель ещё не считал. На стенде: node calculator/index.mjs --once',
      en: 'No relations yet: the calculator has not run. On the stand: node calculator/index.mjs --once',
    },
    metrics: {
      similarity: { ru: 'Похожесть', en: 'Similarity' },
      proximity: { ru: 'Близость', en: 'Proximity' },
      commonality: { ru: 'Общность', en: 'Commonality' },
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

  /** Русские формы множественного числа; для дробных чисел — родительный ед. («17.3 звезды»). */
  function unitRu(value: number, forms: [string, string, string]): string {
    if (!Number.isInteger(value)) return forms[1];
    const mod100 = value % 100;
    const mod10 = value % 10;
    if (mod100 >= 11 && mod100 <= 14) return forms[2];
    if (mod10 === 1) return forms[0];
    if (mod10 >= 2 && mod10 <= 4) return forms[1];
    return forms[2];
  }

  const dimsUnit = (value: number): string =>
    lang === 'ru' ? unitRu(value, ['измерение', 'измерения', 'измерений']) : (value === 1 ? 'dimension' : 'dimensions');

  const starsUnit = (value: number): string =>
    lang === 'ru' ? unitRu(value, ['звезда', 'звезды', 'звёзд']) : (value === 1 ? 'star' : 'stars');

  function guestTitle(card: { guestName: Localized | null; guestNick: Localized | null }): string {
    return loc(card.guestName) ?? loc(card.guestNick) ?? t.noName[lang];
  }

  const dateFmt = (millis: number): string =>
    new Date(millis).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

  const TRIO = ['similarity', 'proximity', 'commonality'] as const;
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
      <p class="state">{t.connecting[lang]}</p>
    {:else if stand === 'prod'}
      <div class="card">
        <p class="state">{t.prodStub[lang]}</p>
        <a class="btn" href={LIVE_APP_URL}>{t.openLive[lang]}</a>
      </div>
    {:else if stand === 'down'}
      <div class="card">
        <p class="state">{t.standDown[lang]}</p>
        <p class="hint mono">{standError}</p>
      </div>
    {:else if data === null || data.cards.length === 0}
      <div class="card"><p class="state">{t.empty[lang]}</p></div>
    {:else}
      {#each data.cards as card (card.entry.guestUid)}
        {@const entry = card.entry}
        <div class="card">
          <button type="button" class="head" onclick={() => (expanded = expanded === entry.guestUid ? null : entry.guestUid)}>
            <span class="ava">{guestTitle(card).slice(0, 1)}</span>
            <b>{guestTitle(card)}</b>
          </button>
          <div class="trio">
            {#each TRIO as metric (metric)}
              {@const value = entry[metric]}
              <span class="cell {strengthLevel(value)}">
                <small>{t.metrics[metric][lang]}</small>
                <b>{value}%</b>
                <span class="mini"><i style="width:{value}%"></i></span>
              </span>
            {/each}
          </div>
          {#if expanded === entry.guestUid}
            <div class="deep">
              <h3>{t.ourSpace[lang]}</h3>
              <div class="kv"><span class="k3">{t.dimsCount[lang]}</span><span class="v3">{entry.commonSpaceSize} {dimsUnit(entry.commonSpaceSize)}</span></div>
              <div class="kv"><span class="k3">{t.diameter[lang]}</span><span class="v3">{entry.commonSpaceDiameter} {starsUnit(entry.commonSpaceDiameter)}</span></div>
              <div class="kv"><span class="k3">{t.distance[lang]}</span><span class="v3">{entry.distance} {starsUnit(entry.distance)} · {entry.distanceRateOfCommonSpaceDiameter}%</span></div>
              <div class="mrow">
                <span class="k3">{t.youAnd[lang]} {guestTitle(card)}</span>
                <span class="mbar"><i style="width:{entry.distanceRateOfCommonSpaceDiameter}%"></i></span>
                <span class="v3">{entry.distanceRateOfCommonSpaceDiameter}%</span>
              </div>
              <p class="hint">{t.computedAt[lang]}: {dateFmt(data.computedAt)}</p>
              <button type="button" class="btn" disabled title={t.soon[lang]}>{t.write[lang]} · {t.soon[lang]}</button>
              <button type="button" class="linkish" onclick={() => (expanded = null)}>{t.collapse[lang]}</button>
            </div>
          {/if}
        </div>
      {/each}
      <p class="hint">{t.privacyHint[lang]}</p>
    {/if}
  </main>

  <BottomNav active="relations" {lang} />
</div>

<style>
  .screen {
    max-width: 430px; margin: 0 auto; min-height: 100vh; min-height: 100dvh;
    display: flex; flex-direction: column; background: var(--bg);
  }
  .body { flex: 1; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
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
  }
  .head {
    display: flex; align-items: center; gap: 12px; width: 100%;
    background: transparent; border: 0; padding: 0; font: inherit; cursor: pointer; text-align: left;
  }
  .ava {
    width: 46px; height: 46px; border-radius: 50%; background: var(--edge-soft); flex: none;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; color: var(--primary); font-size: 18px;
  }
  .head b { font-size: 16px; color: var(--heading); }

  /* тройка метрик — все три видны в свёрнутом состоянии (правка владельца, как в 1.x) */
  .trio { display: flex; gap: 8px; margin-top: 10px; }
  .cell { flex: 1; text-align: center; }
  .cell small { display: block; font-size: 10.5px; color: var(--dim); margin-bottom: 2px; }
  .cell b { display: block; font-size: 16px; }
  .mini { display: block; height: 4px; border-radius: 2px; background: var(--edge-soft); position: relative; margin-top: 4px; }
  .mini i { position: absolute; inset: 0 auto 0 0; border-radius: 2px; }

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
  }
  .btn:disabled { opacity: 0.55; cursor: default; }
  .linkish {
    display: block; margin: 8px auto 0; font: inherit; font-size: 11px; color: var(--primary);
    background: transparent; border: 0; cursor: pointer;
  }
</style>

<script lang="ts">
  // Экран «Профиль» (NDim ID) — первый экран продукта 2.0.
  //
  // Макет: design/profile-synthesis-mockups.html, утверждён владельцем 2026-07-11
  // («Утверждено, работаем»). Три вкладки: Личное | Измерения | Видимость.
  //   · Измерения — единая лента с поиском и фильтрами (сегмент «Все | Мой NDim ID»
  //     из 1.x — костыль, сюда не переносится); свёрнутая строка — имя + бар (просмотр),
  //     раскрытая — карточка с описанием, рейтингом сообщества и звёздами 0–10 (ввод).
  //   · Видимость — предпросмотр «глазами гостя»: чистая функция visibleTo.
  //
  // Данные — модель 2.0 с локальных эмуляторов (интервью №003, В2): npm run stand.
  // Прод-шелл пререндерится; Firebase трогаем только в onMount (в браузере).
  import { onMount } from 'svelte';
  import {
    loadProfileScreen,
    previewAs,
    saveRating,
    signInDev,
    type ProfileScreenData,
  } from '$lib/data/profile';
  import { EVERYONE, FRIENDS } from '$lib/model/visibility';
  import type { Audience } from '$lib/model/visibility';
  import type { Localized } from '$lib/model/schema';

  type Lang = 'ru' | 'en';
  type Tab = 'personal' | 'dims' | 'visibility';
  type DimFilter = 'mine' | 'unrated' | 'all';

  let lang = $state<Lang>('ru');
  let tab = $state<Tab>('personal');

  // Состояние стенда — честное: подключаемся / готово / стенда нет.
  let stand = $state<'connecting' | 'ready' | 'down'>('connecting');
  let standError = $state('');
  let data = $state<ProfileScreenData | null>(null);

  // Вкладка «Измерения»
  let search = $state('');
  let dimFilter = $state<DimFilter>('mine');
  let expandedDim = $state<string | null>(null);
  let savingDim = $state<string | null>(null);

  // Вкладка «Видимость»: выбранная аудитория предпросмотра
  let previewKey = $state('me');

  onMount(async () => {
    try {
      const uid = await signInDev();
      data = await loadProfileScreen(uid);
      stand = 'ready';
    } catch (error) {
      standError = error instanceof Error ? error.message : String(error);
      stand = 'down';
    }
  });

  // ── Двуязычные строки интерфейса ──
  const t = {
    title: { ru: 'Профиль', en: 'Profile' },
    tabs: {
      personal: { ru: 'Личное', en: 'Personal' },
      dims: { ru: 'Измерения', en: 'Dimensions' },
      visibility: { ru: 'Видимость', en: 'Visibility' },
    },
    connecting: { ru: 'Подключаюсь к стенду…', en: 'Connecting to the stand…' },
    standDown: {
      ru: 'Стенд не поднят. Запусти: npm run stand (эмуляторы + сид + dev-сервер).',
      en: 'The stand is not running. Start it: npm run stand (emulators + seed + dev server).',
    },
    inSpaceSince: { ru: 'В Пространстве с мая 2025', en: 'In the Space since May 2025' },
    personalInfo: { ru: 'Личная информация', en: 'Personal information' },
    defaultHidden: {
      ru: 'Новое свойство скрыто от всех, пока Вы сами его не откроете.',
      en: 'A new property is hidden from everyone until you open it yourself.',
    },
    myNdimId: { ru: 'Мой NDim ID', en: 'My NDim ID' },
    // Осей в Пространстве тысячи: дробь «X из N» бессмысленна и демотивирует (правка
    // владельца, 2026-07-11). Показываем только абсолютное число оценённого.
    ratedDims: { ru: 'Оценено измерений', en: 'Dimensions rated' },
    toDims: { ru: 'К измерениям →', en: 'To dimensions →' },
    searchDims: { ru: 'Найти среди {n} измерений…', en: 'Search {n} dimensions…' },
    filters: {
      mine: { ru: 'Мои', en: 'Mine' },
      unrated: { ru: 'Не оценено', en: 'Unrated' },
      all: { ru: 'Все', en: 'All' },
    },
    votes: { ru: 'голосов', en: 'votes' },
    yourRating: { ru: 'Ваша оценка', en: 'Your rating' },
    collapse: { ru: 'Свернуть ▴', en: 'Collapse ▴' },
    suggestDim: { ru: '💡 Предложить новое измерение', en: '💡 Suggest a new dimension' },
    soon: { ru: 'скоро', en: 'soon' },
    barsHint: {
      ru: 'Свёрнуто — бар (просмотр), раскрыто — звёзды (ввод). Оценки видите только Вы.',
      en: 'Collapsed — a bar (viewing), expanded — stars (rating). Only you can see your ratings.',
    },
    seenBy: { ru: 'Так Вас видит аудитория', en: 'How this audience sees you' },
    me: { ru: 'Я', en: 'Me' },
    everyone: { ru: 'Все', en: 'Everyone' },
    friends: { ru: 'Друзья', en: 'Friends' },
    nobody: { ru: 'Никому', en: 'Nobody' },
    circle: { ru: 'Круг', en: 'Circle' },
    hidden: { ru: 'скрыто', en: 'hidden' },
    dimsPrivate: {
      ru: 'Оценки по осям не видны никому ни в одном режиме — гость видит только итоговую похожесть.',
      en: 'Axis ratings are visible to no one in any mode — a guest only sees the resulting similarity.',
    },
    props: {
      name: { ru: 'Имя', en: 'Name' },
      about: { ru: 'О себе', en: 'About' },
      born: { ru: 'Дата рождения', en: 'Birth date' },
      gender: { ru: 'Пол', en: 'Gender' },
      avatar: { ru: 'Фото', en: 'Photo' },
    },
    genders: { m: { ru: 'Мужской', en: 'Male' }, w: { ru: 'Женский', en: 'Female' }, nb: { ru: 'Небинарный', en: 'Non-binary' } },
    noValue: { ru: 'не заполнено', en: 'not filled' },
    noAvatar: { ru: 'нет фото', en: 'no photo' },
    nav: {
      profile: { ru: 'Профиль', en: 'Profile' },
      relations: { ru: 'Связи', en: 'Relations' },
      space: { ru: 'Пространство', en: 'Space' },
      menu: { ru: 'Меню', en: 'Menu' },
    },
  } as const;

  onMount(() => {
    const saved = localStorage.getItem('ndim-lang');
    if (saved === 'en' || saved === 'ru') lang = saved;
  });

  function toggleLang() {
    lang = lang === 'ru' ? 'en' : 'ru';
    document.documentElement.setAttribute('lang', lang);
    localStorage.setItem('ndim-lang', lang);
  }

  // ── Отображение значений ──
  const loc = (value: Localized | undefined | null): string | null =>
    value ? (value[lang] ?? value.ru ?? value.en) : null;

  const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function formatValue(property: string, value: unknown): string {
    if (value === undefined || value === null) return t.noValue[lang];
    switch (property) {
      case 'name': {
        const name = value as { first: Localized; nick: Localized };
        return loc(name.first) ?? loc(name.nick) ?? t.noValue[lang];
      }
      case 'about':
        return loc(value as Localized) ?? t.noValue[lang];
      case 'born': {
        const born = value as { year: number | null; month: number | null; day: number | null };
        if (born.year === null) return t.noValue[lang];
        const month = born.month === null ? '' : ` ${(lang === 'ru' ? MONTHS_RU : MONTHS_EN)[born.month - 1]}`;
        return `${born.day ?? ''}${month} ${born.year}`.trim();
      }
      case 'gender': {
        const gender = value as 'm' | 'w' | 'nb' | null;
        return gender ? t.genders[gender][lang] : t.noValue[lang];
      }
      case 'avatar':
        return value === true ? 'аватар' : t.noAvatar[lang];
      default:
        return String(value);
    }
  }

  /** Подпись аудитории свойства для чипа: 🌐 Все / 👥 Друзья / ◎ Круг «…» / 🔒 Никому. */
  function audienceChip(audience: Audience | undefined): { icon: string; label: string; kind: string } {
    if (audience === EVERYONE) return { icon: '🌐', label: t.everyone[lang], kind: 'open' };
    if (!audience || audience.length === 0) return { icon: '🔒', label: t.nobody[lang], kind: 'lock' };
    const parts = audience.map((groupId) => {
      if (groupId === FRIENDS) return `👥 ${t.friends[lang]}`;
      const group = data?.groups.get(groupId);
      return `◎ ${group ? `${t.circle[lang]} «${group.name}»` : groupId}`;
    });
    return { icon: '', label: parts.join(' · '), kind: audience.includes(FRIENDS) ? 'open' : 'circ' };
  }

  // ── Вкладка «Измерения»: фильтрация ленты ──
  const dimsFiltered = $derived.by(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    return data.dims.filter((dim) => {
      const rated = data!.ratings.has(dim.id);
      if (dimFilter === 'mine' && !rated) return false;
      if (dimFilter === 'unrated' && rated) return false;
      if (query) {
        const haystack = `${dim.title.ru ?? ''} ${dim.title.en ?? ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  });

  const ratedCount = $derived(data ? data.ratings.size : 0);

  async function rate(dimId: string, value: number) {
    if (!data || savingDim) return;
    savingDim = dimId;
    try {
      await saveRating(data.uid, dimId, value);
      const ratings = new Map(data.ratings);
      ratings.set(dimId, value);
      data = { ...data, ratings };
    } finally {
      savingDim = null;
    }
  }

  // ── Вкладка «Видимость»: варианты предпросмотра ──
  const previewOptions = $derived.by(() => {
    const options = [
      { key: 'me', label: t.me[lang] },
      { key: 'everyone', label: `🌐 ${t.everyone[lang]}` },
      { key: 'friends', label: `👥 ${t.friends[lang]}` },
    ];
    if (data) {
      for (const [groupId, group] of data.groups) options.push({ key: `group:${groupId}`, label: `◎ ${group.name}` });
    }
    return options;
  });

  const previewValues = $derived.by(() => {
    if (!data) return {};
    if (previewKey === 'me') return data.values as Record<string, unknown>;
    if (previewKey === 'friends') return previewAs(data, { isFriend: true, groups: [] });
    if (previewKey.startsWith('group:')) return previewAs(data, { isFriend: false, groups: [previewKey.slice(6)] });
    return previewAs(data, { isFriend: false, groups: [] });
  });

  const PROPERTIES = ['name', 'gender', 'about', 'born', 'avatar'] as const;
  const TABS = ['personal', 'dims', 'visibility'] as const;
  const STARS = Array.from({ length: 11 }, (_, index) => index);
</script>

<svelte:head>
  <title>NDim Space — {t.title[lang]}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="screen">
  <header class="bar">
    <svg width="26" height="26" viewBox="0 0 96 96" aria-hidden="true">
      <defs>
        <linearGradient id="pg" gradientUnits="userSpaceOnUse" x1="30" y1="26" x2="68" y2="70">
          <stop offset="0" stop-color="#4d9fff" /><stop offset="1" stop-color="#3fd9ff" />
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="22" fill="#060b14" />
      <g stroke="url(#pg)" stroke-width="6.7" fill="none">
        <line x1="36.5" y1="29" x2="30" y2="66" /><line x1="36.5" y1="29" x2="59.5" y2="66" /><line x1="59.5" y1="66" x2="66" y2="29" />
      </g>
      <g fill="url(#pg)">
        <circle cx="36.5" cy="29" r="9.3" /><circle cx="30" cy="66" r="9.3" /><circle cx="59.5" cy="66" r="9.3" /><circle cx="66" cy="29" r="9.3" />
      </g>
    </svg>
    <span class="wm">{lang === 'ru' ? 'Пространство NDim' : 'NDim Space'}</span>
    <button type="button" class="lang" onclick={toggleLang}>{lang === 'ru' ? 'RU' : 'EN'}</button>
  </header>

  <nav class="tabs" aria-label={t.title[lang]}>
    {#each TABS as key (key)}
      <button type="button" class:on={tab === key} onclick={() => (tab = key)}>{t.tabs[key][lang]}</button>
    {/each}
  </nav>

  <main class="body">
    {#if stand === 'connecting'}
      <p class="state">{t.connecting[lang]}</p>
    {:else if stand === 'down'}
      <div class="card">
        <p class="state">{t.standDown[lang]}</p>
        <p class="hint mono">{standError}</p>
      </div>
    {:else if data}
      {#if tab === 'personal'}
        <div class="card head-card">
          <span class="ava">{formatValue('name', data.values.name).slice(0, 1)}</span>
          <span><b>{formatValue('name', data.values.name)}</b><small>{t.inSpaceSince[lang]}</small></span>
        </div>
        <div class="card">
          <h3>{t.personalInfo[lang]}</h3>
          {#each PROPERTIES as property (property)}
            {@const chip = audienceChip(data.root.visibility[property])}
            <div class="prop">
              <span class="k">{t.props[property][lang]}</span>
              <span class="v">{formatValue(property, data.values[property])}</span>
              <span class="aud {chip.kind}">{chip.icon} {chip.label}</span>
            </div>
          {/each}
          <p class="hint">{t.defaultHidden[lang]}</p>
        </div>
        <div class="card">
          <h3>{t.myNdimId[lang]}</h3>
          <div class="mrow">
            <span class="k2">{t.ratedDims[lang]}</span>
            <span class="mval big">{ratedCount}</span>
          </div>
          <button type="button" class="btn ghost" onclick={() => (tab = 'dims')}>{t.toDims[lang]}</button>
        </div>
      {:else if tab === 'dims'}
        <input class="search" type="search" placeholder={t.searchDims[lang].replace('{n}', String(data.dims.length))} bind:value={search} />
        <div class="seg" role="group">
          <button type="button" class:on={dimFilter === 'mine'} onclick={() => (dimFilter = 'mine')}>{t.filters.mine[lang]} · {ratedCount}</button>
          <button type="button" class:on={dimFilter === 'unrated'} onclick={() => (dimFilter = 'unrated')}>{t.filters.unrated[lang]}</button>
          <button type="button" class:on={dimFilter === 'all'} onclick={() => (dimFilter = 'all')}>{t.filters.all[lang]} · {data.dims.length}</button>
        </div>
        <div class="card">
          {#each dimsFiltered as dim (dim.id)}
            {@const myRating = data.ratings.get(dim.id)}
            {#if expandedDim === dim.id}
              <div class="dim-open">
                <button type="button" class="dhead" onclick={() => (expandedDim = null)}>
                  <b>{loc(dim.title)}</b><span class="dots3">⋮</span>
                </button>
                <div class="avg"><b>{dim.rating}</b><span class="star">★</span><small>{dim.rates} {t.votes[lang]}</small></div>
                {#if loc(dim.description)}<p class="desc">{loc(dim.description)}</p>{/if}
                <div class="strow" role="group" aria-label={t.yourRating[lang]}>
                  {#each STARS as value (value)}
                    <button
                      type="button"
                      class="st"
                      class:pick={myRating === value}
                      disabled={savingDim === dim.id}
                      onclick={() => rate(dim.id, value)}
                    ><b>{value}</b>★</button>
                  {/each}
                </div>
                <p class="strow-cap">
                  {t.yourRating[lang]}: {myRating ?? '—'} ·
                  <button type="button" class="linkish" onclick={() => (expandedDim = null)}>{t.collapse[lang]}</button>
                </p>
              </div>
            {:else}
              <button type="button" class="dim-row" onclick={() => (expandedDim = dim.id)}>
                <span class="n">{loc(dim.title)}</span>
                {#if myRating !== undefined}
                  <span class="scale"><i style="width:{myRating * 10}%"></i></span>
                  <span class="val">{myRating}</span>
                {:else}
                  <span class="scale"></span>
                  <span class="val">—</span>
                {/if}
              </button>
            {/if}
          {/each}
        </div>
        <button type="button" class="btn ghost" disabled title={t.soon[lang]}>{t.suggestDim[lang]} · {t.soon[lang]}</button>
        <p class="hint">{t.barsHint[lang]}</p>
      {:else}
        <div class="seg" role="group">
          {#each previewOptions as option (option.key)}
            <button type="button" class:on={previewKey === option.key} onclick={() => (previewKey = option.key)}>{option.label}</button>
          {/each}
        </div>
        <div class="card">
          <h3>{t.seenBy[lang]}</h3>
          {#each PROPERTIES as property (property)}
            {@const chip = audienceChip(data.root.visibility[property])}
            {@const visible = previewKey === 'me' || property in previewValues}
            <div class="prop" class:ghosted={!visible}>
              <span class="k">{t.props[property][lang]}</span>
              <span class="v">
                {visible ? formatValue(property, (previewValues as Record<string, unknown>)[property] ?? data.values[property]) : `— ${t.hidden[lang]} (${chip.label})`}
              </span>
              <span class="aud {chip.kind}">{chip.icon}{chip.icon ? ' ' : ''}{chip.label}</span>
            </div>
          {/each}
        </div>
        <div class="card">
          <h3>{t.tabs.dims[lang]}</h3>
          <p class="hint">{t.dimsPrivate[lang]}</p>
        </div>
      {/if}
    {/if}
  </main>

  <nav class="bnav" aria-label="NDim Space">
    <span class="on"><span class="ico">⌂</span>{t.nav.profile[lang]}</span>
    <span title={t.soon[lang]}><span class="ico">◎</span>{t.nav.relations[lang]}</span>
    <span title={t.soon[lang]}><span class="ico">✳</span>{t.nav.space[lang]}</span>
    <span title={t.soon[lang]}><span class="ico">☰</span>{t.nav.menu[lang]}</span>
  </nav>
</div>

<style>
  /* Токены — из корневого лейаута (:root / [data-theme='dark']); здесь только раскладка. */
  .screen {
    max-width: 430px;
    margin: 0 auto;
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }

  .bar {
    display: flex; align-items: center; gap: 9px;
    padding: 14px 16px 12px; background: var(--panel); border-bottom: 1px solid var(--edge);
  }
  .bar .wm { font-size: 15px; font-weight: 650; color: var(--heading); }
  .lang {
    margin-left: auto; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer;
    color: var(--dim); background: transparent; border: 1px solid var(--edge); border-radius: 8px; padding: 4px 9px;
  }

  .tabs { display: flex; background: var(--panel); border-bottom: 1px solid var(--edge); }
  .tabs button {
    flex: 1; font: inherit; font-size: 13.5px; padding: 11px 0; cursor: pointer;
    color: var(--dim); background: transparent; border: 0;
  }
  .tabs button.on { color: var(--primary); font-weight: 650; box-shadow: inset 0 -2px 0 var(--primary); }

  .body { flex: 1; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
  .state { font-size: 14px; color: var(--dim); text-align: center; padding: 18px 6px; }
  .mono { font-family: var(--mono); font-size: 11px; word-break: break-word; }

  .card {
    background: var(--panel); border: 1px solid var(--edge); border-radius: 14px; padding: 14px;
    box-shadow: var(--card-shadow);
  }
  .card h3 {
    font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase;
    color: var(--dim); margin-bottom: 10px; font-weight: 600;
  }
  .hint { font-size: 11.5px; color: var(--dim); line-height: 1.45; margin-top: 8px; }

  .head-card { display: flex; align-items: center; gap: 12px; }
  .ava {
    width: 54px; height: 54px; border-radius: 50%; background: var(--edge-soft); flex: none;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; color: var(--primary); font-size: 20px;
  }
  .head-card b { font-size: 17px; color: var(--heading); display: block; }
  .head-card small { font-size: 12px; color: var(--dim); }

  .prop { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--edge-soft); }
  .prop:last-of-type { border-bottom: 0; }
  .prop .k { font-size: 12px; color: var(--dim); width: 96px; flex: none; }
  .prop .v { font-size: 14px; color: var(--heading); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .aud {
    flex: none; font-size: 11px; padding: 4px 9px; border-radius: 999px;
    background: var(--edge-soft); color: var(--primary); white-space: nowrap;
  }
  .aud.lock { color: var(--dim); }
  .aud.circ { color: var(--accent); }
  .ghosted { opacity: 0.38; }

  .mrow { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
  .mrow .k2 { font-size: 12px; color: var(--dim); flex: none; }
  .mval { flex: none; font-size: 13.5px; font-weight: 700; color: var(--primary); }
  .mval.big { font-size: 19px; margin-left: auto; }

  .btn {
    display: block; width: 100%; text-align: center; padding: 12px; margin-top: 10px;
    border-radius: 12px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
    background: var(--primary); color: var(--primary-ink); border: 0;
  }
  .btn.ghost { background: transparent; border: 1px solid var(--ghost-brd); color: var(--ghost-ink); }
  .btn:disabled { opacity: 0.55; cursor: default; }

  .search {
    font: inherit; font-size: 13.5px; color: var(--text);
    padding: 10px 12px; border: 1px solid var(--edge); border-radius: 10px; background: var(--panel);
  }
  .search::placeholder { color: var(--faint); }

  .seg { display: flex; gap: 6px; flex-wrap: wrap; }
  .seg button {
    font: inherit; font-size: 12px; padding: 6px 11px; cursor: pointer;
    border-radius: 999px; border: 1px solid var(--edge); color: var(--dim); background: var(--panel);
  }
  .seg button.on { background: var(--primary); border-color: transparent; color: var(--primary-ink); font-weight: 600; }

  /* лента измерений */
  .dim-row {
    display: flex; align-items: center; gap: 10px; width: 100%;
    padding: 10px 0; border: 0; border-bottom: 1px solid var(--edge-soft);
    background: transparent; font: inherit; cursor: pointer; text-align: left;
  }
  .dim-row:last-child { border-bottom: 0; }
  .dim-row .n { font-size: 14px; color: var(--heading); flex: 1; }
  .scale { flex: none; width: 130px; height: 6px; border-radius: 3px; background: var(--edge-soft); position: relative; }
  .scale i { position: absolute; inset: 0 auto 0 0; border-radius: 3px; background: linear-gradient(90deg, var(--primary), var(--accent)); }
  .val { flex: none; width: 26px; text-align: right; font-size: 13.5px; font-weight: 700; color: var(--primary); }

  .dim-open { padding: 10px 0 12px; border-bottom: 1px solid var(--edge-soft); }
  .dim-open:last-child { border-bottom: 0; }
  .dhead {
    display: flex; align-items: baseline; gap: 7px; width: 100%;
    background: transparent; border: 0; font: inherit; cursor: pointer; text-align: left; padding: 0;
  }
  .dhead b { font-size: 15.5px; color: var(--heading); flex: 1; }
  .dhead .dots3 { flex: none; color: var(--dim); font-size: 16px; letter-spacing: 1px; }
  .avg { display: flex; align-items: center; gap: 7px; margin-top: 7px; }
  .avg b { font-size: 19px; color: #1c9e4f; }
  .avg .star { color: #f0b429; font-size: 16px; }
  .avg small { font-size: 12px; color: var(--dim); }
  .desc { font-size: 12.5px; line-height: 1.5; color: var(--text); margin-top: 8px; }

  .strow { display: flex; justify-content: space-between; margin-top: 12px; }
  .st {
    position: relative; font-size: 25px; line-height: 1; color: var(--faint); opacity: 0.65;
    background: transparent; border: 0; padding: 0; cursor: pointer; font-family: inherit;
  }
  .st:hover { opacity: 0.9; }
  .st b {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 700; color: var(--panel); padding-top: 3px;
  }
  .st.pick { color: var(--primary); opacity: 1; }
  .st:disabled { cursor: wait; }
  .strow-cap { font-size: 11px; color: var(--dim); text-align: center; margin-top: 6px; }
  .linkish {
    font: inherit; font-size: 11px; color: var(--primary); background: transparent; border: 0;
    cursor: pointer; padding: 0;
  }

  .bnav { display: flex; background: var(--panel); border-top: 1px solid var(--edge); }
  .bnav > span {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
    padding: 9px 0 11px; font-size: 10.5px; color: var(--faint);
  }
  .bnav .ico { font-size: 17px; line-height: 1; }
  .bnav .on { color: var(--primary); font-weight: 650; }
</style>

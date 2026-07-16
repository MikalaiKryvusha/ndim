<script lang="ts">
  // Экран «Пространство» — приборная панель проекта (ideas/06).
  //
  // Макет: design/space-mockups.html, V1 «Приборная панель», утверждён владельцем
  // 2026-07-12 с правками: в него перенесены виджеты «Сегодня», «Сейчас в Пространстве»
  // и «Версии». Форма экрана — ВИДЖЕТНАЯ СЕТКА (AGENT_GUIDE → «Дизайн» → «Форма
  // экранов-сводок»): каждая карточка самостоятельна, чтобы позже её можно было
  // переставить или убрать, не переписывая экран.
  //
  // Тексты — из живого 1.x (design/reference-1x/app-03-пространство.png), не выдуманы:
  // «Сервер синхронизации», «Текущее состояние: Работает», «Пользователей
  // синхронизировано», «Связей рассчитано», «Диаметр Пространства NDim».
  //
  // Все цифры пишет сервер синхронизации (calculator/); экран только читает и показывает.
  // Чего он НЕ делает: не додумывает недостающее. Нет истории — нет тренда; сервер молчит —
  // мы не рисуем зелёную лампочку.
  import { onMount } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import AppBar from '$lib/ui/AppBar.svelte';
  import BottomNav from '$lib/ui/BottomNav.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import SideRail from '$lib/ui/SideRail.svelte';
  import { currentSession } from '$lib/data/profile';
  import { loadSpace, type SpaceScreenData } from '$lib/data/space';
  import { nextRunAt, type DailySnapshotDoc, type SpaceEvent } from '$lib/model/stats';
  import { technicalDetail } from '$lib/ui/errors';
  import { MOTION } from '$lib/ui/motion';
  import {
    dateOnly,
    dateTime,
    dimsUnit,
    newDimsUnit,
    num,
    peopleUnit,
    ratingsUnit,
    seconds,
    signed,
    starsUnit,
    type Lang,
  } from '$lib/ui/format';

  let lang = $state<Lang>('ru');
  // 'prod' — публичный домен: экраны 2.0 ещё не открыты, показываем заглушку со ссылкой на 1.x.
  let stand = $state<'connecting' | 'ready' | 'down' | 'signedout'>('connecting');
  let standError = $state('');
  let data = $state<SpaceScreenData | null>(null);

  // Версия приложения вшивается в сборку (vite define): врать о ней нельзя, а тянуть
  // из сети — незачем. Версию сервера синхронизации сообщает сам сервер.
  const APP_VERSION = __APP_VERSION__;
  const APP_BUILT_AT = __APP_BUILT_AT__;

  onMount(async () => {
    const saved = localStorage.getItem('ndim-lang');
    if (saved === 'en' || saved === 'ru') lang = saved;
    try {
      // Цифры Пространства открыты каждому, кто вошёл, включая гостя. Не вошёл — правила
      // молчат: агрегаты продукта не витрина лендинга.
      const uid = await currentSession();
      if (uid === null) {
        stand = 'signedout';
        return;
      }
      data = await loadSpace();
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
    title: { ru: 'Пространство', en: 'Space' },
    lede: {
      ru: 'Ниже представлены текущие метрики и статистика Пространства NDim.',
      en: 'Below are the current metrics and statistics of NDim Space.',
    },
    connecting: { ru: 'Подключаюсь…', en: 'Connecting…' },
    standDown: {
      ru: 'Не удалось загрузить статистику Пространства. Обновите страницу.',
      en: 'Could not load the statistics of the Space. Reload the page.',
    },
    signedOut: {
      ru: 'Войдите, чтобы увидеть Пространство изнутри.',
      en: 'Sign in to see the Space from the inside.',
    },
    signIn: { ru: 'Войти', en: 'Sign in' },
    // ⚠️ Здесь тоже висел хвост для разработчика — «На стенде: node calculator/index.mjs --once».
    // Команды на лице продукта не место (см. relations/+page.svelte). Само название
    // «Сервер синхронизации» — законный термин продукта (словарь в AGENT_GUIDE), его оставляем.
    empty: {
      ru: 'Сервер синхронизации ещё ни разу не считал — показывать пока нечего.',
      en: 'The sync server has not run yet — nothing to show.',
    },

    // Плитки
    peopleTile: { ru: 'человек в Пространстве', en: 'people in the Space' },
    dimsTile: { ru: 'измерений в Пространстве', en: 'dimensions in the Space' },
    ratingsTile: { ru: 'оценок поставлено', en: 'ratings given' },
    similarityTile: { ru: 'средняя похожесть', en: 'average similarity' },
    perWeek: { ru: 'за неделю', en: 'over the week' },
    points: { ru: 'п.п.', en: 'pp' },

    // «Сегодня»
    today: { ru: 'Сегодня', en: 'Today' },
    quietDay: {
      ru: 'Сегодня в Пространстве ничего не изменилось.',
      en: 'Nothing has changed in the Space today.',
    },
    perDay: { ru: 'за сутки', en: 'over the day' },
    totalIs: { ru: 'всего', en: 'in total' },
    yesterdayWas: { ru: 'вчера было', en: 'yesterday it was' },

    // «Сейчас в Пространстве» — формулировки 1.x
    now: { ru: 'Сейчас в Пространстве', en: 'The Space right now' },
    totalPeople: { ru: 'Всего людей', en: 'People in total' },
    newIn30: { ru: 'Новых за последние 30 дней', en: 'New in the last 30 days' },
    activeIn7: { ru: 'Активных за последние 7 дней', en: 'Active in the last 7 days' },
    dimsCount: { ru: 'Количество измерений', en: 'Number of dimensions' },
    diameter: { ru: 'Диаметр Пространства NDim', en: 'NDim Space diameter' },
    ratingsCount: { ru: 'Оценок поставлено', en: 'Ratings given' },
    relationsCount: { ru: 'Связей рассчитано', en: 'Relations computed' },

    // Распределение похожести
    distribution: { ru: 'Как распределена похожесть', en: 'How similarity is distributed' },
    distributionHint: {
      ru: 'Считается по всем рассчитанным связям. Похожесть 100 % — огромная редкость.',
      en: 'Computed over all relations. A similarity of 100% is extremely rare.',
    },

    // Сервер синхронизации — блоки и подписи 1.x
    server: { ru: 'Сервер синхронизации', en: 'Sync server' },
    status: { ru: 'Статус', en: 'Status' },
    currentState: { ru: 'Текущее состояние', en: 'Current state' },
    running: { ru: 'Работает', en: 'Running' },
    silent: { ru: 'Не отвечает', en: 'Not responding' },
    lastRun: { ru: 'Последний запуск', en: 'Last run' },
    fullSync: { ru: 'Полная синхронизация', en: 'Full synchronisation' },
    lastSuccess: { ru: 'Последняя успешная', en: 'Last successful' },
    took: { ru: 'Выполнена за', en: 'Completed in' },
    usersSynced: { ru: 'Пользователей синхронизировано', en: 'Users synchronised' },
    scheduled: { ru: 'Запланированная', en: 'Scheduled' },
    noHeartbeat: {
      ru: 'Сервер синхронизации ещё не отчитывался.',
      en: 'The sync server has not reported yet.',
    },

    // Версии
    versions: { ru: 'Версии', en: 'Versions' },
    appVersion: { ru: 'Приложение', en: 'Application' },
    builtAt: { ru: 'Собран', en: 'Built' },
    unknown: { ru: '—', en: '—' },
  } as const;

  /** Линия динамики плитки: значения последних дней → путь SVG. */
  const SPARK = { width: 120, height: 34, pad: 3 };

  function sparkPath(values: readonly number[], area = false): string {
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1; // ровная линия — рисуем её посередине, а не делим на ноль
    const stepX = SPARK.width / (values.length - 1);
    const usable = SPARK.height - SPARK.pad * 2;

    const line = values
      .map((value, index) => {
        const x = Math.round(index * stepX * 10) / 10;
        const y = Math.round((SPARK.pad + (1 - (value - min) / span) * usable) * 10) / 10;
        return `${index === 0 ? 'M' : 'L'}${x} ${y}`;
      })
      .join(' ');

    return area ? `${line} L${SPARK.width} ${SPARK.height} L0 ${SPARK.height} Z` : line;
  }

  const series = (
    history: readonly DailySnapshotDoc[],
    key: 'people' | 'dims' | 'ratings' | 'avgSimilarity',
  ): number[] => history.map((snapshot) => snapshot[key]);

  /**
   * Фраза события «Сегодня». Сегмент `{ b }` показывается полужирным — так число видно
   * в предложении, как в утверждённом макете.
   *
   * Каждое событие двунаправленно: Пространство может и вырасти, и убыть (человек вправе
   * удалить свои данные). «Поставлено −4 оценок» было бы и неграмотно, и неправдой — поэтому
   * у падения свой глагол, а не минус, приклеенный к тексту роста.
   */
  type Seg = string | { readonly b: string };

  const icon = (event: SpaceEvent): string =>
    event.kind === 'people' ? '👤' : event.kind === 'ratings' ? '★' : event.kind === 'dims' ? '✳' : '↯';

  function eventText(event: SpaceEvent): Seg[] {
    const ru = lang === 'ru';

    switch (event.kind) {
      case 'people': {
        const count = Math.abs(event.delta);
        if (event.delta > 0) {
          return ru
            ? [
                count === 1 ? 'Пришёл ' : 'Пришли ',
                { b: `${signed(event.delta, lang)} ${peopleUnit(count, lang)}` },
                '. В Пространстве стало ',
                { b: num(event.total, lang) },
                '.',
              ]
            : [
                'Joined: ',
                { b: `${signed(event.delta, lang)} ${peopleUnit(count, lang)}` },
                '. The Space now holds ',
                { b: num(event.total, lang) },
                '.',
              ];
        }
        return ru
          ? ['Людей стало меньше на ', { b: num(count, lang) }, '. В Пространстве ', { b: num(event.total, lang) }, '.']
          : ['The Space lost ', { b: `${num(count, lang)} ${peopleUnit(count, lang)}` }, '. Now ', { b: num(event.total, lang) }, '.'];
      }

      case 'ratings': {
        const count = Math.abs(event.delta);
        const amount = { b: `${num(count, lang)} ${ratingsUnit(count, lang)}` };
        if (event.delta > 0) return ru ? ['Поставлено ', amount, '.'] : [amount, ' given.'];
        return ru ? ['Снято ', amount, '.'] : [amount, ' removed.'];
      }

      case 'dims': {
        const count = Math.abs(event.delta);
        if (event.delta <= 0) {
          return ru
            ? ['Измерений стало меньше на ', { b: num(count, lang) }, '.']
            : ['The catalogue lost ', { b: `${num(count, lang)} ${dimsUnit(count, lang)}` }, '.'];
        }

        const appeared: Seg[] = ru
          ? ['Появилось ', { b: `${num(count, lang)} ${newDimsUnit(count, lang)}` }]
          : [{ b: `${num(count, lang)} ${newDimsUnit(count, lang)}` }, ' appeared'];

        // Имена новых измерений есть не всегда: их знает только последний расчёт.
        if (event.names.length === 0) return [...appeared, '.'];

        const named: Seg[] = [...appeared, ': '];
        event.names.forEach((dim, index) => {
          named.push({ b: `«${dim.title[lang] ?? dim.title.ru ?? dim.id}»` });
          named.push(index < event.names.length - 1 ? ', ' : '.');
        });
        return named;
      }

      case 'similarity': {
        const points = `${num(Math.abs(event.delta), lang)} ${t.points[lang]}`;
        const grew = event.delta > 0;
        // Рост похожести — не «хорошо», а падение — не «плохо»: разнообразие Пространства
        // и есть его ценность. Поэтому обе формулировки утвердительные.
        return ru
          ? [
              'Средняя похожесть ',
              { b: `${grew ? 'выросла' : 'снизилась'} на ${points}` },
              grew ? ' — Пространство стало теснее.' : ' — Пространство стало разнообразнее.',
            ]
          : [
              'Average similarity ',
              { b: `${grew ? 'is up' : 'is down'} by ${points}` },
              grew ? ' — the Space has become closer-knit.' : ' — the Space has become more diverse.',
            ];
      }

      // Новый вид события обязан получить свою фразу: молча показать пустую строку хуже,
      // чем не показать событие вовсе.
      default:
        return [];
    }
  }

  /** Мелкая строка под событием: контекст, из которого видно, откуда взялось число. */
  function eventNote(event: SpaceEvent): string | null {
    switch (event.kind) {
      case 'ratings':
        return `${t.perDay[lang]} · ${t.totalIs[lang]} ${num(event.total, lang)}`;
      case 'dims':
        return `${t.perDay[lang]} · ${t.totalIs[lang]} ${num(event.total, lang)}`;
      case 'similarity':
        return `${event.value}% · ${t.yesterdayWas[lang]} ${event.value - event.delta}%`;
      default:
        return null;
    }
  }

  /** Стрелка и цвет тренда. Ноль — не «плохо» и не «хорошо», он просто ноль. */
  const trendClass = (delta: number): 'up' | 'down' | 'flat' =>
    delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const trendArrow = (delta: number): string => (delta > 0 ? '▲' : delta < 0 ? '▼' : '·');

  /** Виджеты приходят лесенкой (bugs/05): каждый следующий — чуть позже предыдущего. */
  const widgetIn = (order: number) => ({
    y: 10,
    duration: MOTION.base,
    delay: order * 45,
    easing: cubicOut,
  });
</script>

<svelte:head>
  <title>NDim Space — {t.title[lang]}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="screen">
  <SideRail active="space" {lang} />

  <AppBar {lang} onToggleLang={toggleLang} />

  <main class="body">
    <div class="head">
      <h1 class="screen-title">{t.title[lang]}</h1>
      <p class="lede">{t.lede[lang]}</p>
    </div>

    {#if stand === 'connecting'}
      <!-- Каноничная карточка загрузки 1.x вместо голого текста (bugs/21) -->
      <div class="state full"><Loading {lang} /></div>
    {:else if stand === 'signedout'}
      <div class="card full">
        <p class="state">{t.signedOut[lang]}</p>
        <a class="btn" href="/profile">{t.signIn[lang]}</a>
      </div>
    {:else if stand === 'down'}
      <div class="card full">
        <p class="state">{t.standDown[lang]}</p>
        {#if standError}<p class="hint mono">{standError}</p>{/if}
      </div>
    {:else if data === null}
      <div class="card full"><p class="state">{t.empty[lang]}</p></div>
    {:else}
      {@const stats = data.stats}
      {@const week = data.week}

      <!-- ── Виджет: плитки с трендами и линией динамики ── -->
      <div class="tiles" in:fly={widgetIn(0)}>
        <div class="card tile">
          <b>{num(stats.people, lang)}</b>
          <span class="k">{t.peopleTile[lang]}</span>
          {#if week}
            <span class="trend {trendClass(week.people)}">
              {trendArrow(week.people)} {signed(week.people, lang)} {t.perWeek[lang]}
            </span>
          {/if}
          <svg class="spark" viewBox="0 0 {SPARK.width} {SPARK.height}" preserveAspectRatio="none" aria-hidden="true">
            <path class="area" d={sparkPath(series(data.history, 'people'), true)} />
            <path d={sparkPath(series(data.history, 'people'))} />
          </svg>
        </div>

        <div class="card tile">
          <b>{num(stats.dims, lang)}</b>
          <span class="k">{t.dimsTile[lang]}</span>
          {#if week}
            <span class="trend {trendClass(week.dims)}">
              {trendArrow(week.dims)} {signed(week.dims, lang)} {t.perWeek[lang]}
            </span>
          {/if}
          <svg class="spark" viewBox="0 0 {SPARK.width} {SPARK.height}" preserveAspectRatio="none" aria-hidden="true">
            <path class="area" d={sparkPath(series(data.history, 'dims'), true)} />
            <path d={sparkPath(series(data.history, 'dims'))} />
          </svg>
        </div>

        <div class="card tile">
          <b>{num(stats.ratings, lang)}</b>
          <span class="k">{t.ratingsTile[lang]}</span>
          {#if week}
            <span class="trend {trendClass(week.ratings)}">
              {trendArrow(week.ratings)} {signed(week.ratings, lang)} {t.perWeek[lang]}
            </span>
          {/if}
          <svg class="spark" viewBox="0 0 {SPARK.width} {SPARK.height}" preserveAspectRatio="none" aria-hidden="true">
            <path class="area" d={sparkPath(series(data.history, 'ratings'), true)} />
            <path d={sparkPath(series(data.history, 'ratings'))} />
          </svg>
        </div>

        <div class="card tile">
          <b>{stats.avgSimilarity}%</b>
          <span class="k">{t.similarityTile[lang]}</span>
          {#if week}
            <span class="trend {trendClass(week.avgSimilarity)}">
              {trendArrow(week.avgSimilarity)} {signed(week.avgSimilarity, lang)} {t.points[lang]} {t.perWeek[lang]}
            </span>
          {/if}
          <svg class="spark" viewBox="0 0 {SPARK.width} {SPARK.height}" preserveAspectRatio="none" aria-hidden="true">
            <path class="area" d={sparkPath(series(data.history, 'avgSimilarity'), true)} />
            <path d={sparkPath(series(data.history, 'avgSimilarity'))} />
          </svg>
        </div>
      </div>

      <!-- ── Виджет «Сегодня»: что изменилось за сутки ── -->
      <div class="card w-today" in:fly={widgetIn(1)}>
        <h3>{t.today[lang]}</h3>
        {#if data.events.length === 0}
          <p class="hint">{t.quietDay[lang]}</p>
        {:else}
          {#each data.events as event (event.kind)}
            {@const note = eventNote(event)}
            <div class="ev">
              <span class="ic" aria-hidden="true">{icon(event)}</span>
              <div>
                <p class="tx">
                  {#each eventText(event) as segment}{#if typeof segment === 'string'}{segment}{:else}<b
                        >{segment.b}</b
                      >{/if}{/each}
                </p>
                {#if note}<p class="tm">{note}</p>{/if}
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <!-- ── Виджет «Сейчас в Пространстве» ── -->
      <div class="card w-now" in:fly={widgetIn(2)}>
        <h3>{t.now[lang]}</h3>
        <div class="kv"><span class="k">{t.totalPeople[lang]}</span><span class="v">{num(stats.people, lang)}</span></div>
        <div class="kv"><span class="k">{t.newIn30[lang]}</span><span class="v">{num(stats.newIn30Days, lang)}</span></div>
        <div class="kv"><span class="k">{t.activeIn7[lang]}</span><span class="v">{num(stats.activeIn7Days, lang)}</span></div>
        <div class="kv"><span class="k">{t.dimsCount[lang]}</span><span class="v">{num(stats.dims, lang)}</span></div>
        <div class="kv">
          <span class="k">{t.diameter[lang]}</span>
          <span class="v">{num(stats.diameter, lang)} {starsUnit(stats.diameter, lang)}</span>
        </div>
        <div class="kv"><span class="k">{t.ratingsCount[lang]}</span><span class="v">{num(stats.ratings, lang)}</span></div>
        <div class="kv"><span class="k">{t.relationsCount[lang]}</span><span class="v">{num(stats.relations, lang)}</span></div>
      </div>

      <!-- ── Виджет «Как распределена похожесть» ── -->
      <div class="card w-dist" in:fly={widgetIn(3)}>
        <h3>{t.distribution[lang]}</h3>
        {#each [{ label: '80–100 %', value: stats.distribution.high }, { label: '60–79 %', value: stats.distribution.upper }, { label: '40–59 %', value: stats.distribution.middle }, { label: '0–39 %', value: stats.distribution.low }] as band (band.label)}
          <div class="bar">
            <span class="lb">{band.label}</span>
            <span class="tk"><span class="fl" style="width:{band.value}%"></span></span>
            <span class="pc">{band.value}%</span>
          </div>
        {/each}
        <p class="hint">{t.distributionHint[lang]}</p>
      </div>

      <!-- ── Виджет «Сервер синхронизации» (структура блоков — из 1.x) ── -->
      <div class="card w-server" in:fly={widgetIn(4)}>
        <h3>{t.server[lang]}</h3>
        {#if data.server === null}
          <p class="hint">{t.noHeartbeat[lang]}</p>
        {:else}
          {@const server = data.server}
          <p class="sub-h">{t.status[lang]}</p>
          <div class="kv">
            <span class="k">{t.currentState[lang]}</span>
            <!-- Лампочка горит рядом со СЛОВОМ СОСТОЯНИЯ, а не рядом с названием свойства
                 (прямая правка владельца 2026-07-12; так это было и в 1.x). -->
            <span class="v {data.serverState}">
              <span class="dot" aria-hidden="true"></span>
              {data.serverState === 'running' ? t.running[lang] : t.silent[lang]}
            </span>
          </div>
          <div class="kv"><span class="k">{t.lastRun[lang]}</span><span class="v">{dateTime(server.lastRunAt, lang)}</span></div>

          {#if server.lastSuccessAt !== null}
            <p class="sub-h">{t.fullSync[lang]}</p>
            <div class="kv"><span class="k">{t.lastSuccess[lang]}</span><span class="v">{dateTime(server.lastSuccessAt, lang)}</span></div>
            {#if server.durationMs !== null}
              <div class="kv"><span class="k">{t.took[lang]}</span><span class="v">{seconds(server.durationMs, lang)}</span></div>
            {/if}
            <div class="kv"><span class="k">{t.usersSynced[lang]}</span><span class="v">{num(server.usersSynced, lang)}</span></div>
            <div class="kv"><span class="k">{t.relationsCount[lang]}</span><span class="v">{num(server.relationsComputed, lang)}</span></div>
            <div class="kv"><span class="k">{t.scheduled[lang]}</span><span class="v">{dateTime(nextRunAt(server), lang)}</span></div>
          {/if}
        {/if}
      </div>

      <!-- ── Виджет «Версии» ── -->
      <div class="card w-ver" in:fly={widgetIn(5)}>
        <h3>{t.versions[lang]}</h3>
        <div class="vers">
          <div class="ver">
            <span class="k">{t.appVersion[lang]}</span>
            <b>{APP_VERSION}</b>
          </div>
          <div class="ver">
            <span class="k">{t.server[lang]}</span>
            <b>
              {#if data.server}
                {data.server.version} · {lang === 'ru' ? 'билд' : 'build'} {data.server.build}
              {:else}
                {t.unknown[lang]}
              {/if}
            </b>
          </div>
          <div class="ver">
            <span class="k">{t.builtAt[lang]}</span>
            <b>{dateOnly(Date.parse(APP_BUILT_AT), lang)}</b>
          </div>
        </div>
      </div>
    {/if}
  </main>

  <BottomNav active="space" {lang} />
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
  .lede { font-size: 12.5px; color: var(--dim); margin-top: 3px; }
  .state { font-size: 14px; color: var(--dim); text-align: center; padding: 14px 6px; }
  .mono { font-family: var(--mono); font-size: 11px; word-break: break-word; }
  .hint { font-size: 11.5px; color: var(--dim); line-height: 1.5; }

  .card {
    background: var(--panel); border: 1px solid var(--edge); border-radius: 14px; padding: 14px;
    box-shadow: var(--card-shadow);
  }
  .card h3 {
    font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase;
    color: var(--dim); font-weight: 600; margin-bottom: 10px;
  }

  /* Плитка-метрика: число, подпись, тренд, линия динамики. */
  .tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .tile b { display: block; font: 700 24px var(--mono); color: var(--heading); letter-spacing: -0.02em; }
  .tile .k { display: block; font-size: 12px; color: var(--dim); margin-top: 2px; }
  .trend { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 650; margin-top: 6px; }
  .trend.up { color: var(--up); }
  .trend.down { color: var(--down); }
  .trend.flat { color: var(--faint); }
  .spark { display: block; width: 100%; height: 34px; margin-top: 8px; }
  .spark path { fill: none; stroke: var(--primary); stroke-width: 2; }
  .spark .area { fill: color-mix(in srgb, var(--primary) 12%, transparent); stroke: none; }

  /* Строка «свойство — значение»: подпись слева, моноширинное число справа. */
  .kv { display: flex; align-items: baseline; gap: 10px; padding: 5px 0; font-size: 13px; }
  .kv .k { color: var(--dim); flex: 1; }
  .kv .v { font-family: var(--mono); color: var(--heading); font-weight: 600; text-align: right; }
  .sub-h { margin: 12px 0 4px; font-size: 13px; font-weight: 700; color: var(--heading); }
  .card h3 + .sub-h { margin-top: 0; }

  /* Состояние сервера: лампочка стоит рядом со словом состояния. */
  .kv .v.running, .kv .v.silent { display: inline-flex; align-items: center; gap: 7px; }
  .kv .v.running { color: var(--up); }
  .kv .v.silent { color: var(--faint); }
  .dot {
    width: 9px; height: 9px; border-radius: 50%; display: inline-block; background: currentColor;
    box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 20%, transparent);
  }
  /* «Работает» дышит — как пульс демо на лендинге. Молчащий сервер не дышит. */
  .kv .v.running .dot { animation: heartbeat 2.6s ease-in-out infinite; }
  @keyframes heartbeat {
    0%, 100% { box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 20%, transparent); }
    50% { box-shadow: 0 0 0 6px color-mix(in srgb, currentColor 8%, transparent); }
  }
  @media (prefers-reduced-motion: reduce) {
    .kv .v.running .dot { animation: none; }
  }

  /* Лента событий «Сегодня» */
  .ev { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--edge-soft); }
  .ev:last-child { border-bottom: 0; padding-bottom: 0; }
  .ev .ic {
    width: 32px; height: 32px; flex: none; border-radius: 10px;
    display: grid; place-items: center; background: var(--edge-soft); font-size: 14px;
  }
  .ev .tx { font-size: 13px; color: var(--text); line-height: 1.5; }
  .ev .tx b { color: var(--heading); }
  .ev .tm { font-size: 11px; color: var(--faint); margin-top: 2px; font-family: var(--mono); }

  /* Распределение похожести */
  .bar { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
  .bar .lb { flex: 0 0 68px; font-size: 12.5px; color: var(--dim); }
  .bar .tk { flex: 1; height: 8px; border-radius: 99px; background: var(--edge-soft); overflow: hidden; }
  .bar .fl { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--primary), #1fa8c9); transition: width 0.35s ease; }
  .bar .pc { font: 600 12px var(--mono); color: var(--heading); width: 40px; text-align: right; }

  /* Версии: три плашки, а не слипшаяся строка */
  .vers { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; }
  .ver { padding: 10px 12px; border-radius: 10px; background: var(--edge-soft); border: 1px solid var(--edge); }
  .ver .k { display: block; font-size: 11.5px; color: var(--dim); }
  .ver b { display: block; margin-top: 3px; font-family: var(--mono); font-size: 13px; color: var(--heading); }

  .btn {
    display: block; width: 100%; text-align: center; padding: 12px; margin-top: 10px;
    border-radius: 12px; font: inherit; font-size: 14px; font-weight: 600;
    background: var(--primary); color: var(--primary-ink); border: 0; text-decoration: none;
  }

  /* ── Десктоп: макет V2 «Рабочий стол» (утверждён 2026-07-11) ──
     Виджетная сетка в две колонки: слева «Сегодня», справа сводка и сервер.
     Медиа-блок стоит В КОНЦЕ таблицы стилей осознанно: при равной специфичности
     выигрывает последнее правило, и мобильные значения выше его бы перебили (EXP-0026). */
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
      grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
      /* .body — строка 1fr в сетке экрана: без align-content лишняя высота
         растеклась бы по зазорам между виджетами (EXP-0026). А align-items: start
         не даёт короткому виджету растягиваться до высоты соседа-великана. */
      align-content: start;
      align-items: start;
      gap: 12px;
    }
    /* Виджеты во всю ширину панели; остальные ложатся парами по порядку:
       «Сегодня» | «Сейчас», «Похожесть» | «Сервер синхронизации». */
    .head, .tiles, .w-ver, .full { grid-column: 1 / -1; }
    .tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }
</style>

<script lang="ts">
  // Лендинг NDim Space — утверждённый макет «Колонна» (design/landing-mockups.html, V1),
  // светлая тема «Бумага» по умолчанию + тёмная (синий киберпанк) по переключателю.
  // Переключатель языка RU/EN — как в оригинальном ndim 1.x (клиентский свап текста).
  //
  // Тексты — владельца, RU+EN из researches/05_onboarding_texts_1x.md.
  // Тема и палитра — CSS-переменные из +layout.svelte; здесь всё берётся из них.
  //
  // Кнопки ведут В САМ ПРОДУКТ 2.0: «Создать аккаунт» и «Войти» открывают /profile,
  // где живёт вход без пароля (Google · ссылка на почту) и гостевой режим. Человек из 1.x
  // входит там же и той же почтой — его измерения и связи на месте.
  //
  // ✅ per-URL i18n СДЕЛАН (`plans/39` шаг 2): лендинг живёт на `/ru` и `/en`, каждый
  // пререндерен на СВОЁМ языке. Прежний клиентский свап текста при одном адресе умер вместе
  // с TODO(SEO), который здесь стоял.
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { SITE_ORIGIN } from '$lib/site';
  import { siteJsonLd } from '$lib/content/dim-jsonld';

  /* Разметка сайта считается один раз: она не зависит ни от языка, ни от состояния экрана.
     `<` экранируется по той же причине, что на страницах каталога, — строка едет внутрь
     `<script>` через `{@html}`. */
  const siteLd = JSON.stringify(siteJsonLd(SITE_ORIGIN)).replace(/</g, '\\u003c');
  import { LANGS, X_DEFAULT, isLang } from '$lib/content/langs';
  /*
   * ДВЕРЬ С ЛЕНДИНГА В КАТАЛОГ (`plans/48` шаг 3–4). Импортируются только словарь видов и
   * склейка адресов — оба модуля на пару килобайт и без единого байта самого каталога.
   * 🔴 Иначе нельзя: загрузчик лендинга УНИВЕРСАЛЬНЫЙ (`+page.ts`), и всё, что он тянет за
   * собой, уезжает в клиентский бандл целиком (`EXP-0136`).
   */
  import { KIND_KEYS, kindTitle } from '$lib/content/dim-kind';
  import { catalogPath, hubPath } from '$lib/content/catalog-hub';
  import { landingCopy, landingFeatures } from '$lib/content/landing-copy';
  import Icon from '$lib/ui/Icon.svelte';
  import SimilarityDemo from '$lib/ui/SimilarityDemo.svelte';
  import { track } from '$lib/data/funnel';
  import { landingDims, landingPeople, landingRatings, landingRelations } from '$lib/data/metrics';
  import { endBoot, hasSession } from '$lib/data/session';
  import { num, peopleUnit, type Lang } from '$lib/ui/format';
  // Тема — общий источник истины (bugs/53): лендинг, шапка и «Меню» читают одно значение.
  import { theme, toggleTheme } from '$lib/ui/theme.svelte';

  /** Дверь в продукт: вход, гостевой режим и профиль — всё на одном экране. */
  const APP_URL = '/profile';

  /*
   * ✅ МОСТ ИЗ ДЕМО В ПРОДУКТ — ДОЛГ ЗАКРЫТ 2026-08-21 (`plans/67` Ш1, фаза 5 эпика `plans/23`).
   *
   * Кнопка демо ведёт СРАЗУ в гостя — мгновенный анонимный вход без единой формы, одинаково на
   * стенде и в бою. Здесь стоял долг: гостевая дверь открывалась ТОЛЬКО на localhost — строкой
   * `if (['localhost','127.0.0.1'].includes(location.hostname)) demoUrl = '/profile?guest=1'`
   * в `onMount`, — а публичный посетитель на пике интереса упирался в стену входа. Это трение
   * `ideas/09` в чистом виде, ради снятия которого гостевой режим и строился. Дверь
   * `/profile?guest=1` в бою проверена (bugs/95), сама уважает живую сессию и сама вычищает
   * параметр из адреса (bugs/125) — держать её за localhost было не за что.
   *
   * 🔴 Адрес больше НЕ `$state` и не правится в `onMount`: он один для всех хостов и потому
   * стоит уже в ПРЕРЕНДЕРЕ. Прежняя правка после гидрации создавала окно, в котором ссылка
   * вела НЕ ТУДА, — окна больше нет.
   * ⚠️ Про «работает без JS» здесь не написано намеренно: саму кнопку моста демо показывает
   * ПОСЛЕ действия человека (Ш4 `plans/67`, композиция владельца), то есть она требует живого
   * скрипта. Без JS человек входит витринными кнопками выше — это их работа.
   * 🔴 И это ДРУГАЯ дверь, чем `APP_URL` выше: та ведёт ко ВХОДУ (кнопки витрины, ссылка из
   * письма), эта — в гостя. Сливать их в одну константу нельзя.
   */
  const DEMO_URL = '/profile?guest=1';

  // 🔴 Язык — ИЗ АДРЕСА (`plans/39` шаг 2): `/ru` пререндерен русским, `/en` — английским,
  // и человек с «неправильной» памятью видит язык адреса, на который пришёл. Модуль состояния
  // здесь больше не читается: при пререндере у него нет адреса и он отвечал бы «ru» ОБЕИМ
  // страницам — английский лендинг запёкся бы русским. Память за адресом ведёт мост в
  // `[lang=lang]/+layout.svelte`, а не эта страница.
  const lang = $derived(isLang(page.params.lang) ? page.params.lang : 'ru');
  // Абсолютный canonical гасит дубли трёх хостов (researches/08 §2, §5) — теперь на СВОЙ
  // языковой адрес. Домен — единая константа src/lib/site.ts (её же использует sitemap.xml).
  const canonicalUrl = $derived(`${SITE_ORIGIN}/${lang}`);

  /*
   * «С нами уже N человек» — число ГОТОВО К ПЕРВОМУ КАДРУ (bugs/81).
   *
   * Слово владельца (`ideas/21` п. 10): строка «открывается на горячую поверх уже
   * отображаемого лендинга — неправильно». Так и было, и иначе быть не могло: число читалось
   * из Firestore уже после того, как лендинг показан (замер: кадр 0 — строки нет, кадр 17 —
   * есть). Теперь оно приходит из снимка, взятого перед выкатом (`data/metrics.ts` →
   * `landingPeople`), то есть лежит в пререндеренном HTML — доезжать нечему.
   *
   * Обычная константа, а не `$state`: значение не меняется в течение жизни страницы, и
   * реактивность здесь означала бы, что оно может измениться на глазах у человека — ровно то,
   * от чего мы уходим.
   */
  // Все числа витрины — в том же пререндере и по тому же правилу: снимок, а не литерал.
  const joinedPeople = landingPeople();
  const joinedDims = landingDims();
  const joinedRatings = landingRatings();
  const joinedRelations = landingRelations();

  onMount(() => {
    // ── Человек пришёл по ссылке из письма, но попал на ЛЕНДИНГ — уводим его в профиль ──
    //
    // Поймано на боевом выкате 2026-07-12. В проекте Firebase переопределён Action URL писем:
    // он указывает на КОРЕНЬ старого домена (наследие 1.x, где всё приложение жило в одном
    // index.html и само разбирало oobCode). В 2.0 корень — это лендинг, про вход он не знает,
    // и человек, ткнув ссылку из письма, оказывался ровно там, откуда начал.
    //
    // Проверяем БЕЗ Firebase — простым чтением адреса. Импортировать сюда account.ts нельзя:
    // он тянет за собой SDK, а лендинг обязан оставаться лёгким (SDK в его бандле нет, и это
    // охраняется). Код входа не теряем — передаём весь query дальше как есть.
    const query = new URLSearchParams(location.search);
    if (query.get('mode') === 'signIn' && query.has('oobCode')) {
      location.replace(`${APP_URL}${location.search}${location.hash}`);
      return;
    }

    // ── Вошедший человек лендинг не разглядывает — его дом внутри продукта (bugs/08.1) ──
    // Гость тоже «внутри»: у него живая сессия и несохранённый труд. Проверка живёт в
    // отложенном чанке (`data/session.ts` — динамический импорт SDK, канон EXP-0028),
    // поэтому пререндер и лёгкость лендинга не страдают: лендинг рисуется сразу,
    // а сессия, если она есть, тихо уводит человека домой.
    //
    // Воронка и счётчик — ПОСЛЕ ответа о сессии, только для тех, кто остаётся:
    //   · вошедший не должен засчитываться в `landing_view` (он не входящий);
    //   · чтение, оборванное редиректом, роняло бы шум Firestore в консоль.
    void hasSession().then((inside) => {
      if (inside) {
        // Щит НЕ опускаем: человек уходит внутрь, и под щитом он не увидит ни кадра
        // лендинга (bugs/40, канон 1.x — гасить только после того, как открыт нужный экран).
        location.replace(APP_URL);
        return;
      }
      // Сессии нет — лендинг и есть нужный экран, щит своё отработал. Сюда попадают только
      // те, у кого маркер соврал (вышел в другой вкладке, сессия истекла): у гостя щита
      // не было вовсе, и вызов для него — безобидная холостая работа.
      endBoot();
      // Первый шаг воронки (plans/03 этап 4). Ничего персонального не пишет и
      // ничего не ждёт: аналитика не имеет права тормозить лендинг.
      void track('landing_view');
      // Витрину людей здесь больше не читаем — она в пререндере (bugs/81, см. `joinedPeople`).
    });

    // Тема и язык — общие источники истины (bugs/53, `plans/39`): они сами читают то, что
    // проставил инлайн-скрипт, и сами хранят выбор. Мост в гостя здесь больше не правится —
    // он константа `DEMO_URL` и стоит в пререндере (`plans/67` Ш1).
  });

  // ── Тексты витрины ──
  // Вынесены в `src/lib/content/landing-copy.ts` (plans/29 §4, plans/21 фаза 2): эпик plans/24
  // переносит лендинг на адреса языков, и инлайновые литералы пришлось бы переписывать второй раз.
  // 🔴 Правка текста витрины идёт ЧЕРЕЗ ВЫЧИТКУ ВЛАДЕЛЬЦА, а не здесь.
  const t = landingCopy;
  const feats = landingFeatures;
</script>

<svelte:head>
  <title>{t.metaTitle[lang]}</title>
  <link rel="canonical" href={canonicalUrl} />
  <!-- Двусторонний hreflang с самоссылкой — без неё разметка игнорируется целиком
       (researches/26 §4.1); x-default на английский (интервью №010, Р5). Тот же блок,
       что на страницах каталога. -->
  {#each LANGS as l (l)}
    <link rel="alternate" hreflang={l} href={`${SITE_ORIGIN}/${l}`} />
  {/each}
  <link rel="alternate" hreflang="x-default" href={`${SITE_ORIGIN}/${X_DEFAULT}`} />
  <meta name="description" content={t.metaDesc[lang]} />
  <meta property="og:title" content={t.metaTitle[lang]} />
  <meta property="og:description" content={t.sub[lang]} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:locale" content={lang === 'en' ? 'en_US' : 'ru_RU'} />
  <!--
    `Organization` + `WebSite` — давний долг `researches/26` §7.6, закрыт `plans/48` шаг 5.
    Rich result они не дают и не должны: их работа — имя сайта и логотип в выдаче.
    ⛔ `SearchAction` внутри `WebSite` НЕ ставится: sitelinks search box удалён в ноябре 2024,
    и с тех пор это мёртвый код, который ставят по привычке (§7.2). Почему один и тот же блок
    стоит на обеих языковых главных — в шапке `dim-jsonld.ts`.
  -->
  {@html `<script type="application/ld+json">${siteLd}</script>`}
</svelte:head>

<!-- Открытое цифровое пространство: едва видные неоновые узлы и связи.
     Точки — люди; линии — связи между ними. Декорация, скрыта от скринридеров. -->
<div class="field" aria-hidden="true">
  <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
    <g class="links">
      <line x1="120" y1="180" x2="320" y2="120" /><line x1="320" y1="120" x2="470" y2="260" />
      <line x1="1180" y1="140" x2="1330" y2="240" /><line x1="1180" y1="140" x2="1040" y2="90" />
      <line x1="180" y1="640" x2="360" y2="740" /><line x1="1240" y1="660" x2="1100" y2="780" />
      <line x1="90" y1="420" x2="230" y2="470" /><line x1="1350" y1="430" x2="1230" y2="500" />
      <line x1="700" y1="60" x2="850" y2="110" /><line x1="620" y1="820" x2="780" y2="850" />
    </g>
    <g class="nodes">
      <circle cx="120" cy="180" r="3.5" /><circle cx="320" cy="120" r="5" />
      <circle cx="470" cy="260" r="3" /><circle cx="1180" cy="140" r="4.5" />
      <circle cx="1330" cy="240" r="3" /><circle cx="1040" cy="90" r="2.5" />
      <circle cx="180" cy="640" r="4" /><circle cx="360" cy="740" r="3" />
      <circle cx="1240" cy="660" r="4.5" /><circle cx="1100" cy="780" r="3" />
      <circle cx="90" cy="420" r="3" /><circle cx="230" cy="470" r="4" />
      <circle cx="1350" cy="430" r="3.5" /><circle cx="1230" cy="500" r="2.5" />
      <circle cx="700" cy="60" r="3" /><circle cx="850" cy="110" r="3.5" />
      <circle cx="620" cy="820" r="3.5" /><circle cx="780" cy="850" r="2.5" />
    </g>
    <g class="accents">
      <circle cx="540" cy="150" r="2.5" /><circle cx="930" cy="700" r="3" />
      <circle cx="1300" cy="90" r="2" /><circle cx="70" cy="760" r="2.5" />
    </g>
  </svg>
</div>
<!-- Виньетка: края экрана уходят в глубину пространства -->
<div class="vig" aria-hidden="true"></div>

<!-- Переключатели языка (RU|EN) и темы (☀/☾) — фиксированы в верхнем углу -->
<div class="controls">
  <!-- 🔴 Язык — ССЫЛКАМИ на языковые адреса, а не подменой текста на месте (`plans/39` шаг 2):
       у каждого языка своя страница, и адрес обязан совпадать с тем, что человек читает, —
       иначе canonical и hreflang врут, а скопированная ссылка приводит друга не туда.
       Память идёт за адресом сама (мост в `[lang=lang]/+layout.svelte`). -->
  <div class="lang" role="group" aria-label="Язык / Language">
    <a class:on={lang === 'ru'} aria-current={lang === 'ru' ? 'page' : undefined} href="/ru">RU</a>
    <a class:on={lang === 'en'} aria-current={lang === 'en' ? 'page' : undefined} href="/en">EN</a>
  </div>
  <button
    type="button"
    class="toggle"
    onclick={toggleTheme}
    aria-label={theme() === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
  >
    <span class="ico"><Icon name={theme() === 'dark' ? 'sun' : 'moon'} size={15} /></span>
    <span class="lbl">{t.themeLabel[theme()][lang]}</span>
  </button>
</div>

<main class="content">
  <section class="card">
    <span class="pulse" aria-hidden="true"></span>
    <p class="eyebrow">{t.eyebrow[lang]}</p>
    <h1>{t.title[lang]}</h1>
    <p class="sub">{t.sub[lang]}</p>
    <div class="cta">
      <a class="btn primary" href={APP_URL}>{t.create[lang]}</a>
      <a class="btn ghost" href={APP_URL}>{t.login[lang]}</a>
    </div>
    <!-- Строка витрины стоит БЕЗ условия и БЕЗ перехода появления: она часть страницы, а не
         новость, приехавшая позже (bugs/81). Условие `{#if}` и `in:fade` здесь и были тем
         самым «на горячую»: сначала вставлялся узел, потом он ещё и проявлялся 240 мс. -->
    <!-- ПОЛОСА НАСТОЯЩИХ ЧИСЕЛ (слово владельца 2026-08-02: «число связей можно писать — оно
         математически получается огромным и внушительным, и число оценок измерений»).
         Все четыре — из снимка боя, литералов нет. Каждое сильнее, чем счёт людей в одиночку:
         оценки и связи растут быстрее, чем число человек, и это честное преимущество математики. -->
    <ul class="stats" aria-label={t.statsLabel[lang]}>
      {#each [{ v: joinedDims, l: t.statDims }, { v: joinedRatings, l: t.statRatings }, { v: joinedRelations, l: t.statRelations }, { v: joinedPeople, l: t.statPeople }] as stat (stat.l.ru)}
        <li><b>{num(stat.v, lang)}</b><span>{stat.l[lang]}</span></li>
      {/each}
    </ul>
    <p class="joined">{t.joined[lang]}
    </p>
  </section>

  <section class="feats" aria-label="Как устроено Пространство NDim">
    {#each feats as feat}
      <article class="feat">
        <p class="tag">{feat.tag[lang]}</p>
        <h2>{feat.h2[lang]}</h2>
        <p>{feat.p[lang]}</p>
      </article>
    {/each}
  </section>

  <!-- Демо похожести: «пощупать до аккаунта» (ideas/10, макет V5 «Синтез») -->
  <SimilarityDemo {lang} appUrl={DEMO_URL} />

  <!-- Дверь в каталог: семь разделов прямо с главной плюс общий индекс. Ссылка с главной —
       самый сильный внутренний сигнал важности, какой у сайта есть (`researches/34` §6.3). -->
  <nav class="catalog" aria-label={t.catalogTitle[lang]}>
    <h2>{t.catalogTitle[lang]}</h2>
    <p>{t.catalogLine[lang]}</p>
    <ul>
      {#each KIND_KEYS as key (key)}
        <li><a href={hubPath(lang, key)}>{kindTitle(key, lang)}</a></li>
      {/each}
      <li><a class="all" href={catalogPath(lang)}>{t.catalogAll[lang]}</a></li>
    </ul>
  </nav>

  <footer class="foot">
    <span>{t.foot[lang]}</span>
  </footer>
</main>

<style>
  /* ── Открытое пространство ── */
  .field {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }
  .field svg {
    width: 100%;
    height: 100%;
  }
  .field .links line {
    stroke: var(--link-stroke);
    stroke-width: 1;
  }
  .field .nodes circle {
    fill: var(--node-fill);
  }
  .field .accents circle {
    fill: var(--accent-node);
  }

  .vig {
    position: fixed;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    background: radial-gradient(120% 105% at 50% 42%, transparent 52%, var(--vig) 100%);
  }

  .content {
    position: relative;
    z-index: 2;
    max-width: 440px;
    margin: 0 auto;
    padding: 9vh 20px 56px;
  }

  /* ── Переключатели темы и языка ── */
  .controls {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 5;
    display: inline-flex;
    gap: 8px;
  }
  .lang {
    display: inline-flex;
    border-radius: 999px;
    overflow: hidden;
    background: var(--toggle-bg);
    border: 1px solid var(--toggle-brd);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  .lang a {
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    cursor: pointer;
    border: none;
    background: transparent;
    color: var(--dim);
    padding: 7px 11px;
    transition: background 0.18s, color 0.18s;
    text-decoration: none; /* ссылка выглядит той же капсулой, что была кнопкой */
  }
  .lang a.on {
    background: var(--primary);
    color: var(--primary-ink);
  }
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 11px;
    border-radius: 999px;
    background: var(--toggle-bg);
    border: 1px solid var(--toggle-brd);
    color: var(--accent);
    cursor: pointer;
    font: inherit;
    font-size: 15px;
    line-height: 1;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    transition: border-color 0.2s;
  }
  @media (hover: hover) {
    .toggle:hover {
      border-color: var(--accent);
    }
  }
  .toggle .lbl {
    font-size: 12px;
    font-weight: 600;
    color: var(--dim);
  }

  /* ── Карточка-колонна ── */
  .card {
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 18px;
    padding: 36px 26px 28px;
    text-align: center;
    backdrop-filter: blur(var(--panel-blur));
    -webkit-backdrop-filter: blur(var(--panel-blur));
    box-shadow: var(--card-shadow);
    transition: background 0.3s, border-color 0.3s, box-shadow 0.3s;
  }

  .pulse {
    display: block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin: 0 auto 20px;
    background: var(--accent);
    box-shadow:
      0 0 0 5px color-mix(in srgb, var(--accent) 14%, transparent),
      0 0 18px color-mix(in srgb, var(--accent) 70%, transparent);
    animation: pulse 2.6s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,
    100% {
      box-shadow:
        0 0 0 5px color-mix(in srgb, var(--accent) 14%, transparent),
        0 0 18px color-mix(in srgb, var(--accent) 70%, transparent);
    }
    50% {
      box-shadow:
        0 0 0 9px color-mix(in srgb, var(--accent) 5%, transparent),
        0 0 26px color-mix(in srgb, var(--accent) 45%, transparent);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .pulse {
      animation: none;
    }
  }

  .eyebrow {
    font-family: var(--mono);
    font-size: 11.5px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--accent);
  }

  h1 {
    margin-top: 14px;
    font-size: 27px;
    line-height: 1.22;
    font-weight: 800;
    letter-spacing: -0.015em;
    color: var(--heading);
  }

  .sub {
    margin-top: 14px;
    font-size: 15.5px;
    line-height: 1.65;
    color: var(--dim);
  }

  /* ── Кнопки: плоские, без градиентов ── */
  .cta {
    margin-top: 26px;
    display: grid;
    gap: 10px;
  }
  .btn {
    display: block;
    padding: 14px 20px;
    border-radius: 10px;
    font-size: 16px;
    font-weight: 600;
    text-decoration: none;
    text-align: center;
    transition: filter 0.15s, background 0.15s, box-shadow 0.15s;
  }
  .btn.primary {
    background: var(--primary);
    color: var(--primary-ink);
    box-shadow: 0 0 22px color-mix(in srgb, var(--primary) 35%, transparent);
  }
  @media (hover: hover) {
    .btn.primary:hover {
      filter: brightness(1.1);
    }
  }
  .btn.ghost {
    background: transparent;
    border: 1px solid var(--ghost-brd);
    color: var(--ghost-ink);
  }
  @media (hover: hover) {
    .btn.ghost:hover {
      background: var(--ghost-bg-hover);
    }
  }

  /* ── Полоса настоящих чисел Пространства ──
     Числа набраны КРУПНО и акцентом, подписи мелко: витрина обязана хвастаться, а не отчитываться.
     Перенос по строкам разрешён — на 390px четыре плитки честно встают в две строки, и это лучше,
     чем сжимать цифры до нечитаемых. Разделителей нет: зазор справляется сам. */
  .stats {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px 26px;
    margin: 20px 0 0;
    padding: 0;
    list-style: none;
  }
  .stats li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 74px;
  }
  .stats b {
    font-size: 22px;
    font-weight: 700;
    line-height: 1.1;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  .stats span {
    font-size: 11px;
    letter-spacing: 0.02em;
    color: var(--faint);
    text-align: center;
  }
  .joined {
    margin-top: 12px;
    font-size: 13px;
    color: var(--faint);
  }

  /* ── Фичи ── */
  .feats {
    margin-top: 22px;
    display: grid;
    gap: 12px;
  }
  .feat {
    background: var(--panel-2);
    border: 1px solid var(--edge-soft);
    border-radius: 14px;
    padding: 20px 22px;
    backdrop-filter: blur(calc(var(--panel-blur) * 0.8));
    -webkit-backdrop-filter: blur(calc(var(--panel-blur) * 0.8));
    transition: background 0.3s, border-color 0.3s;
  }
  .feat .tag {
    font-family: var(--mono);
    font-size: 10.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .feat h2 {
    margin-top: 8px;
    font-size: 16px;
    line-height: 1.35;
    font-weight: 700;
    color: var(--heading);
  }
  .feat p:last-child {
    margin-top: 7px;
    font-size: 14px;
    line-height: 1.6;
    color: var(--dim);
  }

  /* ── Дверь в каталог (`plans/48`). Стоит в подвале сознательно: это минимальное вторжение
     в утверждённый макет «Колонна» — лендинг остаётся территорией `plans/21`. ── */
  .catalog {
    margin-top: 34px;
    padding: 18px 16px;
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 16px;
    box-shadow: var(--card-shadow);
    text-align: center;
  }
  .catalog h2 {
    margin: 0;
    font-size: 16px;
    line-height: 1.35;
    font-weight: 700;
    color: var(--heading);
  }
  .catalog p {
    margin: 6px 0 0;
    font-size: 13px;
    line-height: 1.55;
    color: var(--dim);
  }
  .catalog ul {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 7px;
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
  }
  .catalog a {
    display: inline-block;
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid var(--edge);
    font-size: 13px;
    color: var(--dim);
    text-decoration: none;
  }
  /* «Весь каталог» — вход в индекс, а не восьмой раздел: выделен цветом бренда. */
  .catalog a.all {
    color: var(--accent);
    font-weight: 600;
  }

  .foot {
    margin-top: 34px;
    text-align: center;
    font-size: 12px;
    color: var(--faint);
  }

  /* ── Десктоп: лендинг раскрывается на всю ширину (правка владельца 2026-07-11:
     «узко в центре — хотелось бы шире, эффективнее занять место»). Раньше здесь
     колонна намеренно оставалась узкой; теперь широкий экран получает своё:
     герой-постер держит читаемую длину строки, а фичи и демо расходятся вширь. ── */
  @media (min-width: 760px) {
    .content {
      max-width: 1040px;
      padding-top: 8vh;
    }
    /* Постер: карточка во всю колонку, но текст в ней — читаемой длины */
    .card h1,
    .card .sub {
      max-width: 640px;
      margin-inline: auto;
    }
    .feats {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>

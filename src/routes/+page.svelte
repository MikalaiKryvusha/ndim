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
  // TODO(SEO): полноценный per-URL i18n (RU/EN как отдельные адреса) — решение на потом;
  //            сейчас RU пререндерится, EN переключается на клиенте (паритет с 1.x).
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { SITE_ORIGIN } from '$lib/site';
  import SimilarityDemo from '$lib/ui/SimilarityDemo.svelte';
  import { track } from '$lib/data/funnel';
  import { loadPublicPeople } from '$lib/data/metrics';
  import { hasSession } from '$lib/data/session';
  import { num, peopleUnit } from '$lib/ui/format';
  import { MOTION } from '$lib/ui/motion';

  /** Дверь в продукт: вход, гостевой режим и профиль — всё на одном экране. */
  const APP_URL = '/profile';
  // Абсолютный canonical гасит дубли трёх хостов (researches/08 §2, §5).
  // Домен — единая константа src/lib/site.ts (её же использует sitemap.xml).
  const CANONICAL_URL = `${SITE_ORIGIN}/`;

  // Мост из демо в гостя (plans/03 этап 2): на стенде CTA демо ведёт в гостевой режим
  // (мгновенный анонимный вход). На публичном хосте — пока в живое 1.x, как весь лендинг:
  // прод-гость откроется с публикацией 2.0 (данных 2.0 на проде ещё нет).
  let demoUrl = $state(APP_URL);

  type Lang = 'ru' | 'en';
  type Theme = 'light' | 'dark';

  // Стартовые значения совпадают с пререндером (RU + светлая), поэтому гидрация не рвётся.
  // Реальный сохранённый выбор подхватываем в onMount (только в браузере).
  let lang = $state<Lang>('ru');
  let theme = $state<Theme>('light');

  // «С нами уже N человек» — ЖИВОЕ число из space/public_metrics (пишет сервер
  // синхронизации; bugs/07). Пока числа нет — строки нет: выдуманное число хуже
  // отсутствующего (здесь стоял литерал «2 184 человека» при 331 живом).
  let joinedPeople = $state<number | null>(null);

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
        location.replace(APP_URL);
        return;
      }
      // Первый шаг воронки (plans/03 этап 4). Ничего персонального не пишет и
      // ничего не ждёт: аналитика не имеет права тормозить лендинг.
      void track('landing_view');
      // Живой счётчик людей — тоже не ждём: строка тихо появится, когда число придёт.
      void loadPublicPeople().then((people) => (joinedPeople = people));
    });

    // Источник истины темы — атрибут, выставленный инлайн-скриптом app.html.
    const attr = document.documentElement.getAttribute('data-theme');
    theme = attr === 'dark' ? 'dark' : 'light';
    const savedLang = localStorage.getItem('ndim-lang');
    if (savedLang === 'en' || savedLang === 'ru') lang = savedLang;
    if (['localhost', '127.0.0.1'].includes(location.hostname)) demoUrl = '/profile?guest=1';
  });

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ndim-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#060b14' : '#f6f8fb');
  }

  function setLang(next: Lang) {
    lang = next;
    document.documentElement.setAttribute('lang', next);
    localStorage.setItem('ndim-lang', next);
  }

  // ── Двуязычные строки (RU — основной, из онбординга владельца) ──
  const t = {
    metaTitle: {
      ru: 'NDim Space — Знакомства нового измерения',
      en: 'NDim Space — New Dimension Friendships',
    },
    metaDesc: {
      ru: 'Здесь Вы найдёте людей, действительно похожих на Вас. Забудьте о бесконечных свайпах — Пространство NDim подберёт тех, с кем у Вас настоящая совместимость.',
      en: 'Here you will find people who are really like you. Forget about endless swiping — NDim Space selects those with whom you are truly compatible.',
    },
    eyebrow: { ru: 'Знакомства нового измерения', en: 'New Dimension Friendships' },
    title: { ru: 'Добро пожаловать в Пространство NDim', en: 'Welcome to the NDim Space' },
    sub: {
      ru: 'Здесь Вы найдёте людей, действительно похожих на Вас. Забудьте о бесконечных свайпах — мы подберём тех, с кем у Вас настоящая совместимость.',
      en: "Here you will find people who are really like you. Forget about endless swiping — we'll select those with whom you are truly compatible.",
    },
    create: { ru: 'Создать Аккаунт', en: 'Create Account' },
    login: { ru: 'Войти в Аккаунт', en: 'Log In' },
    joinedPre: { ru: 'С нами уже ', en: 'We already have ' },
    joinedPost: { ru: ' — и каждый день приходят новые', en: ' — and new ones come every day' },
    foot: {
      ru: 'Пространство NDim · открытая платформа, сделанная с заботой о людях',
      en: 'NDim Space · an open platform built with care for people',
    },
    // Подпись переключателя темы: показываем, КУДА переключит нажатие
    themeLabel: {
      light: { ru: 'тёмная', en: 'dark' },
      dark: { ru: 'светлая', en: 'light' },
    },
  };

  const feats = [
    {
      tag: { ru: '01 · NDim ID', en: '01 · NDim ID' },
      h2: { ru: 'Ваш уникальный многомерный профиль', en: 'Your unique multi-dimensional profile' },
      p: {
        ru: 'Заполните измерения, отражающие Вашу личность, — и позвольте алгоритму найти тех, кто разделяет Ваши ценности и интересы.',
        en: 'Fill in the dimensions that reflect your personality, and let the algorithm find those who share your values and interests.',
      },
    },
    {
      tag: { ru: '02 · Настоящие связи', en: '02 · Real Connections' },
      h2: {
        ru: 'Люди, с которыми у Вас настоящая совместимость',
        en: 'People with whom you are truly compatible',
      },
      p: {
        ru: 'Мы бережно анализируем Ваш профиль и находим самых похожих на Вас людей. Начните общение с теми, кто действительно Вам подходит.',
        en: 'We carefully analyze your profile and find the people most similar to you. Start communicating with those who are really right for you.',
      },
    },
    {
      tag: { ru: '03 · С заботой', en: '03 · With Care' },
      h2: { ru: 'Ваш внутренний мир под защитой', en: 'Your inner world is protected' },
      p: {
        ru: 'Ваши оценки остаются только Вашими. Другие видят лишь то, насколько вы близки, — не то, из чего эта близость сложилась.',
        en: 'Your ratings stay yours alone. Others see only how close you are — not what that closeness is made of.',
      },
    },
  ];
</script>

<svelte:head>
  <title>{t.metaTitle[lang]}</title>
  <link rel="canonical" href={CANONICAL_URL} />
  <meta name="description" content={t.metaDesc[lang]} />
  <meta property="og:title" content={t.metaTitle[lang]} />
  <meta property="og:description" content={t.sub[lang]} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={CANONICAL_URL} />
  <meta property="og:locale" content={lang === 'en' ? 'en_US' : 'ru_RU'} />
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
  <div class="lang" role="group" aria-label="Язык / Language">
    <button type="button" class:on={lang === 'ru'} aria-pressed={lang === 'ru'} onclick={() => setLang('ru')}>RU</button>
    <button type="button" class:on={lang === 'en'} aria-pressed={lang === 'en'} onclick={() => setLang('en')}>EN</button>
  </div>
  <button
    type="button"
    class="toggle"
    onclick={toggleTheme}
    aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
  >
    <span class="ico" aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
    <span class="lbl">{t.themeLabel[theme][lang]}</span>
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
    {#if joinedPeople !== null}
      <p class="joined" in:fade={{ duration: MOTION.base }}>
        {t.joinedPre[lang]}<b>{num(joinedPeople, lang)} {peopleUnit(joinedPeople, lang)}</b>{t.joinedPost[lang]}
      </p>
    {/if}
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
  <SimilarityDemo {lang} appUrl={demoUrl} />

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
  .lang button {
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
  }
  .lang button.on {
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
  .toggle:hover {
    border-color: var(--accent);
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
  .btn.primary:hover {
    filter: brightness(1.1);
  }
  .btn.ghost {
    background: transparent;
    border: 1px solid var(--ghost-brd);
    color: var(--ghost-ink);
  }
  .btn.ghost:hover {
    background: var(--ghost-bg-hover);
  }

  .joined {
    margin-top: 18px;
    font-size: 13px;
    color: var(--faint);
  }
  .joined b {
    color: var(--accent);
    font-weight: 600;
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

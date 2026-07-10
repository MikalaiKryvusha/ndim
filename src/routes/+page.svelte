<script lang="ts">
  // Лендинг NDim Space — утверждённый макет «Колонна» (design/landing-mockups.html, V1)
  // в утверждённом стиле: синий киберпанк, неон, лёгкие цифровые технологии,
  // кнопки без градиентов. Mobile-first: узкая колонна, вокруг открытое пространство.
  //
  // Тексты — владельца, из онбординга 1.x (researches/05_onboarding_texts_1x.md).
  //
  // Кнопки пока ведут в живое приложение 1.x (ndim-space.web.app): лендинг честный —
  // за ним стоит работающий продукт. TODO(фаза 3+): заменить на экраны 2.0.
  // TODO(фаза 3+): счётчик людей — живая метрика из space/public_metrics.
  const APP_URL = 'https://ndim-space.web.app';
  const PEOPLE_COUNT = '2 184';
</script>

<svelte:head>
  <title>NDim Space — Знакомства нового измерения</title>
  <meta
    name="description"
    content="Здесь Вы найдёте людей, действительно похожих на Вас. Забудьте о бесконечных свайпах — Пространство NDim подберёт тех, с кем у Вас настоящая совместимость."
  />
  <meta property="og:title" content="NDim Space — Знакомства нового измерения" />
  <meta
    property="og:description"
    content="Здесь Вы найдёте людей, действительно похожих на Вас. Настоящая совместимость вместо бесконечных свайпов."
  />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="ru_RU" />
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
<!-- Синяя виньетка: края экрана уходят в глубину пространства -->
<div class="vig" aria-hidden="true"></div>

<main class="content">
  <section class="card">
    <span class="pulse" aria-hidden="true"></span>
    <p class="eyebrow">Знакомства нового измерения</p>
    <h1>Добро пожаловать в Пространство&nbsp;NDim</h1>
    <p class="sub">
      Здесь Вы найдёте людей, действительно похожих на Вас. Забудьте о бесконечных свайпах —
      мы подберём тех, с кем у Вас настоящая совместимость.
    </p>
    <div class="cta">
      <a class="btn primary" href={APP_URL}>Создать Аккаунт</a>
      <a class="btn ghost" href={APP_URL}>Войти в Аккаунт</a>
    </div>
    <p class="joined">
      С нами уже <b>{PEOPLE_COUNT} человека</b> — и каждый день приходят новые
    </p>
  </section>

  <section class="feats" aria-label="Как устроено Пространство NDim">
    <article class="feat">
      <p class="tag">01 · NDim ID</p>
      <h2>Ваш уникальный многомерный профиль</h2>
      <p>
        Заполните измерения, отражающие Вашу личность, — и позвольте алгоритму найти тех,
        кто разделяет Ваши ценности и интересы.
      </p>
    </article>
    <article class="feat">
      <p class="tag">02 · Настоящие связи</p>
      <h2>Люди, с которыми у Вас настоящая совместимость</h2>
      <p>
        Мы бережно анализируем Ваш профиль и находим самых похожих на Вас людей.
        Начните общение с теми, кто действительно Вам подходит.
      </p>
    </article>
    <article class="feat">
      <p class="tag">03 · С заботой</p>
      <h2>Ваш внутренний мир под защитой</h2>
      <p>
        Ваши оценки остаются только Вашими. Другие видят лишь то, насколько вы близки, —
        не то, из чего эта близость сложилась.
      </p>
    </article>
  </section>

  <footer class="foot">
    <span>Пространство NDim · открытая платформа, сделанная с заботой о людях</span>
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
    stroke: rgba(77, 159, 255, 0.16);
    stroke-width: 1;
  }
  .field .nodes circle {
    fill: rgba(99, 176, 255, 0.4);
  }
  .field .accents circle {
    fill: rgba(63, 217, 255, 0.55);
  }

  .vig {
    position: fixed;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    background: radial-gradient(
      120% 105% at 50% 42%,
      transparent 52%,
      rgba(8, 28, 58, 0.55) 100%
    );
  }

  .content {
    position: relative;
    z-index: 2;
    max-width: 440px;
    margin: 0 auto;
    padding: 9vh 20px 56px;
  }

  /* ── Карточка-колонна ── */
  .card {
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 18px;
    padding: 36px 26px 28px;
    text-align: center;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow:
      0 0 0 1px rgba(63, 217, 255, 0.06),
      0 24px 60px rgba(2, 8, 20, 0.6);
  }

  .pulse {
    display: block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin: 0 auto 20px;
    background: var(--neon);
    box-shadow:
      0 0 0 5px rgba(63, 217, 255, 0.12),
      0 0 18px rgba(63, 217, 255, 0.75);
    animation: pulse 2.6s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 5px rgba(63, 217, 255, 0.12), 0 0 18px rgba(63, 217, 255, 0.75); }
    50% { box-shadow: 0 0 0 9px rgba(63, 217, 255, 0.05), 0 0 26px rgba(63, 217, 255, 0.45); }
  }
  @media (prefers-reduced-motion: reduce) {
    .pulse { animation: none; }
  }

  .eyebrow {
    font-family: var(--mono);
    font-size: 11.5px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--neon);
  }

  h1 {
    margin-top: 14px;
    font-size: 27px;
    line-height: 1.22;
    font-weight: 800;
    letter-spacing: -0.015em;
    color: #eef6ff;
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
    background: #1467d6;
    color: #fff;
    box-shadow: 0 0 22px rgba(20, 103, 214, 0.35);
  }
  .btn.primary:hover {
    filter: brightness(1.12);
  }
  .btn.ghost {
    background: transparent;
    border: 1px solid rgba(63, 217, 255, 0.45);
    color: #a8e2ff;
  }
  .btn.ghost:hover {
    background: rgba(63, 217, 255, 0.08);
    box-shadow: 0 0 16px rgba(63, 217, 255, 0.2);
  }

  .joined {
    margin-top: 18px;
    font-size: 13px;
    color: #6d84a0;
  }
  .joined b {
    color: #8fd0ff;
    font-weight: 600;
  }

  /* ── Фичи ── */
  .feats {
    margin-top: 22px;
    display: grid;
    gap: 12px;
  }
  .feat {
    background: rgba(9, 18, 33, 0.66);
    border: 1px solid rgba(77, 159, 255, 0.14);
    border-radius: 14px;
    padding: 20px 22px;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  .feat .tag {
    font-family: var(--mono);
    font-size: 10.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(63, 217, 255, 0.75);
  }
  .feat h2 {
    margin-top: 8px;
    font-size: 16px;
    line-height: 1.35;
    font-weight: 700;
    color: #d7e9fb;
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
    color: #4d647e;
  }

  /* Десктоп: колонна остаётся узкой — вокруг ещё больше пространства */
  @media (min-width: 760px) {
    .content {
      padding-top: 12vh;
    }
  }
</style>

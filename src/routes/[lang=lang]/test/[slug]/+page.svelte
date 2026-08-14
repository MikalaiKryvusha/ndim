<!--
  СТРАНИЦА-ОБЁРТКА ТЕСТА — каркас **V5 «Зеркало + инструкция»**, утверждён владельцем
  (интервью №029, В2 = А; путь выбора: 4 макета → его слово «нравится v4, но чтобы была
  инструкция как в v2» → гибрид V5 → подтверждён). Макеты — `design/test-pages-mockups.html`.

  Блоки по каркасу: hero → компактная полоса трёх шагов → движок и панель «анкета растёт»
  рядом → «позовите второго» → «каким будет результат» → мост-паспорт → FAQ → подпись.
  Кнопки «Начать» нет сознательно: она была ценой V2 (церемония на странице без стены).

  ТАКТ А (`plans/42` шаг 3): содержание в сыром HTML, интерактива нет (`csr = false`).
  Карточка движка отрисована в честном СТАРТОВОМ состоянии (звёзды пусты, оценок ноль),
  панель анкеты — в пустом состоянии, ссылка приглашения по механике появляется только
  после оценок — тактом Б. Кнопки моста-паспорта приезжают тоже тактом Б, вместе с
  анкетой, которую они сохраняют.

  🔴 Чего здесь НЕТ и что нельзя «дочинить»:
    · чисел похожести и порядка близости — не публикуются нигде (№018 В4, №023);
      результат — совпадения ФАКТАМИ, у «калькулятора любви» — СЧЁТ совпадений (№028 В3 = А);
    · формы до результата — путь гостя без стены (канон `ideas/09`);
    · рельса навигации — как у всех публичных страниц (незнакомца из поиска пять пунктов
      рельса ведут в пять тупиков за стеной входа).
-->
<script lang="ts">
  import type { TestPageData } from './+page.server';
  import { LANGS, LANG_LABEL } from '$lib/content/langs';
  import Icon from '$lib/ui/Icon.svelte';
  // Знак бренда — тот же компонент, что в шапке приложения: витрина не рисует своих логотипов.
  import Brand from '$lib/ui/Brand.svelte';

  let { data }: { data: TestPageData } = $props();

  const c = $derived(data.copy);
  const other = $derived(LANGS.find((l) => l !== data.lang) ?? data.lang);

  /** Интерфейсные мелочи шапки — те же слова, что на страницах каталога. */
  const UI = {
    ru: { enter: 'Войти', theme: 'Тема' },
    en: { enter: 'Log in', theme: 'Theme' },
  } as const;
  const ui = $derived(UI[data.lang]);
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
       значок переключают стили по `data-theme` (страница объявлена `csr = false`). -->
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
      <p class="kind">{data.first.kind}</p>
      <p class="name">{data.first.name}</p>
      <p class="meta">{data.first.meta}</p>
      <p class="stars" aria-hidden="true">
        {#each Array(10) as _, i (i)}<i>★</i>{/each}
      </p>
      <p class="scale"><span>{data.first.scale0}</span><span>{data.first.scale10}</span></p>
      <p class="skip">{data.first.skip}</p>
    </section>

    <aside class="mirror">
      <h2>{c.mirrorTitle}</h2>
      <p class="empty">{c.mirrorEmpty}</p>
    </aside>
  </div>

  <!-- Приглашение второго: ссылка по механике рождается только после оценок (такт Б). -->
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

  <!-- Мост-паспорт: объяснение живой анкеты; кнопки сохранения приезжают тактом Б вместе
       с самой анкетой — кнопка «Сохранить» до первой оценки сохраняла бы пустоту. -->
  <section class="keep">
    <h2>{c.keepTitle}</h2>
    <p>{c.keepBody}</p>
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
  /* Звёзды в стартовом состоянии ПУСТЫ: оценок ещё нет, и врать залитостью нельзя. */
  .stars {
    display: flex;
    gap: 2px;
    margin: 0.6rem 0 0.15rem;
    font-size: 1.3rem;
  }
  .stars i {
    font-style: normal;
    color: var(--edge);
  }
  .scale {
    display: flex;
    justify-content: space-between;
    margin: 0;
    font-size: 0.68rem;
    color: var(--faint);
  }
  .skip {
    margin: 0.55rem 0 0;
    font-size: 0.8rem;
    color: var(--dim);
    text-decoration: underline;
    text-underline-offset: 2px;
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

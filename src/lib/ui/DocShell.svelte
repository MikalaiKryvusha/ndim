<script lang="ts">
  // Оболочка страниц раздела «Меню»: документы, поддержка, пожертвование, о системе, об авторе.
  //
  // Одна на все: навигация продукта (рельс на десктопе, нижняя панель на телефоне), шапка с
  // переключателем языка, кнопка «назад в Меню» и колонка текста комфортной ширины.
  // Экран сам решает, ЧТО показать, — оболочка отвечает за то, ГДЕ это живёт.
  //
  // Язык живёт здесь: страницы получают его снаружи через сниппет, чтобы не заводить
  // собственный переключатель на каждой из восьми страниц.
  import { type Snippet } from 'svelte';
  import { page } from '$app/state';
  import AppBar from '$lib/ui/AppBar.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import BottomNav from '$lib/ui/BottomNav.svelte';
  import SideRail from '$lib/ui/SideRail.svelte';
  import { SITE_ORIGIN } from '$lib/site';
  import { LANGS, X_DEFAULT, isLang, swapLangInPath } from '$lib/content/langs';
  import { lang as currentLang } from '$lib/ui/lang.svelte';
  import type { Lang } from '$lib/ui/format';

  let {
    title,
    children,
  }: {
    /** Заголовок страницы на обоих языках. */
    title: { ru: string; en: string };
    children: Snippet<[Lang]>;
  } = $props();

  // 🔴 Язык — ИЗ АДРЕСА (`plans/39` шаг 2): все страницы этой оболочки живут под
  // `[lang=lang]/menu/…`, и `/en/menu/terms` обязан запечься английским уже на пререндере —
  // а модуль состояния там без адреса отвечает «ru» всем. Модуль остаётся запасным на
  // невозможный случай адреса без языка, чтобы оболочка не падала на пустом параметре.
  // Память за адресом ведёт мост в `[lang=lang]/+layout.svelte`.
  const lang = $derived(isLang(page.params.lang) ? page.params.lang : currentLang());

  // Пара этой страницы на других языках — для hreflang ниже. Правило подмены сегмента — одно
  // на проект (`swapLangInPath`), копий «заменить кусок пути» здесь нет.
  const alternates = $derived(
    LANGS.map((l) => ({ hreflang: l, href: `${SITE_ORIGIN}${swapLangInPath(page.url.pathname, l) ?? page.url.pathname}` })),
  );

  // Стрелка — иконка набора (bugs/17, `back.svg` из 1.x), а не типографский ‹:
  // у глифа нет ни сетки, ни веса, и он не встаёт в линию с текстом.
  const back = { ru: 'Меню', en: 'Menu' } as const;
</script>

<!--
  🔓 ДОКУМЕНТЫ ОТКРЫТЫ ПОИСКУ 2026-08-01 — слово владельца: «Открываем всё!»
  (интервью №009, В11; исполняется эпиком `plans/24`, фаза 1).

  Здесь стояла ОДНА строка `<meta name="robots" content="noindex" />` — без объяснения, почему.
  Она закрывала от поиска ВСЕ девять страниц этой оболочки: руководство пользователя (20 тыс.
  знаков), условия, политику, «О проекте», «Об авторе», поддержку, пожертвование. Замер перед
  правкой: поиску были открыты **2 страницы из 19**, 3 692 знака против 53 385 закрытых.

  🔴 Почему это была не мелочь, а главная SEO-дыра проекта: `GOAL.md` называет невидимость в
  поиске одной из трёх исходных бед («Никто не знает о приложении, когда его нет в поисковике.
  О нём не говорят. Оно не развивается и не живёт»). Текст был написан, вычитан, опубликован —
  и заперт одной строкой.

  ⚠️ ЧТО ОСТАЁТСЯ ЗАКРЫТЫМ И ДОЛЖНО ОСТАТЬСЯ: личные экраны (`/profile`, `/relations`, `/dims`,
  `/space`, `/account`, `/menu`, `/auth/action`) — у каждого свой `noindex` на месте. Эта
  оболочка держит только ПУБЛИЧНЫЕ документы; если однажды в неё завернут личный экран, `noindex`
  придётся вернуть точечно, а не сюда.

  🔲 Описание (`meta description`) сознательно НЕ добавлено: это текст на лицо продукта, а тексты
  пишет и вычитывает владелец (`plans/21` фаза 2). Пустое описание честнее выдуманного —
  поисковик возьмёт фрагмент из самой страницы.
-->
<svelte:head>
  <title>NDim Space — {title[lang]}</title>
  <!-- Абсолютный canonical гасит дубли трёх хостов — тот же приём, что на лендинге.
       Путь уже несёт язык, поэтому canonical у каждой языковой версии свой. -->
  <link rel="canonical" href={`${SITE_ORIGIN}${page.url.pathname}`} />
  <!-- Двусторонний hreflang с самоссылкой (researches/26 §4.1) + x-default на английский
       (интервью №010, Р5) — тот же блок, что на лендинге и страницах каталога. -->
  {#each alternates as alt (alt.hreflang)}
    <link rel="alternate" hreflang={alt.hreflang} href={alt.href} />
  {/each}
  <link rel="alternate" hreflang="x-default" href={`${SITE_ORIGIN}${swapLangInPath(page.url.pathname, X_DEFAULT) ?? page.url.pathname}`} />
</svelte:head>

<div class="screen">
  <SideRail active="menu" {lang} />
  <AppBar />

  <main class="body">
    <a class="back" href="/menu"><Icon name="back" size={13} />{back[lang]}</a>
    <h1>{title[lang]}</h1>
    <article class="doc">
      {@render children(lang)}
    </article>
  </main>

  <BottomNav active="menu" {lang} />
</div>

<style>
  /* Оболочка во всю ширину, колонной зажат только контент (bugs/08.3). */
  .screen {
    min-height: 100vh; min-height: 100dvh;
    display: flex; flex-direction: column; background: var(--bg);
  }
  .body {
    flex: 1; padding: 14px 14px 24px;
    width: 100%; max-width: 458px; margin: 0 auto; /* 430px контента + поля */
  }
  .back {
    /* Флекс, а не inline-block: иконка и подпись стоят в одной линии по центрам —
       тот же класс дефекта, что чинила волна 11 в профиле. */
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 13px; font-weight: 600; color: var(--primary);
    text-decoration: none; margin-bottom: 10px;
  }
  h1 { font-size: 20px; font-weight: 700; color: var(--heading); margin-bottom: 14px; }

  /* Колонка текста: длинные документы читают глазами, а не сканируют. */
  .doc { font-size: 14.5px; line-height: 1.7; color: var(--text); }

  @media (min-width: 1024px) {
    .screen {
      max-width: none;
      display: grid;
      grid-template-columns: 232px minmax(0, 1fr);
      grid-template-rows: auto 1fr;
    }
    .body {
      width: 100%; max-width: 820px; margin: 0 auto; padding: 22px 26px 40px;
      align-self: start;
    }
  }
</style>

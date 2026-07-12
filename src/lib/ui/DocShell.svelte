<script lang="ts">
  // Оболочка страниц раздела «Меню»: документы, поддержка, пожертвование, о системе, об авторе.
  //
  // Одна на все: навигация продукта (рельс на десктопе, нижняя панель на телефоне), шапка с
  // переключателем языка, кнопка «назад в Меню» и колонка текста комфортной ширины.
  // Экран сам решает, ЧТО показать, — оболочка отвечает за то, ГДЕ это живёт.
  //
  // Язык живёт здесь: страницы получают его снаружи через сниппет, чтобы не заводить
  // собственный переключатель на каждой из восьми страниц.
  import { onMount, type Snippet } from 'svelte';
  import AppBar from '$lib/ui/AppBar.svelte';
  import BottomNav from '$lib/ui/BottomNav.svelte';
  import SideRail from '$lib/ui/SideRail.svelte';
  import type { Lang } from '$lib/ui/format';

  let {
    title,
    children,
  }: {
    /** Заголовок страницы на обоих языках. */
    title: { ru: string; en: string };
    children: Snippet<[Lang]>;
  } = $props();

  let lang = $state<Lang>('ru');

  onMount(() => {
    const saved = localStorage.getItem('ndim-lang');
    if (saved === 'en' || saved === 'ru') lang = saved;
  });

  function toggleLang() {
    lang = lang === 'ru' ? 'en' : 'ru';
    document.documentElement.setAttribute('lang', lang);
    localStorage.setItem('ndim-lang', lang);
  }

  const back = { ru: '‹ Меню', en: '‹ Menu' } as const;
</script>

<svelte:head>
  <title>NDim Space — {title[lang]}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="screen">
  <SideRail active="menu" {lang} />
  <AppBar {lang} onToggleLang={toggleLang} />

  <main class="body">
    <a class="back" href="/menu">{back[lang]}</a>
    <h1>{title[lang]}</h1>
    <article class="doc">
      {@render children(lang)}
    </article>
  </main>

  <BottomNav active="menu" {lang} />
</div>

<style>
  .screen {
    max-width: 430px; margin: 0 auto; min-height: 100vh; min-height: 100dvh;
    display: flex; flex-direction: column; background: var(--bg);
  }
  .body { flex: 1; padding: 14px 14px 24px; }
  .back {
    display: inline-block; font-size: 13px; font-weight: 600; color: var(--primary);
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

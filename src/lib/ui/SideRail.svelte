<script lang="ts">
  // Боковой рельс навигации — десктопная оболочка продукта 2.0.
  // Утверждён владельцем 2026-07-11: макет V2 «Рабочий стол»
  // (design/desktop-layout-mockups.html): постоянный рельс слева, контент —
  // во всю оставшуюся ширину. Разделы те же, что в нижней навигации.
  //
  // Рельс и нижняя навигация — взаимоисключающие: рельс появляется от 1024px,
  // BottomNav от 1024px прячется. Порог один, объявлен в обоих компонентах.
  import Brand from '$lib/ui/Brand.svelte';

  let {
    active,
    lang,
  }: { active: 'profile' | 'relations' | 'space' | 'dims' | 'menu'; lang: 'ru' | 'en' } = $props();

  const items = [
    { key: 'profile', href: '/profile', icon: '⌂', label: { ru: 'Профиль', en: 'Profile' } },
    { key: 'relations', href: '/relations', icon: '◎', label: { ru: 'Связи', en: 'Relations' } },
    { key: 'space', href: '/space', icon: '✳', label: { ru: 'Пространство', en: 'Space' } },
    // «Измерения» — ОТДЕЛЬНЫЙ раздел, как было в 1.x. Требование владельца 2026-07-12:
    // «Очень плохо, что нет вкладки Измерения, и попасть в них можно только через профиль».
    { key: 'dims', href: '/dims', icon: '★', label: { ru: 'Измерения', en: 'Dimensions' } },
    // Экран «Меню» реализован 2026-07-12, но рельс о нём так и не узнал: здесь оставался
    // href: null со времён заглушки «скоро». На боевом выкате пункт оказался мёртвым —
    // человек жал «Меню», и не происходило ничего.
    { key: 'menu', href: '/menu', icon: '☰', label: { ru: 'Меню', en: 'Menu' } },
  ] as const;
</script>

<nav class="rail" aria-label="NDim Space">
  <a class="brand" href="/">
    <Brand size={26} />
    <span>{lang === 'ru' ? 'Пространство NDim' : 'NDim Space'}</span>
  </a>

  {#each items as item (item.key)}
    <a href={item.href} class:on={active === item.key} aria-current={active === item.key ? 'page' : undefined}>
      <span class="ico">{item.icon}</span>{item.label[lang]}
    </a>
  {/each}
</nav>

<style>
  /* Мобильная раскладка не меняется: до 1024px рельса нет, работает BottomNav. */
  .rail {
    display: none;
  }

  @media (min-width: 1024px) {
    .rail {
      display: flex;
      flex-direction: column;
      gap: 3px;
      /* В сетке экрана рельс занимает первую колонку целиком, во всю высоту */
      grid-row: 1 / -1;
      grid-column: 1;
      padding: 16px 12px;
      background: var(--panel);
      border-right: 1px solid var(--edge);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 6px 10px 18px;
      text-decoration: none;
      font-size: 15px;
      font-weight: 650;
      color: var(--heading);
    }
    .rail > a {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 10px 12px;
      border-radius: 10px;
      font-size: 14px;
      text-decoration: none;
      color: var(--dim);
      transition: background 0.15s, color 0.15s;
    }
    .rail > a:hover {
      background: var(--edge-soft);
      color: var(--text);
    }
    .rail > a.on {
      background: color-mix(in srgb, var(--primary) 12%, transparent);
      color: var(--primary);
      font-weight: 650;
    }
    .ico {
      width: 20px;
      text-align: center;
      font-size: 16px;
      line-height: 1;
    }
  }
</style>

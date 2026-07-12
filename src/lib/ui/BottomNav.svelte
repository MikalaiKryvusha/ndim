<script lang="ts">
  // Нижняя навигация продукта 2.0 — ПЯТЬ разделов, как в 1.x:
  // Профиль · Связи · Пространство · Измерения · Меню.
  //
  // «Измерения» вернулись отдельным разделом 2026-07-12 по требованию владельца: «Очень плохо,
  // что нет вкладки Измерения, и попасть в них можно только через профиль. В старом NDim была
  // отдельная вкладка» (кадр design/reference-1x/app-04-измерения-все.png это подтверждает).
  //
  // Заодно починено «Меню»: у него оставался href: null со времён заглушки «скоро», хотя экран
  // /menu сделан. На боевом проде кнопка была МЁРТВОЙ — человек жал, и не происходило ничего.
  let {
    active,
    lang,
  }: { active: 'profile' | 'relations' | 'space' | 'dims' | 'menu'; lang: 'ru' | 'en' } = $props();

  const items = [
    { key: 'profile', href: '/profile', icon: '⌂', label: { ru: 'Профиль', en: 'Profile' } },
    { key: 'relations', href: '/relations', icon: '◎', label: { ru: 'Связи', en: 'Relations' } },
    { key: 'space', href: '/space', icon: '✳', label: { ru: 'Пространство', en: 'Space' } },
    { key: 'dims', href: '/dims', icon: '★', label: { ru: 'Измерения', en: 'Dimensions' } },
    { key: 'menu', href: '/menu', icon: '☰', label: { ru: 'Меню', en: 'Menu' } },
  ] as const;
</script>

<nav class="bnav" aria-label="NDim Space">
  {#each items as item (item.key)}
    <a href={item.href} class:on={active === item.key}><span class="ico">{item.icon}</span>{item.label[lang]}</a>
  {/each}
</nav>

<style>
  .bnav { display: flex; background: var(--panel); border-top: 1px solid var(--edge); }
  .bnav > a {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
    padding: 9px 0 11px; font-size: 10.5px; color: var(--faint); text-decoration: none;
    transition: color 0.15s ease;
  }
  .ico { font-size: 17px; line-height: 1; transition: transform 0.15s ease; }
  .on { color: var(--primary); font-weight: 650; }
  .on .ico { transform: translateY(-1px) scale(1.1); }

  /* Десктоп (макет V2 «Рабочий стол»): навигация переезжает в боковой рельс
     SideRail — нижняя панель прячется. Порог 1024px общий для обоих компонентов. */
  @media (min-width: 1024px) {
    .bnav { display: none; }
  }
</style>

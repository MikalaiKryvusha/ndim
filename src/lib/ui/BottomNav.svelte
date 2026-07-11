<script lang="ts">
  // Нижняя навигация продукта 2.0 — четыре раздела (переосмысление, утверждено с синтезом):
  // Профиль · Связи · Пространство · Меню. Готовые разделы — ссылки, будущие — «скоро».
  let { active, lang }: { active: 'profile' | 'relations' | 'space' | 'menu'; lang: 'ru' | 'en' } = $props();

  const items = [
    { key: 'profile', href: '/profile', icon: '⌂', label: { ru: 'Профиль', en: 'Profile' } },
    { key: 'relations', href: '/relations', icon: '◎', label: { ru: 'Связи', en: 'Relations' } },
    { key: 'space', href: null, icon: '✳', label: { ru: 'Пространство', en: 'Space' } },
    { key: 'menu', href: null, icon: '☰', label: { ru: 'Меню', en: 'Menu' } },
  ] as const;

  const soon = { ru: 'скоро', en: 'soon' } as const;
</script>

<nav class="bnav" aria-label="NDim Space">
  {#each items as item (item.key)}
    {#if item.href !== null}
      <a href={item.href} class:on={active === item.key}><span class="ico">{item.icon}</span>{item.label[lang]}</a>
    {:else}
      <span title={soon[lang]}><span class="ico">{item.icon}</span>{item.label[lang]}</span>
    {/if}
  {/each}
</nav>

<style>
  .bnav { display: flex; background: var(--panel); border-top: 1px solid var(--edge); }
  .bnav > a, .bnav > span {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
    padding: 9px 0 11px; font-size: 10.5px; color: var(--faint); text-decoration: none;
  }
  .ico { font-size: 17px; line-height: 1; }
  .on { color: var(--primary); font-weight: 650; }

  /* Десктоп (макет V2 «Рабочий стол»): навигация переезжает в боковой рельс
     SideRail — нижняя панель прячется. Порог 1024px общий для обоих компонентов. */
  @media (min-width: 1024px) {
    .bnav { display: none; }
  }
</style>

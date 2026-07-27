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
  // Иконки — авторские, из 1.x (bugs/17): владелец рисовал их сам, «чтобы репрезентовали
  // задумку и смысл страниц». Здесь стояли временные глифы ⌂ ◎ ✳ ★ ☰.
  // У каждой, кроме «Пространства», в 1.x был отдельный файл активного состояния —
  // отсюда пара icon/iconOn. Для «Пространства» такого файла не существовало,
  // поэтому форма одна, а активность передаётся цветом (см. bugs/17, открытый вопрос).
  import Icon from '$lib/ui/Icon.svelte';

  let {
    active,
    lang,
  }: { active: 'profile' | 'relations' | 'space' | 'dims' | 'menu'; lang: 'ru' | 'en' } = $props();

  const items = [
    { key: 'profile', href: '/profile', icon: 'home', iconOn: 'homeOn', label: { ru: 'Профиль', en: 'Profile' } },
    { key: 'relations', href: '/relations', icon: 'relations', iconOn: 'relationsOn', label: { ru: 'Связи', en: 'Relations' } },
    { key: 'space', href: '/space', icon: 'space', iconOn: 'space', label: { ru: 'Пространство', en: 'Space' } },
    { key: 'dims', href: '/dims', icon: 'dimensions', iconOn: 'dimensionsOn', label: { ru: 'Измерения', en: 'Dimensions' } },
    { key: 'menu', href: '/menu', icon: 'menu', iconOn: 'menuOn', label: { ru: 'Меню', en: 'Menu' } },
  ] as const;
</script>

<nav class="bnav" aria-label="NDim Space">
  {#each items as item (item.key)}
    <a href={item.href} class:on={active === item.key}>
      <span class="ico"><Icon name={active === item.key ? item.iconOn : item.icon} size={26} /></span>{item.label[lang]}
    </a>
  {/each}
</nav>

<style>
  .bnav {
    /* Непрозрачный фон (bugs/22): панель прибита, контент скроллится ПОД ней —
       полупрозрачный --panel тёмной темы просвечивал ленту сквозь кнопки. */
    display: flex; background: var(--panel-solid, var(--panel)); border-top: 1px solid var(--edge);
    /* Прибита к низу вьюпорта (bugs/08.3): раньше панель стояла в потоке ПОСЛЕ контента,
       и длинный экран выталкивал её за нижний край — до неё нужно было доскроллить.
       sticky сам резервирует место в потоке: спейсеры и пересчёт отступов не нужны. */
    position: sticky; bottom: 0; z-index: 6;
    /* Дом-индикатор iPhone не должен ложиться на кнопки. */
    padding-bottom: env(safe-area-inset-bottom);
  }
  .bnav > a {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
    /* Отступы срезаны с 9/11 до 7/9: иконка выросла с 17px до канонных 1.x 26px
       (styles.css:1296 → clamp(24px, 2vw, 28px)), и без этого панель стала бы выше. */
    padding: 7px 0 9px; font-size: 10.5px; color: var(--faint); text-decoration: none;
    transition: color 0.15s ease;
  }
  .ico { display: flex; line-height: 1; transition: transform 0.15s ease; }
  .on { color: var(--primary); font-weight: 650; }
  .on .ico { transform: translateY(-1px) scale(1.1); }

  /* Десктоп (макет V2 «Рабочий стол»): навигация переезжает в боковой рельс
     SideRail — нижняя панель прячется. Порог 1024px общий для обоих компонентов. */
  @media (min-width: 1024px) {
    .bnav { display: none; }
  }
</style>

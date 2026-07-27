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
  //
  // Форма иконки НЕ меняется на активном пункте (слово владельца 2026-07-27: «давай не менять
  // иконки открытой вкладки, а чуть-чуть синим подсвечивать открытую вкладку… как в десктоп
  // версии, и иконку из серого в синий красить»). Раньше подмена формы на авторский активный
  // вариант была ЕДИНСТВЕННЫМ видимым признаком открытой вкладки — и именно поэтому
  // «Пространство» не реагировало вовсе: активного оригинала для него в 1.x не существует.
  import Icon from '$lib/ui/Icon.svelte';

  let {
    active,
    lang,
  }: { active: 'profile' | 'relations' | 'space' | 'dims' | 'menu'; lang: 'ru' | 'en' } = $props();

  const items = [
    { key: 'profile', href: '/profile', icon: 'home', label: { ru: 'Профиль', en: 'Profile' } },
    { key: 'relations', href: '/relations', icon: 'relations', label: { ru: 'Связи', en: 'Relations' } },
    { key: 'space', href: '/space', icon: 'space', label: { ru: 'Пространство', en: 'Space' } },
    { key: 'dims', href: '/dims', icon: 'dimensions', label: { ru: 'Измерения', en: 'Dimensions' } },
    { key: 'menu', href: '/menu', icon: 'menu', label: { ru: 'Меню', en: 'Menu' } },
  ] as const;
</script>

<nav class="bnav" aria-label="NDim Space">
  {#each items as item (item.key)}
    <a href={item.href} class:on={active === item.key} aria-current={active === item.key ? 'page' : undefined}>
      <span class="ico"><Icon name={item.icon} size={26} /></span>{item.label[lang]}
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
       (styles.css:1296 → clamp(24px, 2vw, 28px)), и без этого панель стала бы выше.
       Поля 4/5 отданы под плашку активного пункта, а вертикальные отступы уменьшены
       ровно на их величину — высота панели остаётся прежней (замер: 60px до и после). */
    margin: 4px 5px; padding: 3px 0 5px; border-radius: 12px;
    font-size: 10.5px; color: var(--faint); text-decoration: none;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .ico { display: flex; line-height: 1; transition: transform 0.15s ease; }

  /* Открытая вкладка подсвечивается ТАК ЖЕ, как в десктопном рельсе (слово владельца):
     бледно-синяя плашка + синий текст и иконка (иконка красится currentColor).

     ⚠️ Селектор обязан быть `.bnav > a.on`, а не `.on`. Svelte дописывает свой класс в
     КАЖДЫЙ селектор, поэтому `.on` (0,2,0) проигрывал `.bnav > a` (0,2,1) — синий цвет не
     применялся НИ НА ОДНОМ экране, и открытую вкладку выдавала только жирность (font-weight
     в `.bnav > a` не объявлен, конкурента у него не было). У четырёх разделов иллюзию
     подсветки создавала подмена формы иконки, а «Пространство», у которого активного
     оригинала нет, честно не реагировало ничем. Это и был баг, который увидел владелец. */
  .bnav > a.on {
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--primary);
    font-weight: 650;
  }
  .bnav > a.on .ico { transform: translateY(-1px) scale(1.1); }

  /* Десктоп (макет V2 «Рабочий стол»): навигация переезжает в боковой рельс
     SideRail — нижняя панель прячется. Порог 1024px общий для обоих компонентов. */
  @media (min-width: 1024px) {
    .bnav { display: none; }
  }
</style>

<!--
  ШАПКА ПУБЛИЧНОЙ СТРАНИЦЫ — знак, переключатель языка, тема, одна дверь.

  Одна на все публичные поверхности: страницы объектов каталога, хабы каталога, семейство «Тест».
  До `plans/48` шаг 3 она жила ДВУМЯ дословными копиями (страница объекта и хаб «Тесты»), и
  третья копия сделала бы расхождение вопросом времени: правку владельца «кнопки в хедере
  квадратные» пришлось бы вносить в три места, а заметить пропущенное — глазами.

  🔴 РЕЛЬСА НАВИГАЦИИ ЗДЕСЬ СОЗНАТЕЛЬНО НЕТ. Публичную страницу открывает незнакомец из поиска:
  все пять пунктов рельса ведут его за стену входа, то есть в пять тупиков вместо одной ясной
  двери. Решение дешёвое к откату — рельс добавляется как в `DocShell`, одной строкой импорта.

  🔴 КНОПКА ТЕМЫ РАБОТАЕТ БЕЗ КЛИЕНТСКОГО JS. Публичные страницы объявлены `csr = false`:
  бандл там не исполняется, и обработчик Svelte `onclick` МЁРТВ (эта ошибка на странице объекта
  уже была, владелец поймал сразу). Живёт кнопка так: обработчик вешает инлайн-скрипт `app.html`
  по идентификатору `theme-toggle`, а значок переключают СТИЛИ по атрибуту `data-theme` на
  `<html>`. Оба значка лежат в разметке всегда; лишний прячет CSS.
-->
<script lang="ts">
  import { LANG_LABEL, type Lang } from '$lib/content/langs';
  import Icon from '$lib/ui/Icon.svelte';
  // Знак бренда — тот же компонент, что в шапке приложения: витрина не рисует своих логотипов.
  import Brand from '$lib/ui/Brand.svelte';

  let {
    lang,
    /** Тот же материал на другом языке. Подпись берётся из общего словаря самоназваний. */
    otherLang,
    otherHref,
  }: { lang: Lang; otherLang: Lang; otherHref: string } = $props();

  const T = {
    ru: { enter: 'Войти', theme: 'Тема' },
    en: { enter: 'Log in', theme: 'Theme' },
  } as const;
  const t = $derived(T[lang]);
</script>

<header class="bar">
  <a class="brand" href="/">
    <Brand size={26} />
    <span>NDim Space</span>
  </a>
  <!--
    ПЕРЕКЛЮЧАТЕЛЬ ЯЗЫКА — ССЫЛКОЙ, а не кнопкой (`bugs/114`, решение владельца 2026-08-03).
    На публичных адресах источник истины — АДРЕС: кнопка на состоянии оставила бы человека на
    прежнем адресе с чужим содержанием, а ссылка ведёт РОВНО туда, что объявлено в `hreflang`
    страницы, — робот и человек начинают видеть одно и то же.
  -->
  <a class="langsw" href={otherHref} hreflang={otherLang}>{LANG_LABEL[otherLang]}</a>
  <button type="button" id="theme-toggle" class="theme" title={t.theme} aria-label={t.theme}>
    <span class="ic sun"><Icon name="sun" size={15} /></span>
    <span class="ic moon"><Icon name="moon" size={15} /></span>
  </button>
  <!-- «Войти» ведёт в ДВЕРЬ `/profile`, а не на лендинг (`bugs/114`, пункт «в»): подпись обещает
       вход, и все девять подписей «Войти» в продукте обязаны делать одно и то же. -->
  <a class="enter" href="/profile">{t.enter}</a>
</header>

<style>
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
  /* Переключатель языка вторичен по отношению к «Войти»: это смена вида страницы, а не действие
     с продуктом, — поэтому контурный, а не залитый. `margin-left: auto` живёт ЗДЕСЬ, у первого
     элемента правой группы: у кнопки входа он оттолкнул бы только её одну. */
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
  /* Кнопка темы — квадратная, как в шапке приложения (правка владельца 2026-07-27: «кнопки в
     хедере квадратные и без стрелочки»). Размер и радиус — КАК В `AppBar.svelte`: 34px, радиус 10;
     две шапки одного продукта не должны отличаться на глаз. */
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
</style>

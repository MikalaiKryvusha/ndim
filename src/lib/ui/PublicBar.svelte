<!--
  ШАПКА ПУБЛИЧНОЙ СТРАНИЦЫ — знак, переключатель языка, тема, одна дверь.

  Одна на все публичные поверхности: страницы объектов каталога, хабы каталога, семейство «Тест».
  До `plans/48` шаг 3 она жила ДВУМЯ дословными копиями (страница объекта и хаб «Тесты»), и
  третья копия сделала бы расхождение вопросом времени: правку владельца «кнопки в хедере
  квадратные» пришлось бы вносить в три места, а заметить пропущенное — глазами.

  🔴 РЕЛЬСА НАВИГАЦИИ ЗДЕСЬ СОЗНАТЕЛЬНО НЕТ. Публичную страницу открывает незнакомец из поиска:
  все пять пунктов рельса ведут его за стену входа, то есть в пять тупиков вместо одной ясной
  двери. Решение дешёвое к откату — рельс добавляется как в `DocShell`, одной строкой импорта.

  🔴 ТЕМА И ЯЗЫК РАБОТАЮТ БЕЗ КЛИЕНТСКОГО JS. Публичные страницы объявлены `csr = false`:
  бандл там не исполняется, и обработчик Svelte `onclick` МЁРТВ (эта ошибка на странице объекта
  уже была, владелец поймал сразу). Поэтому пара «тема + язык» стоит здесь в режиме `static`:
  кнопку темы оживляет инлайн-скрипт `app.html` по идентификатору `theme-toggle`, значок
  переключают СТИЛИ по `data-theme` на `<html>`, выпадашка языка — родной `<details>`. Сама
  пара — общая на все шапки продукта (`HeadControls.svelte`).
-->
<script lang="ts">
  import type { Lang } from '$lib/content/langs';
  // Знак бренда — тот же компонент, что в шапке приложения: витрина не рисует своих логотипов.
  import Brand from '$lib/ui/Brand.svelte';
  import HeadControls from '$lib/ui/HeadControls.svelte';

  let {
    lang,
    /** Тот же материал на другом языке. Подпись берётся из общего словаря самоназваний. */
    otherLang,
    otherHref,
  }: { lang: Lang; otherLang: Lang; otherHref: string } = $props();

  const T = {
    ru: { enter: 'Войти' },
    en: { enter: 'Log in' },
  } as const;
  const t = $derived(T[lang]);

  /** Адрес того же материала на другом языке; у языка без парной страницы адреса нет. */
  const hrefFor = (code: Lang) => (code === otherLang ? otherHref : null);
</script>

<header class="bar">
  <a class="brand" href="/">
    <Brand size={26} />
    <span>NDim Space</span>
  </a>
  <!--
    ЯЗЫК — ССЫЛКОЙ, а не кнопкой (`bugs/114`, решение владельца 2026-08-03). На публичных адресах
    источник истины — АДРЕС: кнопка на состоянии оставила бы человека на прежнем адресе с чужим
    содержанием, а ссылка ведёт РОВНО туда, что объявлено в `hreflang` страницы, — робот и человек
    видят одно и то же. Ссылка живёт пунктом выпадашки общей пары.
  -->
  <div class="ctrls">
    <HeadControls {lang} mode="static" {hrefFor} />
  </div>
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
  /* Пара «тема + язык» — первый элемент правой группы, поэтому `margin-left: auto` живёт ЗДЕСЬ:
     у кнопки входа он оттолкнул бы только её одну. Вид пары — в `HeadControls.svelte`. */
  .ctrls {
    margin-left: auto;
    flex: none;
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

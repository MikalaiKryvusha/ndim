<script lang="ts">
  // Экран «Меню» — макет V1 «Список», утверждён владельцем 2026-07-12
  // (design/menu-mockups.html). Состав разделов — из живого 1.x
  // (design/reference-1x/app-08-меню.png): пригласить друзей, руководство, условия, политика,
  // отказ от ответственности, поддержка, пожертвование, о системе, об авторе, версии.
  //
  // Блока манифеста здесь НЕТ и заводить его заново не надо: «1. Манифест» — раздел
  // руководства пользователя, а отдельные виджет и страница были дублем, придуманным агентом
  // (удалены по слову владельца 2026-07-31, подробности — в разметке ниже).
  //
  // ЧУВСТВИТЕЛЬНОЕ МЕСТО (GOAL.md): пожертвование — спокойная строка, а не баннер. Ни
  // «премиума», ни «плюса», ни счётчиков-крючков здесь не будет никогда.
  import { onMount } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fly, slide } from 'svelte/transition';
  import AppBar from '$lib/ui/AppBar.svelte';
  import GuestCard from '$lib/ui/GuestCard.svelte';
  import BottomNav from '$lib/ui/BottomNav.svelte';
  import SideRail from '$lib/ui/SideRail.svelte';
  // Иконки строк (bugs/17). Здесь стоял зоопарк из 15 знаков ТРЁХ разных природ —
  // символы (⚙ ↪ ↗ ⧉ § ⓘ ♡ ⚠ ☾), эмодзи (🌐 📖 🔒 📜) и буква N. Слово владельца:
  // «в Settings полный ужас, иконки маленькие, невзрачные». Эмодзи вдобавок цветные
  // системным шрифтом и тему не слушают вовсе.
  import Icon from '$lib/ui/Icon.svelte';
  import Versions from '$lib/ui/Versions.svelte';
  import { adminVerdict } from '$lib/data/admin';
  import { currentSession } from '$lib/data/profile';
  import { loadSyncServer } from '$lib/data/space';
  import type { SyncServerDoc } from '$lib/model/stats';
  import type { Lang } from '$lib/ui/format';
  import { lang as currentLang, setLang } from '$lib/ui/lang.svelte';
  import { MOTION } from '$lib/ui/motion';
  import { SITE_ORIGIN } from '$lib/site';
  // Память вида экрана: возврат туда, где человек его оставил (plans/08, В11=А).
  import { useViewMemory } from '$lib/ui/view-memory';
  // Тема — общий источник истины (bugs/53): её же читает и переключает шапка.
  import { theme, setTheme } from '$lib/ui/theme.svelte';

  // Язык — ОБЩИЙ модуль (`plans/39` шаг 1). Своей копии состояния у экрана больше нет:
  // две копии расходятся молча (цена уже уплачена на теме, `bugs/53`).
  const lang = $derived(currentLang());
  // Данные профиля «Меню» больше НЕ читает (ideas/19): единственным их потребителем была
  // карточка «Аккаунт», а она переехала на «Профиль». Экрану остались разделы и виджет
  // версий — из данных ему нужен только `space/server` (и то лишь вошедшему).
  let server = $state<SyncServerDoc | null>(null);
  let copied = $state(false);
  /*
   * Дверь в «Менеджер измерений» (`plans/33`, шаг 3): видна ТОЛЬКО при вердикте «админ».
   * Стартует скрытой и появляется, когда ответ о правах получен, — при `unknown` её нет и
   * она не занимает места: мигнувшая и исчезнувшая дверь хуже отсутствующей (стережёт
   * rAF-трасса в `tools/verify-admin-home.mjs`). Обычный человек и гость не видят её никогда.
   */
  let adminDoor = $state(false);

  /**
   * ПАМЯТЬ ВИДА ЭКРАНА (`plans/08`, ответ владельца В11=А). Помним только прокрутку: список
   * разделов «Меню» одинаков всегда, и его высота от данных не зависит — поэтому `warm: true`,
   * позиция осмысленна и при холодном заходе.
   */
  useViewMemory({ path: '/menu', warm: true });

  onMount(async () => {
    // Тема и ЯЗЫК живут в общих источниках (`bugs/53`, `plans/39` шаг 1) — ни локального
    // состояния, ни наблюдателя за атрибутом здесь нет: сегмент «Вид» и кнопки шапки
    // читают одно значение и переключают его же.

    try {
      // Меню работает и без входа: документы и версии от данных не зависят.
      // За версией сервера ходим только вошедшим: `space/server` правила отдают лишь им,
      // и прежний вызов с `.catch(() => null)` печатал отказ Firestore в консоль каждому
      // гостю лендинга. Не вошедшему виджет версий честно скажет «неизвестно».
      const uid = await currentSession();
      if (uid !== null) server = await loadSyncServer();
    } catch {
      // Меню обязано работать и без стенда: документы и версии не зависят от данных.
    }

    // Вердикт о правах — из единственной точки (`data/admin.ts`). Без `insist`: обменивать
    // токен каждому посетителю меню ради двери, которой у него нет, — расход не по чину.
    adminDoor = (await adminVerdict()) === 'admin';
  });

  // Системное «поделиться» переехало на страницу «Пригласить друзей» (`/menu/share`,
  // bugs/47) — вместе с сеткой соцсетей и прямой ссылкой, как было в 1.x. Здесь осталось
  // копирование ссылки: это один тап, ради которого незачем уходить с меню.

  async function copyLink() {
    await navigator.clipboard.writeText(SITE_ORIGIN);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  // Тексты и логика карточки «Аккаунт» (личность, «Управление аккаунтом», «Выйти» с
  // врезкой гостя) переехали на «Профиль» вместе с самой карточкой — ideas/19.
  const t = {
    title: { ru: 'Меню', en: 'Menu' },

    view: { ru: 'Вид', en: 'View' },
    language: { ru: 'Язык', en: 'Language' },
    themeLabel: { ru: 'Тема', en: 'Theme' },
    light: { ru: 'Светлая', en: 'Light' },
    dark: { ru: 'Тёмная', en: 'Dark' },

    share: { ru: 'Поделиться', en: 'Share' },
    invite: { ru: 'Пригласить друзей', en: 'Invite friends' },
    copyLink: { ru: 'Скопировать ссылку', en: 'Copy the link' },
    copiedLabel: { ru: 'скопировано', en: 'copied' },

    documents: { ru: 'Документы', en: 'Documents' },
    manual: { ru: 'Руководство пользователя', en: 'User Manual' },
    terms: { ru: 'Условия использования', en: 'Terms of Use' },
    privacy: { ru: 'Политика конфиденциальности', en: 'Privacy Policy' },
    disclaimer: { ru: 'Отказ от ответственности', en: 'Disclaimer' },

    project: { ru: 'Проект', en: 'Project' },
    // 🔴 Дверь ведёт в РАЗДЕЛ, а не в его инструмент (слово владельца, интервью №035, 2026-08-16:
    // «я хотел Панель Администратора — общую… там внутри разные инструменты администратора,
    // один из них — Менеджер измерений»).
    manager: { ru: 'Панель администратора', en: 'Admin Panel' },
    support: { ru: 'Поддержка', en: 'Support' },
    donate: { ru: 'Пожертвование', en: 'Donation' },
    about: { ru: 'О системе', en: 'About the system' },
    author: { ru: 'Об авторе', en: 'About the author' },
    // Сноска «Пожертвование — добровольное…» из «Меню» убрана по слову владельца
    // 2026-07-27: «об этом сказано на самой странице пожертвования». Текст живёт там
    // (src/routes/menu/donate) — в списке разделов он дублировал сам себя.

    // Тексты состояний «Вы не вошли…»/«данные не поднялись» уехали вместе с карточкой
    // «Аккаунт» (ideas/19): о входе и состоянии данных теперь говорит «Профиль».
  } as const;
</script>

<svelte:head>
  <title>NDim Space — {t.title[lang]}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="screen">
  <SideRail active="menu" {lang} />
  <AppBar />

  <main class="body">
  <GuestCard />
    <h1 class="screen-title">{t.title[lang]}</h1>

    <!--
      ⚠️ МАНИФЕСТА ЗДЕСЬ БОЛЬШЕ НЕТ — НИ ВИДЖЕТА, НИ СТРАНИЦЫ, НИ ССЫЛКИ.
      Слово владельца 2026-07-31: «Манифест NDim Space - убираем этт виджет, манифест есть в
      руководсвте пользователя» и следом: «и виджет и страницу удаляем - это была отсебятина
      ИИ, я этого не делал в оригинальном НДим».

      Проверено, а не принято на слово: **«1. Манифест» — это РАЗДЕЛ руководства пользователя**
      (`tools/extract-docs.mjs`, `MANUAL_SECTIONS`), снятый дословно из 1.x в `researches/07`.
      То есть текст никуда не делся и живёт там, где ему место; отдельные виджет и страница
      `/menu/manifesto` были ДУБЛЕМ, придуманным агентом, — в 1.x их не существовало.

      Удалено целиком: виджет · страница `src/routes/menu/manifesto/` · модуль
      `src/lib/content/manifest.ts` · строка-ссылка · стили `.manifest`/`.manifest-link` ·
      проверки, которые всё это стерегли (e2e и `verify-batch4`).

      Урок для будущих сессий: агент придумал сущность, которой не было в оригинале, и она
      обросла страницей, стилями и четырьмя проверками — то есть ЗАЩИТИЛА СЕБЯ от удаления.
      Прежде чем заводить новый экран «по смыслу», спроси, был ли он в 1.x и просил ли его
      владелец.
    -->
    <!-- Карточки «Аккаунт» здесь тоже нет (ideas/19, слово владельца 2026-07-31: «вот это я
         просил убрать с экрана Settings и перенести в Профиль»). Блок переехал ЦЕЛИКОМ в
         карточку-шапку «Профиля»; прежний канон «выход — в /menu» (bugs/29) отменён новым
         словом, пометка стоит в researches/12. -->

    <!-- ── Левая колонна: вид, поделиться ── -->
    <section class="col" in:fly={{ y: 10, duration: MOTION.base, delay: 45, easing: cubicOut }}>

      <!-- ── Блока «Данные» здесь БОЛЬШЕ НЕТ (ideas/21 п. 6, интервью №007 В1) ──
           Слово владельца дословно: «ВЕСЬ БЛОК НАХУЙ УБРАТЬ, НЕ НУЖЕН ОН И КНОПКА ОБНОВЛЕНИЯ
           ДАННЫХ, МЫ СДЕЛАЛИ ЖЕСТ ПУЛ ТУ РЕФРЕШ».

           ⚠️ ЦЕНА, НАЗВАННАЯ ВЛАДЕЛЬЦУ ДО РЕШЕНИЯ И ПРИНЯТАЯ ИМ (не «забытая» — записана здесь,
           чтобы следующая сессия не «чинила» это как регрессию):
           · строка была путём обновления БЕЗ жеста — требованием WCAG 2.2 SC 2.5.7, которое
             включается ровно потому, что жест у браузера мы забрали (интервью №006, В2=А);
           · на десктопе жеста нет вовсе — там остаётся только перезагрузка страницы;
           · это было единственное место, где человек узнавал, что видит цифры ИЗ ПАМЯТИ сеанса.
           Сам жест pull-to-refresh и весь механизм обновления (`refresh.svelte.ts`) НЕ тронуты —
           убрана только эта строка. -->

      <div class="card">
        <h3>{t.view[lang]}</h3>
        <div class="row off">
          <span class="ic"><Icon name="globe" size={20} /></span><span class="lb">{t.language[lang]}</span>
          <span class="seg">
            <button type="button" class:on={lang === 'ru'} onclick={() => setLang('ru')}>RU</button>
            <button type="button" class:on={lang === 'en'} onclick={() => setLang('en')}>EN</button>
          </span>
        </div>
        <div class="row off">
          <span class="ic"><Icon name={theme() === 'dark' ? 'moon' : 'sun'} size={20} /></span><span class="lb">{t.themeLabel[lang]}</span>
          <span class="seg">
            <button type="button" class:on={theme() === 'light'} onclick={() => setTheme('light')}>{t.light[lang]}</button>
            <button type="button" class:on={theme() === 'dark'} onclick={() => setTheme('dark')}>{t.dark[lang]}</button>
          </span>
        </div>
      </div>

      <!-- «Пригласить друзей» — своя страница, как в 1.x (кадр app-09): там сетка соцсетей,
           системное «поделиться» и прямая ссылка (bugs/47). В меню остаётся строка-дверь:
           канон меню 1.x — компактный список, а не развёрнутые блоки (bugs/29). -->
      <div class="card">
        <h3>{t.share[lang]}</h3>
        <a class="row" href={`/${lang}/menu/share`}>
          <span class="ic"><Icon name="share" size={20} /></span><span class="lb">{t.invite[lang]}</span><span class="chev"><Icon name="chevron" size={13} /></span>
        </a>
        <button type="button" class="row" onclick={copyLink}>
          <span class="ic"><Icon name="copy" size={20} /></span><span class="lb">{t.copyLink[lang]}</span>
          <span class="val">{copied ? t.copiedLabel[lang] : SITE_ORIGIN.replace('https://', '')}</span>
        </button>
      </div>

    </section>

    <!-- ── Правая колонна: ДОКУМЕНТЫ, проект, версии ──
         🔄 «Документы» ПЕРЕЕХАЛИ СЮДА, В САМЫЙ ВЕРХ (`ideas/25`, слово владельца 2026-08-01).

         🔴 ЭТО ОТМЕНЯЕТ ПРЕЖНЕЕ РЕШЕНИЕ, ВЫБРАННОЕ ЗАМЕРОМ, — и здесь стоял комментарий,
         объяснявший обратное: «Документы» отданы ЛЕВОЙ колонне, иначе колонны расходятся
         250 против 525px. Замер был верен, и цена переезда та же: правая колонна становится
         длиннее левой. Владелец знает и решил так — то есть неровные колонны здесь СЛЕДСТВИЕ
         решения, а не регрессия вёрстки.

         ⚠️ Следующей сессии: не «чинить» это обратно замером. Если понадобится выровнять —
         это новая задача про раскладку (шаг виджета, `ideas/24`), а не возврат «Документов».

         ✅ Порядок на телефоне НЕ меняется: колонны там идут одна за другой, и «Документы»
         как стояли после «Поделиться», так и стоят — переезд виден только с 1024px. -->
    <section class="col" in:fly={{ y: 10, duration: MOTION.base, delay: 90, easing: cubicOut }}>
      <div class="card">
        <h3>{t.documents[lang]}</h3>
        <!-- Иконки документов — ровно те, что стояли на этих же пунктах в 1.x
             (um.svg · tou.svg · pp.svg · disclaimer.svg), кадр app-08-меню.png.
             🔴 Адреса документов — ЯЗЫКОВЫЕ (`plans/39` шаг 2): человек уходит из приложения
             на публичную страницу СВОЕГО языка, а не на голый адрес, которого больше нет. -->
        <a class="row" href={`/${lang}/menu/manual`}><span class="ic"><Icon name="manual" size={20} /></span><span class="lb">{t.manual[lang]}</span><span class="chev"><Icon name="chevron" size={13} /></span></a>
        <a class="row" href={`/${lang}/menu/terms`}><span class="ic"><Icon name="terms" size={20} /></span><span class="lb">{t.terms[lang]}</span><span class="chev"><Icon name="chevron" size={13} /></span></a>
        <a class="row" href={`/${lang}/menu/privacy`}><span class="ic"><Icon name="privacy" size={20} /></span><span class="lb">{t.privacy[lang]}</span><span class="chev"><Icon name="chevron" size={13} /></span></a>
        <a class="row" href={`/${lang}/menu/disclaimer`}><span class="ic"><Icon name="disclaimer" size={20} /></span><span class="lb">{t.disclaimer[lang]}</span><span class="chev"><Icon name="chevron" size={13} /></span></a>
      </div>

      <div class="card">
        <h3>{t.project[lang]}</h3>
        <a class="row" href={`/${lang}/menu/support`}><span class="ic"><Icon name="support" size={20} /></span><span class="lb">{t.support[lang]}</span><span class="chev"><Icon name="chevron" size={13} /></span></a>
        <a class="row" href={`/${lang}/menu/donate`}><span class="ic"><Icon name="donate" size={20} /></span><span class="lb">{t.donate[lang]}</span><span class="chev"><Icon name="chevron" size={13} /></span></a>
        <a class="row" href={`/${lang}/menu/about`}><span class="ic"><Icon name="about" size={20} /></span><span class="lb">{t.about[lang]}</span><span class="chev"><Icon name="chevron" size={13} /></span></a>
        <a class="row" href={`/${lang}/menu/author`}><span class="ic"><Icon name="author" size={20} /></span><span class="lb">{t.author[lang]}</span><span class="chev"><Icon name="chevron" size={13} /></span></a>
        <!-- Дверь админа (`plans/33`, шаг 3): только при вердикте «админ», см. adminDoor выше. -->
        {#if adminDoor}
          <a class="row" href="/admin"><span class="ic"><Icon name="edit" size={20} /></span><span class="lb">{t.manager[lang]}</span><span class="chev"><Icon name="chevron" size={13} /></span></a>
        {/if}
      </div>

      <!-- «Версии» — полноценный виджет, а не подвал мелким серым (bugs/66). Приехал
           с экрана «Пространство», где его в 1.x не было вовсе, и дорос до того, о чём
           просил владелец: версия, сборка и дата со временем — по КАЖДОМУ из двух,
           приложению и серверу синхронизации. -->
      <Versions {server} {lang} />
    </section>
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
    flex: 1; padding: 14px; display: flex; flex-direction: column; gap: 10px;
    width: 100%; max-width: 458px; margin: 0 auto; /* 430px контента + поля */
  }
  .screen-title { font-size: 19px; font-weight: 700; color: var(--heading); }
  .col { display: flex; flex-direction: column; gap: 10px; }

  .card {
    background: var(--panel); border: 1px solid var(--edge); border-radius: 14px;
    box-shadow: var(--card-shadow); overflow: hidden;
  }
  .card h3 {
    font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase;
    color: var(--dim); font-weight: 600; padding: 11px 14px 6px;
  }

  /* Правила `.manifest` и `.manifest-link` (bugs/38) удалены вместе с самим манифестом —
     см. пояснение в разметке. Осиротевшие правила не оставлены «на всякий случай»: именно
     так удалённая сущность и возвращается обратно. */

  /* Строка списка: плотность канона 1.x (bugs/29) — и ссылка, и кнопка выглядят одинаково */
  .row {
    display: flex; align-items: center; gap: 11px; width: 100%;
    padding: 9px 14px; border: 0; border-top: 1px solid var(--edge-soft);
    background: transparent; font: inherit; font-size: 13.5px; color: var(--text);
    text-align: left; text-decoration: none; cursor: pointer;
    transition: background 0.15s ease;
  }
  @media (hover: hover) {
    .row:hover { background: var(--edge-soft); }
  }
  .row.off { cursor: default; }
  @media (hover: hover) {
    .row.off:hover { background: transparent; }
  }
  .row .ic { width: 24px; display: flex; justify-content: center; color: var(--accent); }
  .row .lb { flex: 1; }
  .row .val { font-size: 12px; color: var(--faint); font-family: var(--mono); }
  .row .chev { color: var(--faint); }

  /* Строка обновления данных (интервью №006). Пока идёт чтение — повторный тап не проходит,
     а иконка крутится: то же состояние, что у кольца в жесте, только в списке. */
  .row:disabled { cursor: default; opacity: 0.7; }
  @keyframes menu-spin {
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
  }

  /* Стили «кто я»/кнопок/врезки выхода УЕХАЛИ на «Профиль» вместе с карточкой «Аккаунт»
     (ideas/19) — там они живут с префиксом a- (.awho/.arow/.awarn…). */

  .seg { display: inline-flex; border: 1px solid var(--edge); border-radius: 999px; overflow: hidden; }
  .seg button {
    font: inherit; font-size: 12px; font-weight: 600; padding: 5px 12px;
    border: 0; cursor: pointer; background: transparent; color: var(--dim);
    transition: background 0.15s ease, color 0.15s ease;
  }
  .seg button.on { background: var(--primary); color: var(--primary-ink); }

  /* ── Десктоп: макет V2 «Рабочий стол».
     Медиа-блок в конце файла: при равной специфичности выигрывает последнее правило (EXP-0026).

     ⚠️ ДВЕ КОЛОННЫ (слово владельца 2026-07-31: «Меню нужно привести к двум колонкам»,
     затем «Распределяем остальные виджеты по двум колонкам в Меню»). Было `repeat(3, 1fr)` —
     три узких столбца с пустырём под коротким средним. Стало то же, что на «Пространстве» и
     «Профиле»: сетка в ЧЕТЫРЕ ШАГА, колонна — два шага (`ideas/24`, модель утверждена
     владельцем). Слева «Вид» и «Поделиться», справа «Документы», «Проект» и «Версии» —
     разбиение выбрано ЗАМЕРОМ.

     Колонны и раньше были самостоятельными контейнерами (`.col`), поэтому дыр МЕЖДУ
     карточками здесь не было; менялось число столбцов и ширина карточек. */
  @media (min-width: 1024px) {
    .screen {
      max-width: none;
      display: grid;
      grid-template-columns: 232px minmax(0, 1fr);
      grid-template-rows: auto 1fr;
    }
    .body {
      width: 100%; max-width: 1280px; margin: 0 auto; padding: 20px 26px 34px;
      display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
      align-content: start; align-items: start; gap: 12px;
    }
    /* Колонна — большой виджет, два шага. */
    .body > .col { grid-column: span 2; }
    .screen-title { grid-column: 1 / -1; }
    /* Плашка гостя — во всю строку (`bugs/226`). `:global` — элемент чужой, из
       `$lib/ui/GuestCard.svelte`; разбор класса стоит в `account/+page.svelte`. */
    .body > :global(.gnote) { grid-column: 1 / -1; }
  }
</style>

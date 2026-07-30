<script lang="ts">
  // Экран «Меню» — макет V1 «Список» + блок манифеста, утверждён владельцем 2026-07-12
  // (design/menu-mockups.html). Меню начинается со СМЫСЛА проекта, и только потом идут разделы.
  //
  // Состав разделов — из живого 1.x (design/reference-1x/app-08-меню.png): пригласить друзей,
  // руководство, условия, политика, отказ от ответственности, поддержка, пожертвование,
  // о системе, об авторе, версия и билд под списком.
  //
  // Текст манифеста — утверждённый владельцем: он про то, что здесь ЕСТЬ (цель и ценности),
  // а не про то, чего нет. Источник — манифест руководства 1.x (researches/07 §1).
  //
  // ЧУВСТВИТЕЛЬНОЕ МЕСТО (GOAL.md): пожертвование — спокойная строка, а не баннер. Ни
  // «премиума», ни «плюса», ни счётчиков-крючков здесь не будет никогда.
  import { onMount } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import AppBar from '$lib/ui/AppBar.svelte';
  import BottomNav from '$lib/ui/BottomNav.svelte';
  import SideRail from '$lib/ui/SideRail.svelte';
  // Иконки строк (bugs/17). Здесь стоял зоопарк из 15 знаков ТРЁХ разных природ —
  // символы (⚙ ↪ ↗ ⧉ § ⓘ ♡ ⚠ ☾), эмодзи (🌐 📖 🔒 📜) и буква N. Слово владельца:
  // «в Settings полный ужас, иконки маленькие, невзрачные». Эмодзи вдобавок цветные
  // системным шрифтом и тему не слушают вовсе.
  import Icon from '$lib/ui/Icon.svelte';
  import Versions from '$lib/ui/Versions.svelte';
  import {
    currentEmail,
    currentSession,
    isGuestSession,
    loadProfileScreen,
    peekProfileScreen,
    ProfileMissingError,
    signOutUser,
    type ProfileScreenData,
  } from '$lib/data/profile';
  import { loadSyncServer } from '$lib/data/space';
  import type { SyncServerDoc } from '$lib/model/stats';
  import { MANIFEST } from '$lib/content/manifest';
  import { dateOnly, type Lang } from '$lib/ui/format';
  import { MOTION } from '$lib/ui/motion';
  import { SITE_ORIGIN } from '$lib/site';
  // Тема — общий источник истины (bugs/53): её же читает и переключает шапка.
  import { theme, setTheme } from '$lib/ui/theme.svelte';

  let lang = $state<Lang>('ru');
  // Тёплый первый кадр (`ideas/18`): «Меню» показывает те же данные профиля, что и «Профиль», —
  // повторно читать их при каждом заходе незачем, они уже в памяти приложения.
  const warm = peekProfileScreen();
  let stand = $state<'connecting' | 'ready' | 'down' | 'signedout'>(warm ? 'ready' : 'connecting');
  let data = $state<ProfileScreenData | null>(warm ?? null);
  let email = $state<string | null>(null);
  let guest = $state(false);
  let server = $state<SyncServerDoc | null>(null);
  let copied = $state(false);

  /**
   * Перечитать данные этого экрана. Отдельной функцией, потому что её зовут двое: `onMount`
   * при заходе и строка «Обновить данные» по требованию человека.
   */
  async function loadScreen(uid: string): Promise<void> {
    /*
     * ⚠️ У ГОСТЯ ДОКУМЕНТА МОЖЕТ НЕ БЫТЬ, И ЭТО НОРМА (bugs/87). Он появляется с первой
     * оценкой; до неё `loadProfileScreen` честно бросает `ProfileMissingError`. Раньше это
     * исключение валило ВЕСЬ экран в состояние `down`, и вошедший гость читал про себя
     * «Вы не вошли».
     *
     * Гостевой ветке «Меню» документ не нужен вовсе — ей хватает пилюли, пояснения и двух
     * кнопок. Поэтому пустоту переносим ТОЛЬКО для гостя: у не-гостя отсутствие документа —
     * настоящая поломка, и глушить её нельзя.
     *
     * Виджет версий грузим отдельным обещанием: в `Promise.all` отказ профиля утянул бы за
     * собой и его, хотя к профилю он отношения не имеет.
     */
    const [profile, syncServer] = await Promise.all([
      loadProfileScreen(uid).catch((error: unknown) => {
        if (isGuestSession() && error instanceof ProfileMissingError) return null;
        throw error;
      }),
      loadSyncServer(),
    ]);
    data = profile;
    server = syncServer;
  }


  onMount(async () => {
    const savedLang = localStorage.getItem('ndim-lang');
    if (savedLang === 'en' || savedLang === 'ru') lang = savedLang;
    // Тема живёт в общем источнике (bugs/53) — ни локального состояния, ни наблюдателя
    // за атрибутом здесь больше нет: сегмент «Вид» и кнопка шапки читают одно значение.

    try {
      // Меню работает и без входа: манифест, документы и версии от данных не зависят.
      const uid = await currentSession();
      if (uid === null) {
        stand = 'signedout';
        // За версией сервера НЕ ходим: `space/server` правила отдают только вошедшим
        // (включая гостя). Прежний вызов с `.catch(() => null)` всё равно упирался в
        // отказ — и печатал ошибку Firestore в консоль каждому гостю лендинга.
        // Виджет версий честно скажет «неизвестно»: это и есть правда для не вошедшего.
        return;
      }
      guest = isGuestSession();
      email = currentEmail();
      await loadScreen(uid);
      stand = 'ready';
    } catch {
      // Меню обязано работать и без стенда: документы, манифест и версии не зависят от данных.
      stand = 'down';
    }
  });

  function setLang(next: Lang) {
    lang = next;
    document.documentElement.setAttribute('lang', next);
    localStorage.setItem('ndim-lang', next);
  }

  // Системное «поделиться» переехало на страницу «Пригласить друзей» (`/menu/share`,
  // bugs/47) — вместе с сеткой соцсетей и прямой ссылкой, как было в 1.x. Здесь осталось
  // копирование ссылки: это один тап, ради которого незачем уходить с меню.

  async function copyLink() {
    await navigator.clipboard.writeText(SITE_ORIGIN);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  async function leave() {
    await signOutUser();
    location.href = '/';
  }

  /** Имя человека — как он сам его записал; у гостя имени нет. */
  const displayName = $derived.by(() => {
    const first = data?.values.name?.first;
    const nick = data?.values.name?.nick;
    return first?.[lang] ?? first?.ru ?? nick?.[lang] ?? nick?.ru ?? null;
  });

  /**
   * Подпись под именем: почта и «В Пространстве с 12 июля 2026 г.».
   * Дата — настоящая, из документа человека: однажды такую строку уже поймали на вранье,
   * когда она была вписана в вёрстку руками.
   */
  const accountLine = $derived.by(() => {
    const since = data ? `${t.since[lang]} ${dateOnly(data.root.time.created, lang)}` : null;
    return [email, since].filter(Boolean).join(' · ');
  });

  const t = {
    title: { ru: 'Меню', en: 'Menu' },
    manifestBtn: { ru: 'Манифест', en: 'Manifesto' },
    account: { ru: 'Аккаунт', en: 'Account' },
    guestPill: { ru: 'гость', en: 'guest' },
    guestNote: {
      ru: 'Ваши результаты пока не сохранены: гостя не видят другие люди, а без входа его данные удаляются через 30 дней.',
      en: 'Your results are not saved yet: other people do not see a guest, and without signing in the data is deleted after 30 days.',
    },
    saveResults: { ru: 'Сохранить результаты', en: 'Save my results' },
    manageAccount: { ru: 'Управление аккаунтом', en: 'Manage account' },
    soon: { ru: 'скоро', en: 'soon' },
    leave: { ru: 'Выйти', en: 'Sign out' },
    since: { ru: 'В Пространстве с', en: 'In the Space since' },
    noName: { ru: 'Без имени', en: 'No name' },


    view: { ru: 'Вид', en: 'View' },
    language: { ru: 'Язык', en: 'Language' },
    themeLabel: { ru: 'Тема', en: 'Theme' },
    light: { ru: 'Светлая', en: 'Light' },
    dark: { ru: 'Тёмная', en: 'Dark' },

    share: { ru: 'Поделиться', en: 'Share' },
    invite: { ru: 'Пригласить друзей', en: 'Invite friends' },
    copyLink: { ru: 'Скопировать ссылку', en: 'Copy the link' },
    copiedLabel: { ru: 'скопировано', en: 'copied' },
    inviteText: {
      ru: 'Пространство NDim ищет людей, похожих на Вас, — по тому, как Вы сами оцениваете важные для себя вещи.',
      en: 'NDim Space finds people similar to you — by how you rate the things that matter to you.',
    },

    documents: { ru: 'Документы', en: 'Documents' },
    manual: { ru: 'Руководство пользователя', en: 'User Manual' },
    terms: { ru: 'Условия использования', en: 'Terms of Use' },
    privacy: { ru: 'Политика конфиденциальности', en: 'Privacy Policy' },
    disclaimer: { ru: 'Отказ от ответственности', en: 'Disclaimer' },

    project: { ru: 'Проект', en: 'Project' },
    support: { ru: 'Поддержка', en: 'Support' },
    donate: { ru: 'Пожертвование', en: 'Donation' },
    about: { ru: 'О системе', en: 'About the system' },
    author: { ru: 'Об авторе', en: 'About the author' },
    // Сноска «Пожертвование — добровольное…» из «Меню» убрана по слову владельца
    // 2026-07-27: «об этом сказано на самой странице пожертвования». Текст живёт там
    // (src/routes/menu/donate) — в списке разделов он дублировал сам себя.

    versions: { ru: 'Версии', en: 'Versions' },
    signedOutNote: {
      ru: 'Вы не вошли. Манифест и документы открыты и так — а чтобы увидеть свои измерения и связи, войдите.',
      en: 'You are not signed in. The manifest and the documents are open anyway — sign in to see your dimensions and relations.',
    },
    signIn: { ru: 'Войти', en: 'Sign in' },
    /*
     * Состояние «данные не поднялись» — СВОЙ текст (bugs/87).
     *
     * До этого ветки `down` и `signedout` печатали ОДНУ фразу «Вы не вошли», и экран врал о
     * состоянии человека неотличимо от честного ответа. Владелец в этой же волне отдельно
     * потребовал не смешивать состояния (`ideas/21` п. 13: «это разные состояния, и должны
     * быть разные поведения приложения, а не всё смешивать в кучу»).
     *
     * [AI] Формулировка — черновик агента, ЖДЁТ ВЫЧИТКИ ВЛАДЕЛЬЦА (интервью №007). [/AI]
     */
    standDownNote: {
      ru: 'Не удалось загрузить Ваши данные. Проверьте соединение и обновите страницу.',
      en: 'We could not load your data. Check your connection and reload the page.',
    },
  } as const;
</script>

<svelte:head>
  <title>NDim Space — {t.title[lang]}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="screen">
  <SideRail active="menu" {lang} />
  <AppBar {lang} onLang={(next) => (lang = next)} />

  <main class="body">
    <h1 class="screen-title">{t.title[lang]}</h1>

    <!-- ── Манифест (bugs/38, слово владельца): на ТЕЛЕФОНЕ развесистый текст не съедает
         первый экран — вместо него кнопка на полную страницу /menu/manifesto; на ДЕСКТОПЕ
         места полно — манифест висит виджетом рядом с кнопками меню. Полный текст
         остаётся в пререндере этой страницы (виджет скрыт CSS) — охраняется e2e. ── -->
    <a class="card manifest-link" href="/menu/manifesto" in:fly={{ y: 10, duration: MOTION.base, easing: cubicOut }}>
      <span class="ic"><Icon name="stars" size={20} /></span>
      <span class="lb"><b>{t.manifestBtn[lang]}</b><span class="sub">{MANIFEST.title[lang]}</span></span>
      <span class="chev"><Icon name="chevron" size={13} /></span>
    </a>
    <section class="card manifest" in:fly={{ y: 10, duration: MOTION.base, easing: cubicOut }}>
      <h2>{MANIFEST.title[lang]}</h2>
      <!-- Текст свой, статический (не пользовательский): выделения — часть формулировки. -->
      {#each MANIFEST.paragraphs[lang] as paragraph, index (index)}
        <p>{@html paragraph}</p>
      {/each}
    </section>

    <!-- ── Левая колонка: аккаунт, вид, поделиться ── -->
    <section class="col" in:fly={{ y: 10, duration: MOTION.base, delay: 45, easing: cubicOut }}>
      <div class="card">
        <h3>{t.account[lang]}</h3>

        {#if stand === 'signedout'}
          <p class="note">{t.signedOutNote[lang]}</p>
          <a class="btn primary wide" href="/profile">{t.signIn[lang]}</a>
        {:else if stand === 'ready' && guest}
          <div class="who guest">
            <span class="ava guest" aria-hidden="true">◌</span>
            <span class="idn">
              <span class="pill">◌ {t.guestPill[lang]}</span>
              <span class="note">{t.guestNote[lang]}</span>
            </span>
          </div>
          <a class="btn primary wide" href="/profile">{t.saveResults[lang]}</a>
          <!--
            «Выйти» ГОСТЮ (ideas/21 п. 13). До этой строки гость был заперт: выйти он мог
            только став не-гостем, то есть заведя мусорный аккаунт на чужую почту. Из-за
            этого владелец не мог войти в СВОЙ аккаунт из браузера, где однажды зашёл гостем.

            Строка переиспользована один в один из ветки не-гостя ниже — ни нового элемента,
            ни нового текста здесь не придумано (правило четырёх макетов, `AGENT_GUIDE.md`).
            Полное решение (две двери «сохранить результаты» / «у меня уже есть аккаунт» с
            предупреждением и подтверждением) — это UI-решение владельца, оно вынесено
            макетами; здесь снят только замок.

            ⚠️ Выход гостя необратим: несохранённый труд пропадает. Человека об этом уже
            предупреждает `guestNote` строкой выше («Ваши результаты пока не сохранены…»).
            Нужна ли отдельная ступень подтверждения — вопрос владельца, он в баге.
          -->
          <button type="button" class="row" onclick={leave}>
            <span class="ic"><Icon name="logout" size={20} /></span><span class="lb">{t.leave[lang]}</span><span class="chev"><Icon name="chevron" size={13} /></span>
          </button>
        {:else if stand === 'ready'}
          <div class="who">
            <span class="ava" aria-hidden="true">{(displayName ?? 'N').slice(0, 1)}</span>
            <span class="idn">
              <b>{displayName ?? t.noName[lang]}</b>
              <span class="meta">{accountLine}</span>
            </span>
          </div>
          <span class="row off">
            <span class="ic"><Icon name="gear" size={20} /></span><span class="lb">{t.manageAccount[lang]}</span>
            <span class="val">{t.soon[lang]}</span>
          </span>
          <button type="button" class="row" onclick={leave}>
            <span class="ic"><Icon name="logout" size={20} /></span><span class="lb">{t.leave[lang]}</span><span class="chev"><Icon name="chevron" size={13} /></span>
          </button>
        {:else}
          <!-- `down` — данные не поднялись. СВОЯ фраза, а не «Вы не вошли» (bugs/87). -->
          <p class="note">{t.standDownNote[lang]}</p>
        {/if}
      </div>

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
        <a class="row" href="/menu/share">
          <span class="ic"><Icon name="share" size={20} /></span><span class="lb">{t.invite[lang]}</span><span class="chev"><Icon name="chevron" size={13} /></span>
        </a>
        <button type="button" class="row" onclick={copyLink}>
          <span class="ic"><Icon name="copy" size={20} /></span><span class="lb">{t.copyLink[lang]}</span>
          <span class="val">{copied ? t.copiedLabel[lang] : SITE_ORIGIN.replace('https://', '')}</span>
        </button>
      </div>
    </section>

    <!-- ── Правая колонка: документы, проект, версии ── -->
    <section class="col" in:fly={{ y: 10, duration: MOTION.base, delay: 90, easing: cubicOut }}>
      <div class="card">
        <h3>{t.documents[lang]}</h3>
        <!-- Иконки документов — ровно те, что стояли на этих же пунктах в 1.x
             (um.svg · tou.svg · pp.svg · disclaimer.svg), кадр app-08-меню.png. -->
        <a class="row" href="/menu/manual"><span class="ic"><Icon name="manual" size={20} /></span><span class="lb">{t.manual[lang]}</span><span class="chev"><Icon name="chevron" size={13} /></span></a>
        <a class="row" href="/menu/terms"><span class="ic"><Icon name="terms" size={20} /></span><span class="lb">{t.terms[lang]}</span><span class="chev"><Icon name="chevron" size={13} /></span></a>
        <a class="row" href="/menu/privacy"><span class="ic"><Icon name="privacy" size={20} /></span><span class="lb">{t.privacy[lang]}</span><span class="chev"><Icon name="chevron" size={13} /></span></a>
        <a class="row" href="/menu/disclaimer"><span class="ic"><Icon name="disclaimer" size={20} /></span><span class="lb">{t.disclaimer[lang]}</span><span class="chev"><Icon name="chevron" size={13} /></span></a>
      </div>

      <div class="card">
        <h3>{t.project[lang]}</h3>
        <a class="row" href="/menu/support"><span class="ic"><Icon name="support" size={20} /></span><span class="lb">{t.support[lang]}</span><span class="chev"><Icon name="chevron" size={13} /></span></a>
        <a class="row" href="/menu/donate"><span class="ic"><Icon name="donate" size={20} /></span><span class="lb">{t.donate[lang]}</span><span class="chev"><Icon name="chevron" size={13} /></span></a>
        <a class="row" href="/menu/about"><span class="ic"><Icon name="about" size={20} /></span><span class="lb">{t.about[lang]}</span><span class="chev"><Icon name="chevron" size={13} /></span></a>
        <a class="row" href="/menu/author"><span class="ic"><Icon name="author" size={20} /></span><span class="lb">{t.author[lang]}</span><span class="chev"><Icon name="chevron" size={13} /></span></a>
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

  /* Манифест (bugs/38): на телефоне — только кнопка на /menu/manifesto, полный виджет
     скрыт (текст при этом остаётся в пререндере страницы); на десктопе — наоборот. */
  .manifest { display: none; padding: 14px; }
  .manifest h2 {
    font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase;
    color: var(--dim); font-weight: 600; margin-bottom: 8px;
  }
  .manifest p { font-size: 13.5px; line-height: 1.6; color: var(--text); }
  .manifest p + p { margin-top: 10px; }
  .manifest :global(b) { color: var(--heading); }

  /* Кнопка манифеста (телефон): та же строка-дверь, что и остальные пункты меню. */
  .manifest-link {
    display: flex; align-items: center; gap: 11px;
    padding: 11px 14px; font-size: 13.5px; color: var(--text);
    text-decoration: none; transition: background 0.15s ease;
  }
  @media (hover: hover) {
    .manifest-link:hover { background: var(--edge-soft); }
  }
  /* Иконка теперь SVG, а не знак шрифта: центрируем флексом, размер задаёт сам <Icon>. */
  .manifest-link .ic { width: 24px; display: flex; justify-content: center; }
  .manifest-link .lb { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .manifest-link .lb b { color: var(--heading); font-size: 14px; }
  .manifest-link .sub { font-size: 12px; color: var(--dim); }
  .manifest-link .chev { color: var(--faint); }

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

  /* Кто я */
  .who { display: flex; align-items: center; gap: 11px; padding: 2px 14px 10px; }
  .ava {
    width: 46px; height: 46px; border-radius: 50%; flex: none;
    display: grid; place-items: center; font-size: 18px; font-weight: 700;
    color: var(--primary); border: 2px solid var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, transparent);
  }
  .ava.guest { border-style: dashed; border-color: var(--accent); color: var(--accent); }
  .idn { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .idn b { font-size: 16px; color: var(--heading); }
  .meta { font-size: 12px; color: var(--faint); word-break: break-word; }
  .note { font-size: 12.5px; color: var(--dim); line-height: 1.5; padding: 0 14px 10px; }
  .who .note { padding: 0; }
  .pill {
    align-self: flex-start; font-size: 11.5px; font-weight: 650; padding: 3px 10px; border-radius: 999px;
    border: 1px dashed var(--accent); color: var(--accent);
  }

  .seg { display: inline-flex; border: 1px solid var(--edge); border-radius: 999px; overflow: hidden; }
  .seg button {
    font: inherit; font-size: 12px; font-weight: 600; padding: 5px 12px;
    border: 0; cursor: pointer; background: transparent; color: var(--dim);
    transition: background 0.15s ease, color 0.15s ease;
  }
  .seg button.on { background: var(--primary); color: var(--primary-ink); }

  .btn {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 10px 16px; border-radius: 10px; font: inherit; font-size: 13.5px; font-weight: 600;
    border: 1px solid var(--edge); background: var(--panel); color: var(--heading); text-decoration: none;
    cursor: pointer;
    transition: border-color 0.15s ease, color 0.15s ease, filter 0.15s ease;
  }
  @media (hover: hover) {
    .btn:hover { border-color: var(--primary); color: var(--primary); }
  }
  @media (hover: hover) {
    .btn.primary:hover { color: var(--primary-ink); filter: brightness(1.08); }
  }
  .btn.primary { background: var(--primary); border-color: var(--primary); color: var(--primary-ink); }
  .btn.wide { display: flex; margin: 0 14px 12px; }

  /* ── Десктоп: макет V2 «Рабочий стол». Манифест — виджет РЯДОМ с кнопками меню
     (bugs/38, слово владельца: «в десктопе полно места — два виджета рядышком»):
     три колонки — манифест | аккаунт-вид-поделиться | документы-проект-версии.
     Медиа-блок в конце файла: при равной специфичности выигрывает последнее правило (EXP-0026). */
  @media (min-width: 1024px) {
    .screen {
      max-width: none;
      display: grid;
      grid-template-columns: 232px minmax(0, 1fr);
      grid-template-rows: auto 1fr;
    }
    .body {
      width: 100%; max-width: 1280px; margin: 0 auto; padding: 20px 26px 34px;
      display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
      align-content: start; align-items: start; gap: 12px;
    }
    .screen-title { grid-column: 1 / -1; }
    .manifest { display: block; }
    .manifest-link { display: none; }
  }
</style>

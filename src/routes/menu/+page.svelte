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
  import AppBar from '$lib/ui/AppBar.svelte';
  import BottomNav from '$lib/ui/BottomNav.svelte';
  import SideRail from '$lib/ui/SideRail.svelte';
  import {
    currentEmail,
    currentSession,
    isGuestSession,
    loadProfileScreen,
    signOutUser,
    type ProfileScreenData,
  } from '$lib/data/profile';
  import { loadSyncServer } from '$lib/data/space';
  import type { SyncServerDoc } from '$lib/model/stats';
  import { dateOnly, type Lang } from '$lib/ui/format';
  import { SITE_ORIGIN } from '$lib/site';

  let lang = $state<Lang>('ru');
  let theme = $state<'light' | 'dark'>('light');
  let stand = $state<'connecting' | 'ready' | 'down' | 'signedout'>('connecting');
  let data = $state<ProfileScreenData | null>(null);
  let email = $state<string | null>(null);
  let guest = $state(false);
  let server = $state<SyncServerDoc | null>(null);
  let copied = $state(false);

  const APP_VERSION = __APP_VERSION__;
  const APP_BUILT_AT = __APP_BUILT_AT__;

  onMount(async () => {
    const savedLang = localStorage.getItem('ndim-lang');
    if (savedLang === 'en' || savedLang === 'ru') lang = savedLang;
    theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

    try {
      // Меню работает и без входа: манифест, документы и версии от данных не зависят.
      const uid = await currentSession();
      if (uid === null) {
        stand = 'signedout';
        server = await loadSyncServer().catch(() => null);
        return;
      }
      guest = isGuestSession();
      email = currentEmail();
      [data, server] = await Promise.all([loadProfileScreen(uid), loadSyncServer()]);
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

  function setTheme(next: 'light' | 'dark') {
    theme = next;
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('ndim-theme', next);
  }

  /** Приглашение друга: системное «поделиться», а где его нет — копирование ссылки. */
  async function invite() {
    const text = t.inviteText[lang];
    if (navigator.share) {
      try {
        await navigator.share({ title: 'NDim Space', text, url: SITE_ORIGIN });
        return;
      } catch {
        // Человек передумал делиться — это не ошибка.
        return;
      }
    }
    await copyLink();
  }

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
    manifestTitle: {
      ru: 'Зачем существует Пространство NDim',
      en: 'Why NDim Space exists',
    },
    // Текст утверждён владельцем (design/menu-mockups.html, V1). Правило: пишем о том,
    // что ЕСТЬ, — о цели и ценностях, а не о том, чего у нас нет.
    manifest: {
      ru: [
        'Пространство NDim ищет людей, <b>похожих друг на друга</b> — по внутреннему миру, характеру, взглядам. Не по анкете и не по фотографии: только по тому, как человек сам оценил важные для себя вещи. Считает это <b>строгая математика</b>, одинаково беспристрастная ко всем — независимо от пола, происхождения, веры и убеждений.',
        'Пространство создано, чтобы <b>объединять людей</b> — по интересам, убеждениям, образу мысли — и чтобы в мире становилось больше дружбы, поддержки и любви. Оно стоит на взаимном уважении, доброжелательности, честности и доверии.',
        'Пространство работает <b>бесплатно</b> и открыто для всех, где есть интернет.',
        'Когда мир, благодаря Пространству NDim, станет более добрым и приятным местом для жизни, — можно будет считать, что оно успешно выполнило свою работу.',
      ],
      en: [
        'NDim Space looks for people who are <b>similar to each other</b> — by their inner world, character and views. Not by a questionnaire and not by a photo: only by how a person rated the things that matter to them. This is computed by <b>rigorous mathematics</b>, equally impartial to everyone — regardless of gender, origin, faith or beliefs.',
        'The Space was created to <b>bring people together</b> — by interests, beliefs and ways of thinking — so that there is more friendship, support and love in the world. It stands on mutual respect, goodwill, honesty and trust.',
        'The Space works <b>free of charge</b> and is open to everyone who has the internet.',
        'When the world, thanks to NDim Space, becomes a kinder and more pleasant place to live — we can consider that it has done its job.',
      ],
    },

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
    donationNote: {
      ru: 'Пожертвование — добровольное. Все возможности Пространства одинаковы для всех.',
      en: 'Donations are voluntary. All features of the Space are the same for everyone.',
    },

    app: { ru: 'Приложение', en: 'Application' },
    syncServer: { ru: 'Сервер синхронизации', en: 'Sync server' },
    build: { ru: 'билд', en: 'build' },
    signedOutNote: {
      ru: 'Вы не вошли. Манифест и документы открыты и так — а чтобы увидеть свои измерения и связи, войдите.',
      en: 'You are not signed in. The manifest and the documents are open anyway — sign in to see your dimensions and relations.',
    },
    signIn: { ru: 'Войти', en: 'Sign in' },
  } as const;
</script>

<svelte:head>
  <title>NDim Space — {t.title[lang]}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="screen">
  <SideRail active="menu" {lang} />
  <AppBar {lang} onToggleLang={() => setLang(lang === 'ru' ? 'en' : 'ru')} />

  <main class="body">
    <h1 class="screen-title">{t.title[lang]}</h1>

    <!-- ── Манифест: меню начинается со смысла, а не с настроек ── -->
    <section class="card manifest">
      <h2>{t.manifestTitle[lang]}</h2>
      {#each t.manifest[lang] as paragraph}
        <!-- Текст свой, статический (не пользовательский): выделения — часть формулировки. -->
        <p>{@html paragraph}</p>
      {/each}
      <div class="btns">
        <a class="btn" href="/menu/manual">{t.manual[lang]}</a>
        <a class="btn" href="/menu/about">{t.about[lang]}</a>
        <a class="btn" href="/menu/author">{t.author[lang]}</a>
      </div>
    </section>

    <!-- ── Левая колонка: аккаунт, вид, поделиться ── -->
    <section class="col">
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
        {:else if stand === 'ready'}
          <div class="who">
            <span class="ava" aria-hidden="true">{(displayName ?? 'N').slice(0, 1)}</span>
            <span class="idn">
              <b>{displayName ?? t.noName[lang]}</b>
              <span class="meta">{accountLine}</span>
            </span>
          </div>
          <span class="row off">
            <span class="ic">⚙</span><span class="lb">{t.manageAccount[lang]}</span>
            <span class="val">{t.soon[lang]}</span>
          </span>
          <button type="button" class="row" onclick={leave}>
            <span class="ic">↪</span><span class="lb">{t.leave[lang]}</span><span class="chev">›</span>
          </button>
        {:else}
          <p class="note">{t.signedOutNote[lang]}</p>
        {/if}
      </div>

      <div class="card">
        <h3>{t.view[lang]}</h3>
        <div class="row off">
          <span class="ic">🌐</span><span class="lb">{t.language[lang]}</span>
          <span class="seg">
            <button type="button" class:on={lang === 'ru'} onclick={() => setLang('ru')}>RU</button>
            <button type="button" class:on={lang === 'en'} onclick={() => setLang('en')}>EN</button>
          </span>
        </div>
        <div class="row off">
          <span class="ic">☾</span><span class="lb">{t.themeLabel[lang]}</span>
          <span class="seg">
            <button type="button" class:on={theme === 'light'} onclick={() => setTheme('light')}>{t.light[lang]}</button>
            <button type="button" class:on={theme === 'dark'} onclick={() => setTheme('dark')}>{t.dark[lang]}</button>
          </span>
        </div>
      </div>

      <div class="card">
        <h3>{t.share[lang]}</h3>
        <button type="button" class="row" onclick={invite}>
          <span class="ic">↗</span><span class="lb">{t.invite[lang]}</span><span class="chev">›</span>
        </button>
        <button type="button" class="row" onclick={copyLink}>
          <span class="ic">⧉</span><span class="lb">{t.copyLink[lang]}</span>
          <span class="val">{copied ? t.copiedLabel[lang] : SITE_ORIGIN.replace('https://', '')}</span>
        </button>
      </div>
    </section>

    <!-- ── Правая колонка: документы, проект, версии ── -->
    <section class="col">
      <div class="card">
        <h3>{t.documents[lang]}</h3>
        <a class="row" href="/menu/manual"><span class="ic">📖</span><span class="lb">{t.manual[lang]}</span><span class="chev">›</span></a>
        <a class="row" href="/menu/terms"><span class="ic">§</span><span class="lb">{t.terms[lang]}</span><span class="chev">›</span></a>
        <a class="row" href="/menu/privacy"><span class="ic">🔒</span><span class="lb">{t.privacy[lang]}</span><span class="chev">›</span></a>
        <a class="row" href="/menu/disclaimer"><span class="ic">⚠</span><span class="lb">{t.disclaimer[lang]}</span><span class="chev">›</span></a>
      </div>

      <div class="card">
        <h3>{t.project[lang]}</h3>
        <a class="row" href="/menu/support"><span class="ic">✉</span><span class="lb">{t.support[lang]}</span><span class="chev">›</span></a>
        <a class="row" href="/menu/donate"><span class="ic">♡</span><span class="lb">{t.donate[lang]}</span><span class="chev">›</span></a>
        <a class="row" href="/menu/about"><span class="ic">ⓘ</span><span class="lb">{t.about[lang]}</span><span class="chev">›</span></a>
        <a class="row" href="/menu/author"><span class="ic">N</span><span class="lb">{t.author[lang]}</span><span class="chev">›</span></a>
        <p class="quiet pad">{t.donationNote[lang]}</p>
      </div>

      <p class="versions">
        {t.app[lang]} {APP_VERSION}<br />
        {#if server}{t.syncServer[lang]} {server.version} · {t.build[lang]} {server.build}<br />{/if}
        {dateOnly(Date.parse(APP_BUILT_AT), lang)}
      </p>
    </section>
  </main>

  <BottomNav active="menu" {lang} />
</div>

<style>
  .screen {
    max-width: 430px; margin: 0 auto; min-height: 100vh; min-height: 100dvh;
    display: flex; flex-direction: column; background: var(--bg);
  }
  .body { flex: 1; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
  .screen-title { font-size: 19px; font-weight: 700; color: var(--heading); }
  .col { display: flex; flex-direction: column; gap: 12px; }

  .card {
    background: var(--panel); border: 1px solid var(--edge); border-radius: 14px;
    box-shadow: var(--card-shadow); overflow: hidden;
  }
  .card h3 {
    font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase;
    color: var(--dim); font-weight: 600; padding: 14px 16px 8px;
  }

  /* Манифест */
  .manifest { padding: 16px; }
  .manifest h2 {
    font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase;
    color: var(--dim); font-weight: 600; margin-bottom: 10px;
  }
  .manifest p { font-size: 14.5px; line-height: 1.7; color: var(--text); }
  .manifest p + p { margin-top: 12px; }
  .manifest :global(b) { color: var(--heading); }
  .btns { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }

  /* Строка списка: и ссылка, и кнопка выглядят одинаково */
  .row {
    display: flex; align-items: center; gap: 12px; width: 100%;
    padding: 12px 16px; border: 0; border-top: 1px solid var(--edge-soft);
    background: transparent; font: inherit; font-size: 14px; color: var(--text);
    text-align: left; text-decoration: none; cursor: pointer;
  }
  .row:hover { background: var(--edge-soft); }
  .row.off { cursor: default; }
  .row.off:hover { background: transparent; }
  .row .ic { width: 24px; text-align: center; font-size: 15px; color: var(--accent); }
  .row .lb { flex: 1; }
  .row .val { font-size: 12px; color: var(--faint); font-family: var(--mono); }
  .row .chev { color: var(--faint); }

  /* Кто я */
  .who { display: flex; align-items: center; gap: 12px; padding: 4px 16px 12px; }
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
  .note { font-size: 12.5px; color: var(--dim); line-height: 1.5; padding: 0 16px 12px; }
  .who .note { padding: 0; }
  .pill {
    align-self: flex-start; font-size: 11.5px; font-weight: 650; padding: 3px 10px; border-radius: 999px;
    border: 1px dashed var(--accent); color: var(--accent);
  }

  .seg { display: inline-flex; border: 1px solid var(--edge); border-radius: 999px; overflow: hidden; }
  .seg button {
    font: inherit; font-size: 12px; font-weight: 600; padding: 5px 12px;
    border: 0; cursor: pointer; background: transparent; color: var(--dim);
  }
  .seg button.on { background: var(--primary); color: var(--primary-ink); }

  .btn {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 10px 16px; border-radius: 10px; font: inherit; font-size: 13.5px; font-weight: 600;
    border: 1px solid var(--edge); background: var(--panel); color: var(--heading); text-decoration: none;
    cursor: pointer;
  }
  .btn.primary { background: var(--primary); border-color: var(--primary); color: var(--primary-ink); }
  .btn.wide { display: flex; margin: 0 16px 14px; }

  .quiet { font-size: 11.5px; color: var(--faint); line-height: 1.55; }
  .quiet.pad { padding: 10px 16px 14px; }
  .versions {
    text-align: center; font-family: var(--mono); font-size: 11.5px;
    color: var(--faint); line-height: 1.7;
  }

  /* ── Десктоп: макет V2 «Рабочий стол». Манифест — во всю ширину, ниже две колонки.
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
      display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
      align-content: start; align-items: start; gap: 12px;
    }
    .screen-title, .manifest { grid-column: 1 / -1; }
  }
</style>

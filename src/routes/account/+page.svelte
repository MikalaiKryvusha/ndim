<script lang="ts">
  /*
   * Экран «Управлять аккаунтом» — фаза 4 эпика `plans/15` (операционный план `plans/18`).
   *
   * ФОРМА УТВЕРЖДЕНА ВЛАДЕЛЬЦЕМ 2026-08-01 (макет V2 + правка «с виджетами», `plans/17`):
   *   · отдельный маршрут, а не разворот в «Профиле» и не модалка;
   *   · подэкранов нет — секции раскрываются на месте (появятся в фазах 5, 7, 8);
   *   · страница собрана ВИДЖЕТНОЙ СЕТКОЙ по модели «шага» (`ideas/24`): содержательный
   *     виджет — два шага из четырёх, «Удаление аккаунта» (фаза 8) — во всю панель, последним.
   *
   * ИМЯ ЭКРАНА — «Управлять аккаунтом», инфинитив. Это канон 1.x, снятый по коду архива
   * (`researches/24` §2.1), а не «Управление аккаунтом»: так называлась дверь и так назывался
   * заголовок. Дверь в карточке-шапке «Профиля» при этом носит имя «Управление аккаунтом» —
   * тоже канон 1.x (`ideas/19`), и это не расхождение, а два разных места.
   *
   * ЧТО ЭТОТ ЭКРАН ПОКА НЕ ДЕЛАЕТ: не меняет почту (фаза 5), не трогает пароль (фаза 7), не
   * удаляет аккаунт (фаза 8). Фаза 4 — фундамент: маршрут, виджет «Мой аккаунт» и состояния.
   * Обещать здесь то, чего нет, нельзя — ровно из-за этого в «Профиле» жила строка «скоро».
   */
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import AppBar from '$lib/ui/AppBar.svelte';
  import BottomNav from '$lib/ui/BottomNav.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import SideRail from '$lib/ui/SideRail.svelte';
  import { currentAccount, type AccountFacts, type SignInMethod } from '$lib/data/account';
  import { currentSession } from '$lib/data/profile';
  import { technicalDetail } from '$lib/ui/errors';
  import { dateTime, type Lang } from '$lib/ui/format';
  import { MOTION } from '$lib/ui/motion';

  let lang = $state<Lang>('ru');
  /*
   * Состояния экрана — те же четыре, что у «Профиля», и по той же причине.
   * `guest` вынесен отдельно от `ready`: у гостя нет ни почты, ни даты создания, и показывать
   * ему пустой виджет было бы враньём. Но и запирать его нельзя — это замок `bugs/84`, в
   * который однажды упёрся живой человек: выход нашёлся только через отдельную дверь.
   */
  let stand = $state<'connecting' | 'ready' | 'guest' | 'signedout' | 'down'>('connecting');
  let standError = $state('');
  let facts = $state<AccountFacts | null>(null);

  onMount(async () => {
    const saved = localStorage.getItem('ndim-lang');
    if (saved === 'en' || saved === 'ru') lang = saved;

    try {
      // Сессию спрашиваем ТЕМ ЖЕ способом, что и «Профиль»: там живут стендовые двери
      // `?as=guest` и `?as=none`, без которых гостевые ветки никем не проверяются.
      const uid = await currentSession();
      if (uid === null) {
        stand = 'signedout';
        return;
      }
      // Ни одного запроса к базе: всё нужное Firebase уже держит в сессии (канон «экономить
      // запросы к базе»). Поэтому карточки «Загрузка» человек почти не увидит.
      const snapshot = currentAccount();
      if (snapshot === null) {
        stand = 'signedout';
        return;
      }
      facts = snapshot;
      stand = snapshot.guest ? 'guest' : 'ready';
    } catch (error) {
      standError = technicalDetail(error);
      stand = 'down';
    }
  });

  const t = {
    title: { ru: 'Управлять аккаунтом', en: 'Manage account' },
    back: { ru: 'Профиль', en: 'Profile' },
    card: { ru: 'Мой аккаунт', en: 'My account' },
    email: { ru: 'Email', en: 'Email' },
    created: { ru: 'Создан', en: 'Created' },
    methods: { ru: 'Способы входа', en: 'Sign-in methods' },
    verified: { ru: 'подтверждён', en: 'verified' },
    // Тон подтверждения — как у зрелых продуктов: говорим, что подтверждение ДАЁТ, а не
    // отчитываем человека за то, чего он не сделал.
    unverified: { ru: 'не подтверждён', en: 'not verified' },
    unverifiedHint: {
      ru: 'Подтверждённый адрес — Ваш ключ к аккаунту: по нему Вы входите и восстанавливаете доступ.',
      en: 'A verified address is your key to the account: you sign in and recover access with it.',
    },
    unknownDate: { ru: 'дата неизвестна', en: 'date unknown' },
    method: {
      google: { ru: 'Google', en: 'Google' },
      email: { ru: 'Почта', en: 'Email' },
    } satisfies Record<SignInMethod, { ru: string; en: string }>,
    guestTitle: { ru: 'Вы смотрите Пространство гостем', en: 'You are exploring as a guest' },
    guestBody: {
      ru: 'У гостя нет почты, поэтому управлять пока нечем. Сохраните свои результаты — и этот экран станет Вашим.',
      en: 'A guest has no email address, so there is nothing to manage yet. Save your results and this screen becomes yours.',
    },
    guestCta: { ru: 'Сохранить результаты', en: 'Save my results' },
    signedOut: { ru: 'Войдите, чтобы управлять аккаунтом.', en: 'Sign in to manage your account.' },
    signIn: { ru: 'Войти', en: 'Sign in' },
    standDown: {
      ru: 'Не удалось прочитать данные аккаунта. Обновите страницу.',
      en: 'Could not read your account details. Please reload the page.',
    },
  };

  const methodList = $derived(
    facts === null ? '' : facts.methods.map((m) => t.method[m][lang]).join(' · '),
  );
</script>

<svelte:head>
  <title>NDim Space — {t.title[lang]}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="screen">
  <SideRail active="profile" {lang} />
  <AppBar {lang} onLang={(next) => (lang = next)} />

  <main class="body">
    <!-- Дверь назад — в «Профиль», откуда сюда и попадают. Иконка набора, а не типографский
         глиф: у глифа нет ни сетки, ни веса (bugs/17). -->
    <a class="back" href="/profile"><Icon name="back" size={13} />{t.back[lang]}</a>
    <h1>{t.title[lang]}</h1>

    {#if stand === 'connecting'}
      <!-- Каноничная карточка загрузки 1.x вместо голого текста (bugs/21) -->
      <div class="state"><Loading {lang} /></div>
    {:else if stand === 'signedout'}
      <div class="card">
        <p class="lede">{t.signedOut[lang]}</p>
        <a class="btn" href="/profile">{t.signIn[lang]}</a>
      </div>
    {:else if stand === 'down'}
      <div class="card">
        <p class="lede">{t.standDown[lang]}</p>
        {#if standError}<p class="hint mono">{standError}</p>{/if}
      </div>
    {:else if stand === 'guest'}
      <!-- Гость не заперт: экран честно объясняет, почему управлять нечем, и ведёт туда,
           где это чинится. Дверь сюда ему в «Профиле» не показывается вовсе — этот вид
           существует для того, кто пришёл по прямой ссылке. -->
      <div class="card" in:fade={{ duration: MOTION.base }}>
        <h2>{t.guestTitle[lang]}</h2>
        <p class="lede">{t.guestBody[lang]}</p>
        <a class="btn" href="/profile">{t.guestCta[lang]}</a>
      </div>
    {:else if facts !== null}
      <!-- ВИДЖЕТ «Мой аккаунт» — два шага из четырёх (модель `ideas/24`). Порядок строк —
           канон 1.x: Email, затем «Создан» (кадр app-14, `researches/24` §2.1). Строка
           «Способы входа» — новая: её в 1.x не было, она отвечает на вопрос «чем я вхожу». -->
      <div class="card" in:fade={{ duration: MOTION.base }}>
        <h3>{t.card[lang]}</h3>

        <div class="prop">
          <span class="k">{t.email[lang]}</span>
          <span class="v">
            {facts.email ?? '—'}
            {#if facts.email !== null}
              <span class="badge" class:warn={!facts.emailVerified}>
                {facts.emailVerified ? t.verified[lang] : t.unverified[lang]}
              </span>
            {/if}
          </span>
        </div>

        <div class="prop">
          <span class="k">{t.created[lang]}</span>
          <span class="v">{facts.createdAt === null ? t.unknownDate[lang] : dateTime(facts.createdAt, lang)}</span>
        </div>

        <!--
          ⚠️ ЗДЕСЬ НЕ ПИШЕТСЯ НИЧЕГО ПРО ПАРОЛЬ, и это не забывчивость.
          `providerData` не отличает «есть пароль» от «вход по ссылке» — у обоих `password`
          (`EXP-0109`). Строка «Пароль не задан» с макета была бы выдумкой. Чем отличать —
          вопрос владельцу В10; ответ приедет с фазой 7 (`plans/15`).
        -->
        {#if methodList !== ''}
          <div class="prop">
            <span class="k">{t.methods[lang]}</span>
            <span class="v">{methodList}</span>
          </div>
        {/if}

        {#if facts.email !== null && !facts.emailVerified}
          <p class="hint">{t.unverifiedHint[lang]}</p>
        {/if}
      </div>
    {/if}
  </main>

  <BottomNav active="profile" {lang} />
</div>

<style>
  /* Оболочка — та же, что у главных экранов: рельс слева от 1024px, нижняя панель на телефоне. */
  .screen {
    min-height: 100vh; min-height: 100dvh;
    display: flex; flex-direction: column; background: var(--bg);
  }
  .body { flex: 1; padding: 14px 14px 24px; width: 100%; }

  .back {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 13px; font-weight: 600; color: var(--primary);
    text-decoration: none; margin-bottom: 10px;
  }
  h1 { font-size: 20px; font-weight: 700; color: var(--heading); margin-bottom: 14px; }
  h2 { font-size: 16px; font-weight: 700; color: var(--heading); margin-bottom: 8px; }

  .card {
    background: var(--panel); border: 1px solid var(--edge); border-radius: 16px;
    padding: 14px; margin-bottom: 12px; box-shadow: var(--card-shadow);
  }
  .card h3 {
    font-size: 12px; text-transform: uppercase; letter-spacing: .06em;
    color: var(--dim); margin-bottom: 10px; font-weight: 600;
  }

  /* Строка «ключ — значение»: те же размеры, что в карточках «Профиля», — экран должен
     выглядеть частью продукта, а не гостем в нём. */
  .prop {
    display: flex; align-items: baseline; gap: 10px;
    padding: 9px 0; border-bottom: 1px solid var(--edge-soft);
  }
  .prop:last-of-type { border-bottom: 0; }
  .prop .k { font-size: 12px; color: var(--dim); width: 108px; flex: none; }
  .prop .v { font-size: 14px; color: var(--heading); flex: 1; min-width: 0; word-break: break-word; }

  .badge {
    font-size: 11px; padding: 1px 7px; border-radius: 999px; margin-left: 6px;
    background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent);
    white-space: nowrap;
  }
  /* Неподтверждённая почта — не ошибка и не тревога: это состояние, которое человек может
     поправить. Поэтому предупреждающий тон, а не красный цвет отказа. */
  .badge.warn {
    background: color-mix(in srgb, var(--star) 18%, transparent);
    color: color-mix(in srgb, var(--star) 72%, var(--heading));
  }

  .lede { font-size: 14px; color: var(--text); line-height: 1.6; }
  .hint { font-size: 12px; color: var(--faint); line-height: 1.55; margin-top: 10px; }
  .mono { font-family: var(--mono); }
  .state { display: flex; justify-content: center; }

  .btn {
    display: inline-flex; align-items: center; justify-content: center;
    margin-top: 12px; padding: 10px 16px; border-radius: 12px;
    background: var(--primary); color: var(--primary-ink);
    font-size: 14px; font-weight: 600; text-decoration: none;
  }

  @media (min-width: 1024px) {
    .screen {
      max-width: none;
      display: grid;
      grid-template-columns: 232px minmax(0, 1fr);
      grid-template-rows: auto 1fr;
    }
    /*
     * СЕТКА С ШАГОМ ВИДЖЕТА — тот же приём, что на «Профиле» и «Пространстве» (`ideas/24`,
     * макет V4 владельца): четыре шага, содержательный виджет — два, по вертикали ничего
     * искусственно не растягивается.
     *
     * Сейчас виджет ровно один, и половина ширины пуста — это НЕ дыра, а место, куда встанут
     * «Поменять Email» (фаза 5) и «Пароль» (фаза 7). Заполнять его чем-нибудь ради симметрии
     * нельзя: выдуманная сущность потом защищает себя (`EXP-0107`).
     */
    .body {
      width: 100%; max-width: 1280px; margin: 0 auto; padding: 20px 26px 34px;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      align-items: start; align-content: start; gap: 14px;
    }
    /* Содержательный виджет — два шага. */
    .body > .card { grid-column: span 2; }
    /* Во всю ширину — то, что не делится на колонки. */
    .body > .back,
    .body > h1,
    .body > .state { grid-column: 1 / -1; }
    .body > .back { margin-bottom: 0; }
  }
</style>

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
  import {
    accountErrorText,
    completeReauthLink,
    currentAccount,
    forgetPendingOp,
    isReauthLink,
    pendingOp,
    reauthWithGoogle,
    reauthWay,
    rememberPendingOp,
    requestEmailChange,
    sendReauthLink,
    type AccountFacts,
    type AccountFailure,
    type SignInMethod,
  } from '$lib/data/account';
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

  /*
   * ── СМЕНА ПОЧТЫ (фаза 5) ────────────────────────────────────────────────────────────────
   * Состояния виджета, и каждое из них человек реально видит:
   *   idle    — свёрнут;
   *   open    — раскрыт, человек вводит новый адрес;
   *   working — идёт подтверждение личности или отправка;
   *   waiting — ссылка подтверждения ушла на ТЕКУЩИЙ адрес, ждём возврата из письма;
   *   done    — письмо на новый адрес запрошено (НЕЙТРАЛЬНО: см. `requestEmailChange`).
   */
  type EmailPhase = 'idle' | 'open' | 'working' | 'waiting' | 'done';
  let emailPhase = $state<EmailPhase>('idle');
  let newEmail = $state('');
  let emailError = $state('');

  function fail(reason: AccountFailure): void {
    emailError = accountErrorText(reason, lang);
    emailPhase = 'open';
  }

  /** Последний шаг: просим Firebase выслать письмо на НОВЫЙ адрес. */
  async function askEmailChange(address: string): Promise<void> {
    emailPhase = 'working';
    const result = await requestEmailChange(address, lang);
    if (result.ok) {
      emailPhase = 'done';
      newEmail = '';
      return;
    }
    fail(result.reason);
  }

  /**
   * Человек нажал «Выслать письмо».
   *
   * Порядок шагов — канон 1.x (`researches/24` §2.3): сначала подтверждение личности, потом
   * новый адрес. У нас подтверждение уехало в отдельный шаг, потому что в 2.0 оно не поле, а
   * действие: popup у Google и письмо у почты.
   */
  async function submitEmail(): Promise<void> {
    emailError = '';
    const address = newEmail.trim();

    // Свои проверки — тексты 1.x дословно.
    if (address === '') {
      emailError = t.emailEmpty[lang];
      return;
    }
    if (facts !== null && address.toLowerCase() === (facts.email ?? '').toLowerCase()) {
      emailError = t.emailSame[lang];
      return;
    }

    const way = reauthWay();
    if (way === null) {
      fail('no-session');
      return;
    }

    if (way === 'google') {
      emailPhase = 'working';
      const confirmed = await reauthWithGoogle();
      if (!confirmed.ok) {
        fail(confirmed.reason);
        return;
      }
      await askEmailChange(address);
      return;
    }

    // Путь почты: намерение переживает круг через письмо — без этого возврат по ссылке
    // окажется возвращением в никуда (тот же приём, что спас вход в `bugs/84`).
    emailPhase = 'working';
    rememberPendingOp({ op: 'change-email', newEmail: address });
    const sent = await sendReauthLink(lang);
    if (!sent.ok) {
      forgetPendingOp();
      fail(sent.reason);
      return;
    }
    emailPhase = 'waiting';
  }

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

      /*
       * Человек вернулся из письма ПОДТВЕРЖДЕНИЯ личности. Здесь замыкается круг: сессия жива,
       * ссылка в адресе, намерение лежит в памяти браузера.
       *
       * ⚠️ Разбираем это ПОСЛЕ того, как экран уже знает, кто перед ним: иначе ошибка
       * подтверждения показалась бы на пустом экране без единой подсказки, куда человек попал.
       */
      if (isReauthLink()) {
        const waiting = pendingOp();
        const confirmed = await completeReauthLink();
        if (!confirmed.ok) {
          forgetPendingOp();
          fail(confirmed.reason);
        } else if (waiting !== null) {
          await askEmailChange(waiting.newEmail);
        }
        // Адрес чистим от одноразового кода: обновление страницы не должно пытаться
        // применить его ещё раз (код одноразовый — ASVS 6.4.1).
        history.replaceState(null, '', '/account');
      }
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
    // ── Виджет «Поменять Email». Тексты, помеченные «1.x», перенесены ДОСЛОВНО
    //    (`researches/24` §2.3): это язык владельца, проживший два года в бою.
    emailCard: { ru: 'Поменять Email', en: 'Change email' },
    emailLede: {
      ru: 'Для изменения Вашего текущего Email на новый запросите письмо верификации на Ваш новый Email и пройдите по ссылке в полученном письме.',
      en: 'To change your current email, request a verification letter to your new address and follow the link in it.',
    }, // 1.x
    emailLabel: { ru: 'Введите новый Email:', en: 'Enter your new email:' }, // 1.x
    emailSend: { ru: 'Выслать письмо', en: 'Send letter' }, // 1.x
    emailEmpty: { ru: 'Новый Email не может быть пустым.', en: 'New email cannot be empty.' }, // 1.x
    emailSame: {
      ru: 'Новый Email не может быть равен текущему.',
      en: 'New email cannot be the same as the current one.',
    }, // 1.x
    // Предупреждение стоит В ШАГЕ ВВОДА, а не в сообщении после (приём Slack): почта у нас —
    // единственный ключ к аккаунту, и опечатка стоит доступа.
    emailTypo: {
      ru: 'Проверьте адрес внимательно: почта — Ваш ключ к аккаунту.',
      en: 'Check the address carefully: email is your key to the account.',
    },
    emailWorking: { ru: 'Минуту…', en: 'One moment…' },
    emailCancel: { ru: 'Отмена', en: 'Cancel' },
    emailWaitTitle: { ru: 'Подтвердите, что это Вы', en: 'Confirm it is you' },
    emailWaitBody: {
      ru: 'Мы отправили письмо на Ваш текущий адрес. Перейдите по ссылке из него — и смена почты продолжится.',
      en: 'We sent a letter to your current address. Follow the link in it and the change will continue.',
    },
    emailWaitWhy: {
      ru: 'Так мы убеждаемся, что адрес меняете именно Вы, а не тот, кто оказался за Вашим экраном.',
      en: 'This is how we make sure it is you changing the address, not someone who sat down at your screen.',
    },
    emailDoneTitle: { ru: 'Проверьте новый адрес', en: 'Check the new address' },
    /*
     * 🔴 НЕЙТРАЛЬНАЯ ФОРМУЛИРОВКА — не осторожность, а единственная правда.
     * При включённой защите от перечисления почт письмо уходит, ТОЛЬКО если новый адрес
     * свободен, и никакой ошибки при этом нет. «Письмо отправлено» было бы враньём половине
     * людей, а «адрес занят» вернуло бы утечку, которую платформа закрыла (ASVS 6.3.8).
     */
    emailDoneBody: {
      ru: 'Если этот адрес свободен, письмо уже в пути. Почта сменится, когда Вы перейдёте по ссылке из письма.',
      en: 'If this address is free, the letter is already on its way. Your email changes once you follow the link.',
    },
    emailSessions: {
      ru: 'После смены почты вход на других устройствах придётся выполнить заново.',
      en: 'After the change you will need to sign in again on your other devices.',
    },
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

      <!-- ВИДЖЕТ «Поменять Email» — два шага, раскрывашка на месте (утверждённый V2 + виджеты).
           Подэкрана нет: всё происходит здесь, как решил владелец. -->
      <div class="card" in:fade={{ duration: MOTION.base }}>
        {#if emailPhase === 'idle'}
          <button type="button" class="acc-head" onclick={() => (emailPhase = 'open')}>
            <span class="ic"><Icon name="envelope" size={20} /></span>
            <span class="lb">{t.emailCard[lang]}</span>
            <span class="chev"><Icon name="chevron" size={13} /></span>
          </button>
        {:else}
          <h3>{t.emailCard[lang]}</h3>

          {#if emailPhase === 'waiting'}
            <!-- Круг через письмо на ТЕКУЩИЙ адрес. Это и есть подтверждение со старого
                 адреса, которого требует OWASP при отсутствии второго фактора. -->
            <p class="sub">{t.emailWaitTitle[lang]}</p>
            <p class="lede">{t.emailWaitBody[lang]}</p>
            <p class="hint">{t.emailWaitWhy[lang]}</p>
            <button type="button" class="btn ghost" onclick={() => { forgetPendingOp(); emailPhase = 'idle'; }}>
              {t.emailCancel[lang]}
            </button>
          {:else if emailPhase === 'done'}
            <p class="sub">{t.emailDoneTitle[lang]}</p>
            <p class="lede">{t.emailDoneBody[lang]}</p>
            <p class="hint">{t.emailSessions[lang]}</p>
            <button type="button" class="btn ghost" onclick={() => (emailPhase = 'idle')}>
              {t.emailCancel[lang]}
            </button>
          {:else}
            <p class="lede">{t.emailLede[lang]}</p>
            <label class="field">
              <span>{t.emailLabel[lang]}</span>
              <input
                class="inp"
                type="email"
                inputmode="email"
                autocomplete="email"
                bind:value={newEmail}
                disabled={emailPhase === 'working'}
              />
            </label>
            <p class="hint">{t.emailTypo[lang]}</p>
            {#if emailError}<p class="err">{emailError}</p>{/if}
            <div class="cta">
              <button type="button" class="btn" disabled={emailPhase === 'working'} onclick={submitEmail}>
                {emailPhase === 'working' ? t.emailWorking[lang] : t.emailSend[lang]}
              </button>
              <button type="button" class="btn ghost" onclick={() => { emailPhase = 'idle'; emailError = ''; }}>
                {t.emailCancel[lang]}
              </button>
            </div>
          {/if}
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
    border: 1px solid transparent;
    background: var(--primary); color: var(--primary-ink);
    font: inherit; font-size: 14px; font-weight: 600; text-decoration: none; cursor: pointer;
  }
  .btn:disabled { opacity: .6; cursor: default; }
  .btn.ghost { background: transparent; border-color: var(--edge); color: var(--text); font-weight: 500; }

  /* Свёрнутая раскрывашка виджета — тот же ряд, что в карточке-шапке «Профиля». */
  .acc-head {
    display: flex; align-items: center; gap: 11px; width: 100%;
    padding: 2px; border: 0; background: transparent;
    font: inherit; font-size: 13.5px; color: var(--text); text-align: left; cursor: pointer;
  }
  .acc-head .ic { width: 24px; display: flex; justify-content: center; color: var(--accent); flex: none; }
  .acc-head .lb { flex: 1; }
  .acc-head .chev { color: var(--faint); flex: none; }

  .sub { font-size: 15px; font-weight: 600; color: var(--heading); margin-bottom: 6px; }
  .field { display: block; margin-bottom: 8px; }
  .field span { display: block; font-size: 12px; color: var(--dim); margin-bottom: 4px; }
  .inp {
    width: 100%; padding: 9px 11px; border: 1px solid var(--edge); border-radius: 10px;
    background: var(--bg); color: var(--heading); font: inherit; font-size: 14px;
  }
  .err { font-size: 12.5px; color: var(--danger, #d6544f); line-height: 1.5; margin-top: 8px; }
  .cta { display: flex; gap: 8px; flex-wrap: wrap; }

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

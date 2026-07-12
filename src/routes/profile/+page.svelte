<script lang="ts">
  // Экран «Профиль» (NDim ID) — первый экран продукта 2.0.
  //
  // Макет: design/profile-synthesis-mockups.html, утверждён владельцем 2026-07-11
  // («Утверждено, работаем»). Три вкладки: Личное | Измерения | Видимость.
  //   · Измерения — единая лента с поиском и фильтрами (сегмент «Все | Мой NDim ID»
  //     из 1.x — костыль, сюда не переносится); свёрнутая строка — имя + бар (просмотр),
  //     раскрытая — карточка с описанием, рейтингом сообщества и звёздами 0–10 (ввод).
  //   · Видимость — предпросмотр «глазами гостя»: чистая функция visibleTo.
  //
  // Данные — модель 2.0 с локальных эмуляторов (интервью №003, В2): npm run stand.
  // Прод-шелл пререндерится; Firebase трогаем только в onMount (в браузере).
  import { onMount } from 'svelte';
  import AppBar from '$lib/ui/AppBar.svelte';
  import Avatar from '$lib/ui/Avatar.svelte';
  import BottomNav from '$lib/ui/BottomNav.svelte';
  import SideRail from '$lib/ui/SideRail.svelte';
  import { monthYearSince } from '$lib/ui/format';
  import {
    currentSession,
    ensureSpaceExists,
    isGuestSession,
    loadProfileScreen,
    previewAs,
    saveProfile,
    saveRating,
    signInGuest,
    submitSuggestion,
    type ProfileScreenData,
  } from '$lib/data/profile';
  import {
    completeLoginLink,
    continueWithGoogle,
    isLoginLink,
    linkGoogle,
    sendLoginLink,
    waitForSession,
  } from '$lib/data/account';
  import { track } from '$lib/data/funnel';
  import { EVERYONE, FRIENDS } from '$lib/model/visibility';
  import type { Audience, ProfileProperty } from '$lib/model/visibility';
  import { isRealDate, type Localized, type ProfileData } from '$lib/model/schema';

  type Lang = 'ru' | 'en';
  type Tab = 'personal' | 'dims' | 'visibility';
  type DimFilter = 'mine' | 'unrated' | 'all';

  let lang = $state<Lang>('ru');
  let tab = $state<Tab>('personal');

  // Состояние стенда — честное: подключаемся / готово / стенда нет / публичный хост.
  // На публичном домене экраны 2.0 ещё не открыты (данные 2.0 появятся с миграцией) —
  // показываем честную заглушку со ссылкой на живое приложение, а не дев-сообщение.
  let stand = $state<'connecting' | 'ready' | 'down' | 'signedout'>('connecting');
  let standError = $state('');
  let data = $state<ProfileScreenData | null>(null);

  // Гостевой режим (plans/03 этап 2, макет V1 «Тихий бейдж» утверждён 2026-07-11):
  // ?guest в адресе → мгновенный анонимный вход. Карточка гостя показана при первом
  // входе; «позже» прячет её до следующего визита (пилюля в шапке открывает снова).
  const GUEST_CARD_KEY = 'ndim-guest-card';
  let guest = $state(false);
  let guestCard = $state(false);

  // Аккаунт без пароля (plans/03 этап 3, макет V4 «Врезка»): гостевая карточка
  // разворачивается в вход прямо на месте, ничего не перекрывая.
  //   facts   — три честных факта про гостя и кнопка [Сохранить результаты];
  //   choose  — Google или почта;
  //   sending — письмо отправляется;
  //   sent    — «Мы отправили Вам письмо»;
  //   linking — человек вернулся по ссылке, привязываем;
  //   done    — «Профиль сохранён».
  type SignupStep = 'facts' | 'choose' | 'sending' | 'sent' | 'linking' | 'done';
  let signupStep = $state<SignupStep>('facts');
  let signupEmail = $state('');
  let signupError = $state('');

  // Вкладка «Измерения»
  let search = $state('');
  let dimFilter = $state<DimFilter>('mine');
  let expandedDim = $state<string | null>(null);
  let savingDim = $state<string | null>(null);

  // Вкладка «Видимость»: выбранная аудитория предпросмотра
  let previewKey = $state('me');

  // Редактирование личной информации: плоская форма ('' = не заполнено → null в модели)
  let editing = $state(false);
  let saving = $state(false);
  let editError = $state('');
  let f = $state({
    firstRu: '', firstEn: '', nickRu: '', nickEn: '',
    middleRu: '', middleEn: '', lastRu: '', lastEn: '',
    aboutRu: '', aboutEn: '',
    year: '', month: '', day: '',
    gender: '' as '' | 'm' | 'w' | 'nb',
  });

  // Редактор аудитории свойства (открывается тапом по чипу)
  let audFor = $state<ProfileProperty | null>(null);
  let audEveryone = $state(false);
  let audFriends = $state(false);
  let audGroups = $state<Record<string, boolean>>({});

  // Заявка на новую ось
  let suggestOpen = $state(false);
  let suggestText = $state('');
  let suggestState = $state<'idle' | 'sending' | 'sent'>('idle');

  onMount(async () => {
    try {
      let uid: string | null;
      // Человек вернулся по ссылке из письма. Если он был гостем — почта привязывается
      // к его же сессии (UID и труд сохраняются). Если сессии нет — это вход человека,
      // который у нас уже есть: 331 человек из 1.x входит именно так, и вход по ссылке
      // ЗАОДНО подтверждает им почту.
      if (isLoginLink()) {
        uid = await finishEmailLink();
      } else if (new URLSearchParams(location.search).has('guest')) {
        uid = await signInGuest();
        await ensureSpaceExists(uid, lang);
        guest = true;
        guestCard = localStorage.getItem(GUEST_CARD_KEY) !== 'later';
        void track('guest_start'); // третий шаг воронки (plans/03 этап 4)
      } else {
        // Стенд входит сам; в бою — только существующая сессия. Её нет — предлагаем войти,
        // а не заводим человеку анонимную сессию за его спиной.
        uid = await currentSession();
        if (uid === null) {
          stand = 'signedout';
          return;
        }
        guest = isGuestSession();
        guestCard = guest && localStorage.getItem(GUEST_CARD_KEY) !== 'later';
      }
      data = await loadProfileScreen(uid);
      stand = 'ready';
    } catch (error) {
      standError = error instanceof Error ? error.message : String(error);
      stand = 'down';
    }
  });

  /** Вход человека, который у нас уже есть (или заводит аккаунт с нуля). */
  async function signIn(method: 'google' | 'email') {
    signupError = '';

    if (method === 'google') {
      signupStep = 'linking';
      const result = await continueWithGoogle();
      if (!result.ok) {
        signupError = t.account.errors[result.reason][lang];
        signupStep = 'facts';
        return;
      }
      location.reload(); // сессия появилась — перезагружаем экран уже как вошедший
      return;
    }

    signupStep = 'choose'; // форма почты: дальше по той же дороге, что и у гостя
  }

  /** Продолжить гостем — тот же путь, что с лендинга. */
  async function continueAsGuest() {
    location.href = '/profile?guest=1';
  }

  /**
   * Возврат по почтовой ссылке. Показывает карточку в состоянии «подтверждаем»,
   * привязывает почту к текущей (гостевой) сессии и чистит адрес: коды из ссылки
   * одноразовые, при перезагрузке страницы они дали бы ложную ошибку.
   */
  async function finishEmailLink(): Promise<string> {
    guest = true;
    guestCard = true;
    signupStep = 'linking';

    const session = await waitForSession();
    const result = await completeLoginLink();
    history.replaceState(null, '', '/profile');

    if (result.ok) {
      guest = false; // аккаунт создан: пилюля гостя и запреты уходят
      signupStep = 'done';
      void track('account_created'); // четвёртый шаг воронки — путь пройден
      return result.uid;
    }

    signupError = t.account.errors[result.reason][lang];
    signupStep = 'choose';
    // Ссылка не сработала, но человек всё ещё в своей гостевой сессии — показываем
    // ему его же профиль, а не выкидываем на пустой экран.
    if (session) return session.uid;
    const uid = await signInGuest();
    await ensureSpaceExists(uid, lang);
    return uid;
  }

  function guestLater() {
    guestCard = false;
    localStorage.setItem(GUEST_CARD_KEY, 'later');
  }

  /**
   * «В Пространстве с <месяц год>» — из настоящей даты создания профиля.
   *
   * Раньше здесь стояла жёстко вписанная строка «с мая 2025»: свежесозданному гостю продукт
   * врал про его же возраст. А затем месяц брался прямо из локали браузера — и выходило
   * «с феврал**ь** 2025 г.»: после «с» русскому нужен родительный падеж, но браузер про
   * предлог ничего не знает. Морфология живёт в одном месте — `format.ts`.
   */
  const sinceMonth = (created: number): string => monthYearSince(created, lang);

  async function startGoogle() {
    signupError = '';
    const result = await linkGoogle();
    if (result.ok) {
      guest = false;
      signupStep = 'done';
      void track('account_created'); // четвёртый шаг воронки — путь пройден
      return;
    }
    signupError = t.account.errors[result.reason][lang];
  }

  async function requestLink() {
    const email = signupEmail.trim();
    if (!email.includes('@')) {
      signupError = t.account.emailInvalid[lang];
      return;
    }
    signupError = '';
    signupStep = 'sending';
    const result = await sendLoginLink(email);
    if (result.ok) {
      signupStep = 'sent';
      return;
    }
    signupError = t.account.errors[result.reason][lang];
    signupStep = 'choose';
  }

  // ── Двуязычные строки интерфейса ──
  const t = {
    title: { ru: 'Профиль', en: 'Profile' },
    tabs: {
      personal: { ru: 'Личное', en: 'Personal' },
      dims: { ru: 'Измерения', en: 'Dimensions' },
      visibility: { ru: 'Видимость', en: 'Visibility' },
    },
    connecting: { ru: 'Подключаюсь…', en: 'Connecting…' },
    standDown: {
      ru: 'Не удалось загрузить данные. Обновите страницу — если не поможет, напишите в поддержку.',
      en: 'Could not load your data. Reload the page — if that does not help, write to support.',
    },
    // Экран входа: человек не вошёл. Паролей в 2.0 нет — ни у новых людей, ни у тех,
    // кто пришёл из 1.x: вход по ссылке из письма подтверждает их почту сам.
    signedOut: {
      title: { ru: 'Войдите в Пространство', en: 'Sign in to the Space' },
      lede: {
        ru: 'Пароль не нужен. Если Вы уже были в Пространстве NDim — войдите той же почтой, и все Ваши измерения и связи будут на месте.',
        en: 'No password needed. If you have been in NDim Space before — sign in with the same email, and all your dimensions and relations will be there.',
      },
      google: { ru: 'Войти через Google', en: 'Continue with Google' },
      email: { ru: 'Войти по ссылке на почту', en: 'Sign in with an email link' },
      guest: { ru: 'Осмотреться гостем', en: 'Look around as a guest' },
    },
    // Гость: тексты утверждённого макета V1 «Тихий бейдж».
    // Правила текста (владелец, 2026-07-12): обращение — «Вы» во всём продукте;
    // слово «навсегда» не используем (человек может удалить свои данные);
    // никакого внутреннего жаргона на лице приложения. См. design/login-mockups.html.
    guest: {
      pill: { ru: 'гость', en: 'guest' },
      title: {
        ru: 'Сейчас Вы гость — Ваши результаты не сохранены',
        en: 'You are a guest for now — your results are not saved',
      },
      fact1: {
        ru: 'Вас никто не видит: в Пространстве Вы невидимы.',
        en: 'Nobody sees you: in the Space you are invisible.',
      },
      fact2: {
        ru: 'Всё, что Вы заполните, останется Вашим: при создании аккаунта сохранится как есть.',
        en: 'Everything you fill in stays yours: create an account and it is kept as is.',
      },
      fact3: {
        ru: 'Если Вы не вернётесь в течение 30 дней, мы удалим эти данные без следа.',
        en: 'If you do not come back within 30 days, we erase this data without a trace.',
      },
      save: { ru: 'Сохранить результаты', en: 'Save my results' },
      later: { ru: 'позже', en: 'later' },
      audienceLocked: {
        ru: 'Пока Вы гость, Вас не видит никто, поэтому открывать свойство некому. Настройки аудитории появятся после создания аккаунта.',
        en: 'While you are a guest nobody sees you, so there is nobody to open the property to. Audience settings arrive after you create an account.',
      },
    },
    // Аккаунт без пароля — утверждённый макет V4 «Врезка» (design/login-mockups.html).
    // Тексты — по правилам владельца от 2026-07-12: «Вы», без слова «навсегда»,
    // без внутреннего жаргона. Менять их — только вместе с макетом.
    account: {
      lead: {
        ru: 'Ваши результаты пока не сохранены. Создайте аккаунт — оценки и найденные связи останутся с Вами, ничего не придётся начинать заново.',
        en: 'Your results are not saved yet. Create an account and your ratings and relations stay with you — nothing has to be started over.',
      },
      google: { ru: 'Продолжить с Google', en: 'Continue with Google' },
      emailPlaceholder: { ru: 'Ваш адрес электронной почты', en: 'Your email address' },
      sendLink: { ru: 'Получить ссылку для входа', en: 'Get a sign-in link' },
      emailNote: {
        ru: 'Почта нужна только для входа в Ваш профиль.',
        en: 'The email is used only to sign in to your profile.',
      },
      emailInvalid: {
        ru: 'Пожалуйста, введите адрес электронной почты.',
        en: 'Please enter an email address.',
      },
      sending: { ru: 'Отправляем письмо…', en: 'Sending the email…' },
      sentTitle: { ru: 'Мы отправили Вам письмо', en: 'We have sent you an email' },
      sentBody: {
        ru: 'Пожалуйста, откройте его в своей почте {email} и нажмите кнопку «Подтвердить вход». После этого Ваш профиль будет сохранён, а все оценки останутся на месте.',
        en: 'Please open it in your mailbox {email} and press the “Confirm sign-in” button. After that your profile is saved and all your ratings stay in place.',
      },
      sentNote: {
        ru: 'Ссылка действует один час. Эту страницу можно не закрывать — она откроет Ваш профиль сама.',
        en: 'The link is valid for one hour. You may keep this page open — it will open your profile itself.',
      },
      otherEmail: { ru: 'Указать другую почту', en: 'Use a different email' },
      linking: { ru: 'Подтверждаем вход…', en: 'Confirming your sign-in…' },
      doneBadge: { ru: 'Профиль сохранён', en: 'Profile saved' },
      doneTitle: {
        ru: 'Добро пожаловать в Пространство NDim',
        en: 'Welcome to NDim Space',
      },
      doneBody: {
        ru: 'Аккаунт создан. Ваши оценки и найденные связи на месте — Вы продолжаете с того же места, где остановились.',
        en: 'Your account is created. Your ratings and relations are in place — you continue exactly where you stopped.',
      },
      doneNote: {
        ru: 'Вас по-прежнему не видит никто. Что и кому показать — решаете Вы сами, в разделе «Видимость».',
        en: 'Nobody sees you yet. What to show and to whom is entirely your decision, in the “Visibility” tab.',
      },
      close: { ru: 'Продолжить', en: 'Continue' },
      retry: { ru: 'Попробовать снова', en: 'Try again' },
      errors: {
        'already-in-use': {
          ru: 'Этот способ входа уже связан с другим профилем NDim. Чтобы сохранить текущие результаты, создайте аккаунт на другую почту.',
          en: 'This sign-in method already belongs to another NDim profile. To keep your current results, create an account with a different email.',
        },
        cancelled: { ru: 'Вход отменён.', en: 'Sign-in cancelled.' },
        'expired-link': {
          ru: 'Ссылка больше не действует. Пожалуйста, запросите новую.',
          en: 'The link is no longer valid. Please request a new one.',
        },
        unknown: {
          ru: 'Не удалось создать аккаунт. Пожалуйста, попробуйте ещё раз.',
          en: 'The account could not be created. Please try again.',
        },
      },
    },
    inSpaceSince: { ru: 'В Пространстве с', en: 'In the Space since' },
    personalInfo: { ru: 'Личная информация', en: 'Personal information' },
    defaultHidden: {
      ru: 'Новое свойство скрыто от всех, пока Вы сами его не откроете.',
      en: 'A new property is hidden from everyone until you open it yourself.',
    },
    myNdimId: { ru: 'Мой NDim ID', en: 'My NDim ID' },
    // Осей в Пространстве тысячи: дробь «X из N» бессмысленна и демотивирует (правка
    // владельца, 2026-07-11). Показываем только абсолютное число оценённого.
    ratedDims: { ru: 'Оценено измерений', en: 'Dimensions rated' },
    toDims: { ru: 'К измерениям →', en: 'To dimensions →' },
    searchDims: { ru: 'Найти среди {n} измерений…', en: 'Search {n} dimensions…' },
    filters: {
      mine: { ru: 'Мои', en: 'Mine' },
      unrated: { ru: 'Не оценено', en: 'Unrated' },
      all: { ru: 'Все', en: 'All' },
    },
    votes: { ru: 'голосов', en: 'votes' },
    yourRating: { ru: 'Ваша оценка', en: 'Your rating' },
    collapse: { ru: 'Свернуть ▴', en: 'Collapse ▴' },
    suggestDim: { ru: '💡 Предложить новое измерение', en: '💡 Suggest a new dimension' },
    soon: { ru: 'скоро', en: 'soon' },
    barsHint: {
      ru: 'Свёрнуто — бар (просмотр), раскрыто — звёзды (ввод). Оценки видите только Вы.',
      en: 'Collapsed — a bar (viewing), expanded — stars (rating). Only you can see your ratings.',
    },
    seenBy: { ru: 'Так Вас видит аудитория', en: 'How this audience sees you' },
    me: { ru: 'Я', en: 'Me' },
    everyone: { ru: 'Все', en: 'Everyone' },
    friends: { ru: 'Друзья', en: 'Friends' },
    nobody: { ru: 'Никому', en: 'Nobody' },
    circle: { ru: 'Круг', en: 'Circle' },
    hidden: { ru: 'скрыто', en: 'hidden' },
    dimsPrivate: {
      ru: 'Оценки по осям не видны никому ни в одном режиме — гость видит только итоговую похожесть.',
      en: 'Axis ratings are visible to no one in any mode — a guest only sees the resulting similarity.',
    },
    props: {
      name: { ru: 'Имя', en: 'Name' },
      about: { ru: 'О себе', en: 'About' },
      born: { ru: 'Дата рождения', en: 'Birth date' },
      gender: { ru: 'Пол', en: 'Gender' },
      avatar: { ru: 'Фото', en: 'Photo' },
    },
    genders: { m: { ru: 'Мужской', en: 'Male' }, w: { ru: 'Женский', en: 'Female' }, nb: { ru: 'Небинарный', en: 'Non-binary' } },
    noValue: { ru: 'не заполнено', en: 'not filled' },
    noAvatar: { ru: 'нет фото', en: 'no photo' },
    nav: {
      profile: { ru: 'Профиль', en: 'Profile' },
      relations: { ru: 'Связи', en: 'Relations' },
      space: { ru: 'Пространство', en: 'Space' },
      menu: { ru: 'Меню', en: 'Menu' },
    },
    edit: { ru: 'Редактировать', en: 'Edit' },
    save: { ru: 'Сохранить', en: 'Save' },
    cancel: { ru: 'Отмена', en: 'Cancel' },
    notSpecified: { ru: 'не указан', en: 'not specified' },
    whoSees: { ru: 'Кто видит это свойство', en: 'Who sees this property' },
    nobodyHint: {
      ru: 'Ничего не отмечено — свойство не видит никто, кроме Вас.',
      en: 'Nothing checked — nobody sees the property except you.',
    },
    applyAudience: { ru: 'Сохранить аудиторию', en: 'Save audience' },
    fields: {
      firstRu: { ru: 'Имя · рус', en: 'First name · ru' },
      firstEn: { ru: 'Имя · англ', en: 'First name · en' },
      nickRu: { ru: 'Ник · рус', en: 'Nickname · ru' },
      nickEn: { ru: 'Ник · англ', en: 'Nickname · en' },
      middleRu: { ru: 'Отчество · рус', en: 'Middle name · ru' },
      middleEn: { ru: 'Отчество · англ', en: 'Middle name · en' },
      lastRu: { ru: 'Фамилия · рус', en: 'Last name · ru' },
      lastEn: { ru: 'Фамилия · англ', en: 'Last name · en' },
      aboutRu: { ru: 'О себе · рус', en: 'About · ru' },
      aboutEn: { ru: 'О себе · англ', en: 'About · en' },
      year: { ru: 'Год', en: 'Year' },
      month: { ru: 'Месяц', en: 'Month' },
      day: { ru: 'День', en: 'Day' },
    },
    suggestTitle: { ru: 'Предложить новое измерение', en: 'Suggest a new dimension' },
    suggestHint: {
      ru: 'Опишите ось: что это и зачем (5–300 символов). Заявку рассмотрит админ.',
      en: 'Describe the axis: what it is and why (5–300 chars). An admin will review it.',
    },
    suggestSend: { ru: 'Отправить', en: 'Send' },
    suggestSent: { ru: 'Спасибо! Заявка отправлена — так Пространство растёт снизу.', en: 'Thank you! Suggestion sent — this is how the Space grows bottom-up.' },
    suggestMore: { ru: 'Предложить ещё', en: 'Suggest another' },
  } as const;

  const NAME_FIELD_KEYS = ['firstRu', 'firstEn', 'nickRu', 'nickEn', 'middleRu', 'middleEn', 'lastRu', 'lastEn'] as const;
  const BORN_FIELD_KEYS = ['year', 'month', 'day'] as const;

  onMount(() => {
    const saved = localStorage.getItem('ndim-lang');
    if (saved === 'en' || saved === 'ru') lang = saved;
  });

  function toggleLang() {
    lang = lang === 'ru' ? 'en' : 'ru';
    document.documentElement.setAttribute('lang', lang);
    localStorage.setItem('ndim-lang', lang);
  }

  // ── Отображение значений ──
  const loc = (value: Localized | undefined | null): string | null =>
    value ? (value[lang] ?? value.ru ?? value.en) : null;

  const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function formatValue(property: string, value: unknown): string {
    if (value === undefined || value === null) return t.noValue[lang];
    switch (property) {
      case 'name': {
        const name = value as { first: Localized; nick: Localized };
        return loc(name.first) ?? loc(name.nick) ?? t.noValue[lang];
      }
      case 'about':
        return loc(value as Localized) ?? t.noValue[lang];
      case 'born': {
        const born = value as { year: number | null; month: number | null; day: number | null };
        if (born.year === null) return t.noValue[lang];
        const month = born.month === null ? '' : ` ${(lang === 'ru' ? MONTHS_RU : MONTHS_EN)[born.month - 1]}`;
        return `${born.day ?? ''}${month} ${born.year}`.trim();
      }
      case 'gender': {
        const gender = value as 'm' | 'w' | 'nb' | null;
        return gender ? t.genders[gender][lang] : t.noValue[lang];
      }
      case 'avatar':
        return value === true ? 'аватар' : t.noAvatar[lang];
      default:
        return String(value);
    }
  }

  /** Подпись аудитории свойства для чипа: 🌐 Все / 👥 Друзья / ◎ Круг «…» / 🔒 Никому. */
  function audienceChip(audience: Audience | undefined): { icon: string; label: string; kind: string } {
    if (audience === EVERYONE) return { icon: '🌐', label: t.everyone[lang], kind: 'open' };
    if (!audience || audience.length === 0) return { icon: '🔒', label: t.nobody[lang], kind: 'lock' };
    const parts = audience.map((groupId) => {
      if (groupId === FRIENDS) return `👥 ${t.friends[lang]}`;
      const group = data?.groups.get(groupId);
      return `◎ ${group ? `${t.circle[lang]} «${group.name}»` : groupId}`;
    });
    return { icon: '', label: parts.join(' · '), kind: audience.includes(FRIENDS) ? 'open' : 'circ' };
  }

  // ── Вкладка «Измерения»: фильтрация ленты ──
  const dimsFiltered = $derived.by(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    return data.dims.filter((dim) => {
      const rated = data!.ratings.has(dim.id);
      if (dimFilter === 'mine' && !rated) return false;
      if (dimFilter === 'unrated' && rated) return false;
      if (query) {
        const haystack = `${dim.title.ru ?? ''} ${dim.title.en ?? ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  });

  const ratedCount = $derived(data ? data.ratings.size : 0);

  async function rate(dimId: string, value: number) {
    if (!data || savingDim) return;
    savingDim = dimId;
    try {
      await saveRating(data.uid, dimId, value);
      const ratings = new Map(data.ratings);
      ratings.set(dimId, value);
      data = { ...data, ratings };
    } finally {
      savingDim = null;
    }
  }

  // ── Вкладка «Видимость»: варианты предпросмотра ──
  const previewOptions = $derived.by(() => {
    const options = [
      { key: 'me', label: t.me[lang] },
      { key: 'everyone', label: `🌐 ${t.everyone[lang]}` },
      { key: 'friends', label: `👥 ${t.friends[lang]}` },
    ];
    if (data) {
      for (const [groupId, group] of data.groups) options.push({ key: `group:${groupId}`, label: `◎ ${group.name}` });
    }
    return options;
  });

  const previewValues = $derived.by(() => {
    if (!data) return {};
    if (previewKey === 'me') return data.values as Record<string, unknown>;
    if (previewKey === 'friends') return previewAs(data, { isFriend: true, groups: [] });
    if (previewKey.startsWith('group:')) return previewAs(data, { isFriend: false, groups: [previewKey.slice(6)] });
    return previewAs(data, { isFriend: false, groups: [] });
  });

  const PROPERTIES = ['name', 'gender', 'about', 'born', 'avatar'] as const;
  const TABS = ['personal', 'dims', 'visibility'] as const;
  const STARS = Array.from({ length: 11 }, (_, index) => index);

  // ── Редактирование личного ──
  const orEmpty = (value: string | null | undefined): string => value ?? '';

  function startEdit() {
    if (!data) return;
    const v = data.values;
    f = {
      firstRu: orEmpty(v.name?.first.ru), firstEn: orEmpty(v.name?.first.en),
      nickRu: orEmpty(v.name?.nick.ru), nickEn: orEmpty(v.name?.nick.en),
      middleRu: orEmpty(v.name?.middle.ru), middleEn: orEmpty(v.name?.middle.en),
      lastRu: orEmpty(v.name?.last.ru), lastEn: orEmpty(v.name?.last.en),
      aboutRu: orEmpty(v.about?.ru), aboutEn: orEmpty(v.about?.en),
      year: v.born?.year === null || v.born?.year === undefined ? '' : String(v.born.year),
      month: v.born?.month === null || v.born?.month === undefined ? '' : String(v.born.month),
      day: v.born?.day === null || v.born?.day === undefined ? '' : String(v.born.day),
      gender: v.gender ?? '',
    };
    editError = '';
    editing = true;
  }

  const text = (value: string): string | null => (value.trim() === '' ? null : value.trim());
  const num = (value: string): number | null => (value.trim() === '' ? null : Number(value));

  function buildValues(): Partial<ProfileData> {
    return {
      name: {
        first: { ru: text(f.firstRu), en: text(f.firstEn) },
        middle: { ru: text(f.middleRu), en: text(f.middleEn) },
        last: { ru: text(f.lastRu), en: text(f.lastEn) },
        nick: { ru: text(f.nickRu), en: text(f.nickEn) },
      },
      about: { ru: text(f.aboutRu), en: text(f.aboutEn) },
      born: { year: num(f.year), month: num(f.month), day: num(f.day) },
      gender: f.gender === '' ? null : f.gender,
      avatar: data?.values.avatar ?? false,
    };
  }

  async function saveEdit() {
    if (!data || saving) return;
    editError = '';
    try {
      const values = buildValues();
      if (values.born && !isRealDate(values.born)) {
        throw new Error(lang === 'ru' ? 'Такой календарной даты не существует' : 'No such calendar date exists');
      }
      saving = true;
      await saveProfile(data.uid, values, data.root.visibility, data.root.visibility);
      data = await loadProfileScreen(data.uid);
      editing = false;
    } catch (error) {
      editError = error instanceof Error ? error.message : String(error);
    } finally {
      saving = false;
    }
  }

  // ── Смена аудитории свойства ──
  function openAudience(property: ProfileProperty) {
    if (!data) return;
    const audience = data.root.visibility[property] ?? [];
    audEveryone = audience === EVERYONE;
    audFriends = audience !== EVERYONE && audience.includes(FRIENDS);
    const groups: Record<string, boolean> = {};
    for (const groupId of data.groups.keys()) {
      groups[groupId] = audience !== EVERYONE && audience.includes(groupId);
    }
    audGroups = groups;
    audFor = audFor === property ? null : property;
  }

  function draftAudience(): Audience {
    if (audEveryone) return EVERYONE;
    const picked: string[] = [];
    if (audFriends) picked.push(FRIENDS);
    for (const [groupId, checked] of Object.entries(audGroups)) if (checked) picked.push(groupId);
    return picked;
  }

  async function saveAudience() {
    if (!data || audFor === null || saving) return;
    saving = true;
    editError = '';
    try {
      const visibility = { ...data.root.visibility, [audFor]: draftAudience() };
      await saveProfile(data.uid, data.values, visibility, data.root.visibility);
      data = await loadProfileScreen(data.uid);
      audFor = null;
    } catch (error) {
      editError = error instanceof Error ? error.message : String(error);
    } finally {
      saving = false;
    }
  }

  // ── Заявка на новую ось ──
  async function sendSuggestion() {
    if (!data || suggestState === 'sending') return;
    suggestState = 'sending';
    editError = '';
    try {
      await submitSuggestion(data.uid, suggestText);
      suggestState = 'sent';
      suggestText = '';
    } catch (error) {
      editError = error instanceof Error ? error.message : String(error);
      suggestState = 'idle';
    }
  }
</script>

<svelte:head>
  <title>NDim Space — {t.title[lang]}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="screen">
  <SideRail active="profile" {lang} />

  <AppBar
    {lang}
    onToggleLang={toggleLang}
    badge={guest ? t.guest.pill[lang] : undefined}
    onBadge={() => (guestCard = !guestCard)}
  />

  <nav class="tabs" aria-label={t.title[lang]}>
    {#each TABS as key (key)}
      <button type="button" class:on={tab === key} onclick={() => (tab = key)}>{t.tabs[key][lang]}</button>
    {/each}
  </nav>

  <main class="body">
    {#if stand === 'connecting'}
      <p class="state">{t.connecting[lang]}</p>
    {:else if stand === 'signedout'}
      <!-- Человек не вошёл. Три двери, и ни одной с паролем: Google · ссылка на почту ·
           гостем. Люди из 1.x входят той же почтой — их UID, оценки и связи на месте. -->
      <div class="card signin">
        <h2>{t.signedOut.title[lang]}</h2>
        <p class="state">{t.signedOut.lede[lang]}</p>

        {#if signupStep === 'choose' || signupStep === 'sending' || signupStep === 'sent'}
          <!-- Форма почты — та же, что у гостя (макет V4 «Врезка»). -->
          {#if signupStep === 'sent'}
            <p class="sent">✉ {t.account.sentTitle[lang]}</p>
            <p class="hint">{t.account.sentNote[lang]}</p>
          {:else}
            <input
              class="inp acc-email"
              type="email"
              inputmode="email"
              autocomplete="email"
              placeholder={t.account.emailPlaceholder[lang]}
              bind:value={signupEmail}
              disabled={signupStep === 'sending'}
            />
            <button type="button" class="btn" disabled={signupStep === 'sending'} onclick={requestLink}>
              {signupStep === 'sending' ? t.account.sending[lang] : t.account.sendLink[lang]}
            </button>
          {/if}
        {:else}
          <button type="button" class="btn" onclick={() => signIn('google')}>{t.signedOut.google[lang]}</button>
          <button type="button" class="btn ghost" onclick={() => signIn('email')}>{t.signedOut.email[lang]}</button>
          <button type="button" class="linkish" onclick={continueAsGuest}>{t.signedOut.guest[lang]}</button>
        {/if}

        {#if signupError}<p class="err">{signupError}</p>{/if}
      </div>
    {:else if stand === 'down'}
      <div class="card">
        <p class="state">{t.standDown[lang]}</p>
        <p class="hint mono">{standError}</p>
      </div>
    {:else if data}
      {#if guestCard && (guest || signupStep === 'done')}
        <!-- Карточка гостя (утверждённый V1 «Тихий бейдж») разворачивается в вход
             прямо на месте — утверждённый макет V4 «Врезка». Ничего не перекрывается
             и никуда не уводит: человек остаётся в своём профиле. -->
        <div class="card guest-card" class:saved={signupStep === 'done'}>
          {#if signupStep === 'done'}
            <span class="guest-ava solid"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.6" r="4.4" /><path d="M12 13.6c-4.9 0-8.6 3.1-8.6 7.4h17.2c0-4.3-3.7-7.4-8.6-7.4z" /></svg></span>
            <p class="saved-badge">✓ {t.account.doneBadge[lang]}</p>
            <h2>{t.account.doneTitle[lang]}</h2>
            <p class="acc-lead">{t.account.doneBody[lang]}</p>
            <p class="hint">{t.account.doneNote[lang]}</p>
            <div class="guest-cta">
              <button type="button" class="btn" onclick={() => (guestCard = false)}>{t.account.close[lang]}</button>
            </div>
          {:else if signupStep === 'linking'}
            <span class="guest-ava"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.6" r="4.4" /><path d="M12 13.6c-4.9 0-8.6 3.1-8.6 7.4h17.2c0-4.3-3.7-7.4-8.6-7.4z" /></svg></span>
            <p class="acc-lead">{t.account.linking[lang]}</p>
          {:else if signupStep === 'sent'}
            <span class="guest-ava"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.6" r="4.4" /><path d="M12 13.6c-4.9 0-8.6 3.1-8.6 7.4h17.2c0-4.3-3.7-7.4-8.6-7.4z" /></svg></span>
            <h2>{t.account.sentTitle[lang]}</h2>
            <p class="acc-lead">{t.account.sentBody[lang].replace('{email}', signupEmail)}</p>
            <p class="hint">{t.account.sentNote[lang]}</p>
            <div class="guest-cta">
              <button type="button" class="btn ghost" onclick={() => (signupStep = 'choose')}>{t.account.otherEmail[lang]}</button>
            </div>
          {:else}
            <span class="guest-ava"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.6" r="4.4" /><path d="M12 13.6c-4.9 0-8.6 3.1-8.6 7.4h17.2c0-4.3-3.7-7.4-8.6-7.4z" /></svg></span>
            <h2>{t.guest.title[lang]}</h2>

            {#if signupStep === 'facts'}
              <ul class="guest-facts">
                <li>🫥 {t.guest.fact1[lang]}</li>
                <li>💾 {t.guest.fact2[lang]}</li>
                <li>🍂 {t.guest.fact3[lang]}</li>
              </ul>
              <div class="guest-cta">
                <button type="button" class="btn" onclick={() => (signupStep = 'choose')}>{t.guest.save[lang]}</button>
                <button type="button" class="guest-later" onclick={guestLater}>{t.guest.later[lang]}</button>
              </div>
            {:else}
              <p class="acc-lead">{t.account.lead[lang]}</p>
              <button type="button" class="btn google" disabled={signupStep === 'sending'} onclick={startGoogle}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.2z" /><path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" /><path d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14z" /><path d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.4 3-4.1 5.6-4.1z" /></svg>
                {t.account.google[lang]}
              </button>
              <input
                class="inp acc-email"
                type="email"
                autocomplete="email"
                placeholder={t.account.emailPlaceholder[lang]}
                bind:value={signupEmail}
                disabled={signupStep === 'sending'}
              />
              <button type="button" class="btn ghost" disabled={signupStep === 'sending'} onclick={requestLink}>
                {signupStep === 'sending' ? t.account.sending[lang] : t.account.sendLink[lang]}
              </button>
              {#if signupError}<p class="err">{signupError}</p>{/if}
              <p class="hint">{t.account.emailNote[lang]}</p>
            {/if}
          {/if}
        </div>
      {/if}
      {#if tab === 'personal'}
        <div class="card head-card">
          <Avatar
            uid={data.uid}
            name={formatValue('name', data.values.name)}
            has={data.values.avatar === true}
            size={54}
          />
          <span><b>{formatValue('name', data.values.name)}</b><small>{t.inSpaceSince[lang]} {sinceMonth(data.root.time.created)}</small></span>
        </div>
        {#if editing}
          <div class="card">
            <h3>{t.personalInfo[lang]}</h3>
            <div class="grid2">
              {#each NAME_FIELD_KEYS as key (key)}
                <label class="field"><span>{t.fields[key][lang]}</span><input class="inp" bind:value={f[key]} maxlength="100" /></label>
              {/each}
            </div>
            <label class="field"><span>{t.fields.aboutRu[lang]}</span><textarea class="ta" bind:value={f.aboutRu} maxlength="5000"></textarea></label>
            <label class="field"><span>{t.fields.aboutEn[lang]}</span><textarea class="ta" bind:value={f.aboutEn} maxlength="5000"></textarea></label>
            <div class="grid3">
              {#each BORN_FIELD_KEYS as key (key)}
                <label class="field"><span>{t.fields[key][lang]}</span><input class="inp" bind:value={f[key]} inputmode="numeric" /></label>
              {/each}
            </div>
            <label class="field"><span>{t.props.gender[lang]}</span>
              <select class="inp" bind:value={f.gender}>
                <option value="">{t.notSpecified[lang]}</option>
                <option value="m">{t.genders.m[lang]}</option>
                <option value="w">{t.genders.w[lang]}</option>
                <option value="nb">{t.genders.nb[lang]}</option>
              </select>
            </label>
            {#if editError}<p class="err">{editError}</p>{/if}
            <div class="duo">
              <button type="button" class="btn ghost" onclick={() => (editing = false)}>{t.cancel[lang]}</button>
              <button type="button" class="btn" disabled={saving} onclick={saveEdit}>{t.save[lang]}</button>
            </div>
          </div>
        {:else}
          <div class="card">
            <h3>{t.personalInfo[lang]}</h3>
            {#each PROPERTIES as property (property)}
              {@const chip = audienceChip(data.root.visibility[property])}
              <div class="prop">
                <span class="k">{t.props[property][lang]}</span>
                <span class="v">{formatValue(property, data.values[property])}</span>
                <button type="button" class="aud {chip.kind}" onclick={() => openAudience(property)}>{chip.icon} {chip.label}</button>
              </div>
              {#if audFor === property}
                <div class="aud-panel">
                  {#if guest}
                    <!-- Гость невидим (В3): правила отвергнут публикацию — честно говорим об этом -->
                    <p class="hint" style="margin-top:0">◌ {t.guest.audienceLocked[lang]}</p>
                  {:else}
                    <p class="hint" style="margin-top:0">{t.whoSees[lang]}</p>
                    <label class="chk"><input type="checkbox" bind:checked={audEveryone} /> 🌐 {t.everyone[lang]}</label>
                    {#if !audEveryone}
                      <label class="chk"><input type="checkbox" bind:checked={audFriends} /> 👥 {t.friends[lang]}</label>
                      {#each [...data.groups] as [groupId, group] (groupId)}
                        <label class="chk"><input type="checkbox" bind:checked={audGroups[groupId]} /> ◎ {group.name}</label>
                      {/each}
                      <p class="hint">{t.nobodyHint[lang]}</p>
                    {/if}
                    {#if editError}<p class="err">{editError}</p>{/if}
                    <button type="button" class="btn" disabled={saving} onclick={saveAudience}>{t.applyAudience[lang]}</button>
                  {/if}
                </div>
              {/if}
            {/each}
            <p class="hint">{t.defaultHidden[lang]}</p>
            <button type="button" class="btn ghost" onclick={startEdit}>{t.edit[lang]}</button>
          </div>
          <div class="card">
            <h3>{t.myNdimId[lang]}</h3>
            <div class="mrow">
              <span class="k2">{t.ratedDims[lang]}</span>
              <span class="mval big">{ratedCount}</span>
            </div>
            <button type="button" class="btn ghost" onclick={() => (tab = 'dims')}>{t.toDims[lang]}</button>
          </div>
        {/if}
      {:else if tab === 'dims'}
        <input class="search" type="search" placeholder={t.searchDims[lang].replace('{n}', String(data.dims.length))} bind:value={search} />
        <div class="seg" role="group">
          <button type="button" class:on={dimFilter === 'mine'} onclick={() => (dimFilter = 'mine')}>{t.filters.mine[lang]} · {ratedCount}</button>
          <button type="button" class:on={dimFilter === 'unrated'} onclick={() => (dimFilter = 'unrated')}>{t.filters.unrated[lang]}</button>
          <button type="button" class:on={dimFilter === 'all'} onclick={() => (dimFilter = 'all')}>{t.filters.all[lang]} · {data.dims.length}</button>
        </div>
        <div class="card dims-card">
          {#each dimsFiltered as dim (dim.id)}
            {@const myRating = data.ratings.get(dim.id)}
            {#if expandedDim === dim.id}
              <div class="dim-open">
                <button type="button" class="dhead" onclick={() => (expandedDim = null)}>
                  <b>{loc(dim.title)}</b><span class="dots3">⋮</span>
                </button>
                <div class="avg"><b>{dim.rating}</b><span class="star">★</span><small>{dim.rates} {t.votes[lang]}</small></div>
                {#if loc(dim.description)}<p class="desc">{loc(dim.description)}</p>{/if}
                <div class="strow" role="group" aria-label={t.yourRating[lang]}>
                  {#each STARS as value (value)}
                    <button
                      type="button"
                      class="st"
                      class:pick={myRating === value}
                      disabled={savingDim === dim.id}
                      onclick={() => rate(dim.id, value)}
                    ><b>{value}</b>★</button>
                  {/each}
                </div>
                <p class="strow-cap">
                  {t.yourRating[lang]}: {myRating ?? '—'} ·
                  <button type="button" class="linkish" onclick={() => (expandedDim = null)}>{t.collapse[lang]}</button>
                </p>
              </div>
            {:else}
              <button type="button" class="dim-row" onclick={() => (expandedDim = dim.id)}>
                <span class="n">{loc(dim.title)}</span>
                {#if myRating !== undefined}
                  <span class="scale"><i style="width:{myRating * 10}%"></i></span>
                  <span class="val">{myRating}</span>
                {:else}
                  <span class="scale"></span>
                  <span class="val">—</span>
                {/if}
              </button>
            {/if}
          {/each}
        </div>
        {#if suggestState === 'sent'}
          <div class="card">
            <p class="hint ok" style="margin-top:0">{t.suggestSent[lang]}</p>
            <button type="button" class="btn ghost" onclick={() => { suggestState = 'idle'; suggestOpen = true; }}>{t.suggestMore[lang]}</button>
          </div>
        {:else if suggestOpen}
          <div class="card">
            <h3>{t.suggestTitle[lang]}</h3>
            <textarea class="ta" bind:value={suggestText} placeholder={t.suggestHint[lang]} maxlength="300"></textarea>
            <p class="hint">{suggestText.trim().length} / 300</p>
            {#if editError}<p class="err">{editError}</p>{/if}
            <div class="duo">
              <button type="button" class="btn ghost" onclick={() => (suggestOpen = false)}>{t.cancel[lang]}</button>
              <button
                type="button"
                class="btn"
                disabled={suggestState === 'sending' || suggestText.trim().length < 5}
                onclick={sendSuggestion}
              >{t.suggestSend[lang]}</button>
            </div>
          </div>
        {:else}
          <button type="button" class="btn ghost" onclick={() => (suggestOpen = true)}>{t.suggestDim[lang]}</button>
        {/if}
        <p class="hint">{t.barsHint[lang]}</p>
      {:else}
        <div class="seg" role="group">
          {#each previewOptions as option (option.key)}
            <button type="button" class:on={previewKey === option.key} onclick={() => (previewKey = option.key)}>{option.label}</button>
          {/each}
        </div>
        <div class="card">
          <h3>{t.seenBy[lang]}</h3>
          {#each PROPERTIES as property (property)}
            {@const chip = audienceChip(data.root.visibility[property])}
            {@const visible = previewKey === 'me' || property in previewValues}
            <div class="prop" class:ghosted={!visible}>
              <span class="k">{t.props[property][lang]}</span>
              <span class="v">
                {visible ? formatValue(property, (previewValues as Record<string, unknown>)[property] ?? data.values[property]) : `— ${t.hidden[lang]} (${chip.label})`}
              </span>
              <span class="aud {chip.kind}">{chip.icon}{chip.icon ? ' ' : ''}{chip.label}</span>
            </div>
          {/each}
        </div>
        <div class="card">
          <h3>{t.tabs.dims[lang]}</h3>
          <p class="hint">{t.dimsPrivate[lang]}</p>
        </div>
      {/if}
    {/if}
  </main>

  <BottomNav active="profile" {lang} />
</div>

<style>
  /* Токены — из корневого лейаута (:root / [data-theme='dark']); здесь только раскладка. */
  .screen {
    max-width: 430px;
    margin: 0 auto;
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }


  .tabs { display: flex; background: var(--panel); border-bottom: 1px solid var(--edge); }
  .tabs button {
    flex: 1; font: inherit; font-size: 13.5px; padding: 11px 0; cursor: pointer;
    color: var(--dim); background: transparent; border: 0;
  }
  .tabs button.on { color: var(--primary); font-weight: 650; box-shadow: inset 0 -2px 0 var(--primary); }

  .body { flex: 1; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
  .state { font-size: 14px; color: var(--dim); text-align: center; padding: 18px 6px; }
  .mono { font-family: var(--mono); font-size: 11px; word-break: break-word; }

  .card {
    background: var(--panel); border: 1px solid var(--edge); border-radius: 14px; padding: 14px;
    box-shadow: var(--card-shadow);
  }
  .card h3 {
    font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase;
    color: var(--dim); margin-bottom: 10px; font-weight: 600;
  }
  .hint { font-size: 11.5px; color: var(--dim); line-height: 1.45; margin-top: 8px; }

  .head-card { display: flex; align-items: center; gap: 12px; }
  /* кружок с лицом теперь живёт в Avatar.svelte — один на все экраны */
  .head-card b { font-size: 17px; color: var(--heading); display: block; }
  .head-card small { font-size: 12px; color: var(--dim); }

  .prop { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--edge-soft); }
  .prop:last-of-type { border-bottom: 0; }
  .prop .k { font-size: 12px; color: var(--dim); width: 96px; flex: none; }
  .prop .v { font-size: 14px; color: var(--heading); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .aud {
    flex: none; font-size: 11px; padding: 4px 9px; border-radius: 999px;
    background: var(--edge-soft); color: var(--primary); white-space: nowrap;
    border: 0; font-family: inherit; cursor: pointer;
  }
  .aud.lock { color: var(--dim); }
  .aud.circ { color: var(--accent); }
  span.aud { cursor: default; }
  .ghosted { opacity: 0.38; }

  /* редактор аудитории и формы */
  .aud-panel {
    margin: 4px 0 8px; padding: 10px 12px; border-radius: 10px;
    background: var(--edge-soft); display: flex; flex-direction: column; gap: 7px;
  }
  .chk { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--heading); cursor: pointer; }
  .chk input { accent-color: var(--primary); width: 15px; height: 15px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin: 8px 0; }
  .field { display: flex; flex-direction: column; gap: 3px; margin-top: 6px; }
  .field span { font-size: 10.5px; color: var(--dim); }
  .inp, .ta {
    font: inherit; font-size: 13.5px; color: var(--text); width: 100%;
    padding: 8px 10px; border: 1px solid var(--edge); border-radius: 9px; background: var(--panel);
  }
  .ta { min-height: 64px; resize: vertical; }
  .err { font-size: 12px; color: #c0392b; margin-top: 8px; }
  .duo { display: flex; gap: 10px; }
  .duo .btn { flex: 1; }
  .hint.ok { color: #1c9e4f; font-size: 12.5px; }

  .mrow { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
  .mrow .k2 { font-size: 12px; color: var(--dim); flex: none; }
  .mval { flex: none; font-size: 13.5px; font-weight: 700; color: var(--primary); }
  .mval.big { font-size: 19px; margin-left: auto; }

  .btn {
    display: block; width: 100%; text-align: center; padding: 12px; margin-top: 10px;
    border-radius: 12px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
    background: var(--primary); color: var(--primary-ink); border: 0; text-decoration: none;
  }
  .btn.ghost { background: transparent; border: 1px solid var(--ghost-brd); color: var(--ghost-ink); }
  .btn:disabled { opacity: 0.55; cursor: default; }

  .search {
    font: inherit; font-size: 13.5px; color: var(--text);
    padding: 10px 12px; border: 1px solid var(--edge); border-radius: 10px; background: var(--panel);
  }
  .search::placeholder { color: var(--faint); }

  .seg { display: flex; gap: 6px; flex-wrap: wrap; }
  .seg button {
    font: inherit; font-size: 12px; padding: 6px 11px; cursor: pointer;
    border-radius: 999px; border: 1px solid var(--edge); color: var(--dim); background: var(--panel);
  }
  .seg button.on { background: var(--primary); border-color: transparent; color: var(--primary-ink); font-weight: 600; }

  /* лента измерений */
  .dim-row {
    display: flex; align-items: center; gap: 10px; width: 100%;
    padding: 10px 0; border: 0; border-bottom: 1px solid var(--edge-soft);
    background: transparent; font: inherit; cursor: pointer; text-align: left;
  }
  .dim-row:last-child { border-bottom: 0; }
  .dim-row .n { font-size: 14px; color: var(--heading); flex: 1; }
  .scale { flex: none; width: 130px; height: 6px; border-radius: 3px; background: var(--edge-soft); position: relative; }
  .scale i { position: absolute; inset: 0 auto 0 0; border-radius: 3px; background: linear-gradient(90deg, var(--primary), var(--accent)); }
  .val { flex: none; width: 26px; text-align: right; font-size: 13.5px; font-weight: 700; color: var(--primary); }

  .dim-open { padding: 10px 0 12px; border-bottom: 1px solid var(--edge-soft); }
  .dim-open:last-child { border-bottom: 0; }
  .dhead {
    display: flex; align-items: baseline; gap: 7px; width: 100%;
    background: transparent; border: 0; font: inherit; cursor: pointer; text-align: left; padding: 0;
  }
  .dhead b { font-size: 15.5px; color: var(--heading); flex: 1; }
  .dhead .dots3 { flex: none; color: var(--dim); font-size: 16px; letter-spacing: 1px; }
  .avg { display: flex; align-items: center; gap: 7px; margin-top: 7px; }
  .avg b { font-size: 19px; color: #1c9e4f; }
  .avg .star { color: #f0b429; font-size: 16px; }
  .avg small { font-size: 12px; color: var(--dim); }
  .desc { font-size: 12.5px; line-height: 1.5; color: var(--text); margin-top: 8px; }

  .strow { display: flex; justify-content: space-between; margin-top: 12px; }
  .st {
    position: relative; font-size: 25px; line-height: 1; color: var(--faint); opacity: 0.65;
    background: transparent; border: 0; padding: 0; cursor: pointer; font-family: inherit;
  }
  .st:hover { opacity: 0.9; }
  .st b {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 700; color: var(--panel); padding-top: 3px;
  }
  .st.pick { color: var(--primary); opacity: 1; }
  .st:disabled { cursor: wait; }
  .strow-cap { font-size: 11px; color: var(--dim); text-align: center; margin-top: 6px; }
  .linkish {
    font: inherit; font-size: 11px; color: var(--primary); background: transparent; border: 0;
    cursor: pointer; padding: 0;
  }

  /* ── Гостевой режим (утверждённый макет V1 «Тихий бейдж», plans/03 этап 2) ──
     Метафора: гость = пунктирный контур (не сохранён, невидим), аккаунт = сплошной.
     Аватар — силуэт человека, как дефолтные аватарки соцсетей (правка владельца). */
  .guest-card { border-style: dashed; border-color: var(--accent); text-align: center; }
  .guest-card h2 { font-size: 18px; color: var(--heading); margin: 10px 0 8px; }
  .guest-ava {
    width: 56px; height: 56px; border-radius: 50%; margin: 4px auto 0;
    border: 2px dashed var(--accent); background: var(--edge-soft);
    display: grid; place-items: center; overflow: hidden;
  }
  .guest-ava :global(svg) { width: 72%; height: 72%; margin-top: 22%; fill: var(--accent); opacity: 0.7; }
  .guest-facts { list-style: none; margin: 0 0 4px; padding: 0; text-align: left; }
  .guest-facts li { font-size: 13.5px; line-height: 1.5; color: var(--text); padding: 3px 0; }
  .guest-cta { display: flex; gap: 12px; align-items: center; justify-content: center; margin-top: 10px; }
  .guest-later {
    font: inherit; font-size: 13px; color: var(--dim); background: transparent; border: 0;
    cursor: pointer; text-decoration: underline dotted; padding: 0;
  }
  /* ── Аккаунт без пароля (макет V4 «Врезка»): карточка гостя разворачивается ── */
  /* Аккаунт создан — контур становится сплошным (та же метафора, но молча: на лице
     приложения о ней не говорят, см. правила текста в design/login-mockups.html). */
  .guest-card.saved { border-style: solid; border-color: var(--primary); }
  .guest-ava.solid { border-style: solid; border-color: var(--primary); }
  .guest-ava.solid :global(svg) { fill: var(--primary); opacity: 1; }
  .saved-badge {
    display: inline-block; margin: 10px auto 0; padding: 4px 12px; border-radius: 999px;
    font-size: 12.5px; font-weight: 650;
    color: #0ea578; background: color-mix(in srgb, #0ea578 12%, transparent);
  }
  .acc-lead { font-size: 13.5px; line-height: 1.55; color: var(--text); margin: 6px 0 12px; }
  .acc-email { margin-top: 8px; }
  .guest-card .btn { width: 100%; }
  .guest-card .acc-email + .btn { margin-top: 8px; }
  /* Кнопка Google: знак провайдера белым на фирменной кнопке продукта */
  .btn.google { display: flex; align-items: center; justify-content: center; gap: 9px; }
  .btn.google :global(svg) { width: 18px; height: 18px; flex: none; fill: currentColor; }
  .guest-card .err { margin-top: 8px; }

  /* ── Десктоп: макет V2 «Рабочий стол» (утверждён владельцем 2026-07-11) ──
     Блок стоит В КОНЦЕ файла намеренно: он переопределяет базовые (мобильные)
     правила .tabs и .body, а при равной специфичности выигрывает последний.
     Экран становится сеткой: слева рельс во всю высоту (SideRail сам занимает
     первую колонку через grid-row: 1 / -1), справа шапка, вкладки и контент.
     Узкой колонны 430px на широком экране больше нет — лента идёт в две колонки. */
  @media (min-width: 1024px) {
    .screen {
      max-width: none;
      display: grid;
      grid-template-columns: 232px minmax(0, 1fr);
      grid-template-rows: auto auto 1fr;
    }

    .tabs { justify-content: flex-start; gap: 4px; padding: 0 26px; }
    .tabs button { flex: 0 0 auto; padding: 12px 18px; }

    .body {
      width: 100%;
      max-width: 1280px;
      margin: 0 auto;
      padding: 20px 26px 34px;
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
      align-items: start;
      /* .body — строка 1fr в сетке экрана, поэтому она выше содержимого.
         Без align-content лишняя высота растеклась бы по зазорам между строками. */
      align-content: start;
      gap: 14px;
    }
    /* Во всю ширину — то, что не делится на колонки: шапка профиля, гостевая
       карточка, поиск, сегменты, состояния стенда и подписи. */
    .body > .head-card,
    .body > .guest-card,
    .body > .search,
    .body > .seg,
    .body > .state,
    .body > .hint,
    .body > .btn {
      grid-column: 1 / -1;
    }
    /* Лента измерений — длинный список: карточка во всю ширину, а строки внутри
       неё в две колонки. Раскрытое измерение забирает обе (в нём звёзды и описание). */
    .dims-card {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: 26px;
      align-content: start;
    }
    .dims-card .dim-open { grid-column: 1 / -1; }
  }
</style>

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
  import { fade, slide } from 'svelte/transition';
  import AppBar from '$lib/ui/AppBar.svelte';
  import Avatar from '$lib/ui/Avatar.svelte';
  import BottomNav from '$lib/ui/BottomNav.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons';
  import Loading from '$lib/ui/Loading.svelte';
  import SideRail from '$lib/ui/SideRail.svelte';
  import { technicalDetail } from '$lib/ui/errors';
  import { dateTime, monthYearSince, num as decimal, starsUnit } from '$lib/ui/format';
  import { preloadAvatars } from '$lib/data/avatar';
  // Жест «потянуть вниз» (интервью №006, В1=А — все четыре главных экрана).
  import PullToRefresh from '$lib/ui/PullToRefresh.svelte';
  import { noteFirstLoad } from '$lib/data/refresh.svelte';
  import { loadRelationsSummary, type RelationsSummary } from '$lib/data/relations';
  import { dimsScaleStep, needsDimsInstruction, relationBands } from '$lib/model/ndimid';
  import { roundedSpaceDiameter } from '$lib/similarity/similarity';
  import { RELATIONS_TOP_LIMIT } from '$lib/model/schema';
  import { MOTION } from '$lib/ui/motion';
  import {
    currentSession,
    ensureSpaceExists,
    isGuestSession,
    loadProfileScreen,
    previewAs,
    peekProfileScreen,
    saveProfile,
    signInGuest,
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
  // Вкладки «Личное/Видимость» упразднены (слово владельца 2026-07-27): предпросмотр
  // аудиторий — не таба, а ОКНО за кнопкой «Как меня видят»; «Назад» возвращает в профиль.

  let lang = $state<Lang>('ru');
  let seeMeOpen = $state(false);

  // Пока окно предпросмотра открыто — страница под ним не прокручивается (как лайтбокс).
  $effect(() => {
    if (!seeMeOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  });

  // Состояние стенда — честное: подключаемся / готово / стенда нет / публичный хост.
  // На публичном домене экраны 2.0 ещё не открыты (данные 2.0 появятся с миграцией) —
  // показываем честную заглушку со ссылкой на живое приложение, а не дев-сообщение.
  /*
   * ТЁПЛЫЙ ПЕРВЫЙ КАДР (`ideas/18`). Если экран уже открывали в этой сессии, его данные лежат
   * в памяти приложения — берём их СИНХРОННО, до всякого `onMount`, и рисуем сразу готовым.
   * Карточки «Загрузка» человек при возврате не видит вовсе; `onMount` ниже всё равно
   * отработает и тихо освежит данные, если они устарели (stale-while-revalidate,
   * `researches/17`). Пусто — значит заход первый, и лоадер честен.
   */
  const warm = peekProfileScreen();
  let stand = $state<'connecting' | 'ready' | 'down' | 'signedout'>(warm ? 'ready' : 'connecting');
  let standError = $state('');
  let data = $state<ProfileScreenData | null>(warm ?? null);

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


  /**
   * Перечитать «Дом». Отдельной функцией: её зовут `onMount` при заходе и жест «потянуть
   * вниз» по требованию человека (интервью №006).
   *
   * ⚠️ Порядок внутри — НЕ косметика: экран объявляется готовым ДО чтения сводки связей.
   * «Дом» не должен ждать её, чтобы показаться, и не должен падать, если её ещё нет (сервер
   * синхронизации мог не досчитать).
   */
  async function loadScreen(uid: string): Promise<void> {
    const loaded = await loadProfileScreen(uid);
    // Карточка ждёт фото (канон 1.x, bugs/57): своё лицо качается ПОД лоадером экрана,
    // и «Дом» появляется сразу с ним. В 1.x ровно так: аватар грузился до отрисовщика
    // (app.js:4864), лоадер закрывался после. Потолок ожидания — в preloadAvatars.
    if (loaded.values.avatar === true) await preloadAvatars([loaded.uid]);
    data = loaded;
    stand = 'ready';
    noteFirstLoad();
    try {
      relations = await loadRelationsSummary(uid);
    } catch {
      relations = null;
    }
    relationsAsked = true;
  }

  /** Обновление по жесту: кэш гасит `refreshNow`, здесь — только перечитывание экрана. */
  async function refreshScreen(): Promise<void> {
    const uid = await currentSession();
    if (uid !== null) await loadScreen(uid);
  }

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
      await loadScreen(uid);
    } catch (error) {
      standError = technicalDetail(error);
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
      guest = false; // сессия больше не гостевая: пилюля гостя и запреты уходят
      if (result.created) {
        // Аккаунт родился только что (апгрейд гостя или первый вход новичка) —
        // единственный случай, когда поздравление уместно.
        signupStep = 'done';
        void track('account_created'); // четвёртый шаг воронки — путь пройден
      } else {
        // Обычный вход существующего человека (331 из 1.x входят именно так):
        // поздравлять его с «регистрацией» не с чем — сразу его профиль (bugs/08.2).
        // Воронку тоже не трогаем: вход — не создание аккаунта.
        guestCard = false;
        signupStep = 'facts';
      }
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
      // Апгрейд гостя всегда created: true, но считаем по флагу — воронка не имеет
      // права засчитать «создан аккаунт» за то, что им не было (bugs/08.2).
      if (result.created) void track('account_created');
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
      dims: { ru: 'Измерения', en: 'Dimensions' },
    },
    seeMe: { ru: 'Как меня видят', en: 'How others see me' },
    backBtn: { ru: 'Назад', en: 'Back' },
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
        // Firebase сообщает «окно закрыто» и когда человек передумал, и когда Google ОТКАЗАЛ
        // (2026-07-12: у проекта был удалён OAuth-клиент — Google не пускал никого, а мы писали
        // «Вход отменён», то есть валили вину на человека и врали ему о причине). Различить эти
        // два случая мы не можем: наружу приходит один и тот же код. Значит текст обязан быть
        // правдив в ОБОИХ случаях — и вести к работающей двери.
        cancelled: {
          ru: 'Вход через Google не завершён. Попробуйте ещё раз или войдите по ссылке на почту.',
          en: 'Google sign-in did not complete. Try again, or sign in with an email link.',
        },
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

    // Вводная подсказка «Дома» 1.x (index.html:818) — адаптирована: убрано обещание
    // «управлять учётной записью» (экран появится с bugs/45), остальное дословно.
    homeIntro: {
      ru: 'Это Ваша домашняя страница. Здесь Вы видите статистику Вашего NDim ID и редактируете персональную информацию о Вас. Персональная информация необязательна для заполнения. Можете заполнять только те поля, которые Вы хотите показать другим людям в Пространстве NDim.',
      en: 'This is your home page. Here you can see your NDim ID statistics and edit personal information about you. Personal information is optional. You can fill in the fields that you want to show to other people in NDim Space.',
    },

    // ── Статистика «Дома» 1.x (bugs/43) ──
    // Тексты и эмоциональная шкала — ДОСЛОВНО из ndim_old/public/scripts/app.js:5660-5935.
    // Это не украшение: человек видит, живёт ли его пространство, ещё до перехода на «Связи».
    dimsAmount: { ru: 'Количество измерений', en: 'Number of dimensions' },
    dimsScale: {
      veryLittle: { ru: '(очень мало 😭)', en: '(very little 😭)' },
      little: { ru: '(мало ☹️)', en: '(little ☹️)' },
      medium: { ru: '(средне 😐)', en: '(medium 😐)' },
      aLot: { ru: '(много 🙂)', en: '(a lot 🙂)' },
      veryMuch: { ru: '(очень много 😎)', en: '(very much 😎)' },
      great: { ru: '(Отлично! 🥰)', en: '(Great! 🥰)' },
      wow: { ru: '(Ого! 🤩)', en: '(Wow! 🤩)' },
    },
    // Инструкция всплывает на нижней ступени шкалы — как в 1.x (showDimsInstruction).
    dimsInstruction: {
      ru: 'Измерений пока слишком мало, чтобы найти похожих на Вас людей. Откройте «Измерения» и поставьте звёзды тому, что про Вас, — чем больше измерений, тем точнее связи.',
      en: 'You have too few dimensions for people similar to you to be found. Open “Dimensions” and give stars to what describes you — the more dimensions, the more precise the relations.',
    },
    myDiameter: { ru: 'Диаметр моего пространства', en: 'My space diameter' },
    updatedAt: { ru: 'Обновлен', en: 'Updated' },
    syncedAt: { ru: 'Синхронизирован', en: 'Synchronized' },
    myRelations: { ru: 'Мои связи', en: 'My relations' },
    relationsAmount: { ru: 'Количество установленных связей', en: 'Number of established relations' },
    relationsMax: { ru: '(максимум)', en: '(maximum)' },
    relationsTop90: { ru: 'Количество связей в Топ-90%', en: 'Number of relations in Top-90%' },
    relationsTop75: { ru: 'Количество связей в 75%…89%', en: 'Number of relations in 75%…89%' },
    relationsTop50: { ru: 'Количество связей в 50%…74%', en: 'Number of relations in 50%…74%' },
    relationsSynced: { ru: 'Синхронизированы', en: 'Synchronized' },
    // Связей ещё не считали — говорим это словами. Ноль в такой строке означал бы
    // «людей для Вас не нашлось», а это неправда (EXP-0033: у витрины нет права на «что-нибудь»).
    relationsNever: {
      ru: 'Связи ещё не рассчитывались. Сервер синхронизации посчитает их после Ваших первых оценок.',
      en: 'Relations have not been computed yet. The sync server will compute them after your first ratings.',
    },
    toRelations: { ru: 'К связям →', en: 'To relations →' },
    searchDims: { ru: 'Найти среди {n} измерений…', en: 'Search {n} dimensions…' },
    filters: {
      mine: { ru: 'Мои', en: 'Mine' },
      unrated: { ru: 'Не оценено', en: 'Unrated' },
      all: { ru: 'Все', en: 'All' },
    },
    // Пустой список ОБЯЗАН объяснить себя. На боевом проде новичок открывал «Измерения» и видел
    // белое ничто: фильтр по умолчанию — «Мои», а своих оценок у него ноль (2026-07-12).
    // Пустота, которая молчит, — это не минимализм, это брошенный человек.
    dimsEmpty: {
      mine: {
        ru: 'Вы ещё не оценили ни одного измерения. Откройте «Не оценено» — и поставьте первые звёзды.',
        en: 'You have not rated any dimension yet. Open “Unrated” and give your first stars.',
      },
      search: {
        ru: 'Ничего не нашлось. Попробуйте другое слово.',
        en: 'Nothing found. Try another word.',
      },
      none: { ru: 'Здесь пока пусто.', en: 'Nothing here yet.' },
    },
    votes: { ru: 'голосов', en: 'votes' },
    yourRating: { ru: 'Ваша оценка', en: 'Your rating' },
    collapse: { ru: 'Свернуть ▴', en: 'Collapse ▴' },
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

  // Смену языка и её persist делает шапка (bugs/39) — экран лишь принимает новое значение.

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

  /** Подпись аудитории свойства для чипа: Все / Друзья / Круг «…» / Никому.
   *  Иконка отдаётся ИМЕНЕМ, а не символом (bugs/17): раньше здесь были эмодзи
   *  🌐 👥 ◎ 🔒 — цветные системным шрифтом и глухие к теме. У перечисления групп
   *  иконки нет вовсе: значков там могло оказаться сколько угодно подряд. */
  function audienceChip(audience: Audience | undefined): { icon: IconName | null; label: string; kind: string } {
    if (audience === EVERYONE) return { icon: 'globe', label: t.everyone[lang], kind: 'open' };
    if (!audience || audience.length === 0) return { icon: 'lock', label: t.nobody[lang], kind: 'lock' };
    const parts = audience.map((groupId) => {
      if (groupId === FRIENDS) return t.friends[lang];
      const group = data?.groups.get(groupId);
      return group ? `${t.circle[lang]} «${group.name}»` : groupId;
    });
    return { icon: null, label: parts.join(' · '), kind: audience.includes(FRIENDS) ? 'open' : 'circ' };
  }

  /** Сколько измерений человек оценил. Единственное, что профилю нужно знать про каталог. */
  const ratedCount = $derived(data ? data.ratings.size : 0);

  /**
   * Статистика «Дома» 1.x (bugs/43): виджеты «Мой NDim ID» и «Мои связи».
   *
   * Сводка связей — ОДНО чтение (`loadRelationsSummary`). Её отсутствие не ломает экран:
   * человек без единой оценки связей не имеет, и это нормальное состояние, а не ошибка.
   */
  let relations = $state<RelationsSummary | null>(null);
  let relationsAsked = $state(false);

  const bands = $derived(relations === null ? null : relationBands(relations.similarities));
  /** Диаметр своего пространства — диагональ куба из моих измерений (та же формула, что в ядре). */
  const myDiameter = $derived(roundedSpaceDiameter(ratedCount));

  // ── Вкладка «Видимость»: варианты предпросмотра ──
  const previewOptions = $derived.by(() => {
    const options: { key: string; label: string; icon: IconName | null }[] = [
      { key: 'me', label: t.me[lang], icon: 'person' },
      { key: 'everyone', label: t.everyone[lang], icon: 'globe' },
      { key: 'friends', label: t.friends[lang], icon: 'relations' },
    ];
    if (data) {
      for (const [groupId, group] of data.groups) options.push({ key: `group:${groupId}`, label: group.name, icon: 'relations' });
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

  // Заявка на новое измерение уехала на свой экран — /dims: там её место, рядом с каталогом.
</script>

<svelte:head>
  <title>NDim Space — {t.title[lang]}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<svelte:window
  onkeydown={(event) => {
    if (seeMeOpen && event.key === 'Escape') seeMeOpen = false;
  }}
/>

<div class="screen">
  <SideRail active="profile" {lang} />

  <AppBar
    {lang}
    onLang={(next) => (lang = next)}
    badge={guest ? t.guest.pill[lang] : undefined}
    onBadge={() => (guestCard = !guestCard)}
  />
  <PullToRefresh onRefresh={refreshScreen} />


  <main class="body">
    {#if stand === 'connecting'}
      <!-- Каноничная карточка загрузки 1.x вместо голого текста (bugs/21) -->
      <div class="state"><Loading {lang} /></div>
    {:else if stand === 'signedout'}
      <!-- Человек не вошёл. Три двери, и ни одной с паролем: Google · ссылка на почту ·
           гостем. Люди из 1.x входят той же почтой — их UID, оценки и связи на месте. -->
      <div class="card signin">
        <h2>{t.signedOut.title[lang]}</h2>
        <p class="state">{t.signedOut.lede[lang]}</p>

        {#if signupStep === 'choose' || signupStep === 'sending' || signupStep === 'sent'}
          <!-- Форма почты — та же, что у гостя (макет V4 «Врезка»). -->
          {#if signupStep === 'sent'}
            <p class="sent"><Icon name="envelope" size={15} /> {t.account.sentTitle[lang]}</p>
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
        {#if standError}<p class="hint mono">{standError}</p>{/if}
      </div>
    {:else if data}
      {#if guestCard && (guest || signupStep === 'done')}
        <!-- Карточка гостя (утверждённый V1 «Тихий бейдж») разворачивается в вход
             прямо на месте — утверждённый макет V4 «Врезка». Ничего не перекрывается
             и никуда не уводит: человек остаётся в своём профиле. -->
        <div class="card guest-card" class:saved={signupStep === 'done'} transition:slide={{ duration: MOTION.base }}>
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
        <!-- Вводная подсказка экрана — канон «Дома» 1.x (bugs/43). Про управление
             учётной записью не обещаем: этого экрана в 2.0 пока нет (bugs/45), а текст,
             описывающий несуществующий интерфейс, — враньё о продукте (EXP-0036). -->
        <p class="intro">{t.homeIntro[lang]}</p>
        <div class="card head-card" in:fade={{ duration: MOTION.base }}>
          <Avatar
            uid={data.uid}
            name={formatValue('name', data.values.name)}
            has={data.values.avatar === true}
            size={54}
          />
          <span><b>{formatValue('name', data.values.name)}</b><small>{t.inSpaceSince[lang]} {sinceMonth(data.root.time.created)}</small></span>
        </div>
        {#if editing}
          <div class="card" in:fade={{ duration: MOTION.base }}>
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
          <div class="card" in:fade={{ duration: MOTION.base }}>
            <h3>{t.personalInfo[lang]}</h3>
            {#each PROPERTIES as property (property)}
              {@const chip = audienceChip(data.root.visibility[property])}
              <div class="prop">
                <span class="k">{t.props[property][lang]}</span>
                <span class="v">{formatValue(property, data.values[property])}</span>
                <button type="button" class="aud {chip.kind}" onclick={() => openAudience(property)}>
                  {#if chip.icon}<Icon name={chip.icon} size={13} />{/if} {chip.label}
                </button>
              </div>
              {#if audFor === property}
                <div class="aud-panel" transition:slide={{ duration: MOTION.base }}>
                  {#if guest}
                    <!-- Гость невидим (В3): правила отвергнут публикацию — честно говорим об этом -->
                    <p class="hint" style="margin-top:0">◌ {t.guest.audienceLocked[lang]}</p>
                  {:else}
                    <p class="hint" style="margin-top:0">{t.whoSees[lang]}</p>
                    <label class="chk"><input type="checkbox" bind:checked={audEveryone} /> <Icon name="globe" size={14} /> {t.everyone[lang]}</label>
                    {#if !audEveryone}
                      <label class="chk"><input type="checkbox" bind:checked={audFriends} /> <Icon name="relations" size={14} /> {t.friends[lang]}</label>
                      {#each [...data.groups] as [groupId, group] (groupId)}
                        <label class="chk"><input type="checkbox" bind:checked={audGroups[groupId]} /> <Icon name="relations" size={14} /> {group.name}</label>
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
            <div class="duo">
              <button type="button" class="btn ghost" onclick={startEdit}>{t.edit[lang]}</button>
              <!-- Предпросмотр аудиторий — окно за кнопкой, не таба (слово владельца). -->
              <button type="button" class="btn ghost" onclick={() => (seeMeOpen = true)}>{t.seeMe[lang]}</button>
            </div>
          </div>
          <!-- Виджет «Мой NDim ID» — канон «Дома» 1.x (кадр app-01, bugs/43): человек видит,
               ЖИВЁТ ли его пространство, не уходя с профиля. Все четыре строки 1.x на месте;
               эмоциональная шкала — чистая функция (model/ndimid.ts), проверенная на границах. -->
          <div class="card" in:fade={{ duration: MOTION.base }}>
            <h3>{t.myNdimId[lang]}</h3>
            <div class="mrow">
              <span class="k2">{t.dimsAmount[lang]}</span>
              <!-- Число и эмоциональный комментарий — ОДНОЙ строкой, как в 1.x
                   («485 (Ого! 🤩)», app.js:5699). -->
              <span class="mval big">{decimal(ratedCount, lang)}
                <small class="scale">{t.dimsScale[dimsScaleStep(ratedCount)][lang]}</small></span>
            </div>
            <div class="mrow">
              <span class="k2">{t.myDiameter[lang]}</span>
              <span class="mval big">{decimal(myDiameter, lang)} {starsUnit(myDiameter, lang)}</span>
            </div>
            <div class="mrow">
              <span class="k2">{t.updatedAt[lang]}</span>
              <span class="mval small">{dateTime(data.root.time.updated, lang)}</span>
            </div>
            {#if relations !== null && relations.lastSync !== null}
              <div class="mrow">
                <span class="k2">{t.syncedAt[lang]}</span>
                <span class="mval small">{dateTime(relations.lastSync, lang)}</span>
              </div>
            {/if}
            {#if needsDimsInstruction(ratedCount)}
              <!-- Нижняя ступень шкалы: в 1.x здесь всплывала инструкция. Человеку без
                   измерений некого искать — и это единственное, что ему сейчас важно. -->
              <p class="hint instruction" transition:slide={{ duration: MOTION.base }}>{t.dimsInstruction[lang]}</p>
            {/if}
            <!-- «Измерения» теперь ОТДЕЛЬНЫЙ раздел (требование владельца 2026-07-12),
                 а не суб-вкладка профиля. Отсюда — прямая дверь туда. -->
            <a class="btn ghost" href="/dims">{t.toDims[lang]}</a>
          </div>

          <!-- Виджет «Мои связи» — вторая половина статистики «Дома» 1.x. Полосы похожести
               считаются по уже загруженной сводке (одно чтение), а не по 250 карточкам. -->
          <div class="card" in:fade={{ duration: MOTION.base }}>
            <h3>{t.myRelations[lang]}</h3>
            {#if bands === null}
              {#if relationsAsked}
                <p class="hint">{t.relationsNever[lang]}</p>
              {/if}
            {:else}
              <div class="mrow">
                <span class="k2">{t.relationsAmount[lang]}</span>
                <span class="mval big">
                  {decimal(bands.total, lang)}{bands.total >= RELATIONS_TOP_LIMIT ? ` ${t.relationsMax[lang]}` : ''}
                </span>
              </div>
              <div class="mrow">
                <span class="k2">{t.relationsTop90[lang]}</span>
                <span class="mval">{decimal(bands.top90, lang)}</span>
              </div>
              <div class="mrow">
                <span class="k2">{t.relationsTop75[lang]}</span>
                <span class="mval">{decimal(bands.band75, lang)}</span>
              </div>
              <div class="mrow">
                <span class="k2">{t.relationsTop50[lang]}</span>
                <span class="mval">{decimal(bands.band50, lang)}</span>
              </div>
              {#if relations?.lastSync != null}
                <div class="mrow">
                  <span class="k2">{t.relationsSynced[lang]}</span>
                  <span class="mval small">{dateTime(relations.lastSync, lang)}</span>
                </div>
              {/if}
            {/if}
            <a class="btn ghost" href="/relations">{t.toRelations[lang]}</a>
          </div>
        {/if}
    {/if}
  </main>

  <!-- Окно «Как меня видят» (слово владельца 2026-07-27: не таба, а кнопка → окно
       предпросмотра; «Назад» возвращает в профиль). Контент — прежний предпросмотр по
       аудиториям: чипы Я/Все/Друзья и поля глазами выбранной аудитории. -->
  {#if seeMeOpen && data}
    <div class="seeme" transition:fade={{ duration: MOTION.base }}>
      <div class="seeme-head">
        <button type="button" class="back-btn" onclick={() => (seeMeOpen = false)}>
          <Icon name="back" size={13} />{t.backBtn[lang]}
        </button>
        <h2>{t.seeMe[lang]}</h2>
      </div>
      <div class="seeme-body">
        <div class="seg" role="group">
          {#each previewOptions as option (option.key)}
            <button type="button" class:on={previewKey === option.key} onclick={() => (previewKey = option.key)}>
              {#if option.icon}<Icon name={option.icon} size={13} />{/if} {option.label}
            </button>
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
              <!-- Иконка рисуется КОМПОНЕНТОМ. Здесь стояло `{chip.icon}` — и на экран
                   печаталось само имя иконки: «globe Все» (поймано владельцем в бою). -->
              <span class="aud {chip.kind}">
                {#if chip.icon}<Icon name={chip.icon} size={13} />{/if}{chip.label}
              </span>
            </div>
          {/each}
        </div>
        <div class="card">
          <h3>{t.tabs.dims[lang]}</h3>
          <p class="hint">{t.dimsPrivate[lang]}</p>
        </div>
      </div>
    </div>
  {/if}

  <BottomNav active="profile" {lang} />
</div>

<style>
  /* Токены — из корневого лейаута (:root / [data-theme='dark']); здесь только раскладка. */
  /* Мобильная оболочка (bugs/08.3): шапка, табы и нижняя панель — во всю ширину экрана;
     колонной комфортной ширины зажат только КОНТЕНТ (.body). Прежний max-width на .screen
     зажимал и шапку с панелью — на экранах шире 430px они висели с полями по бокам. */
  .screen {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }


  /* ── Окно «Как меня видят»: полноэкранный слой со своим скроллом; шапка прибита. ── */
  .seeme {
    position: fixed; inset: 0; z-index: 70;
    background: var(--bg); overflow-y: auto;
  }
  .seeme-head {
    position: sticky; top: 0; z-index: 1;
    display: flex; align-items: center; gap: 12px;
    padding: 12px 14px; background: var(--panel-solid); border-bottom: 1px solid var(--edge);
  }
  .seeme-head h2 { font-size: 16px; font-weight: 700; color: var(--heading); margin: 0; }
  .back-btn {
    display: inline-flex; align-items: center; gap: 5px;
    font: inherit; font-size: 13px; font-weight: 600; color: var(--primary);
    background: none; border: 0; padding: 4px 6px; cursor: pointer;
  }
  .seeme-body { max-width: 458px; margin: 0 auto; padding: 14px; }
  .seeme-body .card { margin-top: 12px; }

  .body {
    flex: 1; padding: 14px; display: flex; flex-direction: column; gap: 12px;
    width: 100%; max-width: 458px; margin: 0 auto; /* 430px контента + поля */
  }
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
  /* «Мы отправили Вам письмо» — конверт и текст в одну линию (тот же класс дефекта). */
  .sent { display: flex; align-items: center; gap: 7px; }

  .aud {
    /* Иконка + подпись выравниваются ФЛЕКСОМ, а не базовой линией текста: у <svg>
       с `vertical-align: middle` середина равняется на середину строчной буквы, и
       рядом с заглавными кириллицы иконка заметно проваливается вниз (слово
       владельца 2026-07-27: «выравнивание иконки и текста ужасное»). */
    display: inline-flex; align-items: center; gap: 5px;
    flex: none; font-size: 11px; padding: 4px 9px; border-radius: 999px;
    background: var(--edge-soft); color: var(--primary); white-space: nowrap;
    border: 0; font-family: inherit; cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }
  @media (hover: hover) {
    button.aud:hover { background: color-mix(in srgb, var(--primary) 14%, var(--edge-soft)); }
  }
  .aud.lock { color: var(--dim); }
  .aud.circ { color: var(--accent); }
  span.aud { cursor: default; }
  .ghosted { opacity: 0.38; }
  .prop { transition: opacity 0.2s ease; }

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
    transition: border-color 0.15s ease;
  }
  .inp:focus, .ta:focus { outline: none; border-color: var(--primary); }
  .ta { min-height: 64px; resize: vertical; }
  .err { font-size: 12px; color: #c0392b; margin-top: 8px; }
  .duo { display: flex; gap: 10px; }
  .duo .btn { flex: 1; }
  .hint.ok { color: #1c9e4f; font-size: 12.5px; }

  .mrow { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
  .mrow .k2 { font-size: 12px; color: var(--dim); flex: none; }
  .mval { flex: none; font-size: 13.5px; font-weight: 700; color: var(--primary); }
  .mval.big { font-size: 19px; margin-left: auto; }
  /* Даты — не метрики: они не должны кричать цветом акцента рядом с числами (канон 1.x). */
  .mval.small { margin-left: auto; font-size: 12px; font-weight: 600; color: var(--heading); text-align: right; }
  .mrow .mval:not(.big):not(.small) { margin-left: auto; }
  /* Вводная подсказка экрана — та же серая плашка, что на «Связях» и «Измерениях» (канон 1.x). */
  .intro {
    font-size: 12px; line-height: 1.55; color: var(--dim); margin: 0;
    padding: 10px 12px; border-radius: 10px; background: var(--edge-soft);
  }
  /* Эмоциональный комментарий шкалы 1.x — реплика продукта рядом с числом, а не второе число. */
  .scale { font-size: 12.5px; font-weight: 500; color: var(--dim); white-space: nowrap; }
  .instruction {
    margin-top: 8px; padding: 9px 11px; border-radius: 10px;
    background: var(--edge-soft); color: var(--text);
  }

  .btn {
    display: block; width: 100%; text-align: center; padding: 12px; margin-top: 10px;
    border-radius: 12px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
    background: var(--primary); color: var(--primary-ink); border: 0; text-decoration: none;
    transition: filter 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }
  @media (hover: hover) {
    .btn:hover:not(:disabled) { filter: brightness(1.08); }
  }
  .btn.ghost { background: transparent; border: 1px solid var(--ghost-brd); color: var(--ghost-ink); }
  @media (hover: hover) {
    .btn.ghost:hover:not(:disabled) { filter: none; border-color: var(--primary); color: var(--primary); }
  }
  .btn:disabled { opacity: 0.55; cursor: default; }

  .search {
    font: inherit; font-size: 13.5px; color: var(--text);
    padding: 10px 12px; border: 1px solid var(--edge); border-radius: 10px; background: var(--panel);
  }
  .search::placeholder { color: var(--faint); }

  .seg { display: flex; gap: 6px; flex-wrap: wrap; }
  .seg button {
    /* См. комментарий у `.aud`: иконка и подпись центрируются флексом, а не базовой линией. */
    display: inline-flex; align-items: center; gap: 6px;
    font: inherit; font-size: 12px; padding: 6px 11px; cursor: pointer;
    border-radius: 999px; border: 1px solid var(--edge); color: var(--dim); background: var(--panel);
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }
  .seg button.on { background: var(--primary); border-color: transparent; color: var(--primary-ink); font-weight: 600; }

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
     правила .body, а при равной специфичности выигрывает последний.
     Экран становится сеткой: слева рельс во всю высоту (SideRail сам занимает
     первую колонку через grid-row: 1 / -1), справа шапка и контент.
     Узкой колонны 430px на широком экране больше нет — лента идёт в две колонки. */
  @media (min-width: 1024px) {
    .screen {
      max-width: none;
      display: grid;
      grid-template-columns: 232px minmax(0, 1fr);
      grid-template-rows: auto 1fr;
    }

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
    .body > .intro,
    .body > .state {
      grid-column: 1 / -1;
    }
  }
</style>

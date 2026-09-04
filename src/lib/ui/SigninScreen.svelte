<script lang="ts">
  /*
   * ЭКРАН ВХОДА — СВОЙ ЭКРАН, А НЕ КАРТОЧКА ВНУТРИ ПРИЛОЖЕНИЯ (`bugs/19`, `plans/80`).
   *
   * ПОВОД — слово владельца (волна 09), дословно: «Войдите в Пространство — должно быть отдельным
   * экраном в рамках ОБ-флоу, а не показываться внутри приложения; должно быть в стиле лендинга,
   * с возможностью переключать язык и тему глобально для всего приложения». До этого экран был
   * карточкой в оболочке `/profile`: с табами, боковым рельсом и нижней панелью приложения, в
   * которое человек ЕЩЁ НЕ ВОШЁЛ, и без переключателя темы вовсе.
   *
   * ВИД — макет **V1 «Колонна»** (`design/signin-screen-mockups.html`), выбранный владельцем
   * 2026-09-04 из четырёх: «*берём в1*». Две его правки тем же словом:
   *   · «*кнопку гостя делаем яркой синей, как ещё одна основная*» — гостевая дверь того же
   *     синего, что и Google; отличается ТОЛЬКО местом под разделителем, не весом;
   *   · «*слово "или" заметнее*» — разделитель перестал быть техническим швом.
   * Текст гостевой двери — тоже его, тем же вечером: «*в кнопку входа анонимом добавь "гостем
   * без регистрации"*».
   *
   * FORK: options <новый адрес /signin | полноэкранный рендер вместо оболочки на /profile> ·
   * price of error <переезд адреса ломает возврат после входа и пять живых ссылок> ·
   * consulted <замер дерева: ВСЕ ПЯТЬ экранов со стеной входа (`account`, `dims`, `profile`,
   * `relations`, `space`) уже ведут «войти» на `/profile` — он и есть единая дверь продукта;
   * плюс `plans/80`, риск 2>
   * Выбран второй: человек получает отдельный экран без оболочки, а ни одна существующая ссылка
   * не ломается и возврат после входа не переписывается. Свой адрес остаётся возможным шагом
   * потом — он ничего не отменяет, а этот выбор его не блокирует.
   *
   * ⚠️ EN-ПОЛОВИНЫ — РАБОЧИЙ ПЕРЕВОД АГЕНТА ДО ВЫЧИТКИ ВЛАДЕЛЬЦЕМ. Макет V1 написан по-русски,
   * английских строк в нём нет; правило проекта — помечать такое явно (тот же приём в
   * `GuestCard.svelte`). Русские строки — утверждённые (интервью №073 В1 = А) плюс его правки.
   */
  import Brand from './Brand.svelte';
  import Icon from './Icon.svelte';
  import { theme, toggleTheme } from './theme.svelte';
  import { setLang, type Lang } from './lang.svelte';

  let {
    lang,
    step,
    email = $bindable(''),
    error,
    onGoogle,
    onEmailDoor,
    onGuest,
    onSendLink,
  }: {
    lang: Lang;
    /** Шаг двери почты: `doors` — три двери; дальше форма и её состояния. */
    step: 'doors' | 'choose' | 'sending' | 'sent';
    email?: string;
    error?: string;
    onGoogle: () => void;
    onEmailDoor: () => void;
    onGuest: () => void;
    onSendLink: () => void;
  } = $props();

  const t = {
    eyebrow: { ru: 'Пространство NDim Space', en: 'NDim Space' },
    title: { ru: 'Войдите в Пространство NDim Space', en: 'Sign in to NDim Space' },
    lede: {
      ru: 'Оцените фильмы, книги, музыку и всё, что Вы любите, и Пространство NDim Space найдёт Вам людей, которые думают так же, как и Вы.',
      en: 'Rate the films, books, music and everything else you love, and NDim Space will find you people who think the way you do.',
    },
    google: { ru: 'Войти через Google', en: 'Continue with Google' },
    emailDoor: { ru: 'Войти по ссылке на почту', en: 'Sign in with an email link' },
    or: { ru: 'или', en: 'or' },
    guest: {
      ru: 'Смотреть Пространство NDim Space гостем без регистрации',
      en: 'Explore NDim Space as a guest, no sign-up',
    },
    emailPlaceholder: { ru: 'Ваш адрес электронной почты', en: 'Your email address' },
    send: { ru: 'Получить ссылку для входа', en: 'Get a sign-in link' },
    sending: { ru: 'Отправляем…', en: 'Sending…' },
    sentTitle: { ru: 'Письмо отправлено', en: 'The email is on its way' },
    sentNote: {
      ru: 'Откройте письмо на этом устройстве и нажмите ссылку — она откроет Вам вход в Пространство NDim Space.',
      en: 'Open the email on this device and tap the link — it opens your way into NDim Space.',
    },
    themeToDark: { ru: 'Тёмная', en: 'Dark' },
    themeToLight: { ru: 'Светлая', en: 'Light' },
  } as const;
</script>

<!--
  Фон-поле: та же сеть узлов, что на лендинге и в макете. Декоративен целиком, поэтому
  `aria-hidden` и `pointer-events: none` — он не должен попадаться ни скринридеру, ни курсору.
-->
<div class="signin-screen">
  <div class="field" aria-hidden="true">
    <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
      <g class="drift">
        <g class="links">
          <line x1="120" y1="180" x2="320" y2="120" /><line x1="320" y1="120" x2="470" y2="260" />
          <line x1="1180" y1="140" x2="1330" y2="240" /><line x1="1040" y1="90" x2="1180" y2="140" />
          <line x1="180" y1="640" x2="360" y2="740" /><line x1="1240" y1="660" x2="1100" y2="780" />
          <line x1="90" y1="420" x2="230" y2="470" /><line x1="1350" y1="430" x2="1230" y2="500" />
          <line x1="700" y1="60" x2="850" y2="110" /><line x1="620" y1="820" x2="780" y2="850" />
        </g>
        <g class="nodes">
          <circle cx="120" cy="180" r="3.5" /><circle cx="320" cy="120" r="5" />
          <circle cx="470" cy="260" r="3" /><circle cx="1180" cy="140" r="4.5" />
          <circle cx="1330" cy="240" r="3" /><circle cx="1040" cy="90" r="2.5" />
          <circle cx="180" cy="640" r="4" /><circle cx="360" cy="740" r="3" />
          <circle cx="1240" cy="660" r="4.5" /><circle cx="1100" cy="780" r="3" />
          <circle cx="90" cy="420" r="3" /><circle cx="230" cy="470" r="4" />
          <circle cx="1350" cy="430" r="3.5" /><circle cx="1230" cy="500" r="2.5" />
          <circle cx="700" cy="60" r="3" /><circle cx="850" cy="110" r="3.5" />
          <circle cx="620" cy="820" r="3.5" /><circle cx="780" cy="850" r="2.5" />
        </g>
      </g>
    </svg>
  </div>
  <div class="vig" aria-hidden="true"></div>

  <!-- ПЕРЕКЛЮЧАТЕЛИ ЯЗЫКА И ТЕМЫ — вторая половина `bugs/19`: у карточки внутри приложения
       переключателя темы не было ВОВСЕ, а язык переключался локальной шапкой. Здесь оба
       глобальные: `setLang` и общий источник темы (`bugs/53`). -->
  <div class="ctl">
    <div class="lang" role="group" aria-label="Язык / Language">
      <button type="button" class:on={lang === 'ru'} onclick={() => setLang('ru')}>RU</button>
      <button type="button" class:on={lang === 'en'} onclick={() => setLang('en')}>EN</button>
    </div>
    <button
      type="button"
      class="th"
      onclick={toggleTheme}
      aria-label={theme() === 'dark' ? t.themeToLight[lang] : t.themeToDark[lang]}
    >
      <Icon name={theme() === 'dark' ? 'sun' : 'moon'} size={15} />
      <span>{theme() === 'dark' ? t.themeToLight[lang] : t.themeToDark[lang]}</span>
    </button>
  </div>

  <main class="col">
    <div class="inner">
      <span class="mark"><Brand size={46} /></span>
      <p class="eyebrow">{t.eyebrow[lang]}</p>
      <h1>{t.title[lang]}</h1>
      <p class="lede">{t.lede[lang]}</p>

      <div class="doors">
        {#if step === 'doors'}
          <button type="button" class="d primary" onclick={onGoogle}>
            <svg class="gi" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            {t.google[lang]}
          </button>
          <button type="button" class="d ghost" onclick={onEmailDoor}>
            <Icon name="envelope" size={18} />
            {t.emailDoor[lang]}
          </button>

          <!-- «ИЛИ» — объявление развилки, а не шов. Слово владельца: «слово "или" заметнее». -->
          <div class="sep">{t.or[lang]}</div>

          <!-- ГОСТЕВАЯ ДВЕРЬ — ВТОРАЯ ОСНОВНАЯ. Тот же класс `primary`, что и Google: по его
               слову вес одинаковый, разная только роль. Раньше это была `linkish` — ссылка
               третьим планом. -->
          <!-- `data-door="guest"` — УСТОЙЧИВЫЙ КРЮЧОК ДЛЯ ПРИБОРОВ, а не стиль. Смоук двери
               выката раньше искал эту кнопку ПО ТЕКСТУ («Осмотреться гостем») и упал в тот же
               час, когда владелец текст переименовал: выкат в стейдж покраснел не на дефекте
               продукта, а на копирайте. Текст остаётся под стражем побайтово
               (`tools/verify-signin-screen.mjs`, К4), а нажимают кнопку по крючку. -->
          <button type="button" class="d primary guest" data-door="guest" onclick={onGuest}>{t.guest[lang]}</button>
        {:else if step === 'sent'}
          <p class="sent"><Icon name="envelope" size={16} /> {t.sentTitle[lang]}</p>
          <p class="note">{t.sentNote[lang]}</p>
        {:else}
          <input
            class="inp"
            type="email"
            inputmode="email"
            autocomplete="email"
            placeholder={t.emailPlaceholder[lang]}
            bind:value={email}
            disabled={step === 'sending'}
          />
          <button type="button" class="d primary" disabled={step === 'sending'} onclick={onSendLink}>
            {step === 'sending' ? t.sending[lang] : t.send[lang]}
          </button>
        {/if}
      </div>

      {#if error}<p class="err">{error}</p>{/if}
    </div>
  </main>
</div>

<style>
  /* Экран занимает окно целиком и НЕ несёт ни одной части оболочки приложения: ни рельса,
     ни нижней панели, ни табов. Это и есть предмет `bugs/19`. */
  .signin-screen {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    overflow: auto;
    background: var(--bg);
    color: var(--text);
    padding: 24px 18px calc(24px + env(safe-area-inset-bottom));
  }

  .field {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.85;
  }
  .field svg { width: 100%; height: 100%; display: block; }
  .field .links line { stroke: var(--link-stroke); stroke-width: 1; opacity: 0.55; }
  .field .nodes circle { fill: var(--node-fill); opacity: 0.75; }

  /* Тихий дрейф сети — та же жизнь, что на лендинге. Планка проекта: анимации обязательны
     везде (боль владельца 2026-07-12). Уважает системную просьбу о покое. */
  .drift { animation: drift 46s ease-in-out infinite alternate; transform-origin: 50% 50%; }
  @keyframes drift {
    from { transform: translate3d(0, 0, 0) scale(1); }
    to { transform: translate3d(-14px, 10px, 0) scale(1.035); }
  }
  @media (prefers-reduced-motion: reduce) {
    .drift { animation: none; }
  }

  .vig {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(120% 90% at 50% 40%, transparent 40%, var(--bg) 100%);
  }

  .ctl {
    position: absolute;
    top: max(14px, env(safe-area-inset-top));
    right: 16px;
    display: flex;
    gap: 8px;
    align-items: center;
    z-index: 2;
  }
  .lang { display: flex; border: 1px solid var(--edge); border-radius: 999px; overflow: hidden; }
  .lang button {
    font: inherit;
    font-size: 13px;
    padding: 6px 12px;
    background: transparent;
    color: var(--dim);
    border: 0;
    cursor: pointer;
  }
  .lang button.on { background: var(--primary); color: var(--primary-ink); }
  .th {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font: inherit;
    font-size: 13px;
    padding: 6px 12px;
    background: transparent;
    color: var(--dim);
    border: 1px solid var(--edge);
    border-radius: 999px;
    cursor: pointer;
  }
  .lang button:hover, .th:hover { color: var(--text); }

  .col { position: relative; z-index: 1; width: 100%; display: grid; place-items: center; }
  .inner { width: min(420px, 100%); text-align: center; display: grid; gap: 10px; justify-items: center; }
  .mark { display: block; margin-bottom: 2px; }

  .eyebrow {
    margin: 0;
    font-size: 12px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--accent);
  }
  h1 { margin: 2px 0 0; font-size: clamp(1.5rem, 5vw, 2rem); line-height: 1.18; }
  .lede { margin: 4px 0 10px; color: var(--dim); font-size: 15px; line-height: 1.5; }

  .doors { display: grid; gap: 10px; width: 100%; }

  .d {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    min-height: 52px;
    padding: 13px 18px;
    font: inherit;
    font-size: 15px;
    font-weight: 600;
    border-radius: 14px;
    border: 1px solid transparent;
    cursor: pointer;
    text-align: center;
  }
  .d.primary { background: var(--primary); color: var(--primary-ink); }
  .d.ghost { background: transparent; border-color: var(--ghost-brd); color: var(--ghost-ink); }
  .d:hover:not(:disabled) { filter: brightness(1.06); }
  .d.ghost:hover:not(:disabled) { background: var(--ghost-bg-hover); }
  .d:disabled { opacity: 0.6; cursor: default; }
  .gi { width: 18px; height: 18px; flex: none; }

  /* Разделитель — по слову владельца заметный: кегль, вес, разрядка и заглавные вместо
     волосяной серой линии с мелким текстом. */
  .sep {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 2px 0;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text);
    opacity: 0.92;
  }
  .sep::before, .sep::after {
    content: '';
    height: 2px;
    flex: 1;
    border-radius: 2px;
    background: var(--edge);
    opacity: 0.9;
  }

  .inp {
    width: 100%;
    min-height: 52px;
    padding: 13px 16px;
    font: inherit;
    font-size: 15px;
    color: var(--text);
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 14px;
  }
  .inp:focus { outline: 2px solid var(--accent); outline-offset: 1px; }

  .sent { margin: 0; display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: 600; }
  .note { margin: 0; color: var(--dim); font-size: 14px; line-height: 1.5; }
  .err { margin: 2px 0 0; color: #c0392b; font-size: 14px; }
</style>

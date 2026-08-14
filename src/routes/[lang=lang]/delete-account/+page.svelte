<script lang="ts">
  /*
   * Публичная страница «Удалить аккаунт» — фаза 8 эпика `plans/15`, шаг Г (ответ владельца В6=А).
   *
   * ═══ ЭТО ДВЕРЬ, А НЕ ИНСТРУКЦИЯ ═══
   *
   * Поправка владельца 2026-08-01: «Почему "Как" удалить аккаунт? Зачем КАК?» — и он прав.
   * Требование Google Play звучит как «a way to **request** that their data be deleted **without
   * sending the user back to the app**»: нужно МЕСТО, ГДЕ УДАЛЯЮТ, а не текст о том, как найти
   * кнопку. Инструкцию ищет тот, кому кнопку не дали.
   *
   * Отсюда всё устройство страницы: человек приходит сюда ИЗВНЕ — возможно, приложение он уже
   * удалил и где искать настройки не помнит. Поэтому никаких «перейдите в Профиль → Управление
   * аккаунтом»: вошедшему сразу шаг подтверждения, не вошедшему — вход прямо здесь, и тем же
   * движением дальше.
   *
   * ⚠️ `noindex` НЕ СТАВИТСЯ, и это единственный приватный по смыслу экран без него: страницу
   * обязано быть можно НАЙТИ (в том числе поиском) — в этом весь смысл требования к веб-ссылке.
   *
   * ⚠️ Само удаление живёт в общем компоненте `DeleteAccount`, а не копией здесь: две редакции
   * разрушающего потока разойдутся молча (`src/lib/ui/DeleteAccount.svelte`).
   */
  import { onMount, tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import DeleteAccount from '$lib/ui/DeleteAccount.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import {
    accountErrorText,
    completeLoginLink,
    completeReauthLink,
    continueWithGoogle,
    currentAccount,
    forgetPendingOp,
    isLoginLink,
    isReauthLink,
    pendingOp,
    sendLoginLink,
    waitForSession,
    type AccountFacts,
    type AccountFailure,
  } from '$lib/data/account';
  import { currentSession, signOutUser } from '$lib/data/profile';
  import { page } from '$app/state';
  import { SITE_ORIGIN } from '$lib/site';
  import { technicalDetail } from '$lib/ui/errors';
  import { MOTION } from '$lib/ui/motion';
  import type { Lang } from '$lib/ui/format';
  import { LANGS, X_DEFAULT, isLang } from '$lib/content/langs';

  // 🔴 Язык — ИЗ АДРЕСА (`plans/39` шаг 2): `/en/delete-account` обязан запечься английским
  // уже на пререндере, а модуль состояния там без адреса отвечает «ru» всем. Память за
  // адресом ведёт мост в `[lang=lang]/+layout.svelte`.
  const lang = $derived(isLang(page.params.lang) ? page.params.lang : 'ru');

  // Возврат из письма — на ЭТУ ЖЕ языковую версию страницы: человек начал удаление
  // по-английски — по-английски и закончит. Старый голый `/delete-account` отвечает 301.
  const RETURN_PATH = $derived(`/${lang}/delete-account`);
  let stand = $state<'connecting' | 'ready' | 'guest' | 'signedout' | 'down'>('connecting');
  let standError = $state('');
  let facts = $state<AccountFacts | null>(null);
  let myUid = $state<string | null>(null);
  let deleter = $state<DeleteAccount | undefined>();

  // Вход прямо здесь: почтой или Google.
  let email = $state('');
  let signStep = $state<'idle' | 'sending' | 'sent'>('idle');
  let signError = $state('');

  /*
   * Два словаря отказов встречаются здесь впервые: вход по ссылке отвечает `UpgradeFailure`
   * (словарь входа, живёт на «Профиле»), а вся эта страница говорит словами `AccountFailure`
   * (словарь операций над аккаунтом, тексты дословно из 1.x). Приведение типа было бы враньём
   * компилятору, поэтому сопоставление явное — и каждая строка объяснена.
   */
  function asAccountFailure(reason: 'already-in-use' | 'cancelled' | 'expired-link' | 'unknown'): AccountFailure {
    switch (reason) {
      // Сюда попасть не должны: гостевую сессию отпускаем ДО разбора ссылки, а без неё вход
      // идёт `signInWithEmailLink`, который про «занято» не знает. Оставлено ради полноты:
      // молчаливый `unknown` вместо внятного текста — худший вид «на всякий случай».
      case 'already-in-use':
        return 'email-in-use';
      case 'cancelled':
        return 'cancelled';
      // Разные слова об одном: ссылка отслужила. Текст 1.x — «срок действия истёк или она уже
      // использована. Запросите новую» — здесь ровно то, что нужно человеку.
      case 'expired-link':
        return 'expired-code';
      default:
        return 'unknown';
    }
  }

  async function byEmail(): Promise<void> {
    signError = '';
    if (email.trim() === '') return;
    signStep = 'sending';
    // Намерение `signin`: человек идёт в СВОЙ аккаунт, а не сохраняет труд гостя (bugs/84).
    const sent = await sendLoginLink(email.trim(), 'signin', RETURN_PATH);
    if (!sent.ok) {
      signError = accountErrorText('unknown', lang);
      signStep = 'idle';
      return;
    }
    signStep = 'sent';
  }

  async function byGoogle(): Promise<void> {
    signError = '';
    const result = await continueWithGoogle();
    if (!result.ok) {
      signError = accountErrorText(result.reason === 'cancelled' ? 'cancelled' : 'unknown', lang);
      return;
    }
    location.reload(); // сессия появилась — перечитываем состояние честно, с нуля
  }

  onMount(async () => {
    try {
      /*
       * 🔴 ВХОД ПО ССЫЛКЕ РАЗБИРАЕТСЯ ЗДЕСЬ — И ОБЯЗАН БЫТЬ ПЕРВЫМ.
       *
       * Дефект, который это чинит (найден состязательной проверкой 01.08.2026, в бою прожил
       * один день): страница отправляла письмо через `sendLoginLink(..., RETURN_PATH)` и
       * обещала человеку «перейдите по ссылке — и вернётесь сюда, чтобы завершить удаление»,
       * но возврат не разбирал НИКТО. `completeLoginLink` во всём продукте звался только с
       * «Профиля». Человек возвращался по ссылке, `currentSession()` отдавал `null` (Firebase
       * сам по ссылке не входит — вход делает только `signInWithEmailLink` внутри
       * `completeLoginLink`), выполнение уходило в `return` четырьмя строками ниже — и он
       * снова видел ту же форму почты. Цикл замыкался: удалить аккаунт со страницы, созданной
       * ровно для этого, было НЕЛЬЗЯ.
       *
       * ⚠️ Почему это не поймал ни один страж: на стенде дефекта НЕТ. Стендовая ветка
       * `currentSession()` входит сама (`signInDev`), поэтому после возврата по ссылке сессия
       * там есть всегда и страница открывает шаг удаления. Проверка «прошёл по ссылке — попал
       * куда обещано» зелёная на стенде при любом состоянии этого кода (`EXP-0113`).
       *
       * Бьёт дефект по тем, у кого почта — единственный способ входа, то есть по 331 человеку
       * из 1.x: паролей в 2.0 нет, а Google-путь на этой странице работал.
       */
      /*
       * ⚠️ `&& !isReauthLink()` — НЕ перестраховка, а различитель двух писем.
       *
       * Оба письма этой страницы — один и тот же вид ссылки Firebase, и `isLoginLink()` это
       * просто `isSignInWithEmailLink(href)`: он матчит ЛЮБОЕ из них. Различает их только
       * ключ `ndim-reauth-email`, то есть `isReauthLink()` — случай более узкий.
       *
       * Без этой оговорки блок съедал ВТОРОЕ письмо (подтверждение личности) и обрабатывал
       * его как вход: человек возвращался, видел пустую форму подтверждения заново и удалить
       * аккаунт не мог. Поймано живым прогоном стража, а не рассуждением — первая редакция
       * правки выглядела безупречно и была неверна.
       */
      if (isLoginLink() && !isReauthLink()) {
        /*
         * Намерение здесь всегда `signin` (см. `byEmail`), поэтому живую гостевую сессию надо
         * отпустить ДО разбора: иначе `completeLoginLink` уйдёт в ветку `linkWithCredential`
         * и вернёт «почта уже связана с другим профилем» — реплей замка `bugs/84` на новой
         * странице. Тот же порядок, что на «Профиле».
         */
        const before = await waitForSession();
        if (before?.isAnonymous === true) await signOutUser();

        const entered = await completeLoginLink();
        history.replaceState(null, '', RETURN_PATH);
        if (!entered.ok) signError = accountErrorText(asAccountFailure(entered.reason), lang);
      }

      const uid = await currentSession();
      myUid = uid;
      if (uid === null) {
        stand = 'signedout';
        return;
      }
      const snapshot = currentAccount();
      if (snapshot === null) {
        stand = 'signedout';
        return;
      }
      facts = snapshot;
      stand = snapshot.guest ? 'guest' : 'ready';

      // Возврат из письма ПОДТВЕРЖДЕНИЯ личности — тот же круг, что на «Управлять аккаунтом».
      if (isReauthLink()) {
        const waiting = pendingOp();
        const confirmed = await completeReauthLink();
        if (!confirmed.ok) {
          forgetPendingOp();
          standError = accountErrorText(confirmed.reason, lang);
        } else if (waiting?.op === 'delete-account') {
          // Та же защита, что на /account: компонент рисуется условно, и без ожидания
          // кадра вызов мог бы молча пропасть (см. комментарий там).
          await tick();
          await deleter?.resume();
        }
        history.replaceState(null, '', RETURN_PATH);
      } else if (stand === 'ready') {
        // Человек пришёл сюда ЗА ЭТИМ — не заставляем его нажимать ещё одну кнопку.
        await tick();
        deleter?.openNow();
      }
    } catch (error) {
      standError = technicalDetail(error);
      stand = 'down';
    }
  });

  const t = {
    title: { ru: 'Удалить аккаунт', en: 'Delete account' },
    lede: {
      ru: 'Здесь Вы можете удалить свою учётную запись в Пространстве NDim и все её данные.',
      en: 'Here you can delete your NDim Space account and all its data.',
    },
    needSignIn: {
      ru: 'Сначала войдите — иначе мы не сможем убедиться, что это Вы.',
      en: 'Please sign in first — otherwise we cannot make sure it is you.',
    },
    google: { ru: 'Войти через Google', en: 'Continue with Google' },
    or: { ru: 'или', en: 'or' },
    emailPlaceholder: { ru: 'Ваша почта', en: 'Your email' },
    sendLink: { ru: 'Получить ссылку для входа', en: 'Send me a sign-in link' },
    sending: { ru: 'Отправляем…', en: 'Sending…' },
    sentTitle: { ru: 'Письмо отправлено', en: 'Letter sent' },
    sentBody: {
      ru: 'Перейдите по ссылке из письма — и вернётесь сюда, чтобы завершить удаление.',
      en: 'Follow the link in the letter — it brings you back here to finish the deletion.',
    },
    guestTitle: { ru: 'У гостя нет учётной записи', en: 'A guest has no account' },
    guestBody: {
      ru: 'Вы смотрите Пространство гостем — удалять нечего. Ваши результаты не сохранены и исчезнут сами, если Вы их не сохраните.',
      en: 'You are exploring as a guest — there is nothing to delete. Your results are not saved and will disappear on their own.',
    },
    toApp: { ru: 'В Пространство', en: 'To NDim Space' },
    standDown: {
      ru: 'Не удалось прочитать данные аккаунта. Обновите страницу.',
      en: 'Could not read your account details. Please reload the page.',
    },
  };
</script>

<svelte:head>
  <title>NDim Space — {t.title[lang]}</title>
  <!--
    ⚠️ noindex здесь НАМЕРЕННО НЕТ. Все прочие приватные экраны закрыты от индексации, а эта
    страница обязана НАХОДИТЬСЯ: требование Google Play — «readily discoverable option to
    initiate account deletion». Скрыв её, мы бы выполнили букву и убили смысл.
  -->
  <meta name="description" content="Удаление учётной записи в Пространстве NDim и всех её данных." />
  <!--
    🔴 CANONICAL ДОБАВЛЕН 2026-08-01. Его здесь не было — и это был живой дубль: страница
    индексируется намеренно (см. выше), а второй хост `ndim-space.web.app` раздаёт её копией.
    Список редиректов в `firebase.json` перечисляет пути ЯВНО, и `/delete-account` в него не
    попал — то есть поисковик видел одну и ту же страницу по двум адресам и не знал, какой
    главный. Найдено разведкой SEO (`researches/26`), подтверждено дважды.
  -->
  <link rel="canonical" href={`${SITE_ORIGIN}/${lang}/delete-account`} />
  <!-- Двусторонний hreflang с самоссылкой + x-default на английский — как на лендинге. -->
  {#each LANGS as l (l)}
    <link rel="alternate" hreflang={l} href={`${SITE_ORIGIN}/${l}/delete-account`} />
  {/each}
  <link rel="alternate" hreflang="x-default" href={`${SITE_ORIGIN}/${X_DEFAULT}/delete-account`} />
</svelte:head>

<main class="port">
  <a class="brand" href="/"><span class="mark">N</span><span class="name">Пространство NDim</span></a>

  <div class="sheet">
    <h1>{t.title[lang]}</h1>
    <p class="lede">{t.lede[lang]}</p>

    {#if stand === 'connecting'}
      <div class="state"><Loading {lang} /></div>
    {:else if stand === 'down'}
      <p class="err">{t.standDown[lang]}</p>
      {#if standError}<p class="hint mono">{standError}</p>{/if}
    {:else if stand === 'guest'}
      <div in:fade={{ duration: MOTION.base }}>
        <h2>{t.guestTitle[lang]}</h2>
        <p class="lede">{t.guestBody[lang]}</p>
        <a class="btn" href="/profile">{t.toApp[lang]}</a>
      </div>
    {:else if stand === 'signedout'}
      <div in:fade={{ duration: MOTION.base }}>
        {#if signStep === 'sent'}
          <h2>{t.sentTitle[lang]}</h2>
          <p class="lede">{t.sentBody[lang]}</p>
        {:else}
          <p class="need">{t.needSignIn[lang]}</p>
          <button type="button" class="btn" onclick={byGoogle}>{t.google[lang]}</button>
          <p class="or">{t.or[lang]}</p>
          <input
            class="inp"
            type="email"
            inputmode="email"
            autocomplete="email"
            placeholder={t.emailPlaceholder[lang]}
            bind:value={email}
            disabled={signStep === 'sending'}
          />
          <button type="button" class="btn ghost" disabled={signStep === 'sending'} onclick={byEmail}>
            {signStep === 'sending' ? t.sending[lang] : t.sendLink[lang]}
          </button>
          {#if signError}<p class="err">{signError}</p>{/if}
        {/if}
      </div>
    {:else if facts !== null}
      {#if standError}<p class="err">{standError}</p>{/if}
      <div in:fade={{ duration: MOTION.base }}>
        <!-- Заголовок у страницы свой, крупнее — компонент свой не рисует. -->
        <!--
          `returnPath` обязателен здесь: письмо подтверждения должно вернуть человека НА ЭТУ
          страницу, а не в приватный экран «Управлять аккаунтом». Именно так звучит и обещание
          над кнопкой, и требование Google Play — не отсылать человека обратно в приложение.
        -->
        <DeleteAccount
          bind:this={deleter}
          {lang}
          email={facts.email}
          uid={myUid}
          heading={false}
          returnPath={RETURN_PATH}
        />
      </div>
      <a class="back" href="/profile"><Icon name="back" size={13} />{t.toApp[lang]}</a>
    {/if}
  </div>
</main>

<style>
  /* Приёмник, а не экран продукта: одна колонка, никакой навигации. Человек пришёл сюда
     снаружи и с одним намерением — водить его по разделам здесь незачем. */
  .port {
    min-height: 100vh; min-height: 100dvh;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 18px; padding: 24px 16px; background: var(--bg);
  }
  .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; }
  .mark {
    width: 30px; height: 30px; border-radius: 9px; background: var(--heading); color: var(--bg);
    display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px;
  }
  .name { font-size: 15px; font-weight: 600; color: var(--heading); }

  .sheet {
    width: 100%; max-width: 460px;
    background: var(--panel); border: 1px solid var(--edge); border-radius: 16px;
    padding: 20px; box-shadow: var(--card-shadow);
  }
  h1 { font-size: 20px; font-weight: 700; color: var(--heading); margin-bottom: 8px; }
  h2 { font-size: 16px; font-weight: 700; color: var(--heading); margin: 4px 0 8px; }
  .lede { font-size: 14px; color: var(--text); line-height: 1.6; margin-bottom: 14px; }
  .need { font-size: 13.5px; color: var(--text); line-height: 1.55; margin-bottom: 4px; }
  .or { font-size: 12px; color: var(--faint); text-align: center; margin: 10px 0 2px; }
  .hint { font-size: 12px; color: var(--faint); line-height: 1.5; margin-top: 8px; }
  .mono { font-family: var(--mono); }
  .err { font-size: 12.5px; color: var(--down); line-height: 1.5; margin-top: 8px; }
  .state { display: flex; justify-content: center; }

  .inp {
    width: 100%; margin-top: 8px; padding: 9px 11px;
    border: 1px solid var(--edge); border-radius: 10px;
    background: var(--bg); color: var(--heading); font: inherit; font-size: 14px;
  }
  .btn {
    display: flex; align-items: center; justify-content: center; width: 100%;
    margin-top: 10px; padding: 10px 16px; border-radius: 12px; border: 1px solid transparent;
    background: var(--primary); color: var(--primary-ink);
    font: inherit; font-size: 14px; font-weight: 600; text-decoration: none; cursor: pointer;
  }
  .btn:disabled { opacity: .6; cursor: default; }
  .btn.ghost { background: transparent; border-color: var(--edge); color: var(--text); font-weight: 500; }

  .back {
    display: inline-flex; align-items: center; gap: 5px; margin-top: 14px;
    font-size: 13px; font-weight: 600; color: var(--primary); text-decoration: none;
  }
</style>

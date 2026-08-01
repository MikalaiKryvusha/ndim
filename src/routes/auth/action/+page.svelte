<script lang="ts">
  /*
   * Страница-обработчик почтовых действий — фаза 5 эпика `plans/15` (план `plans/19`, шаг В).
   *
   * СЮДА ЧЕЛОВЕК ПРИХОДИТ ИЗ ПИСЬМА, и у него ровно одно намерение. Поэтому здесь нет ни
   * навигации, ни виджетов: одна карточка, один исход, одна дверь дальше. Это не «экран
   * продукта», а приёмник — тот же класс, что загрузочный щит (`bugs/40`).
   *
   * ⚠️ ФОРМА НЕ ТРЕБУЕТ ЧЕТЫРЁХ МАКЕТОВ: это не брендовое и не UX-решение, а «самое очевидное»
   * (`AGENT_GUIDE` → Дизайн). Если владелец захочет иначе — переделается за минуты.
   *
   * 🔴 ПОКА НЕ ПОДКЛЮЧЕНА К БОЮ. Action URL проекта всё ещё смотрит на страницу Firebase
   * (`notification.sendEmail.callbackUri` = ndim-space.firebaseapp.com/__/auth/action, замерено
   * 2026-08-01). Переключение — руками владельца; оно действует на письма ВСЕХ флоу разом.
   * До тех пор письма обрабатывает страница Firebase — смена почты работает и так.
   *
   * ✅ Ждать больше нечего: после отмены паролей (`bugs/32`, 2026-08-01) режим сброса стал
   * невозможным, и три реализованных режима покрывают ВСЁ, что может прийти человеку.
   *
   * Режим определяется НЕ по параметру `mode` из адреса, а по самому коду (`checkActionCode`):
   * параметр — это то, что нам прислали, а код — то, что есть на самом деле.
   */
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import Icon from '$lib/ui/Icon.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import {
    accountErrorText,
    applyAction,
    inspectActionCode,
    type ActionInfo,
  } from '$lib/data/account';
  import { MOTION } from '$lib/ui/motion';
  import type { Lang } from '$lib/ui/format';

  let lang = $state<Lang>('ru');
  let stage = $state<'working' | 'done' | 'not-yet' | 'error'>('working');
  let info = $state<ActionInfo | null>(null);
  let error = $state('');

  onMount(async () => {
    const saved = localStorage.getItem('ndim-lang');
    if (saved === 'en' || saved === 'ru') lang = saved;

    const code = new URLSearchParams(location.search).get('oobCode');
    if (code === null || code === '') {
      // Человек попал сюда без ссылки — набрал адрес руками или ссылка обрезалась почтовиком.
      error = t.noCode[lang];
      stage = 'error';
      return;
    }

    // Сначала ЧИТАЕМ, потом применяем: человек должен увидеть, что с ним произойдёт.
    const read = await inspectActionCode(code);
    if (!read.ok) {
      error = accountErrorText(read.reason, lang);
      stage = 'error';
      return;
    }
    info = read.info;

    if (read.info.kind === 'reset-password') {
      /*
       * Такая ссылка прийти НЕ МОЖЕТ: паролей в продукте нет (решение владельца 2026-08-01,
       * `bugs/32` закрыт как отменённый), и письма сброса никто не отправляет. Ветка оставлена
       * не «на будущее», а как честный ответ на невозможное: если код сброса всё же окажется
       * в чьих-то руках — например, ссылка из архива 1.x, — человек не должен упереться в
       * молчание.
       */
      stage = 'not-yet';
      return;
    }
    if (read.info.kind === 'unknown') {
      error = t.unknownKind[lang];
      stage = 'error';
      return;
    }

    const applied = await applyAction(code);
    if (!applied.ok) {
      error = accountErrorText(applied.reason, lang);
      stage = 'error';
      return;
    }
    stage = 'done';
  });

  const t = {
    title: { ru: 'Пространство NDim', en: 'NDim Space' },
    working: { ru: 'Проверяем ссылку…', en: 'Checking the link…' },
    noCode: {
      ru: 'В адресе нет ссылки из письма. Откройте письмо и перейдите по ссылке целиком.',
      en: 'The address has no link from the letter. Open the letter and follow the whole link.',
    },
    unknownKind: {
      ru: 'Эта ссылка нам незнакома. Запросите новую в приложении.',
      en: 'We do not recognise this link. Request a new one in the app.',
    },
    // Смена почты завершена.
    changedTitle: { ru: 'Почта изменена', en: 'Email changed' },
    changedBody: {
      ru: 'Теперь Вы входите с нового адреса. На других устройствах вход придётся выполнить заново.',
      en: 'You now sign in with the new address. On your other devices you will need to sign in again.',
    },
    // Откат смены почты — письмо пришло на СТАРЫЙ адрес.
    revertedTitle: { ru: 'Адрес возвращён', en: 'Address restored' },
    revertedBody: {
      ru: 'Мы вернули прежний адрес входа. Если смену запрашивали не Вы — смените адрес сами, чтобы аккаунт остался только Вашим.',
      en: 'We restored your previous sign-in address. If you did not request the change, change the address yourself so the account stays yours.',
    },
    verifiedTitle: { ru: 'Адрес подтверждён', en: 'Address verified' },
    verifiedBody: {
      ru: 'Спасибо. Подтверждённый адрес — Ваш ключ к аккаунту.',
      en: 'Thank you. A verified address is your key to the account.',
    },
    notYetTitle: { ru: 'В Пространстве NDim нет паролей', en: 'NDim Space has no passwords' },
    notYetBody: {
      ru: 'Вход устроен проще: ссылка на почту или Google. Сбрасывать нечего — просто войдите привычным способом.',
      en: 'Signing in is simpler here: an email link or Google. There is nothing to reset — just sign in as usual.',
    },
    errorTitle: { ru: 'Не получилось', en: 'It did not work' },
    toApp: { ru: 'В Пространство', en: 'Go to NDim Space' },
    from: { ru: 'было', en: 'was' },
    to: { ru: 'стало', en: 'now' },
  };

  const heading = $derived(
    stage === 'not-yet'
      ? t.notYetTitle[lang]
      : stage === 'error'
        ? t.errorTitle[lang]
        : info?.kind === 'recover-email'
          ? t.revertedTitle[lang]
          : info?.kind === 'verify-email'
            ? t.verifiedTitle[lang]
            : t.changedTitle[lang],
  );

  const body = $derived(
    stage === 'not-yet'
      ? t.notYetBody[lang]
      : stage === 'error'
        ? error
        : info?.kind === 'recover-email'
          ? t.revertedBody[lang]
          : info?.kind === 'verify-email'
            ? t.verifiedBody[lang]
            : t.changedBody[lang],
  );
</script>

<svelte:head>
  <title>NDim Space</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="port">
  <div class="brand"><span class="mark">N</span><span class="name">{t.title[lang]}</span></div>

  {#if stage === 'working'}
    <div class="card"><Loading {lang} /><p class="lede center">{t.working[lang]}</p></div>
  {:else}
    <div class="card" in:fade={{ duration: MOTION.base }}>
      <h1>{heading}</h1>
      <p class="lede">{body}</p>

      <!-- Оба адреса называем ПОИМЁННО: на откате это единственный способ понять, что
           именно вернулось. Firebase отдаёт их до применения кода (`checkActionCode`). -->
      {#if stage === 'done' && info !== null && info.previousEmail !== null && info.email !== null}
        <div class="pair">
          <span class="k">{t.from[lang]}</span><span class="v">{info.previousEmail}</span>
          <span class="k">{t.to[lang]}</span><span class="v">{info.email}</span>
        </div>
      {/if}

      <a class="btn" href="/profile"><Icon name="home" size={16} />{t.toApp[lang]}</a>
    </div>
  {/if}
</main>

<style>
  /* Приёмник, а не экран продукта: одна колонка по центру, ничего лишнего. */
  .port {
    min-height: 100vh; min-height: 100dvh;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 18px; padding: 24px 16px; background: var(--bg);
  }
  .brand { display: flex; align-items: center; gap: 10px; }
  .mark {
    width: 30px; height: 30px; border-radius: 9px; background: var(--heading); color: var(--bg);
    display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px;
  }
  .name { font-size: 15px; font-weight: 600; color: var(--heading); }

  .card {
    width: 100%; max-width: 420px;
    background: var(--panel); border: 1px solid var(--edge); border-radius: 16px;
    padding: 20px; box-shadow: var(--card-shadow);
  }
  h1 { font-size: 19px; font-weight: 700; color: var(--heading); margin-bottom: 8px; }
  .lede { font-size: 14px; color: var(--text); line-height: 1.6; }
  .center { text-align: center; margin-top: 10px; }

  .pair {
    display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 10px;
    margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--edge-soft);
  }
  .pair .k { font-size: 12px; color: var(--dim); }
  .pair .v { font-size: 13.5px; color: var(--heading); word-break: break-word; }

  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    margin-top: 16px; padding: 10px 16px; border-radius: 12px;
    background: var(--primary); color: var(--primary-ink);
    font-size: 14px; font-weight: 600; text-decoration: none;
  }
</style>

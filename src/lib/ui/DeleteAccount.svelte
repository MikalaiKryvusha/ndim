<script lang="ts">
  /*
   * Удаление аккаунта — ОДИН компонент на ДВА дома (эпик `plans/15`, фаза 8).
   *
   * Дом первый: виджет на экране «Управлять аккаунтом» — во всю панель, последним.
   * Дом второй: публичная страница `/delete-account`, куда человек приходит извне, когда
   *   приложения у него может уже не быть (требование Google Play к веб-ссылке; поправка
   *   владельца 2026-08-01: это ДВЕРЬ, а не инструкция).
   *
   * ⚠️ ПОЧЕМУ ОДИН КОМПОНЕНТ, А НЕ ДВЕ КОПИИ. Это разрушающий поток: две его редакции
   * разойдутся в день рождения, и разойдутся молча — вторая копия просто не получит
   * очередную правку. Тот же довод, по которому карточка-шапка «Профиля» живёт сниппетом
   * с двумя домами, а не двумя разметками.
   *
   * Порядок и формы — решения владельца: подтверждение вводом СВОЕЙ почты + повторный вход
   * (В2 = А), «безвозвратно» дословно из 1.x (В4 = А), честно про сутки (В3 = А).
   */
  import { onMount } from 'svelte';
  import {
    accountErrorText,
    forgetPendingOp,
    reauthWithGoogle,
    reauthWay,
    rememberPendingOp,
    sendReauthLink,
  } from '$lib/data/account';
  import { eraseAccount } from '$lib/data/erase';
  import { peekProfileScreen } from '$lib/data/profile';
  import { ratingsUnit, type Lang } from '$lib/ui/format';

  let {
    lang,
    email,
    uid,
    /** Показывать ли собственный заголовок. На публичной странице он свой, крупнее. */
    heading = true,
  }: {
    lang: Lang;
    email: string | null;
    uid: string | null;
    heading?: boolean;
  } = $props();

  /*
   * idle → open (перечень потерь + поле почты) → working (подтверждение + каскад)
   *      → waiting (ждём возврата из письма) → done / failed.
   * Красная кнопка живёт ТОЛЬКО в `open`: постоянное красное пятно притупляет внимание
   * ровно тогда, когда оно нужнее всего (GOV.UK).
   */
  type Phase = 'idle' | 'open' | 'working' | 'waiting' | 'done' | 'failed';
  let phase = $state<Phase>('idle');
  let typed = $state('');
  let error = $state('');

  /** Публичная страница открывает шаг подтверждения сразу: человек пришёл именно за этим. */
  export function openNow(): void {
    if (phase === 'idle') phase = 'open';
  }

  /**
   * Личность подтверждена (человек вернулся по ссылке) — доводим удаление до конца.
   * Вызывает страница: она одна владеет разбором ссылки, иначе два владельца
   * подрались бы за одноразовый код.
   */
  export async function resume(): Promise<void> {
    await runErase();
  }

  /**
   * Перечень потерь КОНКРЕТИКОЙ, но БЕЗ единого запроса к базе.
   * Числа — из тёплого кэша «Профиля» (`ideas/18`); кэш холодный (пришли по прямой
   * ссылке снаружи) — говорим общими словами. Тратить чтения ради цифры на экране
   * удаления нельзя: канон «экономить запросы к базе».
   */
  const losses = $derived.by(() => {
    const warm = peekProfileScreen();
    const items: string[] = [];
    items.push(
      warm === undefined
        ? t.lossDimsPlain[lang]
        : `${t.lossDims[lang]} ${warm.ratings.size} ${ratingsUnit(warm.ratings.size, lang)} ${t.lossDimsTail[lang]}`,
    );
    if (warm?.values.avatar === true) items.push(t.lossPhoto[lang]);
    items.push(t.lossRelations[lang]);
    return items;
  });

  async function runErase(): Promise<void> {
    phase = 'working';
    if (uid === null) {
      error = accountErrorText('no-session', lang);
      phase = 'failed';
      return;
    }
    const result = await eraseAccount(uid);
    if (result.ok) {
      forgetPendingOp();
      phase = 'done';
      return;
    }
    // Учётная запись цела — и это самое важное, что человек должен услышать.
    error = `${t.stopped[lang]} «${result.stoppedAt}». ${t.stillYours[lang]}`;
    phase = 'failed';
  }

  /** Красная кнопка нажата. Сначала личность, потом необратимое. */
  async function submit(): Promise<void> {
    error = '';
    if (typed.trim().toLowerCase() !== (email ?? '').toLowerCase()) {
      error = t.mismatch[lang];
      return;
    }

    const way = reauthWay();
    if (way === null) {
      error = accountErrorText('no-session', lang);
      return;
    }

    if (way === 'google') {
      phase = 'working';
      const confirmed = await reauthWithGoogle();
      if (!confirmed.ok) {
        error = accountErrorText(confirmed.reason, lang);
        phase = 'open';
        return;
      }
      await runErase();
      return;
    }

    phase = 'working';
    rememberPendingOp({ op: 'delete-account' });
    const sent = await sendReauthLink(lang);
    if (!sent.ok) {
      forgetPendingOp();
      error = accountErrorText(sent.reason, lang);
      phase = 'open';
      return;
    }
    phase = 'waiting';
  }

  onMount(() => {
    // Ничего не делаем: разбор возврата по ссылке принадлежит СТРАНИЦЕ (см. resume).
  });

  const t = {
    card: { ru: 'Удаление аккаунта', en: 'Delete account' },
    lede: { ru: 'Мы не сможем восстановить Ваши данные.', en: 'We will not be able to restore your data.' },
    openBtn: { ru: 'Удалить аккаунт', en: 'Delete account' },
    // 🔴 ДОСЛОВНО 1.x. «Безвозвратно» — формулировка владельца, подтверждённая 2026-08-01
    // (В4 = А): правило продукта запрещает «навсегда», а не «безвозвратно», и здесь это правда.
    warn: {
      ru: 'Ваша учётная запись и все её данные будут безвозвратно удалены. Удалить?',
      en: 'Your account and all its data will be irrevocably deleted. Delete?',
    },
    lossDims: { ru: 'Ваш NDim ID и', en: 'your NDim ID and' },
    lossDimsTail: { ru: 'по Измерениям', en: 'across dimensions' },
    lossDimsPlain: {
      ru: 'Ваш NDim ID и все оценки по Измерениям',
      en: 'your NDim ID and all your ratings across dimensions',
    },
    lossPhoto: { ru: 'фотографию', en: 'your photo' },
    lossRelations: { ru: 'связи, которые для Вас посчитаны', en: 'the relations computed for you' },
    confirmLabel: { ru: 'Введите Вашу почту, чтобы подтвердить:', en: 'Type your email to confirm:' },
    mismatch: { ru: 'Почта не совпадает с Вашей.', en: 'This is not your email address.' },
    cancel: { ru: 'Оставить всё как есть', en: 'Keep everything' },
    working: { ru: 'Удаляем…', en: 'Deleting…' },
    waitTitle: { ru: 'Подтвердите, что это Вы', en: 'Confirm it is you' },
    waitBody: {
      ru: 'Мы отправили письмо на Вашу почту. Перейдите по ссылке из него — и удаление завершится.',
      en: 'We sent a letter to your email. Follow the link in it and the deletion will complete.',
    },
    tail: {
      ru: 'Из чужих списков связей Вы исчезнете в течение суток.',
      en: 'You will disappear from other people’s relation lists within a day.',
    },
    doneTitle: { ru: 'Аккаунт удалён', en: 'Account deleted' },
    doneBody: { ru: 'Спасибо, что были в Пространстве.', en: 'Thank you for being part of the Space.' },
    toLanding: { ru: 'На главную', en: 'To the home page' },
    stopped: { ru: 'Удалить не удалось — остановились на шаге', en: 'Deletion failed — stopped at' },
    stillYours: {
      ru: 'Ваш вход цел: войдите ещё раз и повторите.',
      en: 'Your sign-in still works: sign in again and retry.',
    },
  };
</script>

<div class="zone">
  {#if heading}<h3>{t.card[lang]}</h3>{/if}

  {#if phase === 'done'}
    <p class="sub">{t.doneTitle[lang]}</p>
    <p class="lede">{t.doneBody[lang]}</p>
    <a class="btn" href="/">{t.toLanding[lang]}</a>
  {:else if phase === 'waiting'}
    <p class="sub">{t.waitTitle[lang]}</p>
    <p class="lede">{t.waitBody[lang]}</p>
    <button type="button" class="btn ghost" onclick={() => { forgetPendingOp(); phase = 'idle'; }}>
      {t.cancel[lang]}
    </button>
  {:else if phase === 'failed'}
    <p class="err">{error}</p>
    <button type="button" class="btn ghost" onclick={() => (phase = 'idle')}>{t.cancel[lang]}</button>
  {:else if phase === 'idle'}
    <p class="lede">{t.lede[lang]}</p>
    <!-- Кнопка входа в удаление — ОБЫЧНАЯ, не красная (GOV.UK): красная только на финале. -->
    <button type="button" class="btn ghost" onclick={() => (phase = 'open')}>{t.openBtn[lang]}</button>
  {:else}
    <p class="lede">{t.warn[lang]}</p>
    <ul class="loss">
      {#each losses as item (item)}<li>{item}</li>{/each}
    </ul>
    <label class="field">
      <span>{t.confirmLabel[lang]}</span>
      <input class="inp" type="email" inputmode="email" autocomplete="off" bind:value={typed} disabled={phase === 'working'} />
    </label>
    {#if error}<p class="err">{error}</p>{/if}
    <!-- Кнопки-глаголы, исход названный (NN/g). Деструктивная НЕ в фокусе по умолчанию:
         Enter не должен удалять аккаунт. -->
    <div class="cta">
      <button type="button" class="btn ghost" onclick={() => { phase = 'idle'; error = ''; }}>
        {t.cancel[lang]}
      </button>
      <button type="button" class="btn warn" disabled={phase === 'working'} onclick={submit}>
        {phase === 'working' ? t.working[lang] : t.openBtn[lang]}
      </button>
    </div>
    <p class="hint">{t.lede[lang]} {t.tail[lang]}</p>
  {/if}
</div>

<style>
  /* Деструктивная зона отделяется ПОЛОЖЕНИЕМ и рамкой, а не только цветом: канон бренда
     требует Ч/Б-инварианта, а GOV.UK запрещает полагаться на красный как единственный
     носитель смысла. Красный берём из темы (`--down`) — палитре не нужен второй красный. */
  .zone {
    border: 1px solid color-mix(in srgb, var(--down) 38%, transparent);
    border-radius: 16px; padding: 14px;
  }
  .zone h3 {
    font-size: 12px; text-transform: uppercase; letter-spacing: .06em;
    color: var(--down); margin-bottom: 10px; font-weight: 600;
  }
  /* Блок тянем, СОДЕРЖИМОЕ — нет (`EXP-0110`): иначе на 1440 «Удалить аккаунт» становится
     самой широкой мишенью экрана, ровно наперекор закону Фиттса. */
  .lede, .loss, .field, .cta, .hint, .err, .sub { max-width: 620px; }

  .sub { font-size: 15px; font-weight: 600; color: var(--heading); margin-bottom: 6px; }
  .lede { font-size: 14px; color: var(--text); line-height: 1.6; }
  .hint { font-size: 12px; color: var(--faint); line-height: 1.55; margin-top: 10px; }
  .err { font-size: 12.5px; color: var(--down); line-height: 1.5; margin-top: 8px; }
  .loss { margin: 10px 0 0; padding-left: 18px; font-size: 13px; color: var(--text); line-height: 1.75; }

  .field { display: block; margin: 10px 0 8px; }
  .field span { display: block; font-size: 12px; color: var(--dim); margin-bottom: 4px; }
  .inp {
    width: 100%; padding: 9px 11px; border: 1px solid var(--edge); border-radius: 10px;
    background: var(--bg); color: var(--heading); font: inherit; font-size: 14px;
  }

  .cta { display: flex; gap: 8px; flex-wrap: wrap; }
  .btn {
    display: inline-flex; align-items: center; justify-content: center;
    margin-top: 12px; padding: 10px 16px; border-radius: 12px; border: 1px solid transparent;
    background: var(--primary); color: var(--primary-ink);
    font: inherit; font-size: 14px; font-weight: 600; text-decoration: none; cursor: pointer;
  }
  .btn:disabled { opacity: .6; cursor: default; }
  .btn.ghost { background: transparent; border-color: var(--edge); color: var(--text); font-weight: 500; }
  .btn.warn { background: var(--down); border-color: transparent; color: #fff; font-weight: 600; }
  .cta .btn { flex: 0 0 auto; }
</style>

<script lang="ts">
  // «Поддержка» — текст и адрес взяты из живого 1.x (design/reference-1x/app-10-поддержка.png),
  // дословно. Английский перевод сделан агентом: EN-версии этого экрана у нас на руках нет,
  // владелец при желании поправит.
  import DocShell from '$lib/ui/DocShell.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  /** Почта поддержки NDim Space — она же была в 1.x. */
  const SUPPORT_EMAIL = 'ndimspace@yandex.ru';

  const title = { ru: 'Поддержка', en: 'Support' } as const;

  const t = {
    body: {
      ru: `Если у Вас возникла проблема при работе с Пространством NDim, пожалуйста, сообщите о данной проблеме по электронной почте: ${SUPPORT_EMAIL}, воспользовавшись кнопкой ниже. Также Вы можете писать в поддержку в случае возникновения вопросов, предложений или замечаний по Пространству NDim.`,
      en: `If you have a problem while using NDim Space, please report it by email: ${SUPPORT_EMAIL}, using the button below. You can also write to support if you have any questions, suggestions or comments about NDim Space.`,
    },
    // ❤️ — ЦВЕТНОЙ эмодзи, как в 1.x (index.html:1806); при переносе текста
    // потерялся селектор начертания U+FE0F, и сердце стало чёрным глифом.
    thanks: {
      ru: 'Спасибо за Вашу обратную связь! ❤️',
      en: 'Thank you for your feedback! ❤️',
    },
    write: { ru: 'Написать в поддержку', en: 'Write to support' },
  } as const;

  const subject = { ru: 'Пространство NDim', en: 'NDim Space' } as const;
</script>

<DocShell {title}>
  {#snippet children(lang)}
    <p>{t.body[lang]}</p>
    <p class="thanks">{t.thanks[lang]}</p>
    <!-- Иллюстрация 1.x (`images/support.png`, кадр app-10). -->
    <img class="art" src="/img/docs/support.png" width="150" height="150" alt="" loading="lazy" decoding="async" />

    <!-- Знак на кнопке — тот же `support.svg`, что стоял на ней в 1.x (bugs/17). -->
    <a class="btn" href="mailto:{SUPPORT_EMAIL}?subject={encodeURIComponent(subject[lang])}">
      <Icon name="support" size={20} />
      {t.write[lang]}
    </a>
  {/snippet}
</DocShell>

<style>
  /* Текст по центру — канон 1.x для коротких страниц-действий (`.page_main_text p`),
     см. researches/12. Владелец волны 12: «центровки важных текстов нет». */
  p { text-align: center; }
  .thanks { margin-top: 14px; color: var(--heading); font-weight: 600; }
  .art { display: block; margin: 22px auto 0; width: 150px; height: auto; }
  .btn {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    margin-top: 22px; padding: 14px; border-radius: 12px;
    background: var(--primary); color: var(--primary-ink);
    font-size: 15px; font-weight: 600; text-decoration: none;
  }
</style>

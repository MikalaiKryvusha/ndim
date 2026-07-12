<script lang="ts">
  // «Поддержка» — текст и адрес взяты из живого 1.x (design/reference-1x/app-10-поддержка.png),
  // дословно. Английский перевод сделан агентом: EN-версии этого экрана у нас на руках нет,
  // владелец при желании поправит.
  import DocShell from '$lib/ui/DocShell.svelte';

  /** Почта поддержки NDim Space — она же была в 1.x. */
  const SUPPORT_EMAIL = 'ndimspace@yandex.ru';

  const title = { ru: 'Поддержка', en: 'Support' } as const;

  const t = {
    body: {
      ru: `Если у Вас возникла проблема при работе с Пространством NDim, пожалуйста, сообщите о данной проблеме по электронной почте: ${SUPPORT_EMAIL}, воспользовавшись кнопкой ниже. Также Вы можете писать в поддержку в случае возникновения вопросов, предложений или замечаний по Пространству NDim.`,
      en: `If you have a problem while using NDim Space, please report it by email: ${SUPPORT_EMAIL}, using the button below. You can also write to support if you have any questions, suggestions or comments about NDim Space.`,
    },
    thanks: {
      ru: 'Спасибо за Вашу обратную связь! ❤',
      en: 'Thank you for your feedback! ❤',
    },
    write: { ru: 'Написать в поддержку', en: 'Write to support' },
  } as const;

  const subject = { ru: 'Пространство NDim', en: 'NDim Space' } as const;
</script>

<DocShell {title}>
  {#snippet children(lang)}
    <p>{t.body[lang]}</p>
    <p class="thanks">{t.thanks[lang]}</p>
    <a class="btn" href="mailto:{SUPPORT_EMAIL}?subject={encodeURIComponent(subject[lang])}">
      ✉ {t.write[lang]}
    </a>
  {/snippet}
</DocShell>

<style>
  .thanks { margin-top: 14px; color: var(--heading); font-weight: 600; }
  .btn {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    margin-top: 22px; padding: 14px; border-radius: 12px;
    background: var(--primary); color: var(--primary-ink);
    font-size: 15px; font-weight: 600; text-decoration: none;
  }
</style>

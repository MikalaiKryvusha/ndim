<script lang="ts">
  // «Об авторе» — текст из живого 1.x (design/reference-1x/app-13-об-авторе.png), дословно.
  // EN — перевод агента.
  //
  // Чего здесь пока НЕТ и почему: в 1.x на этой странице были портрет автора и ссылки на его
  // Instagram, LinkedIn, YouTube, VK и почту. Ни файла портрета, ни самих адресов у нас на
  // руках нет — выдумывать ссылки на живого человека нельзя. Владелец пришлёт их отдельно
  // (homeworks/06), тогда блок «Связаться с Николаем» вернётся на место.
  import DocShell from '$lib/ui/DocShell.svelte';

  const DONATION_URL = 'https://donationalerts.com/r/mikalai_kryvusha';

  const title = { ru: 'Об авторе', en: 'About the author' } as const;

  const t = {
    body: {
      ru: 'Авторство проекта «Пространство NDim» (англ. «NDim Space») принадлежит Николаю «Kot Krinik» Викторовичу Кривуше.',
      en: 'The «NDim Space» project (rus. «Пространство NDim») was created by Mikalai «Kot Krinik» Viktaravich Kryvusha.',
    },
    name: { ru: 'Николай Кривуша', en: 'Mikalai Kryvusha' },
    donateTitle: { ru: 'Отправить пожертвование Николаю:', en: 'Send a donation to Mikalai:' },
    donate: { ru: 'Отправить пожертвование', en: 'Send a donation' },
  } as const;
</script>

<DocShell {title}>
  {#snippet children(lang)}
    <p>{t.body[lang]}</p>

    <figure>
      <span class="ava" aria-hidden="true">N</span>
      <figcaption>{t.name[lang]}</figcaption>
    </figure>

    <p class="lead">{t.donateTitle[lang]}</p>
    <a class="btn" href={DONATION_URL} target="_blank" rel="noopener noreferrer">
      ♡ {t.donate[lang]}
    </a>
  {/snippet}
</DocShell>

<style>
  figure { display: flex; flex-direction: column; align-items: center; gap: 10px; margin: 24px 0; }
  .ava {
    width: 120px; height: 120px; border-radius: 50%;
    display: grid; place-items: center;
    font-size: 44px; font-weight: 800; color: var(--primary-ink);
    background: linear-gradient(135deg, var(--primary), var(--accent));
  }
  figcaption { font-size: 16px; font-weight: 700; color: var(--heading); }

  .lead { text-align: center; font-size: 13.5px; color: var(--dim); margin-top: 18px; }
  .btn {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    margin-top: 12px; padding: 14px; border-radius: 12px;
    background: var(--primary); color: var(--primary-ink);
    font-size: 15px; font-weight: 600; text-decoration: none;
  }
</style>

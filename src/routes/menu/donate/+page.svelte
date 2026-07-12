<script lang="ts">
  // «Пожертвование» — текст и ссылка из живого 1.x (design/reference-1x/app-11-пожертвование.png),
  // дословно. EN — перевод агента.
  //
  // ГРАНИЦА, КОТОРУЮ НЕ ПЕРЕХОДИМ (GOAL.md): это спокойная страница благодарности, а не
  // воронка продаж. Никаких «премиумов», «плюсов», ограничений для не заплативших и
  // напоминаний. Пожертвование ни на что не влияет — и об этом сказано прямо.
  import DocShell from '$lib/ui/DocShell.svelte';

  const DONATION_URL = 'https://donationalerts.com/r/mikalai_kryvusha';

  const title = { ru: 'Пожертвование', en: 'Donation' } as const;

  const t = {
    body: {
      ru: 'Пространство NDim работает бесплатно для всех людей по всему Миру, без покупок и подписок. Сделав пожертвование, Вы выразите свою благодарность Автору и поддержите развитие Пространства NDim.',
      en: 'NDim Space works free of charge for all people around the World, with no purchases and no subscriptions. By making a donation, you express your gratitude to the Author and support the development of NDim Space.',
    },
    how: {
      ru: 'Чтобы отправить пожертвование, воспользуйтесь кнопкой ниже.',
      en: 'To send a donation, use the button below.',
    },
    thanks: { ru: 'Спасибо за Вашу поддержку! ❤', en: 'Thank you for your support! ❤' },
    donate: { ru: 'Сделать пожертвование', en: 'Make a donation' },
    direct: { ru: 'Прямая ссылка:', en: 'Direct link:' },
    currencies: {
      ru: 'DonationAlerts принимает платежи в Долларах США (USD), Российских Рублях (RUB), Евро (EUR), Бразильских Реалах (BRL), Турецких Лирах (TRY) и Польских Злотых (PLN).',
      en: 'DonationAlerts accepts payments in US Dollars (USD), Russian Roubles (RUB), Euros (EUR), Brazilian Reais (BRL), Turkish Liras (TRY) and Polish Zlotys (PLN).',
    },
    equal: {
      ru: 'Пожертвование ни на что не влияет: все возможности Пространства одинаковы для всех.',
      en: 'A donation changes nothing for you: all features of the Space are the same for everyone.',
    },
  } as const;
</script>

<DocShell {title}>
  {#snippet children(lang)}
    <p>{t.body[lang]}</p>
    <p>{t.how[lang]}</p>
    <p class="thanks">{t.thanks[lang]}</p>

    <a class="btn" href={DONATION_URL} target="_blank" rel="noopener noreferrer">
      ♡ {t.donate[lang]}
    </a>

    <p class="direct">
      {t.direct[lang]}
      <a href={DONATION_URL} target="_blank" rel="noopener noreferrer">
        {DONATION_URL.replace('https://', '')}
      </a>
    </p>
    <p class="quiet">{t.currencies[lang]}</p>
    <p class="quiet">{t.equal[lang]}</p>
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
  .direct { margin-top: 18px; text-align: center; font-size: 13px; color: var(--dim); }
  .direct a { color: var(--primary); }
  .quiet { margin-top: 12px; font-size: 11.5px; color: var(--faint); line-height: 1.6; text-align: center; }
</style>

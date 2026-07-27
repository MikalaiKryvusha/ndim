<script lang="ts">
  // «Пожертвование» — текст и ссылка из живого 1.x (design/reference-1x/app-11-пожертвование.png),
  // дословно. EN — перевод агента.
  //
  // ГРАНИЦА, КОТОРУЮ НЕ ПЕРЕХОДИМ (GOAL.md): это спокойная страница благодарности, а не
  // воронка продаж. Никаких «премиумов», «плюсов», ограничений для не заплативших и
  // напоминаний. Пожертвование ни на что не влияет — и об этом сказано прямо.
  import DocShell from '$lib/ui/DocShell.svelte';
  import Icon from '$lib/ui/Icon.svelte';

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
    // ❤️ — ЦВЕТНОЙ эмодзи, ровно как в 1.x (index.html:1868). При переносе текста
    // селектор начертания U+FE0F потерялся, и сердце стало чёрным типографским знаком.
    // Слово владельца волны 12: «если был емодзи — он был красочный».
    thanks: { ru: 'Спасибо за Вашу поддержку! ❤️', en: 'Thank you for your support! ❤️' },
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

    <!-- Иллюстрация 1.x (`images/donation.png`, кадр app-11): страница благодарности без
         неё выглядела казённой формой. -->
    <img class="art" src="/img/docs/donation.png" width="150" height="150" alt="" loading="lazy" decoding="async" />

    <!-- Знак на кнопке — ТОТ САМЫЙ `donate-heart.svg` из 1.x (набор иконок, bugs/17),
         а не типографский ♡: у глифа нет ни сетки, ни веса. -->
    <a class="btn" href={DONATION_URL} target="_blank" rel="noopener noreferrer">
      <Icon name="donate" size={20} />
      {t.donate[lang]}
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
  /* Выравнивание по канону 1.x (researches/12): на КОРОТКИХ страницах-действиях
     (поддержка, пожертвование, автор) весь текст был по центру — `.page_main_text p
     { text-align: center }`. В 2.0 было наоборот: абзацы слева, а сноски по центру.
     Владелец прочитал это как «центровки важных текстов нет» — и был прав буквально.
     Длинные документы (руководство, условия, политика) центрировать НЕЛЬЗЯ, и в 1.x
     они и не центрировались: их читают глазами построчно. */
  p { text-align: center; }
  .thanks { margin-top: 14px; color: var(--heading); font-weight: 600; }
  .art { display: block; margin: 22px auto 0; width: 150px; height: auto; }
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

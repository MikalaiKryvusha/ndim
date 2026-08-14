<script lang="ts">
  // «Об авторе» — текст из живого 1.x (design/reference-1x/app-13-об-авторе.png), дословно.
  // EN — перевод агента.
  //
  // 2026-07-27, волна 12. Слово владельца: «в Об Авторе вообще фото потерялось».
  // Оно и правда потерялось — но не из продукта, а из поля зрения агента: `homeworks/06`
  // просил портрет и ссылки У ВЛАДЕЛЬЦА, тогда как и то и другое лежало в архиве 1.x, им
  // же и опубликованное. Портрет — `ndim_old/public/images/Mikalai.webp` → `static/img/
  // author.webp`; пять адресов и фирменные цвета — `src/lib/ui/brands.ts`, снятые
  // дословно с его собственной страницы. Ничего не выдумано (PHILOSOPHY: «наблюдение
  // вместо додумывания»).
  import DocShell from '$lib/ui/DocShell.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { AUTHOR_LINKS } from '$lib/ui/brands';
  import { ready } from '$lib/ui/ready';

  const DONATION_URL = 'https://donationalerts.com/r/mikalai_kryvusha';

  const title = { ru: 'Об авторе', en: 'About the author' } as const;

  const t = {
    body: {
      ru: 'Авторство проекта «Пространство NDim» (англ. «NDim Space») принадлежит Николаю «Kot Krinik» Викторовичу Кривуше.',
      en: 'The «NDim Space» project (rus. «Пространство NDim») was created by Mikalai «Kot Krinik» Viktaravich Kryvusha.',
    },
    name: { ru: 'Николай Кривуша', en: 'Mikalai Kryvusha' },
    // Формулировка 1.x дословно (index.html:1723-1724).
    contactTitle: { ru: 'Связаться с Николаем:', en: 'Contact with Mikalai:' },
    donateTitle: { ru: 'Отправить пожертвование Николаю:', en: 'Send a donation to Mikalai:' },
    donate: { ru: 'Отправить пожертвование', en: 'Send a donation' },
    portrait: { ru: 'Портрет автора', en: 'Portrait of the author' },
  } as const;
</script>

<DocShell {title}>
  {#snippet children(lang)}
    <p>{t.body[lang]}</p>

    <figure>
      <!-- Портрет 1.x: 260×260 в исходнике, показываем 132 — retina без размытия.
           width/height проставлены, чтобы место под фото было занято ДО загрузки и
           страница не прыгала (тот же класс дефекта, что bugs/57), а видимым портрет
           становится ГОТОВЫМ (правило владельца о графике, bugs/69). -->
      <img
        use:ready
        class="ava"
        src="/img/author.webp"
        width="132"
        height="132"
        alt={t.portrait[lang]}
        loading="lazy"
        decoding="async"
      />
      <figcaption>{t.name[lang]}</figcaption>
    </figure>

    <p class="lead">{t.contactTitle[lang]}</p>
    <div class="links">
      {#each AUTHOR_LINKS as link (link.id)}
        <a class="net" href={link.href} target="_blank" rel="noopener noreferrer me">
          <span class="tile" style="background:{link.color}">
            <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true" focusable="false"
              >{@html link.d}</svg
            >
          </span>
          <span class="nm">{link.name}</span>
        </a>
      {/each}
    </div>

    <p class="lead">{t.donateTitle[lang]}</p>
    <a class="btn" href={DONATION_URL} target="_blank" rel="noopener noreferrer">
      <Icon name="heart" size={18} />
      {t.donate[lang]}
    </a>
  {/snippet}
</DocShell>

<style>
  /* Текст по центру — канон 1.x для коротких страниц (`.page_main_text p`, researches/12). */
  p { text-align: center; }
  figure { display: flex; flex-direction: column; align-items: center; gap: 10px; margin: 24px 0; }
  .ava {
    width: 132px; height: 132px; border-radius: 50%;
    object-fit: cover; display: block;
    /* Тонкий фирменный ободок — портрет читается как портрет и в тёмной теме,
       где светлый фон снимка иначе висел бы в пустоте. */
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent), var(--card-shadow);
    /* Портрет проявляется ГОТОВЫМ (правило владельца о графике, bugs/69): место под него
       занято w/h, ободок держит композицию, а сам снимок не въезжает скачком. */
    opacity: 0;
    transition: opacity var(--motion-base) var(--motion-ease);
  }
  .ava:global(.ok) { opacity: 1; }
  figcaption { font-size: 16px; font-weight: 700; color: var(--heading); }

  /* Сетка площадок — та же форма, что у «Пригласить друзей» (одна семья экранов),
     но со НАСТОЯЩИМИ знаками: их оригиналы у нас есть, а там — нет. */
  .links {
    margin-top: 12px;
    display: grid; grid-template-columns: repeat(auto-fit, minmax(84px, 1fr)); gap: 10px;
  }
  .net {
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 10px 4px; border-radius: 12px; text-decoration: none;
    border: 1px solid transparent;
    transition: border-color 0.15s ease, transform 0.15s ease, background 0.15s ease;
  }
  @media (hover: hover) {
    .net:hover { border-color: var(--edge); background: var(--edge-soft); transform: translateY(-1px); }
  }
  .tile {
    width: 40px; height: 40px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--edge) 70%, transparent);
  }
  .nm { font-size: 11px; color: var(--dim); }

  .lead { text-align: center; font-size: 13.5px; color: var(--dim); margin-top: 26px; }
  .btn {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    margin-top: 12px; padding: 14px; border-radius: 12px;
    background: var(--primary); color: var(--primary-ink);
    font-size: 15px; font-weight: 600; text-decoration: none;
    transition: filter 0.15s ease;
  }
  @media (hover: hover) {
    .btn:hover { filter: brightness(1.08); }
  }
</style>

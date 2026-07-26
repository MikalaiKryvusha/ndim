<script lang="ts">
  // «Пригласить друзей» — страница-паритет с 1.x (кадр app-09, `share_page`; bugs/47).
  //
  // Что было потеряно при переезде: в 1.x здесь жила СЕТКА СОЦСЕТЕЙ, прямая ссылка и
  // «Копировать ссылку». В 2.0 осталось только системное «Поделиться» — а на десктопе
  // `navigator.share` часто отсутствует вовсе, и пути пригласить человека не было НИ ОДНОГО.
  // Для проекта, чья цель — чтобы людей в Пространстве становилось больше (GOAL.md), это
  // не косметика.
  //
  // ⚠️ В 1.x сетку рисовал внешний виджет AddToAny (`static.addtoany.com/menu/page.js`) —
  // сторонний скрипт со своей аналитикой. В 2.0 внешних скриптов НЕТ: каждая ссылка здесь —
  // обычный share-эндпоинт сети, собранный из адреса сайта. Ничего не грузится, никто не
  // считает наших людей, Lighthouse не страдает.
  import DocShell from '$lib/ui/DocShell.svelte';
  import { SITE_ORIGIN } from '$lib/site';
  import type { Lang } from '$lib/ui/format';

  const title = { ru: 'Пригласить друзей', en: 'Invite Friends' } as const;

  const t = {
    // Текст страницы — ДОСЛОВНО из 1.x (public/index.html:1523-1525).
    intro: {
      ru: 'Пригласите друзей в Пространство NDim и расскажите об этом месте людям вокруг Вас. Чем больше людей в Пространстве NDim, тем выше шансы познакомиться.',
      en: 'Invite your friends to the NDim Space and tell people around you about this place. The more people in the NDim Space, the higher the chances of meeting new people.',
    },
    share: { ru: 'Поделиться', en: 'Share' },
    inSocial: { ru: 'Поделиться в социальных сетях:', en: 'Share in social networks:' },
    directLink: { ru: 'Прямая ссылка:', en: 'Direct Link:' },
    copyLink: { ru: 'Копировать ссылку', en: 'Copy link' },
    copied: { ru: 'Скопировано', en: 'Copied' },
    // Текст приглашения — им же делится системное «Поделиться» в /menu.
    inviteText: {
      ru: 'Пространство NDim — здесь находят похожих людей по-честному, математикой, а не рекламой.',
      en: 'NDim Space — where similar people are found honestly, by mathematics, not by advertising.',
    },
  } as const;

  /**
   * Сети — набор 1.x (кадр app-09), кроме двух, у которых веб-эндпоинта поделиться не
   * существует: **Messenger** (диалог `facebook.com/dialog/send` требует `app_id`
   * зарегистрированного приложения) и **WeChat** (делится только через QR внутри
   * приложения). Молча сокращать набор нельзя — поэтому вот они, названы.
   *
   * Монограмма вместо фирменного логотипа — осознанно: чужие логотипы у нас не лежат, а
   * рисовать их «по памяти» значит выдать приблизительную форму за брендовый знак.
   * Цвет сети настоящий, имя подписано; при желании владельца знаки заменяются на
   * официальные одним проходом (см. bugs/17 — набор иконок).
   */
  interface Network {
    readonly id: string;
    readonly name: string;
    readonly mark: string;
    readonly color: string;
    /** Собирает адрес «поделиться» этой сети. */
    readonly href: (url: string, text: string, lang: Lang) => string;
  }

  const e = encodeURIComponent;

  const NETWORKS: readonly Network[] = [
    { id: 'telegram', name: 'Telegram', mark: 'T', color: '#2AABEE',
      href: (u, x) => `https://t.me/share/url?url=${e(u)}&text=${e(x)}` },
    { id: 'whatsapp', name: 'WhatsApp', mark: 'W', color: '#25D366',
      href: (u, x) => `https://api.whatsapp.com/send?text=${e(`${x} ${u}`)}` },
    { id: 'vk', name: 'VK', mark: 'VK', color: '#0077FF',
      href: (u) => `https://vk.com/share.php?url=${e(u)}` },
    { id: 'facebook', name: 'Facebook', mark: 'f', color: '#1877F2',
      href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${e(u)}` },
    { id: 'x', name: 'X', mark: '𝕏', color: '#0F1419',
      href: (u, x) => `https://twitter.com/intent/tweet?url=${e(u)}&text=${e(x)}` },
    { id: 'threads', name: 'Threads', mark: '@', color: '#101010',
      href: (u, x) => `https://www.threads.net/intent/post?text=${e(`${x} ${u}`)}` },
    { id: 'linkedin', name: 'LinkedIn', mark: 'in', color: '#0A66C2',
      href: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${e(u)}` },
    { id: 'reddit', name: 'Reddit', mark: 'r', color: '#FF4500',
      href: (u, x) => `https://www.reddit.com/submit?url=${e(u)}&title=${e(x)}` },
    { id: 'ok', name: 'OK', mark: 'ok', color: '#EE8208',
      href: (u, x) => `https://connect.ok.ru/offer?url=${e(u)}&title=${e(x)}` },
    { id: 'mailru', name: 'Mail.ru', mark: 'm', color: '#005FF9',
      href: (u, x) => `https://connect.mail.ru/share?url=${e(u)}&title=${e(x)}` },
    { id: 'viber', name: 'Viber', mark: 'V', color: '#7360F2',
      href: (u, x) => `viber://forward?text=${e(`${x} ${u}`)}` },
    { id: 'pinterest', name: 'Pinterest', mark: 'P', color: '#E60023',
      href: (u, x) => `https://pinterest.com/pin/create/button/?url=${e(u)}&description=${e(x)}` },
    { id: 'email', name: 'Email', mark: '✉', color: '#5B6472',
      href: (u, x, lang) => `mailto:?subject=${e(lang === 'ru' ? 'Пространство NDim' : 'NDim Space')}&body=${e(`${x} ${u}`)}` },
  ];

  let copied = $state(false);

  /** Системное «поделиться»; там, где его нет (обычно десктоп), — копирование ссылки. */
  async function systemShare(lang: Lang) {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'NDim Space', text: t.inviteText[lang], url: SITE_ORIGIN });
        return;
      } catch {
        return; // человек передумал делиться — это не ошибка
      }
    }
    await copyLink();
  }

  async function copyLink() {
    await navigator.clipboard.writeText(SITE_ORIGIN);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

<DocShell {title}>
  {#snippet children(lang)}
    <p>{t.intro[lang]}</p>

    <button type="button" class="btn" onclick={() => void systemShare(lang)}>
      ↗ {t.share[lang]}
    </button>

    <p class="lead">{t.inSocial[lang]}</p>
    <div class="grid">
      {#each NETWORKS as network (network.id)}
        <a
          class="net"
          href={network.href(SITE_ORIGIN, t.inviteText[lang], lang)}
          target="_blank"
          rel="noopener noreferrer"
          data-net={network.id}
        >
          <span class="tile" style="background:{network.color}">{network.mark}</span>
          <span class="nm">{network.name}</span>
        </a>
      {/each}
    </div>

    <p class="lead">{t.directLink[lang]}</p>
    <p class="link">{SITE_ORIGIN.replace('https://', '')}</p>
    <button type="button" class="btn ghost" onclick={() => void copyLink()}>
      ⧉ {copied ? t.copied[lang] : t.copyLink[lang]}
    </button>
  {/snippet}
</DocShell>

<style>
  .lead { margin-top: 26px; color: var(--dim); font-size: 13px; }
  .grid {
    margin-top: 12px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
    gap: 10px;
  }
  .net {
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 10px 4px; border-radius: 12px; text-decoration: none;
    border: 1px solid transparent;
    transition: border-color 0.15s ease, transform 0.15s ease, background 0.15s ease;
  }
  .net:hover { border-color: var(--edge); background: var(--edge-soft); transform: translateY(-1px); }
  .tile {
    width: 40px; height: 40px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 16px; font-weight: 700; line-height: 1;
    /* Тёмные знаки (X, Threads) не должны сливаться с тёмной темой. */
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--edge) 70%, transparent);
  }
  .nm { font-size: 11px; color: var(--dim); }
  .link {
    margin-top: 6px; font-size: 15px; font-weight: 600; color: var(--primary);
    overflow-wrap: anywhere;
  }
  .btn {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    margin-top: 18px; padding: 14px; width: 100%; border: 0; border-radius: 12px;
    background: var(--primary); color: var(--primary-ink); font: inherit;
    font-size: 15px; font-weight: 600; cursor: pointer; text-decoration: none;
    transition: filter 0.15s ease;
  }
  .btn:hover { filter: brightness(1.08); }
  .btn.ghost {
    background: transparent; border: 1px solid var(--edge); color: var(--dim);
    font-size: 14px; padding: 12px;
  }
  .btn.ghost:hover { border-color: var(--primary); color: var(--primary); filter: none; }
</style>

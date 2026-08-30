<script lang="ts">
  /**
   * ПОСТОЯННАЯ КАРТОЧКА ГОСТЯ — выбор владельца по фазе 5 эпика гостя (plans/22, 2026-08-21):
   * «Делаем V2 · Карточка-первенец — с текстом от V1 + эта карточка висит на всех экранах
   * приложения». Контейнер — карточка над содержимым экрана (V2), текст — панели V1, и она
   * ЖИВЁТ, пока гость не создал аккаунт: ссылки «позже» нет намеренно — карточка не
   * закрывается («висит» — его слово).
   *
   * Профиль — исключение: там стоит РАСШИРЕННАЯ гостевая карточка с полями сохранения
   * (guest-card, bugs/84) — вторая с тем же смыслом была бы двойником. Допущение названо
   * в plans/22 фаза 5; «Сохранить» отсюда ведёт ровно к ней.
   *
   * Гостевость — подпиской у ИСТОЧНИКА (приём devAuth: слушатель не расходится с сессией по
   * построению): экраны, кроме профиля, гостя не различают, карточка определяет его сама.
   * В пререндере не рисуется вовсе: onMount на сборке не зовётся, guest остаётся false.
   */
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import { onAuthStateChanged } from 'firebase/auth';
  import { devAuth } from '$lib/firebase';
  import { GUEST_TTL_DAYS } from '$lib/model/schema';
  import { lang as currentLang } from '$lib/ui/lang.svelte';
  import { MOTION } from '$lib/ui/motion';

  const lang = $derived(currentLang());

  let guest = $state(false);
  onMount(() => onAuthStateChanged(devAuth(), (user) => (guest = user?.isAnonymous === true)));

  // Текст — панели V1 (правила текста: «Вы», без «навсегда»); срок — из схемы, одна истина.
  // Хвост фразы — правка владельца (интервью №043, В4): «останутся в Вашем личном NDim ID
  // профиле Пространства NDim» вместо «останутся с Вами». EN — рабочий перевод до его вычитки.
  const t = {
    text: {
      ru: `Сейчас Вы гость. Гостевой профиль живёт ${GUEST_TTL_DAYS} дней с момента создания — создайте аккаунт, и Ваши оценки и связи останутся в Вашем личном NDim ID профиле Пространства NDim.`,
      en: `You are a guest right now. A guest profile lives for ${GUEST_TTL_DAYS} days from creation — create an account, and your ratings and relations will stay in your personal NDim ID profile of NDim Space.`,
    },
    save: { ru: 'Сохранить', en: 'Save' },
  } as const;
</script>

{#if guest}
  <div class="gnote" transition:slide={{ duration: MOTION.base }}>
    <p>{t.text[lang]}</p>
    <a href="/profile">{t.save[lang]}</a>
  </div>
{/if}

<style>
  /* Форма V2: карточка над содержимым; на узком экране кнопка уходит под текст. */
  .gnote {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    /* Кнопка прижата к дальнему краю строки: плашка стоит во всю ширину контента, и
       кнопка, повисшая посреди полосы, читалась бы как незаконченный ряд (bugs/226). */
    justify-content: space-between;
    margin: 0 0 12px; padding: 11px 13px; border-radius: 12px;
    background: color-mix(in srgb, var(--primary) 8%, var(--panel));
    border: 1px solid color-mix(in srgb, var(--primary) 30%, var(--edge));
  }
  /*
   * 🔴 ЧИТАЕМАЯ МЕРА СТРОКИ — 700px, И ЭТО ЗАМЕР, А НЕ ВКУС (`bugs/226`).
   *
   * Плашка едет во всю ширину контента, а полоса контента на десктопе доходит до 1228px.
   * Замер Дизайнера живым Chromium по настоящей строке этого компонента: на 1228px русский
   * текст даёт 172 знака в строке при типографском потолке ≈90 — вдвое сверх — и роняет на
   * вторую строку сироту в 36px (слово «NDim.» висит одно).
   *
   * ⚠️ ЧИСЛО СНЯТО НА ДВУХ ЯЗЫКАХ СРАЗУ, И ИМЕННО ПОЭТОМУ ОНО ЧИСЛО, А НЕ ШИРИНА. RU и EN
   * ломаются на РАЗНЫХ ширинах: 1024 чист для RU и даёт сироту у EN, 607 чист для RU и даёт
   * сироту у EN, 640 наоборот. Ограничение шириной родителя чинило бы один язык и ломало
   * второй МОЛЧА; 700px чисты в обоих с запасом.
   * ⛔ Не «улучшать» это число замером на одном языке — второй сломается и не покраснеет.
   * Стережёт `tools/verify-bug226-gnote.mjs` (проверка меры строки на обоих языках).
   */
  .gnote p {
    margin: 0; flex: 1 1 220px; max-width: 700px;
    font-size: 13px; line-height: 1.45; color: var(--text);
  }
  .gnote a {
    flex: none; padding: 9px 18px; border-radius: 10px; font-size: 13.5px; font-weight: 600;
    background: var(--primary); color: var(--primary-ink); text-decoration: none;
    transition: filter 0.15s ease;
  }
  @media (hover: hover) {
    .gnote a:hover { filter: brightness(1.08); }
  }
</style>

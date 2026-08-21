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
  const t = {
    text: {
      ru: `Сейчас Вы гость. Гостевой профиль живёт ${GUEST_TTL_DAYS} дней с момента создания — создайте аккаунт, и Ваши оценки и связи останутся с Вами.`,
      en: `You are a guest right now. A guest profile lives for ${GUEST_TTL_DAYS} days from creation — create an account, and your ratings and relations will stay with you.`,
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
    margin: 0 0 12px; padding: 11px 13px; border-radius: 12px;
    background: color-mix(in srgb, var(--primary) 8%, var(--panel));
    border: 1px solid color-mix(in srgb, var(--primary) 30%, var(--edge));
  }
  .gnote p { margin: 0; flex: 1 1 220px; font-size: 13px; line-height: 1.45; color: var(--text); }
  .gnote a {
    flex: none; padding: 9px 18px; border-radius: 10px; font-size: 13.5px; font-weight: 600;
    background: var(--primary); color: var(--primary-ink); text-decoration: none;
    transition: filter 0.15s ease;
  }
  @media (hover: hover) {
    .gnote a:hover { filter: brightness(1.08); }
  }
</style>

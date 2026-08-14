<script lang="ts">
  /*
   * ДОМ АДМИН-ПАНЕЛИ — «Менеджер измерений» (`plans/33`, эпик `ideas/29`, фаза 3).
   *
   * Решение владельца (интервью №015, В1 = Б): раздел ВНУТРИ приложения, НЕ индексируется,
   * не-админ РЕДИРЕКТИТСЯ на главную. В `sitemap.xml` раздела нет (белый список, действие —
   * бездействие; стережёт `tools/verify-admin-home.mjs`).
   *
   * Эта фаза — только ДОМ: адрес, оболочка, граница доступа. Комната «Измерения» (стопка
   * кандидатов по утверждённому макету V1 `plans/32`) въезжает в фазе 4 — здесь для неё
   * оставлено пустое место, и это не недоделка, а граница фазы.
   *
   * 🔴 ТРИ СОСТОЯНИЯ ПРАВ, А НЕ ДВА (`plans/33`, шаг 2 — сердце фазы):
   *   · `unknown`  → нейтральное ожидание (та же карточка-кольцо, что везде, `bugs/21`);
   *                  ни панели, ни редиректа — наивный редирект выбросил бы владельца,
   *                  пока восстанавливается сессия;
   *   · `not-admin` → редирект на главную (условие владельца);
   *   · `admin`    → оболочка панели.
   *
   * Пререндер (глобальный `prerender = true`) публикует эту оболочку статическим HTML на
   * публичном хосте — это принятая цена В1=Б, поэтому в ней НЕТ НИ БАЙТА ДАННЫХ: до вердикта
   * рендерится только кольцо ожидания, а данные не приезжают вовсе (их не читает даже админ —
   * в фазе 3 нечего читать).
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import AppBar from '$lib/ui/AppBar.svelte';
  import BottomNav from '$lib/ui/BottomNav.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import SideRail from '$lib/ui/SideRail.svelte';
  import { adminVerdict, type AdminState } from '$lib/data/admin';
  import { lang as currentLang } from '$lib/ui/lang.svelte';

  const lang = $derived(currentLang());

  /** `unknown` до вердикта; `not-admin` мгновенно уводится и экраном не является. */
  let state = $state<AdminState>('unknown');

  onMount(async () => {
    // `insist: true` — только здесь: клейм мог быть выдан после выпуска кэшированного
    // токена, и раздел обязан переспросить токен, а не выбросить владельца (plans/33 шаг 2).
    const verdict = await adminVerdict({ insist: true });
    if (verdict === 'admin') {
      state = 'admin';
      return;
    }
    state = 'not-admin';
    // Условие владельца (В1 = Б): не «доступ запрещён», а главная. replaceState — чтобы
    // «Назад» не возвращал не-админа в раздел, из которого его только что увели.
    await goto('/', { replaceState: true });
  });

  const t = {
    title: { ru: 'Менеджер измерений', en: 'Dimension Manager' },
    admin: { ru: 'админ', en: 'admin' },
    coming: {
      ru: 'Комната «Измерения» появится здесь в следующей фазе.',
      en: 'The Dimensions room will appear here in the next phase.',
    },
  } as const;
</script>

<svelte:head>
  <title>NDim Space — {t.title[lang]}</title>
  <!-- Раздел не индексируется (В1 = Б) — по образцу личных экранов (/account и родни). -->
  <meta name="robots" content="noindex" />
</svelte:head>

{#if state === 'admin'}
  <div class="screen">
    <SideRail active="menu" {lang} />
    <AppBar />

    <main class="body">
      <h1 class="screen-title">
        {t.title[lang]}
        <!-- Признак «админ»: человек видит, что он в служебном разделе, а не в продукте. -->
        <span class="badge"><Icon name="edit" size={13} />{t.admin[lang]}</span>
      </h1>

      <!-- Пустое место под комнату фазы 4 — границу фазы держим честно. -->
      <p class="coming">{t.coming[lang]}</p>
    </main>

    <BottomNav active="menu" {lang} />
  </div>
{:else}
  <!-- `unknown`: нейтральное ожидание — ни панели, ни редиректа, пока прав не знаем.
       Ровно это состояние уходит в пререндер: статический HTML раздела пуст по данным. -->
  <div class="hold">
    <Loading {lang} />
  </div>
{/if}

<style>
  /* Оболочка — та же сетка, что у экранов продукта: рельс слева от 1024px, шапка сверху. */
  .screen {
    min-height: 100dvh;
    display: grid;
    grid-template-rows: auto 1fr;
    grid-template-columns: 1fr;
  }
  @media (min-width: 1024px) {
    .screen {
      grid-template-columns: auto 1fr;
    }
  }
  .body {
    padding: 18px 16px 90px;
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
  }
  @media (min-width: 1024px) {
    .body {
      padding: 24px 28px 40px;
    }
  }
  .screen-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 22px;
    margin: 0 0 14px;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 600;
    color: var(--primary);
    border: 1px solid var(--primary);
    border-radius: 999px;
    padding: 2px 9px;
    text-transform: lowercase;
  }
  .coming {
    color: var(--dim);
    font-size: 14px;
  }
  .hold {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 24px;
  }
</style>

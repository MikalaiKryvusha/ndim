<script lang="ts">
  /**
   * ЛЕНДИНГ НА ЯЗЫКОВЫХ АДРЕСАХ `/ru` и `/en` — новая V1 (`plans/106`; эпик `plans/104`, фаза 2).
   *
   * Вся страница — `LandingV1.svelte`; здесь только адресная часть: язык из адреса, canonical на свой
   * языковой адрес, двусторонний hreflang и разметка сайта. Тот же компонент рисует и корень `/`
   * (`src/routes/+page.svelte`), поэтому две страницы не разъедутся.
   *
   * 🔴 Страница остаётся ГИДРИРУЕМОЙ: дверь выката читает хеш сборки с `/ru` (`tools/deploy.mjs`,
   * `liveHash`), и тест на совместимость живёт в Svelte.
   * Прежний лендинг «Колонна» (макет `design/landing-mockups.html`) — в истории git этого файла.
   */
  import { page } from '$app/state';
  import { SITE_ORIGIN } from '$lib/site';
  import { siteJsonLd } from '$lib/content/dim-jsonld';
  import { LANGS, X_DEFAULT, isLang } from '$lib/content/langs';
  import { landingV1 as t } from '$lib/content/landing-v1-copy';
  import LandingV1 from '$lib/ui/landing/LandingV1.svelte';

  /* `<` экранируется: строка едет внутрь `<script>` через `{@html}` (как на страницах каталога). */
  const siteLd = JSON.stringify(siteJsonLd(SITE_ORIGIN)).replace(/</g, '\\u003c');

  // Язык — ИЗ АДРЕСА (`plans/39` шаг 2): `/ru` пререндерен русским, `/en` — английским.
  const lang = $derived(isLang(page.params.lang) ? page.params.lang : 'ru');
  const canonicalUrl = $derived(`${SITE_ORIGIN}/${lang}`);
</script>

<svelte:head>
  <title>{t.meta.title[lang]}</title>
  <link rel="canonical" href={canonicalUrl} />
  <!-- Двусторонний hreflang с самоссылкой (researches/26 §4.1); x-default на английский (№010 Р5). -->
  {#each LANGS as l (l)}
    <link rel="alternate" hreflang={l} href={`${SITE_ORIGIN}/${l}`} />
  {/each}
  <link rel="alternate" hreflang="x-default" href={`${SITE_ORIGIN}/${X_DEFAULT}`} />
  <meta name="description" content={t.meta.desc[lang]} />
  <meta property="og:title" content={t.meta.title[lang]} />
  <meta property="og:description" content={t.meta.desc[lang]} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:locale" content={lang === 'en' ? 'en_US' : 'ru_RU'} />
  <!-- `Organization` + `WebSite`: имя сайта и логотип в выдаче (`plans/48` шаг 5). Без `SearchAction`. -->
  {@html `<script type="application/ld+json">${siteLd}</script>`}
</svelte:head>

<LandingV1 {lang} entry="landing" />

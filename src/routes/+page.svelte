<script lang="ts">
  /**
   * ГЛАВНАЯ `ndimspace.app/` — новая V1 (`plans/106`; эпик `plans/104`, фаза 2).
   *
   * Слово владельца, интервью №096 В6 = **Б**: «*новый лендинг становится и главной —
   * `ndimspace.app` открывает сразу страницу с картой и звёздами, язык выбирается переключателем
   * вверху*». Страница — тот же `LandingV1.svelte`, что на `/ru` и `/en`, на языке `ROOT_LANG`.
   *
   * 🔑 Корень НЕ угадывает язык и никуда не уводит по языку (разведка, принятая владельцем в №058 В1 = А:
   * «молчаливое угадывание языка» и «пустой для робота корень» — худшие решения). Человек и робот видят
   * одно содержание. `canonical` корня — сам корень, и он в sitemap: иначе вернулась бы жалоба Вебмастера
   * Яндекса «Главная страница сайта недоступна для робота» (`bugs/203`); совпадение содержания с `/ru`
   * поисковик склеивает сам. `x-default` остаётся на английском (№010 Р5).
   *
   * Прежняя главная V5 (№060, 2026-09-05) и её инлайн-счётчик прихода без SDK (№078 В1 = Г) — в истории
   * git этого файла. Приход главной теперь считает `track('landing_view')` компонента: у события есть
   * браузер и человек, и «вернулся» измерим (`plans/105` Б3, `plans/106` развилка «счётчик прихода»).
   */
  import { SITE_ORIGIN } from '$lib/site';
  import { LANGS, ROOT_LANG, X_DEFAULT } from '$lib/content/langs';
  import { siteJsonLd } from '$lib/content/dim-jsonld';
  import { landingV1 as t } from '$lib/content/landing-v1-copy';
  import LandingV1 from '$lib/ui/landing/LandingV1.svelte';

  const canonicalUrl = `${SITE_ORIGIN}/`;
  const siteLd = JSON.stringify(siteJsonLd(SITE_ORIGIN)).replace(/</g, '\\u003c');

  /*
   * ДВЕРЬ ДО ВСЯКОГО JS — письмо и маркер сессии.
   *
   * Action URL писем Firebase указывает на корень домена (наследие 1.x): человек из письма обязан уехать
   * в `/profile` с нетронутым query (боевой урок 2026-07-12). Вошедший и гость уходят внутрь по маркеру
   * `ndim-session` — тому же признаку, по которому `app.html` поднял щит (bugs/08.1, bugs/40). Скрипт
   * инлайновый, чтобы увод случился в первом кадре, а не после загрузки приложения; компонент повторяет
   * обе проверки и на `/ru`, где такого скрипта нет.
   */
  // `<\/script>` — иначе парсер закрыл бы блок компонента на этой строке.
  const EMAIL_DOOR = `<script>
(function () {
	try {
		var q = location.search, h = location.hash;
		// Точный разбор, а не подстрокой: параметр встречается и в чужих адресах.
		var p = new URLSearchParams(q);
		if (p.get('mode') === 'signIn' && p.has('oobCode')) {
			location.replace('/profile' + q + h);
			return;
		}
		if (localStorage.getItem('ndim-session')) {
			location.replace('/profile');
		}
	} catch (e) { /* сломался разбор или закрыто хранилище — человек просто остаётся на главной */ }
})();
<\/script>`;
</script>

<svelte:head>
  <title>{t.meta.title[ROOT_LANG]}</title>
  <link rel="canonical" href={canonicalUrl} />
  <!-- Двусторонний hreflang (researches/26 §4.1). `x-default` на английский — №010 Р5. -->
  {#each LANGS as l (l)}
    <link rel="alternate" hreflang={l} href={`${SITE_ORIGIN}/${l}`} />
  {/each}
  <link rel="alternate" hreflang="x-default" href={`${SITE_ORIGIN}/${X_DEFAULT}`} />
  <meta name="description" content={t.meta.desc[ROOT_LANG]} />
  <meta property="og:title" content={t.meta.title[ROOT_LANG]} />
  <meta property="og:description" content={t.meta.desc[ROOT_LANG]} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:locale" content="ru_RU" />
  {@html `<script type="application/ld+json">${siteLd}</script>`}
  {@html EMAIL_DOOR}
</svelte:head>

<LandingV1 lang={ROOT_LANG} entry="root" />

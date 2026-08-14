<script lang="ts">
  /*
   * РАСПОЗНАВАТЕЛЬ ЯЗЫКА — всё, что осталось от корня (`plans/39` шаг 2).
   *
   * Лендинг переехал на `/ru` и `/en` (интервью №010, Р5 = В: у каждого языка свой префикс,
   * ни один не сидит на голом корне). Корень под `noindex` смотрит ПАМЯТЬ → БРАУЗЕР и уводит
   * `location.replace()` — дословно то, что описал владелец в ответе Р5.
   *
   * ── 🔴 ДВА КОНТРАКТА, КОТОРЫЕ НЕЛЬЗЯ ПОТЕРЯТЬ ПРИ ПЕРЕЕЗДЕ ──────────────────────────────
   *
   * 1. ССЫЛКИ ИЗ ПИСЕМ ВХОДЯТ ЧЕРЕЗ КОРЕНЬ. В проекте Firebase переопределён Action URL писем:
   *    он указывает на корень домена (наследие 1.x). Поймано на боевом выкате 2026-07-12:
   *    человек, ткнув ссылку из письма, обязан попасть в `/profile` с нетронутым query
   *    (`mode=signIn&oobCode=…`), а не на лендинг и не в языковой редирект. Проверка идёт
   *    ПЕРВОЙ — до языка.
   *
   * 2. ПОРЯДОК ЯЗЫКА — ПАМЯТЬ → БРАУЗЕР, тем же правилом, что модуль (`$lib/ui/lang.svelte.ts`)
   *    и инлайн-скрипт `app.html`; адрес корня языка не несёт, поэтому плечо «адрес» здесь
   *    пусто по построению. Пустая память — спрашиваем браузер (интервью №024, В1 = А).
   *
   * Скрипт инлайновый и исполняется до всякого JS приложения (`csr = false` — бандла тут нет
   * вовсе): человек не видит ни кадра пустой страницы дольше необходимого. Query и hash
   * уезжают вместе с человеком в обоих направлениях.
   *
   * ⚠️ Это ВТОРАЯ узаконенная копия чтения `ndim-lang` вне модуля (первая — `app.html`), по
   * той же причине: до-JS скрипт ради мгновенного ухода. Стережёт `tools/verify-lang-module.mjs`.
   */
  import { SITE_ORIGIN } from '$lib/site';

  // `<\/script>` — иначе парсер закрыл бы блок компонента на этой строке.
  const RECOGNIZE = `<script>
(function () {
	try {
		var q = location.search, h = location.hash;
		// Тот же разбор, что жил на лендинге: точный, а не подстрокой.
		var p = new URLSearchParams(q);
		if (p.get('mode') === 'signIn' && p.has('oobCode')) {
			location.replace('/profile' + q + h);
			return;
		}
		var l = null;
		try { l = localStorage.getItem('ndim-lang'); } catch (e) { /* приватный режим */ }
		if (l !== 'ru' && l !== 'en') {
			var asked = [navigator.language].concat(navigator.languages || []);
			l = asked.some(function (x) {
				return typeof x === 'string' && x.toLowerCase().indexOf('ru') === 0;
			})
				? 'ru'
				: 'en';
		}
		location.replace('/' + l + q + h);
	} catch (e) {
		// Что бы ни сломалось — человек не остаётся на пустой странице. Язык «не знаю ничего» —
		// английский, как и x-default (интервью №010, Р5).
		location.replace('/en');
	}
})();
<\/script>`;
</script>

<svelte:head>
  <title>NDim Space</title>
  <!-- Корень в поиске не участвует — решение владельца, цена названа и принята (plans/39). -->
  <meta name="robots" content="noindex" />
  {@html RECOGNIZE}
</svelte:head>

<!-- Человеку с выключенным JS распознаватель недоступен — даём обе двери руками.
     Эти же ссылки — единственное содержимое страницы: роботу здесь читать нечего. -->
<noscript>
  <p class="pick">
    <a href="/ru">Русский — {SITE_ORIGIN.replace('https://', '')}/ru</a>
    <a href="/en">English — {SITE_ORIGIN.replace('https://', '')}/en</a>
  </p>
</noscript>

<style>
  .pick {
    display: flex; flex-direction: column; gap: 12px;
    padding: 40px 20px; max-width: 430px; margin: 0 auto;
    font-size: 16px; line-height: 1.5;
  }
  .pick a { color: var(--primary, #2563eb); }
</style>
